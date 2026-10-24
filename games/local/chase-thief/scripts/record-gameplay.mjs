import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { waveAt, sampleRoute, segmentInfo, WAVE_SPACING } from '../assets/scripts/core/route.ts';
const output = new URL('../publishing/gameplay/videos/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || chromium.executablePath(),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  recordVideo: { dir: fileURLToPath(output), size: { width: 390, height: 844 } },
});
const page = await context.newPage(),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.CHASE_URL || 'http://127.0.0.1:4417/?dev=0');
await expect
  .poll(() => page.evaluate(() => __chase?.snapshot().ready), { timeout: 60000 })
  .toBe(true);
const snap = () => page.evaluate(() => __chase.snapshot());
async function tap(id) {
  await expect.poll(async () => (await snap()).controls.some((c) => c.id === id)).toBe(true);
  const s = await snap(),
    c = s.controls.find((c) => c.id === id);
  await page.touchscreen.tap(c.x + c.w / 2, c.y + c.h / 2);
}
await page.screenshot({
  path: fileURLToPath(
    new URL('../publishing/gameplay/screenshots/home-390x844.png', import.meta.url),
  ),
});
await tap('start');
const start = Date.now();
let captured = false;
while (Date.now() - start < 42000) {
  const s = await snap();
  if (s.screen !== 'running') break;
  if (!captured && s.distance > 125) {
    await page.screenshot({
      path: fileURLToPath(
        new URL('../publishing/gameplay/screenshots/chase-390x844.png', import.meta.url),
      ),
    });
    captured = true;
  }
  const wave = Math.max(0, Math.floor((s.distance - 38) / WAVE_SPACING));
  const obstacles = [waveAt(wave, s.seed, s.departure), waveAt(wave + 1, s.seed, s.departure)]
    .flat()
    .filter((o) => o.at > s.distance);
  const next = obstacles.find((o) => o.lane === s.lane);
  if (next && next.at - s.distance < s.speed * 0.38) {
    if (['barrier', 'barrel', 'gap'].includes(next.type) && s.action === 'run')
      await page.keyboard.press('ArrowUp');
    else if (next.type === 'beam' && s.action === 'run') await page.keyboard.press('ArrowDown');
  }
  if (next && ['crate', 'cart'].includes(next.type) && next.at - s.distance < s.speed * 0.85) {
    const safe = [0, 1, 2].find((l) => !obstacles.some((o) => o.at === next.at && o.lane === l));
    if (safe !== undefined && safe !== s.lane)
      await page.keyboard.press(safe < s.lane ? 'ArrowLeft' : 'ArrowRight');
  }
  const route = sampleRoute(s.distance, s.seed, s.departure),
    info = segmentInfo(route.index, s.seed, s.departure);
  if (route.fork && route.split < 0.5 && s.distance - info.start < 30) {
    const lane = info.riskSide === 0 ? 2 : 0;
    if (s.lane !== lane) await page.keyboard.press(lane < s.lane ? 'ArrowLeft' : 'ArrowRight');
  }
  await page.waitForTimeout(60);
}
const final = await snap();
await writeFile(
  new URL('recording.json', output),
  JSON.stringify(
    {
      captured: new Date().toISOString(),
      artifactSha256: JSON.parse(
        await readFile(new URL('../dist/build-info.json', import.meta.url)),
      ).artifactSha256,
      browser: browser.version(),
      input: 'real touchscreen menus and keyboard gameplay; no dev API, no manual clock',
      viewport: { width: 390, height: 844 },
      elapsedRealSeconds: (Date.now() - start) / 1000,
      final,
      errors,
    },
    null,
    2,
  ),
);
const video = page.video();
await context.close();
await video.saveAs(fileURLToPath(new URL('city-chase-390x844.webm', output)));
await video.delete();
await browser.close();
console.log(JSON.stringify({ distance: final.distance, health: final.health, errors }));
