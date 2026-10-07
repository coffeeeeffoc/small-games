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
  it.each(['wechat', 'bilibili', 'douyin', 'kuaishou', 'taptap'])(
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
    ['taptap', 'cloud-miniapp.tapapis.cn'],
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
  it('TapTap exchanges a single-use code only at the official domestic endpoint and hides platform keys', async () => {
    const { app, session } = await setup('taptap');
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        openid: 'verified-tap-openid',
        session_key: 'platform-session-key-must-remain-server-side',
        unionid: 'optional-platform-unionid',
      }),
    }));
    vi.stubGlobal('fetch', fetch);
    const response = await login(app, 'taptap');
    expect(response.statusCode).toBe(200);
    expect(session).toHaveBeenCalledWith('taptap', 'test-app', 'verified-tap-openid');
    const [endpoint, options] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(endpoint.origin + endpoint.pathname).toBe(
      'https://cloud-miniapp.tapapis.cn/auth/v1/jscode2session',
    );
    expect(Object.fromEntries(endpoint.searchParams)).toEqual({
      appid: 'test-app',
      secret: 'test-only-secret-value',
      js_code: 'one-time-platform-code',
      grant_type: 'authorization_code',
    });
    expect(options.redirect).toBe('error');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(response.json()).toEqual({ playerId: 'verified-player', token: 'a'.repeat(64) });
    expect(response.body).not.toContain('session_key');
    expect(response.body).not.toContain('unionid');
    expect(response.body).not.toContain('secret');
  });
  it.each([
    { errcode: 1040029, errmsg: 'invalid code' },
    { errcode: 1040029, openid: 'must-not-override-error' },
    { openid: '' },
    { openId: 'unverified-alternate-field', unionid: 'not-a-mini-game-identity' },
    { session_key: 'not-an-identity' },
  ])('TapTap rejects failed or incomplete code exchange %j', async (data) => {
    const { app, session } = await setup('taptap');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => data })),
    );
    const response = await login(app, 'taptap');
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'PLATFORM_LOGIN_FAILED' });
    expect(session).not.toHaveBeenCalled();
  });
  it('TapTap rejects an AppID that is not the configured server application before fetching', async () => {
    const { app, session } = await setup('taptap');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const response = await app.inject({
      method: 'POST',
      url: '/api/competition/v1/sessions/platform',
      payload: { platform: 'taptap', appId: 'another-miniapp', code: 'code' },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'PLATFORM_NOT_CONFIGURED' });
    expect(fetch).not.toHaveBeenCalled();
    expect(session).not.toHaveBeenCalled();
  });
  it('TapTap never issues a guest identity when the upstream service is unavailable', async () => {
    const { app, session } = await setup('taptap');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false })),
    );
    let response = await login(app, 'taptap');
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'PLATFORM_LOGIN_FAILED' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('unreachable platform');
      }),
    );
    response = await login(app, 'taptap');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'SERVICE_UNAVAILABLE' });
    expect(session).not.toHaveBeenCalled();
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
