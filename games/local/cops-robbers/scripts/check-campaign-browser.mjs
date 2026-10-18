import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { levels } from '../src/levels.js';
import { relayLevels, movedOfficer } from '../src/relay.js';
import { quickTrials,quickSolutions } from '../src/quick-trials.js';
import { optimalSolutions,optimalRelaySolutions } from '../src/optimal-solutions.js';
import { initialState,step } from '../src/engine.js';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const base=process.env.BASE_URL||'http://127.0.0.1:43420';
const output=process.env.OUTPUT_DIR ? pathToFileURL(path.resolve(process.env.OUTPUT_DIR) + path.sep) : new URL('../../../../outputs/h5-parity/h5/',import.meta.url);
mkdirSync(output,{recursive:true});
const report={passed:false,checks:[],errors:[],environment:'Linux Chromium, phone viewports and touch emulation; no physical-device claim'};
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'/usr/bin/chromium'});
async function move(page,plan,key='cops-robbers-v3',offset=0) {
  const before=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).current.state,key), actor=Math.max(0,movedOfficer(before,plan));
  await page.locator(`#squad [data-cop="${actor}"]`).tap();
  const point=await page.getByTestId(`node-${plan[actor]}`).evaluate(node=>{const p=new DOMPoint(0,0).matrixTransform(node.getScreenCTM());return{x:p.x,y:p.y};});
  await page.touchscreen.tap(point.x+offset,point.y);
  await page.waitForFunction(turn=>Number(document.body.dataset.turn)===turn&&['planning','won','lost'].includes(document.body.dataset.phase),before.turn+1);
}
async function win(page,plans,key) {for(const plan of plans)await move(page,plan,key);assert.equal(await page.locator('body').getAttribute('data-phase'),'won');}
try {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(`${base}/?dev=0&motion=reduce`);
  await page.locator('#home-start').tap();
  assert.equal(await page.locator('body').getAttribute('data-level'),'1','home primary action starts play');
  await page.locator('#focus-toggle').tap();await page.locator('#level-select').tap();
  assert.equal(await page.getByTestId('level-button-2').isDisabled(),true);
  await page.locator('#level-dialog .dialog-close').tap();
  await page.goto(`${base}/?dev=0&level=120&motion=reduce`);
  assert.equal(await page.locator('body').getAttribute('data-level'),'1','ordinary direct links cannot bypass progress');
  await move(page,optimalSolutions[1][0],'cops-robbers-v3',18);
  await win(page,optimalSolutions[1].slice(1));
  await page.locator('#next-level').tap();assert.equal(await page.locator('body').getAttribute('data-level'),'2');
  await move(page,optimalSolutions[2][0]);
  const beforeReload=await page.evaluate(()=>JSON.parse(localStorage.getItem('cops-robbers-v3')).current);
  await page.locator('#focus-toggle').tap();await page.reload();await page.locator('#home-start').tap();
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('cops-robbers-v3')).current),beforeReload,'home primary action resumes saved turn');
  report.checks.push('normal home start/resume, locked selection/direct link, widened touch target, touch win, next unlock and saved reload');

  await page.goto(`${base}/?dev=0&mode=quick&level=1&motion=reduce`);
  for(let id=1;id<=3;id++){await win(page,quickSolutions[id]);await page.locator('#next-level').tap();}
  assert.equal(await page.locator('body').getAttribute('data-level'),'4');assert.equal(await page.locator('body').getAttribute('data-mode'),'quick');
  await win(page,quickSolutions[4]);
  assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('cops-robbers-v3')).quickCompleted[4]));
  report.checks.push('old quick maps 1–3 retain touch wins, map 4 follows naturally and saves separately');
  await page.locator('#win-dialog .dialog-close').tap();await page.locator('#focus-toggle').tap();
  const playerSave=await page.evaluate(()=>localStorage.getItem('cops-robbers-v3'));
  await page.goto(`${base}/?dev=1&mode=quick&level=120&motion=reduce`);
  await win(page,quickSolutions[120],'cops-robbers-practice-v3');
  assert.equal(await page.evaluate(()=>localStorage.getItem('cops-robbers-v3')),playerSave,'developer wins never alter player progress');
  report.checks.push('developer last-map play and score/save isolation');

  // Real unlocked progress, not developer mode, opens all three final maps.
  const saved={version:3,settings:{sound:false,teaching:false,reduced:true},completed:{},relayCompleted:{},quickCompleted:{}};
  for(const [catalog,key] of [[levels,'completed'],[relayLevels,'relayCompleted'],[quickTrials,'quickCompleted']])for(const map of catalog.slice(0,-1))saved[key][map.id]={turns:key==='relayCompleted'?optimalRelaySolutions[map.id].length:map.par,stars:3};
  await page.evaluate(save=>{localStorage.setItem('cops-robbers-v3',JSON.stringify(save));localStorage.setItem('dev','1');},saved);
  for(const [mode,rule,catalog,routes,viewport,name] of [
    ['challenge','standard',levels,optimalSolutions,{width:320,height:568},'standard'],
    ['challenge','relay',relayLevels,optimalRelaySolutions,{width:390,height:844},'relay'],
    ['quick','standard',quickTrials,quickSolutions,{width:667,height:375},'quick'],
  ]) {
    const last=catalog.at(-1);await page.setViewportSize(viewport);await page.goto(`${base}/?dev=0&mode=${mode}&rule=${rule}&level=${last.id}&motion=reduce`);
    assert.equal(await page.locator('body').getAttribute('data-level'),String(last.id));
    assert.equal(await page.evaluate(()=>SmallGamesDev.isEnabled()),false,'explicit dev=0 wins over storage');
    await page.screenshot({path:new URL(`${name}-120-playing.png`,output).pathname});
    const first=routes[last.id][0];await move(page,first);
    const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('cops-robbers-v3')).current.state);
    await page.locator('#focus-toggle').tap();await page.locator('#resume-patrol').tap();
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('cops-robbers-v3')).current.state),after,'return/resume preserves the last-map turn');
    await win(page,routes[last.id].slice(1));
    await page.screenshot({path:new URL(`${name}-120-win.png`,output).pathname});
    report.checks.push(`${name}: map ${last.id} ordinary unlocked touch victory, return/resume and save at ${viewport.width}×${viewport.height}`);
  }

  // The old web catalog was open: do not discard a legitimate unfinished save.
  const legacy=initialState(levels[99]), legacyContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}), legacyPage=await legacyContext.newPage();
  await legacyPage.addInitScript(state=>localStorage.setItem('cops-robbers-v3',JSON.stringify({version:3,current:{levelId:100,mode:'challenge',rule:'standard',state},settings:{sound:false,reduced:true}})),legacy);
  await legacyPage.goto(`${base}/?dev=0&motion=reduce`);await legacyPage.locator('#home-start').tap();
  assert.equal(await legacyPage.locator('body').getAttribute('data-level'),'100');assert.deepEqual(await legacyPage.evaluate(()=>JSON.parse(localStorage.getItem('cops-robbers-v3')).current.state),legacy);
  await legacyContext.close();
  report.checks.push('legacy open-catalog unfinished level 100 resumes without fabricated completion');
  const duelContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true}),duelPage=await duelContext.newPage();
  await duelPage.goto(`${base}/?dev=0&mode=escape&level=120&role=runner&first=runner`);
  assert.equal(await duelPage.locator('body').getAttribute('data-duel-level'),'1','normal duel links cannot skip runner progression');
  assert.equal(await duelPage.locator('#duel-next').isDisabled(),true,'next duel map requires a victory');
  await duelPage.locator('#focus-toggle').tap();await duelPage.locator('#mode-settings').tap();
  assert.equal(await duelPage.locator('#solo-level option[value="120"]').evaluate(option=>option.disabled),true,'duel mode menu preserves normal unlocks');
  await duelContext.close();
  report.checks.push('duel direct-link/menu locks and victory-gated next map');
  const scoreContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true}),scorePage=await scoreContext.newPage();
  await scorePage.addInitScript(({normal,relay,quick})=>localStorage.setItem('cops-robbers-v3',JSON.stringify({version:3,completed:{1:{turns:normal,stars:1}},relayCompleted:{1:{turns:relay,stars:1}},quickCompleted:{1:{turns:quick,stars:1}}})),{normal:levels[0].par,relay:optimalRelaySolutions[1].length,quick:quickTrials[0].par});
  await scorePage.goto(`${base}/?dev=0&motion=reduce`);
  await scorePage.locator('#home-start').tap();
  const repaired=await scorePage.evaluate(()=>JSON.parse(localStorage.getItem('cops-robbers-v3')));
  assert.deepEqual([repaired.completed[1].stars,repaired.relayCompleted[1].stars,repaired.quickCompleted[1].stars],[3,3,3]);
  report.checks.push('production H5 restores normal/relay/quick stars from their own best-turn reference');
  await scoreContext.close();
  assert.deepEqual(report.errors,[]);report.passed=true;
  await context.close();
} finally {await browser.close();writeFileSync(new URL('browser-report.json',output),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
