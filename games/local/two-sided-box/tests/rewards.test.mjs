import test from 'node:test';
import assert from 'node:assert/strict';
import { canOfferReward, offerFaceReward } from '../rewards.mjs';

const hostWith = (offer) => ({ session: { capabilities: ['advertising'] }, ads: { offer } });

test('an explicit advertising capability and offer port are both required', async () => {
  const offer = () => {
    assert.fail('an unavailable advertising port must not be invoked');
  };
  for (const host of [
    undefined,
    {},
    { ads: { offer } },
    { session: { capabilities: [] }, ads: { offer } },
    { session: { capabilities: ['advertising'] } },
  ]) {
    assert.equal(canOfferReward(host), false);
    assert.deepEqual(await offerFaceReward(host, 'left'), { status: 'unavailable' });
  }
  assert.equal(canOfferReward(hostWith(offer)), true);
});

test('only a strict completed host outcome completes a face reward', async () => {
  for (const status of ['completed', 'dismissed', 'unavailable', 'failed']) {
    let request;
    const host = hostWith(async (opportunity) => {
      request = opportunity;
      return { status, ignoredHostMetadata: true };
    });
    assert.deepEqual(await offerFaceReward(host, 'top'), { status });
    assert.deepEqual(request, {
      id: 'two-sided-box.reveal-face',
      reward: { face: 'top', faces: 1 },
    });
  }
  for (const result of [
    undefined,
    null,
    true,
    'completed',
    { status: 'Completed' },
    { completed: true },
  ]) {
    assert.deepEqual(
      await offerFaceReward(
        hostWith(async () => result),
        'top',
      ),
      { status: 'failed' },
    );
  }
});

test('invalid faces do not request a reward', async () => {
  const host = hostWith(() => assert.fail('unknown face should not request advertising'));
  assert.deepEqual(await offerFaceReward(host, 'unknown'), { status: 'unavailable' });
});

test('provider exceptions, rejections, and timeouts fail without granting a reward', async () => {
  for (const offer of [
    () => {
      throw new Error('Provider unavailable');
    },
    async () => {
      throw new Error('Provider rejected');
    },
    () => new Promise(() => {}),
  ]) {
    assert.deepEqual(await offerFaceReward(hostWith(offer), 'left', { timeoutMs: 5 }), {
      status: 'failed',
    });
  }
});

test('a request cancelled before it starts never invokes the advertising host', async () => {
  const controller = new AbortController();
  controller.abort();
  const host = hostWith(() => assert.fail('an aborted request must not show advertising'));
  assert.deepEqual(await offerFaceReward(host, 'back', { signal: controller.signal }), {
    status: 'dismissed',
  });
});

test('cancelling a pending request dismisses it and ignores a late completion or rejection', async () => {
  for (const lateStatus of ['completed', 'rejected']) {
    const controller = new AbortController();
    let finish;
    let fail;
    const host = hostWith(
      () =>
        new Promise((resolve, reject) => {
          finish = resolve;
          fail = reject;
        }),
    );
    const request = offerFaceReward(host, 'bottom', { signal: controller.signal });
    controller.abort();
    assert.deepEqual(await request, { status: 'dismissed' });
    if (lateStatus === 'completed') finish({ status: 'completed' });
    else fail(new Error('Advertising ended after cancellation'));
    await Promise.resolve();
    assert.deepEqual(await request, { status: 'dismissed' });
  }
});

test('a simultaneous completed response and abort never grants a cancelled observation', async () => {
  const controller = new AbortController();
  const host = hostWith(() => {
    controller.abort();
    return Promise.resolve({ status: 'completed' });
  });
  assert.deepEqual(await offerFaceReward(host, 'right', { signal: controller.signal }), {
    status: 'dismissed',
  });
});
