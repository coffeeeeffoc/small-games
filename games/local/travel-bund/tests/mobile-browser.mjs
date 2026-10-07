import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

// Keep the actual App, layout, browser fullscreen and pointer processing. Only
// Scene is isolated so these checks do not depend on software WebGL frame rate.
const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  server: { host: '0.0.0.0', port: 0, hmr: false },
});
await server.listen();
const port = server.httpServer.address().port;
const base = `http://127.0.0.1:${port}/`;
const hostHtml = `<!doctype html><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>
  html,body{margin:0;width:100%;height:100%;overflow:hidden}
  main{position:absolute;inset:12px;display:flex;flex-direction:column}main:fullscreen{inset:0;width:100%;height:100%}
  nav{height:48px;display:flex;flex:none;align-items:center;gap:12px}iframe{border:0;display:block;flex:1;width:100%;min-height:0}
  </style><main class="standalone-page" data-game-display-host><nav aria-label="游戏导航"><button>返回目录</button><strong>外滩漫游</strong><button>全屏</button></nav><iframe src="${base}?route=architecture"
  allow="autoplay; fullscreen" sandbox="allow-scripts allow-same-origin allow-downloads"></iframe></main>`;
const crossOriginHost = createHttpServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(hostHtml);
});
await new Promise((resolve) => crossOriginHost.listen(0, '127.0.0.1', resolve));
const appModule = await server.transformRequest('/src/main.tsx');
const reactUrl = appModule.code.match(/from ["']([^"']*deps\/react\.js[^"']*)["']/)[1];
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  headless: true,
});
const output = new URL('../../../../.scratch/travel-bund-mobile/', import.meta.url);
await mkdir(output, { recursive: true });
const report = {
  browser: await browser.version(),
  physicalMobile: false,
  scene: 'isolated renderer; actual App, touch layout and browser fullscreen',
  checks: [],
  errors: [],
  passed: false,
};
let current;

async function open({
  viewport = { width: 390, height: 844 },
  embedding,
  fullscreen = 'real',
  mobile = true,
} = {}) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  await context.addInitScript(
    ({ fullscreen }) => {
      window.fullscreenCalls = [];
      window.orientationCalls = [];
      window.sceneMounts = 0;
      if (window === window.parent) {
        // Record only host-document fullscreen listeners. This makes real
        // iframe navigation/removal verify adapter cleanup in the surviving host.
        const listeners = new Map([
          ['fullscreenchange', new Set()],
          ['webkitfullscreenchange', new Set()],
        ]);
        const add = EventTarget.prototype.addEventListener;
        const remove = EventTarget.prototype.removeEventListener;
        EventTarget.prototype.addEventListener = function (type, listener, options) {
          if (this === document && listeners.has(type)) listeners.get(type).add(listener);
          return add.call(this, type, listener, options);
        };
        EventTarget.prototype.removeEventListener = function (type, listener, options) {
          if (this === document && listeners.has(type)) listeners.get(type).delete(listener);
          return remove.call(this, type, listener, options);
        };
        window.hostDisplayListenerCounts = () => [...listeners.values()].map((set) => set.size);
      }
      localStorage.setItem('travel-bund.visits.v1', JSON.stringify(['hsbc-building']));
      const request = Element.prototype.requestFullscreen;
      if (fullscreen === 'unsupported') {
        Object.defineProperty(Element.prototype, 'requestFullscreen', {
          configurable: true,
          value: undefined,
        });
        Object.defineProperty(Element.prototype, 'webkitRequestFullscreen', {
          configurable: true,
          value: undefined,
        });
      } else {
        Object.defineProperty(Element.prototype, 'requestFullscreen', {
          configurable: true,
          value: function (...args) {
            window.fullscreenCalls.push({
              target: this.tagName,
              activeGesture: navigator.userActivation.isActive,
            });
            if (fullscreen === 'reject')
              return Promise.reject(new Error('Explicit fullscreen denial fixture'));
            return request.apply(this, args);
          },
        });
      }
      // The CSS fallback must work even if system orientation lock is unavailable.
      if (window.screen.orientation) {
        Object.defineProperty(window.screen.orientation, 'lock', {
          configurable: true,
          value: async (direction) => {
            window.orientationCalls.push(direction);
            throw new Error('Explicit orientation lock denial fixture');
          },
        });
      }
    },
    { fullscreen },
  );
  const page = await context.newPage();
  current = page;
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('requestfailed', (request) => {
    report.failedRequests ||= [];
    report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText });
  });
  await page.route('**/src/Scene.tsx*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
      import React from '${reactUrl}';
      const {useEffect,useRef}=React;
      export function Tour({onReady,onRenderer,onTelemetry,teleport,zoom,active}) {
        const canvas=useRef(null);
        window.currentTeleport=teleport;
        useEffect(()=>{
          window.sceneMounts++;
          onRenderer({domElement:canvas.current});
          onTelemetry({position:[-377,2,37],yaw:-2.9,speed:0,grounded:true,calls:0,triangles:0,fps:60});
          onReady();
        },[]);
        return React.createElement('canvas',{ref:canvas,'data-scene-zoom':zoom,'data-scene-active':active,
          style:{width:'100%',height:'100%'}});
      }`,
    }),
  );
  let game;
  if (embedding) {
    // Serve the cross-origin host over a real loopback connection. Chromium
    // classifies an intercepted top-level response as the public address space,
    // which would block its loopback iframe before the game could load.
    const hostPort = embedding === 'cross-origin' ? crossOriginHost.address().port : port;
    const host = `http://127.0.0.1:${hostPort}/__mobile-host__`;
    if (embedding === 'same-origin')
      await page.route(host, (route) =>
        route.fulfill({ contentType: 'text/html', body: hostHtml }),
      );
    await page.goto(host);
    await page.frameLocator('iframe').locator('main').waitFor();
    game = await (await page.locator('iframe').elementHandle()).contentFrame();
  } else {
    await page.goto(`${base}?route=architecture`);
    game = page;
  }
  await expect(game.locator('main')).toHaveAttribute('data-phase', 'intro');
  await expect.poll(() => game.evaluate(() => window.sceneMounts)).toBe(1);
  return { context, page, game, embedding, viewport };
}

async function layout(session, rotated) {
  await expect(session.game.locator('main')).toHaveAttribute('data-rotated', String(rotated));
  const dimensions = await session.game.locator('main').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      physicalWidth: rect.width,
      physicalHeight: rect.height,
      logicalWidth: element.clientWidth,
      logicalHeight: element.clientHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      safeAreas: ['top', 'right', 'bottom', 'left'].map((side) =>
        element.style.getPropertyValue(`--safe-${side}`),
      ),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  assert(
    dimensions.logicalWidth >= dimensions.logicalHeight,
    'Touch game always has a landscape logical viewport',
  );
  assert(
    Math.abs(dimensions.physicalWidth - dimensions.viewportWidth) <= 1,
    `Complete game fits physical viewport width: ${JSON.stringify(dimensions)}`,
  );
  assert(
    Math.abs(dimensions.physicalHeight - dimensions.viewportHeight) <= 1,
    `Complete game fits physical viewport height: ${JSON.stringify(dimensions)}`,
  );
  assert.equal(dimensions.overflow, false, 'Rotation must not introduce document overflow');
  assert.deepEqual(
    dimensions.safeAreas,
    (rotated ? ['right', 'bottom', 'left', 'top'] : ['top', 'right', 'bottom', 'left']).map(
      (side) => `env(safe-area-inset-${side}, 0px)`,
    ),
    'Logical safe-area edges follow the physical screen after rotation',
  );
  return dimensions;
}

async function controlsInside(session, selector) {
  const controls = await session.game.locator(selector).evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden';
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        name: element.getAttribute('aria-label') || element.textContent.trim(),
        visible,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        hit: hit && element.contains(hit),
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
      };
    }),
  );
  for (const control of controls.filter((control) => control.visible)) {
    assert(
      control.width >= 43.5 && control.height >= 43.5,
      `${control.name} has a 44 CSS px touch target: ${JSON.stringify(control)}`,
    );
    assert(
      control.x >= -0.5 &&
        control.y >= -0.5 &&
        control.x + control.width <= control.viewportWidth + 0.5 &&
        control.y + control.height <= control.viewportHeight + 0.5,
      `${control.name} stays inside the physical viewport: ${JSON.stringify(control)}`,
    );
    assert(control.hit, `${control.name} accepts a real center touch`);
  }
  return controls.filter((control) => control.visible);
}

const state = (session) =>
  session.game.evaluate(() => ({
    phase: document.querySelector('main').dataset.phase,
    position: ['x', 'y', 'z', 'yaw'].map((key) => document.querySelector('main').dataset[key]),
    visits: localStorage.getItem('travel-bund.visits.v1'),
    mounts: window.sceneMounts,
    teleport: window.currentTeleport,
    zoom: document.querySelector('main').dataset.zoom,
  }));

const readInput = (session) =>
  session.game.evaluate(async () => {
    const { input } = await import('/src/world.ts');
    return { stick: input.stick, look: input.look, active: input.active, keys: [...input.keys] };
  });

async function holdControls(session) {
  const cdp = await session.context.newCDPSession(session.page);
  const rotated = (await session.game.locator('main').getAttribute('data-rotated')) === 'true';
  const stick = await session.game.locator('.joystick').boundingBox();
  const scene = await session.game.locator('main').boundingBox();
  const walking = { id: 1, x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
  const looking = {
    id: 2,
    x: scene.x + scene.width * 0.6,
    y: scene.y + scene.height * (rotated ? 0.6 : 0.4),
  };
  const dispatch = (type, touchPoints) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  await dispatch('touchStart', [walking]);
  await dispatch('touchStart', [walking, looking]);
  walking.x += rotated ? 25 : 0;
  walking.y -= rotated ? 0 : 25;
  looking.x += rotated ? 0 : 20;
  looking.y += rotated ? 20 : 0;
  await dispatch('touchMove', [walking, looking]);
  assert((await readInput(session)).stick[1] < -0.5);
  assert((await readInput(session)).look[0] < -15);
  return { walking, looking, dispatch };
}

async function panelInside(session) {
  await expect(session.game.getByRole('dialog')).toBeVisible();
  const rect = await session.game.getByRole('dialog').evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    };
  });
  assert(
    rect.x >= -0.5 &&
      rect.y >= -0.5 &&
      rect.x + rect.width <= rect.viewportWidth + 0.5 &&
      rect.y + rect.height <= rect.viewportHeight + 0.5,
    `Complete rotated dialog fits viewport: ${JSON.stringify(rect)}`,
  );
}

const hostStyles = (session) =>
  session.page.evaluate(
    () =>
      [...document.head.querySelectorAll('style')].filter((style) =>
        style.textContent.includes('iframe[data-bund-game-display='),
      ).length,
  );

async function hostCleaned(session, iframeHandle) {
  await expect.poll(() => hostStyles(session)).toBe(0);
  assert.equal(
    await iframeHandle.getAttribute('data-bund-game-display'),
    null,
    "Unload removes this game's marker from the surviving or detached iframe",
  );
  assert.deepEqual(
    await session.page.evaluate(() => window.hostDisplayListenerCounts()),
    [0, 0],
    'Unload removes both fullscreen listeners from the surviving host document',
  );
}

try {
  for (const viewport of [
    { width: 320, height: 480 },
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    const session = await open({ viewport });
    await layout(session, viewport.height > viewport.width);
    await controlsInside(
      session,
      '#enter-world, .home-settings, .home-journal, .intro-routes button',
    );
    assert.deepEqual(
      await session.page.evaluate(() => window.fullscreenCalls),
      [],
      'Opening home never consumes a fullscreen gesture',
    );
    await session.game.locator('#enter-world').tap();
    await expect(session.game.locator('main')).toHaveAttribute('data-phase', 'playing');
    await expect
      .poll(() => session.page.evaluate(() => document.fullscreenElement?.tagName))
      .toBe('HTML');
    const calls = await session.page.evaluate(() => window.fullscreenCalls);
    assert.deepEqual(
      calls,
      [{ target: 'HTML', activeGesture: true }],
      'Entry requests complete-game fullscreen synchronously from the start gesture',
    );
    await layout(session, viewport.height > viewport.width);
    await controlsInside(session, '.hud button, .hud-actions button, .joystick');
    await session.game.getByRole('button', { name: '暂停', exact: true }).tap();
    await panelInside(session);
    assert.equal(
      await session.game.getByRole('button', { name: /全屏/ }).count(),
      1,
      'Settings expose exactly one fullscreen control',
    );
    const before = await state(session);
    await session.game.getByRole('button', { name: '退出全屏', exact: true }).tap();
    await expect
      .poll(() => session.page.evaluate(() => Boolean(document.fullscreenElement)))
      .toBe(false);
    await panelInside(session);
    assert.deepEqual(
      await state(session),
      before,
      'Exiting fullscreen preserves the scene and paused progress',
    );
    await session.game.getByRole('button', { name: '继续漫游', exact: true }).tap();
    await expect(session.game.locator('main')).toHaveAttribute('data-phase', 'playing');
    const playing = await state(session);
    const held = await holdControls(session);
    await session.page.setViewportSize({ width: viewport.height, height: viewport.width });
    await layout(session, viewport.width > viewport.height);
    assert.deepEqual(
      await state(session),
      playing,
      'Physical rotation preserves the active scene, position and progress',
    );
    assert.deepEqual(
      await readInput(session),
      { stick: [0, 0], look: [0, 0], active: true, keys: [] },
      'Physical rotation cancels held gestures without pausing or restarting',
    );
    held.walking.x += 1;
    held.looking.x += 1;
    await held.dispatch('touchMove', [held.walking, held.looking]);
    assert.deepEqual(
      await readInput(session),
      { stick: [0, 0], look: [0, 0], active: true, keys: [] },
      'Fingers held through rotation cannot resume old movement or camera drag',
    );
    await held.dispatch('touchCancel', []);
    await session.game.getByRole('button', { name: '打开地图' }).tap();
    await panelInside(session);
    await session.game.getByRole('button', { name: '返回漫游', exact: true }).tap();
    await session.game.getByRole('button', { name: '认识 江海关大楼' }).tap();
    await panelInside(session);
    await session.game.getByRole('button', { name: /^收入旅行手记/ }).tap();
    await session.game.getByRole('button', { name: '返回漫游', exact: true }).tap();
    await session.game.getByRole('button', { name: '打开旅行手记' }).tap();
    await panelInside(session);
    assert.deepEqual(
      await session.game.evaluate(() => JSON.parse(localStorage.getItem('travel-bund.visits.v1'))),
      ['hsbc-building', 'customs-house'],
      'Touch collection and journal retain existing progress',
    );
    await session.game.getByRole('button', { name: '返回漫游', exact: true }).tap();
    await session.game.getByRole('button', { name: '返回首页', exact: true }).tap();
    await expect(session.game.locator('main')).toHaveAttribute('data-phase', 'intro');
    assert.equal((await state(session)).mounts, 1, 'Returning home keeps the existing scene');
    await session.page.screenshot({
      path: fileURLToPath(new URL(`home-${viewport.width}.png`, output)),
    });
    report.checks.push({
      viewport,
      checks:
        'home, entry fullscreen, touch targets, pause/settings, fullscreen exit, physical rotation with held-finger cancellation, map, landmark collection, journal and home return',
    });
    await session.context.close();
  }

  for (const fullscreen of ['reject', 'unsupported']) {
    const session = await open({ fullscreen });
    await layout(session, true);
    await session.game.locator('#enter-world').tap();
    await expect(session.game.locator('main')).toHaveAttribute('data-phase', 'playing');
    await expect(session.game.getByRole('status')).toContainText(/全屏/);
    assert.equal(await session.page.evaluate(() => Boolean(document.fullscreenElement)), false);
    const requestCount = await session.page.evaluate(() => window.fullscreenCalls.length);
    assert.equal(
      requestCount,
      fullscreen === 'reject' ? 1 : 0,
      'No asynchronous retry after Scene becomes ready',
    );
    await session.game.getByRole('button', { name: '暂停', exact: true }).tap();
    await panelInside(session);
    await session.game.getByRole('button', { name: '继续漫游', exact: true }).tap();
    await expect(session.game.locator('main')).toHaveAttribute('data-phase', 'playing');
    await controlsInside(session, '.hud button, .hud-actions button, .joystick');
    if (fullscreen === 'reject') {
      const held = await holdControls(session);
      await session.page.keyboard.down('KeyW');
      await session.game.evaluate(() => window.dispatchEvent(new Event('blur')));
      await expect(session.game.locator('main')).toHaveAttribute('data-phase', 'paused');
      await panelInside(session);
      assert.deepEqual(
        await readInput(session),
        { stick: [0, 0], look: [0, 0], active: false, keys: [] },
        'Window blur clears held touch gestures and keyboard movement',
      );
      await held.dispatch('touchCancel', []);
      await session.page.keyboard.up('KeyW');
      await session.game.getByRole('button', { name: '继续漫游', exact: true }).tap();
      const capability = await session.context.newCDPSession(session.page);
      await capability.send('Emulation.setTouchEmulationEnabled', { enabled: false });
      await expect
        .poll(() => session.game.evaluate(() => matchMedia('(pointer: coarse)').matches))
        .toBe(false);
      await session.game.getByRole('button', { name: '暂停', exact: true }).click();
      await session.game.getByRole('button', { name: '继续漫游', exact: true }).click();
      await expect(session.game.locator('.joystick')).toBeVisible();
      await expect(session.game.locator('.look-pad')).toBeVisible();
      await layout(session, true);
    }
    report.checks.push({
      fullscreen,
      checks:
        'orientation denial and fullscreen failure keep full landscape game, touch controls and pause/resume playable',
    });
    await session.context.close();
  }

  for (const embedding of ['same-origin', 'cross-origin']) {
    const session = await open({ embedding });
    const iframe = session.page.locator('iframe');
    const hostNav = session.page.locator('.standalone-page > nav');
    await expect(hostNav).toBeVisible();
    if (embedding === 'same-origin') {
      await expect(iframe).toHaveAttribute('data-bund-game-display', 'true');
      assert.equal(
        await hostStyles(session),
        1,
        'The game scopes one immersion stylesheet to its owning same-origin host',
      );
    } else {
      assert.equal(await iframe.getAttribute('data-bund-game-display'), null);
      assert.equal(
        await hostStyles(session),
        0,
        'A cross-origin game does not alter its host document',
      );
    }
    const permissions = {
      allow: await iframe.getAttribute('allow'),
      sandbox: await iframe.getAttribute('sandbox'),
    };
    await session.game.locator('#enter-world').tap();
    await expect(session.game.locator('main')).toHaveAttribute('data-phase', 'playing');
    await expect
      .poll(() => session.page.evaluate(() => document.fullscreenElement?.tagName))
      .toBe(embedding === 'same-origin' ? 'MAIN' : 'IFRAME');
    if (embedding === 'cross-origin') {
      await expect(hostNav).toBeVisible();
      assert.equal(
        await session.game.evaluate(() => document.fullscreenElement?.tagName),
        'HTML',
        'Cross-origin iframe fullscreen includes every game control',
      );
    } else {
      await expect(hostNav).not.toBeVisible();
      assert.equal(
        await session.page.evaluate(() =>
          document.fullscreenElement.hasAttribute('data-game-display-host'),
        ),
        true,
        "Same-origin shell fullscreens this iframe's complete display host",
      );
    }
    await controlsInside(session, '.hud button, .hud-actions button, .joystick');
    await session.game.getByRole('button', { name: '暂停', exact: true }).tap();
    await panelInside(session);
    const before = await state(session);
    await session.game.getByRole('button', { name: '退出全屏', exact: true }).tap();
    await expect
      .poll(() => session.page.evaluate(() => Boolean(document.fullscreenElement)))
      .toBe(false);
    await expect(hostNav).toBeVisible();
    assert.deepEqual(
      await state(session),
      before,
      'Embedded fullscreen exit preserves the paused scene',
    );
    assert.deepEqual(
      { allow: await iframe.getAttribute('allow'), sandbox: await iframe.getAttribute('sandbox') },
      permissions,
      'Fullscreen does not broaden iframe permissions',
    );
    report.checks.push({
      embedding,
      permissions,
      checks:
        'real browser fullscreen includes game UI and modal; owning same-origin Shell navigation hides in fullscreen and returns on exit; cross-origin host remains untouched; exit retains progress and permissions',
    });
    if (embedding === 'same-origin') {
      const iframeHandle = await iframe.elementHandle();
      await iframe.evaluate((element) => {
        element.src = 'about:blank';
      });
      await expect
        .poll(() =>
          session.page.evaluate(() => document.querySelector('iframe').contentWindow.location.href),
        )
        .toBe('about:blank');
      await hostCleaned(session, iframeHandle);
    }
    await session.context.close();
  }

  const removed = await open({ embedding: 'same-origin' });
  const removedIframe = await removed.page.locator('iframe').elementHandle();
  assert.equal(await hostStyles(removed), 1);
  await removedIframe.evaluate((element) => element.remove());
  await hostCleaned(removed, removedIframe);
  await expect(removed.page.getByRole('navigation', { name: '游戏导航' })).toBeVisible();
  await removed.context.close();
  report.checks.push({
    hostCleanup:
      'Real iframe navigation and direct removal restore its marker, remove the immersion stylesheet and detach both surviving parent fullscreen listeners',
  });

  const modalFullscreen = await open();
  await modalFullscreen.game.getByRole('button', { name: '游览设置' }).tap();
  await panelInside(modalFullscreen);
  const beforeModalFullscreen = await state(modalFullscreen);
  await modalFullscreen.game.getByRole('button', { name: '全屏', exact: true }).tap();
  await expect
    .poll(() => modalFullscreen.page.evaluate(() => document.fullscreenElement?.tagName))
    .toBe('HTML');
  await panelInside(modalFullscreen);
  await controlsInside(modalFullscreen, '.settings-footer button, .panel .close');
  assert.deepEqual(
    await state(modalFullscreen),
    beforeModalFullscreen,
    'Fullscreen requested from an open modal preserves its screen and scene',
  );
  await modalFullscreen.game.getByRole('button', { name: '完成', exact: true }).tap();
  await expect(modalFullscreen.game.getByRole('dialog')).not.toBeVisible();
  await expect(modalFullscreen.game.locator('main')).toHaveAttribute('data-phase', 'intro');
  await modalFullscreen.game.getByRole('button', { name: '游览设置' }).tap();
  await modalFullscreen.game.getByRole('button', { name: '退出全屏', exact: true }).tap();
  await expect
    .poll(() => modalFullscreen.page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(false);
  await controlsInside(modalFullscreen, '.settings-footer button, .panel .close');
  await modalFullscreen.game.getByRole('button', { name: '返回首页', exact: true }).tap();
  await expect(modalFullscreen.game.getByRole('dialog')).not.toBeVisible();
  await modalFullscreen.context.close();
  report.checks.push({
    modalFullscreen:
      'Real entry/exit from an already-open modal retains top-layer hit testing and tappable footer/close controls',
  });

  const desktop = await open({ viewport: { width: 900, height: 1100 }, mobile: false });
  await expect(desktop.game.locator('main')).toHaveAttribute('data-rotated', 'false');
  await desktop.game.locator('#enter-world').click();
  await expect(desktop.game.locator('main')).toHaveAttribute('data-phase', 'playing');
  assert.deepEqual(
    await desktop.page.evaluate(() => window.fullscreenCalls),
    [],
    'Desktop entry does not force fullscreen',
  );
  await desktop.context.close();
  report.checks.push({
    desktop: 'Tall mouse viewport stays upright; entry respects desktop fullscreen choice',
  });
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
  await new Promise((resolve) => crossOriginHost.close(resolve));
  await server.close();
}
