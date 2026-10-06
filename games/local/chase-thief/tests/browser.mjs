import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The browser checks the production artifact. Its clock controls run the same
// engine as normal play; touch input still enters through the rendered controls.
const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = path.join(root, 'docs/design');
const checks = [];
const errors = [];
const screenshots = [];
const inputEvents = [];
let browser;
let server;
let failure;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function runNode(args) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, output);
}

async function launchServer() {
  const child = spawn(process.execPath, ['server.mjs', '--dist', '--port', '0'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server = child;
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  for (let attempt = 0; attempt < 100; attempt++) {
    const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    if (url) return url;
    assert.equal(child.exitCode, null, `Static server exited: ${output}`);
    await delay(50);
  }
  throw new Error(`Static server did not start: ${output}`);
}

async function loadChromium() {
  let playwright;
  try {
    playwright = await import('@playwright/test');
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    playwright = await import('/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs');
  }
  const candidates = [
    process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    process.env.CHASE_CHROMIUM,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  let executablePath;
  for (const candidate of candidates) {
    try {
      await access(candidate);
      executablePath = candidate;
      break;
    } catch {}
  }
  return playwright.chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox'],
  });
}

async function makePage(viewport = { width: 390, height: 844 }, init) {
  const context = await browser.newContext({
    viewport,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  if (init) await context.addInitScript(init);
  await context.addInitScript(() => {
    window.chaseInputEvents = [];
    for (const type of ['pointerdown', 'pointerup', 'click'])
      document.addEventListener(
        type,
        (event) => {
          const button = event.target.closest?.('button');
          if (
            !button ||
            !['start', 'pause', 'resume', 'left', 'right'].includes(
              button.id || button.dataset.action,
            )
          )
            return;
          window.chaseInputEvents.push({
            type,
            target: button.id || button.dataset.action,
            detail: event.detail,
            pointerType: event.pointerType,
            trusted: event.isTrusted,
            lane: document.querySelector('#game')?.dataset.lane,
          });
        },
        true,
      );
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) =>
    errors.push(`${request.url()}: ${request.failure()?.errorText}`),
  );
  page.on('response', (response) => {
    if (response.status() >= 400 && /\.(m?js|css|png|svg)(\?|$)/.test(response.url()))
      errors.push(`${response.status()} ${response.url()}`);
  });
  return { context, page };
}

async function phase(page, expected) {
  await page.waitForFunction((value) => document.body.dataset.phase === value, expected, {
    timeout: 5000,
  });
}

async function screenshot(page, name) {
  const file = `actual-${name}.png`;
  await page.screenshot({
    path: path.join(artifacts, file),
    fullPage: false,
    scale: 'css',
    animations: 'disabled',
  });
  const { size } = await stat(path.join(artifacts, file));
  assert(size < 1024 * 1024, `${file} should stay below 1 MiB; received ${size} bytes`);
  const entry = {
    file,
    bytes: size,
    phase: await page.locator('body').getAttribute('data-phase'),
    developerOverlay: await page.evaluate(() => Boolean(window.__chaseDev)),
    practice: (await page.locator('#game').getAttribute('data-practice')) === 'true',
  };
  const previous = screenshots.findIndex((item) => item.file === file);
  if (previous === -1) screenshots.push(entry);
  else screenshots[previous] = entry;
}

async function tap(page, selector) {
  const locator = page.locator(selector).filter({ visible: true }).first();
  assert(await locator.count(), `Missing visible control: ${selector}`);
  await locator.tap();
}

async function swipe(page, direction, { cancel = false, secondTouch = false } = {}) {
  const box = await page.locator('#scene').boundingBox();
  assert(box && box.height > 100 && box.width > 100, 'The game canvas is visible and touchable.');
  const x = box.x + box.width * 0.5;
  const y = box.y + box.height * 0.58;
  const vectors = { left: [-85, 0], right: [85, 0], jump: [0, -85], slide: [0, 85] };
  const [dx, dy] = vectors[direction];
  const session = await page.context().newCDPSession(page);
  const point = (id, px, py) => ({ id, x: px, y: py, radiusX: 4, radiusY: 4, force: 1 });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point(1, x, y)],
  });
  if (secondTouch) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [point(1, x, y), point(2, x + 20, y + 20)],
    });
  }
  if (!secondTouch) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [point(1, x + dx * (cancel ? 0.1 : 1), y + dy * (cancel ? 0.1 : 1))],
    });
  }
  await session.send('Input.dispatchTouchEvent', {
    type: cancel || secondTouch ? 'touchCancel' : 'touchEnd',
    touchPoints: [],
  });
  await session.detach();
}

async function snapshot(page) {
  return page.evaluate(() => window.__chaseDev.snapshot());
}

async function step(page, seconds) {
  return page.evaluate((value) => window.__chaseDev.step(value), seconds);
}

async function advanceToWorld(page, target) {
  return page.evaluate((world) => {
    const dev = window.__chaseDev;
    let state = dev.snapshot();
    for (let i = 0; i < 5000 && state.phase === 'running' && state.world < world - 1e-7; i++) {
      // Maximum speed makes each step conservative even at an effect boundary.
      dev.step(Math.min(0.2, (world - state.world) / (state.level.speed * 1.2)));
      state = dev.snapshot();
    }
    if (state.phase === 'running' && state.world < world - 1e-6)
      throw new Error(`Clock did not reach ${world}: ${state.world}`);
    return state;
  }, target);
}

async function chooseLane(page, lane) {
  let state = await snapshot(page);
  for (let i = 0; i < 3 && state.lane !== lane; i++) {
    await tap(page, `button[data-action="${state.lane < lane ? 'right' : 'left'}"]`);
    state = await snapshot(page);
  }
  assert.equal(state.lane, lane);
}

async function finishSafely(page) {
  let state = await snapshot(page);
  for (let i = 0; i < 20 && state.phase === 'running'; i++) {
    const wave = state.level.waves.find((item) => !state.clearedWaveIds.includes(item.id));
    if (!wave) {
      await step(page, state.remaining + 0.1);
      break;
    }
    const clearLane = [0, 1, 2].find((lane) => !wave.obstacles.some((item) => item.lane === lane));
    await chooseLane(page, clearLane);
    state = await advanceToWorld(page, wave.at + 0.02);
  }
  await phase(page, 'won');
  return snapshot(page);
}

async function hidden(page, value) {
  await page.evaluate((isHidden) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => isHidden });
    document.dispatchEvent(new Event('visibilitychange'));
  }, value);
}

async function assertLayout(page) {
  const layout = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('button')].filter((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      targets: controls.map((element) => {
        const box = element.getBoundingClientRect();
        return {
          name: element.getAttribute('aria-label') || element.textContent.trim(),
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
        };
      }),
    };
  });
  assert(layout.documentWidth <= layout.width + 1, 'Mobile screen must not overflow horizontally.');
  for (const control of layout.targets) {
    assert(
      control.width >= 43 && control.height >= 43,
      `Small touch target: ${JSON.stringify(control)}`,
    );
    assert(
      control.x >= -1 && control.x + control.width <= layout.width + 1,
      `Clipped horizontal control: ${control.name}`,
    );
    assert(
      control.y >= -1 && control.y + control.height <= layout.height + 1,
      `Clipped vertical control: ${control.name}`,
    );
  }
}

async function verifyNavigation(base) {
  const { context, page } = await makePage();
  await page.goto(base);
  await phase(page, 'home');
  assert.equal(
    await page.evaluate(() => typeof window.__chaseDev),
    'undefined',
    'Normal builds hide the debug API.',
  );
  await assertLayout(page);
  await screenshot(page, 'home');
  for (const [selector, name] of [
    ['#choose-levels', 'levels'],
    ['#help', 'help'],
    ['#settings-open', 'settings'],
  ]) {
    await tap(page, selector);
    await phase(page, name);
    await assertLayout(page);
    if (name === 'levels') await screenshot(page, 'levels');
    if (name === 'settings') {
      await tap(page, '#sound');
      await tap(page, '#haptics');
      assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'false');
      assert.equal(await page.locator('#haptics').getAttribute('aria-pressed'), 'false');
    }
    await tap(page, '[data-back]');
    await phase(page, 'home');
  }
  await tap(page, '#start');
  await phase(page, 'running');
  await page.locator('#game[data-ready="true"]').waitFor();
  await assertLayout(page);
  await screenshot(page, 'play');
  await tap(page, '#pause');
  await phase(page, 'paused');
  await tap(page, '#pause-home');
  await phase(page, 'home');
  await page.reload();
  await phase(page, 'home');
  await tap(page, '#settings-open');
  await phase(page, 'settings');
  assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#haptics').getAttribute('aria-pressed'), 'false');
  await tap(page, '[data-back]');
  checks.push(
    'Production home, levels, help, settings, play, pause, and home navigation work through touch.',
  );
  checks.push('Sound and haptics preferences persist across reload.');
  await context.close();
}

async function verifyTouchAndLifecycle(base) {
  const { context, page } = await makePage();
  await page.goto(`${base}/?dev=1`);
  await phase(page, 'home');
  await page.waitForFunction(() => typeof window.__chaseDev?.snapshot === 'function');
  await tap(page, '#start');
  await phase(page, 'running');
  await page.locator('#game[data-ready="true"]').waitFor();
  // Root's deterministic hook is filled in alongside the UI contract.
  try {
    await verifyCore(page);
  } finally {
    inputEvents.push(...(await page.evaluate(() => window.chaseInputEvents)));
    await context.close();
  }
}

async function verifyCore(page) {
  await page.evaluate(() => window.__chaseDev.manual(true));
  await tap(page, 'button[data-action="left"]');
  assert.equal((await snapshot(page)).lane, 0, 'One touch moves from the middle to the left lane.');
  await tap(page, 'button[data-action="right"]');
  assert.equal((await snapshot(page)).lane, 1, 'One touch returns exactly to the middle lane.');
  for (const pointerType of ['touch', 'mouse', 'pen']) {
    for (const detail of [0, 1]) {
      await page.locator('button[data-action="right"]').evaluate(
        (button, init) => {
          button.dispatchEvent(new PointerEvent('click', { ...init, bubbles: true }));
        },
        { pointerType, detail },
      );
      assert.equal(
        (await snapshot(page)).lane,
        1,
        `${pointerType} compatibility click must not repeat a handled pointer action (detail=${detail}).`,
      );
    }
  }
  await tap(page, '#pause');
  await phase(page, 'paused');
  // A menu transition can retarget a pointer's compatibility click to a new control.
  await page
    .locator('#resume')
    .evaluate((button) =>
      button.dispatchEvent(
        new PointerEvent('click', { pointerType: 'touch', detail: 0, bubbles: true }),
      ),
    );
  await phase(page, 'paused');
  await page.locator('#resume').focus();
  await page.keyboard.press('Enter');
  await phase(page, 'running');
  await page.locator('button[data-action="left"]').focus();
  await page.keyboard.press('Space');
  assert.equal((await snapshot(page)).lane, 0, 'Space activates a focused button once.');
  await page.locator('button[data-action="right"]').focus();
  await page.keyboard.press('Enter');
  assert.equal((await snapshot(page)).lane, 1, 'Enter activates a focused button once.');
  await page.locator('button[data-action="left"]').evaluate((button) => button.click());
  assert.equal(
    (await snapshot(page)).lane,
    0,
    'Pointer-free accessible click still activates the button.',
  );
  await page.keyboard.press('ArrowRight');
  assert.equal((await snapshot(page)).lane, 1, 'The movement keyboard shortcut remains available.');
  checks.push(
    'Handled pointer clicks do not repeat lane changes or activate a replacement menu control; Space, Enter, accessible click, and arrow keys remain functional.',
  );
  await swipe(page, 'left');
  assert.equal((await snapshot(page)).lane, 0);
  await swipe(page, 'right');
  assert.equal((await snapshot(page)).lane, 1);
  await swipe(page, 'jump');
  assert.equal((await snapshot(page)).action, 'jump');
  await step(page, 1.2);
  await swipe(page, 'slide');
  assert.equal((await snapshot(page)).action, 'slide');
  await step(page, 1.1);
  await tap(page, 'button[data-action="left"]');
  assert.equal((await snapshot(page)).lane, 0);
  await tap(page, 'button[data-action="right"]');
  assert.equal((await snapshot(page)).lane, 1);
  await tap(page, 'button[data-action="jump"]');
  assert.equal((await snapshot(page)).action, 'jump');
  await step(page, 1.2);
  await tap(page, 'button[data-action="slide"]');
  assert.equal((await snapshot(page)).action, 'slide');
  await step(page, 1.1);
  const beforeCancel = await snapshot(page);
  await swipe(page, 'left', { cancel: true });
  await swipe(page, 'right', { secondTouch: true });
  assert.equal((await snapshot(page)).lane, beforeCancel.lane);
  assert.equal((await snapshot(page)).action, beforeCancel.action);
  await swipe(page, 'right');
  assert.equal((await snapshot(page)).lane, 2, 'The next gesture works after cancel.');
  await swipe(page, 'left');
  assert.equal((await snapshot(page)).lane, beforeCancel.lane);
  checks.push(
    'All four canvas swipes and four touch controls work; cancellation and canceled multi-touch do not leave a stuck action.',
  );

  await tap(page, '#pause');
  await phase(page, 'paused');
  const paused = await snapshot(page);
  await step(page, 10);
  await delay(180);
  assert.equal((await snapshot(page)).elapsed, paused.elapsed);
  await swipe(page, 'left');
  assert.equal((await snapshot(page)).lane, paused.lane);
  await page.setViewportSize({ width: 844, height: 390 });
  assert.equal((await snapshot(page)).world, paused.world);
  await assertLayout(page);
  await tap(page, '#resume');
  await phase(page, 'running');
  await hidden(page, true);
  await phase(page, 'paused');
  await step(page, 10);
  assert.equal((await snapshot(page)).elapsed, paused.elapsed);
  await hidden(page, false);
  await phase(page, 'paused');
  await tap(page, '#resume');
  await phase(page, 'running');
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
  );
  await phase(page, 'paused');
  assert.equal((await snapshot(page)).elapsed, paused.elapsed);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await tap(page, '#pause-home');
  await phase(page, 'home');
  checks.push(
    'Pause, hidden-document, pagehide, and viewport rotation freeze the run without timer catch-up or resetting its position.',
  );

  // Manual clock changes mark this run as practice. Campaign progress is tested
  // separately using Playwright's browser clock and the normal animation loop.
  await tap(page, '#start');
  await phase(page, 'running');
  await page.evaluate(() => window.__chaseDev.manual(true));
  let state = await snapshot(page);
  const [first, second, third] = state.level.waves;
  await advanceToWorld(page, first.at - 3.2);
  await swipe(page, 'jump');
  await step(page, 0.15);
  await screenshot(page, 'play');
  await advanceToWorld(page, first.at + 0.02);
  state = await snapshot(page);
  assert.equal(state.collisions, 0);
  assert.equal(state.combo, 1);
  assert(state.distance < 12, 'A success visibly advances the chase.');
  await advanceToWorld(page, second.at - 3.2);
  await swipe(page, 'slide');
  await advanceToWorld(page, second.at + 0.02);
  assert.equal((await snapshot(page)).combo, 2);
  await advanceToWorld(page, third.at - 3.2);
  await swipe(page, 'left');
  await advanceToWorld(page, third.at + 0.02);
  state = await snapshot(page);
  assert.equal(state.collisions, 0);
  assert.equal(state.combo, 0);
  assert(state.boostRemaining > 1.9, 'The third success starts a two-second burst.');
  const beforeBoost = state.distance;
  await step(page, 1.7);
  assert((await snapshot(page)).distance < beforeBoost - 1, 'Burst visibly closes distance.');
  await screenshot(page, 'boost');
  const won = await finishSafely(page);
  assert(won.distance <= 1.5 && won.elapsed < 60 && won.collisions === 0);
  await assertLayout(page);
  checks.push(
    'Jump, slide, and lane change clear the opening three waves, trigger a visible burst, and end in automatic capture.',
  );
  await tap(page, '#result-home');
  await phase(page, 'home');
  await tap(page, '#choose-levels');
  await phase(page, 'levels');
  assert.equal(
    await page.locator('[data-level="market"]').isDisabled(),
    true,
    'Practice capture must not unlock the campaign.',
  );
  await tap(page, '[data-back]');
  const storedBeforePractice = await page.evaluate(() =>
    JSON.stringify(Object.entries(localStorage).sort()),
  );
  await page.evaluate(() => {
    window.__chaseDev.start('market');
    window.__chaseDev.manual(true);
  });
  await finishSafely(page);
  assert.equal(
    await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort())),
    storedBeforePractice,
  );
  await tap(page, '#result-home');
  await phase(page, 'home');
  checks.push(
    'Developer/manual-clock victories remain practice and never unlock a level or modify campaign storage.',
  );

  await page.evaluate(() => {
    window.__chaseDev.start('old-town');
    window.__chaseDev.manual(true);
  });
  await phase(page, 'running');
  for (let i = 0; i < 3; i++) {
    state = await snapshot(page);
    const wave = state.level.waves.find((item) => !state.clearedWaveIds.includes(item.id));
    await chooseLane(page, wave.obstacles[0].lane);
    const before = state.distance;
    await advanceToWorld(page, wave.at + 0.02);
    state = await snapshot(page);
    assert.equal(state.collisions, i + 1);
    assert.equal(state.combo, 0);
    assert(state.distance > before + 2.4, 'A collision visibly opens the chase gap.');
  }
  await phase(page, 'lost');
  await assertLayout(page);
  await screenshot(page, 'loss');
  await tap(page, '#retry');
  await phase(page, 'running');
  state = await snapshot(page);
  assert.equal(state.collisions, 0);
  assert.equal(state.distance, 12);
  assert.equal(state.levelId, 'old-town');
  await tap(page, '#pause');
  await tap(page, '#pause-home');
  await phase(page, 'home');
  checks.push(
    'Three real obstacle collisions slow the player, increase distance, clear the streak, and lose; free retry resets the same level.',
  );

  await page.evaluate(() => {
    window.__chaseDev.start('old-town');
    window.__chaseDev.manual(true);
  });
  const waveCount = (await snapshot(page)).level.waves.length;
  for (let i = 0; i < waveCount; i++) {
    state = await snapshot(page);
    const wave = state.level.waves.find((item) => !state.clearedWaveIds.includes(item.id));
    // Spaced mistakes break two different streaks. Unlike two opening mistakes,
    // this valid route leaves too little chase progress to catch before time.
    const lane =
      i === 0 || i === 8
        ? wave.obstacles[0].lane
        : [0, 1, 2].find((value) => !wave.obstacles.some((item) => item.lane === value));
    await chooseLane(page, lane);
    await advanceToWorld(page, wave.at + 0.02);
  }
  state = await snapshot(page);
  assert.equal(state.phase, 'running');
  assert.equal(state.collisions, 2);
  await step(page, state.remaining + 0.1);
  await phase(page, 'lost');
  state = await snapshot(page);
  assert.equal(state.elapsed, 60);
  assert.equal(state.collisions, 2);
  assert(state.distance > 1.5);
  assert.match(await page.locator('#result-title').textContent(), /时间到了/);
  await tap(page, '#result-home');
  await phase(page, 'home');
  checks.push(
    'After two collisions and otherwise safe play, the sixty-second deadline produces a timeout loss.',
  );

  await page.evaluate(() => {
    window.__chaseDev.start('old-town');
    window.__chaseDev.manual(true);
  });
  for (let i = 0; i < 2; i++) {
    state = await snapshot(page);
    const wave = state.level.waves.find((item) => !state.clearedWaveIds.includes(item.id));
    await chooseLane(page, wave.obstacles[0].lane);
    await advanceToWorld(page, wave.at + 0.02);
  }
  const recovered = await finishSafely(page);
  assert.equal(recovered.collisions, 2);
  assert(recovered.elapsed < 60);
  await tap(page, '#result-home');
  await phase(page, 'home');
  checks.push(
    'Two opening collisions can be recovered through fifteen clean waves and capture before the deadline.',
  );
}

async function advanceBrowserToWorld(page, target) {
  let state = await snapshot(page);
  for (let i = 0; i < 300 && state.phase === 'running' && state.world < target; i++) {
    // runFor fires every RAF callback. No developer method controls simulation
    // or edits a result in this normal, campaign-eligible run.
    const speed =
      state.level.speed * (state.slowRemaining > 0 ? 0.55 : state.boostRemaining > 0 ? 1.2 : 1);
    const milliseconds = Math.max(
      16,
      Math.min(1000, Math.ceil(((target - state.world) / speed) * 1000)),
    );
    await page.clock.runFor(milliseconds);
    state = await snapshot(page);
  }
  assert(
    state.phase !== 'running' || state.world >= target,
    `Browser RAF clock did not reach ${target}.`,
  );
  return state;
}

async function finishWithBrowserClock(page) {
  let state = await snapshot(page);
  for (let i = 0; i < 25 && state.phase === 'running'; i++) {
    const wave = state.level.waves.find((item) => !state.clearedWaveIds.includes(item.id));
    assert(wave, 'A no-collision chase must capture before the authored waves run out.');
    const lane = [0, 1, 2].find((value) => !wave.obstacles.some((item) => item.lane === value));
    await chooseLane(page, lane);
    state = await advanceBrowserToWorld(page, wave.at + 0.2);
  }
  if (state.phase === 'won') await page.clock.runFor(900);
  await phase(page, 'won');
  assert.equal(state.collisions, 0);
  assert(state.distance <= 1.5 && state.elapsed < 60);
  return state;
}

async function verifyCampaign(base) {
  const { context, page } = await makePage();
  const startTime = new Date('2026-10-06T12:00:00Z');
  await page.clock.install({ time: startTime });
  await page.goto(`${base}/?dev=1`);
  await phase(page, 'home');
  await page.clock.pauseAt(new Date(startTime.getTime() + 10_000));
  await tap(page, '#choose-levels');
  await phase(page, 'levels');
  assert.equal(await page.locator('[data-level="market"]').isDisabled(), true);
  await tap(page, '[data-back]');
  await tap(page, '#start');
  await phase(page, 'running');
  let state = await snapshot(page);
  await page.clock.runFor(1000);
  await tap(page, '#pause');
  await phase(page, 'paused');
  const pausedElapsed = (await snapshot(page)).elapsed;
  await page.clock.runFor(10_000);
  assert.equal((await snapshot(page)).elapsed, pausedElapsed);
  await tap(page, '#resume');
  await phase(page, 'running');
  await page.clock.runFor(500);
  const resumedElapsed = (await snapshot(page)).elapsed;
  assert(resumedElapsed > pausedElapsed + 0.4 && resumedElapsed < pausedElapsed + 0.6);
  await hidden(page, true);
  await phase(page, 'paused');
  await page.clock.runFor(10_000);
  assert.equal((await snapshot(page)).elapsed, resumedElapsed);
  await hidden(page, false);
  await phase(page, 'paused');
  await tap(page, '#resume');
  await phase(page, 'running');
  state = await snapshot(page);
  checks.push(
    'The normal animation loop freezes during pause and background simulation, then resumes without accumulated time.',
  );
  await finishWithBrowserClock(page);
  await screenshot(page, 'win');
  await tap(page, '#next');
  await phase(page, 'running');
  assert.equal((await snapshot(page)).levelId, 'market');
  await finishWithBrowserClock(page);
  await tap(page, '#next');
  await phase(page, 'running');
  assert.equal((await snapshot(page)).levelId, 'canal');
  await finishWithBrowserClock(page);
  assert.equal(
    await page.locator('#next').isVisible(),
    false,
    'Final capture offers no nonexistent fourth street.',
  );
  await tap(page, '#result-home');
  await phase(page, 'home');
  await tap(page, '#choose-levels');
  await phase(page, 'levels');
  assert.equal(
    await page.locator('[data-level="market"]').isDisabled(),
    false,
    'Winning unlocks the next authored level.',
  );
  await page.reload();
  await phase(page, 'home');
  await tap(page, '#choose-levels');
  await phase(page, 'levels');
  assert.equal(
    await page.locator('[data-level="market"]').isDisabled(),
    false,
    'Unlocked progress survives reload.',
  );
  assert.equal(await page.locator('[data-level="canal"]').isDisabled(), false);
  await tap(page, '[data-back]');
  checks.push(
    'All three sixty-second levels can be captured through normal RAF play; victories unlock the next street and campaign progress survives reload.',
  );
  await context.close();
}

async function verifyDegradedEnvironment(base) {
  const { context, page } = await makePage({ width: 360, height: 640 }, () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('Storage blocked', 'SecurityError');
      },
    });
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new DOMException('Denied', 'NotAllowedError'));
  });
  await page.goto(`${base}/?dev=0`);
  await phase(page, 'home');
  assert.equal(await page.evaluate(() => typeof window.__chaseDev), 'undefined');
  await tap(page, '#settings-open');
  await phase(page, 'settings');
  await tap(page, '#sound');
  await tap(page, '#haptics');
  assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'false');
  await tap(page, '[data-game-fullscreen]');
  await page.waitForFunction(() => !document.querySelector('#game-display-notice')?.hidden);
  assert.match(await page.locator('#game-display-notice').textContent(), /正常游玩|游戏可以继续/);
  await tap(page, '[data-back]');
  await tap(page, '#start');
  await phase(page, 'running');
  await assertLayout(page);
  await swipe(page, 'left');
  assert.equal(await page.locator('#game').getAttribute('data-lane'), '0');
  await tap(page, '#pause');
  await tap(page, '#pause-home');
  await page.setViewportSize({ width: 844, height: 390 });
  await assertLayout(page);
  await tap(page, '#start');
  await phase(page, 'running');
  await assertLayout(page);
  await swipe(page, 'right');
  assert.equal(await page.locator('#game').getAttribute('data-lane'), '2');
  checks.push(
    'Blocked localStorage and rejected fullscreen degrade to playable 360 × 640 and 844 × 390 touch layouts.',
  );
  await context.close();
}

try {
  await mkdir(artifacts, { recursive: true });
  await runNode(['build.mjs']);
  const base = await launchServer();
  browser = await loadChromium();
  await verifyNavigation(base);
  await verifyTouchAndLifecycle(base);
  await verifyCampaign(base);
  await verifyDegradedEnvironment(base);
  assert.deepEqual(errors, [], 'No runtime or asset loading errors.');
} catch (error) {
  failure = error;
} finally {
  const report = {
    status: failure ? 'failed' : 'passed',
    generatedAt: new Date().toISOString(),
    browser: browser ? `Chromium ${browser.version()}` : 'not started',
    viewports: ['390 × 844', '360 × 640', '844 × 390'],
    input: 'Mobile touch emulation; canvas swipes use CDP touch events, controls use touch taps.',
    build: 'Production dist artifact served by server.mjs --dist on an ephemeral local port.',
    limitations:
      'Desktop Chromium emulation; visibility events are simulated. No physical device or native mini-game platform tested.',
    checks,
    screenshots,
    inputEvents,
    errors,
    ...(failure ? { failure: failure.stack } : {}),
  };
  await browser?.close();
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await once(server, 'exit');
  }
  await writeFile(path.join(artifacts, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
if (failure) throw failure;
