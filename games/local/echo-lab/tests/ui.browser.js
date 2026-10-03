/** Optional E2E smoke; application has no Playwright runtime dependency. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computePaths, panelEndpoints } from '../src/acoustics.js';
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
  if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches))
    await nativeTap(page, `#${id}`);
  else await page.locator(`#${id}`).click();
  const item = await pending;
  assert.equal(await item.failure(), null);
  return { filename: item.suggestedFilename(), file: await item.path() };
};
const saveLayout = async (page) => {
  if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
    // Read the user's persisted layout without leaving the touch scene after
    // every gesture. JSON download itself is exercised by the desktop cases.
    await page.waitForTimeout(350);
    const saved = await page.evaluate(() => localStorage.getItem('echo-lab.scene.v1'));
    assert.ok(saved, 'touch edits must persist a room configuration');
    return JSON.parse(saved);
  }
  return JSON.parse(await readFile((await download(page, 'saveLayout')).file, 'utf8'));
};
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
const touchProfiles = new WeakMap();
const restoreTouchProfile = async (page) => {
  if (!touchProfiles.has(page)) touchProfiles.set(page, await page.context().newCDPSession(page));
  await touchProfiles
    .get(page)
    .send('Emulation.setTouchEmulationEnabled', { enabled: true, configuration: 'mobile' });
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
    // Chromium clears emulated touch capabilities when a CDP input session
    // closes. Restore them before the next native tap or responsive-layout check.
    await restoreTouchProfile(page);
  }
};
const nativeTap = async (page, selector, options = {}) => {
  await restoreTouchProfile(page);
  await page.locator(selector).tap(options);
};
const centerOf = async (locator) => {
  const box = await locator.boundingBox();
  assert.ok(box, 'the direct-manipulation target must be visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const sceneTouch = async (page, selector, delta, cancel = false) => {
  await restoreTouchProfile(page);
  await page.locator('#scene').scrollIntoViewIfNeeded();
  const start = await centerOf(page.locator(selector).first());
  await touchGesture(
    page,
    start,
    [1, 2, 3].map((step) => ({
      x: start.x + (delta.x * step) / 3,
      y: start.y + (delta.y * step) / 3,
    })),
    cancel,
  );
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
  assert.ok(
    (await page.locator('#scene .propagation-ray').count()) >= 24,
    'the scene must show sound spreading in many directions',
  );
  assert.ok(
    (await page.locator('#scene .diffuse-path').count()) >= 2,
    'the receiver must display several dispersed echo paths',
  );
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

  await page.locator('[data-move="normal"]').click();
  assert.equal(await page.locator('[data-move="normal"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-move="free"]').focus();
  await page.locator('[data-move="free"]').press('Space');
  assert.equal(await page.locator('[data-move="free"]').getAttribute('aria-pressed'), 'true');

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
  for (const selector of [
    '[data-rotate] circle',
    '[data-resize-panel] circle',
    '[data-acoustics] circle',
    '[data-resize-room] circle',
  ]) {
    const target = await mobilePage.locator(`#scene ${selector}`).first().boundingBox();
    assert.ok(
      target.width >= 43.9 && target.height >= 43.9,
      `${selector} must expose a 44px touch target in the rendered mobile scene`,
    );
  }
  assert.equal(
    await mobilePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    'mobile viewport must not overflow horizontally',
  );
  await mobilePage.screenshot({
    path: path.join(qaDirectory, 'echo-lab-mobile.png'),
  });
  assert.equal(
    await mobilePage.evaluate(() => matchMedia('(pointer: coarse)').matches),
    true,
    'mobile captures must preserve native touch emulation',
  );
  await nativeTap(mobilePage, '#sceneListen');
  await mobilePage.waitForFunction(() =>
    document.getElementById('playWet').classList.contains('playing'),
  );
  await nativeTap(mobilePage, '#stopAudio');
  results.push('390px responsive layout, rendered 44px handles and native scene audition');
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
  await nativeTap(mobilePage, '#resetLayout');
  await nativeTap(mobilePage, '#scene [data-object="reflector-1"] circle[r="4"]');
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
  await nativeTap(mobilePage, '#togglePaths');
  assert.deepEqual(
    (await saveLayout(mobilePage)).scene,
    afterCancel.scene,
    'canceled drag must not continue when another control is tapped',
  );
  await nativeTap(mobilePage, '#addAbsorber');
  assert.match(await mobilePage.locator('#selectionTitle').textContent(), /吸音屏/);
  await nativeTap(mobilePage, '#panelAngle', { position: { x: 30, y: 22 } });
  assert.notEqual(await mobilePage.locator('#angleValue').textContent(), '90°');
  await nativeTap(mobilePage, '#removePanel');
  await nativeTap(mobilePage, '#resetLayout');

  const lengthStart = (await saveLayout(mobilePage)).scene.panels[0];
  const fixedEndpoint = panelEndpoints(lengthStart)[0];
  await sceneTouch(
    mobilePage,
    '#scene [data-resize-panel="reflector-1"][data-endpoint="1"] circle',
    { x: 0, y: 20 },
  );
  const lengthened = (await saveLayout(mobilePage)).scene.panels[0];
  assert.ok(
    lengthened.length > lengthStart.length + 2,
    'dragging a board endpoint must lengthen the physical panel',
  );
  const retainedEndpoint = panelEndpoints(lengthened)[0];
  assert.ok(
    Math.hypot(retainedEndpoint.x - fixedEndpoint.x, retainedEndpoint.y - fixedEndpoint.y) <
      0.00001,
    'resizing one board end must keep the other end anchored',
  );
  assert.equal(
    lengthened.angle,
    lengthStart.angle,
    'an endpoint resize must preserve board rotation',
  );
  await sceneTouch(
    mobilePage,
    '#scene [data-resize-panel="reflector-1"][data-endpoint="1"] circle',
    { x: 0, y: -6 },
    true,
  );
  assert.equal(
    await mobilePage.locator('#scene').evaluate((element) => element.classList.contains('editing')),
    false,
    'native cancellation must clear resize feedback',
  );
  const lengthCancel = (await saveLayout(mobilePage)).scene;
  await nativeTap(mobilePage, '[data-move="free"]');
  assert.deepEqual(
    (await saveLayout(mobilePage)).scene,
    lengthCancel,
    'a canceled endpoint gesture must release capture before the next touch',
  );

  const roomStart = (await saveLayout(mobilePage)).scene;
  await sceneTouch(mobilePage, '#scene [data-resize-room] circle', { x: -28, y: -16 });
  const resizedRoom = (await saveLayout(mobilePage)).scene;
  assert.ok(
    resizedRoom.width < roomStart.width - 2 && resizedRoom.height < roomStart.height - 2,
    'room corner dragging must set both physical dimensions',
  );
  assert.equal(
    await mobilePage.locator('#sceneRoomTools').isVisible(),
    true,
    'room handles must reveal nearby dimension controls',
  );
  for (const panel of resizedRoom.panels)
    assert.ok(
      panelEndpoints(panel).every(
        (point) =>
          point.x >= 0.2 - 0.00001 &&
          point.y >= 0.2 - 0.00001 &&
          point.x <= resizedRoom.width - 0.2 + 0.00001 &&
          point.y <= resizedRoom.height - 0.2 + 0.00001,
      ),
      'room resizing must retain the whole panel inside its walls',
    );
  await nativeTap(mobilePage, '#roomWidthDirect');
  await mobilePage.locator('#roomWidthDirect').fill('54.5');
  await nativeTap(mobilePage, '#roomHeightDirect');
  await mobilePage.locator('#roomHeightDirect').fill('32.5');
  await nativeTap(mobilePage, '#selectRoom');
  const preciseRoom = (await saveLayout(mobilePage)).scene;
  assert.equal(
    preciseRoom.width,
    54.5,
    'the nearby room length field must support precise decimal dimensions',
  );
  assert.equal(
    preciseRoom.height,
    32.5,
    'the nearby room width field must support precise decimal dimensions',
  );
  await nativeTap(mobilePage, '#resetLayout');
  results.push(
    'native touch panel-end resizing, anchored geometry, cancellation and room sizing with precise nearby fields',
  );

  const soundStart = (await saveLayout(mobilePage)).scene;
  await sceneTouch(mobilePage, '#scene [data-acoustics="reflector-1"] circle', { x: 0, y: -32 });
  const soundWeakened = (await saveLayout(mobilePage)).scene;
  assert.ok(
    soundWeakened.panels[0].reflection < soundStart.panels[0].reflection - 0.2,
    'sliding the sound handle along a vertical board must lower reflection strength',
  );
  assert.ok(
    Math.abs(soundWeakened.panels[0].scatter - soundStart.panels[0].scatter) < 0.00001,
    'parallel sound-handle movement must preserve dispersion angle',
  );
  assert.equal(
    soundWeakened.panels[0].x,
    soundStart.panels[0].x,
    'the sound handle must change acoustics while the board stays in place',
  );
  assert.equal(soundWeakened.panels[0].y, soundStart.panels[0].y);
  await sceneTouch(mobilePage, '#scene [data-acoustics="reflector-1"] circle', { x: -32, y: 0 });
  const soundWidened = (await saveLayout(mobilePage)).scene;
  assert.ok(
    soundWidened.panels[0].scatter > soundWeakened.panels[0].scatter + 15,
    'moving the sound handle across the board must widen its reflected fan',
  );
  assert.ok(
    Math.abs(soundWidened.panels[0].reflection - soundWeakened.panels[0].reflection) < 0.00001,
    'perpendicular sound-handle movement must preserve reflection strength',
  );
  assert.notDeepEqual(
    computePaths(soundWidened).paths,
    computePaths(soundWeakened).paths,
    'direct sound-handle gestures must change the actual echoes',
  );
  await nativeTap(mobilePage, '#resetLayout');
  results.push(
    'native touch sound handle independently edits reflection strength along the board and dispersion across it',
  );

  const pointBeforeNumericEdit = (await saveLayout(mobilePage)).scene.source;
  await nativeTap(mobilePage, '#positionX');
  await mobilePage.locator('#positionX').fill('31');
  await nativeTap(mobilePage, '#scene [data-object="source"] circle[r="16"]');
  const editedBeforeSelection = (await saveLayout(mobilePage)).scene;
  assert.equal(
    editedBeforeSelection.panels[0].x,
    31,
    'selecting another object must commit a pending board coordinate to the board',
  );
  assert.deepEqual(
    editedBeforeSelection.source,
    pointBeforeNumericEdit,
    'a pending board coordinate must not be applied to the newly selected source',
  );
  await nativeTap(mobilePage, '#resetLayout');

  await nativeTap(mobilePage, '#quickLength');
  await mobilePage.locator('#quickLength').fill('2');
  await nativeTap(mobilePage, '[data-move="free"]');
  const shortStart = (await saveLayout(mobilePage)).scene.panels[0];
  assert.equal(shortStart.length, 2);
  await sceneTouch(mobilePage, '#scene [data-object="reflector-1"] circle[r="4"]', { x: 24, y: 0 });
  const shortMoved = (await saveLayout(mobilePage)).scene.panels[0];
  assert.ok(
    shortMoved.x > shortStart.x + 2,
    'a short board must remain directly draggable without its endpoint targets stealing the touch',
  );
  assert.equal(
    shortMoved.length,
    shortStart.length,
    'grabbing a short board center must move it rather than resize it',
  );
  await sceneTouch(
    mobilePage,
    '#scene [data-resize-panel="reflector-1"][data-endpoint="1"] circle',
    { x: 0, y: 16 },
  );
  const shortResized = (await saveLayout(mobilePage)).scene.panels[0];
  assert.ok(
    shortResized.length > shortMoved.length + 2,
    'a short board must retain a reachable endpoint resize target',
  );
  await nativeTap(mobilePage, '#resetLayout');
  results.push(
    'native touch short-board movement and endpoint sizing without overlapping touch targets',
  );

  await nativeTap(mobilePage, '#quickLength');
  await mobilePage.locator('#quickLength').fill('0.8');
  await nativeTap(mobilePage, '[data-angle="0"]');
  await nativeTap(mobilePage, '[data-move="free"]');
  await sceneTouch(mobilePage, '#scene [data-object="reflector-1"] circle[r="4"]', {
    x: -260,
    y: 0,
  });
  const edgeBoard = (await saveLayout(mobilePage)).scene.panels[0];
  assert.ok(
    Math.abs(edgeBoard.x - 0.6) < 0.00001,
    'a tiny horizontal board must move fully to the left room edge',
  );
  await mobilePage.locator('#scene').scrollIntoViewIfNeeded();
  const sceneBounds = await mobilePage.locator('#scene').boundingBox();
  for (const endpoint of [0, 1]) {
    const selector = `#scene [data-resize-panel="reflector-1"][data-endpoint="${endpoint}"] circle`;
    const target = await mobilePage.locator(selector).first().boundingBox();
    assert.ok(
      target.x >= sceneBounds.x - 0.1 &&
        target.y >= sceneBounds.y - 0.1 &&
        target.x + target.width <= sceneBounds.x + sceneBounds.width + 0.1 &&
        target.y + target.height <= sceneBounds.y + sceneBounds.height + 0.1,
      'near-edge length handles must remain entirely visible within the scene',
    );
    const center = await centerOf(mobilePage.locator(selector).first());
    assert.equal(
      await mobilePage.evaluate(
        ({ x, y, endpoint }) =>
          document.elementFromPoint(x, y)?.closest('[data-resize-panel]')?.dataset.endpoint ===
          String(endpoint),
        { ...center, endpoint },
      ),
      true,
      'near-edge handle centers must be reachable without another touch target intercepting them',
    );
  }
  await sceneTouch(
    mobilePage,
    '#scene [data-resize-panel="reflector-1"][data-endpoint="1"] circle',
    { x: 16, y: 0 },
  );
  const edgeLengthened = (await saveLayout(mobilePage)).scene.panels[0];
  assert.ok(
    edgeLengthened.length > edgeBoard.length + 2,
    'the outward near-edge callout must resize a tiny panel',
  );
  const fixedRight = panelEndpoints(edgeLengthened)[1];
  await sceneTouch(
    mobilePage,
    '#scene [data-resize-panel="reflector-1"][data-endpoint="0"] circle',
    { x: 8, y: 0 },
  );
  const edgeShortened = (await saveLayout(mobilePage)).scene.panels[0];
  assert.ok(
    edgeShortened.length < edgeLengthened.length - 1,
    'the left-wall callout must remain usable after lengthening',
  );
  const retainedRight = panelEndpoints(edgeShortened)[1];
  assert.ok(
    Math.hypot(retainedRight.x - fixedRight.x, retainedRight.y - fixedRight.y) < 0.00001,
    'the wall-side callout must preserve the opposite physical endpoint',
  );
  for (const attribute of ['data-rotate', 'data-acoustics']) {
    const selector = `#scene [${attribute}="reflector-1"] circle`;
    await mobilePage.locator('#scene').scrollIntoViewIfNeeded();
    const center = await centerOf(mobilePage.locator(selector).first());
    assert.equal(
      await mobilePage.evaluate(
        ({ x, y, attribute }) =>
          document.elementFromPoint(x, y)?.closest(`[${attribute}]`)?.getAttribute(attribute) ===
          'reflector-1',
        { ...center, attribute },
      ),
      true,
      'rotation and sound callouts must remain reachable beside the wall',
    );
  }
  const edgeSoundStart = (await saveLayout(mobilePage)).scene.panels[0];
  await sceneTouch(mobilePage, '#scene [data-acoustics="reflector-1"] circle', { x: -24, y: 0 });
  const edgeSoundEdited = (await saveLayout(mobilePage)).scene.panels[0];
  assert.ok(
    edgeSoundEdited.reflection < edgeSoundStart.reflection - 0.15,
    'the near-wall sound callout must adjust reflection',
  );
  assert.equal(
    edgeSoundEdited.scatter,
    edgeSoundStart.scatter,
    'the near-wall sound callout must preserve the independent scatter setting',
  );
  await mobilePage.locator('#scene').scrollIntoViewIfNeeded();
  const edgeCenter = await centerOf(
    mobilePage.locator('#scene [data-object="reflector-1"] circle[r="4"]'),
  );
  const edgeRotation = await centerOf(
    mobilePage.locator('#scene [data-rotate="reflector-1"] circle').first(),
  );
  const edgeVector = { x: edgeRotation.x - edgeCenter.x, y: edgeRotation.y - edgeCenter.y };
  await touchGesture(
    mobilePage,
    edgeRotation,
    [1, 2, 3].map((step) => {
      const angle = (-Math.PI * step) / 18;
      return {
        x: edgeCenter.x + edgeVector.x * Math.cos(angle) - edgeVector.y * Math.sin(angle),
        y: edgeCenter.y + edgeVector.x * Math.sin(angle) + edgeVector.y * Math.cos(angle),
      };
    }),
  );
  const edgeRotated = (await saveLayout(mobilePage)).scene.panels[0];
  assert.ok(
    Math.abs(edgeRotated.angle - edgeSoundEdited.angle) > 20,
    'the near-wall rotation callout must turn the actual panel',
  );
  assert.equal(
    edgeRotated.length,
    edgeSoundEdited.length,
    'turning a near-wall panel must preserve its length',
  );
  await nativeTap(mobilePage, '#resetLayout');
  results.push(
    'native touch 0.8m board at the room edge with reachable length, rotation and sound callouts',
  );

  await nativeTap(mobilePage, '[data-angle="45"]');
  await nativeTap(mobilePage, '[data-move="parallel"]');
  assert.equal(
    await mobilePage.locator('[data-move="parallel"]').getAttribute('aria-pressed'),
    'true',
  );
  await mobilePage.locator('[data-move="normal"]').scrollIntoViewIfNeeded();
  const canceledModeStart = await centerOf(mobilePage.locator('[data-move="normal"]'));
  await touchGesture(mobilePage, canceledModeStart, [], true);
  assert.equal(
    await mobilePage.locator('[data-move="parallel"]').getAttribute('aria-pressed'),
    'true',
    'a canceled mode tap must preserve the selected movement axis',
  );
  const swipedModeStart = await centerOf(mobilePage.locator('[data-move="normal"]'));
  await touchGesture(mobilePage, swipedModeStart, [
    { x: swipedModeStart.x - 60, y: swipedModeStart.y + 24 },
  ]);
  assert.equal(
    await mobilePage.locator('[data-move="parallel"]').getAttribute('aria-pressed'),
    'true',
    'a scrolling gesture over mode buttons must not switch the movement axis',
  );
  const diagonalStart = (await saveLayout(mobilePage)).scene.panels[0];
  await sceneTouch(mobilePage, '#scene [data-object="reflector-1"] circle[r="4"]', {
    x: 28,
    y: -10,
  });
  const diagonalMoved = (await saveLayout(mobilePage)).scene.panels[0];
  const diagonalDelta = {
    x: diagonalMoved.x - diagonalStart.x,
    y: diagonalMoved.y - diagonalStart.y,
  };
  assert.ok(
    diagonalDelta.x > 1 && diagonalDelta.y > 1,
    'diagonal parallel dragging must move along the board',
  );
  assert.ok(
    Math.abs(diagonalDelta.x - diagonalDelta.y) < 0.00001,
    'parallel movement must preserve the board normal',
  );

  await nativeTap(mobilePage, '[data-move="normal"]');
  const normalStart = (await saveLayout(mobilePage)).scene.panels[0];
  await sceneTouch(mobilePage, '#scene [data-object="reflector-1"] circle[r="4"]', {
    x: 24,
    y: -10,
  });
  const normalMoved = (await saveLayout(mobilePage)).scene.panels[0];
  const normalDelta = { x: normalMoved.x - normalStart.x, y: normalMoved.y - normalStart.y };
  assert.ok(
    normalDelta.x > 1 && normalDelta.y < -1,
    'perpendicular dragging must move across the board',
  );
  assert.ok(
    Math.abs(normalDelta.x + normalDelta.y) < 0.00001,
    'normal movement must preserve the board tangent',
  );

  await nativeTap(mobilePage, '[data-angle="90"]');
  await waitValue(mobilePage, 'quickAngle', '90');
  await nativeTap(mobilePage, '[data-move="parallel"]');
  const verticalStart = (await saveLayout(mobilePage)).scene.panels[0];
  await sceneTouch(mobilePage, '#scene [data-object="reflector-1"] circle[r="4"]', {
    x: 24,
    y: 16,
  });
  const verticalMoved = (await saveLayout(mobilePage)).scene.panels[0];
  assert.ok(
    verticalMoved.y > verticalStart.y + 2,
    'vertical boards must slide vertically in parallel mode',
  );
  assert.ok(
    Math.abs(verticalMoved.x - verticalStart.x) < 0.00001,
    'vertical parallel dragging must ignore lateral finger motion',
  );
  await sceneTouch(mobilePage, '#scene [data-object="reflector-1"] circle[r="4"]', {
    x: -24,
    y: -180,
  });
  const bounded = (await saveLayout(mobilePage)).scene.panels[0];
  assert.ok(
    Math.abs(bounded.x - verticalMoved.x) < 0.00001,
    'hitting the room edge must preserve the requested axis',
  );
  assert.ok(
    bounded.y - bounded.length / 2 >= 0.2 - 0.00001,
    'panel endpoints must remain inside the room after a captured out-of-room touch',
  );
  await nativeTap(mobilePage, '[data-move="free"]');
  assert.equal(await mobilePage.locator('[data-move="free"]').getAttribute('aria-pressed'), 'true');
  await nativeTap(mobilePage, '#resetLayout');
  results.push(
    'native touch diagonal parallel/perpendicular movement, vertical sliding and room-edge constraints',
  );

  const strengthBefore = (await saveLayout(mobilePage)).scene;
  const reflectionBox = await mobilePage.locator('#quickReflection').boundingBox();
  await nativeTap(mobilePage, '#quickReflection', {
    position: { x: reflectionBox.width / 2, y: reflectionBox.height / 2 },
  });
  const weakened = (await saveLayout(mobilePage)).scene;
  assert.ok(
    weakened.panels[0].reflection < strengthBefore.panels[0].reflection - 0.2,
    'near-scene touch strength control must lower actual reflection',
  );
  const panelEchoGain = (room) =>
    computePaths(room)
      .paths.filter((entry) => entry.surfaces.includes('reflector-1'))
      .reduce((total, entry) => total + entry.gain, 0);
  assert.ok(
    panelEchoGain(weakened) < panelEchoGain(strengthBefore),
    'lower touch strength must reduce the echoes used for audio',
  );

  const scatterBox = await mobilePage.locator('#quickScatter').boundingBox();
  await nativeTap(mobilePage, '#quickScatter', { position: { x: 1, y: scatterBox.height / 2 } });
  const mirrorOnly = (await saveLayout(mobilePage)).scene;
  assert.equal(
    mirrorOnly.panels[0].scatter,
    0,
    'the touch control must allow mirror-only reflection',
  );
  assert.ok(
    computePaths(mirrorOnly).paths.every((entry) => !entry.id.startsWith('reflector-1:diffuse:')),
    'zero dispersion must remove the panel fan from actual audio paths',
  );
  await nativeTap(mobilePage, '#quickScatter', {
    position: { x: scatterBox.width * 0.78, y: scatterBox.height / 2 },
  });
  const widened = (await saveLayout(mobilePage)).scene;
  assert.ok(widened.panels[0].scatter >= 60, 'the touch control must open the angular fan');
  assert.ok(
    computePaths(widened).paths.filter((entry) => entry.id.startsWith('reflector-1:diffuse:'))
      .length >= 3,
    'angular fan edits must create several real receiver arrivals',
  );
  assert.match(await mobilePage.locator('#pathSummary').textContent(), /扩散/);
  if ((await mobilePage.locator('#togglePaths').getAttribute('aria-pressed')) === 'false')
    await nativeTap(mobilePage, '#togglePaths');
  await mobilePage.waitForFunction(() => document.getElementById('toast').hidden);
  await mobilePage.locator('.stage').scrollIntoViewIfNeeded();
  await mobilePage.screenshot({ path: path.join(qaDirectory, 'echo-lab-mobile-stage.png') });
  await mobilePage.screenshot({
    path: path.join(qaDirectory, 'echo-lab-mobile-editor.png'),
  });
  assert.equal(
    await mobilePage.evaluate(() => matchMedia('(pointer: coarse)').matches),
    true,
    'scene screenshots must retain the native touch profile for the remaining walkthrough',
  );
  await nativeTap(mobilePage, '#resetLayout');
  results.push('native touch reflection strength and angular dispersion update real audible paths');

  await mobilePage.setViewportSize({ width: 360, height: 900 });
  assert.equal(
    await mobilePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await mobilePage.locator('#scene').scrollIntoViewIfNeeded();
  await mobilePage.waitForFunction(() => document.getElementById('toast').hidden);
  await mobilePage.screenshot({ path: path.join(qaDirectory, 'echo-lab-mobile-room.png') });
  results.push(
    'native touch drag, rotation, gesture cancellation and absorber controls at 390/360px',
  );
  const beforeOrientation = (await saveLayout(mobilePage)).scene;
  await mobilePage.locator('#scene').scrollIntoViewIfNeeded();
  const orientationStart = await centerOf(
    mobilePage.locator('#scene [data-object="reflector-1"] circle[r="4"]'),
  );
  const orientationCdp = await mobilePage.context().newCDPSession(mobilePage);
  try {
    await orientationCdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...orientationStart, id: 1 }],
    });
    assert.equal(
      await mobilePage
        .locator('#scene')
        .evaluate((element) => element.classList.contains('editing')),
      true,
      'native touch press must show editing feedback',
    );
    await mobilePage.setViewportSize({ width: 844, height: 390 });
    await mobilePage.waitForFunction(
      () => !document.getElementById('scene').classList.contains('editing'),
    );
    await orientationCdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: orientationStart.x + 24, y: orientationStart.y, id: 1 }],
    });
    await orientationCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await orientationCdp.detach();
    await restoreTouchProfile(mobilePage);
  }
  assert.deepEqual(
    (await saveLayout(mobilePage)).scene,
    beforeOrientation,
    'an orientation change must release a captured gesture before later touch movement',
  );
  results.push('native touch capture is safely released when device orientation changes');
  await mobilePage.setViewportSize({ width: 844, height: 390 });
  assert.equal(
    await mobilePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    'landscape touch viewport must not overflow horizontally',
  );
  await mobilePage.locator('#scene').scrollIntoViewIfNeeded();
  await mobilePage.waitForFunction(() => document.getElementById('toast').hidden);
  await mobilePage.screenshot({
    path: path.join(qaDirectory, 'echo-lab-mobile-landscape.png'),
  });
  assert.equal(
    await mobilePage.evaluate(() => matchMedia('(pointer: coarse)').matches),
    true,
    'landscape screenshot capture must preserve the native touch layout',
  );
  await nativeTap(mobilePage, '[data-move="free"]');
  const landscapeStart = (await saveLayout(mobilePage)).scene.panels[0];
  await sceneTouch(mobilePage, '#scene [data-object="reflector-1"] circle[r="4"]', {
    x: -16,
    y: 8,
  });
  const landscapeMoved = (await saveLayout(mobilePage)).scene.panels[0];
  if (!(landscapeMoved.x < landscapeStart.x - 1))
    console.error('Landscape touch state:', {
      landscapeStart,
      landscapeMoved,
      mode: await mobilePage.locator('[data-move].active').getAttribute('data-move'),
    });
  assert.ok(
    landscapeMoved.x < landscapeStart.x - 1,
    'landscape scene objects must remain directly touch draggable',
  );
  results.push('844 × 390 landscape layout and native touch panel movement');
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
