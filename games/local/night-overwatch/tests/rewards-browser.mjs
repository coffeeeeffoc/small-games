import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {assetFixture} from './progression-fixture.ts';
import {ECONOMY,emptyLoadout} from '../assets/scripts/core/Progression.ts';
import {acceptanceBuild,snapshot,press,settleVisuals,assertLayout} from './flight-browser.mjs';
import {scrollToButton} from './scroll-helpers.mjs';

const base=process.env.NIGHT_URL,out=new URL('../reports/rewards/',import.meta.url);
await mkdir(out,{recursive:true});
const evidence={build:await acceptanceBuild(base),environment:'UI fixtures only; pointer/touch inputs; server atomicity covered separately by real PostgreSQL tests',screens:[],checks:[],errors:[]};
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
let currentPage;
function fixtureSource(legacy=false){
 const assets={...assetFixture(),xp:0,level:1,current:0,required:200,permanent:[],inventory:{'fragment:weapon':130,'fragment:skill':6},available:{'fragment:weapon':130,'fragment:skill':6},loadouts:{solo:emptyLoadout(),duel:emptyLoadout()},...(legacy?{}:{economy:ECONOMY,clearedLevels:[]})};
 return `const assets=${JSON.stringify(assets)},metadata={identity:{playerId:assets.playerId,nickname:'QA'},capabilities:{multiplayer:false,leaderboards:false}};
 globalThis.__rewardCommands=[];globalThis.SmallGamesServices={ready:Promise.resolve(metadata),refresh:async()=>metadata,services:{nightAssets:async()=>structuredClone(assets),nightAssetCommand:async command=>{
 __rewardCommands.push(command);assets.lastReceipt={};
 if(command.kind==='craft'){const product=assets.catalog.find(p=>p.id===command.item),recipe=assets.economy.recipes.find(r=>r.effect===product.effect),cost=recipe[product.term];
 if(assets.available[recipe.fragment]<cost||product.term==='permanent'&&assets.permanent.includes(product.effect))throw Error('Invalid fixture craft');
 assets.inventory[recipe.fragment]-=cost;assets.available[recipe.fragment]-=cost;
 if(product.term==='permanent'){assets.permanent.push(product.effect);assets.lastReceipt={permanent:product.effect};}else{assets.inventory[product.id]=(assets.inventory[product.id]||0)+1;assets.available[product.id]=assets.inventory[product.id];assets.lastReceipt={items:{[product.id]:1}};}}
 if(command.kind==='loadout')assets.loadouts[command.mode]=command.loadout;
 assets.revision++;return structuredClone(assets);},leaderboard:async()=>({top:[],me:null})},createRecorder:()=>({start:async()=>null,record(){},finish:async()=>null,invalidate(){}})};`;
}
try{
 for(const [width,height]of [[568,320],[844,390],[1280,720]])for(const lang of ['zh','en']){
  const touch=width<1000,context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});
  const page=currentPage=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>evidence.errors.push(e.message));
  await page.route('**/game-bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:fixtureSource()}));
  await page.route('**/api/competition/**',r=>r.abort());
  await page.goto(base+'?dev=0');await page.waitForFunction(()=>globalThis.__night?.snapshot().ui.homeArtworkReady&&!document.getElementById('night-startup'));
  const click=async id=>{await press(page,id,touch,false);await settleVisuals(page);};
  const shot=async name=>{await settleVisuals(page);const s=await snapshot(page);assertLayout(s,s.ui.width,s.ui.height);const file=`${name}-${width}-${lang}.png`;await page.screenshot({path:fileURLToPath(new URL(file,out))});evidence.screens.push(file);};
  if(lang==='en'){await click('settings');await click('language');await click('close');}
  await click('qm:checkin');await shot('checkin');await click('qm:back');
  await click('qm:warehouse');await click('qm:craft');await shot('craft-match');
  await scrollToButton(page,'qm:craftItem:drone-match');await click('qm:craftItem:drone-match');await shot('craft-confirm');await click('qm:confirm');
  await page.waitForFunction(()=>__night.snapshot().progression.assets.inventory['drone-match']===1);
  await click('qm:giftClose');assert.equal((await snapshot(page)).progression.assets.available['fragment:weapon'],120);
  await click('qm:craftTerm:permanent');await scrollToButton(page,'qm:craftItem:drone-permanent');await click('qm:craftItem:drone-permanent');await click('qm:confirm');
  await page.waitForFunction(()=>__night.snapshot().progression.assets.permanent.includes('drone'));await shot('craft-owned');
  let s=await snapshot(page);assert.equal(s.progression.assets.available['fragment:weapon'],0);assert(s.buttons.find(b=>b.id==='qm:craftItem:drone-permanent')?.disabled);
  await click('qm:craftTerm:match');assert((await snapshot(page)).buttons.find(b=>b.id==='qm:craftItem:drone-match')?.disabled);await scrollToButton(page,'qm:craftItem:emp-match');await shot('craft-skills-scrolled');await click('qm:craftItem:emp-match');await click('qm:confirm');
  await page.waitForFunction(()=>__night.snapshot().progression.assets.inventory['emp-match']===1);await click('qm:giftClose');await shot('craft-insufficient');
  await click('qm:back');assert.equal((await snapshot(page)).progression.page,'warehouse');await click('qm:back');await click('qm:loadout');await click('slot:weapon');
  await scrollToButton(page,'equip:drone-permanent');await click('equip:drone-permanent');await click('qm:save');
  await page.waitForFunction(()=>__night.snapshot().progression.assets.loadouts.solo.weapon==='drone-permanent');await shot('crafted-loadout');
  const commands=await page.evaluate(()=>globalThis.__rewardCommands);assert.equal(commands.filter(c=>c.kind==='craft').length,3);
  await click('qm:back');await click('qm:shop');
  for(const term of ['match','24h','permanent']){
   await click('term:'+term);await scrollToButton(page,'product:drone-'+term);await click('product:drone-'+term);
   assert((await snapshot(page)).buttons.find(b=>b.id==='qm:buy')?.disabled);await shot('shop-owned-'+term);
  }
  evidence.checks.push(`${width}x${height} ${lang}: single/permanent crafting, confirmation, material deduction, owned/insufficient states, skill scroll, Lv1 equip and save`);await context.close();
 }
 const context=await browser.newContext({viewport:{width:568,height:320}}),page=await context.newPage();
 await page.route('**/game-bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:fixtureSource(true)}));await page.goto(base+'?dev=0');
 await page.waitForFunction(()=>globalThis.__night?.snapshot().ui.homeArtworkReady&&!document.getElementById('night-startup'));await press(page,'qm:warehouse',false,false);await settleVisuals(page);
 const legacy=await snapshot(page);assert(!legacy.buttons.some(b=>b.id==='qm:craft'&&!b.disabled),'old service cannot execute unsupported crafting');await context.close();
 assert.deepEqual(evidence.errors,[]);await acceptanceBuild(base);
}catch(error){evidence.failure=String(error);evidence.lastState=await snapshot(currentPage).catch(()=>null);await currentPage?.screenshot({path:fileURLToPath(new URL('failure.png',out))}).catch(()=>{});throw error;}
finally{await browser.close();await writeFile(new URL('evidence.json',out),JSON.stringify(evidence,null,2));}
console.log(JSON.stringify({checks:evidence.checks,screens:evidence.screens.length,errors:evidence.errors}));
