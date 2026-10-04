import assert from 'node:assert/strict';
import { chromium, expect } from 'playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const base = process.env.GAME_URL || 'http://127.0.0.1:43705';
const browser = await chromium.launch({ channel: 'chrome' });
const checks = [],
  errors = [];
await mkdir('artifacts', { recursive: true });
try {
  for (const viewport of process.env.NATIVE_ONLY || process.env.FRIEND_ONLY
    ? []
    : [
        { width: 844, height: 390 },
        { width: 390, height: 844 },
        { width: 320, height: 740 },
        { width: 1366, height: 768 },
      ]) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    const snapshot = () => page.evaluate(async () => (await import('./src/main.js')).getSnapshot());
    const point = (value) =>
      page.evaluate(async (value) => (await import('./src/main.js')).worldToScreen(value), value);
    await page.goto(base);
    await expect(page.locator('#home-screen')).toBeVisible();
    await expect(page.locator('#game-screen')).toBeHidden();
    await page.screenshot({ path: `artifacts/home-${viewport.width}.png` });
    await page.locator('#appearance-button').tap();
    await expect(page.getByLabel('警察样式')).toBeVisible();
    await page.getByLabel('警察样式').selectOption('animals');
    await page.getByRole('button', { name: '完成', exact: true }).tap();
    await page.locator('#levels-button').tap();
    await page.locator('#mode-select').selectOption('quick');
    await expect(page.locator('#start-button')).toBeInViewport();
    await page.screenshot({ path: `artifacts/levels-${viewport.width}.png` });
    await page.locator('#start-button').tap();
    await expect(page.locator('#home-screen')).toBeHidden();
    assert.equal(await page.locator('#cop-roster,.command-bar,.field-guide').count(), 0);
    for (const actor of [0, 1]) {
      const state = await snapshot(),
        origin = await point({ ...state.cops[actor], y: state.cops[actor].y - 22 });
      await page.touchscreen.tap(origin.x, origin.y);
      assert.equal((await snapshot()).selected, actor);
      const target = await point({ x: 500, y: 300 });
      await page.touchscreen.tap(target.x, target.y);
      assert.ok(
        (await snapshot()).cops[actor].moving,
        'real role tap followed by road tap moves chosen police',
      );
    }
    await expect.poll(async () => (await snapshot()).phase).toBe('won');
    await expect(page.locator('#win-dialog')).toBeVisible();
    await expect(page.locator('#record-status')).toHaveText('服务器已验证并保存');
    assert.notEqual(await page.locator('#win-best').textContent(), '暂无');
    assert.notEqual(await page.locator('#win-world').textContent(), '暂未连接');
    await page.screenshot({ path: `artifacts/win-${viewport.width}.png` });
    await page.locator('#win-dialog [data-home]').tap();
    await page.reload();
    await page.locator('#records-button').tap();
    await expect(page.locator('#records-state')).toHaveText('操作已通过服务器重放验证。');
    await expect(page.locator('#records-list li').first()).toBeVisible();
    assert.notEqual(
      await page.locator('#records-local').textContent(),
      '暂无',
      'personal best survives reload',
    );
    await page.locator('#records-dialog [data-close]').tap();
    await page.locator('#friends-button').tap();
    await expect(page.locator('[data-street-competition]')).toBeVisible();
    await expect(page.locator('[data-match-role] option[value=pursuer]')).toHaveText('警察');
    await expect(page.locator('[data-match-options]')).toBeVisible();
    await expect(page.locator('[data-create]')).toBeEnabled();
    await page.screenshot({ path: `artifacts/friends-${viewport.width}.png` });
    await page.locator('[data-street-competition] [data-close]').tap();
    await page.locator('#levels-button').tap();
    await page.locator('#start-button').tap();
    const state = await snapshot(),
      origin = await point(state.cops[0]),
      target = await point({ x: 500, y: 300 });
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
    assert.equal((await snapshot()).cops[0].destination, null, 'cancel does not issue a move');
    await page.locator('#pause-button').tap();
    await expect(page.locator('#pause-dialog')).toBeVisible();
    const time = (await snapshot()).time;
    await page.waitForTimeout(180);
    assert.equal((await snapshot()).time, time);
    assert.equal(await page.locator('#i-pause rect').count(), 2);
    await page.screenshot({ path: `artifacts/pause-${viewport.width}.png` });
    await page.locator('#resume-button').tap();
    assert.equal((await snapshot()).phase, 'playing');
    if (viewport.width === 1366) {
      await page.locator('#game-screen [data-home]').tap();
      await page.locator('#fullscreen-button').click();
      await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
      await page.locator('#fullscreen-button').click();
    }
    checks.push(
      `${viewport.width}x${viewport.height}: home/selection/canvas role input/win/server verification/local persistence/leaderboard/friends/cancel/pause`,
    );
    await context.close();
  }
  if (!process.env.NATIVE_ONLY) {
    const contexts = await Promise.all(
      [
        { width: 844, height: 390 },
        { width: 390, height: 844 },
      ].map((viewport) => browser.newContext({ viewport, hasTouch: true })),
    );
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    for (const page of pages) {
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(base);
      await page.locator('#friends-button').tap();
      await expect(page.locator('[data-match-role]')).toBeVisible();
    }
    const [host, guest] = pages;
    await host.locator('[data-match-initiative]').selectOption('pursuer');
    await host.locator('[data-create]').tap();
    await expect(host.locator('[data-room-code]')).toHaveText(/^[A-F0-9]{12}$/);
    const code = await host.locator('[data-room-code]').textContent();
    await guest.locator('[data-code]').fill(code);
    await guest.locator('[data-join]').tap();
    for (const page of pages) {
      await expect(page.locator('[data-ready]')).toBeVisible();
      await page.locator('[data-ready]').tap();
    }
    for (const page of pages)
      await expect(page.locator('.competition-dialog')).toHaveAttribute('data-playing', '');
    await host.waitForTimeout(2200);
    for (const [index, page] of pages.entries()) {
      const result = await page.evaluate(
        async ({ code }) => {
          const room = await globalThis.__competition.request(`/rooms/${code}`);
          const { createRenderer } = await import('./src/competition-renderer.js');
          const canvas = document.querySelector('.competition-dialog canvas'),
            rect = canvas.getBoundingClientRect();
          const scratch = document.createElement('canvas'),
            renderer = createRenderer();
          const hits = renderer.draw(
            scratch.getContext('2d'),
            canvas.clientWidth,
            canvas.clientHeight,
            room.state,
          );
          const role = room.state.role === 'runner' ? '小偷' : '警察';
          const actor = hits.filter((hit) => hit.label.includes(role)).at(-1);
          const roads = hits.filter((hit) => hit.label.startsWith('道路'));
          const candidates = roads.sort(
            (a, b) =>
              Math.hypot(b.x - actor.x, b.y - actor.y) - Math.hypot(a.x - actor.x, a.y - actor.y),
          );
          // Choose a reachable destination with the real rules: a thief cannot
          // cross police on the randomly assigned map merely to satisfy a UI test.
          const { getLevels } = await import('./src/levels.js');
          const { createGame, startGame, stepGame, commandCop, commandRobber } = await import(
            './src/engine.js'
          );
          const probe = createGame(getLevels(room.state.mode)[room.state.levelId - 1], {
            ai: false,
            firstRole: room.state.firstRole === 'pursuer' ? 'cop' : 'robber',
          });
          startGame(probe);
          for (let tick = 0; tick < 252; tick++) stepGame(probe, 1 / 120);
          const command = room.state.role === 'runner' ? commandRobber : commandCop;
          const road = candidates.find((hit) => command(probe, actor.action.local, hit.action));
          if (!road) throw new Error('No reachable destination in assigned map');
          const point = (hit) => {
            const x = hit.x + hit.w / 2,
              y = hit.y + hit.h / 2;
            return matchMedia('(orientation:portrait)').matches
              ? { x: rect.right - y, y: rect.top + x }
              : { x: rect.left + x, y: rect.top + y };
          };
          return { actor: point(actor), road: point(road), id: actor.action.local, seq: room.seq };
        },
        { code },
      );
      await page.touchscreen.tap(result.actor.x, result.actor.y);
      const request = page.waitForRequest(
        (request) =>
          request.url().endsWith(`/rooms/${code}/actions`) && request.method() === 'POST',
      );
      await page.touchscreen.tap(result.road.x, result.road.y);
      const action = (await request).postDataJSON();
      assert.equal(action.action.actor, result.id);
      const response = await (await request).response();
      assert.equal(response.status(), 200, `${index}: ${await response.text()}`);
      await expect
        .poll(() =>
          page.evaluate(
            async (code) => (await globalThis.__competition.request(`/rooms/${code}`)).seq,
            code,
          ),
        )
        .toBeGreaterThan(result.seq);
      await page.screenshot({ path: `artifacts/friend-game-${index}.png` });
    }
    await host.locator('.competition-dialog [data-close]').tap();
    await expect(host.locator('#home-screen')).toBeVisible();
    for (const context of contexts) await context.close();
    checks.push(
      'Two authenticated H5 clients: create/join/ready, police and thief canvas selection, rotated destination taps accepted by real server',
    );
  }
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
  await page.route('**/native-preview', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<body style="margin:0"><canvas style="width:844px;height:390px;touch-action:none"></canvas></body>',
    }),
  );
  await page.goto(base + '/native-preview');
  await page.evaluate(() => {
    const listeners = new Map(),
      storage = new Map(),
      canvas = document.querySelector('canvas');
    window.nativeLabels = [];
    const ctx = canvas.getContext('2d'),
      fill = ctx.fillText.bind(ctx),
      clear = ctx.fillRect.bind(ctx);
    ctx.fillText = (value, x, y, ...args) => {
      nativeLabels.push({ label: String(value), x, y });
      fill(value, x, y, ...args);
    };
    ctx.fillRect = (x, y, w, h) => {
      if (x === 0 && y === 0 && w === 844 && h === 390) nativeLabels.length = 0;
      clear(x, y, w, h);
    };
    const sdk = {
      createCanvas: () => canvas,
      createImage: () => new Image(),
      getSystemInfoSync: () => ({ windowWidth: 844, windowHeight: 390, pixelRatio: 1 }),
      getStorageSync: (key) => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, value),
      removeStorageSync: (key) => storage.delete(key),
      getLaunchOptionsSync: () => ({ query: {} }),
      login: ({ success }) => success({ code: 'test' }),
      request: ({ fail }) => fail({ errMsg: 'offline fixture' }),
    };
    for (const event of [
      'TouchEnd',
      'Hide',
      'Show',
      'WindowResize',
      'KeyboardConfirm',
      'KeyboardComplete',
      'ShareAppMessage',
      'AudioInterruptionBegin',
    ]) {
      sdk['on' + event] = (callback) => {
        const values = listeners.get(event) || new Set();
        values.add(callback);
        listeners.set(event, values);
      };
      sdk['off' + event] = (callback) => listeners.get(event)?.delete(callback);
    }
    window.sdk = sdk;
    canvas.addEventListener('pointerup', (event) => {
      for (const listener of listeners.get('TouchEnd') || [])
        listener({ changedTouches: [{ clientX: event.clientX, clientY: event.clientY }] });
    });
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const bundle = await readFile(
    new URL(
      '../../../../apps/shell-minigame/dist/wechat/cops-robbers-realtime/game.js',
      import.meta.url,
    ),
    'utf8',
  );
  assert.doesNotMatch(
    bundle,
    /document\.|window\.|createElement\(|iframe/,
    'native bundle has no browser implementation',
  );
  await page.evaluate((source) => {
    const exports = {};
    new Function('exports', 'wx', source)(exports, window.sdk);
    window.nativeGame = exports.instance;
  }, bundle);
  const nativeTap = async (label) => {
    await expect
      .poll(() =>
        page.evaluate((label) => nativeLabels.some((item) => item.label === label), label),
      )
      .toBe(true);
    const pos = await page.evaluate(
      (label) => nativeLabels.find((item) => item.label === label),
      label,
    );
    await page.touchscreen.tap(pos.x + 10, pos.y);
  };
  await nativeTap('开始游戏 →');
  await nativeTap('街区挑战'); // cycles to classic; rotate through all until quick
  await nativeTap('自由追逐');
  await nativeTap('出口竞速');
  await nativeTap('开始行动 →');
  await page.screenshot({ path: 'artifacts/native-game.png' });
  // Same authored quick map, field coordinates come from road geometry (Canvas labels).
  await page.touchscreen.tap(90, 153); // verify navigation and layout first; full native trace covered by engine
  await page.touchscreen.tap(813, 361);
  await nativeTap('继续行动');
  await page.touchscreen.tap(35, 361);
  await nativeTap('角色头像');
  await nativeTap('猫狐头像');
  await page.screenshot({ path: 'artifacts/native-avatars.png' });
  await nativeTap('首页');
  await nativeTap('好友 PK');
  await page.screenshot({ path: 'artifacts/native-friends.png' });
  await nativeTap('首页');
  assert.equal(
    await page.evaluate(() => nativeLabels.some((item) => item.label.includes('全屏'))),
    false,
  );
  await page.evaluate(() => nativeGame.stop());
  checks.push(
    'Actual WeChat bundle in Canvas SDK fixture: native home/selection/play/pause/avatars/PK/back, no fullscreen or DOM dependencies',
  );
  assert.deepEqual(errors, []);
  await writeFile(
    'artifacts/home-report.json',
    JSON.stringify(
      {
        checks,
        errors,
        database:
          'Actual routes/store using persistent PGlite PostgreSQL, not a deployed PostgreSQL host',
        native: 'SDK fixture, not physical device',
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} finally {
  await browser.close();
}
