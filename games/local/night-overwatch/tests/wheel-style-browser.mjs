import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
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
try{
 for(const [width,height]of [[568,320],[844,390],[1280,720]]){
  const touch=width<1000,context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/game-bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:fixture}));await page.route('**/api/competition/**',r=>r.abort());
  await page.goto(base+'?dev=0');await page.waitForFunction(()=>globalThis.__night?.snapshot().progression.assets&&!document.getElementById('night-startup'));
  const click=async id=>{await press(page,id,touch,false);await settleVisuals(page);};
  const shot=async name=>{const s=await snapshot(page);assertLayout({...s,buttons:s.buttons.filter(b=>!b.disabled)},s.ui.width,s.ui.height);await page.screenshot({path:fileURLToPath(new URL(`${name}-${width}.png`,out))});};
  const wheel=()=>page.evaluate(async()=>{const {director,Label,UITransform,UIOpacity}=await System.import('cc');const nodes=[];const walk=n=>{nodes.push(n);n.children.forEach(walk);};walk(director.getScene());const disk=nodes.find(n=>n.name==='LuckyWheel'&&n.activeInHierarchy),halo=nodes.find(n=>n.name==='WheelHalo'&&n.activeInHierarchy),labels=director.getScene().getComponentsInChildren(Label).filter(l=>l.node.activeInHierarchy),count=labels.find(l=>l.string.includes('剩余次数')),box=n=>{const r=n.getComponent(UITransform).getBoundingBoxToWorld();return{x:r.x,y:r.y,w:r.width,h:r.height};};return{angle:disk.angle,sectors:disk.children.filter(n=>n.name.startsWith('WheelSector:')).length,box:box(disk),prizes:disk.getComponentsInChildren(Label).map(l=>l.string),halo:halo.getComponent(UIOpacity).opacity,count:count.string,countBox:box(count.node),flash:nodes.some(n=>n.name==='WheelPress'&&n.activeInHierarchy)};});
  await click('qm:supply');await shot('idle');let state=await wheel();assert.deepEqual(state.prizes,[]);assert.equal(state.sectors,12);assert(state.count.includes('剩余次数 2'));const opacity=state.halo;await page.waitForTimeout(230);assert.notEqual((await wheel()).halo,opacity);
  assert(!(state.box.x<state.countBox.x+state.countBox.w&&state.box.x+state.box.w>state.countBox.x&&state.box.y<state.countBox.y+state.countBox.h&&state.box.y+state.box.h>state.countBox.y),'wheel clears spin count');
  for(const index of [1,5]){
   await click('qm:wheelTap');await page.waitForTimeout(600);state=await wheel();assert(state.angle>0);assert.deepEqual(state.prizes,[]);assert.equal((await snapshot(page)).progression.gift,undefined);await shot('spinning-'+index);
   if(index===5)await click('qm:wheelSkip');
   await page.waitForFunction(()=>__night.snapshot().progression.gift,null,{timeout:10000});const gift=(await snapshot(page)).progression.gift;assert(gift.drops.some(d=>d.item=== (index===1?'fragment:weapon':'drone-24h')));await shot('reward-'+index);
   await click('qm:giftClose');state=await wheel();assert(Math.abs(((15+index*60-state.angle)%360+360)%360)<.1);await shot('landed-'+index);
  }
  await click('qm:wheelTap');assert.match((await snapshot(page)).progression.message[0],/视频/);assert.equal((await snapshot(page)).progression.assets.wheelTickets,0);await shot('no-ticket');
  await click('info:wheel');const texts=await page.evaluate(async()=>{const{director,Label}=await System.import('cc');return director.getScene().getComponentsInChildren(Label).filter(l=>l.node.activeInHierarchy).map(l=>l.string);});assert(texts.some(t=>t.includes('28%')));assert(texts.some(t=>t.includes('24小时')));await click('qm:infoClose');assert.deepEqual(errors,[]);await context.close();
 }
}finally{await browser.close();}
console.log('Text-free wheel, idle pulse, two combined prizes, exact landing, no-ticket prompt and odds dialog passed at three sizes.');
