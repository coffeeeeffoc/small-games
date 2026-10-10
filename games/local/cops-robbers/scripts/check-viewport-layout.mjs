import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { levels } from '../src/levels.js';
import { solutions } from '../src/solutions.js';
import { initialState, step } from '../src/engine.js';
import copsRules from '../../../../services/runtime-api/rules/cops.mjs';

// Check the actual game DOM and shared competition UI before any action can
// scroll a target into view. The HTTP fixture only replaces API responses and
// Vite's CSS-as-a-string loader; it never supplies replacement UI or CSS.
const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(gameRoot, '../../..');
const output = resolve(process.env.VIEWPORT_OUTPUT_DIR || resolve(gameRoot, 'outputs/viewport-layout'));
const viewports = [[320, 568], [360, 640], [390, 844], [667, 375], [844, 390], [1440, 900]];
const selectedViewports = process.env.VIEWPORT_SIZES
  ? viewports.filter(([width, height]) => process.env.VIEWPORT_SIZES.split(',').includes(`${width}x${height}`))
  : viewports;
assert.ok(selectedViewports.length, 'VIEWPORT_SIZES must select at least one supported viewport');
const onlyCases = process.env.VIEWPORT_CASES?.split(',');
const report = {
  started: new Date().toISOString(), passed: false, physicalMobile: false,
  fixture: 'Actual game HTML/CSS, shared competition client/UI and game renderer; mocked API responses validated with real server rules',
  viewports: selectedViewports, checks: [],
};
await mkdir(output, { recursive: true });

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const shared = pathname.startsWith('/platforms/') || pathname.startsWith('/games/');
    const root = shared ? repositoryRoot : gameRoot;
    const filename = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    const local = relative(root, filename);
    if (local.startsWith(`..${sep}`) || local === '..' || !types[extname(filename)] || /(?:^|\/)node_modules(?:\/|$)/.test(local)) {
      response.writeHead(404).end(); return;
    }
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', types[extname(filename)]);
    let contents = await readFile(filename);
    if (pathname === '/platforms/competition/h5.js' || pathname === '/platforms/competition/street-pages.js') {
      const cssName = pathname.endsWith('/h5.js') ? 'h5.css' : 'street.css';
      const css = await readFile(resolve(repositoryRoot, 'platforms/competition', cssName), 'utf8');
      contents = contents.toString().replace(`import styles from './${cssName}?inline';`, `const styles = ${JSON.stringify(css)};`);
    }
    response.end(contents);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const fixtureOrigin = `http://127.0.0.1:${server.address().port}`;
const base = (process.env.BASE_URL || fixtureOrigin).replace(/\/$/, '');
report.base = base;
const apiBase = `${fixtureOrigin}/__viewport_api`;

function serviceFixture() {
  const profile = { playerId: 'viewport-player-a', name: '巡逻队员甲' };
  const top = Array.from({ length: 35 }, (_, index) => ({
    playerId: index ? `viewport-player-${index}` : profile.playerId,
    name: index ? `街区巡逻队员 ${index + 1}` : profile.name,
    rank: index + 1, score: 105 - index * 3, secondary: 0,
  }));
  const board = {
    title: copsRules.title, version: copsRules.version, description: copsRules.description,
    roles: copsRules.roles, modes: copsRules.modes, eligiblePlayers: top.length,
    me: top[0], top, gap: null,
  };
  const fixture = {
    calls: [], roomStatus: 'waiting', failBoard: false, failJoin: false, failName: false,
    mode: 'escape', role: 'pursuer', initiative: 'random', authoritative: null, seq: 0,
  };
  fixture.view = () => {
    fixture.authoritative ||= copsRules.initial(0, fixture.mode, fixture.initiative === 'runner' ? 'runner' : 'pursuer');
    return copsRules.view(fixture.authoritative, fixture.role === 'runner' ? 1 : 0);
  };
  function room(joined = false) {
    return {
      game: copsRules.id, version: copsRules.version, code: 'ABCDEF123456',
      roles: copsRules.roles, mode: fixture.mode, initiative: fixture.initiative,
      status: fixture.roomStatus, you: 0, seq: fixture.seq, serverNow: Date.now(),
      deadline: Date.now() + copsRules.durationMs, pollMs: 60000,
      players: [
        { id: profile.playerId, name: profile.name, ready: false, role: fixture.role },
        ...(joined || fixture.roomStatus === 'finished'
          ? [{ id: 'viewport-player-b', name: '巡逻队员乙', ready: false, role: fixture.role === 'pursuer' ? 'runner' : 'pursuer' }]
          : []),
      ],
      state: fixture.view(),
      results: fixture.roomStatus === 'finished' ? [
        { playerId: profile.playerId, result: { eligible: true, score: 3, secondary: 0 }, before: board, after: board },
        { playerId: 'viewport-player-b', result: { eligible: true, score: 0, secondary: 0 }, before: board, after: { ...board, me: { ...top[1], playerId: 'viewport-player-b' } } },
      ] : [],
    };
  }
  fixture.handle = async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname.replace('/__viewport_api', '');
    const body = request.postDataJSON() || {};
    fixture.calls.push({ path: pathname, method: request.method(), body });
    let status = 200, data;
    if (request.method() === 'OPTIONS') data = {};
    else if (pathname === '/sessions/guest') data = { token: 'viewport-fixture-token', expiresAt: Date.now() + 3600000 };
    else if (pathname === '/me') {
      if (body.name && fixture.failName) { status = 400; data = { error: 'INVALID_INPUT' }; }
      else { if (body.name) profile.name = body.name; data = profile; }
    } else if (pathname.startsWith('/boards/')) {
      if (fixture.failBoard) { status = 503; data = { error: 'SERVICE_UNAVAILABLE' }; }
      else data = board;
    } else if (pathname.endsWith('/leave')) data = { left: true };
    else if (pathname === '/rooms/join') {
      if (fixture.failJoin) { status = 404; data = { error: 'INVITATION_NOT_FOUND' }; }
      else data = room(true);
    } else if (pathname === '/rooms') {
      fixture.mode = body.mode || 'escape'; fixture.role = body.role || 'pursuer'; fixture.initiative = body.initiative || 'random';
      fixture.authoritative = null; fixture.seq = 0;
      data = room();
    } else if (pathname.endsWith('/actions')) {
      try {
        fixture.view();
        if (body.seq !== fixture.seq + 1) throw new Error('Unexpected sequence');
        fixture.authoritative = copsRules.action(fixture.authoritative, body.action, fixture.authoritative.elapsedMs + 1000, fixture.role === 'runner' ? 1 : 0);
        fixture.seq++;
        data = room();
      } catch {
        status = 400; data = { error: 'ILLEGAL_ACTION' };
      }
    } else if (pathname.startsWith('/rooms/')) data = room();
    else { status = 404; data = { error: 'INVALID_INPUT' }; }
    await route.fulfill({ status, contentType: 'application/json', headers: {
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    }, body: JSON.stringify(data) });
  };
  return fixture;
}

async function inspect(locator) {
  assert.equal(await locator.count(), 1, `Expected one element: ${locator}`);
  return locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const clipped = { left: Math.max(0, rect.left), top: Math.max(0, rect.top), right: Math.min(innerWidth, rect.right), bottom: Math.min(innerHeight, rect.bottom) };
    const scrollAncestors = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const parentStyle = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(parentStyle.overflowX)) {
        clipped.left = Math.max(clipped.left, bounds.left + parent.clientLeft);
        clipped.right = Math.min(clipped.right, bounds.left + parent.clientLeft + parent.clientWidth);
      }
      if (/(auto|scroll|hidden|clip)/.test(parentStyle.overflowY)) {
        clipped.top = Math.max(clipped.top, bounds.top + parent.clientTop);
        clipped.bottom = Math.min(clipped.bottom, bounds.top + parent.clientTop + parent.clientHeight);
      }
      if (parent.scrollHeight > parent.clientHeight + 1 && /auto|scroll/.test(parentStyle.overflowY)) {
        scrollAncestors.push({ tag: parent.tagName, id: parent.id, className: parent.className, scrollTop: parent.scrollTop });
      }
    }
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      text: (element.textContent || element.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 100),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom },
      clipped, x, y, hit: !!hit && (element === hit || element.contains(hit)),
      hitElement: hit ? `${hit.tagName}${hit.id ? '#' + hit.id : ''}` : null,
      displayed: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
      inert: !!element.closest('[inert]'), scrollAncestors,
    };
  });
}

async function inView(locator, { touchTarget = false, hit = true } = {}) {
  const metrics = await inspect(locator), { rect, clipped } = metrics;
  metrics.selector = locator.toString();
  assert.ok(metrics.displayed, `Element is hidden: ${JSON.stringify(metrics)}`);
  assert.ok(rect.x >= -1 && rect.y >= -1 && rect.right <= clipped.right + 1 && rect.bottom <= clipped.bottom + 1 && rect.x >= clipped.left - 1 && rect.y >= clipped.top - 1,
    `Element must be fully visible before scrolling: ${JSON.stringify(metrics)}`);
  assert.equal(metrics.inert, false, `Element is inert: ${JSON.stringify(metrics)}`);
  if (hit) assert.ok(metrics.hit, `Element centre is obstructed: ${JSON.stringify(metrics)}`);
  if (touchTarget) assert.ok(rect.width >= 43 && rect.height >= 43, `Entry must provide a 44px touch target: ${JSON.stringify(metrics)}`);
  return metrics;
}

async function tap(locator, { touchTarget = false } = {}) {
  const metrics = await inView(locator, { touchTarget });
  // Explicit screen coordinates prevent Playwright's locator action from
  // automatically scrolling a hidden footer into view and passing this test.
  await locator.page().touchscreen.tap(metrics.x, metrics.y);
}

async function documentFits(page) {
  const metrics = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight, scrollX, scrollY,
  }));
  assert.ok(metrics.scrollWidth <= metrics.width + 1 && metrics.scrollHeight <= metrics.height + 1,
    `The game document must fit its viewport: ${JSON.stringify(metrics)}`);
  assert.ok(Math.abs(metrics.scrollX) <= 1 && Math.abs(metrics.scrollY) <= 1,
    `Opening an entry must not scroll the document: ${JSON.stringify(metrics)}`);
  return metrics;
}

async function surfaceFits(page, selector) {
  await inView(page.locator(selector), { hit: false });
  const metrics = await page.locator(selector).evaluate(element => ({
    width: element.clientWidth, height: element.clientHeight,
    scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop, scrollLeft: element.scrollLeft,
    overflow: getComputedStyle(element).overflow,
  }));
  assert.ok(metrics.scrollWidth <= metrics.width + 1 && metrics.scrollHeight <= metrics.height + 1,
    `${selector} must keep scrolling inside its content area: ${JSON.stringify(metrics)}`);
  assert.ok(Math.abs(metrics.scrollTop) <= 1 && Math.abs(metrics.scrollLeft) <= 1,
    `${selector} must not scroll as a whole: ${JSON.stringify(metrics)}`);
  await documentFits(page);
  return metrics;
}

async function assertFixedAfterContentScroll(page, surface, fixedSelectors, { required = false } = {}) {
  const fixed = [];
  for (const selector of fixedSelectors) fixed.push({ selector, before: await inView(page.locator(selector)) });
  const scrollables = await page.locator(surface).evaluate((element, selectors) => {
    const fixedElements = selectors.map(selector => document.querySelector(selector));
    return [...element.querySelectorAll('*')].filter(candidate => {
      const style = getComputedStyle(candidate);
      return candidate.clientHeight > 0 && candidate.scrollHeight > candidate.clientHeight + 2
        && /auto|scroll/.test(style.overflowY) && !fixedElements.some(target => target && candidate.contains(target));
    }).map((candidate, index) => {
      candidate.setAttribute('data-viewport-scroll-area', String(index));
      return { index, tag: candidate.tagName, id: candidate.id, className: candidate.className, clientHeight: candidate.clientHeight, scrollHeight: candidate.scrollHeight };
    });
  }, fixedSelectors);
  if (required) assert.ok(scrollables.length, `${surface} needs an independently scrolling content area for long content`);
  for (const area of scrollables) {
    const locator = page.locator(`${surface} [data-viewport-scroll-area="${area.index}"]`);
    await locator.evaluate(element => { element.scrollTop = element.scrollHeight; });
    assert.ok(await locator.evaluate(element => element.scrollTop > 0), 'Long content must actually scroll');
    for (const { selector, before } of fixed) {
      const after = await inView(page.locator(selector));
      assert.ok(Math.abs(after.rect.y - before.rect.y) <= 1 && Math.abs(after.rect.bottom - before.rect.bottom) <= 1,
        `Title/action moved with long content: ${selector}`);
    }
    await surfaceFits(page, surface);
  }
  return scrollables;
}

async function load(page, query = '') {
  await page.goto(`${base}/?motion=reduce${query ? '&' + query : ''}`);
  assert.match(await page.title(), /围捕小队/, 'BASE_URL must point to the actual game entry');
  await page.locator('#home-start').waitFor({ state: query.includes('level=') ? 'hidden' : 'visible' });
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); });
}

async function closeStatic(page, id) {
  await tap(page.locator(`${id} .dialog-close`).last());
  await expect(page.locator(id)).not.toBeVisible();
}

async function replay(page, id, path) {
  await load(page, `level=${id}`);
  await page.waitForFunction(id => document.body.dataset.level === String(id) && document.body.dataset.phase === 'planning', id);
  let state = initialState(levels[id - 1]);
  for (const targets of path) {
    const cop = Math.max(0, targets.findIndex((node, index) => node !== state.cops[index]));
    await tap(page.locator(`#squad [data-cop="${cop}"]`));
    await tap(page.getByTestId(`node-${targets[cop]}`));
    state = step(levels[id - 1], state, targets).state;
    await page.waitForFunction(turn => Number(document.body.dataset.turn) === turn && ['planning', 'won', 'lost'].includes(document.body.dataset.phase), state.turn);
  }
}

let losingCase;
for (const map of levels) {
  let state = initialState(map), path = [];
  for (let turn = 0; turn < 20; turn++) {
    path.push([...state.cops]); state = step(map, state, state.cops).state;
    if (state.robbers.includes(-2)) { losingCase = { id: map.id, path }; break; }
    if (state.robbers.every(node => node === -1)) break;
  }
  if (losingCase) break;
}
assert.ok(losingCase, 'A real missed-exit loss is required to exercise populated result dialogs');

async function openCompetition(page) {
  if (!(await page.locator('.competition-dialog').count())) {
    await page.evaluate(async origin => {
      const [{ mountCompetition }, { createRenderer }] = await Promise.all([
        import(`${origin}/platforms/competition/h5.js`), import(`${origin}/src/competition-renderer.js`),
      ]);
      mountCompetition('cops-robbers', options => {
        const renderer = createRenderer(options), originalDraw = renderer.draw;
        renderer.draw = function (...args) {
          const hits = originalDraw.apply(renderer, args);
          globalThis.__viewportCompetitionHits = hits;
          globalThis.__viewportCompetitionDimensions = { width: args[1], height: args[2] };
          globalThis.__viewportCompetitionState = args[3];
          return hits;
        };
        return renderer;
      });
    }, fixtureOrigin);
  }
  await tap(page.locator('#friend-duel'), { touchTarget: true });
  await expect(page.locator('.competition-dialog')).toBeVisible();
  await expect(page.locator('[data-match-options]')).toBeVisible();
  await expect(page.locator('[data-match-mode] option')).toHaveCount(copsRules.modes.length);
  await expect(page.locator('[data-profile-name]')).toHaveText('巡逻队员甲');
}

const friendControls = ['[data-match-mode]', '[data-match-role]', '[data-match-initiative]', '[data-create]', '[data-code]', '[data-join]', '[data-close]'];
async function competitionLobbyFits(page) {
  const metrics = {};
  for (const selector of friendControls) metrics[selector] = await inView(page.locator(`.competition-dialog ${selector}`), { touchTarget: true });
  await inView(page.locator('.competition-dialog .pk-brand strong'));
  await inView(page.locator('.competition-dialog [data-status]'));
  await surfaceFits(page, '.competition-dialog');
  const content = await page.locator('.competition-dialog .pk-content').evaluate(element => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  assert.ok(content.scrollHeight <= content.clientHeight + 1, `Friend create/join entry must fit without scrolling: ${JSON.stringify(content)}`);
  return metrics;
}

async function competitionRoomFits(page) {
  await inView(page.locator('.competition-dialog [data-room-title]'));
  await inView(page.locator('.competition-dialog [data-room-code]'));
  for (const selector of ['[data-role="runner"]', '[data-room-initiative]', '[data-ready]', '[data-share]', '[data-close]']) {
    await inView(page.locator(`.competition-dialog ${selector}`), { touchTarget: true });
  }
  await surfaceFits(page, '.competition-dialog');
}

async function sheetFits(page, kind, extra = []) {
  const surface = `.competition-dialog .pk-sheet[data-kind="${kind}"]`;
  const heading = `${surface} .pk-sheet-head h2`, back = `${surface} [data-dismiss]`;
  await expect(page.locator(surface)).toBeVisible();
  await inView(page.locator(heading));
  await inView(page.locator(back), { touchTarget: true });
  for (const selector of extra) await inView(page.locator(selector), { touchTarget: true });
  await surfaceFits(page, surface);
  await surfaceFits(page, '.competition-dialog');
  return assertFixedAfterContentScroll(page, surface, [heading, back, ...extra], { required: kind === 'board' });
}

let browser;
try {
  const executablePath = process.env.BROWSER_EXECUTABLE || process.env.PLAYWRIGHT_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true });
  for (const [width, height] of selectedViewports) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, reducedMotion: 'reduce' });
    async function check(name, run) {
      if (onlyCases && !onlyCases.includes(name)) return;
      const page = await context.newPage(), fixture = serviceFixture(), errors = [];
      const result = { name, width, height, passed: false, screenshot: `${width}x${height}-${name}.png` };
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(apiUrl => {
        globalThis.__COMPETITION_CONFIG__ = { apiUrl, game: 'cops-robbers', platform: 'h5' };
        try {
          for (const key of ['competition-room:cops-robbers', 'cops-robbers-v3', 'cops-robbers-duel-v1', 'chase-role-appearance-v1']) localStorage.removeItem(key);
        } catch {}
      }, apiBase);
      await page.route(`${apiBase}/**`, fixture.handle);
      const capture = async (suffix = '') => {
        const filename = suffix ? `${width}x${height}-${name}-${suffix}.png` : result.screenshot;
        await page.screenshot({ path: resolve(output, filename), animations: 'disabled' });
        if (suffix) (result.additionalScreenshots ||= []).push(filename);
        else result.capturedBeforeDismissal = true;
      };
      try {
        await load(page);
        result.details = await run(page, fixture, capture);
        assert.deepEqual(errors, [], 'Browser runtime errors');
        result.passed = true;
        console.log(`PASS ${width}x${height} ${name}`);
      } catch (error) {
        result.error = error.message;
        result.runtimeErrors = errors;
        console.error(`FAIL ${width}x${height} ${name}: ${error.message}`);
      } finally {
        if (!result.capturedBeforeDismissal) await capture().catch(error => { result.screenshotError = error.message; });
        result.apiCalls = fixture.calls;
        report.checks.push(result);
        await writeFile(resolve(output, 'viewport-layout.json'), JSON.stringify(report, null, 2));
        await page.close();
      }
    }

    await check('home', async page => {
      const entries = ['#home-start', '#resume-patrol', '#appearance-settings', '#friend-duel', '#mode-settings', '#help', '#level-select', '#quick-start', '[data-game-fullscreen]', '#share-challenge', '#sound', '#settings'];
      const metrics = {};
      for (const selector of entries) metrics[selector] = await inView(page.locator(selector), { touchTarget: true });
      for (const entry of await page.locator('.home-roster button').all()) await inView(entry, { touchTarget: true });
      return { document: await documentFits(page), entries: metrics };
    });
    await check('help', async (page, _fixture, capture) => {
      await tap(page.locator('#help'));
      await surfaceFits(page, '#help-dialog');
      const scrollables = await assertFixedAfterContentScroll(page, '#help-dialog', ['#help-title', '#help-dialog .dialog-close']);
      await capture();
      await closeStatic(page, '#help-dialog');
      return { scrollables };
    });
    await check('settings', async page => {
      await tap(page.locator('#settings'));
      for (const selector of ['#settings-title', '#sound-setting', '#motion-setting', '#teaching-setting', '#settings-dialog .dialog-close']) await inView(page.locator(selector));
      await surfaceFits(page, '#settings-dialog');
      const scrollables = await assertFixedAfterContentScroll(page, '#settings-dialog', ['#settings-title', '#settings-dialog .dialog-close']);
      return { scrollables };
    });
    await check('mode', async page => {
      await tap(page.locator('#mode-settings'));
      for (const selector of ['#mode-title', '#solo-mode', '#start-mode', '#mode-dialog .dialog-close']) await inView(page.locator(selector));
      await surfaceFits(page, '#mode-dialog');
      await inView(page.locator('#solo-mode'), { touchTarget: true });
      await page.locator('#solo-mode').selectOption('escape');
      for (const selector of ['#solo-mode', '#solo-role', '#solo-initiative', '#solo-level', '#start-mode', '#mode-dialog .dialog-close']) await inView(page.locator(selector), { touchTarget: true });
      await surfaceFits(page, '#mode-dialog');
      const scrollables = await assertFixedAfterContentScroll(page, '#mode-dialog', ['#mode-title', '#start-mode', '#mode-dialog .dialog-close']);
      assert.equal(scrollables.length, 0, 'Short duel setup must fit without scrolling');
      return { scrollables };
    });
    await check('share', async page => {
      await tap(page.locator('#share-challenge'));
      for (const selector of ['#share-title', '#share-url', '#copy-share', '#share-dialog .dialog-close']) await inView(page.locator(selector));
      await surfaceFits(page, '#share-dialog');
      await tap(page.locator('#copy-share'), { touchTarget: true });
      await inView(page.locator('#share-note'));
      await surfaceFits(page, '#share-dialog');
      return assertFixedAfterContentScroll(page, '#share-dialog', ['#share-title', '#copy-share', '#share-dialog .dialog-close']);
    });
    await check('appearance', async (page, _fixture, capture) => {
      await tap(page.locator('#appearance-settings'));
      await expect(page.locator('[data-role-appearance]')).toBeVisible();
      const fixed = ['[data-role-appearance] h2', '[data-close-appearance]'];
      for (const selector of fixed) await inView(page.locator(selector));
      await surfaceFits(page, '[data-role-appearance]');
      const scrollables = await assertFixedAfterContentScroll(page, '[data-role-appearance]', fixed);
      await capture();
      await tap(page.locator('[data-close-appearance]'), { touchTarget: true });
      await expect(page.locator('[data-role-appearance]')).toHaveCount(0);
      return { scrollables };
    });
    await check('levels', async (page, _fixture, capture) => {
      await tap(page.locator('#home-start'));
      await surfaceFits(page, '#level-dialog');
      const fixed = ['#level-dialog-title', '#level-dialog .dialog-close', '#level-dialog .dialog-note'];
      const scrollables = await assertFixedAfterContentScroll(page, '#level-dialog', fixed);
      const last = page.locator('#level-grid [data-level]').last();
      await inView(last);
      await capture();
      await tap(page.locator('#level-dialog .dialog-close'), { touchTarget: true });
      await expect(page.locator('#level-dialog')).not.toBeVisible();
      return { scrollables };
    });
    await check('win', async (page, _fixture, capture) => {
      await replay(page, 1, solutions[1]);
      await expect(page.locator('#win-dialog')).toBeVisible();
      for (const selector of ['#win-title', '#win-details', '#next-level', '#replay', '#win-dialog .dialog-close']) await inView(page.locator(selector));
      await surfaceFits(page, '#win-dialog');
      await capture();
      await tap(page.locator('#replay'), { touchTarget: true });
      await expect(page.locator('body')).toHaveAttribute('data-phase', 'planning');
    });
    await check('loss', async (page, _fixture, capture) => {
      await replay(page, losingCase.id, losingCase.path);
      await expect(page.locator('#loss-dialog')).toBeVisible();
      for (const selector of ['#loss-title', '#loss-details', '#undo-loss', '#retry', '#loss-dialog .dialog-close']) await inView(page.locator(selector));
      await surfaceFits(page, '#loss-dialog');
      await capture();
      await tap(page.locator('#undo-loss'), { touchTarget: true });
      await expect(page.locator('body')).toHaveAttribute('data-phase', 'planning');
    });
    await check('friend-lobby', async page => {
      await openCompetition(page);
      return competitionLobbyFits(page);
    });
    await check('friend-create', async (page, fixture, capture) => {
      await openCompetition(page);
      await competitionLobbyFits(page);
      await page.locator('[data-match-mode]').selectOption('survival');
      await page.locator('[data-match-role]').selectOption('runner');
      await page.locator('[data-match-initiative]').selectOption('runner');
      await tap(page.locator('[data-create]'), { touchTarget: true });
      await expect(page.locator('[data-room]')).toBeVisible();
      assert.deepEqual(fixture.calls.find(call => call.path === '/rooms')?.body, { game: 'cops-robbers', mode: 'survival', role: 'runner', initiative: 'runner' });
      await competitionRoomFits(page);
      await capture();
      await tap(page.locator('.competition-dialog [data-close]'), { touchTarget: true });
      await expect(page.locator('.competition-dialog')).not.toBeVisible();
      await expect.poll(() => fixture.calls.some(call => call.path.endsWith('/leave'))).toBe(true);
    });
    await check('friend-join', async (page, fixture) => {
      await openCompetition(page);
      await competitionLobbyFits(page);
      await page.locator('[data-code]').fill('abcdef123456');
      await tap(page.locator('[data-join]'), { touchTarget: true });
      await expect(page.locator('[data-room-title]')).toHaveText('好友已就位');
      assert.deepEqual(fixture.calls.find(call => call.path === '/rooms/join')?.body, { code: 'ABCDEF123456', game: 'cops-robbers' });
      await competitionRoomFits(page);
    });
    await check('friend-rules', async (page, _fixture, capture) => {
      await openCompetition(page);
      await tap(page.locator('.competition-dialog [data-rules]'), { touchTarget: true });
      await expect(page.locator('.pk-rule-list li')).not.toHaveCount(0);
      const scrollables = await sheetFits(page, 'rules');
      await capture();
      await tap(page.locator('.pk-sheet[data-kind="rules"] [data-dismiss]'), { touchTarget: true });
      await competitionLobbyFits(page);
      return { scrollables };
    });
    await check('friend-board', async page => {
      await openCompetition(page);
      await tap(page.locator('.competition-dialog [data-board]'), { touchTarget: true });
      await expect(page.locator('.pk-rank-row')).toHaveCount(35);
      const scrollables = await sheetFits(page, 'board');
      await inView(page.locator('.pk-rank-row').last());
      return { scrollables };
    });
    await check('friend-profile-error', async (page, fixture) => {
      await openCompetition(page);
      await tap(page.locator('.competition-dialog [data-profile]'), { touchTarget: true });
      await expect(page.locator('.pk-profile-form')).toBeVisible();
      const save = '.pk-profile-form button[type="submit"]';
      await sheetFits(page, 'profile', [save]);
      fixture.failName = true;
      await inView(page.getByRole('textbox', { name: '你的昵称', exact: true }));
      await page.getByRole('textbox', { name: '你的昵称', exact: true }).fill('不符合规则');
      await tap(page.locator(save), { touchTarget: true });
      await expect(page.locator('.pk-form-message')).toContainText('请检查输入');
      await inView(page.locator('.pk-form-message'));
      return sheetFits(page, 'profile', [save]);
    });
    await check('friend-rules-error', async (page, fixture) => {
      await openCompetition(page);
      fixture.failBoard = true;
      await tap(page.locator('.competition-dialog [data-rules]'), { touchTarget: true });
      await expect(page.locator('.pk-sheet-content')).toContainText('全站服务暂不可用');
      return sheetFits(page, 'rules');
    });
    await check('friend-join-error', async (page, fixture) => {
      await openCompetition(page);
      fixture.failJoin = true;
      await inView(page.locator('[data-code]'), { touchTarget: true });
      await page.locator('[data-code]').fill('ABCDEF123456');
      await tap(page.locator('[data-join]'), { touchTarget: true });
      await expect(page.locator('.competition-dialog [data-status]')).toContainText('找不到这个邀请');
      return competitionLobbyFits(page);
    });
    await check('friend-result', async (page, fixture) => {
      await openCompetition(page);
      fixture.roomStatus = 'finished';
      await tap(page.locator('[data-create]'), { touchTarget: true });
      await expect(page.locator('.pk-sheet[data-kind="result"]')).toBeVisible();
      const actions = await page.locator('.pk-result-actions button').count();
      assert.equal(actions, 2, 'Results keep rematch and leaderboard actions');
      return sheetFits(page, 'result', ['.pk-result-actions button:first-child', '.pk-result-actions button:last-child']);
    });
    await check('friend-playing', async (page, fixture, capture) => {
      await openCompetition(page);
      await competitionLobbyFits(page);
      fixture.roomStatus = 'playing';
      await tap(page.locator('[data-create]'), { touchTarget: true });
      await expect(page.locator('.competition-dialog')).toHaveAttribute('data-playing', '');
      await expect(page.locator('.competition-dialog canvas[data-play]')).toBeVisible();
      const sizes = [{ width, height }, ...(width === 320 && height === 568 ? [{ width, height: 480 }] : []), ...(width === 667 && height === 375 ? [{ width, height: 320 }] : [])];
      const layouts = [];
      let wait;
      for (const size of sizes) {
        await page.setViewportSize(size);
        await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
        const canvas = await inView(page.locator('.competition-dialog canvas[data-play]'));
        const exit = await inView(page.locator('.competition-dialog [data-close]'), { touchTarget: true });
        const overlapWidth = Math.max(0, Math.min(canvas.rect.right, exit.rect.right) - Math.max(canvas.rect.x, exit.rect.x));
        const overlapHeight = Math.max(0, Math.min(canvas.rect.bottom, exit.rect.bottom) - Math.max(canvas.rect.y, exit.rect.y));
        assert.ok(overlapWidth <= 1 || overlapHeight <= 1, `Canvas and exit must not overlap: ${JSON.stringify({ canvas, exit })}`);
        await surfaceFits(page, '.competition-dialog');
        const rendered = await page.evaluate(async ({ origin, state }) => {
          const canvas = document.querySelector('.competition-dialog canvas[data-play]'), rect = canvas.getBoundingClientRect();
          if (globalThis.__viewportCompetitionHits && globalThis.__viewportCompetitionDimensions?.width === rect.width && globalThis.__viewportCompetitionDimensions?.height === rect.height) {
            return { hits: globalThis.__viewportCompetitionHits, dimensions: globalThis.__viewportCompetitionDimensions, state: globalThis.__viewportCompetitionState };
          }
          // An existing production mount owns its renderer. Draw the same real
          // renderer into an offscreen canvas to inspect its hit geometry while
          // the subsequent touch still goes through the production mount.
          const { createRenderer } = await import(`${origin}/src/competition-renderer.js`);
          const probe = document.createElement('canvas');
          probe.width = Math.ceil(rect.width); probe.height = Math.ceil(rect.height);
          const hits = createRenderer().draw(probe.getContext('2d'), rect.width, rect.height, state);
          return { hits, dimensions: { width: rect.width, height: rect.height }, state };
        }, { origin: fixtureOrigin, state: fixture.view() });
        wait = rendered.hits.find(hit => hit.label === '留守一步');
        assert.ok(wait, `Real renderer must offer the current player's wait action at ${size.width}x${size.height}`);
        assert.ok(wait.x >= -1 && wait.y >= -1 && wait.x + wait.w <= rendered.dimensions.width + 1 && wait.y + wait.h <= rendered.dimensions.height + 1,
          `The wait hit area must fit inside the real canvas at ${size.width}x${size.height}: ${JSON.stringify({ wait, dimensions: rendered.dimensions })}`);
        const x = canvas.rect.x + wait.x + wait.w / 2, y = canvas.rect.y + wait.y + wait.h / 2;
        assert.ok(await page.locator('.competition-dialog canvas[data-play]').evaluate((element, point) => document.elementFromPoint(point.x, point.y) === element, { x, y }), 'The real wait touch point must hit the canvas');
        layouts.push({ viewport: size, canvas, exit, wait, touch: { x, y }, turn: rendered.state.board.turn });
        await capture(`at-${size.width}x${size.height}`);
      }
      await capture();
      const before = fixture.view(), last = layouts.at(-1), expected = { type: 'move', side: before.role, actor: 0, target: before.role === 'runner' ? before.board.robbers[0] : before.board.cops[0] };
      await page.touchscreen.tap(last.touch.x, last.touch.y);
      await expect.poll(() => fixture.calls.filter(call => call.path.endsWith('/actions')).length).toBe(1);
      const request = fixture.calls.find(call => call.path.endsWith('/actions'));
      assert.deepEqual(request.body, { seq: 1, action: expected }, 'A real touch on wait must submit the legal current-player intent');
      assert.equal(fixture.authoritative.board.turn, before.board.turn + 1, 'The real server rule accepts and advances the touch action');
      await tap(page.locator('.competition-dialog [data-close]'), { touchTarget: true });
      await expect(page.locator('.competition-dialog')).not.toBeVisible();
      await expect.poll(() => fixture.calls.some(call => call.path.endsWith('/leave'))).toBe(true);
      return { layouts, submittedAction: request.body };
    });
    await context.close();
  }
  report.passed = report.checks.every(check => check.passed);
  report.finished = new Date().toISOString();
  report.summary = { passed: report.checks.filter(check => check.passed).length, failed: report.checks.filter(check => !check.passed).length };
  await writeFile(resolve(output, 'viewport-layout.json'), JSON.stringify(report, null, 2));
  console.log(`${report.passed ? 'PASS' : 'FAIL'} ${report.summary.passed}/${report.checks.length} viewport checks; screenshots and report: ${output}`);
  if (!report.passed) process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
