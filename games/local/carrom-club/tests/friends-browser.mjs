import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { chromium, expect } from '@playwright/test';

// Start the existing Runtime API against competition_test before running this acceptance test.
const api = process.env.CARROM_TEST_API_URL || 'http://127.0.0.1:43002/api/competition/v1';
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/api\/competition\/v1$/.test(api))
  throw new Error('Use a local Runtime API connected to the isolated competition_test database');
const cwd = new URL('../', import.meta.url);
const output = new URL('../docs/design/validation/', import.meta.url);
await mkdir(output, { recursive: true });
const env = { ...process.env, COMPETITION_PUBLIC_API_URL: api };
const sourceMode = process.env.CARROM_FRIENDS_SOURCE === '1';
if (!sourceMode) {
  const built = spawnSync(process.execPath, ['build.mjs'], { cwd, env, stdio: 'inherit' });
  if (built.status !== 0) throw new Error('Game build failed');
}
const port = process.env.CARROM_FRIENDS_PORT || '43010';
const server = spawn(
  process.execPath,
  ['server.mjs', ...(sourceMode ? [] : ['--dist']), '--port', port],
  {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'inherit'],
  },
);
await new Promise((resolve, reject) => {
  server.stdout.once('data', resolve);
  server.once('error', reject);
  server.once('exit', (code) => reject(new Error(`Game server exited: ${code}`)));
});
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : {}),
});
const errors = [],
  checks = [],
  requests = [],
  players = [];
const origin = `http://127.0.0.1:${port}/`;
async function player(width) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  await context.addInitScript(() => {
    localStorage.setItem('dev', '1');
    window.__friendEvents = [];
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click'])
      document.addEventListener(
        type,
        (event) => {
          if (event.target.id === 'sync-retry')
            window.__friendEvents.push({
              type,
              at: performance.now(),
              disabled: event.target.disabled,
              prevented: event.defaultPrevented,
            });
        },
        true,
      );
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', async (response) => {
    if (!response.url().includes('/rooms')) return;
    const data = await response.json().catch(() => ({}));
    requests.push({
      player: width,
      path: new URL(response.url()).pathname,
      status: response.status(),
      method: response.request().method(),
      error: data.error,
      shots: data.state?.game?.shots,
      seq: data.seq,
    });
  });
  const cdp = await context.newCDPSession(page);
  const touch = (type, points = []) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((point, i) => ({ ...point, id: i + 1 })),
    });
  const state = () => page.evaluate(() => window.__carrom.snapshot());
  const shot = async () => {
    if (await page.locator('#pause-screen').isVisible()) await page.locator('#resume').tap();
    await expect(page.locator('#position')).toBeEnabled();
    const range = await page.locator('#position').boundingBox();
    const current = Number(await page.locator('#position').inputValue());
    const positionPoint = (value) => ({
      x: range.x + 19 + ((value - 235) / 530) * (range.width - 38),
      y: range.y + range.height / 2,
    });
    await touch('touchStart', [positionPoint(current)]);
    await touch('touchMove', [positionPoint(250)]);
    await touch('touchEnd');
    const { game, room } = await state();
    assert.equal(game.turn, room.you);
    const box = await page.locator('#board').boundingBox();
    const point = (x, y) => ({
      x: box.x + ((room.you ? 1000 - x : x) / 1000) * box.width,
      y: box.y + ((room.you ? 1000 - y : y) / 1000) * box.height,
    });
    const start = point(game.striker.x, game.striker.y);
    const pull = 12 + Math.pow(0.24, 1 / 1.35) * 195;
    const end = point(game.striker.x, game.striker.y + (room.you ? -pull : pull));
    await touch('touchStart', [start]);
    await touch('touchMove', [end]);
    await expect(page.locator('#cancel-aim')).toBeVisible();
    await touch('touchEnd');
  };
  const result = { page, context, state, shot, touch };
  players.push(result);
  return result;
}
const image = (page, name) =>
  page.screenshot({ path: fileURLToPath(new URL(`friends-${name}.png`, output)) });
const settled = (who, shots) =>
  expect
    .poll(
      async () => {
        const s = await who.state();
        return (
          s.room?.state?.game?.shots === shots &&
          s.game.shots === shots &&
          s.game.phase !== 'moving'
        );
      },
      { timeout: 15_000 },
    )
    .toBe(true);
try {
  const a = await player(390),
    b = await player(320);
  await a.page.goto(origin);
  await a.page.locator('#friends-open').tap();
  await image(a.page, 'entry-390');
  await a.page.locator('#room-create').tap();
  await expect(a.page.locator('#room-code')).toHaveText(/^[A-F0-9]{12}$/);
  await a.page.locator('#room-invite').tap();
  const invite = await a.page.locator('#room-link').inputValue();
  assert.equal(new URL(invite).searchParams.size, 1);
  assert.equal(new URL(invite).searchParams.has('dev'), false);
  await b.page.goto(invite);
  await expect(b.page.locator('#room-code')).toHaveText(
    await a.page.locator('#room-code').textContent(),
  );
  await expect(a.page.locator('#room-players')).not.toContainText('等待加入');
  const identityA = await a.page.evaluate(
    async () => (await window.__competition.session()).playerId,
  );
  const identityB = await b.page.evaluate(
    async () => (await window.__competition.session()).playerId,
  );
  assert.notEqual(identityA, identityB);
  await image(a.page, 'room-390');
  await image(b.page, 'room-320');
  checks.push(
    'two separate mobile browser identities create and join the same server room through a sanitized invitation',
  );
  await a.page.locator('#room-ready').tap();
  await b.page.locator('#room-ready').tap();
  await expect(a.page.locator('#play')).toBeVisible();
  await expect(b.page.locator('#play')).toBeVisible();
  await expect(a.page.locator('#board')).toHaveAttribute('data-side', '0');
  await expect(b.page.locator('#board')).toHaveAttribute('data-side', '1');
  await expect(a.page.locator('#position')).toBeEnabled();
  await expect(b.page.locator('#position')).toBeDisabled();
  await expect(a.page.locator('#status')).toContainText('你的回合');
  await expect(b.page.locator('#status')).toContainText('好友的回合');
  await expect(b.page.locator('#status')).not.toContainText('你的回合');
  await image(a.page, 'white-play-390');
  await image(b.page, 'black-play-320');
  checks.push(
    'both players see their own bottom baseline; only the current seat can move or shoot',
  );
  await a.shot();
  await Promise.all([settled(a, 1), settled(b, 1)]);
  assert.deepEqual((await a.state()).room.state.game, (await b.state()).room.state.game);
  assert.equal((await b.state()).game.turn, 1);
  await b.shot();
  await Promise.all([settled(a, 2), settled(b, 2)]);
  assert.deepEqual((await a.state()).room.state.game, (await b.state()).room.state.game);
  checks.push(
    'white and black each place and shoot through native touch events; both server board snapshots agree after each shot',
  );
  const rejectShot = (route) => route.abort('internetdisconnected');
  await a.page.route('**/rooms/*/actions', rejectShot);
  await a.shot();
  await expect(a.page.locator('#sync-retry')).toBeVisible();
  await expect(a.page.locator('#position')).toBeDisabled();
  await image(a.page, 'retry-390');
  await a.page.unroute('**/rooms/*/actions', rejectShot);
  await expect(a.page.locator('#sync-retry')).toBeEnabled();
  const retryBox = await a.page.locator('#sync-retry').boundingBox();
  const retryPoint = { x: retryBox.x + retryBox.width / 2, y: retryBox.y + retryBox.height / 2 };
  await a.touch('touchStart', [retryPoint]);
  await a.touch('touchCancel');
  assert.equal(
    requests.filter((item) => item.method === 'POST' && item.path.endsWith('/actions')).length,
    2,
  );
  await a.touch('touchStart', [retryPoint]);
  await a.touch('touchMove', [{ x: retryPoint.x, y: retryBox.y - 30 }]);
  await a.touch('touchEnd');
  assert.equal(
    requests.filter((item) => item.method === 'POST' && item.path.endsWith('/actions')).length,
    2,
  );
  await a.page.locator('#sync-retry').tap();
  await Promise.all([settled(a, 3), settled(b, 3)]);
  assert.deepEqual((await a.state()).room.state.game, (await b.state()).room.state.game);
  await b.page.reload();
  await expect(b.page.locator('#play')).toBeVisible();
  await settled(b, 3);
  assert.equal(
    await b.page.evaluate(async () => (await window.__competition.session()).playerId),
    identityB,
  );
  assert.deepEqual((await a.state()).room.state.game, (await b.state()).room.state.game);
  checks.push(
    'a failed HTTP shot blocks further input, retries once, and reload restores the same identity and board',
  );
  await b.page.route('**/rooms/*/actions', rejectShot);
  await b.shot();
  await expect(b.page.locator('#sync-retry')).toBeVisible();
  await b.page.unroute('**/rooms/*/actions', rejectShot);
  await b.page.reload();
  await expect(b.page.locator('#play')).toBeVisible();
  await expect(b.page.locator('#sync-retry')).toBeVisible();
  const restoredPending = await b.page.evaluate(
    () => JSON.parse(localStorage.getItem('carrom-friend-room-v1')).pending,
  );
  assert.equal(restoredPending.action.expectedShot, 3);
  await b.page.locator('#sync-retry').tap();
  await Promise.all([settled(a, 4), settled(b, 4)]);
  assert.deepEqual((await a.state()).room.state.game, (await b.state()).room.state.game);
  checks.push(
    'refreshing an invitation preserves and retries an unconfirmed shot with its original sequence',
  );

  await a.page.evaluate(async () => {
    const room = window.__carrom.snapshot().room;
    await window.__competition.request(`/rooms/${room.code}/actions`, {
      body: JSON.stringify({ seq: room.seq + 1, action: { type: 'resign' } }),
    });
  });
  await expect(a.page.locator('#result')).toBeVisible({ timeout: 10_000 });
  await expect(b.page.locator('#result')).toBeVisible({ timeout: 10_000 });
  await expect(a.page.locator('#result-score')).toContainText('分');
  await expect(a.page.locator('#result-description')).toContainText('你已认输');
  await expect(b.page.locator('#result-description')).toContainText('好友认输');
  await image(a.page, 'result-390');
  await a.page.locator('#retry').tap();
  await b.page.locator('#retry').tap();
  await expect(a.page.locator('#room-code')).toHaveText(/^[A-F0-9]{12}$/);
  await expect(b.page.locator('#room-code')).toHaveText(
    await a.page.locator('#room-code').textContent(),
  );
  const rematchCode = (await a.state()).room.code;
  assert.notEqual(rematchCode, new URL(invite).searchParams.get('pk'));
  assert.equal(new URL(a.page.url()).searchParams.get('pk'), rematchCode);
  assert.equal(new URL(b.page.url()).searchParams.get('pk'), rematchCode);
  await b.page.reload();
  await expect(b.page.locator('#room-code')).toHaveText(rematchCode);
  await b.page.locator('#room-leave').tap();
  await expect(b.page.locator('#home')).toBeVisible();
  assert.equal(new URL(b.page.url()).searchParams.has('pk'), false);
  await expect.poll(async () => (await a.state()).room.status).toBe('abandoned');
  await a.page.locator('#room-leave').tap();
  await expect(a.page.locator('#home')).toBeVisible();
  assert.equal(new URL(a.page.url()).searchParams.has('pk'), false);
  checks.push(
    'authoritative result reaches both players; both rematch into one new room and leaving informs the peer',
  );
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('friends-browser-report.json', output),
    JSON.stringify(
      {
        environment:
          'Desktop Chromium, emulated 390x844 and 320x844 phones, real HTTP Runtime API + isolated PostgreSQL competition_test',
        artifact: sourceMode ? 'source (diagnostic)' : 'production dist',
        actualPhonesTested: false,
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  const states = await Promise.all(
    players.map(async (who) => {
      const state = await who.state();
      return {
        screen: state.screen,
        shots: state.game.shots,
        phase: state.game.phase,
        serverShots: state.room?.state?.game.shots,
        pending: await who.page.evaluate(() =>
          JSON.parse(localStorage.getItem('carrom-friend-room-v1')),
        ),
        status: await who.page.locator('#status').textContent(),
        clicks: await who.page.evaluate(() => window.__friendEvents.slice(-20)),
      };
    }),
  );
  console.error(
    JSON.stringify(
      {
        error: error.message,
        requests: requests
          .filter((item) => item.method !== 'GET' || item.status !== 200)
          .slice(-20),
        states,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
