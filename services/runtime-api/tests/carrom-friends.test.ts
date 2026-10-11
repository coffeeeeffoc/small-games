import { expect, it } from 'vitest';
import { createCarromRooms } from '../src/carrom/rooms.js';
import type { Engine, Level, Repository, Room } from '../src/carrom/types.js';

const engineUrl = new URL('../../../games/local/carrom-club/src/friends-core.mjs', import.meta.url)
  .href;
const levelsUrl = new URL(
  '../../../games/local/carrom-club/src/friends-content.mjs',
  import.meta.url,
).href;
const engine = (await import(engineUrl)) as Engine;
const { FRIEND_LEVELS } = (await import(levelsUrl)) as { FRIEND_LEVELS: Level[] };

function setup() {
  const rooms = new Map<string, Room>();
  let time = 1_000;
  const repository: Repository = {
    async create(room) {
      rooms.set(room.code, structuredClone(room));
    },
    async name(id) {
      return `棋友 ${id}`;
    },
    async mutate(code, change) {
      const room = structuredClone(rooms.get(code)!);
      const result = change(room);
      rooms.set(code, room);
      return structuredClone(result);
    },
  };
  const store = createCarromRooms(repository, engine, FRIEND_LEVELS, () => time);
  return {
    store,
    rooms,
    advance(ms: number) {
      time += ms;
    },
  };
}
async function started(mode: 'singles' | 'doubles' | 'colors', count: number) {
  const setupResult = setup();
  const { store } = setupResult;
  let room = await store.create('a', { mode });
  for (let index = 1; index < count; index++)
    room = (await store.action('abcd'[index]!, room.code, 'join')) as typeof room;
  for (const id of 'abcd'.slice(0, count))
    room = (await store.action(id, room.code, 'ready', {
      revision: room.revision,
      ready: true,
    })) as typeof room;
  room = (await store.action('a', room.code, 'start', { revision: room.revision })) as typeof room;
  return { ...setupResult, room };
}
it.each([2, 3, 4])(
  'starts a %i-player colored match and rejects later joins or unauthorized actions',
  async (count) => {
    const { store, room } = await started('colors', count);
    expect(room.state?.players).toHaveLength(count);
    expect(room.status).toBe('playing');
    await expect(store.action('outsider', room.code, 'join')).rejects.toMatchObject({
      code: 'MATCH_STARTED',
    });
    await expect(store.action('outsider', room.code, 'get')).rejects.toMatchObject({
      code: 'NOT_A_MEMBER',
    });
    await expect(
      store.action('b', room.code, 'shoot', {
        seq: 1,
        round: 1,
        expectedTurnNumber: 1,
        shot: { position: 500, dx: 0, dy: -1, power: 0.5 },
      }),
    ).rejects.toMatchObject({ code: 'NOT_YOUR_TURN' });
  },
);
it('classic doubles require four players; settings enforce capacity, preview and renewed readiness', async () => {
  const { store } = setup();
  let room = await store.create('a', { mode: 'doubles' });
  room = (await store.action('b', room.code, 'join')) as typeof room;
  room = (await store.action('a', room.code, 'ready', {
    revision: room.revision,
    ready: true,
  })) as typeof room;
  room = (await store.action('b', room.code, 'ready', {
    revision: room.revision,
    ready: true,
  })) as typeof room;
  await expect(
    store.action('a', room.code, 'start', { revision: room.revision }),
  ).rejects.toMatchObject({ code: 'PLAYER_COUNT' });
  await expect(
    store.action('b', room.code, 'settings', {
      revision: room.revision,
      settings: { mode: 'colors' },
    }),
  ).rejects.toMatchObject({ code: 'HOST_ONLY' });
  const previous = room.revision;
  room = (await store.action('a', room.code, 'settings', {
    revision: room.revision,
    settings: { mode: 'colors', board: 'random' },
  })) as typeof room;
  expect(FRIEND_LEVELS.map((level) => level.id)).toContain(room.resolvedLevelId);
  expect(room.players.every((p) => !p.ready)).toBe(true);
  await expect(
    store.action('b', room.code, 'ready', { revision: previous, ready: true }),
  ).rejects.toMatchObject({ code: 'ROOM_CHANGED' });
  const level = room.resolvedLevelId;
  for (const id of ['a', 'b'])
    room = (await store.action(id, room.code, 'ready', {
      revision: room.revision,
      ready: true,
    })) as typeof room;
  room = (await store.action('a', room.code, 'start', { revision: room.revision })) as typeof room;
  expect(room.state?.levelId).toBe(level);
  await expect(
    store.create('z', { mode: 'singles', board: 'level', levelId: FRIEND_LEVELS[0]!.id }),
  ).rejects.toMatchObject({ code: 'CLASSIC_BOARD_ONLY' });
});
it('lost shot replies are idempotent and disconnects preserve state, transfer host, and expire a turn', async () => {
  const { store, room, advance } = await started('colors', 3);
  const input = {
    seq: 1,
    round: 1,
    expectedTurnNumber: 1,
    shot: { position: 500, dx: 0, dy: -1, power: 0.3 },
  };
  const first = (await store.action('a', room.code, 'shoot', input)) as typeof room;
  const retry = (await store.action('a', room.code, 'shoot', input)) as typeof room;
  expect(retry.state).toEqual(first.state);
  expect(retry.seq).toBe(1);
  await expect(
    store.action('a', room.code, 'shoot', { ...input, shot: { ...input.shot, power: 0.4 } }),
  ).rejects.toMatchObject({ code: 'SEQUENCE_CONFLICT' });
  advance(40_000);
  await store.action('b', room.code, 'get');
  advance(6_000);
  const reconnected = (await store.action('b', room.code, 'get')) as typeof room;
  expect(reconnected.hostId).toBe('b');
  expect(reconnected.state).toEqual(first.state);
  advance(30_000);
  const skipped = (await store.action('b', room.code, 'get')) as typeof room;
  expect(skipped.reason).toBe('turn-timeout');
  expect(skipped.state?.turnNumber).toBe(Number(first.state?.turnNumber) + 1);
  const original = (await store.action('a', room.code, 'get')) as typeof room;
  expect(original.hostId).toBe('b');
  expect(original.seq).toBe(1);
});
it('leaving transfers waiting ownership; leaving a match ends it without fabricating a winner', async () => {
  const waiting = setup();
  let room = await waiting.store.create('a');
  room = (await waiting.store.action('b', room.code, 'join')) as typeof room;
  await waiting.store.action('a', room.code, 'leave');
  expect(await waiting.store.action('a', room.code, 'leave')).toEqual({ left: true });
  room = (await waiting.store.action('b', room.code, 'get')) as typeof room;
  expect(room.hostId).toBe('b');
  expect(room.status).toBe('waiting');
  const match = await started('doubles', 4);
  await match.store.action('a', match.room.code, 'leave');
  room = (await match.store.action('b', match.room.code, 'get')) as typeof room;
  expect(room.status).toBe('abandoned');
  expect(room.series.every((p) => p.points === 0)).toBe(true);
});
it('settles tied ranks once and preserves series points through a rematch', async () => {
  const { store, rooms, room } = await started('colors', 3);
  const stored = rooms.get(room.code)!;
  // Build a near-finish server-owned board; clients cannot submit snapshots.
  const game = stored.state!;
  const coins = game.coins as {
    owner: number;
    pocketed: boolean;
    x: number;
    y: number;
    vx: number;
    vy: number;
  }[];
  for (const coin of coins) if (coin.owner === 0) coin.pocketed = true;
  const target = coins.find((coin) => coin.owner === 0)!;
  Object.assign(target, { pocketed: false, x: 84, y: 84, vx: 0, vy: 0 });
  const finished = (await store.action('a', room.code, 'shoot', {
    seq: 1,
    round: 1,
    expectedTurnNumber: 1,
    shot: { position: 500, dx: 0, dy: -1, power: 0.025 },
  })) as typeof room;
  expect(finished.status).toBe('finished');
  expect(finished.series.map((p) => p.points)).toEqual([4, 2, 2]);
  const refreshed = (await store.action('a', room.code, 'get')) as typeof room;
  expect(refreshed.series).toEqual(finished.series);
  const next = (await store.action('a', room.code, 'rematch', {
    revision: refreshed.revision,
  })) as typeof room;
  expect(next.status).toBe('waiting');
  expect(next.series).toEqual(finished.series);
  expect(next.players.every((p) => !p.ready)).toBe(true);
});

it('several players can ready against one room revision, but a settings change invalidates old readiness', async () => {
  const { store } = setup();
  let room = await store.create('a');
  for (const id of ['b', 'c', 'd'])
    room = (await store.action(id, room.code, 'join')) as typeof room;
  const revision = room.revision;
  for (const id of ['a', 'b', 'c', 'd'])
    room = (await store.action(id, room.code, 'ready', { revision, ready: true })) as typeof room;
  expect(room.players.every((p) => p.ready)).toBe(true);
  room = (await store.action('a', room.code, 'settings', {
    revision: room.revision,
    settings: { mode: 'colors', board: 'random' },
  })) as typeof room;
  expect(room.players.every((p) => !p.ready)).toBe(true);
  await expect(
    store.action('b', room.code, 'ready', { revision, ready: true }),
  ).rejects.toMatchObject({ code: 'ROOM_CHANGED' });
});

it('keeps match numbers monotonic across roster and series resets so delayed shots cannot enter a later match', async () => {
  const { store, room: original } = await started('colors', 3);
  const accepted = {
    seq: 1,
    round: original.round,
    expectedTurnNumber: original.state!.turnNumber,
    shot: { position: 500, dx: 0, dy: -1, power: 0.1 },
  };
  let room = (await store.action('a', original.code, 'shoot', accepted)) as typeof original;
  // This command was composed in round one but never reached the service.
  const delayed = { ...accepted, seq: 2, shot: { ...accepted.shot, power: 0.2 } };
  await store.action('c', room.code, 'leave');
  room = (await store.action('a', room.code, 'get')) as typeof room;
  room = (await store.action('a', room.code, 'rematch', {
    revision: room.revision,
  })) as typeof room;
  expect(room.round).toBe(original.round);
  expect(room.series.every((player) => player.points === 0)).toBe(true);
  room = (await store.action('a', room.code, 'settings', {
    revision: room.revision,
    settings: { mode: 'singles' },
  })) as typeof room;
  const revision = room.revision;
  for (const id of ['a', 'b'])
    room = (await store.action(id, room.code, 'ready', { revision, ready: true })) as typeof room;
  room = (await store.action('a', room.code, 'start', { revision: room.revision })) as typeof room;
  expect(room.round).toBe(original.round + 1);
  await expect(store.action('a', room.code, 'shoot', delayed)).rejects.toMatchObject({
    code: 'ROOM_CHANGED',
  });
  const replay = (await store.action('a', room.code, 'shoot', accepted)) as typeof room;
  expect(replay.state).toEqual(room.state);
  expect(replay.state?.shots).toBe(0);
  expect(replay.seq).toBe(1);
  expect(replay.series).toEqual(room.series);
});

it('rejects a delayed shot after timeout even when it is the same player’s turn again', async () => {
  const { store, room: first, advance } = await started('colors', 2);
  const delayed = {
    round: first.round,
    seq: 1,
    expectedTurnNumber: first.state!.turnNumber,
    shot: { position: 500, dx: 1, dy: 0, power: 0.025 },
  };
  advance(45_001);
  let room = (await store.action('b', first.code, 'get')) as typeof first;
  expect(room.state?.turn).toBe(1);
  const nextShot = { ...delayed, expectedTurnNumber: room.state!.turnNumber };
  room = (await store.action('b', room.code, 'shoot', nextShot)) as typeof room;
  expect(room.state?.turn).toBe(0);
  expect(room.state?.turnNumber).toBe(3);
  advance(room.lastShot!.durationMs + 1);
  await expect(store.action('a', room.code, 'shoot', delayed)).rejects.toMatchObject({
    code: 'ROOM_CHANGED',
  });
  const duplicate = (await store.action('b', room.code, 'shoot', nextShot)) as typeof room;
  expect(duplicate.state).toEqual(room.state);
  expect(duplicate.state?.shots).toBe(1);
  const current = (await store.action('a', room.code, 'shoot', {
    ...delayed,
    expectedTurnNumber: room.state!.turnNumber,
  })) as typeof room;
  expect(current.state?.shots).toBe(2);
});
