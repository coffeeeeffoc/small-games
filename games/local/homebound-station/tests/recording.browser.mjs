import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { sourceHash } from '../scripts/artifact.mjs';

const base = process.env.HOMEBOUND_URL || 'http://127.0.0.1:4326/';
const out = fileURLToPath(
  new URL('../docs/design/menu-courtyard-2026-10-24/runtime/', import.meta.url),
);
const videoDir = fileURLToPath(new URL('../reports/recording/', import.meta.url));
const info = await fetch(new URL('build-info.json', base)).then((r) => r.json());
assert.equal(info.creator, '3.8.8');
assert.equal(info.sourceHash, await sourceHash());
await mkdir(out, { recursive: true });
await mkdir(videoDir, { recursive: true });
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  reducedMotion: 'reduce',
  recordVideo: { dir: videoDir, size: { width: 390, height: 844 } },
});
const page = await context.newPage();
const errors = [],
  actions = [];
page.on('pageerror', (e) => errors.push(e.message));
const snapshot = () =>
  page.evaluate(() => ({ state: window.homeboundSnapshot(), view: window.homeboundView() }));
try {
  await page.goto(base + '?dev=0');
  await page.waitForFunction(() => window.homeboundView?.().page === 'home');
  await page.waitForTimeout(1200);
  const home = await snapshot();
  const start = home.view.buttons.find((b) => b.id === 'continue');
  assert.equal(start.label, '开始游戏');
  await page.touchscreen.tap(start.x + start.w / 2, start.y + start.h / 2);
  await page.waitForFunction(() => window.homeboundView().page === 'playing');
  const initial = await snapshot();
  const deadline = Date.now() + 180000;
  let parallel;
  let boardingShot = false;
  while (Date.now() < deadline) {
    const frame = await snapshot();
    assert.equal(frame.view.speed, 1);
    assert.equal(frame.view.practice, false);
    if (frame.state.won) break;
    if (
      !boardingShot &&
      frame.state.services.some((job) => ['walking', 'boarding'].includes(job.phase))
    ) {
      await page.screenshot({ path: out + 'recording-dispatch-390.png' });
      boardingShot = true;
    }
    const car = frame.view.cars.find((v) => v.available);
    if (car) {
      await page.touchscreen.tap(car.x, car.y);
      actions.push({ time: frame.state.time, id: car.id, x: car.x, y: car.y });
    }
    if (!parallel && frame.state.services.length >= 2) {
      parallel = frame;
      await page.screenshot({ path: out + 'parallel-390x844.png' });
    }
    await page.waitForTimeout(550);
  }
  const final = await snapshot();
  assert.equal(final.state.won, true);
  assert.equal(boardingShot, true, 'Observe boarding during the real recording');
  assert.equal(final.view.page, 'result');
  assert.ok(final.view.progress.stars[0] > 0);
  assert.deepEqual(errors, []);
  await page.waitForTimeout(1800);
  await writeFile(
    out + 'recording-input.json',
    JSON.stringify(
      {
        environment:
          'Creator 3.8.8 Web Mobile; Chromium touch emulation; real touches, 1x, no ad fixture; silent recording',
        source: info,
        initial,
        parallel,
        actions,
        final,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await page.video().saveAs(videoDir + 'level01-1x-390x844.webm');
  await browser.close();
}
const raw = videoDir + 'level01-1x-390x844.webm';
assert.ok((await readFile(raw)).length > 10000);
const full = fileURLToPath(
  new URL('../publishing/gameplay/videos/level01-courtyard-1x-390x844.mp4', import.meta.url),
);
const promo = fileURLToPath(
  new URL('../publishing/promo/videos/homebound-courtyard-preview-390x844.mp4', import.meta.url),
);
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  return result.stdout;
}
run('ffmpeg', [
  '-y',
  '-hide_banner',
  '-loglevel',
  'error',
  '-i',
  raw,
  '-an',
  '-c:v',
  'libx264',
  '-threads',
  '2',
  '-crf',
  '20',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  full,
]);
const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-show_format', '-of', 'json', full]));
const end = Number(probe.format.duration);
assert.ok(end > 21);
const cut = `[0:v]trim=0:3,setpts=PTS-STARTPTS[a];[0:v]trim=5:18,setpts=PTS-STARTPTS[b];[0:v]trim=start=${end - 3},setpts=PTS-STARTPTS[c];[a][b][c]concat=n=3:v=1:a=0[v]`;
run('ffmpeg', [
  '-y',
  '-hide_banner',
  '-loglevel',
  'error',
  '-i',
  full,
  '-filter_complex',
  cut,
  '-filter_complex_threads',
  '1',
  '-map',
  '[v]',
  '-an',
  '-c:v',
  'libx264',
  '-threads',
  '2',
  '-crf',
  '20',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  promo,
]);
for (const file of [full, promo])
  run('ffmpeg', ['-v', 'error', '-threads', '2', '-i', file, '-f', 'null', '-']);
console.log(JSON.stringify({ full, promo, duration: end, decoded: true }));
