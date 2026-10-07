import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createMatch, tick } from '@coffeeeeffoc/tianxia-chalu/engine';
import { allowedOrigins, createTianxiaServer } from '../src/server.mjs';
import { ResultStore } from '../src/results.mjs';

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tianxia-server-'));
  let current = 1_800_000_000_000;
  const app = await createTianxiaServer({
    dataDir: directory,
    autoTick: false,
    now: () => current,
    ...options,
  });
  const address = await app.listen(0);
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  async function request(route, { token, method = 'GET', body, origin, ...rest } = {}) {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(origin ? { Origin: origin } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...rest,
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  return {
    app,
    directory,
    base,
    request,
    now: () => current,
    advance(ms) {
      current += ms;
      app.matches.advance();
    },
    async create(body = {}) {
      return (await request('/api/matches', { method: 'POST', body })).body;
    },
  };
}

test('API validates creation, rejects forged scores/seeds and protects every match operation', async (t) => {
  const f = await fixture(t);
  const created = await f.request('/api/matches', {
    method: 'POST',
    body: { levelId: 'crossroads' },
  });
  assert.equal(created.status, 201);
  const { matchId, token, snapshot } = created.body;
  assert.equal(token.length, 43);
  assert.equal(snapshot.state.playerFactionId, 0);
  assert.ok(Number.isInteger(snapshot.state.seed));
  const base = `/api/matches/${matchId}`;
  for (const action of ['', '/result', '/commands', '/pause', '/resume', '/abandon']) {
    const response = await f.request(
      `${base}${action}`,
      action && action !== '/result'
        ? {
            method: 'POST',
            body: action === '/commands' ? { junctionId: 'invalid', sequence: 1 } : {},
          }
        : {},
    );
    assert.equal(response.status, 404, action);
  }
  assert.equal((await f.request(base, { token: 'a'.repeat(43) })).status, 404);
  const result = await f.request(base, { token });
  assert.equal(result.status, 200);
  assert.equal(JSON.stringify(result.body).includes(token), false);
  for (const body of [
    { levelId: 'missing' },
    { difficulty: 'god' },
    { seed: 123 },
    { score: 1000000 },
    [],
  ]) {
    assert.equal((await f.request('/api/matches', { method: 'POST', body })).status, 400);
  }
  assert.equal((await f.request(`${base}/result`, { token })).status, 409);
  assert.equal((await f.request(`${base}?token=${token}`)).status, 400);
});

test('authoritative route commands enforce ownership, cooldown, order and idempotent retries', async (t) => {
  const f = await fixture(t);
  const { matchId, token, snapshot } = await f.create();
  const route = `/api/matches/${matchId}/commands`;
  const own = snapshot.state.junctions.find((junction) => junction.owner === 0);
  const enemy = snapshot.state.junctions.find((junction) => junction.owner !== 0);
  const command = (body) => f.request(route, { method: 'POST', token, body });
  assert.equal((await command({ junctionId: enemy.id, sequence: 1 })).status, 403);
  assert.equal((await command({ junctionId: 'missing', sequence: 1 })).status, 400);
  assert.equal((await command({ junctionId: own.id, sequence: 1, routeIndex: 31 })).status, 400);
  assert.equal((await command({ junctionId: own.id, sequence: 2 })).status, 409);
  const body = { junctionId: own.id, sequence: 1 };
  const accepted = await command(body);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.snapshot.state.stats.switches, 1);
  const retry = await command(body);
  assert.equal(retry.body.duplicate, true);
  assert.equal(retry.body.snapshot.state.stats.switches, 1);
  assert.equal((await command({ ...body, routeIndex: 0 })).status, 409);
  assert.equal((await command({ ...body, sequence: 2 })).status, 429);
  f.advance(200);
  assert.equal((await command({ ...body, sequence: 2 })).status, 200);
  assert.equal(
    (await f.request(`/api/matches/${matchId}`, { token })).body.snapshot.lastSequence,
    2,
  );
});

test('server advances only fixed 100 ms steps, pause freezes time and resume does not jump', async (t) => {
  const f = await fixture(t);
  const { matchId, token, snapshot } = await f.create();
  const base = `/api/matches/${matchId}`;
  const expected = createMatch({ levelId: snapshot.state.levelId, seed: snapshot.state.seed });
  f.advance(350);
  tick(expected, 0.3);
  const observed = (await f.request(base, { token })).body.snapshot;
  assert.deepEqual(observed.state, expected);
  const control = (action) => f.request(`${base}/${action}`, { token, method: 'POST', body: {} });
  assert.equal((await control('pause')).body.snapshot.paused, true);
  f.advance(20_000);
  assert.deepEqual((await f.request(base, { token })).body.snapshot.state, expected);
  const own = expected.junctions.find((junction) => junction.owner === 0);
  assert.equal(
    (
      await f.request(`${base}/commands`, {
        token,
        method: 'POST',
        body: { junctionId: own.id, sequence: 1 },
      })
    ).status,
    409,
  );
  assert.equal((await control('resume')).body.snapshot.paused, false);
  f.advance(100);
  tick(expected, 0.1);
  assert.deepEqual((await f.request(base, { token })).body.snapshot.state, expected);
});

test('fixed simulation computes final results and authenticated reports survive process restart', async (t) => {
  const f = await fixture(t);
  const { matchId, token, snapshot } = await f.create();
  const expected = createMatch({ levelId: snapshot.state.levelId, seed: snapshot.state.seed });
  tick(expected, expected.duration);
  for (let i = 0; i < expected.duration * 10; i++) f.advance(100);
  const report = await f.request(`/api/matches/${matchId}/result`, { token });
  assert.equal(report.status, 200);
  assert.deepEqual(report.body.result, expected.result);
  assert.equal(report.body.persisted, true);
  const file = JSON.parse(await readFile(path.join(f.directory, `${matchId}.json`), 'utf8'));
  assert.equal(JSON.stringify(file).includes(token), false);
  const restored = await createTianxiaServer({ dataDir: f.directory, autoTick: false, now: f.now });
  t.after(() => restored.close());
  assert.deepEqual(await restored.matches.result(matchId, token), report.body);
  await assert.rejects(restored.matches.result(matchId, 'b'.repeat(43)), { status: 404 });
  assert.throws(() => restored.matches.get(matchId, token), { status: 404 });
});

test('abandon is terminal; inactive matches expire and free bounded capacity after retention', async (t) => {
  const f = await fixture(t, { maxMatches: 1, matchOptions: { idleMs: 1000, finishedMs: 100 } });
  const first = await f.create();
  assert.equal((await f.request('/api/matches', { method: 'POST', body: {} })).status, 503);
  f.advance(1000);
  const expired = await f.app.matches.result(first.matchId, first.token);
  assert.equal(expired.result.reason, 'expired');
  assert.equal(expired.result.outcome, 'defeat');
  f.advance(100);
  assert.equal(f.app.matches.matches.size, 0);
  const next = await f.create();
  const path = `/api/matches/${next.matchId}`;
  const abandoned = await f.request(`${path}/abandon`, {
    token: next.token,
    method: 'POST',
    body: {},
  });
  assert.equal(abandoned.body.snapshot.state.result.reason, 'abandoned');
  assert.equal(
    (await f.request(`${path}/resume`, { token: next.token, method: 'POST', body: {} })).status,
    409,
  );
  assert.equal(
    (await f.request(`${path}/abandon`, { token: next.token, method: 'POST', body: {} })).status,
    200,
  );
  assert.equal((await f.request(`${path}/result`, { token: next.token })).body.persisted, true);
});

test('disk failure never claims a durable result', async (t) => {
  const errors = [];
  const f = await fixture(t, { onError: (...args) => errors.push(args) });
  f.app.results.save = async () => {
    throw new Error('disk full');
  };
  const match = await f.create();
  f.app.matches.control(match.matchId, match.token, 'abandon');
  assert.equal((await f.app.matches.result(match.matchId, match.token)).persisted, false);
  assert.equal(errors.length, 1);
});

test('HTTP rejects hostile origins, invalid and excessive bodies; creation rate is bounded', async (t) => {
  const f = await fixture(t, { origins: allowedOrigins('https://game.example') });
  for (const origin of ['http://localhost:5173', 'https://game.example']) {
    const response = await f.request('/health', { origin });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
  }
  for (const origin of ['https://evil.example', 'null', 'https://localhost.evil.example']) {
    assert.equal((await f.request('/health', { origin })).status, 403);
  }
  assert.throws(() => allowedOrigins('*'));
  assert.throws(() => allowedOrigins('https://game.example/path'));
  const preflight = await fetch(`${f.base}/api/matches`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://game.example' },
  });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);
  assert.equal(
    (await f.request('/api/matches', { method: 'POST', body: { padding: 'x'.repeat(3000) } }))
      .status,
    413,
  );
  const invalid = await fetch(`${f.base}/api/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
  assert.equal(invalid.status, 400);
  const wrongType = await fetch(`${f.base}/api/matches`, { method: 'POST', body: '{}' });
  assert.equal(wrongType.status, 415);
  let status;
  for (let i = 0; i < 13; i++)
    status = (await f.request('/api/matches', { method: 'POST', body: {} })).status;
  assert.equal(status, 429);
});

test('static game assets stay inside the built application, including with dev query', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tianxia-static-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'dist');
  await mkdir(root);
  await writeFile(path.join(root, 'index.html'), '<!doctype html><title>天下岔路</title>');
  await writeFile(path.join(directory, 'private.txt'), 'secret');
  const f = await fixture(t, { staticDir: root });
  const page = await fetch(`${f.base}/play/?dev=1`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /天下岔路/);
  assert.equal((await fetch(`${f.base}/play/%2e%2e%2fprivate.txt`)).status, 404);
  assert.equal((await fetch(`${f.base}/play/.data/results.json`)).status, 404);
});

test('result storage applies bounded retention and record capacity', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tianxia-results-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new ResultStore(directory, { maxRecords: 2, retentionMs: 1000 });
  await store.initialize(100);
  for (let i = 1; i <= 3; i++)
    await store.save({
      version: 1,
      matchId: `00000000-0000-0000-0000-00000000000${i}`,
      tokenHash: 'a'.repeat(64),
      finishedAt: 100 + i,
      result: { outcome: 'defeat' },
    });
  assert.equal(store.records.size, 2);
  assert.equal((await readdir(directory)).length, 2);
  await store.prune(2000);
  assert.equal(store.records.size, 0);
  assert.deepEqual(await readdir(directory), []);
});
