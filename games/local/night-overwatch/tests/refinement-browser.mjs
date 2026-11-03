import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {assetFixture} from './progression-fixture.ts';
import {acceptanceBuild,snapshot,press,settleVisuals,assertLayout,navigateMap,aimAt} from './flight-browser.mjs';
import {scrollPage} from './scroll-helpers.mjs';
const base=process.env.NIGHT_URL,build=await acceptanceBuild(base),out=fileURLToPath(new URL('../reports/refinement-2026-11-04/',import.meta.url));await mkdir(out,{recursive:true});
const evidence={build,fixture:true,environment:'QA assets and long nickname fixture; real pointer and keyboard; not publication media',checks:[],screens:[],errors:[]};
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11'],...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
const texts=page=>page.evaluate(async()=>{const {director,Label}=await System.import('cc');return director.getScene().getComponentsInChildren(Label).filter(l=>l.node.activeInHierarchy).map(l=>l.string);});
try{
 for(const [width,height] of [[568,320],[844,390],[1280,720]]){
  const touch=width<1000,assets=assetFixture(),nickname=width===568?'WWWWMMMMWWWWMMMM':'夜航守望这是很长的中文玩家昵称';
  assets.loadouts.solo={mods:['rate-match'],weapon:'laser-match',skill:'emp-permanent'};assets.loadouts.duel=structuredClone(assets.loadouts.solo);
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
  const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>evidence.errors.push(e.message));
  await page.route('**/game-bootstrap.js',route=>route.fulfill({contentType:'text/javascript',body:`const assets=${JSON.stringify(assets)},metadata={identity:{playerId:assets.playerId,nickname:${JSON.stringify(nickname)}},capabilities:{multiplayer:false,leaderboards:false}};globalThis.SmallGamesServices={ready:Promise.resolve(metadata),refresh:async()=>metadata,services:{nightAssets:async()=>structuredClone(assets)},createRecorder:()=>({start:async()=>null,record(){},finish:async()=>null,invalidate(){}})};`}));
  await page.route('**/api/competition/**',route=>route.abort());
  const click=async id=>{await press(page,id,touch,false);await settleVisuals(page);};
  const capture=async name=>{await settleVisuals(page);const s=await snapshot(page);assertLayout(s,s.ui.width,s.ui.height);const file=`${name}-${width}.png`;await page.screenshot({path:`${out}/${file}`});evidence.screens.push(file);return s;};
  await page.goto(base+'?dev=0');await page.waitForFunction(()=>globalThis.__night?.snapshot().ui.homeArtworkReady&&__night.snapshot().progression.assets&&!document.getElementById('night-startup'));await settleVisuals(page);
  assert((await texts(page)).some(s=>s.includes('EXP')));await capture('home-exp');await click('qm:growth');assert((await texts(page)).some(s=>/EXP.*\d+.*\//.test(s)));await capture('growth-exp');await click('qm:back');await click('qm:tasks');assert(!(await texts(page)).some(s=>/\bXP\b/.test(s)));await capture('tasks-exp');await click('qm:back');await click('qm:modes');assert((await snapshot(page)).buttons.find(b=>b.id==='qm:loadout').text.includes('作战配置'));await capture('modes');
  await click('mode:solo');await click('mode:enter');let s=await capture('missions'),mission=s.mission.id,area=s.scrollLists.find(a=>a.key==='missions');assert.equal(area.axis,'x');
  await scrollPage(page,'missions');s=await capture('missions-drag');assert.equal(s.mission.id,mission);assert(s.scrollLists.find(a=>a.key==='missions').offset>0);
  if(touch){const cdp=await context.newCDPSession(page),a=s.scrollLists.find(a=>a.key==='missions'),p={x:a.x+a.w*.7,y:a.y+a.h*.5};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x-60,y:p.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal((await snapshot(page)).mission.id,mission);}
  await click('training');await click('start');await page.waitForFunction(()=>__night.snapshot().phase==='playing'&&!__night.snapshot().modal);
  await click('battleReport');const overview=await capture('report-overview'),close=overview.buttons.find(b=>b.id==='close');await click('equipment');const equipment=await capture('report-loadout');assert(equipment.battleReport&&equipment.equipmentOpen);assert.deepEqual(equipment.buttons.find(b=>b.id==='close'),close);await click('reportOverview');assert(!(await snapshot(page)).equipmentOpen);await click('equipment');await page.keyboard.press('Escape');await settleVisuals(page);s=await snapshot(page);assert(!s.battleReport&&!s.equipmentOpen);
  await click('weapon5');s=await snapshot(page);const target=s.units.find(u=>!u.friendly&&u.hp>0&&u.kind==='heavy');assert(target);await navigateMap(page,target);await aimAt(page,target,touch);const before=await snapshot(page);if(touch)await click('fire');else await page.keyboard.press('Space');await page.waitForFunction(n=>__night.snapshot().fired>n,before.fired);await page.waitForFunction(()=>__night.snapshot().lasers.length>0);
  s=await snapshot(page);assert.equal(s.guns[5].cooldownTotal,8);assert(s.weaponReadiness[5].remaining>0&&s.weaponReadiness[5].ratio>0);assert.equal(s.guns[5].ammo,5);await capture('laser-cooldown');
  await click('weapon0');s=await snapshot(page);assert.equal(s.selected,0);assert.equal(s.weaponReadiness[0].remaining,0);if(touch)assert(!/\d+\.\ds/.test(s.ui.fire));await click('weapon5');s=await snapshot(page);assert(s.weaponReadiness[5].remaining>0);if(touch){const seconds=Number(s.ui.fire.match(/(\d+\.\d)s/)?.[1]);assert(Math.abs(seconds-s.weaponReadiness[5].remaining)<.15);}
  await click('skillUse');assert((await snapshot(page)).skill.remaining>0);await capture('skill-active');
  await page.waitForFunction(id=>__night.snapshot().units.find(u=>u.id===id)?.hp<=0,target.id);s=await snapshot(page);assert.equal(s.fired,before.fired+1);assert.equal(s.guns[5].ammo,5);await capture('laser-target-destroyed');
  await click('settings');await click('home');await click('exitConfirm');await click('qm:modes');await click('mode:duel');await click('mode:enter');await click('online:bot');await page.waitForFunction(()=>__night.snapshot().online.active&&!__night.snapshot().modal);
  await page.waitForFunction(()=>__night.snapshot().time>.5);s=await capture('duel-names');assert(s.ui.combatantNames.every(n=>n.active&&!n.wrap&&!n.text.includes('\n')&&n.fontSize>=12));await click('battleReport');assert((await texts(page)).includes(nickname));await capture('duel-report-full-names');await click('equipment');await capture('duel-loadout');await click('close');
  evidence.checks.push({width,height,horizontalDrag:true,oneReportShell:true,experienceLabel:'EXP',cooldownCadence:8,laserShotAmmo:1,nickname});await context.close();
 }
 assert.deepEqual(evidence.errors,[]);await acceptanceBuild(base);await writeFile(`${out}/evidence.json`,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await browser.close();}
