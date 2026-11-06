import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { MISSIONS } from '../assets/scripts/core/MissionCatalog.ts';
import { practiceLoadout } from '../assets/scripts/core/Progression.ts';
import { assetFixture } from './progression-fixture.ts';
import { lateWaveFixture } from './late-wave-fixture.ts';
import { acceptanceBuild,snapshot,press,aimAt,navigateMap,predictUnit,settleVisuals } from './flight-browser.mjs';

// Rendering stress through normal browser aiming and firing. Account/loadout is a QA fixture,
// mission rules, spawn schedule, kills, geometry and rendered frames are the actual game.
const renderFixture=process.env.NIGHT_RENDER_FIXTURE==='1',base=process.env.NIGHT_URL,build=await acceptanceBuild(base),out=new URL(renderFixture?'../reports/2026-11-07-late-wave-fixture/':'../reports/2026-11-07-late-wave/',import.meta.url);await mkdir(out,{recursive:true});
const evidence={build,fixture:renderFixture?'explicit rendering fixture: legal pure-rule input replay, not a browser-playthrough or real-service proof':'account-and-loadout-only; no simulation writes',samples:[],errors:[]},assets=assetFixture(),loadout=practiceLoadout(assets,'solo',0);
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']}),context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage();
try{
 await context.addInitScript(ids=>{localStorage.setItem('night-overwatch-progress-v1',JSON.stringify({version:1,cleared:ids}));localStorage.setItem('night-overwatch-coach-v2','done');},MISSIONS.slice(0,-1).map(m=>m.id));
 await page.route('**/game-bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:`const assets=${JSON.stringify(assets)},meta={identity:{playerId:assets.playerId,nickname:'末波渲染验收'},capabilities:{multiplayer:false,leaderboards:true}};globalThis.SmallGamesServices={ready:Promise.resolve(meta),services:{nightAssets:async()=>assets},createRecorder:(_version,options)=>({start:async()=>{options?.onStatus?.('recording');return {loadout:${JSON.stringify(loadout)}}},record(){},finish:async()=>null,invalidate(){}})};`}));await page.route('**/api/competition/**',r=>r.abort());page.on('pageerror',e=>evidence.errors.push(e.message));
 await page.goto(base+'?dev=0&mission=operation-120');await page.waitForFunction(()=>globalThis.__night?.snapshot().progression.assets&&!document.getElementById('night-startup'));await press(page,'start');await page.waitForFunction(()=>__night.snapshot().phase==='playing'&&!__night.snapshot().modal);assert.equal((await snapshot(page)).mission.total,144);
 // Node and Chromium trigonometry can differ below 1e-13; preserve IDs/alive states and compare numbers within 1e-8.
 if(renderFixture){const replay=lateWaveFixture();evidence.coreCompletion=replay.complete;evidence.replayTicks=replay.inputs.length;
  const actual=await page.evaluate(async({inputs,checkpoint})=>{const {director}=await System.import('cc'),game=director.getScene().getComponentsInChildren('Overwatch')[0],sim=new game.sim.constructor('operation-120');sim.start();for(const [weapon,x,z,fire]of inputs){sim.choose(weapon);sim.setAim({x,z});if(fire&&!sim.fire())throw Error('Legal replay fire diverged');sim.step(1/60);}const units=sim.units.map(u=>({id:u.id,hp:u.hp,x:u.x,z:u.z}));if(units.length!==checkpoint.units.length||units.some((u,i)=>{const expected=checkpoint.units[i];return !expected||u.id!==expected.id||Math.sign(u.hp)!==Math.sign(expected.hp)||['hp','x','z'].some(k=>Math.abs(u[k]-expected[k])>1e-8);})||Math.abs(sim.time-checkpoint.time)>1e-8)throw Error('Compiled replay differs: '+JSON.stringify({time:[sim.time,checkpoint.time],length:[units.length,checkpoint.units.length],first:units.map((u,i)=>({actual:u,expected:checkpoint.units[i]})).find(p=>JSON.stringify(p.actual)!==JSON.stringify(p.expected))}));game.sim=sim;game.lastEvent=sim.events.at(-1)?.id||0;game.accumulator=0;return{time:sim.time,spawned:sim.spawned.size,dead:sim.units.filter(u=>!u.friendly&&u.hp<=0).length};},replay);evidence.checkpoint=actual;await settleVisuals(page);
 }else{
 const deadline=Date.now()+600000;let lastProgress=0;
 while(Date.now()<deadline){let s=await snapshot(page);if(s.phase!=='playing')throw Error('Mission ended before late-wave benchmark: '+s.phase);const dead=s.units.filter(u=>!u.friendly&&u.hp<=0).length;if(s.mission.spawned===144&&dead>=70)break;
  if(Date.now()-lastProgress>30000){lastProgress=Date.now();console.log(JSON.stringify({time:s.time,spawned:s.mission.spawned,dead,fired:s.fired}));}
  const target=s.units.filter(u=>!u.friendly&&u.hp>0).sort((a,b)=>a.hp-b.hp)[0];if(!target){await page.waitForTimeout(250);continue;}
  const preferred=target.kind==='light'?0:target.kind==='heavy'?2:1,weapon=s.guns[preferred].ammo===0?0:preferred;if(s.selected!==weapon)await press(page,'weapon'+weapon,false,false);
  s=await snapshot(page);let lead=target;for(let i=0;i<3;i++)lead=predictUnit(s,target,await page.evaluate(({p,weapon})=>__night.flightTime(p,weapon),{p:lead,weapon})+.1);
  await navigateMap(page,lead);await aimAt(page,lead);await page.mouse.down();await page.waitForTimeout(target.kind==='light'?600:350);await page.mouse.up();
 }
 }
 let s=await snapshot(page);assert.equal(s.mission.spawned,144);assert(s.units.filter(u=>!u.friendly&&u.hp<=0).length>=70);
 for(const [width,height]of [[1280,720],[568,320]]){await page.setViewportSize({width,height});await settleVisuals(page);const frames=await page.evaluate(()=>new Promise(resolve=>{const rows=[],start=performance.now();function sample(){const s=__night.snapshot();rows.push({fps:s.frameRate,drawCalls:s.drawCalls,triangles:s.triangles,nodes:s.renderNodes,dead:s.units.filter(u=>!u.friendly&&u.hp<=0).length,alive:s.units.filter(u=>!u.friendly&&u.hp>0).length,spawned:s.mission.spawned,time:s.time});if(performance.now()-start<4000)requestAnimationFrame(sample);else resolve(rows);}requestAnimationFrame(sample);}));await page.screenshot({path:fileURLToPath(new URL('late-wave-'+width+'.png',out))});const fps=frames.map(f=>f.fps).filter(f=>f>0).sort((a,b)=>a-b);evidence.samples.push({width,height,frames:frames.length,fpsMedian:fps[Math.floor(fps.length/2)],fpsP10:fps[Math.floor(fps.length*.1)],first:frames[0],last:frames.at(-1)});}
 assert.deepEqual(evidence.errors,[]);
}catch(error){evidence.failure=String(error);evidence.last=await snapshot(page).catch(()=>null);await page.screenshot({path:fileURLToPath(new URL('failure.png',out))}).catch(()=>{});throw error;}finally{await browser.close();await writeFile(new URL('evidence.json',out),JSON.stringify(evidence,null,2));}
console.log(JSON.stringify(evidence.samples));
