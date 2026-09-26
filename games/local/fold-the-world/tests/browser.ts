import { chromium, type Page, type CDPSession } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { routes, runAction, type Action } from './routes';
import { Puzzle } from '../src/game';
import type { Body } from '../src/physics';
import type { Fold } from '../src/geometry';
import { levels } from '../src/levels';
import { TEXT as T } from '../src/strings';
interface Snapshot {index:number;mode:string;body:Body;fold:Fold|null;folds:number;unfolds:number;keys:string[];deaths:number;elapsed:number;preview:number;objects:number;hint:{stage:number;text:string;marker:{x:number;y:number}|null}|null;hintTier:number;progress:{unlocked:number;best:Record<string,number>}}
const url=process.env.GAME_URL??'http://localhost:4312/';
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:800}});
const page=await context.newPage();
const errors:string[]=[],warnings:string[]=[],results:unknown[]=[];
const captureErrors=(p:Page):void=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});};
captureErrors(page);
const snapshot=(p:Page=page):Promise<Snapshot>=>p.evaluate('window.__foldSnapshot');
const waitMode=(mode:string,p:Page=page):Promise<unknown>=>p.waitForFunction(m=>(window as unknown as {__foldSnapshot:Snapshot}).__foldSnapshot?.mode===m,mode,{timeout:5000});
async function drive(action:Action,p:Page=page,touch?:CDPSession):Promise<void> {
  if(action.kind==='fold'||action.kind==='unfold') {
    await p.waitForFunction(() => Math.abs((window as unknown as {__foldSnapshot:Snapshot}).__foldSnapshot.body.vx)<8);
    if(action.kind==='fold') {if(touch){await p.locator(`[data-crease="${action.crease}"]`).tap();await p.locator('#fold').tap();}else{await p.locator(`[data-crease="${action.crease}"]`).click();await p.keyboard.press('KeyF');}}
    else if(touch)await p.locator('#fold').tap();else await p.keyboard.press('KeyF');
    await waitMode('FOLD_ANIMATING',p);await waitMode('PLAYING',p);return;
  }
  const before=await snapshot(p);let airborne=false;let held='';
  const points=new Map<number,{id:number;x:number;y:number}>();
  const contact=async(control:string,id:number):Promise<void>=>{const b=await p.locator(`[data-control="${control}"]`).boundingBox();assert.ok(b);points.set(id,{id,x:b.x+b.width/2,y:b.y+b.height/2});await touch!.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[...points.values()]});};
  // Chrome ends the supplied contacts; sending the remaining finger ends movement.
  const lift=async(id:number):Promise<void>=>{const released=points.get(id);points.delete(id);await touch!.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:released?[released]:[]});};
  const steer=async(axis:number):Promise<void>=>{
    const next=axis>0?'ArrowRight':axis<0?'ArrowLeft':'';
    if(next!==held){if(held){if(touch)await lift(1);else await p.keyboard.up(held);}if(next){if(touch)await contact(axis>0?'right':'left',1);else await p.keyboard.down(next);}held=next;}
  };
  if(action.kind==='jump'){await steer(Math.sign(action.x-before.body.x));if(touch)await contact('jump',2);else await p.keyboard.down('Space');await p.waitForTimeout(20);if(touch)await lift(2);else await p.keyboard.up('Space');}
  try {
    for(let i=0;i<600;i++) {
      const s=await snapshot(p), b=s.body;assert.equal(s.deaths,before.deaths,`Death at ${JSON.stringify(action)}: ${JSON.stringify(b)}`);
      if(s.mode==='COMPLETED')return;
      airborne ||= !b.grounded;
      if(Math.abs(action.x-b.x)<4&&Math.abs(b.vx)<8&&b.grounded&&(action.kind==='walk'||airborne))return;
      const distance=action.x-b.x, stop=b.vx*Math.abs(b.vx)/(2*(b.grounded?2100:315));
      const axis=Math.abs(distance)<2||Math.sign(distance)===Math.sign(stop)&&Math.abs(distance)<Math.abs(stop)+2?0:Math.sign(distance);
      await steer(axis);await p.waitForTimeout(15);
    }
    assert.fail(`Timeout ${JSON.stringify(action)} ${JSON.stringify(await snapshot(p))}`);
  } finally {await steer(0);}
}
async function canvasPoint(p:Page,x:number,y:number):Promise<{x:number;y:number}> {
  const box=await p.locator('canvas').boundingBox();assert.ok(box);
  return {x:box.x+x/1200*box.width,y:box.y+(y-180)/380*box.height};
}
async function dragPaper(p:Page,end:number):Promise<void> {
  const a=await canvasPoint(p,1177,265),b=await canvasPoint(p,end,265);
  await p.mouse.move(a.x,a.y);await p.mouse.down();await p.mouse.move(b.x,b.y,{steps:15});await p.mouse.up();
}
async function swipePaper(p:Page,x:number,dx:number,dy=0):Promise<void> {
  const start=await canvasPoint(p,x,300);
  await p.mouse.move(start.x,start.y);await p.mouse.down();await p.mouse.move(start.x+dx,start.y+dy,{steps:10});await p.mouse.up();
}
try {
  await page.goto(url);await page.getByRole('button',{name:T.start}).click();await waitMode('PLAYING');await page.waitForTimeout(200);
  assert.equal(await page.locator('header').count(),0);
  await page.keyboard.press('KeyH');await page.locator('#hint-text').waitFor();await waitMode('PAUSED');
  const thinking=await snapshot();assert.equal(thinking.hint?.stage,0);assert.equal(thinking.hint?.marker,null);
  await page.waitForTimeout(130);assert.deepEqual((await snapshot()).body,thinking.body);
  await page.locator('[data-action="hint-more"]').click();assert.equal((await snapshot()).hintTier,1);assert.ok((await snapshot()).hint?.marker);
  await page.keyboard.press('KeyH');await page.waitForFunction(()=>(window as unknown as {__foldSnapshot:Snapshot}).__foldSnapshot.hintTier===2);
  assert.equal((await snapshot()).folds,0);await page.keyboard.press('Escape');await waitMode('PLAYING');
  await page.locator('#help').click();await page.getByRole('heading',{name:T.help,exact:true}).waitFor();await page.keyboard.press('Escape');await waitMode('PLAYING');
  // A fresh press immediately after a dialog closes must survive the next frame.
  const resumedX=(await snapshot()).body.x;await page.keyboard.down('ArrowRight');await page.waitForTimeout(100);await page.keyboard.up('ArrowRight');
  assert.ok((await snapshot()).body.x>resumedX+4);await page.keyboard.press('KeyR');await page.waitForTimeout(100);
  const start=await snapshot();
  assert.equal(await page.locator('#unfold').count(),0);
  assert.equal(await page.locator('#fold').getAttribute('aria-label'),T.fold);
  // Intent works on broad blank paper; vertical, outward and short strokes do nothing.
  await swipePaper(page,900,0,80);await swipePaper(page,900,85);await swipePaper(page,900,-30);await waitMode('PLAYING');
  assert.equal((await snapshot()).folds,0);
  await swipePaper(page,900,-85);await waitMode('PLAYING');assert.equal((await snapshot()).folds,1);
  assert.equal(await page.locator('#fold').getAttribute('aria-label'),T.unfold);
  await swipePaper(page,300,85);await waitMode('PLAYING');assert.equal((await snapshot()).fold,null);assert.equal((await snapshot()).unfolds,1);
  await page.keyboard.press('KeyF');await waitMode('FOLD_ANIMATING');await waitMode('PLAYING');assert.ok((await snapshot()).fold);
  await page.keyboard.press('KeyF');await waitMode('FOLD_ANIMATING');await waitMode('PLAYING');assert.equal((await snapshot()).fold,null);
  assert.deepEqual((await snapshot()).body,start.body);
  await page.keyboard.press('KeyR');await page.waitForTimeout(100);
  const a=await canvasPoint(page,1177,265),b=await canvasPoint(page,1000,265);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});await waitMode('FOLD_PREVIEW');
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(120);assert.deepEqual((await snapshot()).body,start.body);
  await page.keyboard.press('Escape');await page.mouse.up();await page.keyboard.up('ArrowRight');await waitMode('PLAYING');assert.equal((await snapshot()).folds,0);
  await dragPaper(page,1147);await waitMode('PLAYING');assert.equal((await snapshot()).folds,0);
  await dragPaper(page,450);await waitMode('PLAYING');assert.equal((await snapshot()).folds,1);
  await page.screenshot({path:'test-results/desktop-folded.png'});
  await drive({kind:'walk',x:350});await page.keyboard.press('KeyF');assert.equal((await snapshot()).folds,1);assert.ok((await snapshot()).fold);await page.getByText(T.fixed,{exact:true}).waitFor();
  console.log('PASS mouse preview / cancellation / commit / unsafe unfold');
  for(let i=0;i<routes.length;i++) {
    if(i>0){await page.locator('[data-action="next"]').click();await waitMode('PLAYING');await page.waitForTimeout(100);}
    if(i===1){await swipePaper(page,300,85);await waitMode('PLAYING');assert.equal((await snapshot()).fold?.direction,'left-to-right');await swipePaper(page,900,-85);await waitMode('PLAYING');assert.equal((await snapshot()).fold,null);await page.keyboard.press('KeyR');await page.waitForTimeout(100);}
    if(i===7){
      await drive(routes[i][0]);await drive({kind:'unfold'});await page.keyboard.press('KeyH');
      await page.getByText('你换了折法，或漏拿了钥匙。重新开始本关，就能跟随标记路线。',{exact:true}).waitFor();
      assert.equal(await page.locator('[data-action="hint-more"]').isDisabled(),true);
      await page.locator('[data-action="replay"]').click();await waitMode('PLAYING');await page.waitForTimeout(100);
    }
    if(i===12){for(const [key,crease] of [['Digit3','C'],['Digit2','B'],['Digit1','A']]){await page.keyboard.press(key);assert.equal(await page.locator(`[data-crease="${crease}"]`).getAttribute('aria-pressed'),'true');}}
    const reference=new Puzzle(levels[i]);if(i===0)runAction(reference,routes[0][0]);
    for(const action of routes[i].slice(i===0?1:0)) {
      if(i===9&&action.kind==='fold'&&action.crease==='B'){
        // The left-side gesture chooses the opposite allowed crease without a selection click.
        await swipePaper(page,300,85);await waitMode('PLAYING');assert.equal((await snapshot()).fold?.crease,'B');
      }else await drive(action);
      runAction(reference,action);const actual=await snapshot();
      // A reference route can touch the exit mid-jump before the browser lands.
      if(actual.mode==='PLAYING'&&reference.mode==='PLAYING')assert.ok(Math.abs(actual.body.y-reference.body.y)<1,`Wrong landing in level ${i+1}, ${JSON.stringify(action)}: actual y=${actual.body.y}, expected ${reference.body.y}`);
      if(i>=10&&action.kind==='fold'){
        await page.keyboard.press('KeyH');await page.locator('#hint-text').waitFor();const h=await snapshot();assert.equal(h.mode,'PAUSED');assert.equal(h.hint?.stage,h.folds+h.unfolds);
        await page.locator('[data-action="hint-more"]').click();
        if(i===14&&action.crease==='C')await page.screenshot({path:'test-results/advanced-hint.png'});
        await page.keyboard.press('Escape');await waitMode('PLAYING');
      }
    }
    const s=await snapshot();assert.equal(s.mode,'COMPLETED',`Level ${i+1}`);assert.equal(s.folds,routes[i].filter(a=>a.kind==='fold').length);
    assert.equal(s.keys.length,levels[i].entities.filter(e=>e.kind==='key').length);
    results.push({level:i+1,mode:s.mode,folds:s.folds,unfolds:s.unfolds,keys:s.keys,deaths:s.deaths,gameSeconds:s.elapsed});
    await page.screenshot({path:`test-results/level-${String(i+1).padStart(2,'0')}.png`});
    console.log(`PASS browser level ${i+1}; folds=${s.folds}; unfolds=${s.unfolds}`);
  }
  assert.equal((await snapshot()).progress.unlocked,levels.length);
  await page.reload();await page.getByRole('button',{name:T.start}).click();await waitMode('PLAYING');assert.equal((await snapshot()).progress.unlocked,levels.length);
  await page.keyboard.press('Escape');await waitMode('PAUSED');await page.locator('#chapters').click();await page.locator('[data-level="0"]').click();await page.waitForTimeout(200);
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(70);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await waitMode('PAUSED');await page.keyboard.up('ArrowRight');
  const frozen=(await snapshot()).body;await page.waitForTimeout(250);assert.deepEqual((await snapshot()).body,frozen);
  await page.getByRole('button',{name:T.resume}).click();await page.waitForTimeout(150);assert.ok((await snapshot()).body.x-frozen.x<10);
  await page.keyboard.press('KeyR');await page.waitForTimeout(150);
  // Space must jump even after a native button retained focus, not activate Restart again.
  await page.locator('#restart').click();await page.waitForTimeout(100);await page.keyboard.press('Space');await page.waitForTimeout(100);
  assert.ok((await snapshot()).body.y<390);await page.waitForTimeout(650);await page.keyboard.press('KeyR');await page.waitForTimeout(100);
  const count=(await snapshot()).objects;
  for(let i=0;i<50;i++) {await drive({kind:'fold',crease:'A',direction:'right-to-left'});await drive({kind:'unfold'});assert.equal((await snapshot()).objects,count);if((i+1)%10===0)console.log(`PASS browser fold soak ${i+1}/50`);}
  results.push({check:'50 browser fold/unfold cycles',objects:count,folds:(await snapshot()).folds,unfolds:(await snapshot()).unfolds});
  await page.keyboard.press('Escape');await waitMode('PAUSED');await page.locator('#fullscreen').click();await page.waitForFunction(()=>!!document.fullscreenElement);
  await page.locator('#fullscreen').click();await page.waitForFunction(()=>!document.fullscreenElement);
  await page.locator('#sound').click();assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:T.resume}).click();await waitMode('PLAYING');
  await page.keyboard.press('KeyR');await page.waitForTimeout(100);
  for(const size of [{width:1920,height:1080},{width:844,height:390},{width:667,height:375},{width:390,height:844}]) {
    await page.setViewportSize(size);await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.screenshot({path:`test-results/viewport-${size.width}x${size.height}.png`});
  }
  const mobile=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const phone=await mobile.newPage();captureErrors(phone);await phone.goto(url);await phone.getByRole('button',{name:T.start}).tap();await waitMode('PLAYING',phone);await phone.waitForTimeout(150);
  const cdp=await mobile.newCDPSession(phone);
  const touchPoint=async(selector:string,id:number):Promise<{x:number;y:number;id:number;radiusX:number;radiusY:number}>=>{
    const box=await phone.locator(selector).boundingBox();assert.ok(box);return{x:box.x+box.width/2,y:box.y+box.height/2,id,radiusX:4,radiusY:4};
  };
  const right=await touchPoint('[data-control="right"]',1),jump=await touchPoint('[data-control="jump"]',2);
  const before=await snapshot(phone);
  for(const selector of ['[data-control="left"]','[data-control="right"]','[data-control="jump"]','#show-hint','#fold','#creases button']){for(const b of await phone.locator(selector).all()){const box=await b.boundingBox();assert.ok(box&&box.width>=44&&box.height>=44,`Small touch target ${selector}`);}}
  await phone.locator('#show-hint').tap();await phone.locator('#hint-text').waitFor();assert.equal((await snapshot(phone)).mode,'PAUSED');await phone.locator('[data-action="hint-more"]').tap();await phone.screenshot({path:'test-results/mobile-hint.png'});await phone.locator('[data-action="back"]').tap();await waitMode('PLAYING',phone);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[right,jump]});await phone.waitForTimeout(180);
  const after=await snapshot(phone);assert.ok(after.body.x>before.body.x+5);assert.ok(after.body.y<before.body.y-15);assert.equal(after.fold,null);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[jump]});await phone.waitForTimeout(80);
  assert.ok((await snapshot(phone)).body.x>after.body.x+5,'Releasing Jump must leave the movement finger active');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await phone.waitForTimeout(600);assert.ok(Math.abs((await snapshot(phone)).body.vx)<1);
  await phone.locator('#restart').tap();await phone.waitForTimeout(150);
  const edge=await canvasPoint(phone,900,300),end={x:edge.x-85,y:edge.y};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...edge,id:3}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:3}]});await phone.waitForTimeout(70);
  assert.equal((await snapshot(phone)).mode,'FOLD_PREVIEW');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await waitMode('PLAYING',phone);assert.equal((await snapshot(phone)).folds,1);
  const blank=await canvasPoint(phone,300,300);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...blank,id:3}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:blank.x+85,y:blank.y,id:3}]});await phone.waitForTimeout(50);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await waitMode('PLAYING',phone);assert.ok((await snapshot(phone)).fold);assert.equal((await snapshot(phone)).unfolds,0);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...blank,id:3}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:blank.x+85,y:blank.y,id:3}]});await phone.waitForTimeout(50);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await waitMode('PLAYING',phone);assert.equal((await snapshot(phone)).fold,null);
  await phone.locator('#fold').tap();await waitMode('FOLD_ANIMATING',phone);await waitMode('PLAYING',phone);assert.ok((await snapshot(phone)).fold);
  await phone.screenshot({path:'test-results/mobile-touch.png'});
  const r=await touchPoint('[data-control="right"]',4);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[r]});await waitMode('COMPLETED',phone);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  results.push({check:'mobile multitouch / touchCancel / blank-paper fold and unfold / unified button / first-level touch completion',passed:true});
  await mobile.close();
  // Reuse legitimately earned saves; no injected unlocks or game-state setters.
  const advanced=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,storageState:await context.storageState()});
  const advancedPage=await advanced.newPage();captureErrors(advancedPage);await advancedPage.goto(url);await advancedPage.getByRole('button',{name:T.start}).tap();await waitMode('PLAYING',advancedPage);
  await advancedPage.locator('#pause').tap();await waitMode('PAUSED',advancedPage);await advancedPage.locator('#chapters').tap();await advancedPage.locator('[data-level="14"]').tap();await waitMode('PLAYING',advancedPage);await advancedPage.waitForTimeout(150);
  const advancedTouch=await advanced.newCDPSession(advancedPage);
  await advancedPage.setViewportSize({width:667,height:375});await advancedPage.waitForTimeout(150);
  const controlBounds=await advancedPage.locator('.controls button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};}));
  for(const [i,a] of controlBounds.entries()){assert.ok(a.w>=44&&a.h>=44&&a.x>=0&&a.x+a.w<=667);for(const b of controlBounds.slice(i+1))assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,'Touch controls overlap');}
  await advancedPage.screenshot({path:'test-results/mobile-three-creases.png'});
  await advancedPage.setViewportSize({width:844,height:390});await advancedPage.waitForTimeout(150);
  for(const action of routes[14]){await drive(action,advancedPage,advancedTouch);if(action.kind==='fold'){await advancedPage.locator('#show-hint').tap();await advancedPage.locator('#hint-text').waitFor();await advancedPage.locator('[data-action="hint-more"]').tap();await advancedPage.screenshot({path:'test-results/mobile-advanced.png'});await advancedPage.locator('[data-action="back"]').tap();await waitMode('PLAYING',advancedPage);}}
  assert.equal((await snapshot(advancedPage)).mode,'COMPLETED');assert.equal((await snapshot(advancedPage)).keys.length,3);
  results.push({check:'level 15 completed with touch controls, three keys, four folds and contextual hints',passed:true});
  await advancedPage.screenshot({path:'test-results/mobile-level-15-complete.png'});await advanced.close();
  assert.deepEqual(errors,[]);
  await writeFile('test-results/browser-report.json',JSON.stringify({date:new Date().toISOString(),url,browser:browser.version(),results,errors,warnings},null,2));
  console.log('PASS persistence, lifecycle, fullscreen, four viewports, multitouch, touch completion; zero console errors');
} catch(error) {
  await page.screenshot({path:'test-results/failure.png'});
  await writeFile('test-results/browser-failure.json',JSON.stringify({error:String(error),snapshot:await snapshot(),results,errors,warnings},null,2));
  throw error;
} finally {await browser.close();}
