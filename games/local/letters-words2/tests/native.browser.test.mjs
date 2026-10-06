import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { startNativePreviewServer } from './native-preview.mjs';
import { findSpelling } from '../engine.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : '@playwright/test');
const screenshotRoot = process.env.NATIVE_SCREENSHOT_DIR || fileURLToPath(new URL('../docs/design/mobile-2026-10-06/implemented/', import.meta.url));
const settingsLearningOnly = process.env.NATIVE_BROWSER_SCOPE === 'settings-learning';
const pauseLinksOnly = process.env.NATIVE_BROWSER_SCOPE === 'pause-links';
await mkdir(screenshotRoot, { recursive: true });
const preview = await startNativePreviewServer({ port: 0 });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE || '/usr/bin/chromium' });
const errors = [];

async function makePage(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  const state = () => page.evaluate(() => window.__nativePreview.instance.state);
  const layout = () => page.evaluate(() => window.__nativePreview.instance.getLayout());
  const flush = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  async function swipe(delta, area) {
    const l = await layout(), fromY = area ? area.y + (delta >= 0 ? area.h - 16 : 16) : delta >= 0 ? l.height - l.bottom - 24 : l.top + 72;
    const x = l.originX + (area ? area.x + area.w / 2 : (l.width - 2 * l.originX) / 2);
    const limit = area ? area.h - 32 : l.height - l.bottom - l.top - 96;
    const toY = fromY - Math.sign(delta) * Math.min(Math.abs(delta), limit);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: fromY, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: toY, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await flush();
  }
  async function target(id) {
    for (let i = 0; i < 20; i++) {
      const l = await layout(), hit = l.targets.find(item => item.id === id) || l.targets.find(item => item.id.includes(id));
      assert.ok(hit, `${width} native ${l.page} exposes ${id}`);
      const y = hit.y + hit.h / 2;
      if (y >= l.top && hit.y + hit.h <= l.height - l.bottom) { await page.touchscreen.tap(hit.x + hit.w / 2, y); await flush(); return; }
      await swipe(hit.y + hit.h > l.height - l.bottom ? 300 : -300);
    }
    assert.fail(`${width} native target ${id} is unreachable`);
  }
  async function tile(id) {
    for (let i = 0; i < 35; i++) {
      const [l, s] = await Promise.all([layout(), state()]);
      const hit = l.tiles.find(item => item.id === id);
      if (hit && hit.y + hit.h / 2 > l.board.y + 2 && hit.y + hit.h / 2 < l.board.y + l.board.h - 2) { await page.touchscreen.tap(hit.x + hit.w / 2, hit.y + hit.h / 2); await flush(); return; }
      const t = s.game.tiles.find(item => item.id === id), size = l.tiles[0]?.w || Math.max(44, (l.width - 2 * l.originX - 54) / 360 * 64);
      assert.ok(t && !t.removed);
      const desired = Math.max(0, Math.min(l.board.maxScroll, (t.y + 32) * size / 64 - l.board.h / 2));
      await swipe(desired - l.boardScroll, l.board);
    }
    assert.fail(`${width} native tile ${id} is unreachable`);
  }
  async function finishWord() {
    const s = await state(), path = findSpelling(s.game, s.game.activeWordId);
    assert.ok(path?.length);
    for (const id of path) await tile(id);
    assert.equal((await state()).game.completed, s.game.completed + 1);
  }
  async function shot(name) { await flush(); await page.screenshot({ path: screenshotRoot + `/native-${name}-${width}.png` }); }
  await page.goto(preview.url); await page.waitForFunction(() => window.__nativePreview?.instance); await flush();
  return { page, context, cdp, state, layout, target, tile, finishWord, swipe, shot, flush };
}

try {
  if (pauseLinksOnly) {
    for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) {
      const run = await makePage(width, height);
      try {
        const { state, layout, target, tile, shot } = run;
        await target('拾词 →');
        const game = (await state()).game;
        await tile(findSpelling(game, game.activeWordId)[0]);
        const selected = (await state()).game;
        assert.equal(selected.selected.length, 1);
        await target('暂停'); await shot('pause');
        const l = await layout();
        for (const id of ['拾词指南', '设置']) {
          const hit = l.targets.find(item => item.id === id);
          assert.ok(hit && hit.w >= 44 && hit.h >= 44, `pause ${id} retains a usable touch area`);
        }
        await target('拾词指南'); assert.equal((await state()).page, 'help');
        await target('返回'); assert.equal((await state()).page, 'pause');
        assert.deepEqual((await state()).game, selected, 'pause guide returns with the exact selected cards and physical board');
      } finally { await run.context.close(); }
    }
  } else if (settingsLearningOnly) {
    for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) {
      const run = await makePage(width, height);
      try {
        const { page, state, layout, target, tile, shot, flush } = run;
        await target('设置');
        assert.equal((await state()).page, 'settings');
        await shot('settings');
        const l = await layout(), sound = l.targets.find(item => item.id === '游戏音效');
        assert.ok(sound && sound.w >= 44 && sound.h >= 44, 'native audio card contains a usable touch target');
        assert.ok(sound.y >= l.top && sound.y + sound.h <= l.height - l.bottom);
        assert.equal(l.targets.some(item => /全屏|拾词指南/.test(item.id)), false);
        const speakerX = sound.x + sound.w - 43, speakerY = sound.y + 51;
        assert.ok(speakerX - 22 >= sound.x && speakerX + 22 <= sound.x + sound.w && speakerY - 22 >= sound.y && speakerY + 22 <= sound.y + sound.h, 'the full 44 px speaker area is clickable');
        await page.touchscreen.tap(speakerX, speakerY); await flush();
        assert.equal(await page.evaluate(() => window.__nativePreview.readStore('ciyu-sound')), 'true');
        await shot('settings-sound-on');
        await page.reload(); await page.waitForFunction(() => window.__nativePreview?.instance); await flush();
        await target('设置');
        assert.equal(await page.evaluate(() => window.__nativePreview.readStore('ciyu-sound')), 'true', 'audio preference survives the native preview restart');
        const after = (await layout()).targets.find(item => item.id === '游戏音效');
        await page.touchscreen.tap(after.x + after.w - 43, after.y + 51); await flush();
        assert.equal(await page.evaluate(() => window.__nativePreview.readStore('ciyu-sound')), 'false');
        await shot('settings');
        await target('返回'); await target('学习入口'); await shot('learn');
        const learning = await layout();
        for (const id of ['教材练习', '我的词单']) {
          const card = learning.targets.find(item => item.id === id);
          assert.ok(card && card.w >= 44 && card.h >= 44);
          assert.ok(card.x >= learning.originX && card.x + card.w <= width - learning.originX);
        }
        await target('教材练习');
        await page.waitForFunction(() => window.__nativePreview.instance.getLayout().targets.some(item => item.id === 'publisher'));
        await target('返回'); assert.equal((await state()).page, 'learn');
        await target('我的词单'); assert.equal((await state()).page, 'custom');
        await target('返回'); assert.equal((await state()).page, 'learn');
        await target('返回'); await target('帮助'); assert.equal((await state()).page, 'help');
        await target('返回'); assert.equal((await state()).page, 'home');
        await target('拾词 →');
        const game = (await state()).game, path = findSpelling(game, game.activeWordId);
        await tile(path[0]);
        const selected = (await state()).game;
        assert.equal(selected.selected.length, 1);
        await target('暂停'); await shot('pause');
        assert.equal((await state()).page, 'pause'); assert.equal((await state()).paused, true);
        const pauseSetting = (await layout()).targets.find(item => item.id === '设置');
        assert.ok(pauseSetting && pauseSetting.w >= 44 && pauseSetting.h >= 44);
        await target('设置'); assert.equal((await state()).page, 'settings');
        await shot('settings');
        await target('返回'); assert.equal((await state()).page, 'pause');
        assert.deepEqual((await state()).game, selected, 'pause settings returns with the same physical board and selected letter');
        await target('继续拾词'); assert.equal((await state()).page, 'play');
        assert.deepEqual((await state()).game, selected);
      } finally { await run.context.close(); }
    }
  } else {
  for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) {
    const run = await makePage(width, height);
    try {
      const { page, cdp, state, layout, target, tile, finishWord, swipe, shot, flush } = run;
      assert.equal((await state()).page, 'home'); await shot('home');
      await target('主题词岛'); await shot('islands'); await target('dawn'); await shot('play');
      const initial = (await state()).game;
      const hit = (await layout()).tiles.at(-1), point = { x: hit.x + hit.w / 2, y: hit.y + hit.h / 2, id: 1 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await flush();
      assert.deepEqual((await state()).game, initial, 'browser pointer cancellation never picks a native card');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point, { ...point, id: 2, x: point.x + 20 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await flush();
      assert.deepEqual((await state()).game, initial, 'browser multitouch does not become a native tap');
      await target('暂停'); await shot('pause'); await target('邀请朋友同题'); await shot('share'); await target('邀请朋友同题');
      const shares = await page.evaluate(() => window.__nativePreview.shares);
      assert.equal(shares[0].query, 'game=letters-words2&mini=dawn&v=1');
      await target('返回小岛'); await target('继续拾词');
      while ((await state()).page !== 'result') await finishWord();
      await shot('result'); await target('再练一遍');
      assert.deepEqual((await state()).game, initial, 'native browser replay reproduces the exact board');
      const path = findSpelling((await state()).game, (await state()).game.activeWordId);
      await tile(path[0]);
      const selected = (await state()).game;
      await target('返回首页'); await target('学习入口'); await shot('learn'); await target('我的词单'); await shot('custom');
      await target('编辑词单'); await page.locator('#native-input').fill("can't 不能\nc++ 编程语言"); await page.locator('#native-confirm').tap(); await target('用这组词开始');
      assert.deepEqual((await state()).game.words.map(word => word.word), ["can't", 'c++']);
      while ((await state()).page !== 'result') await finishWord();
      await target('返回首页'); await target('学习入口'); await target('教材练习');
      await page.waitForFunction(() => window.__nativePreview.instance.getLayout().targets.some(item => item.id === 'publisher')); await shot('library');
      await target('unit'); await shot('picker');
      while (!(await layout()).targets.some(item => item.id === '整册练习')) await target('下一页');
      await target('整册练习'); await target('教材来源'); await shot('book-details'); await target('返回');
      await target('开始单元练习'); await page.waitForFunction(() => window.__nativePreview.instance.state.page === 'play');
      assert.ok((await state()).practice?.batches.length > 1, 'browser SDK FS reads the actual packaged full textbook');
      await target('换词义'); await shot('words'); await target('返回');
      await target('返回首页'); await target('设置'); await shot('settings'); await target('返回'); await target('帮助'); await shot('help');
      await page.evaluate(() => { window.__nativePreview.emit('Hide'); window.__nativePreview.emit('Show', {}); });
      assert.ok(await page.evaluate(() => [...window.__nativePreview.listeners.values()].some(set => set.size)));
      await page.evaluate(() => { window.__nativePreview.instance.stop(); window.__nativePreview.instance.stop(); });
      assert.equal(await page.evaluate(() => [...window.__nativePreview.listeners.values()].reduce((sum, set) => sum + set.size, 0)), 0);
      assert.ok(selected.selected.length > 0, 'real touchscreen selected a letter before leaving play');
    } finally { await run.context.close(); }
  }
  const wide = await makePage(844, 390);
  try {
    await wide.shot('home');
    await wide.target('主题词岛'); await wide.target('dawn'); await wide.shot('play');
    const landscapeLayout = await wide.layout();
    for (const hit of landscapeLayout.targets.filter(item => ['暂停', '提示', '重排', '✓'].includes(item.id))) {
      assert.ok(hit.y >= landscapeLayout.top && hit.y + hit.h <= landscapeLayout.height - landscapeLayout.bottom, `${hit.id} fits landscape safe area`);
      assert.ok(hit.x >= 0 && hit.x + hit.w <= 844);
    }
    await wide.finishWord(); await wide.shot('play-progress');
    const before = (await wide.state()).game;
    await wide.page.setViewportSize({ width: 390, height: 844 }); await wide.flush();
    assert.deepEqual((await wide.state()).game, before, 'browser orientation resize retains the native board');
  } finally { await wide.context.close(); }
  }
  assert.deepEqual(errors, []);
  console.log(pauseLinksOnly
    ? 'Native real Canvas pause scope: 320/390/430 pause screenshots, 44 px guide/settings links and guide return to pause with exact selected-board retention passed. Screenshots: ' + screenshotRoot
    : settingsLearningOnly
      ? 'Native real Canvas scoped browser: 320/390/430 settings/learning/pause screenshots, 44 px speaker/settings touches, persisted audio, homepage and pause settings return chains with exact selection retention, textbook/custom navigation and help passed. Screenshots: ' + screenshotRoot
      : 'Native real Canvas browser: 320/390/430 mobile touch home/islands/play/pause/share/result/custom/textbook/picker/help, actual SDK keyboard/FS, cancel/multitouch, exact replay, orientation save retention and disposal passed. Screenshots: ' + screenshotRoot);
} finally { await browser.close(); await preview.close(); }
