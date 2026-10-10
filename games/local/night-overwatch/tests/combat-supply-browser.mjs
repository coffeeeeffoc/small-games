import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { acceptanceBuild, snapshot, assertLayout } from './flight-browser.mjs';
import { MAP, WEAPONS } from '../assets/scripts/core/Data.ts';

const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const dir = new URL('../reports/combat-supply/', import.meta.url);
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const report = { build, results: [], errors: [], warnings: [], physicalDevice: false, realAdSdk: false,
  lifecycleBoundarySimulated: true, realTabLifecycle: false };
let active;
// Exclude wall-clock HUD animation, but include every exposed simulation counter and moving object.
const combat = s => Object.fromEntries(['time', 'remaining', 'phase', 'mission', 'convoy', 'progress', 'aim',
  'aircraft', 'guns', 'shots', 'shotPositions', 'units', 'threatsRemaining', 'fired', 'hits', 'kills',
  'friendlyKills', 'friendlyDamage', 'rescueDamage', 'damageByThreat', 'groundAttacks', 'impacts',
  'completed', 'buff', 'homingAmmo'].map(key => [key, s[key]]));

async function open(width, height, provider, touch = true) {
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch,
    ...(touch ? { userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36' } : {}) });
  active = page;
  let cancellingTouch = false;
  page.on('pageerror', e => report.errors.push({ width, provider, message: e.message }));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const entry = { width, provider, message: m.text(), origin: m.location() };
    if (cancellingTouch && entry.message === 'Ignored attempt to cancel a touchcancel event with cancelable=false, for example because scrolling is in progress and cannot be interrupted.'
        && /\/cocos-js\/cc\.[\w-]+\.js$/.test(entry.origin.url)) {
      report.warnings.push({ ...entry, scope: 'explicit CDP touchCancel; input release asserted',
        engineSource: 'Creator 3.8.8 pal/input/web/touch-input.ts:85-86 calls preventDefault without checking cancelable' });
    } else report.errors.push(entry);
  });
  if (provider) await page.addInitScript(mode => {
    const offers = [];
    Object.defineProperty(globalThis, '__supplyOffers', { get: () => structuredClone(offers) });
    // Only the public host-ad boundary is mocked, before the game starts.
    globalThis.SmallGamesRewardAds = { async offer(opportunity) {
      offers.push(structuredClone(opportunity));
      await new Promise(resolve => setTimeout(resolve, 650));
      if (mode === 'throw') throw Error('injected provider failure');
      if (mode === 'malformed') return { status: 'unknown' };
      if (mode === 'duplicate') return { then(resolve) { resolve({ status: 'completed' }); resolve({ status: 'completed' }); } };
      return { status: mode };
    } };
  }, provider);
  await page.goto(base);
  await ready(page);
  // Same canvas/rotated-container mapping as mobile-20261009-browser.mjs.
  const point = (x, y) => page.evaluate(({ x, y }) => {
    const r = document.querySelector('canvas').getBoundingClientRect(), s = __night.snapshot();
    const rotated = new DOMMatrix(getComputedStyle(document.getElementById('GameDiv')).transform).b > .5;
    return rotated ? { x: r.left + r.width - y * r.width / s.ui.height, y: r.top + x * r.height / s.ui.width }
      : { x: r.left + x * r.width / s.ui.width, y: r.top + y * r.height / s.ui.height };
  }, { x, y });
  const tap = async (x, y) => {
    const p = await point(x, y);
    if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(80);
  };
  const press = async id => {
    const s = await snapshot(page), b = s.buttons.find(b => b.id === id);
    assert(b, `visible ${id}: ${s.buttons.map(b => b.id)}`);
    await tap(b.x + b.w / 2, b.y + b.h / 2);
  };
  const capture = async name => {
    const s = await snapshot(page);
    assertLayout(s, s.ui.width, s.ui.height);
    await page.screenshot({ path: fileURLToPath(new URL(`${width}-${provider || 'mock'}-${name}.png`, dir)) });
  };
  const cancelTouch = async cdp => {
    cancellingTouch = true;
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      const released = await snapshot(page);
      assert.deepEqual(released.held, []);
      await page.waitForTimeout(250);
      assert.equal((await snapshot(page)).fired, released.fired, 'cancelled fire cannot remain held');
    } finally { cancellingTouch = false; }
  };
  return { page, point, tap, press, capture, cancelTouch };
}
async function ready(page) {
  await page.waitForFunction(() => globalThis.__night && !document.getElementById('night-startup'));
}
async function frozen(page, label, duration = 220) {
  const before = await snapshot(page);
  assert(before.pauses.length, `${label}: simulation paused`);
  assert.deepEqual(before.held, [], `${label}: input released`);
  await page.waitForTimeout(duration);
  assert.deepEqual(combat(await snapshot(page)), combat(before), `${label}: full simulation freeze`);
  return before;
}
async function countdown(page, capture) {
  const start = await snapshot(page), digits = new Set();
  assert(start.resumeCountdown > 2 && start.resumeCountdown <= 3, 'countdown restarts at three');
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const s = await snapshot(page);
    if (!s.resumeCountdown) break;
    digits.add(Math.ceil(s.resumeCountdown));
    assert.deepEqual(combat(s), combat(start), 'countdown freezes all combat including buff duration');
    assert.deepEqual(s.held, []);
    if (capture && digits.size === 1) { await capture('countdown'); capture = undefined; }
    await page.waitForTimeout(120);
  }
  assert.deepEqual([...digits], [3, 2, 1]);
  const end = await snapshot(page);
  assert.equal(end.resumeCountdown, 0); assert.deepEqual(end.pauses, []);
  assert.equal(end.phase, 'playing');
}
async function earn({ page, press }) {
  const before = await snapshot(page);
  await press('supply'); await press('supplyWatch');
  assert.equal((await snapshot(page)).advert?.mock, true);
  await press('adClose');
  const pending = await snapshot(page);
  assert.equal(pending.pendingSupply, true);
  assert.equal(pending.homingAmmo, before.homingAmmo, 'ad completion grants entitlement, not ammo');
  assert.equal(pending.buff, null);
  assert.deepEqual(pending.buttons.filter(b => b.id.startsWith('reward:')).map(b => b.id).sort(),
    ['reward:ammo', 'reward:rate', 'reward:tracking']);
  assert(!pending.buttons.some(b => b.id === 'supplyWatch'), 'pending choice cannot request another ad');
}
async function aim({ page, tap }, target) {
  const map = (await snapshot(page)).ui.minimap;
  await tap(map.x + 8 + (target.x + MAP.halfWidth) / (2 * MAP.halfWidth) * (map.w - 16),
    map.y + 25 + (target.z + MAP.halfDepth) / (2 * MAP.halfDepth) * (map.h - 33));
  const q = await page.evaluate(id => __night.screenPoint(__night.snapshot().units.find(u => u.id === id)), target.id);
  await tap(q.x, q.y);
}

try {
  for (const [width, height] of [[844, 390], [568, 320], [390, 844]]) {
    const ui = await open(width, height), { page, press, tap, capture } = ui;
    await press('missions'); await press('training'); await press('start');
    await press('weapon2'); await press('fire'); await press('supply');
    const held = await frozen(page, 'supply page');
    assert(held.shots.length && held.guns[2].cooldown > 0, 'freeze includes an airborne shell and active reload');
    await capture('supply'); await press('supplyWatch');
    assert.deepEqual(combat(await frozen(page, 'mock advert')), combat(held));
    await capture('advert'); await press('adCancel');
    assert.equal((await snapshot(page)).modal, 'pause');
    assert.equal((await snapshot(page)).pendingSupply, false);
    assert.deepEqual(combat(await frozen(page, 'cancelled advert')), combat(held));
    await earn(ui);
    assert.deepEqual(combat(await frozen(page, 'pending choice')), combat(held));
    await capture('choice'); await press('supplyLater');
    assert.equal((await snapshot(page)).modal, 'pause');
    assert.equal((await snapshot(page)).pendingSupply, true);
    await press('resume');
    await page.waitForFunction(time => __night.snapshot().time > time, held.time);
    assert.equal((await snapshot(page)).pendingSupply, true, 'battle may resume before choosing');
    await press('supply');
    assert(!(await snapshot(page)).advert && !(await snapshot(page)).buttons.some(b => b.id === 'supplyWatch'));
    await press('supplyLater'); await press('home');
    assert.equal((await snapshot(page)).pendingSupply, true);
    await page.reload(); await ready(page);
    assert.equal((await snapshot(page)).pendingSupply, true, 'refresh preserves unclaimed entitlement');
    assert.equal((await snapshot(page)).homingAmmo, 0);
    await press('start'); await press('supply');
    const reward = (await snapshot(page)).buttons.find(b => b.id === 'reward:ammo');
    await press('reward:ammo'); await tap(reward.x + reward.w / 2, reward.y + reward.h / 2);
    let s = await snapshot(page);
    assert.equal(s.homingAmmo, 2); assert.equal(s.pendingSupply, false); assert.equal(s.buff, null);
    assert.equal(s.homingSelected, true); assert.equal(s.fired, 0, 'claiming never auto-fires');
    await countdown(page, capture);
    await press('pause'); await press('home'); await page.reload(); await ready(page);
    assert.equal((await snapshot(page)).pendingSupply, false, 'consumed entitlement stays consumed');
    assert.equal((await snapshot(page)).homingAmmo, 2);

    // Escort has enough battle time for a real sixty-second expiry, without changing the simulation clock.
    await press('missions'); await press('mission:ambush-02'); await press('start');
    const kind = width === 568 ? 'rate' : 'tracking';
    await earn(ui); await press(`reward:${kind}`);
    s = await snapshot(page);
    assert.deepEqual(s.buff, { kind, remaining: 60 }); assert.equal(s.homingAmmo, 2);
    assert.equal(s.pendingSupply, false);
    if (width === 390) {
      const frozenBattle = combat(s);
      // Playwright forces tab focus; exercise the real visibility handler through the approved boundary fixture.
      const hidden = await page.evaluate(async () => {
        const descriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
        try {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          document.dispatchEvent(new Event('visibilitychange'));
          const before = __night.snapshot();
          await new Promise(resolve => setTimeout(resolve, 500));
          return { before, after: __night.snapshot() };
        } finally {
          if (descriptor) Object.defineProperty(document, 'hidden', descriptor);
          else delete document.hidden;
          document.dispatchEvent(new Event('visibilitychange'));
        }
      });
      assert(hidden.before.pauses.includes('background')); assert.equal(hidden.before.resumeCountdown, 0);
      assert.deepEqual(combat(hidden.before), frozenBattle); assert.deepEqual(combat(hidden.after), frozenBattle);
      await page.waitForFunction(() => !document.hidden && __night.snapshot().modal === 'pause');
      s = await frozen(page, 'background interrupted countdown');
      assert.equal(s.resumeCountdown, 0); assert.deepEqual(combat(s), frozenBattle);
      await capture('background-pause'); await press('resume');
    }
    await countdown(page, capture);
    const buffStarted = (await snapshot(page)).time;
    await press('zoomControls');
    if ((await snapshot(page)).buttons.some(b => b.id === 'zoomUpgrade')) await press('zoomUpgrade');
    s = await snapshot(page); assert(!s.advert); assert.equal(s.zoomLimit, 5);
    await press('zoomControls'); await press('supply');
    if ((await snapshot(page)).buttons.some(b => b.id === 'supplyWatch')) await press('supplyWatch');
    s = await frozen(page, 'buff blocks supply and freezes buff time');
    assert(!s.advert); assert.equal(s.pendingSupply, false); assert.equal(s.buff.kind, kind);
    await capture(`${kind}-blocked`); await press('supplyLater'); await press('resume');
    await press('weapon0');
    const target = (await snapshot(page)).units.find(u => !u.friendly && u.hp > 0);
    await aim(ui, target);
    const before = await snapshot(page), fire = before.buttons.find(b => b.id === 'fire');
    const p = await ui.point(fire.x + fire.w / 2, fire.y + fire.h / 2);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }] });
    await page.waitForTimeout(kind === 'rate' ? 700 : 320);
    await ui.cancelTouch(cdp);
    s = await snapshot(page);
    const shots = s.shots.filter(shot => !before.shots.some(old => old.id === shot.id));
    assert(shots.length >= 2); assert.equal(s.homingAmmo, 2); assert.deepEqual(s.held, []);
    if (kind === 'tracking') assert(shots.some(shot => shot.guidance?.target === target.id), 'ordinary rounds really track');
    else for (let i = 1; i < shots.length; i++) {
      assert(Math.abs(shots[i].born - shots[i - 1].born - WEAPONS[0].interval / 1.3) <= 1 / 60 + 1e-6,
        'ordinary fire interval is divided by 1.3');
    }
    await capture(`${kind}-active`); await cdp.detach();
    let expiry;
    if (width === 844) {
      const deadline = Date.now() + 120000;
      let lastFiveCaptured = false;
      while ((await snapshot(page)).buff && Date.now() < deadline) {
        s = await snapshot(page);
        assert.equal(s.phase, 'playing', 'escort survives until real buff expiry');
        if (s.buff?.remaining <= 5 && !lastFiveCaptured) {
          await capture('last-five-seconds'); lastFiveCaptured = true;
        }
        await page.waitForTimeout(500);
      }
      s = await snapshot(page);
      assert.equal(s.buff, null); assert.equal(s.phase, 'playing');
      assert(s.time - buffStarted >= 59 && s.time - buffStarted <= 61, 'expiry follows sixty seconds of battle time');
      expiry = { time: s.time, elapsed: s.time - buffStarted };
      await capture('expired'); await press('supply'); await press('supplyWatch');
      assert.equal((await snapshot(page)).advert?.mock, true, 'advertising reopens after expiry');
      await press('adCancel');
    } else await press('pause');
    await press('home'); await press('start');
    assert.equal((await snapshot(page)).buff, null, 'timed buff does not survive a new mission');
    assert.equal((await snapshot(page)).homingAmmo, 2);
    report.results.push({ width, height, touch: true, fullFreeze: true, pendingRefresh: true, oneOfThree: true,
      inventory: 2, buff: kind, expiry, backgroundCountdown: width === 390,
      lifecycleBoundarySimulated: width === 390, realTabLifecycle: false });
    await page.close();
  }

  for (const outcome of ['dismissed', 'unavailable', 'failed', 'throw', 'malformed', 'duplicate']) {
    const ui = await open(844, 390, outcome, false), { page, press, capture } = ui;
    await press('start'); await press('supply'); await press('supplyWatch');
    assert.equal((await snapshot(page)).advert?.mock, false);
    await frozen(page, `provider ${outcome}`);
    await page.waitForFunction(() => !__night.snapshot().advert);
    let s = await snapshot(page);
    assert.equal(s.homingAmmo, 0); assert.equal(s.buff, null);
    assert.deepEqual(await page.evaluate(() => __supplyOffers), [{ id: 'night-overwatch:supply', reward: { supplyChoice: 1 } }]);
    if (outcome === 'duplicate') {
      assert.equal(s.pendingSupply, true);
      await press('reward:ammo'); assert.equal((await snapshot(page)).homingAmmo, 2);
      await countdown(page);
      assert.equal((await snapshot(page)).homingAmmo, 2, 'duplicate completion cannot grant twice');
      await press('zoomControls'); await press('zoomUpgrade');
      await page.waitForFunction(() => !__night.snapshot().advert);
      assert.equal((await snapshot(page)).zoomLimit, 10);
      await countdown(page);
    } else {
      assert.equal(s.pendingSupply, false); assert.equal(s.modal, 'pause');
      await frozen(page, `${outcome} recovery`); await capture('failure'); await press('resume');
      await press('zoomControls'); await press('zoomUpgrade');
      await page.waitForFunction(() => !__night.snapshot().advert);
      s = await snapshot(page);
      assert.equal(s.zoomLimit, 5); assert.equal(s.pendingSupply, false); assert.equal(s.modal, 'pause');
      assert.deepEqual(await page.evaluate(() => __supplyOffers.at(-1)), { id: 'night-overwatch:zoom', reward: { zoomLimit: 10 } });
      await press('resume');
      await page.waitForFunction(time => __night.snapshot().time > time, s.time);
    }
    assert.deepEqual(await page.evaluate(() => __supplyOffers), [
      { id: 'night-overwatch:supply', reward: { supplyChoice: 1 } },
      { id: 'night-overwatch:zoom', reward: { zoomLimit: 10 } },
    ]);
    report.results.push({ provider: outcome, contract: true, recovery: true });
    await page.close();
  }
  assert.deepEqual(report.errors, []);
  await acceptanceBuild(base);
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  if (active && !active.isClosed()) {
    report.failureSnapshot = await snapshot(active).catch(() => undefined);
    await active.screenshot({ path: fileURLToPath(new URL('failure.png', dir)) }).catch(() => {});
  }
  throw error;
} finally {
  await writeFile(new URL('verification.json', dir), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ passed: report.passed, results: report.results, errors: report.errors, warnings: report.warnings }));
