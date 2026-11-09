import { expect, it } from 'vitest';
import { type NightOperations, type NightReleaseConfig } from '@coffeeeeffoc/service-kit';
import { controlFixture, controlSnapshot } from './control.fixture.js';
import { snapshotDigest, type Snapshot } from '../src/admin/control-model.js';

const release = (): NightReleaseConfig => ({
  schemaVersion: 1,
  builds: [
    {
      buildId: 'old',
      version: '1.0.0',
      backendVersion: '1.0.0',
      channel: 'h5',
      ranked: 'solo-a',
      multiplayer: 'duel-a',
    },
    {
      buildId: 'new',
      version: '1.1.0',
      backendVersion: '1.1.0',
      channel: 'h5',
      ranked: 'solo-b',
      multiplayer: 'duel-b',
    },
  ],
  channels: [{ channel: 'h5', latestBuildId: 'new' }],
  allowNew: { ranked: ['solo-a', 'solo-b'], multiplayer: ['duel-a', 'duel-b'] },
  legacy: { channel: 'h5', ranked: 'solo-a', multiplayer: 'duel-a' },
});
const operations = (): NightOperations => ({
  announcements: [{ id: 'notice', title: '公告', body: '正文', enabled: true, startsAt: 1 }],
  compensations: [
    {
      id: 'grant',
      title: '补偿',
      body: '正文',
      loginFrom: Date.now() - 86400000,
      loginTo: Date.now() - 1000,
      reward: { coins: 1, xp: 2, packs: 3 },
    },
  ],
  release: release(),
});
async function publish(f: Awaited<ReturnType<typeof controlFixture>>, snapshot: Snapshot) {
  const expectedVersion = f.state().head.version;
  const revision = await f.service.draft(f.session, { expectedVersion, snapshot, reason: 'test' });
  await f.service.publish(f.session, revision.id, expectedVersion);
  return revision;
}
it('keeps every published compensation immutable and irremovable beyond the UI history window', async () => {
  const f = await controlFixture(),
    snapshot = { ...controlSnapshot(), nightOperations: operations() };
  const original = await publish(f, snapshot);
  const grant = original.snapshot.nightOperations!.compensations[0]!;
  const empty = { ...snapshot, nightOperations: { ...operations(), compensations: [] } };
  // Publication is final: the campaign can be neither withdrawn nor removed.
  await expect(
    f.service.draft(f.session, { expectedVersion: 1, snapshot: empty, reason: 'withdraw' }),
  ).rejects.toMatchObject({ code: 'NIGHT_COMPENSATION_IMMUTABLE' });
  for (let n = 0; n < 105; n++) {
    const filler = {
      ...original,
      id: `historical-${n}`,
      snapshot: empty,
      digest: snapshotDigest(empty),
    };
    f.state().revisions.push(filler);
    f.state().publications.push(filler.id);
  }
  for (const change of [
    { title: 'changed' },
    { body: 'changed' },
    { loginFrom: grant.loginFrom - 1 },
    { loginTo: grant.loginTo - 1 },
    { reward: { coins: 2, xp: 2, packs: 3 } },
    { playerIds: ['11111111-1111-4111-8111-111111111111'] },
  ]) {
    await expect(
      f.service.draft(f.session, {
        expectedVersion: 1,
        snapshot: {
          ...snapshot,
          nightOperations: {
            ...operations(),
            compensations: [{ ...grant, ...change }],
          },
        },
        reason: 'cannot reuse',
      }),
    ).rejects.toMatchObject({ code: 'NIGHT_COMPENSATION_IMMUTABLE' });
  }
  // Announcements stay editable and revocable alongside the frozen compensation.
  const next = structuredClone(snapshot);
  next.nightOperations.announcements[0]!.enabled = false;
  await publish(f, next);
  expect((await f.service.state(f.session)).publishedNightCompensationIds).toEqual(['grant']);
});
it('rejects new compensation for unfinished or no longer verifiable login ranges', async () => {
  const f = await controlFixture(),
    now = Date.now();
  for (const [range, code] of [
    [{ loginFrom: now - 1000, loginTo: now + 60000 }, 'NIGHT_COMPENSATION_FUTURE_LOGIN_RANGE'],
    [
      { loginFrom: now - 200 * 86400000, loginTo: now - 1000 },
      'NIGHT_COMPENSATION_LOGIN_RANGE_EXPIRED',
    ],
  ] as const) {
    const ops = operations();
    Object.assign(ops.compensations[0]!, range);
    await expect(
      f.service.draft(f.session, {
        expectedVersion: 0,
        snapshot: { ...controlSnapshot(), nightOperations: ops },
        reason: 'range',
      }),
    ).rejects.toMatchObject({ code });
  }
});
it('switches only one channel atomically and rejects disabled/removed/unavailable target rules', async () => {
  const f = await controlFixture(),
    snapshot = { ...controlSnapshot(), nightOperations: operations() };
  snapshot.games['cops-robbers'] = 'disabled';
  const original = await publish(f, snapshot);
  const input = { channel: 'h5', buildId: 'old', expectedVersion: 1, reason: '快速切换' };
  const [a, b] = await Promise.allSettled([
    f.service.rollbackNightRelease(f.session, input),
    f.service.rollbackNightRelease(f.session, input),
  ]);
  expect([a, b].filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const after = structuredClone(f.state().revisions.at(-1)!.snapshot);
  after.nightOperations!.release!.channels[0]!.latestBuildId = 'new';
  expect(after).toEqual(original.snapshot);
  expect(f.state().policies.find((p) => p.gameId === 'cops-robbers')!.killEpoch).toBe(1);
  for (const [change, code] of [
    [{ disabled: true }, 'NIGHT_BUILD_DISABLED'],
    [{ removed: true }, 'NIGHT_BUILD_REMOVED'],
  ] as const) {
    const next = structuredClone(snapshot);
    Object.assign(next.nightOperations.release!.builds[0]!, change);
    await publish(f, next);
    await expect(
      f.service.rollbackNightRelease(f.session, {
        ...input,
        expectedVersion: f.state().head.version,
      }),
    ).rejects.toMatchObject({ code });
  }
  const backend = structuredClone(snapshot);
  backend.nightOperations.release!.disabledBackendVersions = ['1.0.0'];
  await publish(f, backend);
  await expect(
    f.service.rollbackNightRelease(f.session, {
      ...input,
      expectedVersion: f.state().head.version,
    }),
  ).rejects.toMatchObject({ code: 'NIGHT_BACKEND_DISABLED' });
  const disallowed = structuredClone(snapshot);
  disallowed.nightOperations.release!.allowNew.ranked = ['solo-b'];
  await publish(f, disallowed);
  await expect(
    f.service.rollbackNightRelease(f.session, {
      ...input,
      expectedVersion: f.state().head.version,
    }),
  ).rejects.toMatchObject({ code: 'NIGHT_RULE_DISABLED' });
  await publish(f, snapshot);
  await expect(
    f.service.rollbackNightRelease(f.session, {
      ...input,
      expectedVersion: f.state().head.version,
    }),
  ).resolves.toMatchObject({ status: 'desired' });
});
it('preserves current operations on whole-control rollback and rejects build identity reuse or deletion', async () => {
  const f = await controlFixture(),
    first = await publish(f, controlSnapshot());
  const snapshot = { ...controlSnapshot(), nightOperations: operations() };
  await publish(f, snapshot);
  for (const change of [
    (r: NightReleaseConfig) => {
      r.builds.pop();
    },
    (r: NightReleaseConfig) => {
      r.builds[0]!.ranked = 'changed';
    },
  ]) {
    const next = structuredClone(snapshot);
    change(next.nightOperations.release!);
    if (next.nightOperations.release!.builds.length === 1)
      next.nightOperations.release!.channels[0]!.latestBuildId = 'old';
    await expect(
      f.service.draft(f.session, { expectedVersion: 2, snapshot: next, reason: 'bad' }),
    ).rejects.toMatchObject({
      code:
        next.nightOperations.release!.builds.length === 1
          ? 'NIGHT_BUILD_REMOVAL_REQUIRED'
          : 'NIGHT_BUILD_IMMUTABLE',
    });
  }
  await f.service.rollback(f.session, {
    revisionId: first.id,
    expectedVersion: 2,
    reason: 'origins rollback',
  });
  expect(f.state().revisions.at(-1)!.snapshot.nightOperations).toEqual(
    f.state().revisions.at(-2)!.snapshot.nightOperations,
  );
});
it('returns only the last five confirmed runtime deployments, independent of configuration publications', async () => {
  const f = await controlFixture();
  expect(await f.service.deployments(f.session)).toEqual({ current: null, history: [] });
  for (let n = 0; n < 8; n++)
    f.state().audits.push({
      id: String(n),
      actor: 'operator',
      action: 'deployments.backend',
      target: 'runtime',
      createdAt: n + 1,
      detail: {
        version: `1.0.${n}`,
        sourceSHA: n === 7 ? null : 'a'.repeat(40),
        release: `release-${n}`,
        mode: n === 7 ? 'rollback' : 'execute',
        services: ['runtime'],
        activeImages: { runtime: `image-${n}` },
        verifiedAt: n + 1,
      },
    });
  f.state().audits.push({
    id: 'other',
    actor: 'operator',
    action: 'deployments.backend',
    target: 'management',
    createdAt: 100,
    detail: { services: ['management'] },
  });
  const data = await f.service.deployments(f.session);
  expect(data.history.map((r) => r.version)).toEqual(['1.0.7', '1.0.6', '1.0.5', '1.0.4', '1.0.3']);
  expect(data.current).toMatchObject({ version: '1.0.7', mode: 'rollback', verifiedAt: 8 });
});
