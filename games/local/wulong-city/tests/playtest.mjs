// Real browser inputs only. The dev endpoint exposes read-only snapshots, no solve API.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const baseURL=process.env.BASE_URL || 'http://127.0.0.1:4174/';
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined});
const touchMode=process.env.INPUT==='touch',width=Number(process.env.WIDTH)||390;
const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true});
const page=await context.newPage();
const cdp=await context.newCDPSession(page),points=new Map();
async function touchPoint(id,x,y,type){if(type==='touchEnd'||type==='touchCancel')points.delete(id);else points.set(id,{id,x,y});await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[{id,x,y}]:[...points.values()]});}
async function controlPoint(id,selector,down){const b=await page.locator(selector).boundingBox();await touchPoint(id,b.x+b.width/2,b.y+b.height/2,down?'touchStart':'touchEnd');}
async function directionDown(dir){if(touchMode)await controlPoint(1,'#'+dir,true);else await page.keyboard.down(dir==='right'?'ArrowRight':'ArrowLeft');}
async function directionUp(dir){if(touchMode)await controlPoint(1,'#'+dir,false);else await page.keyboard.up(dir==='right'?'ArrowRight':'ArrowLeft');}
async function hop(){if(touchMode){await controlPoint(2,'#jump',true);await controlPoint(2,'#jump',false);}else await page.keyboard.press('Space');}
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const root=new URL('.',import.meta.url);await mkdir(new URL('evidence/',root),{recursive:true});
const snap=()=>page.evaluate(()=>window.__wulong.snapshot());
const wait=fn=>page.waitForFunction(fn,null,{timeout:12000});
async function walk(x){const start=(await snap()).state.p.x,dir=start<x?'right':'left';if(!touchMode)await page.locator('#canvas').focus();await directionDown(dir);await page.waitForFunction(({x,start})=>{const p=window.__wulong.snapshot().state.p;return window.__wulong.snapshot().state.won || (start<x?p.x>=x:p.x<=x);},{x,start},{timeout:8000});await directionUp(dir);}
const click=id=>touchMode?page.locator(`[data-zone="${id}"]`).tap():page.locator(`[data-zone="${id}"]`).click();
async function drag(id,x,y){const z=(await snap()).zones.find(z=>z.id===id);assert(z,`zone ${id}`);const b=await page.locator('canvas').boundingBox(),sx=b.x+(z.x+z.w/2)*b.width/480,sy=b.y+(z.y+z.h/2)*b.height/520,ex=b.x+x*b.width/480,ey=b.y+y*b.height/520;if(touchMode){await touchPoint(3,sx,sy,'touchStart');for(let i=1;i<=12;i++)await touchPoint(3,sx+(ex-sx)*i/12,sy+(ey-sy)*i/12,'touchMove');await touchPoint(3,ex,ey,'touchEnd');}else{await page.mouse.move(sx,sy);await page.mouse.down();await page.mouse.move(ex,ey,{steps:12});await page.mouse.up();}await page.evaluate(()=>new Promise(requestAnimationFrame));}
async function shot(name){await page.screenshot({path:fileURLToPath(new URL(`evidence/${touchMode?'touch-':''}${name}.png`,root)),fullPage:true});}
const cases={
  19:async()=>{await wait(()=>window.__wulong.snapshot().state.heard>=3);await click('encore');assert.equal((await snap()).state.won,false);await click('bird1');await wait(()=>window.__wulong.snapshot().state.echoes.length===0);await wait(()=>window.__wulong.snapshot().state.curtain>0);await shot('19-curtain');},
  20:async()=>{await walk(207);await wait(()=>window.__wulong.snapshot().state.fallen>0);await drag('city-fold',194,407);assert.equal((await snap()).state.fold,1);assert.equal((await snap()).state.won,false);await walk(265);},
  14:async()=>{await click('talk');await click('brief');await click('talk');await click('detail');await wait(()=>window.__wulong.snapshot().state.growth===4);await walk(119);for(const [x,y] of [[180,389],[249,341],[316,293],[382,245],[439,210]]){await directionDown('right');await hop();await page.waitForFunction(x=>window.__wulong.snapshot().state.p.x>=x||window.__wulong.snapshot().state.won,x);await directionUp('right');await page.waitForFunction(y=>{let s=window.__wulong.snapshot().state;return s.won||(s.p.grounded&&s.p.y===y);},y);}},
  15:async()=>{await walk(130);await drag('map-person',290,171);assert((await snap()).state.p.x<150);await drag('map-person',340,214);},
  16:async()=>{await click('shutter');await wait(()=>window.__wulong.snapshot().state.failedPhoto);await click('flash');await click('shutter');await wait(()=>window.__wulong.snapshot().state.goodPhoto);await shot('16-photo-comparison');},
  17:async()=>{await click('counter-enter');assert.equal((await snap()).state.entered,false);await click('brake');await click('counter-enter');for(let i=0;i<3;i++){await walk([233,321,411][i]);await page.waitForFunction(i=>window.__wulong.snapshot().state.stamped[i],i);} },
  6:async()=>{await drag('grass',319,393);await wait(()=>window.__wulong.snapshot().state.aligned);assert((await snap()).state.carsStop);await walk(425);},
  7:async()=>{await walk(190);await drag('mountain',294,270);assert((await snap()).state.lift>105);await walk(427);},
  10:async()=>{await drag('donut',236,275);assert.equal((await snap()).state.installed,false);await drag('donut',383,418);},
  12:async()=>{await click('mailbox');await drag('house-flip',245,212);await wait(()=>window.__wulong.snapshot().state.flip===1);assert.equal((await snap()).state.won,false);await walk(320);await click('mailbox');},
  1:async()=>{await walk(242);assert((await snap()).state.doorX>338);await walk(220);await wait(()=>window.__wulong.snapshot().state.opened);await walk((await snap()).state.doorX);},
  3:async()=>{await walk(113);await click('dog');await walk(292);assert((await snap()).state.failed);await drag('grab-person',218,365);assert((await snap()).state.dogCarry);await walk(425);},
  4:async()=>{await walk(301);await walk(65);await wait(()=>window.__wulong.snapshot().state.hidden);await walk(430);},
  5:async()=>{await walk(225);await drag('road',411,451);await wait(()=>window.__wulong.snapshot().state.stopped);await walk((await snap()).state.busX+17);},
  18:async()=>{await click('gallery-door');await walk(252);await wait(()=>window.__wulong.snapshot().state.inPainting);assert.equal((await snap()).state.won,false);await walk(143);await directionDown('right');await hop();await page.waitForFunction(()=>window.__wulong.snapshot().state.p.x>225);await directionUp('right');await wait(()=>window.__wulong.snapshot().state.transferred);await shot('18-second-frame');await walk(288);await directionDown('right');await hop();await page.waitForFunction(()=>window.__wulong.snapshot().state.p.x>366);await directionUp('right');await wait(()=>{let p=window.__wulong.snapshot().state.p;return p.grounded&&p.y===312;});await walk(425);},
  13:async()=>{await click('memory-prev');await drag('past-key',105,395);assert.equal((await snap()).state.keyAway,false);await click('memory-open');await drag('past-key',105,395);await wait(()=>window.__wulong.snapshot().state.keyAway);await shot('13-causality');},
  11:async()=>{await click('clap');await wait(()=>{let s=window.__wulong.snapshot().state;return s.heard===1&&s.echoes.length===0;});await wait(()=>window.__wulong.snapshot().state.light===0);await click('bird1');await click('clap');await wait(()=>window.__wulong.snapshot().state.heard>=5);await shot('11-loop');await click('bird1');await wait(()=>window.__wulong.snapshot().state.echoes.length===0);await wait(()=>window.__wulong.snapshot().state.light===0);await click('bird1');await click('clap');await walk(425);},
  9:async()=>{await click('coin');assert.equal((await snap()).state.flight,false);await walk(174);await click('coin');await wait(()=>window.__wulong.snapshot().state.flight);await shot('09-flight');await wait(()=>window.__wulong.snapshot().state.landed);assert.equal((await snap()).state.p.y,237);await walk(410);},
  8:async()=>{await click('meal');await walk(200);await directionDown('right');await wait(()=>window.__wulong.snapshot().state.blocked);await directionUp('right');assert.equal((await snap()).state.won,false);await drag('wall',454,320);assert((await snap()).state.wall>423);await walk(395);await click('diner');},
  2:async()=>{await walk(215);await click('lift');await wait(()=>{let s=window.__wulong.snapshot().state;return s.rider&&s.liftMode==='idle';});assert.equal((await snap()).state.won,false);await shot('02-fear');await drag('curtain',447,242);await click('lift');await wait(()=>window.__wulong.snapshot().state.liftMode==='arrived');assert.equal((await snap()).state.p.y,252);await shot('02-arrived');await walk(370);},
};
const report=[];
try {
 for(const id of process.argv.slice(2).length?process.argv.slice(2).map(Number):Object.keys(cases).map(Number)){
   const url=new URL(baseURL);url.searchParams.set('dev','1');url.searchParams.set('level',id);
   await page.goto(url.href);await page.waitForFunction(()=>!!window.__wulong);await cases[id]();await wait(()=>window.__wulong.snapshot().state.won);await wait(()=>window.__wulong.snapshot().modal);await shot(String(id).padStart(2,'0')+'-complete');
   if(process.env.FLOW==='1'){await page.locator('#next').click();if(id<20){assert.equal((await snap()).state.id,id+1);await page.locator('#menu').click();}await page.locator(`[data-level="${id}"]`).click();}else await page.locator('#again').click();
   assert.equal((await snap()).state.won,false);for(let r=0;r<2;r++)await page.locator('#retry').click();assert.equal((await snap()).state.won,false);
   report.push({level:id,result:'PASS',input:touchMode?'CDP touch input, bottom controls, at most two pointers':'browser keyboard and mouse',reset:process.env.FLOW==='1'?'next level transition, menu revisit, two retries':'replay and two retries',state:(await snap()).state});console.log(`PASS L${id} ${touchMode?'touch':'keyboard'}`);
 }
 assert.deepEqual(errors,[]);await writeFile(new URL(`evidence/${touchMode?'touch-':''}results.json`,root),JSON.stringify({date:new Date().toISOString(),viewport:`${width}x844`,errors,report},null,2));
}catch(e){await shot('failure');console.error(JSON.stringify(await snap()));throw e;}
finally{await browser.close();}
