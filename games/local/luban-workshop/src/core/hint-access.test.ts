import test from 'node:test';
import assert from 'node:assert/strict';
import {
  requestHintAccess,
  type HintAccessRequest,
  type HintHost,
  type HintRewardOpportunity,
} from './hint-access.ts';

const request: HintAccessRequest = {
  levelId: 'burr-one',
  phase: 'disassemble',
  action: 'move',
};
const hostWith = (offer: NonNullable<HintHost['ads']>['offer']): HintHost => ({
  session: { capabilities: ['advertising'] },
  ads: { offer },
});

test('standalone hints are explicitly free and cancellation still prevents access', async () => {
  for (const host of [undefined, null])
    assert.deepEqual(await requestHintAccess(host, request), { status: 'granted', source: 'free' });
  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(await requestHintAccess(undefined, request, { signal: controller.signal }), {
    status: 'dismissed',
  });
});

test('a supplied host must declare advertising and implement its offer port', async () => {
  const offer = async () => assert.fail('unavailable advertising must not be invoked');
  for (const host of [
    {},
    { ads: { offer } },
    { session: { capabilities: [] }, ads: { offer } },
    { session: { capabilities: ['advertising'] } },
  ])
    assert.deepEqual(await requestHintAccess(host, request), { status: 'unavailable' });
});

test('both puzzle goals have stable opportunities carrying only one requested action', async () => {
  const requests: HintRewardOpportunity[] = [];
  const host = hostWith(async (opportunity) => {
    requests.push(opportunity);
    return { status: 'completed' };
  });
  for (const phase of ['disassemble', 'reassemble'] as const)
    assert.deepEqual(await requestHintAccess(host, { ...request, phase, action: 'rotate' }), {
      status: 'granted',
      source: 'reward',
    });
  assert.deepEqual(
    requests,
    ['disassemble', 'reassemble'].map((phase) => ({
      id: `luban-workshop.hint.${phase}`,
      reward: { levelId: request.levelId, phase, action: 'rotate', steps: 1 },
    })),
  );
});

test('only strict completion grants access; dismissed, unavailable and failed do not', async () => {
  for (const status of ['dismissed', 'unavailable', 'failed'])
    assert.deepEqual(
      await requestHintAccess(
        hostWith(async () => ({ status })),
        request,
      ),
      {
        status,
      },
    );
  for (const result of [
    undefined,
    null,
    true,
    'completed',
    { status: 'Completed' },
    { completed: true },
    { status: 'granted', source: 'free' },
  ])
    assert.deepEqual(
      await requestHintAccess(
        hostWith(async () => result),
        request,
      ),
      {
        status: 'failed',
      },
    );
});

test('invalid opportunities do not invoke the host or grant standalone access', async () => {
  const host = hostWith(async () => assert.fail('invalid request must not be offered'));
  for (const invalid of [
    { ...request, levelId: ' ' },
    { ...request, phase: 'unknown' },
    { ...request, action: 'unknown' },
  ])
    for (const target of [host, undefined])
      assert.deepEqual(await requestHintAccess(target, invalid as HintAccessRequest), {
        status: 'failed',
      });
});

test('provider throws, rejections and timeouts fail without granting free fallback', async () => {
  for (const offer of [
    () => {
      throw new Error('SDK missing');
    },
    async () => {
      throw new Error('SDK rejected');
    },
    () => new Promise(() => {}),
  ])
    assert.deepEqual(await requestHintAccess(hostWith(offer), request, { timeoutMs: 5 }), {
      status: 'failed',
    });
});

test('cancellation before access does not invoke the host', async () => {
  const controller = new AbortController();
  controller.abort();
  const host = hostWith(async () => assert.fail('cancelled access must not invoke host'));
  assert.deepEqual(await requestHintAccess(host, request, { signal: controller.signal }), {
    status: 'dismissed',
  });
});

test('late completion or rejection cannot grant a cancelled hint', async () => {
  for (const rejectLate of [false, true]) {
    const controller = new AbortController();
    let finish!: (value: unknown) => void;
    let fail!: (reason: Error) => void;
    const host = hostWith(
      () =>
        new Promise((resolve, reject) => {
          finish = resolve;
          fail = reject;
        }),
    );
    const access = requestHintAccess(host, request, { signal: controller.signal });
    controller.abort();
    assert.deepEqual(await access, { status: 'dismissed' });
    if (rejectLate) fail(new Error('Late SDK error'));
    else finish({ status: 'completed' });
    await Promise.resolve();
    assert.deepEqual(await access, { status: 'dismissed' });
  }
});

test('simultaneous host completion and abort never grants a cancelled hint', async () => {
  const controller = new AbortController();
  const host = hostWith(() => {
    controller.abort();
    return Promise.resolve({ status: 'completed' });
  });
  assert.deepEqual(await requestHintAccess(host, request, { signal: controller.signal }), {
    status: 'dismissed',
  });
});
