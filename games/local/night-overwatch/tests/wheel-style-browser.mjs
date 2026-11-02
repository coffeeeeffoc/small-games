import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assetFixture } from './progression-fixture.ts';
import { acceptanceBuild, snapshot, assertLayout } from './flight-browser.mjs';
import { press, settleVisuals } from './visual-helpers.mjs';

const base=process.env.NIGHT_URL;
await acceptanceBuild(base);
const out=new URL('../reports/2026-11-02-wheel/',import.meta.url);await mkdir(out,{recursive:true});
const assets=assetFixture();assets.wheelTickets=2;
const fixture=`const assets=${JSON.stringify(assets)};let count=0;const metadata={identity:{playerId:assets.playerId,nickname:'夜航07'},capabilities:{multiplayer:false,leaderboards:false}};globalThis.SmallGamesServices={ready:Promise.resolve(metadata),refresh:async()=>metadata,services:{nightAssets:async()=>structuredClone(assets),nightAssetCommand:async c=>{if(c.kind==='wheel-spin'){const prizeIndex=count++?4:1;assets.wheelTickets--;assets.lastReceipt=prizeIndex===1?{prizeIndex,coins:80}:{prizeIndex,packs:{'pack:general:2':1}};}assets.revision++;return structuredClone(assets);},leaderboard:async()=>({top:[],me:null})},createRecorder:()=>({start:async()=>null,record(){},finish:async()=>null,invalidate(){}})};`;
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
try{
  for(const [width,height] of [[568,320],[844,390],[1280,720]]){
    const touch=width<1000,context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/game-bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:fixture}));await page.route('**/api/competition/**',r=>r.abort());
    await page.goto(base+'?dev=0');await page.waitForFunction(()=>globalThis.__night?.snapshot().progression.assets&&!document.getElementById('night-startup'));
    const click=async id=>{await press(page,id,touch,false);await settleVisuals(page);};
    const shot=async name=>{const s=await snapshot(page);assertLayout({...s,buttons:s.buttons.filter(b=>!b.disabled)},s.ui.width,s.ui.height);await page.screenshot({path:fileURLToPath(new URL(`${name}-${width}.png`,out))});};
    const wheel=()=>page.evaluate(async()=>{const {director,Label,UITransform}=await System.import('cc');const scene=director.getScene(),labels=scene.getComponentsInChildren(Label).filter(l=>l.node.activeInHierarchy),prizes=labels.filter(l=>l.node.name.startsWith('WheelPrize:'));const wheel=prizes[0]?.node.parent,count=labels.find(l=>l.string.includes('剩余次数')),box=n=>{const r=n.getComponent(UITransform).getBoundingBoxToWorld();return {x:r.x,y:r.y,w:r.width,h:r.height};};return {angle:wheel?.angle,box:box(wheel),prizes:prizes.map(l=>({text:l.string,angle:l.node.angle,box:box(l.node)})),count:count?.string,countBox:box(count.node)};});
    await click('qm:supply');await shot('idle');let state=await wheel();assert.equal(state.prizes.length,6);assert.deepEqual(state.prizes.map(p=>p.text.split('\n')[1]),['35%','25%','15%','15%','8%','2%']);assert(state.count.includes('剩余次数 2'));
    const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
    const layout=state=>{assert(!overlap(state.box,state.countBox),'wheel must not cover the spin count');for(const [i,a] of state.prizes.entries())for(const b of state.prizes.slice(i+1))assert(!overlap(a.box,b.box),'prize labels must not overlap '+JSON.stringify({a,b,angle:state.angle}));};
    for(const p of state.prizes)assert(Math.abs(p.angle)<.1);layout(state);
    for(const index of [1,4]){
      await click('qm:wheelSpin');await page.waitForTimeout(600);state=await wheel();assert(state.prizes.every(p=>Math.abs((p.angle+state.angle)%360)<2),'labels stay upright while spinning');await shot('spinning-'+index);
      await page.waitForFunction(()=>__night.snapshot().progression.gift,{timeout:10000});await click('qm:giftClose');state=await wheel();assert(Math.abs(((30+index*60-state.angle)%360+360)%360)<.1,'pointer lands on awarded sector');assert(state.prizes.every(p=>Math.abs((p.angle+state.angle)%360)<.1),'labels stay upright after landing');layout(state);await shot('landed-'+index);
    }
    await click('info:wheel');const texts=await page.evaluate(async()=>{const {director,Label}=await System.import('cc');return director.getScene().getComponentsInChildren(Label).filter(l=>l.node.activeInHierarchy).map(l=>l.string);});assert(texts.some(t=>t.includes('扇区面积相同')));await click('qm:infoClose');assert.deepEqual(errors,[]);await context.close();
  }
}finally{await browser.close();}
console.log('Wheel layout, upright labels, odds and two awarded sectors passed at three landscape sizes.');
