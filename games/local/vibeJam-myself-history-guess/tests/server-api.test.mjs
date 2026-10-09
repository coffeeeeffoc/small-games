import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { createHistoryServer } from '../server/index.mjs';

const SECRET = 'test-only-identity-secret-with-at-least-thirty-two-bytes';
const START = Date.UTC(2026, 9, 5, 12);
const DAY = 86_400_000;
const privateKeys = new Set([
  'year',
  'lat',
  'lng',
  'location',
  'sceneId',
  'deck',
  'seed',
  'tolerance',
  'hint',
  'story',
  'source',
  'distance',
  'years',
  'answer',
  'question_version',
]);
function assertPrivate(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!privateKeys.has(key), `private field leaked: ${key}`);
    assertPrivate(child);
  }
}

async function fixture(t, extra = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'history-api-test-'));
  const questionDirectory = join(directory, 'questions');
  const assetDirectory = join(directory, 'public');
  await mkdir(questionDirectory);
  await mkdir(join(assetDirectory, 'assets'), { recursive: true });
  for (let i = 0; i < 9; i++) {
    const q = {
      id: `scene-${i}`,
      year: 700 + i * 70,
      lat: 30 + i,
      lng: 110 + i,
      tolerance: 20,
      region: i < 6 ? 'china' : 'world',
      difficulty: (i % 3) + 1,
      clue: `Observe architecture ${i}`,
      image: `assets/scene-${i}.webp`,
      view: { yaw: 180, pitch: 0, fov: 75 },
    };
    await writeFile(join(questionDirectory, `scene-${i}.json`), JSON.stringify(q));
    await writeFile(join(assetDirectory, q.image), Buffer.from(`unique-scene-image-${i}`));
  }
  let now = START;
  const errors = [];
  const config = {
    dbPath: join(directory, 'history.sqlite'),
    questionDirectory,
    assetDirectory,
    identitySecret: SECRET,
    now: () => now,
    onError: (error) => errors.push(error),
    ...extra,
  };
  let app = createHistoryServer(config),
    address = await app.listen(0, '127.0.0.1');
  const f = {
    directory,
    questionDirectory,
    assetDirectory,
    errors,
    get app() {
      return app;
    },
    get base() {
      return `http://127.0.0.1:${address.port}`;
    },
    get now() {
      return now;
    },
    set now(value) {
      now = value;
    },
    async call(path, { method = 'GET', body, token, headers = {} } = {}) {
      const response = await fetch(f.base + '/api/history' + path, {
        method,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      assertPrivate(data);
      return { status: response.status, data };
    },
    identity(sub, overrides = {}) {
      const payload = Buffer.from(
        JSON.stringify({
          sub,
          nickname: sub,
          nonce: randomUUID(),
          aud: 'here-and-then',
          exp: Math.floor(now / 1000) + 120,
          ...overrides,
        }),
      ).toString('base64url');
      return `${payload}.${createHmac('sha256', SECRET).update(payload).digest('base64url')}`;
    },
    async session(sub) {
      const response = await f.call('/sessions', {
        method: 'POST',
        body: sub ? { identity: f.identity(sub) } : { nickname: '旅人' },
      });
      assert.equal(response.status, 200);
      return response.data;
    },
    async start(token, mode = 'duel', extras = {}) {
      const response = await f.call('/runs', { method: 'POST', token, body: { mode, ...extras } });
      assert.equal(response.status, 200, JSON.stringify(response.data));
      return response.data.run;
    },
    question(run) {
      return JSON.parse(app.db.prepare('SELECT deck FROM runs WHERE id = ?').get(run.id).deck)[
        run.index
      ];
    },
    async answer(token, item, overrides = {}) {
      const q = f.question(item);
      return f.call(`/runs/${item.id}/answers`, {
        method: 'POST',
        token,
        body: {
          roundId: item.round.id,
          requestId: randomUUID(),
          year: q.year,
          point: { lat: q.lat, lng: q.lng },
          ...overrides,
        },
      });
    },
    async finish(token, item, { timedOut = false } = {}) {
      while (item.phase !== 'finished') {
        if (item.phase === 'revealed') {
          const response = await f.call(`/runs/${item.id}/next`, {
            method: 'POST',
            token,
            body: { roundId: item.round.id },
          });
          assert.equal(response.status, 200);
          item = response.data.run;
        }
        if (timedOut) now += 25_000;
        const response = await f.answer(token, item);
        assert.equal(response.status, 200);
        item = response.data.run;
      }
      return item;
    },
    async restart() {
      await app.close();
      app = createHistoryServer(config);
      address = await app.listen(0, '127.0.0.1');
    },
  };
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
    assert.deepEqual(errors, [], 'no unexpected server errors');
  });
  return f;
}

test('guest sessions are opaque, authenticated, resumable and never eligible for ranked play', async (t) => {
  const f = await fixture(t);
  const health = await f.call('/health');
  assert.equal(health.data.roundSeconds, 25);
  assert.equal((await f.call('/me')).status, 401);
  const a = await f.session(),
    b = await f.session();
  assert.equal(a.player.rankedEligible, false);
  assert.notEqual(a.token, b.token);
  assert.ok(!a.token.includes(a.player.id));
  assert.equal(
    (await f.call('/runs', { method: 'POST', token: a.token, body: { mode: 'daily' } })).status,
    403,
  );
  const item = await f.start(a.token, 'practice', { level: 'chapter-1' });
  assert.equal(item.total, 3);
  assert.equal(item.round.expiresAt - item.serverNow, 25_000);
  assert.equal((await f.call(`/runs/${item.id}`, { token: b.token })).status, 404);
  assert.equal((await f.call('/me', { token: a.token })).data.activeRun.id, item.id);
  const profile = await f.call('/me', {
    method: 'PATCH',
    token: a.token,
    body: { nickname: '<旅人>' },
  });
  assert.equal(profile.data.player.nickname, '旅人');
  const rows = f.app.db.prepare('SELECT token_hash FROM sessions').all();
  assert.ok(rows.every((row) => row.token_hash !== a.token && row.token_hash !== b.token));
  await f.finish(a.token, item);
  assert.deepEqual((await f.call('/leaderboard')).data.entries, []);
});

test('trusted identity signature, expiry, audience and single-use nonce are enforced', async (t) => {
  const f = await fixture(t);
  const identity = f.identity('account-one');
  const valid = await f.call('/sessions', { method: 'POST', body: { identity } });
  assert.equal(valid.status, 200);
  assert.equal(valid.data.player.rankedEligible, true);
  assert.equal(
    (await f.call('/sessions', { method: 'POST', body: { identity } })).data.error.code,
    'IDENTITY_REPLAYED',
  );
  for (const invalid of [
    identity + 'x',
    f.identity('bad', { exp: Math.floor(f.now / 1000) - 1 }),
    f.identity('bad', { aud: 'other-game' }),
    f.identity('bad', { exp: Math.floor(f.now / 1000) + 301 }),
  ]) {
    assert.equal(
      (await f.call('/sessions', { method: 'POST', body: { identity: invalid } })).status,
      401,
    );
  }
  const again = await f.session('account-one');
  assert.equal(
    again.player.id,
    valid.data.player.id,
    'a new signed login keeps the trusted player id',
  );
  const daily = await f.start(valid.data.token, 'daily');
  const repeated = await f.call('/runs', {
    method: 'POST',
    token: again.token,
    body: { mode: 'daily' },
  });
  assert.equal(repeated.status, 409);
  assert.equal(repeated.data.error.details.runId, daily.id);
});

test('an unconfigured identity service cannot admit formal scores even in development', async (t) => {
  const f = await fixture(t, { identitySecret: '' });
  assert.equal((await f.call('/health')).data.rankedAvailable, false);
  assert.equal(
    (await f.call('/sessions', { method: 'POST', body: { identity: f.identity('pretend') } }))
      .status,
    503,
  );
  const guest = await f.session();
  assert.equal(
    (
      await f.call('/runs', {
        method: 'POST',
        token: guest.token,
        body: { mode: 'daily', playerId: 'pretend', score: 25000 },
      })
    ).status,
    403,
  );
});

test('concurrent and retried answers are stored exactly once and cannot probe a different guess', async (t) => {
  const f = await fixture(t),
    player = await f.session();
  const item = await f.start(player.token),
    requestId = randomUUID();
  const [first, duplicate] = await Promise.all([
    f.answer(player.token, item, { requestId }),
    f.answer(player.token, item, { requestId, year: -2999, point: { lat: -80, lng: -170 } }),
  ]);
  assert.equal(first.status, 200);
  assert.deepEqual(first.data, duplicate.data);
  assert.equal(first.data.run.results.length, 1);
  const distinct = await f.answer(player.token, item, { year: 2020, point: { lat: 0, lng: 0 } });
  assert.equal(distinct.data.run.score, first.data.run.score);
  assert.equal(
    f.app.db.prepare('SELECT COUNT(*) AS count FROM answers WHERE run_id = ?').get(item.id).count,
    1,
  );
  const next = (
    await f.call(`/runs/${item.id}/next`, {
      method: 'POST',
      token: player.token,
      body: { roundId: item.round.id },
    })
  ).data.run;
  const replay = await f.answer(player.token, next, { requestId });
  assert.equal(replay.data.error.code, 'REQUEST_ID_REUSED');
  const retryNext = await f.call(`/runs/${item.id}/next`, {
    method: 'POST',
    token: player.token,
    body: { roundId: item.round.id },
  });
  assert.equal(retryNext.data.run.round.id, next.round.id);
});

test('server deadlines survive restart and background time, with zero at the exact cutoff', async (t) => {
  const f = await fixture(t),
    player = await f.session();
  const item = await f.start(player.token);
  f.now = item.round.expiresAt;
  await f.restart();
  const resumed = await f.call(`/runs/${item.id}`, { token: player.token });
  assert.equal(resumed.data.run.phase, 'revealed');
  assert.equal(resumed.data.run.results[0].timedOut, true);
  assert.equal(resumed.data.run.score, 0);
  const late = await f.answer(player.token, item);
  assert.equal(late.data.run.score, 0);
  assert.equal(late.data.run.results.length, 1);
  const next = (
    await f.call(`/runs/${item.id}/next`, {
      method: 'POST',
      token: player.token,
      body: { roundId: item.round.id },
    })
  ).data.run;
  f.now = next.round.expiresAt - 1;
  assert.equal((await f.answer(player.token, next)).data.run.results.at(-1).score, 5000);
});

test('deadline checks use complete body arrival time, so an early request cannot reserve time', async (t) => {
  const f = await fixture(t),
    player = await f.session(),
    item = await f.start(player.token);
  const q = f.question(item);
  const bytes = JSON.stringify({
    roundId: item.round.id,
    requestId: randomUUID(),
    year: q.year,
    point: { lat: q.lat, lng: q.lng },
  });
  f.now = item.round.expiresAt - 100;
  const response = await new Promise((resolveResponse, reject) => {
    const req = httpRequest(
      f.base + `/api/history/runs/${item.id}/answers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${player.token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bytes),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolveResponse(JSON.parse(Buffer.concat(chunks))));
      },
    );
    req.on('error', reject);
    req.write(bytes.slice(0, 10));
    setTimeout(() => {
      f.now = item.round.expiresAt + 1;
      req.end(bytes.slice(10));
    }, 15);
  });
  assert.equal(response.run.results[0].timedOut, true);
  assert.equal(response.run.score, 0);
});

test('duel invite freezes questions and images, allows one attempt per identity, and expires in 24 hours', async (t) => {
  const f = await fixture(t),
    host = await f.session(),
    friend = await f.session();
  const initial = await f.start(host.token);
  assert.equal(
    (await f.call(`/runs/${initial.id}/invite`, { method: 'POST', token: host.token, body: {} }))
      .status,
    409,
  );
  const originalImage = await (await fetch(f.base + initial.round.image)).text();
  const finished = await f.finish(host.token, initial);
  assert.equal(finished.phase, 'finished');
  assert.equal(finished.round, null);
  assert.equal(finished.score, 25000);
  const response = await f.call(`/runs/${initial.id}/invite`, {
    method: 'POST',
    token: host.token,
    body: {},
  });
  const invite = response.data.invite;
  assert.equal(invite.expiresAt - f.now, DAY);
  assert.equal(invite.host.score, 25000);
  assert.equal(invite.total, 5);
  assert.equal(
    (await f.call(`/invites/${invite.code}/join`, { method: 'POST', token: host.token, body: {} }))
      .data.error.code,
    'OWN_INVITE',
  );
  const firstQuestion = f.question(initial);
  await writeFile(
    join(f.questionDirectory, firstQuestion.id + '.json'),
    JSON.stringify({
      id: firstQuestion.id,
      year: 2000,
      lat: 1,
      lng: 2,
      region: firstQuestion.region,
      tolerance: 1,
      difficulty: firstQuestion.difficulty,
      clue: 'Changed after creating invite',
      image: `assets/${firstQuestion.id}.webp`,
    }),
  );
  await writeFile(join(f.assetDirectory, `assets/${firstQuestion.id}.webp`), 'changed-image');
  const joined = (
    await f.call(`/invites/${invite.code}/join`, { method: 'POST', token: friend.token, body: {} })
  ).data.run;
  assert.equal(joined.round.clue, initial.round.clue);
  assert.deepEqual(joined.opponent, { nickname: host.player.nickname, score: 25000 });
  assert.deepEqual(
    (await f.call('/me', { token: friend.token })).data.activeRun.opponent,
    joined.opponent,
  );
  assert.equal(await (await fetch(f.base + joined.round.image)).text(), originalImage);
  assert.equal(
    f.app.db.prepare('SELECT deck FROM runs WHERE id = ?').get(initial.id).deck,
    f.app.db.prepare('SELECT deck FROM runs WHERE id = ?').get(joined.id).deck,
  );
  const [resumeA, resumeB] = await Promise.all([
    f.call(`/invites/${invite.code}/join`, { method: 'POST', token: friend.token, body: {} }),
    f.call(`/invites/${invite.code}/join`, { method: 'POST', token: friend.token, body: {} }),
  ]);
  assert.equal(resumeA.data.run.id, joined.id);
  assert.equal(resumeB.data.run.id, joined.id);
  await f.finish(friend.token, joined);
  assert.equal(
    (await f.call(`/invites/${invite.code}`, { token: friend.token })).data.invite.ownScore,
    25000,
  );
  assert.deepEqual(
    (await f.call(`/invites/${invite.code}`, { token: host.token })).data.invite.challengers,
    [{ nickname: friend.player.nickname, score: 25000, finishedAt: f.now }],
  );
  assert.deepEqual(
    (await f.call(`/invites/${invite.code}`)).data.invite.challengers,
    [],
    'only the host receives other players challenge results',
  );
  const repeated = await f.call(`/invites/${invite.code}/join`, {
    method: 'POST',
    token: friend.token,
    body: {},
  });
  assert.equal(repeated.data.run.phase, 'finished');
  assert.deepEqual((await f.call('/leaderboard')).data.entries, []);
  f.now = invite.expiresAt;
  assert.equal((await f.call(`/invites/${invite.code}`)).status, 410);
});

test('daily admission is atomic, practice stays separate, and formal results survive restart', async (t) => {
  const f = await fixture(t),
    player = await f.session('ranked-one');
  const response = await Promise.all([
    f.call('/runs', { method: 'POST', token: player.token, body: { mode: 'daily' } }),
    f.call('/runs', { method: 'POST', token: player.token, body: { mode: 'daily' } }),
  ]);
  assert.deepEqual(response.map((x) => x.status).sort(), [200, 409]);
  const initial = response.find((x) => x.status === 200).data.run;
  assert.deepEqual((await f.call('/leaderboard?period=day')).data.entries, []);
  await f.finish(player.token, initial);
  await f.finish(player.token, await f.start(player.token, 'practice'));
  await f.restart();
  const board = (await f.call('/leaderboard?period=day', { token: player.token })).data;
  assert.equal(board.entries.length, 1);
  assert.equal(board.self.score, 25000);
  assert.equal(board.self.days, 1);
  assert.equal(f.app.db.prepare('SELECT COUNT(*) AS count FROM daily_results').get().count, 1);
  assert.equal((await f.call('/me', { token: player.token })).data.daily.played, true);
});

test('weekly ranking sums the best five days, resets Monday, and gives equal scores equal rank', async (t) => {
  const f = await fixture(t),
    a = await f.session('A'),
    b = await f.session('B'),
    c = await f.session('C');
  for (let day = 0; day < 7; day++) {
    f.now = START + day * DAY;
    await f.finish(a.token, await f.start(a.token, 'daily'), { timedOut: day === 6 });
    if (day < 5) await f.finish(b.token, await f.start(b.token, 'daily'));
    if (day === 0) await f.finish(c.token, await f.start(c.token, 'daily'), { timedOut: true });
  }
  const board = (await f.call('/leaderboard?period=week', { token: a.token })).data;
  assert.equal(board.startsAt, '2026-10-05');
  assert.equal(board.endsAt, '2026-10-12');
  assert.deepEqual(
    board.entries.map((row) => [row.rank, row.score, row.days]),
    [
      [1, 125000, 5],
      [1, 125000, 5],
      [3, 0, 1],
    ],
  );
  assert.equal(board.self.playerId, a.player.id);
  f.now = START + 7 * DAY;
  assert.deepEqual((await f.call('/leaderboard?period=week')).data.entries, []);
});

test('public projections contain only the current opaque question and scores; invalid inputs stay private', async (t) => {
  const f = await fixture(t),
    player = await f.session(),
    item = await f.start(player.token);
  assert.deepEqual(Object.keys(item.round).sort(), ['clue', 'expiresAt', 'id', 'image', 'view']);
  assert.match(item.round.image, /^\/api\/history\/images\/[A-Za-z0-9_-]{32}$/);
  assert.ok(!JSON.stringify(item).includes('scene-'));
  const malformed = await f.answer(player.token, item, { point: { lat: 100, lng: 0 } });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.data.error.code, 'INVALID_ANSWER');
  assert.equal((await f.answer(player.token, item, { year: 0 })).status, 400);
  assert.equal((await f.call('/leaderboard?period=all')).status, 400);
  assert.equal(
    (await f.call('/health', { headers: { Origin: 'https://untrusted.example' } })).status,
    403,
  );
  assert.equal((await f.call('/private/questions')).status, 401);
});

test('public run creation cannot inject an invitation or replace the frozen friend deck', async (t) => {
  const f = await fixture(t),
    host = await f.session(),
    attacker = await f.session();
  const completed = await f.finish(host.token, await f.start(host.token));
  const invite = (
    await f.call(`/runs/${completed.id}/invite`, { method: 'POST', token: host.token, body: {} })
  ).data.invite;
  const forged = await f.start(attacker.token, 'practice', {
    level: 'first',
    inviteCode: invite.code,
    inviteExpiresAt: f.now + DAY,
  });
  await f.finish(attacker.token, forged);
  assert.equal(
    (await f.call(`/invites/${invite.code}`, { token: attacker.token })).data.invite.ownRunId,
    null,
  );
  const actual = (
    await f.call(`/invites/${invite.code}/join`, {
      method: 'POST',
      token: attacker.token,
      body: {},
    })
  ).data.run;
  assert.equal(actual.total, 5);
  assert.notEqual(actual.id, forged.id);
  assert.equal(
    f.app.db.prepare('SELECT deck FROM runs WHERE id = ?').get(actual.id).deck,
    f.app.db.prepare('SELECT deck FROM runs WHERE id = ?').get(completed.id).deck,
  );
});

test('daily play closes at the competition day boundary and unfinished rounds become zero', async (t) => {
  const f = await fixture(t),
    player = await f.session('midnight');
  f.now = Date.UTC(2026, 9, 5, 15, 59, 50); // Shanghai 23:59:50.
  const item = await f.start(player.token, 'daily');
  assert.equal(item.expiresAt, Date.UTC(2026, 9, 5, 16));
  assert.equal(
    item.round.expiresAt,
    item.expiresAt,
    'the last ten seconds cannot extend into tomorrow',
  );
  await f.answer(player.token, item);
  f.now = Date.UTC(2026, 9, 5, 16, 0, 1);
  const board = (await f.call('/leaderboard?period=week', { token: player.token })).data;
  assert.equal(
    board.self.score,
    5000,
    'leaderboard materializes the fixed partial score without waiting for resume',
  );
  const next = (
    await f.call(`/runs/${item.id}/next`, {
      method: 'POST',
      token: player.token,
      body: { roundId: item.round.id },
    })
  ).data.run;
  assert.equal(next.phase, 'finished');
  assert.equal(next.results.length, 5);
  assert.equal(next.score, 5000);
  assert.ok(next.results.slice(1).every((result) => result.timedOut && result.score === 0));
  assert.equal((await f.call('/leaderboard?period=day')).data.entries.length, 0);
  assert.equal((await f.start(player.token, 'daily')).phase, 'guessing');
});

test('already joined friends cannot submit after invitation expiry, and all runs have a finite deadline', async (t) => {
  const f = await fixture(t),
    host = await f.session(),
    friend = await f.session();
  const completed = await f.finish(host.token, await f.start(host.token));
  const invite = (
    await f.call(`/runs/${completed.id}/invite`, { method: 'POST', token: host.token, body: {} })
  ).data.invite;
  f.now = invite.expiresAt - 10_000;
  const joined = (
    await f.call(`/invites/${invite.code}/join`, { method: 'POST', token: friend.token, body: {} })
  ).data.run;
  assert.equal(joined.expiresAt, invite.expiresAt);
  f.now = invite.expiresAt;
  const late = (await f.answer(friend.token, joined)).data.run;
  assert.equal(late.phase, 'finished');
  assert.equal(late.score, 0);
  assert.equal(late.results.length, 5);
  const practice = await f.start(friend.token, 'practice');
  assert.equal(practice.expiresAt - f.now, 30 * 60 * 1000);
  assert.equal(
    (await f.call(`/runs/${practice.id}/next`, { method: 'POST', token: friend.token, body: {} }))
      .status,
    400,
  );
});

test('session rate limits ignore forged authorization and query strings, with explicit proxy trust only', async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 20; i++) {
    assert.equal(
      (
        await f.call(`/sessions?attempt=${i}`, {
          method: 'POST',
          body: {},
          headers: { Authorization: `Bearer ${randomUUID()}`, 'X-Real-IP': `192.0.2.${i}` },
        })
      ).status,
      200,
    );
  }
  assert.equal(
    (
      await f.call('/sessions?attempt=overflow', {
        method: 'POST',
        body: {},
        headers: { Authorization: `Bearer ${randomUUID()}`, 'X-Real-IP': '198.51.100.1' },
      })
    ).status,
    429,
  );
});
