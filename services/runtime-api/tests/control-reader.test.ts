import { expect, it, vi } from 'vitest';
import {
  CONTROL_GAME_IDS,
  controlSnapshotDigest,
  normalizeControlSnapshot,
  type openControlDatabase,
  type ControlDatabaseExecutor,
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
    broken = false,
    perQueryDelay = 0,
    failCommit = false,
    statement = '5s',
    lock = '750ms',
    failRestore = false;
  let snapshot = normalizeControlSnapshot({
    apiOrigins: ['https://published.example'],
    games: Object.fromEntries(
      CONTROL_GAME_IDS.map((id) => [
        id,
        ['night-overwatch', 'tetracube'].includes(id) ? 'disabled' : 'enabled',
      ]),
    ),
  });
  const memory = controlDatabase((text, params) => {
    time += perQueryDelay;
    if (text.includes("current_setting('statement_timeout')")) return [{ statement, lock }];
    if (text.includes('set_config') && params[0] === statement && failRestore)
      throw new Error('restore failed');
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
  const database = {
    transaction<T>(work: (tx: ControlDatabaseExecutor, remaining: () => number) => Promise<T>) {
      const deadline = time + 2000;
      return memory.db.transaction(async (tx) => {
        const result = await work(tx, () => {
          if (time >= deadline) throw new Error('CONTROL_UNAVAILABLE');
          return deadline - time;
        });
        if (failCommit) throw new Error('commit failed');
        return result;
      });
    },
    close() {},
  } satisfies ReturnType<typeof openControlDatabase>;
  const control = createCompetitionControl(database, fallback, () => time, 'runtime-primary');
  return {
    ...memory,
    control,
    database,
    publish(next = 1) {
      version = next;
    },
    advance(ms: number) {
      time += ms;
    },
    delay() {
      delayed = true;
    },
    queryDelay(ms: number) {
      perQueryDelay = ms;
    },
    failCommit(value: boolean) {
      failCommit = value;
    },
    timeouts(nextStatement: string, nextLock: string) {
      statement = nextStatement;
      lock = nextLock;
    },
    failRestore() {
      failRestore = true;
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
it('batches concurrent CORS requests before their transaction and reads again after publication', async () => {
  const f = fixture();
  f.publish();
  const transaction = vi.spyOn(f.database, 'transaction');
  const policies = await Promise.all(Array.from({ length: 48 }, () => f.control.publicCors()));
  expect(policies.every((policy) => policy.origins[0] === 'https://published.example')).toBe(true);
  expect(transaction).toHaveBeenCalledTimes(1);
  f.publish(2);
  f.origins([]);
  expect((await f.control.publicCors()).origins).toEqual([]);
  expect(transaction).toHaveBeenCalledTimes(2);
});

it('never joins a CORS snapshot after its transaction has started or lets old completion clear the next batch', async () => {
  const f = fixture();
  f.publish();
  let entered!: () => void, finish!: () => void, startNext!: () => void;
  const committed = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const finishOld = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const nextReady = new Promise<void>((resolve) => {
    startNext = resolve;
  });
  const original = f.database.transaction.bind(f.database);
  const transaction = vi.spyOn(f.database, 'transaction');
  transaction.mockImplementationOnce(async (work) => {
    const result = await original(work);
    entered();
    await finishOld;
    return result;
  });
  transaction.mockImplementationOnce(async (work) => {
    await nextReady;
    return original(work);
  });
  const old = f.control.publicCors();
  await committed;
  f.publish(2);
  f.origins([]);
  const next = f.control.publicCors();
  expect(next).not.toBe(old);
  finish();
  expect((await old).origins).toEqual(['https://published.example']);
  expect(f.control.publicCors()).toBe(next);
  startNext();
  expect((await next).origins).toEqual([]);
  expect(transaction).toHaveBeenCalledTimes(2);
});

it('restores the caller timeout settings only after successful bounded control reads', async () => {
  for (const [statement, lock] of [
    ['5s', '750ms'],
    ['500ms', '0'],
    ['0', '100ms'],
  ]) {
    const f = fixture();
    f.timeouts(statement!, lock!);
    await f.db.transaction((tx) => f.control.lock(tx, 'cops-robbers'));
    expect(f.queries.at(-1)!.params).toEqual([statement, lock]);
    expect(f.queries.filter((q) => q.sql.includes('pg_advisory_xact_lock_shared'))).toHaveLength(1);
    expect(f.queries.some((q) => q.sql.includes('pg_advisory_unlock'))).toBe(false);
  }
  const failed = fixture();
  failed.failRestore();
  await expect(
    failed.db.transaction((tx) => failed.control.lock(tx, 'cops-robbers')),
  ).rejects.toMatchObject({ code: 'CONTROL_UNAVAILABLE' });
  const late = fixture();
  late.queryDelay(600);
  await expect(
    late.db.transaction((tx) => late.control.lock(tx, 'cops-robbers')),
  ).rejects.toMatchObject({ code: 'CONTROL_UNAVAILABLE' });
  expect(late.queries.some((q) => q.params[0] === '5s')).toBe(false);
});
it('shrinks each SQL budget, rejects the failed batch and memoizes observations only after successful commit', async () => {
  const f = fixture();
  f.publish();
  f.queryDelay(50);
  f.failCommit(true);
  const failed = await Promise.allSettled(Array.from({ length: 48 }, () => f.control.publicCors()));
  expect(
    failed.every(
      (result) => result.status === 'rejected' && result.reason.code === 'CONTROL_UNAVAILABLE',
    ),
  ).toBe(true);
  f.failCommit(false);
  await f.control.publicCors();
  const observations = f.queries.filter((q) =>
    q.sql.startsWith('insert into game_control.application_observations'),
  );
  expect(observations).toHaveLength(2);
  const firstTransaction = f.queries.slice(0, f.queries.indexOf(observations[0]!) + 1);
  const timeouts = firstTransaction
    .filter((q) => q.sql.includes("set_config('statement_timeout'"))
    .map((q) => Number(String(q.params[0]).replace('ms', '')));
  expect(timeouts[0]).toBe(2000);
  expect(timeouts.at(-1)).toBeLessThan(2000);
  expect(timeouts.every((ms, index) => index === 0 || ms < timeouts[index - 1]!)).toBe(true);
  const slow = fixture();
  slow.publish();
  slow.queryDelay(2001);
  await expect(slow.control.publicCors()).rejects.toMatchObject({ code: 'CONTROL_UNAVAILABLE' });
  expect(slow.queries.some((q) => q.sql.includes('insert into'))).toBe(false);
});
it('counts lock wait in its two-second budget and never falls back after errors or digest corruption', async () => {
  const f = fixture();
  f.publish();
  f.delay();
  await expect(f.control.cors()).rejects.toMatchObject({ code: 'CONTROL_UNAVAILABLE' });
  expect(
    f.queries.some(
      (q) => q.sql.includes("set_config('lock_timeout'") && q.params.includes('1500ms'),
    ),
  ).toBe(true);
  const broken = fixture();
  broken.publish();
  await broken.control.publicCors();
  broken.queries.length = 0;
  broken.breakDigest();
  await expect(broken.control.publicCors()).rejects.toMatchObject({ code: 'CONTROL_UNAVAILABLE' });
  expect(broken.queries.some((q) => q.sql.includes('insert into'))).toBe(false);
  expect(() =>
    createCompetitionControl(broken.database, fallback, Date.now, 'x'.repeat(129)),
  ).toThrow();
});
it('reads a complete sorted projection within the budget despite round-trip latency', async () => {
  const f = fixture();
  f.publish();
  f.queryDelay(200);
  expect((await f.control.publicCors()).origins).toEqual(['https://published.example']);
  const locks = f.queries.filter((q) => q.sql.includes('pg_advisory_xact_lock_shared'));
  expect(locks).toHaveLength(1);
  expect(locks[0]!.sql).toContain('order by position');
  expect(locks[0]!.sql.match(/::int/g)).toHaveLength(CONTROL_GAME_IDS.length);
  expect(locks[0]!.params).toEqual(
    [...CONTROL_GAME_IDS].sort().flatMap((game, index) => [game, index]),
  );
});
it('uses the exact shared publication key, and all twelve games permanently reject an old epoch', async () => {
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
