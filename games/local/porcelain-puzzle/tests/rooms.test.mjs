import test from 'node:test';
import assert from 'node:assert/strict';
import { Rooms } from '../src/rooms.mjs';
import { createGameServer } from '../server.mjs';
function setup(count = 2) {
  let now = 1000;
  const rooms = new Rooms({ now: () => now }),
    a = rooms.create({ name: '甲', level: 1, capacity: count }),
    players = [a];
  for (let i = 1; i < count; i++) players.push(rooms.join(a.code, { name: `瓷友${i}` }));
  return {
    rooms,
    players,
    code: a.code,
    advance(ms) {
      now += ms;
      return now;
    },
  };
}
function ready(t) {
  for (const p of t.players) t.rooms.action(t.code, p.token, { type: 'ready' });
  t.advance(3500);
  return t.rooms.poll(t.code, t.players[0].token);
}
test('2 to 5 players receive identical puzzles and start only together', () => {
  for (let n = 2; n <= 5; n++) {
    const t = setup(n),
      r = ready(t);
    assert.equal(r.status, 'playing');
    const states = t.players.map((p) => t.rooms.poll(t.code, p.token).attempt);
    for (const s of states) assert.deepEqual(s.groups, states[0].groups);
    assert.throws(() => t.rooms.join(t.code, { name: '溢出' }), /已满/);
  }
});
test('authoritative clock, validated actions, completion waits then advances together', () => {
  const t = setup(),
    r = ready(t);
  let seq = 0,
    s = r.attempt;
  for (const g of [...s.groups]) {
    const current = t.rooms.poll(t.code, t.players[0].token);
    if (!current.attempt.groups.some((x) => x.id === g.id)) continue;
    t.rooms.action(t.code, t.players[0].token, {
      type: 'move',
      round: 1,
      seq: ++seq,
      group: g.id,
      x: 20,
      y: 70,
    });
  }
  assert.equal(t.rooms.poll(t.code, t.players[0].token).attempt.phase, 'won');
  assert.equal(t.rooms.poll(t.code, t.players[1].token).status, 'playing');
  t.rooms.action(t.code, t.players[1].token, { type: 'skip', round: 1, seq: 1 });
  const result = t.rooms.poll(t.code, t.players[0].token);
  assert.equal(result.status, 'result');
  assert.equal(result.ranking.length, 1);
  t.advance(6500);
  const next = t.rooms.poll(t.code, t.players[0].token);
  assert.equal(next.level, 2);
  assert.equal(next.round, 2);
  assert.equal(next.attempt.phase, 'intro');
  assert.throws(() =>
    t.rooms.action(t.code, t.players[0].token, {
      type: 'move',
      round: 1,
      seq: 1,
      group: 0,
      x: 20,
      y: 70,
    }),
  );
});
test('host leaves, remaining player can continue; everyone ready after a departure starts', () => {
  const t = setup(3);
  t.rooms.action(t.code, t.players[0].token, { type: 'ready' });
  t.rooms.action(t.code, t.players[1].token, { type: 'ready' });
  t.rooms.action(t.code, t.players[2].token, { type: 'leave' });
  assert.equal(t.rooms.poll(t.code, t.players[0].token).status, 'playing');
  t.advance(3500);
  t.rooms.action(t.code, t.players[0].token, { type: 'leave' });
  const b = t.rooms.poll(t.code, t.players[1].token);
  assert.equal(b.host, b.me);
  t.rooms.action(t.code, t.players[1].token, { type: 'skip', round: 1, seq: 1 });
  assert.equal(t.rooms.poll(t.code, t.players[1].token).status, 'result');
});
test('timeout counts, lost player exits after grace, reconnect cannot exceed capacity', () => {
  const t = setup(2);
  ready(t);
  for (let i = 0; i < 4; i++) {
    t.advance(8000);
    t.rooms.poll(t.code, t.players[1].token);
  }
  assert.equal(t.rooms.poll(t.code, t.players[1].token).players.length, 1);
  const newcomer = t.rooms.join(t.code, { name: '新人' });
  assert.equal(newcomer.players.find((p) => p.id === newcomer.me).spectator, true);
  assert.throws(() => t.rooms.join(t.code, { token: t.players[0].token }), /已满/);
  for (let i = 0; i < 6; i++) {
    t.advance(8000);
    t.rooms.poll(t.code, t.players[1].token);
    t.rooms.poll(t.code, newcomer.token);
  }
  const r = t.rooms.poll(t.code, t.players[1].token);
  assert.equal(r.status, 'result');
  assert.equal(r.ranking.length, 0);
});
test('hint state resets next round and duplicate or nonfinite commands reject', () => {
  const t = setup();
  ready(t);
  const a = t.players[0];
  t.rooms.action(t.code, a.token, { type: 'hint', round: 1, seq: 1 });
  assert.throws(
    () => t.rooms.action(t.code, a.token, { type: 'hint', round: 1, seq: 1 }),
    /已同步/,
  );
  assert.throws(
    () =>
      t.rooms.action(t.code, a.token, { type: 'move', round: 1, seq: 2, group: 0, x: NaN, y: 0 }),
    /无效/,
  );
  t.rooms.action(t.code, a.token, { type: 'skip', round: 1, seq: 2 });
  t.rooms.action(t.code, t.players[1].token, { type: 'skip', round: 1, seq: 1 });
  t.advance(6500);
  assert.equal(t.rooms.poll(t.code, a.token).hintPair, null);
});
test('HTTP transport uses bearer sessions and rejects foreign origin, malformed body', async () => {
  const server = createGameServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const res = await fetch(base + '/api/porcelain/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '测试', level: 1 }),
    });
    assert.equal(res.status, 200);
    const a = await res.json();
    assert.equal((await fetch(`${base}/api/porcelain/rooms/${a.code}`)).status, 403);
    const p = await (
      await fetch(`${base}/api/porcelain/rooms/${a.code}`, {
        headers: { Authorization: `Bearer ${a.token}` },
      })
    ).json();
    assert.equal(p.code, a.code);
    assert.equal(JSON.stringify(p).includes(a.token), false);
    assert.equal(
      (
        await fetch(base + '/api/porcelain/rooms', {
          method: 'POST',
          headers: { Origin: 'https://foreign.example' },
          body: '{}',
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(base + '/api/porcelain/rooms', { method: 'POST', body: '[' })).status,
      400,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test('authenticated players behind one proxy have independent rate limits', async () => {
  const rooms = new Rooms(),
    players = Array.from({ length: 3 }, () => rooms.create());
  const server = createGameServer({ rooms });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/porcelain/rooms/`;
  try {
    for (let i = 0; i < 210; i++) {
      const replies = await Promise.all(
        players.map((p) =>
          fetch(base + p.code, { headers: { Authorization: `Bearer ${p.token}` } }),
        ),
      );
      for (const response of replies) {
        assert.equal(response.status, 200);
        await response.json();
      }
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
