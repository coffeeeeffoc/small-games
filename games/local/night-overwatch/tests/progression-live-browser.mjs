import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { acceptanceBuild,snapshot,assertLayout,navigateMap,aimAt,waitForImpact } from './flight-browser.mjs';
import { press,settleVisuals } from './visual-helpers.mjs';

// Ordinary guest on the explicitly configured local test backend; never fake balances or battle outcomes.
const base=process.env.NIGHT_URL,build=await acceptanceBuild(base),out=new URL('../reports/2026-11-01-live/',import.meta.url);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']}),context=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:fileURLToPath(out),size:{width:1280,height:720}}});
const page=await context.newPage(),start=Date.now(),evidence={build,fixture:false,errors:[],checks:[],screens:[],clips:{}};
page.setDefaultTimeout(45000);page.on('pageerror',e=>evidence.errors.push(e.message));
const click=async id=>{await press(page,id,false,false);await page.waitForFunction(()=>!__night.snapshot().progression?.busy);};
const shot=async name=>{await settleVisuals(page);await page.waitForTimeout(350);const state=await snapshot(page);assertLayout(state,state.ui.width,state.ui.height);await page.screenshot({path:fileURLToPath(new URL(name+'.png',out))});evidence.screens.push({name,viewport:page.viewportSize()});};
const mark=name=>evidence.clips[name]=(Date.now()-start)/1000;
try{
  await page.goto(base+'?dev=0');await page.waitForFunction(()=>globalThis.__night?.snapshot().ui.interfaceArtworkReady&&!document.getElementById('night-startup')&&__night.snapshot().progression.assets?.playerId);
  evidence.playerId=(await snapshot(page)).progression.assets.playerId;
  mark('home');await shot('01-home');await page.waitForTimeout(3200);
  await click('qm:inbox');await page.waitForFunction(()=>__night.snapshot().buttons.some(b=>b.id==='qm:claimMail'&&!b.disabled));await click('qm:claimMail');
  assert((await snapshot(page)).progression.assets.mail.some(m=>m.claimed));await shot('02-mail');await click('qm:back');
  await click('qm:checkin');await click('qm:checkinClaim');assert((await snapshot(page)).progression.assets.signedToday);await click('qm:back');
  await click('qm:warehouse');let state=await snapshot(page),pack=Object.keys(state.progression.assets.available).find(k=>k.startsWith('pack:')&&state.progression.assets.available[k]>0);assert(pack);
  for(let i=0;i<8&&!((await snapshot(page)).buttons.some(b=>b.id==='inventory:'+pack));i++)await click('qm:next');
  await click('inventory:'+pack);await click('qm:open');assert((await snapshot(page)).progression.assets.openReceipts.length>0);
  await click('qm:receipts');await shot('03-opening');await click('qm:back');await click('qm:back');
  await click('qm:shop');await click('qm:next');await click('product:power-match');state=await snapshot(page);const beforeCoins=state.progression.assets.coins;
  await click('qm:buy');assert.equal((await snapshot(page)).progression.assets.coins,beforeCoins-160);mark('shop');await shot('04-shop');await page.waitForTimeout(2300);await click('qm:back');
  await click('qm:loadout');await click('equip:power-match');await shot('05-auto-consume-confirmation');await click('qm:confirm');state=await snapshot(page);assert.deepEqual(state.progression.assets.loadouts.solo.mods,['power-match']);
  const inventoryBefore=state.progression.assets.inventory['power-match'];mark('loadout');await shot('05-loadout');await page.waitForTimeout(2500);await click('qm:back');
  await click('qm:modes');await click('mode:solo');await click('mode:enter');await click('start');await page.waitForFunction(()=>__night.snapshot().phase==='playing'&&__night.snapshot().online.rankStatus==='recording');
  await click('weapon2');mark('gameplay');
  const battleBefore=(await snapshot(page)).progression.assets;
  for(let attempt=0;attempt<20;attempt++){
    state=await snapshot(page);if(!state.threatsRemaining||state.phase!=='playing')break;
    const enemy=state.units.find(u=>!u.friendly&&u.hp>0);assert(enemy);await navigateMap(page,enemy);await aimAt(page,enemy);
    await page.waitForFunction(()=>__night.snapshot().guns[2].cooldown===0);await page.keyboard.press('Space');const firing=await snapshot(page),shell=firing.shots.at(-1);
    assert(shell&&firing.fired>state.fired);if(attempt<3)await shot('06-combat-'+attempt);await waitForImpact(page,shell);
  }
  await page.waitForFunction(()=>__night.snapshot().phase==='success',null,{timeout:60000});
  await page.waitForFunction(()=>__night.snapshot().online.rankStatus==='finished'&&!__night.snapshot().progression.busy,null,{timeout:45000});
  state=await snapshot(page);assert(state.progression.assets.coins>battleBefore.coins);assert(state.progression.assets.xp>battleBefore.xp);assert.equal(state.progression.assets.inventory['power-match'],inventoryBefore-1);
  evidence.result={phase:state.phase,kills:state.kills,fired:state.fired,coins:state.progression.assets.coins-battleBefore.coins,xp:state.progression.assets.xp-battleBefore.xp};mark('settlement');
  for(const [width,height]of [[1280,720],[1672,941],[568,320],[844,390]]){await page.setViewportSize({width,height});await shot('09-settlement-'+width);}
  await page.setViewportSize({width:1280,height:720});await click('home');await click('qm:tasks');await shot('07-tasks');if((await snapshot(page)).buttons.some(b=>b.id==='qm:claimAll'&&!b.disabled))await click('qm:claimAll');await click('qm:back');
  await page.reload();await page.waitForFunction(()=>globalThis.__night?.snapshot().progression.assets?.signedToday&&!__night.snapshot().progression.busy);assert((await snapshot(page)).progression.assets.mail.some(m=>m.claimed));
  await shot('08-persisted-home');evidence.checks.push('Real FRP guest, welcome mail, cumulative check-in, opening receipt, purchase, loadout, authoritative solo win, one-time stock consumption, coins/XP settlement, task claim and reload persistence');assert.deepEqual(evidence.errors,[]);
}catch(error){evidence.failure=String(error);await page.screenshot({path:fileURLToPath(new URL('failure.png',out))}).catch(()=>{});throw error;}
finally{await writeFile(new URL('evidence.json',out),JSON.stringify(evidence,null,2));const video=page.video();await context.close();await video.saveAs(fileURLToPath(new URL('source.webm',out)));await browser.close();}
console.log(JSON.stringify({checks:evidence.checks,result:evidence.result,errors:evidence.errors}));
