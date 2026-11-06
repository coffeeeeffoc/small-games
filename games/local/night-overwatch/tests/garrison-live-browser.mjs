import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {acceptanceBuild,snapshot,press,settleVisuals,navigateMap,aimAt} from './flight-browser.mjs';
import {MAP} from '../assets/scripts/core/Data.ts';

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
 const frames=await actor.page.evaluate(()=>new Promise(resolve=>{const rows=[],start=performance.now();function next(){const s=__night.snapshot(),authority=s.online.active?s.online.room?.state?.simulation?.aim:null;rows.push({fps:s.frameRate,drawCalls:s.drawCalls,triangles:s.triangles,time:s.time,units:s.units.length,aimError:authority?Math.hypot(s.aim.x-authority.x,s.aim.z-authority.z):0});if(performance.now()-start<5000)requestAnimationFrame(next);else resolve(rows);}requestAnimationFrame(next);}));
 const fps=frames.map(f=>f.fps).filter(f=>f>0).sort((a,b)=>a-b);
 const aimErrors=frames.map(f=>f.aimError).sort((a,b)=>a-b),aimErrorP90=aimErrors[Math.floor(aimErrors.length*.9)];assert(aimErrorP90<3,'Server aim follows flight-stabilized reticle without pointer movement');
 evidence.samples.push({label,width:actor.width,height:actor.height,fpsP10:fps[Math.floor(fps.length*.1)],fpsMedian:fps[Math.floor(fps.length/2)],aimErrorP90,first:frames[0],last:frames.at(-1)});
 await actor.page.screenshot({path:fileURLToPath(new URL(label+'.png',out))});
}
async function shoot(actor,torso=false){
 const {page,touch}=actor;await page.bringToFront();await click(actor,'weapon0');
 const before=await snapshot(page);
 for(let i=0;i<3;i++)await press(page,'lensIn',touch);
 while((await snapshot(page)).modal.startsWith('settings'))await click(actor,'close');
 const target=await page.evaluate(async()=>{const {director}=await System.import('cc'),g=director.getScene().getComponentsInChildren('Overwatch')[0];return g.sim.units.find(u=>{if(u.friendly||u.hp<=0||u.kind!=='infantry')return false;const p=g.world.project(u,0,true),hit=g.world.aimAt(p.x,p.y);return hit&&Math.hypot(hit.x-u.x,hit.z-u.z)<.2;});});assert(target,'A visible infantry target; terrain occlusion is preserved');
 if(before.online.active){const map=(await snapshot(page)).ui.minimap,p={x:map.x+8+(target.x+MAP.halfWidth)/(2*MAP.halfWidth)*(map.w-16),y:map.y+25+(target.z+MAP.halfDepth)/(2*MAP.halfDepth)*(map.h-33)};if(touch)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);await settleVisuals(page);const center=(await snapshot(page)).camera.center;assert(Math.hypot(center.x-target.x,center.z-target.z)<4);}
 else await navigateMap(page,target,touch);
 await aimAt(page,target,touch);
 if(torso){const p=await page.evaluate(async u=>{const {director,view}=await System.import('cc'),g=director.getScene().getComponentsInChildren('Overwatch')[0],p=g.world.project(u,.4,true);return {x:p.x/view.getScaleX(),y:g.hud.h-p.y/view.getScaleY()};},target);await page.mouse.move(p.x,p.y);}
 if(touch){const b=(await snapshot(page)).buttons.find(b=>b.id==='fire');assert(b);const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.w/2,y:b.y+b.h/2}]});await page.waitForTimeout(450);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
 else{await page.keyboard.down('Space');await page.waitForTimeout(450);await page.keyboard.up('Space');}
 try{await page.waitForFunction(id=>__night.snapshot().units.find(u=>u.id===id)?.hp<=0,target.id,{timeout:10000});}catch(error){const s=await snapshot(page);evidence.shotFailure={target:s.units.find(u=>u.id===target.id),aim:s.aim,aircraft:s.aircraft,fired:s.fired,shots:s.shots,events:s.events};throw error;}
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
