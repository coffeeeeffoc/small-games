import Fastify from 'fastify';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import { rankedBoard, rankedSeed, type Competition } from './competition.ts';
import { RaceManager } from '@coffeeeeffoc/carding-car/race';
import { routes } from '@coffeeeeffoc/carding-car/routes';
import { vehicles, drivers } from '@coffeeeeffoc/carding-car/selection';
import { themes } from '@coffeeeeffoc/carding-car/themes';
import {
  maxRacers,
  multiplayerVersion,
  type ClientMessage,
  type RoomMember,
  type RoomState,
  type ServerMessage,
} from '@coffeeeeffoc/carding-car/protocol';

const compress = promisify(gzip);
const choice = (ids: string[]) => z.string().refine((id) => ids.includes(id));
const appearance = {
  vehicle: choice(vehicles.map((v) => v[0])),
  driver: choice(drivers.map((d) => d[0])),
};
const name = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .regex(/^[^\p{C}<>]+$/u);
const code = z.string().regex(/^[A-F0-9]{8}$/);
const version = z.literal(multiplayerVersion);
const input = z
  .object({
    steer: z.number().min(-1).max(1),
    throttle: z.number().min(0).max(1),
    brake: z.boolean(),
    drift: z.boolean(),
    reverse: z.boolean().optional(),
    nitro: z.boolean().optional(),
  })
  .strict();
const messageSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('create'),
      version,
      name,
      ...appearance,
      theme: choice(themes.map((t) => t.id)),
      route: choice(routes.map((r) => r.id)),
      bots: z.number().int().min(0).max(7),
      ranked: z.boolean().optional(),
      competitionToken: z.string().min(16).max(1024).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('join'),
      version,
      name,
      code,
      ...appearance,
      competitionToken: z.string().min(16).max(1024).optional(),
    })
    .strict(),
  z
    .object({ type: z.literal('resume'), version, code, token: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict(),
  z.object({ type: z.literal('bots'), count: z.number().int().min(0).max(7) }).strict(),
  z
    .object({
      type: z.literal('selection'),
      ...appearance,
      theme: choice(themes.map((t) => t.id)),
      route: choice(routes.map((r) => r.id)),
    })
    .strict(),
  z.object({ type: z.literal('prepared'), revision: z.number().int().positive() }).strict(),
  z.object({ type: z.literal('ready'), ready: z.boolean() }).strict(),
  z.object({ type: z.literal('loaded'), raceId: z.number().int().positive() }).strict(),
  z
    .object({
      type: z.literal('input'),
      raceId: z.number().int().positive(),
      seq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      input,
    })
    .strict(),
  ...(['start', 'leave', 'rematch'] as const).map((type) =>
    z.object({ type: z.literal(type) }).strict(),
  ),
]);
const stopped = { steer: 0, throttle: 0, brake: true, drift: false, reverse: false, nitro: false };
type Member = {
  playerId?: string;
  public: RoomMember;
  token: string;
  socket?: WebSocket;
  disconnectedAt: number;
  departed: boolean;
  loaded: boolean;
  input: z.infer<typeof input>;
  inputAt: number;
  seq: number;
};
type Room = {
  state: RoomState;
  members: Member[];
  race?: RaceManager;
  touched: number;
  loadingAt: number;
  firstFinishAt: number;
  tick: number;
  matchId: string;
  startedAt: number;
  settlement?: Promise<void>;
};
export type ServerOptions = {
  origins?: string[];
  maxRooms?: number;
  now?: () => number;
  autoTick?: boolean;
  logger?: boolean;
  competition?: Competition;
};

export function createKartServer(options: ServerOptions = {}) {
  const app = Fastify({ logger: options.logger ?? false, requestTimeout: 10000, bodyLimit: 4096 });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  const now = options.now ?? Date.now;
  // ponytail: one process owns up to 16 ephemeral rooms; shard by room before scaling horizontally.
  const rooms = new Map<string, Room>();
  const bindings = new Map<WebSocket, { room: Room; member: Member }>();
  const peers = new Map<
    WebSocket,
    {
      ip: string;
      window: number;
      count: number;
      controlCount: number;
      pong: boolean;
      pending: number;
      queue: Promise<void>;
    }
  >();
  const maxRooms = options.maxRooms ?? 16;
  app.get('/health', () => ({ ok: true, protocol: multiplayerVersion, rooms: rooms.size }));
  const webRoot = fileURLToPath(
    new URL('../../dist/', import.meta.resolve('@coffeeeeffoc/carding-car/race')),
  );
  const mime: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
  };
  app.get('/play', (_request, reply) => reply.redirect('/play/'));
  app.get('/play/*', async (request, reply) => {
    const relative = (request.params as { '*': string })['*'] || 'index.html';
    const file = path.resolve(webRoot, relative);
    if (
      path.relative(webRoot, file).startsWith('..') ||
      path.isAbsolute(path.relative(webRoot, file))
    )
      return reply.code(403).send();
    try {
      const info = await stat(file),
        etag = `W/"${info.size}-${info.mtimeMs}"`;
      reply
        .type(mime[path.extname(file)] ?? 'application/octet-stream')
        .header('Cache-Control', 'public, max-age=0, must-revalidate')
        .header('ETag', etag)
        .header('Vary', 'Accept-Encoding');
      if (request.headers['if-none-match'] === etag) return reply.code(304).send();
      const bytes = await readFile(file);
      const acceptsGzip = (request.headers['accept-encoding'] || '').split(',').some((value) => {
        const [encoding, ...params] = value.trim().split(';');
        return encoding === 'gzip' && !params.some((p) => /^\s*q\s*=\s*0(?:\.0*)?\s*$/.test(p));
      });
      if (acceptsGzip && bytes.length > 1024 && !/\.(jpg|png|wav)$/.test(file))
        return reply.header('Content-Encoding', 'gzip').send(await compress(bytes));
      return reply.send(bytes);
    } catch {
      return reply
        .code(404)
        .send('Game build missing. Run pnpm --filter @coffeeeeffoc/carding-car build');
    }
  });
  const send = (socket: WebSocket | undefined, message: ServerMessage | string) => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 256 * 1024) {
      socket.terminate();
      return;
    }
    socket.send(typeof message === 'string' ? message : JSON.stringify(message));
  };
  const view = (room: Room): RoomState => ({
    ...room.state,
    members: room.members.map((m) => ({ ...m.public })),
  });
  const broadcast = (room: Room) => {
    const message: ServerMessage = { type: 'room', room: view(room) };
    for (const member of room.members) send(member.socket, message);
  };
  const state = (room: Room) => {
    if (!room.race) return;
    const race = room.race;
    const message: ServerMessage = {
      type: 'state',
      state: {
        raceId: room.state.raceId,
        tick: room.tick,
        phase: race.phase,
        time: race.time,
        countdown: race.countdown,
        drivers: race.drivers.map(({ kart, progress }) => ({ kart, progress })),
        itemAvailableAt: race.items.map((item) => item.availableAt),
        order: race.order,
      },
    };
    // Millimetre precision is sufficient for rendering; retain full precision in the simulation.
    const packet = JSON.stringify(message, (_key, value) =>
      typeof value === 'number' ? Math.round(value * 1000) / 1000 : value,
    );
    for (const member of room.members) send(member.socket, packet);
  };
  const host = (room: Room) => {
    if (!room.members.some((m) => m.public.id === room.state.hostId && m.public.connected))
      room.state.hostId =
        room.members.find((m) => m.public.connected)?.public.id ?? room.state.hostId;
  };
  function disconnect(socket: WebSocket, departed = false) {
    const binding = bindings.get(socket);
    bindings.delete(socket);
    if (!binding || binding.member.socket !== socket) return;
    const { room, member } = binding;
    member.socket = undefined;
    member.public.connected = member.public.ready = false;
    member.disconnectedAt = now();
    member.departed = departed;
    member.input = stopped;
    if (departed && room.state.phase === 'lobby')
      room.members = room.members.filter((m) => m !== member);
    host(room);
    room.touched = now();
    broadcast(room);
  }
  function attach(socket: WebSocket, room: Room, member: Member) {
    const previous = member.socket;
    if (previous) {
      bindings.delete(previous);
      previous.close(4001, 'Reconnected elsewhere');
    }
    member.socket = socket;
    member.public.connected = true;
    member.disconnectedAt = 0;
    member.seq = -1;
    member.input = stopped;
    bindings.set(socket, { room, member });
    room.touched = now();
    host(room);
    send(socket, {
      type: 'joined',
      selfId: member.public.id,
      token: member.token,
      room: view(room),
    });
    broadcast(room);
    state(room);
  }
  async function receive(socket: WebSocket, message: ClientMessage) {
    let binding = bindings.get(socket);
    if (message.type === 'create' || message.type === 'join') {
      if (binding) throw new Error('请先退出当前房间');
      const identity = message.competitionToken
        ? await options.competition?.verify(message.competitionToken).catch(() => {
            throw new Error('排位身份验证失败，请检查服务后重试');
          })
        : undefined;
      if (message.competitionToken && !identity) throw new Error('排位服务尚未配置');
      if (socket.readyState !== WebSocket.OPEN) return;
      let room: Room;
      if (message.type === 'create') {
        if (message.ranked && !identity) throw new Error('排位赛需要有效玩家身份');
        if (rooms.size >= maxRooms) throw new Error('房间已满，请稍后再试');
        let roomCode: string;
        do {
          roomCode = randomBytes(4).toString('hex').toUpperCase();
        } while (rooms.has(roomCode));
        room = {
          state: {
            code: roomCode,
            hostId: '',
            phase: 'lobby',
            theme: message.ranked ? 'seaside' : message.theme,
            route: message.ranked ? 'seaside' : message.route,
            vehicle: message.ranked ? 'classic-kart' : message.vehicle,
            driver: message.ranked ? 'rookie' : message.driver,
            revision: 1,
            bots: message.ranked ? 0 : message.bots,
            ranked: !!message.ranked,
            settlement: 'practice',
            members: [],
            raceId: 0,
            seed: 0,
            roster: [],
          },
          members: [],
          touched: now(),
          loadingAt: 0,
          firstFinishAt: 0,
          tick: 0,
          matchId: '',
          startedAt: 0,
        };
        rooms.set(roomCode, room);
      } else {
        const found = rooms.get(message.code);
        if (!found) throw new Error('房间不存在或已结束');
        room = found;
        if (room.state.ranked && !identity) throw new Error('排位赛需要有效玩家身份');
        if (identity && room.members.some((member) => member.playerId === identity.playerId))
          throw new Error('你已加入该房间，请使用原会话重连');
        if (room.state.phase !== 'lobby') throw new Error('比赛已开始，请等下一场');
        if (room.state.ranked && room.members.length >= 2) throw new Error('排位房间已满');
        if (room.members.length + room.state.bots >= maxRacers)
          throw new Error('房间已满，请房主减少机器人');
      }
      const member: Member = {
        playerId: identity?.playerId,
        public: {
          id: randomUUID(),
          name: message.name,
          vehicle: room.state.vehicle,
          driver: room.state.driver,
          ready: false,
          connected: true,
          loadedRevision: 0,
        },
        token: randomBytes(32).toString('hex'),
        disconnectedAt: 0,
        departed: false,
        loaded: false,
        input: stopped,
        inputAt: 0,
        seq: -1,
      };
      room.members.push(member);
      if (!room.state.hostId) room.state.hostId = member.public.id;
      attach(socket, room, member);
      return;
    }
    if (message.type === 'resume') {
      if (binding) throw new Error('已经连接房间');
      const room = rooms.get(message.code);
      const member = room?.members.find(
        (m) =>
          m.token === message.token &&
          !m.departed &&
          (m.public.connected || now() - m.disconnectedAt <= 30000),
      );
      if (!room || !member) {
        send(socket, { type: 'error', message: '重连已过期，请重新加入房间', fatal: true });
        return;
      }
      attach(socket, room, member);
      return;
    }
    if (!binding) throw new Error('请先创建或加入房间');
    const { room, member } = binding;
    const owner = member.public.id === room.state.hostId;
    if (message.type === 'leave') {
      disconnect(socket, true);
      socket.close(1000);
      return;
    }
    if (message.type === 'input') {
      if (
        room.state.phase !== 'racing' ||
        message.raceId !== room.state.raceId ||
        message.seq <= member.seq
      )
        return;
      member.seq = message.seq;
      member.input = message.input;
      member.inputAt = now();
      return;
    }
    room.touched = now();
    if (message.type === 'loaded') {
      if (message.raceId !== room.state.raceId) return;
      member.loaded = true;
      if (
        room.state.phase === 'loading' &&
        room.members.every((m) => m.public.connected && m.loaded)
      ) {
        room.state.phase = 'racing';
        room.startedAt = now();
        room.race!.start();
        broadcast(room);
        state(room);
      }
      return;
    }
    if (message.type === 'rematch') {
      if (!owner || room.state.phase !== 'finished') throw new Error('比赛结束后由房主再开一场');
      room.state.phase = 'lobby';
      room.state.roster = [];
      room.race = undefined;
      room.state.settlement = 'practice';
      room.members = room.members.filter((m) => m.public.connected);
      room.members.forEach((m) => {
        m.public.ready = m.loaded = false;
        m.public.loadedRevision = 0;
      });
      broadcast(room);
      return;
    }
    if (room.state.phase !== 'lobby') throw new Error('比赛进行中，不能修改房间');
    if (message.type === 'selection') {
      if (room.state.ranked) throw new Error('排位赛采用固定赛道、赛车与道具规则');
      if (!owner) throw new Error('只有房主可以修改主题、路线、赛车和车手');
      for (const field of ['theme', 'route', 'vehicle', 'driver'] as const)
        room.state[field] = message[field];
      room.state.revision++;
      room.members.forEach((m) => {
        m.public.vehicle = room.state.vehicle;
        m.public.driver = room.state.driver;
        m.public.ready = false;
        m.public.loadedRevision = 0;
      });
    }
    if (message.type === 'prepared') {
      if (message.revision !== room.state.revision) return;
      member.public.loadedRevision = message.revision;
    }
    if (message.type === 'bots') {
      if (room.state.ranked) throw new Error('排位赛不加入机器人');
      if (!owner) throw new Error('只有房主可以修改机器人数量');
      if (room.members.length + message.count > maxRacers) throw new Error('最多 8 辆赛车');
      room.state.bots = message.count;
      room.members.forEach((m) => {
        m.public.ready = false;
      });
    }
    if (message.type === 'ready') {
      if (message.ready && member.public.loadedRevision !== room.state.revision)
        throw new Error('请等待当前房间素材加载完成');
      member.public.ready = message.ready;
    }
    if (message.type === 'start') {
      if (!owner) throw new Error('只有房主可以开始比赛');
      if (
        room.state.ranked &&
        (room.members.length !== 2 || !room.members.every((m) => m.playerId))
      )
        throw new Error('排位赛需要两位不同身份的真实玩家');
      if (room.members.length + room.state.bots < 2) throw new Error('请邀请好友或加入机器人');
      if (
        !room.members.every(
          (m) =>
            m.public.connected && m.public.ready && m.public.loadedRevision === room.state.revision,
        )
      )
        throw new Error('等待所有好友连接并准备');
      room.state.raceId++;
      room.matchId = randomUUID();
      room.state.seed = room.state.ranked ? rankedSeed : randomInt(0x100000000);
      room.state.roster = [
        ...room.members.map((m) => ({
          id: m.public.id,
          name: m.public.name,
          vehicle: m.public.vehicle,
          driver: m.public.driver,
          bot: false,
        })),
        ...Array.from({ length: room.state.bots }, (_, i) => ({
          id: `bot-${i}`,
          name: `机器人 ${i + 1}`,
          vehicle: vehicles[randomInt(vehicles.length)][0],
          driver: drivers[randomInt(drivers.length)][0],
          bot: true,
        })),
      ];
      room.race = new RaceManager(
        routes.find((r) => r.id === room.state.route)!.track,
        room.state.seed,
        room.state.roster.length,
      );
      room.state.phase = 'loading';
      room.loadingAt = now();
      room.firstFinishAt = 0;
      room.tick = 0;
      room.members.forEach((m) => {
        m.loaded = false;
        m.seq = -1;
        m.input = stopped;
      });
    }
    broadcast(room);
  }
  function step() {
    for (const [roomCode, room] of rooms) {
      if (room.state.settlement === 'pending' && options.competition?.saved(room.matchId)) {
        room.state.settlement = 'saved';
        broadcast(room);
      }
      if (
        (!room.members.some((m) => m.public.connected) && now() - room.touched > 30000) ||
        (room.state.phase === 'lobby' && now() - room.touched > 30 * 60000) ||
        (room.state.phase === 'finished' && now() - room.touched > 5 * 60000)
      ) {
        for (const member of room.members) {
          if (member.socket) {
            bindings.delete(member.socket);
            member.socket.close(4000, 'Room expired');
          }
        }
        rooms.delete(roomCode);
        continue;
      }
      if (room.state.phase === 'lobby') {
        const active = room.members.filter(
          (m) => m.public.connected || (!m.departed && now() - m.disconnectedAt <= 30000),
        );
        if (active.length !== room.members.length) {
          room.members = active;
          host(room);
          broadcast(room);
        }
      }
      if (room.state.phase === 'loading' && now() - room.loadingAt > 60000) {
        room.state.phase = 'lobby';
        room.state.roster = [];
        room.race = undefined;
        room.members.forEach((m) => {
          m.public.ready = false;
          m.public.loadedRevision = 0;
          send(m.socket, { type: 'error', message: '有车手加载超时，请准备后重试' });
        });
        broadcast(room);
      }
      if (room.state.phase !== 'racing' || !room.race) continue;
      const race = room.race;
      race.step(
        stopped,
        1 / 60,
        room.members.map((m) =>
          m.public.connected && now() - m.inputAt < 500 ? m.input : stopped,
        ),
      );
      room.tick++;
      if (!room.firstFinishAt && race.drivers.some((d) => d.progress.finishedAt))
        room.firstFinishAt = race.time;
      if (race.time >= 600 || (room.firstFinishAt > 0 && race.time - room.firstFinishAt > 60))
        race.phase = 'finished';
      if (race.phase === 'finished') {
        room.state.phase = 'finished';
        room.touched = now();
        if (room.state.ranked && options.competition) {
          room.state.settlement = 'pending';
          room.settlement = options.competition
            .settle({
              matchId: room.matchId,
              board: rankedBoard,
              entries: room.members.flatMap((member, index) => {
                const progress = race.drivers[index].progress;
                return member.playerId && progress.laps === 3 && progress.finishedAt > 0
                  ? [
                      {
                        playerId: member.playerId,
                        elapsedMs: Math.round(progress.finishedAt * 1000),
                      },
                    ]
                  : [];
              }),
              startedAt: room.startedAt,
              finishedAt: now(),
            })
            .catch((error) => {
              room.state.settlement = 'failed';
              app.log.error(
                { err: error, matchId: room.matchId },
                'Could not save ranked race outbox',
              );
              for (const member of room.members)
                send(member.socket, {
                  type: 'error',
                  message: '成绩保存失败，请保留房间并联系维护者',
                });
              broadcast(room);
            });
        }
        broadcast(room);
        state(room);
      } else if (room.tick % 3 === 0) state(room);
    }
  }
  app.server.on('upgrade', (request, socket, head) => {
    const origin = request.headers.origin;
    const localOrigin =
      origin && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
    const allowed =
      !origin || (options.origins?.length ? options.origins.includes(origin) : localOrigin);
    const ip = request.socket.remoteAddress ?? '';
    if (
      request.url !== '/kart' ||
      !allowed ||
      peers.size >= maxRooms * 8 + 16 ||
      [...peers.values()].filter((p) => p.ip === ip).length >= 16
    ) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });
  wss.on('connection', (socket, request) => {
    peers.set(socket, {
      ip: request.socket.remoteAddress ?? '',
      window: now(),
      count: 0,
      controlCount: 0,
      pong: true,
      pending: 0,
      queue: Promise.resolve(),
    });
    const deadline = setTimeout(() => {
      if (!bindings.has(socket)) socket.close(4000, 'Join timeout');
    }, 10000);
    deadline.unref();
    socket.on('error', () => {});
    socket.on('pong', () => {
      const peer = peers.get(socket);
      if (peer) peer.pong = true;
    });
    socket.on('message', (data, binary) => {
      const peer = peers.get(socket)!;
      if (now() - peer.window >= 1000) {
        peer.window = now();
        peer.count = peer.controlCount = 0;
      }
      if (++peer.count > 90 || binary) {
        socket.close(1008, 'Message limit');
        return;
      }
      try {
        const parsed = messageSchema.safeParse(JSON.parse(data.toString()));
        if (!parsed.success) throw new Error('请求格式或协议版本不正确');
        if (parsed.data.type !== 'input' && ++peer.controlCount > 12) {
          socket.close(1008, 'Command limit');
          return;
        }
        if (++peer.pending > 16) {
          socket.close(1008, 'Command queue limit');
          return;
        }
        peer.queue = peer.queue
          .then(() => receive(socket, parsed.data))
          .catch((error) => {
            send(socket, { type: 'error', message: (error as Error).message });
          })
          .finally(() => {
            peer.pending--;
          });
      } catch (error) {
        send(socket, {
          type: 'error',
          message: error instanceof SyntaxError ? '请求格式不正确' : (error as Error).message,
        });
      }
    });
    socket.on('close', () => {
      clearTimeout(deadline);
      peers.delete(socket);
      disconnect(socket);
    });
  });
  let previous = performance.now(),
    accumulator = 0;
  const timer =
    options.autoTick === false
      ? undefined
      : setInterval(() => {
          const current = performance.now();
          accumulator += Math.min(100, current - previous);
          previous = current;
          while (accumulator >= 1000 / 60) {
            step();
            accumulator -= 1000 / 60;
          }
        }, 1000 / 60);
  timer?.unref();
  const heartbeat = setInterval(() => {
    for (const [socket, peer] of peers) {
      if (!peer.pong) {
        socket.terminate();
        continue;
      }
      peer.pong = false;
      socket.ping();
    }
  }, 10000);
  heartbeat.unref();
  app.addHook('preClose', async () => {
    clearInterval(timer);
    clearInterval(heartbeat);
    for (const socket of peers.keys()) socket.terminate();
    await Promise.all([...rooms.values()].map((room) => room.settlement));
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    rooms.clear();
  });
  return { app, rooms, step };
}
