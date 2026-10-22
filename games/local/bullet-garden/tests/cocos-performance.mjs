import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { gzipSync } from 'node:zlib';
import { harness, tap, root, output } from './cocos-harness.mjs';
import { verifyPrebuilt } from '../scripts/artifact.mjs';
import { createProfile, isLevelUnlocked } from '../src/progression.mjs';
import { LEVEL_ORDER } from '../src/config.mjs';

// Test-side fixed workload. Production clocks, rendering and combat rules are unchanged.
const seed = 20261022;
const scenarios = [
  { id: 'first', level: 'ruins', start: 180, profile: createProfile() },
  {
    id: 'dense',
    level: 'skyreach',
    start: 10200,
    profile: createProfile({
      xp: 10000,
      completed: LEVEL_ORDER.slice(0, -1),
      selectedLevelId: 'skyreach',
      upgrades: { health: 20, armor: 15 },
    }),
  },
];
const warmup = 120;
const samples = 600;
const runs = Number(process.env.PERF_RUNS || 3);
assert(Number.isInteger(runs) && runs > 0);
assert(!process.env.GAME_URL, 'Performance provenance requires the locally verified dist');
await verifyPrebuilt(root);
const build = JSON.parse(await readFile(path.join(root, 'dist/build-info.json'), 'utf8'));
const h = await harness();
const report = {
  schema: 1,
  createdAt: new Date().toISOString(),
  sourceHash: build.sourceHash,
  measuredUrl: h.url,
  scriptHash: createHash('sha256')
    .update(await readFile(new URL(import.meta.url)))
    .digest('hex'),
  creator: build.creator,
  browser: h.browser.version(),
  machine: { platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0]?.model },
  method: {
    seed,
    stepSeconds: 1 / 60,
    warmup,
    samples,
    viewport: { width: 390, height: 844, deviceScaleFactor: 1 },
    timing:
      'One fixed simulation step per real Creator update; real browser clock and renderer. Pre-advance uses individual fixed steps. Frame phase is wall time, not GPU time; Creator frame-start interval is not raw rAF or presentation time.',
    input:
      'moveX=cos(step/60*0.45)*0.6; moveY=sin(step/60*0.45)*0.6; autoFire=true; lexicographically first offered upgrade',
    limitations:
      'Desktop headless Chromium touch viewport; not a physical phone. Pre-advance skips earlier rendering/GC history. No claim that other computer workloads were absent.',
  },
  results: [],
};
function stats(values) {
  assert(values.length && values.every(Number.isFinite));
  const sorted = [...values].sort((a, b) => a - b);
  return {
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    min: sorted[0],
    max: sorted.at(-1),
  };
}
function stateHash(checkpoint) {
  const state = structuredClone(checkpoint.state);
  delete state.runId; // The run identity intentionally uses wall time and Math.random.
  return createHash('sha256')
    .update(JSON.stringify({ ...checkpoint, state }))
    .digest('hex');
}
async function run(scenario, run, diagnostic = false) {
  assert(isLevelUnlocked(scenario.profile, scenario.level));
  const session = await h.open({ profile: scenario.profile });
  const { page, context } = session;
  let cdp;
  try {
    await page.evaluate(
      async ({ seed }) => {
        const cc = await globalThis.System.import('cc');
        const app = cc.director
          .getScene()
          .getChildByName('BulletGarden')
          .getComponent('BulletGarden');
        if (!app?.session || !app?.ui?.ready) throw Error('Real Creator component/art missing');
        const begin = app.session.begin;
        app.session.begin = function (id, options) {
          return begin.call(this, id, { ...options, seed });
        };
        const originalUpdate = app.update.bind(app);
        app.update = () => {}; // Hold the deterministic workload while the real touch starts it.
        globalThis.__perf = { app, cc, originalUpdate };
      },
      { seed },
    );
    await tap(page, 'start');
    const metadata = await page.evaluate(
      ({ scenario, warmup }) => {
        const p = globalThis.__perf;
        const { app, cc } = p;
        if (app.session.state.levelId !== scenario.level || app.session.state.dev)
          throw Error('Wrong level or developer-mode fixture');
        p.step = 0;
        p.upgrades = [];
        p.input = () => ({
          moveX: Math.cos((p.step / 60) * 0.45) * 0.6,
          moveY: Math.sin((p.step / 60) * 0.45) * 0.6,
          autoFire: true,
        });
        p.choose = () => {
          while (app.session.screen === 'upgrade') {
            const choices = [...app.session.state.upgradeChoices].sort();
            p.upgrades.push({ step: p.step, choices, selected: choices[0] });
            if (!app.session.upgrade(choices[0])) throw Error('Upgrade failed');
            app.dirty = true;
          }
          if (app.session.screen !== 'playing')
            throw Error('Fixture left combat: ' + app.session.screen);
        };
        while (p.step < scenario.start - warmup) {
          p.choose();
          app.session.tick(1 / 60, p.input());
          p.step++;
        }
        app.clock = p.step / 60;
        p.checkpoint = () =>
          JSON.parse(
            JSON.stringify({
              step: p.step,
              screen: app.session.screen,
              profile: app.session.profile,
              state: app.session.state,
            }),
          );
        const device = cc.director.root.device;
        if (!Number.isFinite(device.numDrawCalls))
          throw Error('Renderer draw-call counter missing');
        return {
          profile: app.session.profile,
          player: app.session.state.player,
          renderer: device.renderer,
          vendor: device.vendor,
          gfxAPI: device.gfxAPI,
          visibility: document.visibilityState,
          preAdvance: p.step,
        };
      },
      { scenario, warmup },
    );
    if (diagnostic) {
      cdp = await context.newCDPSession(page);
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.start');
      await cdp.send('Tracing.start', {
        categories: 'devtools.timeline,v8,blink.user_timing',
        transferMode: 'ReturnAsStream',
      });
    }
    const data = await page.evaluate(
      ({ start, samples }) =>
        new Promise((resolve, reject) => {
          const p = globalThis.__perf;
          const { app, cc } = p;
          const rows = [];
          let before, previous, interval, current, updateStart, updateMs;
          let startCheckpoint;
          const timeout = setTimeout(() => {
            cleanup();
            reject(Error('Performance sample timeout'));
          }, 120000);
          const begin = () => {
            before = performance.now();
            interval = previous === undefined ? null : before - previous;
            previous = before;
            current = null;
          };
          const beforeUpdate = () => {
            updateStart = performance.now();
          };
          const afterUpdate = () => {
            updateMs = performance.now() - updateStart;
          };
          const cleanup = () => {
            clearTimeout(timeout);
            app.update = () => {};
            for (const [event, fn] of events) cc.director.off(event, fn);
          };
          const afterDraw = () => {
            if (current === null) return;
            const phaseMs = performance.now() - before;
            const drawCalls = cc.director.root.device.numDrawCalls;
            if (!Number.isFinite(drawCalls) || !Number.isFinite(interval)) {
              cleanup();
              reject(Error('Invalid real frame metrics'));
              return;
            }
            const s = app.session.state;
            rows.push({
              step: current,
              intervalMs: interval,
              phaseMs,
              updateMs,
              drawCalls,
              enemies: s.enemies.length,
              bullets: s.bullets.length,
              plants: s.plants.length,
              particles: s.particles.length,
              telegraphs: s.telegraphs.length,
              spritePool: app.ui.spritePool.length,
              labelPool: app.ui.labelPool.length,
            });
            if (rows.length === samples) {
              performance.mark('bullet-performance-sample-end');
              cleanup();
              resolve({ rows, start: startCheckpoint, end: p.checkpoint(), upgrades: p.upgrades });
            }
          };
          const events = [
            [cc.Director.EVENT_BEGIN_FRAME, begin],
            [cc.Director.EVENT_BEFORE_UPDATE, beforeUpdate],
            [cc.Director.EVENT_AFTER_UPDATE, afterUpdate],
            [cc.Director.EVENT_AFTER_DRAW, afterDraw],
          ];
          for (const [event, fn] of events) cc.director.on(event, fn);
          app.update = () => {
            try {
              p.choose();
              if (p.step === start) {
                startCheckpoint = p.checkpoint();
                performance.mark('bullet-performance-sample-start');
              }
              const input = p.input();
              app.move.x = input.moveX;
              app.move.y = input.moveY;
              p.originalUpdate(1 / 60);
              if (p.step >= start) current = p.step;
              p.step++;
            } catch (e) {
              cleanup();
              reject(e);
            }
          };
        }),
      { start: scenario.start, samples },
    );
    const name = `${scenario.id}-${diagnostic ? 'diagnostic' : run}`;
    if (diagnostic) {
      const profile = await cdp.send('Profiler.stop');
      const complete = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
      await cdp.send('Tracing.end');
      const { stream } = await complete;
      let trace = '';
      for (;;) {
        const chunk = await cdp.send('IO.read', { handle: stream });
        trace += chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString() : chunk.data;
        if (chunk.eof) break;
      }
      await cdp.send('IO.close', { handle: stream });
      await writeFile(path.join(output, name + '.trace.json.gz'), gzipSync(trace));
      await writeFile(
        path.join(output, name + '.cpuprofile.gz'),
        gzipSync(JSON.stringify(profile.profile)),
      );
    }
    assert.equal(data.rows.length, samples);
    assert.equal(data.rows[0].step, scenario.start);
    assert.equal(data.rows.at(-1).step, scenario.start + samples - 1);
    const result = {
      scenario: scenario.id,
      run,
      diagnostic,
      metadata,
      startHash: stateHash(data.start),
      endHash: stateHash(data.end),
      simulationTime: [data.start.state.time, data.end.state.time],
      metrics: Object.fromEntries(
        Object.keys(data.rows[0])
          .filter((k) => k !== 'step')
          .map((k) => [k, stats(data.rows.map((r) => r[k]))]),
      ),
    };
    await writeFile(path.join(output, name + '.frames.json.gz'), gzipSync(JSON.stringify(data)));
    await page.screenshot({ path: path.join(output, name + '.png') });
    report.results.push(result);
    console.log(JSON.stringify(result));
  } finally {
    await session.close();
  }
}
try {
  for (let i = 1; i <= runs; i++) for (const scenario of scenarios) await run(scenario, i);
  for (const scenario of scenarios) {
    const rows = report.results.filter((r) => r.scenario === scenario.id);
    assert.equal(new Set(rows.map((r) => r.startHash)).size, 1, 'reproducible start');
    assert.equal(new Set(rows.map((r) => r.endHash)).size, 1, 'reproducible end');
  }
  if (process.env.PERF_DIAGNOSTIC === '1') {
    await run(scenarios[1], 0, true);
    const dense = report.results.filter((r) => r.scenario === 'dense');
    assert.equal(
      new Set(dense.map((r) => r.startHash)).size,
      1,
      'diagnostic start matches main samples',
    );
    assert.equal(
      new Set(dense.map((r) => r.endHash)).size,
      1,
      'diagnostic end matches main samples',
    );
  }
  assert.deepEqual(h.errors, []);
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  throw error;
} finally {
  await writeFile(
    path.join(output, 'performance-report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await h.close();
}
