import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {acceptanceBuild,snapshot,press,settleVisuals,navigateMap,aimAt} from './flight-browser.mjs';

// New QA guests only. Real deployed HTTP and normal pointer/touch input; no battle writes.
const base=process.env.NIGHT_URL,out=new URL('../reports/garrison-live/',import.meta.url);
await mkdir(out,{recursive:true});
const evidence={build:await acceptanceBuild(base),environment:'Real local test Runtime via Sakura HTTPS; fresh guests; normal input; no simulation or asset injection',checks:[],samples:[],errors:[]};
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const actors=[];
const click=(actor,id)=>press(actor.page,id,actor.touch,false);
async function make(width,height){
 const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000}),page=await context.newPage(),actor={page,context,width,height,touch:width<1000};actors.push(actor);
 page.setDefaultTimeout(45000);page.on('pageerror',e=>evidence.errors.push(e.message));
 await context.addInitScript(()=>localStorage.setItem('night-overwatch-coach-v2','done'));
 await page.goto(base+'?dev=0');await page.waitForFunction(()=>globalThis.__night?.snapshot().progression.assets?.economy?.version==='night-rewards-v3'&&!document.getElementById('night-startup'));
 return actor;
}
async function sample(actor,label){
 await actor.page.bringToFront();await settleVisuals(actor.page);
 const frames=await actor.page.evaluate(()=>new Promise(resolve=>{const rows=[],start=performance.now();function next(){const s=__night.snapshot();rows.push({fps:s.frameRate,drawCalls:s.drawCalls,triangles:s.triangles,time:s.time,units:s.units.length});if(performance.now()-start<5000)requestAnimationFrame(next);else resolve(rows);}requestAnimationFrame(next);}));
 const fps=frames.map(f=>f.fps).filter(f=>f>0).sort((a,b)=>a-b);
 evidence.samples.push({label,width:actor.width,height:actor.height,fpsP10:fps[Math.floor(fps.length*.1)],fpsMedian:fps[Math.floor(fps.length/2)],first:frames[0],last:frames.at(-1)});
 await actor.page.screenshot({path:fileURLToPath(new URL(label+'.png',out))});
}
async function shoot(actor,torso=false){
 const {page,touch}=actor;await page.bringToFront();await click(actor,'weapon0');
 const before=await snapshot(page),target=before.units.find(u=>!u.friendly&&u.hp>0&&u.kind==='infantry');assert(target);
 await navigateMap(page,target,touch);await aimAt(page,target,touch);
 if(torso){const p=await page.evaluate(u=>__night.screenPoint({...u,y:u.y+.4}),target);await page.mouse.move(p.x,p.y);}
 if(touch){const b=(await snapshot(page)).buttons.find(b=>b.id==='fire');assert(b);const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.w/2,y:b.y+b.h/2}]});await page.waitForTimeout(450);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
 else{await page.keyboard.down('Space');await page.waitForTimeout(450);await page.keyboard.up('Space');}
 await page.waitForFunction(id=>__night.snapshot().units.find(u=>u.id===id)?.hp<=0,target.id,{timeout:10000});
 const after=await snapshot(page),hit=after.units.find(u=>u.id===target.id);assert(after.fired>before.fired);assert.equal(hit.hp,0);
 evidence.checks.push({mode:before.online.active?'duel':'solo',width:actor.width,touch,torso,target:target.id,hpBefore:target.hp,hpAfter:hit.hp,fired:after.fired-before.fired});return target.id;
}
async function leave(actor){const s=await snapshot(actor.page);if(s.phase==='playing'){await click(actor,'settings');await click(actor,'home');await click(actor,'exitConfirm');}else if(s.online.room)await click(actor,'online:leave');}
try{
 const a=await make(1280,720),b=await make(568,320);
 for(const actor of [a,b]){for(const id of ['qm:modes','mode:solo','mode:enter','start'])await click(actor,id);await actor.page.waitForFunction(()=>__night.snapshot().phase==='playing'&&!__night.snapshot().modal);assert.equal((await snapshot(actor.page)).units.filter(u=>!u.friendly&&u.kind==='infantry').length,12);await shoot(actor,!actor.touch);await sample(actor,'solo-'+actor.width);await leave(actor);}
 for(const actor of [a,b]){await click(actor,'online:menu');await actor.page.waitForFunction(()=>__night.snapshot().online.panel==='menu');}
 await click(a,'online:friend');await click(a,'online:createConfirm');await a.page.waitForFunction(()=>__night.snapshot().online.room?.status==='waiting');
 const code=(await snapshot(a.page)).online.room.code;
 await b.page.waitForFunction(code=>__night.snapshot().buttons.some(b=>b.id==='online:joinCode:'+code),code);await click(b,'online:joinCode:'+code);
 await a.page.waitForFunction(()=>__night.snapshot().online.room?.players.length===2);await click(a,'online:ready');await click(b,'online:ready');
 for(const actor of [a,b]){await actor.page.waitForFunction(()=>__night.snapshot().online.active&&!__night.snapshot().modal);const s=await snapshot(actor.page);assert.equal(s.units.length,64);for(const friendly of [false,true])assert.equal(s.units.filter(u=>u.friendly===friendly&&u.kind==='infantry').length,24);}
 for(const [actor,other] of [[a,b],[b,a]]){const id=await shoot(actor,!actor.touch);await other.page.waitForFunction(id=>__night.snapshot().units.find(u=>u.id===id)?.hp===0,id);await sample(actor,'duel-'+actor.width);}
 assert.deepEqual(evidence.errors,[]);console.log(JSON.stringify({checks:evidence.checks,samples:evidence.samples}));
}catch(error){evidence.failure=String(error);for(const actor of actors){await actor.page.screenshot({path:fileURLToPath(new URL('failure-'+actor.width+'.png',out))}).catch(()=>{});evidence.last=await snapshot(actor.page).catch(()=>null);}throw error;}
finally{for(const actor of actors)try{await leave(actor);}catch{}await browser.close();await writeFile(new URL('evidence.json',out),JSON.stringify(evidence,null,2));}
