import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const source = await readFile(
  new URL('../platforms/competition/client.js', import.meta.url),
  'utf8',
);
const versions = {
  'cops-robbers': ['roles-initiative-duel-v2', ['escape', 'survival']],
  'cops-robbers-realtime': ['street-roles-initiative-v2', ['classic', 'escape']],
};
for (const [game, [version, modes]] of Object.entries(versions))
  for (const platform of ['h5', 'wechat', 'bilibili']) {
    let metadata = { version: 'old-race-v1' },
      roomVersion = version,
      leaveError;
    const writes = [],
      token = JSON.stringify({ token: 'a'.repeat(64), expiresAt: Date.now() + 3600000 });
    const response = (url, method) => {
      const path = new URL(url).pathname;
      if (path.includes('/boards/')) return metadata;
      if (method === 'POST') writes.push(path);
      if (path.endsWith('/leave') && leaveError) return { error: leaveError };
      return { game, version: roomVersion, roles: ['pursuer', 'runner'] };
    };
    const status = (url) => (url.endsWith('/leave') && leaveError ? 409 : 200);
    const sdk = {
      getStorageSync: () => token,
      request: ({ url, method, success }) =>
        success({ statusCode: status(url), data: response(url, method) }),
    };
    const context = {
      localStorage: { getItem: () => token },
      wx: sdk,
      bl: sdk,
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
  'H5 / WeChat / Bilibili reject both obsolete chase rules before create, join, resume; compatible retries and old-room exit pass.',
);
