import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const root = fileURLToPath(new URL('../', import.meta.url));
const out = root + 'docs/design/native-2026-10-06/'; await mkdir(out, { recursive: true });
const mime = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.webp': 'image/webp' };
const server = createServer(async (req, res) => {
  try { const url = new URL(req.url, 'http://local'), path = url.pathname === '/' ? 'scripts/native-preview.html' : url.pathname.startsWith('/assets/') ? 'public' + url.pathname : url.pathname.slice(1);
    if (path.includes('..')) throw new Error('invalid path'); const ext = path.slice(path.lastIndexOf('.')); res.setHeader('Content-Type', mime[ext] || 'application/octet-stream'); res.end(await readFile(root + path));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  for (const width of [320, 390, 430]) {
    const page = await browser.newPage({ viewport: { width, height: width === 320 ? 568 : 844 }, hasTouch: true, deviceScaleFactor: 1 }); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + server.address().port); await page.waitForFunction(() => window.nativeGame);
    const capture = name => page.screenshot({ path: out + `${name}-${width}.png` });
    const hit = async label => { const result = await page.evaluate(label => nativeLabels().find(t => t.text === label), label); assert.ok(result, `找不到 ${label}`); return result; };
    const tap = async label => { const p = await hit(label); assert.ok(p.y >= 24 && p.y <= (width === 320 ? 548 : 824), `${label} outside safe area: ${p.y}`); await page.touchscreen.tap(p.x, p.y); await page.waitForTimeout(120); };
    const has = label => page.evaluate(label => nativeLabels().some(t => t.text === label), label);
    await capture('home-actual');
    const start = await hit('开始五幕旅途'), cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y, id: 1 }, { x: start.x + 50, y: start.y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); assert.equal(await has('此时 · 此地'), true);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 5, y: 5, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); assert.equal(await has('此时 · 此地'), true);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); assert.equal(await has('此时 · 此地'), true);
    await tap('设置'); await capture('settings-actual'); await tap('旅途：悠闲无计时'); await tap('返回主页');
    await tap('帮助'); await capture('help-actual'); await tap('返回');
    await tap('选择一幕练习'); await capture('levels-actual'); await tap('莲花塔影落进护城河');
    await page.waitForTimeout(300); await capture('play-actual'); await tap('暂停'); await capture('pause-actual'); await tap('继续观察');
    await page.evaluate(() => { nativeLifecycle('Hide'); nativeLifecycle('Show'); }); assert.equal(await has('旅途已暂停'), true); await tap('继续观察');
    await tap('地图选点'); await capture('map-actual'); await page.touchscreen.tap(width / 2, 290); await page.waitForTimeout(120);
    await tap('输入猜测年代'); await capture('year-actual'); await tap('1'); await tap('0'); await tap('0'); await tap('完成年代输入'); await tap('提交地点与年代');
    await capture('reveal-actual'); await tap('史料与解说'); await capture('learn-actual'); await tap('返回本幕'); await tap('前往下一幕'); await capture('summary-actual');
    await page.reload(); await page.waitForFunction(() => window.nativeGame); await tap('继续存档'); assert.equal(await has('史料与解说'), true);
    await tap('暂停'); await tap('保存并返回主页'); await tap('开始五幕旅途'); await page.waitForTimeout(320); await capture('timed-actual');
    await page.evaluate(() => nativeLifecycle('Hide')); const remaining = await page.evaluate(() => JSON.parse(localStorage.getItem('here-and-then:native:v1')).journey.remaining); assert.ok(remaining < 90 && remaining > 85);
    await page.evaluate(() => nativeLifecycle('Show')); await page.waitForTimeout(250); await page.evaluate(() => nativeLifecycle('Hide')); assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('here-and-then:native:v1')).journey.remaining), remaining);
    await page.evaluate(() => nativeLifecycle('Show')); await tap('继续观察'); await page.waitForTimeout(220); await page.evaluate(() => nativeLifecycle('Hide')); assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('here-and-then:native:v1')).journey.remaining) < remaining);
    assert.deepEqual(errors, []); await cdp.detach(); await page.close();
  }
  console.log('native Canvas browser: 320/390/430 touch home/levels/play/map/year/reveal/learn/pause/help/settings/summary, cancel/multi-touch/sliding, background and restart passed');
} finally { await browser.close(); server.close(); }
