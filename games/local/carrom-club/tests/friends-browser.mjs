import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { chooseShot } from '../src/core.mjs';
import {
  applyMultiplayerShot,
  placeFriendsStriker,
  seatToWorld,
  worldToSeat,
} from '../src/friends-core.mjs';

// Real Runtime HTTP + PostgreSQL only. Fault cases abort requests or discard
// actual responses. The explicitly disclosed endgame fixture is local test data.
const api = process.env.CARROM_TEST_API_URL || 'http://127.0.0.1:43002/api/competition/v1';
const databaseUrl = process.env.CARROM_TEST_DATABASE_URL;
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/api\/competition\/v1$/.test(api))
  throw new Error('Use a local Runtime API');
if (
  databaseUrl &&
  (new URL(databaseUrl).pathname !== '/competition_test' ||
    !['127.0.0.1', 'localhost'].includes(new URL(databaseUrl).hostname))
)
  throw new Error('Use isolated local competition_test');
const output = new URL('../docs/design/multiplayer-2026-10-11/validation/', import.meta.url);
await mkdir(output, { recursive: true });
const cwd = new URL('../', import.meta.url),
  env = { ...process.env, COMPETITION_PUBLIC_API_URL: api };
const sourceMode = process.env.CARROM_FRIENDS_SOURCE === '1';
if (
  !sourceMode &&
  spawnSync(process.execPath, ['build.mjs'], { cwd, env, stdio: 'inherit' }).status !== 0
)
  throw new Error('Build failed');
const port = process.env.CARROM_FRIENDS_PORT || '43010',
  origin = `http://127.0.0.1:${port}/`;
const server = spawn(
  process.execPath,
  ['server.mjs', ...(sourceMode ? [] : ['--dist']), '--port', port],
  { cwd, env, stdio: ['ignore', 'pipe', 'inherit'] },
);
await new Promise((resolve, reject) => {
  server.stdout.once('data', resolve);
  server.once('error', reject);
  server.once('exit', (code) => reject(new Error(`Server exit ${code}`)));
});
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : {}),
});
const players = [],
  checks = [],
  errors = [],
  requests = [],
  screenshots = [];
let scenario = 'setup',
  passed = false;
const record = (text) => {
  checks.push(`${scenario}: ${text}`);
  console.log(checks.at(-1));
};
async function image(who, name) {
  await who.page.screenshot({ path: fileURLToPath(new URL(`${name}.jpg`, output)), quality: 82 });
  screenshots.push(`${name}.jpg`);
}
async function player(label, width = 390) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  await context.addInitScript(() => localStorage.setItem('dev', '1'));
  const page = await context.newPage(),
    cdp = await context.newCDPSession(page);
  const who = {
    label,
    page,
    context,
    closed: false,
    state: async () => {
      await page.waitForFunction(() => Boolean(window.__carrom));
      return page.evaluate(() => window.__carrom.snapshot());
    },
    touch: (type, points = []) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points.map((p, index) => ({ ...p, id: index + 1 })),
      }),
  };
  page.on('pageerror', (error) => errors.push({ player: label, message: error.message }));
  page.on('response', async (response) => {
    if (!response.url().includes('/carrom/rooms')) return;
    const data = await response.json().catch(() => ({}));
    requests.push({
      player: label,
      path: new URL(response.url()).pathname,
      method: response.request().method(),
      status: response.status(),
      error: data.error,
      shots: data.state?.shots,
    });
  });
  players.push(who);
  return who;
}
const roomPath = (room, suffix = '') => `/carrom/rooms/${room.code}${suffix}`;
async function request(who, path, body) {
  return who.page.evaluate(
    async ({ path, body }) => {
      try {
        return {
          ok: true,
          value: await window.__competition.request(
            path,
            body === undefined ? undefined : { body: JSON.stringify(body) },
          ),
        };
      } catch (error) {
        return { ok: false, code: error.code, message: error.message };
      }
    },
    { path, body },
  );
}
async function rejected(who, path, body, code) {
  const response = await request(who, path, body);
  assert.equal(response.ok, false, `Expected ${code}`);
  assert.equal(response.code, code);
}
async function sync(group, predicate) {
  await expect
    .poll(
      async () =>
        (await Promise.all(group.map((who) => who.state()))).every((state) =>
          predicate(state.room, state),
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
}
async function sameBoards(group, shots) {
  await sync(
    group,
    (room, state) =>
      room?.state?.shots === shots && state.game.shots === shots && state.game.phase !== 'moving',
  );
  const rooms = await Promise.all(group.map(async (who) => (await who.state()).room));
  for (const room of rooms.slice(1)) assert.deepEqual(room.state, rooms[0].state);
}
async function shot(
  who,
  { cancel = false, capture, localShot = { x: 250, dx: 0, dy: -1, power: 0.04 } } = {},
) {
  await expect(who.page.locator('#position')).toBeEnabled();
  const slider = who.page.locator('#position'),
    box = await slider.boundingBox();
  const rangePoint = (x) => ({
    x: box.x + 19 + ((x - 235) / 530) * (box.width - 38),
    y: box.y + box.height / 2,
  });
  await who.touch('touchStart', [rangePoint(Number(await slider.inputValue()))]);
  await who.touch('touchMove', [rangePoint(localShot.x)]);
  await who.touch('touchEnd');
  const { game, room } = await who.state(),
    seat = game.players[room.you].seat;
  assert.equal(game.turn, room.you);
  const local = worldToSeat(game.striker, seat);
  assert.equal(local.y, 790, 'Local bottom baseline');
  const board = await who.page.locator('#board').boundingBox(),
    point = (x, y) => ({
      x: board.x + (x / 1000) * board.width,
      y: board.y + (y / 1000) * board.height,
    });
  const pull = 12 + Math.pow(localShot.power, 1 / 1.35) * 195,
    length = Math.hypot(localShot.dx, localShot.dy);
  await who.touch('touchStart', [point(local.x, local.y)]);
  await who.touch('touchMove', [
    point(local.x - (localShot.dx / length) * pull, local.y - (localShot.dy / length) * pull),
  ]);
  await expect(who.page.locator('#cancel-aim')).toBeVisible();
  if (capture) await image(who, capture);
  await who.touch(cancel ? 'touchCancel' : 'touchEnd');
  if (cancel) {
    assert.equal((await who.state()).game.shots, game.shots);
    await expect(who.page.locator('#cancel-aim')).toBeHidden();
  }
  return seat;
}
async function readyAll(group) {
  for (const who of group) {
    const room = (await who.state()).room,
      me = room.players[room.you];
    if (!me.ready) {
      await who.page.locator('#room-ready').tap();
      await sync(group, (next) => next?.players.some((p) => p.id === me.id && p.ready));
    }
  }
}
async function start(group) {
  await readyAll(group);
  await sync(group, (room) => room?.status === 'waiting' && room.players.every((p) => p.ready));
  await expect(group[0].page.locator('#room-start')).toBeEnabled();
  await group[0].page.locator('#room-start').tap();
  await Promise.all(group.map((who) => expect(who.page.locator('#play')).toBeVisible()));
  await sameBoards(group, 0);
}
async function select(host, id, value, group, predicate) {
  await host.page.locator(id).selectOption(value);
  await sync(group, predicate);
}
async function setup(mode, count) {
  scenario = `${mode}-${count}`;
  const group = [];
  for (let i = 0; i < count; i++) group.push(await player(`${scenario}/${i}`, i === 1 ? 320 : 390));
  const host = group[0];
  await host.page.goto(origin);
  await host.page.waitForFunction(() => Boolean(window.__carrom));
  host.soloMatch = (await host.state()).save.match;
  await host.page.locator('#friends-open').tap();
  await host.page.locator('#room-create').tap();
  await expect(host.page.locator('#room-code')).toHaveText(/^[A-F0-9]{12}$/);
  if (mode !== 'colors')
    await select(host, '#room-mode', mode, [host], (room) => room?.settings.mode === mode);
  await expect(host.page.locator('#room-start')).toBeDisabled();
  await host.page.locator('#room-invite').tap();
  const invite = await host.page.locator('#room-link').inputValue(),
    code = (await host.state()).room.code;
  assert.deepEqual([...new URL(invite).searchParams.keys()], ['pk']);
  for (let i = 1; i < count; i++) {
    const who = group[i];
    if (i % 2) await who.page.goto(invite);
    else {
      await who.page.goto(origin);
      await who.page.locator('#friends-open').tap();
      await who.page.locator('#room-input').fill(code);
      await who.page.locator('#room-join').tap();
    }
    await expect(who.page.locator('#room-code')).toHaveText(code);
    await sync(group.slice(0, i + 1), (room) => room?.players.length === i + 1);
    if (mode === 'doubles' && i < 3) {
      await expect(host.page.locator('#room-start')).toBeDisabled();
      const waiting = (await host.state()).room;
      await rejected(
        host,
        roomPath(waiting, '/start'),
        { revision: waiting.revision },
        'PLAYER_COUNT',
      );
    }
  }
  const identities = await Promise.all(
    group.map((who) =>
      who.page.evaluate(async () => (await window.__competition.session()).playerId),
    ),
  );
  assert.equal(new Set(identities).size, count);
  await expect(group[1].page.locator('#room-mode')).toBeDisabled();
  const guest = (await group[1].state()).room;
  await rejected(group[1], roomPath(guest, '/start'), { revision: guest.revision }, 'HOST_ONLY');
  await rejected(
    group[1],
    roomPath(guest, '/settings'),
    { revision: guest.revision, settings: guest.settings },
    'HOST_ONLY',
  );
  if (count === 4 || mode === 'singles') {
    const extra = await player(`${scenario}/overflow`);
    await extra.page.goto(invite);
    await expect
      .poll(async () => await extra.page.locator('#room-status').textContent())
      .toMatch(/满|人数/);
    assert.equal((await extra.state()).room, null);
    await extra.context.close();
    extra.closed = true;
    record('an additional browser identity is refused by the full room');
  }
  await image(host, `${scenario}-room-390`);
  await image(group[1], `${scenario}-room-320`);
  record(
    `${count} independent mobile identities join through invitation/code; host permissions and start player-count restrictions hold`,
  );
  return group;
}
async function networkFailures(group) {
  const who = group[(await group[0].state()).room.state.turn],
    before = (await who.state()).room;
  const getURL = `${api}${roomPath(before)}`,
    shootURL = `${getURL}/shoot`;
  let committed, body;
  const abort = (route) => route.abort('internetdisconnected');
  const discard = async (route) => {
    body = route.request().postDataJSON();
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    committed = await response.json();
    await route.abort('internetdisconnected');
  };
  await who.page.route(getURL, abort);
  await who.page.route(shootURL, discard);
  await shot(who);
  await expect(who.page.locator('#sync-retry')).toBeVisible();
  await expect(who.page.locator('#position')).toBeDisabled();
  await expect.poll(() => committed?.state.shots).toBe(before.state.shots + 1);
  await image(who, `${scenario}-lost-response`);
  await who.page.unroute(shootURL, discard);
  const retry = await who.page.locator('#sync-retry').boundingBox(),
    point = { x: retry.x + retry.width / 2, y: retry.y + retry.height / 2 };
  const submitted = () =>
      requests.filter((item) => item.method === 'POST' && item.path.endsWith('/shoot')).length,
    prior = submitted();
  await who.touch('touchStart', [point]);
  await who.touch('touchCancel');
  assert.equal(submitted(), prior);
  await who.page.locator('#sync-retry').tap();
  await who.page.unroute(getURL, abort);
  await sameBoards(group, before.state.shots + 1);
  const duplicate = await request(who, roomPath(before, '/shoot'), body);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.value.state.shots, before.state.shots + 1);
  record(
    'discarded real HTTP response blocks controls; canceled retry has no effect; retry and duplicate sequence execute one shot',
  );
  const next = group[(await group[0].state()).room.state.turn],
    old = (await next.state()).room,
    nextURL = `${api}${roomPath(old, '/shoot')}`;
  await next.page.route(nextURL, abort);
  await shot(next);
  await expect(next.page.locator('#sync-retry')).toBeVisible();
  await next.page.reload();
  await expect(next.page.locator('#play')).toBeVisible();
  await expect(next.page.locator('#sync-retry')).toBeVisible();
  const pending = await next.page.evaluate(
    () => JSON.parse(localStorage.getItem('carrom-friend-room-v2')).pending,
  );
  assert.equal(pending.seq, old.seq + 1);
  assert.equal(pending.round, old.round);
  await next.page.unroute(nextURL, abort);
  await next.page.locator('#sync-retry').tap();
  await sameBoards(group, old.state.shots + 1);
  record(
    'an unsent shot survives refresh with its original round/sequence and retries successfully',
  );
}
async function endgameFixture(group) {
  if (!databaseUrl)
    throw new Error('Set CARROM_TEST_DATABASE_URL for isolated endgame verification');
  const { openDatabase } = await import('@coffeeeeffoc/service-kit'),
    { sql } = await import('drizzle-orm');
  const database = openDatabase(databaseUrl, 'runtime'),
    room = (await group[0].state()).room;
  let localShot;
  try {
    await database.db.transaction(async (tx) => {
      const rows = await tx.execute(
          sql`select data from runtime.competition_rooms where code=${room.code} for update`,
        ),
        stored = rows[0].data;
      assert.equal(stored.game, 'carrom-club');
      assert.equal(stored.settings.mode, 'colors');
      const game = structuredClone(stored.state),
        actor = game.players[game.turn],
        own = game.coins.filter((coin) => coin.owner === actor.team);
      own.forEach((coin) => {
        coin.pocketed = true;
        coin.vx = coin.vy = 0;
      });
      Object.assign(own[0], seatToWorld({ x: 250, y: 280 }, actor.seat), { pocketed: false });
      let index = 0;
      for (const coin of game.coins.filter((coin) => coin.owner !== actor.team)) {
        Object.assign(
          coin,
          seatToWorld(
            { x: 665 + (index % 3) * 50, y: 330 + Math.floor(index / 3) * 50 },
            actor.seat,
          ),
          { vx: 0, vy: 0 },
        );
        index++;
      }
      game.phase = 'ready';
      game.events = [];
      game.shotPots = [];
      game.shotFoul = false;
      placeFriendsStriker(game, 500);
      const planning = {
        ...game,
        turn: 0,
        queen: 'none',
        striker: { ...game.striker, ...worldToSeat(game.striker, actor.seat) },
        coins: game.coins.map((coin) => ({
          ...coin,
          ...worldToSeat(coin, actor.seat),
          kind: coin.owner === actor.team ? 'white' : 'black',
        })),
      };
      localShot = chooseShot(planning);
      const direction = seatToWorld({ x: 500 + localShot.dx, y: 500 + localShot.dy }, actor.seat);
      const trial = applyMultiplayerShot(game, {
        playerId: actor.id,
        position: localShot.x,
        dx: direction.x - 500,
        dy: direction.y - 500,
        power: localShot.power,
      });
      assert.equal(trial.state.phase, 'over', 'Fixture must have a legal winning shot');
      stored.state = game;
      stored.lastShot = null;
      stored.revision++;
      stored.turnDeadline = Date.now() + 45_000;
      await tx.execute(
        sql`update runtime.competition_rooms set data=${JSON.stringify(stored)}::jsonb where code=${room.code}`,
      );
    });
  } finally {
    await database.close();
  }
  // A fixture changes positions without a shot. Reopen through the normal
  // reconnect path so the rendered board also shows the staged endgame.
  await Promise.all(group.map((who) => who.page.reload()));
  await sync(group, (next) => next?.revision > room.revision);
  await shot(group[(await group[0].state()).room.state.turn], {
    localShot,
    capture: `${scenario}-fixture-final-aim`,
  });
  await Promise.all(
    group.map((who) => expect(who.page.locator('#result')).toBeVisible({ timeout: 15_000 })),
  );
  await sync(group, (next) => next?.status === 'finished');
  const result = (await group[0].state()).room;
  assert.equal(result.state.ranking.length, group.length);
  assert.equal(
    result.series.find((p) => p.playerId === result.state.players[result.state.winner].id).points,
    4,
  );
  await image(group[0], `${scenario}-result-fixture`);
  record(
    'DISCLOSED FIXTURE: isolated DB stages last own coin; actual touch shot and server physics finish it and produce rankings/series points; no client score submission',
  );
  const seats = result.state.players.map((p) => p.seat);
  await group[0].page.locator('#retry').tap();
  await sync(group, (next) => next?.status === 'waiting');
  assert.deepEqual((await group[0].state()).room.series, result.series);
  await start(group);
  const rematch = (await group[0].state()).room;
  assert.equal(rematch.round, result.round + 1);
  assert.equal(rematch.state.turn, 1);
  assert.deepEqual(seats, [0, 1, 2]);
  assert.deepEqual(
    rematch.state.players.map((p) => p.seat),
    [1, 2, 0],
  );
  record(
    'same-room rematch keeps cumulative points, requires preparation again and rotates first player and three-player seats',
  );
}
async function leave(group) {
  for (let index = 0; index < group.length; index++) {
    const who = group[index];
    const state = await who.state();
    if (!state.room) continue;
    if (state.screen === 'play') {
      await who.page.locator('#pause').tap();
      await who.page.locator('#pause-home').tap();
    } else if (state.screen === 'result') await who.page.locator('#result [data-home]').tap();
    else await who.page.locator('#room-leave').tap();
    await expect(who.page.locator('#home')).toBeVisible();
    assert.equal(new URL(who.page.url()).searchParams.has('pk'), false);
    assert.equal((await who.state()).room, null);
    if (index === 0)
      await sync(
        group.slice(1),
        (room, snapshot) => room?.status === 'abandoned' && snapshot.screen === 'friends',
      );
  }
}
try {
  for (const [mode, count] of [
    ['colors', 2],
    ['colors', 3],
    ['colors', 4],
    ['singles', 2],
    ['doubles', 4],
  ]) {
    const group = await setup(mode, count),
      host = group[0];
    if (mode === 'colors' && count === 3) {
      await readyAll(group);
      await select(
        host,
        '#room-board',
        'random',
        group,
        (room) => room?.settings.board === 'random' && room.players.every((p) => !p.ready),
      );
      await readyAll(group);
      await host.page.locator('#room-reroll').tap();
      await sync(group, (room) => room?.players.every((p) => !p.ready));
      const id = (await host.state()).room.settings.levelId;
      await sync(group, (room) => room?.settings.levelId === id);
      await image(host, 'colors-3-random-preview');
      record(
        'settings changes and reroll reset every readiness; all clients preview the same resolved random level',
      );
    } else if (mode === 'colors' && count === 4) {
      await select(host, '#room-board', 'level', group, (room) => room?.settings.board === 'level');
      await select(
        host,
        '#room-level',
        'double-ring',
        group,
        (room) => room?.settings.levelId === 'double-ring',
      );
      await select(
        host,
        '#room-board',
        'random',
        group,
        (room) => room?.settings.board === 'random',
      );
      const previewId = (await host.state()).room.settings.levelId;
      await sync(group, (room) => room?.settings.levelId === previewId);
      await select(host, '#room-board', 'level', group, (room) => room?.settings.board === 'level');
      await select(
        host,
        '#room-level',
        'cushion-lines',
        group,
        (room) => room?.settings.levelId === 'cushion-lines',
      );
      record(
        'second and third specified levels persist exactly, including switching through a shared random preview',
      );
    } else if (mode !== 'colors') await expect(host.page.locator('#room-board')).toBeDisabled();
    await start(group);
    const game = (await host.state()).game;
    if (mode === 'colors' && count === 3) {
      const late = await player('colors-3/late-arrival');
      const code = (await host.state()).room.code;
      await late.page.goto(`${origin}?pk=${code}`);
      await expect
        .poll(() => late.page.locator('#room-status').textContent())
        .toMatch(/已开始|下一局/);
      assert.equal((await late.state()).room, null);
      await late.context.close();
      late.closed = true;
      record('a late arrival cannot take the unused fourth seat during an active match');
    }
    assert.equal(game.players.length, count);
    assert.equal(new Set(game.players.map((p) => p.color)).size, mode === 'colors' ? count : 2);
    if (mode === 'colors') {
      assert.equal(game.queen, 'none');
      assert.equal(new Set(game.totals).size, 1);
    } else {
      assert.equal(game.players[game.turn].color, 'white');
      assert.equal(game.coins.filter((coin) => coin.kind === 'queen').length, 1);
      if (count === 4) {
        assert.equal(game.players[0].team, game.players[2].team);
        assert.equal(game.players[1].team, game.players[3].team);
      }
    }
    const guest = (await group[1].state()).room;
    await rejected(
      group[1],
      roomPath(guest, '/shoot'),
      {
        round: guest.round,
        seq: guest.seq + 1,
        expectedTurnNumber: guest.state.turnNumber,
        shot: { position: 250, dx: 0, dy: -1, power: 0.04 },
      },
      'NOT_YOUR_TURN',
    );
    for (let i = 0; i < count; i++) {
      const who = group[i];
      await expect(who.page.locator('#position')).toBeEnabled();
      for (const other of group.filter((p) => p !== who))
        await expect(other.page.locator('#position')).toBeDisabled();
      if (i === 0) await shot(who, { cancel: true });
      const shots = (await who.state()).game.shots,
        seat = await shot(who, { capture: `${scenario}-seat-${i}-aim` });
      await sameBoards(group, shots + 1);
      const input = (await who.state()).room.lastShot.input,
        direction = worldToSeat({ x: 500 + input.dx, y: 500 + input.dy }, seat);
      assert(Math.abs(direction.x - 500) < 0.01 && direction.y < 500);
      assert.equal((await host.state()).game.turn, (i + 1) % count);
    }
    await image(group[1], `${scenario}-play-320`);
    record(
      'all seats shoot by native touch from local bottom baseline; seat rotations map screen-up correctly; cancellation does not shoot; all boards agree',
    );
    const reconnect = group[1],
      old = (await reconnect.state()).room;
    await reconnect.page.reload();
    await expect(reconnect.page.locator('#play')).toBeVisible();
    await sameBoards(group, old.state.shots);
    const restored = (await reconnect.state()).room;
    assert.equal(restored.players[restored.you].id, old.players[old.you].id);
    if (mode === 'colors' && count === 2) await networkFailures(group);
    if (mode === 'colors' && count === 3) await endgameFixture(group);
    if (mode === 'colors' && count === 4) {
      await host.page.setViewportSize({ width: 844, height: 390 });
      const shots = (await host.state()).game.shots;
      await shot(host, { capture: 'colors-4-landscape-aim' });
      await sameBoards(group, shots + 1);
      await host.page.setViewportSize({ width: 390, height: 844 });
      record('landscape resize preserves state and touch mapping');
    }
    record('refresh preserves identity, seat and authoritative shot count');
    await leave(group);
    assert.deepEqual((await host.state()).save.match, host.soloMatch);
    await host.page.locator('#start').tap();
    await expect(host.page.locator('#play')).toBeVisible();
    assert.equal((await host.state()).online, false);
    assert.equal((await host.state()).game.multiplayerVersion, undefined);
    await host.page.locator('#pause').tap();
    await host.page.locator('#pause-home').tap();
    await expect(host.page.locator('#home')).toBeVisible();
    record('exit clears invitation and room; local single-player and pause/home remain intact');
    for (const who of group) {
      await who.context.close();
      who.closed = true;
    }
  }
  assert.deepEqual(errors, []);
  passed = true;
  await rm(new URL('failure.json', output), { force: true });
} catch (error) {
  const states = await Promise.all(
    players
      .filter((p) => !p.closed)
      .map(async (who) => {
        const s = await who.state().catch(() => ({}));
        return {
          player: who.label,
          screen: s.screen,
          game: s.game && { phase: s.game.phase, shots: s.game.shots, turn: s.game.turn },
          room: s.room && {
            status: s.room.status,
            revision: s.room.revision,
            shots: s.room.state?.shots,
            seq: s.room.seq,
            you: s.room.you,
          },
          message: await who.page
            .locator('#room-status')
            .textContent()
            .catch(() => ''),
        };
      }),
  );
  const failure = {
    scenario,
    error: error.message,
    states,
    requests: requests.filter((item) => item.method !== 'GET' || item.status !== 200).slice(-25),
  };
  await writeFile(new URL('failure.json', output), JSON.stringify(failure, null, 2));
  console.error(JSON.stringify(failure, null, 2));
  throw error;
} finally {
  await writeFile(
    new URL('friends-browser-report.json', output),
    JSON.stringify(
      {
        passed,
        browser: browser.version(),
        artifact: sourceMode ? 'source diagnostic' : 'production dist',
        environment:
          'Desktop Chromium; emulated 390×844, 320×844, 844×390 touch viewports; real HTTP Runtime API + isolated PostgreSQL competition_test',
        actualPhonesTested: false,
        instrumentation:
          'Developer mode exposes read-only snapshots; gameplay uses native touch and real HTTP. No developer score, win, or turn controls are used.',
        endgameFixture:
          'Three-player colored endgame is staged in the isolated DB; the final shot is real touch/server physics. This is not a complete match played from its starting layout.',
        checks,
        errors,
        screenshots,
      },
      null,
      2,
    ),
  );
  await browser.close();
  server.kill('SIGTERM');
}
