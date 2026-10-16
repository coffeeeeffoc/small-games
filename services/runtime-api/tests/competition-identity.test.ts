import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { profilePatchSchema, publicProfile, safeAvatarUrl } from '../src/competition/profile.js';
import { registerCompetition } from '../src/competition/routes.js';
import type { createCompetitionStore } from '../src/competition/store.js';

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.unstubAllGlobals();
});
const token = 'a'.repeat(64),
  refreshToken = 'b'.repeat(64);
const userId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
async function setup() {
  const app = Fastify();
  apps.push(app);
  const store = {
    identity: vi.fn(async () => userId),
    guestSession: vi.fn(async () => ({ userId, playerId: userId, token, refreshToken })),
    refreshSession: vi.fn(async () => ({ userId, playerId: userId, token, refreshToken })),
    renewGuestSession: vi.fn(async () => ({ userId, playerId: userId, token, refreshToken })),
    upgrade: vi.fn(async () => ({ userId, playerId: userId, token })),
    session: vi.fn(async () => ({ userId, playerId: userId, token })),
    profile: vi.fn(async () => ({ userId, playerId: userId, nickname: '玩家甲' })),
  };
  await registerCompetition(app, store as unknown as ReturnType<typeof createCompetitionStore>, {
    COMPETITION_PLATFORM_CONFIG: JSON.stringify([
      { platform: 'taptap', appId: 'app-a', secret: 'unit-test-only-secret' },
    ]),
  });
  return { app, store };
}
const auth = { authorization: `Bearer ${token}` };
describe('shared identity HTTP trust boundary', () => {
  it('creates guests with optional metadata but never authenticates an installation ID', async () => {
    const { app, store } = await setup();
    const path = '/api/competition/v1/sessions/guest';
    expect((await app.inject({ method: 'POST', url: path })).statusCode).toBe(200);
    expect(store.guestSession).toHaveBeenLastCalledWith(undefined, undefined);
    expect(
      (await app.inject({ method: 'POST', url: path, payload: { installationId: userId } }))
        .statusCode,
    ).toBe(200);
    expect(store.guestSession).toHaveBeenLastCalledWith(userId, undefined);
    expect(
      (await app.inject({ method: 'POST', url: path, payload: { identityVersion: 2 } })).statusCode,
    ).toBe(200);
    expect(store.guestSession).toHaveBeenLastCalledWith(undefined, 2);
    for (const payload of [
      { userId },
      { playerId: userId },
      { platformId: 'victim' },
      { installationId: 'guess' },
      { identityVersion: 1 },
      { identityVersion: '2' },
      { identityVersion: 3 },
      { refreshToken },
    ])
      expect((await app.inject({ method: 'POST', url: path, payload })).statusCode).toBe(422);
    expect(store.guestSession).toHaveBeenCalledTimes(3);
  });
  it('refresh requires only an opaque server secret and rejects owner overrides', async () => {
    const { app, store } = await setup();
    const path = '/api/competition/v1/sessions/refresh';
    expect(
      (await app.inject({ method: 'POST', url: path, payload: { refreshToken } })).statusCode,
    ).toBe(200);
    expect(store.refreshSession).toHaveBeenCalledWith(refreshToken);
    for (const payload of [
      { userId },
      { refreshToken, userId },
      { refreshToken, platformId: 'victim' },
      { refreshToken: 'guess' },
    ])
      expect((await app.inject({ method: 'POST', url: path, payload })).statusCode).toBe(422);
    expect(store.refreshSession).toHaveBeenCalledTimes(1);
  });
  it('renews a valid legacy guest bearer without accepting a client owner claim', async () => {
    const { app, store } = await setup();
    const path = '/api/competition/v1/sessions/refresh';
    expect((await app.inject({ method: 'POST', url: path, payload: {} })).statusCode).toBe(401);
    expect(store.renewGuestSession).not.toHaveBeenCalled();
    expect(
      (await app.inject({ method: 'POST', url: path, headers: auth, payload: {} })).statusCode,
    ).toBe(200);
    expect(store.renewGuestSession).toHaveBeenCalledWith(token);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: path,
          headers: auth,
          payload: { installationId: userId },
        })
      ).statusCode,
    ).toBe(422);
    expect(store.renewGuestSession).toHaveBeenCalledTimes(1);
  });
  it('upgrade verifies both the existing bearer and official platform code without trusting IDs', async () => {
    const { app, store } = await setup();
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ openid: 'verified-subject', session_key: 'private' }),
    }));
    vi.stubGlobal('fetch', fetch);
    const path = '/api/competition/v1/sessions/upgrade';
    const payload = { platform: 'taptap', appId: 'app-a', code: 'one-use' };
    expect((await app.inject({ method: 'POST', url: path, payload })).statusCode).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    for (const extra of [{ platformId: 'victim' }, { userId: otherId }, { subject: 'victim' }])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: path,
            headers: auth,
            payload: { ...payload, ...extra },
          })
        ).statusCode,
      ).toBe(422);
    const response = await app.inject({ method: 'POST', url: path, headers: auth, payload });
    expect(response.statusCode).toBe(200);
    expect(store.upgrade).toHaveBeenCalledWith(token, 'taptap', 'app-a', 'verified-subject');
    expect(response.body).not.toMatch(/subject|session_key|private/);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: path,
          headers: auth,
          payload: { ...payload, appId: 'unconfigured' },
        })
      ).statusCode,
    ).toBe(503);
    expect(store.upgrade).toHaveBeenCalledTimes(1);
  });
  it('keeps legacy name updates and rejects profile attempts to replace identity or claim verification', async () => {
    const { app, store } = await setup();
    const path = '/api/competition/v1/me';
    expect(
      (
        await app.inject({
          method: 'POST',
          url: path,
          headers: auth,
          payload: { name: ' 玩家 甲 ' },
        })
      ).statusCode,
    ).toBe(200);
    expect(store.profile).toHaveBeenLastCalledWith(userId, { name: '玩家 甲' });
    const payload = {
      nickname: '玩家乙',
      avatarUrl: 'https://img.tapimg.net/avatar.png',
      region: { country: '中国', province: '广东' },
      source: 'user-authorized',
    };
    expect(
      (await app.inject({ method: 'POST', url: path, headers: auth, payload })).statusCode,
    ).toBe(200);
    expect(store.profile).toHaveBeenLastCalledWith(userId, payload);
    for (const extra of [
      { userId: otherId },
      { platformId: 'victim' },
      { source: 'platform-verified' },
    ])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: path,
            headers: auth,
            payload: { nickname: '玩家甲', ...extra },
          })
        ).statusCode,
      ).toBe(422);
    expect(store.profile).toHaveBeenCalledTimes(2);
  });
});

describe('public display profile', () => {
  it.each([
    'javascript:alert(1)',
    'data:image/png;base64,eA==',
    'http://cdn.example.com/a',
    'https://user:pass@example.com/a',
    'https://example.com/a#fragment',
    'https://example.com:8443/a',
    'https://localhost/a',
    'https://localtest.me.local/a',
    'https://internal/a',
    'https://10.1.2.3/a',
    'https://127.1/a',
    'https://2130706433/a',
    'https://169.254.169.254/a',
    'https://172.16.0.1/a',
    'https://192.168.1.2/a',
    'https://[::1]/a',
    'https://[::ffff:127.0.0.1]/a',
    'https://[fc00::1]/a',
    'https://[fe80::1]/a',
    'https://cdn.example.com/a.png',
    'https://wx.qlogo.cn.attacker.example/a',
    'https://8.8.8.8/a',
    'https://[2606:4700:4700::1111]/a',
    'https://img.tapimg.net/a?access_token=private',
  ])('rejects unsafe avatar %s', (url) => {
    expect(safeAvatarUrl(url)).toBe(false);
    expect(profilePatchSchema.safeParse({ avatarUrl: url }).success).toBe(false);
  });
  it.each([
    '',
    'https://img.tapimg.net/a.png?v=2',
    'https://thirdwx.qlogo.cn/mmopen/a',
    'https://i1.hdslb.com/bfs/face/a.jpg',
  ])('accepts safe avatar %s', (url) => expect(safeAvatarUrl(url)).toBe(true));
  it('normalizes names/regions and rejects markup, precise location and invented verification', () => {
    expect(
      profilePatchSchema.parse({
        nickname: ' 玩家  甲 ',
        region: { country: ' 中国 ' },
        source: 'user-authorized',
      }),
    ).toEqual({ nickname: '玩家 甲', region: { country: '中国' }, source: 'user-authorized' });
    for (const input of [
      { nickname: '<img onerror=x>' },
      { region: { city: '广州' } },
      { region: { latitude: 23.1 } },
      { region: { province: '<script>' } },
      { nickname: '玩家甲', name: '玩家乙' },
    ])
      expect(profilePatchSchema.safeParse(input).success).toBe(false);
  });
  it('returns only necessary public fields, defaults missing data and never invents locality', () => {
    const profile = publicProfile({
      id: userId,
      platform: 'taptap',
      app_id: 'private-app',
      subject: 'private-subject',
      display_name: '玩家甲',
      profile: {
        avatarUrl: 'https://localhost/private',
        region: null,
        source: 'platform-verified',
        updatedAt: 123,
      },
    });
    expect(profile).toEqual({
      userId,
      nickname: '玩家甲',
      name: '玩家甲',
      avatarUrl: '',
      region: null,
      profileSource: 'legacy',
      profileUpdatedAt: 123,
    });
    expect(publicProfile({ id: userId })).toMatchObject({
      nickname: '新玩家',
      avatarUrl: '',
      region: null,
      profileSource: 'default',
      profileUpdatedAt: null,
    });
    expect(JSON.stringify(profile)).not.toMatch(/app_id|subject|platform/);
  });
});
