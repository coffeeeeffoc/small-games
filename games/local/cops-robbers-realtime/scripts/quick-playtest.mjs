import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {getLevels} from '../src/levels.js';
const base=process.env.GAME_URL || 'http://127.0.0.1:43690';
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true}),errors=[],timings=[];page.on('pageerror',e=>errors.push(e.message));
 const snapshot=()=>page.evaluate(async()=> (await import('./src/main.js')).getSnapshot());
 async function order(cop,point){await page.locator('.cop-card').nth(cop).tap();const p=await page.evaluate(async p=>(await import('./src/main.js')).worldToScreen(p),point);await page.touchscreen.tap(p.x,p.y);}
 await page.goto(base);await page.locator('#quick-entry [data-quick="1"]').tap();assert.equal((await snapshot()).mode,'quick');
 for(const trial of getLevels('quick')){
  if(trial.id>1){await page.waitForSelector('#win-dialog[open]');await page.locator('#next-button').tap();}
  assert.equal((await snapshot()).level,trial.id);await page.locator('#start-button').tap();
  for(const {cop,node} of trial.solution)await order(cop,trial.nodes[node]);
  await page.waitForFunction(()=>document.body.dataset.phase==='won',null,{timeout:15000});timings.push((await snapshot()).time.toFixed(2));
  const record=await page.evaluate(()=>JSON.parse(localStorage.getItem('neighborhood-patrol-v1')));assert.ok(record.modeBest[`quick-cop-${trial.id}`]);assert.equal(record.best[trial.id],undefined);
 }
 await page.waitForSelector('#win-dialog[open]');assert.match(await page.locator('#next-button').textContent(),/轮换指挥/);await page.locator('#next-button').tap();assert.equal((await snapshot()).rule,'relay');assert.equal((await snapshot()).mode,'challenge');
 for(const viewport of [{width:320,height:568},{width:844,height:390}]){
  await page.setViewportSize(viewport);await page.goto(`${base}/?mode=quick&level=3`);assert.equal((await snapshot()).mode,'quick');assert.equal((await snapshot()).role,'cop');
  for(const selector of ['#start-button','#quick-tabs','.cop-roster']){const r=await page.locator(selector).boundingBox();assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=viewport.width&&r.y+r.height<=viewport.height,`${selector} outside ${JSON.stringify(viewport)}: ${JSON.stringify(r)}`);}
  for(const button of await page.locator('.cop-card').all()){const r=await button.boundingBox();assert.ok(r.width>=44&&r.height>=44);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.locator('#share-puzzle').click();assert.match(await page.locator('#share-url').inputValue(),/mode=quick&level=3&role=cop&rule=standard&first=none/);
 }
 await page.goto(`${base}/?mode=quick&level=1`);await page.locator('#start-button').tap();await page.waitForFunction(()=>document.body.dataset.phase==='lost',null,{timeout:23000});await page.waitForSelector('#lose-dialog[open]');assert.match(await page.locator('#lose-description').textContent(),/单人靠近.*另一侧到位/);await page.locator('#lose-retry').tap();assert.equal((await snapshot()).phase,'ready');
 assert.deepEqual(errors,[]);console.log('PASS fresh quick entry, 3 actual touch wins '+timings.join('/')+'s, separate records, relay advance, 2 ready layouts and same-puzzle link, idle time-limit lesson/retry');
}finally{await browser.close();}
