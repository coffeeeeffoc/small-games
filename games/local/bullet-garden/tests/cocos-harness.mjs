import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const output = path.resolve(
  root,
  process.env.QA_OUTPUT || 'docs/design/cocos-mobile-2026-10-22/actual',
);
export async function harness({ sharedRewards = false } = {}) {
  await mkdir(output, { recursive: true });
  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/fixture-host') {
        res.setHeader('Content-Type', 'text/html');
        res.end(
          '<body style="margin:0"><iframe src="/" style="border:0;width:100vw;height:100vh"></iframe><script>window.messages=[];addEventListener("message",e=>{if(e.origin===location.origin)messages.push(e.data)})</script>',
        );
        return;
      }
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (sharedRewards && pathname.startsWith('/reward-host/')) {
        const name = pathname.slice('/reward-host/'.length);
        assert(['game-rewards.js', 'platform-ads.js', 'interstitial.js'].includes(name));
        res.setHeader('Content-Type', 'text/javascript');
        res.end(await readFile(new URL('../../../../platforms/h5/' + name, import.meta.url)));
        return;
      }
      const base = path.join(root, 'dist');
      const file = path.resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
      assert(file.startsWith(base + path.sep));
      const type = {
        '.js': 'text/javascript',
        '.html': 'text/html',
        '.json': 'application/json',
        '.css': 'text/css',
        '.png': 'image/png',
        '.wasm': 'application/wasm',
        '.wav': 'audio/wav',
      }[path.extname(file)];
      res.setHeader('Content-Type', type || 'application/octet-stream');
      let body = await readFile(file);
      if (sharedRewards && pathname === '/') body = body.toString().replace('<head>', '<head><script type="module" src="/reward-host/game-rewards.js"></script>');
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const open = async ({ width = 390, height = 844, profile, query = '', sdk, storageDev, recordVideo = false, touchEnabled = true } = {}) => {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: touchEnabled,
      isMobile: touchEnabled,
      deviceScaleFactor: 1,
      ...(recordVideo ? { recordVideo: { dir: path.join(output, 'recordings'), size: { width, height } } } : {}),
    });
    if (profile || storageDev !== undefined)
      await context.addInitScript(
        ({ profile, storageDev }) => {
          if (profile && !sessionStorage.fixtureInstalled) {
            localStorage.setItem('bullet-garden.profile.v1', JSON.stringify(profile));
            sessionStorage.fixtureInstalled = '1';
          }
          if (storageDev !== undefined) localStorage.dev = storageDev;
        },
        { profile, storageDev },
      );
    if (sdk) await context.addInitScript(sdk);
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url + '/' + query);
    await page.waitForFunction(() => window.__bulletGarden?.snapshot().art.ready, null, {
      timeout: 60000,
    });
    await page.waitForTimeout(100);
    const client = await context.newCDPSession(page);
    const points = new Map();
    const touch = async (type, id, p) => {
      if (type === 'touchEnd') points.delete(id);
      else if (type === 'touchCancel') points.clear();
      else points.set(id, { id, x: p.x, y: p.y });
      await client.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: Array.from(points.values()),
      });
    };
    return { context, page, touch, close: () => context.close() };
  };
  return {
    browser,
    url,
    open,
    errors,
    close: async () => {
      await browser.close();
      await new Promise((r) => server.close(r));
    },
  };
}
export const snapshot = (page) => page.evaluate(() => window.__bulletGarden.snapshot());
export async function point(page, id) {
  await page.waitForFunction(
    (id) => window.__bulletGarden.snapshot().buttons.some((b) => b.id === id && !b.disabled),
    id,
    { timeout: 5000 },
  );
  const b = (await snapshot(page)).buttons.find((b) => b.id === id);
  assert(b && !b.disabled, `enabled ${id}`);
  const r = b.clientRect;
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
export async function tap(page, id) {
  const p = await point(page, id);
  await (page.touchscreen || page.page().touchscreen).tap(p.x, p.y);
  await page.waitForTimeout(75);
}
export async function upgrade(page) {
  const s = await snapshot(page);
  if (s.screen !== 'upgrade') return false;
  const b = s.buttons.filter((b) => b.id.startsWith('upgrade:'));
  // Collision acceptance must not pick healing that cancels the observed damage.
  const choice = b.find((b) => b.id === 'upgrade:boon-shrub') ||
    b.find((b) => !/wild-heart|sunflower|boon-ice/.test(b.id)) || b[0];
  await tap(page, choice.id);
  return true;
}
export async function collideUntil(session, predicate, timeout = 120000) {
  const { page, touch } = session;
  let held = false;
  const started = Date.now();
  let last;
  let lastLog = 0;
  while (Date.now() - started < timeout) {
    const s = await snapshot(page);
    last = s;
    if (Date.now() - lastLog > 10000) {
      console.log(
        'collision observation',
        s.state.time.toFixed(1),
        s.state.player.hp,
        s.state.stats.damageTaken,
        s.controls.joystickActive,
      );
      lastLog = Date.now();
    }
    if (predicate(s)) {
      if (held) await touch('touchCancel', 1);
      return s;
    }
    if (s.screen === 'upgrade') {
      await touch('touchCancel', 1);
      held = false;
      await upgrade(page);
      continue;
    }
    if (s.screen !== 'playing')
      throw Error('Unexpected screen while approaching enemies: ' + s.screen);
    const j = await point(page, 'move');
    const grounded = s.state.enemies.filter((e) => !['glider', 'burrower'].includes(e.kind));
    const heavy = grounded.filter((e) =>
      ['brute', 'shield', 'bastionlord', 'overgrowth', 'warden'].includes(e.kind),
    );
    const nearest = (heavy.length ? heavy : grounded.length ? grounded : s.state.enemies).sort(
      (a, b) =>
        Math.hypot(a.x - s.state.player.x, a.y - s.state.player.y) -
        Math.hypot(b.x - s.state.player.x, b.y - s.state.player.y),
    )[0];
    if (!held) {
      await touch('touchStart', 1, j);
      held = true;
    }
    if (nearest) {
      const dx = nearest.x - s.state.player.x,
        dy = nearest.y - s.state.player.y,
        d = Math.max(1, Math.hypot(dx, dy));
      await touch('touchMove', 1, { x: j.x + (dx / d) * 42, y: j.y + (dy / d) * 42 });
    } else await touch('touchMove', 1, j);
    await page.waitForTimeout(180);
  }
  await page.screenshot({ path: path.join(output, 'collision-timeout.png') });
  throw Error(
    'Timed out observing natural collision outcome: ' +
      JSON.stringify({
        screen: last.screen,
        time: last.state.time,
        hp: last.state.player.hp,
        stats: last.state.stats,
        move: last.controls.move,
        player: last.state.player,
        enemies: last.state.enemies,
      }),
  );
}
