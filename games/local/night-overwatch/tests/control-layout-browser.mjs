import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { assetFixture } from './progression-fixture.ts';
import { acceptanceBuild, snapshot, press, settleVisuals, assertLayout } from './flight-browser.mjs';

const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const out = process.env.NIGHT_REPORT_DIR || fileURLToPath(new URL('../reports/control-layout/', import.meta.url));
await mkdir(out, { recursive: true });
const evidence = { build, fixture: true, environment: 'Chromium mouse/touch; QA equipment; no production assets modified', checks: [], screens: [], errors: [] };
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
const row = s => s.buttons.filter(b => ['weapon4', 'skillUse', 'weapon5'].includes(b.id));
const geometry = s => row(s).map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
try {
  for (const [width, height] of [[568, 320], [844, 390], [1280, 720]]) for (const weapon of ['drone', 'laser']) {
    const touch = width < 1000, assets = assetFixture();
    assets.loadouts.solo = { mods: [], weapon: weapon + '-match', skill: 'emp-permanent' };
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
    await context.addInitScript(() => { localStorage.setItem('night-overwatch-coach-v2', 'done'); localStorage.setItem('night-overwatch-view', 'enhanced'); });
    const page = await context.newPage(); page.setDefaultTimeout(60000); page.on('pageerror', e => evidence.errors.push(e.message));
    await page.route('**/game-bootstrap.js', route => route.fulfill({ contentType: 'text/javascript', body: `const assets=${JSON.stringify(assets)},metadata={identity:{playerId:assets.playerId,nickname:'布局测试'},capabilities:{multiplayer:false,leaderboards:false}};globalThis.SmallGamesServices={ready:Promise.resolve(metadata),refresh:async()=>metadata,services:{nightAssets:async()=>structuredClone(assets)},createRecorder:()=>({start:async()=>null,record(){},finish:async()=>null,invalidate(){}})};` }));
    await page.route('**/api/competition/**', route => route.abort());
    const click = async id => { await press(page, id, touch, false); await settleVisuals(page); };
    const ready = async () => { await page.waitForFunction(() => globalThis.__night?.snapshot().ui.homeArtworkReady && __night.snapshot().progression.assets && !document.getElementById('night-startup')); await settleVisuals(page); };
    const start = async () => { await click('qm:modes'); await click('mode:solo'); await click('mode:enter'); await click('training'); await click('start'); await page.waitForFunction(() => __night.snapshot().phase === 'playing' && !__night.snapshot().modal); await settleVisuals(page); };
    const capture = async name => { const s = await snapshot(page); assertLayout(s, s.ui.width, s.ui.height); const file = `${weapon}-${name}-${width}.png`; await page.screenshot({ path: `${out}/${file}` }); evidence.screens.push(file); return s; };
    const cdp = touch ? await context.newCDPSession(page) : undefined;
    const point = b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    const drag = async (dx, dy, cancel = false) => {
      const s = await snapshot(page), p = point(row(s).find(b => b.id === 'skillUse')), target = { x: p.x + dx, y: p.y + dy };
      if (touch) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...target, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
      } else {
        await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(target.x, target.y, { steps: 8 });
        if (cancel) { await page.keyboard.press('Escape'); await page.mouse.up(); await settleVisuals(page); await click('resume'); }
        else await page.mouse.up();
      }
      await settleVisuals(page);
    };
    await page.goto(base + '?dev=0'); await ready(); assert.equal((await snapshot(page)).viewMode, 'night'); await start();
    const initial = await capture('default'), buttons = row(initial);
    assert.equal(buttons.length, 2); assert.equal(buttons[0].y, buttons[1].y); assert(buttons.every(b => b.h >= 44));
    assert(row(initial).find(b => b.id === 'skillUse').text.startsWith('电磁干扰\n'));
    await drag(55, -30); let s = await capture('moved'); const moved = geometry(s);
    assert.notDeepEqual(moved, geometry(initial)); assert.equal(s.skill.remaining, 0); assert.equal(s.fired, initial.fired); assert.equal(s.selected, initial.selected);
    await drag(-35, -15, true); s = await snapshot(page); assert.deepEqual(geometry(s), moved); assert.equal(s.skill.remaining, 0);
    await click('skillUse'); assert((await snapshot(page)).skill.remaining > 0); await drag(-25, 10); s = await capture('active-moved');
    assert(s.skill.remaining > 0); const saved = geometry(s);
    await page.reload(); await ready(); assert.equal((await snapshot(page)).viewMode, 'night'); await start(); assert.deepEqual(geometry(await snapshot(page)), saved);
    await page.setViewportSize({ width: width === 568 ? 844 : 568, height: width === 568 ? 390 : 320 }); await settleVisuals(page);
    s = await capture('resized'); assert(row(s).every(b => b.x >= 0 && b.x + b.w <= s.ui.width && b.y >= 0 && b.y + b.h <= s.ui.height));
    assert.deepEqual(s.held, []); evidence.checks.push({ width, height, weapon, touch, drag: true, cancelled: true, disabledDrag: true, reload: true, resize: true });
    await context.close();
  }
  assert.deepEqual(evidence.errors, []); await acceptanceBuild(base);
  await writeFile(`${out}/evidence.json`, JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence, null, 2));
} finally { await browser.close(); }
