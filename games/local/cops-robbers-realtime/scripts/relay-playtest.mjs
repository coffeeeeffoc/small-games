import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { LEVELS } from '../src/levels.js';

const base = process.env.GAME_URL || 'http://127.0.0.1:43690';
const browser = await chromium.launch({ executablePath:process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium' });
try {
  const page = await browser.newPage({ viewport:{width:844,height:390},hasTouch:true }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    navigator.share = async () => { throw new DOMException('Canceled','AbortError'); };
    if (!localStorage.getItem('neighborhood-patrol-v1')) localStorage.setItem('neighborhood-patrol-v1',JSON.stringify({best:{1:25},streetBest:{1:25},sound:false}));
  });
  const snapshot = () => page.evaluate(async () => (await import('./src/main.js')).getSnapshot());
  const cdp = await page.context().newCDPSession(page);
  async function order(actor,point) {
    await page.locator('.cop-card').nth(actor).tap();
    const state = await snapshot(), team = state.role === 'robber' ? state.robbers : state.cops;
    const pos = await page.evaluate(async point => (await import('./src/main.js')).worldToScreen(point),point);
    // A short guard adjustment may lie inside that officer's head hit area: drag explicitly.
    const origin = await page.evaluate(async point => (await import('./src/main.js')).worldToScreen(point),team[actor]);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:origin.x,y:origin.y,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:pos.x,y:pos.y,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  await page.goto(`${base}/?mode=classic&level=100&role=robber&first=cop&rule=relay&token=secret#auth`);
  const opening = await snapshot();
  assert.equal(opening.role,'robber'); assert.equal(opening.firstRole,'cop'); assert.equal(opening.rule,'relay');
  await page.locator('#restart-button').click();
  assert.equal((await snapshot()).firstRole,opening.firstRole,'retry keeps the shared actual opening');
  await page.locator('#share-puzzle').click();
  const url = await page.locator('#share-url').inputValue();
  assert.ok(!/token|secret|auth/.test(url)); assert.match(url,/first=cop/);
  await page.locator('#native-share').click(); assert.match(await page.locator('#share-note').textContent(),/已取消分享/);
  await page.goto(`${base}/?mode=challenge&level=1&role=cop&first=none&rule=relay`);
  await page.locator('#start-button').tap();
  const level = LEVELS[0];
  for (const {cop,node} of level.solution) await order(cop,level.nodes[node]);
  await page.waitForTimeout(700);
  let state = await snapshot();
  const rejected = state.lastOrder, original = state.cops[rejected].destination;
  await order(rejected,state.nodes.find(node => Math.hypot(node.x-state.cops[rejected].x,node.y-state.cops[rejected].y)>10));
  assert.equal((await snapshot()).lastOrder,rejected);
  assert.deepEqual((await snapshot()).cops[rejected].destination,original);
  assert.match(await page.locator('#board-toast').textContent(),/轮换要换人/);
  await page.locator('#share-puzzle').click();
  const paused = await snapshot(); assert.equal(paused.phase,'paused');
  await page.waitForTimeout(200); assert.equal((await snapshot()).time,paused.time);
  await page.locator('#share-dialog [data-close]').click();
  assert.equal((await snapshot()).phase,'playing');
  const guard = level.solution[0], a = level.nodes[guard.node], neighbor = level.edges.find(edge => edge.includes(guard.node)).find(node => node !== guard.node), b = level.nodes[neighbor], length = Math.hypot(a.x-b.x,a.y-b.y);
  const shift = {x:a.x+(b.x-a.x)*40/length,y:a.y+(b.y-a.y)*40/length};
  let alternation = 0;
  const deadline = Date.now()+45000;
  while (Date.now()<deadline && (state=await snapshot()).phase==='playing') {
    if (state.time<3.5) {await page.waitForTimeout(200);continue;}
    if (state.lastOrder===level.hunter) await order(guard.cop,alternation++%2===0?shift:a);
    const robber = state.robbers.find(actor => !actor.caught);
    if (robber) await order(level.hunter,robber);
    await page.waitForTimeout(650);
  }
  assert.equal((await snapshot()).phase,'won','real alternating road orders complete the first street');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('neighborhood-patrol-v1')));
  assert.ok(saved.modeBest['challenge-cop-1:relay']); assert.equal(saved.best[1],25);
  assert.equal(saved.streetBest[1],25,'relay preserves legacy standard challenge progress');
  await page.locator('#win-retry').click();
  assert.equal((await snapshot()).lastOrder,null);
  await page.reload(); assert.equal((await snapshot()).rule,'relay','saved rule preference survives reload');
  assert.deepEqual(errors,[]);
  console.log('PASS shared role/opening and retry, clean/native cancel, illegal repeated order, sharing pauses/resumes, actual touch relay win, separate records and fresh restart');
} finally {await browser.close();}
