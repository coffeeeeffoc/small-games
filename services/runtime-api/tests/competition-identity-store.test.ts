import { createHash } from 'node:crypto';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import { createCompetitionIdentities } from '../src/competition/identity-store.js';

const token = 'a'.repeat(64),
  refreshToken = 'b'.repeat(64);
const userId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';

function database(results: Record<string, unknown>[][]) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const execute = vi.fn(async (query) => {
    queries.push(new PgDialect().sqlToQuery(query));
    return results.shift() ?? [];
  });
  const db = {
    execute,
    transaction: async (change: (tx: unknown) => unknown) => change({ execute }),
  };
  return { identities: createCompetitionIdentities(db as never, () => 1000), queries };
}
describe('identity transaction ordering and credential revocation', () => {
  it('negotiates legacy 180-day access explicitly and keeps v2 access at one day', async () => {
    for (const version of [undefined, 2] as const) {
      const { identities, queries } = database([[], [], [], [{ id: userId, platform: 'guest' }]]);
      const result = await identities.guestSession(undefined, version);
      expect(result.expiresAt).toBe(1000 + (version === 2 ? 1 : 180) * 86400_000);
      expect(result.refreshExpiresAt).toBe(1000 + 180 * 86400_000);
      const insert = queries.find((query) =>
        query.sql.includes('insert into runtime.competition_sessions'),
      );
      expect(insert!.params.at(-1)).toBe(result.expiresAt);
    }
  });
  it('stores only secret digests and treats repeat installation IDs as metadata', async () => {
    const { identities, queries } = database([
      [],
      [],
      [],
      [{ id: userId, platform: 'guest' }],
      [],
      [],
      [],
      [{ id: otherId, platform: 'guest' }],
    ]);
    const a = await identities.guestSession(userId),
      b = await identities.guestSession(userId);
    expect(a.userId).not.toBe(b.userId);
    expect(a.token).toMatch(/^[a-f0-9]{64}$/);
    expect(a.refreshToken).toMatch(/^[a-f0-9]{64}$/);
    const serialized = JSON.stringify(queries);
    expect(serialized).not.toContain(a.token);
    expect(serialized).not.toContain(a.refreshToken);
    expect(serialized).toContain(createHash('sha256').update(a.refreshToken).digest('hex'));
    expect(
      queries.filter((query) => query.sql.includes('insert into runtime.competition_players')),
    ).toHaveLength(2);
  });
  it('locks the owner then rechecks refresh and guest status before issuing a token', async () => {
    const { identities, queries } = database([
      [{ id: userId }],
      [{ expires_at: 100000 }],
      [],
      [{ id: userId, platform: 'guest' }],
    ]);
    const result = await identities.refreshSession(refreshToken);
    expect(result).toMatchObject({
      userId,
      playerId: userId,
      refreshToken,
      refreshExpiresAt: 100000,
      identityKind: 'guest',
    });
    expect(queries[0]!.sql).toContain('for update of p');
    expect(queries[1]!.sql).toContain("p.platform='guest'");
    const stale = database([[{ id: userId }], []]);
    await expect(stale.identities.refreshSession(refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_EXPIRED',
      status: 401,
    });
    expect(stale.queries).toHaveLength(2);
  });
  it('renews only an unexpired legacy guest bearer while retaining the authoritative UUID', async () => {
    const { identities, queries } = database([
      [{ id: userId }],
      [{}],
      [],
      [],
      [{ id: userId, platform: 'guest' }],
    ]);
    const renewed = await identities.renewGuestSession(token);
    expect(renewed).toMatchObject({ userId, playerId: userId, identityKind: 'guest' });
    expect(renewed.refreshToken).toMatch(/^[a-f0-9]{64}$/);
    expect(queries[0]!.sql).toContain('for update of p');
    expect(queries[1]!.sql).toContain("p.platform='guest'");
    for (const results of [[], [[{ id: userId }], []]]) {
      const denied = database(results);
      await expect(denied.identities.renewGuestSession(token)).rejects.toMatchObject({
        code: 'SESSION_EXPIRED',
        status: 401,
      });
      expect(denied.queries.some((query) => query.sql.startsWith('insert '))).toBe(false);
    }
  });
  it('upgrades the same UUID only after scoped identity lock and revokes every guest credential', async () => {
    const { identities, queries } = database([
      [],
      [{ id: userId, platform: 'guest' }],
      [{}],
      [],
      [],
      [],
      [],
      [],
      [{ id: userId, platform: 'taptap' }],
    ]);
    const result = await identities.upgrade(token, 'taptap', 'app-a', 'verified');
    expect(result).toMatchObject({
      userId,
      playerId: userId,
      identityKind: 'platform',
      provider: 'taptap',
    });
    expect(result).not.toHaveProperty('refreshToken');
    expect(queries[0]!.sql).toContain('pg_advisory_xact_lock');
    expect(queries[1]!.sql).toContain('for update of p');
    expect(queries[3]!.params).toEqual(['taptap', 'app-a', 'verified']);
    const update = queries.findIndex((query) =>
      query.sql.startsWith('update runtime.competition_players'),
    );
    const revoke = queries.findIndex((query) =>
      query.sql.startsWith('delete from runtime.competition_sessions'),
    );
    const refresh = queries.findIndex((query) =>
      query.sql.startsWith('delete from runtime.competition_refresh_tokens'),
    );
    const issue = queries.findIndex((query) =>
      query.sql.startsWith('insert into runtime.competition_sessions'),
    );
    expect(update).toBeLessThan(revoke);
    expect(revoke).toBeLessThan(issue);
    expect(refresh).toBeLessThan(issue);
    expect(queries[revoke]!.params).toEqual([userId]);
  });
  it.each([
    {
      rows: [[], [{ id: userId, platform: 'guest' }], [{}], [{ id: otherId }]],
      code: 'IDENTITY_ALREADY_BOUND',
    },
    {
      rows: [[], [{ id: userId, platform: 'wechat' }], [{}]],
      code: 'IDENTITY_UPGRADE_NOT_ALLOWED',
    },
    { rows: [[], [{ id: userId, platform: 'guest' }], []], code: 'SESSION_EXPIRED' },
  ])('rejects unsafe upgrade without modifying any account: $code', async ({ rows, code }) => {
    const { identities, queries } = database(rows);
    await expect(identities.upgrade(token, 'taptap', 'app-a', 'verified')).rejects.toMatchObject({
      code,
    });
    expect(queries.some((query) => /^(update|delete|insert) /.test(query.sql))).toBe(false);
  });
  it('maps a scoped unique-identity race to conflict and preserves unrelated failures', async () => {
    const conflict = {
      code: '23505',
      constraint: 'competition_players_platform_app_id_subject_key',
    };
    const failed = (error: unknown) =>
      createCompetitionIdentities({
        transaction: async () => {
          throw error;
        },
      } as never);
    await expect(
      failed({ cause: conflict }).upgrade(token, 'taptap', 'app-a', 'subject'),
    ).rejects.toMatchObject({ code: 'IDENTITY_ALREADY_BOUND', status: 409 });
    const unrelated = new Error('database unavailable');
    await expect(failed(unrelated).upgrade(token, 'taptap', 'app-a', 'subject')).rejects.toBe(
      unrelated,
    );
  });
});
