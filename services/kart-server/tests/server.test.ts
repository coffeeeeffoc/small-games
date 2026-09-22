import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createKartServer } from '../src/server.ts';
import type { ServerMessage, ClientMessage } from '@coffeeeeffoc/carding-car/protocol';
import { aiInput } from '../../../games/local/carding-car/assets/scripts/KartAI.ts';
import { rankedBoard, rankedSeed, type KartResult } from '../src/competition.ts';

const appearance = { name: '小车手', vehicle: 'classic-kart', driver: 'rookie', version: 2 };
const create: ClientMessage = {
  type: 'create',
  ...appearance,
  theme: 'seaside',
  route: 'seaside',
  bots: 1,
};
async function peer(url: string) {
  const socket = new WebSocket(url);
  const messages: ServerMessage[] = [];
  socket.on('message', (data) => messages.push(JSON.parse(data.toString())));
  await once(socket, 'open');
  return {
    socket,
    messages,
    send: (value: unknown) => socket.send(JSON.stringify(value)),
    async wait<T extends ServerMessage['type']>(
      type: T,
      predicate: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
    ) {
      const end = Date.now() + 3000;
      while (Date.now() < end) {
        const index = messages.findIndex(
          (m) => m.type === type && predicate(m as Extract<ServerMessage, { type: T }>),
        );
        if (index >= 0) return messages.splice(index, 1)[0] as Extract<ServerMessage, { type: T }>;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      throw new Error(`Timed out waiting for ${type}: ${JSON.stringify(messages).slice(-500)}`);
    },
  };
}
test('real sockets create, join, configure, load, race, reconnect, finish and rematch with no client authority', async () => {
  let clock = 100000;
  const server = createKartServer({ autoTick: false, now: () => clock });
  await server.app.listen({ host: '127.0.0.1', port: 0 });
  const address = server.app.server.address() as { port: number };
  const url = `ws://127.0.0.1:${address.port}/kart`;
  const connections: WebSocket[] = [];
  try {
    const a = await peer(url),
      b = await peer(url);
    connections.push(a.socket, b.socket);
    a.send(create);
    const joined = await a.wait('joined');
    b.send({
      type: 'join',
      ...appearance,
      name: '好友',
      vehicle: 'formula',
      code: joined.room.code,
    });
    const friend = await b.wait('joined');
    assert.equal(friend.room.members.length, 2);
    assert.equal(JSON.stringify(friend.room).includes(joined.token), false);
    b.send({
      type: 'selection',
      theme: 'city',
      route: 'city',
      vehicle: 'formula',
      driver: 'aviator',
    });
    assert.match((await b.wait('error')).message, /房主/);
    a.send({
      type: 'selection',
      theme: 'city',
      route: 'city',
      vehicle: 'formula',
      driver: 'aviator',
    });
    const configured = (await b.wait('room', (m) => m.room.revision === 2)).room;
    assert.equal(configured.theme, 'city');
    assert.ok(configured.members.every((m) => m.vehicle === 'formula' && !m.ready));
    a.send({ type: 'prepared', revision: 1 });
    a.send({ type: 'ready', ready: true });
    assert.match((await a.wait('error')).message, /加载/);
    a.send({ type: 'prepared', revision: 2 });
    b.send({ type: 'prepared', revision: 2 });
    await a.wait('room', (m) => m.room.members.every((p) => p.loadedRevision === 2));
    b.send({ type: 'bots', count: 0 });
    assert.match((await b.wait('error')).message, /房主/);
    a.send({ type: 'bots', count: 7 });
    assert.match((await a.wait('error')).message, /8/);
    a.send({ type: 'bots', count: 0 });
    await a.wait('room', (m) => m.room.bots === 0);
    a.send({ type: 'start' });
    assert.match((await a.wait('error')).message, /准备/);
    a.send({ type: 'ready', ready: true });
    b.send({ type: 'ready', ready: true });
    await a.wait('room', (m) => m.room.members.every((p) => p.ready));
    a.send({ type: 'start' });
    const loading = (await a.wait('room', (m) => m.room.phase === 'loading')).room;
    assert.equal(loading.roster.length, 2);
    assert.equal(loading.roster[1].vehicle, 'formula');
    const raceId = loading.raceId;
    a.send({ type: 'loaded', raceId });
    await new Promise((resolve) => setTimeout(resolve, 15));
    server.step();
    assert.equal(server.rooms.get(loading.code)!.race!.phase, 'ready');
    b.send({ type: 'loaded', raceId });
    await a.wait('room', (m) => m.room.phase === 'racing');
    const room = server.rooms.get(loading.code)!;
    // Fast-forward only server time, never trust client position/finish claims.
    for (let i = 0; i < 190; i++) {
      server.step();
      if (i % 30 === 0) await new Promise((resolve) => setImmediate(resolve));
    }
    b.send({
      type: 'input',
      raceId,
      seq: 1,
      input: { steer: 0, throttle: 1, brake: false, drift: false },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    for (let i = 0; i < 20; i++) server.step();
    assert.ok(room.race!.drivers[1].kart.speed > room.race!.drivers[0].kart.speed);
    a.send({
      type: 'input',
      raceId,
      seq: 1,
      input: { steer: 0, throttle: 1, brake: false, drift: false },
      x: 9999,
    });
    assert.match((await a.wait('error')).message, /格式/);
    b.send({
      type: 'input',
      raceId,
      seq: 0,
      input: { steer: 0, throttle: 0, brake: true, drift: false },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(room.members[1].input.throttle, 1, 'old inputs are ignored');
    b.socket.close();
    await once(b.socket, 'close');
    await a.wait('room', (m) => m.room.members.length === 2 && !m.room.members[1].connected);
    clock += 1000;
    server.step();
    assert.equal(room.members[1].input.throttle, 0);
    const resumed = await peer(url);
    connections.push(resumed.socket);
    resumed.send({ type: 'resume', version: 2, code: loading.code, token: friend.token });
    assert.equal((await resumed.wait('joined')).selfId, friend.selfId);
    const racing = await resumed.wait('state');
    assert.equal(racing.state.drivers.length, 2);
    assert.deepEqual(racing.state.order, room.race!.order);
    room.race!.time = 600;
    server.step();
    await a.wait('room', (m) => m.room.phase === 'finished');
    clock += 1000;
    a.send({ type: 'rematch' });
    await a.wait(
      'room',
      (m) => m.room.phase === 'lobby' && m.room.raceId === raceId && m.room.roster.length === 0,
    );
    a.send({ type: 'bots', count: 2 });
    await a.wait('room', (m) => m.room.bots === 2);
    assert.ok(room.members.every((m) => m.public.loadedRevision === 0));
    a.send({ type: 'prepared', revision: 2 });
    resumed.send({ type: 'prepared', revision: 2 });
    await a.wait('room', (m) => m.room.members.every((p) => p.loadedRevision === 2));
    a.send({ type: 'ready', ready: true });
    resumed.send({ type: 'ready', ready: true });
    await a.wait('room', (m) => m.room.members.every((p) => p.ready));
    a.send({ type: 'start' });
    const next = (await a.wait('room', (m) => m.room.raceId === raceId + 1)).room;
    assert.equal(next.roster.filter((r) => r.bot).length, 2);
    assert.equal(next.roster[0].vehicle, 'formula');
    resumed.send({ type: 'leave' });
    await once(resumed.socket, 'close');
    clock += 61000;
    server.step();
    assert.equal(room.state.phase, 'lobby', 'loading cannot hang forever after a friend leaves');
    a.socket.close();
    await once(a.socket, 'close');
    await new Promise((resolve) => setTimeout(resolve, 10));
    clock += 31000;
    server.step();
    assert.equal(server.rooms.size, 0);
    const expired = await peer(url);
    connections.push(expired.socket);
    expired.send({ type: 'resume', version: 2, code: loading.code, token: joined.token });
    assert.equal((await expired.wait('error')).fatal, true);
    const response = await server.app.inject('/health');
    assert.equal(response.statusCode, 200);
  } finally {
    connections.forEach((s) => s.terminate());
    await server.app.close();
  }
});

test('capacity, origins and message limits are enforced', async () => {
  const server = createKartServer({
    autoTick: false,
    maxRooms: 1,
    origins: ['https://game.example'],
  });
  await server.app.listen({ host: '127.0.0.1', port: 0 });
  const url = `ws://127.0.0.1:${(server.app.server.address() as { port: number }).port}/kart`;
  const a = await peer(url),
    b = await peer(url);
  try {
    a.send({ ...create, bots: 7 });
    const joined = await a.wait('joined');
    b.send({ type: 'join', ...appearance, code: joined.room.code });
    assert.match((await b.wait('error')).message, /已满/);
    b.send(create);
    assert.match((await b.wait('error')).message, /已满/);
    const rejected = new WebSocket(url, { origin: 'https://untrusted.example' });
    await once(rejected, 'error');
    const closed = once(b.socket, 'close');
    b.socket.send('x'.repeat(5000));
    await closed;
  } finally {
    a.socket.terminate();
    b.socket.terminate();
    await server.app.close();
  }
});

test('ranked sockets require distinct verified players and settle legal simulated laps exactly once', async () => {
  let clock = 100000;
  const results: KartResult[] = [];
  const server = createKartServer({
    autoTick: false,
    now: () => clock,
    competition: {
      async verify(token) {
        if (!['valid-player-one', 'valid-player-two'].includes(token))
          throw new Error('Invalid session');
        return { playerId: token };
      },
      async settle(result) {
        results.push(result);
      },
      saved: (id) => results.some((result) => result.matchId === id),
    },
  });
  await server.app.listen({ host: '127.0.0.1', port: 0 });
  const url = `ws://127.0.0.1:${(server.app.server.address() as { port: number }).port}/kart`;
  const a = await peer(url),
    b = await peer(url),
    duplicate = await peer(url);
  try {
    a.send({ ...create, ranked: true });
    assert.match((await a.wait('error')).message, /有效玩家身份/);
    a.send({ ...create, ranked: true, competitionToken: 'fabricated-token-value' });
    assert.match((await a.wait('error')).message, /身份验证失败/);
    a.send({
      ...create,
      route: 'city',
      bots: 7,
      ranked: true,
      competitionToken: 'valid-player-one',
    });
    const joined = await a.wait('joined');
    assert.equal(joined.room.route, 'seaside');
    assert.equal(joined.room.bots, 0);
    duplicate.send({
      type: 'join',
      ...appearance,
      code: joined.room.code,
      competitionToken: 'valid-player-one',
    });
    assert.match((await duplicate.wait('error')).message, /已加入/);
    b.send({
      type: 'join',
      ...appearance,
      code: joined.room.code,
      competitionToken: 'valid-player-two',
    });
    await b.wait('joined');
    a.send({ type: 'bots', count: 1 });
    assert.match((await a.wait('error')).message, /不加入机器人/);
    for (const client of [a, b]) {
      client.send({ type: 'prepared', revision: 1 });
      client.send({ type: 'ready', ready: true });
    }
    await a.wait(
      'room',
      (message) =>
        message.room.members.length === 2 && message.room.members.every((member) => member.ready),
    );
    // A fresh rate window avoids counting setup assertions as player input abuse.
    clock += 1001;
    a.send({ type: 'start' });
    const loading = (await a.wait('room', (message) => message.room.phase === 'loading')).room;
    assert.equal(loading.seed, rankedSeed);
    a.send({ type: 'loaded', raceId: 1 });
    b.send({ type: 'loaded', raceId: 1 });
    await a.wait('room', (message) => message.room.phase === 'racing');
    a.send({ type: 'start' });
    assert.match((await a.wait('error')).message, /比赛进行中/);
    a.send({
      type: 'input',
      raceId: 1,
      seq: 1,
      input: { steer: 0, throttle: 1, brake: false, drift: false },
      score: 999999,
    });
    assert.match((await a.wait('error')).message, /格式/);
    const room = server.rooms.get(joined.room.code)!;
    let seq = 1;
    // Real protocol input drives all checkpoints; no teleport, finishedAt assignment or forced end.
    for (let frame = 0; frame < 60 * 300 && room.state.phase === 'racing'; frame++) {
      if (frame % 3 === 0) {
        seq++;
        for (const [index, client] of [a, b].entries()) {
          const driver = room.race!.drivers[index];
          client.send({
            type: 'input',
            raceId: 1,
            seq,
            input: aiInput(driver.kart, room.race!.track, false, driver.progress.s),
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      clock += 1000 / 60;
      server.step();
    }
    assert.equal(room.state.phase, 'finished');
    await room.settlement;
    assert.equal(results.length, 1);
    assert.equal(results[0].board, rankedBoard);
    assert.equal(results[0].entries.length, 2);
    assert.ok(results[0].entries.every((entry) => entry.elapsedMs > 60000));
    assert.ok(room.race!.drivers.every((driver) => driver.progress.laps === 3));
    const aEnd = await a.wait('state', (message) => message.state.phase === 'finished');
    const bEnd = await b.wait('state', (message) => message.state.phase === 'finished');
    assert.deepEqual(aEnd, bEnd);
    for (let i = 0; i < 60; i++) server.step();
    assert.equal(results.length, 1);
    assert.equal(room.state.settlement, 'saved');
  } finally {
    [a, b, duplicate].forEach((client) => client.socket.terminate());
    await server.app.close();
  }
});
