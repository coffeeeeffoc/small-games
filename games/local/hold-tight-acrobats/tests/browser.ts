import { chromium, type Page, type BrowserContext } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Simulation } from '../src/simulation';

type Snapshot = ReturnType<Simulation['snapshot']> & { panel: string | null; view: { x: number; y: number; zoom: number; width: number; height: number } };
declare global { interface Window { readonly __acroSnapshot: Snapshot } }
const url = process.env.GAME_URL ?? 'http://localhost:4318/';
const startLevel = Number(process.env.START_LEVEL ?? 1);
const inputOnly = process.argv.includes('--input-only');
assert.ok(!inputOnly || startLevel === 1, 'input checks start in the first level');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, ...(startLevel > 1 ? { storageState: 'test-results/earned-progress.json' } : {}) });
const page = await context.newPage();
const errors: string[] = [], results: unknown[] = [];
await mkdir('test-results', { recursive: true });
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(`${m.text()} ${m.location().url}`); });
const snap = () => page.evaluate(() => window.__acroSnapshot);
async function until(predicate: (s: Snapshot) => boolean, label: string, timeout = 10000) {
  const start = Date.now();
  while(Date.now() - start < timeout) {
    const s=await snap(); if(predicate(s)) return s;
    if(s.status==='failed') throw new Error(`${label}: ${s.message}`);
    await page.waitForTimeout(12);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(await snap())}`);
}
async function wait(ms: number) { const at=(await snap()).time; await until(s=>s.time>=at+ms-5||s.status==='won','game-time wait',ms*4+3000); }
async function select(who: number) { await page.keyboard.press(String(who+1)); }
async function free(who: number) {await select(who);const c=(await snap()).actors[who];if(c.hands[0].grip)await page.keyboard.press('q');if(c.hands[1].grip)await page.keyboard.press('e');}
async function walk(who: number, x: number) {
  await select(who);const c=(await snap()).actors[who];if(Math.abs(c.x-x)<12)return;
  const direction=Math.sign(x-c.x),key=direction>0?'d':'a';await page.keyboard.down(key);
  await until(s=>(s.actors[who].x-x)*direction>=0||s.status==='won',`walk ${who} -> ${x}`,16000);await page.keyboard.up(key);await wait(450);
}
async function charge(ms: number) {
  await page.keyboard.down('Space');
  assert.ok((await snap()).charge,'charge began');
  await page.keyboard.press('d');
  await until(s=>(s.charge?.power??-1)>=Math.min(1,ms/1000),'charge held',4000);
  const before=(await snap()).actions.length;await page.keyboard.up('Space');
  assert.equal((await snap()).actions.length,before+1,'exactly one action was executed');
}
async function jumpGap(who: number, edge: number, landing: number, ms = 700) {
  await walk(who,edge-32);await free(who);await until(s=>s.actors[who].action==='jump','supported jump');
  await charge(ms);
  const start=Date.now();
  while(Date.now()-start<7000){const s=await snap();if(s.status==='failed')throw new Error(s.message);if(s.actors[who].x>landing&&s.actors[who].grounded)return;
    if(s.actors[who].hands.some(h=>h.target.includes('把手')||h.target.includes('边缘')||h.target.includes('横杆')))await free(who);
    await page.waitForTimeout(16);}
  throw new Error(`jump landing ${JSON.stringify(await snap())}`);
}
async function ring(who:number,offset=0){
  await walk(who,335+offset);await free(who);await wait(300);await charge(1000);
  await until(s=>s.actors[who].hands.some(h=>h.target.includes('吊环')),'catch ring',3000);await wait(300);await charge(1000);
  await until(s=>s.actors[who].x>508+offset&&s.actors[who].vx>3,'release window',2200);await free(who);
  const start=Date.now();
  while(Date.now()-start<7000){const s=await snap();if(s.status==='failed')throw new Error(s.message);
    if(s.actors[who].x>720+offset){if(s.actors[who].hands.some(h=>h.grip))await free(who);if(s.actors[who].grounded)return;}
    await page.waitForTimeout(16);}
  throw new Error(`ring landing ${JSON.stringify(await snap())}`);
}
async function chain(final=false){
  await wait(1000);await select(2);await charge(1000);
  await until(s=>s.grips.some(g=>g.anchor==='new'),'new support',5000);
  assert.ok((await snap()).grips.some(g=>g.anchor==='old'));
  await page.screenshot({path:`test-results/level-${final?5:3}-two-anchors.png`});
  await select(0);await page.keyboard.press('q');await wait(1900);await free(1);await wait(900);await free(2);await wait(1700);
  for(const who of [0,1,2])await free(who);
  await wait(1000);
  const landed=await snap();const order=[0,1,2].sort((a,b)=>landed.actors[b].x-landed.actors[a].x);
  for(const [index,who] of order.entries()){
    await free(who);await until(s=>s.actors[who].grounded,`chain landed ${who}`);
    if((await snap()).actors[who].x<380)await jumpGap(who,375,400,600);
    await walk(who,final?765-index*95:950-index*120);
  }
  for(const who of [0,1,2])await free(who);await wait(1000);
}
async function route(id:number){
  if(id===3||id===5){await chain(id===5);if(id===5){await until(s=>s.checkpoint,'final camp');const state=await snap();const order=[0,1,2].sort((a,b)=>state.actors[b].x-state.actors[a].x);for(const [i,who] of order.entries()){await ring(who,530);await walk(who,1580-i*100);}}}
  else {await wait(700);for(const who of [2,1,0]){if(id===2)await ring(who);else await jumpGap(who,id===1?410:350,id===1?515:455);
    await walk(who,id===1?730+who*90:id===2?850+who*95:555+who*160);}
    if(id===4){for(const who of [0,1,2])await free(who);await until(s=>s.checkpoint,'camp checkpoint');const state=await snap();const order=[0,1,2].sort((a,b)=>state.actors[b].x-state.actors[a].x);for(const [i,who] of order.entries()){await jumpGap(who,995,1120,750);await walk(who,1430-i*90);}}}
  if((await snap()).status!=='won')for(const who of [0,1,2])await free(who);
  await until(s=>s.status==='won','all three safely arrived',10000);
  const s=await snap();assert.equal(s.numericalErrors,0);await page.screenshot({path:`test-results/level-${id}-won.png`});
  results.push({level:id,status:s.status,gameSeconds:s.time/1000,actions:s.actions,grips:s.events.filter(e=>e.kind==='grip')});console.log(`Browser level ${id}: won (${(s.time/1000).toFixed(1)}s)`);
}
try {
  await page.goto(url);await page.waitForFunction(()=>!!window.__acroSnapshot);
  await page.screenshot({path:'test-results/intro.png'});
  await page.locator('#start').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.id),'practice');
  await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement?.id),'start');
  await page.keyboard.press('Space');await wait(700);
  if(startLevel>1){await page.locator('#chapters').click();await page.locator(`[data-level="${startLevel-1}"]`).click();}
  // Actual pointer capture: switching cancels, pointercancel and blur never emit an action.
  if(startLevel===1){
  await select(2);await page.keyboard.press('Tab');assert.equal((await snap()).selected,0);
  const view=await snap(),canvas=await page.locator('#stage canvas').boundingBox();assert.ok(canvas);
  await page.mouse.click(canvas.x+(view.actors[1].x-view.view.x)*view.view.zoom,canvas.y+(view.actors[1].y-view.view.y)*view.view.zoom);
  assert.equal((await snap()).selected,1,'camera-transformed character click selects that actor');
  await select(2);
  const power=await page.locator('#power').boundingBox();assert.ok(power);
  await page.mouse.move(power.x+power.width/2,power.y+power.height/2);await page.mouse.down();await wait(250);assert.ok((await snap()).charge);
  await page.keyboard.press('2');await page.mouse.up();assert.equal((await snap()).charge,null);assert.equal((await snap()).actions.length,0);
  await select(2);await page.mouse.down();await wait(180);assert.ok((await snap()).charge);await page.locator('#power').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();assert.equal((await snap()).charge,null);assert.equal((await snap()).actions.length,0);
  await page.keyboard.down('Space');await wait(160);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.up('Space');assert.equal((await snap()).charge,null);assert.equal((await snap()).paused,true);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal((await snap()).paused,true,'repeated blur stays paused');
  await page.locator('#resume').click();await page.locator('#retry').click();
  for(let n=0;n<20;n++)await page.locator('#retry').click();
  await wait(700);await select(2);await charge(200);assert.equal((await snap()).actions.length,1,'reset does not duplicate input listeners');await page.locator('#retry').click();
  }
  for(let id=startLevel;id<=(inputOnly?0:5);id++) {
    await route(id);
    await writeFile(`test-results/browser-report-from-${startLevel}.json`,JSON.stringify({url,errors,results},null,2));
    await context.storageState({path:'test-results/earned-progress.json'});
    if(id<5)await page.locator('#next').click();
  }
  assert.deepEqual(errors,[]);
  await writeFile(inputOnly?'test-results/input-report.json':'test-results/browser-report.json',JSON.stringify({url,inputOnly,errors,results},null,2));
  console.log(inputOnly?'Active charge cancellation / switch / blur / repeated reset checks passed.':'Desktop routes, pointer cancellation, switching, blur and console checks passed.');
}catch(error){await page.screenshot({path:'test-results/browser-failure.png'});await writeFile('test-results/browser-failure.json',JSON.stringify({error:String(error),snapshot:await snap(),errors},null,2));console.error(String(error).slice(0,240));console.error('Details: test-results/browser-failure.json');process.exitCode=1;}
finally{await browser.close();}
