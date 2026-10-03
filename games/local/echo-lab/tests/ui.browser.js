/** Optional E2E smoke; application has no Playwright runtime dependency. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computePaths } from '../src/acoustics.js';
import { encodeWav } from '../src/audio.js';
import { readRoomLink } from '../src/layout.js';
import { once } from 'node:events';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
let base = process.env.ECHO_LAB_URL;
let server;
if (!base) {
  process.env.PORT = '0';
  ({ server } = await import('../server.js'));
  if (!server.listening) await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
}
const qaDirectory =
  process.env.ECHO_LAB_QA ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.scratch/echo-lab-qa');
await mkdir(qaDirectory, { recursive: true });
let browser;
const browserOptions = {
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
  args: [
    '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
};
const errors = [];
const results = [];
const waitValue = (page, id, expected) =>
  page.waitForFunction(({ id, expected }) => document.getElementById(id).value === expected, {
    id,
    expected,
  });
const download = async (page, id) => {
  const pending = page.waitForEvent('download');
  await page.locator(`#${id}`).click();
  const item = await pending;
  assert.equal(await item.failure(), null);
  return { filename: item.suggestedFilename(), file: await item.path() };
};
const saveLayout = async (page) =>
  JSON.parse(await readFile((await download(page, 'saveLayout')).file, 'utf8'));
const unzipStored = (zip) => {
  const files = new Map();
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18);
    const length = zip.readUInt16LE(offset + 26);
    const extra = zip.readUInt16LE(offset + 28);
    const start = offset + 30 + length + extra;
    files.set(
      zip.toString('utf8', offset + 30, offset + 30 + length),
      zip.subarray(start, start + size),
    );
    offset = start + size;
  }
  return files;
};
const touchGesture = async (page, start, points, cancel = false) => {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...start, id: 1 }],
    });
    for (const point of points)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ ...point, id: 1 }],
      });
    await cdp.send('Input.dispatchTouchEvent', {
      type: cancel ? 'touchCancel' : 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await cdp.detach();
  }
};

try {
  browser = await chromium.launch(browserOptions);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('#scene [data-object="reflector-1"]'));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(qaDirectory, 'echo-lab-desktop.png'), fullPage: true });

  await page.locator('#playWet').click();
  await page.waitForFunction(() =>
    document.getElementById('playWet').classList.contains('playing'),
  );
  assert.match(await page.locator('#animationLabel').textContent(), /慢放/);
  await page.locator('#stopAudio').click();
  await page.locator('#playDry').click();
  await page.waitForFunction(() =>
    document.getElementById('playDry').classList.contains('playing'),
  );
  await page.locator('#stopAudio').click();
  results.push('wet/dry playback and stop');

  const initialRoom = await page.locator('#roomBadge').textContent();
  await page.locator('#preset').selectOption('hall');
  assert.notEqual(await page.locator('#roomBadge').textContent(), initialRoom);
  await page.locator('#preset').selectOption('dry');
  assert.match(await page.locator('#presetDescription').textContent(), /柔软/);
  await page.locator('#preset').selectOption('first');
  results.push('three scene presets');

  const initialDelay = await page.locator('#echoDelay').textContent();
  const initialX = Number(await page.locator('#positionX').inputValue());
  const reflector = page.locator('[data-object="reflector-1"] circle[r="4"]');
  await reflector.scrollIntoViewIfNeeded();
  const box = await reflector.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 90, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  assert.ok(
    Number(await page.locator('#positionX').inputValue()) < initialX - 2,
    'drag must move the physical panel',
  );
  assert.notEqual(
    await page.locator('#echoDelay').textContent(),
    initialDelay,
    'drag must update the actual audible delay',
  );
  results.push('pointer drag changes geometry and echo time');

  await page.locator('#roomWidth').focus();
  await page.locator('#roomWidth').press('Home');
  await waitValue(page, 'roomWidth', '8');
  const narrow = (await saveLayout(page)).scene;
  assert.equal(narrow.width, 8);
  assert.ok(narrow.source.x <= 7.8 && narrow.listener.x <= 7.8);
  assert.ok(narrow.panels.every((panel) => panel.x <= 7.8 && panel.x >= 0.2));
  await page.locator('#resetLayout').click();
  results.push('room resize clamps scene objects');

  await page.locator('#addAbsorber').click();
  assert.equal((await page.locator('#panelCount').textContent()).trim(), '2 / 8');
  assert.match(await page.locator('#selectionTitle').textContent(), /吸音屏/);
  const addedId = await page
    .locator('[data-object]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.object).find((id) => id.startsWith('panel-')),
    );
  await page.locator('[data-object="source"] circle[r="16"]').click();
  assert.match(await page.locator('#selectionTitle').textContent(), /发声点/);
  await page.locator(`[data-object="${addedId}"] circle[r="4"]`).click();
  assert.match(await page.locator('#selectionTitle').textContent(), /吸音屏/);
  await page.locator('#removePanel').click();
  assert.equal((await page.locator('#panelCount').textContent()).trim(), '1 / 8');
  results.push('add/select/remove absorber');

  const saved = await saveLayout(page);
  assert.equal(saved.format, 'echo-lab');
  assert.equal(saved.version, 2);
  const badge = await page.locator('#roomBadge').textContent();
  await page.locator('#layoutFile').setInputFiles({
    name: 'invalid-layout.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...saved, scene: { ...saved.scene, width: 'invalid' } })),
  });
  await page.waitForFunction(() =>
    document.getElementById('toast').textContent.startsWith('导入失败'),
  );
  assert.equal(await page.locator('#roomBadge').textContent(), badge);
  await page.locator('#preset').selectOption('hall');
  await page.locator('#layoutFile').setInputFiles({
    name: 'saved-layout.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await page.waitForFunction(() =>
    document.getElementById('toast').textContent.startsWith('布局已导入'),
  );
  assert.equal(await page.locator('#roomBadge').textContent(), badge);
  results.push('layout JSON download/import and invalid input rejection');

  await page.locator('.export-menu summary').click();
  const wavDownload = await download(page, 'exportAudio');
  assert.match(wavDownload.filename, /\.wav$/);
  const wav = await readFile(wavDownload.file);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt32LE(4), wav.length - 8);
  assert.equal(wav.readUInt16LE(22), 2);
  const exportedSeconds = wav.readUInt32LE(40) / wav.readUInt32LE(28);
  const expectedSeconds =
    0.32 + Math.max(...computePaths(saved.scene).paths.map((entry) => entry.delay)) + 0.05;
  assert.ok(
    Math.abs(exportedSeconds - expectedSeconds) < 2 / wav.readUInt32LE(24),
    'download must contain the complete physical tail',
  );
  results.push(`stereo WAV download including full ${exportedSeconds.toFixed(3)}s tail`);
  const dryWav = await readFile((await download(page, 'exportDry')).file);
  assert.ok(dryWav.readUInt32LE(40) / dryWav.readUInt32LE(28) < exportedSeconds);
  const pair = await download(page, 'exportBoth');
  assert.match(pair.filename, /\.zip$/);
  const files = unzipStored(await readFile(pair.file));
  assert.deepEqual(
    [...files.keys()],
    ['echo-lab-original.wav', 'echo-lab-processed.wav', 'echo-lab-room.json'],
  );
  assert.deepEqual(
    files.get('echo-lab-original.wav'),
    dryWav,
    'pair must preserve exactly the original audition',
  );
  assert.deepEqual(
    files.get('echo-lab-processed.wav'),
    wav,
    'pair must preserve exactly the effect including full tail',
  );
  assert.deepEqual(JSON.parse(files.get('echo-lab-room.json')), saved);
  results.push('single ZIP download with original, processed WAV and matching room configuration');
  await page.locator('.export-menu summary').click();

  await page.locator('.wall-settings summary').click();
  await page.locator('#wall-top-override').check();
  await page.locator('#wall-top-reflection').focus();
  await page.locator('#wall-top-reflection').press('Home');
  await page.locator('#wallReflection').focus();
  await page.locator('#wallReflection').press('End');
  let walls = (await saveLayout(page)).scene;
  assert.equal(walls.wallReflections['wall-top'], 0);
  assert.equal(walls.wallReflection, 0.95);
  assert.equal(await page.locator('#wall-right-reflection').inputValue(), '95');
  await page.locator('#wall-top-override').uncheck();
  assert.equal(await page.locator('#wall-top-reflection').inputValue(), '95');
  const leftWall = page.locator('#scene [data-wall="wall-left"]');
  const wallBox = await leftWall.boundingBox();
  await leftWall.click({ position: { x: wallBox.width / 2, y: wallBox.height / 3 } });
  assert.match(await page.locator('#selectionTitle').textContent(), /左墙/);
  await page.locator('#selectedWallDefault').uncheck();
  await page.locator('#selectedWallReflection').focus();
  await page.locator('#selectedWallReflection').press('Home');
  walls = (await saveLayout(page)).scene;
  assert.equal(walls.wallReflections['wall-left'], 0);
  assert.ok(computePaths(walls).paths.every((entry) => !entry.surfaces.includes('wall-left')));
  results.push('uniform walls, independent override, reset and wall selection on canvas');

  await page.locator('#soundSelect').selectOption('chime');
  await page.locator('#volume').focus();
  await page.locator('#volume').press('Home');
  await page.locator('#volume').press('ArrowRight');
  const shareSnapshot = await saveLayout(page);
  assert.equal(shareSnapshot.sound, 'chime');
  assert.equal(shareSnapshot.volume, 1);
  await page.locator('#shareLayout').click();
  const sharedUrl = await page.locator('#shareLink').inputValue();
  assert.deepEqual(readRoomLink(sharedUrl), shareSnapshot);
  assert.equal((await download(page, 'downloadShareLink')).filename, 'echo-lab-room-link.txt');
  await page.locator('#closeShare').click();
  const recipient = await browser.newContext({ acceptDownloads: true });
  const recipientPage = await recipient.newPage();
  recipientPage.on('pageerror', (error) => errors.push(`recipient: ${error.message}`));
  await recipientPage.goto(base);
  await recipientPage.locator('#preset').selectOption('dry');
  await recipientPage.waitForTimeout(300);
  await recipientPage.goto(sharedUrl);
  await recipientPage.locator('#sharedRoom').waitFor({ state: 'visible' });
  assert.equal(
    await recipientPage.locator('#roomBadge').textContent(),
    '24 × 18 m',
    'arrival must preserve recipient room until one-click apply',
  );
  await recipientPage.locator('#applySharedRoom').click();
  assert.deepEqual(await saveLayout(recipientPage), shareSnapshot);
  await recipientPage.waitForTimeout(300);
  await recipientPage.reload();
  assert.deepEqual(await saveLayout(recipientPage), shareSnapshot, 'applied room must persist');
  await recipientPage.goto(`${base}/#room=bad!`);
  assert.equal(await recipientPage.locator('#sharedRoom').isVisible(), false);
  assert.deepEqual(
    await saveLayout(recipientPage),
    shareSnapshot,
    'invalid links must leave local room intact',
  );
  await recipient.close();
  results.push(
    'share link into a separate browser context, one-click restore, persistence and invalid-link recovery',
  );
  await page.locator('#resetLayout').click();

  const clip = new Float32Array(8000 * 0.18);
  for (let i = 0; i < clip.length; i += 1) clip[i] = 0.2 * Math.sin((2 * Math.PI * 330 * i) / 8000);
  const customWav = encodeWav({
    numberOfChannels: 1,
    length: clip.length,
    sampleRate: 8000,
    getChannelData: () => clip,
  });
  await page.locator('#audioFile').setInputFiles({
    name: 'my-test-tone.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from(await customWav.arrayBuffer()),
  });
  await waitValue(page, 'soundSelect', 'custom');
  const customInfo = await page.locator('#inputInfo').textContent();
  assert.match(customInfo, /0\.18 秒.*你的声音/);
  await page.locator('#soundSelect').selectOption('chime');
  await page.waitForFunction(() =>
    document.getElementById('inputInfo').textContent.includes('内置测试音'),
  );
  await page.locator('#soundSelect').selectOption('custom');
  assert.equal(await page.locator('#inputInfo').textContent(), customInfo);
  assert.equal(await page.locator('#inputInfo').getAttribute('title'), 'my-test-tone.wav');
  results.push('audio upload and custom → builtin → custom retention');

  await page.locator('#recordAudio').click();
  await page.waitForFunction(() =>
    document.getElementById('recordAudio').classList.contains('recording'),
  );
  await page.waitForTimeout(1100);
  await page.locator('#recordAudio').click();
  await page.waitForFunction(
    () =>
      !document.getElementById('recordAudio').classList.contains('recording') &&
      document.getElementById('inputInfo').title === '我的录音',
  );
  assert.equal(await page.locator('#playWet').isDisabled(), false);
  results.push('real MediaRecorder start/stop via synthetic browser microphone');

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const mobilePage = await mobile.newPage();
  mobilePage.on('pageerror', (error) => errors.push(`mobile: ${error.message}`));
  mobilePage.on('console', (message) => {
    if (message.type() === 'error') errors.push(`mobile console: ${message.text()}`);
  });
  await mobilePage.goto(base);
  await mobilePage.waitForFunction(() => document.querySelector('#scene [data-object="source"]'));
  await mobilePage.evaluate(() => document.fonts.ready);
  assert.equal(
    await mobilePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    'mobile viewport must not overflow horizontally',
  );
  await mobilePage.screenshot({
    path: path.join(qaDirectory, 'echo-lab-mobile.png'),
    fullPage: true,
  });
  await mobilePage.locator('#playWet').tap();
  await mobilePage.waitForFunction(() =>
    document.getElementById('playWet').classList.contains('playing'),
  );
  await mobilePage.locator('#stopAudio').tap();
  results.push('390px responsive layout and touch playback');
  const originalSource = (await saveLayout(mobilePage)).scene.source;
  const sourceIcon = mobilePage.locator('#scene [data-object="source"] circle[r="16"]');
  await sourceIcon.scrollIntoViewIfNeeded();
  const sourceBox = await sourceIcon.boundingBox();
  const sourceCenter = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  };
  await touchGesture(mobilePage, sourceCenter, [
    { x: sourceCenter.x + 20, y: sourceCenter.y - 12 },
  ]);
  const movedSource = (await saveLayout(mobilePage)).scene.source;
  assert.ok(
    movedSource.x > originalSource.x + 2 && movedSource.y < originalSource.y - 1,
    'source callout must drag the actual emission point',
  );
  await mobilePage.locator('#resetLayout').tap();
  await mobilePage.locator('#scene [data-object="reflector-1"] circle[r="4"]').tap();
  await mobilePage
    .locator('#scene [data-object="reflector-1"] circle[r="4"]')
    .scrollIntoViewIfNeeded();
  const panelBox = await mobilePage
    .locator('#scene [data-object="reflector-1"] circle[r="4"]')
    .boundingBox();
  const panelCenter = { x: panelBox.x + panelBox.width / 2, y: panelBox.y + panelBox.height / 2 };
  const beforeX = Number(await mobilePage.locator('#positionX').inputValue());
  await touchGesture(
    mobilePage,
    panelCenter,
    [1, 2, 3].map((i) => ({ x: panelCenter.x + i * 10, y: panelCenter.y })),
  );
  assert.ok(Number(await mobilePage.locator('#positionX').inputValue()) > beforeX + 2);
  const geometryBeforeRotation = computePaths((await saveLayout(mobilePage)).scene);
  await mobilePage.locator('#scene').scrollIntoViewIfNeeded();
  const handleBox = await mobilePage.locator('#scene [data-rotate] circle').first().boundingBox();
  const centerBox = await mobilePage
    .locator('#scene [data-object="reflector-1"] circle[r="4"]')
    .boundingBox();
  const center = { x: centerBox.x + centerBox.width / 2, y: centerBox.y + centerBox.height / 2 };
  const handleCenter = {
    x: handleBox.x + handleBox.width / 2,
    y: handleBox.y + handleBox.height / 2,
  };
  const radius = Math.hypot(handleCenter.x - center.x, handleCenter.y - center.y);
  const angleBefore = Number(await mobilePage.locator('#panelAngle').inputValue());
  await touchGesture(
    mobilePage,
    handleCenter,
    [1, 2, 3].map((i) => ({
      x: center.x - radius * Math.cos(i * 0.12),
      y: center.y - radius * Math.sin(i * 0.12),
    })),
  );
  assert.ok(
    Math.abs(Number(await mobilePage.locator('#panelAngle').inputValue()) - angleBefore) > 10,
    'touch rotation handle must change physical panel angle',
  );
  const geometryAfterRotation = computePaths((await saveLayout(mobilePage)).scene);
  assert.ok(geometryAfterRotation.paths.length > 0);
  assert.notDeepEqual(
    geometryAfterRotation,
    geometryBeforeRotation,
    'rotating must change real acoustic paths',
  );
  await mobilePage.locator('#scene').scrollIntoViewIfNeeded();
  const cancelBox = await mobilePage
    .locator('#scene [data-object="reflector-1"] circle[r="4"]')
    .boundingBox();
  const cancelStart = {
    x: cancelBox.x + cancelBox.width / 2,
    y: cancelBox.y + cancelBox.height / 2,
  };
  await touchGesture(mobilePage, cancelStart, [{ x: cancelStart.x - 8, y: cancelStart.y }], true);
  const afterCancel = await saveLayout(mobilePage);
  await mobilePage.locator('#togglePaths').tap();
  assert.deepEqual(
    (await saveLayout(mobilePage)).scene,
    afterCancel.scene,
    'canceled drag must not continue when another control is tapped',
  );
  await mobilePage.locator('#addAbsorber').tap();
  assert.match(await mobilePage.locator('#selectionTitle').textContent(), /吸音屏/);
  await mobilePage.locator('#panelAngle').tap({ position: { x: 30, y: 22 } });
  assert.notEqual(await mobilePage.locator('#angleValue').textContent(), '90°');
  await mobilePage.locator('#removePanel').tap();
  await mobilePage.locator('#resetLayout').tap();
  await mobilePage.setViewportSize({ width: 360, height: 900 });
  assert.equal(
    await mobilePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await mobilePage.locator('#scene').scrollIntoViewIfNeeded();
  await mobilePage.screenshot({ path: path.join(qaDirectory, 'echo-lab-mobile-room.png') });
  results.push(
    'native touch drag, rotation, gesture cancellation and absorber controls at 390/360px',
  );
  assert.deepEqual(errors, [], 'browser must not report console or page errors');
  console.log(`PASS: ${results.length} E2E scenarios`);
  console.log(results.join('\n'));
  console.log(`Screenshots: ${qaDirectory}`);
  await mobile.close();
  await context.close();
} catch (error) {
  console.error('Completed scenarios:', results);
  console.error('Browser errors:', errors);
  throw error;
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
}
