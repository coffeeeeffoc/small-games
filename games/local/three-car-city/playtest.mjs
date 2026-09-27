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
const click=async selector=>{if(touch)await page.locator(selector).tap();else await page.locator(selector).click();};
const time=()=>page.locator('#app').getAttribute('data-time').then(Number);
const paused=()=>page.locator('#app').getAttribute('data-paused');
const reach=t=>page.waitForFunction(t=>Number(document.querySelector('#app').dataset.time)>=t,t,{timeout:60000});
const send=async(car,event,mode)=>{await click(`#fleet-${car}`);await click(`#event-${event}`);if(mode)await click(`#routes [data-route="${mode}"]`);};
const choose=async level=>{if(await page.locator('#result').evaluate(el=>el.open))await click('#retry-result');await click(`[data-level="${level}"]`);assert.equal(await time(),0);};
const pause=async()=>{if(await paused()==='false')await click('#go');};
const resume=async()=>{if(await paused()==='true')await click('#go');};
const won=async level=>{await page.locator('#result[open]').waitFor({timeout:60000});assert.equal(await page.locator('#result-title').innerText(),'全城平安');report.checks.push({level,result:await page.locator('#result-body').innerText()});console.log('PASS level',level);};
const advancing=async()=>{const t=await time();await page.waitForTimeout(350);assert((await time())>t,'interaction unexpectedly stopped the clock');assert.equal(await paused(),'false');};
const center=async selector=>{const b=await page.locator(selector).boundingBox();return{x:b.x+b.width/2,y:b.y+b.height/2};};
async function dragTo(from,to){const a=await center(from),b=await center(to);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});assert.equal(await page.locator('#drag-guide').isVisible(),true);await page.mouse.up();}
try{
 await page.goto('http://127.0.0.1:4404/');await page.locator('#car-1').waitFor();
 await send(1,'fire-1');assert.equal(await paused(),'false');await send(3,'pet-1');await reach(12.1);await send(3,'pet-2');await reach(18.1);await send(2,'fire-2');await won(1);
 await choose(1);await dragTo('#car-1','#event-traffic-1');assert.match(await page.locator('#hint').innerText(),/已派往/);
 await send(2,'fire-1');assert.match(await page.locator('#eta').innerText(),/当前预估超时/);await send(3,'pet-1');
 await reach(2);await click('#fleet-1');assert.match(await page.locator('#hint').innerText(),/正在清障/);await advancing();assert.equal(await page.locator('#car-1').getAttribute('data-working'),'true');
 await click('#fleet-2');await advancing();await click('#cancel');await advancing();
 await dragTo('#fleet-2','header h1');await advancing();assert.match(await page.locator('#event-fire-1 .assigned').textContent(),/2号/);
 await reach(6.8);assert.equal(await page.locator('#event-traffic-1').getAttribute('data-state'),'done');await pause();await page.screenshot({path:'docs/playtest-desktop.png',fullPage:true});await resume();
 await reach(18.1);assert.equal(await page.locator('#event-fire-1').getAttribute('data-state'),'done');await send(3,'pet-2');await reach(20.1);await send(1,'fire-2');await won(2);
 report.checks.push({regression:'A kept working while B was selected; cancel and invalid drag kept the clock running and preserved assignments'});
 await choose(2);await page.setViewportSize({width:390,height:844});touch=true;
 await send(1,'traffic-1');await send(2,'fire-1','short');await send(3,'pet-1');await reach(7.1);await pause();await page.screenshot({path:'docs/playtest-mobile.png',fullPage:true});
 for(const [width,height] of [[360,640],[390,844],[844,390]]){await page.setViewportSize({width,height});const size=await page.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight}));assert(size.sw<=width+1,'horizontal overflow');assert(size.sh<=height+1,`vertical overflow ${JSON.stringify(size)}`);for(const selector of ['#fleet-1','#car-1 .car-ring','.district[data-node="C"] circle']){const box=await page.locator(selector).boundingBox();assert(box.width>=44&&box.height>=44,selector+' under 44px');}report.checks.push({viewport:size});}
 await page.setViewportSize({width:390,height:844});await resume();await reach(20.1);await send(3,'power-1');await send(1,'fire-2');await reach(22.1);await send(2,'pet-2');await won(3);
 // Target-first taps, district targets, standby and explicit pause.
 await choose(0);await click('#event-pet-1');assert.equal(await page.locator('#fleet-3').evaluate(el=>el.classList.contains('available')),true);await click('#fleet-3');assert.match(await page.locator('#event-pet-1 .assigned').textContent(),/3号/);await advancing();
 await click('#fleet-1');await click('.district[data-node="F"] circle');assert.match(await page.locator('#event-fire-1 .assigned').textContent(),/1号/);
 await pause();await click('#fleet-2');await click('.district[data-node="C"] circle');assert.match(await page.locator('#fleet-2 small').innerText(),/前往 C区/);const held=await time();await page.waitForTimeout(350);assert.equal(await time(),held);await click('#cancel');assert.equal(await paused(),'true');
 await page.locator('#fleet-2').focus();await page.keyboard.press('Enter');await page.locator('.district[data-node="D"]').focus();await page.keyboard.press('Enter');assert.match(await page.locator('#hint').innerText(),/2号车已派往 D/);await page.keyboard.press('Escape');assert.equal(await paused(),'true');
 report.checks.push({inputs:'target-first touch; vehicle-first district tap resolves active event; empty district standby; keyboard; explicit pause preserved'});
 // Drag to the street below the event card with a genuine touch gesture.
 await choose(0);const cdp=await context.newCDPSession(page);const source=await center('#fleet-1'),target=await center('.district[data-node="F"] circle');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[source]});
 for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:source.x+(target.x-source.x)*i/6,y:source.y+(target.y-source.y)*i/6}]});
 assert.equal(await page.locator('#drag-guide').isVisible(),true);await page.waitForFunction(()=>document.querySelector('#hint').textContent.includes('松手派往 F区'));await page.screenshot({path:'docs/playtest-drag.png',fullPage:true});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.match(await page.locator('#event-fire-1 .assigned').textContent(),/1号/);await advancing();
 const cancelSource=await center('#fleet-3');await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[cancelSource]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await advancing();assert.equal(await page.locator('#drag-guide').isVisible(),false);
 report.checks.push({touchDrag:'fleet to event district, visible tether/ghost and target highlight; pointercancel did not stop ongoing rescue'});
 // Paused planning with route alternatives also fits a short phone viewport.
 await choose(2);await resume();await pause();await send(2,'fire-1');await page.setViewportSize({width:360,height:640});assert.equal(await page.locator('#routes button').count(),2);const shortSize=await page.evaluate(()=>({h:innerHeight,sh:document.documentElement.scrollHeight}));assert(shortSize.sh<=shortSize.h+1,`route layout overflow ${JSON.stringify(shortSize)}`);await page.screenshot({path:'docs/playtest-small-routes.png',fullPage:true});
 await click('#sound');assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'true');await click('#motion');
 await choose(1);await resume();await page.locator('#result[open]').waitFor({timeout:40000});assert.equal(await page.locator('#result-title').innerText(),'这次没赶上');await click('#retry-result');assert.equal(await time(),0);report.checks.push({idleFailureAndRetry:true});
 for(const url of ['http://127.0.0.1:4404/','http://127.0.0.1:4404/three-car-city/']){await page.goto(url);await page.locator('#car-1').waitFor();assert.equal(await page.title(),'小城救援队 · 分派救援，疏通道路');report.checks.push({standalone:url});}
 await choose(2);await send(1,'traffic-1');await send(2,'fire-1');const routeButton=await page.locator('#routes [data-route="short"]').elementHandle();await page.waitForTimeout(1100);assert(await routeButton.evaluate(el=>el.isConnected),'ETA update replaced a live route button');await click('#routes [data-route="short"]');report.checks.push({routeButton:'stable across ETA updates; touch changes route while driving'});
 const focusBrowser=await chromium.launch({channel:'chrome',headless:false,args:['--window-position=-2000,-2000']});
 try{const fc=await focusBrowser.newContext(),fp=await fc.newPage();await fp.goto('http://127.0.0.1:4404/');await fp.locator('#go').click();await fp.waitForTimeout(350);const focusCDP=await fc.newCDPSession(fp);await focusCDP.send('Emulation.setFocusEmulationEnabled',{enabled:false});const other=await fc.newPage();await other.bringToFront();await fp.waitForTimeout(350);const held=await fp.locator('#app').getAttribute('data-time');assert.equal(await fp.locator('#app').getAttribute('data-paused'),'true');await fp.bringToFront();await fp.waitForTimeout(350);assert.equal(await fp.locator('#app').getAttribute('data-time'),held);report.checks.push({background:'real Chrome tab blur and return; remains paused'});}finally{await focusBrowser.close();}
 assert.deepEqual(errors,[]);report.consoleErrors=errors;report.passed=true;
}catch(error){report.passed=false;report.error=error.message;await page.screenshot({path:'docs/playtest-failure.png',fullPage:true});throw error;}
finally{await writeFile('docs/playtest-results.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log(JSON.stringify(report,null,2));
