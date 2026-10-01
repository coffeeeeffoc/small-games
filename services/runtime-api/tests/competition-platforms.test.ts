import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCompetition } from '../src/competition/routes.js';
import type { createCompetitionStore } from '../src/competition/store.js';

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.unstubAllGlobals();
});
async function setup(platform: string, configured = true) {
  const app = Fastify();
  apps.push(app);
  const session = vi.fn(async () => ({ playerId: 'verified-player', token: 'a'.repeat(64) }));
  const store = { session } as unknown as ReturnType<typeof createCompetitionStore>;
  await registerCompetition(app, store, {
    COMPETITION_PLATFORM_CONFIG: JSON.stringify(
      configured ? [{ platform, appId: 'test-app', secret: 'test-only-secret-value' }] : [],
    ),
  });
  return { app, session };
}
function login(app: ReturnType<typeof Fastify>, platform: string) {
  return app.inject({
    method: 'POST',
    url: '/api/competition/v1/sessions/platform',
    payload: { platform, appId: 'test-app', code: 'one-time-platform-code' },
  });
}
describe('competition channel identities', () => {
  it.each(['douyin', 'kuaishou'])(
    '%s accepts channel metadata but refuses an unverified exchange',
    async (platform) => {
      const { app, session } = await setup(platform);
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const response = await login(app, platform);
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: 'PLATFORM_LOGIN_UNAVAILABLE' });
      expect(fetch).not.toHaveBeenCalled();
      expect(session).not.toHaveBeenCalled();
    },
  );
  it.each(['wechat', 'bilibili', 'douyin', 'kuaishou'])(
    '%s requires the exact configured application',
    async (platform) => {
      const { app, session } = await setup(platform, false);
      const response = await login(app, platform);
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: 'PLATFORM_NOT_CONFIGURED' });
      expect(session).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['wechat', 'api.weixin.qq.com'],
    ['bilibili', 'miniapp.bilibili.com'],
  ])('%s issues only a server-verified scoped identity', async (platform, hostname) => {
    const { app, session } = await setup(platform);
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ openid: 'verified-subject' }),
    }));
    vi.stubGlobal('fetch', fetch);
    const response = await login(app, platform);
    expect(response.statusCode).toBe(200);
    expect(session).toHaveBeenCalledWith(platform, 'test-app', 'verified-subject');
    const [endpoint, options] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(endpoint.hostname).toBe(hostname);
    expect(endpoint.searchParams.get('js_code')).toBe('one-time-platform-code');
    expect(options.redirect).toBe('error');
  });
  it.each([{ errcode: 40029 }, { openId: 'unverified-alternate-field' }, { openid: '' }])(
    'rejects failed or incomplete platform exchange %j',
    async (data) => {
      const { app, session } = await setup('wechat');
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, json: async () => data })),
      );
      const response = await login(app, 'wechat');
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'PLATFORM_LOGIN_FAILED' });
      expect(session).not.toHaveBeenCalled();
    },
  );
});
