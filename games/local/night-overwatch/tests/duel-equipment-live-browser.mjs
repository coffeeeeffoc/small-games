import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { acceptanceBuild, snapshot, press, settleVisuals, assertLayout } from './flight-browser.mjs';

// Two new QA guests use the real test service; never edit existing accounts, rooms or battle state.
const base=process.env.NIGHT_URL,build=await acceptanceBuild(base);
const out=new URL('../reports/2026-11-01-duel-equipment-live/',import.meta.url);await mkdir(out,{recursive:true});
const evidence={build,fixture:false,developmentAssets:true,checks:[],screens:[],errors:[]};
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const actors=[];
const hit=(actor,id)=>press(actor.page,id,actor.touch,false);
const labels=page=>page.evaluate(async()=>{const {director,Label}=await System.import('cc');return director.getScene().getComponentsInChildren(Label).filter(l=>l.node.activeInHierarchy).map(l=>l.string).join('\n');});
const waitText=(page,pattern)=>page.waitForFunction(async pattern=>{const {director,Label}=await System.import('cc');return director.getScene().getComponentsInChildren(Label).some(l=>l.node.activeInHierarchy&&new RegExp(pattern).test(l.string));},pattern,{timeout:10000});
async function make(width,height,loadout){
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000});
  const page=await context.newPage(),actor={page,context,touch:width<1000,width,height};actors.push(actor);
  page.setDefaultTimeout(45000);page.on('pageerror',error=>evidence.errors.push(error.message));
  await context.addInitScript(()=>localStorage.setItem('night-overwatch-coach-v2','done'));
  await page.goto(base+'?dev=0');
  await page.waitForFunction(()=>globalThis.__night?.snapshot().progression.assets&&!document.getElementById('night-startup'));
  actor.playerId=(await snapshot(page)).progression.assets.playerId;
  actor.loadout=loadout;
  await page.evaluate(async({loadout,playerId})=>{
    const api=SmallGamesServices.services;
    const send=command=>api.nightAssetCommand({...command,requestId:crypto.randomUUID()},playerId);
    await send({kind:'dev-adjust',coinsDelta:10000});
    for(const item of [...loadout.mods,loadout.weapon,loadout.skill])await send({kind:'buy',item,quantity:1});
    await send({kind:'loadout',mode:'duel',loadout});
  },{loadout,playerId:actor.playerId});
  await page.reload();await page.waitForFunction(()=>globalThis.__night?.snapshot().progression.assets&&!document.getElementById('night-startup'));
  assert.deepEqual((await snapshot(page)).progression.assets.loadouts.duel,loadout);await settleVisuals(page);return actor;
}
async function shot(actor,name){await settleVisuals(actor.page);const state=await snapshot(actor.page);assertLayout(state,actor.width,actor.height);await actor.page.screenshot({path:fileURLToPath(new URL(name+'.png',out))});evidence.screens.push({name,width:actor.width,height:actor.height});}
async function leave(actor){
  const state=await snapshot(actor.page);
  if(state.equipmentOpen){await hit(actor,'close');}
  if((await snapshot(actor.page)).online.active){await hit(actor,'settings');await hit(actor,'home');await hit(actor,'exitConfirm');}
  else if((await snapshot(actor.page)).online.room)await hit(actor,'online:leave');
}
try{
  const a=await make(1280,720,{mods:['burst-match','twin-match'],weapon:'drone-match',skill:'tracking-match'});
  const b=await make(800,366,{mods:['power-match','rate-match'],weapon:'laser-match',skill:'emp-match'});
  assert.notEqual(a.playerId,b.playerId);evidence.players=[a.playerId,b.playerId];
  for(const actor of [a,b]){await hit(actor,'qm:modes');await hit(actor,'mode:duel');await hit(actor,'mode:enter');}
  await hit(a,'online:friend');await hit(a,'online:createConfirm');
  await a.page.waitForFunction(()=>__night.snapshot().online.room?.status==='waiting');
  const code=(await snapshot(a.page)).online.room.code;assert.match(code,/^\d{6}$/);
  await b.page.waitForFunction(code=>__night.snapshot().buttons.some(x=>x.id==='online:joinCode:'+code),code);
  await hit(b,'online:joinCode:'+code);await a.page.waitForFunction(()=>__night.snapshot().online.room?.players.length===2);
  await hit(a,'online:ready');await hit(b,'online:ready');
  for(const actor of [a,b])await actor.page.waitForFunction(()=>__night.snapshot().online.active&&!__night.snapshot().modal);
  let sa=await snapshot(a.page),sb=await snapshot(b.page);
  assert.deepEqual(sa.loadout.effects,['burst','twin','drone','tracking']);assert.deepEqual(sb.loadout.effects,['power','rate','laser','emp']);
  assert.deepEqual(sa.enemyEquipment.loadout,sb.loadout);assert.deepEqual(sb.enemyEquipment.loadout,sa.loadout);
  assert.deepEqual(Object.keys(sa.enemyEquipment).filter(key=>key!=='buff').sort(),['guns','loadout','selected','skill']);
  evidence.checks.push('Two authenticated human-player clients receive each other’s independent server loadout; no bot or asset fixture');
  await hit(a,'weapon2');await a.page.waitForFunction(()=>__night.snapshot().selected===2);sa=await snapshot(a.page);
  await a.page.keyboard.press('Space');await a.page.waitForFunction(fired=>__night.snapshot().fired>=fired+4,sa.fired);
  const fired=await snapshot(a.page);assert.equal(fired.fired-sa.fired,4);assert.equal(sa.guns[2].ammo-fired.guns[2].ammo,1);assert.equal(fired.ammoSpent-sa.ammoSpent,1);
  await b.page.waitForFunction(ammo=>{const p=__night.snapshot().enemyEquipment;return p.selected===2&&p.guns[2].ammo===ammo;},fired.guns[2].ammo);
  evidence.checks.push('Double burst × twin trajectory fires four projectiles, spends one round, and opponent observes the selected weapon and remaining ammunition');
  await hit(a,'battleReport');await hit(a,'equipment');await hit(b,'battleReport');await hit(b,'equipment');
  for(const actor of [a,b]){const text=await labels(actor.page);assert(text.includes('我方')&&text.includes('对方')&&text.includes('两连发')&&text.includes('电磁干扰')&&text.includes('默认 → 当前'));assert(!text.includes('尚未提供'));await shot(actor,'both-loadouts-'+actor.width);}
  await hit(b,'close');await hit(b,'skillUse');
  await a.page.waitForFunction(()=>{const s=__night.snapshot();return s.enemyEquipment.skill.activeUntil>s.time;});
  await waitText(a.page,'电磁干扰 · 生效');await shot(a,'opponent-emp-active');
  const time=(await snapshot(a.page)).time;
  await a.page.waitForFunction(()=>{const s=__night.snapshot(),p=s.enemyEquipment;return p.skill.activeUntil<=s.time&&p.skill.readyAt>s.time;});
  assert((await snapshot(a.page)).time>time);await waitText(a.page,'电磁干扰 · 冷却');
  await hit(b,'weapon5');await a.page.waitForFunction(()=>__night.snapshot().enemyEquipment.selected===5);await settleVisuals(a.page);
  await waitText(a.page,'装配武器：激光');await shot(a,'opponent-laser-cooldown');
  assert.equal((await snapshot(a.page)).enemyEquipment.buff??null,null);
  evidence.checks.push('Opponent EMP changes from active to cooldown while the equipment view stays open; weapon switch to laser and battle time update live');
  assert.deepEqual(evidence.errors,[]);evidence.final={a:(await snapshot(a.page)).loadout,b:(await snapshot(b.page)).loadout,ammo:fired.guns[2].ammo};
  console.log(JSON.stringify({checks:evidence.checks,errors:evidence.errors}));
}finally{for(const actor of actors)try{await leave(actor);}catch{/* Only this test's own room may be left; expiry handles a disconnected client. */}await writeFile(new URL('evidence.json',out),JSON.stringify(evidence,null,2)+'\n');await browser.close();}
