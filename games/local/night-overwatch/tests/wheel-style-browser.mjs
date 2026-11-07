import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assetFixture } from './progression-fixture.ts';
import { ECONOMY } from '../assets/scripts/core/Progression.ts';
import { acceptanceBuild, snapshot, assertLayout } from './flight-browser.mjs';
import { press, settleVisuals } from './visual-helpers.mjs';
const base=process.env.NIGHT_URL;await acceptanceBuild(base);
const out=new URL('../reports/2026-11-07-wheel/',import.meta.url);await mkdir(out,{recursive:true});
const assets=assetFixture();assets.wheelTickets=2;assets.economy=ECONOMY;
const fixture=`const assets=${JSON.stringify(assets)};let count=0;const metadata={identity:{playerId:assets.playerId,nickname:'夜航07'},capabilities:{multiplayer:false,leaderboards:false}};globalThis.SmallGamesServices={ready:Promise.resolve(metadata),refresh:async()=>metadata,services:{nightAssets:async()=>structuredClone(assets),nightAssetCommand:async c=>{if(c.kind==='wheel-spin'){const prizeIndex=count++?5:1;assets.wheelTickets--;assets.lastReceipt=prizeIndex===1?{prizeIndex,packs:{'pack:general:0':2},items:{'fragment:weapon':2}}:{prizeIndex,packs:{'pack:general:3':1},items:{'drone-24h':1}};}else throw Error('Unexpected command '+c.kind);assets.revision++;return structuredClone(assets);},leaderboard:async()=>({top:[],me:null})},createRecorder:()=>({start:async()=>null,record(){},finish:async()=>null,invalidate(){}})};`;
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
const evidence=[];
try{
 for(const [width,height,reducedMotion]of [[568,320,'no-preference'],[844,390,'no-preference'],[1280,720,'no-preference'],[568,320,'reduce']]){
  const touch=width<1000,context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,reducedMotion}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/game-bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:fixture}));await page.route('**/api/competition/**',r=>r.abort());
  await page.goto(base+'?dev=0');await page.waitForFunction(()=>globalThis.__night?.snapshot().progression.assets&&!document.getElementById('night-startup'));
  const click=async id=>{await press(page,id,touch,false);await settleVisuals(page);};
  const shot=async name=>{const s=await snapshot(page);assertLayout({...s,buttons:s.buttons.filter(b=>!b.disabled)},s.ui.width,s.ui.height);await page.screenshot({path:fileURLToPath(new URL(`${name}-${width}-${reducedMotion}.png`,out))});};
  const wheel=()=>page.evaluate(async()=>{const {director,Label,UITransform,UIOpacity}=await System.import('cc');const nodes=[];const walk=n=>{nodes.push(n);n.children.forEach(walk);};walk(director.getScene());const disk=nodes.find(n=>n.name==='LuckyWheel'&&n.activeInHierarchy),halo=nodes.find(n=>n.name==='WheelHalo'&&n.activeInHierarchy),labels=director.getScene().getComponentsInChildren(Label).filter(l=>l.node.activeInHierarchy),count=labels.find(l=>l.string.includes('剩余次数')),box=n=>{const r=n.getComponent(UITransform).getBoundingBoxToWorld();return{x:r.x,y:r.y,w:r.width,h:r.height};};return{angle:disk.angle,sectors:disk.children.filter(n=>n.name.startsWith('WheelSector:')).length,box:box(disk),prizes:disk.getComponentsInChildren(Label).map(l=>l.string),halo:halo.getComponent(UIOpacity).opacity,count:count.string,countBox:box(count.node),flash:nodes.some(n=>n.name==='WheelPress'&&n.activeInHierarchy)};});
  await click('qm:supply');await shot('idle');let state=await wheel();assert.deepEqual(state.prizes,[]);assert.equal(state.sectors,12);assert(state.count.includes('剩余次数 2'));const opacity=state.halo;await page.waitForTimeout(230);assert.notEqual((await wheel()).halo,opacity);
  assert(!(state.box.x<state.countBox.x+state.countBox.w&&state.box.x+state.box.w>state.countBox.x&&state.box.y<state.countBox.y+state.countBox.h&&state.box.y+state.box.h>state.countBox.y),'wheel clears spin count');
  const rim=await page.evaluate(()=>{const s=__night.snapshot(),b=s.buttons.find(b=>b.id==='qm:wheelTap'),r=document.querySelector('canvas').getBoundingClientRect();return{x:r.left+(b.x+b.w*.96)/s.ui.width*r.width,y:r.top+(b.y+b.h*.5)/s.ui.height*r.height};});
  if(touch)await page.touchscreen.tap(rim.x,rim.y);else await page.mouse.click(rim.x,rim.y);
  await page.waitForTimeout(65);const nudge=await wheel();assert(Math.abs(nudge.angle)>.1,'rim click rocks the wheel');await shot('nudge');
  await page.waitForTimeout(700);assert(Math.abs((await wheel()).angle)<.01);assert.equal((await snapshot(page)).progression.assets.wheelTickets,2);assert.equal((await snapshot(page)).progression.gift,undefined);
  const idle=[];for(let i=0;i<5;i++){idle.push((await wheel()).halo);await page.waitForTimeout(600);}assert(Math.max(...idle)-Math.min(...idle)>30,'halo keeps pulsing across cycles');
  const spins=[];
  for(const index of [1,5]){
   const started=Date.now();await click('qm:wheelTap');const angles=[];for(let i=0;i<3;i++){await page.waitForTimeout(250);state=await wheel();angles.push(state.angle);assert.deepEqual(state.prizes,[]);assert.equal((await snapshot(page)).progression.gift,undefined,'reward stays hidden while turning');}assert(angles[1]>angles[0]&&angles[2]>angles[1],'wheel moves across rendered frames');await shot('spinning-'+index);
   if(index===5)await click('qm:wheelSkip');
   await page.waitForFunction(()=>__night.snapshot().progression.gift,null,{timeout:10000});const duration=Date.now()-started;if(index===1)assert(duration>=4800,'natural reveal waits for the full animation');spins.push({index,angles,duration,skipped:index===5});const gift=(await snapshot(page)).progression.gift;assert(gift.drops.some(d=>d.item=== (index===1?'fragment:weapon':'drone-24h')));await shot('reward-'+index);
   await click('qm:giftClose');state=await wheel();assert(Math.abs(((15+index*60-state.angle)%360+360)%360)<.1);await shot('landed-'+index);
  }
  const emptyClicks=[];
  for(const id of ['qm:wheelTap','qm:wheelSpin']){
   const rest=(await wheel()).angle,point=await page.evaluate(id=>{const s=__night.snapshot(),b=s.buttons.find(b=>b.id===id),r=document.querySelector('canvas').getBoundingClientRect();return{x:r.left+(b.x+b.w*.5)/s.ui.width*r.width,y:r.top+(b.y+b.h*.5)/s.ui.height*r.height};},id);
   if(touch)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
   const angles=[];
   for(let i=0;i<8;i++){angles.push((await wheel()).angle-rest);await page.waitForTimeout(80);}
   assert(Math.max(...angles)>1&&Math.min(...angles)<-1,`empty-ticket click rotates and swings back: ${width} ${reducedMotion} ${id} ${angles}`);await page.waitForTimeout(150);assert(Math.abs((await wheel()).angle-rest)<.01,'empty-ticket click restores the original angle');
   const s=await snapshot(page);assert.match(s.progression.message[0],/视频/);assert.equal(s.progression.assets.wheelTickets,0);assert.equal(s.progression.gift,undefined);emptyClicks.push({id,angles});
  }
  await shot('no-ticket');
  await click('info:wheel');const texts=await page.evaluate(async()=>{const{director,Label}=await System.import('cc');return director.getScene().getComponentsInChildren(Label).filter(l=>l.node.activeInHierarchy).map(l=>l.string);});assert(texts.some(t=>t.includes('28%')));assert(texts.some(t=>t.includes('24小时')));await click('qm:infoClose');assert.deepEqual(errors,[]);evidence.push({width,height,reducedMotion,nudgeAngle:nudge.angle,idle,spins,emptyClicks,errors});await context.close();
 }
}finally{await browser.close();}
await writeFile(new URL('motion.json',out),JSON.stringify({sourceHash:process.env.NIGHT_EXPECTED_SOURCE_HASH,scenarios:evidence},null,2)+'\n');
console.log('Wheel rotation before reward, gentle reduced motion, continuous halo, rim nudge without spending, exact landing and no-ticket feedback passed at three sizes.');
