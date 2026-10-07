import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createMatch, getLevel, switchRoute, tick } from '@coffeeeeffoc/tianxia-chalu/engine';
import { ApiError, objectBody } from './errors.mjs';

const STEP_MS = 100;
const COMMAND_HISTORY = 128;
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

function authorized(token, expected) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100 || !expected)
    return false;
  return timingSafeEqual(Buffer.from(hashToken(token), 'hex'), Buffer.from(expected, 'hex'));
}

export class MatchService {
  constructor({
    results,
    now = Date.now,
    maxMatches = 64,
    idleMs = 5 * 60_000,
    lifetimeMs = 20 * 60_000,
    finishedMs = 10 * 60_000,
    onError = console.error,
  } = {}) {
    this.results = results;
    this.now = now;
    this.maxMatches = maxMatches;
    this.idleMs = idleMs;
    this.lifetimeMs = lifetimeMs;
    this.finishedMs = finishedMs;
    this.onError = onError;
    this.matches = new Map();
  }

  create(body) {
    objectBody(body, ['levelId', 'difficulty']);
    const { levelId = 'crossroads', difficulty = 'normal' } = body;
    let level;
    try {
      if (typeof levelId === 'string') level = getLevel(levelId);
    } catch {
      /* Unknown content ID. */
    }
    if (!level) {
      throw new ApiError(400, 'unknown-level', '关卡不存在');
    }
    if (!['normal', 'easy', 'hard'].includes(difficulty)) {
      throw new ApiError(400, 'invalid-difficulty', '难度无效');
    }
    this.advance();
    if (this.matches.size >= this.maxMatches) {
      const completed = [...this.matches.values()].find((entry) => entry.persisted);
      if (completed) this.matches.delete(completed.id);
    }
    if (this.matches.size >= this.maxMatches)
      throw new ApiError(503, 'capacity', '当前对局已满，请稍后重试');
    const current = this.now();
    const token = randomBytes(32).toString('base64url');
    const match = {
      id: randomUUID(),
      tokenHash: hashToken(token),
      state: createMatch({
        levelId,
        difficulty,
        seed: randomBytes(4).readUInt32LE(0),
        aiEnabled: true,
      }),
      revision: 0,
      paused: false,
      createdAt: current,
      lastSeen: current,
      lastAdvance: current,
      finishedAt: null,
      persisted: false,
      persistError: false,
      persistence: null,
      sequence: 0,
      commands: new Map(),
    };
    this.matches.set(match.id, match);
    return { matchId: match.id, token, snapshot: this.snapshot(match) };
  }

  authenticate(id, token) {
    const match = this.matches.get(id);
    if (!match || !authorized(token, match.tokenHash)) {
      throw new ApiError(404, 'match-unavailable', '对局不存在、已过期或凭证无效');
    }
    this.update(match, this.now());
    match.lastSeen = this.now();
    return match;
  }

  snapshot(match) {
    return {
      matchId: match.id,
      revision: match.revision,
      serverTime: this.now(),
      paused: match.paused,
      lastSequence: match.sequence,
      state: structuredClone(match.state),
    };
  }

  get(id, token) {
    return { snapshot: this.snapshot(this.authenticate(id, token)) };
  }

  command(id, token, body) {
    objectBody(body, ['junctionId', 'sequence', 'routeIndex']);
    const match = this.authenticate(id, token);
    const { junctionId, sequence, routeIndex } = body;
    if (
      typeof junctionId !== 'string' ||
      junctionId.length > 80 ||
      !Number.isSafeInteger(sequence) ||
      sequence < 1 ||
      (routeIndex !== undefined &&
        (!Number.isInteger(routeIndex) || routeIndex < 0 || routeIndex > 32))
    ) {
      throw new ApiError(400, 'invalid-command', '岔路指令格式无效');
    }
    const fingerprint = JSON.stringify([junctionId, routeIndex ?? null]);
    const previous = match.commands.get(sequence);
    if (previous === fingerprint) {
      return { accepted: true, duplicate: true, sequence, snapshot: this.snapshot(match) };
    }
    if (sequence !== match.sequence + 1) {
      throw new ApiError(409, 'sequence-conflict', '指令序号不连续或内容冲突');
    }
    if (match.state.status !== 'playing') throw new ApiError(409, 'match-finished', '对局已结束');
    if (match.paused) throw new ApiError(409, 'match-paused', '请先继续对局');
    const result = switchRoute(match.state, 0, junctionId, routeIndex);
    if (!result.ok) {
      const status = result.reason === 'not-owner' ? 403 : result.reason === 'cooldown' ? 429 : 400;
      throw new ApiError(status, result.reason, '当前无法切换这处岔路');
    }
    match.sequence = sequence;
    match.commands.set(sequence, fingerprint);
    if (match.commands.size > COMMAND_HISTORY)
      match.commands.delete(match.commands.keys().next().value);
    match.revision++;
    return { accepted: true, duplicate: false, sequence, snapshot: this.snapshot(match) };
  }

  control(id, token, action) {
    const match = this.authenticate(id, token);
    if (action === 'abandon') this.finish(match, 'abandoned');
    else if (match.state.status !== 'playing')
      throw new ApiError(409, 'match-finished', '对局已结束');
    else {
      const paused = action === 'pause';
      if (match.paused !== paused) match.revision++;
      match.paused = paused;
      match.lastAdvance = this.now();
    }
    return { snapshot: this.snapshot(match) };
  }

  async result(id, token) {
    const match = this.matches.get(id);
    if (match) {
      this.authenticate(id, token);
      if (match.state.status !== 'finished')
        throw new ApiError(409, 'result-pending', '对局尚未结束');
      await match.persistence;
      return {
        matchId: id,
        result: structuredClone(match.state.result),
        persisted: match.persisted,
      };
    }
    const record = this.results.get(id, this.now());
    if (!record || !authorized(token, record.tokenHash)) {
      throw new ApiError(404, 'match-unavailable', '战报不存在、已过期或凭证无效');
    }
    return { matchId: id, result: structuredClone(record.result), persisted: true };
  }

  finish(match, reason) {
    if (match.finishedAt !== null) return;
    if (match.state.status !== 'finished') {
      match.state.status = 'finished';
      match.state.result = {
        levelId: match.state.levelId,
        outcome: 'defeat',
        winnerId: null,
        reason,
        elapsed: match.state.time,
        score: 0,
        stars: 0,
        rankings: [],
      };
    }
    match.paused = false;
    match.finishedAt = this.now();
    match.revision++;
    const record = {
      version: 1,
      matchId: match.id,
      tokenHash: match.tokenHash,
      startedAt: match.createdAt,
      finishedAt: match.finishedAt,
      result: structuredClone(match.state.result),
    };
    match.persistence = this.results
      .save(record)
      .then(() => {
        match.persisted = true;
      })
      .catch((error) => {
        match.persistError = true;
        this.onError('天下岔路战报保存失败', error.message);
      });
  }

  update(match, current) {
    if (match.finishedAt !== null) return;
    if (current - match.createdAt >= this.lifetimeMs || current - match.lastSeen >= this.idleMs) {
      this.finish(match, 'expired');
      return;
    }
    if (match.paused) {
      match.lastAdvance = current;
      return;
    }
    // Bound work per scheduler turn; unprocessed time remains queued for the next turn.
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
        (match.persisted || match.persistError)
      )
        this.matches.delete(match.id);
    }
  }
}
