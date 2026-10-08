import { createServer, type ServerResponse } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { command } from './duel-actions.js';
import { DuelBot } from './duel-bot.js';
import { DUEL_MAP, DUEL_RULES as R } from './duel-map.js';
import { parseCommand, type DuelMessage } from './duel-protocol.js';
import { createDuel, stepDuel } from './duel-simulation.js';
import type { Command, Duel, Side } from './duel-types.js';
type Member = {
  token: string;
  joined: number;
  connected: number;
  stream?: ServerResponse;
  room?: Room;
  side: Side;
  seq: number;
  rateAt: number;
  rate: number;
};
type Room = { id: string; state: Duel; members: Member[]; bot?: DuelBot; ended: number | null };
export function createDuelServer(
  options: { waitSeconds?: number; origins?: string[]; staticRoot?: string } = {},
) {
  const members = new Map<string, Member>(),
    rooms = new Set<Room>();
  let inputs: { member: Member; command: Command }[] = [];
  const originAllowed = (origin?: string) =>
    !origin ||
    (options.origins ?? ['https://coffeeeeffoc.github.io']).includes(origin) ||
    /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin);
  const send = (m: Member, message: DuelMessage) => {
    if (m.stream && !m.stream.destroyed && m.stream.writableLength < 512 * 1024)
      m.stream.write(`data: ${JSON.stringify(message)}\n\n`);
  };
  const pair = (a: Member, b?: Member) => {
    if (a.room || (b && b.room)) return;
    const room: Room = {
      id: randomUUID(),
      state: createDuel(),
      members: b ? [a, b] : [a],
      bot: b ? undefined : new DuelBot(1),
      ended: null,
    };
    room.members.forEach((m, side) => {
      m.room = room;
      m.side = side as Side;
    });
    rooms.add(room);
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!originAllowed(req.headers.origin)) {
      res.writeHead(403).end();
      return;
    }
    if (req.headers.origin) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Headers', 'content-type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.writeHead(204).end();
      return;
    }
    const json = (status: number, body: object) => {
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
    };
    if (url.pathname === '/health') {
      json(200, { ok: true, version: 'duel-v1', rooms: rooms.size });
      return;
    }
    if (url.pathname === '/duel/events' && req.method === 'GET') {
      const m = members.get(url.searchParams.get('token') ?? '');
      if (!m) {
        json(401, { error: 'SESSION_EXPIRED' });
        return;
      }
      m.stream?.end();
      m.stream = res;
      m.connected = Date.now();
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(': connected\n\n');
      if (m.room)
        send(m, {
          kind: 'state',
          matchId: m.room.id,
          mode: m.room.bot ? 'bot' : 'human',
          side: m.side,
          state: m.room.state,
        });
      res.on('close', () => {
        if (m.stream === res) {
          m.stream = undefined;
          m.connected = Date.now();
          inputs = inputs.filter((input) => input.member !== m);
          if (m.room) command(m.room.state, m.side, { type: 'cancel' });
        }
      });
      return;
    }
    if (url.pathname.startsWith('/duel/') && req.method === 'POST') {
      let text = '';
      try {
        for await (const chunk of req) {
          text += chunk;
          if (text.length > 2048) {
            json(413, { error: 'PAYLOAD_TOO_LARGE' });
            return;
          }
        }
        const body = JSON.parse(text) as Record<string, unknown>;
        if (!body || typeof body !== 'object' || Array.isArray(body))
          throw new Error('Invalid body');
        if (url.pathname === '/duel/join') {
          if (body.version !== 'duel-v1' || body.mapId !== DUEL_MAP.id) {
            json(409, { error: 'VERSION_MISMATCH' });
            return;
          }
          if (members.size >= 256) {
            json(503, { error: 'SERVER_FULL' });
            return;
          }
          const m: Member = {
            token: randomBytes(24).toString('hex'),
            joined: Date.now(),
            connected: Date.now(),
            side: 0,
            seq: 0,
            rateAt: Date.now(),
            rate: 0,
          };
          const opponent = [...members.values()].find(
            (n) =>
              !n.room &&
              n.stream &&
              Date.now() - n.joined < (options.waitSeconds ?? R.matchWait) * 1000,
          );
          members.set(m.token, m);
          if (opponent) pair(opponent, m);
          json(200, { token: m.token });
          return;
        }
        const m = typeof body.token === 'string' ? members.get(body.token) : undefined;
        if (!m) {
          json(401, { error: 'SESSION_EXPIRED' });
          return;
        }
        if (url.pathname === '/duel/cancel') {
          if (m.room) command(m.room.state, m.side, { type: 'leave' });
          m.stream?.end();
          members.delete(m.token);
          json(200, { ok: true });
          return;
        }
        if (url.pathname !== '/duel/input') {
          json(404, { error: 'NOT_FOUND' });
          return;
        }
        if (Date.now() - m.rateAt > 1000) {
          m.rateAt = Date.now();
          m.rate = 0;
        }
        if (++m.rate > 80) {
          json(429, { error: 'RATE_LIMIT' });
          return;
        }
        const c = parseCommand(body.command);
        if (!c || typeof body.seq !== 'number' || !Number.isSafeInteger(body.seq) || body.seq < 1) {
          json(400, { error: 'INVALID_INPUT' });
          return;
        }
        if (body.seq > m.seq && m.stream && m.room && !m.room.state.result) {
          m.seq = body.seq;
          inputs.push({ member: m, command: c });
        }
        json(200, { ok: true, seq: m.seq });
        return;
      } catch {
        if (!res.headersSent) json(400, { error: 'INVALID_JSON' });
        return;
      }
    }
    if (
      options.staticRoot &&
      req.method === 'GET' &&
      (url.pathname.startsWith('/play/') || url.pathname === '/')
    ) {
      try {
        const root = resolve(options.staticRoot),
          relative = decodeURIComponent(
            url.pathname === '/' ? 'index.html' : url.pathname.slice(6) || 'index.html',
          ),
          file = resolve(root, relative);
        if (!file.startsWith(root + '/') && !file.startsWith(root + '\\')) {
          res.writeHead(403).end();
          return;
        }
        const bytes = await readFile(file),
          mime: Record<string, string> = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.jpg': 'image/jpeg',
            '.png': 'image/png',
            '.wav': 'audio/wav',
          };
        res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        res.end(bytes);
      } catch {
        res.writeHead(404).end();
      }
      return;
    }
    json(404, { error: 'NOT_FOUND' });
  });
  let previous = performance.now(),
    accumulator = 0,
    broadcast = 0;
  const timer = setInterval(() => {
    const now = Date.now(),
      clock = performance.now();
    accumulator += Math.min(0.25, (clock - previous) / 1000);
    previous = clock;
    for (const m of members.values()) {
      if (!m.room && m.stream && now - m.joined >= (options.waitSeconds ?? R.matchWait) * 1000)
        pair(m);
      if (!m.room && now - m.joined > 30000 && !m.stream) members.delete(m.token);
    }
    while (accumulator >= R.step) {
      accumulator -= R.step;
      for (const { member, command: c } of inputs.splice(0))
        if (member.stream && member.room) command(member.room.state, member.side, c);
      for (const room of rooms) {
        room.bot?.tick(room.state);
        stepDuel(room.state);
        for (const m of room.members) {
          if (!room.state.result && !m.stream && now - m.connected > R.reconnect * 1000) {
            const bothGone = room.members.length === 2 && room.members.every((n) => !n.stream);
            room.state.result = {
              winner: bothGone ? null : m.side === 0 ? 1 : 0,
              reason: 'disconnect',
            };
          }
          if (
            !room.state.result &&
            room.state.time - room.state.fighters[m.side].lastInput > R.inactive
          )
            room.state.result = { winner: m.side === 0 ? 1 : 0, reason: 'inactive' };
        }
        if (room.state.result && room.ended === null) room.ended = now;
      }
    }
    if (now - broadcast >= 100) {
      broadcast = now;
      for (const m of members.values()) {
        if (m.room)
          send(m, {
            kind: 'state',
            matchId: m.room.id,
            side: m.side,
            mode: m.room.bot ? 'bot' : 'human',
            state: m.room.state,
          });
        else
          send(m, {
            kind: 'waiting',
            seconds: Math.max(
              0,
              Math.ceil((options.waitSeconds ?? R.matchWait) - (now - m.joined) / 1000),
            ),
          });
      }
    }
    for (const room of rooms)
      if (room.ended !== null && now - room.ended > 60000) {
        for (const m of room.members) {
          m.stream?.end();
          members.delete(m.token);
        }
        rooms.delete(room);
      }
  }, 16);
  server.on('close', () => clearInterval(timer));
  return {
    server,
    rooms,
    stop() {
      clearInterval(timer);
      for (const m of members.values()) m.stream?.end();
      server.close();
    },
  };
}
