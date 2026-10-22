import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { LEVELS } from '../src/levels.ts';
import { STEP } from '../src/simulation.ts';
import { sourceHash } from '../scripts/artifact.mjs';
import { replayDiagnosis, validateReportMetadata } from '../scripts/dispatch-diagnostics.ts';

const options = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i],
    value = process.argv[i + 1];
  assert(
    ['--report', '--cases', '--out'].includes(key) && value && !options.has(key),
    'Usage: node tests/diagnostics.browser.mjs [--report report.json] [--cases 100/random,99/reverse] [--out directory]',
  );
  options.set(key, value);
}
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const reportPath = path.resolve(
  options.get('--report') ??
    fileURLToPath(new URL('../reports/dispatch-diagnostics.json', import.meta.url)),
);
const out = path.resolve(
  options.get('--out') ?? fileURLToPath(new URL('../test-results/dispatch/', import.meta.url)),
);
const report = JSON.parse(await readFile(reportPath, 'utf8'));
await validateReportMetadata(report);
const keys = options.has('--cases')
  ? options.get('--cases').split(',')
  : report.reviewCandidates.slice(0, 2);
assert(keys.length > 0 && new Set(keys).size === keys.length, 'Select distinct recorded cases');
const selected = keys.map((key) => {
  const item = report.results.find((r) => r.key === key);
  assert(item, `Unknown case ${key}`);
  replayDiagnosis(
    LEVELS.find((level) => level.id === item.levelId),
    item,
  );
  return item;
});
assert(
  existsSync(path.join(root, 'build-info.json')),
  'Build genuine Creator 3.8.8 output before browser replay',
);
const build = JSON.parse(await readFile(path.join(root, 'build-info.json'), 'utf8'));
assert.equal(build.creator, '3.8.8');
assert.equal(
  build.sourceHash,
  await sourceHash(),
  'Browser replay requires the current Creator source fingerprint',
);
await mkdir(out, { recursive: true });
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.wav': 'audio/wav',
};
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(
      root,
      '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname),
    );
    if (!file.startsWith(path.resolve(root) + path.sep)) return res.writeHead(403).end();
    res
      .writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' })
      .end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
const evidence = {
  recordedAt: new Date().toISOString(),
  reportPath,
  sourceFingerprint: report.sourceFingerprint,
  build,
  environment:
    'Desktop Chromium, 390x844 touch emulation, real Creator 3.8.8 frames at 1x. Not a physical mobile device or human playtest.',
  timing:
    'Real projected car taps follow recorded simulation-time deadlines. Late inputs are not batched: each next tap waits at least one cadence after the previous acceptance was observed. Acceptance times and queue peaks are RAF-sampled, not exact simulation-tick replay.',
  cases: [],
};
try {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH ||
      process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  evidence.browser = browser.version();
  for (const recorded of selected) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage(),
      errors = [];
    const item = { key: recorded.key, expected: recorded.metrics, actions: [], errors };
    evidence.cases.push(item);
    page.on('pageerror', (error) => errors.push(error.message));
    page.setDefaultTimeout(60000);
    try {
      await page.goto(
        `http://127.0.0.1:${server.address().port}/?dev=1&level=${recorded.levelId}`,
        { waitUntil: 'domcontentloaded' },
      );
      await page.waitForFunction(() => window.homeboundView?.().page === 'playing');
      const initial = await page.evaluate(() => ({
        view: window.homeboundView(),
        state: window.homeboundSnapshot(),
      }));
      assert(
        initial.view.practice && initial.view.speed === 1,
        'Replay must use isolated practice at 1x',
      );
      assert.equal(initial.state.level, recorded.levelId);
      item.initialSimulationSeconds = initial.state.time;
      // Only observe exported snapshots; never call dispatch, advance, or modify game state.
      await page.evaluate(() => {
        const trace = (window.__dispatchReplay = {
          accepted: {},
          maxQueuedVehicles: 0,
          maxTrafficBlockedVehicles: 0,
          samples: 0,
          stop: false,
        });
        const sample = () => {
          if (trace.stop) return;
          const state = window.homeboundSnapshot();
          trace.samples++;
          for (const job of state.services) trace.accepted[job.vehicleId] ??= state.time;
          trace.maxQueuedVehicles = Math.max(
            trace.maxQueuedVehicles,
            state.services.filter(
              (j) =>
                j.bayId &&
                j.clearedAt === undefined &&
                j.phase !== 'done' &&
                state.bays.find((b) => b.id === j.bayId)?.vehicleId !== j.vehicleId,
            ).length,
          );
          trace.maxTrafficBlockedVehicles = Math.max(
            trace.maxTrafficBlockedVehicles,
            state.services.filter(
              (j) => ['driving', 'departing'].includes(j.phase) && j.waitingForTraffic === true,
            ).length,
          );
          requestAnimationFrame(sample);
        };
        sample();
      });
      let previousAcceptance = -recorded.intervalSeconds;
      for (const action of recorded.actions) {
        const plannedSeconds = action.tick * STEP;
        const targetSeconds = Math.max(
          plannedSeconds,
          previousAcceptance + recorded.intervalSeconds,
        );
        const attempt = {
          ...action,
          plannedSeconds,
          targetSeconds,
          status: 'waiting-for-available-car',
        };
        item.actions.push(attempt);
        await page.waitForFunction(
          ({ time, id }) => {
            const state = window.homeboundSnapshot(),
              view = window.homeboundView();
            return (
              state.time + 1e-9 >= time && view.cars.some((car) => car.id === id && car.available)
            );
          },
          { time: targetSeconds, id: action.vehicleId },
          { timeout: (recorded.maxSeconds + 30) * 1000 },
        );
        const before = await page.evaluate(
          (id) => ({
            time: window.homeboundSnapshot().time,
            car: window.homeboundView().cars.find((car) => car.id === id),
            speed: window.homeboundView().speed,
          }),
          action.vehicleId,
        );
        assert.equal(before.speed, 1);
        Object.assign(attempt, {
          beforeTapSeconds: before.time,
          x: before.car.x,
          y: before.car.y,
          status: 'tap-sent',
        });
        await page.touchscreen.tap(before.car.x, before.car.y);
        await page.waitForFunction(
          (id) => window.__dispatchReplay.accepted[id] !== undefined,
          action.vehicleId,
        );
        previousAcceptance = await page.evaluate(
          (id) => window.__dispatchReplay.accepted[id],
          action.vehicleId,
        );
        Object.assign(attempt, {
          status: 'accepted',
          acceptanceObservedSeconds: previousAcceptance,
          latenessSeconds: previousAcceptance - plannedSeconds,
        });
      }
      const maxLateness = Math.max(0, ...item.actions.map((action) => action.latenessSeconds));
      await page.waitForFunction(
        ({ expectedWin, limit }) => {
          const state = window.homeboundSnapshot();
          return state.won || (!expectedWin && state.time >= limit);
        },
        { expectedWin: recorded.metrics.won, limit: recorded.metrics.elapsedSeconds + maxLateness },
        { timeout: (recorded.maxSeconds + maxLateness + 30) * 1000 },
      );
      const final = await page.evaluate(() => {
        window.__dispatchReplay.stop = true;
        return {
          state: window.homeboundSnapshot(),
          view: window.homeboundView(),
          trace: window.__dispatchReplay,
        };
      });
      const config = LEVELS.find((level) => level.id === recorded.levelId);
      const maxWait = Math.max(
        0,
        ...final.state.groups
          .filter((group) => group.state === 'departed')
          .map((group) => group.waitSeconds),
      );
      item.observed = {
        won: final.state.won,
        elapsedSeconds: final.state.time,
        completionSeconds: final.state.won ? final.state.time : null,
        maxWaitSeconds: maxWait,
        derivedStars: final.state.won
          ? maxWait <= config.stars[0]
            ? 3
            : maxWait <= config.stars[1]
              ? 2
              : 1
          : 0,
        threeStarMarginSeconds: final.state.won ? config.stars[0] - maxWait : null,
        maxQueuedVehiclesSampled: final.trace.maxQueuedVehicles,
        maxTrafficBlockedVehiclesSampled: final.trace.maxTrafficBlockedVehicles,
        samples: final.trace.samples,
        maxLatenessSeconds: maxLateness,
      };
      item.finalState = final.state;
      await page.screenshot({ path: path.join(out, recorded.key.replace('/', '-') + '.png') });
      assert.deepEqual(
        final.view.progress,
        initial.view.progress,
        'Practice replay changed formal progress',
      );
      assert.equal(final.state.won, recorded.metrics.won, 'Real input completion differs');
      if (final.state.won) assert.equal(final.state.delivered.length, final.state.target);
      assert.equal(
        item.observed.derivedStars,
        recorded.metrics.stars,
        'Real input star result differs; inspect recorded timing drift',
      );
      assert.deepEqual(errors, []);
      item.status = 'passed';
    } catch (error) {
      item.status = 'failed';
      item.error = String(error);
      item.failureObservation = await page
        .evaluate(() => {
          if (window.__dispatchReplay) window.__dispatchReplay.stop = true;
          return {
            state: window.homeboundSnapshot?.(),
            view: window.homeboundView?.(),
            trace: window.__dispatchReplay,
          };
        })
        .catch((observationError) => ({ error: String(observationError) }));
      await page
        .screenshot({ path: path.join(out, recorded.key.replace('/', '-') + '-failed.png') })
        .catch(() => {});
    } finally {
      await context.close();
      await writeFile(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    }
  }
  assert(
    evidence.cases.every((item) => item.status === 'passed'),
    `Browser replay failed; inspect ${path.join(out, 'evidence.json')}`,
  );
  console.log(
    JSON.stringify(
      {
        evidence: path.join(out, 'evidence.json'),
        cases: evidence.cases.map(({ key, status, observed }) => ({ key, status, observed })),
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
