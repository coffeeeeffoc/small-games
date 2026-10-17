import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CONTROL_GAME_IDS } from '@coffeeeeffoc/service-kit';
import { createCompetitionIdentities } from '../src/competition/identity-store.js';
import { AVATAR_IDS, nicknameSchema } from '../src/competition/profile.js';
import { fixture } from './competition-ephemeral-fixture.js';
const input = { game: 'cops-robbers' };
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
function setup() {
  const f = fixture();
  return { ...f, identity: createCompetitionIdentities(f.db, f.now) };
}
describe('persistent anonymous scoped credentials', () => {
  it('creates independent server UUIDs and safe random profiles, storing only token digests', async () => {
    const f = setup(),
      a = await f.identity.guestSession(input),
      b = await f.identity.guestSession(input);
    expect(a.userId).not.toBe(b.userId);
    expect(a.sessionId).not.toBe(b.sessionId);
    expect(a).toMatchObject({
      identityKind: 'guest',
      identityMode: 'persistent',
      game: input.game,
      identityExpiresAt: null,
    });
    expect(nicknameSchema.safeParse(a.nickname).success).toBe(true);
    expect(AVATAR_IDS).toContain(a.avatarId);
    expect(a.avatarPolicy.presets).toEqual(AVATAR_IDS);
    expect(a.expiresAt - f.now()).toBe(15 * 60_000);
    expect(a.refreshExpiresAt - f.now()).toBe(180 * 86400_000);
    expect(f.grants.has(`${a.userId}:${input.game}`)).toBe(true);
    const written = JSON.stringify(f.queries);
    for (const secret of [a.token, a.refreshToken]) expect(written).not.toContain(secret);
    expect(written).toContain(digest(a.token));
  });
  it('accepts only registered games and never client UUIDs, installation IDs or passwords', async () => {
    const f = setup();
    for (const bad of [
      undefined,
      {},
      { game: 'invented-game' },
      { game: 'cops-robbers/' },
      { ...input, playerId: 'victim' },
      { ...input, installationId: 'guess' },
      { ...input, password: 'private' },
    ])
      await expect(f.identity.guestSession(bad)).rejects.toThrow();
    expect(f.players.size).toBe(0);
    const ids = new Set();
    for (const game of CONTROL_GAME_IDS) {
      const scoped = await f.identity.guestSession({ game });
      ids.add(scoped.userId);
      expect((await f.identity.auth(scoped.token)).game).toBe(game);
    }
    expect(ids.size).toBe(CONTROL_GAME_IDS.length);
  });
  it('rotates once with sliding 180 days, keeps UUID/family and makes old access logout-only', async () => {
    const f = setup(),
      first = await f.identity.guestSession(input);
    f.at(first.refreshExpiresAt - 5 * 60_000);
    const next = await f.identity.refreshSession(first.refreshToken);
    expect(next.sessionId).toBe(first.sessionId);
    expect(next.userId).toBe(first.userId);
    expect(next.token).not.toBe(first.token);
    expect(next.refreshToken).not.toBe(first.refreshToken);
    expect(next.expiresAt).toBe(f.now() + 15 * 60_000);
    expect(next.refreshExpiresAt).toBe(f.now() + 180 * 86400_000);
    await expect(f.identity.auth(first.token)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    await expect(f.identity.refreshSession(first.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_EXPIRED',
    });
    f.at(first.refreshExpiresAt + 1);
    await f.identity.logout(first.token);
    await expect(f.identity.auth(next.token)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    await expect(f.identity.refreshSession(next.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_EXPIRED',
    });
  });
  it('expired refresh never revives the identity or family', async () => {
    const f = setup(),
      a = await f.identity.guestSession(input);
    f.at(a.refreshExpiresAt);
    await expect(f.identity.refreshSession(a.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_EXPIRED',
    });
    await expect(f.identity.logout(a.token)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });
  it('revokes a whole family without affecting other native device families', async () => {
    const f = setup(),
      a = await f.identity.session('wechat', 'fixture', 'verified', input.game),
      other = await f.identity.session('wechat', 'fixture', 'verified', input.game);
    expect(other.userId).toBe(a.userId);
    expect(other.sessionId).not.toBe(a.sessionId);
    const next = await f.identity.refreshSession(a.refreshToken);
    await f.identity.logout(a.token);
    await expect(f.identity.auth(next.token)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect((await f.identity.auth(other.token)).playerId).toBe(a.userId);
  });
  it('rejects revoked grants and old unscoped guest tokens, without granting access during refresh', async () => {
    const f = setup(),
      a = await f.identity.guestSession(input);
    f.grants.delete(`${a.userId}:${input.game}`);
    const offset = f.queries.length;
    await expect(f.identity.refreshSession(a.refreshToken)).rejects.toMatchObject({
      code: 'IDENTITY_SCOPE_MISMATCH',
    });
    expect(f.queries.slice(offset).some((q) => /^(insert|update|delete)/.test(q.sql))).toBe(false);
    f.sessions.get(digest(a.token))!.game = '';
    await expect(f.identity.auth(a.token)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    await expect(f.identity.refreshSession(a.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_EXPIRED',
    });
    await f.identity.logout(a.token);
  });
  it('persists preset changes and names without changing identity or allowing arbitrary avatars', async () => {
    const f = setup(),
      a = await f.identity.guestSession(input),
      auth = await f.identity.auth(a.token);
    for (const avatarId of AVATAR_IDS) {
      const updated = await f.identity.profile(auth, { nickname: '快乐小猫', avatarId });
      expect(updated).toMatchObject({
        userId: a.userId,
        nickname: '快乐小猫',
        avatarId,
        avatarUrl: '',
      });
    }
    await expect(f.identity.profile(auth, { avatarId: 'attacker' } as never)).rejects.toThrow();
    await expect(
      f.identity.profile(auth, { avatarId: 'cat', avatarUrl: 'https://img.tapimg.net/a.png' }),
    ).rejects.toThrow();
  });
});
