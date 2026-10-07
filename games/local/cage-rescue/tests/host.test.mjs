import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalHost } from '../src/host.mjs';

function localStorageFixture() {
  const records = new Map();
  return {
    records,
    getItem(key) {
      return records.get(key) ?? null;
    },
    setItem(key, value) {
      records.set(key, value);
    },
  };
}

test('local host reads and writes versioned progress across host instances', async () => {
  const storage = localStorageFixture();
  const host = createLocalHost(storage);
  assert.equal(await host.storage.read('progress'), null);
  const saved = await host.storage.write('progress', { completed: ['rescue-01'] }, null);
  assert.equal(typeof saved.version, 'string');
  assert.deepEqual(saved.value, { completed: ['rescue-01'] });
  assert.deepEqual(await host.storage.read('progress'), saved);
  assert.deepEqual(await createLocalHost(storage).storage.read('progress'), saved);
  assert.equal(await host.storage.read('other-key'), null);
  assert.ok(storage.records.has('cage-rescue:host:progress'));
});

test('storage snapshots are isolated from mutations to the input or returned reads', async () => {
  const host = createLocalHost(localStorageFixture());
  const input = { settings: { sound: true }, completed: ['rescue-01'] };
  await host.storage.write('progress', input);
  input.settings.sound = false;
  input.completed.push('rescue-02');
  const read = await host.storage.read('progress');
  assert.deepEqual(read.value, { settings: { sound: true }, completed: ['rescue-01'] });
  read.value.completed.length = 0;
  assert.deepEqual((await host.storage.read('progress')).value.completed, ['rescue-01']);
});

test('optimistic version conflicts reject stale updates without overwriting the current record', async () => {
  const storage = localStorageFixture();
  const host = createLocalHost(storage);
  await assert.rejects(host.storage.write('progress', { value: 0 }, 'missing'), {
    code: 'CONFLICT',
  });
  const initial = await host.storage.write('progress', { value: 1 }, null);
  const updated = await host.storage.write('progress', { value: 2 }, initial.version);
  assert.notEqual(updated.version, initial.version);
  await assert.rejects(host.storage.write('progress', { value: 3 }, initial.version), {
    code: 'CONFLICT',
  });
  await assert.rejects(host.storage.write('progress', { value: 4 }, null), { code: 'CONFLICT' });
  assert.deepEqual(await host.storage.read('progress'), updated);
  assert.deepEqual(await createLocalHost(storage).storage.read('progress'), updated);
});

test('disabled storage reports unavailability while retaining and versioning progress for this session', async () => {
  const host = createLocalHost(null);
  await assert.rejects(host.storage.write('progress', { cleared: 1 }, null), {
    code: 'UNAVAILABLE',
  });
  const first = await host.storage.read('progress');
  assert.deepEqual(first.value, { cleared: 1 });
  await assert.rejects(host.storage.write('progress', { cleared: 2 }, first.version), {
    code: 'UNAVAILABLE',
  });
  const second = await host.storage.read('progress');
  assert.deepEqual(second.value, { cleared: 2 });
  assert.notEqual(second.version, first.version);
  await assert.rejects(host.storage.write('progress', { cleared: 3 }, first.version), {
    code: 'CONFLICT',
  });
  assert.deepEqual((await host.storage.read('progress')).value, { cleared: 2 });
  assert.equal(await createLocalHost(null).storage.read('progress'), null);
});

test('storage access exceptions still allow session-only progress', async () => {
  const host = createLocalHost({
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('SecurityError');
    },
  });
  assert.equal(await host.storage.read('progress'), null);
  await assert.rejects(host.storage.write('progress', { cleared: 1 }), { code: 'UNAVAILABLE' });
  assert.deepEqual((await host.storage.read('progress')).value, { cleared: 1 });
});

test('a failed write keeps the newer session record even when stale persisted data is still readable', async () => {
  const storage = localStorageFixture();
  const host = createLocalHost(storage);
  const initial = await host.storage.write('progress', { cleared: 1 });
  storage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  await assert.rejects(host.storage.write('progress', { cleared: 2 }, initial.version), {
    code: 'UNAVAILABLE',
  });
  const current = await host.storage.read('progress');
  assert.deepEqual(current.value, { cleared: 2 });
  assert.notEqual(current.version, initial.version);
  await assert.rejects(host.storage.write('progress', { cleared: 3 }, current.version), {
    code: 'UNAVAILABLE',
  });
  assert.deepEqual((await host.storage.read('progress')).value, { cleared: 3 });
  assert.deepEqual((await createLocalHost(storage).storage.read('progress')).value, { cleared: 1 });
});

test('malformed persisted records degrade to no save and can be replaced', async () => {
  for (const raw of ['{broken', 'null', '42', '{"version":7,"value":{}}', '{"version":"v1"}']) {
    const storage = localStorageFixture();
    storage.records.set('cage-rescue:host:progress', raw);
    const host = createLocalHost(storage);
    assert.equal(await host.storage.read('progress'), null);
    const replacement = await host.storage.write('progress', { cleared: 1 }, null);
    assert.deepEqual(await host.storage.read('progress'), replacement);
  }
});

test('the default local ad port cannot grant a rewarded continuation', async () => {
  const host = createLocalHost(null);
  assert.equal(host.session.adAuthority, 'none');
  assert.deepEqual(await host.ads.offer({ placement: 'revive', reward: 'extra-ball' }), {
    status: 'unavailable',
  });
  assert.deepEqual(await host.ads.offer(), { status: 'unavailable' });
});
