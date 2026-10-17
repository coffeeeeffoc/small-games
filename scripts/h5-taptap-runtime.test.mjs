import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  ownedNames,
  assertOwnedContainer,
  fixtureBootstrap,
  runtimeEnvironment,
  ownedChild,
  validateRestartRequest,
  createOwnedRuntime,
  fixtureMigrations,
  confirmOwnedRuntime,
  cleanupOwnedSteps,
  awaitOwnedExit,
  ownedRestartController,
  compileOwnedBackends,
  observeRuntimeProcess,
} from './h5-taptap-runtime.mjs';
import { localCompetitionApi, matrixGames } from './h5-taptap-matrix.mjs';
const runId = '12345678-1234-1234-1234-123456789012';
test('Runtime diagnostics bind the owned child, bound samples and exclude raw stderr and credentials', async () => {
  const child = new EventEmitter();
  child.pid = 123;
  child.killed = false;
  child.stderr = new EventEmitter();
  let finish;
  const owned = {
    child,
    done: new Promise((resolve) => {
      finish = resolve;
    }),
  };
  const evidence = observeRuntimeProcess(owned, 'owned-nonce');
  child.emit('message', {
    type: 'h5-runtime-resources',
    nonce: 'PRIVATE_CANARY',
    pid: 123,
    rss: 100,
  });
  child.emit('message', { type: 'h5-runtime-resources', nonce: 'owned-nonce', pid: 999, rss: 100 });
  assert.equal(evidence.samples.length, 0);
  for (let i = 0; i < 20; i++)
    child.emit('message', {
      type: 'h5-runtime-resources',
      nonce: 'owned-nonce',
      pid: 123,
      rss: i,
      heapUsed: i,
      heapLimit: 512,
      external: 'PRIVATE_CANARY',
      arrayBuffers: Infinity,
      token: 'PRIVATE_CANARY',
      headers: { authorization: 'PRIVATE_CANARY' },
    });
  assert.equal(evidence.samples.length, 12);
  assert.equal(evidence.samples[0].rss, 8);
  assert.equal(evidence.samples[0].external, undefined);
  assert.equal(evidence.samples[0].arrayBuffers, undefined);
  child.stderr.emit(
    'data',
    Buffer.from('PRIVATE_CANARY JavaScript heap out of memory\nReached heap limit\n'),
  );
  assert.equal(evidence.heapLimitReached, false);
  child.stderr.emit(
    'data',
    Buffer.from('PRIVATE_CANARY FATAL ERROR: JavaScript heap out of memory\n'),
  );
  assert.equal(evidence.heapLimitReached, false);
  child.stderr.emit(
    'data',
    Buffer.from('FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of '),
  );
  child.stderr.emit('data', Buffer.from('memory\nPRIVATE_CANARY'));
  finish({ code: 134 });
  await owned.done;
  assert.equal(evidence.heapLimitReached, true);
  assert.equal(evidence.exitCode, 134);
  assert.equal(evidence.stopRequested, false);
  assert(!JSON.stringify(evidence).includes('PRIVATE_CANARY'));
  const stoppedChild = new EventEmitter();
  stoppedChild.pid = 124;
  stoppedChild.killed = true;
  stoppedChild.signalCode = 'SIGTERM';
  const stopped = observeRuntimeProcess(
    { child: stoppedChild, done: Promise.resolve({ code: null }) },
    'owned',
  );
  await Promise.resolve();
  assert.equal(stopped.stopRequested, true);
  assert.equal(stopped.signal, 'SIGTERM');
  assert.equal(stopped.heapLimitReached, false);
});

test('candidate backend builds are selected, serial, bounded and source-checked before fresh PG', async () => {
  const events = [],
    planned = [
      ['--filter', 'service-kit', 'build'],
      ['--filter', 'runtime', 'build'],
      ['--filter', 'management', 'build'],
    ];
  const result = await compileOwnedBackends(
    '/fixture',
    { sourceSHA: 'a'.repeat(40), submoduleSHA: 'b'.repeat(40) },
    {
      commands: async (services) => {
        assert.deepEqual(services, ['runtime', 'management']);
        return planned;
      },
      sourceGuard: () => events.push('guard'),
      invocation: () => ({ command: 'owned-pnpm', prefix: [] }),
      startChild: (_command, args, { env }) => {
        events.push(args[1]);
        assert.equal(env.NODE_OPTIONS, '--max-old-space-size=512');
        assert.equal(env.COREPACK_ENABLE_NETWORK, '0');
        assert.equal(env.PNPM_CONFIG_CHILD_CONCURRENCY, '1');
        return { done: Promise.resolve({ code: 0 }), close: async () => events.push('close') };
      },
    },
  );
  assert.deepEqual(events, [
    'guard',
    'service-kit',
    'close',
    'guard',
    'runtime',
    'close',
    'guard',
    'management',
    'close',
    'guard',
  ]);
  assert.equal(result.steps, 3);
});
test('foreign health and a failed bind cannot cause any HTTP request or write', async () => {
  let calls = 0,
    finish;
  const child = new EventEmitter();
  child.pid = 123;
  const owned = {
    child,
    done: new Promise((resolve) => {
      finish = resolve;
    }),
  };
  const confirmed = confirmOwnedRuntime(owned, 'owned-nonce', {
    proofToken: 'PRIVATE_CANARY',
    proofPlayer: runId,
    request: async () => {
      calls++;
      return { status: 200, json: async () => ({ userId: runId }) };
    },
  });
  child.emit('message', { type: 'h5-runtime-bound', nonce: 'foreign-nonce', pid: 123 });
  finish({ code: 1 });
  await assert.rejects(confirmed, /RUNTIME_EXITED_BEFORE_BIND/);
  assert.equal(calls, 0);
});
test('owned bind is followed by read-only fixture proof before health or any caller preflight', async () => {
  const calls = [],
    child = new EventEmitter();
  child.pid = 123;
  const owned = { child, done: new Promise(() => {}) };
  const confirmed = confirmOwnedRuntime(owned, 'owned-nonce', {
    proofToken: 'PRIVATE_CANARY',
    proofPlayer: runId,
    request: async (url, init) => {
      calls.push({ url, init });
      return { status: 200, json: async () => ({ userId: runId }) };
    },
  });
  child.emit('message', { type: 'h5-runtime-bound', nonce: 'owned-nonce', pid: 123 });
  await confirmed;
  assert.equal(calls.length, 2);
  assert(calls[0].url.endsWith('/me'));
  assert(calls[1].url.endsWith('/health'));
  assert(calls.every((call) => !call.init.body && !call.init.method));
  const denied = confirmOwnedRuntime(owned, 'second', {
    proofToken: 'PRIVATE_CANARY',
    proofPlayer: runId,
    request: async () => ({ status: 200, json: async () => ({ userId: 'foreign' }) }),
  });
  child.emit('message', { type: 'h5-runtime-bound', nonce: 'second', pid: 123 });
  await assert.rejects(denied);
});
test('fresh UUID ownership binds exact container, loopback port, volume and network before mutation', () => {
  const names = ownedNames(runId);
  const info = {
    Id: 'container-id',
    Name: '/' + names.name,
    Config: { Labels: { 'small-games.task': names.task, 'small-games.fixture': runId } },
    NetworkSettings: {
      Networks: { [names.network]: {} },
      Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '25432' }] },
    },
    Mounts: [{ Name: names.volume, Destination: '/var/lib/postgresql/data' }],
  };
  assert.equal(assertOwnedContainer(info, names, 'container-id'), 25432);
  for (const mutate of [
    (value) => (value.Id = 'foreign'),
    (value) => (value.Config.Labels['small-games.fixture'] = 'foreign'),
    (value) => (value.Mounts[0].Name = 'old-volume'),
    (value) => (value.NetworkSettings.Networks.other = {}),
    (value) => (value.NetworkSettings.Ports['5432/tcp'][0].HostIp = '0.0.0.0'),
  ]) {
    const copy = structuredClone(info);
    mutate(copy);
    assert.throws(() => assertOwnedContainer(copy, names, 'container-id'));
  }
  assert.throws(() => ownedNames('small-games-h5-matrix-20261015'));
});
test('bootstrap and Runtime child environment use only owned credentials and required markers', () => {
  const sql = fixtureBootstrap('a'.repeat(64), 'b'.repeat(64));
  assert(sql.includes('runtime.schema_version'));
  assert(sql.includes('NOBYPASSRLS'));
  assert(!sql.includes('ALTER DEFAULT PRIVILEGES'));
  assert.throws(() => fixtureBootstrap("unsafe';grant", 'b'.repeat(64)));
  assert.deepEqual(
    fixtureMigrations.map((file) => file.split('/').at(-1)),
    [
      '010-competition.sql',
      '011-competition-profiles.sql',
      '012-three-choose-two.sql',
      '013-competition-identities.sql',
      '014-player-sessions.sql',
      '001-admin-auth.sql',
      '002-control-center.sql',
    ],
  );
  const env = runtimeEnvironment(
    { databaseUrl: 'postgres://owned', internalKey: 'owned-key', runId },
    {
      PATH: 'public',
      ADMIN_GITHUB_CLIENT_SECRET: 'PRIVATE_CANARY',
      NODE_OPTIONS: '--require PRIVATE_CANARY',
      COMPETITION_PLATFORM_CONFIG: 'PRIVATE_CANARY',
    },
  );
  assert.equal(env.HOST, '127.0.0.1');
  assert.equal(env.NODE_OPTIONS, '--max-old-space-size=512');
  assert.equal(env.UV_THREADPOOL_SIZE, '1');
  assert(!JSON.stringify(env).includes('PRIVATE_CANARY'));
  assert.equal(env.TRUST_PROXY, '0');
});
test('spawn error settles without waiting for a nonexistent close event and never kills another child', async () => {
  let kills = 0;
  const child = new EventEmitter();
  child.stdout = { resume() {} };
  child.stderr = { resume() {} };
  child.kill = () => kills++;
  const owned = ownedChild('node', [], {
    spawnChild: (_command, _args, options) => {
      assert.equal(options.windowsHide, true);
      return child;
    },
  });
  queueMicrotask(() => child.emit('error', new Error('PRIVATE_CANARY')));
  assert.deepEqual(await owned.done, { code: null, error: 'SPAWN_FAILED' });
  await owned.close();
  assert.equal(kills, 0);
});
test('owned child close and overall browser wait have final deadlines', async () => {
  const signals = [],
    child = new EventEmitter();
  child.pid = 123;
  child.kill = (signal) => signals.push(signal);
  const owned = ownedChild('node', [], { spawnChild: () => child, graceMs: 5, closeTimeoutMs: 20 });
  await assert.rejects(owned.close(), /OWNED_CHILD_CLOSE_TIMEOUT/);
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  await assert.rejects(awaitOwnedExit(owned, 5), { code: 'TIMEOUT' });
});
test('cleanup attempts every owned step and evidence after an earlier failure', async () => {
  const calls = [];
  const failed = await cleanupOwnedSteps([
    [
      'child',
      async () => {
        calls.push('child');
        throw new Error('PRIVATE_CANARY');
      },
    ],
    ['container', () => calls.push('container')],
    ['evidence', () => calls.push('evidence')],
  ]);
  assert.deepEqual(calls, ['child', 'container', 'evidence']);
  assert.deepEqual(failed, ['child']);
});
test('restart drain waits for its operation and disconnected IPC never sends or leaks a rejection', async () => {
  let release,
    finished = false,
    sends = 0;
  const controller = ownedRestartController(
    {
      names: { runId },
      restart: async () => {
        await new Promise((resolve) => (release = resolve));
        return { type: 'h5-owned-resumed' };
      },
    },
    {
      connected: false,
      send() {
        sends++;
      },
    },
  );
  controller.handle({ type: 'h5-owned-restart' });
  const drained = controller.drain().then((result) => {
    finished = true;
    return result;
  });
  await Promise.resolve();
  assert.equal(finished, false);
  release();
  assert.deepEqual(await drained, { started: true, failed: true, verified: false });
  assert.equal(sends, 0);
});

test('restart failures retain only a safe diagnostic and still fail closed', async () => {
  const evidence = {},
    sent = [],
    fixture = {
      names: { runId },
      evidence,
      restart: async () => {
        throw Object.assign(new Error('PRIVATE_CANARY'), { code: 'PRIVATE_CANARY' });
      },
    };
  const controller = ownedRestartController(fixture, {
    connected: true,
    send(message, callback) {
      sent.push(message);
      callback();
    },
  });
  controller.handle({ type: 'h5-owned-restart' });
  assert.deepEqual(await controller.drain(), { started: true, failed: true, verified: false });
  assert.equal(evidence.restartFailure.code, 'QA_FAILED');
  assert.match(evidence.restartFailure.location, /^h5-taptap-runtime\.mjs:\d+:\d+$/);
  assert.deepEqual(sent, [{ type: 'h5-owned-restart-failed', runId }]);
  assert(!JSON.stringify(evidence).includes('PRIVATE_CANARY'));
});
test('partial fresh fixture creation cleans only its verified UUID volume on network creation failure', async () => {
  const names = ownedNames(runId),
    calls = [];
  const docker = (args) => {
    calls.push(args);
    if (args[0] === 'image') return JSON.stringify([{ Id: 'sha256:' + 'a'.repeat(64) }]);
    if (args[0] === 'volume' && args[1] === 'create') return names.volume;
    if (args[0] === 'network' && args[1] === 'create') throw new Error('PRIVATE_CANARY');
    if (args[0] === 'network' && args[1] === 'ls') return '';
    if (
      args[0] === 'volume' &&
      args[1] === 'inspect' &&
      calls.some((call) => call[0] === 'volume' && call[1] === 'create')
    )
      return JSON.stringify([{ Name: names.volume, Labels: { 'small-games.fixture': runId } }]);
    if (args[0] === 'ps') return '';
    if (args[0] === 'volume' && args[1] === 'rm') return names.volume;
    throw new Error('not found');
  };
  await assert.rejects(createOwnedRuntime({ runId, docker }), /OWNED_FIXTURE_FAILED/);
  assert.deepEqual(
    calls.filter((call) => call.includes('rm')),
    [['volume', 'rm', names.volume]],
  );
});
test('lost create responses recover only exact named and labelled UUID resources', async () => {
  for (const lost of ['volume', 'network', 'container']) {
    const names = ownedNames(runId),
      created = new Set(),
      removed = [];
    const info = {
      Id: 'c'.repeat(64),
      Name: '/' + names.name,
      Config: { Labels: { 'small-games.task': names.task, 'small-games.fixture': runId } },
      NetworkSettings: { Networks: { [names.network]: {} }, Ports: {} },
      Mounts: [{ Name: names.volume, Destination: '/var/lib/postgresql/data' }],
    };
    const docker = (args) => {
      if (args[0] === 'rm') {
        removed.push('container');
        created.delete('container');
        return '';
      }
      const kind = args[0] === 'run' ? 'container' : args[0],
        operation = args[1];
      if (kind === 'image') return JSON.stringify([{ Id: 'sha256:' + 'a'.repeat(64) }]);
      if (args[0] === 'run' || operation === 'create') {
        created.add(kind);
        if (kind === lost) throw new Error('PRIVATE_CANARY lost response');
        return kind === 'volume' ? names.volume : (kind === 'container' ? 'c' : 'd').repeat(64);
      }
      if (operation === 'ls') {
        if (kind === 'container' || kind === 'network') assert(args.includes('--no-trunc'));
        return created.has(kind)
          ? kind === 'volume'
            ? names.volume
            : (kind === 'container' ? 'c' : 'd').repeat(64)
          : '';
      }
      if (operation === 'inspect') {
        if (!created.has(kind)) throw new Error('not found');
        return JSON.stringify([
          kind === 'container'
            ? info
            : {
                Id: 'd'.repeat(64),
                Name: kind === 'network' ? names.network : names.volume,
                Labels: { 'small-games.fixture': runId },
              },
        ]);
      }
      if (operation === 'rm') {
        removed.push(kind);
        created.delete(kind);
        return '';
      }
      if (args[0] === 'ps') return '';
      throw new Error('Unexpected fixture command');
    };
    await assert.rejects(createOwnedRuntime({ runId, docker }), /OWNED_FIXTURE_FAILED/);
    assert.equal(created.size, 0);
    assert.equal(removed.length, ['volume', 'network', 'container'].indexOf(lost) + 1);
  }
});
test('restart IPC accepts exactly six completed local variants owned by this fixture', () => {
  const names = ownedNames(runId),
    message = {
      type: 'h5-owned-restart',
      runId,
      checkpointId: runId,
      matches: matrixGames.flatMap((game) =>
        [false, true].map((ads) => ({
          variant: `${game}-ads-${ads ? 'on' : 'off'}-service-on`,
          roomCode: 'AABBCCDDEEFF',
          playerIds: [runId, '22345678-1234-1234-1234-123456789012'],
        })),
      ),
      solos: [
        { admissionId: runId, playerId: runId },
        {
          admissionId: '22345678-1234-1234-1234-123456789012',
          playerId: '32345678-1234-1234-1234-123456789012',
        },
      ],
    };
  assert.equal(validateRestartRequest(message, names).matches.length, 6);
  for (const change of [
    { runId: 'other' },
    { matches: message.matches.slice(1) },
    { matches: [...message.matches.slice(1), message.matches[1]] },
  ])
    assert.throws(() => validateRestartRequest({ ...message, ...change }, names));
});
test('Runtime HTTP preflight drives real request contracts without returning any bearer in evidence', async () => {
  // Transport-only fixture for this unit; the acceptance runner uses unmodified fetch + fresh PG.
  const { verifyRuntimeIdentity } = await import('./h5-taptap-runtime.mjs');
  let counter = 0,
    current,
    oldToken,
    oldRefresh,
    revoked = false;
  const now = Date.now();
  const result = await verifyRuntimeIdentity({
    now: () => now,
    request: async (url, init) => {
      let status = 200,
        body = {};
      const endpoint = new URL(url).pathname.slice(new URL(localCompetitionApi).pathname.length);
      if (endpoint === '/sessions/guest') {
        assert.deepEqual(Object.keys(JSON.parse(init.body)), ['game']);
        current = {
          userId: `${++counter}2345678-1234-1234-1234-123456789012`,
          sessionId: `${counter}2345678-1234-1234-1234-123456789012`,
          game: JSON.parse(init.body).game,
          identityMode: 'persistent',
          identityKind: 'guest',
          avatarId: 'fox',
          expiresAt: now + 900000,
          identityExpiresAt: null,
          refreshExpiresAt: now + 180 * 86400000,
          token: 'PRIVATE_CANARY',
          refreshToken: 'PRIVATE_REFRESH',
        };
        body = current;
        revoked = false;
        oldToken = null;
        oldRefresh = null;
      } else if (endpoint === '/sessions/refresh') {
        if (revoked || JSON.parse(init.body).refreshToken === oldRefresh) {
          status = 401;
          body = { error: 'REFRESH_EXPIRED' };
        } else {
          oldToken = current.token;
          oldRefresh = current.refreshToken;
          current = { ...current, token: 'PRIVATE_NEXT', refreshToken: 'PRIVATE_NEXT_REFRESH' };
          body = current;
        }
      } else if (endpoint === '/sessions/logout') revoked = true;
      else if (endpoint === '/me') {
        if (revoked || init.headers.authorization === 'Bearer ' + oldToken) {
          status = 401;
          body = { error: 'SESSION_EXPIRED' };
        } else body = { ...current, avatarUrl: '', region: null };
      } else if (
        (endpoint.startsWith('/boards/') && endpoint !== `/boards/${current.game}`) ||
        endpoint.startsWith('/games/')
      ) {
        status = 403;
        body = { error: 'IDENTITY_SCOPE_MISMATCH' };
      }
      return { status, json: async () => body };
    },
  });
  assert(!JSON.stringify(result).includes('PRIVATE_CANARY'));
  assert.equal(result.guestRequestsAt.length, 3);
});
