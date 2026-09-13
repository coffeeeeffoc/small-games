import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newGame } from '../src/game.js';
import { createCard, decode } from '../src/shared.js';
import { exportGame } from '../src/storage.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts');
await mkdir(out, { recursive: true });
const url = process.env.TEST_URL || 'http://127.0.0.1:4177';
const executablePath = process.env.BROWSER_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const errors = [], passed = [], layouts = [];
const state = async page => decode(await page.evaluate(() => window.__gameSnapshot()));
const rawState = page => page.evaluate(() => window.__gameSnapshot());
const click = (page, action) => page.locator(`[data-action="${action}"]`).filter({ visible: true }).first().click();
const unit = (page, uid) => page.locator(`.map-stage [data-action="owned"][data-uid="${uid}"]`);
const handCard = (page, uid) => page.locator(`[data-drag-zone="hand"][data-uid="${uid}"]`);
const shopCard = (page, slot) => page.locator(`.floating-market [data-action="shop"][data-slot="${slot}"]`);
const slot = (page, at) => page.locator(`.map-stage [data-action="slot"][data-slot="${at}"]`);
const handZone = page => page.locator('[data-drop-zone="hand"]').first();

function fixture(seed = 'map-interactions') {
  const game = newGame(seed), p = game.players[0];
  p.level = 5; p.gold = 60;
  const add = id => createCard(p, id);
  const source = add('character.neutral.mercenary'); source.level = 7n;
  const target = add('character.legacy.successor'); target.level = 3n;
  const armored = add('character.neutral.medic');
  const oldSword = add('equipment.neutral.shortsword');
  const oldCoat = add('equipment.neutral.coat'); armored.equipment = [oldSword, oldCoat];
  p.board[0] = source; p.board[1] = armored; p.board[3] = target;
  const duplicate = add(source.defId); duplicate.level = 2n;
  const reserve = add('character.armory.rivet_guard');
  const transfer = add('spell.neutral.succession');
  const training = add('spell.neutral.training');
  const spear = add('equipment.neutral.spear');
  const sword = add('equipment.neutral.shortsword');
  p.hand = [duplicate, reserve, transfer, training, spear, sword];
  p.shop = ['character.neutral.medic', 'character.legacy.vessel', 'character.ember.gravekeeper', 'spell.neutral.training', 'equipment.neutral.coat'].map(add);
  return { game, p, source, target, armored, oldSword, oldCoat, duplicate, reserve, transfer, training, spear, sword };
}

async function open(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url);
  await page.locator('[data-action="new"]').first().waitFor();
  assert.match(await page.title(), /万象旅团/);
}
async function load(page, f, name) {
  const file = path.join(out, `map-fixture-${name}.json`);
  await writeFile(file, exportGame(f.game));
  await click(page, 'menu'); await click(page, 'import');
  await page.locator('[name="save"]').setInputFiles(file);
  await page.locator('[name="replace"]').check();
  await page.locator('#import-form button[type="submit"]').click();
  await page.locator('#import-form').waitFor({ state: 'hidden' });
  await page.locator('[data-action="begin"]').waitFor({ state: 'visible' });
  await page.locator('.map-game .map-stage').waitFor();
  assert.equal((await state(page)).phase, 'prep');
}
async function point(locator, edge = false) {
  const page = locator.page();
  for (let turns = 0; turns < 8; turns++) {
    const direction = await locator.evaluate(element => {
      if (element.dataset.dragZone !== 'hand') return 0;
      const row = element.closest('.hand-row').getBoundingClientRect(), card = element.getBoundingClientRect();
      const x = card.left + card.width / 2;
      return x < row.left + 2 ? -1 : x > row.right - 2 ? 1 : 0;
    });
    if (!direction) break;
    const button = page.locator(`[data-action="scroll-hand"][data-direction="${direction}"]`);
    if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await button.tap(); else await button.click();
    await page.evaluate(() => new Promise(resolve => {
      const row = document.querySelector('.hand-row');
      let previous = row.scrollLeft, stable = 0;
      const check = () => {
        stable = Math.abs(row.scrollLeft - previous) < 0.1 ? stable + 1 : 0;
        previous = row.scrollLeft;
        if (stable >= 6) resolve(); else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    }));
  }
  const box = await locator.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, 'drag target must have a visible box');
  const result = { x: box.x + box.width / 2, y: box.y + (edge ? Math.min(5, box.height / 2) : box.height / 2) };
  assert.ok(await locator.evaluate((element, xy) => element.contains(document.elementFromPoint(xy.x, xy.y)), result), 'drag target must be reachable through visible UI, without programmatic scrolling');
  return result;
}
async function drag(page, source, target, { touch = false, cancel = false, blur = false, edge = false } = {}) {
  const to = typeof target.boundingBox === 'function' ? await point(target, edge) : target;
  const from = await point(source);
  // CDP emits native touch/pointer events, including pointercancel; dispatchEvent would miss capture and hit testing.
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    const send = (type, xy) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: xy ? [{ ...xy, id: 1, radiusX: 3, radiusY: 3, force: 1 }] : [] });
    await send('touchStart', from);
    for (let i = 1; i <= 12; i++) await send('touchMove', { x: from.x + (to.x - from.x) * i / 12, y: from.y + (to.y - from.y) * i / 12 });
    await send(cancel ? 'touchCancel' : 'touchEnd');
    await cdp.detach();
  } else {
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    if (cancel) await page.keyboard.press('Escape');
    if (blur) await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.mouse.up();
  }
  await page.waitForTimeout(100);
}
async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight }));
  layouts.push({ label, ...dimensions });
  assert.ok(dimensions.documentWidth <= dimensions.width + 1, `${label}: page overflows horizontally: ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.documentHeight <= dimensions.height + 1, `${label}: page overflows vertically: ${JSON.stringify(dimensions)}`);
}
async function battlefieldOnly(page) {
  assert.equal((await state(page)).phase, 'battle');
  assert.equal(await page.locator('.floating-market,.floating-hand,.map-economy,.leaderboard,.battle-inspector').count(), 0, 'battle must contain only the map and playback controls');
  assert.ok(await page.locator('.map-stage .map-unit .map-piece').count(), 'map must contain full-body actor pieces');
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(); await open(page);
  const f = fixture(); await load(page, f, 'desktop');
  let before = await rawState(page);
  await drag(page, shopCard(page, 4), { x: 2, y: 2 });
  assert.equal(await rawState(page), before, 'invalid shop drop must not charge, consume, or advance RNG');
  await drag(page, handCard(page, f.reserve.uid), slot(page, 5), { cancel: true });
  assert.equal(await rawState(page), before, 'Escape cancels a drag');
  await drag(page, handCard(page, f.reserve.uid), slot(page, 5), { blur: true });
  assert.equal(await rawState(page), before, 'window blur cancels a drag');
  assert.equal(await page.locator('.selected-inspector,.intent-inspector').count(), 0, 'cancelled drag must not turn into a card click');
  passed.push('invalid drop, Escape and blur cancel without changing state or opening a card');

  const purchased = f.p.shop[0];
  await drag(page, shopCard(page, 0), slot(page, 2));
  let p = (await state(page)).players[0];
  assert.equal(p.gold, 57); assert.equal(p.board[2].uid, purchased.uid); assert.equal(p.hand.length, 6); assert.equal(p.shop[0], null);
  const boughtSpell = f.p.shop[3];
  await drag(page, shopCard(page, 3), handZone(page), { edge: true });
  p = (await state(page)).players[0]; assert.equal(p.gold, 55); assert.ok(p.hand.some(c => c.uid === boughtSpell.uid));
  await drag(page, handCard(page, f.duplicate.uid), unit(page, f.source.uid));
  assert.match(await page.locator('.level-preview').textContent(), /L7 → L9/);
  await click(page, 'clear'); assert.equal((await state(page)).players[0].board[0].level, 7n);
  await drag(page, handCard(page, f.duplicate.uid), unit(page, f.source.uid));
  await click(page, 'confirm-intent'); assert.equal((await state(page)).players[0].board[0].level, 9n);
  await drag(page, handCard(page, f.training.uid), unit(page, f.source.uid));
  assert.equal((await state(page)).players[0].board[0].level, 11n);
  passed.push('shop character buys and deploys atomically; shop spell buys to hand; merge preview/cancel/confirm; direct targeted spell');

  await drag(page, handCard(page, f.spear.uid), unit(page, f.armored.uid));
  assert.equal((await state(page)).players[0].board[1].equipment[0].uid, f.oldSword.uid, 'full equipment slots wait for a replacement choice');
  await page.locator('[data-action="equip-slot"][data-slot="0"]').click();
  await click(page, 'confirm-intent');
  p = (await state(page)).players[0]; assert.equal(p.board[1].equipment[0].uid, f.spear.uid); assert.ok(p.hand.some(c => c.uid === f.oldSword.uid));
  await drag(page, handCard(page, f.sword.uid), unit(page, f.source.uid));
  assert.equal((await state(page)).players[0].board[0].equipment[0].uid, f.sword.uid);
  before = await rawState(page);
  await drag(page, handCard(page, f.transfer.uid), unit(page, f.source.uid)); await unit(page, f.target.uid).click();
  assert.match(await page.locator('.level-preview').textContent(), /L11 → L1/);
  await click(page, 'clear'); assert.equal(await rawState(page), before, 'cancel transfer retains both levels and the spell');
  await drag(page, handCard(page, f.transfer.uid), unit(page, f.source.uid)); await unit(page, f.target.uid).click(); await click(page, 'confirm-intent');
  p = (await state(page)).players[0]; assert.equal(p.board[0].level, 1n); assert.equal(p.board[3].level, 13n);
  await drag(page, handCard(page, f.reserve.uid), slot(page, 4));
  await drag(page, unit(page, f.reserve.uid), slot(page, 5));
  assert.equal((await state(page)).players[0].board[5].uid, f.reserve.uid);
  await drag(page, unit(page, f.reserve.uid), handZone(page), { edge: true });
  assert.ok((await state(page)).players[0].hand.some(c => c.uid === f.reserve.uid));
  const goldBeforeSale = (await state(page)).players[0].gold;
  await drag(page, handCard(page, f.reserve.uid), page.locator('[data-drop-zone="sell"]'));
  p = (await state(page)).players[0]; assert.equal(p.gold, goldBeforeSale + 1); assert.ok(!p.hand.some(c => c.uid === f.reserve.uid));
  passed.push('direct equip, full-slot replacement, two-target transfer, deploy/move/recall and drag-to-sell');
  await noOverflow(page, 'desktop preparation');
  await page.screenshot({ path: path.join(out, 'map-prep-desktop.png') });

  await click(page, 'begin'); await battlefieldOnly(page);
  await page.waitForFunction(() => [...document.querySelectorAll('.map-unit[data-motion="attack"] .map-piece')].some(piece => piece.getAnimations().some(animation => animation.effect.getKeyframes().some(key => /translate\([^)]*[1-9]/.test(key.transform || '')))), null, { timeout: 15000 });
  await click(page, 'pause');
  const progress = await page.locator('.battle-controls .micro').textContent();
  await page.waitForTimeout(950);
  assert.equal(await page.locator('.battle-controls .micro').textContent(), progress, 'pause freezes battle progress');
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('.map-piece')].flatMap(piece => piece.getAnimations()).every(animation => animation.playState !== 'running')), 'pause freezes actor animations');
  await noOverflow(page, 'desktop battle');
  await page.screenshot({ path: path.join(out, 'map-battle-desktop.png') });
  await click(page, 'pause');
  await page.waitForFunction(previous => document.querySelector('.battle-controls .micro')?.textContent !== previous, progress);
  const hpBefore = (await state(page)).players[0].hp;
  await page.reload(); await click(page, 'continue');
  assert.equal((await state(page)).phase, 'battle'); assert.equal((await state(page)).players[0].hp, hpBefore);
  await click(page, 'skip');
  const settled = await state(page); assert.ok(['result', 'ended'].includes(settled.phase));
  const settledHp = settled.players[0].hp;
  await page.reload(); await click(page, 'continue'); assert.equal((await state(page)).players[0].hp, settledHp);
  passed.push('battle-only map, real attack translation, animation pause/resume, interrupted reload and single settlement');

  const poor = fixture('map-no-gold'); poor.p.gold = 0; await load(page, poor, 'poor');
  before = await rawState(page); await drag(page, shopCard(page, 0), slot(page, 2));
  assert.equal(await rawState(page), before, 'unaffordable direct deployment must retain the entire state');
  const full = fixture('map-full-hand');
  while (full.p.hand.length < 10) full.p.hand.push(createCard(full.p, 'spell.neutral.training'));
  await load(page, full, 'full-hand');
  before = await rawState(page); await drag(page, shopCard(page, 1), unit(page, full.source.uid));
  assert.equal(await rawState(page), before, 'full-hand occupied-slot swap must reject the whole purchase');
  await drag(page, shopCard(page, 0), slot(page, 2));
  p = (await state(page)).players[0]; assert.equal(p.hand.length, 10); assert.equal(p.board[2].uid, full.p.shop[0].uid); assert.equal(p.gold, 57);
  passed.push('no-gold purchase rollback; full-hand illegal swap rollback; full-hand direct deployment into a free slot');
  await context.close();

  for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
    const mobileContext = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const mobile = await mobileContext.newPage(); await open(mobile);
    const m = fixture(`map-touch-${viewport.width}`);
    m.p.hand = m.p.hand.filter(card => card.uid !== m.sword.uid);
    while (m.p.hand.length < 9) m.p.hand.push(createCard(m.p, 'spell.neutral.training'));
    m.p.hand.push(m.sword);
    await load(mobile, m, `touch-${viewport.width}`);
    for (const card of m.p.hand) await point(handCard(mobile, card.uid));
    assert.equal((await state(mobile)).players[0].hand.length, 10, 'browsing every hand card must retain all ten cards');
    before = await rawState(mobile);
    await drag(mobile, handCard(mobile, m.reserve.uid), slot(mobile, 4), { touch: true, cancel: true });
    assert.equal(await rawState(mobile), before, 'native touchcancel must keep the card and all resources');
    assert.equal(await mobile.locator('.selected-inspector,.intent-inspector').count(), 0, 'touchcancel must not synthesize a selection');
    await drag(mobile, handCard(mobile, m.reserve.uid), slot(mobile, 4), { touch: true });
    assert.equal((await state(mobile)).players[0].board[4].uid, m.reserve.uid);
    await drag(mobile, handCard(mobile, m.sword.uid), unit(mobile, m.reserve.uid), { touch: true });
    assert.equal((await state(mobile)).players[0].board[4].equipment[0].uid, m.sword.uid);
    await noOverflow(mobile, `${viewport.width}×${viewport.height} preparation`);
    await mobile.screenshot({ path: path.join(out, `map-prep-${viewport.width}x${viewport.height}.png`) });
    await click(mobile, 'begin'); await battlefieldOnly(mobile); await click(mobile, 'pause');
    await noOverflow(mobile, `${viewport.width}×${viewport.height} battle`);
    await mobile.screenshot({ path: path.join(out, `map-battle-${viewport.width}x${viewport.height}.png`) });
    await click(mobile, 'skip'); assert.ok(['result', 'ended'].includes((await state(mobile)).phase));
    passed.push(`native touch ${viewport.width}×${viewport.height}: page through all 10 cards, cancel, redeploy after paging, equip the last card, battle-only view and no page overflow`);
    await mobileContext.close();
  }
  assert.deepEqual(errors, [], 'browser must not emit errors');
  const report = { url, passed, layouts, errors };
  await writeFile(path.join(out, 'map-browser-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
