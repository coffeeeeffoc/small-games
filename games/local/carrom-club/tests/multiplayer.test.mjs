import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMultiplayer, invitationURL, readInvitation } from '../src/multiplayer.mjs';

const code = 'ABCDEF123456';
const initial = () => ({
  game: 'carrom-club',
  code,
  you: 0,
  seq: 0,
  status: 'waiting',
  pollMs: 800,
  players: [{ ready: false }],
  state: { game: { shots: 0, turn: 0 } },
});
const memory = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const options = (request, extra = {}) => ({
  client: { request },
  storage: memory(),
  setTimer: () => 0,
  clearTimer: () => {},
  ...extra,
});

test('invitation contains only the public room code and resolves independent Shell iframe URLs', () => {
  const href = invitationURL(
    code,
    'https://games.example/games/carrom-club/?dev=1&token=secret&api=private#play',
  );
  assert.equal(href, 'https://games.example/games/carrom-club/?pk=ABCDEF123456');
  assert.equal(readInvitation(href), code);
  assert.equal(readInvitation('abcdef123456'), code);
  assert.equal(readInvitation('https://games.example/?game=other&pk=' + code), '');
  assert.equal(readInvitation('../rooms/private'), '');
  assert.equal(readInvitation('ABCD'), '');
  assert.throws(() => invitationURL('bad', href), /无效/);
});

test('creating, joining and preparing use the existing server room protocol', async () => {
  const calls = [];
  const room = initial();
  const network = createMultiplayer(
    options(async (path, init) => {
      calls.push([path, init?.body && JSON.parse(init.body)]);
      return structuredClone(room);
    }),
  );
  await network.create();
  await network.ready();
  assert.deepEqual(calls, [
    ['/rooms', { game: 'carrom-club' }],
    [`/rooms/${code}/ready`, {}],
  ]);
  const friend = createMultiplayer(
    options(async (path, init) => {
      assert.equal(path, '/rooms/join');
      assert.deepEqual(JSON.parse(init.body), { game: 'carrom-club', code });
      return { ...room, you: 1 };
    }),
  );
  await friend.join('abcdef123456');
  assert.equal(friend.room.you, 1);
  network.destroy();
  friend.destroy();
});

test('a lost shot response retries the exact sequence and gesture, without firing twice', async () => {
  const room = { ...initial(), status: 'playing' };
  const attempts = [];
  let applied = 0;
  const network = createMultiplayer(
    options(async (path, init) => {
      if (path === '/rooms') return structuredClone(room);
      assert.equal(path, `/rooms/${code}/actions`);
      const body = JSON.parse(init.body);
      attempts.push(body);
      if (body.seq > room.seq) {
        applied++;
        room.seq = body.seq;
        room.state.game.shots++;
        const error = new Error('response lost');
        error.code = 'SERVICE_UNAVAILABLE';
        throw error;
      }
      return structuredClone(room);
    }),
  );
  await network.create();
  const shot = { x: 500, dx: 0, dy: -1, power: 0.6 };
  await assert.rejects(network.shoot(shot), /response lost/);
  assert.equal(network.pending, true);
  await assert.rejects(network.shoot(shot), /尚未确认/);
  await network.retry();
  assert.equal(applied, 1);
  assert.deepEqual(attempts[0], attempts[1]);
  assert.deepEqual(attempts[0], { seq: 1, action: { type: 'shoot', ...shot, expectedShot: 0 } });
  assert.equal(network.pending, false);
  network.destroy();
});

test('reloading restores unresolved action and refresh acknowledges an accepted shot', async () => {
  const storage = memory();
  let room = { ...initial(), status: 'playing' };
  const request = async (path) => {
    if (path.endsWith('/actions')) {
      room = { ...room, seq: 1, state: { game: { shots: 1, turn: 1 } } };
      throw Object.assign(new Error('lost'), { code: 'SERVICE_UNAVAILABLE' });
    }
    return structuredClone(room);
  };
  const first = createMultiplayer(options(request, { storage }));
  await first.create();
  await assert.rejects(first.shoot({ x: 500, dx: 0, dy: -1, power: 0.5 }));
  first.destroy();
  const next = createMultiplayer(options(request, { storage }));
  assert.equal(next.recoverable, true);
  assert.equal(next.recoveryCode, code);
  await next.resume();
  assert.equal(next.room.code, code);
  assert.equal(next.room.state.game.shots, 1);
  assert.equal(next.pending, false);
  next.destroy();
});

test('polls and mutations serialize to prevent old room responses overwriting a prepared match', async () => {
  const polling = deferred();
  let pollCalled = false;
  let readyCalled = false;
  const network = createMultiplayer(
    options(async (path) => {
      if (path === '/rooms') return initial();
      if (path.endsWith('/ready')) {
        readyCalled = true;
        return { ...initial(), status: 'playing' };
      }
      pollCalled = true;
      return polling.promise;
    }),
  );
  await network.create();
  const refresh = network.refresh();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(pollCalled, true);
  const ready = network.ready();
  assert.equal(readyCalled, false);
  polling.resolve(initial());
  await Promise.all([refresh, ready]);
  assert.equal(network.room.status, 'playing');
  network.destroy();
});

test('destroy ignores late responses and leaving clears saved membership only after server acknowledgement', async () => {
  const polling = deferred();
  const changes = [];
  const storage = memory();
  let rejectLeave = true;
  const network = createMultiplayer(
    options(
      async (path) => {
        if (path === '/rooms') return initial();
        if (path.endsWith('/leave')) {
          if (rejectLeave) throw new Error('offline');
          return { ...initial(), status: 'abandoned' };
        }
        return polling.promise;
      },
      { onRoom: (room) => changes.push(room), storage },
    ),
  );
  await network.create();
  await assert.rejects(network.leave(), /offline/);
  assert.equal(network.room.code, code);
  rejectLeave = false;
  await network.leave();
  assert.equal(network.room, null);
  assert.equal(storage.getItem('carrom-friend-room-v1'), undefined);
  await network.create();
  const refresh = network.refresh();
  await Promise.resolve();
  network.destroy();
  const count = changes.length;
  polling.resolve({ ...initial(), status: 'playing' });
  await refresh;
  assert.equal(changes.length, count);
});

test('accepting a new room replaces stale recovery and a definitive retry rejection releases the pending shot', async () => {
  const storage = memory();
  storage.setItem('carrom-friend-room-v1', JSON.stringify({ code: '123456ABCDEF' }));
  let fail = 'SERVICE_UNAVAILABLE';
  const network = createMultiplayer(
    options(
      async (path) => {
        if (path.endsWith('/actions')) throw Object.assign(new Error('rejected'), { code: fail });
        return { ...initial(), status: 'playing' };
      },
      { storage },
    ),
  );
  assert.equal(network.recoverable, true);
  await network.create();
  assert.equal(network.recoverable, false);
  assert.equal(network.recoveryCode, '');
  await assert.rejects(network.shoot({ x: 500, dx: 0, dy: -1, power: 0.5 }));
  assert.equal(network.pending, true);
  fail = 'MATCH_CLOSED';
  await assert.rejects(network.retry());
  assert.equal(network.pending, false);
  network.destroy();
});
