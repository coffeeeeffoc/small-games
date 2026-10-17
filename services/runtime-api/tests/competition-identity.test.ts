import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  profilePatchSchema,
  publicProfile,
  publicRankingRow,
  publicRoomResults,
  safeAvatarUrl,
} from '../src/competition/profile.js';
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
    auth: vi.fn(
      async (): Promise<string | { playerId: string; game: string }> => ({
        playerId: userId,
        game: 'cops-robbers',
      }),
    ),
    guestSession: vi.fn(async () => ({ userId, playerId: userId, token, refreshToken })),
    refreshSession: vi.fn(async () => ({ userId, playerId: userId, token, refreshToken })),
    session: vi.fn(async () => ({ userId, playerId: userId, token })),
    logout: vi.fn(async () => ({ ok: true })),
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
  it('issues only a strict game-scoped anonymous identity and removes password and upgrade endpoints', async () => {
    const { app, store } = await setup();
    const url = '/api/competition/v1/sessions/guest';
    expect(
      (await app.inject({ method: 'POST', url, payload: { game: 'cops-robbers' } })).statusCode,
    ).toBe(200);
    expect(store.guestSession).toHaveBeenCalledWith({ game: 'cops-robbers' });
    for (const payload of [
      {},
      { game: 'unknown' },
      { game: 'cops-robbers', userId },
      { game: 'cops-robbers', installationId: userId },
      { game: 'cops-robbers', identityVersion: 2 },
    ])
      expect((await app.inject({ method: 'POST', url, payload })).statusCode).toBe(422);
    expect(store.guestSession).toHaveBeenCalledTimes(1);
    for (const endpoint of ['account/register', 'account/login', 'upgrade'])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/competition/v1/sessions/' + endpoint,
            payload: {},
          })
        ).statusCode,
      ).toBe(404);
  });
  it('rejects string-only identities on HTTP while logout accepts an old access proof', async () => {
    const { app, store } = await setup();
    store.auth.mockResolvedValue(userId);
    expect((await app.inject({ url: '/api/competition/v1/me', headers: auth })).statusCode).toBe(
      401,
    );
    expect(store.profile).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/competition/v1/sessions/logout',
          headers: auth,
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    expect(store.logout).toHaveBeenCalledWith(token);
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
  it('legacy bearer renewal is refused rather than silently issuing a new identity', async () => {
    const { app, store } = await setup();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/competition/v1/sessions/refresh',
          headers: auth,
          payload: {},
        })
      ).statusCode,
    ).toBe(422);
    expect(store.refreshSession).not.toHaveBeenCalled();
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
    expect(store.profile).toHaveBeenLastCalledWith(
      { playerId: userId, game: 'cops-robbers' },
      { name: '玩家 甲' },
    );
    const payload = {
      nickname: '玩家乙',
      avatarUrl: 'https://img.tapimg.net/avatar.png',
      region: { country: '中国', province: '广东' },
      source: 'user-authorized',
    };
    expect(
      (await app.inject({ method: 'POST', url: path, headers: auth, payload })).statusCode,
    ).toBe(200);
    expect(store.profile).toHaveBeenLastCalledWith(
      { playerId: userId, game: 'cops-robbers' },
      payload,
    );
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
  it('keeps preset avatars through ranking and persisted room-result projections', () => {
    const row = {
      playerId: userId,
      name: '快乐小猫',
      avatarId: 'fox',
      score: 3,
      secondary: 0,
      rank: 1,
      position: 1,
      total: 1,
    };
    expect(
      publicProfile({ id: userId, display_name: row.name, profile: { avatarId: row.avatarId } }),
    ).toMatchObject({ avatarId: 'fox', nickname: row.name });
    expect(publicRankingRow(row)).toMatchObject({ avatarId: 'fox', nickname: row.name });
    const results = publicRoomResults([
      { playerId: userId, before: row, after: { top: [row], me: row } },
    ]);
    expect(results?.[0]?.before).toMatchObject({ avatarId: 'fox' });
    expect(results?.[0]?.after?.top[0]).toMatchObject({ avatarId: 'fox' });
    expect(publicRankingRow({ ...row, avatarId: '../private' })).toMatchObject({ avatarId: null });
  });
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
      avatarId: null,
      avatarUrl: '',
      region: null,
      profileSource: 'legacy',
      profileUpdatedAt: 123,
    });
    expect(publicProfile({ id: userId })).toMatchObject({
      nickname: '新玩家',
      avatarId: null,
      avatarUrl: '',
      region: null,
      profileSource: 'default',
      profileUpdatedAt: null,
    });
    expect(JSON.stringify(profile)).not.toMatch(/app_id|subject|platform/);
  });
});
