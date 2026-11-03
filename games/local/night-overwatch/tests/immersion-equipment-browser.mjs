import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { assetFixture } from './progression-fixture.ts';
import { acceptanceBuild, snapshot, press, settleVisuals, assertLayout } from './flight-browser.mjs';

const base=process.env.NIGHT_URL,build=await acceptanceBuild(base);
const out=fileURLToPath(new URL('../reports/immersion-equipment-2026-11-03/',import.meta.url));await mkdir(out,{recursive:true});
const evidence={build,fixture:true,checks:[],errors:[]};
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
try{
  for(const [width,height,weapon,skill]of [[568,320,'drone','tracking'],[844,390,'laser','emp']]){
    const assets=assetFixture();assets.loadouts.solo={mods:['burst-match','twin-match'],weapon:weapon+'-match',skill:skill+'-permanent'};assets.loadouts.duel=structuredClone(assets.loadouts.solo);
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
    const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>evidence.errors.push(e.message));
    await page.route('**/game-bootstrap.js',route=>route.fulfill({contentType:'text/javascript',body:`const assets=${JSON.stringify(assets)},metadata={identity:{playerId:assets.playerId,nickname:'布局检查'},capabilities:{multiplayer:false,leaderboards:false}};globalThis.SmallGamesServices={ready:Promise.resolve(metadata),refresh:async()=>metadata,services:{nightAssets:async()=>structuredClone(assets)},createRecorder:()=>({start:async()=>null,record(){},finish:async()=>null,invalidate(){}})};`}));
    await page.route('**/api/competition/**',route=>route.abort());
    const click=async id=>{await press(page,id,true,false);await settleVisuals(page);};
    const capture=async name=>{const s=await snapshot(page);assertLayout({...s,buttons:s.buttons.filter(b=>!b.disabled)},s.ui.width,s.ui.height);await page.screenshot({path:`${out}/${name}-${width}.png`});};
    await page.goto(base+'?dev=0');await page.waitForFunction(()=>globalThis.__night?.snapshot().ui.homeArtworkReady&&__night.snapshot().progression.assets&&!document.getElementById('night-startup'));await settleVisuals(page);
    await click('qm:modes');await click('mode:training');await click('mode:enter');await page.waitForFunction(()=>__night.snapshot().phase==='playing');
    let s=await snapshot(page);assert(s.loadout.effects.includes(skill)&&s.loadout.effects.includes(weapon));
    const weaponId=weapon==='drone'?'weapon4':'weapon5';await click(weaponId);assert.equal((await snapshot(page)).selected,weapon==='drone'?4:5);
    await click('skillUse');assert((await snapshot(page)).skill.remaining>0);await capture('skill-active');
    await click('battleReport');await click('equipment');await capture('equipment');await click('close');
    await click('settings');await click('home');await click('exitConfirm');await click('qm:modes');await click('mode:duel');await click('mode:enter');await click('online:bot');await page.waitForFunction(()=>__night.snapshot().online.active&&!__night.snapshot().modal);
    await capture('bot-battle');await click('battleReport');await click('equipment');await capture('bot-equipment');
    evidence.checks.push({width,height,weapon,skill,skillActive:true,specialWeaponSelected:true,botTactics:true});await context.close();
  }
  assert.deepEqual(evidence.errors,[]);await writeFile(`${out}/evidence.json`,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser.close();}
