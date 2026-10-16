import { expect, it } from 'vitest';
import {
  CONTROL_GAME_IDS,
  controlSnapshotDigest,
  normalizeControlSnapshot,
} from '@coffeeeeffoc/service-kit';
import { assertGameControl, createCompetitionControl } from '../src/competition/control.js';
import { controlDatabase } from './control-fixture.js';

const fallback = {
  origins: ['https://env.example'],
  methods: ['GET', 'POST', 'OPTIONS'],
  headers: ['authorization', 'content-type'],
  credentials: false,
  maxAge: 600,
};
function fixture() {
  let version = 0,
    time = 1000,
    delayed = false,
    broken = false;
  let snapshot = normalizeControlSnapshot({
    apiOrigins: ['https://published.example'],
    games: Object.fromEntries(CONTROL_GAME_IDS.map((id) => [id, 'enabled'])),
  });
  const memory = controlDatabase((text) => {
    if (text.includes('pg_advisory_xact_lock_shared') && delayed) time += 2001;
    if (text.includes('from game_control.published_config'))
      return version
        ? [{ version, snapshot, digest: broken ? 'f'.repeat(64) : controlSnapshotDigest(snapshot) }]
        : [];
    if (text.includes('from game_control.current_policy'))
      return CONTROL_GAME_IDS.map((id) => ({
        game_id: id,
        state: snapshot.games[id],
        kill_epoch: 0,
        revision: version,
      }));
    return [];
  });
  const control = createCompetitionControl(memory.db, fallback, () => time, 'runtime-primary');
  return {
    ...memory,
    control,
    publish(next = 1) {
      version = next;
    },
    advance(ms: number) {
      time += ms;
    },
    delay() {
      delayed = true;
    },
    breakDigest() {
      broken = true;
    },
    origins(origins: string[]) {
      snapshot = { ...snapshot, apiOrigins: origins };
    },
  };
}
it('uses env only at version zero, applies a precise version, and heartbeats after real resolver use', async () => {
  const f = fixture();
  expect((await f.control.publicCors()).origins).toEqual(fallback.origins);
  f.publish();
  const unpublishedObservationCount = f.queries.filter((q) =>
    q.sql.startsWith('insert into game_control.application_observations'),
  ).length;
  await f.control.cors();
  expect(
    f.queries.filter((q) => q.sql.startsWith('insert into game_control.application_observations')),
  ).toHaveLength(unpublishedObservationCount);
  expect((await f.control.publicCors()).origins).toEqual(['https://published.example']);
  await f.control.publicCors();
  expect(
    f.queries.filter((q) => q.sql.startsWith('insert into game_control.application_observations')),
  ).toHaveLength(1);
  f.advance(20_000);
  await f.control.publicCors();
  f.publish(2);
  f.origins([]);
  expect((await f.control.publicCors()).origins).toEqual([]);
  const observations = f.queries.filter((q) =>
    q.sql.startsWith('insert into game_control.application_observations'),
  );
  expect(observations).toHaveLength(3);
  expect(observations[0]!.params).toContain('runtime-primary');
  expect(observations.at(-1)!.params).toContain(2);
  expect(f.queries.some((q) => /members|roles|update game_control|for share/i.test(q.sql))).toBe(
    false,
  );
});
it('counts lock wait in its two-second budget and never falls back after errors or digest corruption', async () => {
  const f = fixture();
  f.publish();
  f.delay();
  await expect(f.control.cors()).rejects.toMatchObject({ code: 'CONTROL_UNAVAILABLE' });
  expect(f.queries.some((q) => q.sql === "set local lock_timeout = '1500ms'")).toBe(true);
  const broken = fixture();
  broken.publish();
  broken.breakDigest();
  await expect(broken.control.publicCors()).rejects.toMatchObject({ code: 'CONTROL_UNAVAILABLE' });
  expect(broken.queries.some((q) => q.sql.includes('insert into'))).toBe(false);
  expect(() => createCompetitionControl(broken.db, fallback, Date.now, 'x'.repeat(129))).toThrow();
});
it('uses the exact shared publication key, and all eleven games permanently reject an old epoch', async () => {
  const f = fixture();
  f.publish();
  await f.db.transaction(async (tx) => f.control.lock(tx, 'cage-rescue'));
  const lock = f.queries.find((q) => q.sql.includes('pg_advisory_xact_lock_shared'))!;
  expect(lock.sql).toBe(
    "select pg_advisory_xact_lock_shared(hashtextextended('game-control:' || $1,0))",
  );
  expect(lock.params).toEqual(['cage-rescue']);
  for (const gameId of CONTROL_GAME_IDS) {
    const policy = { gameId, state: 'draining' as const, killEpoch: 0, revision: 1 };
    expect(() => assertGameControl(policy, 0, true)).toThrow('GAME_DRAINING');
    expect(() => assertGameControl(policy, 0)).not.toThrow();
    expect(() => assertGameControl({ ...policy, state: 'disabled', killEpoch: 1 }, 0)).toThrow(
      'GAME_DISABLED',
    );
    expect(() => assertGameControl({ ...policy, state: 'enabled', killEpoch: 1 }, 0)).toThrow(
      'GAME_CANCELLED',
    );
    expect(() =>
      assertGameControl({ ...policy, state: 'enabled', killEpoch: 1 }, 1, true),
    ).not.toThrow();
  }
});
