import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { levels } from '../src/levels.js';
import { solutions } from '../src/solutions.js';
import { optimalSolutions, optimalRelaySolutions } from '../src/optimal-solutions.js';
import { initialState, step } from '../src/engine.js';
import { relayLevelIds, movedOfficer } from '../src/relay.js';
import { quickTrials, quickSolutions } from '../src/quick-trials.js';

const base = process.env.BASE_URL || 'http://127.0.0.1:43420';
const browser = await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium'});
const report = {passed:false,levels:[],errors:[]};
try {
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page = await context.newPage();
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem('cops-robbers-v3')) localStorage.setItem('cops-robbers-v3',JSON.stringify({version:3,settings:{teaching:false,sound:false,reduced:true}}));
  });
  const savedState = () => page.evaluate(()=>JSON.parse(localStorage.getItem('cops-robbers-v3')).current.state);
  async function load(id,rule='standard',mode='challenge') {
    await page.goto(`${base}/?mode=${mode}&level=${id}&rule=${rule}&motion=reduce`);
    await page.getByTestId('board').waitFor({state:'visible'});
  }
  async function followHint(level,state,remaining) {
    await page.getByTestId('hint').tap();
    await page.waitForFunction(()=>!document.querySelector('[data-testid="hint"]').disabled,null,{timeout:15000});
    assert.match(await page.locator('#instruction').textContent(),new RegExp(`最短还需 ${remaining} 步：`));
    assert.deepEqual(await savedState(),state,'requesting a hint consumes no move');
    const target = await page.evaluate(() => {
      const circle = document.querySelector('.hint-circle');
      const point = new DOMPoint(Number(circle.getAttribute('cx')),Number(circle.getAttribute('cy'))).matrixTransform(circle.getScreenCTM());
      return {node:Number(circle.dataset.hintNode),x:point.x,y:point.y,actor:Number(document.querySelector('#squad .selected').dataset.cop)};
    });
    const node = target.node, plan = [...state.cops];
    assert.ok(node>=0); plan[target.actor]=node;
    const expected = step(level,state,plan).state;
    if (state.relayLast !== undefined) expected.relayLast = movedOfficer(state,plan)<0 ? state.relayLast : movedOfficer(state,plan);
    // Tap the actual highlighted center, without locator click corrections.
    await page.touchscreen.tap(target.x,target.y);
    await page.waitForFunction(turn=>Number(document.body.dataset.turn)===turn && ['planning','won'].includes(document.body.dataset.phase),expected.turn);
    assert.deepEqual(await savedState(),expected,'the highlighted node executes exactly the proposed move');
    return expected;
  }
  const ids = process.env.LEVEL_IDS ? process.env.LEVEL_IDS.split(',').map(Number) : levels.map(level=>level.id);
  for (const id of ids) {
    const level = levels[id-1]; await load(id);
    let state = initialState(level), length = optimalSolutions[id].length;
    assert.match(await page.locator('#reference-turns').textContent(),new RegExp(`三星 ≤ ${length} 步`));
    for (let remaining=length;remaining>0;remaining--) state = await followHint(level,state,remaining);
    assert.equal(await page.locator('body').getAttribute('data-phase'),'won');
    assert.equal(state.turn,length);
    assert.equal(await page.evaluate(id=>JSON.parse(localStorage.getItem('cops-robbers-v3')).completed[id].stars,id),3);
    report.levels.push({id,turns:state.turn}); console.log(`Hint touch win ${id}/100: ${state.turn} turns`);
  }
  await page.setViewportSize({width:320,height:740}); await load(100);
  let state = initialState(levels[99]);
  for (let remaining=17;remaining>0;remaining--) state = await followHint(levels[99],state,remaining);
  assert.equal(state.turn,17,'level 100 also works on a narrow phone');
  await load(100);
  const first = solutions[100][0], actor = movedOfficer(initialState(levels[99]),first);
  await page.locator(`#squad [data-cop="${actor}"]`).tap(); await page.getByTestId(`node-${first[actor]}`).tap();
  await page.waitForFunction(()=>document.body.dataset.turn==='1' && document.body.dataset.phase==='planning');
  state = await savedState();
  await page.getByTestId('hint').tap(); await page.waitForFunction(()=>!document.querySelector('[data-testid="hint"]').disabled,null,{timeout:15000});
  const remaining = Number((await page.locator('#instruction').textContent()).match(/最短还需 (\d+) 步/)?.[1]);
  assert.ok(remaining>0 && remaining<27,'a deviation is solved rather than returning the old suffix');
  for (let turns=remaining;turns>0;turns--) state = await followHint(levels[99],state,turns);
  assert.equal(await page.locator('body').getAttribute('data-phase'),'won');
  await load(100);
  await page.getByTestId(`node-${levels[99].cops[0]}`).tap();
  await page.waitForFunction(()=>document.body.dataset.turn==='1' && document.body.dataset.phase==='planning');
  state = await savedState();
  for (let turns=18;turns>0;turns--) state = await followHint(levels[99],state,turns);
  assert.equal(await page.locator('body').getAttribute('data-phase'),'won','initial wait remains recoverable');
  for (const id of relayLevelIds) {
    await load(id,'relay'); let state = await savedState();
    for (let remaining=optimalRelaySolutions[id].length;remaining>0;remaining--) state = await followHint(levels[id-1],state,remaining);
    assert.equal(await page.locator('body').getAttribute('data-phase'),'won');
  }
  for (const level of quickTrials) {
    await load(level.id,'standard','quick'); let state = initialState(level);
    for (let remaining=quickSolutions[level.id].length;remaining>0;remaining--) state = await followHint(level,state,remaining);
    assert.equal(await page.locator('body').getAttribute('data-phase'),'won');
  }
  await page.evaluate(()=>{
    const saved = JSON.parse(localStorage.getItem('cops-robbers-v3')); saved.settings.teaching=true;
    localStorage.setItem('cops-robbers-v3',JSON.stringify(saved));
  });
  await load(1); state=initialState(levels[0]);
  for (let turns=7;turns>=4;turns--) {
    if (turns===4) {
      await page.getByTestId('hint').tap(); await page.waitForFunction(()=>!document.querySelector('[data-testid="hint"]').disabled);
      assert.equal(await page.locator('.lesson-ring, .lesson-tip').count(),0,'tutorial markers cannot contradict an optimal hint');
    } else state=await followHint(levels[0],state,turns);
  }
  // Exercise failure messages at the worker boundary, including removing an old
  // highlighted suggestion before an incomplete or failed search finishes.
  for (const [status,message] of [['incomplete',/尚未确认最短路线/],['unsolvable',/当前局面已无法全部围捕/],['error',/提示暂时不可用/]]) {
    await page.unroute('**/src/hint-worker.js'); await load(100);
    await page.getByTestId('hint').tap(); await page.waitForFunction(()=>!document.querySelector('[data-testid="hint"]').disabled);
    assert.equal(await page.locator('.hint-circle').count(),1);
    await page.route('**/src/hint-worker.js',route=>route.fulfill({contentType:'text/javascript',body:`self.onmessage=({data})=>self.postMessage({id:data.id,status:${JSON.stringify(status)},plan:null,remaining:null});`}));
    await page.getByTestId('hint').tap(); await page.waitForFunction(()=>!document.querySelector('[data-testid="hint"]').disabled);
    assert.match(await page.locator('#instruction').textContent(),message);
    assert.equal(await page.locator('.hint-circle').count(),0,'an unconfirmed hint never leaves an old suggestion highlighted');
  }
  await page.unroute('**/src/hint-worker.js'); await load(100);
  await page.route('**/src/hint-worker.js',route=>route.fulfill({contentType:'text/javascript',body:'self.onmessage=()=>{};'}));
  await page.getByTestId('hint').tap();
  await page.waitForFunction(()=>!document.querySelector('[data-testid="hint"]').disabled,null,{timeout:15000});
  assert.match(await page.locator('#instruction').textContent(),/尚未确认最短路线/,'a UI timeout does not claim no solution');
  assert.equal(await page.locator('.hint-circle').count(),0);
  assert.deepEqual(report.errors,[]); report.passed=true;
  console.log(`PASS ${ids.length} hint-only phone wins, level 100 at 320px and after deviation, 6 relay and 3 quick wins, truthful failure messages`);
} catch(error) { report.failure=error.stack; throw error; }
finally {
  mkdirSync(new URL('../outputs/',import.meta.url),{recursive:true});
  writeFileSync(new URL(`../outputs/${process.env.LEVEL_IDS?'hint-smoke':'hint-browser-audit'}.json`,import.meta.url),JSON.stringify(report,null,2));
  await browser.close();
}
