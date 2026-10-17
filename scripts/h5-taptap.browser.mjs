import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { appendFile, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { inventory, digest, zipInventory } from '../apps/shell-minigame/scripts/taptap-package.mjs';
import {
  matrixContract,
  assertCandidateSource,
  browserEntryContract,
} from './h5-taptap-matrix.mjs';
import {
  traceEvent,
  safeFailure,
  safeApiPath,
  publicMatchEvidence,
  safeTouchProgress,
} from './h5-taptap-trace.mjs';
import {
  streetTouchPlans,
  reachableStreetMove,
  isBlockedStreetTouch,
  isExpectedTouchRequest,
  touchAttemptFinished,
  completeTouchResponse,
  prepareTouchCanvas,
  guestScheduler,
  throwStaleStreetPlan,
  soloStreetPlan,
  streetActorTouchPoint,
  touchHitPoints,
} from './h5-taptap-touch.mjs';
import { createRenderer as copsRenderer } from '../games/local/cops-robbers/src/competition-renderer.js';
import { chooseDuelAction, stepDuel } from '../games/local/cops-robbers/src/duel.js';
import { getDuelLevel } from '../games/local/cops-robbers/src/duel-levels.js';
import { createRenderer as streetRenderer } from '../games/local/cops-robbers-realtime/src/competition-renderer.js';
import { createRenderer as chessRenderer } from '../games/submodules/xiangqi-five/competition-renderer.js';

try {
  const root = fileURLToPath(new URL('../', import.meta.url));
  assert(process.env.H5_MATRIX, 'Set H5_MATRIX to matrix.json or its directory');
  let matrixFile = path.resolve(process.env.H5_MATRIX);
  if ((await stat(matrixFile)).isDirectory()) matrixFile = path.join(matrixFile, 'matrix.json');
  const directory = path.dirname(matrixFile);
  const matrix = JSON.parse(await readFile(matrixFile, 'utf8'));
  const runId = randomUUID();
  const output = path.join(directory, 'browser', runId);
  const traceFile = path.join(output, `api-${runId}.ndjson`);
  const production = process.argv.includes('--production-service');
  const localRestart = process.argv.includes('--with-local-restart');
  assert(
    process.argv
      .slice(2)
      .every((arg) => ['--production-service', '--with-local-restart'].includes(arg)),
    'Unknown browser flag',
  );
  assert(
    !(production && localRestart),
    'Never restart production services from browser acceptance',
  );
  const { origin, api, port } = matrixContract(matrix, { production });
  const checkCandidate = () =>
    assertCandidateSource(matrix, {
      head: execFileSync('git', ['-c', 'core.fsmonitor=false', 'rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
      submodule: execFileSync(
        'git',
        ['-c', 'core.fsmonitor=false', '-C', 'games/submodules/xiangqi-five', 'rev-parse', 'HEAD'],
        {
          cwd: root,
          encoding: 'utf8',
        },
      ).trim(),
      dirty: execFileSync(
        'git',
        ['-c', 'core.fsmonitor=false', 'status', '--porcelain', '--ignore-submodules=none'],
        {
          cwd: root,
          encoding: 'utf8',
        },
      ).trim(),
    });
  checkCandidate();
  const owned = localRestart ? JSON.parse(process.env.H5_OWNED_RUNTIME || 'null') : null;
  browserEntryContract({
    production,
    localRestart,
    owned,
    ipc: typeof process.send === 'function',
  });
  if (localRestart) {
    assert(owned && process.send, 'Local restart requires the fresh-owned Runtime IPC parent');
    assert.equal(owned.api, api);
    assert.equal(owned.origin, origin);
    assert.match(owned.runId, /^[a-f0-9-]{36}$/);
  }
  const scheduleGuest = guestScheduler(owned?.guestRequestsAt);
  await mkdir(output, { recursive: true });
  console.log(`H5_BROWSER_EVIDENCE ${output}`);
  const constructors = {
    'cops-robbers': copsRenderer,
    'cops-robbers-realtime': streetRenderer,
    'xiangqi-five': chessRenderer,
  };
  const roots = new Map();
  const contexts = new Set();
  const pending = new Set();
  const persistence = [];
  const solos = [];
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
    scope: production
      ? 'Three explicit online-ads H5 packages, real touch profiles and matches; advertisement completion unverified'
      : 'Twelve local H5 configurations, real touch profiles, rewards and six online matches',
    realAdsVerified: false,
    realDeviceVerified: false,
    notRun: [
      'Actual advertisement playback and completed/cancelled/failed/timeout host callbacks',
      'Runtime and PostgreSQL restart persistence',
    ],
    variants: [],
  };

  function trace(entry) {
    const line = JSON.stringify(traceEvent(entry)) + '\n';
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
        typeof value === 'number'
          ? Math.abs(actual[key] - value) < 0.000001
          : actual[key] === value,
      )
    );
  }
  async function touchAction(player, wanted, planningState) {
    player.touchPhase = 'layout';
    await rendered(player.page);
    const canvas = player.surface.locator('canvas[data-play]');
    await until(
      async () => player.room.status === 'finished' || (await canvas.isVisible()),
      'Playing canvas or authoritative settlement',
    );
    if (player.room.status === 'finished') return false;
    if (!(await prepareTouchCanvas(canvas, () => player.room.status === 'finished'))) return false;
    const plannedRoom = player.room;
    const requestsBefore = player.actionRequests;
    const street = player.variant.game === 'cops-robbers-realtime';
    const dimensions = await until(async () => {
      if (player.room.status === 'finished') return { finished: true };
      if (street && player.room !== plannedRoom)
        throwStaleStreetPlan(player, plannedRoom, requestsBefore);
      const view = await canvas.evaluate((element) => ({
        width: element.clientWidth,
        height: element.clientHeight,
        seq: Number(element.dataset.renderedSeq),
        serverNow: Number(element.dataset.renderedServerNow),
      }));
      if (street && player.room !== plannedRoom)
        throwStaleStreetPlan(player, plannedRoom, requestsBefore);
      return !street || (view.seq === plannedRoom.seq && view.serverNow === plannedRoom.serverNow)
        ? view
        : false;
    }, 'Actual canvas renders the planned public snapshot');
    if (player.room.status === 'finished') return false;
    assert(dimensions.width > 0 && dimensions.height > 0);
    const original = plannedRoom.state;
    const state = projected(player.variant.game, original, dimensions.width, dimensions.height);
    if (player.variant.game === 'cops-robbers-realtime' && wanted.type === 'move') {
      player.touchPhase = 'state-check';
      const own = original.role === 'runner' ? original.robbers : original.cops;
      const actor = own[wanted.actor];
      const move = state !== original ? { ...wanted, x: wanted.y, y: -wanted.x } : wanted;
      // Snapshot updates during canvas/layout awaits can invalidate a plan.
      // This branch runs before any touch or expected request exists.
      if (
        !actor ||
        actor.caught ||
        actor.escaped ||
        actor.moving ||
        !reachableStreetMove(original, move)
      )
        throw Object.assign(new Error('Street plan changed before touch'), {
          code: 'TOUCH_PLAN_STALE',
        });
    }
    const create = constructors[player.variant.game];
    const mirror = create();
    let hits = mirror.draw(noopContext(), dimensions.width, dimensions.height, state);
    let selection;
    player.touchPhase = 'actor-planning';
    if (['cops-robbers', 'cops-robbers-realtime'].includes(player.variant.game)) {
      const hit = hits.find((item) => item.action?.local === wanted.actor);
      assert(hit, `Cannot select actor ${wanted.actor}`);
      selection =
        player.variant.game === 'cops-robbers-realtime'
          ? streetActorTouchPoint(
              create,
              noopContext(),
              dimensions.width,
              dimensions.height,
              state,
              wanted.actor,
            )
          : samples(hit)[0];
      assert(selection, 'No visible touch point for actor selection');
      assert.equal(mirror.tap(...selection, state), null);
      hits = mirror.draw(noopContext(), dimensions.width, dimensions.height, state);
    }
    let found;
    player.touchPhase = 'target-planning';
    for (const hit of hits) {
      if (wanted.type === 'deploy-directly' && hit.index !== wanted.to) continue;
      const points =
        player.variant.game === 'cops-robbers-realtime'
          ? touchHitPoints(hit, hits, dimensions.width, dimensions.height)
          : samples(hit);
      for (const point of points) {
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
    const tap = async ([x, y], target = false) => {
      if (player.room.status === 'finished') return false;
      const box = street
        ? await canvas.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
              clientWidth: element.clientWidth,
              clientHeight: element.clientHeight,
              seq: Number(element.dataset.renderedSeq),
              serverNow: Number(element.dataset.renderedServerNow),
              selected: Number(element.dataset.selectedActor),
            };
          })
        : await canvas.boundingBox();
      if (player.room.status === 'finished') return false;
      assert(box, 'Canvas disappeared');
      if (
        street &&
        (player.room !== plannedRoom ||
          box.seq !== plannedRoom.seq ||
          box.serverNow !== plannedRoom.serverNow ||
          box.clientWidth !== dimensions.width ||
          box.clientHeight !== dimensions.height ||
          (target && box.selected !== wanted.actor))
      )
        throwStaleStreetPlan(player, plannedRoom, requestsBefore);
      if (street && target) {
        assert.equal(
          player.actionRequests,
          requestsBefore,
          'Target follows only a local selection',
        );
        assert(!player.expectedTouch?.error, 'A mismatched action must remain a failure');
      }
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
    const authoritative =
      state !== original && wanted.type === 'move'
        ? { ...wanted, x: wanted.y, y: -wanted.x }
        : wanted;
    if (player.variant.game === 'cops-robbers-realtime' && wanted.type === 'move')
      assert(
        reachableStreetMove(planningState || original, authoritative),
        'Plan a reachable public-snapshot route',
      );
    const expected = {
      role: original.role,
      code: player.room.code,
      request: { seq: previous + 1, action: authoritative },
      sent: false,
      completed: false,
    };
    player.expectedTouch = expected;
    if (selection) {
      player.touchPhase = 'actor-tap';
      if (!(await tap(selection))) {
        player.expectedTouch = null;
        return false;
      }
      await rendered(player.page);
      assert.equal(
        player.actionRequests,
        requestsBefore,
        'Selecting an actor must not emit an action',
      );
    }
    player.touchPhase = 'target-tap';
    if (!(await tap(found, true))) {
      player.expectedTouch = null;
      return false;
    }
    await onlineIdle(player);
    player.touchPhase = 'response-wait';
    await until(
      () => touchAttemptFinished(expected, player.room.status === 'finished'),
      `${player.variant.name}/${player.id} sent touch response finishes`,
    );
    player.touchPhase = 'response-check';
    assert(!expected.error, 'Sent touch response processing must succeed');
    assert(
      !expected.sent || expected.status < 400 || expected.rejected || expected.terminal,
      'Unexpected touch action rejection',
    );
    if (expected.rejected) {
      await onlineIdle(player);
      const confirmed = await player.page.evaluate(
        (code) => globalThis.__competition.request(`/rooms/${code}`),
        player.room.code,
      );
      assert.equal(confirmed.code, player.room.code);
      assert.equal(confirmed.seq, previous, 'Rejected input cannot advance the player sequence');
      if (confirmed.serverNow >= player.room.serverNow) player.room = confirmed;
      const terminal = player.room.status === 'finished';
      const actor = player.room.state.robbers[authoritative.actor];
      assert(
        terminal ||
          actor.caught ||
          actor.escaped ||
          !reachableStreetMove(player.room.state, authoritative),
        'A rejected planned route must now be blocked or naturally finished',
      );
      player.inputRejections.push({
        seq: previous + 1,
        status: 422,
        error: 'ILLEGAL_ACTION',
        sequenceUnchanged: true,
        terminal,
        recoveredUsingUI: false,
        actor: authoritative.actor,
        caught: actor.caught === true,
        escaped: actor.escaped === true,
        moving: actor.moving === true,
        elapsedMs: player.room.state.elapsedMs,
      });
      player.expectedTouch = null;
      return false;
    }
    if (player.room.status === 'finished') {
      if (player.room.seq !== previous + 1 || player.lastAction?.seq !== previous + 1) {
        player.expectedTouch = null;
        return false;
      }
    }
    assert.equal(player.room.seq, previous + 1);
    assert.equal(player.lastAction?.seq, previous + 1);
    assert(
      sameAction(player.lastAction.action, authoritative),
      'Touch must emit the planned legal action',
    );
    player.acceptedActions++;
    for (const rejection of player.inputRejections)
      if (rejection.seq === player.lastAction.seq) rejection.recoveredUsingUI = true;
    player.expectedTouch = null;
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
    await context.route('**/sessions/guest', async (route) => {
      scheduleGuest.admit();
      await route.continue();
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(90000);
    const player = {
      context,
      page,
      variant,
      id,
      room: null,
      profile: null,
      soloAdmission: null,
      soloSubmission: null,
      soloBoard: null,
      board: null,
      lastAction: null,
      requests: [],
      errors: [],
      apiFailures: [],
      responseTasks: new Set(),
      terminalRejections: [],
      inputRejections: [],
      expectedTouch: null,
      expectedReplay: null,
      actionRequests: 0,
      touchRequests: new WeakMap(),
      acceptedActions: 0,
      closing: false,
    };
    page.on('pageerror', (error) => player.errors.push(safeFailure(error, 'PAGE_ERROR')));
    context.on('request', (request) => {
      if (!isApi(request.url())) return;
      const entry = { method: request.method(), path: new URL(request.url()).pathname };
      const expected = player.expectedTouch;
      const matches = isExpectedTouchRequest({
        ...entry,
        code: expected?.code,
        input: requestBody(request),
        expected,
      });
      const replay = player.expectedReplay;
      const matchesReplay = isExpectedTouchRequest({
        ...entry,
        code: replay?.code,
        input: requestBody(request),
        expected: replay,
      });
      if (entry.method === 'POST' && /\/rooms\/[A-F0-9]{12}\/actions$/.test(entry.path)) {
        player.actionRequests++;
        if (!matches && !matchesReplay) {
          player.errors.push({ code: 'ASSERTION_FAILED' });
          if (expected) expected.error = true;
        }
      }
      if (matchesReplay) {
        if (replay.sent) player.errors.push({ code: 'ASSERTION_FAILED' });
        replay.sent = true;
      }
      if (matches) {
        if (expected.sent) player.errors.push('A touch emitted duplicate action requests');
        expected.sent = true;
        player.touchRequests.set(request, expected);
      }
      player.requests.push(entry);
      trace({
        variant: variant.name,
        player: id,
        kind: 'request',
        ...entry,
        seq: requestBody(request)?.seq,
      });
    });
    context.on('requestfailed', (request) => {
      const expected = player.touchRequests.get(request);
      if (expected) {
        expected.error = true;
        expected.completed = true;
      }
      if ((!player.closing || expected) && isApi(request.url()))
        player.errors.push({
          code: 'NETWORK_FAILED',
          method: request.method(),
          path: safeApiPath(request.url()),
        });
    });
    context.on('response', (response) => {
      if (!isApi(response.url())) return;
      const expected = player.touchRequests.get(response.request());
      if (expected) expected.status = response.status();
      const task = completeTouchResponse(expected, async () => {
        const body = await response.json().catch(() => null);
        const pathname = new URL(response.url()).pathname;
        trace({
          variant: variant.name,
          player: id,
          kind: 'response',
          method: response.request().method(),
          path: pathname,
          status: response.status(),
          errorCode: body?.error,
          seq: requestBody(response.request())?.seq,
        });
        if (!response.ok()) {
          if (
            isBlockedStreetTouch({
              game: variant.game,
              code: expected?.code,
              path: pathname,
              status: response.status(),
              body,
              input: requestBody(response.request()),
              expected,
            })
          ) {
            expected.rejected = true;
            return;
          }
          const code = pathname.match(
            /^\/(?:small-games\/v1|api\/competition\/v1)\/rooms\/([A-F0-9]{12})\/actions$/,
          )?.[1];
          if (
            code === player.room?.code &&
            response.status() === 409 &&
            ['MATCH_CLOSED', 'PLAYER_FINISHED'].includes(body?.error)
          ) {
            const confirmed = await page.evaluate(
              (roomCode) => globalThis.__competition.request(`/rooms/${roomCode}`),
              code,
            );
            assert.equal(confirmed.code, code);
            assert.equal(
              confirmed.status,
              'finished',
              'Late input requires authoritative settlement',
            );
            if (confirmed.serverNow >= player.room.serverNow) player.room = confirmed;
            if (expected) expected.terminal = true;
            player.terminalRejections.push({
              status: response.status(),
              path: safeApiPath(pathname),
              errorCode: safeFailure({ code: body?.error }, 'HTTP_REJECTED').code,
            });
            return;
          }
          if (!player.closing || expected)
            player.apiFailures.push({
              status: response.status(),
              path: safeApiPath(pathname),
              errorCode: safeFailure({ code: body?.error }, 'HTTP_REJECTED').code,
            });
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
        if (
          pathname.endsWith('/runs/cops-robbers-realtime/start') &&
          response.request().method() === 'POST'
        )
          player.soloAdmission = { admissionId: body.admissionId, expiresAt: body.expiresAt };
        if (pathname.endsWith('/runs/cops-robbers-realtime')) {
          if (response.request().method() === 'POST') {
            const url = new URL(response.url());
            player.soloSubmission = {
              path: url.pathname.slice(new URL(api).pathname.length) + url.search,
              body: requestBody(response.request()),
              result: body,
            };
          } else player.soloBoard = body;
        }
        if (pathname.includes('/boards/')) player.board = body;
      }).catch((error) => {
        if (expected) expected.error = true;
        if (!player.closing || expected) player.errors.push(safeFailure(error));
      });
      pending.add(task);
      player.responseTasks.add(task);
      void task.finally(() => {
        pending.delete(task);
        player.responseTasks.delete(task);
      });
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
    assert.equal(config.ads.enabled, variant.effectiveAdsEnabled);
    assert.equal(config.ads.mode, variant.effectiveAdsEnabled ? 'host' : 'off');
    if (variant.effectiveAdsEnabled)
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
    const adsEffective = variant.effectiveAdsEnabled;
    let evidence;
    if (variant.game === 'cops-robbers') {
      await page.locator('#home-start').tap();
      await page.waitForFunction(() => document.body.dataset.phase === 'planning');
      const before = await page.locator('body').getAttribute('data-turn');
      assert.equal(await page.locator('.hint-circle').count(), 0);
      await page.locator('#hint').tap();
      if (adsEffective) {
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
      if (adsEffective) {
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
      if (adsEffective) {
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
      await until(
        async () => !(await streetSnapshot(player)).support.busy,
        'Street refill finishes',
      );
      const granted = await streetSnapshot(player);
      const feedback = await page.locator('#support-status').textContent();
      assert.equal(granted.support.assisted, true, 'Starter sprint remains classified as assisted');
      if (adsEffective) {
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
      assert.equal(after.support.refilled.sprint, !adsEffective);
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
      mode: adsEffective
        ? 'host-unavailable-no-reward'
        : variant.adsEnabled
          ? 'missing-ad-unit-free-reward'
          : 'explicit-free-reward',
      ...evidence,
      realAdvertisementPlayed: false,
    };
  }

  async function onlineIdle(player) {
    await until(
      async () => (await player.surface.getAttribute('aria-busy')) !== 'true',
      'Online entry finishes loading',
    );
  }
  async function assertPlayerHealthy(player) {
    while (player.responseTasks.size) await Promise.all([...player.responseTasks]);
    assert.deepEqual(player.errors, [], 'Unhandled page or network error');
    assert.deepEqual(player.apiFailures, [], 'Unexpected HTTP rejection');
  }
  async function retainDocument(player) {
    player.documentId = await player.page.evaluate(
      () => (globalThis.__h5AcceptanceDocumentId ??= crypto.randomUUID()),
    );
    player.closing = true;
    await player.context.route('**/api/competition/v1/**', async (route) => {
      if (route.request().method() === 'GET') await route.abort('aborted');
      else await route.continue();
    });
  }
  async function naturalStreetSolo(player) {
    const { page } = player;
    await page.locator('#levels-button').tap();
    await page.locator('[data-choice-for="mode-select"][data-value="challenge"]').tap();
    await page.locator('[data-choice-for="role-select"][data-value="cop"]').tap();
    await page.locator('#start-button').tap();
    await until(
      async () =>
        Boolean(player.soloAdmission) && (await streetSnapshot(player)).phase === 'playing',
      'Natural solo starts after observing the actual admission response',
      90000,
    );
    assert.match(player.soloAdmission?.admissionId, /^[a-f0-9-]{36}$/);
    player.profile = await page.evaluate(() => globalThis.__competition.request('/me'));
    const order = async (command) => {
      await page.locator(`#cop-roster button[data-member="${command.actor}"]`).tap();
      const point = await page.evaluate(
        async (target) =>
          (await import(new URL('./src/main.js', location.href).href)).worldToScreen(target),
        command.target,
      );
      await page.touchscreen.tap(point.x, point.y);
    };
    const initial = await streetSnapshot(player);
    assert.equal(initial.mode, 'challenge');
    assert.equal(initial.role, 'cop');
    assert.equal(initial.level, 1);
    assert.equal(initial.firstRole, null);
    for (const guard of soloStreetPlan(initial).guards) await order(guard);
    const deadline = Date.now() + 90000;
    let actions = 0;
    while (Date.now() < deadline) {
      const state = await streetSnapshot(player);
      assert.equal(state.support.assisted, false);
      if (state.phase !== 'playing') break;
      const plan = soloStreetPlan(state);
      if (plan.pursuit) {
        await order(plan.pursuit);
        actions++;
      }
      await delay(700);
    }
    const final = await streetSnapshot(player);
    assert.equal(final.phase, 'won');
    assert.equal(final.support.assisted, false);
    assert(actions > 0);
    await until(
      () => player.soloSubmission?.result.accepted === true,
      'UI submits naturally completed unassisted run',
    );
    assert(player.soloSubmission.body.orders.length > 0);
    assert.equal(
      new URL(player.soloSubmission.path, 'http://qa.invalid').searchParams.get('admissionId'),
      player.soloAdmission.admissionId,
    );
    const original = player.soloSubmission;
    assert.equal(
      new URL(original.path, 'http://qa.invalid').searchParams.get('first'),
      'simultaneous',
    );
    const duplicate = await page.evaluate(
      ({ path, body }) => globalThis.__competition.request(path, { body: JSON.stringify(body) }),
      original,
    );
    assert.equal(duplicate.accepted, true);
    assert.equal(duplicate.personalMs, original.result.personalMs);
    await page.locator('#win-dialog [data-home]').tap();
    await page.locator('#records-button').tap();
    await until(() => player.soloBoard?.personalMs > 0, 'UI receives own persisted solo standing');
    assert(Number.isFinite(player.soloBoard.personalMs));
    assert.equal(player.soloBoard.personalMs, original.result.personalMs);
    const ownStanding = player.soloBoard.top.find((row) => row.userId === player.profile.userId);
    if (ownStanding) assert.equal(ownStanding.elapsedMs, original.result.personalMs);
    await screenshot(player, 'natural-solo-board');
    await assertPlayerHealthy(player);
    const proof = { player, submission: original, board: player.soloBoard };
    if (localRestart) {
      solos.push(proof);
      await retainDocument(player);
    } else {
      player.closing = true;
      await player.context.close();
      contexts.delete(player.context);
    }
    return {
      unassisted: true,
      naturalWin: true,
      actualTouchOrders: actions,
      admissionBeforePlay: true,
      uiSubmission: true,
      personalStanding: true,
      duplicatePreservesResult: true,
    };
  }
  async function openOnline(player) {
    if (player.surface && (await player.surface.isVisible())) {
      await onlineIdle(player);
      return;
    }
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
    await onlineIdle(player);
  }
  async function profilePage(player) {
    await onlineIdle(player);
    const responsePromise = player.page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname.endsWith('/me') &&
        response.status() === 200,
    );
    await player.surface.locator('[data-profile]').tap();
    const street = player.variant.game === 'cops-robbers-realtime';
    const panel = player.surface.locator(
      street ? '[data-page="nickname"]' : '[data-kind="profile"]',
    );
    await panel.waitFor({ state: 'visible' });
    const input = panel.getByRole('textbox', { name: '你的昵称' });
    const profile = await (await responsePromise).json();
    await until(
      async () =>
        (await panel.locator('form').getAttribute('data-user-id')) === profile.userId &&
        (await input.inputValue()) === profile.name,
      'Fresh server profile loads into owner-bound form',
    );
    return { panel, input, save: panel.getByRole('button', { name: '保存昵称', exact: true }) };
  }
  async function profilesCheck(a, b) {
    const evidence = [];
    for (const player of [a, b]) {
      await openOnline(player);
      const initial = player.profile;
      assert.equal(initial.identityMode, 'ephemeral');
      assert.equal(initial.game, player.variant.game);
      assert.equal(initial.userId, initial.playerId);
      assert.equal(initial.avatarUrl, '');
      assert.equal(initial.region, null);
      const { panel, input, save } = await profilePage(player);
      assert.equal(await panel.getByRole('button', { name: '同步已授权的平台资料' }).count(), 0);
      await input.fill('访客' + player.id.toUpperCase());
      for (const viewport of [
        { width: 320, height: 568 },
        { width: 844, height: 390 },
        { width: 390, height: 844 },
      ]) {
        await player.page.setViewportSize(viewport);
        await save.scrollIntoViewIfNeeded();
        const box = await save.boundingBox();
        assert(box && box.height >= 44 && box.width >= 44);
        await screenshot(player, 'profile-' + viewport.width + 'x' + viewport.height);
      }
      await save.tap();
      await until(
        () => player.profile?.name === '访客' + player.id.toUpperCase(),
        'Touch profile save',
      );
      const same = await player.page.evaluate(() => globalThis.__competition.request('/me'));
      assert.equal(same.userId, initial.userId);
      // Secrets are used only inside this document and never returned to Node or another context.
      const refresh = await player.page.evaluate(async () => {
        const client = globalThis.__competition,
          own = await client.session();
        const response = await fetch(client.config.apiUrl + '/sessions/refresh', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken: own.refreshToken }),
        });
        if (!response.ok) return { ok: false, status: response.status };
        const next = await response.json();
        return { ok: true, userId: next.userId, identityExpiresAt: next.identityExpiresAt };
      });
      assert.equal(refresh.ok, true);
      assert.equal(refresh.userId, initial.userId);
      assert.equal(refresh.identityExpiresAt, initial.identityExpiresAt);
      await player.page.reload({ waitUntil: 'networkidle' });
      player.surface = null;
      player.room = null;
      await openOnline(player);
      assert.notEqual(
        player.profile.userId,
        initial.userId,
        'Reload must create a new ephemeral owner',
      );
      evidence.push({
        sameDocumentOwner: initial.userId,
        reloadedOwner: player.profile.userId,
        refreshRetainsOwner: true,
        reloadCreatesNewIdentity: true,
      });
    }
    const original = a.variant,
      crossGame = [],
      seen = new Set([a.profile.userId, b.profile.userId]);
    assert.equal(seen.size, 2);
    for (const game of Object.keys(constructors).filter((game) => game !== original.game)) {
      const variant = matrix.variants.find(
        (v) => v.game === game && v.adsEnabled === original.adsEnabled && v.serviceEnabled,
      );
      assert(variant);
      a.variant = variant;
      a.surface = null;
      a.room = null;
      await a.page.goto(gameUrl(variant), { waitUntil: 'networkidle' });
      await openOnline(a);
      assert(!seen.has(a.profile.userId));
      seen.add(a.profile.userId);
      assert.equal(a.profile.game, game);
      crossGame.push({ game, userId: a.profile.userId });
    }
    a.variant = original;
    a.surface = null;
    a.room = null;
    await a.page.goto(gameUrl(original), { waitUntil: 'networkidle' });
    await openOnline(a);
    assert(!seen.has(a.profile.userId));
    assert.notEqual(a.profile.userId, b.profile.userId);
    for (const player of [a, b]) {
      const name =
        '访客' +
        Object.keys(constructors).indexOf(player.variant.game) +
        (player.variant.adsEnabled ? 1 : 0) +
        player.id.toUpperCase();
      const { panel, input, save } = await profilePage(player);
      await input.fill(name);
      await save.tap();
      await until(() => player.profile?.name === name, 'Current page owner profile save');
      await panel.waitFor({ state: 'hidden' });
      await onlineIdle(player);
    }
    return {
      players: evidence,
      crossGame,
      crossGameCreatesNewIdentity: true,
      credentialsTransportedBetweenContexts: false,
      actualSdkProfileSyncAvailable: false,
    };
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
    if (a.variant.game === 'cops-robbers-realtime')
      await b.surface.locator('[data-go="join"]').tap();
    await b.surface.locator('[data-code]').fill(code);
    await b.surface.locator('[data-join]').tap();
    await until(() => b.room?.players.length === 2, 'UI joins room');
    assert.equal(b.room.code, code);
    assert.equal(a.room.players[a.room.you].id, a.profile.playerId);
    assert.equal(b.room.players[b.room.you].id, b.profile.playerId);
    await until(() => a.room.players.length === 2, 'Host UI receives both room profiles');
    await screenshot(a, 'room');
    await screenshot(b, 'room');
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
        let sent = false;
        const rejectedBefore = player.inputRejections.length;
        // Only recompute following a confirmed rejection, with a finite retry
        // count; the natural-match deadline and strict recovery checks stay intact.
        for (let attempt = 0; attempt < 8 && !sent; attempt++) {
          const planningState = player.room.state;
          if (player.room.status !== 'playing') break;
          const state = projected(player.variant.game, planningState, size.width, size.height);
          const plans = streetTouchPlans(planningState);
          if (!plans.length) break;
          const before = player.inputRejections.length;
          let stale = false;
          for (const { actor, node: index } of plans) {
            const node = state.map.nodes[index];
            try {
              sent = await touchAction(
                player,
                { type: 'move', actor, x: node.x, y: node.y },
                planningState,
              );
              if (
                sent ||
                player.room.status === 'finished' ||
                player.inputRejections.length > before
              )
                break;
            } catch (error) {
              if (error.code === 'TOUCH_PLAN_STALE') {
                stale = true;
                break;
              }
              if (!error.message.startsWith('No visible touch point')) throw error;
            }
          }
          if (!stale && player.inputRejections.length === before) break;
        }
        const waitingForRoute = streetTouchPlans(player.room.state).length === 0;
        assert(
          sent ||
            player.room.status === 'finished' ||
            player.inputRejections.length > rejectedBefore ||
            waitingForRoute,
          'No legal street touch target',
        );
      }
      await delay(1500);
    }
  }
  async function replayAcceptedAction(player, code) {
    assert(!player.expectedTouch && !player.expectedReplay);
    const replay = { code, request: structuredClone(player.lastAction), sent: false };
    player.expectedReplay = replay;
    try {
      const result = await player.page.evaluate(
        ({ code, request }) =>
          globalThis.__competition.request(`/rooms/${code}/actions`, {
            body: JSON.stringify(request),
          }),
        replay,
      );
      assert(replay.sent, 'An explicit replay must emit its exact accepted action');
      return result;
    } finally {
      player.expectedReplay = null;
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
      assert(
        player.inputRejections.every((item) => item.terminal || item.recoveredUsingUI),
        'Rejected movement requires real UI recovery using the same sequence',
      );
      const boardBefore = await player.page.evaluate(
        (game) => globalThis.__competition.request(`/games/${game}/leaderboards/versus`),
        player.variant.game,
      );
      const duplicate = await replayAcceptedAction(player, code);
      assert.deepEqual(
        duplicate.results,
        results,
        'Retrying an identical touch cannot settle twice',
      );
      await rendered(player.page);
      await screenshot(player, 'settlement');
      const board = await player.page.evaluate(
        (game) => globalThis.__competition.request(`/games/${game}/leaderboards/versus`),
        player.variant.game,
      );
      if (production) {
        const mine = (value) =>
          Object.fromEntries(
            ['userId', 'playerId', 'score', 'secondary'].map((key) => [key, value.me?.[key]]),
          );
        assert.deepEqual(
          mine(board),
          mine(boardBefore),
          'Duplicate submission cannot change this test identity score',
        );
      } else
        assert.deepEqual(
          board,
          boardBefore,
          'Duplicate submission cannot change isolated persistent standings',
        );
      const result = results.find((entry) => entry.playerId === player.profile.playerId);
      assert.equal(board.me?.playerId, player.profile.playerId);
      assert.equal(board.me.score, result.result.score);
      assert.equal(board.me.name, player.profile.name);
      assert.equal(board.me.userId, player.profile.userId);
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
      confirmedBlockedRouteInputs: players.map((p) => p.inputRejections),
      roomVersion: players[0].room.version,
      results,
      boards,
    };
  }

  async function verifyLocalPersistence() {
    assert.equal(persistence.length, 6, 'Persistence requires six UI-completed matches');
    const checkpointId = randomUUID();
    const message = {
      type: 'h5-owned-restart',
      runId: owned.runId,
      checkpointId,
      matches: persistence.map(({ item }) => ({
        variant: item.name,
        roomCode: item.online.roomCode,
        playerIds: item.online.playerIds,
      })),
      solos: solos.map(({ player }) => ({
        admissionId: player.soloAdmission.admissionId,
        playerId: player.profile.userId,
      })),
    };
    const receipt = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        process.off('message', receive);
        reject(new Error('OWNED_RESTART_TIMEOUT'));
      }, 90000);
      function receive(value) {
        if (value?.runId !== owned.runId) return;
        if (value.type === 'h5-owned-restart-failed') {
          clearTimeout(timer);
          process.off('message', receive);
          reject(new Error('OWNED_RESTART_FAILED'));
          return;
        }
        if (value.type !== 'h5-owned-resumed' || value.checkpointId !== checkpointId) return;
        clearTimeout(timer);
        process.off('message', receive);
        resolve(value);
      }
      process.on('message', receive);
      process.send(message);
    });
    assert.equal(receipt.postgresContainer, owned.postgresContainer);
    assert.equal(receipt.volume, owned.volume);
    for (const key of [
      'volumePreserved',
      'runtimeRestarted',
      'postgresRestarted',
      'sameStoredRows',
    ])
      assert.equal(receipt[key], true);
    assert.equal(receipt.serviceRole, 'runtime_app');
    for (const { item, players, raw } of persistence) {
      for (const player of players) {
        const guestCount = player.requests.filter((request) =>
          request.path.endsWith('/sessions/guest'),
        ).length;
        await player.context.unroute('**/api/competition/v1/**');
        player.closing = false;
        const documentId = await player.page.evaluate(() => globalThis.__h5AcceptanceDocumentId);
        assert.equal(documentId, player.documentId, 'Restart must retain the original document');
        const saved = await player.page.evaluate(
          async ({ game, code }) => ({
            profile: await globalThis.__competition.request('/me'),
            room: await globalThis.__competition.request('/rooms/' + code),
            board: await globalThis.__competition.request(
              '/games/' + game + '/leaderboards/versus',
            ),
          }),
          { game: player.variant.game, code: raw.roomCode },
        );
        assert.equal(saved.profile.userId, player.profile.userId);
        assert.equal(saved.profile.name, player.profile.name);
        assert.deepEqual(saved.room.results, raw.results);
        const duplicate = await replayAcceptedAction(player, raw.roomCode);
        assert.deepEqual(
          duplicate.results,
          raw.results,
          'Restart replay must return the original settlement',
        );
        const after = await player.page.evaluate(
          (game) => globalThis.__competition.request('/games/' + game + '/leaderboards/versus'),
          player.variant.game,
        );
        assert.deepEqual(after, saved.board, 'Restart replay cannot change standings');
        const before = raw.boards.find((board) => board.me.playerId === player.profile.userId).me;
        for (const key of ['userId', 'playerId', 'score', 'secondary'])
          assert.equal(saved.board.me[key], before[key]);
        assert.equal(
          player.requests.filter((request) => request.path.endsWith('/sessions/guest')).length,
          guestCount,
        );
        await assertPlayerHealthy(player);
        player.closing = true;
        await player.context.close();
        contexts.delete(player.context);
      }
      item.persistence = {
        sameDocumentIdentity: true,
        profile: true,
        settlement: true,
        score: true,
        runtimeAndPostgresRestart: true,
        replayAfterRestartPreservesScore: true,
      };
    }
    for (const { player, submission, board } of solos) {
      await player.context.unroute('**/api/competition/v1/**');
      player.closing = false;
      assert.equal(
        await player.page.evaluate(() => globalThis.__h5AcceptanceDocumentId),
        player.documentId,
      );
      const duplicate = await player.page.evaluate(
        ({ path, body }) => globalThis.__competition.request(path, { body: JSON.stringify(body) }),
        submission,
      );
      assert.equal(duplicate.accepted, true);
      assert.equal(duplicate.personalMs, submission.result.personalMs);
      const boardUrl = new URL(submission.path, 'http://qa.invalid');
      boardUrl.searchParams.delete('admissionId');
      const saved = await player.page.evaluate(
        (path) => globalThis.__competition.request(path),
        boardUrl.pathname + boardUrl.search,
      );
      const ownStanding = saved.top.find((row) => row.userId === player.profile.userId);
      if (ownStanding) assert.equal(ownStanding.elapsedMs, submission.result.personalMs);
      assert.equal(saved.personalMs, board.personalMs);
      assert.equal(saved.personalMs, submission.result.personalMs);
      await assertPlayerHealthy(player);
      player.closing = true;
      await player.context.close();
      contexts.delete(player.context);
    }
    const idempotency = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        process.off('message', receive);
        reject(new Error('IDEMPOTENCY_PROOF_TIMEOUT'));
      }, 20000);
      function receive(value) {
        if (value?.runId !== owned.runId) return;
        if (value.type === 'h5-owned-restart-failed') {
          clearTimeout(timer);
          process.off('message', receive);
          reject(new Error('IDEMPOTENCY_PROOF_FAILED'));
          return;
        }
        if (value.type === 'h5-owned-idempotency-verified' && value.checkpointId === checkpointId) {
          clearTimeout(timer);
          process.off('message', receive);
          resolve(value);
        }
      }
      process.on('message', receive);
      process.send({ type: 'h5-owned-verify-idempotency', runId: owned.runId, checkpointId });
    });
    assert.equal(idempotency.resultCountsPreserved, true);
    assert.equal(idempotency.scoresPreserved, true);
    report.localRestart = {
      runId: receipt.runId,
      postgresContainer: receipt.postgresContainer,
      volume: receipt.volume,
      volumePreserved: true,
      runtimeRestarted: true,
      postgresRestarted: true,
      sameStoredRows: true,
      serviceRole: 'runtime_app',
      postReplayDatabaseCountsAndScoresPreserved: true,
    };
    report.notRun = report.notRun.filter(
      (item) => item !== 'Runtime and PostgreSQL restart persistence',
    );
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
    assert.equal(
      execFileSync('git', ['-c', 'core.fsmonitor=false', 'rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
      matrix.sourceSHA,
      'Renderer source must match packaged source SHA',
    );
    assert.equal(
      execFileSync(
        'git',
        ['-c', 'core.fsmonitor=false', '-C', 'games/submodules/xiangqi-five', 'rev-parse', 'HEAD'],
        {
          cwd: root,
          encoding: 'utf8',
        },
      ).trim(),
      matrix.submoduleSHA,
    );
    for (const variant of matrix.variants) {
      assert.match(variant.name, /^[a-z0-9-]+$/);
      assert.equal(variant.packageType, 'h5');
      assert.equal(variant.sourceSHA, matrix.sourceSHA);
      assert.equal(variant.apiUrl, variant.serviceEnabled ? api : '');
      const dist = await realpath(path.join(directory, variant.name, 'dist'));
      assert.deepEqual(await inventory(dist), variant.files, `Artifact drift: ${variant.name}`);
      assert.equal(path.basename(variant.zip), variant.zip);
      const zip = await readFile(path.join(directory, variant.zip));
      assert.equal(digest(zip), variant.sha256, `ZIP hash drift: ${variant.name}`);
      assert.deepEqual(
        zipInventory(zip),
        variant.files
          .map((file) => ({ ...file, path: `dist/${file.path}` }))
          .sort((a, b) => a.path.localeCompare(b.path)),
      );
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
      server.listen(port, '127.0.0.1', resolve);
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
        effectiveAdsEnabled: variant.effectiveAdsEnabled,
        adUnitConfigured: variant.adUnitConfigured,
        serviceEnabled: variant.serviceEnabled,
        zipSHA256: variant.sha256,
        passedWithinDeclaredScope: false,
      };
      report.variants.push(item);
      const players = [];
      let completedMatch;
      try {
        // Wait before any fetch exists: profiles use seven guests, Street also
        // opens a rewarded solo flow and a separate natural solo (nine total).
        if (variant.serviceEnabled) await scheduleGuest.waitForCapacity(9);
        const a = await newPlayer(variant, 'a');
        players.push(a);
        item.config = a.config;
        item.reward = await rewardCheck(a);
        if (variant.serviceEnabled && variant.game === 'cops-robbers-realtime')
          item.naturalSolo = await naturalStreetSolo(await newPlayer(variant, 'a'));
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
          item.profiles = await profilesCheck(a, b);
          const code = await startMatch(a, b);
          if (variant.game === 'cops-robbers') await playCops(players);
          else if (variant.game === 'xiangqi-five') await playChess(players);
          else await playStreet(players);
          const rawOnline = await finishMatch(players, code);
          item.online = publicMatchEvidence(rawOnline);
          if (localRestart) completedMatch = { item, players, raw: rawOnline };
        }
        await Promise.all([...pending]);
        for (const player of players) {
          await assertPlayerHealthy(player);
        }
        if (localRestart && variant.serviceEnabled) {
          for (const player of players) {
            await retainDocument(player);
          }
          persistence.push(completedMatch);
        }
        item.passedWithinDeclaredScope = true;
      } catch (error) {
        item.error = safeFailure(error);
        item.failedPlayers = players.map((player) => ({
          player: player.id,
          status: player.room?.status,
          seq: player.room?.seq,
          acceptedActions: player.acceptedActions,
          touch: safeTouchProgress(player.touchPhase, player.expectedTouch),
          inputRejections: player.inputRejections.slice(-24),
          apiFailures: player.apiFailures.slice(-24),
          errors: player.errors.slice(-24),
        }));
        process.exitCode = 1;
        for (const player of players) await screenshot(player, 'failure').catch(() => {});
      } finally {
        for (const player of players) {
          if (persistence.some((entry) => entry.players.includes(player))) continue;
          player.closing = true;
          await player.context.close().catch(() => {});
          contexts.delete(player.context);
        }
      }
      console.log(
        JSON.stringify({
          variant: item.name,
          passedWithinDeclaredScope: item.passedWithinDeclaredScope,
          error: item.error,
        }),
      );
    }
    if (localRestart && report.variants.every((item) => item.passedWithinDeclaredScope))
      await verifyLocalPersistence();
    checkCandidate();
  } catch (error) {
    report.error = safeFailure(error);
    process.exitCode = 1;
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
    await browser?.close().catch(() => {});
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    await Promise.all([...pending]);
    try {
      await traceWrites;
    } catch (error) {
      report.traceError = safeFailure(error);
      process.exitCode = 1;
    }
    report.completedAt = new Date().toISOString();
    await writeFile(
      path.join(output, `report-${runId}.json`),
      JSON.stringify(report, null, 2) + '\n',
    );
  }
} catch (error) {
  console.error(JSON.stringify({ stage: 'h5-browser', ...safeFailure(error) }));
  process.exitCode = 1;
}
