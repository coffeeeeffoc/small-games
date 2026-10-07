import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { photoHunts, PHOTO_HUNT_SAVE_KEY, cameraAim } from '../src/photo-hunts.ts';

// Exercise the real App, save handling, fullscreen fallback and touch controls.
// Only Scene is isolated: its live camera reader and PNG canvas remain distinct
// from telemetry, so a stale telemetry value cannot pass the shutter checks.
const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, hmr: false },
});
await server.listen();
const appModule = await server.transformRequest('/src/main.tsx');
const reactUrl = appModule.code.match(/from ["']([^"']*deps\/react\.js[^"']*)["']/)[1];
const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
const world = JSON.parse(
  await readFile(
    new URL('../../../../assets/bund/runtime/world/world.json', import.meta.url),
    'utf8',
  ),
);
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  headless: true,
});
const output = new URL('../../../../.scratch/travel-bund-photo-hunts/', import.meta.url);
await mkdir(output, { recursive: true });
const report = {
  browser: await browser.version(),
  physicalMobile: false,
  scene: 'isolated PNG renderer and live pose; actual App and touch input',
  checks: [],
  errors: [],
  passed: false,
};
let current;

function matchingPose(hunt) {
  const landmark = world.landmarks.find((item) => item.id === hunt.landmark);
  const position = [...hunt.station.position];
  const target = [
    landmark.position[0],
    landmark.position[1] + hunt.targetHeight,
    landmark.position[2],
  ];
  return { position, ...cameraAim(position, target), grounded: true };
}

async function open({
  viewport = { width: 390, height: 844 },
  save,
  storageBlocked = false,
  search = '',
} = {}) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
  await context.addInitScript(
    ({ save, saveKey, storageBlocked }) => {
      if (!sessionStorage.getItem('photo-hunt-browser-fixture')) {
        // Visiting every landmark must never award photography progress.
        localStorage.setItem(
          'travel-bund.visits.v1',
          JSON.stringify(['customs-house', 'hsbc-building', 'peace-hotel', 'oriental-pearl']),
        );
        if (save !== undefined) localStorage.setItem(saveKey, JSON.stringify(save));
        sessionStorage.setItem('photo-hunt-browser-fixture', '1');
      }
      Object.defineProperty(Element.prototype, 'requestFullscreen', {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(Element.prototype, 'webkitRequestFullscreen', {
        configurable: true,
        value: undefined,
      });
      if (screen.orientation)
        Object.defineProperty(screen.orientation, 'lock', {
          configurable: true,
          value: async () => {
            throw new Error('Orientation fixture');
          },
        });
      if (storageBlocked) {
        Storage.prototype.getItem = () => {
          throw new DOMException('Storage fixture', 'SecurityError');
        };
        Storage.prototype.setItem = () => {
          throw new DOMException('Storage fixture', 'SecurityError');
        };
      }
    },
    { save, saveKey: PHOTO_HUNT_SAVE_KEY, storageBlocked },
  );
  const page = await context.newPage();
  current = page;
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => report.errors.push(error.message));
  await page.route('**/src/Scene.tsx*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
      import React from '${reactUrl}';
      const {useEffect,useRef}=React;
      export function Tour({onReady,onRenderer,onTelemetry,onPhotoView,teleport}) {
        const canvas=useRef(null);
        window.mockTeleport=teleport;
        useEffect(()=>{
          const element=canvas.current, context=element.getContext('2d');
          context.fillStyle='#98b8ca';context.fillRect(0,0,element.width,element.height);
          context.fillStyle='#cab399';context.fillRect(40,30,140,100);
          const png=element.toDataURL.bind(element);
          element.toDataURL=(...args)=>{
            if(window.failPhotoCapture)throw new DOMException('Capture fixture','SecurityError');
            window.photoCaptureCount=(window.photoCaptureCount||0)+1;
            return png(...args);
          };
          window.mockPose={position:[-377,2,37],yaw:0,pitch:0,grounded:true};
          const read=()=>({...window.mockPose,position:[...window.mockPose.position]});
          window.detachPhotoView=()=>onPhotoView?.(null);
          window.attachPhotoView=()=>onPhotoView?.(read);
          window.attachPhotoView();
          onRenderer({domElement:element});
          // Intentionally keep telemetry facing away from the first landmark.
          onTelemetry({...window.mockPose,speed:0,calls:0,triangles:0,fps:60});
          onReady();
          return ()=>onPhotoView?.(null);
        },[]);
        return React.createElement('canvas',{ref:canvas,width:320,height:180,
          style:{width:'100%',height:'100%'}});
      }`,
    }),
  );
  await page.goto(base + search);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'intro');
  await expect(page.locator('main')).toHaveAttribute(
    'data-rotated',
    String(viewport.height > viewport.width),
  );
  return { context, page, viewport };
}

async function fitsScreen(page, locator) {
  const dimensions = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      screenWidth: innerWidth,
      screenHeight: innerHeight,
    };
  });
  assert(
    dimensions.x >= -0.5 &&
      dimensions.y >= -0.5 &&
      dimensions.x + dimensions.width <= dimensions.screenWidth + 0.5 &&
      dimensions.y + dimensions.height <= dimensions.screenHeight + 0.5,
    `Landscape fallback keeps the complete panel inside the screen: ${JSON.stringify(dimensions)}`,
  );
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
}

async function resultActionsVisible(page, result) {
  await fitsScreen(page, result);
  for (const name of ['重拍这一关', '下一关']) {
    const dimensions = await result
      .getByRole('button', { name, exact: true })
      .evaluate((button) => {
        const box = button.getBoundingClientRect(),
          panel = button.closest('dialog').getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return {
          name: button.textContent,
          inside:
            box.left >= panel.left &&
            box.top >= panel.top &&
            box.right <= panel.right &&
            box.bottom <= panel.bottom,
          hit: Boolean(hit && button.contains(hit)),
          width: box.width,
          height: box.height,
        };
      });
    assert(
      dimensions.inside && dimensions.hit && dimensions.width >= 43.5 && dimensions.height >= 43.5,
      `Result primary actions accept a touch without scrolling: ${JSON.stringify(dimensions)}`,
    );
  }
  await expect(result.locator('.display-message')).toHaveCount(0);
  await expect(result).not.toContainText('暂时无法生成照片');
}

async function chooseFirst(page) {
  await page.getByRole('button', { name: '照片寻景关卡', exact: true }).tap();
  const chooser = page.getByRole('dialog', { name: '照片寻景', exact: true });
  await expect(chooser).toBeVisible();
  await fitsScreen(page, chooser);
  await expect(chooser.locator('img')).toHaveCount(photoHunts.length);
  await expect
    .poll(() =>
      chooser
        .locator('img')
        .evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)),
    )
    .toBe(true);
  const viewport = page.viewportSize();
  await page.screenshot({ path: fileURLToPath(new URL(`menu-${viewport.width}.png`, output)) });
  for (let i = 0; i < photoHunts.length; i++) {
    const choice = page.getByRole('button', {
      name: `第${i + 1}关 ${photoHunts[i].title}`,
      exact: true,
    });
    await expect(choice)[i === 0 ? 'toBeEnabled' : 'toBeDisabled']();
  }
  await page.getByRole('button', { name: `第1关 ${photoHunts[0].title}`, exact: true }).tap();
  await expect(page.getByRole('dialog', { name: '寻景照片', exact: true })).toBeVisible();
}

async function startHunt(page) {
  await page.getByRole('button', { name: '开始寻找', exact: true }).tap();
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'playing');
  await expect(page.getByRole('button', { name: '查看寻景照片', exact: true })).toBeVisible();
}

async function aim(page, hunt, overrides = {}) {
  await page.evaluate(
    (pose) => {
      window.mockPose = pose;
    },
    { ...matchingPose(hunt), ...overrides },
  );
}

const saved = (page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{"version":1,"completed":[]}'),
    PHOTO_HUNT_SAVE_KEY,
  );

async function fire(page) {
  await page.getByRole('button', { name: '拍照', exact: true }).tap();
}

try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    const { context, page } = await open({ viewport });
    await expect(page.getByRole('button', { name: '照片寻景关卡', exact: true })).toContainText(
      '0 / 4',
    );
    await chooseFirst(page);
    await page.screenshot({
      path: fileURLToPath(new URL(`preview-${viewport.width}.png`, output)),
    });
    const preview = page.getByRole('dialog', { name: '寻景照片', exact: true });
    await fitsScreen(page, preview);
    const reference = preview.locator('img').first();
    await expect
      .poll(() => reference.evaluate((image) => image.complete && image.naturalWidth > 0))
      .toBe(true);
    const referenceSrc = await reference.getAttribute('src');
    await page.locator('.hunt-hint summary').tap();
    await expect(preview).toContainText(photoHunts[0].hint);
    await startHunt(page);
    assert.deepEqual(
      (await saved(page)).completed,
      [],
      'A hint, visit or entry cannot credit a hunt',
    );

    await aim(page, photoHunts[0], { position: [...photoHunts[0].start.position] });
    await fire(page);
    await expect(page.getByRole('status')).toContainText('拍摄地点还不对');
    await aim(page, photoHunts[0], { yaw: matchingPose(photoHunts[0]).yaw + Math.PI });
    await fire(page);
    await expect(page.getByRole('status')).toContainText('镜头朝向还不对');
    await aim(page, photoHunts[0], { pitch: matchingPose(photoHunts[0]).pitch - 1 });
    await fire(page);
    await expect(page.getByRole('status')).toContainText('再抬高一些镜头');
    await aim(page, photoHunts[0], { grounded: false });
    await fire(page);
    await expect(page.getByRole('status')).toContainText('请站稳');
    assert.deepEqual((await saved(page)).completed, []);
    await expect(page.locator('main')).toHaveAttribute('data-phase', 'playing');

    await aim(page, photoHunts[0]);
    await page.evaluate(() => window.detachPhotoView());
    await fire(page);
    await expect(page.getByRole('status')).toContainText('镜头还未准备好');
    assert.deepEqual(
      (await saved(page)).completed,
      [],
      'Missing live pose cannot fall back to stale telemetry',
    );
    await page.evaluate(() => window.attachPhotoView());
    await page.evaluate(() => {
      window.failPhotoCapture = true;
    });
    await fire(page);
    await expect(page.getByRole('status')).toContainText(/拍照|照片|快门/);
    assert.deepEqual(
      (await saved(page)).completed,
      [],
      'Failed PNG capture cannot award a completion',
    );
    await page.evaluate(() => {
      window.failPhotoCapture = false;
    });

    await page.getByRole('button', { name: '查看寻景照片', exact: true }).tap();
    await expect(page.locator('main')).toHaveAttribute('data-phase', 'paused');
    assert.equal(
      await page.evaluate(async () => (await import('/src/world.ts')).input.active),
      false,
    );
    await fitsScreen(page, page.getByRole('dialog', { name: '寻景照片', exact: true }));
    await page.getByRole('button', { name: '继续寻找', exact: true }).tap();
    // Refresh the failure immediately before success; a toast timeout must not
    // hide a regression where the result retains the previous capture failure.
    await page.evaluate(() => {
      window.failPhotoCapture = true;
    });
    await fire(page);
    await expect(page.getByRole('status')).toContainText('暂时无法生成照片');
    await page.evaluate(() => {
      window.failPhotoCapture = false;
    });
    await fire(page);
    const result = page.getByRole('dialog', { name: '寻景通关', exact: true });
    await expect(result).toBeVisible();
    await resultActionsVisible(page, result);
    assert.equal(
      await page.evaluate(async () => (await import('/src/world.ts')).input.active),
      false,
    );
    const images = await result
      .locator('img')
      .evaluateAll((elements) => elements.map((image) => image.getAttribute('src')));
    assert(
      images.some((src) => src.startsWith('data:image/png')),
      'Result contains the actual captured canvas PNG',
    );
    assert(images.includes(referenceSrc), 'Result retains the reference photograph');
    assert.deepEqual((await saved(page)).completed, [photoHunts[0].id]);
    assert(
      !(await page.evaluate((key) => localStorage.getItem(key), PHOTO_HUNT_SAVE_KEY)).includes(
        'data:image',
      ),
      'Progress storage contains ids rather than large image payloads',
    );
    await page.screenshot({ path: fileURLToPath(new URL(`result-${viewport.width}.png`, output)) });

    await page.getByRole('button', { name: '重拍这一关', exact: true }).tap();
    await expect(page.locator('main')).toHaveAttribute('data-phase', 'playing');
    await aim(page, photoHunts[0]);
    await fire(page);
    await expect(result).toBeVisible();
    assert.deepEqual(
      (await saved(page)).completed,
      [photoHunts[0].id],
      'Retaking never duplicates settlement',
    );
    for (let i = 1; i < photoHunts.length; i++) {
      await page.getByRole('button', { name: '下一关', exact: true }).tap();
      await expect(page.getByRole('dialog', { name: '寻景照片', exact: true })).toContainText(
        photoHunts[i].title,
      );
      if (i === 1) {
        await page.getByRole('button', { name: '返回漫游', exact: true }).tap();
        await expect(page.getByRole('dialog', { name: '照片寻景', exact: true })).toBeVisible();
        await expect(page.locator('main')).toHaveAttribute('data-phase', 'paused');
        assert.equal(
          await page.evaluate(async () => (await import('/src/world.ts')).input.active),
          false,
          'Closing a different next-level brief returns to selection without resuming the old hunt',
        );
        await page.getByRole('button', { name: `第2关 ${photoHunts[1].title}`, exact: true }).tap();
      }
      await startHunt(page);
      await aim(page, photoHunts[i]);
      await fire(page);
      await expect(result).toBeVisible();
      assert.deepEqual(
        (await saved(page)).completed,
        photoHunts.slice(0, i + 1).map((hunt) => hunt.id),
      );
    }
    await page.getByRole('button', { name: '完成寻景', exact: true }).tap();
    await expect(page.locator('main')).toHaveAttribute('data-photo-hunt', '');
    await expect(page.getByRole('dialog', { name: '照片寻景', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: '照片寻景关卡', exact: true })).toContainText(
      '4 / 4',
    );
    await page.getByRole('button', { name: '照片寻景关卡', exact: true }).tap();
    for (let i = 0; i < photoHunts.length; i++) {
      await expect(
        page.getByRole('button', { name: `第${i + 1}关 ${photoHunts[i].title}`, exact: true }),
      ).toBeEnabled();
    }
    await page.getByRole('button', { name: `第1关 ${photoHunts[0].title}`, exact: true }).tap();
    await startHunt(page);
    await page.getByRole('button', { name: '查看寻景照片', exact: true }).tap();
    await page.getByRole('button', { name: '查看关卡', exact: true }).tap();
    await page.getByRole('button', { name: '结束寻找，继续漫游', exact: true }).tap();
    await expect(page.locator('main')).toHaveAttribute('data-photo-hunt', '');
    await expect(page.locator('main')).toHaveAttribute('data-phase', 'playing');
    await expect(page.getByRole('button', { name: '查看寻景照片', exact: true })).toHaveCount(0);
    report.checks.push({
      viewport,
      checks:
        'touch selection/lock, reference decode, hint, wrong station/yaw/pitch/airborne rejection, unavailable live camera and failed PNG, pause/resume, live shutter pose, reference + PNG result, immediate visible next/retry buttons, stale capture failure cleared, idempotent retake, next-brief cancellation, all four levels, saved unlock restoration, completion and explicit exit clear the task',
    });
    await context.close();
  }

  const smallViewport = { width: 320, height: 568 };
  const small = await open({ viewport: smallViewport });
  await chooseFirst(small.page);
  await startHunt(small.page);
  await aim(small.page, photoHunts[0]);
  await small.page.evaluate(() => {
    window.failPhotoCapture = true;
  });
  await fire(small.page);
  await expect(small.page.getByRole('status')).toContainText('暂时无法生成照片');
  await small.page.evaluate(() => {
    window.failPhotoCapture = false;
  });
  await fire(small.page);
  const smallResult = small.page.getByRole('dialog', { name: '寻景通关', exact: true });
  await expect(smallResult).toBeVisible();
  await resultActionsVisible(small.page, smallResult);
  await small.page.screenshot({ path: fileURLToPath(new URL('result-320.png', output)) });
  await small.page.getByRole('button', { name: '下一关', exact: true }).tap();
  await expect(small.page.getByRole('dialog', { name: '寻景照片', exact: true })).toContainText(
    photoHunts[1].title,
  );
  report.checks.push({
    viewport: smallViewport,
    checks:
      'one-level touch completion, result reference/photo with visible next/retry controls without scrolling, capture failure cleared, next-level brief',
  });
  await small.context.close();

  const unavailable = await open({ storageBlocked: true });
  await chooseFirst(unavailable.page);
  await startHunt(unavailable.page);
  await aim(unavailable.page, photoHunts[0]);
  await fire(unavailable.page);
  await expect(
    unavailable.page.getByRole('dialog', { name: '寻景通关', exact: true }),
  ).toBeVisible();
  await unavailable.page.getByRole('button', { name: '下一关', exact: true }).tap();
  await expect(
    unavailable.page.getByRole('dialog', { name: '寻景照片', exact: true }),
  ).toContainText(photoHunts[1].title);
  report.checks.push({
    storageUnavailable:
      'Denied browser storage still permits local completion and the next unlocked level in this session',
  });
  await unavailable.context.close();

  const practice = await open({ search: '?dev=1' });
  const action = `photo-reference-${photoHunts[3].id}`;
  await expect
    .poll(() =>
      practice.page.evaluate(
        (id) =>
          Boolean(
            document
              .querySelector('small-games-devtools')
              ?.shadowRoot?.querySelector(`[data-dev-action="${id}"]`),
          ),
        action,
      ),
    )
    .toBe(true);
  await practice.page.evaluate(
    (id) =>
      document
        .querySelector('small-games-devtools')
        .shadowRoot.querySelector(`[data-dev-action="${id}"]`)
        .click(),
    action,
  );
  await expect(practice.page.locator('main')).toHaveAttribute('data-phase', 'playing');
  await expect(
    practice.page.getByRole('button', { name: '查看寻景照片', exact: true }),
  ).toContainText('开发试玩');
  await aim(practice.page, photoHunts[3]);
  await fire(practice.page);
  await expect(practice.page.getByRole('dialog', { name: '寻景通关', exact: true })).toContainText(
    '试玩不计入关卡进度',
  );
  assert.deepEqual(
    (await saved(practice.page)).completed,
    [],
    'An arbitrary developer photo stays isolated from normal unlock progress',
  );
  await practice.page.getByRole('button', { name: '完成寻景', exact: true }).tap();
  await expect(practice.page.locator('main')).toHaveAttribute('data-photo-hunt', '');
  await expect(
    practice.page.getByRole('button', { name: `第2关 ${photoHunts[1].title}`, exact: true }),
  ).toBeDisabled();
  report.checks.push({
    developerPractice:
      'Explicit shared dev action can preview a locked photo; successful photography does not award normal progress or unlocks, and finish clears practice',
  });
  await practice.context.close();

  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = error.stack;
  await current
    ?.screenshot({ path: fileURLToPath(new URL('failure.png', output)) })
    .catch(() => {});
  throw error;
} finally {
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}
