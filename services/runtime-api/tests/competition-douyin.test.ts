import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCompetition } from '../src/competition/routes.js';
import type { createCompetitionStore } from '../src/competition/store.js';

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function setup() {
  const app = Fastify();
  apps.push(app);
  const session = vi.fn(async () => ({ playerId: 'verified-player', token: 'a'.repeat(64) }));
  const store = { session } as unknown as ReturnType<typeof createCompetitionStore>;
  await registerCompetition(app, store, {
    COMPETITION_PLATFORM_CONFIG: JSON.stringify([
      { platform: 'douyin', appId: 'tt-test-app', secret: 'test-server-secret' },
    ]),
  });
  return { app, session };
}
const login = (app: ReturnType<typeof Fastify>, payload: Record<string, unknown> = {}) =>
  app.inject({
    method: 'POST',
    url: '/api/competition/v1/sessions/platform',
    payload: {
      platform: 'douyin',
      appId: 'tt-test-app',
      code: 'single-use-login-code',
      ...payload,
    },
  });

describe('Douyin mini-game verified login', () => {
  it('uses the official mini-game endpoint, code query, bounded timeout and scoped identity', async () => {
    const { app, session } = await setup();
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        error: 0,
        openid: 'official-openid',
        session_key: 'never-return-this',
        unionid: 'also-private',
      }),
    }));
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    vi.stubGlobal('fetch', fetch);
    const response = await login(app);
    expect(response.statusCode).toBe(200);
    expect(session).toHaveBeenCalledWith('douyin', 'tt-test-app', 'official-openid');
    const [endpoint, options] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(endpoint.origin + endpoint.pathname).toBe(
      'https://minigame.zijieapi.com/mgplatform/api/apps/jscode2session',
    );
    expect(Object.fromEntries(endpoint.searchParams)).toEqual({
      appid: 'tt-test-app',
      secret: 'test-server-secret',
      code: 'single-use-login-code',
    });
    expect(options.headers).toEqual({ 'content-type': 'application/json' });
    expect(options.redirect).toBe('error');
    expect(timeout).toHaveBeenCalledWith(5000);
    expect(response.json()).toEqual({ playerId: 'verified-player', token: 'a'.repeat(64) });
    expect(response.body).not.toMatch(/session_key|unionid|never-return-this|test-server-secret/);
  });

  it.each([
    { error: 0, anonymous_openid: 'anonymous-only' },
    { error: 40018, openid: 'must-not-pass' },
    { error: 0, errcode: 40018, openid: 'must-not-pass' },
    { error: '0', openid: 'must-not-pass' },
    { openid: 'missing-success-status' },
    { error: 0, openid: '' },
    { error: 0, openid: '   ' },
    { error: 0, openid: 123 },
    { error: 0, openId: 'wrong-field' },
    null,
  ])('never authenticates malformed or anonymous response %j', async (data) => {
    const { app, session } = await setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => data })),
    );
    const response = await login(app);
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'PLATFORM_LOGIN_FAILED' });
    expect(session).not.toHaveBeenCalled();
  });

  it('rejects anonymous-code input and unknown applications before sending secrets upstream', async () => {
    const { app, session } = await setup();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect((await login(app, { code: undefined, anonymous_code: 'anonymous' })).statusCode).toBe(
      422,
    );
    expect((await login(app, { appId: 'tt-other-app' })).statusCode).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    expect(session).not.toHaveBeenCalled();
  });

  it('never creates a guest identity after network timeout or upstream denial', async () => {
    const { app, session } = await setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('expired', 'TimeoutError');
      }),
    );
    expect((await login(app)).statusCode).toBe(503);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false })),
    );
    expect((await login(app)).statusCode).toBe(401);
    expect(session).not.toHaveBeenCalled();
  });
});
