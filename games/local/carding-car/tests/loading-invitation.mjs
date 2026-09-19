import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { sourceHash } from '../scripts/artifact.mjs';
import { invitationQuery } from '../assets/scripts/Invitation.ts';

const url = process.env.KART_URL || 'http://127.0.0.1:43003/play/';
const report = new URL('../reports/loading-invitation/', import.meta.url);
await mkdir(report, { recursive: true });
assert.equal(
  (await fetch(new URL('build-info.json', url)).then((r) => r.json())).sourceHash,
  await sourceHash(),
);
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const errors = [],
  evidence = {};
const snapshot = (page) => page.evaluate(() => __kart.snapshot());
const loaded = (page) =>
  page.waitForFunction(
    () =>
      globalThis.__kart?.snapshot().multiplayer &&
      !__kart.snapshot().loading &&
      __kart.snapshot().modelsLoaded,
    null,
    { timeout: 120000 },
  );
const roomLoaded = (page) =>
  page.waitForFunction(
    () =>
      __kart
        .snapshot()
        .multiplayer.room.members.every(
          (m) => m.loadedRevision === __kart.snapshot().multiplayer.room.revision,
        ),
    null,
    { timeout: 120000 },
  );
async function open(target) {
  const context = await browser.newContext({
    viewport: { width: 960, height: 540 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  const start = Date.now();
  await page.goto(target);
  await loaded(page);
  return { page, requests, milliseconds: Date.now() - start };
}
try {
  const host = await open(url),
    page = host.page;
  const initial = await snapshot(page);
  evidence.firstLoadMs = host.milliseconds;
  evidence.initialArt = initial.requestedArt;
  assert.equal(initial.renderedVehicles.length, 1);
  assert.ok(initial.requestedArt.includes('art-vehicle-classic-kart/classic-kart/classic-kart'));
  assert.ok(initial.requestedArt.includes('art-road/asphalt/texture'));
  assert.equal(initial.audioClips, 0);
  assert.ok(
    !initial.requestedArt.some((p) => /art-items|art-audio|art-texture-|art-scene-/.test(p)),
  );
  assert.ok(
    host.requests
      .filter((p) => /assets\/art-vehicle-/.test(p))
      .every((p) => p.includes('art-vehicle-classic-kart')),
  );
  assert.ok(
    host.requests
      .filter((p) => /assets\/art-driver-/.test(p))
      .every((p) => p.includes('art-driver-rookie')),
  );
  const response = await fetch(new URL('index.html', url));
  const cached = await fetch(new URL('index.html', url), {
    headers: { 'If-None-Match': response.headers.get('etag') },
  });
  assert.equal(cached.status, 304);
  await page.mouse.click(126, 117);
  await page.setViewportSize({ width: 1593, height: 726 });
  const click = async (x, y) => {
    const bounds = await page.locator('canvas').first().boundingBox();
    await page.mouse.click(
      bounds.x + (bounds.width * x) / 960,
      bounds.y + (bounds.height * y) / 540,
    );
  };
  await click(480, 190);
  await page.locator('input:visible').fill('房主测试');
  await click(480, 258);
  await page.locator('input:visible').fill('ABCD1234');
  await click(200, 330);
  await page.screenshot({ path: fileURLToPath(new URL('inputs-1593.png', report)) });
  await page.setViewportSize({ width: 960, height: 540 });
  await page.waitForTimeout(350); // Cocos debounces canvas resize.
  await page.mouse.click(350, 335);
  await page.waitForFunction(() => __kart.snapshot().multiplayer.room);
  await roomLoaded(page);
  // Capture a real copied invitation after all four host choices change.
  for (const y of [172, 212, 252, 292]) {
    const revision = (await snapshot(page)).multiplayer.room.revision;
    await page.mouse.click(449, y);
    await page.waitForFunction((r) => __kart.snapshot().multiplayer.room.revision > r, revision);
    await roomLoaded(page);
  }
  const room = (await snapshot(page)).multiplayer.room;
  await page.mouse.click(155, 430);
  const link = await page.evaluate(() => navigator.clipboard.readText());
  for (const field of ['theme', 'route', 'vehicle', 'driver'])
    assert.equal(new URL(link).searchParams.get(field), room[field]);
  const guest = await open(link),
    friend = guest.page;
  assert.equal((await snapshot(friend)).multiplayer.entryVisible, false);
  assert.equal((await snapshot(friend)).multiplayer.invite.code, room.code);
  for (const field of ['theme', 'route', 'vehicle', 'driver'])
    assert.equal((await snapshot(friend)).selection[field], room[field]);
  assert.ok(
    !guest.requests.some(
      (p) => p.includes('art-vehicle-classic-kart') || p.includes('art-driver-rookie'),
    ),
  );
  await friend.screenshot({ path: fileURLToPath(new URL('confirm.png', report)) });
  await friend.mouse.click(610, 335);
  await friend.waitForFunction(() => __kart.snapshot().multiplayer.room?.members.length === 2);
  await roomLoaded(page);
  // A guest cannot change choices through the lobby controls.
  await friend.mouse.click(449, 172);
  assert.equal((await snapshot(friend)).multiplayer.room.revision, room.revision);
  for (const y of [172, 212, 252, 292]) {
    const revision = (await snapshot(page)).multiplayer.room.revision;
    await page.mouse.click(449, y);
    await friend.waitForFunction((r) => __kart.snapshot().multiplayer.room.revision > r, revision);
    await roomLoaded(page);
    assert.deepEqual((await snapshot(friend)).selection, (await snapshot(page)).selection);
  }
  await friend.screenshot({ path: fileURLToPath(new URL('synced-lobby.png', report)) });
  const oldLink = new URL(link);
  oldLink.search = invitationQuery(room.code, room);
  const stale = await open(oldLink.href);
  await stale.page.mouse.click(610, 335);
  await stale.page.waitForFunction(() => __kart.snapshot().multiplayer.room?.members.length === 3);
  await roomLoaded(page);
  assert.deepEqual((await snapshot(stale.page)).selection, (await snapshot(page)).selection);
  const expired = await open(oldLink.href.replace(room.code, '00000000'));
  await expired.page.mouse.click(610, 335);
  await expired.page.waitForFunction(() => __kart.snapshot().multiplayer.status.includes('不存在'));
  assert.equal((await snapshot(expired.page)).multiplayer.entryVisible, false);
  await expired.page.mouse.click(350, 335);
  assert.equal((await snapshot(expired.page)).multiplayer.panelOpen, false);
  evidence.inviteLoadMs = guest.milliseconds;
  evidence.errors = errors;
  assert.deepEqual(errors, []);
  await writeFile(new URL('validation.json', report), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally {
  await browser.close();
}
