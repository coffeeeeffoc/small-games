import { expect, it } from 'vitest';
import {
  createNightRelease,
  gameBuildId,
  readNightReleaseConfig,
} from '../src/competition/night-release.js';
import { createRankedRuns } from '../src/competition/ranked-runs.js';
import { createRankedStore } from '../src/competition/ranked-store.js';
import { memoryRuns } from './ranked-fixture.js';
import { controlDatabase, gateFixture } from './control-fixture.js';
import { game, owner, releaseFixture } from './night-release.fixture.js';

it('validates bounded builds and strict channel/rule references without inventing an available update', () => {
  const { old, current, config, release } = releaseFixture();
  expect(readNightReleaseConfig({})).toBeUndefined();
  expect(readNightReleaseConfig({ NIGHT_RELEASE_CONFIG: '' })).toBeUndefined();
  expect(
    createNightRelease([current.ranked], [current.multiplayer]).metadata('unknown').release
      .canStartNewGames,
  ).toBe(true);
  for (const value of ['x'.repeat(129), '../build', 'a b', ['build-a']])
    expect(gameBuildId.safeParse(value).success).toBe(false);
  for (const value of [
    null,
    { ...config, import: './arbitrary' },
    { ...config, builds: [config.builds[0], config.builds[0]] },
    { ...config, channels: [{ channel: 'h5', latestBuildId: 'missing' }] },
    { ...config, legacy: { ...config.legacy, channel: 'unknown' } },
  ])
    expect(() => readNightReleaseConfig({ NIGHT_RELEASE_CONFIG: JSON.stringify(value) })).toThrow(
      'NIGHT_RELEASE_CONFIG',
    );
  expect(() => createNightRelease([current.ranked], [current.multiplayer], config)).toThrow(
    'Unregistered',
  );
  expect(release.metadata('build-a')).toMatchObject({
    release: { update: 'optional', latestBuildId: 'build-b' },
    clientRules: { ranked: 'solo-a', multiplayer: 'duel-a' },
  });
  expect(release.metadata('unknown')).toMatchObject({
    release: {
      update: 'none',
      latestBuildId: null,
      admissions: { ranked: false, multiplayer: false },
    },
  });
  config.allowNew.ranked = ['solo-b'];
  config.channels[0]!.latestBuildId = null;
  const partial = createNightRelease(
    [current.ranked, old.ranked],
    [current.multiplayer, old.multiplayer],
    config,
  );
  expect(partial.metadata('build-a').release).toMatchObject({
    update: 'none',
    admissions: { ranked: false, multiplayer: true },
  });
  expect(releaseFixture(true).release.metadata().release.update).toBe('required');
});

it('pins real A/B apply/result/boards, restores lost creates after stop, and retains unknown versions', async () => {
  const memory = memoryRuns(),
    initial = releaseFixture(),
    stopped = releaseFixture(true);
  const rules = new Map([[game, initial.current.ranked]]);
  const before = createRankedRuns(
    memory.repository,
    rules,
    async () => ({ authenticated: true }),
    () => 1000,
    initial.release,
  );
  const requestId = 'aaaaaaaa-0000-4000-8000-000000000001';
  const a = await before.create(
    owner,
    game,
    'level-corridor-01',
    'corridor-01',
    'solo-a',
    requestId,
  );
  const after = createRankedRuns(
    memory.repository,
    rules,
    async () => ({ authenticated: true }),
    () => 2000,
    stopped.release,
  );
  expect(
    await after.create(
      owner,
      game,
      'level-corridor-01',
      'corridor-01',
      'solo-a',
      requestId,
      'unknown',
    ),
  ).toEqual(a);
  await expect(
    after.create(owner, game, 'level-corridor-01', 'corridor-01', 'solo-a'),
  ).rejects.toMatchObject({
    code: 'RULE_NEW_GAMES_DISABLED',
  });
  await after.actions(owner, game, a.id, { seq: 1, frames: [{ ticks: 10, input: {} }] });
  expect(memory.runs.get(a.id)).toMatchObject({
    boardKey: `${game}:level-corridor-01:board-a`,
    state: { engine: 'a', value: 10 },
  });
  expect((await after.resume(owner, game, a.id)).version).toBe('solo-a');
  expect((await after.retireExpired(owner, game, a.id)).status).toBe('active');
  const b = await after.create(
    owner,
    game,
    'level-corridor-01',
    'corridor-01',
    'solo-b',
    undefined,
    'build-b',
  );
  await after.actions(owner, game, b.id, { seq: 1, frames: [{ ticks: 10, input: {} }] });
  expect((await after.finish(owner, game, a.id, 1)).score).toBe(11);
  expect((await after.finish(owner, game, b.id, 1)).score).toBe(1100);
  stopped.release.ranked.delete('solo-a');
  expect((await after.resume(owner, game, a.id)).settlement?.score).toBe(11);
  expect((await after.finish(owner, game, a.id, 1)).score).toBe(11);
  const snapshot = structuredClone(memory.runs.get(b.id)!);
  snapshot.version = 'unknown';
  snapshot.status = 'active';
  delete snapshot.settlement;
  memory.runs.set(b.id, snapshot);
  await expect(after.retireExpired(owner, game, b.id)).rejects.toMatchObject({
    code: 'RULE_VERSION_CHANGED',
  });
  expect(memory.runs.get(b.id)).toEqual(snapshot);
  await expect(after.get('outsider', game, a.id)).rejects.toMatchObject({ code: 'NOT_A_MEMBER' });
});

it('keeps retired build identities for update notices without enabling removed rules or targets', () => {
  const { current, config } = releaseFixture(true);
  config.retiredRules = { ranked: ['solo-a'], multiplayer: ['duel-a'] };
  const release = createNightRelease([current.ranked], [current.multiplayer], config);
  expect(release.metadata('build-a').release).toMatchObject({
    update: 'required',
    latestBuildId: 'build-b',
    canStartNewGames: false,
  });
  expect(release.metadata().release.update).toBe('required');
  config.channels[0]!.latestBuildId = 'build-a';
  expect(() => createNightRelease([current.ranked], [current.multiplayer], config)).toThrow(
    'Retired',
  );
});

it('keeps authenticated receipt/terminal retries before control and admission, but gates new writes', async () => {
  const gate = gateFixture(),
    fixture = releaseFixture(),
    rows = new Map<string, unknown>();
  const db = controlDatabase((text, params) => {
    if (text.startsWith('select id from runtime.competition_matches')) return [{ id: 'migration' }];
    if (text.startsWith('select data from runtime.competition_matches'))
      return rows.has(String(params[0]))
        ? [{ data: structuredClone(rows.get(String(params[0]))) }]
        : [];
    if (text.startsWith('insert into runtime.competition_matches'))
      rows.set(String(params[0]), JSON.parse(String(params[2])));
    if (text.startsWith('update runtime.competition_matches'))
      rows.set(String(params[1]), JSON.parse(String(params[0])));
    return [];
  });
  const store = createRankedStore(
    db.db,
    new Map([[game, fixture.current.ranked]]),
    async () => ({ authenticated: true }),
    () => 1000,
    gate.control,
    fixture.release,
  );
  const id = 'aaaaaaaa-0000-4000-8000-000000000001';
  const run = await store.create(owner, game, 'level-corridor-01', 'corridor-01', 'solo-a', id);
  const input = { seq: 1, frames: [{ ticks: 1, input: {} }] };
  const receipt = await store.actions(owner, game, run.id, input);
  gate.set('disabled', 1);
  expect(await store.actions(owner, game, run.id, input)).toEqual(receipt);
  await expect(store.finish(owner, game, run.id, 1)).rejects.toMatchObject({
    code: 'GAME_DISABLED',
  });
  gate.set('enabled', 1);
  await expect(store.finish(owner, game, run.id, 1)).rejects.toMatchObject({
    code: 'GAME_CANCELLED',
  });
  gate.set('enabled', 0);
  const settlement = await store.finish(owner, game, run.id, 1);
  gate.set('disabled', 2);
  fixture.release.ranked.delete('solo-a');
  expect(await store.finish(owner, game, run.id, 1)).toEqual(settlement);
  expect(
    (await store.create(owner, game, 'level-corridor-01', 'corridor-01', 'solo-a', id)).id,
  ).toBe(run.id);
  await expect(store.actions('outsider', game, run.id, input)).rejects.toMatchObject({
    code: 'NOT_A_MEMBER',
  });
});
