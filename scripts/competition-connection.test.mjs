import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = await readFile(
  new URL('../platforms/competition/client.js', import.meta.url),
  'utf8',
);
function fixture({ cached = true, fail = 'transport' } = {}) {
  let mode = fail;
  const credential = JSON.stringify({
    token: 'a'.repeat(64),
    refreshToken: 'b'.repeat(64),
    identityKind: 'guest',
    game: 'cops-robbers',
    userId: 'player',
    sessionId: '10000000-0000-4000-8000-000000000001',
    refreshExpiresAt: Date.now() + 86400000,
    apiAuthority:
      'https://PRIVATE_USER:PRIVATE_PASSWORD@api.example.test/small-games/v1?PRIVATE_API_QUERY#PRIVATE_API_HASH|h5||cops-robbers',
    expiresAt: Date.now() + 3600000,
  });
  const context = {
    URL,
    AbortSignal,
    setTimeout,
    clearTimeout,
    location: { href: 'https://ma-h5-al.tapimg.com/h/game/index.html?PRIVATE_QUERY#PRIVATE_HASH' },
    localStorage: { getItem: () => (cached ? credential : null), setItem() {} },
    fetch: async () => {
      if (mode === 'transport') throw new Error('PRIVATE_RAW_ERROR');
      return {
        status: mode === 'http' ? 403 : 200,
        json: async () => {
          if (mode === 'response') throw new Error('PRIVATE_RESPONSE');
          return { error: 'PRIVATE_BODY' };
        },
      };
    },
  };
  runInNewContext(source, context);
  context.__installCompetition({
    platform: 'h5',
    game: 'cops-robbers',
    apiUrl:
      'https://PRIVATE_USER:PRIVATE_PASSWORD@api.example.test/small-games/v1?PRIVATE_API_QUERY#PRIVATE_API_HASH',
  });
  return {
    client: context.__competition,
    mode(value) {
      mode = value;
    },
  };
}
const plain = (value) => JSON.parse(JSON.stringify(value));
test('request diagnostics retain only fixed safe fields for their own error', async () => {
  const f = fixture();
  let first;
  for (const phase of ['transport', 'response', 'http']) {
    f.mode(phase);
    const error = await f.client.request('/me?PRIVATE_PATH_QUERY').catch((value) => value);
    const info = plain(f.client.connectionInfo(error));
    assert.deepEqual(info, {
      pageOrigin: 'https://ma-h5-al.tapimg.com',
      apiBase: 'https://api.example.test/small-games/v1',
      stage: `request_${phase}`,
      method: 'GET',
      headerNames: ['content-type', 'authorization'],
    });
    assert(!JSON.stringify(info).includes('PRIVATE'));
    if (!first) first = error;
  }
  assert.equal(
    f.client.connectionInfo(first).stage,
    'request_transport',
    'later errors cannot replace an earlier snapshot',
  );
  assert.equal(f.client.connectionInfo(new Error('PRIVATE_FORGED')), null);
  assert(Object.isFrozen(f.client.connectionInfo(first)));
  assert(Object.isFrozen(f.client.connectionInfo(first).headerNames));
});
test('automatic identity failure identifies the session stage without claiming CORS', async () => {
  const f = fixture({ cached: false });
  const error = await f.client.session().catch((value) => value);
  const info = plain(f.client.connectionInfo(error));
  assert.equal(info.stage, 'session_transport');
  assert.equal(info.method, 'POST');
  assert.deepEqual(info.headerNames, ['content-type']);
  assert(!JSON.stringify(info).includes('PRIVATE'));
  assert(!JSON.stringify(info).includes('CORS'));
});
