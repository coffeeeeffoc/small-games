import test from 'node:test';
import assert from 'node:assert/strict';
import {
  traceEvent,
  safeFailure,
  safeUrl,
  safeApiPath,
  publicMatchEvidence,
  safeDatabaseFailure,
  safeTouchProgress,
  safeStreetTouchFrame,
} from './h5-taptap-trace.mjs';
test('touch progress exposes a finite phase and sequence without action or credentials', () => {
  const expected = {
    sent: true,
    completed: false,
    request: { seq: 7, action: 'PRIVATE_CANARY', token: 'PRIVATE_CANARY' },
  };
  assert.deepEqual(safeTouchProgress('response-wait', expected), {
    phase: 'response-wait',
    sent: true,
    completed: false,
    seq: 7,
  });
  assert.deepEqual(safeTouchProgress('PRIVATE_CANARY', { request: { seq: 'PRIVATE_CANARY' } }), {
    sent: false,
    completed: false,
  });
  assert(!JSON.stringify(safeTouchProgress('target-tap', expected)).includes('PRIVATE_CANARY'));
});
test('trace is an exact whitelist, including nested secrets, SQL, URL query and userinfo canaries', () => {
  const secret = 'PRIVATE_CANARY';
  const event = traceEvent({
    variant: 'cops-robbers-ads-on-service-on',
    player: 'a',
    kind: 'response',
    method: 'POST',
    path: `http://user:${secret}@localhost/api/competition/v1/sessions/guest?token=${secret}#${secret}`,
    status: 200,
    userId: '12345678-1234-1234-1234-123456789012',
    body: { token: secret, profile: { subject: secret } },
    headers: { authorization: secret },
    message: secret,
    stack: secret,
    SQL: secret,
  });
  assert.deepEqual(Object.keys(event), [
    'at',
    'variant',
    'player',
    'kind',
    'method',
    'path',
    'status',
    'userId',
  ]);
  assert(!JSON.stringify(event).includes(secret));
  assert.equal(event.path, '/api/competition/v1/sessions/guest');
  assert.equal(
    safeUrl(`https://name:${secret}@example.test/api/competition/v1/me?x=${secret}#x`),
    'https://example.test/api/competition/v1/me',
  );
  assert.equal(safeApiPath(`/api/competition/v1/${secret}`), '/[unrecognized]');
  assert.deepEqual(safeFailure({ message: secret, stack: secret, code: secret }), {
    code: 'QA_FAILED',
  });
  assert.equal(safeUrl('javascript:PRIVATE_CANARY'), '[invalid-url]');
});
test('failure diagnostics retain bounded known locations and database codes only', () => {
  const secret = 'PRIVATE_CANARY';
  assert.deepEqual(
    safeFailure({
      code: 'ERR_ASSERTION',
      message: secret,
      stack: `Error: ${secret}\n    at touchAction (file:///private/${secret}/h5-taptap.browser.mjs:351:12)\n    at ${secret}`,
    }),
    { code: 'ASSERTION_FAILED', location: 'h5-taptap.browser.mjs:351:12' },
  );
  for (const frame of [
    `at file:///private/${secret}.mjs:10:2`,
    `at file:///private/h5-taptap.browser.mjs:10:2?${secret}`,
    'at file:///private/h5-taptap.browser.mjs:1234567:2',
  ])
    assert.deepEqual(safeFailure({ stack: `Error\n${frame}` }), { code: 'QA_FAILED' });
  assert.deepEqual(
    safeDatabaseFailure({ cause: { code: '40P01', query: secret, message: secret } }),
    { code: '40P01' },
  );
  const cyclic = { code: secret, message: secret };
  const failure = safeDatabaseFailure({
    query: `select data from runtime.competition_rooms where code='${secret}' for update`,
    cause: { code: '57014', detail: secret },
  });
  assert.deepEqual(failure, { code: '57014', phase: 'room-lock' });
  assert.deepEqual(
    safeDatabaseFailure(failure),
    failure,
    'IPC projection preserves only a known phase',
  );
  assert.deepEqual(safeDatabaseFailure({ code: '57014', phase: secret }), { code: '57014' });
  assert(!JSON.stringify(failure).includes(secret));
  cyclic.cause = cyclic;
  assert.deepEqual(safeDatabaseFailure(cyclic), { code: 'UNCLASSIFIED' });
  assert.equal(traceEvent({ errorCode: 'SERVICE_UNAVAILABLE' }).errorCode, 'SERVICE_UNAVAILABLE');
});
test('public match evidence never spreads response bodies or private linkage', () => {
  const row = {
    userId: '12345678-1234-1234-1234-123456789012',
    playerId: '12345678-1234-1234-1234-123456789012',
    score: 1,
    secondary: 2,
    rank: 3,
    subject: 'PRIVATE_CANARY',
    token: 'PRIVATE_CANARY',
  };
  const evidence = publicMatchEvidence({
    roomCode: 'AABBCCDDEEFF',
    playerIds: [row.userId],
    acceptedTouchActions: [2],
    confirmedBlockedRouteInputs: [
      [
        {
          seq: 2,
          status: 422,
          error: 'ILLEGAL_ACTION',
          sequenceUnchanged: true,
          terminal: false,
          recoveredUsingUI: true,
          token: 'PRIVATE_CANARY',
          recovery: { seq: 2, status: 200, actor: 0, type: 'move', token: 'PRIVATE_CANARY' },
        },
        {
          seq: 3,
          status: 422,
          error: 'ILLEGAL_ACTION',
          recovery: { seq: 4, status: 200, actor: 0, type: 'PRIVATE_CANARY' },
        },
      ],
    ],
    observedStaleTouchCounts: [2, 'PRIVATE_CANARY', 99],
    observedStaleTouches: [
      Array.from({ length: 25 }, () => ({
        seq: 3,
        plannedSeq: 3,
        serverNow: 1001,
        afterServerNow: 1001,
        selectedBefore: 1,
        selectedAfter: 0,
        busyBefore: false,
        busyAfter: false,
        trusted: true,
        pointerType: 'touch',
        token: 'PRIVATE_CANARY',
        headers: { authorization: 'PRIVATE_CANARY' },
      })),
    ],
    duplicateActionsPreserveSettlement: true,
    results: [
      { ...row, rated: true, result: { score: 1, secondary: 2, privateCanary: 'PRIVATE_CANARY' } },
    ],
    boards: [{ me: row, secret: 'PRIVATE_CANARY' }],
  });
  assert(!JSON.stringify(evidence).includes('PRIVATE_CANARY'));
  assert.equal(evidence.standings[0].userId, row.userId);
  assert.deepEqual(evidence.confirmedBlockedRouteInputs[0][0].recovery, {
    seq: 2,
    status: 200,
    actor: 0,
    type: 'move',
  });
  assert.equal(evidence.confirmedBlockedRouteInputs[0][1].recovery, undefined);
  assert.deepEqual(evidence.observedStaleTouchCounts, [2, 0]);
  assert.equal(evidence.observedStaleTouches[0].length, 24);
  assert.equal(evidence.observedStaleTouches[0][0].selectedAfter, 0);
  assert.equal(evidence.observedStaleTouches[0][0].busyAfter, false);
  assert.deepEqual(
    safeStreetTouchFrame({
      seq: 'PRIVATE_CANARY',
      x: NaN,
      serverNow: Infinity,
      ordinal: -1,
      trusted: 'PRIVATE_CANARY',
      pointerType: 'PRIVATE_CANARY',
      action: 'PRIVATE_CANARY',
    }),
    {},
  );
});
