import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import { createAdminStore } from '../dist/admin/store.js';
import { createManagementService } from '../dist/app.js';

const dockerBin = process.env.DOCKER_EXECUTABLE ?? 'H:/setup/Docker/resources/bin/docker.exe';
const sourceName = 'small-games-h5-matrix-20261015';
const runId = `admin-auth-${randomUUID()}`;
const fixtureLabel = 'management-admin-isolated';
const sourceLabel = 'h5-ad-service-matrix';
const volumeName = `${runId}-data`,
  networkName = `${runId}-network`;
let containerId,
  volumeCreated = false,
  networkId,
  stage = 'source-guard';
let owner, application, app, httpOrigin;
const digest = (value) => createHash('sha256').update(value).digest('hex');
const docker = (args, input) =>
  execFileSync(dockerBin, args, {
    encoding: 'utf8',
    input,
    timeout: 60000,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
const inspect = (id, fields) => JSON.parse(docker(['inspect', id, '--format', fields]));
const metadata = (id) =>
  inspect(
    id,
    '{"id":{{json .Id}},"image":{{json .Image}},"labels":{{json .Config.Labels}},"mounts":{{json .Mounts}},"ports":{{json .NetworkSettings.Ports}},"networks":{{json .NetworkSettings.Networks}}}',
  );
const psql = (id, statement) =>
  docker(
    [
      'exec',
      '-i',
      id,
      'psql',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'platform_owner',
      '-d',
      'competition_test',
    ],
    statement,
  );
const sourceMeta = metadata(sourceName);
assert.equal(sourceMeta.labels['small-games.task'], sourceLabel);
assert.deepEqual(sourceMeta.ports['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: '15439' }]);
assert.ok(
  sourceMeta.mounts.some(
    (m) => m.Name === sourceName && m.Destination === '/var/lib/postgresql/data',
  ),
);
const schemaFingerprint = `select md5(jsonb_build_object(
 'schemas',(select jsonb_agg(jsonb_build_array(nspname,nspowner,nspacl::text) order by nspname) from pg_namespace where nspname not like 'pg_%' and nspname <> 'information_schema'),
 'relations',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relowner,c.relacl::text,c.relkind,c.relrowsecurity,c.relforcerowsecurity) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not like 'pg_%' and n.nspname <> 'information_schema'),
 'columns',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,a.attacl::text,pg_get_expr(d.adbin,d.adrelid)) order by n.nspname,c.relname,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname not like 'pg_%' and n.nspname <> 'information_schema' and a.attnum>0 and not a.attisdropped),
 'roles',(select jsonb_agg(jsonb_build_array(rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls) order by rolname) from pg_roles),
 'members',(select jsonb_agg(jsonb_build_array(roleid,member,grantor,admin_option) order by roleid,member,grantor) from pg_auth_members))::text)`;
function sourceFingerprint() {
  const tableQueries = psql(
    sourceName,
    "select format('select %L || %L || md5(coalesce(string_agg(row_to_json(t)::text, %L order by row_to_json(t)::text), %L)) from %I.%I t;', tablename, ':', E'\\n', '', schemaname, tablename) from pg_tables where schemaname='runtime' order by tablename",
  );
  return digest(
    psql(sourceName, schemaFingerprint) +
      '\n' +
      (tableQueries ? psql(sourceName, tableQueries) : ''),
  );
}
const sourceBefore = sourceFingerprint();
const migration = await readFile(
  new URL('../../../infra/admin-console/migrations/001-admin-auth.sql', import.meta.url),
  'utf8',
);
const repository = new URL('../../../', import.meta.url);
const sourceFiles = [
  'services/management-api/src/app.ts',
  'services/management-api/src/config.ts',
  ...['config', 'store', 'routes', 'github'].map(
    (name) => `services/management-api/src/admin/${name}.ts`,
  ),
  ...['cors', 'database', 'server', 'index'].map((name) => `packages/service-kit/src/${name}.ts`),
  'infra/admin-console/migrations/001-admin-auth.sql',
  'services/management-api/tests/admin-postgres.mjs',
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sourceFiles.map(async (path) => [path, digest(await readFile(new URL(path, repository)))]),
  ),
);
const normalizedSourceHashes = Object.fromEntries(
  await Promise.all(
    sourceFiles.map(async (path) => [
      path,
      digest((await readFile(new URL(path, repository), 'utf8')).replace(/\r\n/g, '\n')),
    ]),
  ),
);
const buildFiles = sourceFiles
  .filter((path) => path.includes('/src/'))
  .map((path) => path.replace('/src/', '/dist/').replace(/\.ts$/, '.js'));
const buildHashes = Object.fromEntries(
  await Promise.all(
    buildFiles.map(async (path) => [path, digest(await readFile(new URL(path, repository)))]),
  ),
);
const receipt = {
  sourceHashes,
  normalizedSourceHashes,
  buildHashes,
  runId,
  postgresVersion: '',
  sourceContainerId: sourceMeta.id,
  sourceBefore,
  sameSourceAfter: false,
  isolated: true,
  loopbackOnly: true,
  migrationApplications: 0,
  rejectedStates: [],
  realGithubVerified: false,
  persistedAfterRestart: false,
};
const progress = (value) => {
  stage = value;
  console.log(`ADMIN_PG_STAGE ${value}`);
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function ready() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      docker([
        'exec',
        containerId,
        'pg_isready',
        '-h',
        '127.0.0.1',
        '-U',
        'platform_owner',
        '-d',
        'competition_test',
      ]);
      psql(containerId, 'select 1');
      return;
    } catch {
      await delay(500);
    }
  }
  throw new Error('Fixture readiness deadline');
}
function guardContainer() {
  const current = metadata(containerId);
  assert.equal(current.id, containerId);
  assert.equal(current.labels['small-games.task'], fixtureLabel);
  assert.equal(current.labels['small-games.fixture'], runId);
  assert.notEqual(current.id, sourceMeta.id);
  assert.deepEqual(Object.keys(current.networks), [networkName]);
  assert.ok(
    current.mounts.some(
      (m) => m.Name === volumeName && m.Destination === '/var/lib/postgresql/data',
    ),
  );
  return current;
}
try {
  progress('create-isolated-fixture');
  assert.throws(() => docker(['volume', 'inspect', volumeName]));
  assert.throws(() => docker(['network', 'inspect', networkName]));
  assert.throws(() => docker(['inspect', runId]));
  docker([
    'volume',
    'create',
    '--label',
    `small-games.task=${fixtureLabel}`,
    '--label',
    `small-games.fixture=${runId}`,
    volumeName,
  ]);
  volumeCreated = true;
  networkId = docker([
    'network',
    'create',
    '--label',
    `small-games.task=${fixtureLabel}`,
    '--label',
    `small-games.fixture=${runId}`,
    networkName,
  ]);
  const password = randomBytes(32).toString('hex'),
    appPassword = randomBytes(32).toString('hex');
  containerId = docker([
    'run',
    '-d',
    '--name',
    runId,
    '--label',
    `small-games.task=${fixtureLabel}`,
    '--label',
    `small-games.fixture=${runId}`,
    '--network',
    networkName,
    '--publish',
    '127.0.0.1::5432',
    '--mount',
    `type=volume,source=${volumeName},target=/var/lib/postgresql/data`,
    '--env',
    'POSTGRES_USER=platform_owner',
    '--env',
    'POSTGRES_DB=competition_test',
    '--env',
    `POSTGRES_PASSWORD=${password}`,
    sourceMeta.image,
  ]);
  await ready();
  const initial = guardContainer();
  const port = initial.ports['5432/tcp'][0].HostPort;
  assert.ok(Number.isInteger(Number(port)) && Number(port) > 0);
  assert.equal(initial.ports['5432/tcp'][0].HostIp, '127.0.0.1');
  receipt.postgresVersion = psql(containerId, 'show server_version');
  assert.match(receipt.postgresVersion, /^17\.6/);
  psql(
    containerId,
    `revoke all on database competition_test from public; revoke all on schema public from public;
    create role management_app login password '${appPassword}'; create role runtime_app login; create role wrong_owner;
    grant connect on database competition_test to management_app,runtime_app;
    create schema runtime; create table runtime.sentinel (id integer primary key, value text not null);
    insert into runtime.sentinel values (1,'preserve original game rows'); grant usage on schema runtime to runtime_app; grant select on runtime.sentinel to runtime_app;`,
  );
  const gameBefore = psql(
    containerId,
    "select md5(jsonb_build_object('rows',(select jsonb_agg(t) from runtime.sentinel t),'owner',(select relowner from pg_class where oid='runtime.sentinel'::regclass),'acl',(select relacl::text from pg_class where oid='runtime.sentinel'::regclass))::text)",
  );
  progress('reject-partial-schema');
  psql(containerId, 'create schema admin_console');
  const partialBefore = psql(containerId, schemaFingerprint);
  assert.throws(() => psql(containerId, migration));
  assert.equal(psql(containerId, schemaFingerprint), partialBefore);
  receipt.rejectedStates.push('partial-schema');
  psql(containerId, 'drop schema admin_console');
  progress('migration-and-idempotence');
  psql(containerId, migration);
  receipt.migrationApplications++;
  const migrated = psql(containerId, schemaFingerprint);
  psql(containerId, migration);
  receipt.migrationApplications++;
  assert.equal(psql(containerId, schemaFingerprint), migrated);
  owner = openDatabase(
    `postgres://platform_owner:${password}@127.0.0.1:${port}/competition_test`,
    'management',
  );
  application = openDatabase(
    `postgres://management_app:${appPassword}@127.0.0.1:${port}/competition_test`,
    'management',
  );
  const store = createAdminStore(application.db);
  progress('real-pool-connections');
  await owner.db.execute(sql`select 1`);
  await application.db.execute(sql`select 1`);
  const fixtureFingerprint = async () =>
    (await owner.db.execute(sql.raw(schemaFingerprint)))[0].md5;
  progress('reject-unknown-shape-owner-and-acl');
  for (const [name, mutate, restore] of [
    [
      'extra-column',
      'alter table admin_console.admin_sessions add column extra text',
      'alter table admin_console.admin_sessions drop column extra',
    ],
    [
      'unknown-table',
      'create table admin_console.unexpected (id integer)',
      'drop table admin_console.unexpected',
    ],
    [
      'different-owner',
      'alter table admin_console.admin_sessions owner to wrong_owner',
      'alter table admin_console.admin_sessions owner to platform_owner',
    ],
    [
      'application-update',
      'grant update on admin_console.admin_sessions to management_app',
      'revoke update on admin_console.admin_sessions from management_app',
    ],
    [
      'ledger-write',
      'grant insert on admin_console.schema_version to management_app',
      'revoke insert on admin_console.schema_version from management_app',
    ],
    [
      'public-read',
      'grant select on admin_console.admin_sessions to public',
      'revoke select on admin_console.admin_sessions from public',
    ],
    [
      'column-default',
      'alter table admin_console.admin_sessions alter column expires_at set default 0',
      'alter table admin_console.admin_sessions alter column expires_at drop default',
    ],
    [
      'identity-column',
      'alter table admin_console.schema_version alter column version add generated always as identity',
      'alter table admin_console.schema_version alter column version drop identity',
    ],
    [
      'row-security',
      'alter table admin_console.admin_sessions enable row level security',
      'alter table admin_console.admin_sessions disable row level security',
    ],
    [
      'external-inheritance',
      'create table runtime.auth_parent (like admin_console.admin_sessions including constraints); alter table admin_console.admin_sessions inherit runtime.auth_parent',
      'alter table admin_console.admin_sessions no inherit runtime.auth_parent; drop table runtime.auth_parent',
    ],
    [
      'brin-instead-of-btree',
      'do $$ begin drop index admin_console.admin_sessions_expires_at_idx; create index admin_sessions_expires_at_idx on admin_console.admin_sessions using brin (expires_at); end $$',
      'do $$ begin drop index admin_console.admin_sessions_expires_at_idx; create index admin_sessions_expires_at_idx on admin_console.admin_sessions using btree (expires_at); end $$',
    ],
    [
      'role-membership',
      'grant wrong_owner to management_app',
      'revoke wrong_owner from management_app',
    ],
  ]) {
    progress(`reject:${name}`);
    await owner.db.execute(sql.raw(mutate));
    const before = await fixtureFingerprint();
    assert.throws(() => psql(containerId, migration), name);
    assert.equal(await fixtureFingerprint(), before, name);
    await owner.db.execute(sql.raw(restore));
    receipt.rejectedStates.push(name);
  }
  psql(containerId, migration);
  receipt.migrationApplications++;
  progress('least-privilege');
  for (const statement of [
    'update admin_console.admin_sessions set login=login',
    'update admin_console.admin_oauth_flows set verifier=verifier',
    'insert into admin_console.schema_version values (1)',
    'delete from admin_console.schema_version',
    'create table admin_console.forbidden (id integer)',
    'select * from runtime.sentinel',
    'delete from runtime.sentinel',
  ])
    await assert.rejects(application.db.execute(sql.raw(statement)), undefined, statement);
  const permissions = psql(
    containerId,
    "select json_build_object('runtimeSchema',has_schema_privilege('runtime_app','admin_console','usage'),'runtimeTable',has_table_privilege('runtime_app','admin_console.admin_sessions','select'),'appOwnerMaintain',has_table_privilege('management_app','admin_console.admin_sessions','maintain'),'ownerMaintain',has_table_privilege('platform_owner','admin_console.admin_sessions','maintain'),'ledgerSelect',has_table_privilege('management_app','admin_console.schema_version','select'))",
  );
  receipt.permissions = JSON.parse(permissions);
  assert.deepEqual(receipt.permissions, {
    runtimeSchema: false,
    runtimeTable: false,
    appOwnerMaintain: false,
    ownerMaintain: true,
    ledgerSelect: true,
  });
  progress('real-drizzle-flow-and-refresh');
  const now = Date.now(),
    flowHash = digest(randomUUID());
  await store.putFlow(flowHash, {
    verifier: randomBytes(32).toString('base64url'),
    callback: 'https://admin.nenggongzhiren.cn/api/auth/github/callback',
    expiresAt: now + 600000,
  });
  const consumed = await Promise.all([
    store.takeFlow(flowHash, now),
    store.takeFlow(flowHash, now),
  ]);
  assert.equal(consumed.filter(Boolean).length, 1);
  assert.equal(await store.takeFlow(flowHash, now), undefined);
  const expiredHash = digest(randomUUID());
  await store.putFlow(expiredHash, {
    verifier: randomBytes(32).toString('base64url'),
    callback: 'https://admin.nenggongzhiren.cn/api/auth/github/callback',
    expiresAt: now - 1,
  });
  assert.equal(await store.takeFlow(expiredHash, now), undefined);
  progress('family-revocation-lock-orders');
  const independent = digest(randomUUID());
  const identity = {
    githubId: '123',
    login: 'fixture-creator',
    email: '1521152077@qq.com',
    expiresAt: now + 8 * 3600000,
  };
  await store.putSession(independent, identity);
  for (const afterLock of [true, false]) {
    const original = digest(randomUUID()),
      replacement = digest(randomUUID());
    await store.putSession(original, identity);
    let entered, release;
    const barrier = new Promise((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise((resolve) => {
      release = resolve;
    });
    const dialect = new PgDialect();
    const paused = new Proxy(application.db, {
      get(target, property) {
        if (property !== 'transaction') return Reflect.get(target, property);
        return (callback) =>
          target.transaction((tx) =>
            callback(
              new Proxy(tx, {
                get(transaction, key) {
                  if (key !== 'execute') return Reflect.get(transaction, key);
                  return async (query) => {
                    if (!dialect.sqlToQuery(query).sql.includes('pg_advisory_xact_lock'))
                      return transaction.execute(query);
                    if (!afterLock) {
                      entered();
                      await blocked;
                    }
                    const result = await transaction.execute(query);
                    if (afterLock) {
                      entered();
                      await blocked;
                    }
                    return result;
                  };
                },
              }),
            ),
          );
      },
    });
    const rotating = createAdminStore(paused).rotateSession(original, replacement, now);
    let deadline, revoking;
    try {
      await Promise.race([
        barrier,
        new Promise((_, reject) => {
          deadline = setTimeout(() => reject(new Error('Family lock barrier deadline')), 10000);
        }),
      ]);
      clearTimeout(deadline);
      revoking = store.deleteSession(original);
      if (afterLock) {
        let waiting = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          const rows = await owner.db.execute(
            sql`select count(*)::integer as count from pg_stat_activity where usename='management_app' and wait_event='advisory'`,
          );
          if (rows[0].count > 0) {
            waiting = true;
            break;
          }
          await delay(20);
        }
        assert(waiting, 'Logout did not wait for the actual family lock');
      } else await revoking;
      release();
      const rotated = await rotating;
      await revoking;
      assert.equal(Boolean(rotated), afterLock);
    } finally {
      clearTimeout(deadline);
      release();
      await Promise.allSettled([rotating, revoking]);
    }
    for (const hash of [original, replacement]) {
      assert.equal(await store.getSession(hash, now), undefined);
      assert.equal(await store.getLogoutSession(hash, now), undefined);
    }
    assert(await store.getSession(independent, now));
  }
  receipt.familyLockOrders = ['refresh-then-logout', 'logout-then-refresh'];
  const token = randomBytes(32).toString('base64url'),
    expiresAt = now + 8 * 3600000;
  await store.putSession(digest(token), {
    githubId: '123',
    login: 'fixture-creator',
    email: '1521152077@qq.com',
    expiresAt,
  });
  const httpPort = await new Promise((resolve, reject) => {
    const reservation = createServer();
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', () => {
      const selected = reservation.address().port;
      reservation.close((error) => (error ? reject(error) : resolve(selected)));
    });
  });
  const serviceEnv = {
    MANAGEMENT_CAPABILITIES: 'admin',
    MANAGEMENT_DATABASE_URL: `postgres://management_app:${appPassword}@127.0.0.1:${port}/competition_test`,
    ADMIN_ORIGIN: `http://127.0.0.1:${httpPort}`,
  };
  const request = async (path, cookie, method = 'GET', csrfToken) =>
    fetch(`${httpOrigin}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        ...(cookie ? { cookie: `sg_admin_session=${cookie}` } : {}),
        ...(method === 'POST' ? { origin: serviceEnv.ADMIN_ORIGIN } : {}),
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
    });
  async function start() {
    app = createManagementService(serviceEnv, false);
    await app.listen({ host: '127.0.0.1', port: httpPort });
    httpOrigin = `http://127.0.0.1:${app.server.address().port}`;
  }
  await start();
  assert.equal((await request('/health')).status, 200);
  assert.equal((await request('/api/session')).status, 401);
  assert.equal((await request('/api/auth/github')).status, 302);
  const me = await (await request('/api/session', token)).json();
  assert.equal(me.user.login, 'fixture-creator');
  assert.equal(me.expiresAt, expiresAt);
  assert.equal((await request('/api/logout', token, 'POST')).status, 403);
  const refreshed = await Promise.all([
    request('/api/refresh', token, 'POST', me.csrfToken),
    request('/api/refresh', token, 'POST', me.csrfToken),
  ]);
  assert.deepEqual(refreshed.map((r) => r.status).sort(), [200, 401]);
  const success = refreshed.find((r) => r.status === 200),
    refreshedBody = await success.json();
  assert.equal(refreshedBody.expiresAt, expiresAt);
  assert.notEqual(refreshedBody.csrfToken, me.csrfToken);
  const cookieHeader = success.headers
    .getSetCookie()
    .find((value) => value.startsWith('sg_admin_session='));
  assert.match(cookieHeader, /Path=\/api\//);
  assert.doesNotMatch(cookieHeader, /Domain=/);
  const replacement = cookieHeader.match(/^sg_admin_session=([^;]+)/)[1];
  assert.equal((await request('/api/session', token)).status, 401);
  // A retired token retains only the capability to revoke its own logical session.
  const retiredToken = randomBytes(32).toString('base64url');
  await store.putSession(digest(retiredToken), identity);
  const retiredMe = await (await request('/api/session', retiredToken)).json();
  const late = await request('/api/refresh', retiredToken, 'POST', retiredMe.csrfToken);
  assert.equal(late.status, 200);
  const lateToken = late.headers
    .getSetCookie()
    .find((value) => value.startsWith('sg_admin_session='))
    .match(/^sg_admin_session=([^;]+)/)[1];
  assert.equal(
    (await request('/api/refresh', retiredToken, 'POST', retiredMe.csrfToken)).status,
    401,
  );
  assert.equal(
    (await request('/api/logout', retiredToken, 'POST', retiredMe.csrfToken)).status,
    200,
  );
  assert.equal((await request('/api/session', lateToken)).status, 401);
  assert(await store.getSession(independent, now));
  receipt.retiredTokenRevokesOnlyOwnFamily = true;
  await app.close();
  app = undefined;
  await application.close();
  application = undefined;
  await owner.close();
  owner = undefined;
  progress('postgres-and-service-restart');
  const oldMounts = JSON.stringify(guardContainer().mounts);
  docker(['restart', containerId]);
  await ready();
  assert.equal(JSON.stringify(guardContainer().mounts), oldMounts);
  const resumedPort = guardContainer().ports['5432/tcp'][0].HostPort;
  assert.ok(Number.isInteger(Number(resumedPort)) && Number(resumedPort) > 0);
  serviceEnv.MANAGEMENT_DATABASE_URL = `postgres://management_app:${appPassword}@127.0.0.1:${resumedPort}/competition_test`;
  await start();
  const persisted = await request('/api/session', replacement);
  assert.equal(persisted.status, 200);
  const persistedBody = await persisted.json();
  assert.equal(persistedBody.user.login, 'fixture-creator');
  assert.equal(persistedBody.expiresAt, expiresAt);
  assert.equal(
    (await request('/api/logout', replacement, 'POST', persistedBody.csrfToken)).status,
    200,
  );
  assert.equal((await request('/api/session', replacement)).status, 401);
  assert.equal(
    psql(
      containerId,
      "select md5(jsonb_build_object('rows',(select jsonb_agg(t) from runtime.sentinel t),'owner',(select relowner from pg_class where oid='runtime.sentinel'::regclass),'acl',(select relacl::text from pg_class where oid='runtime.sentinel'::regclass))::text)",
    ),
    gameBefore,
  );
  receipt.persistedAfterRestart = true;
  receipt.gameSentinelPreserved = true;
  receipt.sourceAfter = sourceFingerprint();
  receipt.sameSourceAfter = receipt.sourceAfter === sourceBefore;
  assert.equal(receipt.sourceAfter, sourceBefore);
  assert.deepEqual(metadata(sourceName), sourceMeta);
  for (const [path, hash] of Object.entries(sourceHashes))
    assert.equal(
      digest(await readFile(new URL(path, repository))),
      hash,
      `Source changed during proof: ${path}`,
    );
  progress('complete');
  const evidence = new URL('../../../docs/admin-console/qa/postgres-current.json', import.meta.url);
  await mkdir(new URL('.', evidence), { recursive: true });
  await writeFile(evidence, JSON.stringify(receipt, null, 2) + '\n');
  console.log(
    'PASS: isolated PostgreSQL migration, ACL, fail-closed shapes, Drizzle flow/refresh, HTTP CSRF, restart persistence; source unchanged',
  );
} catch (error) {
  console.error(
    `ADMIN_PG_FAILED ${stage}: ${error instanceof assert.AssertionError ? error.message : `${error.name} ${error.cause?.code ?? error.code ?? ''}`}`,
  );
  process.exitCode = 1;
} finally {
  if (app) await app.close();
  if (application) await application.close();
  if (owner) await owner.close();
  if (containerId) {
    guardContainer();
    docker(['rm', '--force', containerId]);
  }
  if (networkId) {
    const n = JSON.parse(docker(['network', 'inspect', networkId]))[0];
    assert.equal(n.Labels['small-games.fixture'], runId);
    assert.equal(n.Id, networkId);
    docker(['network', 'rm', networkId]);
  }
  if (volumeCreated) {
    const v = JSON.parse(docker(['volume', 'inspect', volumeName]))[0];
    assert.equal(v.Labels['small-games.fixture'], runId);
    assert.equal(v.Name, volumeName);
    assert.equal(
      docker(['ps', '--all', '--filter', `volume=${volumeName}`, '--format', '{{.ID}}']),
      '',
    );
    docker(['volume', 'rm', volumeName]);
  }
  assert.equal(sourceFingerprint(), sourceBefore);
  assert.deepEqual(metadata(sourceName), sourceMeta);
}
