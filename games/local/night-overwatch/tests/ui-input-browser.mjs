import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { acceptanceBuild, press, snapshot, assertLayout, navigateMap, aimAt } from './flight-browser.mjs';

const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const out = new URL('../reports/2026-10-28-visual-rebuild/input/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: process.platform === 'win32' ? ['--use-angle=d3d11'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const evidence = { build, checks: [], errors: [], clips: {} };
let activePage;
try {
  for (const [width, height] of [[568, 320], [844, 390], [1280, 720]]) {
    const touch = width < 1000, record = width === 1280;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch,
      ...(record ? { recordVideo: { dir: fileURLToPath(out), size: { width, height } } } : {}) });
    const page = await context.newPage(), started = Date.now();
    activePage = page;
    page.on('pageerror', error => evidence.errors.push(error.message));
    // This UI regression must not edit a real account or create a public match.
    await page.route('**/api/competition/**', route => route.abort());
    await page.goto(base + '?dev=0');
    await page.waitForFunction(() => globalThis.__night?.snapshot().ui.homeArtworkReady && __night.snapshot().buttons.some(b => b.id === 'online:profile'));
    await page.waitForTimeout(600);
    const click = id => press(page, id, touch, false);
    const capture = async name => {
      await page.waitForTimeout(250);
      assertLayout(await snapshot(page), width, height);
      await page.screenshot({ path: fileURLToPath(new URL(name + '-' + width + '.png', out)) });
    };
    const clip = async (name, duration = 3) => {
      if (!record) return;
      evidence.clips[name] = { start: (Date.now() - started) / 1000, duration };
      await page.waitForTimeout(duration * 1000);
    };
    const field = async name => page.evaluate(async name => {
      const { director, EditBox, UITransform, Label } = await System.import('cc');
      const edit = director.getScene().getComponentsInChildren(EditBox).find(edit => edit.node.name === name && edit.node.activeInHierarchy);
      const bounds = edit.node.getComponent(UITransform).getBoundingBoxToWorld();
      return { x: bounds.x + bounds.width / 2, y: __night.snapshot().ui.height - bounds.y - bounds.height / 2,
        centered: edit.textLabel.verticalAlign === Label.VerticalAlign.CENTER,
        placeholderCentered: edit.placeholderLabel.verticalAlign === Label.VerticalAlign.CENTER,
        labels: edit.node.getComponentsInChildren(Label).length,
        placeholderVisible: edit.placeholderLabel.node.activeInHierarchy };
    }, name);
    const edit = async (name, value, resize = false) => {
      const bounds = await field(name);
      assert(bounds.centered && bounds.placeholderCentered, name + ': vertically centered labels');
      assert.equal(bounds.labels, 2, name + ': only text and placeholder labels exist');
      if (touch) await page.touchscreen.tap(bounds.x, bounds.y); else await page.mouse.click(bounds.x, bounds.y);
      const input = page.locator('input:visible');
      await input.waitFor();
      const id = await input.getAttribute('id');
      await page.waitForTimeout(350);
      assert.equal(await page.evaluate(() => document.activeElement.id), id, 'tap keeps focus');
      await input.fill(value);
      if (resize) {
        await page.setViewportSize({ width, height: height - 100 });
        await page.waitForTimeout(400);
        assert.equal(await page.evaluate(() => document.activeElement.id), id, 'keyboard resize keeps the same input focused');
      }
      await page.keyboard.type('07', { delay: 80 });
      await page.waitForTimeout(400);
      assert.equal(await input.inputValue(), value + '07');
      assert.equal(await page.evaluate(() => document.activeElement.id), id);
      await page.keyboard.press('Enter');
      if (resize) await page.setViewportSize({ width, height });
      await page.waitForTimeout(400);
      assert.equal((await field(name)).placeholderVisible, false, name + ': placeholder hides after typing');
    };
    await clip('home');
    await click('online:profile');
    await edit('draftName', '夜航飞行员', true);
    await capture('nickname'); await clip('nickname');
    const nameBounds = await field('draftName');
    if (touch) await page.touchscreen.tap(nameBounds.x, nameBounds.y); else await page.mouse.click(nameBounds.x, nameBounds.y);
    await page.locator('input:visible').waitFor();
    await click('online:saveName');
    await page.waitForFunction(() => __night.snapshot().online.identity.name === '夜航飞行员07');
    await click('online:dismiss');
    await page.reload();
    await page.waitForFunction(() => globalThis.__night?.snapshot().ui.homeArtworkReady && __night.snapshot().online.identity.name === '夜航飞行员07');
    await page.waitForTimeout(600);
    await click('online:history');
    await page.waitForTimeout(400);
    assert(!(await snapshot(page)).buttons.some(b => b.id === 'settings'));
    assert.equal(await page.getByRole('button', { name: '设置', exact: true }).count(), 0);
    await capture('records'); await clip('records');
    await click('online:dismiss');
    await click('online:menu'); await click('online:join');
    await edit('draftCode', '1234'); await edit('draftPassword', 'friends');
    await click('online:dismiss');
    await click('missions'); await click('start');
    await page.waitForFunction(() => __night.snapshot().phase === 'playing');
    let state = await snapshot(page);
    const report = state.buttons.find(b => b.id === 'battleReport'), map = state.ui.minimap;
    assert.equal(report.x + report.w, map.x + map.w);
    assert.equal(report.y, map.y + map.h + 6);
    assert(report.h >= 44);
    await capture('battle');
    await click('battleReport');
    const time = (await snapshot(page)).time;
    await capture('report'); await clip('report', 4);
    await page.waitForTimeout(500);
    assert((await snapshot(page)).time > time, 'report does not pause battle');
    await click('close');
    if (record) {
      await click('weapon0');
      const firedBefore = (await snapshot(page)).fired;
      evidence.clips.gameplay = { start: (Date.now() - started) / 1000, duration: 20 };
      const until = Date.now() + 21500;
      let shots = 0;
      while (Date.now() < until) {
        state = await snapshot(page);
        const target = state.units.find(unit => !unit.friendly && unit.hp > 0);
        assert(target && state.phase === 'playing');
        await navigateMap(page, target); await aimAt(page, target);
        await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
        if (shots < 3) await capture('fire-' + shots++);
      }
      assert((await snapshot(page)).fired > firedBefore, 'real mouse fire still works');
      evidence.video = await page.video().path();
    }
    await click('settings'); await click('home'); await click('exitConfirm');
    await click('online:menu'); await click('online:bot');
    await page.waitForFunction(() => __night.snapshot().online.active && !__night.snapshot().modal);
    await capture('duel'); await click('battleReport');
    assert.match((await snapshot(page)).modal, /^report:/);
    await click('close');
    evidence.checks.push({ width, height, nicknameSaved: true, keyboardResize: true, roomAndPassword: true, historySettingsHidden: true, reportInSoloAndDuel: true });
    await context.close();
  }
  assert.deepEqual(evidence.errors, []);
} catch (error) {
  evidence.failure = error.message;
  if (activePage && !activePage.isClosed()) {
    evidence.last = await snapshot(activePage);
    await activePage.screenshot({ path: fileURLToPath(new URL('failure.png', out)) });
  }
  throw error;
} finally {
  await browser.close();
  await writeFile(new URL('evidence.json', out), JSON.stringify(evidence, null, 2));
}
console.log(JSON.stringify(evidence));
