import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assetFixture } from './progression-fixture.ts';
import { ECONOMY } from '../assets/scripts/core/Progression.ts';
import { acceptanceBuild, snapshot, assertLayout } from './flight-browser.mjs';
import { press, settleVisuals } from './visual-helpers.mjs';

// 2026-11-11 polish: home announcement ticker, shop tab hierarchy, wheel face, crate opening and dialog footers.
const base=process.env.NIGHT_URL;await acceptanceBuild(base);
const out=new URL('../reports/2026-11-11-polish/',import.meta.url);await mkdir(out,{recursive:true});
const assets=assetFixture();assets.wheelTickets=2;assets.economy=ECONOMY;
assets.announcements=[{id:'news-1',title:'周末双倍经验',body:'本周六、周日全天，单人关卡与双人对战经验翻倍。',createdAt:Date.now()},...assets.announcements];
const release={currentBuildId:'night-preview',latestBuildId:'night-next',update:'optional',canStartNewGames:true,admissions:{ranked:true,multiplayer:true},action:'reopen'};
const fixture=`const assets=${JSON.stringify(assets)};const metadata={identity:{playerId:assets.playerId,nickname:'夜航07'},capabilities:{multiplayer:false,leaderboards:false},release:${JSON.stringify(release)}};
globalThis.SmallGamesServices={ready:Promise.resolve(metadata),refresh:async()=>metadata,services:{nightAssets:async()=>structuredClone(assets),nightAssetCommand:async c=>{
  if(c.kind==='claim-mail'){const m=assets.mail.find(m=>m.id===c.mailId);m.read=m.claimed=true;assets.lastReceipt={reward:m.reward};}
  else if(c.kind==='read-mail'){assets.mail.find(m=>m.id===c.mailId).read=true;assets.lastReceipt={};}
  else if(c.kind==='open')assets.lastReceipt={drops:[{coins:120},{xp:60},{item:'fragment:weapon'},{item:'laser-24h'},{item:'twin-match'}]};
  else throw Error('Unexpected command '+c.kind);
  assets.revision++;return structuredClone(assets);},leaderboard:async()=>({top:[],me:null})},createRecorder:()=>({start:async()=>null,record(){},finish:async()=>null,invalidate(){}})};`;
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
try{
  for(const [width,height]of [[844,390],[568,320],[1280,720]]){
    const touch=width<1000,context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/game-bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:fixture}));await page.route('**/api/competition/**',r=>r.abort());
    await page.goto(base+'?dev=0');await page.waitForFunction(()=>globalThis.__night?.snapshot().progression.assets&&!document.getElementById('night-startup'));
    const click=async id=>{await press(page,id,touch,false);await settleVisuals(page);};
    const raw=name=>page.screenshot({path:fileURLToPath(new URL(`${name}-${width}.png`,out))});
    const shot=async name=>{const s=await snapshot(page);assertLayout({...s,buttons:s.buttons.filter(b=>!b.disabled)},s.ui.width,s.ui.height);await raw(name);return s;};
    const nodes=names=>page.evaluate(async names=>{const {director}=await System.import('cc');const found={};const walk=n=>{if(names.includes(n.name)&&n.activeInHierarchy)found[n.name]={x:n.position.x,angle:n.angle};n.children.forEach(walk);};walk(director.getScene());return found;},names);

    // Home: the ticker is present, tappable and actually moving.
    let s=await shot('home');assert(s.buttons.some(b=>b.id==='qm:announcements'&&!b.disabled),'home shows the announcement strip');
    const before=(await nodes(['TickerText'])).TickerText;await page.waitForTimeout(400);const after=(await nodes(['TickerText'])).TickerText;
    assert(before&&after&&after.x<before.x-5,'announcement text scrolls left');
    assert(!s.buttons.some(b=>b.id==='online:dismiss'),'no corner close button');
    await click('qm:announcements');s=await shot('news');assert.equal(s.progression.page,'inbox');await click('qm:back');

    // Dialog footers: lobby-style panel and progression dialogs.
    await click('online:version');s=await shot('dialog-version');assert(!s.buttons.some(b=>b.id==='online:dismiss'));assert(s.buttons.some(b=>b.id==='online:back'&&!b.disabled));await click('online:back');
    await click('online:profile');await shot('dialog-profile');await click('online:back');

    await click('qm:shop');await shot('shop');await click('qm:shopCategory:weapon');await shot('shop-weapon');await click('qm:back');
    await click('qm:supply');await shot('wheel');await click('info:wheel');await shot('dialog-info');await click('qm:infoClose');await click('qm:back');
    await click('qm:warehouse');await click('qm:sell');await shot('dialog-confirm');await click('qm:cancel');await click('qm:back');

    // Mail compensation → pending crates → open all: closed crate rattles, bursts open, then lists the loot.
    await click('qm:inbox');await click('qm:claimMail');s=await shot('gift-pending');assert.deepEqual(s.progression.gift.packs,{'pack:general:0':3});
    const started=Date.now();await press(page,'qm:giftOpen',touch,false);
    await page.waitForFunction(()=>__night.snapshot().progression.gift?.started);
    const stage=async()=>Object.keys(await nodes(['Illustration:closedCrate','Illustration:openCrate','CrateFlash','CrateRays']));
    await page.waitForTimeout(350);let seen=await stage();assert(seen.includes('Illustration:closedCrate')&&!seen.includes('Illustration:openCrate'),'crate stays closed while it rattles');
    const shake=[];for(let i=0;i<6;i++){shake.push((await nodes(['CrateActor'])).CrateActor?.angle??0);await page.waitForTimeout(45);}assert(new Set(shake.map(a=>a.toFixed(1))).size>2,'closed crate visibly shakes');await raw('crate-1-rattle');
    await page.waitForFunction(()=>__night.snapshot().progression.gift?.illuminated,null,{timeout:4000});await page.waitForTimeout(90);await raw('crate-2-burst');
    seen=await stage();assert(seen.includes('Illustration:openCrate')&&!seen.includes('Illustration:closedCrate'),'lid is open after the burst');
    await page.waitForTimeout(400);await raw('crate-3-open');
    await page.waitForFunction(()=>{const g=__night.snapshot().progression.gift;return g?.opened&&!g.started;},null,{timeout:5000});assert(Date.now()-started>=2000,'opening is long enough to read');
    await settleVisuals(page);await page.waitForTimeout(500);s=await shot('gift-rewards');assert.equal(s.progression.gift.drops.length,5);
    await click('qm:giftClose');await click('qm:back');
    assert.deepEqual(errors,[]);await context.close();
  }
}finally{await browser.close();}
console.log('Ticker, shop tabs, wheel face, crate opening sequence and dialog footers passed at three sizes.');
