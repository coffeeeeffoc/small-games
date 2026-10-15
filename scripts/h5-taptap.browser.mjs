import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { appendFile, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { inventory } from '../apps/shell-minigame/scripts/taptap-package.mjs';
import { createRenderer as copsRenderer } from '../games/local/cops-robbers/src/competition-renderer.js';
import { chooseDuelAction, stepDuel } from '../games/local/cops-robbers/src/duel.js';
import { getDuelLevel } from '../games/local/cops-robbers/src/duel-levels.js';
import { createRenderer as streetRenderer } from '../games/local/cops-robbers-realtime/src/competition-renderer.js';
import { createRenderer as chessRenderer } from '../games/submodules/xiangqi-five/competition-renderer.js';

const root = fileURLToPath(new URL('../', import.meta.url));
assert(process.env.H5_MATRIX, 'Set H5_MATRIX to matrix.json or its directory');
let matrixFile = path.resolve(process.env.H5_MATRIX);
if ((await stat(matrixFile)).isDirectory()) matrixFile = path.join(matrixFile, 'matrix.json');
const directory = path.dirname(matrixFile);
const matrix = JSON.parse(await readFile(matrixFile, 'utf8'));
const output = path.join(directory, 'browser');
await mkdir(output, { recursive: true });
const runId = Date.now().toString();
const traceFile = path.join(output, `api-${runId}.ndjson`);
const origin = 'http://127.0.0.1:43810';
const api = 'http://127.0.0.1:43802/api/competition/v1';
const constructors = {
  'cops-robbers': copsRenderer,
  'cops-robbers-realtime': streetRenderer,
  'xiangqi-five': chessRenderer,
};
const roots = new Map();
const contexts = new Set();
const pending = new Set();
let traceWrites = Promise.resolve();
let browser;
let server;
const report = {
  startedAt: new Date().toISOString(),
  sourceSHA: matrix.sourceSHA,
  submoduleSHA: matrix.submoduleSHA,
  browser: null,
  api,
  origin,
  apiTrace: path.basename(traceFile),
  scope: 'Twelve H5 configurations, touch rewards and six real online touch matches',
  realAdsVerified: false,
  realDeviceVerified: false,
  notRun: [
    'Actual advertisement playback and completed/cancelled/failed/timeout host callbacks',
    'Runtime and PostgreSQL restart persistence',
  ],
  variants: [],
};

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      /token|authorization|password|secret/i.test(key) ? '[redacted]' : redact(item),
    ]),
  );
}
function trace(entry) {
  const line = JSON.stringify(redact({ at: new Date().toISOString(), ...entry })) + '\n';
  traceWrites = traceWrites.then(() => appendFile(traceFile, line));
}
function isApi(value) {
  const url = new URL(value);
  return url.origin === new URL(api).origin || url.pathname.startsWith('/api/');
}
function requestBody(request) {
  try {
    return request.postDataJSON();
  } catch {
    return request.postData();
  }
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const gameUrl = (variant) => `${origin}/v/${variant.name}/`;
async function until(predicate, label, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await predicate();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}
async function rendered(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}
function noopContext() {
  const target = {
    globalAlpha: 1,
    measureText: (text) => ({ width: String(text).length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy(target, { get: (object, key) => (key in object ? object[key] : () => {}) });
}

// These pure Node mirrors compute touch coordinates; they never replace page state or input.
function projected(game, state, width, height) {
  if (game !== 'cops-robbers-realtime') return state;
  const nodes = state.map.nodes;
  const extentX = Math.max(...nodes.map((p) => p.x)) - Math.min(...nodes.map((p) => p.x));
  const extentY = Math.max(...nodes.map((p) => p.y)) - Math.min(...nodes.map((p) => p.y));
  if (!(width < height && extentX > extentY)) return state;
  const point = (value) => (value ? { ...value, x: -value.y, y: value.x } : value);
  const actor = (value) => ({
    ...point(value),
    ...(value.routePoints ? { routePoints: value.routePoints.map(point) } : {}),
    ...(value.destination ? { destination: point(value.destination) } : {}),
    ...(value.gap
      ? { gap: { ...value.gap, from: point(value.gap.from), to: point(value.gap.to) } }
      : {}),
  });
  return {
    ...state,
    map: { ...state.map, nodes: nodes.map(point) },
    cops: state.cops.map(actor),
    robbers: state.robbers.map(actor),
    exits: state.exits.map(point),
  };
}
const samples = (hit) => [
  [hit.x + hit.w / 2, hit.y + hit.h / 2],
  [hit.x + hit.w * 0.25, hit.y + hit.h * 0.25],
  [hit.x + hit.w * 0.75, hit.y + hit.h * 0.25],
  [hit.x + hit.w * 0.25, hit.y + hit.h * 0.75],
  [hit.x + hit.w * 0.75, hit.y + hit.h * 0.75],
];
function sameAction(actual, wanted) {
  return (
    actual &&
    Object.entries(wanted).every(([key, value]) =>
      typeof value === 'number' ? Math.abs(actual[key] - value) < 0.000001 : actual[key] === value,
    )
  );
}
async function touchAction(player, wanted) {
  await rendered(player.page);
  const canvas = player.surface.locator('canvas[data-play]');
  await until(
    async () => player.room.status === 'finished' || (await canvas.isVisible()),
    'Playing canvas or authoritative settlement',
  );
  if (player.room.status === 'finished') return false;
  await canvas.scrollIntoViewIfNeeded();
  const dimensions = await canvas.evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight,
  }));
  assert(dimensions.width > 0 && dimensions.height > 0);
  const original = player.room.state;
  const state = projected(player.variant.game, original, dimensions.width, dimensions.height);
  const create = constructors[player.variant.game];
  const mirror = create();
  let hits = mirror.draw(noopContext(), dimensions.width, dimensions.height, state);
  let selection;
  if (player.variant.game === 'cops-robbers') {
    const hit = hits.find((item) => item.action?.local === wanted.actor);
    assert(hit, `Cannot select actor ${wanted.actor}`);
    selection = samples(hit)[0];
    assert.equal(mirror.tap(...selection, state), null);
    hits = mirror.draw(noopContext(), dimensions.width, dimensions.height, state);
  }
  let found;
  for (const hit of hits) {
    if (wanted.type === 'deploy-directly' && hit.index !== wanted.to) continue;
    for (const point of samples(hit)) {
      if (
        point[0] < 0 ||
        point[1] < 0 ||
        point[0] >= dimensions.width ||
        point[1] >= dimensions.height
      )
        continue;
      const probe = create();
      probe.draw(noopContext(), dimensions.width, dimensions.height, state);
      if (selection) {
        probe.tap(...selection, state);
        probe.draw(noopContext(), dimensions.width, dimensions.height, state);
      }
      if (sameAction(probe.tap(...point, state), wanted)) {
        found = point;
        break;
      }
    }
    if (found) break;
  }
  assert(found, `No visible touch point for ${JSON.stringify(wanted)}`);
  const tap = async ([x, y]) => {
    if (player.room.status === 'finished') return false;
    const box = await canvas.boundingBox();
    if (!box && player.room.status === 'finished') return false;
    assert(box, 'Canvas disappeared');
    const screenX = box.x + (x * box.width) / dimensions.width;
    const screenY = box.y + (y * box.height) / dimensions.height;
    const viewport = player.page.viewportSize();
    assert(
      screenX >= 0 && screenY >= 0 && screenX < viewport.width && screenY < viewport.height,
      `Touch point outside viewport: ${screenX},${screenY}`,
    );
    await player.page.touchscreen.tap(screenX, screenY);
    return true;
  };
  const previous = player.room.seq;
  if (selection) {
    if (!(await tap(selection))) return false;
    await rendered(player.page);
  }
  if (!(await tap(found))) return false;
  await until(
    () =>
      player.room.status === 'finished' ||
      (player.room.seq === previous + 1 && player.lastAction?.seq === previous + 1),
    `${player.variant.name}/${player.id} accepted touch action`,
  );
  if (player.room.status === 'finished') {
    const terminal = player.apiFailures.filter(
      (failure) =>
        failure.path === `/api/competition/v1/rooms/${player.room.code}/actions` &&
        failure.status === 409 &&
        ['MATCH_CLOSED', 'PLAYER_FINISHED'].includes(failure.body?.error),
    );
    if (terminal.length) {
      const confirmed = await player.page.evaluate(
        (code) => globalThis.__competition.request(`/rooms/${code}`),
        player.room.code,
      );
      assert.equal(
        confirmed.status,
        'finished',
        'A late input must be confirmed against the authoritative room',
      );
      player.terminalRejections.push(...terminal);
      player.apiFailures = player.apiFailures.filter((failure) => !terminal.includes(failure));
    }
    if (player.room.seq !== previous + 1 || player.lastAction?.seq !== previous + 1) return false;
  }
  const authoritative =
    state !== original && wanted.type === 'move'
      ? { ...wanted, x: wanted.y, y: -wanted.x }
      : wanted;
  assert(
    sameAction(player.lastAction.action, authoritative),
    'Touch must emit the planned legal action',
  );
  player.acceptedActions++;
  await rendered(player.page);
  return true;
}
async function screenshot(player, name) {
  await player.page.screenshot({
    path: path.join(output, `${player.variant.name}-${player.id}-${name}.png`),
    fullPage: false,
  });
}
async function newPlayer(variant, id) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  contexts.add(context);
  const page = await context.newPage();
  const player = {
    context,
    page,
    variant,
    id,
    room: null,
    profile: null,
    board: null,
    lastAction: null,
    requests: [],
    errors: [],
    apiFailures: [],
    terminalRejections: [],
    acceptedActions: 0,
    closing: false,
  };
  page.on('pageerror', (error) => player.errors.push(error.message));
  context.on('request', (request) => {
    if (!isApi(request.url())) return;
    const entry = { method: request.method(), path: new URL(request.url()).pathname };
    player.requests.push(entry);
    trace({
      variant: variant.name,
      player: id,
      kind: 'request',
      ...entry,
      body: requestBody(request),
    });
  });
  context.on('requestfailed', (request) => {
    if (!player.closing && isApi(request.url()))
      player.errors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
  });
  context.on('response', (response) => {
    if (!isApi(response.url())) return;
    const task = (async () => {
      const body = await response.json().catch(() => null);
      const pathname = new URL(response.url()).pathname;
      trace({
        variant: variant.name,
        player: id,
        kind: 'response',
        method: response.request().method(),
        path: pathname,
        status: response.status(),
        body,
      });
      if (!response.ok()) {
        if (!player.closing)
          player.apiFailures.push({ status: response.status(), path: pathname, body });
        return;
      }
      if (body?.code && Array.isArray(body.players)) {
        const previous = player.room;
        if (
          !previous ||
          previous.code !== body.code ||
          (body.seq >= previous.seq && body.serverNow >= previous.serverNow)
        )
          player.room = body;
      }
      if (pathname.endsWith('/actions') && response.request().method() === 'POST')
        player.lastAction = requestBody(response.request());
      if (pathname.endsWith('/me')) player.profile = body;
      if (pathname.includes('/boards/')) player.board = body;
    })().catch((error) => {
      if (!player.closing) player.errors.push(error.message);
    });
    pending.add(task);
    void task.finally(() => pending.delete(task));
  });
  await page.goto(gameUrl(variant), { waitUntil: 'networkidle' });
  await page.locator('body').waitFor({ state: 'visible' });
  await rendered(page);
  const config = await page.evaluate(() => ({
    service: globalThis.__COMPETITION_CONFIG__,
    ads: {
      enabled: globalThis.SmallGamesPublishingConfig?.adsEnabled,
      mode: globalThis.SmallGamesPublishingConfig?.adMode,
    },
    hasRealAdSdk: typeof globalThis.tap?.createRewardedVideoAd === 'function',
  }));
  assert.equal(config.service?.competitionEnabled, variant.serviceEnabled);
  assert.equal(config.service?.apiUrl, variant.serviceEnabled ? api : '');
  assert.equal(config.ads.enabled, variant.adsEnabled);
  assert.equal(config.ads.mode, variant.adsEnabled ? 'host' : 'off');
  if (variant.adsEnabled)
    assert.equal(config.hasRealAdSdk, false, 'This branch tests unavailable real host SDK only');
  player.config = config;
  await screenshot(player, 'home');
  return player;
}

async function streetSnapshot(player) {
  return player.page.evaluate(async () => {
    // Import the exact already-loaded module solely to use its read-only inspection port.
    const { getSnapshot } = await import(new URL('./src/main.js', location.href).href);
    return getSnapshot();
  });
}
async function rewardCheck(player) {
  const { page, variant } = player;
  let evidence;
  if (variant.game === 'cops-robbers') {
    await page.locator('#home-start').tap();
    await page.waitForFunction(() => document.body.dataset.phase === 'planning');
    const before = await page.locator('body').getAttribute('data-turn');
    assert.equal(await page.locator('.hint-circle').count(), 0);
    await page.locator('#hint').tap();
    if (variant.adsEnabled) {
      await until(
        async () =>
          /广告暂不可用|广告加载失败/.test(await page.locator('#instruction').textContent()),
        'Cops unavailable host feedback',
      );
      assert.equal(await page.locator('.hint-circle').count(), 0);
    } else await page.locator('.hint-circle').waitFor({ state: 'visible', timeout: 20000 });
    assert.equal(
      await page.locator('body').getAttribute('data-turn'),
      before,
      'Hint cannot consume a move',
    );
    evidence = {
      hintVisible: await page.locator('.hint-circle').count(),
      feedback: await page.locator('#instruction').textContent(),
    };
  } else if (variant.game === 'xiangqi-five') {
    await page.locator('#home-start').tap();
    await page.locator('#challenge-open').tap();
    await page.locator('#challenge-list [data-challenge]').first().tap();
    await page.locator('#training-help-open').tap();
    assert.equal(await page.locator('#challenge-hint-text').isVisible(), false);
    await page.locator('#challenge-hint').tap();
    if (variant.adsEnabled) {
      await until(
        async () =>
          /广告暂不可用|未看完/.test(await page.locator('#challenge-hint-status').textContent()),
        'Chess unavailable host feedback',
      );
      assert.equal(await page.locator('#challenge-hint-text').isVisible(), false);
    } else await page.locator('#challenge-hint-text').waitFor({ state: 'visible' });
    assert.match(await page.locator('#challenge-hint-cost').textContent(), /一星/);
    evidence = {
      hintVisible: await page.locator('#challenge-hint-text').isVisible(),
      feedback: await page.locator('#challenge-hint-status').textContent(),
      starsRule: await page.locator('#challenge-hint-cost').textContent(),
    };
    if (variant.adsEnabled) {
      // An unresolved host request checks cancellation without inventing a completed ad.
      await page.evaluate(() => {
        globalThis.SmallGamesRewardAds = { offer: () => new Promise(() => {}), cancel() {} };
      });
      await page.locator('#challenge-hint').tap();
      await until(() => page.locator('#challenge-hint').isDisabled(), 'Chess ad request pending');
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.evaluate(() => {
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await until(
        () => page.locator('#challenge-hint').isEnabled(),
        'Chess hint retry after foreground',
      );
      assert.equal(await page.locator('#challenge-hint-text').isVisible(), false);
      evidence.backgroundCancellation = true;
    }
  } else {
    await page.locator('#levels-button').tap();
    await page.locator('[data-choice-for="mode-select"][data-value="classic"]').tap();
    await page.locator('[data-choice-for="initiative-select"][data-value="first"]').tap();
    await page.locator('#start-button').tap();
    await until(
      async () => (await streetSnapshot(player)).phase === 'playing',
      'Street solo starts',
    );
    const starter = await streetSnapshot(player);
    assert.equal(starter.support.sprint, 1);
    assert.equal(starter.support.refilled.sprint, false);
    await page.locator('#sprint-button').tap();
    await until(async () => {
      const snapshot = await streetSnapshot(player);
      return snapshot.support.sprint === 0 && snapshot.support.remaining > 0;
    }, 'Street starter sprint consumed');
    await until(async () => {
      const snapshot = await streetSnapshot(player);
      assert.equal(snapshot.phase, 'playing', 'Solo match ended before refill verification');
      return snapshot.support.remaining === 0;
    }, 'Street real four-second sprint expires');
    await page.locator('#sprint-button').tap();
    await page.locator('#support-page').waitFor({ state: 'visible' });
    await until(async () => !(await streetSnapshot(player)).support.busy, 'Street refill finishes');
    const granted = await streetSnapshot(player);
    const feedback = await page.locator('#support-status').textContent();
    assert.equal(granted.support.assisted, true, 'Starter sprint remains classified as assisted');
    if (variant.adsEnabled) {
      assert.equal(granted.support.sprint, 0);
      assert.equal(
        granted.support.refilled.sprint,
        false,
        'Unavailable host must retain refill quota',
      );
      assert.match(feedback, /广告暂不可用.*次数保留/);
      await page.locator('#support-use').tap();
    } else {
      assert.equal(granted.support.sprint, 1);
      assert.equal(granted.support.refilled.sprint, true);
      await page.locator('#support-return').tap();
      const kept = await streetSnapshot(player);
      assert.equal(kept.support.sprint, 1, 'Returning without use retains free sprint');
      assert.equal(kept.support.assisted, true);
      await page.locator('#sprint-button').tap();
      await until(
        async () => (await streetSnapshot(player)).support.sprint === 0,
        'Free refilled sprint is usable',
      );
      await until(
        async () => (await streetSnapshot(player)).support.remaining === 0,
        'Refilled sprint expires',
      );
      await until(() => page.locator('#sprint-button').isDisabled(), 'Only one refill per run');
    }
    const after = await streetSnapshot(player);
    assert.equal(after.support.sprint, 0);
    assert.equal(after.support.assisted, true);
    assert.equal(after.support.refilled.sprint, !variant.adsEnabled);
    evidence = {
      starter: starter.support,
      granted: granted.support,
      after: after.support,
      feedback,
    };
  }
  await screenshot(player, 'reward');
  // A real navigation ends the solo flow before entering a separate online match.
  await page.goto(gameUrl(variant), { waitUntil: 'networkidle' });
  await rendered(page);
  return {
    mode: variant.adsEnabled ? 'host-unavailable-no-reward' : 'explicit-free-reward',
    ...evidence,
    realAdvertisementPlayed: false,
  };
}

async function openOnline(player) {
  if (player.variant.game === 'xiangqi-five') {
    await player.page.locator('#home-start').tap();
    await player.page.locator('#mode-online').tap();
    player.surface = player.page.locator('[data-xiangqi-competition]');
  } else if (player.variant.game === 'cops-robbers-realtime') {
    await player.page.locator('[data-competition-entry="friends"]').tap();
    player.surface = player.page.locator('[data-street-competition]');
  } else {
    await player.page.locator('#friend-duel').tap();
    player.surface = player.page.locator('.competition-dialog');
  }
  await player.surface.waitFor({ state: 'visible' });
  player.profile = await player.page.evaluate(() => globalThis.__competition.request('/me'));
}
async function startMatch(a, b) {
  await openOnline(a);
  await openOnline(b);
  assert.notEqual(a.profile.playerId, b.profile.playerId);
  if (a.variant.game === 'cops-robbers') {
    await a.surface.locator('[data-match-mode]').selectOption('survival');
    await a.surface.locator('[data-match-role]').selectOption('pursuer');
    await a.surface.locator('[data-match-initiative]').selectOption('pursuer');
  }
  if (a.variant.game === 'cops-robbers-realtime')
    await a.surface.locator('[data-go="create"]').tap();
  await a.surface.locator('[data-create]').tap();
  await until(() => a.room?.code, 'UI creates room');
  const code = a.room.code;
  assert.match(code, /^[A-F0-9]{12}$/);
  if (a.variant.game === 'cops-robbers-realtime') await b.surface.locator('[data-go="join"]').tap();
  await b.surface.locator('[data-code]').fill(code);
  await b.surface.locator('[data-join]').tap();
  await until(() => b.room?.players.length === 2, 'UI joins room');
  assert.equal(b.room.code, code);
  assert.equal(a.room.players[a.room.you].id, a.profile.playerId);
  assert.equal(b.room.players[b.room.you].id, b.profile.playerId);
  await a.surface.locator('[data-ready]').tap();
  await b.surface.locator('[data-ready]').tap();
  await until(
    () => a.room?.status === 'playing' && b.room?.status === 'playing',
    'Both UI clients start match',
  );
  await screenshot(a, 'playing');
  await screenshot(b, 'playing');
  return code;
}
async function playCops(players) {
  const deadline = Date.now() + 330000;
  while (players.some((p) => p.room.status === 'playing')) {
    assert(Date.now() < deadline, 'Cops natural match did not finish');
    if (players.some((p) => p.room.status === 'finished')) break;
    const latest = players.reduce((a, b) =>
      a.room.state.board.turn >= b.room.state.board.turn ? a : b,
    );
    const turn = latest.room.state.board.turn;
    const side = latest.room.state.board.side;
    const player = players.find((p) => p.room.state.role === side);
    assert(player, `Missing player for ${side}`);
    await until(
      () => player.room.status === 'finished' || player.room.state.board.turn >= turn,
      'Opponent UI receives current board',
    );
    if (player.room.status === 'finished') break;
    const state = player.room.state;
    const level = getDuelLevel(state.mode, state.levelId);
    let action = chooseDuelAction(level, state.board);
    assert(action);
    // Use a legal hold if an immediate opening win would be ineligible for rating.
    if (state.board.turn < 3 && stepDuel(level, state.board, action).winner) {
      const positions = side === 'pursuer' ? state.board.cops : state.board.robbers;
      const actor = positions.findIndex((node) => node >= 0);
      action = { type: 'move', side, actor, target: positions[actor] };
    }
    await touchAction(player, action);
  }
}
async function playChess(players) {
  const moves = [0, 18, 1, 19, 2, 20, 3, 21, 4];
  for (let ply = 0; ply < moves.length; ply++) {
    const player = players.find((p) => p.room.state.seat === ply % 2);
    await until(() => player.room.state.ply === ply, `Chess UI receives ply ${ply}`);
    await touchAction(player, { type: 'deploy-directly', to: moves[ply] });
  }
}
async function playStreet(players) {
  await until(
    () => players.every((p) => p.room.state.openingRemainingMs === 0),
    'Real street opening finishes',
  );
  const deadline = Date.now() + 140000;
  while (players.some((p) => p.room.status === 'playing')) {
    assert(Date.now() < deadline, 'Street natural match did not finish');
    if (players.some((p) => p.room.status === 'finished')) break;
    for (const player of players) {
      if (player.room.status !== 'playing') continue;
      const size = await player.surface
        .locator('canvas[data-play]')
        .evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }));
      const state = projected(player.variant.game, player.room.state, size.width, size.height);
      const runner = state.role === 'runner';
      const own = runner ? state.robbers : state.cops;
      const actor = own.findIndex((item) => !item.caught && !item.escaped);
      const targets = runner
        ? state.cops
        : state.robbers.filter((item) => !item.caught && !item.escaped);
      if (actor < 0 || !targets.length) continue;
      const score = (point) =>
        Math.min(...targets.map((target) => Math.hypot(target.x - point.x, target.y - point.y)));
      const nodes = [...state.map.nodes].sort((a, b) =>
        runner ? score(b) - score(a) : score(a) - score(b),
      );
      let sent = false;
      for (const node of nodes) {
        try {
          sent = await touchAction(player, { type: 'move', actor, x: node.x, y: node.y });
          break;
        } catch (error) {
          if (!error.message.startsWith('No visible touch point')) throw error;
        }
      }
      assert(sent || player.room.status === 'finished', 'No legal street touch target');
    }
    await delay(1500);
  }
}
async function finishMatch(players, code) {
  await until(
    () => players.every((p) => p.room.status === 'finished'),
    'Both clients receive natural settlement',
  );
  assert.deepEqual(players[0].room.results, players[1].room.results);
  const results = players[0].room.results;
  assert.equal(results.length, 2);
  for (const entry of results) {
    assert.equal(entry.rated, true, 'Natural match must satisfy rating eligibility');
    assert.equal(entry.result.eligible, true);
    assert.equal(entry.result.finished, true);
  }
  const boards = [];
  for (const player of players) {
    assert(player.acceptedActions > 0, 'Both identities must send real UI actions');
    const duplicate = await player.page.evaluate(
      async ({ code, action }) =>
        globalThis.__competition.request(`/rooms/${code}/actions`, {
          body: JSON.stringify(action),
        }),
      { code, action: player.lastAction },
    );
    assert.deepEqual(duplicate.results, results, 'Retrying an identical touch cannot settle twice');
    await rendered(player.page);
    await screenshot(player, 'settlement');
    const board = await player.page.evaluate(
      (game) => globalThis.__competition.request(`/boards/${game}`),
      player.variant.game,
    );
    const result = results.find((entry) => entry.playerId === player.profile.playerId);
    assert.equal(board.me?.playerId, player.profile.playerId);
    assert.equal(board.me.score, result.result.score);
    assert(board.me.rank >= 1);
    boards.push(board);
    const details = player.surface.locator('[data-details]:visible');
    const insideDetails = details
      .locator('button:visible')
      .filter({ hasText: /查看全站榜|看看排行榜|全站榜/ });
    const anywhere = player.surface
      .locator('button:visible')
      .filter({ hasText: /查看全站榜|看看排行榜|全站榜/ });
    const button = (await insideDetails.count()) ? insideDetails.first() : anywhere.first();
    assert(await button.count(), 'Visible leaderboard navigation required');
    player.board = null;
    await button.tap();
    await until(() => player.board?.me, 'UI displays server leaderboard');
    await screenshot(player, 'leaderboard');
  }
  return {
    roomCode: code,
    playerIds: players.map((p) => p.profile.playerId),
    acceptedTouchActions: players.map((p) => p.acceptedActions),
    duplicateActionsPreserveSettlement: true,
    confirmedLateTerminalInputs: players.map((p) => p.terminalRejections),
    roomVersion: players[0].room.version,
    results,
    boards,
  };
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
};
try {
  assert.equal(matrix.variants.length, 12, 'Expected all twelve H5 variants');
  assert.equal(new Set(matrix.variants.map((v) => v.name)).size, 12);
  assert.equal(
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    matrix.sourceSHA,
    'Renderer source must match packaged source SHA',
  );
  assert.equal(
    execFileSync('git', ['-C', 'games/submodules/xiangqi-five', 'rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    matrix.submoduleSHA,
  );
  for (const game of Object.keys(constructors)) {
    const variants = matrix.variants.filter((v) => v.game === game);
    assert.equal(variants.length, 4);
    assert.equal(new Set(variants.map((v) => `${v.adsEnabled}:${v.serviceEnabled}`)).size, 4);
  }
  for (const variant of matrix.variants) {
    assert.match(variant.name, /^[a-z0-9-]+$/);
    assert.equal(variant.packageType, 'h5');
    assert.equal(variant.sourceSHA, matrix.sourceSHA);
    assert.equal(variant.apiUrl, variant.serviceEnabled ? api : '');
    const dist = await realpath(path.join(directory, variant.name, 'dist'));
    assert.deepEqual(await inventory(dist), variant.files, `Artifact drift: ${variant.name}`);
    roots.set(variant.name, dist);
  }
  server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405).end();
        return;
      }
      const pathname = decodeURIComponent(new URL(request.url, origin).pathname);
      const match = pathname.match(/^\/v\/([a-z0-9-]+)\/(.*)$/);
      assert(match && roots.has(match[1]));
      assert(!/[\\\0]/.test(pathname));
      assert(!pathname.split('/').some((part) => part === '..' || part.startsWith('.')));
      const dist = roots.get(match[1]);
      const filename = await realpath(path.resolve(dist, match[2] || 'index.html'));
      assert(filename.startsWith(dist + path.sep));
      assert((await stat(filename)).isFile());
      response.writeHead(200, {
        'content-type': mime[path.extname(filename)] || 'application/octet-stream',
        'cache-control': 'no-store',
        'permissions-policy': 'fullscreen=(self)',
      });
      response.end(request.method === 'HEAD' ? undefined : await readFile(filename));
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(43810, '127.0.0.1', resolve);
  });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
  });
  report.browser = browser.version();
  for (const variant of matrix.variants) {
    const item = {
      name: variant.name,
      game: variant.game,
      adsEnabled: variant.adsEnabled,
      serviceEnabled: variant.serviceEnabled,
      zipSHA256: variant.sha256,
      passedWithinDeclaredScope: false,
    };
    report.variants.push(item);
    const players = [];
    try {
      const a = await newPlayer(variant, 'a');
      players.push(a);
      item.config = a.config;
      item.reward = await rewardCheck(a);
      if (!variant.serviceEnabled) {
        await delay(1000);
        assert.deepEqual(
          a.requests,
          [],
          'Offline home and reward flow must not make any API request',
        );
        item.offlineApiRequests = 0;
      } else {
        const b = await newPlayer(variant, 'b');
        players.push(b);
        const code = await startMatch(a, b);
        if (variant.game === 'cops-robbers') await playCops(players);
        else if (variant.game === 'xiangqi-five') await playChess(players);
        else await playStreet(players);
        item.online = await finishMatch(players, code);
      }
      await Promise.all([...pending]);
      for (const player of players) {
        assert.deepEqual(player.errors, [], 'Unhandled page or network error');
        assert.deepEqual(player.apiFailures, [], 'Unexpected HTTP rejection');
      }
      item.passedWithinDeclaredScope = true;
    } catch (error) {
      item.error = error.stack;
      process.exitCode = 1;
      for (const player of players) await screenshot(player, 'failure').catch(() => {});
    } finally {
      for (const player of players) {
        player.closing = true;
        await player.context.close().catch(() => {});
        contexts.delete(player.context);
      }
    }
    console.log(
      JSON.stringify({
        variant: item.name,
        passedWithinDeclaredScope: item.passedWithinDeclaredScope,
        error: item.error?.split('\n')[0],
      }),
    );
  }
} catch (error) {
  report.error = error.stack;
  process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close().catch(() => {});
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await Promise.all([...pending]);
  try {
    await traceWrites;
  } catch (error) {
    report.traceError = error.stack;
    process.exitCode = 1;
  }
  report.completedAt = new Date().toISOString();
  await writeFile(
    path.join(output, `report-${runId}.json`),
    JSON.stringify(redact(report), null, 2) + '\n',
  );
}
