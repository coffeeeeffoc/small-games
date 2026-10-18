import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'vitest';

const source = await readFile(new URL('../../competition/client.js', import.meta.url), 'utf8');
function client() {
  const requests = [];
  const writes = [];
  const storage = new Map();
  const sdk = {
    login() {
      assert.equal(this, sdk);
      assert.fail('Anonymous service must not invoke tt.login');
    },
    getStorageSync(key) {
      return storage.get(key);
    },
    setStorageSync(key, value) {
      writes.push({ key, value });
      storage.set(key, value);
    },
    request(options) {
      assert.equal(this, sdk);
      requests.push(options);
      options.success({
        statusCode: 200,
        data: {
          playerId: 'server-player',
          game: 'cops-robbers',
          identityKind: 'guest',
          sessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          token: 'a'.repeat(64),
          refreshToken: 'b'.repeat(64),
          expiresAt: Date.now() + 900000,
          refreshExpiresAt: Date.now() + 180 * 86400000,
        },
      });
    },
  };
  const context = vm.createContext({ Date, console, setTimeout, clearTimeout });
  vm.runInContext(source, context);
  context.__installCompetition(
    {
      platform: 'douyin',
      game: 'cops-robbers',
      appId: 'tt-test-app',
      apiUrl: 'https://api.game.test/api/competition/v1',
    },
    sdk,
  );
  return { api: context.__competition, requests, writes };
}

test('native client automatically creates a scoped anonymous identity once for concurrent callers', async () => {
  const { api, requests, writes } = client();
  const [first, concurrent] = await Promise.all([api.session(), api.session()]);
  assert.equal(first.playerId, 'server-player');
  assert.equal(first, concurrent);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.game.test/api/competition/v1/sessions/guest');
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0].data)), {
    game: 'cops-robbers',
  });
  assert.equal(requests[0].timeout, 8000);
  assert.equal(
    writes[0].key,
    'competition-session-v3:' +
      encodeURIComponent(
        'https://api.game.test/api/competition/v1|douyin|tt-test-app|cops-robbers',
      ),
  );
  assert.equal(writes[0].value.includes('single-use-tt-code'), false);
});

test('repeated service use needs no platform login and reuses the issued identity', async () => {
  const { api, requests } = client();
  const first = await api.session();
  assert.equal((await api.session()).token, first.token);
  assert.equal(requests.length, 1);
});
