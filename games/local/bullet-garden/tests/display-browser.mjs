/** Real pointer regression for rotated HUD controls and browser fullscreen.
 * Start server.mjs, then GAME_URL=http://127.0.0.1:4410 node tests/display-browser.mjs.
 * Optional: PLAYWRIGHT_MODULE, CHROMIUM_PATH, CHROMIUM_ARGS (JSON array), QA_OUTPUT.
 * Mini-game SDK and primary-pointer capabilities use explicit fixtures;
 * fullscreen and control activation use real browser APIs and input.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { chromium, expect } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : '@playwright/test'
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: process.env.CHROMIUM_ARGS
    ? JSON.parse(process.env.CHROMIUM_ARGS)
    : ['--no-sandbox', '--disable-dev-shm-usage'],
});
const url = `${(process.env.GAME_URL || 'http://127.0.0.1:4410').replace(/\/$/, '')}/`;
const output = process.env.QA_OUTPUT || '/tmp/bullet-garden-display-qa';
await mkdir(output, { recursive: true });
const report = {
  date: new Date().toISOString(),
  browser: await browser.version(),
  url,
  physicalMobile: false,
  checks: [],
  errors: [],
  passed: false,
};
const snapshot = (session) => session.game.evaluate(() => globalThis.__bulletGarden.snapshot());
const advance = (session, milliseconds = 64) => session.page.clock.runFor(milliseconds);

async function setup({ width, height, touch = true, embedded = false, query = '', sdk = false }) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: touch,
    isMobile: touch,
    deviceScaleFactor: 1,
  });
  if (sdk)
    await context.addInitScript(() => {
      globalThis.wx = { createCanvas() {}, getSystemInfoSync() {} };
    });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`);
  });
  await page.clock.install({ time: new Date('2026-10-05T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-05T00:00:01Z'));
  const destination = `${url}${query}`;
  if (embedded) {
    const host = new URL('__display_test_host__', url).href;
    await page.route(host, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}main{position:absolute;inset:12px}main:fullscreen{inset:0;width:100%;height:100%}iframe{display:block;border:0;width:100%;height:100%}</style></head><body><main data-game-display-host><iframe src="${destination}" allow="fullscreen" allowfullscreen></iframe></main></body></html>`,
      }),
    );
    await page.goto(host);
    await page.frameLocator('iframe').locator('#game').waitFor();
  } else await page.goto(destination);
  const game = embedded
    ? await page
        .locator('iframe')
        .elementHandle()
        .then((el) => el.contentFrame())
    : page;
  const session = { page, game, context, touch, embedded };
  await advance(session, 96);
  return session;
}

async function click(session, selector) {
  const control = session.game.locator(selector);
  if (session.touch) await control.tap();
  else await control.click();
  await advance(session);
}

async function inspectTargets(session) {
  const controls = await session.game.locator('#fullscreen, .tools button').evaluateAll((buttons) =>
    buttons
      .filter((button) => {
        const style = globalThis.getComputedStyle(button);
        return (
          style.visibility === 'visible' &&
          style.display !== 'none' &&
          button.getClientRects().length
        );
      })
      .map((button) => {
        const rect = button.getBoundingClientRect();
        const hits = [
          [0.5, 0.5],
          [0.2, 0.5],
          [0.8, 0.5],
          [0.5, 0.2],
          [0.5, 0.8],
        ].map(([x, y]) => {
          const target = globalThis.document.elementFromPoint(
            rect.left + rect.width * x,
            rect.top + rect.height * y,
          );
          return {
            hit: target?.closest('button')?.id || target?.id,
            accepted: button.contains(target),
          };
        });
        return {
          id: button.id,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          hits,
          viewport: { width: globalThis.innerWidth, height: globalThis.innerHeight },
        };
      }),
  );
  assert.ok(
    controls.some((control) => control.id === 'pause'),
    'pause remains visible in battle',
  );
  for (const { id, rect, hits, viewport } of controls) {
    assert.ok(rect.width >= 44 && rect.height >= 44, `${id} has a 44px touch target`);
    assert.ok(
      rect.x >= -0.5 &&
        rect.y >= -0.5 &&
        rect.x + rect.width <= viewport.width + 0.5 &&
        rect.y + rect.height <= viewport.height + 0.5,
      `${id} remains inside the physical viewport: ${JSON.stringify(rect)}`,
    );
    assert.ok(
      hits.every((hit) => hit.accepted),
      `${id} accepts center and edge touches: ${JSON.stringify(hits)}`,
    );
    for (const other of controls.filter((control) => control.id !== id)) {
      const overlapWidth =
        Math.min(rect.x + rect.width, other.rect.x + other.rect.width) -
        Math.max(rect.x, other.rect.x);
      const overlapHeight =
        Math.min(rect.y + rect.height, other.rect.y + other.rect.height) -
        Math.max(rect.y, other.rect.y);
      assert.ok(
        overlapWidth <= 0.5 || overlapHeight <= 0.5,
        `${id} does not overlap ${other.id}: ${JSON.stringify(controls)}`,
      );
    }
  }
  return controls.map(({ id, rect }) => ({ id, rect }));
}

async function fullscreen(session, enabled) {
  const before = await snapshot(session);
  await click(session, '#fullscreen');
  await expect
    .poll(() => session.page.evaluate(() => Boolean(globalThis.document.fullscreenElement)))
    .toBe(enabled);
  await expect(session.game.locator('#fullscreen')).toHaveAttribute(
    'aria-pressed',
    String(enabled),
  );
  await expect(session.game.locator('#fullscreen')).toHaveAccessibleName(
    enabled ? '退出全屏' : '全屏',
  );
  await expect(session.game.locator('#fullscreen')).toBeEnabled();
  await advance(session);
  const after = await snapshot(session);
  assert.equal(after.runId, before.runId, 'fullscreen preserves the active run');
  assert.equal(after.phase, before.phase, 'fullscreen preserves the current screen');
  if (enabled)
    assert.equal(
      await session.page.evaluate(() => globalThis.document.fullscreenElement.tagName),
      session.embedded ? 'MAIN' : 'HTML',
      'embedded fullscreen targets the containing display host',
    );
}

async function pauseAndResume(session) {
  await click(session, '#pause');
  const paused = await snapshot(session);
  assert.equal(paused.phase, 'paused', 'real pause tap opens pause screen');
  await advance(session, 500);
  assert.equal((await snapshot(session)).time, paused.time, 'paused game time stays frozen');
  await click(session, '#resume');
  await advance(session, 128);
  const resumed = await snapshot(session);
  assert.equal(resumed.phase, 'playing');
  assert.ok(resumed.time > paused.time, 'resume continues simulation time');
  assert.equal(resumed.runId, paused.runId);
}

async function touchCapabilityChange(session) {
  const rotated = await session.game.locator('#game').getAttribute('data-rotated');
  const describe = () =>
    session.game.evaluate(() => ({
      coarse: globalThis.matchMedia('(pointer: coarse)').matches,
      touchPoints: globalThis.navigator.maxTouchPoints,
      rotated: globalThis.document.querySelector('#game').dataset.rotated,
    }));
  const before = await describe();
  const touch = await session.context.newCDPSession(session.page);
  const stick = await session.game.locator('#joystick').boundingBox();
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ id: 1, x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 }],
  });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touch.detach();
  await advance(session, 96);
  const afterDetach = await describe();
  assert.equal(afterDetach.rotated, rotated, 'detaching a real touch session preserves layout');

  // Capability fixture: a hybrid device can switch its primary pointer to a mouse.
  // Chromium 140 also loses coarse-pointer emulation when a touch CDP session detaches.
  const capability = await session.context.newCDPSession(session.page);
  try {
    await capability.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await advance(session, 96);
    const finePointer = await describe();
    assert.equal(finePointer.coarse, false, 'fixture really changed the primary pointer');
    assert.equal(finePointer.rotated, rotated, 'touch layout survives primary-pointer changes');
    session.touch = false;
    await inspectTargets(session);
    await pauseAndResume(session);
    return { before, afterDetach, finePointer };
  } finally {
    await capability.detach();
  }
}

async function webCase({ width, height, touch, embedded }) {
  const session = await setup({ width, height, touch, embedded });
  const label = `${embedded ? 'iframe' : 'standalone'}-${width}x${height}`;
  try {
    assert.equal((await snapshot(session)).phase, 'ready');
    await fullscreen(session, true);
    await fullscreen(session, false);
    await click(session, '#start');
    const firstRun = (await snapshot(session)).runId;
    assert.ok(firstRun);
    const initialTargets = await inspectTargets(session);
    await pauseAndResume(session);
    await fullscreen(session, true);
    const fullscreenTargets = await inspectTargets(session);
    await pauseAndResume(session);
    await session.page.screenshot({ path: `${output}/${label}-fullscreen.png` });
    await click(session, '#pause');
    const pausedTime = (await snapshot(session)).time;
    await fullscreen(session, false);
    assert.equal((await snapshot(session)).time, pausedTime, 'fullscreen exit keeps pause frozen');
    await click(session, '#resume');
    await inspectTargets(session);
    await fullscreen(session, true);
    // The browser exit event is the same path used by browser/system fullscreen UI.
    await session.page.evaluate(() => globalThis.document.exitFullscreen());
    await expect(session.game.locator('#fullscreen')).toHaveAttribute('aria-pressed', 'false');
    await expect(session.game.locator('#fullscreen')).toHaveAccessibleName('全屏');
    await advance(session);
    await inspectTargets(session);
    await pauseAndResume(session);
    const pointerChange = touch ? await touchCapabilityChange(session) : undefined;
    if (touch) {
      await session.page.setViewportSize({ width: height, height: width });
      await advance(session, 96);
      assert.equal(
        await session.game.locator('#game').getAttribute('data-rotated'),
        String(width > height),
      );
      await inspectTargets(session);
      await pauseAndResume(session);
    }
    await click(session, '#pause');
    await click(session, '#restart');
    assert.equal((await snapshot(session)).phase, 'playing');
    assert.notEqual((await snapshot(session)).runId, firstRun, 'restart creates a fresh run');
    await inspectTargets(session);
    await pauseAndResume(session);
    await click(session, '#battle-home');
    assert.equal((await snapshot(session)).phase, 'ready');
    await click(session, '#start');
    await inspectTargets(session);
    await click(session, '#pause');
    await click(session, '#pause-home');
    assert.equal((await snapshot(session)).phase, 'ready');
    report.checks.push({
      label,
      input: touch ? 'native tap' : 'native click',
      initialTargets,
      fullscreenTargets,
      pointerChange,
      browserExit: true,
      restartAndHome: true,
    });
    console.log(
      `PASS ${label}: hit targets, fullscreen, pause/resume, browser exit, rotation and repeat start`,
    );
  } catch (error) {
    await session.page.screenshot({ path: `${output}/${label}-failure.png` });
    throw error;
  } finally {
    await session.context.close();
  }
}

try {
  for (const embedded of [false, true])
    for (const [width, height, touch] of [
      [390, 844, true],
      [844, 390, true],
      [320, 568, true],
      [1440, 900, false],
    ])
      await webCase({ width, height, touch, embedded });
  for (const options of [
    { query: '?runtime=minigame' },
    { query: '?platform=wechatgame', embedded: true },
    { sdk: true },
  ]) {
    const session = await setup({ width: 390, height: 844, ...options });
    try {
      assert.equal(await session.game.locator('#game').getAttribute('data-runtime'), 'minigame');
      assert.equal(
        await session.game.locator('#fullscreen').count(),
        0,
        'mini-game hosts have no web fullscreen control',
      );
      await click(session, '#start');
      await inspectTargets(session);
      await pauseAndResume(session);
      report.checks.push({ miniGame: options, webFullscreenControl: false, nativePause: true });
      console.log(
        `PASS mini-game ${JSON.stringify(options)}: no web fullscreen, native pause/resume`,
      );
    } finally {
      await session.context.close();
    }
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.failure = error.stack;
  throw error;
} finally {
  await writeFile(`${output}/display-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}
