import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { compilerEnvironment } from './h5-taptap-build.mjs';
import {
  matrixContract,
  matrixGames,
  localCompetitionApi,
  localH5Origin,
  assertCandidateSource,
} from './h5-taptap-matrix.mjs';
import { selectedBackendBuildCommands } from './backend-build.mjs';
import { pnpmInvocation } from './validate-push.mjs';
import { safeFailure, safeDatabaseFailure, safeApiPath } from './h5-taptap-trace.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const taskLabel = 'h5-current-acceptance';
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const fixtureMigrations = Object.freeze([
  'infra/migrations/010-competition.sql',
  'infra/migrations/011-competition-profiles.sql',
  'infra/migrations/012-three-choose-two.sql',
  'infra/migrations/013-competition-identities.sql',
  'infra/admin-console/migrations/001-admin-auth.sql',
  'infra/admin-console/migrations/002-control-center.sql',
]);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function ownedNames(runId) {
  assert(uuidPattern.test(runId), 'Fresh UUID fixture required');
  const name = `small-games-h5-${runId}`;
  return { runId, name, network: `${name}-network`, volume: `${name}-data`, task: taskLabel };
}
export function assertOwnedContainer(info, names, containerId, requirePort = true) {
  assert.equal(info.Id, containerId);
  assert.equal(info.Name, `/${names.name}`);
  assert.equal(info.Config.Labels['small-games.task'], names.task);
  assert.equal(info.Config.Labels['small-games.fixture'], names.runId);
  assert.deepEqual(Object.keys(info.NetworkSettings.Networks), [names.network]);
  assert.equal(info.Mounts.length, 1);
  assert.equal(info.Mounts[0].Name, names.volume);
  assert.equal(info.Mounts[0].Destination, '/var/lib/postgresql/data');
  if (!requirePort) return;
  const ports = info.NetworkSettings.Ports['5432/tcp'];
  assert.equal(ports.length, 1);
  assert.equal(ports[0].HostIp, '127.0.0.1');
  assert(/^\d+$/.test(ports[0].HostPort));
  return Number(ports[0].HostPort);
}
export function fixtureBootstrap(runtimePassword, managementPassword) {
  assert(/^[a-f0-9]{64}$/.test(runtimePassword) && /^[a-f0-9]{64}$/.test(managementPassword));
  return `REVOKE ALL ON DATABASE h5_acceptance FROM PUBLIC; REVOKE ALL ON SCHEMA public FROM PUBLIC;
    CREATE ROLE runtime_app LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 10;
    CREATE ROLE management_app LOGIN PASSWORD '${managementPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 10;
    GRANT CONNECT ON DATABASE h5_acceptance TO runtime_app,management_app;
    CREATE SCHEMA runtime AUTHORIZATION platform_owner; REVOKE ALL ON SCHEMA runtime FROM PUBLIC; GRANT USAGE ON SCHEMA runtime TO runtime_app;
    CREATE TABLE runtime.schema_version(version integer PRIMARY KEY); INSERT INTO runtime.schema_version VALUES(1); GRANT SELECT ON runtime.schema_version TO runtime_app;
    ALTER ROLE runtime_app SET search_path TO runtime,pg_catalog;
    ALTER ROLE runtime_app SET statement_timeout TO '5s'; ALTER ROLE runtime_app SET idle_in_transaction_session_timeout TO '30s';`;
}
export function runtimeEnvironment({ databaseUrl, internalKey, runId }, base = process.env) {
  return {
    ...compilerEnvironment(base),
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: '43802',
    RUNTIME_DATABASE_URL: databaseUrl,
    COMPETITION_ENABLED: 'true',
    COMPETITION_CONTROL_ENABLED: 'true',
    COMPETITION_CONTROL_INSTANCE_ID: `qa-runtime-${runId}`,
    COMPETITION_CORS_ORIGINS: localH5Origin,
    COMPETITION_INTERNAL_KEY: internalKey,
    TRUST_PROXY: '0',
  };
}
/** A spawn error must settle even when no exit event will arrive. Only this exact child is reaped. */
export function ownedChild(
  command,
  args,
  { cwd, env, spawnChild = spawn, ipc = false, graceMs = 3000, closeTimeoutMs = 6000 } = {},
) {
  const child = spawnChild(command, args, {
    cwd,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', ...(ipc ? ['ipc'] : [])],
  });
  child.stdout?.resume();
  child.stderr?.resume();
  let finished = false,
    outcome;
  const done = new Promise((resolve) => {
    const settle = (value) => {
      if (!finished) {
        finished = true;
        outcome = value;
        resolve(value);
      }
    };
    child.once('error', () => {
      if (!child.pid) settle({ code: null, error: 'SPAWN_FAILED' });
    });
    child.once('close', (code) => settle({ code }));
  });
  return {
    child,
    done,
    get outcome() {
      return outcome;
    },
    async close() {
      if (finished) return done;
      child.kill('SIGTERM');
      const force = setTimeout(() => {
        if (!finished) child.kill('SIGKILL');
      }, graceMs);
      let deadline;
      try {
        return await new Promise((resolve, reject) => {
          deadline = setTimeout(
            () => reject(new Error('OWNED_CHILD_CLOSE_TIMEOUT')),
            closeTimeoutMs,
          );
          done.then(resolve, reject);
        });
      } finally {
        clearTimeout(force);
        clearTimeout(deadline);
      }
    },
  };
}
export async function cleanupOwnedSteps(steps) {
  const failures = [];
  for (const [name, work] of steps)
    try {
      await work();
    } catch {
      failures.push(name);
    }
  return failures;
}
export async function awaitOwnedExit(owned, timeoutMs = 30 * 60000) {
  let timer;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(Object.assign(new Error('OWNED_ACCEPTANCE_TIMEOUT'), { code: 'TIMEOUT' })),
        timeoutMs,
      );
      owned.done.then(resolve, reject);
    });
  } finally {
    clearTimeout(timer);
  }
}
export async function compileOwnedBackends(
  workspace,
  { sourceSHA, submoduleSHA },
  {
    commands = selectedBackendBuildCommands,
    startChild = ownedChild,
    invocation = () => pnpmInvocation(process.env),
    sourceGuard,
    progress = () => {},
  } = {},
) {
  const guard =
    sourceGuard ??
    (() =>
      assertCandidateSource(
        { sourceSHA, submoduleSHA },
        {
          head: execFileSync('git', ['-c', 'core.fsmonitor=false', 'rev-parse', 'HEAD'], {
            cwd: workspace,
            encoding: 'utf8',
          }).trim(),
          submodule: execFileSync(
            'git',
            [
              '-c',
              'core.fsmonitor=false',
              '-C',
              'games/submodules/xiangqi-five',
              'rev-parse',
              'HEAD',
            ],
            { cwd: workspace, encoding: 'utf8' },
          ).trim(),
          dirty: execFileSync(
            'git',
            ['-c', 'core.fsmonitor=false', 'status', '--porcelain', '--ignore-submodules=none'],
            {
              cwd: workspace,
              encoding: 'utf8',
            },
          ).trim(),
        },
      ));
  guard();
  const planned = await commands(['runtime', 'management'], workspace),
    runner = invocation();
  const env = {
    ...compilerEnvironment(process.env),
    COREPACK_ENABLE_NETWORK: '0',
    PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
    PNPM_CONFIG_CHILD_CONCURRENCY: '1',
  };
  let index = 0;
  for (const args of planned) {
    progress(++index);
    let child;
    try {
      child = startChild(runner.command, [...runner.prefix, ...args], { cwd: workspace, env });
      const result = await awaitOwnedExit(child, 300000);
      assert.equal(result.code, 0, 'Owned backend build failed');
    } finally {
      await child?.close();
    }
    guard();
  }
  return {
    sourceSHA,
    steps: planned.length,
    services: ['runtime', 'management'],
    boundedSerialBuild: true,
  };
}
export function ownedRestartController(fixture, child) {
  let started = false,
    failed = false,
    verified = false,
    pending = Promise.resolve();
  const send = (message) =>
    new Promise((resolve) => {
      let timer;
      const finish = (error) => {
        if (error) failed = true;
        clearTimeout(timer);
        resolve();
      };
      if (!child.connected) {
        failed = true;
        resolve();
        return;
      }
      timer = setTimeout(() => finish(true), 1000);
      try {
        child.send(message, finish);
      } catch {
        finish(true);
      }
    });
  return {
    handle(message) {
      if (message?.type === 'h5-owned-verify-idempotency') {
        if (!started) {
          failed = true;
          return;
        }
        pending = pending.then(async () => {
          try {
            const proof = await fixture.verifyIdempotency(message);
            assert.equal(proof.type, 'h5-owned-idempotency-verified');
            verified = true;
            await send(proof);
          } catch (error) {
            failed = true;
            if (fixture.evidence) fixture.evidence.restartFailure = safeFailure(error);
            await send({ type: 'h5-owned-restart-failed', runId: fixture.names.runId });
          }
        });
        return;
      }
      if (message?.type !== 'h5-owned-restart') return;
      if (started) {
        failed = true;
        return;
      }
      started = true;
      pending = (async () => {
        try {
          const receipt = await fixture.restart(message);
          await send(receipt);
        } catch (error) {
          failed = true;
          if (fixture.evidence) fixture.evidence.restartFailure = safeFailure(error);
          await send({ type: 'h5-owned-restart-failed', runId: fixture.names.runId });
        }
      })();
    },
    async drain() {
      await pending;
      return { started, failed, verified };
    },
  };
}
export async function confirmOwnedRuntime(
  owned,
  nonce,
  { proofToken, proofPlayer, request = fetch, timeoutMs = 20000 } = {},
) {
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      owned.child.off('message', receive);
      error ? reject(error) : resolve();
    };
    const receive = (message) => {
      if (
        message?.type === 'h5-runtime-bound' &&
        message.nonce === nonce &&
        message.pid === owned.child.pid
      )
        finish();
    };
    const timer = setTimeout(() => finish(new Error('RUNTIME_BIND_TIMEOUT')), timeoutMs);
    owned.child.on('message', receive);
    owned.done.then(() => finish(new Error('RUNTIME_EXITED_BEFORE_BIND')));
    if (owned.outcome) finish(new Error('RUNTIME_EXITED_BEFORE_BIND'));
  });
  // The successful bind comes from this exact child. Foreign /health=200 cannot authorize writes.
  const profile = await request(localCompetitionApi + '/me', {
    headers: { authorization: `Bearer ${proofToken}` },
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).userId, proofPlayer);
  const health = await request('http://127.0.0.1:43802/health', {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(health.status, 200);
  assert(
    !owned.outcome && owned.child.exitCode == null && owned.child.signalCode == null,
    'Owned Runtime exited during read-only proof',
  );
}
async function runRuntimeChild() {
  assert(process.send && /^[a-f0-9]{64}$/.test(process.env.H5_RUNTIME_BIND_NONCE ?? ''));
  const { createRuntimeService } = await import('../services/runtime-api/dist/app.js');
  const app = createRuntimeService(process.env, false);
  app.addHook('onError', (request, _reply, error, done) => {
    if (process.connected)
      process.send(
        {
          type: 'h5-runtime-error',
          nonce: process.env.H5_RUNTIME_BIND_NONCE,
          pid: process.pid,
          path: safeApiPath(request.url),
          database: safeDatabaseFailure(error),
        },
        () => {},
      );
    done();
  });
  try {
    await app.listen({ host: '127.0.0.1', port: 43802 });
    process.send({
      type: 'h5-runtime-bound',
      nonce: process.env.H5_RUNTIME_BIND_NONCE,
      pid: process.pid,
    });
    let closing = false;
    const close = async () => {
      if (closing) return;
      closing = true;
      await app.close();
      process.disconnect?.();
    };
    process.once('SIGTERM', () => void close());
    process.once('SIGINT', () => void close());
  } catch (error) {
    await app.close();
    process.disconnect?.();
    throw error;
  }
}
async function dependency(workspace, packageFile, name) {
  return import(pathToFileURL(createRequire(path.join(workspace, packageFile)).resolve(name)).href);
}
/** Real SQL/store/routes. Only the official GitHub identity response is a named test fixture. */
export async function verifyManagementJoin(workspace, management) {
  const { default: Fastify } = await dependency(
    workspace,
    'services/management-api/package.json',
    'fastify',
  );
  const base = pathToFileURL(path.join(workspace, 'services/management-api/dist/admin/'));
  const [
    { createAdminStore },
    { readAdminConfig },
    { registerAdminAuthentication },
    { createControlStore },
    { createControlService },
  ] = await Promise.all(
    ['store.js', 'config.js', 'routes.js', 'control-store.js', 'control-service.js'].map(
      (file) => import(new URL(file, base).href),
    ),
  );
  const app = Fastify({ logger: false });
  const origin = 'http://127.0.0.1:5182';
  const config = readAdminConfig({
    ADMIN_ORIGIN: origin,
    ADMIN_ALLOWED_EMAILS: 'fixture-admin@example.test',
    ADMIN_GITHUB_CLIENT_ID: 'fixture-only',
    ADMIN_GITHUB_CLIENT_SECRET: 'fixture-only',
  });
  const service = createControlService(createControlStore(management.db), origin);
  await registerAdminAuthentication(
    app,
    createAdminStore(management.db),
    config,
    {
      async identify() {
        return { githubId: '123', login: 'fixture-admin', emails: ['fixture-admin@example.test'] };
      },
    },
    Date.now,
    service,
  );
  const headers = { host: '127.0.0.1:5182' };
  try {
    assert.equal((await app.inject({ url: '/api/control/revisions', headers })).statusCode, 401);
    const begin = await app.inject({ url: '/api/auth/github', headers });
    const state = new URL(begin.headers.location).searchParams.get('state');
    const flow = begin.cookies.find((cookie) => cookie.name === 'sg_admin_flow');
    const login = await app.inject({
      url: `/api/auth/github/callback?state=${state}&code=fixture-only`,
      headers,
      cookies: { [flow.name]: state },
    });
    const cookie = login.cookies.find((value) => value.name === 'sg_admin_session' && value.value);
    assert(cookie, 'Fixture OAuth must produce a real stored session');
    const cookies = { [cookie.name]: cookie.value };
    const session = await app.inject({ url: '/api/session', headers, cookies });
    assert.equal(session.statusCode, 200);
    const writes = { ...headers, origin, 'x-csrf-token': session.json().csrfToken };
    const request = async (method, url, payload) => {
      const response = await app.inject({
        method,
        url,
        headers: method === 'GET' ? headers : writes,
        cookies,
        ...(payload ? { payload } : {}),
      });
      assert.equal(
        response.statusCode,
        200,
        `Fixture management endpoint status ${response.statusCode}`,
      );
      return response.json();
    };
    const catalog = await request('GET', '/api/control/catalog');
    const ids = (catalog.games ?? catalog).map((game) =>
      typeof game === 'string' ? game : game.id,
    );
    const snapshot = {
      apiOrigins: [localH5Origin],
      games: Object.fromEntries(ids.map((id) => [id, 'enabled'])),
    };
    const draft = () =>
      request('POST', '/api/control/revisions', {
        expectedVersion: 0,
        snapshot,
        reason: 'isolated HTTP JOIN acceptance',
      });
    const a = await draft(),
      b = await draft();
    await request('POST', `/api/control/revisions/${a.id}/publish`, { expectedVersion: 0 });
    const c = await request('POST', '/api/control/revisions', {
      expectedVersion: 1,
      snapshot,
      reason: 'second isolated publication',
    });
    await request('POST', `/api/control/revisions/${c.id}/publish`, { expectedVersion: 1 });
    await request('POST', '/api/control/rollback', {
      revisionId: a.id,
      expectedVersion: 2,
      reason: 'isolated rollback JOIN acceptance',
    });
    const rows = await request('GET', '/api/control/revisions');
    assert.equal(rows.find((row) => row.id === a.id).publishedVersion, 1);
    assert.equal(rows.find((row) => row.id === b.id).publishedVersion, null);
    assert.equal(rows.find((row) => row.id === c.id).publishedVersion, 2);
    assert.equal(rows.find((row) => row.rollbackOf === a.id).publishedVersion, 3);
    return {
      realPostgres: true,
      realRoutes: true,
      authentication: 'test-only-injected-GithubProvider',
      publishedVersions: [1, null, 2, 3],
    };
  } finally {
    await app.close();
  }
}
/** Actual HTTP and PostgreSQL; credentials stay in this call and never enter evidence. */
export async function verifyRuntimeIdentity({ request = fetch, now = Date.now } = {}) {
  const guestRequestsAt = [],
    users = [];
  const send = async (endpoint, { body, token, status = 200 } = {}) => {
    const response = await request(localCompetitionApi + endpoint, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, status, `Runtime acceptance endpoint status ${response.status}`);
    return response.json();
  };
  for (const game of matrixGames) {
    const started = now();
    guestRequestsAt.push(started);
    const session = await send('/sessions/guest', {
      body: { identityVersion: 2, identityMode: 'ephemeral', game },
    });
    assert.equal(session.identityMode, 'ephemeral');
    assert.equal(session.game, game);
    assert(uuidPattern.test(session.userId));
    assert(session.expiresAt <= started + 15 * 60000 + 1000);
    assert(session.identityExpiresAt <= started + 8 * 3600000 + 1000);
    const refreshed = await send('/sessions/refresh', {
      body: { refreshToken: session.refreshToken },
    });
    const renewed = await send('/sessions/refresh', { body: {}, token: refreshed.token });
    for (const value of [refreshed, renewed]) {
      assert.equal(value.userId, session.userId);
      assert.equal(value.identityExpiresAt, session.identityExpiresAt);
      assert.equal(value.refreshExpiresAt, session.identityExpiresAt);
    }
    const own = await send('/me', { token: renewed.token });
    assert.equal(own.userId, session.userId);
    assert.equal(own.avatarUrl, '');
    assert.equal(own.region, null);
    for (const other of matrixGames.filter((id) => id !== game)) {
      const denied = await send(`/boards/${other}`, { token: renewed.token, status: 403 });
      assert.equal(denied.error, 'IDENTITY_SCOPE_MISMATCH');
      await send(`/games/${other}/leaderboards/versus`, { token: renewed.token, status: 403 });
    }
    await send(`/boards/${game}`, { token: renewed.token });
    users.push(session.userId);
  }
  assert.equal(new Set(users).size, 3);
  return {
    evidence: {
      realHttp: true,
      realPostgres: true,
      ephemeralGames: [...matrixGames],
      refreshAndBearerRenewSameOwner: true,
      crossGameReadsRejected: true,
    },
    guestRequestsAt,
  };
}
export function validateRestartRequest(message, names) {
  assert.equal(message?.type, 'h5-owned-restart');
  assert.equal(message.runId, names.runId);
  assert(uuidPattern.test(message.checkpointId));
  assert.equal(message.matches.length, 6);
  const expected = matrixGames.flatMap((game) =>
    [false, true].map((ads) => `${game}-ads-${ads ? 'on' : 'off'}-service-on`),
  );
  assert.deepEqual(message.matches.map((match) => match.variant).sort(), expected.sort());
  for (const match of message.matches) {
    assert(/^[A-F0-9]{12}$/.test(match.roomCode));
    assert.equal(match.playerIds.length, 2);
    assert(match.playerIds.every((id) => uuidPattern.test(id)));
    assert.notEqual(...match.playerIds);
  }
  assert.equal(
    message.solos?.length,
    2,
    'Both Street advertising variants require a natural solo run',
  );
  for (const solo of message.solos) {
    assert(uuidPattern.test(solo.admissionId));
    assert(uuidPattern.test(solo.playerId));
  }
  assert.notEqual(message.solos[0].admissionId, message.solos[1].admissionId);
  return {
    type: 'h5-owned-restart',
    runId: names.runId,
    checkpointId: message.checkpointId,
    matches: message.matches.map((match) => ({
      variant: match.variant,
      roomCode: match.roomCode,
      playerIds: [...match.playerIds],
    })),
    solos: message.solos.map(({ admissionId, playerId }) => ({ admissionId, playerId })),
  };
}
export async function createOwnedRuntime({
  workspace = root,
  runId = randomUUID(),
  docker = defaultDocker,
  startChild = ownedChild,
  pause = delay,
} = {}) {
  const names = ownedNames(runId),
    ownerPassword = randomBytes(32).toString('hex'),
    runtimePassword = randomBytes(32).toString('hex'),
    managementPassword = randomBytes(32).toString('hex'),
    internalKey = randomBytes(32).toString('hex'),
    proofToken = randomBytes(32).toString('hex'),
    proofPlayer = randomUUID();
  let containerId,
    networkId,
    volumeCreated = false,
    containerAttempted = false,
    networkAttempted = false,
    volumeAttempted = false,
    runtimeChild,
    owner,
    management,
    openDatabase,
    sql;
  const evidence = {
    runId,
    stage: 'fresh-resource-check',
    postgresVersion: null,
    migrations: {},
    executedModules: {},
    management: null,
    runtimeHttp: null,
    cleaned: false,
  };
  let guestRequestsAt = [];
  let restartSnapshot, restartCheckpoint, replayBefore, replayTargets;
  const inspect = (kind, id) => JSON.parse(docker([kind, 'inspect', id]))[0];
  const guard = (port) =>
    assertOwnedContainer(inspect('container', containerId), names, containerId, port);
  const psql = (input) =>
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
        'h5_acceptance',
      ],
      input,
    );
  const url = (role, password) =>
    `postgres://${role}:${password}@127.0.0.1:${guard(true)}/h5_acceptance`;
  const closeDatabases = async () => {
    const databases = [management, owner];
    management = owner = undefined;
    const failures = await cleanupOwnedSteps(
      databases
        .filter(Boolean)
        .map((database, index) => ['database-' + index, () => database.close()]),
    );
    assert.equal(failures.length, 0, 'Owned database close incomplete');
  };
  const ready = async () => {
    const end = Date.now() + 30000;
    while (Date.now() < end) {
      try {
        psql('select 1');
        return;
      } catch {
        await pause(250);
      }
    }
    throw new Error('PG_NOT_READY');
  };
  const start = async () => {
    const nonce = randomBytes(32).toString('hex');
    runtimeChild = startChild(
      process.execPath,
      ['scripts/h5-taptap-runtime.mjs', '--runtime-child'],
      {
        cwd: workspace,
        env: {
          ...runtimeEnvironment({
            databaseUrl: url('runtime_app', runtimePassword),
            internalKey,
            runId,
          }),
          H5_RUNTIME_BIND_NONCE: nonce,
        },
        ipc: true,
      },
    );
    runtimeChild.child.on('message', (message) => {
      if (
        message?.type !== 'h5-runtime-error' ||
        message.nonce !== nonce ||
        message.pid !== runtimeChild.child.pid
      )
        return;
      evidence.runtimeErrors ??= [];
      if (evidence.runtimeErrors.length < 100)
        evidence.runtimeErrors.push({
          at: new Date().toISOString(),
          path: safeApiPath(message.path),
          database: safeDatabaseFailure(message.database),
        });
    });
    await confirmOwnedRuntime(runtimeChild, nonce, { proofToken, proofPlayer });
  };
  const snapshot = () =>
    psql(
      `select md5(jsonb_build_object('players',(select jsonb_agg(t order by id) from runtime.competition_players t),'results',(select jsonb_agg(t order by match_id,player_id) from runtime.competition_results t),'best',(select jsonb_agg(t order by board,player_id) from runtime.competition_best t),'matches',(select jsonb_agg(t order by id) from runtime.competition_matches t))::text)`,
    );
  const replaySummary = (targets) => {
    const rooms = targets.matches.map((match) => `'${match.roomCode}'`).join(','),
      admissions = targets.solos.map((solo) => `'street-admission:${solo.admissionId}'`).join(',');
    return JSON.parse(
      psql(
        `with admissions as(select id,data from runtime.competition_matches where id in(${admissions})),ids as(select id from runtime.competition_matches where id in(${rooms}) union select data->>'resultHash' from admissions),results as(select match_id,board,player_id,score,secondary from runtime.competition_results where match_id in(select id from ids)),best as(select b.board,b.player_id,b.score,b.secondary,b.match_id from runtime.competition_best b where exists(select 1 from results r where r.board=b.board and r.player_id=b.player_id)) select jsonb_build_object('results',(select count(*) from results),'best',(select count(*) from best),'rooms',(select count(*) from runtime.competition_matches where id in(${rooms})),'admissions',(select count(*) from admissions),'digest',md5(jsonb_build_object('results',(select jsonb_agg(r order by match_id,player_id) from results r),'best',(select jsonb_agg(b order by board,player_id) from best b),'bindings',(select jsonb_agg(jsonb_build_array(id,data->>'playerId',data->>'game',data->>'resultHash') order by id) from admissions))::text))`,
      ),
    );
  };
  const fixture = {
    names,
    evidence,
    get descriptor() {
      return {
        runId,
        postgresContainer: containerId,
        volume: names.volume,
        network: names.network,
        api: localCompetitionApi,
        origin: localH5Origin,
        guestRequestsAt,
      };
    },
    async restart(message) {
      evidence.stage = 'restart-request-validation';
      replayTargets = validateRestartRequest(message, names);
      guard(true);
      evidence.stage = 'restart-runtime-stop';
      await runtimeChild.close();
      runtimeChild = undefined;
      evidence.stage = 'restart-persistence-snapshot';
      const before = snapshot();
      restartSnapshot = before;
      restartCheckpoint = message.checkpointId;
      replayBefore = replaySummary(replayTargets);
      assert.equal(replayBefore.results, 14);
      assert.equal(replayBefore.rooms, 6);
      assert.equal(replayBefore.admissions, 2);
      evidence.stage = 'restart-pool-close';
      await closeDatabases();
      evidence.stage = 'restart-postgres';
      docker(['restart', containerId]);
      evidence.stage = 'restart-postgres-readiness';
      await ready();
      guard(true);
      evidence.stage = 'restart-persistence-compare';
      const same = before === snapshot();
      assert(same, 'Owned database rows changed across restart');
      evidence.stage = 'restart-runtime-start';
      await start();
      evidence.stage = 'restart-browser-replay';
      return {
        type: 'h5-owned-resumed',
        runId,
        checkpointId: message.checkpointId,
        postgresContainer: containerId,
        volume: names.volume,
        volumePreserved: true,
        runtimeRestarted: true,
        postgresRestarted: true,
        sameStoredRows: same,
        serviceRole: 'runtime_app',
      };
    },
    async verifyIdempotency(message) {
      evidence.stage = 'restart-idempotency-verification';
      assert.equal(message.runId, runId);
      assert.equal(message.checkpointId, restartCheckpoint);
      assert(restartSnapshot);
      guard(true);
      const after = replaySummary(replayTargets);
      assert.deepEqual(
        after,
        replayBefore,
        'Replayed accepted submissions changed persisted counts, scores or admission bindings',
      );
      evidence.idempotency = {
        before: replayBefore,
        after,
        resultCountsPreserved: true,
        scoresPreserved: true,
      };
      return {
        type: 'h5-owned-idempotency-verified',
        runId,
        checkpointId: restartCheckpoint,
        resultCountsPreserved: true,
        scoresPreserved: true,
      };
    },
    async close() {
      const recover = (kind, name) => {
        const values = docker([
          kind,
          'ls',
          ...(kind === 'container' || kind === 'network' ? ['--no-trunc'] : []),
          ...(kind === 'container' ? ['--all'] : []),
          '--filter',
          `name=^${kind === 'container' ? '/' : ''}${name}$`,
          '--format',
          kind === 'volume' ? '{{.Name}}' : '{{.ID}}',
        ])
          .split(/\r?\n/)
          .filter(Boolean);
        assert(values.length <= 1, 'Owned name recovery is ambiguous');
        return values[0];
      };
      const failures = await cleanupOwnedSteps([
        [
          'runtime-child',
          async () => {
            await runtimeChild?.close();
            runtimeChild = undefined;
          },
        ],
        ['database-pools', closeDatabases],
        [
          'container',
          () => {
            if (!containerId && containerAttempted) containerId = recover('container', names.name);
            if (containerId) {
              guard(false);
              docker(['rm', '--force', containerId]);
              containerId = undefined;
            }
          },
        ],
        [
          'network',
          () => {
            if (!networkId && networkAttempted) networkId = recover('network', names.network);
            if (networkId) {
              const info = inspect('network', networkId);
              assert.equal(info.Id, networkId);
              assert.equal(info.Name, names.network);
              assert.equal(info.Labels['small-games.fixture'], runId);
              docker(['network', 'rm', networkId]);
              networkId = undefined;
            }
          },
        ],
        [
          'volume',
          () => {
            if (volumeAttempted && !volumeCreated)
              volumeCreated = Boolean(recover('volume', names.volume));
            if (volumeCreated) {
              const info = inspect('volume', names.volume);
              assert.equal(info.Name, names.volume);
              assert.equal(info.Labels['small-games.fixture'], runId);
              assert.equal(
                docker([
                  'ps',
                  '--all',
                  '--filter',
                  `volume=${names.volume}`,
                  '--format',
                  '{{.ID}}',
                ]),
                '',
              );
              docker(['volume', 'rm', names.volume]);
              volumeCreated = false;
            }
          },
        ],
      ]);
      evidence.cleanupFailures = failures;
      evidence.cleaned = failures.length === 0;
      assert.equal(failures.length, 0, 'Owned fixture cleanup incomplete');
    },
  };
  try {
    for (const [kind, name] of [
      ['container', names.name],
      ['volume', names.volume],
      ['network', names.network],
    ]) {
      let exists = false;
      try {
        inspect(kind, name);
        exists = true;
      } catch {}
      assert(!exists, 'Fresh fixture name already exists');
    }
    const image = inspect('image', 'postgres:17.6-alpine');
    assert(/^sha256:[a-f0-9]{64}$/.test(image.Id));
    evidence.imageId = image.Id;
    evidence.stage = 'create-owned-resources';
    volumeAttempted = true;
    docker(['volume', 'create', '--label', `small-games.fixture=${runId}`, names.volume]);
    volumeCreated = true;
    networkAttempted = true;
    networkId = docker([
      'network',
      'create',
      '--label',
      `small-games.fixture=${runId}`,
      names.network,
    ]);
    containerAttempted = true;
    containerId = docker([
      'run',
      '-d',
      '--name',
      names.name,
      '--label',
      `small-games.task=${taskLabel}`,
      '--label',
      `small-games.fixture=${runId}`,
      '--network',
      names.network,
      '--publish',
      '127.0.0.1::5432',
      '--memory',
      '256m',
      '--cpus',
      '1',
      '--mount',
      `type=volume,source=${names.volume},target=/var/lib/postgresql/data`,
      '--env',
      'POSTGRES_USER=platform_owner',
      '--env',
      'POSTGRES_DB=h5_acceptance',
      '--env',
      `POSTGRES_PASSWORD=${ownerPassword}`,
      image.Id,
    ]);
    evidence.stage = 'postgres-readiness';
    await ready();
    guard(true);
    evidence.postgresVersion = psql('show server_version');
    assert.match(evidence.postgresVersion, /^17\.6(?:\D|$)/);
    evidence.stage = 'bootstrap';
    psql(fixtureBootstrap(runtimePassword, managementPassword));
    for (const file of fixtureMigrations) {
      evidence.stage = file;
      const bytes = await readFile(path.join(workspace, file));
      evidence.migrations[file] = hash(bytes);
      psql(bytes);
    }
    psql(
      `insert into runtime.competition_players(id,created_at) values('${proofPlayer}',${Date.now()}); insert into runtime.competition_sessions values('${hash(proofToken)}','${proofPlayer}',${Date.now() + 8 * 3600000});`,
    );
    ({ openDatabase } = await dependency(
      workspace,
      'services/runtime-api/package.json',
      '@coffeeeeffoc/service-kit',
    ));
    ({ sql } = await dependency(workspace, 'services/runtime-api/package.json', 'drizzle-orm'));
    owner = openDatabase(url('platform_owner', ownerPassword), 'runtime');
    management = openDatabase(url('management_app', managementPassword), 'management');
    assert.equal(
      (await management.db.execute(sql`select current_user as role`))[0].role,
      'management_app',
    );
    evidence.stage = 'management-real-SQL-HTTP';
    evidence.management = await verifyManagementJoin(workspace, management);
    for (const file of [
      'packages/service-kit/dist/database.js',
      'services/runtime-api/dist/app.js',
      'services/runtime-api/dist/competition/auth.js',
      'services/runtime-api/dist/competition/control.js',
      'services/runtime-api/dist/competition/store.js',
      'services/management-api/dist/admin/control-store.js',
    ])
      evidence.executedModules[file] = hash(await readFile(path.join(workspace, file)));
    evidence.stage = 'runtime-start';
    await closeDatabases();
    await start();
    evidence.stage = 'runtime-real-SQL-HTTP';
    const identity = await verifyRuntimeIdentity();
    evidence.runtimeHttp = identity.evidence;
    guestRequestsAt = identity.guestRequestsAt;
    evidence.stage = 'browser-ready';
    return fixture;
  } catch (error) {
    evidence.failure = safeFailure(error);
    try {
      await fixture.close();
    } catch {
      throw Object.assign(new Error('OWNED_FIXTURE_CLEANUP_FAILED'), { fixtureEvidence: evidence });
    }
    throw Object.assign(new Error('OWNED_FIXTURE_FAILED'), safeFailure(error), {
      fixtureEvidence: evidence,
    });
  }
}
function defaultDocker(args, input) {
  try {
    return execFileSync(process.env.DOCKER_EXECUTABLE ?? 'docker', args, {
      input,
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw new Error('OWNED_DOCKER_COMMAND_FAILED');
  }
}
export async function runOwnedAcceptance(matrixPath, { workspace = root } = {}) {
  const matrixFile = path.resolve(matrixPath);
  const matrix = JSON.parse(await readFile(matrixFile, 'utf8'));
  matrixContract(matrix);
  const candidate = execFileSync('git', ['-c', 'core.fsmonitor=false', 'rev-parse', 'HEAD'], {
    cwd: workspace,
    encoding: 'utf8',
  }).trim();
  assert.equal(candidate, matrix.sourceSHA);
  assert.equal(
    execFileSync(
      'git',
      ['-c', 'core.fsmonitor=false', 'status', '--porcelain', '--ignore-submodules=none'],
      {
        cwd: workspace,
        encoding: 'utf8',
      },
    ).trim(),
    '',
  );
  let fixture, browserChild, restart;
  const evidence = { sourceSHA: candidate, profile: 'qa-matrix', status: 'failed' };
  try {
    evidence.build = await compileOwnedBackends(workspace, matrix, {
      progress: (index) =>
        console.log(JSON.stringify({ stage: 'owned-backend-build', step: index })),
    });
    fixture = await createOwnedRuntime({ workspace });
    const browserPaths = Object.fromEntries(
      ['PLAYWRIGHT_EXECUTABLE_PATH', 'PLAYWRIGHT_BROWSERS_PATH']
        .filter((key) => process.env[key])
        .map((key) => [key, process.env[key]]),
    );
    browserChild = ownedChild(
      process.execPath,
      ['scripts/h5-taptap.browser.mjs', '--with-local-restart'],
      {
        cwd: workspace,
        env: {
          ...compilerEnvironment(process.env),
          ...browserPaths,
          H5_MATRIX: matrixFile,
          H5_OWNED_RUNTIME: JSON.stringify(fixture.descriptor),
        },
        ipc: true,
      },
    );
    restart = ownedRestartController(fixture, browserChild.child);
    browserChild.child.on('message', restart.handle);
    const result = await awaitOwnedExit(browserChild);
    const restarted = await restart.drain();
    assert.equal(result.code, 0);
    assert(
      restarted.started && restarted.verified && !restarted.failed,
      'Owned restart/idempotency acceptance missing',
    );
    assert.equal(
      execFileSync('git', ['-c', 'core.fsmonitor=false', 'rev-parse', 'HEAD'], {
        cwd: workspace,
        encoding: 'utf8',
      }).trim(),
      candidate,
    );
    assert.equal(
      execFileSync(
        'git',
        ['-c', 'core.fsmonitor=false', 'status', '--porcelain', '--ignore-submodules=none'],
        {
          cwd: workspace,
          encoding: 'utf8',
        },
      ).trim(),
      '',
    );
    evidence.status = 'passed';
    return evidence;
  } catch (error) {
    if (error.fixtureEvidence) evidence.fixture = error.fixtureEvidence;
    evidence.failure = safeFailure(error);
    throw error;
  } finally {
    const failures = await cleanupOwnedSteps([
      ['browser-child', () => browserChild?.close()],
      ['restart', () => restart?.drain()],
      ['fixture', () => fixture?.close()],
    ]);
    if (fixture) evidence.fixture = fixture.evidence;
    evidence.cleanupFailures = failures;
    if (failures.length) evidence.status = 'failed';
    const output = path.join(path.dirname(matrixFile), 'owned-runtime');
    await mkdir(output, { recursive: true });
    await writeFile(
      path.join(output, `${fixture?.names.runId ?? randomUUID()}.json`),
      JSON.stringify(evidence, null, 2) + '\n',
      { flag: 'wx' },
    );
    assert.equal(failures.length, 0, 'Owned acceptance cleanup incomplete');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv[2] === '--runtime-child') {
    runRuntimeChild().catch((error) => {
      console.error(JSON.stringify({ stage: 'owned-runtime-child', ...safeFailure(error) }));
      process.exitCode = 1;
    });
  } else {
    Promise.resolve()
      .then(() => {
        assert.equal(process.argv[2], '--matrix');
        assert.equal(process.argv.length, 4);
        return runOwnedAcceptance(process.argv[3]);
      })
      .then(
        () => console.log('H5_OWNED_ACCEPTANCE_PASSED'),
        (error) => {
          console.error(JSON.stringify({ stage: 'owned-acceptance', ...safeFailure(error) }));
          process.exitCode = 1;
        },
      );
  }
}
