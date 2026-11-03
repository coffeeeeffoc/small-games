import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {assetFixture} from './progression-fixture.ts';
import {acceptanceBuild,snapshot,press,settleVisuals,navigateMap} from './flight-browser.mjs';
const base=process.env.NIGHT_URL,build=await acceptanceBuild(base),out=process.env.NIGHT_REPORT_DIR||'games/local/night-overwatch/reports/support-drones';
await mkdir(out,{recursive:true});const evidence={build,fixture:true,checks:[],screens:[],errors:[]};
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
try{
 for(const [width,height] of [[844,390],[1280,720]]){
  const touch=width===844,assets=assetFixture();assets.loadouts.solo={mods:[],weapon:'drone-match',skill:'emp-permanent'};
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1,recordVideo:{dir:out,size:{width,height}}});
  await context.addInitScript(()=>localStorage.setItem('night-overwatch-coach-v2','done'));
  const page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>evidence.errors.push(e.message));
  await page.route('**/game-bootstrap.js',route=>route.fulfill({contentType:'text/javascript',body:'const assets='+JSON.stringify(assets)+',metadata={identity:{playerId:assets.playerId,nickname:"无人机测试"},capabilities:{multiplayer:false,leaderboards:false}};globalThis.SmallGamesServices={ready:Promise.resolve(metadata),refresh:async()=>metadata,services:{nightAssets:async()=>structuredClone(assets)},createRecorder:()=>({start:async()=>null,record(){},finish:async()=>null,invalidate(){}})};'}));
  await page.route('**/api/competition/**',route=>route.abort());
  const click=async id=>{await press(page,id,touch,false);await settleVisuals(page);};
  const capture=async name=>{const file=name+'-'+width+'.png';await page.screenshot({path:out+'/'+file});evidence.screens.push(file);};
  await page.goto(base+'?dev=1&mission=patrol-03');await page.waitForFunction(()=>globalThis.__night?.snapshot().ui.homeArtworkReady&&__night.snapshot().progression.assets&&!document.getElementById('night-startup'));await settleVisuals(page);
  await click('qm:modes');await click('mode:solo');await click('mode:enter');await click('start');await page.waitForFunction(()=>__night.snapshot().phase==='playing'&&!__night.snapshot().modal);
  let s=await snapshot(page);assert.equal(s.mission.id,'patrol-03');assert.equal(s.viewMode,'night');
  await navigateMap(page,s.units.find(u=>!u.friendly&&u.hp>0),touch);await click('weapon4');
  if(touch)await click('fire');else await page.keyboard.press('Space');
  await page.waitForFunction(()=>__night.snapshot().drones.length===3);s=await snapshot(page);const expires=s.drones[0].expires;
  assert.equal(new Set(s.drones.map(d=>d.x+','+d.z)).size,3);
  await click('skillUse');s=await snapshot(page);assert(s.skill.remaining>10&&s.skill.remaining<=12);assert(s.buttons.find(b=>b.id==='skillUse').text.startsWith('电磁干扰\n'));
  await page.waitForFunction(()=>__night.snapshot().drones.some(d=>d.budget<144));await capture('formation-attacking');
  await page.waitForFunction(e=>__night.snapshot().time>e-1.3,expires);s=await snapshot(page);assert.equal(s.drones.length,3);assert(s.drones.some(d=>d.budget<120),'drones attack beyond the old budget');assert(s.skill.remaining>0);await capture('emp-after-ten-seconds');
  await page.waitForFunction(()=>__night.snapshot().drones.some(d=>d.expires<=__night.snapshot().time));s=await snapshot(page);assert(s.drones.every(d=>d.target===undefined));await capture('drones-falling');
  await page.waitForFunction(()=>__night.snapshot().drones.length===0);s=await snapshot(page);await capture('drones-landed');
  evidence.checks.push({width,height,touch,mission:s.mission.id,droneCount:3,lifetime:12,empDuration:12,landed:true,remainingAmmo:s.guns[4].ammo});
  const video=page.video();await context.close();await video.saveAs(out+'/drones-'+width+'.webm');
 }
 assert.deepEqual(evidence.errors,[]);await acceptanceBuild(base);await writeFile(out+'/evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await browser.close();}
