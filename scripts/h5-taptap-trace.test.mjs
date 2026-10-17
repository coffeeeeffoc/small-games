import test from 'node:test';
import assert from 'node:assert/strict';
import {
  traceEvent,
  safeFailure,
  safeUrl,
  safeApiPath,
  publicMatchEvidence,
  safeDatabaseFailure,
} from './h5-taptap-trace.mjs';
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
    duplicateActionsPreserveSettlement: true,
    results: [
      { ...row, rated: true, result: { score: 1, secondary: 2, privateCanary: 'PRIVATE_CANARY' } },
    ],
    boards: [{ me: row, secret: 'PRIVATE_CANARY' }],
  });
  assert(!JSON.stringify(evidence).includes('PRIVATE_CANARY'));
  assert.equal(evidence.standings[0].userId, row.userId);
});
