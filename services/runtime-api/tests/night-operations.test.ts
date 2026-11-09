import { expect, it } from 'vitest';
import type { NightOperations } from '@coffeeeeffoc/service-kit';
import {
  deliverNightCompensations,
  nightAnnouncements,
  recordNightVisit,
} from '../src/competition/night-operations.js';
import { publishedNightRelease } from '../src/competition/night-release.js';
import type { NightAssets } from '../src/competition/night-assets.js';
import { createRankedStore } from '../src/competition/ranked-store.js';
import { controlDatabase, gateFixture } from './control-fixture.js';
import { releaseFixture, game, owner } from './night-release.fixture.js';

const operations = (): NightOperations => ({
  announcements: [
    { id: 'notice', title: '标题', body: '正文', enabled: true, startsAt: 10, endsAt: 20 },
  ],
  compensations: [
    {
      id: 'grant',
      title: '补偿',
      body: '正文',
      loginFrom: 10,
      loginTo: 20,
      reward: { coins: 10, xp: 20, packs: 1 },
    },
  ],
});
it('delivers once to players seen in the login range and keeps the mail as the receipt', () => {
  const wallet: Pick<NightAssets, 'mail' | 'visits'> = { mail: [] },
    ops = operations();
  // No visit, or visits entirely outside [10, 20], are not eligible.
  expect(deliverNightCompensations(wallet, owner, 100, ops)).toBe(false);
  wallet.visits = { a: [1, 9], b: [21, 30] };
  expect(deliverNightCompensations(wallet, owner, 100, ops)).toBe(false);
  wallet.visits.c = [5, 12];
  ops.compensations[0]!.playerIds = ['22222222-2222-4222-8222-222222222222'];
  expect(deliverNightCompensations(wallet, owner, 100, ops)).toBe(false);
  ops.compensations[0]!.playerIds = [owner];
  expect(deliverNightCompensations(wallet, owner, 100, ops)).toBe(true);
  expect(wallet.mail[0]).toMatchObject({
    id: 'ops-compensation:grant',
    title: '补偿',
    body: '正文',
    createdAt: 100,
    read: false,
    claimed: false,
    reward: { coins: 10, xp: 20, packs: 1 },
  });
  wallet.mail[0]!.claimed = true;
  const saved = structuredClone(wallet.mail);
  ops.compensations[0]!.reward.coins = 999;
  expect(deliverNightCompensations(wallet, owner, 101, ops)).toBe(false);
  deliverNightCompensations(wallet, owner, 102);
  expect(wallet.mail).toEqual(saved);
});
it('records daily first/last visits and prunes beyond the login retention', () => {
  const wallet: Pick<NightAssets, 'visits'> = {},
    at = Date.parse('2026-11-10T12:00:00+08:00');
  recordNightVisit(wallet, at - 200 * 86400000);
  recordNightVisit(wallet, at + 5);
  recordNightVisit(wallet, at);
  recordNightVisit(wallet, at + 9);
  expect(wallet.visits).toEqual({ '2026-11-10': [at, at + 9] });
});
it('shows at most one live announcement and honours expiry and revocation', () => {
  expect(nightAnnouncements(0)[0]!.id).toBe('growth-v1');
  expect(nightAnnouncements(10, { announcements: [], compensations: [] })).toEqual([]);
  expect(nightAnnouncements(9, operations())).toEqual([]);
  expect(nightAnnouncements(10, operations())).toMatchObject([{ id: 'notice', createdAt: 10 }]);
  expect(nightAnnouncements(20, operations())).toEqual([]);
  const ops = operations();
  ops.announcements.push({ ...ops.announcements[0]!, id: 'newer', startsAt: 15 });
  expect(nightAnnouncements(16, ops)).toEqual([
    { id: 'newer', title: '标题', body: '正文', createdAt: 15 },
  ]);
  ops.announcements[1]!.enabled = false;
  expect(nightAnnouncements(16, ops)).toMatchObject([{ id: 'notice' }]);
});
it('isolates same-rule builds, removed registrations and backend-version gates without mutating the registry', () => {
  const f = releaseFixture(),
    ops = { ...operations(), release: structuredClone(f.config) };
  ops.release.builds.push({ ...ops.release.builds[0]!, buildId: 'same-rules', disabled: true });
  ops.release.builds[0]!.backendVersion = 'backend-a';
  ops.release.legacy.backendVersion = 'backend-a';
  let selected = publishedNightRelease(f.release, ops)!;
  expect(selected.metadata('same-rules').release.canStartNewGames).toBe(false);
  expect(selected.metadata('build-a').release.canStartNewGames).toBe(true);
  expect(() => selected.assertStart('ranked', 'solo-a', 'same-rules')).toThrow('BUILD_DISABLED');
  ops.release.disabledBackendVersions = ['backend-a'];
  selected = publishedNightRelease(f.release, ops)!;
  expect(() => selected.assertStart('ranked', 'solo-a', 'build-a')).toThrow(
    'BACKEND_VERSION_DISABLED',
  );
  expect(selected.metadata().release.canStartNewGames).toBe(false);
  expect(selected.metadata('build-b').release.canStartNewGames).toBe(true);
  ops.release.builds[0]!.removed = true;
  expect(publishedNightRelease(f.release, ops)!.client('build-a')?.ranked).toBe('solo-a');
  expect(() =>
    publishedNightRelease(f.release, ops)!.assertStart('ranked', 'solo-a', 'build-a'),
  ).toThrow('BUILD_REMOVED');
  expect(f.release.metadata('build-a').release.canStartNewGames).toBe(true);
  ops.release.builds[0]!.ranked = 'unknown';
  selected = publishedNightRelease(f.release, ops)!;
  expect(selected.metadata('build-a').release.canStartNewGames).toBe(false);
  expect(selected.metadata('build-b').release.canStartNewGames).toBe(true);
});
it('resolves live admission inside ranked transactions while old runs and create receipts remain pinned', async () => {
  const f = releaseFixture(),
    gate = gateFixture(),
    rows = new Map<string, unknown>();
  const database = controlDatabase((sql, params) => {
    if (sql.startsWith('select data from runtime.competition_matches'))
      return rows.has(String(params[0]))
        ? [{ data: structuredClone(rows.get(String(params[0]))) }]
        : [];
    if (sql.startsWith('insert into runtime.competition_matches'))
      rows.set(String(params[0]), JSON.parse(String(params[2])));
    if (sql.startsWith('update runtime.competition_matches'))
      rows.set(String(params[1]), JSON.parse(String(params[0])));
    return [];
  });
  const store = createRankedStore(
    database.db,
    new Map([[game, f.current.ranked]]),
    async () => ({ authenticated: true }),
    () => 1000,
    gate.control,
    f.release,
  );
  const requestId = 'aaaaaaaa-0000-4000-8000-000000000001';
  const run = await store.create(
    owner,
    game,
    'level-corridor-01',
    'corridor-01',
    'solo-a',
    requestId,
    undefined,
    'build-a',
  );
  const ops = { ...operations(), release: structuredClone(f.config) };
  ops.release.builds[0]!.disabled = true;
  gate.operations(ops);
  await expect(
    store.create(
      owner,
      game,
      'level-corridor-01',
      'corridor-01',
      'solo-a',
      undefined,
      undefined,
      'build-a',
    ),
  ).rejects.toMatchObject({ code: 'BUILD_DISABLED' });
  expect(
    await store.create(
      owner,
      game,
      'level-corridor-01',
      'corridor-01',
      'solo-a',
      requestId,
      undefined,
      'unknown',
    ),
  ).toEqual(run);
  await store.actions(owner, game, run.id, { seq: 1, frames: [{ ticks: 2, input: {} }] });
  expect(rows.get(`ranked-run:${run.id}`)).toMatchObject({
    version: 'solo-a',
    state: { engine: 'a', value: 2 },
  });
  ops.release.builds[0]!.disabled = false;
  await expect(
    store.create(
      owner,
      game,
      'level-corridor-01',
      'corridor-01',
      'solo-a',
      undefined,
      undefined,
      'build-a',
    ),
  ).resolves.toMatchObject({ version: 'solo-a' });
});
