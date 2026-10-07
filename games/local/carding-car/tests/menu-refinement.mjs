import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { shopItems, milestones } from '../assets/scripts/Career.ts';
import { settingsLayout } from '../assets/scripts/HUDLayout.ts';
import { gameURL, verifyBuild, startBrowser, waitForReady, tapDesign, designPoint,
  mobileOptions, reportsURL, displayGeometry } from './browser-utils.mjs';

// Normal runs require a matching Creator build. An explicitly opted-in local
// source overlay is useful for rendering reviews, but must never impersonate it.
async function verifyReviewBuild(url) {
  if (process.env.KART_ALLOW_SOURCE_OVERLAY !== '1')
    return { kind: 'creator-build', ...await verifyBuild(url) };
  const response = await fetch(new URL('overlay-preview.json', url), { cache: 'no-store' });
  assert.ok(response.ok, 'source-overlay opt-in requires overlay-preview.json');
  const overlay = await response.json();
  assert.match(overlay.warning, /not a full Creator rebuild/i);
  const scripts = new URL('../assets/scripts/', import.meta.url);
  const files = (await readdir(scripts, { recursive: true })).filter(file => file.endsWith('.ts')).sort();
  assert.deepEqual(overlay.modules.map(module => module.relative).sort(), files,
    'overlay must account for every current TypeScript module');
  for (const module of overlay.modules) {
    const source = await readFile(new URL(module.relative, scripts));
    assert.equal(module.sourceSha256, createHash('sha256').update(source).digest('hex'),
      `source overlay is stale: ${module.relative}`);
  }
  const original = await fetch(new URL('build-info.json', url)).then(result => result.json());
  assert.equal(original.creator, '3.8.8');
  await mkdir(reportsURL, { recursive: true });
  return { kind: 'source-overlay', original, overlay,
    limitation: 'Current TypeScript over existing Creator runtime/assets; full Creator rebuild and devices remain unverified.' };
}

const url = gameURL(), build = await verifyReviewBuild(url), browser = await startBrowser(url);
const evidence = { build,
  environment: 'Linux/desktop Chromium, 844×390 and rotated 390×844 phone viewport, real touchscreen/CDP input; physical devices unverified',
  errors: [], cases: [] };
const state = page => page.evaluate(() => __kart.snapshot());
const shot = (page, name) => page.screenshot({ path: fileURLToPath(new URL(`menu-refinement-${name}.png`, reportsURL)) });
async function open({ wallet, savedCareer } = {}) {
  const context = await browser.newContext({ ...mobileOptions, viewport: { width: 844, height: 390 } });
  if (wallet !== undefined || savedCareer) await context.addInitScript(({ wallet, savedCareer }) => {
    if (!localStorage.getItem('kart-career-v1'))
      localStorage.setItem('kart-career-v1', JSON.stringify(savedCareer || { coins: wallet }));
  }, { wallet, savedCareer });
  const page = await context.newPage();
  page.on('pageerror', error => evidence.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().startsWith('Ignored attempt to cancel a touchcancel event'))
      evidence.errors.push(message.text());
  });
  await page.goto(url); await waitForReady(page);
  return { page, context };
}
function findButton(snapshot, pattern, predicate = () => true) {
  return snapshot.home.buttons.find(button => pattern.test(button.label) && predicate(button));
}
async function tapButton(page, pattern, { predicate, disabled = false } = {}) {
  const button = findButton(await state(page), pattern, predicate);
  assert.ok(button, `missing button ${pattern}`);
  if (!disabled) assert.equal(button.enabled, true, `${button.label} must be enabled`);
  await tapDesign(page, button.designX, button.designY);
  await page.waitForTimeout(80);
  return button;
}
async function assertTargets(page) {
  const current = await state(page);
  for (const [index, button] of current.home.buttons.entries()) {
    assert.ok(button.width >= 44 && button.height >= 44, `${button.label}: touch area too small`);
    assert.ok(button.designX - button.width / 2 >= 8 && button.designX + button.width / 2 <= 952,
      `${button.label}: outside horizontal safe bounds`);
    assert.ok(button.designY - button.height / 2 >= 8 && button.designY + button.height / 2 <= 532,
      `${button.label}: outside vertical safe bounds`);
    for (const other of current.home.buttons.slice(index + 1)) {
      const horizontal = Math.abs(button.x - other.x) < (button.width + other.width) / 2;
      const vertical = Math.abs(button.y - other.y) < (button.height + other.height) / 2;
      assert.ok(!(horizontal && vertical), `${button.label} and ${other.label}: touch areas overlap`);
    }
  }
}
async function labels(page) {
  return page.evaluate(async () => {
    const cc = await System.import('cc');
    const result = [];
    const visit = node => {
      if (!node.activeInHierarchy) return;
      const label = node.getComponent(cc.Label), transform = node.getComponent(cc.UITransform);
      if (label && transform) {
        const rect = transform.getBoundingBoxToWorld();
        result.push({ text: label.string, x: rect.x, y: rect.y, width: rect.width, height: rect.height });
      }
      node.children.forEach(visit);
    };
    visit(cc.director.getScene());
    return result;
  });
}
async function renderedDecoration(page, assetId) {
  return page.evaluate(async assetId => {
    const cc = await System.import('cc');
    const visit = node => node.activeInHierarchy &&
      (node.name.startsWith(`Decoration:${assetId}`) || node.children.some(visit));
    return visit(cc.director.getScene());
  }, assetId);
}
const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x &&
  a.y < b.y + b.height && a.y + a.height > b.y;

try {
  const { page, context } = await open();
  await tapButton(page, /选择比赛/); await waitForReady(page); await assertTargets(page);
  // Cancel a real touch on a selector before release: cancellation cannot select.
  const beforeCancel = await state(page);
  const selector = findButton(beforeCancel, /›|下一/, button => button.designX < 480);
  const point = await designPoint(page, selector.designX, selector.designY);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  assert.deepEqual((await state(page)).selection, beforeCancel.selection);

  await tapButton(page, /下一.*赛车|赛车.*下一|›/, {
    predicate: button => button.designX > 500 && button.designY < 340,
  });
  await waitForReady(page);
  const locked = await state(page);
  assert.equal(locked.career.owned.includes(`vehicle:${locked.selection.vehicle}`), false,
    'this regression exercises browsing an unowned vehicle');
  const enter = findButton(locked, /进入赛道|尚未解锁|先解锁|未解锁/,
    button => button.designX > 480 && button.designY > 400);
  assert.ok(enter && !enter.enabled, 'unowned vehicle visibly disables race entry');
  const prices = (await labels(page)).filter(label => /\d+\s*金币/.test(label.text));
  assert.ok(prices.length, 'a visible unlock price is present');
  const enterRect = { x: enter.designX - enter.width / 2, y: 540 - enter.designY - enter.height / 2,
    width: enter.width, height: enter.height };
  assert.ok(prices.every(label => !overlaps(label, enterRect)), 'unlock prices must not sit underneath race entry');
  await tapDesign(page, enter.designX, enter.designY);
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  assert.equal((await state(page)).home.page, 'setup');
  assert.equal((await state(page)).home.visible, true);
  assert.equal((await state(page)).staged, false);
  await shot(page, 'locked-vehicle');

  await tapButton(page, /^去解锁$/); await waitForReady(page);
  assert.equal((await state(page)).home.page, 'shop');
  assert.equal((await state(page)).home.selectedItem, `vehicle:${locked.selection.vehicle}`);
  const beforePoorPurchase = (await state(page)).career;
  await tapButton(page, /购买/, { disabled: true });
  assert.deepEqual((await state(page)).career, beforePoorPurchase, 'insufficient funds cannot purchase or equip');
  assert.equal(findButton(await state(page), /购买/).enabled, false);
  await tapButton(page, /主页/); await tapButton(page, /选择比赛/); await waitForReady(page);

  await tapButton(page, /展开高级|小伙伴|比赛设置/); await assertTargets(page);
  await shot(page, 'companions');
  const beforeSettings = await state(page);
  await tapButton(page, /^设置$/);
  assert.equal((await state(page)).hud.settingsVisible, true);
  assert.equal((await state(page)).home.visible, true, 'settings retain the underlying menu');
  assert.equal((await state(page)).home.inputEnabled, false);
  const covered = findButton(beforeSettings, /^上一主题$/);
  if (covered) await tapDesign(page, covered.designX, covered.designY);
  else await tapDesign(page, 70, 112);
  assert.deepEqual((await state(page)).selection, beforeSettings.selection, 'settings block touches to underlying selectors');
  assert.equal((await state(page)).hud.settingsVisible, true);
  await tapDesign(page, settingsLayout.sound.x + 480, 270 - settingsLayout.sound.y);
  await page.waitForTimeout(100);
  await shot(page, 'settings');
  assert.equal((await state(page)).muted, !beforeSettings.muted);
  await tapDesign(page, settingsLayout.close.x + 480, 270 - settingsLayout.close.y);
  await page.waitForTimeout(100);
  assert.equal((await state(page)).hud.settingsVisible, false);
  assert.equal((await state(page)).home.advanced, true);
  await tapButton(page, /主页/); await tapButton(page, /生涯/); await assertTargets(page);
  await shot(page, 'career-fresh');
  await tapButton(page, /去挑战/);
  assert.equal((await state(page)).home.page, 'setup', 'career targets lead to usable race preparation');
  assert.equal((await state(page)).staged, false, 'career never starts the race automatically');
  evidence.cases.push({ name: 'fresh-save touch navigation, locks, cancel and modal blocking', locked,
    afterCareerChallenge: await state(page) });
  await context.close();

  // Wallet seeding is confined to deterministic economy checks. It is not race evidence.
  const shop = await open({ wallet: 5000 });
  await tapButton(shop.page, /商店/); await tapButton(shop.page, /^装饰$/);
  const original = (await state(shop.page)).career.equipped.decoration;
  await tapButton(shop.page, /下一个商品/); await waitForReady(shop.page);
  let candidate = await state(shop.page);
  const item = shopItems.find(entry => entry.id === candidate.home.selectedItem);
  assert.ok(item && item.assetId !== original);
  assert.ok(!candidate.home.buttons.some(button => /试穿|试试看/.test(button.label)), 'automatic preview has no redundant try button');
  assert.equal(candidate.career.equipped.decoration, original, 'browsing cannot equip a candidate');
  assert.equal(await renderedDecoration(shop.page, item.assetId), true, 'selected decoration appears in the real 3D preview');
  await tapButton(shop.page, /查看已装备/); await waitForReady(shop.page);
  assert.equal((await state(shop.page)).home.previewMode, 'equipped');
  assert.equal(await renderedDecoration(shop.page, item.assetId), false, 'comparison shows the actual equipment');
  await tapButton(shop.page, /查看此商品/); await waitForReady(shop.page);
  assert.equal(await renderedDecoration(shop.page, item.assetId), true);
  await assertTargets(shop.page); await shot(shop.page, 'shop-preview');
  const coins = candidate.career.coins;
  await tapButton(shop.page, /购买/); await waitForReady(shop.page);
  candidate = await state(shop.page);
  assert.ok(candidate.career.owned.includes(item.id));
  assert.equal(candidate.career.coins, coins - item.price);
  assert.equal(candidate.career.equipped.decoration, original, 'purchase requires a separate equipment confirmation');
  await shot(shop.page, 'shop-purchased');
  await tapButton(shop.page, /装备/, { predicate: button => button.enabled }); await waitForReady(shop.page);
  const equipped = await state(shop.page);
  assert.equal(equipped.career.equipped.decoration, item.assetId);
  await tapButton(shop.page, /主页/); await waitForReady(shop.page);
  await shop.page.reload(); await waitForReady(shop.page);
  assert.deepEqual((await state(shop.page)).career, equipped.career);
  await tapButton(shop.page, /商店/); await tapButton(shop.page, /^装饰$/);
  await shop.page.setViewportSize({ width: 390, height: 844 });
  await shop.page.waitForTimeout(250); await assertTargets(shop.page);
  const geometry = await displayGeometry(shop.page);
  assert.ok(geometry.scrollWidth <= 391, 'rotated mobile page cannot overflow horizontally');
  await tapButton(shop.page, /下一个商品/); await waitForReady(shop.page);
  assert.notEqual((await state(shop.page)).home.selectedItem, item.id, 'rotated touch selects the next candidate');
  await shot(shop.page, 'shop-portrait');
  evidence.cases.push({ name: 'economy-only seeded wallet', seededCoins: 5000, equipped, geometry });
  await shop.context.close();

  // An isolated existing-save fixture covers claiming/persistence; no lap is fabricated.
  const fixture = { races: 5, wins: 1, podiums: 2, xp: 140, coins: 0, routes: ['seaside'] };
  const rewards = await open({ savedCareer: fixture });
  await tapButton(rewards.page, /生涯/);
  const eligible = milestones.filter(item => (item.stat === 'routes' ? fixture.routes.length : fixture[item.stat]) >= item.target);
  await shot(rewards.page, 'career-rewards-ready');
  await tapButton(rewards.page, /一键领取/);
  const claimed = await state(rewards.page);
  assert.deepEqual([...claimed.career.claimed].sort(), eligible.map(item => item.id).sort());
  assert.equal(claimed.career.coins, eligible.reduce((total, item) => total + item.coins, 0));
  assert.equal(claimed.career.xp, fixture.xp + eligible.reduce((total, item) => total + item.xp, 0));
  const repeat = findButton(claimed, /一键领取/);
  if (repeat) await tapDesign(rewards.page, repeat.designX, repeat.designY);
  assert.deepEqual((await state(rewards.page)).career, claimed.career, 'repeat taps cannot claim twice');
  await shot(rewards.page, 'career-claimed');
  await rewards.page.reload(); await waitForReady(rewards.page);
  assert.deepEqual((await state(rewards.page)).career, claimed.career, 'claim-all persists as one consistent save');
  evidence.cases.push({ name: 'isolated existing-career save fixture; rewards and reload only', fixture, claimed });
  await rewards.context.close();
  assert.deepEqual(evidence.errors, []);
  console.log(`PASS (${build.kind}): touch locks, prices, modal blocking, automatic preview, explicit equipment, career and claim persistence`);
} finally {
  await writeFile(new URL('menu-refinement.json', reportsURL), JSON.stringify(evidence, null, 2));
  await browser.close();
}
