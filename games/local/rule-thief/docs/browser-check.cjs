// Temporary acceptance driver: pass an installed Playwright module path; never loaded by the game.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
if (!process.argv[2]) throw new Error('Usage: node docs/browser-check.cjs <absolute Playwright module path>');
const { chromium } = require(process.argv[2]);
const solutions = JSON.parse(fs.readFileSync(path.join(__dirname, 'solutions.json'), 'utf8'));
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [], checks = [];
  const inspect = page => page.evaluate(() => window.__ruleThief.inspect());
  const settled = page => page.waitForFunction(() => window.__ruleThief && !window.__ruleThief.inspect().busy);
  async function play(page, actions, touch = false) {
    const press = selector => touch ? page.locator(selector).tap() : page.locator(selector).click();
    for (const a of actions) {
      if (a.type === 'transfer') { await press(`[data-rule="${a.rule}"]`); await press(`[data-entity="${a.target}"]`); }
      else await press(a.type === 'wait' ? '#wait' : `[data-dir="${a.dir}"]`);
      await settled(page);
    }
  }
  try {
    const desktop = await browser.newContext({ viewport: { width: 1360, height: 980 } });
    const page = await desktop.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('http://127.0.0.1:4408/'); await settled(page);
    const initial = (await inspect(page)).state;
    await page.click('#wait'); await settled(page); assert.equal((await inspect(page)).state.status, 'lost');
    await page.screenshot({ path: path.join(__dirname, 'playtest-failure.png'), fullPage: true });
    await page.click('#undo'); assert.deepEqual((await inspect(page)).state, initial);
    await page.click('#wait'); await settled(page); await page.click('#retry'); assert.deepEqual((await inspect(page)).state, initial);
    checks.push('desktop: wait → collision failure → full undo; failure → retry');
    // Mouse drag is a real pointer path, with a whole-world rollback during its animation.
    const source = await page.locator('[data-rule="stride"]').boundingBox(), target = await page.locator('[data-entity="b"]').boundingBox();
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2); await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 }); await page.mouse.up();
    assert.equal((await inspect(page)).state.owners.stride, 'b');
    await page.screenshot({ path: path.join(__dirname, 'playtest-motion.png'), fullPage: true });
    assert.equal((await inspect(page)).busy, true, 'undo must be exercised during animation');
    await page.click('#undo'); await page.waitForTimeout(450); assert.deepEqual((await inspect(page)).state, initial);
    assert.deepEqual(await page.locator('.actor').evaluateAll(nodes => nodes.map(n => ({ id: n.dataset.entity, x: +n.dataset.x, y: +n.dataset.y }))), initial.entities.map(e => ({ id: e.id, x: e.x, y: e.y })));
    checks.push('desktop: mouse drag transfers once; animation undo cancels stale updates');
    const audioBefore = (await inspect(page)).audio; assert.equal(audioBefore.state, 'running'); assert(audioBefore.toneCount > 0);
    await page.click('#sound'); assert.equal((await inspect(page)).audio.muted, true); assert.equal((await inspect(page)).audio.gain, 0);
    await page.reload(); await settled(page); assert.equal((await inspect(page)).audio.muted, true); await page.click('#sound');
    checks.push('Web Audio starts after gesture; mute gain zero and preference survives reload');
    const victories = [];
    for (let level = 0; level < 3; level++) {
      await page.click(`[data-level="${level}"]`);
      if (level === 1) { const before = (await inspect(page)).state; await page.click('[data-rule="phase"]'); await page.click('[data-entity="p"]'); assert.deepEqual((await inspect(page)).state, before); assert.match(await page.locator('#message').innerText(), /离开墙体/); }
      await play(page, solutions[level]); assert.equal((await inspect(page)).state.status, 'won');
      victories.push({ level: level + 1, moves: (await inspect(page)).state.turn });
      await page.click('#undo'); assert.equal((await inspect(page)).state.status, 'playing');
    }
    checks.push('desktop: all three authored solutions won through buttons; undo after victory');
    await page.click('[data-level="1"]'); await page.click('[data-rule="drift"]'); await page.hover('[data-entity="a"]');
    await page.screenshot({ path: path.join(__dirname, 'playtest-desktop.png'), fullPage: true });
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const phone = await mobile.newPage(); phone.on('pageerror', error => errors.push(error.message));
    await phone.goto('http://127.0.0.1:4408/'); await settled(phone);
    await phone.locator('#wait').tap(); await settled(phone); assert.equal((await inspect(phone)).state.status, 'lost');
    await phone.locator('#retry').tap();
    for (let level = 0; level < 3; level++) { await phone.locator(`[data-level="${level}"]`).tap(); await play(phone, solutions[level], true); assert.equal((await inspect(phone)).state.status, 'won'); assert((await phone.locator('#next').boundingBox()).height >= 44); }
    checks.push('390×844 touch emulation: failure/retry and all three levels won using taps');
    await phone.locator('[data-level="1"]').tap();
    const beforeCancel = (await inspect(phone)).state;
    const cdp = await mobile.newCDPSession(phone);
    let a = await phone.locator('[data-rule="drift"]').boundingBox(), b = await phone.locator('[data-entity="a"]').boundingBox();
    const start = { x: a.x + a.width / 2, y: a.y + a.height / 2 }, end = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
    await phone.screenshot({ path: path.join(__dirname, 'playtest-mobile.png'), fullPage: true });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.deepEqual((await inspect(phone)).state, beforeCancel);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await settled(phone); assert.equal((await inspect(phone)).state.owners.drift, 'a'); assert.equal((await inspect(phone)).state.turn, 1);
    checks.push('native touch events: drag preview, touchCancel keeps exact state; release transfers once');
    const layouts = [];
    for (const width of [390, 360]) {
      await phone.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      const layout = await phone.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth, targets: [...document.querySelectorAll('button:not([hidden])')].map(b => ({ label: b.getAttribute('aria-label') || b.textContent, width: b.getBoundingClientRect().width, height: b.getBoundingClientRect().height })), bottom: document.querySelector('#retry').getBoundingClientRect().bottom }));
      assert(layout.content <= layout.viewport);
      for (const target of layout.targets) { assert(target.width >= 43.9, target.label); assert(target.height >= 43.9, target.label); }
      assert(layout.bottom <= (width === 390 ? 844 : 800), `controls below viewport: ${layout.bottom}`);
      layouts.push({ width, overflow: layout.content - layout.viewport, controlsBottom: layout.bottom });
    }
    await page.goto('http://127.0.0.1:4408/'); await settled(page); await play(page, solutions[0]); assert.equal((await inspect(page)).state.status, 'won');
    checks.push('independent 4408 / entry: level 1 won; relative module/CSS loading works');
    await page.goto('http://127.0.0.1:4408/rule-thief/'); await settled(page); assert.equal((await inspect(page)).state.level, 0);
    assert.deepEqual(errors, []);
    const report = { checkedAt: new Date().toISOString(), browser: await browser.version(), desktop: '1360×980', mobile: '390×844 and 360×800 touch emulation, not physical devices', checks, victories, layouts, errors, audio: audioBefore, boundaries: ['No physical phone or mobile Safari test', 'No external human playtest or retention claims', 'Audio nodes verified, speaker audibility not independently assessed'] };
    fs.writeFileSync(path.join(__dirname, 'playtest-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
