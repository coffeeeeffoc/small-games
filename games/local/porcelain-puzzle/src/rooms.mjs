import { randomBytes } from 'node:crypto';
import {
  newAttempt,
  start,
  tick,
  move,
  snap,
  hint,
  makePuzzle,
  progress,
  organize,
} from './core.mjs';
import { levelAt, VERSION } from './content.mjs';
export class RoomError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.status = status;
  }
}
const active = (p) => !p.left;
const done = (p) => p.skipped || ['won', 'timeout'].includes(p.attempt?.phase);
export class Rooms {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.rooms = new Map();
  }
  create({ name = '小瓷友', level = 1, capacity = 5 } = {}) {
    this.sweep();
    if (this.rooms.size >= 500) throw new RoomError('房间暂时已满，请稍后再试', 503);
    if (
      !Number.isInteger(level) ||
      level < 1 ||
      level > 100 ||
      !Number.isInteger(capacity) ||
      capacity < 2 ||
      capacity > 5
    )
      throw new RoomError('关卡或人数无效', 422);
    let code;
    do {
      code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
    } while (this.rooms.has(code));
    const room = {
      code,
      version: VERSION,
      level,
      capacity,
      round: 0,
      status: 'waiting',
      players: [],
      createdAt: this.now(),
      lastAt: this.now(),
      host: null,
      startAt: 0,
      nextAt: 0,
    };
    this.rooms.set(code, room);
    return this.join(code, { name });
  }
  get(code) {
    const room = this.rooms.get(String(code).toUpperCase());
    if (!room) throw new RoomError('房间已结束或邀请码无效', 404);
    return room;
  }
  join(code, { name = '小瓷友', token } = {}) {
    const room = this.get(code);
    this.advance(room);
    if (room.status === 'finished') throw new RoomError('这段旅程已经结束');
    let player = token && room.players.find((p) => p.token === token);
    if (player?.intentionalLeave) player = null;
    if (!player) {
      if (room.players.filter(active).length >= room.capacity) throw new RoomError('房间已满');
      player = {
        id: randomBytes(6).toString('hex'),
        token: randomBytes(24).toString('base64url'),
        name:
          String(name)
            .replace(/[<>\u0000-\u001f]/g, '')
            .slice(0, 12) || '小瓷友',
        ready: false,
        left: false,
        seq: 0,
        lastSeen: this.now(),
        spectator: room.status !== 'waiting',
        attempt: null,
      };
      room.players.push(player);
    } else if (player.left) {
      if (room.players.filter(active).length >= room.capacity) throw new RoomError('房间已满');
      player.left = false;
      player.spectator = room.status !== 'waiting';
      player.ready = false;
      player.attempt = null;
      player.skipped = false;
      player.hintPair = null;
    }
    player.lastSeen = this.now();
    if (!room.host) room.host = player.id;
    return { ...this.view(room, player), token: player.token };
  }
  auth(code, token) {
    const room = this.get(code),
      player = room.players.find((p) => p.token === token);
    if (!player || player.left) throw new RoomError('请重新加入房间', 403);
    return { room, player };
  }
  poll(code, token) {
    const { room, player } = this.auth(code, token);
    player.lastSeen = this.now();
    this.advance(room);
    return this.view(room, player);
  }
  begin(room) {
    room.round++;
    room.status = 'playing';
    room.startAt = this.now() + 3500;
    room.nextAt = 0;
    for (const p of room.players.filter(active)) {
      p.spectator = false;
      p.skipped = false;
      p.ready = false;
      p.hintPair = null;
      p.attempt = newAttempt(levelAt(room.level), `${room.code}:${room.round}:${p.id}`);
      p.lastTick = room.startAt;
      p.seq = 0;
    }
  }
  advance(room) {
    const now = this.now();
    room.lastAt = now;
    if (room.status === 'waiting' && !room.players.length) return;
    for (const p of room.players.filter(active))
      if (now - p.lastSeen > 30000) {
        p.left = true;
        p.disconnected = true;
      }
    const alive = room.players.filter(active);
    if (!alive.length) {
      room.status = 'finished';
      return;
    }
    if (!alive.some((p) => p.id === room.host)) room.host = alive[0].id;
    if (room.status === 'waiting' && alive.length >= 2 && alive.every((p) => p.ready))
      this.begin(room);
    if (room.status === 'playing' && now >= room.startAt) {
      for (const p of alive.filter((p) => !p.spectator)) {
        start(p.attempt);
        tick(p.attempt, now - Math.max(room.startAt, p.lastTick));
        p.lastTick = now;
      }
      if (alive.filter((p) => !p.spectator).every(done)) {
        room.status = 'result';
        room.nextAt = now + 6500;
      }
    }
    if (room.status === 'result' && now >= room.nextAt) {
      if (room.level >= 100) room.status = 'finished';
      else {
        room.level++;
        this.begin(room);
      }
    }
  }
  action(code, token, input) {
    const { room, player } = this.auth(code, token);
    player.lastSeen = this.now();
    this.advance(room);
    if (input.type === 'leave') {
      player.left = true;
      player.intentionalLeave = true;
      this.advance(room);
      return { left: true };
    }
    if (input.type === 'ready') {
      if (room.status !== 'waiting') throw new RoomError('本轮已开始');
      player.ready = true;
      const alive = room.players.filter(active);
      if (alive.length >= 2 && alive.every((p) => p.ready)) this.begin(room);
      return this.view(room, player);
    }
    if (
      room.status !== 'playing' ||
      this.now() < room.startAt ||
      player.spectator ||
      input.round !== room.round
    )
      throw new RoomError('本轮状态已更新，请稍后重试');
    if (!Number.isInteger(input.seq) || input.seq !== player.seq + 1)
      throw new RoomError('操作已同步，请重试');
    const state = player.attempt,
      puzzle = makePuzzle(levelAt(room.level));
    if (state.phase !== 'playing') throw new RoomError('本轮挑战已结束');
    if (input.type === 'move') {
      if (!move(state, input.group, input.x, input.y)) throw new RoomError('无效移动', 422);
      snap(state, input.group, puzzle);
    } else if (input.type === 'organize') {
      organize(state, puzzle);
    } else if (input.type === 'hint') {
      const pair = hint(state, puzzle);
      if (!pair) throw new RoomError('本轮提示已用完');
      player.hintPair = pair;
    } else if (input.type === 'skip') {
      player.skipped = true;
      tick(state, state.remainingMs);
    } else throw new RoomError('无效操作', 422);
    player.seq = input.seq;
    this.advance(room);
    return this.view(room, player);
  }
  view(room, me) {
    const players = room.players.filter(active).map((p) => ({
      id: p.id,
      name: p.name,
      ready: p.ready,
      spectator: p.spectator,
      progress: p.attempt ? progress(p.attempt) : 0,
      phase: p.skipped ? 'skipped' : p.attempt?.phase || 'waiting',
      elapsedMs: p.attempt?.elapsedMs || 0,
      assisted: p.attempt?.assisted || false,
    }));
    const ranking = players
      .filter((p) => !p.spectator && p.phase === 'won')
      .sort((a, b) => a.elapsedMs - b.elapsedMs);
    return {
      code: room.code,
      version: room.version,
      level: room.level,
      capacity: room.capacity,
      round: room.round,
      status: room.status,
      host: room.host,
      me: me.id,
      serverNow: this.now(),
      startAt: room.startAt,
      nextAt: room.nextAt,
      players,
      ranking,
      seq: me.seq,
      attempt: me.spectator ? null : structuredClone(me.attempt),
      hintPair: me.hintPair || null,
    };
  }
  sweep() {
    for (const [id, r] of this.rooms) {
      this.advance(r);
      if (
        this.now() - r.createdAt > 4 * 60 * 60 * 1000 ||
        (r.status === 'finished' &&
          this.now() - Math.max(...r.players.map((p) => p.lastSeen)) > 60000)
      )
        this.rooms.delete(id);
    }
  }
}
