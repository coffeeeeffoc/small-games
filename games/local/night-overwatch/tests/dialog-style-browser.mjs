import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { assetFixture } from './progression-fixture.ts';
import { acceptanceBuild, snapshot, assertLayout } from './flight-browser.mjs';
import { press, settleVisuals } from './visual-helpers.mjs';
import { scrollPage } from './scroll-helpers.mjs';

const base=process.env.NIGHT_URL;
await acceptanceBuild(base);
const out=new URL('../reports/2026-11-02-dialogs/',import.meta.url);await mkdir(out,{recursive:true});
const assets=assetFixture();
const fixture=`const assets=${JSON.stringify(assets)};const metadata={identity:{playerId:assets.playerId,nickname:'夜航07'},capabilities:{multiplayer:false,leaderboards:false}};globalThis.SmallGamesServices={ready:Promise.resolve(metadata),refresh:async()=>metadata,services:{nightAssets:async()=>structuredClone(assets),nightAssetCommand:async()=>structuredClone(assets),leaderboard:async()=>({top:[],me:null})},createRecorder:()=>({start:async()=>null,record(){},finish:async()=>null,invalidate(){}})};`;
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
try{
  for(const [width,height] of [[568,320],[1280,720]]){
    const touch=width<1000,context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/game-bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:fixture}));
    await page.route('**/api/competition/**',r=>r.abort());
    await page.goto(base+'?dev=0');await page.waitForFunction(()=>globalThis.__night?.snapshot().progression.assets&&!document.getElementById('night-startup'));
    const click=async id=>{await press(page,id,touch,false);await settleVisuals(page);};
    const shot=async name=>{const s=await snapshot(page);assertLayout({...s,buttons:s.buttons.filter(b=>!b.disabled)},s.ui.width,s.ui.height);await page.screenshot({path:new URL(`${name}-${width}.png`,out).pathname.replace(/^\/(\w:)/,'$1')});};
    await click('qm:loadout');await shot('loadout');
    const art=await page.evaluate(async()=>{const {director,Sprite}=await System.import('cc');return director.getScene().getComponentsInChildren(Sprite).filter(s=>s.node.activeInHierarchy).map(s=>s.node.name);});
    for(const key of ['powerGear','burst','twin'])assert(art.some(name=>name==='Illustration:'+key||name==='Illustration:'+key+'-Art'),key+' has its own artwork');
    await click('info:burst-match');await shot('item');
    let s=await snapshot(page);assert(s.scrollLists.find(l=>l.key==='qm:info'));assert(s.buttons.find(b=>b.id==='qm:infoClose'&&!b.disabled));assert(s.buttons.find(b=>b.id==='qm:back')?.disabled);
    await click('qm:infoClose');await click('slot:mod:0');await click('qm:unequip');await click('qm:back');await shot('unsaved');
    assert((await snapshot(page)).buttons.find(b=>b.id==='qm:keepEditing'&&!b.disabled));await click('qm:discard');await click('qm:supply');await click('info:pool');await shot('pool');
    s=await snapshot(page);const list=s.scrollLists.find(l=>l.key==='qm:info');assert(list);if(list.max>0){const scrolled=await scrollPage(page,'qm:info');assert(scrolled.scrollLists.find(l=>l.key==='qm:info').offset>0);await shot('pool-scroll');}
    await click('qm:infoClose');await click('qm:back');await click('qm:warehouse');await click('qm:sell');await shot('confirm');
    assert((await snapshot(page)).buttons.find(b=>b.id==='qm:confirm'&&!b.disabled));await click('qm:cancel');
    assert.deepEqual(errors,[]);await context.close();
  }
}finally{await browser.close();}
console.log('Equipment icons and shared dialogs: two landscape viewports passed.');
