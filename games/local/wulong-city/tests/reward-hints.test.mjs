import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../reward-hints.js', import.meta.url), 'utf8');
function create(options) {
  const context = vm.createContext({ setTimeout, clearTimeout });
  vm.runInContext(source, context);
  return context.WulongRewardHints(options);
}
test('only completion grants 30 play seconds; paused time is not consumed', async () => {
  for (const status of ['dismissed', 'unavailable', 'failed', 'completed', 'unknown']) {
    const guide = create({ provider: { show: async () => ({ status }) } });
    await guide.offer();
    assert.equal(guide.remaining, status === 'completed' ? 30 : 0);
    guide.tick(1.25);
    assert.equal(guide.remaining, status === 'completed' ? 28.75 : 0);
    guide.tick(-10); guide.tick(NaN);
    assert.equal(guide.remaining, status === 'completed' ? 28.75 : 0);
    guide.tick(60); assert.equal(guide.remaining, 0);
  }
});
test('duplicate requests and active rewards never re-enter provider', async () => {
  let complete, calls = 0;
  const guide = create({ provider: { show: () => { calls++; return new Promise(resolve => complete = resolve); } } });
  const first = guide.offer();
  assert.equal((await guide.offer()).status, 'unavailable');
  complete({ status: 'completed' });
  await first;
  assert.equal((await guide.offer()).status, 'unavailable');
  assert.equal(calls, 1);
});
test('cancel/reset/timeout ignore late rewards and keep a pending provider single-flight', async () => {
  for (const operation of ['cancel', 'reset', 'timeout']) {
    let complete;
    const guide = create({ timeoutMs: 10, provider: { show: () => new Promise(resolve => complete = resolve) } });
    const first = guide.offer();
    await Promise.resolve();
    if (operation !== 'timeout') guide[operation]();
    await first;
    assert.equal(guide.remaining, 0);
    assert.equal((await guide.offer()).status, 'unavailable');
    complete({ status: 'completed' });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(guide.remaining, 0);
  }
});
test('immediate cancellation does not start a queued ad', async () => {
  let calls = 0;
  const guide = create({ provider: { show: () => { calls++; return { status: 'completed' }; } } });
  const first = guide.offer(); guide.cancel(); await first;
  assert.equal(calls, 0); assert.equal(guide.remaining, 0);
});
test('absent and throwing providers never block free play', async () => {
  assert.equal((await create().offer()).status, 'unavailable');
  const guide = create({ provider: { show() { throw new Error('SDK unavailable'); } } });
  assert.equal((await guide.offer()).status, 'failed');
  assert.equal(guide.pending, false);
});
