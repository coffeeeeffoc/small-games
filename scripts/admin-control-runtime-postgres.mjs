import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { openControlDatabase } from '@coffeeeeffoc/service-kit';
import { createCompetitionControl } from '../services/runtime-api/dist/competition/control.js';
import { assertStoredPlayerGame } from '../services/runtime-api/dist/competition/auth.js';

const barrier = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
/** Equivalent real result/best FK + board order, using the production authorization lock. */
export async function verifyCompetitionIdentityLocks({ owner, checked }) {
  const migration = await readFile(
    new URL('../infra/migrations/010-competition.sql', import.meta.url),
    'utf8',
  );
  // Exact competition table definitions, deliberately excluding all migration GRANT statements.
  for (const statement of migration.slice(0, migration.indexOf('GRANT ')).split(';'))
    if (statement.trim() && statement.trim() !== 'BEGIN')
      await owner.db.execute(sql.raw(statement));
  const ids = [randomUUID(), randomUUID()];
  for (const id of ids)
    await owner.db.execute(
      sql`insert into runtime.competition_players(id,created_at) values(${id},${Date.now()})`,
    );
  async function waitBlocked(pid, blocker) {
    const deadline = performance.now() + 2000;
    while (performance.now() < deadline) {
      const rows = await owner.db.execute(
        sql`select ${blocker}::int=any(pg_blocking_pids(${pid}::int)) as blocked`,
      );
      if (rows[0].blocked) return;
    }
    assert.fail('expected PostgreSQL lock barrier was not reached');
  }
  async function settlePair(legacy) {
    const board = `lock-regression-${randomUUID()}`;
    const firstEntered = barrier(),
      secondEntered = barrier(),
      finishFirst = barrier();
    let firstPid, secondPid;
    const lockPlayer = (tx, id) =>
      legacy
        ? tx.execute(sql`select id from runtime.competition_players where id=${id} for update`)
        : assertStoredPlayerGame(tx, id, 'cops-robbers', Date.now());
    const settle = async (tx, match) => {
      for (const id of ids) {
        await tx.execute(
          sql`insert into runtime.competition_results values(${match},${board},${id},1,0,${Date.now()})`,
        );
        await tx.execute(sql`insert into runtime.competition_best values(${board},${id},1,0,${match},${Date.now()})
          on conflict(board,player_id) do update set match_id=excluded.match_id`);
      }
    };
    const first = owner.db.transaction(async (tx) => {
      await tx.execute(sql`set local deadlock_timeout='100ms'`);
      await tx.execute(sql`set local statement_timeout='4000ms'`);
      firstPid = Number((await tx.execute(sql`select pg_backend_pid() as pid`))[0].pid);
      await lockPlayer(tx, ids[0]);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${board}))`);
      firstEntered.resolve();
      await finishFirst.promise;
      await settle(tx, `${board}-one`);
    });
    const firstResult = first.then(
      () => ({ ok: true }),
      (error) => ({ ok: false, code: error.code ?? error.cause?.code }),
    );
    await firstEntered.promise;
    const second = owner.db.transaction(async (tx) => {
      await tx.execute(sql`set local deadlock_timeout='100ms'`);
      await tx.execute(sql`set local statement_timeout='4000ms'`);
      secondPid = Number((await tx.execute(sql`select pg_backend_pid() as pid`))[0].pid);
      await lockPlayer(tx, ids[1]);
      secondEntered.resolve();
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${board}))`);
      await settle(tx, `${board}-two`);
    });
    const secondResult = second.then(
      () => ({ ok: true }),
      (error) => ({ ok: false, code: error.code ?? error.cause?.code }),
    );
    try {
      await secondEntered.promise;
      await waitBlocked(secondPid, firstPid);
    } finally {
      finishFirst.resolve();
    }
    const results = await Promise.all([firstResult, secondResult]);
    const count = Number(
      (
        await owner.db.execute(
          sql`select count(*)::int as count from runtime.competition_results where board=${board}`,
        )
      )[0].count,
    );
    if (legacy) {
      assert.equal(
        results.filter((result) => result.code === '40P01').length,
        1,
        'old FOR UPDATE must reproduce the FK/board deadlock',
      );
      assert.equal(count, 2, 'only one old settlement commits');
    } else {
      assert.deepEqual(results, [{ ok: true }, { ok: true }]);
      assert.equal(count, 4, 'both production-lock settlements commit exactly once');
      assert.equal(
        Number(
          (
            await owner.db.execute(
              sql`select count(*)::int as count from runtime.competition_best where board=${board}`,
            )
          )[0].count,
        ),
        2,
      );
    }
  }
  await settlePair(true);
  await settlePair(false);
  checked('identity-player-no-key-update-prevents-real-result-FK-board-deadlock');
  // Upgrade/refresh keep FOR UPDATE: the weaker FK-compatible guard must still block them.
  const entered = barrier(),
    release = barrier();
  let guardPid, updatePid;
  const held = owner.db.transaction(async (tx) => {
    guardPid = Number((await tx.execute(sql`select pg_backend_pid() as pid`))[0].pid);
    await assertStoredPlayerGame(tx, ids[0], 'cops-robbers', Date.now());
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const updateEntered = barrier();
  const updating = owner.db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='4000ms'`);
    updatePid = Number((await tx.execute(sql`select pg_backend_pid() as pid`))[0].pid);
    updateEntered.resolve();
    await tx.execute(sql`select id from runtime.competition_players where id=${ids[0]} for update`);
    await tx.execute(
      sql`update runtime.competition_players set platform='taptap',app_id='fixture-platform',subject='fixture-subject' where id=${ids[0]}`,
    );
  });
  try {
    await updateEntered.promise;
    await waitBlocked(updatePid, guardPid);
  } finally {
    release.resolve();
  }
  await Promise.all([held, updating]);
  checked('identity-resource-guard-still-serializes-with-upgrade-and-refresh-player-lock');
  return {
    fixture: 'real-010-tables-no-additional-grants-owner-only-lock-regression',
    oldLock: '40P01-reproduced',
    productionLock: 'two-settlements-committed-upgrade-lock-serialized',
    sourceSha256: createHash('sha256')
      .update(
        await readFile(new URL('../services/runtime-api/src/competition/auth.ts', import.meta.url)),
      )
      .digest('hex'),
    executedModuleSha256: createHash('sha256')
      .update(
        await readFile(
          new URL('../services/runtime-api/dist/competition/auth.js', import.meta.url),
        ),
      )
      .digest('hex'),
  };
}
/** Runs only inside the caller's fresh labelled fixture, with its existing Runtime role. */
export async function verifyRuntimeControl({ url, owner, runtime, checked }) {
  const database = openControlDatabase(url);
  const instanceId = `bounded-${randomUUID()}`;
  const control = createCompetitionControl(
    database,
    {
      origins: [],
      methods: ['GET', 'POST', 'OPTIONS'],
      headers: ['content-type', 'authorization'],
      credentials: false,
      maxAge: 600,
    },
    Date.now,
    instanceId,
  );
  const observations = async () =>
    Number(
      (
        await owner.db.execute(
          sql`select count(*)::int as count from game_control.application_observations where instance_id=${instanceId}`,
        )
      )[0].count,
    );
  try {
    for (const [statement, lock] of [
      ['5s', '750ms'],
      ['500ms', '0'],
      ['0', '100ms'],
    ]) {
      await runtime.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('statement_timeout',${statement},true),
          set_config('lock_timeout',${lock},true)`);
        const before = (
          await tx.execute(sql`select current_setting('statement_timeout') as statement,
          current_setting('lock_timeout') as lock`)
        )[0];
        await control.lock(tx, 'cops-robbers');
        const after = (
          await tx.execute(sql`select current_setting('statement_timeout') as statement,
          current_setting('lock_timeout') as lock`)
        )[0];
        assert.deepEqual(after, before, 'control success must restore exact caller timeouts');
        await owner.db.transaction(async (publisher) => {
          const rows = await publisher.execute(sql`select pg_try_advisory_xact_lock(
            hashtextextended('game-control:cops-robbers',0)) as acquired`);
          assert.equal(rows[0].acquired, false, 'restoring settings must retain the shared lock');
        });
        if (statement === '5s') await tx.execute(sql`select pg_sleep(2.1)`);
      });
    }
    checked('runtime-control-restores-caller-timeouts-with-shared-lock-held-through-business-sql');
    const policyEntered = barrier(),
      policyRelease = barrier();
    const policyHolder = owner.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('game-control:cops-robbers',0))`,
      );
      policyEntered.resolve();
      await policyRelease.promise;
    });
    await policyEntered.promise;
    try {
      const started = performance.now();
      await assert.rejects(
        runtime.db.transaction((tx) => control.lock(tx, 'cops-robbers')),
        { code: 'CONTROL_UNAVAILABLE' },
      );
      assert.ok(performance.now() - started <= 2300, 'control lock retains its bounded failure');
    } finally {
      policyRelease.resolve();
      await policyHolder;
    }
    checked('runtime-control-shared-lock-still-fails-closed-within-existing-budget');
    const entered = barrier(),
      release = barrier();
    const holder = owner.db.transaction(async (tx) => {
      await tx.execute(
        sql`lock table game_control.application_observations in access exclusive mode`,
      );
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    let elapsed;
    try {
      const start = performance.now();
      await assert.rejects(control.publicCors(), { code: 'CONTROL_UNAVAILABLE' });
      elapsed = performance.now() - start;
      assert.ok(
        elapsed <= 2300,
        `observation lock exceeded absolute budget: ${Math.round(elapsed)}ms`,
      );
    } finally {
      release.resolve();
      await holder;
    }
    assert.equal(await observations(), 0, 'blocked INSERT before COMMIT must roll back');
    assert.deepEqual((await control.publicCors()).origins, ['http://localhost:8080']);
    assert.equal(await observations(), 1, 'failed COMMIT path must not memoize application');
    checked('runtime-control-observation-lock-bounded-rollback-retry');
    await Promise.all([control.publicCors(), control.kartLease()]);
    checked('runtime-control-concurrent-cors-and-private-lease');

    const disconnectEntered = barrier(),
      disconnectRelease = barrier(),
      disconnectDone = barrier();
    let pid;
    const interrupted = database.transaction(async (tx) => {
      pid = Number((await tx.execute(sql`select pg_backend_pid() as pid`))[0].pid);
      disconnectEntered.resolve();
      try {
        await disconnectRelease.promise;
        await tx.execute(sql`insert into game_control.application_observations(id,consumer,instance_id,version,digest,status,observed_at)
          select ${randomUUID()},'runtime',${instanceId},version,digest,'applied',${Date.now()} from game_control.published_config`);
      } finally {
        disconnectDone.resolve();
      }
    });
    const rejected = assert.rejects(interrupted);
    await disconnectEntered.promise;
    await owner.db.execute(sql`select pg_terminate_backend(${pid})`);
    await rejected;
    disconnectRelease.resolve();
    await disconnectDone.promise;
    assert.equal(
      await observations(),
      1,
      'lost transaction cannot reconnect and insert in autocommit',
    );
    assert.equal((await database.transaction((tx) => tx.execute(sql`select 1 as ok`)))[0].ok, 1);
    checked('runtime-control-terminated-bound-connection-no-autocommit-reconnect');

    const nonSqlEntered = barrier(),
      nonSqlRelease = barrier(),
      nonSqlDone = barrier();
    let lateError;
    const start = performance.now();
    const suspended = database.transaction(async (tx) => {
      nonSqlEntered.resolve();
      try {
        await nonSqlRelease.promise;
        await tx.execute(sql`insert into game_control.application_observations(id,consumer,instance_id,version,digest,status,observed_at)
          select ${randomUUID()},'runtime',${instanceId},version,digest,'applied',${Date.now()} from game_control.published_config`);
      } catch (error) {
        lateError = error;
        throw error;
      } finally {
        nonSqlDone.resolve();
      }
    });
    const timedOut = assert.rejects(suspended, /CONTROL_UNAVAILABLE/);
    await nonSqlEntered.promise;
    await timedOut;
    assert.ok(performance.now() - start <= 2300, 'non-SQL await must not hold the caller or queue');
    assert.equal((await database.transaction((tx) => tx.execute(sql`select 1 as ok`)))[0].ok, 1);
    nonSqlRelease.resolve();
    await nonSqlDone.promise;
    assert.match(lateError.message, /CONTROL_UNAVAILABLE/);
    assert.equal(await observations(), 1);
    checked('runtime-control-non-sql-deadline-late-write-rejected-and-slot-recovers');

    const queueEntered = barrier(),
      queueRelease = barrier(),
      queueDone = barrier();
    const active = database.transaction(async (tx) => {
      queueEntered.resolve();
      try {
        await queueRelease.promise;
        await tx.execute(sql`select 1`);
      } finally {
        queueDone.resolve();
      }
    });
    const activeRejected = assert.rejects(active);
    await queueEntered.promise;
    const waiting = Array.from({ length: 5 }, () =>
      assert.rejects(database.transaction((tx) => tx.execute(sql`select 1`))),
    );
    await assert.rejects(
      database.transaction((tx) => tx.execute(sql`select 1`)),
      /CONTROL_UNAVAILABLE/,
    );
    database.close();
    await Promise.all([activeRejected, ...waiting]);
    queueRelease.resolve();
    await queueDone.promise;
    await assert.rejects(
      database.transaction((tx) => tx.execute(sql`select 1`)),
      /CONTROL_UNAVAILABLE/,
    );
    checked('runtime-control-finite-fifo-and-close-cancel-all-callers');
    const sourceSha256 = {};
    for (const [name, path] of Object.entries({
      controlDatabase: '../packages/service-kit/src/database.ts',
      runtimeControl: '../services/runtime-api/src/competition/control.ts',
    }))
      sourceSha256[name] = createHash('sha256')
        .update(await readFile(new URL(path, import.meta.url)))
        .digest('hex');
    const executedModuleSha256 = {};
    for (const [name, path] of Object.entries({
      controlDatabase: '../packages/service-kit/dist/database.js',
      runtimeControl: '../services/runtime-api/dist/competition/control.js',
    }))
      executedModuleSha256[name] = createHash('sha256')
        .update(await readFile(new URL(path, import.meta.url)))
        .digest('hex');
    return {
      observationLockMs: Math.round(elapsed),
      commitInFlight: 'unknown-no-rollback-guarantee',
      sourceSha256,
      executedModuleSha256,
    };
  } finally {
    control.close();
  }
}
