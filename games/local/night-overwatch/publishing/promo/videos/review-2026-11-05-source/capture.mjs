import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
  createOwnedRuntime,
  ownedChild,
  cleanupOwnedSteps,
} from '../../../../../../../scripts/h5-taptap-runtime.mjs';
import {
  acceptanceBuild,
  snapshot,
  press,
  navigateMap,
  aimAt,
  waitForImpact,
  settleVisuals,
} from '../../../../tests/flight-browser.mjs';

const workspace = fileURLToPath(new URL('../../../../../../../', import.meta.url));
const output = fileURLToPath(
  new URL('../../../../reports/review-video-2026-11-07/', import.meta.url),
);
await mkdir(output, { recursive: true });
const evidence = {
  environment:
    'Desktop Chromium, 1920x1080 WebGL, real isolated PostgreSQL/HTTP, ordinary new guests, real input; no asset or result injection',
  takes: [],
  errors: [],
};
let runtime, server, browser;
const summary = (state) => ({
  phase: state.phase,
  time: state.time,
  fired: state.fired,
  kills: state.kills,
  threats: state.threatsRemaining,
  viewMode: state.viewMode,
  selected: state.selected,
  rankStatus: state.online.rankStatus,
});

async function record(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const stream = canvas.captureStream(30);
    // Mirror only the game's existing output; browser/desktop UI never enters this stream.
    for (const destination of globalThis.__gameAudioDestinations.values())
      for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
    const mimeType = stream.getAudioTracks().length
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) throw Error('VP9 capture unavailable');
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 24000000 });
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    globalThis.__gameRecording = { recorder, stream, chunks };
    recorder.start(1000);
    return {
      width: canvas.width,
      height: canvas.height,
      drawingBufferWidth: gl.drawingBufferWidth,
      drawingBufferHeight: gl.drawingBufferHeight,
      dpr: devicePixelRatio,
      audioTracks: stream.getAudioTracks().length,
    };
  });
}

async function saveRecording(page, name) {
  const download = page.waitForEvent('download');
  await page.evaluate(async (name) => {
    const { recorder, stream, chunks } = globalThis.__gameRecording;
    await new Promise((resolve) => {
      recorder.onstop = resolve;
      recorder.stop();
    });
    stream.getTracks().forEach((track) => track.stop());
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
    anchor.download = name + '.webm';
    anchor.click();
  }, name);
  await (await download).saveAs(output + name + '.webm');
}

try {
  runtime = await createOwnedRuntime({ workspace });
  const { origin, api } = runtime.descriptor;
  server = ownedChild(process.execPath, ['games/local/night-overwatch/scripts/serve.mjs'], {
    cwd: workspace,
    env: { ...process.env, PORT: '43810' },
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  process.env.NIGHT_URL = origin;
  evidence.build = await acceptanceBuild(origin);
  browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11'] });
  const takes = [
    ['continuous', 1, 'enhanced', 3, 0],
    ['rapid', 0, 'enhanced', 4, 1],
    ['blast', 1, 'enhanced', 3, 0],
    ['heavy', 2, 'night', 5, 2],
    ['incendiary', 3, 'enhanced', 5, 0],
    ['thermal', 1, 'thermal', 4, 3],
  ];
  for (const [name, weapon, viewMode, zoomSteps, targetIndex] of takes.filter(
    (take) => !process.argv[2] || process.argv.slice(2).includes(take[0]),
  )) {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      acceptDownloads: true,
    });
    try {
      await context.addInitScript(() => {
        globalThis.__gameLegacyStorage = localStorage;
        localStorage.setItem('night-overwatch-coach-v2', 'done');
        globalThis.__gameAudioDestinations = new Map();
        const connect = AudioNode.prototype.connect;
        AudioNode.prototype.connect = function (destination, ...arguments_) {
          const result = connect.call(this, destination, ...arguments_);
          if (destination instanceof AudioDestinationNode) {
            let capture = globalThis.__gameAudioDestinations.get(this.context);
            if (!capture) {
              capture = this.context.createMediaStreamDestination();
              globalThis.__gameAudioDestinations.set(this.context, capture);
            }
            connect.call(this, capture);
          }
          return result;
        };
      });
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      page.on('pageerror', (error) => evidence.errors.push(error.message));
      await page.route('**/game-service-config.js', (route) =>
        route.fulfill({
          contentType: 'text/javascript',
          body: `globalThis.__COMPETITION_CONFIG__=Object.freeze(${JSON.stringify({ game: 'night-overwatch', platform: 'h5', competitionEnabled: true, apiUrl: api })});`,
        }),
      );
      await page.goto(origin + '/?dev=0');
      await page.waitForFunction(
        () =>
          globalThis.__night?.snapshot().ui.interfaceArtworkReady &&
          __night.snapshot().progression.assets?.playerId &&
          !document.getElementById('night-startup'),
      );
      for (const id of ['qm:modes', 'mode:solo', 'mode:enter', 'start']) {
        await press(page, id, false, false);
        await settleVisuals(page);
        if(name==='continuous'&&id==='mode:enter'){
          await page.setViewportSize({width:1280,height:720});await settleVisuals(page);
          await page.screenshot({path:output+'missions-1280.png'});
          await page.setViewportSize({width:1920,height:1080});await settleVisuals(page);
        }
      }
      await page.waitForFunction(
        () =>
          __night.snapshot().phase === 'playing' &&
          __night.snapshot().online.rankStatus === 'recording' &&
          !__night.snapshot().modal,
      );
      for (let index = 0; index < ['night', 'enhanced', 'thermal'].indexOf(viewMode); index++)
        await page.keyboard.press('v');
      await press(page, 'weapon' + weapon, false, false);
      let state = await snapshot(page);
      let target = state.units.filter(
        (unit) => !unit.friendly && unit.hp > 0 && unit.kind === 'turret',
      )[targetIndex];
      assert(target);
      await navigateMap(page, target);
      for (let index = 0; index < zoomSteps; index++) {
        await page.keyboard.press('x');
        await page.waitForTimeout(150);
      }
      await aimAt(page, target);
      await settleVisuals(page);
      const before = await snapshot(page);
      const canvas = await record(page);
      assert.deepEqual(
        [canvas.width, canvas.height, canvas.drawingBufferWidth, canvas.drawingBufferHeight],
        [1920, 1080, 1920, 1080],
      );
      assert.equal(canvas.audioTracks, 1, 'Capture exactly the existing game audio output');
      const started = Date.now();
      const events = [];
      if (name === 'continuous') {
        for (let attempt = 0; attempt < 48; attempt++) {
          state = await snapshot(page);
          if (!state.threatsRemaining || state.phase !== 'playing') break;
          target = state.units.find((unit) => !unit.friendly && unit.hp > 0);
          const selectedWeapon = target.kind === 'infantry' ? 0 : 2;
          await press(page, 'weapon' + selectedWeapon, false, false);
          await navigateMap(page, target);
          await aimAt(page, target);
          await page.waitForFunction(
            (weapon) => __night.snapshot().guns[weapon].cooldown === 0,
            selectedWeapon,
          );
          await page.keyboard.down('Space');
          await page.waitForTimeout(selectedWeapon === 0 ? 260 : 50);
          await page.keyboard.up('Space');
          const firing = await snapshot(page);
          const shell = firing.shots.at(-1);
          assert(firing.fired > state.fired);
          events.push({
            seconds: (Date.now() - started) / 1000,
            fired: firing.fired,
            weapon: selectedWeapon,
            target: target.id,
          });
          if (shell) await waitForImpact(page, shell);
          if (target.kind === 'infantry') {
            await page.waitForFunction(id => __night.snapshot().units.find(u => u.id === id).hp <= 0, target.id);
            if (!events.some(event => event.screenshot)) {
              await page.screenshot({path:output+'infantry-combat-1920.png'});
              events.at(-1).screenshot = true;
            }
          }
        }
        await page.waitForFunction(
          () =>
            __night.snapshot().phase === 'success' &&
            __night.snapshot().online.rankStatus === 'finished',
          null,
          { timeout: 60000 },
        );
        await page.waitForTimeout(1800);
      } else {
        let nextShot = 0;
        while (Date.now() - started < 12000) {
          await aimAt(page, target);
          const seconds = (Date.now() - started) / 1000;
          if (seconds >= nextShot) {
            await page.keyboard.down('Space');
            await page.waitForTimeout(weapon < 2 ? 350 : 65);
            await page.keyboard.up('Space');
            nextShot = seconds + (weapon === 2 ? 2.5 : weapon === 3 ? 5.1 : 0.55);
            events.push({
              seconds,
              fired: (await snapshot(page)).fired,
              weapon,
              target: target.id,
            });
          }
          await page.waitForTimeout(100);
        }
      }
      const after = await snapshot(page);
      const seconds = (Date.now() - started) / 1000;
      assert(after.fired > before.fired);
      assert(events[0].seconds < 5, 'Actual firing begins inside the first five seconds');
      if (name === 'continuous')
        assert(seconds >= 15 && seconds < 120, 'Continuous capture fits the recommended duration');
      await saveRecording(page, name);
      let storageAfter;
      if (name === 'continuous') {
        assert.match(
          after.buttons.find((button) => button.id === 'missionNext')?.text || '',
          /下一关卡/,
        );
        storageAfter = await page.evaluate(async () => {
          await globalThis.__nightStorage.flush();
          const legacy = globalThis.__gameLegacyStorage;
          const legacyRuns = Array.from({ length: legacy.length }, (_, index) =>
            legacy.key(index),
          ).filter((key) => key.startsWith('night-pending-run-v1:')).length;
          const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open('night-overwatch-storage-v1', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          try {
            const keys = await new Promise((resolve, reject) => {
              const transaction = database.transaction('values', 'readonly');
              const request = transaction.objectStore('values').getAllKeys();
              transaction.oncomplete = () => resolve(request.result);
              transaction.onabort = () => reject(transaction.error);
            });
            const runs = keys.filter((key) => key.startsWith('night-pending-run-v1:'));
            return {
              legacyRuns,
              journals: runs.filter((key) => !key.endsWith(':synced')).length,
              receipts: runs.filter((key) => key.endsWith(':synced')).length,
            };
          } finally {
            database.close();
          }
        });
        assert.deepEqual(storageAfter, { legacyRuns: 0, journals: 0, receipts: 1 });
      }
      await page.screenshot({ path: output + name + '-end.png' });
      const take = {
        name,
        seconds,
        canvas,
        before: summary(before),
        after: summary(after),
        events,
        storageAfter,
      };
      evidence.takes.push(take);
      await writeFile(
        output + name + '-capture.json',
        JSON.stringify(
          { build: evidence.build, environment: evidence.environment, ...take },
          null,
          2,
        ),
      );
      console.log(
        JSON.stringify({
          name,
          seconds,
          audioTracks: canvas.audioTracks,
          fired: after.fired - before.fired,
          phase: after.phase,
        }),
      );
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(evidence.errors, []);
  await acceptanceBuild(origin);
} finally {
  evidence.cleanup = await cleanupOwnedSteps([
    ...(browser ? [['browser', () => browser.close()]] : []),
    ...(server ? [['preview', () => server.close()]] : []),
    ...(runtime ? [['runtime', () => runtime.close()]] : []),
  ]);
  await writeFile(output + 'capture-evidence.json', JSON.stringify(evidence, null, 2));
  assert.deepEqual(evidence.cleanup, []);
}
