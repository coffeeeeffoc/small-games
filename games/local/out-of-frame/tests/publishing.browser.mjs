import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=new URL('../test-results/publishing/',import.meta.url);await mkdir(output,{recursive:true});
const base=process.env.GAME_URL??'http://127.0.0.1:4657/';
const server=process.env.GAME_URL?null:spawn(process.execPath,['server.mjs','--dist','--port','4657'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??process.env.PLAYWRIGHT_EXECUTABLE_PATH??'/usr/bin/chromium',args:['--no-sandbox']});
const errors=[],checks=[];let lastPage;
const snap=p=>p.evaluate(()=>window.__outOfFrameSnapshot());
const advance=(p,n=50)=>p.clock.runFor(n);
async function ready(){for(let i=0;i<100;i++){try{if((await fetch(base)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('server not ready');}
async function open(context,url){const p=await context.newPage();lastPage=p;p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.__copied=value;}}});});await p.clock.install({time:new Date('2026-10-11T00:00:00Z')});await p.clock.pauseAt(new Date('2026-10-11T00:00:01Z'));await p.goto(url);await p.waitForFunction(()=>window.__outOfFrameSnapshot);await advance(p,100);return p;}
async function point(p,x,y){return p.locator('#board').evaluate((c,{x,y})=>{const b=c.getBoundingClientRect();return document.documentElement.dataset.rotated==='true'?{x:b.right-y/540*b.width,y:b.top+x/960*b.height}:{x:b.left+x/960*b.width,y:b.top+y/540*b.height};},{x,y});}
async function contacts(p){const c=await p.context().newCDPSession(p),points=new Map();return{async down(id,q){points.set(id,{id,...q});await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[...points.values()]});},async move(id,q){points.set(id,{id,...q});await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[...points.values()]});},async up(id){points.delete(id);await c.send('Input.dispatchTouchEvent',{type:points.size?'touchMove':'touchEnd',touchPoints:[...points.values()]});},async cancel(){points.clear();await c.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});},async button(id,selector){const b=await p.locator(selector).boundingBox();await this.down(id,{x:b.x+b.width/2,y:b.y+b.height/2});}};}
async function until(p,fn){for(let i=0;i<500;i++){const s=(await snap(p)).state;if(fn(s))return;assert.notEqual(s.status,'lost');await advance(p);}throw Error('game condition timed out');}
async function solve(p,touch){const t=touch?await contacts(p):null;
 await until(p,s=>s.objects[0].x>=354);
 const f=(await snap(p)).state.frame,a=await point(p,f.x+f.w/2,f.y+f.h/2),b=await point(p,f.w/2,f.h/2);
 if(t){await t.down(9,a);await t.move(9,b);await t.up(9);}else{await p.mouse.move(a.x,a.y);await p.mouse.down();await p.mouse.move(b.x,b.y,{steps:5});await p.mouse.up();}await advance(p,20);
 assert.equal((await snap(p)).state.objects[0].active,false);
 if(t)await t.button(1,'#move-right');else await p.keyboard.down('ArrowRight');
 await until(p,s=>s.player.x>=286);
 if(t)await t.button(2,'#jump');else await p.keyboard.down('Space');await advance(p,49/60*1000);
 if(t)await t.up(2);else await p.keyboard.up('Space');await until(p,s=>s.status==='won');
 if(t)await t.up(1);else await p.keyboard.up('ArrowRight');await advance(p,100);
}
try{await ready();
 const desktop=await browser.newContext({viewport:{width:1280,height:800}}),p=await open(desktop,base+'?dev=1');
 await p.locator('#intro [data-game-fullscreen]').click();await p.waitForFunction(()=>!!document.fullscreenElement);await p.locator('#intro [data-game-fullscreen]').click();await p.waitForFunction(()=>!document.fullscreenElement);await advance(p,100);checks.push('standalone enter/exit fullscreen');
 await p.locator('#start-button').click();await advance(p,100);await p.locator('#pause').click();const paused=await snap(p);await advance(p,500);assert.equal((await snap(p)).state.time,paused.state.time);await p.locator('#resume').click();
 await solve(p,false);assert.equal(await p.locator('[data-game-ad]').count(),0);await p.screenshot({path:fileURLToPath(new URL('desktop-result.png',output))});await p.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});checks.push('BFCache restore preserves publishing adapter');await p.locator('#share-challenge').click();await advance(p,30);await expect.poll(()=>p.evaluate(()=>window.__copied)).toEqual(expect.any(String));const shared=await p.evaluate(()=>window.__copied);assert.ok(shared.includes('challenge=frame-v1'));assert.ok(!shared.includes('dev='));checks.push('desktop solve, pause, public challenge URL');
 const saved=await desktop.storageState();
 if (process.env.PUBLISHING_DESKTOP_ONLY !== '1') {
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:saved});const m=await open(mobile,shared);const before=await m.evaluate(()=>JSON.stringify({...localStorage}));assert.equal((await snap(m)).challenge,true);assert.equal(await m.evaluate(()=>document.documentElement.dataset.rotated),'true');await m.screenshot({path:fileURLToPath(new URL('phone-home.png',output))});
 await m.locator('#start-button').tap();await advance(m,100);const t=await contacts(m);await t.button(1,'#move-right');await advance(m,100);await t.cancel();await advance(m,100);const stopped=(await snap(m)).state.player.x;await advance(m,150);assert.equal((await snap(m)).state.player.x,stopped);await m.locator('#touch-restart').tap();await advance(m,30);
 await m.screenshot({path:fileURLToPath(new URL('phone-play.png',output))});await solve(m,true);assert.equal(await m.evaluate(()=>JSON.stringify({...localStorage})),before);await m.screenshot({path:fileURLToPath(new URL('phone-result.png',output))});checks.push('rotated phone touch solve, cancel, challenge save isolation');
 await m.locator('#result-retry').tap();await advance(m,30);await m.setViewportSize({width:844,height:390});await advance(m,100);assert.equal(await m.evaluate(()=>document.documentElement.dataset.rotated),'false');await solve(m,true);assert.equal(await m.locator('[data-game-ad]').count(),0);
 await m.locator('#result-retry').tap();await advance(m,30);await solve(m,true);assert.equal(await m.locator('[data-game-ad]').count(),1);await m.getByRole('button',{name:'关闭并继续'}).tap();assert.equal((await snap(m)).state.status,'won');assert.equal(await m.evaluate(()=>JSON.stringify({...localStorage})),before);checks.push('physical landscape, third-result ad frequency and dismiss');
 await m.locator('#result-home').tap();await m.locator('#exit-challenge').tap();assert.equal((await snap(m)).challenge,false);checks.push('return to normal progress');}
 assert.deepEqual(errors,[]);
 await writeFile(new URL(process.env.PUBLISHING_DESKTOP_ONLY==='1'?'desktop-report.json':'report.json',output),JSON.stringify({checks,errors},null,2));console.log(checks.join('\n'));
}catch(error){await lastPage?.screenshot({path:fileURLToPath(new URL('failure.png',output))});throw error;}finally{await browser.close();server?.kill();}
