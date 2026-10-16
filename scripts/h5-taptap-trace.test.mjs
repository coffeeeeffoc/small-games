import test from 'node:test';
import assert from 'node:assert/strict';
import {
  traceEvent,
  safeFailure,
  safeUrl,
  safeApiPath,
  publicMatchEvidence,
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
