import assert from 'node:assert/strict';
import './competition-connection.test.mjs';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import realtimeRule from '../services/runtime-api/rules/realtime.mjs';
const source = await readFile(
  new URL('../platforms/competition/client.js', import.meta.url),
  'utf8',
);
const versions = {
  'cops-robbers': ['roles-initiative-duel-v2', ['escape', 'survival']],
  'cops-robbers-realtime': [realtimeRule.version, ['classic', 'escape']],
};
for (const [game, [version, modes]] of Object.entries(versions))
  for (const platform of ['h5', 'wechat', 'bilibili', 'douyin', 'kuaishou']) {
    let metadata = { version: 'old-race-v1' },
      roomVersion = version,
      leaveError;
    const writes = [],
      token = JSON.stringify({
        token: 'a'.repeat(64),
        refreshToken: 'b'.repeat(64),
        sessionId: '10000000-0000-4000-8000-000000000001',
        userId: 'player',
        game,
        identityKind: platform === 'h5' ? 'guest' : 'platform',
        apiAuthority: `https://test.invalid/api/competition/v1|${platform}|test-app|${game}`,
        refreshExpiresAt: Date.now() + 86400000,
        expiresAt: Date.now() + 3600000,
      });
    const response = (url, method) => {
      const path = new URL(url).pathname;
      if (path.includes('/boards/')) return metadata;
      if (method === 'POST') writes.push(path);
      if (path.endsWith('/leave') && leaveError) return { error: leaveError };
      return { game, version: roomVersion, roles: ['pursuer', 'runner'] };
    };
    const status = (url) => (url.endsWith('/leave') && leaveError ? 409 : 200);
    const sdk = {
      login: () => assert.fail('Valid cached platform session must not relogin'),
      getStorageSync: () => token,
      request: ({ url, method, success }) =>
        success({ statusCode: status(url), data: response(url, method) }),
    };
    const context = {
      setTimeout,
      clearTimeout,
      localStorage: { getItem: () => token },
      wx: sdk,
      bl: sdk,
      tt: sdk,
      ks: sdk,
      AbortSignal: { timeout: () => undefined },
      fetch: async (url, init) => ({
        status: status(url),
        json: async () => response(url, init.method),
      }),
    };
    runInNewContext(source, context);
    context.__installCompetition({
      game,
      platform,
      appId: 'test-app',
      apiUrl: 'https://test.invalid/api/competition/v1',
    });
    const client = context.__competition;
    for (const path of ['/boards/' + game, '/rooms', '/rooms/join', '/rooms/ABCDEFABCDEF']) {
      await assert.rejects(
        client.request(
          path,
          path === '/rooms' || path.endsWith('/join')
            ? { body: JSON.stringify({ game }) }
            : undefined,
        ),
        /好友服务正在更新/,
      );
    }
    assert.deepEqual(writes, [], 'incompatible service must receive no room mutations');
    metadata = { version, roles: ['pursuer', 'runner'], modes: modes.map((id) => ({ id })) };
    await client.request('/rooms', { body: JSON.stringify({ game }) });
    assert.equal(writes.length, 1, 'compatible service accepts a room after retry');
    roomVersion = 'old-race-v1';
    await assert.rejects(client.request('/rooms/ABCDEFABCDEF'), /好友服务正在更新/);
    leaveError = 'RULE_VERSION_CHANGED';
    const discarded = await client.request('/rooms/ABCDEFABCDEF/leave', { body: '{}' });
    assert.equal(discarded.obsolete, true, 'explicit server invalidation clears local recovery');
    assert.equal(writes.length, 2, 'exiting an obsolete room remains available');
    leaveError = 'SERVICE_UNAVAILABLE';
    await assert.rejects(
      client.request('/rooms/ABCDEFABCDEF/leave', { body: '{}' }),
      (error) => error.code === 'SERVICE_UNAVAILABLE',
    );
  }
console.log(
  'H5 and four native channels reject obsolete chase rules; compatible retries and old-room exit pass.',
);

for (const platform of ['wechat', 'bilibili', 'douyin', 'kuaishou']) {
  const sdkName = { wechat: 'wx', bilibili: 'bl', douyin: 'tt', kuaishou: 'ks' }[platform];
  const sent = [],
    stored = [];
  const sdk = {
    getStorageSync: () => stored.at(-1)?.[1] || '',
    setStorageSync: (key, value) => stored.push([key, value]),
    login: () => assert.fail('Anonymous identity needs no platform login'),
    request: ({ url, data, success }) => {
      sent.push({ url, data });
      success({
        statusCode: 200,
        data: url.endsWith('/sessions/guest')
          ? {
              token: 'a'.repeat(64),
              refreshToken: 'b'.repeat(64),
              sessionId: '10000000-0000-4000-8000-000000000001',
              userId: 'player',
              game: 'letters-words2',
              identityKind: 'guest',
              refreshExpiresAt: Date.now() + 86400000,
              expiresAt: Date.now() + 3600000,
            }
          : { userId: 'player', game: 'letters-words2' },
      });
    },
  };
  const context = { [sdkName]: sdk, setTimeout, clearTimeout };
  runInNewContext(source, context);
  context.__installCompetition({
    platform,
    game: 'letters-words2',
    appId: 'game-app',
    apiUrl: 'https://test.invalid/api',
  });
  await context.__competition.request('/me');
  assert.equal(sent[0].url, 'https://test.invalid/api/sessions/guest');
  assert.equal(JSON.stringify(sent[0].data), JSON.stringify({ game: 'letters-words2' }));
  assert.ok(decodeURIComponent(stored[0][0]).includes(`${platform}|game-app`));
  const missing = {};
  runInNewContext(source, missing);
  assert.throws(() => missing.__installCompetition({ platform }), /原生 SDK/);
}
console.log(
  'Native entrances use SDK transport and scoped anonymous credentials without platform login.',
);
