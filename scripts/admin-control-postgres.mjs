import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { openDatabase, controlSnapshotDigest } from '@coffeeeeffoc/service-kit';
import { createControlStore } from '../services/management-api/dist/admin/control-store.js';
import { createControlService } from '../services/management-api/dist/admin/control-service.js';
import { CONTROL_GAMES } from '../services/management-api/dist/admin/control-model.js';
import { createManagementService } from '../services/management-api/dist/app.js';
import {
  verifyRuntimeControl,
  verifyCompetitionIdentityLocks,
} from './admin-control-runtime-postgres.mjs';

// Fresh, labelled fixture only. Never connects to an existing container or database.
const dockerBin = process.env.DOCKER_EXECUTABLE ?? 'H:/setup/Docker/resources/bin/docker.exe';
const runId = `game-control-${randomUUID()}`;
const label = 'management-control-isolated';
const volume = `${runId}-data`,
  network = `${runId}-network`;
const docker = (args, input) =>
  execFileSync(dockerBin, args, {
    encoding: 'utf8',
    input,
    timeout: 60000,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
const metadata = (kind, id) => JSON.parse(docker([kind, 'inspect', id]))[0];
const password = randomBytes(32).toString('hex');
const appPassword = randomBytes(32).toString('hex');
const runtimePassword = randomBytes(32).toString('hex');
let containerId,
  networkId,
  volumeCreated = false,
  owner,
  management,
  runtime;
let stage = 'start';
const receipt = { runId, isolated: true, loopbackOnly: true, productionAccess: false, checks: [] };
const migration = await readFile(
  new URL('../infra/admin-console/migrations/002-control-center.sql', import.meta.url),
  'utf8',
);
receipt.migrationSha256 = createHash('sha256').update(migration).digest('hex');
const nightMigration = await readFile(
  new URL('../infra/admin-console/migrations/003-night-overwatch-control.sql', import.meta.url),
  'utf8',
);
receipt.nightMigrationSha256 = createHash('sha256').update(nightMigration).digest('hex');
const tetracubeMigration = await readFile(
  new URL('../infra/admin-console/migrations/004-tetracube-control.sql', import.meta.url),
  'utf8',
);
receipt.tetracubeMigrationSha256 = createHash('sha256').update(tetracubeMigration).digest('hex');
const helperMigration = execFileSync(
  process.platform === 'win32' ? 'python' : 'python3',
  [
    '-B',
    '-c',
    "import importlib.util,sys; from pathlib import Path; p=Path(sys.argv[1]).resolve(); s=importlib.util.spec_from_file_location('control_database',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(m.migration_file(p.parent,m.MIGRATION_SHA256))",
    fileURLToPath(new URL('../infra/admin-console/control-database.py', import.meta.url)),
  ],
  { encoding: 'utf8' },
);
const psql = (statement) =>
  docker(
    [
      'exec',
      '-i',
      containerId,
      'psql',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'platform_owner',
      '-d',
      'control_test',
    ],
    statement,
  );
const step = (name) => {
  stage = name;
  console.log(`CONTROL_PG_STAGE ${name}`);
};
const checked = (name) => {
  receipt.checks.push(name);
  console.log(`CONTROL_PG_CHECK ${name}`);
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function guard(requirePort = true) {
  const info = metadata('container', containerId);
  assert.equal(info.Id, containerId);
  assert.equal(info.Config.Labels['small-games.task'], label);
  assert.equal(info.Config.Labels['small-games.fixture'], runId);
  assert.deepEqual(Object.keys(info.NetworkSettings.Networks), [network]);
  assert.ok(
    info.Mounts.some(
      (mount) => mount.Name === volume && mount.Destination === '/var/lib/postgresql/data',
    ),
  );
  const ports = info.NetworkSettings.Ports['5432/tcp'];
  if (!requirePort) return;
  assert.equal(ports.length, 1);
  assert.equal(ports[0].HostIp, '127.0.0.1');
  return ports[0].HostPort;
}
async function ready() {
  for (let i = 0; i < 40; i++) {
    try {
      psql('select 1');
      return;
    } catch {
      await delay(500);
    }
  }
  throw new Error('PostgreSQL readiness deadline');
}
async function connect() {
  const port = guard();
  owner = openDatabase(
    `postgres://platform_owner:${password}@127.0.0.1:${port}/control_test`,
    'management',
  );
  management = openDatabase(
    `postgres://management_app:${appPassword}@127.0.0.1:${port}/control_test`,
    'management',
  );
  runtime = openDatabase(
    `postgres://runtime_app:${runtimePassword}@127.0.0.1:${port}/control_test`,
    'runtime',
  );
}
async function close() {
  for (const connection of [runtime, management, owner]) if (connection) await connection.close();
  owner = management = runtime = undefined;
}
async function managementHealth(status) {
  const app = createManagementService(
    {
      MANAGEMENT_CAPABILITIES: 'admin',
      MANAGEMENT_DATABASE_URL: `postgres://management_app:${appPassword}@127.0.0.1:${guard()}/control_test`,
      ADMIN_ORIGIN: 'https://admin.nenggongzhiren.cn',
      ADMIN_CONTROL_ENABLED: 'true',
    },
    false,
  );
  try {
    assert.equal(
      (await app.inject('/health')).statusCode,
      status,
      'control-enabled management readiness',
    );
    assert.equal((await app.inject('/health/live')).statusCode, 200);
  } finally {
    await app.close();
  }
}
const fingerprint = `select md5(jsonb_build_object(
 'relations',(select jsonb_agg(jsonb_build_array(c.relname,c.relowner,c.relacl::text,c.relkind) order by c.relname) from pg_class c where c.relnamespace='game_control'::regnamespace),
 'columns',(select jsonb_agg(jsonb_build_array(c.relname,a.attname,a.attacl::text,a.atttypid,a.attnotnull) order by c.relname,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='game_control'::regnamespace and a.attnum>0 and not a.attisdropped),
 'ledger',(select jsonb_agg(t) from game_control.active_head t),
 'members',(select jsonb_agg(t order by t.id) from game_control.members t),
 'policies',(select jsonb_agg(t order by t.game_id) from game_control.current_policy t))::text)`;
try {
  step('fresh-labelled-fixture');
  assert.throws(() => docker(['container', 'inspect', runId]));
  assert.throws(() => docker(['volume', 'inspect', volume]));
  assert.throws(() => docker(['network', 'inspect', network]));
  // Already available locally; no image pulls, credentials, or external connection.
  const image = metadata('image', 'postgres:17.6-alpine');
  volumeCreated = Boolean(
    docker(['volume', 'create', '--label', `small-games.fixture=${runId}`, volume]),
  );
  networkId = docker(['network', 'create', '--label', `small-games.fixture=${runId}`, network]);
  containerId = docker([
    'run',
    '-d',
    '--name',
    runId,
    '--label',
    `small-games.task=${label}`,
    '--label',
    `small-games.fixture=${runId}`,
    '--network',
    network,
    '--publish',
    '127.0.0.1::5432',
    '--memory',
    '256m',
    '--cpus',
    '1',
    '--mount',
    `type=volume,source=${volume},target=/var/lib/postgresql/data`,
    '--env',
    'POSTGRES_USER=platform_owner',
    '--env',
    'POSTGRES_DB=control_test',
    '--env',
    `POSTGRES_PASSWORD=${password}`,
    image.Id,
  ]);
  await ready();
  receipt.postgresVersion = psql('show server_version');
  psql(`revoke all on database control_test from public; revoke all on schema public from public;
    create role management_app login password '${appPassword}'; create role runtime_app login password '${runtimePassword}'; create role wrong_owner;
    grant connect on database control_test to management_app,runtime_app;
    create schema runtime; create table runtime.sentinel(id int primary key,value text); insert into runtime.sentinel values(1,'preserve rows and ACL');
    create schema admin_console; create table admin_console.sentinel(id int primary key,value text); insert into admin_console.sentinel values(1,'preserve admin');
    create table admin_console.schema_version(version int primary key); insert into admin_console.schema_version values(1);
    grant usage on schema admin_console to management_app; grant select on admin_console.schema_version to management_app;`);
  const sentinel = () =>
    psql(`select md5(jsonb_build_object('runtime',(select jsonb_agg(t) from runtime.sentinel t),'admin',(select jsonb_agg(t) from admin_console.sentinel t),
    'acl',(select jsonb_agg(jsonb_build_array(relowner,relacl::text) order by oid) from pg_class where oid in ('runtime.sentinel'::regclass,'admin_console.sentinel'::regclass)))::text)`);
  const beforeSentinel = sentinel();
  step('reject-inherited-global-default-ACL');
  psql(
    'create role default_reader; alter default privileges for role platform_owner grant select,update on tables to default_reader',
  );
  assert.throws(() => psql(migration));
  assert.equal(psql("select to_regnamespace('game_control') is null"), 't');
  assert.equal(sentinel(), beforeSentinel);
  psql(
    'alter default privileges for role platform_owner revoke select,update on tables from default_reader',
  );
  checked('reject-global-default-ACL-before-creating-schema');
  step('migration-idempotence');
  psql(migration);
  const before = psql(fingerprint);
  psql(migration);
  assert.equal(psql(fingerprint), before);
  assert.equal(sentinel(), beforeSentinel);
  checked('migration-twice-existing-data-and-ACL-preserved');
  await managementHealth(503);
  await connect();
  step('least-privilege');
  for (const statement of [
    'select * from game_control.members',
    'select * from game_control.roles',
    'select * from game_control.audit',
    'update game_control.current_policy set state=state',
    'delete from game_control.application_observations',
    'create table game_control.forbidden(id int)',
    'select * from admin_console.sentinel',
  ])
    await assert.rejects(runtime.db.execute(sql.raw(statement)), undefined, statement);
  await runtime.db.execute(sql`select * from game_control.current_policy`);
  await runtime.db.execute(sql`select * from game_control.published_config`);
  await runtime.db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock_shared(hashtextextended('game-control:cops-robbers',0))`,
    );
  });
  for (const statement of [
    'update game_control.revisions set reason=reason',
    'delete from game_control.audit',
    'insert into game_control.schema_version values(2)',
    'select * from runtime.sentinel',
  ])
    await assert.rejects(management.db.execute(sql.raw(statement)), undefined, statement);
  checked('runtime-read-only-policy-no-members-and-management-append-only-ledger');
  step('reject-unknown-owner-shape-and-ACL-without-repair');
  for (const [name, mutate, restore] of [
    [
      'column',
      'alter table game_control.members add column unexpected text',
      'alter table game_control.members drop column unexpected',
    ],
    ['table', 'create table game_control.unexpected(id int)', 'drop table game_control.unexpected'],
    [
      'owner',
      'alter table game_control.members owner to wrong_owner',
      'alter table game_control.members owner to platform_owner',
    ],
    [
      'runtime-update',
      'grant update on game_control.current_policy to runtime_app',
      'revoke update on game_control.current_policy from runtime_app',
    ],
    [
      'public-read',
      'grant select on game_control.members to public',
      'revoke select on game_control.members from public',
    ],
    [
      'foreign-key-namespace',
      'create table runtime.members(id uuid primary key); alter table game_control.member_roles drop constraint member_roles_member_id_fkey; alter table game_control.member_roles add constraint member_roles_member_id_fkey foreign key(member_id) references runtime.members(id)',
      'alter table game_control.member_roles drop constraint member_roles_member_id_fkey; alter table game_control.member_roles add constraint member_roles_member_id_fkey foreign key(member_id) references game_control.members(id); drop table runtime.members',
    ],
  ]) {
    psql(mutate);
    const altered = psql(fingerprint);
    assert.throws(() => psql(migration), name);
    assert.equal(psql(fingerprint), altered);
    psql(restore);
    psql(migration);
    checked(`fail-closed-${name}`);
  }
  step('real-store-bootstrap-and-members');
  const service = createControlService(
    createControlStore(management.db),
    'https://admin.example.test',
  );
  const a = {
    githubId: '123',
    login: 'a',
    email: 'a@example.test',
    expiresAt: Date.now() + 3600000,
  };
  const b = { githubId: '456', login: 'b', email: 'b@example.test', expiresAt: a.expiresAt };
  assert.equal(
    await service.access.identify({ ...a, emails: [a.email] }, new Set([a.email])),
    a.email,
  );
  assert.equal((await service.access.session(a)).roles[0], 'administrator');
  const second = await service.saveMember(a, undefined, {
    email: b.email,
    roleIds: ['administrator'],
    reason: 'second administrator',
  });
  assert.equal(await service.access.identify({ ...b, emails: [b.email] }, new Set()), b.email);
  const first = (await service.members(a)).find((member) => member.githubId === a.githubId);
  const race = await Promise.allSettled([
    service.saveMember(a, second.id, { active: false, reason: 'concurrent revoke B' }),
    service.saveMember(b, first.id, { active: false, reason: 'concurrent revoke A' }),
  ]);
  assert.equal(race.filter((result) => result.status === 'fulfilled').length, 1);
  const active =
    (await management.db.execute(sql`select github_id from game_control.members where active`))[0]
      .github_id === a.githubId
      ? a
      : b;
  const disabled = active === a ? b : a;
  assert.equal(await service.access.session(disabled), undefined);
  assert.equal(
    await service.access.identify(
      { ...disabled, emails: [disabled.email] },
      new Set([disabled.email]),
    ),
    undefined,
  );
  const currentMember = (await service.members(active)).find(
    (member) => member.githubId === active.githubId,
  );
  await assert.rejects(
    service.saveMember(active, currentMember.id, {
      active: false,
      reason: 'cannot remove last admin',
    }),
    { code: 'LAST_ADMINISTRATOR' },
  );
  checked('one-time-bootstrap-db-disable-and-concurrent-last-administrator');
  step('v2-published-history-upgrade-to-v3');
  const legacy = {
    apiOrigins: ['http://localhost:8080'],
    games: Object.fromEntries(
      CONTROL_GAMES.filter((id) => !['night-overwatch', 'tetracube'].includes(id)).map((id) => [
        id,
        'enabled',
      ]),
    ),
  };
  const legacyId = randomUUID(),
    legacyDigest = controlSnapshotDigest(legacy);
  await owner.db.execute(
    sql`insert into game_control.revisions values(${legacyId},0,${JSON.stringify(legacy)}::jsonb,'historical v2',${currentMember.id},null,${legacyDigest},${Date.now()})`,
  );
  await owner.db.execute(
    sql`insert into game_control.publications values(1,${legacyId},${currentMember.id},${Date.now()})`,
  );
  await owner.db.execute(
    sql`update game_control.active_head set version=1,revision_id=${legacyId}`,
  );
  await owner.db.execute(sql`update game_control.current_policy set revision=1`);
  const history = () =>
    psql(
      `select md5(jsonb_build_object('revisions',(select jsonb_agg(t order by id) from game_control.revisions t),'publications',(select jsonb_agg(t order by version) from game_control.publications t),'head',(select jsonb_agg(t) from game_control.active_head t),'acl',(select jsonb_agg(jsonb_build_array(relname,relowner,relacl::text) order by relname) from pg_class where relnamespace='game_control'::regnamespace))::text)`,
    );
  const preserved = history();
  psql(nightMigration);
  psql(nightMigration);
  await managementHealth(503);
  const beforeTetracubePolicies = psql(
    'select jsonb_agg(p order by game_id)::text from game_control.current_policy p',
  );
  psql('BEGIN;\n' + helperMigration + '\nCOMMIT;');
  psql('BEGIN;\n' + helperMigration + '\nCOMMIT;');
  assert.equal(
    psql(
      "select jsonb_agg(p order by game_id)::text from game_control.current_policy p where game_id<>'tetracube'",
    ),
    beforeTetracubePolicies,
  );
  assert.equal(
    psql(
      "select state||':'||kill_epoch||':'||revision from game_control.current_policy where game_id='tetracube'",
    ),
    'disabled:0:1',
  );
  assert.equal(psql('select version from game_control.schema_version'), '4');
  assert.equal(psql('select count(*) from game_control.current_policy'), '13');
  await managementHealth(200);
  checked('control-enabled-management-health-rejects-schema2-and-schema3-and-accepts-schema4');
  assert.equal(history(), preserved);
  assert.equal(sentinel(), beforeSentinel);
  assert.equal(
    psql(
      "select state||':'||revision from game_control.current_policy where game_id='night-overwatch'",
    ),
    'disabled:1',
  );
  assert.equal((await service.state(active)).digest, legacyDigest);
  checked('v2-to-v3-to-v4-idempotent-preserves-published-history-digest-policies-and-ACL');
  step('CAS-publish-rollback-and-kill-epoch');
  const snapshot = {
    apiOrigins: ['http://localhost:8080'],
    games: Object.fromEntries(CONTROL_GAMES.map((id) => [id, 'enabled'])),
  };
  const revisions = await Promise.all([
    service.draft(active, { expectedVersion: 1, snapshot, reason: 'first' }),
    service.draft(active, { expectedVersion: 1, snapshot, reason: 'conflict' }),
  ]);
  const published = await Promise.allSettled(
    revisions.map((revision) => service.publish(active, revision.id, 1)),
  );
  assert.equal(published.filter((result) => result.status === 'fulfilled').length, 1);
  const original = (await service.state(active)).revisionId;
  const disable = await service.draft(active, {
    expectedVersion: 2,
    snapshot: { ...snapshot, games: { ...snapshot.games, 'cops-robbers': 'disabled' } },
    reason: 'disable',
  });
  step('shared-policy-lock-serializes-disable-with-runtime');
  let release, entered;
  const enteredPromise = new Promise((resolve) => {
    entered = resolve;
  });
  const releasePromise = new Promise((resolve) => {
    release = resolve;
  });
  const held = runtime.db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock_shared(hashtextextended('game-control:cops-robbers',0))`,
    );
    assert.equal(
      (
        await tx.execute(
          sql`select state from game_control.current_policy where game_id='cops-robbers'`,
        )
      )[0].state,
      'enabled',
    );
    entered();
    await releasePromise;
  });
  await enteredPromise;
  const pendingPublish = service.publish(active, disable.id, 2);
  try {
    let waiting = false;
    for (let i = 0; i < 30; i++) {
      const rows = await owner.db.execute(
        sql`select 1 from pg_stat_activity where usename='management_app' and wait_event='advisory'`,
      );
      if (rows.length) {
        waiting = true;
        break;
      }
      await delay(20);
    }
    assert.equal(
      waiting,
      true,
      'publish must wait for in-flight authoritative runtime transaction',
    );
  } finally {
    release();
  }
  await held;
  await pendingPublish;
  let state = await service.state(active);
  assert.equal(state.policies.find((policy) => policy.gameId === 'cops-robbers').killEpoch, 1);
  await service.rollback(active, {
    revisionId: original,
    expectedVersion: 3,
    reason: 'restore current behavior only',
  });
  state = await service.state(active);
  assert.equal(state.version, 4);
  assert.equal(state.policies.find((policy) => policy.gameId === 'cops-robbers').killEpoch, 1);
  assert.equal(state.policies.find((policy) => policy.gameId === 'cops-robbers').state, 'enabled');
  checked('CAS-append-only-rollback-epoch-and-shared-advisory-order');
  await service.rollback(active, {
    revisionId: legacyId,
    expectedVersion: 4,
    reason: 'rollback historical v2 with night disabled',
  });
  state = await service.state(active);
  assert.equal(state.version, 5);
  assert.equal(
    state.policies.find((policy) => policy.gameId === 'night-overwatch').state,
    'disabled',
  );
  assert.equal(state.policies.find((policy) => policy.gameId === 'tetracube').state, 'disabled');
  assert.equal(
    (await owner.db.execute(sql`select digest from game_control.revisions where id=${legacyId}`))[0]
      .digest,
    legacyDigest,
  );
  checked('historical-v2-rollback-creates-new-v4-revision-without-rewriting-history');
  step('runtime-bounded-control-transactions');
  receipt.runtimeControl = await verifyRuntimeControl({
    url: `postgres://runtime_app:${runtimePassword}@127.0.0.1:${guard()}/control_test`,
    owner,
    runtime,
    checked,
  });
  step('competition-identity-FK-board-lock-order');
  receipt.identityLocks = await verifyCompetitionIdentityLocks({ owner, checked });
  step('observation-and-restart-persistence');
  assert.equal(state.status, 'desired');
  await runtime.db.execute(
    sql`insert into game_control.application_observations(id,consumer,instance_id,version,digest,status,observed_at) values(${randomUUID()},'runtime','isolated-runtime',${state.version},${state.digest},'applied',${Date.now()})`,
  );
  assert.equal((await service.state(active)).status, 'partial');
  assert.equal(sentinel(), beforeSentinel);
  await close();
  guard();
  docker(['restart', containerId]);
  await ready();
  await connect();
  const restarted = createControlService(
    createControlStore(management.db),
    'https://admin.example.test',
  );
  assert.equal((await restarted.state(active)).version, 5);
  assert.equal((await restarted.members(active)).filter((member) => member.active).length, 1);
  assert.equal(sentinel(), beforeSentinel);
  psql(tetracubeMigration);
  checked('publication-members-audit-survive-database-restart');
  const evidence = new URL(
    '../docs/admin-console/qa/control-postgres-current.json',
    import.meta.url,
  );
  await mkdir(new URL('.', evidence), { recursive: true });
  await writeFile(evidence, JSON.stringify(receipt, null, 2) + '\n');
  console.log(`PASS: ${receipt.checks.length} isolated PostgreSQL control checks`);
} catch (error) {
  const detail = String(error.stderr ?? error.stack ?? error.cause?.message ?? error.message)
    .replaceAll(password, '[fixture secret]')
    .replaceAll(appPassword, '[fixture secret]')
    .replaceAll(runtimePassword, '[fixture secret]');
  console.error(`CONTROL_PG_FAILED ${stage}: ${detail.slice(0, 2000)}`);
  process.exitCode = 1;
} finally {
  await close();
  if (containerId) {
    guard(false);
    docker(['rm', '--force', containerId]);
  }
  if (networkId) {
    const info = metadata('network', networkId);
    assert.equal(info.Id, networkId);
    assert.equal(info.Labels['small-games.fixture'], runId);
    docker(['network', 'rm', networkId]);
  }
  if (volumeCreated) {
    const info = metadata('volume', volume);
    assert.equal(info.Name, volume);
    assert.equal(info.Labels['small-games.fixture'], runId);
    assert.equal(
      docker(['ps', '--all', '--filter', `volume=${volume}`, '--format', '{{.ID}}']),
      '',
    );
    docker(['volume', 'rm', volume]);
  }
}
