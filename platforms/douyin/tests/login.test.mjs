import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'vitest';

const source = await readFile(new URL('../../competition/client.js', import.meta.url), 'utf8');
function client(result) {
  const requests = [];
  const writes = [];
  const sdk = {
    login(options) {
      assert.equal(this, sdk);
      options.success(result);
    },
    getStorageSync() {
      return '';
    },
    setStorageSync(key, value) {
      writes.push({ key, value });
    },
    request(options) {
      assert.equal(this, sdk);
      requests.push(options);
      options.success({
        statusCode: 200,
        data: { playerId: 'server-player', token: 'a'.repeat(64), expiresAt: Date.now() + 3600000 },
      });
    },
  };
  const context = vm.createContext({ Date, console });
  vm.runInContext(source, context);
  context.__installCompetition(
    {
      platform: 'douyin',
      appId: 'tt-test-app',
      apiUrl: 'https://api.game.test/api/competition/v1',
    },
    sdk,
  );
  return { api: context.__competition, requests, writes };
}

test('existing native client sends authenticated tt.login code and caches only service credentials', async () => {
  const { api, requests, writes } = client({
    code: 'single-use-tt-code',
    anonymous_code: 'not-a-verified-code',
  });
  const [first, concurrent] = await Promise.all([api.session(), api.session()]);
  assert.equal(first.playerId, 'server-player');
  assert.equal(first, concurrent);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.game.test/api/competition/v1/sessions/platform');
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0].data)), {
    platform: 'douyin',
    appId: 'tt-test-app',
    code: 'single-use-tt-code',
  });
  assert.equal(requests[0].timeout, 8000);
  assert.equal(writes[0].key, 'competition-session-v1:douyin:tt-test-app');
  assert.equal(writes[0].value.includes('single-use-tt-code'), false);
});

test('an anonymous-only tt.login result is rejected before contacting the service', async () => {
  const { api, requests, writes } = client({ anonymous_code: 'anonymous-only' });
  await assert.rejects(api.session(), { code: 'PLATFORM_LOGIN_FAILED' });
  assert.equal(requests.length, 0);
  assert.equal(writes.length, 0);
});
