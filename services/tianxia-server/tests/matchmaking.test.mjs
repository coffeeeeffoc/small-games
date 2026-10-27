import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createTianxiaServer } from '../src/server.mjs';

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tianxia-pvp-'));
  let current = 1_800_000_000_000;
  const app = await createTianxiaServer({
    dataDir: directory,
    autoTick: false,
    now: () => current,
    ...options,
  });
  const address = await app.listen(0),
    base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const request = async (route, { token, method = 'GET', body } = {}) => {
    const response = await fetch(base + route, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const player = async () => (await request('/api/players', { method: 'POST', body: {} })).body;
  const join = async (identity) =>
    (await request('/api/matchmaking', { token: identity.token, method: 'POST', body: {} })).body;
  return {
    app,
    directory,
    request,
    player,
    join,
    now: () => current,
    advance(ms) {
      current += ms;
      app.matches.advance();
      app.matchmaking.advance();
    },
    async pair() {
      const a = await player(),
        b = await player();
      await join(a);
      const second = await join(b);
      const first = (await request('/api/matchmaking', { token: a.token })).body;
      return { a, b, first, second };
    },
  };
}

test('human matching is idempotent; private seats independently own and sequence multi-route commands', async (t) => {
  const f = await fixture(t),
    a = await f.player();
  assert.equal((await f.join(a)).status, 'waiting');
  assert.ok(
    (await Promise.all([f.join(a), f.join(a)])).every((entry) => entry.status === 'waiting'),
  );
  assert.equal(f.app.matchmaking.waiting.size, 1);
  const b = await f.player(),
    second = await f.join(b),
    first = (await f.request('/api/matchmaking', { token: a.token })).body;
  assert.equal(first.matchId, second.matchId);
  assert.notEqual(first.token, second.token);
  assert.equal(first.snapshot.state.playerFactionId, 0);
  assert.equal(second.snapshot.state.playerFactionId, 1);
  assert.equal(first.snapshot.state.aiEnabled, false);
  assert.deepEqual(first.snapshot.state.loadout, []);
  assert.equal(JSON.stringify(second.snapshot).includes(first.token), false);
  const ownA = first.snapshot.state.junctions.find((j) => j.owner === 0),
    ownB = second.snapshot.state.junctions.find((j) => j.owner === 1);
  const endpoint = `/api/matches/${first.matchId}/commands`;
  assert.equal(
    (
      await f.request(endpoint, {
        token: second.token,
        method: 'POST',
        body: { junctionId: ownA.id, sequence: 1, routeIndex: 0, enabled: true },
      })
    ).status,
    403,
  );
  const commands = [
    { junctionId: ownA.id, sequence: 1, routeIndex: 0, enabled: true },
    { junctionId: ownB.id, sequence: 1, routeIndex: 0, enabled: true },
  ];
  const responses = await Promise.all(
    [first, second].map((seat, i) =>
      f.request(endpoint, { token: seat.token, method: 'POST', body: commands[i] }),
    ),
  );
  assert.ok(
    responses.every((entry) => entry.status === 200 && entry.body.snapshot.lastSequence === 1),
  );
  assert.equal(
    (await f.request(endpoint, { token: second.token, method: 'POST', body: commands[1] })).body
      .duplicate,
    true,
  );
  assert.equal(
    (
      await f.request(endpoint, {
        token: second.token,
        method: 'POST',
        body: { ...commands[1], enabled: false },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request(`/api/matches/${first.matchId}/pause`, {
        token: first.token,
        method: 'POST',
        body: {},
      })
    ).body.error.code,
    'multiplayer-no-pause',
  );
  assert.equal(
    (await f.request('/api/matchmaking', { token: a.token, method: 'DELETE' })).body.status,
    'matched',
  );
  assert.equal(f.app.matches.matches.get(first.matchId).state.playerFactionId, 0);
  f.advance(300);
  const remove = await f.request(endpoint, {
    token: second.token,
    method: 'POST',
    body: { ...commands[1], sequence: 2, enabled: false },
  });
  assert.equal(remove.status, 200);
  assert.deepEqual(
    remove.body.snapshot.state.junctions.find((j) => j.id === ownB.id).routeIndices,
    [],
  );
});

test('server rank and win-rate filters widen gradually and reject client rating claims', async (t) => {
  const f = await fixture(t),
    a = await f.player(),
    b = await f.player();
  await f.app.players.mutate((data) => {
    data.players[b.playerId].career.xp = 1500;
    data.players[b.playerId].career.matched = { games: 100, wins: 100, losses: 0, draws: 0 };
  });
  assert.equal(
    (
      await f.request('/api/matchmaking', {
        token: a.token,
        method: 'POST',
        body: { level: 45, winRate: 1 },
      })
    ).status,
    400,
  );
  assert.equal(
    (await f.request('/api/players', { method: 'POST', body: { xp: 9999 } })).status,
    400,
  );
  assert.equal((await f.join(a)).status, 'waiting');
  assert.equal((await f.join(b)).status, 'waiting');
  for (let i = 0; i < 5; i++) {
    f.advance(10_000);
    assert.equal((await f.request('/api/matchmaking', { token: a.token })).body.status, 'waiting');
    await f.request('/api/matchmaking', { token: b.token });
  }
  f.advance(10_000);
  const paired = (await f.request('/api/matchmaking', { token: a.token })).body;
  assert.equal(paired.status, 'matched');
  assert.equal(paired.snapshot.state.aiEnabled, false);
});

test('waiting never invents a bot; cancellation is idempotent and absent queue entries expire', async (t) => {
  const f = await fixture(t),
    a = await f.player();
  await f.join(a);
  for (let i = 0; i < 8; i++) {
    f.advance(10_000);
    assert.equal((await f.request('/api/matchmaking', { token: a.token })).body.status, 'waiting');
  }
  assert.equal(f.app.matches.matches.size, 0);
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await f.request('/api/matchmaking', { token: a.token, method: 'DELETE' })).body.status,
      'idle',
    );
  await f.join(a);
  f.advance(30_000);
  assert.equal((await f.request('/api/matchmaking', { token: a.token })).body.status, 'idle');
  assert.equal((await f.request('/api/matchmaking')).status, 401);
});

test('surrender records both players once, promotes the winner, and survives authenticated restart', async (t) => {
  const f = await fixture(t),
    { a, b, first, second } = await f.pair(),
    route = `/api/matches/${first.matchId}`;
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await f.request(route + '/abandon', { token: second.token, method: 'POST', body: {} }))
        .status,
      200,
    );
  const win = (await f.request(route + '/result', { token: first.token })).body,
    loss = (await f.request(route + '/result', { token: second.token })).body;
  assert.equal(win.result.outcome, 'victory');
  assert.equal(loss.result.outcome, 'defeat');
  assert.equal(win.profile.career.xp, 100);
  assert.equal(loss.profile.career.xp, 0);
  assert.equal(win.experienceGained, 100);
  assert.equal(win.profile.rank.level, 2);
  assert.equal(win.profile.career.matched.wins, 1);
  assert.equal(loss.profile.career.matched.losses, 1);
  assert.equal((await f.request(route + '/result', { token: a.token })).status, 404);
  const disk = await readFile(path.join(f.directory, 'players/players.json'), 'utf8');
  for (const token of [a.token, b.token, first.token, second.token])
    assert.equal(disk.includes(token), false);
  await f.app.close();
  const restored = await createTianxiaServer({ dataDir: f.directory, autoTick: false, now: f.now });
  t.after(() => restored.close());
  assert.equal(restored.players.profile(a.playerId).career.xp, 100);
  assert.equal(
    (await restored.matches.result(first.matchId, second.token)).result.outcome,
    'defeat',
  );
  assert.equal(
    (await restored.matches.result(first.matchId, first.token)).profile.career.matched.games,
    1,
  );
  assert.equal(restored.players.authenticate(b.token).playerId, b.playerId);
});

test('real fixed-step timeout grants normal victory/defeat experience by seat', async (t) => {
  const f = await fixture(t),
    { first, second } = await f.pair();
  const own = first.snapshot.state.junctions.find((j) => j.owner === 0),
    route = `/api/matches/${first.matchId}`;
  await f.request(route + '/commands', {
    token: first.token,
    method: 'POST',
    body: { junctionId: own.id, sequence: 1, routeIndex: 0, enabled: true },
  });
  for (let i = 0; i < 180; i++) {
    f.advance(1000);
    f.app.matches.get(first.matchId, first.token);
    f.app.matches.get(first.matchId, second.token);
  }
  const win = await f.app.matches.result(first.matchId, first.token),
    loss = await f.app.matches.result(first.matchId, second.token);
  assert.equal(win.result.reason, 'timeout');
  assert.equal(win.result.outcome, 'victory');
  assert.equal(loss.result.outcome, 'defeat');
  assert.equal(win.profile.career.xp, 100);
  assert.equal(loss.profile.career.xp, 35);
  assert.equal(loss.experienceGained, 35);
});

test('one disconnected seat forfeits after grace while a present opponent keeps playing', async (t) => {
  const f = await fixture(t),
    { first, second } = await f.pair();
  for (let i = 0; i < 4; i++) {
    f.advance(10_000);
    f.app.matches.get(first.matchId, first.token);
  }
  f.advance(5000);
  const result = await f.app.matches.result(first.matchId, first.token);
  assert.equal(result.result.reason, 'disconnected');
  assert.equal(result.result.outcome, 'victory');
  assert.equal((await f.app.matches.result(second.matchId, second.token)).experienceGained, 0);
});

test('profile persistence failures stay unconfirmed and committed results replay exactly once on startup', async (t) => {
  const errors = [],
    f = await fixture(t, { onError: (...args) => errors.push(args) });
  const { a, first, second } = await f.pair();
  f.app.players.settle = async () => {
    throw new Error('profile disk unavailable');
  };
  f.app.matches.control(first.matchId, second.token, 'abandon');
  const failed = await f.app.matches.result(first.matchId, first.token);
  assert.equal(failed.persisted, false);
  assert.equal(failed.profile.career.xp, 0);
  assert.equal(errors.length, 1);
  await f.app.close();
  const restored = await createTianxiaServer({ dataDir: f.directory, autoTick: false, now: f.now });
  t.after(() => restored.close());
  assert.equal(restored.players.profile(a.playerId).career.xp, 100);
  await restored.players.settle(restored.results.records.get(first.matchId));
  assert.equal(restored.players.profile(a.playerId).career.xp, 100);
});

test('associated PVE gives smaller authoritative experience and rejects concurrent sessions', async (t) => {
  const f = await fixture(t),
    identity = await f.player();
  const created = (
    await f.request('/api/matches', { token: identity.token, method: 'POST', body: { seed: 1 } })
  ).body;
  assert.equal(
    (await f.request('/api/matches', { token: identity.token, method: 'POST', body: {} })).status,
    409,
  );
  for (let i = 0; i < 180; i++) f.advance(1000);
  const result = await f.app.matches.result(created.matchId, created.token),
    amount = { victory: 20, defeat: 8, draw: 12 }[result.result.outcome];
  assert.equal(result.profile.career.xp, amount);
  assert.equal(result.profile.career.pve.games, 1);
  assert.equal(result.profile.career.matched.games, 0);
  assert.equal(result.profile.winRate, null);
  assert.equal(
    (await f.request('/api/players/me', { token: identity.token })).body.profile.career.xp,
    amount,
  );
});

test('corrupted v2 seats are discarded before startup replay without losing player identities', async (t) => {
  const f = await fixture(t),
    identity = await f.player();
  const id = '00000000-0000-0000-0000-000000000001';
  await writeFile(
    path.join(f.directory, id + '.json'),
    JSON.stringify({
      version: 2,
      matchId: id,
      mode: 'matched',
      tokenHash: 'a'.repeat(64),
      finishedAt: f.now(),
      result: { outcome: 'victory' },
      seats: {},
    }),
  );
  await f.app.close();
  const restored = await createTianxiaServer({ dataDir: f.directory, autoTick: false, now: f.now });
  t.after(() => restored.close());
  assert.equal(restored.results.records.has(id), false);
  assert.equal(restored.players.authenticate(identity.token).playerId, identity.playerId);
  assert.equal(restored.players.profile(identity.playerId).career.xp, 0);
});
