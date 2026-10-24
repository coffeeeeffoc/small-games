import test from 'node:test';
import assert from 'node:assert/strict';
import { Rewards, RoomClient, shareURL, storagePort } from '../src/platform.mjs';
test('reward cancellation invalidates a late success without blocking a new request', async () => {
  let finish;
  globalThis.PorcelainHost = {
    ads: { offer: () => new Promise((resolve) => (finish = resolve)), cancel() {} },
  };
  const rewards = new Rewards(),
    promise = rewards.offer('old', { type: 'time', amount: 45 });
  assert.equal(rewards.pending, true);
  rewards.cancel();
  finish({ status: 'completed' });
  assert.equal((await promise).status, 'dismissed');
  assert.equal(rewards.pending, false);
  globalThis.PorcelainHost.ads.offer = async () => ({ status: 'completed' });
  assert.equal((await rewards.offer('new', {})).status, 'completed');
  delete globalThis.PorcelainHost;
});
test('leaving during create discards its result and releases the newly created room', async () => {
  const client = new RoomClient(),
    calls = [];
  let finish;
  client.request = (path, body, token) => {
    calls.push({ path, body, token });
    if (path === '') return new Promise((resolve) => (finish = resolve));
    return Promise.resolve({ left: true });
  };
  const pending = client.create({ name: '瓷友' });
  client.cancel();
  finish({ code: 'ABC123', token: 'test-token' });
  await assert.rejects(pending, /已取消/);
  assert.equal(client.session, null);
  assert.equal(calls[1].path, '/ABC123/actions');
  assert.equal(calls[1].body.type, 'leave');
});
test('public invitations retain only a stable level or room code', () => {
  globalThis.location = {
    href: 'https://example.com/games/porcelain-puzzle/index.html?dev=1&token=private#debug',
  };
  assert.equal(
    shareURL({ level: 7 }),
    'https://example.com/games/porcelain-puzzle/index.html?level=7',
  );
  assert.equal(
    shareURL({ room: 'ABC123' }),
    'https://example.com/games/porcelain-puzzle/index.html?room=ABC123',
  );
  delete globalThis.location;
});
test('versioned GameHost storage is read and writes serialize with returned versions', async () => {
  const values = new Map(),
    writes = [];
  globalThis.localStorage = {
    getItem: (k) => values.get(k) || null,
    setItem: (k, v) => values.set(k, v),
  };
  globalThis.PorcelainHost = {
    storage: {
      read: async () => ({ value: { a: 1 }, version: 'v1' }),
      write: async (k, v, version) => {
        writes.push({ v, version });
        return { value: v, version: `v${writes.length + 1}` };
      },
    },
  };
  const port = await storagePort();
  assert.deepEqual(JSON.parse(port.getItem('x')), { a: 1 });
  port.setItem('x', '{"a":2}');
  port.setItem('x', '{"a":3}');
  await port.flush();
  assert.deepEqual(writes, [
    { v: { a: 2 }, version: 'v1' },
    { v: { a: 3 }, version: 'v2' },
  ]);
  delete globalThis.PorcelainHost;
  delete globalThis.localStorage;
});

test('an offline pending save survives restart and merges remote progress before retry', async () => {
  const key = 'porcelain-puzzle.save.v1',
    values = new Map();
  let online = true,
    version = 1,
    remote = { version: 1, unlocked: 1, collection: [], best: {} };
  globalThis.localStorage = {
    getItem: (k) => values.get(k) || null,
    setItem: (k, v) => values.set(k, v),
  };
  globalThis.PorcelainHost = {
    storage: {
      read: async () => {
        if (!online) throw Error('offline');
        return { value: remote, version: String(version) };
      },
      write: async (k, v, expected) => {
        if (!online) throw Error('offline');
        assert.equal(expected, String(version));
        remote = v;
        version++;
        return { value: v, version: String(version) };
      },
    },
  };
  const first = await storagePort();
  online = false;
  first.setItem(key, JSON.stringify({ version: 1, unlocked: 5, collection: ['local'], best: {} }));
  await first.flush();
  assert.equal(values.get(key + '.pending'), '1');
  // Another device advances while this device is offline.
  remote = { version: 1, unlocked: 7, collection: ['remote'], best: {} };
  version++;
  online = true;
  const next = await storagePort();
  assert.equal(JSON.parse(next.getItem(key)).unlocked, 7);
  assert.deepEqual(JSON.parse(next.getItem(key)).collection, ['remote', 'local']);
  await next.flush();
  assert.equal(remote.unlocked, 7);
  assert.equal(values.get(key + '.pending'), '0');
  // Starting offline also recovers a usable remote version before writing.
  online = false;
  const offline = await storagePort();
  offline.setItem(key, JSON.stringify({ ...remote, unlocked: 9 }));
  await offline.flush();
  online = true;
  offline.setItem(key, offline.getItem(key));
  await offline.flush();
  assert.equal(remote.unlocked, 9);
  delete globalThis.PorcelainHost;
  delete globalThis.localStorage;
});
