import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {quickSolutions} from '../src/quick-trials.js';
import {movedOfficer} from '../src/relay.js';
import {solutions} from '../src/solutions.js';
const base=process.env.BASE_URL || 'http://127.0.0.1:43441';
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('cops-robbers-v3')));
 const openModes=async()=>{await page.locator('#mode-settings').tap();assert.ok(await page.locator('#mode-dialog').isVisible());};
 const choosePatrol=async id=>{await page.locator('#start-mode').tap();assert.ok(await page.locator('#level-dialog').isVisible());await page.getByTestId(`level-button-${id}`).tap();};
 await page.goto(base);await page.locator('#quick-start').tap();assert.equal(await page.locator('body').getAttribute('data-mode'),'quick');
 for(const id of [1,2,3]){
  if(id>1)await page.locator('#next-level').tap();
  for(const plan of quickSolutions[id]){
   const before=(await saved()).current.state,actor=movedOfficer(before,plan);
   await page.getByTestId(`cop-${actor}`).tap();await page.getByTestId(`node-${plan[actor]}`).tap();
   await page.waitForFunction(turn=>document.body.dataset.turn===String(turn)&&['planning','won'].includes(document.body.dataset.phase),before.turn+1);
  }
  assert.equal(await page.locator('body').getAttribute('data-phase'),'won');assert.ok((await saved()).quickCompleted[id]);assert.equal((await saved()).completed[id],undefined);
 }
 assert.match(await page.locator('#next-level').textContent(),/进阶换防接力/);await page.locator('#next-level').tap();
 assert.equal(await page.locator('body').getAttribute('data-rule'),'relay');assert.equal(await page.locator('body').getAttribute('data-mode'),'challenge');
 await page.goto(`${base}/?mode=quick&level=1&motion=reduce`);
 for(let i=0;i<2;i++){await page.getByTestId('node-0').tap();await page.waitForFunction(turn=>document.body.dataset.turn===String(turn)&&['planning','lost'].includes(document.body.dataset.phase),i+1);if(i===0){assert.equal(await page.locator('.lesson-ring').count(),0,'teaching cannot show a route longer than the remaining budget');assert.match(await page.locator('#instruction').textContent(),/还需 2 步，只剩 1 步/);}}
 assert.match(await page.locator('#loss-title').textContent(),/步数用完/);assert.doesNotMatch(await page.locator('#loss-details').textContent(),/逃走/);
 await page.locator('#undo-loss').tap();assert.equal(await page.locator('body').getAttribute('data-turn'),'1');assert.equal(await page.locator('body').getAttribute('data-phase'),'planning');
 for(const viewport of [{width:320,height:568},{width:844,height:390}]){
  await page.setViewportSize(viewport);await page.goto(`${base}/?mode=quick&level=3&motion=reduce`);
  for(const selector of ['#board','.action-bar','#squad']){const r=await page.locator(selector).boundingBox();assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=viewport.width&&r.y+r.height<=viewport.height,`${selector} outside ${JSON.stringify(viewport)}: ${JSON.stringify(r)}`);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#focus-toggle').tap();await page.locator('#share-challenge').tap();assert.match(await page.locator('#share-url').inputValue(),/mode=quick&level=3&rule=standard/);
 }
 // A quick link must leave an existing standard patrol available when switching back.
 await page.goto(`${base}/?mode=challenge&level=1&motion=reduce`);await page.getByTestId('cop-0').tap();await page.getByTestId('node-1').tap();await page.waitForFunction(()=>document.body.dataset.turn==='1'&&document.body.dataset.phase==='planning');
 const original=(await saved()).current;await page.goto(`${base}/?mode=quick&level=2&motion=reduce`);
 assert.deepEqual((await saved()).patrols['challenge:standard'],original);
 await page.locator('#focus-toggle').tap();await openModes();await page.locator('#solo-mode').selectOption('challenge');await choosePatrol(original.levelId);assert.deepEqual((await saved()).current,original);
 await page.goto(`${base}/?mode=quick&level=3&motion=reduce`);
 const opening=(await saved()).current.state,first=quickSolutions[3][0],actor=movedOfficer(opening,first);await page.getByTestId(`cop-${actor}`).tap();await page.getByTestId(`node-${first[actor]}`).tap();await page.waitForFunction(()=>document.body.dataset.turn==='1'&&document.body.dataset.phase==='planning');
 const unfinishedQuick=(await saved()).current;
 await page.locator('#focus-toggle').tap();await openModes();await page.locator('#solo-mode').selectOption('challenge');await choosePatrol(original.levelId);await page.locator('#focus-toggle').tap();await openModes();await page.locator('#solo-mode').selectOption('quick');assert.equal(await page.locator('#solo-level').inputValue(),'3');await choosePatrol(unfinishedQuick.levelId);assert.deepEqual((await saved()).current,unfinishedQuick);
 await page.goto(`${base}/?mode=challenge&level=4&rule=relay&motion=reduce`);const relayState=(await saved()).current.state,relayPlan=solutions[4][0],relayActor=movedOfficer(relayState,relayPlan);await page.getByTestId(`cop-${relayActor}`).tap();await page.getByTestId(`node-${relayPlan[relayActor]}`).tap();await page.waitForFunction(()=>document.body.dataset.turn==='1'&&document.body.dataset.phase==='planning');const unfinishedRelay=(await saved()).current;
 await page.goto(`${base}/?mode=quick&level=2&motion=reduce`);await page.locator('#focus-toggle').tap();await openModes();await page.locator('#solo-mode').selectOption('relay');assert.equal(await page.locator('#solo-level').inputValue(),'4');await choosePatrol(unfinishedRelay.levelId);assert.deepEqual((await saved()).current,unfinishedRelay);
 await page.addInitScript(()=>{const save=JSON.parse(localStorage.getItem('cops-robbers-v3'));save.patrols['quick:standard']={levelId:1,state:{robbers:{bad:true}}};localStorage.setItem('cops-robbers-v3',JSON.stringify(save));});await page.reload();await openModes();await page.locator('#solo-mode').selectOption('quick');await choosePatrol(1);assert.equal(await page.locator('body').getAttribute('data-mode'),'quick');assert.equal((await saved()).current.state.turn,0);
 assert.deepEqual(errors,[]);console.log('PASS fresh quick entry, 3 touch wins and separate records, limit loss/undo, 2 mobile layouts, share, standard/quick/relay resume and damaged backup rejection');
}finally{await browser.close();}
