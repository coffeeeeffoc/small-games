import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { levels } from '../src/levels.js';
import { solutions } from '../src/solutions.js';
import { legalTargets } from '../src/engine.js';
import { movedOfficer, relayLevelIds } from '../src/relay.js';

const base = process.env.BASE_URL || 'http://127.0.0.1:43441';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium' });
try {
  const context = await browser.newContext({ viewport:{width:390,height:844}, hasTouch:true });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    navigator.share = async () => { throw new DOMException('Canceled','AbortError'); };
    if (!localStorage.getItem('cops-robbers-v3')) localStorage.setItem('cops-robbers-v3',JSON.stringify({version:3,completed:{1:{turns:7,stars:3}},settings:{sound:false,teaching:false}}));
  });
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('cops-robbers-v3')));
  await page.goto(`${base}/?mode=challenge&level=1&rule=relay&motion=reduce&token=secret#auth`);
  let before = (await saved()).current.state, plan = solutions[1][0], actor = movedOfficer(before,plan);
  await page.getByTestId(`cop-${actor}`).tap(); await page.getByTestId(`node-${plan[actor]}`).tap();
  await page.waitForFunction(() => document.body.dataset.turn === '1' && document.body.dataset.phase === 'planning');
  const after = (await saved()).current.state;
  const alternative = legalTargets(levels[0],after,actor).find(node => node !== after.cops[actor]);
  await page.getByTestId(`node-${alternative}`).tap();
  assert.equal((await saved()).current.state.turn,1);
  assert.match(await page.locator('#instruction').textContent(), /接力要换人/);
  await page.getByTestId('undo').tap(); assert.equal((await saved()).current.state.turn,0);
  for (const id of relayLevelIds) {
    await page.goto(`${base}/?mode=challenge&level=${id}&rule=relay&motion=reduce`);
    for (const plan of solutions[id]) {
      const state = (await saved()).current.state, actor = Math.max(0,movedOfficer(state,plan));
      await page.getByTestId(`cop-${actor}`).tap(); await page.getByTestId(`node-${plan[actor]}`).tap();
      await page.waitForFunction(turn => document.body.dataset.turn === String(turn) && ['planning','won'].includes(document.body.dataset.phase), state.turn+1);
    }
    assert.equal(await page.locator('body').getAttribute('data-phase'),'won');
    assert.ok((await saved()).relayCompleted[id]);
    assert.deepEqual((await saved()).completed[id],id === 1 ? {turns:7,stars:3} : undefined,'relay preserves legacy standard stars');
    await page.locator('#win-dialog .dialog-close').click();
    await page.locator('#focus-toggle').tap();
    await page.locator('#share-challenge').click();
    const url = await page.locator('#share-url').inputValue();
    assert.ok(url.includes(`level=${id}`) && url.includes('rule=relay'));
    assert.ok(!/token|auth|motion/.test(url));
    await page.locator('#native-share').click();
    assert.match(await page.locator('#share-note').textContent(),/已取消分享/);
    assert.doesNotMatch(await page.locator('#share-note').textContent(),/已复制/);
  }
  for (const viewport of [{width:320,height:568},{width:844,height:390},{width:667,height:375}]) {
    await page.setViewportSize(viewport); await page.goto(`${base}/?level=1&rule=relay&motion=reduce`);
    const bounds = await page.evaluate(() => ['#board','.action-bar','#play-prompt'].map(selector => {
      const r = document.querySelector(selector).getBoundingClientRect(); return {selector,x:r.x,y:r.y,right:r.right,bottom:r.bottom};
    }));
    for (const rect of bounds) assert.ok(rect.x >= 0 && rect.y >= 0 && rect.right <= viewport.width && rect.bottom <= viewport.height, `${JSON.stringify(viewport)}: ${JSON.stringify(rect)}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth>innerWidth),false);
  }
  for (const plan of solutions[1].slice(0,2)) {
    const state = (await saved()).current.state, actor = movedOfficer(state,plan);
    await page.getByTestId(`cop-${actor}`).tap(); await page.getByTestId(`node-${plan[actor]}`).tap();
    await page.waitForFunction(turn => document.body.dataset.turn === String(turn) && document.body.dataset.phase === 'planning',state.turn+1);
  }
  const patrol = (await saved()).current;
  await page.goto(`${base}/?mode=escape&level=100&role=runner&first=pursuer&rule=standard`);
  assert.ok(await page.locator('#duel-game').isVisible());
  assert.deepEqual((await saved()).current,patrol,'a shared duel preserves the unfinished patrol save');
  await page.locator('#focus-toggle').tap();
  await page.locator('#share-challenge').tap();
  assert.match(await page.locator('#share-url').inputValue(), /role=runner&first=pursuer/);
  assert.deepEqual(errors,[]);
  console.log('PASS 6 touch relay wins, separate records, illegal repeated move, undo, clean same-puzzle/native cancel, 3 mobile layouts and shared duel role/opening');
} finally { await browser.close(); }
