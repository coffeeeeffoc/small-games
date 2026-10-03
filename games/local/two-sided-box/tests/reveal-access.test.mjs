import test from 'node:test';
import assert from 'node:assert/strict';
import { createRevealAccess } from '../reveal-access.mjs';

const face = { kind: 'face', levelId: 'first-turn', face: 'left' };
const structure = { kind: 'structure', levelId: 'first-turn' };
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
};

test('additional faces and full structure are free without an injected provider', async () => {
  const access = createRevealAccess();
  assert.equal(access.pending, false);
  assert.deepEqual(await access.request(face), { granted: true });
  assert.deepEqual(await access.request(structure), { granted: true });
  assert.equal(access.pending, false);
});

test('only explicit boolean grants unlock an observation', async () => {
  for (const result of [undefined, null, true, false, 1, {}, { granted: 1 }, { granted: 'true' }]) {
    const access = createRevealAccess({ provider: () => result });
    assert.deepEqual(await access.request(face), { granted: false, reason: 'denied' });
  }
  const access = createRevealAccess({ provider: () => ({ granted: false, reason: 'dismissed' }) });
  assert.deepEqual(await access.request(structure), { granted: false, reason: 'dismissed' });
});

test('a repeated tap cannot start another pending authorization', async () => {
  const completion = deferred();
  let calls = 0;
  const access = createRevealAccess({
    provider: (request, { signal }) => {
      calls += 1;
      assert.deepEqual(request, face);
      assert.equal(signal.aborted, false);
      return completion.promise;
    },
  });
  const first = access.request(face);
  assert.equal(access.pending, true);
  assert.deepEqual(await access.request(structure), { granted: false, reason: 'busy' });
  assert.equal(calls, 1);
  completion.resolve({ granted: true });
  assert.deepEqual(await first, { granted: true });
  assert.equal(access.pending, false);
});

test('a failed provider does not grant access or prevent a retry', async () => {
  for (const provider of [
    () => {
      throw new Error('Unavailable');
    },
    async () => {
      throw new Error('Network failed');
    },
  ]) {
    const access = createRevealAccess({ provider });
    assert.deepEqual(await access.request(face), { granted: false, reason: 'provider-error' });
    assert.equal(access.pending, false);
    assert.deepEqual(await access.request(face), { granted: false, reason: 'provider-error' });
  }
});

test('leaving a level aborts a request even if the provider never settles', async () => {
  let providerSignal;
  const access = createRevealAccess({
    provider: (_request, { signal }) => {
      providerSignal = signal;
      return new Promise(() => {});
    },
  });
  const pending = access.request(face);
  await Promise.resolve();
  assert.equal(access.invalidate(), true);
  assert.equal(providerSignal.aborted, true);
  assert.deepEqual(await pending, { granted: false, reason: 'cancelled' });
  assert.equal(access.pending, false);
  assert.equal(access.invalidate(), false);
});

test('an old completion cannot grant access or clear the next level pending request', async () => {
  const old = deferred();
  const next = deferred();
  let calls = 0;
  const access = createRevealAccess({
    provider: () => (calls++ === 0 ? old.promise : next.promise),
  });
  const oldRequest = access.request(face);
  await Promise.resolve();
  access.cancel();
  const nextRequest = access.request({ ...structure, levelId: 'another-box' });
  old.resolve({ granted: true });
  assert.deepEqual(await oldRequest, { granted: false, reason: 'cancelled' });
  assert.equal(access.pending, true);
  assert.deepEqual(await access.request(face), { granted: false, reason: 'busy' });
  next.resolve({ granted: true });
  assert.deepEqual(await nextRequest, { granted: true });
});

test('late rejection after cancellation is handled without unlocking anything', async () => {
  const completion = deferred();
  const access = createRevealAccess({ provider: () => completion.promise });
  const pending = access.request(structure);
  await Promise.resolve();
  access.invalidate();
  completion.reject(new Error('Provider closed late'));
  assert.deepEqual(await pending, { granted: false, reason: 'cancelled' });
  assert.equal(access.pending, false);
});

test('cancelling before the provider starts avoids invoking it', async () => {
  let calls = 0;
  const access = createRevealAccess({
    provider: () => {
      calls += 1;
      return { granted: true };
    },
  });
  const pending = access.request(face);
  access.cancel();
  assert.deepEqual(await pending, { granted: false, reason: 'cancelled' });
  assert.equal(calls, 0);
});

test('invalid requests fail before contacting the provider', async () => {
  let calls = 0;
  const access = createRevealAccess({ provider: () => calls++ });
  for (const request of [undefined, {}, { kind: 'ad', levelId: 'one' }, { kind: 'face' }]) {
    assert.deepEqual(await access.request(request), { granted: false, reason: 'invalid-request' });
  }
  assert.equal(calls, 0);
  assert.throws(() => createRevealAccess({ provider: {} }), TypeError);
});
