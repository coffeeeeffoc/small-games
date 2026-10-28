import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium, devices } from '@playwright/test';
const report = {
  sourceHash: JSON.parse(await readFile('dist/build-info.json', 'utf8')).sourceHash,
  checks: [],
  crafts: [],
  errors: [],
};
await mkdir('reports/progression', { recursive: true });
const server = spawn(process.execPath, ['scripts/serve.mjs', '--port', '43176'], {
  cwd: process.cwd(),
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'inherit'],
});
let browser;
try {
  await new Promise((resolve, reject) => {
    server.stdout.once('data', resolve);
    server.once('error', reject);
  });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    userAgent: devices['Pixel 7'].userAgent,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const open = async (dev = false) => {
    const p = await context.newPage();
    p.on('pageerror', (e) => report.errors.push(String(e)));
    await p.goto('http://127.0.0.1:43176/?dev=' + (dev ? 1 : 0));
    await p.waitForFunction(
      () => SmallGamesDev.inspect().game?.world.ready && SmallGamesDev.inspect().game?.atlasReady,
      null,
      { timeout: 60000 },
    );
    return p;
  };
  const snap = (p) => p.evaluate(() => SmallGamesDev.inspect().game);
  const tap = async (p, id) => {
    const s = await snap(p),
      c = s.controls.find((c) => c.id === id && !c.disabled);
    assert.ok(c, 'enabled ' + id);
    const v = p.viewportSize(),
      x = (c.x + c.w / 2) * s.scale,
      y = (c.y + c.h / 2) * s.scale;
    await p.touchscreen.tap(v.width < v.height ? v.width - y : x, v.width < v.height ? x : y);
    await p.waitForTimeout(100);
  };
  const a = await open();
  await a.evaluate(() =>
    localStorage.setItem(
      'nullrange-progress-v1',
      JSON.stringify({ version: 1, best: 314, muted: false, reduced: false, sensitivity: 1 }),
    ),
  );
  await a.reload();
  await a.waitForFunction(() => SmallGamesDev.inspect().game?.world.ready);
  await tap(a, 'missions');
  await tap(a, 'mission:ridge-intercept');
  assert.equal((await snap(a)).controls.find((c) => c.id === 'start').disabled, true);
  await tap(a, 'prepare');
  assert.equal((await snap(a)).controls.find((c) => c.id === 'craft:kestrel').disabled, true);
  await tap(a, 'back');
  await tap(a, 'home');
  await tap(a, 'settings');
  const b = await open();
  await tap(b, 'settings');
  await a.evaluate(() => {
    globalThis.lockAcquired = false;
    navigator.locks.request(
      'nullrange-progress-v2',
      () =>
        new Promise((resolve) => {
          globalThis.releaseProgressLock = resolve;
          globalThis.lockAcquired = true;
        }),
    );
  });
  await a.waitForFunction(() => globalThis.lockAcquired);
  await tap(a, 'sound');
  await tap(a, 'reduced');
  await tap(b, 'sensitivity');
  assert.equal(
    await a.evaluate(() => JSON.parse(localStorage.getItem('nullrange-progress-v1')).version),
    1,
    'blocked callbacks do not bypass the lock',
  );
  await a.evaluate(() => releaseProgressLock());
  await a.waitForFunction(() => {
    const p = JSON.parse(localStorage.getItem('nullrange-progress-v1'));
    return p.version === 2 && p.muted && p.reduced && p.sensitivity === 1.3;
  });
  const migrated = await a.evaluate(() =>
    JSON.parse(localStorage.getItem('nullrange-progress-v1')),
  );
  assert.equal(migrated.best, 314);
  assert.deepEqual(migrated.completed, {});
  report.checks.push(
    'two stale real pages, held Web Lock, three queued field-specific changes preserved; v1 migrated without wins',
  );
  await b.close();
  await tap(a, 'back');
  const dev = await open(true);
  await tap(dev, 'missions');
  await tap(dev, 'mission-page');
  await dev.screenshot({ path: 'reports/progression/missions-4-6.png' });
  await tap(dev, 'prepare');
  for (const [id, nozzles] of [
    [
      'falcon',
      [
        [-1.18, -0.16, 8.8],
        [1.18, -0.16, 8.8],
      ],
    ],
    [
      'kestrel',
      [
        [-0.72, -0.1, 7.1],
        [0.72, -0.1, 7.1],
      ],
    ],
    [
      'warden',
      [
        [-1.5, -0.1, 8.05],
        [1.5, -0.1, 8.05],
      ],
    ],
  ]) {
    await tap(dev, 'craft:' + id);
    await dev.waitForFunction((id) => SmallGamesDev.inspect().game?.world.aircraft === id, id);
    const s = await snap(dev);
    s.world.nozzles.forEach((p, i) =>
      ['x', 'y', 'z'].forEach((k, j) => assert.ok(Math.abs(p[k] - nozzles[i][j]) < 1e-5)),
    );
    await dev.screenshot({ path: 'reports/progression/hangar-' + id + '.png' });
    report.crafts.push({ id, world: s.world });
  }
  assert.equal(
    await dev.evaluate(
      () => JSON.parse(localStorage.getItem('nullrange-progress-v1')).selectedCraft,
    ),
    'falcon',
    'practice selection never writes normal craft',
  );
  for (const [width, height] of [
    [667, 375],
    [844, 390],
    [932, 430],
    [390, 844],
  ]) {
    await dev.setViewportSize({ width, height });
    await dev.waitForTimeout(250);
    await tap(dev, 'back');
    await tap(dev, 'mission-page');
    for (let i = 0; i < 2; i++) {
      const s = await snap(dev);
      for (const c of s.controls) {
        assert.ok(Math.min(c.w, c.h) * s.scale >= 43.9);
        assert.ok(
          c.x >= s.safe.left &&
            c.y >= s.safe.top &&
            c.x + c.w <= s.safe.right + 0.1 &&
            c.y + c.h <= s.safe.bottom + 0.1,
        );
      }
      await dev.screenshot({ path: `reports/progression/cards-${i}-${width}x${height}.png` });
      await tap(dev, 'mission-page');
    }
    await tap(dev, 'prepare');
  }
  await tap(dev, 'start');
  await dev.waitForTimeout(500);
  await dev.screenshot({ path: 'reports/progression/warden-flight.png' });
  await tap(dev, 'pause');
  await tap(dev, 'home');
  assert.deepEqual(
    await dev.evaluate(() => JSON.parse(localStorage.getItem('nullrange-progress-v1'))),
    migrated,
  );
  report.checks.push(
    'three actual GLB selections, authored nozzle transforms, both card pages in four sizes; developer mode leaves progress untouched',
  );
  await dev.close();
  for (const raw of ['', 'broken', '{"version":99,"keep":"future"}']) {
    await a.evaluate((raw) => localStorage.setItem('nullrange-progress-v1', raw), raw);
    await a.reload();
    await a.waitForFunction(() => SmallGamesDev.inspect().game?.world.ready);
    await tap(a, 'settings');
    await tap(a, 'sound');
    await a.waitForTimeout(200);
    assert.equal(await a.evaluate(() => localStorage.getItem('nullrange-progress-v1')), raw);
  }
  report.checks.push('real UI changes preserve corrupt and future storage bytes');
  assert.deepEqual(report.errors, []);
  await context.close();
} finally {
  await writeFile('reports/progression/report.json', JSON.stringify(report, null, 2));
  await browser?.close();
  server.kill();
}
console.log('PASS B4 progression, queued Web Locks, three aircraft and four-size cards');
