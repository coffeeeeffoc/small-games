import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFriendsClient, invitationURL } from '../src/friends.mjs';
const code = 'ABCDEF123456';
const snapshot = () => ({
  code,
  game: 'carrom-club',
  version: 1,
  you: 3,
  seq: 0,
  round: 1,
  revision: 8,
  status: 'playing',
  players: [],
  state: { shots: 0, turnNumber: 1 },
});
const memory = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};
const options = (request, extra = {}) => ({
  client: { request },
  setTimer: () => 0,
  clearTimer: () => {},
  ...extra,
});
test('lost multiplayer shot responses retain the exact payload through reload and clear only after authoritative acknowledgement', async () => {
  const room = snapshot(),
    attempts = [],
    storage = memory();
  let accepted = 0;
  const request = async (path, init) => {
    if (path.endsWith('/shoot')) {
      const input = JSON.parse(init.body);
      attempts.push(input);
      if (input.seq > room.seq) {
        accepted++;
        room.seq = input.seq;
        room.state.shots++;
      }
      if (attempts.length === 1) {
        const error = new Error('response lost');
        error.code = 'SERVICE_UNAVAILABLE';
        throw error;
      }
    }
    return structuredClone(room);
  };
  const first = createFriendsClient(options(request, { storage }));
  await first.join(code);
  await assert.rejects(first.shoot({ position: 400, dx: 1, dy: 0, power: 0.4 }), /response lost/);
  assert.equal(first.pending, true);
  await first.retry();
  assert.deepEqual(attempts[0], attempts[1]);
  assert.equal(accepted, 1);
  assert.equal(first.pending, false);
  first.destroy();
  const restored = createFriendsClient(options(request, { storage }));
  assert.equal(restored.recoverable, true);
  await restored.resume();
  assert.equal(restored.room.you, 3);
  assert.equal(restored.room.state.shots, 1);
  restored.destroy();
});
test('settings and start use observed revision; completed rooms continue polling for host rematch', async () => {
  const room = { ...snapshot(), status: 'waiting' },
    calls = [],
    timers = [];
  const friends = createFriendsClient(
    options(
      async (path, init) => {
        calls.push([path, init?.body ? JSON.parse(init.body) : undefined]);
        if (path.endsWith('/start')) room.status = 'finished';
        return structuredClone(room);
      },
      {
        setTimer: (fn) => {
          timers.push(fn);
          return 1;
        },
      },
    ),
  );
  await friends.create({ mode: 'colors', board: 'random' });
  await friends.settings({ mode: 'colors', board: 'ordinary' });
  await friends.ready(true);
  await friends.start();
  assert.deepEqual(calls.slice(1), [
    [
      `/carrom/rooms/${code}/settings`,
      { revision: 8, settings: { mode: 'colors', board: 'ordinary' } },
    ],
    [`/carrom/rooms/${code}/ready`, { ready: true, revision: 8 }],
    [`/carrom/rooms/${code}/start`, { revision: 8 }],
  ]);
  assert.equal(timers.length, 4);
  assert.equal(
    invitationURL(code, 'https://example.com/carrom/?dev=1&token=secret#play'),
    'https://example.com/carrom/?pk=ABCDEF123456',
  );
  friends.destroy();
});

test('an unacknowledged shot survives page reload and is retried with the original round and sequence', async () => {
  const room = snapshot(),
    storage = memory(),
    attempts = [];
  let unavailable = true;
  const request = async (path, init) => {
    if (path.endsWith('/shoot')) {
      const payload = JSON.parse(init.body);
      attempts.push(payload);
      if (unavailable) {
        const error = new Error('offline');
        error.code = 'SERVICE_UNAVAILABLE';
        throw error;
      }
      room.seq = payload.seq;
      room.state.shots++;
    }
    return structuredClone(room);
  };
  const initial = createFriendsClient(options(request, { storage }));
  await initial.join(code);
  await assert.rejects(initial.shoot({ position: 510, dx: 0.2, dy: -1, power: 0.75 }), /offline/);
  initial.destroy();
  const resumed = createFriendsClient(options(request, { storage }));
  await resumed.resume();
  assert.equal(resumed.pending, true);
  unavailable = false;
  await resumed.retry();
  assert.deepEqual(attempts[0], attempts[1]);
  assert.equal(resumed.pending, false);
  assert.equal(resumed.room.state.shots, 1);
  resumed.destroy();
});

test('recovery discards a shot from an earlier round instead of replaying it into a new match', async () => {
  const room = snapshot(),
    storage = memory();
  let requests = 0;
  const request = async (path) => {
    if (path.endsWith('/shoot')) {
      requests++;
      const error = new Error('offline');
      error.code = 'SERVICE_UNAVAILABLE';
      throw error;
    }
    return structuredClone(room);
  };
  const first = createFriendsClient(options(request, { storage }));
  await first.join(code);
  await assert.rejects(first.shoot({ position: 500, dx: 0, dy: -1, power: 0.4 }), /offline/);
  assert.equal(first.pending, true);
  first.destroy();
  room.round++;
  const restored = createFriendsClient(options(request, { storage }));
  await restored.resume();
  assert.equal(restored.pending, false);
  await restored.retry();
  assert.equal(requests, 1);
  assert.equal(restored.room.state.shots, 0);
  restored.destroy();
});

test('a timeout clears an unaccepted pending gesture before the player receives another turn', async () => {
  const room = snapshot(),
    storage = memory();
  let shots = 0;
  const request = async (path) => {
    if (path.endsWith('/shoot')) {
      shots++;
      const error = new Error('offline');
      error.code = 'SERVICE_UNAVAILABLE';
      throw error;
    }
    return structuredClone(room);
  };
  const friends = createFriendsClient(options(request, { storage }));
  await friends.join(code);
  await assert.rejects(friends.shoot({ position: 500, dx: 1, dy: 0, power: 0.3 }), /offline/);
  assert.equal(friends.pending, true);
  room.state.turnNumber += 2;
  await friends.refresh();
  assert.equal(friends.pending, false);
  await friends.retry();
  assert.equal(shots, 1);
  friends.destroy();
});
