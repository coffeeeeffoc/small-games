import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {assetFixture} from './progression-fixture.ts';
import {ECONOMY} from '../assets/scripts/core/Progression.ts';
import {acceptanceBuild,snapshot,press,settleVisuals,assertLayout} from './flight-browser.mjs';
import {scrollPage} from './scroll-helpers.mjs';
const base=process.env.NIGHT_URL??'http://localhost:4318',out=new URL('../reports/garrison-ui/',import.meta.url);
await mkdir(out,{recursive:true});
const evidence={build:await acceptanceBuild(base),environment:'QA service fixtures; real Creator canvas and pointer/touch input; no public writes',screens:[],checks:[],errors:[]};
const assets=assetFixture();assets.economy=ECONOMY;
assets.achievements=Array.from({length:12},(_,i)=>({id:'qa-achievement-'+i,event:i%3===2?'checkin':i%3?'win':'complete',name:['累计行动','累计胜利','累计签到'][i%3],target:[250,100,30][i%3],progress:i?12:250,claimed:false,reward:{coins:300,xp:100}}));
const drops=[{coins:260},{xp:80},{item:'laser-match'},{item:'tracking-match'},...Array.from({length:5},()=>({item:'fragment:weapon'})),{item:'fragment:skill'}];
const source=`const assets=${JSON.stringify(assets)},drops=${JSON.stringify(drops)},meta={identity:{playerId:assets.playerId,nickname:'UI QA'},capabilities:{multiplayer:true,leaderboards:true,chat:false}};
globalThis.__garrisonUICommands=[];globalThis.SmallGamesServices={ready:Promise.resolve(meta),refresh:async()=>meta,services:{nightAssets:async()=>structuredClone(assets),nightAssetCommand:async c=>{__garrisonUICommands.push(c);assets.lastReceipt={};if(c.kind==='checkin'){assets.signedToday=true;assets.lastReceipt={reward:{coins:100,xp:40},items:{'laser-match':1}};}if(c.kind==='open'){assets.lastReceipt={drops};assets.openReceipts.unshift({requestId:c.requestId,item:c.item,quantity:c.quantity,at:Date.now(),drops});}if(c.kind==='claim-achievement')assets.achievements.find(a=>a.id===c.id).claimed=true;assets.revision++;return structuredClone(assets);},listRooms:async()=>({rooms:[]}),leaderboard:async()=>({top:[],me:null})},createRecorder:()=>({start:async()=>null,record(){},finish:async()=>null,invalidate(){}})};`;
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});let page;
const cases=process.env.NIGHT_UI_SMOKE==='1'?[[568,320,'zh',52]]:[[568,320,'zh',0],[568,320,'en',0],[844,390,'zh',0],[844,390,'en',0],[1280,720,'zh',0],[1280,720,'en',0],[568,320,'zh',52],[844,390,'en',52]];
try{for(const [width,height,lang,safe] of cases){
  const touch=width<1000,context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});page=await context.newPage();page.setDefaultTimeout(45000);
  if(safe)await context.addInitScript(top=>{globalThis.tap={getWindowInfo:()=>({windowWidth:innerWidth,windowHeight:innerHeight,statusBarHeight:24,safeArea:{top,bottom:innerHeight,left:0,right:innerWidth}}),getMenuButtonBoundingClientRect:()=>({left:innerWidth-104,right:innerWidth-12,top:16,bottom:48})};},safe);
  page.on('pageerror',e=>evidence.errors.push(e.message));await page.route('**/game-bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:source}));await page.route('**/api/competition/**',r=>r.abort());
  await page.goto(base+'?dev=0');await page.waitForFunction(()=>globalThis.__night?.snapshot().progression.assets?.economy&&!document.getElementById('night-startup'));
  const click=async id=>{await press(page,id,touch,false);await settleVisuals(page);};
  const capture=async name=>{const state=await snapshot(page);assertLayout(state,width,height);const file=`${name}-${width}-${lang}-safe${safe}.png`;await page.screenshot({path:fileURLToPath(new URL(file,out))});evidence.screens.push(file);};
  if(lang==='en'){await click('settings');await click('language');await click('close');}
  await capture('home');const home=await snapshot(page),hall=home.buttons.find(b=>b.id==='online:menu'&&b.y<safe+60);assert(hall,'top-level lobby entry');
  if(touch)await page.touchscreen.tap(hall.x+hall.w/2,hall.y+hall.h/2);else await page.mouse.click(hall.x+hall.w/2,hall.y+hall.h/2);
  await page.waitForFunction(()=>__night.snapshot().online.panel==='menu');await capture('lobby');await click('online:back');
  await click('qm:shop');
  for(const term of ['match','24h','permanent'])for(const category of ['mod','weapon','skill']){
    await click('term:'+term);await click('qm:shopCategory:'+category);
    const state=await snapshot(page),items=state.buttons.filter(b=>b.id.startsWith('product:'));assert(items.length);
    for(const item of items){const product=assets.catalog.find(p=>p.id===item.id.slice(8));assert.equal(product.category,category);assert.equal(product.term,term);}
    if(term==='match')await capture('shop-'+category);
  }
  if(width<1000){const item=(await snapshot(page)).buttons.find(b=>b.id.startsWith('product:'));await click(item.id);await capture('shop-detail');if((await snapshot(page)).buttons.some(b=>b.id==='qm:list'))await click('qm:list');}
  await click('qm:back');if((await snapshot(page)).progression.page==='shop')await click('qm:back');await click('qm:checkin');await capture('checkin');await click('qm:checkinClaim');
  await page.waitForFunction(()=>__night.snapshot().progression.gift?.opened);await capture('checkin-laser');await click('qm:giftClose');await click('qm:back');
  await click('qm:tasks');await click('tasks:achievements');await capture('achievements');await scrollPage(page,'qm:tasks:achievements');await capture('achievements-scroll');await click('qm:back');
  await click('qm:warehouse');await click('qm:open');await page.waitForTimeout(2500);await capture('bundle');
  const gift=(await snapshot(page)).progression.gift;assert(gift.drops.some(d=>d.xp)&&gift.drops.some(d=>d.coins)&&gift.drops.some(d=>d.item==='fragment:weapon'));
  await scrollPage(page,'qm:gifts');await capture('bundle-scroll');await click('qm:giftClose');await click('qm:receipts');await capture('history');
  evidence.checks.push({width,height,lang,safe,categoryTerms:9,lobbyFromHeader:true,checkinCompleteArtwork:true,bundleContents:true,achievementsScrollable:true});
  await context.close();console.log(`UI ${width}x${height} ${lang} safe${safe} passed`);
}
assert.deepEqual(evidence.errors,[]);await acceptanceBuild(base);
}catch(error){evidence.failure=String(error);if(page)await page.screenshot({path:fileURLToPath(new URL('failure.png',out))}).catch(()=>{});throw error;}
finally{await browser.close();await writeFile(new URL('evidence.json',out),JSON.stringify(evidence,null,2));}
