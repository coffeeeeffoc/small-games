import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeServer, RemoteMatch } from '../remote.mjs';

const initial = { matchId: 'match-1', revision: 0, lastSequence: 0, paused: false, state: { status: 'playing' } };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const started = () => json({ matchId: initial.matchId, token: 'secret-token', snapshot: structuredClone(initial) });
const advance = (revision, lastSequence = revision) => ({ ...initial, revision, lastSequence });

test('normalizes an origin and rejects credentials, paths and non-HTTP services', () => {
  assert.equal(normalizeServer('http://localhost:43004/'), 'http://localhost:43004');
  for (const value of ['file:///tmp/server', 'https://user:pass@game.example', 'https://game.example/api', 'https://game.example?token=1']) {
    assert.throws(() => normalizeServer(value));
  }
});

test('known rejection clears pending command and preserves next valid sequence', async () => {
  const commands = [];
  const client = new RemoteMatch('http://localhost:43004', { fetch: async (url, options) => {
    if (url.endsWith('/api/matches')) return started();
    const body = JSON.parse(options.body);
    commands.push(body);
    if (commands.length === 1) return json({ error: { code: 'not-owner', message: '无权切换此岔路' } }, 403);
    return json({ accepted: true, snapshot: advance(1) });
  } });
  await client.start('crossroads', 'normal');
  await assert.rejects(client.route('enemy'), { message: '无权切换此岔路', status: 403, code: 'not-owner', rejected: true });
  assert.equal(client.pending, null);
  await client.route('own');
  assert.deepEqual(commands, [{ junctionId: 'enemy', sequence: 1 }, { junctionId: 'own', sequence: 1 }]);
  assert.equal(client.sequence, 1);
});

test('lost acknowledgement retries exact instruction even after poll confirms its sequence', async () => {
  const commands = [];
  const client = new RemoteMatch('http://localhost:43004', { fetch: async (url, options) => {
    if (url.endsWith('/api/matches')) return started();
    if (!url.endsWith('/commands')) return json({ snapshot: advance(2, 1) });
    commands.push(JSON.parse(options.body));
    if (commands.length === 1) throw new TypeError('connection reset after accepted command');
    return json({ accepted: true, duplicate: commands.length === 2, snapshot: advance(commands.length, commands.length - 1) });
  } });
  await client.start('crossroads', 'normal');
  await assert.rejects(client.route('first'), { status: 0, rejected: false });
  assert.deepEqual(client.pending, { junctionId: 'first', sequence: 1 });
  await client.poll();
  await client.route('different-click');
  assert.deepEqual(commands[1], commands[0]);
  assert.equal(client.pending, null);
  await client.route('second');
  assert.deepEqual(commands[2], { junctionId: 'second', sequence: 2 });
});

test('out-of-order snapshots cannot rewind state or sequence', async () => {
  const client = new RemoteMatch('http://localhost:43004', { fetch: async () => started() });
  await client.start('crossroads', 'normal');
  client.accept(advance(5, 3));
  client.accept(advance(2, 1));
  assert.equal(client.snapshot.revision, 5);
  assert.equal(client.sequence, 3);
  assert.throws(() => client.accept({ ...advance(6), matchId: 'different-match' }), { code: 'invalid-snapshot' });
});

test('overlapping route calls share one request and do not corrupt pending state', async () => {
  let resolveCommand;
  let commands = 0;
  const client = new RemoteMatch('http://localhost:43004', { fetch: async (url) => {
    if (url.endsWith('/api/matches')) return started();
    commands++;
    return new Promise((resolve) => { resolveCommand = resolve; });
  } });
  await client.start('crossroads', 'normal');
  const first = client.route('own');
  const second = client.route('different');
  resolveCommand(json({ accepted: true, snapshot: advance(1) }));
  await Promise.all([first, second]);
  assert.equal(commands, 1);
  assert.equal(client.sequence, 1);
  assert.equal(client.pending, null);
});

test('cancel during creation abandons late match once and cannot revive it', async () => {
  let completeStart;
  let abandoned = 0;
  const client = new RemoteMatch('http://localhost:43004', { fetch: async (url, options) => {
    if (url.endsWith('/api/matches')) return new Promise((resolve) => { completeStart = resolve; });
    assert.ok(url.endsWith('/abandon'));
    assert.equal(options.headers.Authorization, 'Bearer secret-token');
    abandoned++;
    return json({ snapshot: advance(1) });
  } });
  const starting = client.start('crossroads', 'normal');
  await client.close();
  completeStart(started());
  await assert.rejects(starting, { code: 'match-closed' });
  await client.close();
  assert.equal(abandoned, 1);
  assert.equal(client.snapshot, undefined);
  await assert.rejects(client.poll(), { code: 'match-closed' });
});

test('non-JSON upstream error keeps uncertain command for retry', async () => {
  const client = new RemoteMatch('http://localhost:43004', { fetch: async (url) => url.endsWith('/api/matches')
    ? started() : new Response('gateway is unavailable', { status: 502 }) });
  await client.start('crossroads', 'normal');
  await assert.rejects(client.route('own'), { code: 'invalid-response', status: 502, rejected: false });
  assert.deepEqual(client.pending, { junctionId: 'own', sequence: 1 });
});
