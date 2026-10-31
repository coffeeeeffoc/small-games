import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assetFixture } from './progression-fixture.ts';
import { acceptanceBuild,snapshot,assertLayout } from './flight-browser.mjs';
import { press,settleVisuals } from './visual-helpers.mjs';

const base=process.env.NIGHT_URL,build=await acceptanceBuild(base);
const out=new URL('../reports/2026-11-01-progression/',import.meta.url);await mkdir(out,{recursive:true});
const evidence={build,fixture:true,screens:[],errors:[],checks:[]};
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
function fixtureSource(assets){return `
const assets=${JSON.stringify(assets)};
const metadata={identity:{playerId:assets.playerId,nickname:'夜航07'},capabilities:{multiplayer:false,leaderboards:false}};
globalThis.SmallGamesServices={ready:Promise.resolve(metadata),refresh:async()=>metadata,services:{
nightAssets:async()=>structuredClone(assets),
nightAssetCommand:async command=>{if(command.kind==='read-mail'){assets.mail.find(m=>m.id===command.mailId).read=true;}if(command.kind==='loadout')assets.loadouts[command.mode]=command.loadout;assets.revision++;return structuredClone(assets);},
leaderboard:async()=>({top:[],me:null})},createRecorder:()=>({start:async()=>null,record(){},finish:async()=>null,invalidate(){}})};`;}
try{
  const dimensions=process.env.NIGHT_PROGRESS_SINGLE?[[1672,941]]:[[1672,941],[568,320],[844,390],[1280,720],[390,844]];
  for(const [width,height]of dimensions){
    const touch=width<1000,context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});
    const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>evidence.errors.push(e.message));
    await page.route('**/game-bootstrap.js',route=>route.fulfill({contentType:'text/javascript',body:fixtureSource(assetFixture())}));
    await page.route('**/api/competition/**',route=>route.abort());await page.route('**/small-games/v1/**',route=>route.abort());
    await page.goto(base+'?dev=0');
    await page.waitForFunction(()=>globalThis.__night?.snapshot().ui.interfaceArtworkReady&&!document.getElementById('night-startup'));
    const click=id=>press(page,id,touch,false);
    const capture=async(name)=>{
      await page.waitForTimeout(650);await settleVisuals(page);const state=await snapshot(page);
      assertLayout(state,state.ui.width,state.ui.height);
      const path=fileURLToPath(new URL(`${name}-${width}.png`,out));await page.screenshot({path});
      evidence.screens.push({name,width,height,logical:[state.ui.width,state.ui.height],path,buttons:state.buttons.map(b=>b.id)});
    };
    if(width<height){
      await capture('00-rotate-prompt');assert((await snapshot(page)).pauses.includes('orientation'));
      await page.setViewportSize({width:height,height:width});
      await page.waitForFunction(()=>__night.snapshot().buttons.some(b=>b.id==='qm:loadout'));
    }
    await capture('01-home');
    for(const [id,name]of [['loadout','02-loadout'],['modes','03-modes'],['shop','04-shop'],['supply','05-supply'],['growth','06-growth'],['tasks','07-tasks'],['inbox','08-inbox'],['warehouse','10-warehouse'],['checkin','11-checkin'],['probability','12-probability']]){
      if(id==='probability'){await click('qm:supply');await click('qm:probability');}else await click('qm:'+id);
      await capture(name);
      if(id==='shop'&&(await snapshot(page)).ui.width<660){await click('product:burst-match');await capture('04-detail');}
      if(id==='inbox'){await click('qm:next');await capture('08-inbox-next');}
      if(id==='warehouse'){await click('qm:sell');await capture('10-sell-confirm');await click('qm:cancel');await click('qm:receipts');await capture('10-open-history');await click('qm:back');}
      await click('qm:back');
    }
    await click('qm:shop');if((await snapshot(page)).ui.width<660)await click('product:burst-match');await click('qm:trial');
    await page.waitForFunction(()=>__night.snapshot().phase==='playing');await capture('13-battle-trial');
    await click('settings');await capture('14-pause');await click('home');await click('exitConfirm');
    assert.equal((await snapshot(page)).modal,'home');
    const trial=async(effect)=>{
      await click('qm:shop');
      for(let i=0;i<6;i++){if((await snapshot(page)).buttons.some(b=>b.id==='product:'+effect+'-match'))break;await click('qm:next');}
      await click('product:'+effect+'-match');await click('qm:trial');await page.waitForFunction(()=>__night.snapshot().phase==='playing');
    };
    await trial('emp');await capture('15-skill-ready');await click('skillUse');await capture('16-skill-active');
    let state=await snapshot(page),skill=state.buttons.find(b=>b.id==='skillUse'),fired=state.fired;
    if(touch)await page.touchscreen.tap(skill.x+skill.w/2,skill.y+skill.h/2);else await page.mouse.click(skill.x+skill.w/2,skill.y+skill.h/2);
    assert.equal((await snapshot(page)).fired,fired,'disabled active skill never fires through');
    await page.waitForFunction(()=>__night.snapshot().skill.remaining===0&&__night.snapshot().skill.cooldown>0);await capture('17-skill-cooldown');
    await click('settings');await click('home');await click('exitConfirm');
    await trial('drone');await capture('18-drone-weapon');assert((await snapshot(page)).buttons.some(b=>b.id==='weapon4'));
    await click('settings');await click('home');await click('exitConfirm');
    evidence.checks.push(`Actual navigation, detail, mail pagination, sell confirmation, training and pause ${width}×${height}`);
    await context.close();
  }
  assert.deepEqual(evidence.errors,[]);
}finally{await browser.close();await writeFile(new URL('evidence.json',out),JSON.stringify(evidence,null,2));}
console.log(JSON.stringify({screens:evidence.screens.length,checks:evidence.checks,errors:evidence.errors}));
