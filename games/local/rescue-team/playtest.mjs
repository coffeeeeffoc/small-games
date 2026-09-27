import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
if(!process.argv[2])throw new Error('Usage: node playtest.mjs <external @playwright/test/index.mjs>');
const {chromium}=await import(pathToFileURL(process.argv[2]));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:1280,height:1000},hasTouch:true});
const page=await context.newPage();
const errors=[],report={testedAt:new Date().toISOString(),browser:'Installed Chrome; real wall-clock, mouse and browser touch; no simulation injection',checks:[]};
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
let touch=false;
const click=async selector=>{const target=page.locator(selector);if(selector.startsWith('#event-')&&await target.evaluate(el=>el.parentElement.id==='assigned-events')&&!await page.locator('#assigned-jobs').evaluate(el=>el.open))await page.locator('#assigned-jobs summary').click();if(touch)await target.tap();else await target.click();};
const time=()=>page.locator('#app').getAttribute('data-time').then(Number);
const mapScreen=point=>page.locator('#map').evaluate((el,p)=>{const screen=new DOMPoint(...p).matrixTransform(el.getScreenCTM());return{x:screen.x,y:screen.y};},point);
const tapMap=async point=>{const p=await mapScreen(point);if(touch)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);};
const parkedAt=async(id,point)=>page.waitForFunction(({id,point})=>{const car=document.querySelector(`#car-${id}`),m=car.transform.baseVal[0].matrix;return car.dataset.moving==='false'&&Math.hypot(m.e-point[0],m.f-point[1])<2;},{id,point},{timeout:12000});
const paused=()=>page.locator('#app').getAttribute('data-paused');
const reach=t=>page.waitForFunction(t=>Number(document.querySelector('#app').dataset.time)>=t,t,{timeout:60000});
const send=async(car,event,mode)=>{await click(`#event-${event}`);await click(`[data-dispatch-car="${car}"]`);if(mode)await click(`#routes [data-route="${mode}"]`);};
const choose=async level=>{if(await page.locator('#result').evaluate(el=>el.open))await click('#retry-result');await click(`[data-level="${level}"]`);assert.equal(await time(),0);};
const pause=async()=>{if(await paused()==='false')await click('#go');};
const resume=async()=>{if(await paused()==='true')await click('#go');};
const won=async level=>{await page.locator('#result[open]').waitFor({timeout:60000});assert.equal(await page.locator('#result-title').innerText(),'全城平安');report.checks.push({level,result:await page.locator('#result-body').innerText()});console.log('PASS level',level);};
const advancing=async()=>{const t=await time();await page.waitForTimeout(350);assert((await time())>t,'interaction unexpectedly stopped the clock');assert.equal(await paused(),'false');};
const center=async selector=>{const b=await page.locator(selector).boundingBox();return{x:b.x+b.width/2,y:b.y+b.height/2};};
async function dragTo(from,to){const a=await center(from),b=await center(to);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});assert.equal(await page.locator('#drag-guide').isVisible(),true);await page.mouse.up();}
try{
 await page.goto('http://127.0.0.1:4404/');await page.locator('#car-1').waitFor();
 // Parking targets are coordinates, never fixed junction placeholders.
 await click('#fleet-1');assert.equal(await page.locator('.district').count(),0);
 await tapMap([402,370]);assert.match(await page.locator('#fleet-1 small').innerText(),/自选停靠点/);await parkedAt(1,[402,370]);
 await tapMap([440,310]);await parkedAt(1,[440,310]);
 await pause();await page.screenshot({path:'docs/playtest-free-parking.png',fullPage:true});
 await send(1,'fire-1');await resume();await page.waitForFunction(()=>document.querySelector('#car-1').dataset.working==='true',null,{timeout:12000});
 assert.equal(await page.locator('#car-1').getAttribute('transform'),'translate(449 428)','a car must leave its custom parking point and reach the incident');
 await choose(0);await page.setViewportSize({width:390,height:844});touch=true;
 await click('#fleet-1');await tapMap([315,325]);await parkedAt(1,[315,325]);
 await choose(0);const freeDrag=await context.newCDPSession(page),from=await center('#fleet-2'),to=await mapScreen([155,350]);
 await freeDrag.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});
 for(let i=1;i<=8;i++){await freeDrag.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/8,y:from.y+(to.y-from.y)*i/8}]});await page.waitForTimeout(20);}
 await freeDrag.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await parkedAt(2,[155,350]);assert.equal(await page.locator('.district').count(),0);
 report.checks.push({freeParking:'no fixed-junction circles; exact road and off-road parking; repark; resume rescue from custom point; mobile tap and touch drag'});
 await choose(0);await page.setViewportSize({width:1280,height:1000});touch=false;
 // Card-first dispatch: stable native buttons, live location links, and only idle cars.
 await click('#fleet-2');await click('#event-fire-1');
 assert.equal(await page.locator('#event-fire-1 .assigned').textContent(),'等待派车','a stale vehicle selection must not dispatch on a card click');
 assert.equal(await page.locator('#site-fire-1').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#dispatch-cars button:visible').count(),3);
 const verifyLinks=async()=>{
   assert.equal(await page.locator('#dispatch-links').isVisible(),true,'position lines must actually be visible');
   const links=await page.locator('[data-car-link]').evaluateAll(items=>items.map(el=>{
     const circle=el.querySelector('circle'),car=document.querySelector(`#car-${el.dataset.carLink}`),matrix=car.getScreenCTM();
     const endpoint=new DOMPoint(Number(circle.getAttribute('cx')),Number(circle.getAttribute('cy'))).matrixTransform(circle.getScreenCTM());
     return {dx:Math.abs(endpoint.x-matrix.e),dy:Math.abs(endpoint.y-matrix.f)};
   }));assert(links.length>0);assert(links.every(p=>p.dx<1&&p.dy<1),'location link drifted away from the car');
 };
 for(const [width,height] of [[1280,1000],[360,640],[390,844],[844,390]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(50);await verifyLinks();
   const box=await page.locator('#dispatch-picker').boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height);
   for(const button of await page.locator('#dispatch-cars button:visible').all()){const b=await button.boundingBox();assert(b.width>=44&&b.height>=44);}
   if(width===390)await page.screenshot({path:'docs/playtest-dispatch-picker.png',fullPage:true});
 }
 await page.setViewportSize({width:390,height:844});await page.locator('[data-dispatch-car="1"]').tap();
 assert.match(await page.locator('#event-fire-1 .assigned').textContent(),/1号/);assert.equal(await page.locator('#dispatch-picker').isVisible(),false);
 await page.locator('#event-pet-1').tap();assert.equal(await page.locator('[data-dispatch-car="1"]').isVisible(),false);assert.equal(await page.locator('#dispatch-cars button:visible').count(),2);await advancing();
 await page.locator('[data-dispatch-car="3"]').focus();await page.keyboard.press('Enter');assert.match(await page.locator('#event-pet-1 .assigned').textContent(),/3号/);
 assert.equal(await page.locator('#incidents .event:not([hidden])').count(),0);assert.equal(await page.locator('#assigned-count').innerText(),'2');assert.equal(await page.locator('#assigned-jobs').evaluate(el=>el.open),false);
 await click('#event-fire-1');assert.equal(await page.locator('#dispatch-picker').isVisible(),false);assert.match(await page.locator('#event-fire-1 .assigned').textContent(),/1号/);
 assert.equal(await page.locator('[data-car-link]').count(),1);await verifyLinks();await advancing();await verifyLinks();
 await page.screenshot({path:'docs/playtest-assigned-expanded.png',fullPage:true});
 for(const [width,height] of [[360,640],[844,390]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(50);await verifyLinks();
   for(const id of ['fire-1','pet-1'])assert(await page.locator(`#event-${id}`).evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('[data-event]')===el;}),'expanded assigned cards must remain clickable without an obscuring inspector');
 }
 await page.setViewportSize({width:390,height:844});
 await click('#assigned-jobs summary');await page.locator('#dispatch-links').waitFor({state:'hidden'});assert.equal(await page.locator('#dispatch-picker').isVisible(),false);
 await click('#event-fire-1');
 await page.keyboard.press('Escape');assert.equal(await page.locator('#dispatch-picker').isVisible(),false);assert.equal(await page.locator('[data-car-link]').count(),0);
 await choose(0);await page.setViewportSize({width:1280,height:1000});
 for(const id of [1,2,3]){await click(`#fleet-${id}`);await tapMap([510,160]);}
 await click('#event-fire-1');assert.equal(await page.locator('#dispatch-cars button:visible').count(),0);assert.match(await page.locator('#dispatch-note').innerText(),/暂无空闲/);
 await reach(10.5);assert((await page.locator('#dispatch-cars button:visible').count())>0,'newly idle vehicles must become selectable');await verifyLinks();
 await click('#event-pet-1');assert.equal(await page.locator('#site-fire-1').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#site-pet-1').getAttribute('aria-pressed'),'true');
 await reach(16.1);assert.equal(await page.locator('#dispatch-picker').isVisible(),false,'expired event must close the picker');
 await choose(0);await click('#event-fire-1');await click('#close-dispatch');assert.equal(await page.locator('#dispatch-links').isVisible(),false);
 report.checks.push({dispatchPicker:'card-first two-tap dispatch, no stale auto-dispatch, idle-only live candidates, assigned/empty states, exact position links after resize, touch/keyboard, cancellation and expiry cleanup'});
 await page.locator('#event-pet-1').focus();await page.keyboard.press('Enter');await page.keyboard.press('Enter');
 assert.equal(await page.locator('.assignment-flight').count(),1,'assignment should visibly move into the folded group');
 assert.equal(await page.locator('#assigned-events #event-pet-1').count(),1);assert.equal(await page.locator('#assigned-jobs').evaluate(el=>el.open),false);
 await reach(1);assert.equal(await page.locator('.assignment-flight').count(),0);
 await click('#event-pet-1');await page.locator('#event-pet-1').focus();await page.keyboard.press('Enter');await verifyLinks();await reach(9.1);
 assert.equal(await page.locator('#event-pet-1').isVisible(),false);assert.equal(await page.locator('#assigned-jobs').isVisible(),false);assert.equal(await page.locator('#dispatch-picker').isVisible(),false);
 assert.equal(await page.locator('#incidents .event:not([hidden])').count(),1,'unassigned fire must remain prominent after pet completion');
 assert.equal(await page.locator('#event-fire-1').evaluate(el=>document.activeElement===el),true,'completion should return keyboard focus to a pending task');
 await choose(0);await click('#motion');await send(1,'pet-1');assert.equal(await page.locator('.assignment-flight').count(),0);await click('#motion');await choose(0);
 report.checks.push({assignedGroup:'default pending-only list; animated fold on assignment; expand/collapse; assigned vehicle live links; automatic completed-event removal and inspector cleanup; reduced-motion setting'});
 assert.equal(await page.locator('#event-pet-2').isVisible(),false);
 assert.equal(await page.locator('#site-pet-2').isVisible(),false);
 assert.equal(await page.getByText('即将出现').count(),0);
 await send(1,'fire-1');await reach(2.1);
 assert.match(await page.locator('#event-fire-1 .event-time').textContent(),/已等待 02秒/);
 assert.equal(await page.locator('#event-pet-2').isVisible(),false);
 await reach(5.2);assert.equal(await page.locator('#car-1').getAttribute('data-working'),'true');
 assert.equal(await page.locator('#car-1').getAttribute('transform'),'translate(449 428)');
 assert.match(await page.locator('#event-fire-1 .event-time').textContent(),/已处理 00秒/);
 report.checks.push({events:'future cards and map pins hidden; waiting counts up; fire truck enters courtyard before service'});
 assert.equal(await paused(),'false');await send(3,'pet-1');await reach(14.5);await send(3,'pet-2');await reach(18.1);await send(2,'fire-2');await won(1);
 await choose(1);await dragTo('#car-1','#event-traffic-1');assert.match(await page.locator('#hint').innerText(),/已派往/);
 await send(2,'fire-1');assert.match(await page.locator('#eta').innerText(),/当前预估超时/);await send(3,'pet-1');
 await reach(2);await click('#fleet-1');assert.match(await page.locator('#hint').innerText(),/正在清障/);await advancing();assert.equal(await page.locator('#car-1').getAttribute('data-working'),'true');
 await click('#fleet-2');await advancing();await click('#cancel');await advancing();
 await dragTo('#fleet-2','header h1');await advancing();assert.match(await page.locator('#event-fire-1 .assigned').textContent(),/2号/);
 await reach(7.3);assert.equal(await page.locator('#event-traffic-1').getAttribute('data-state'),'done');await pause();await page.screenshot({path:'docs/playtest-desktop.png',fullPage:true});await resume();
 await reach(19.3);assert.equal(await page.locator('#event-fire-1').getAttribute('data-state'),'done');await send(3,'pet-2');await reach(20.1);await send(1,'fire-2');await won(2);
 report.checks.push({regression:'A kept working while B was selected; cancel and invalid drag kept the clock running and preserved assignments'});
 await choose(2);await page.setViewportSize({width:390,height:844});touch=true;
 await send(1,'traffic-1');await send(2,'fire-1','short');await send(3,'pet-1');await reach(7.4);await pause();await page.screenshot({path:'docs/playtest-mobile.png',fullPage:true});
 for(const [width,height] of [[360,640],[390,844],[844,390]]){await page.setViewportSize({width,height});const size=await page.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight}));assert(size.sw<=width+1,'horizontal overflow');assert(size.sh<=height+1,`vertical overflow ${JSON.stringify(size)}`);for(const selector of ['#fleet-1','#car-1 .car-ring','#site-fire-1 .site-hit']){const box=await page.locator(selector).boundingBox();assert(box.width>=44&&box.height>=44,selector+' under 44px');}report.checks.push({viewport:size});}
 await page.setViewportSize({width:390,height:844});await resume();await reach(20.1);await send(3,'power-1');await send(1,'fire-2');await reach(22.1);await send(2,'pet-2');await won(3);
 // Target-first taps, scene targets, free parking and explicit pause.
 await choose(0);await click('#event-pet-1');assert.equal(await page.locator('#fleet-3').evaluate(el=>el.classList.contains('available')),true);await click('[data-dispatch-car="3"]');assert.match(await page.locator('#event-pet-1 .assigned').textContent(),/3号/);await advancing();
 await click('#fleet-1');await click('#site-fire-1 .site-hit');assert.match(await page.locator('#event-fire-1 .assigned').textContent(),/1号/);
 await pause();await click('#fleet-2');await tapMap([510,160]);assert.match(await page.locator('#fleet-2 small').innerText(),/前往 自选停靠点/);const held=await time();await page.waitForTimeout(350);assert.equal(await time(),held);await click('#cancel');assert.equal(await paused(),'true');
 await page.locator('#fleet-2').focus();await page.keyboard.press('Enter');await page.locator('#map').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');assert.match(await page.locator('#fleet-2 small').innerText(),/前往 自选停靠点/);await page.keyboard.press('Escape');assert.equal(await paused(),'true');
 report.checks.push({inputs:'target-first touch; vehicle-first scene tap; arbitrary-coordinate parking; keyboard point selection; explicit pause preserved'});
 // Drag to the actual incident site with a genuine touch gesture.
 await choose(0);const cdp=await context.newCDPSession(page);const source=await center('#fleet-1'),target=await center('#site-fire-1 .site-hit');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[source]});
 for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:source.x+(target.x-source.x)*i/6,y:source.y+(target.y-source.y)*i/6}]});
 assert.equal(await page.locator('#drag-guide').isVisible(),true);await page.waitForFunction(()=>document.querySelector('#hint').textContent.includes('松手派往 河畔居民楼'));await page.screenshot({path:'docs/playtest-drag.png',fullPage:true});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.match(await page.locator('#event-fire-1 .assigned').textContent(),/1号/);await advancing();
 const cancelSource=await center('#fleet-3');await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[cancelSource]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await advancing();assert.equal(await page.locator('#drag-guide').isVisible(),false);
 report.checks.push({touchDrag:'fleet to actual incident site, visible tether/ghost and target highlight; pointercancel did not stop ongoing rescue'});
 // Paused planning with route alternatives also fits a short phone viewport.
 await choose(2);await resume();await pause();await send(2,'fire-1');await page.setViewportSize({width:360,height:640});assert.equal(await page.locator('#routes button').count(),2);const shortSize=await page.evaluate(()=>({h:innerHeight,sh:document.documentElement.scrollHeight}));assert(shortSize.sh<=shortSize.h+1,`route layout overflow ${JSON.stringify(shortSize)}`);await page.screenshot({path:'docs/playtest-small-routes.png',fullPage:true});
 await click('#sound');assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'true');await click('#motion');
 await choose(1);await resume();await page.locator('#result[open]').waitFor({timeout:40000});assert.equal(await page.locator('#result-title').innerText(),'这次没赶上');await click('#retry-result');assert.equal(await time(),0);report.checks.push({idleFailureAndRetry:true});
 for(const url of ['http://127.0.0.1:4404/','http://127.0.0.1:4404/rescue-team/']){await page.goto(url);await page.locator('#car-1').waitFor();assert.equal(await page.title(),'小城救援队 · 分派救援，疏通道路');report.checks.push({standalone:url});}
 await choose(2);await send(1,'traffic-1');await send(2,'fire-1');const routeButton=await page.locator('#routes [data-route="short"]').elementHandle();await page.waitForTimeout(1100);assert(await routeButton.evaluate(el=>el.isConnected),'ETA update replaced a live route button');await click('#routes [data-route="short"]');report.checks.push({routeButton:'stable across ETA updates; touch changes route while driving'});
 const focusBrowser=await chromium.launch({channel:'chrome',headless:true});
 try{const fc=await focusBrowser.newContext(),fp=await fc.newPage();await fp.goto('http://127.0.0.1:4404/');await fp.locator('#go').click();await fp.waitForTimeout(350);const focusCDP=await fc.newCDPSession(fp);await focusCDP.send('Emulation.setFocusEmulationEnabled',{enabled:false});const other=await fc.newPage();await other.bringToFront();await fp.waitForTimeout(350);const held=await fp.locator('#app').getAttribute('data-time');assert.equal(await fp.locator('#app').getAttribute('data-paused'),'true');await fp.bringToFront();await fp.waitForTimeout(350);assert.equal(await fp.locator('#app').getAttribute('data-time'),held);report.checks.push({background:'real Chrome tab blur and return; remains paused'});}finally{await focusBrowser.close();}
 assert.deepEqual(errors,[]);report.consoleErrors=errors;report.passed=true;
}catch(error){report.passed=false;report.error=error.message;await page.screenshot({path:'docs/playtest-failure.png',fullPage:true});throw error;}
finally{await writeFile('docs/playtest-results.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log(JSON.stringify(report,null,2));
