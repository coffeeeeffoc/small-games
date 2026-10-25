import assert from 'node:assert/strict';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../levels.mjs';
import { fixture, ready, tap, settled, snap } from '../tests/browser-support.mjs';

// Records real production Cocos frames and browser touch input, without state injection.
const output = new URL('../publishing/', import.meta.url);
const temporary = new URL('../test-results/recording/', import.meta.url);
await mkdir(temporary, { recursive: true });
for (const folder of ['gameplay/screenshots/', 'gameplay/videos/', 'icon/'])
  await mkdir(new URL(folder, output), { recursive: true });
const host = await fixture();
const context = await host.browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  recordVideo: { dir: fileURLToPath(temporary), size: { width: 390, height: 844 } },
});
const page = await context.newPage();
const screenshot = (name) =>
  page.screenshot({
    path: fileURLToPath(new URL(`gameplay/screenshots/${name}-390x844.png`, output)),
  });
try {
  await page.goto(host.base);
  await ready(page);
  await page.waitForTimeout(1200);
  await screenshot('home');
  await tap(page, 'levels-button');
  await page.waitForTimeout(1400);
  await screenshot('levels');
  await tap(page, 'level-0');
  await page.waitForTimeout(1800);
  await screenshot('play');
  await tap(page, 'predict');
  await tap(page, 'gate-AB');
  await page.waitForTimeout(1700);
  await screenshot('prediction');
  await tap(page, 'gate-AB');
  await settled(page);
  assert.equal((await snap(page)).state.won, true);
  await page.waitForTimeout(1800);
  await screenshot('result');
  await tap(page, 'next-level');
  await page.waitForTimeout(1200);
  await tap(page, 'gate-AB');
  await settled(page);
  await page.waitForTimeout(1500);
  await tap(page, 'pause');
  await page.waitForTimeout(1300);
  await screenshot('pause');
  await tap(page, 'resume');
  await page.waitForTimeout(900);
  await tap(page, 'gate-BC');
  await settled(page);
  assert.equal((await snap(page)).state.won, true);
  await page.waitForTimeout(1600);
  await tap(page, 'next-level');
  await page.waitForTimeout(1300);
  for (const gate of LEVELS[2].solution) {
    await tap(page, `gate-${gate}`);
    await settled(page);
    await page.waitForTimeout(1400);
  }
  assert.equal((await snap(page)).state.won, true);
  await tap(page, 'result-home');
  await page.waitForTimeout(1300);
  const video = page.video();
  await context.close();
  const target = new URL('gameplay/videos/station-tour-390x844.webm', output);
  await rm(target, { force: true });
  await rename(await video.path(), target);

  const icon = await host.browser.newPage({ viewport: { width: 512, height: 512 } });
  const svg = await readFile(new URL('../icon.svg', import.meta.url), 'utf8');
  await icon.setContent(
    `<style>html,body{margin:0;background:#082a3a}svg{display:block;width:512px;height:512px}</style>${svg}`,
  );
  await icon.screenshot({ path: fileURLToPath(new URL('icon/waterline-512.png', output)) });
  await icon.close();
  console.log('Recorded real Cocos touch tour, six screenshots and rendered original SVG icon.');
} finally {
  await host.close();
}
