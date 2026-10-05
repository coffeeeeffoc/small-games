import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from 'playwright/test';

// Run against the built game with its competition bundle and a real runtime API.
// GAME_URL may point to a local PostgreSQL/PGlite integration fixture.
const base = process.env.GAME_URL || 'http://127.0.0.1:43705';
const output = 'artifacts/mobile-pages';
const browser = await chromium.launch({
  ...(process.env.BROWSER_EXECUTABLE || process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.BROWSER_EXECUTABLE || process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : { executablePath: '/usr/bin/chromium' }),
  args: ['--no-sandbox'],
});
const errors = [],
  checks = [];
await mkdir(output, { recursive: true });
const watch = (page) => page.on('pageerror', (error) => errors.push(error.message));
const snapshot = (page) => page.evaluate(async () => (await import('./src/main.js')).getSnapshot());
const point = (page, position) =>
  page.evaluate(
    async (position) => (await import('./src/main.js')).worldToScreen(position),
    position,
  );
async function pageChecks(page) {
  assert.equal(await page.locator('dialog[open]').count(), 0, 'navigation uses pages');
  assert.equal(await page.locator('dialog:modal').count(), 0, 'no blocking modal');
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
    'mobile page does not overflow horizontally',
  );
}
async function screenshot(page, path) {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  await page.screenshot({ path });
}
async function startQuick(page, captureWidth) {
  await page.locator('#levels-button').tap();
  await expect(page.locator('#level-screen')).toBeVisible();
  await page.locator('[data-choice-for="mode-select"][data-value="quick"]').tap();
  await expect(page.locator('#mode-select')).toHaveValue('quick');
  await expect(page.locator('#start-button')).toBeInViewport();
  if (captureWidth) await screenshot(page, `${output}/setup-${captureWidth}.png`);
  await page.locator('#start-button').tap();
  await expect(page.locator('#game-screen')).toBeVisible();
  await expect(page.locator('#level-screen')).toBeHidden();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');
  // World coordinates must be calculated after the mobile page transition.
  await page.waitForTimeout(340);
}
async function tapActor(page, actor, target) {
  const state = await snapshot(page);
  const origin = await point(page, state.cops[actor]);
  await page.touchscreen.tap(origin.x, origin.y);
  assert.equal((await snapshot(page)).selected, actor, 'canvas tap selects the touched officer');
  const destination = await point(page, target);
  await page.touchscreen.tap(destination.x, destination.y);
  const moved = (await snapshot(page)).cops[actor];
  assert.equal(moved.moving, true, 'road tap starts movement');
  assert.ok(moved.destination, 'a real destination is issued');
}
try {
  for (const viewport of process.env.FRIEND_ONLY || process.env.BACK_ONLY
    ? []
    : [
        { width: 320, height: 740 },
        { width: 390, height: 844 },
        { width: 844, height: 390 },
      ]) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    watch(page);
    await page.goto(base);
    await expect(page.locator('#home-screen')).toBeVisible();
    await expect(page.locator('#game-screen')).toBeHidden();
    const transform = await page.locator('#home-screen').evaluate(async (node) => {
      await Promise.all(
        node.getAnimations().map((animation) => animation.finished.catch(() => {})),
      );
      const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      return { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d };
    });
    assert.deepEqual(transform, { a: 1, b: 0, c: 0, d: 1 }, 'home stays upright');
    await pageChecks(page);
    await screenshot(page, `${output}/home-${viewport.width}.png`);

    await page.locator('#appearance-button').tap();
    const appearance = page.locator('[data-role-appearance]');
    await expect(appearance).toBeVisible();
    assert.equal(
      await appearance.locator('select:visible').count(),
      0,
      'avatar choice uses game cards',
    );
    for (const role of ['cop', 'robber']) {
      await appearance.locator(`[data-appearance-role="${role}"]`).tap();
      await expect(appearance.locator(`[data-avatar-role="${role}"]`)).toHaveCount(3);
      await appearance.locator(`[data-avatar-role="${role}"][data-avatar-preset="2"]`).tap();
      await expect(
        appearance.locator(`[data-avatar-role="${role}"][data-avatar-preset="2"]`),
      ).toHaveAttribute('aria-pressed', 'true');
    }
    const image = Buffer.from(
      await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 16;
        canvas.getContext('2d').fillRect(0, 0, 16, 16);
        return canvas.toDataURL('image/png').split(',')[1];
      }),
      'base64',
    );
    await expect(appearance.locator('[data-upload-avatar]')).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await appearance.locator('[data-upload-avatar]').tap();
    await (await chooser).setFiles({ name: 'my-avatar.png', mimeType: 'image/png', buffer: image });
    await expect
      .poll(() =>
        page.evaluate(() =>
          JSON.parse(localStorage.getItem('chase-role-appearance-v1')).robber.avatar?.startsWith(
            'data:image/',
          ),
        ),
      )
      .toBe(true);
    await appearance.locator('[data-reset-avatar]').tap();
    await appearance.locator('[data-avatar-role="robber"][data-avatar-preset="1"]').tap();
    await pageChecks(page);
    await screenshot(page, `${output}/avatars-${viewport.width}.png`);
    await appearance.locator('[data-close-appearance]').last().tap();
    await expect(appearance).toHaveCount(0);
    // UI close must not leave a historical appearance route without its panel.
    await page.locator('#levels-button').tap();
    await expect(page.locator('#level-screen')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#home-screen')).toBeVisible();
    assert.equal(
      (await snapshot(page)).screen,
      'home',
      'avatar UI close then setup/back returns home without reload',
    );
    assert.equal(await page.evaluate(() => history.state.patrolScreen), 'home');
    await page.reload();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('chase-role-appearance-v1')),
    );
    assert.equal(saved.cop.preset, 2);
    assert.equal(saved.robber.preset, 1);
    await page.locator('#appearance-button').tap();
    await expect(appearance).toBeVisible();
    await page.goBack();
    await expect(appearance).toHaveCount(0);
    await expect(page.locator('#home-screen')).toBeVisible();
    assert.equal(await page.evaluate(() => history.state.patrolScreen), 'home');
    await page.locator('#levels-button').tap();
    await expect(page.locator('#level-screen')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#home-screen')).toBeVisible();
    assert.equal(await page.evaluate(() => history.state.patrolScreen), 'home');

    await startQuick(page, viewport.width);
    await pageChecks(page);
    await screenshot(page, `${output}/game-${viewport.width}.png`);
    // The default selected officer is 0. Selecting 1 then 0 proves both hit targets.
    for (const actor of [1, 0]) await tapActor(page, actor, { x: 500, y: 300 });
    await expect.poll(async () => (await snapshot(page)).phase, { timeout: 10000 }).toBe('won');
    assert.ok((await snapshot(page)).robbers.every((actor) => actor.caught));
    await expect(page.locator('#win-dialog')).toBeVisible();
    await expect(page.locator('#record-status')).toHaveText('服务器已验证并保存');
    await pageChecks(page);
    await screenshot(page, `${output}/win-${viewport.width}.png`);
    await page.locator('#win-dialog [data-home]').tap();
    await page.reload();
    await page.locator('#records-button').tap();
    await expect(page.locator('#records-dialog')).toBeVisible();
    await expect(page.locator('#records-state')).toHaveText('操作已通过服务器重放验证。');
    await expect(page.locator('#records-list li').first()).toBeVisible();
    assert.notEqual(
      await page.locator('#records-local').textContent(),
      '暂无',
      'best result survives reload',
    );
    await pageChecks(page);
    await screenshot(page, `${output}/records-${viewport.width}.png`);
    await page.locator('#records-dialog [data-close]').tap();

    await startQuick(page);
    const initial = await snapshot(page);
    const origin = await point(page, initial.cops[0]);
    const target = await point(page, { x: 500, y: 300 });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: origin.x, y: origin.y, id: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: target.x, y: target.y, id: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.equal(
      (await snapshot(page)).cops[0].destination,
      null,
      'cancelled gesture does not issue a move',
    );
    await page.locator('#pause-button').tap();
    await expect(page.locator('#pause-dialog')).toBeVisible();
    const paused = await snapshot(page);
    await page.waitForTimeout(250);
    assert.equal((await snapshot(page)).time, paused.time, 'pause stops simulation');
    assert.equal(paused.phase, 'paused');
    assert.equal(await page.locator('#i-pause rect').count(), 2, 'pause icon has two solid bars');
    await pageChecks(page);
    await screenshot(page, `${output}/pause-${viewport.width}.png`);
    await page.goBack();
    await expect(page.locator('#game-screen')).toBeVisible();
    assert.equal((await snapshot(page)).phase, 'playing', 'browser back resumes the paused game');
    assert.equal(await page.evaluate(() => history.state.patrolScreen), 'game');
    await page.locator('#pause-button').tap();
    await expect(page.locator('#pause-dialog')).toBeVisible();
    await page.locator('#resume-button').tap();
    await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(paused.time);
    // Returning to a historical pause page must restore its resume lifecycle.
    await page.goBack();
    await expect(page.locator('#pause-dialog')).toBeVisible();
    const historicPause = await snapshot(page);
    assert.equal(historicPause.phase, 'paused');
    await page.locator('#resume-button').tap();
    await expect(page.locator('#game-screen')).toBeVisible();
    await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');
    await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(historicPause.time);
    await tapActor(page, 1, { x: 500, y: 300 });
    await page.locator('#game-screen [data-home]').tap();
    await expect(page.locator('#home-screen')).toBeVisible();
    await page.locator('#levels-button').tap();
    await expect(page.locator('#level-screen')).toBeVisible();
    assert.equal((await snapshot(page)).phase, 'ready');
    await page.goBack();
    await expect(page.locator('#home-screen')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#level-screen')).toBeVisible();
    await expect(page.locator('#start-button')).toBeInViewport();
    await expect(page.locator('#start-button')).toBeEnabled();
    assert.equal(
      (await snapshot(page)).phase,
      'ready',
      'historical game route shows setup after a new ready state',
    );
    if (viewport.width === 390) {
      await page.locator('#start-button').tap();
      await expect(page.locator('#game-screen')).toBeVisible();
      await page.waitForTimeout(340);
      await page.locator('#pause-button').tap();
      await expect(page.locator('#pause-dialog')).toBeVisible();
      await page.locator('#resume-button').tap();
      for (const actor of [1, 0]) await tapActor(page, actor, { x: 500, y: 300 });
      await expect.poll(async () => (await snapshot(page)).phase, { timeout: 10000 }).toBe('won');
      await expect(page.locator('#win-dialog')).toBeVisible();
      await page.locator('#win-dialog [data-home]').tap();
      for (let back = 0; back < 3; back++) {
        await page.goBack();
        await expect(page.locator('#win-dialog')).toBeVisible();
        assert.equal(
          (await snapshot(page)).phase,
          'won',
          'historical game/pause routes retain the completed result',
        );
      }
    }
    checks.push(
      `${viewport.width}x${viewport.height}: upright home, card setup, six avatars, upload/persistence, real touch quick win/server replay/ranking, touch cancel, pause/resume and historical avatar/pause/ready-game browser Back regressions`,
    );
    await context.close();
  }

  if (!process.env.BACK_ONLY) {
    // Separate browser identities exercise the actual multiplayer lifecycle.
    const multiplayer = await Promise.all(
      [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
      ].map((viewport) => browser.newContext({ viewport, hasTouch: true, isMobile: true })),
    );
    const players = await Promise.all(multiplayer.map((context) => context.newPage()));
    for (const page of players) {
      watch(page);
      await page.goto(base);
      await page.locator('#friends-button').tap();
      await expect(page.locator('[data-street-competition][open]')).toBeVisible();
      await expect(
        page.locator('[data-street-competition] section[data-page="lobby"]'),
      ).toBeVisible();
      await pageChecks(page);
      assert.equal(await page.locator('[data-street-competition] select:visible').count(), 0);
    }
    const [host, guest] = players;
    const hostSurface = host.locator('[data-street-competition]');
    await hostSurface.locator('[data-profile]').tap();
    await expect(hostSurface.locator('[data-page="nickname"]')).toBeVisible();
    await hostSurface.locator('input[name="name"]').fill('街区小队长');
    await hostSurface.locator('[data-save-name]').tap();
    await expect(hostSurface.locator('[data-profile-name]')).toHaveText('街区小队长');
    assert.equal(
      await host.evaluate(async () => (await __competition.request('/me')).name),
      '街区小队长',
    );
    await pageChecks(host);
    await hostSurface.locator('[data-go="create"]').tap();
    await expect(hostSurface.locator('[data-page="create"]')).toBeVisible();
    await hostSurface.locator('[data-match-role="pursuer"]').tap();
    await hostSurface.locator('[data-match-mode="classic"]').tap();
    await hostSurface.locator('[data-initiative="pursuer"]').tap();
    await screenshot(host, `${output}/friend-create-390.png`);
    await hostSurface.locator('[data-create]').tap();
    await expect(hostSurface.locator('[data-room-code]')).toHaveText(/^[A-F0-9]{12}$/);
    const code = await hostSurface.locator('[data-room-code]').textContent();
    const guestSurface = guest.locator('[data-street-competition]');
    await guestSurface.locator('[data-go="join"]').tap();
    await expect(guestSurface.locator('[data-page="join"]')).toBeVisible();
    await guestSurface.locator('[data-code]').fill(code);
    await guestSurface.locator('[data-join]').tap();
    await expect(guestSurface.locator('[data-room-code]')).toHaveText(code);
    await expect(hostSurface.locator('[data-players]')).toContainText('街区小队长');

    // Changing team exchanges both seats; changing the opening is host controlled.
    await hostSurface.locator('button[data-role="runner"]').tap();
    await expect
      .poll(() =>
        host.evaluate(async (code) => {
          const room = await __competition.request(`/rooms/${code}`);
          return room.players[room.you].role;
        }, code),
      )
      .toBe('runner');
    await expect
      .poll(() =>
        guest.evaluate(async (code) => {
          const room = await __competition.request(`/rooms/${code}`);
          return room.players[room.you].role;
        }, code),
      )
      .toBe('pursuer');
    await hostSurface.locator('button[data-role="pursuer"]').tap();
    await expect
      .poll(() =>
        host.evaluate(async (code) => {
          const room = await __competition.request(`/rooms/${code}`);
          return room.players[room.you].role;
        }, code),
      )
      .toBe('pursuer');
    await expect
      .poll(() =>
        guest.evaluate(async (code) => {
          const room = await __competition.request(`/rooms/${code}`);
          return room.players[room.you].role;
        }, code),
      )
      .toBe('runner');
    await hostSurface.locator('[data-room-lead="runner"]').tap();
    await expect
      .poll(() =>
        host.evaluate(
          async (code) => (await __competition.request(`/rooms/${code}`)).initiative,
          code,
        ),
      )
      .toBe('runner');
    await hostSurface.locator('[data-room-lead="pursuer"]').tap();
    await hostSurface.locator('[data-invite]').first().tap();
    await expect(hostSurface.locator('[data-page="invite"]')).toBeVisible();
    await expect(hostSurface.locator('[data-invite-code]')).toHaveText(code);
    await expect(hostSurface.locator('[data-invite-url]')).toHaveValue(new RegExp(`pk=${code}`));
    await pageChecks(host);
    await hostSurface.locator('[data-page="invite"] [data-page-return]').tap();
    await screenshot(host, `${output}/friend-room-390.png`);
    for (const page of players) {
      const surface = page.locator('[data-street-competition]');
      await expect(surface.locator('button[data-ready]')).toBeVisible();
      await surface.locator('button[data-ready]').tap();
    }
    for (const page of players)
      await expect(
        page.locator('[data-street-competition] section[data-page="play"]'),
      ).toBeVisible();
    await expect
      .poll(() =>
        host.evaluate(
          async (code) => (await __competition.request(`/rooms/${code}`)).state.openingRemainingMs,
          code,
        ),
      )
      .toBe(0);

    for (const [index, page] of players.entries()) {
      const destinations = await page.evaluate(async (code) => {
        const room = await __competition.request(`/rooms/${code}`);
        const { createRenderer } = await import('./src/competition-renderer.js');
        const canvas = document.querySelector('[data-street-competition] canvas');
        const bounds = canvas.getBoundingClientRect();
        const turned =
          canvas.closest('[data-street-competition]').dataset.mapProjection === 'quarter-turn';
        const rotate = (value) => (value ? { ...value, x: -value.y, y: value.x } : value);
        const rotateActor = (value) => ({
          ...rotate(value),
          ...(value.routePoints ? { routePoints: value.routePoints.map(rotate) } : {}),
          ...(value.destination ? { destination: rotate(value.destination) } : {}),
          ...(value.gap
            ? { gap: { ...value.gap, from: rotate(value.gap.from), to: rotate(value.gap.to) } }
            : {}),
        });
        const view = turned
          ? {
              ...room.state,
              map: { ...room.state.map, nodes: room.state.map.nodes.map(rotate) },
              cops: room.state.cops.map(rotateActor),
              robbers: room.state.robbers.map(rotateActor),
              exits: room.state.exits.map(rotate),
            }
          : room.state;
        const scratch = document.createElement('canvas');
        const renderer = createRenderer();
        const hits = renderer.draw(
          scratch.getContext('2d'),
          canvas.clientWidth,
          canvas.clientHeight,
          view,
        );
        const label = room.state.role === 'runner' ? '小偷' : '警察';
        const actor = hits.filter((hit) => hit.label.includes(label)).at(-1);
        const { getLevels } = await import('./src/levels.js');
        const { createGame, startGame, stepGame, commandCop, commandRobber, roadTarget } =
          await import('./src/engine.js');
        const probe = createGame(getLevels(room.state.mode)[room.state.levelId - 1], {
          ai: false,
          firstRole: room.state.firstRole === 'pursuer' ? 'cop' : 'robber',
        });
        startGame(probe);
        for (let tick = 0; tick < 252; tick++) stepGame(probe, 1 / 120);
        for (const team of ['cops', 'robbers'])
          room.state[team].forEach((current, index) => {
            Object.assign(probe[team][index], roadTarget(probe, current), {
              caught: !!current.caught,
              escaped: !!current.escaped,
            });
          });
        const command = room.state.role === 'runner' ? commandRobber : commandCop;
        const candidates = hits
          .filter((hit) => hit.label.startsWith('道路'))
          .sort(
            (a, b) =>
              Math.hypot(b.x - actor.x, b.y - actor.y) - Math.hypot(a.x - actor.x, a.y - actor.y),
          );
        let expected;
        const road = candidates.find((hit) => {
          renderer.tap(actor.x + actor.w / 2, actor.y + actor.h / 2, view);
          const action = renderer.tap(hit.x + hit.w / 2, hit.y + hit.h / 2, view);
          expected =
            action?.type === 'move' && turned ? { ...action, x: action.y, y: -action.x } : action;
          return (
            action?.type === 'move' &&
            action.actor === actor.action.local &&
            command(probe, actor.action.local, expected)
          );
        });
        if (!road) throw new Error('Assigned map has no reachable test destination');
        const position = (hit) => ({
          x: bounds.left + hit.x + hit.w / 2,
          y: bounds.top + hit.y + hit.h / 2,
        });
        return {
          actor: position(actor),
          road: position(road),
          id: actor.action.local,
          seq: room.seq,
          expected,
          projection: turned ? 'quarter-turn' : 'normal',
        };
      }, code);
      await page.touchscreen.tap(destinations.actor.x, destinations.actor.y);
      const sent = page.waitForRequest(
        (request) =>
          request.url().endsWith(`/rooms/${code}/actions`) && request.method() === 'POST',
      );
      await page.touchscreen.tap(destinations.road.x, destinations.road.y);
      const request = await sent;
      assert.equal(
        request.postDataJSON().action.actor,
        destinations.id,
        'canvas input commands the touched role',
      );
      assert.deepEqual(
        request.postDataJSON().action,
        destinations.expected,
        `${destinations.projection} canvas input maps to physical server coordinates`,
      );
      const response = await request.response();
      assert.equal(response.status(), 200, await response.text());
      await expect
        .poll(() =>
          page.evaluate(async (code) => (await __competition.request(`/rooms/${code}`)).seq, code),
        )
        .toBeGreaterThan(destinations.seq);
      await pageChecks(page);
      await screenshot(page, `${output}/friend-play-${index}.png`);
    }
    const leaving = host.waitForResponse(
      (response) =>
        response.url().endsWith(`/rooms/${code}/leave`) && response.request().method() === 'POST',
    );
    await hostSurface.locator('[data-page="play"] [data-close]').tap();
    assert.equal((await leaving).status(), 200);
    await expect(host.locator('[data-competition-launch]')).toBeEnabled();
    await expect(host.locator('#home-screen')).toBeVisible();
    await host.locator('#friends-button').tap();
    await hostSurface.locator('[data-board]:visible').first().tap();
    await expect(hostSurface.locator('[data-page="board"]')).toBeVisible();
    await expect(hostSurface.locator('[data-board-summary]')).not.toHaveText('正在读取全站成绩…');
    const boardRequest = host.waitForResponse(
      (response) =>
        response.url().includes('/boards/cops-robbers-realtime') &&
        response.request().method() === 'GET',
    );
    await hostSurface.locator('[data-refresh-board]').tap();
    assert.equal((await boardRequest).status(), 200, 'ranking reload uses real server');
    await pageChecks(host);
    await screenshot(host, `${output}/friend-board-390.png`);
    checks.push(
      'Two independent touch clients: nickname server persistence, custom role/mode/opening choices, create/join/invite/exchange/ready, police and thief canvas actions accepted by real server, return home and server ranking refresh',
    );
    for (const context of multiplayer) await context.close();

    for (const reopenBeforeReply of [false, true]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      });
      const page = await context.newPage();
      watch(page);
      let release, staleCode;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      try {
        await page.goto(base);
        await page.locator('#friends-button').tap();
        const surface = page.locator('[data-street-competition]');
        await expect(surface.locator('section[data-page="lobby"]')).toBeVisible();
        await surface.locator('[data-go="create"]').tap();
        await expect(surface.locator('[data-match-mode="classic"]')).toBeVisible();
        // The actual server creates a room; only its browser response is delayed.
        await page.route(
          '**/api/competition/v1/rooms',
          async (route) => {
            const response = await route.fetch();
            staleCode = (await response.json()).code;
            await held;
            await route.fulfill({ response });
          },
          { times: 1 },
        );
        await surface.locator('[data-create]').tap();
        await expect.poll(() => staleCode).toMatch(/^[A-F0-9]{12}$/);
        await surface.locator('[data-page-back]').tap();
        await expect(surface.locator('section[data-page="lobby"]')).toBeVisible();
        await surface.locator('[data-home]').tap();
        await expect(page.locator('#home-screen')).toBeVisible();
        await expect(page.locator('[data-competition-launch]')).toBeEnabled();

        let currentCode;
        if (reopenBeforeReply) {
          await page.locator('#friends-button').tap();
          await expect(surface.locator('section[data-page="lobby"]')).toBeVisible();
          await surface.locator('[data-go="create"]').tap();
          await surface.locator('[data-create]').tap();
          await expect(surface.locator('[data-room-code]')).toHaveText(/^[A-F0-9]{12}$/);
          currentCode = await surface.locator('[data-room-code]').textContent();
          assert.notEqual(currentCode, staleCode);
        }
        release();
        await expect
          .poll(() =>
            page.evaluate(
              async (code) => (await __competition.request(`/rooms/${code}`)).status,
              staleCode,
            ),
          )
          .toBe('abandoned');
        if (reopenBeforeReply) {
          await expect(surface.locator('section[data-page="room"]')).toBeVisible();
          await expect(surface.locator('[data-room-code]')).toHaveText(currentCode);
          assert.equal(
            await page.evaluate(() =>
              localStorage.getItem('competition-room:cops-robbers-realtime'),
            ),
            currentCode,
            'delayed old reply cannot replace the new session room',
          );
          await surface.locator('section[data-page="room"] [data-close]').tap();
        } else {
          await expect(page.locator('#home-screen')).toBeVisible();
          await expect(surface).toBeHidden();
          await page.locator('#friends-button').tap();
          await expect(surface.locator('section[data-page="lobby"]')).toBeVisible();
          await surface.locator('[data-home]').tap();
        }
        await expect(page.locator('#home-screen')).toBeVisible();
        await pageChecks(page);
      } finally {
        release();
        await context.close();
      }
    }
    checks.push(
      'Delayed actual room-create responses after exit and immediate reopen: stale rooms abandoned on server, new session page/room/storage retained',
    );

    for (const mode of [
      { query: '', stored: null, enabled: false },
      { query: '?dev=1', stored: null, enabled: true },
      { query: '', stored: 'true', enabled: true },
      { query: '?dev=0', stored: 'true', enabled: false },
    ]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      });
      await context.addInitScript((value) => {
        if (value === null) localStorage.removeItem('dev');
        else localStorage.setItem('dev', value);
      }, mode.stored);
      const page = await context.newPage();
      watch(page);
      await page.goto(base + '/' + mode.query);
      assert.equal(await page.evaluate(() => SmallGamesDev.isEnabled()), mode.enabled);
      await page.route('**/__dev-frame', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><iframe style="width:100%;height:95vh;border:0" src="${base}/${mode.query}"></iframe>`,
        }),
      );
      await page.goto(base + '/__dev-frame');
      const frame = page.frames().find((frame) => frame !== page.mainFrame());
      await expect.poll(() => frame.evaluate(() => !!globalThis.SmallGamesDev)).toBe(true);
      assert.equal(
        await frame.evaluate(() => SmallGamesDev.isEnabled()),
        mode.enabled,
        'iframe respects URL/storage dev switch',
      );
      if (!mode.query && mode.stored === null) {
        await startQuick(frame);
        const bounds = await (await frame.frameElement()).boundingBox();
        const absolute = (position) => ({ x: bounds.x + position.x, y: bounds.y + position.y });
        const state = await snapshot(frame);
        const origin = absolute(await point(frame, state.cops[0]));
        const target = absolute(await point(frame, { x: 500, y: 300 }));
        const session = await context.newCDPSession(page);
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ ...origin, id: 1 }],
        });
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ ...target, id: 1 }],
        });
        await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        assert.equal(
          (await snapshot(frame)).cops[0].destination,
          null,
          'iframe cancellation does not issue orders',
        );
        const other = absolute(await point(frame, (await snapshot(frame)).cops[1]));
        await page.touchscreen.tap(other.x, other.y);
        await page.touchscreen.tap(target.x, target.y);
        assert.equal((await snapshot(frame)).selected, 1);
        assert.equal(
          (await snapshot(frame)).cops[1].moving,
          true,
          'iframe canvas responds to actual touch',
        );
        await screenshot(page, `${output}/iframe-touch-390.png`);
      }
      await context.close();
    }
    checks.push(
      'Mobile independent and iframe developer mode: default off, URL on, storage on, explicit URL off; iframe real canvas touch and gesture cancellation',
    );
  }

  const navigationContexts = await Promise.all(
    [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ].map((viewport) => browser.newContext({ viewport, hasTouch: true, isMobile: true })),
  );
  try {
    const [host, guest] = await Promise.all(navigationContexts.map((context) => context.newPage()));
    for (const page of [host, guest]) {
      watch(page);
      await page.goto(base);
    }
    const surface = host.locator('[data-street-competition]');
    const createRoom = async () => {
      await host.locator('#friends-button').tap();
      await expect(surface.locator('section[data-page="lobby"]')).toBeVisible();
      await surface.locator('[data-go="create"]').tap();
      await surface.locator('[data-create]').tap();
      await expect(surface.locator('section[data-page="room"]')).toBeVisible();
      await expect(surface.locator('[data-room-code]')).toHaveText(/^[A-F0-9]{12}$/);
      return surface.locator('[data-room-code]').textContent();
    };
    const assertLeft = async (code, trigger) => {
      const response = host.waitForResponse(
        (response) =>
          response.url().endsWith(`/rooms/${code}/leave`) && response.request().method() === 'POST',
      );
      await trigger();
      assert.equal((await response).status(), 200, 'Back completes the actual room leave');
      await expect(host.locator('#home-screen')).toBeVisible();
      await expect(surface).toBeHidden();
      await expect(host.locator('[data-competition-launch]')).toBeEnabled();
      assert.equal(
        await host.evaluate(
          async (code) => (await __competition.request(`/rooms/${code}`)).status,
          code,
        ),
        'abandoned',
      );
      assert.equal(
        await host.evaluate(() => localStorage.getItem('competition-room:cops-robbers-realtime')),
        null,
      );
      await pageChecks(host);
    };
    const waiting = await createRoom();
    await assertLeft(waiting, () => surface.locator('[data-page-back]').tap());
    await host.locator('#records-button').tap();
    await expect(host.locator('#records-dialog')).toBeVisible();
    await host.locator('#records-dialog [data-competition-entry="board"]').tap();
    await expect(surface.locator('section[data-page="board"]')).toBeVisible();
    await host.goBack();
    await expect(host.locator('#records-dialog')).toBeVisible();
    await expect(surface).toBeHidden();
    await expect(host.locator('[data-competition-launch]')).toBeEnabled();
    assert.equal(
      (await snapshot(host)).screen,
      'records-dialog',
      'direct board Back restores the source records page',
    );
    await host.locator('#records-dialog [data-close]').tap();

    const playing = await createRoom();
    await guest.locator('#friends-button').tap();
    const guestSurface = guest.locator('[data-street-competition]');
    await guestSurface.locator('[data-go="join"]').tap();
    await guestSurface.locator('[data-code]').fill(playing);
    await guestSurface.locator('[data-join]').tap();
    await expect(guestSurface.locator('section[data-page="room"]')).toBeVisible();
    for (const page of [host, guest])
      await page.locator('[data-street-competition] button[data-ready]').tap();
    await expect(surface.locator('section[data-page="play"]')).toBeVisible();
    await assertLeft(playing, () => host.goBack());
    assert.equal(
      await guest.evaluate(
        async (code) => (await __competition.request(`/rooms/${code}`)).status,
        playing,
      ),
      'abandoned',
    );
    checks.push(
      'PK waiting-room UI Back and playing-room browser Back complete real leave, abandon server rooms and clear saved codes; direct friend board Back restores source local records',
    );
  } finally {
    for (const context of navigationContexts) await context.close();
  }

  assert.deepEqual(errors, [], 'no browser runtime errors');
  await writeFile(
    `${output}/${process.env.BACK_ONLY ? 'navigation-report.json' : 'report.json'}`,
    JSON.stringify(
      {
        checks,
        errors,
        server: base,
        device: 'Chromium touch emulation; physical device not verified',
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} finally {
  await browser.close();
}
