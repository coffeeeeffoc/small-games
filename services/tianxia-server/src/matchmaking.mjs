import { randomInt } from 'node:crypto';
import { ApiError } from './errors.mjs';

/** A finite human-only queue. Mutations contain no await, including pairing/cancellation. */
export class Matchmaking {
  constructor({ matches, players, now = Date.now, queueTtlMs = 30_000, maxQueue = 256 } = {}) {
    Object.assign(this, { matches, players, now, queueTtlMs, maxQueue });
    this.waiting = new Map();
    this.assigned = new Map();
  }

  assignment(playerId) {
    const id = this.assigned.get(playerId);
    const match = this.matches.matches.get(id);
    if (!match) {
      this.assigned.delete(playerId);
      return null;
    }
    const seat = match.seats.find((entry) => entry.playerId === playerId);
    this.matches.update(match, this.now());
    seat.lastSeen = match.lastSeen = this.now();
    return { status: 'matched', ...this.matches.grant(match, seat) };
  }

  join(player) {
    this.sweep();
    const previous = this.assigned.get(player.playerId);
    if (previous && this.matches.matches.get(previous)?.finishedAt !== null)
      this.assigned.delete(player.playerId);
    const assigned = this.assignment(player.playerId);
    if (assigned) return assigned;
    if (this.matches.activeFor(player.playerId))
      throw new ApiError(409, 'player-busy', '请先结束当前对局');
    if (!this.waiting.has(player.playerId)) {
      if (this.waiting.size >= this.maxQueue)
        throw new ApiError(503, 'queue-full', '匹配队列已满，请稍后重试');
      this.waiting.set(player.playerId, {
        playerId: player.playerId,
        createdAt: this.now(),
        lastSeen: this.now(),
      });
    }
    return this.poll(player);
  }

  poll(player) {
    this.sweep();
    const entry = this.waiting.get(player.playerId);
    if (entry) entry.lastSeen = this.now();
    this.pair();
    return (
      this.assignment(player.playerId) ??
      (entry
        ? { status: 'waiting', waitedSeconds: Math.floor((this.now() - entry.createdAt) / 1000) }
        : { status: 'idle' })
    );
  }

  cancel(player) {
    this.sweep();
    const assigned = this.assignment(player.playerId);
    if (assigned) return assigned; // A late cancellation never silently surrenders a formed match.
    this.waiting.delete(player.playerId);
    return { status: 'idle' };
  }

  compatible(a, b, profiles) {
    const first = profiles.get(a.playerId),
      second = profiles.get(b.playerId);
    if (!first || !second) return false;
    const expansion = Math.floor(
      Math.max(this.now() - a.createdAt, this.now() - b.createdAt) / 15_000,
    );
    const rate = (profile) =>
      (profile.career.matched.wins + 2) / (profile.career.matched.games + 4);
    return (
      Math.abs(first.rank.level - second.rank.level) <= Math.min(44, 2 + expansion * 2) &&
      Math.abs(rate(first) - rate(second)) <= Math.min(1, 0.15 + expansion * 0.1)
    );
  }

  pair() {
    // Clone each public profile once per pass, never once per candidate pair.
    const profiles = new Map([...this.waiting.keys()].map((id) => [id, this.players.profile(id)]));
    for (const first of this.waiting.values()) {
      const candidates = [...this.waiting.values()].filter(
        (second) => second.playerId !== first.playerId && this.compatible(first, second, profiles),
      );
      if (!candidates.length) continue;
      const second = candidates[randomInt(candidates.length)];
      let match;
      try {
        match = this.matches.createDuel([first.playerId, second.playerId]);
      } catch (error) {
        if (error.code === 'capacity') return;
        throw error;
      }
      for (const entry of [first, second]) {
        this.waiting.delete(entry.playerId);
        this.assigned.set(entry.playerId, match.id);
      }
    }
  }

  sweep() {
    const current = this.now();
    for (const entry of this.waiting.values()) {
      if (current - entry.lastSeen >= this.queueTtlMs || this.matches.activeFor(entry.playerId))
        this.waiting.delete(entry.playerId);
    }
    for (const [id, matchId] of this.assigned)
      if (!this.matches.matches.has(matchId)) this.assigned.delete(id);
  }

  advance() {
    this.sweep();
    this.pair();
  }
}
