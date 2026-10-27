import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { ApiError } from './errors.mjs';
import {
  normalizeCareer,
  getRank,
  applyCareerResult,
  careerWinRate,
} from '@coffeeeeffoc/tianxia-chalu/engine';

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export function authorized(token, expected) {
  if (
    typeof token !== 'string' ||
    token.length < 20 ||
    token.length > 100 ||
    !/^[a-f0-9]{64}$/.test(expected ?? '')
  )
    return false;
  return timingSafeEqual(Buffer.from(hashToken(token), 'hex'), Buffer.from(expected, 'hex'));
}

/** Single atomic snapshot commits both players and its settlement receipt together. */
export class PlayerStore {
  constructor(directory, { maxPlayers = 10000 } = {}) {
    this.directory = directory;
    this.filename = path.join(directory, 'players.json');
    this.maxPlayers = maxPlayers;
    this.data = { version: 1, players: {}, settlements: {} };
    this.queue = Promise.resolve();
  }

  async initialize() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      const data = JSON.parse(await readFile(this.filename, 'utf8'));
      if (data.version !== 1 || !data.players || !data.settlements)
        throw new Error('Invalid player store');
      for (const [id, player] of Object.entries(data.players)) {
        if (
          player.playerId !== id ||
          !/^[a-f0-9]{64}$/.test(player.tokenHash) ||
          !Number.isSafeInteger(player.career?.xp) ||
          player.career.xp < 0
        )
          throw new Error('Invalid player record');
      }
      this.data = data;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error; // Never replace a damaged identity database silently.
    }
  }

  mutate(operation) {
    const work = this.queue
      .catch(() => {})
      .then(async () => {
        const next = structuredClone(this.data);
        const value = operation(next);
        if (value === false) return false;
        const temporary = this.filename + '.tmp';
        const file = await open(temporary, 'w', 0o600);
        try {
          await file.writeFile(JSON.stringify(next));
          await file.sync();
        } finally {
          await file.close();
        }
        await rename(temporary, this.filename);
        if (process.platform !== 'win32') {
          const directory = await open(this.directory, 'r');
          try {
            await directory.sync();
          } finally {
            await directory.close();
          }
        }
        this.data = next;
        return value;
      });
    this.queue = work;
    return work;
  }

  async create() {
    const token = randomBytes(32).toString('base64url'),
      playerId = randomUUID();
    await this.mutate((data) => {
      if (Object.keys(data.players).length >= this.maxPlayers)
        throw new ApiError(503, 'player-capacity', '玩家档案已满，请稍后重试');
      data.players[playerId] = {
        playerId,
        tokenHash: hashToken(token),
        name: '行军客' + playerId.slice(0, 4),
        career: normalizeCareer(null),
      };
    });
    return { playerId, token, profile: this.profile(playerId) };
  }

  authenticate(token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100)
      throw new ApiError(401, 'player-unavailable', '玩家凭证无效，请重新建立档案');
    const hash = hashToken(token);
    const player = Object.values(this.data.players).find((entry) => entry.tokenHash === hash);
    if (!player || !authorized(token, player.tokenHash))
      throw new ApiError(401, 'player-unavailable', '玩家凭证无效，请重新建立档案');
    return player;
  }

  profile(playerId) {
    const entry = this.data.players[playerId];
    if (!entry) return null;
    const { tokenHash: _private, ...profile } = entry;
    return {
      ...structuredClone(profile),
      rank: getRank(entry.career.xp),
      winRate: careerWinRate(entry.career, 'matched'),
    };
  }

  settle(record) {
    // Legacy reports have no account settlement, even if a damaged file has extra fields.
    if (record.version !== 2 || !Array.isArray(record.seats)) return Promise.resolve(false);
    const seats = record.seats?.filter((seat) => seat.playerId && seat.result);
    if (!seats?.length) return Promise.resolve(false);
    return this.mutate((data) => {
      if (data.settlements[record.matchId]) return false;
      for (const seat of seats) {
        const player = data.players[seat.playerId];
        if (!player) continue;
        const result = seat.result,
          mode = record.mode === 'matched' ? 'matched' : 'pve';
        if (!result.completed && !['abandoned', 'disconnected'].includes(result.reason)) continue;
        player.career = applyCareerResult(player.career, {
          id: record.matchId,
          mode,
          outcome: result.outcome,
          reason: result.reason,
          elapsed: result.elapsed,
        }).career;
      }
      data.settlements[record.matchId] = record.finishedAt;
    });
  }

  async close() {
    await this.queue.catch(() => {});
  }
}
