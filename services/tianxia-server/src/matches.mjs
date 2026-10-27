import { randomBytes, randomUUID } from 'node:crypto';
import {
  createMatch,
  getLevel,
  getScore,
  switchRoute,
  setRoute,
  tick,
  validateSeed,
  validateLoadout,
  applyCareerResult,
  normalizeCareer,
} from '@coffeeeeffoc/tianxia-chalu/engine';
import { ApiError, objectBody } from './errors.mjs';
import { hashToken, authorized } from './players.mjs';

const STEP_MS = 100;
const COMMAND_HISTORY = 128;

function resultFor(result, factionId, mode) {
  const projected = structuredClone(result);
  if (mode !== 'matched') return projected;
  const own = projected.rankings.find((rank) => rank.factionId === factionId);
  projected.outcome =
    projected.winnerId === factionId
      ? 'victory'
      : projected.winnerId === null && own?.rank === 1
        ? 'draw'
        : 'defeat';
  projected.score = own?.score ?? 0;
  projected.stars = 0;
  projected.rewardEligible = false; // Matched battles grant career XP, not campaign cards/unlocks.
  return projected;
}

export class MatchService {
  constructor({
    results,
    players,
    now = Date.now,
    maxMatches = 64,
    idleMs = 5 * 60_000,
    lifetimeMs = 20 * 60_000,
    finishedMs = 10 * 60_000,
    disconnectMs = 45_000,
    onError = console.error,
  } = {}) {
    Object.assign(this, {
      results,
      players,
      now,
      maxMatches,
      idleMs,
      lifetimeMs,
      finishedMs,
      disconnectMs,
      onError,
    });
    this.matches = new Map();
  }

  activeFor(playerId) {
    return [...this.matches.values()].find(
      (match) =>
        match.finishedAt === null && match.seats.some((seat) => seat.playerId === playerId),
    );
  }

  create(body, player = null) {
    objectBody(body, ['levelId', 'difficulty', 'seed', 'loadout']);
    const { levelId = 'crossroads', difficulty = 'normal' } = body;
    let level;
    try {
      if (typeof levelId === 'string') level = getLevel(levelId);
    } catch {
      /* Unknown ID. */
    }
    if (!level) throw new ApiError(400, 'unknown-level', '关卡不存在');
    if (!['normal', 'easy', 'hard'].includes(difficulty))
      throw new ApiError(400, 'invalid-difficulty', '难度无效');
    let seed, loadout;
    try {
      seed = validateSeed(body.seed === undefined ? randomBytes(4).readUInt32LE(0) : body.seed);
      loadout = validateLoadout(body.loadout === undefined ? [] : body.loadout);
    } catch {
      throw new ApiError(400, 'invalid-setup', '布阵种子或局部装备参数无效');
    }
    if (player && this.activeFor(player.playerId))
      throw new ApiError(409, 'player-busy', '请先结束当前对局');
    const match = this.newMatch(
      { levelId, difficulty, seed, loadout, aiEnabled: true },
      [player?.playerId ?? null],
      'pve',
    );
    return this.grant(match, match.seats[0]);
  }

  createDuel(playerIds) {
    if (
      playerIds.length !== 2 ||
      new Set(playerIds).size !== 2 ||
      playerIds.some((id) => this.activeFor(id))
    )
      throw new ApiError(409, 'player-busy', '玩家已有进行中的对局');
    // Both seats use the same symmetric two-faction map with no personal card loadout.
    return this.newMatch(
      {
        levelId: 'crossroads',
        difficulty: 'normal',
        seed: randomBytes(4).readUInt32LE(0),
        loadout: [],
        aiEnabled: false,
      },
      playerIds,
      'matched',
    );
  }

  newMatch(setup, playerIds, mode) {
    this.advance();
    if (this.matches.size >= this.maxMatches) {
      const completed = [...this.matches.values()].find((entry) => entry.persisted);
      if (completed) this.matches.delete(completed.id);
    }
    if (this.matches.size >= this.maxMatches)
      throw new ApiError(503, 'capacity', '当前对局已满，请稍后重试');
    const current = this.now();
    const seats = playerIds.map((playerId, factionId) => {
      const token = randomBytes(32).toString('base64url');
      return {
        playerId,
        factionId,
        token,
        tokenHash: hashToken(token),
        sequence: 0,
        commands: new Map(),
        lastSeen: current,
      };
    });
    const match = {
      id: randomUUID(),
      mode,
      seats,
      tokenHash: seats[0].tokenHash,
      state: createMatch(setup),
      revision: 0,
      paused: false,
      createdAt: current,
      lastSeen: current,
      lastAdvance: current,
      finishedAt: null,
      persisted: false,
      persistError: false,
      persistence: null,
      record: null,
      retryAt: 0,
    };
    this.matches.set(match.id, match);
    return match;
  }

  grant(match, seat) {
    return { matchId: match.id, token: seat.token, snapshot: this.snapshot(match, seat) };
  }

  authenticate(id, token) {
    const match = this.matches.get(id),
      seat = match?.seats.find((entry) => authorized(token, entry.tokenHash));
    if (!match || !seat)
      throw new ApiError(404, 'match-unavailable', '对局不存在、已过期或凭证无效');
    this.update(match, this.now());
    match.lastSeen = seat.lastSeen = this.now();
    return { match, seat };
  }

  snapshot(match, seat = match.seats[0]) {
    const state = structuredClone(match.state);
    state.playerFactionId = seat.factionId;
    if (state.result) state.result = resultFor(state.result, seat.factionId, match.mode);
    return {
      matchId: match.id,
      mode: match.mode,
      revision: match.revision,
      serverTime: this.now(),
      paused: match.paused,
      lastSequence: seat.sequence,
      state,
      profile: seat.playerId ? this.players.profile(seat.playerId) : null,
      players: match.seats.map((entry) => ({
        factionId: entry.factionId,
        name: entry.playerId ? this.players.profile(entry.playerId)?.name : '行军客',
      })),
    };
  }

  get(id, token) {
    const { match, seat } = this.authenticate(id, token);
    return { snapshot: this.snapshot(match, seat) };
  }

  command(id, token, body) {
    objectBody(body, ['junctionId', 'sequence', 'routeIndex', 'enabled']);
    const { match, seat } = this.authenticate(id, token);
    const { junctionId, sequence, routeIndex, enabled } = body;
    if (
      typeof junctionId !== 'string' ||
      junctionId.length > 80 ||
      !Number.isSafeInteger(sequence) ||
      sequence < 1 ||
      (routeIndex !== undefined &&
        (!Number.isInteger(routeIndex) || routeIndex < -1 || routeIndex > 32)) ||
      (enabled !== undefined &&
        (typeof enabled !== 'boolean' || !Number.isInteger(routeIndex) || routeIndex < 0))
    ) {
      throw new ApiError(400, 'invalid-command', '岔路指令格式无效');
    }
    const fingerprint = JSON.stringify([junctionId, routeIndex ?? null, enabled ?? null]);
    if (seat.commands.get(sequence) === fingerprint)
      return { accepted: true, duplicate: true, sequence, snapshot: this.snapshot(match, seat) };
    if (sequence !== seat.sequence + 1)
      throw new ApiError(409, 'sequence-conflict', '指令序号不连续或内容冲突');
    if (match.state.status !== 'playing') throw new ApiError(409, 'match-finished', '对局已结束');
    if (match.paused) throw new ApiError(409, 'match-paused', '请先继续对局');
    const result =
      enabled === undefined
        ? switchRoute(match.state, seat.factionId, junctionId, routeIndex)
        : setRoute(match.state, seat.factionId, junctionId, routeIndex, enabled);
    if (!result.ok) {
      const status = result.reason === 'not-owner' ? 403 : result.reason === 'cooldown' ? 429 : 400;
      throw new ApiError(status, result.reason, '当前无法切换这处岔路');
    }
    seat.sequence = sequence;
    seat.commands.set(sequence, fingerprint);
    if (seat.commands.size > COMMAND_HISTORY)
      seat.commands.delete(seat.commands.keys().next().value);
    match.revision++;
    return { accepted: true, duplicate: false, sequence, snapshot: this.snapshot(match, seat) };
  }

  control(id, token, action) {
    const { match, seat } = this.authenticate(id, token);
    if (action === 'abandon') this.finish(match, 'abandoned', seat.factionId);
    else if (match.state.status !== 'playing')
      throw new ApiError(409, 'match-finished', '对局已结束');
    else if (match.mode === 'matched')
      throw new ApiError(409, 'multiplayer-no-pause', '匹配对局持续进行，不能暂停');
    else {
      const paused = action === 'pause';
      if (match.paused !== paused) match.revision++;
      match.paused = paused;
      match.lastAdvance = this.now();
    }
    return { snapshot: this.snapshot(match, seat) };
  }

  async result(id, token) {
    const match = this.matches.get(id);
    if (match) {
      const { seat } = this.authenticate(id, token);
      if (match.state.status !== 'finished')
        throw new ApiError(409, 'result-pending', '对局尚未结束');
      await match.persistence;
      return {
        matchId: id,
        result: resultFor(match.state.result, seat.factionId, match.mode),
        persisted: match.persisted,
        profile: seat.playerId ? this.players.profile(seat.playerId) : null,
        experienceGained: match.record.seats.find((entry) => entry.factionId === seat.factionId)
          .experienceGained,
      };
    }
    const record = this.results.get(id, this.now());
    const seat = record?.seats?.find((entry) => authorized(token, entry.tokenHash));
    if (!record || (!seat && !authorized(token, record.tokenHash)))
      throw new ApiError(404, 'match-unavailable', '战报不存在、已过期或凭证无效');
    if (record.seats) await this.players.settle(record);
    return {
      matchId: id,
      result: structuredClone(seat?.result ?? record.result),
      persisted: true,
      profile: seat?.playerId ? this.players.profile(seat.playerId) : null,
      experienceGained: seat?.experienceGained ?? 0,
    };
  }

  finish(match, reason, loserId) {
    if (match.finishedAt !== null) return;
    if (match.state.status !== 'finished') {
      const forfeit = match.mode === 'matched' && Number.isInteger(loserId);
      const winnerId = forfeit
        ? match.seats.find((seat) => seat.factionId !== loserId).factionId
        : null;
      const rankings = forfeit
        ? getScore(match.state)
            .map((rank) => ({ ...rank, rank: rank.factionId === winnerId ? 1 : 2 }))
            .sort((a, b) => a.rank - b.rank)
        : [];
      match.state.status = 'finished';
      match.state.result = {
        completed: forfeit,
        rewardEligible: false,
        levelId: match.state.levelId,
        outcome: winnerId === 0 ? 'victory' : 'defeat',
        winnerId,
        reason,
        elapsed: match.state.time,
        score: rankings.find((rank) => rank.factionId === 0)?.score ?? 0,
        stars: 0,
        rankings,
      };
    }
    match.paused = false;
    match.finishedAt = this.now();
    match.revision++;
    match.record = {
      version: 2,
      matchId: match.id,
      mode: match.mode,
      tokenHash: match.tokenHash,
      startedAt: match.createdAt,
      finishedAt: match.finishedAt,
      result: structuredClone(match.state.result),
      seats: match.seats.map((seat) => {
        const result = resultFor(match.state.result, seat.factionId, match.mode);
        const career = seat.playerId ? this.players.profile(seat.playerId)?.career : null;
        const experienceGained =
          seat.playerId &&
          (result.completed || ['abandoned', 'disconnected'].includes(result.reason))
            ? applyCareerResult(career ?? normalizeCareer(null), {
                id: match.id,
                mode: match.mode,
                outcome: result.outcome,
                reason: result.reason,
                elapsed: result.elapsed,
              }).gained
            : 0;
        return {
          playerId: seat.playerId,
          factionId: seat.factionId,
          tokenHash: seat.tokenHash,
          result,
          experienceGained,
        };
      }),
    };
    this.persist(match);
  }

  persist(match) {
    if (match.persisting) return;
    match.persisting = true;
    match.persistence = this.results
      .save(match.record)
      .then(() => this.players?.settle(match.record))
      .then(() => {
        match.persisted = true;
        match.persistError = false;
      })
      .catch((error) => {
        match.persistError = true;
        match.retryAt = this.now() + 1000;
        this.onError('天下岔路战报或玩家档案保存失败', error.message);
      })
      .finally(() => {
        match.persisting = false;
      });
  }

  update(match, current) {
    if (match.finishedAt !== null) {
      if (match.persistError && current >= match.retryAt) this.persist(match);
      return;
    }
    if (match.mode === 'matched') {
      const offline = match.seats.filter((seat) => current - seat.lastSeen >= this.disconnectMs);
      if (offline.length) {
        this.finish(
          match,
          offline.length === 1 ? 'disconnected' : 'expired',
          offline.length === 1 ? offline[0].factionId : undefined,
        );
        return;
      }
    }
    if (current - match.createdAt >= this.lifetimeMs || current - match.lastSeen >= this.idleMs) {
      this.finish(match, 'expired');
      return;
    }
    if (match.paused) {
      match.lastAdvance = current;
      return;
    }
    const steps = Math.min(50, Math.max(0, Math.floor((current - match.lastAdvance) / STEP_MS)));
    for (let i = 0; i < steps && match.state.status === 'playing'; i++) {
      tick(match.state, STEP_MS / 1000);
      match.lastAdvance += STEP_MS;
      match.revision++;
    }
    if (match.state.status === 'finished') this.finish(match);
  }

  advance() {
    const current = this.now();
    for (const match of this.matches.values()) {
      this.update(match, current);
      if (
        match.finishedAt !== null &&
        current - match.finishedAt >= this.finishedMs &&
        match.persisted
      )
        this.matches.delete(match.id);
    }
  }
}
