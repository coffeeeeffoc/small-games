import {scrollPage,scrollToButton} from './scroll-helpers.mjs';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assetFixture } from './progression-fixture.ts';
import { acceptanceBuild,snapshot,assertLayout,press,settleVisuals } from './flight-browser.mjs';

const base=process.env.NIGHT_URL,build=await acceptanceBuild(base),baseline=process.env.NIGHT_AUDIT_PHASE==='baseline';
const out=new URL(`../reports/2026-11-01-interaction-audit/${baseline?'baseline':'verified'}/`,import.meta.url);await mkdir(out,{recursive:true});
const evidence={build,fixture:true,phase:baseline?'baseline':'verified',checks:[],screens:[],errors:[]};
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
function fixture(assets){return `
const assets=JSON.parse(localStorage.getItem('interaction-audit-assets')||'null')||${JSON.stringify(assets)};
const metadata={identity:{playerId:assets.playerId,nickname:'交互审查'},capabilities:{multiplayer:false,leaderboards:false}};
globalThis.__uiAudit={calls:[],failNextSave:false};
globalThis.SmallGamesServices={ready:Promise.resolve(metadata),refresh:async()=>metadata,services:{nightAssets:async()=>structuredClone(assets),nightAssetCommand:async c=>{
  __uiAudit.calls.push(structuredClone(c));if(c.kind==='loadout'&&__uiAudit.failNextSave){__uiAudit.failNextSave=false;throw Error('QA interrupted save');}
  let receipt={kind:c.kind,requestId:c.requestId};
  if(c.kind==='loadout')assets.loadouts[c.mode]=structuredClone(c.loadout);
  if(c.kind==='buy'){assets.inventory[c.item]=(assets.inventory[c.item]||0)+1;assets.available[c.item]=(assets.available[c.item]||0)+1;}
  if(c.kind==='read-mail')assets.mail.find(m=>m.id===c.mailId).read=true;
  if(c.kind==='claim-mail'){const m=assets.mail.find(m=>m.id===c.mailId);m.claimed=true;assets.inventory['pack:general:0']+=m.reward.packs;assets.available['pack:general:0']+=m.reward.packs;receipt.reward=m.reward;}
  if(c.kind==='checkin'){assets.signedToday=true;assets.signedDays.push(assets.day);assets.inventory['pack:general:0']++;assets.available['pack:general:0']++;receipt.reward={coins:100,xp:40,packs:1};}
  if(c.kind==='buy-packs'){const item='pack:'+c.pool+':0';assets.inventory[item]=(assets.inventory[item]||0)+c.quantity;assets.available[item]=(assets.available[item]||0)+c.quantity;receipt.packs={[item]:c.quantity};}
  if(c.kind==='open'){assets.inventory[c.item]-=c.quantity;assets.available[c.item]-=c.quantity;receipt.drops=[{item:'power-match'},{coins:40}];assets.openReceipts.unshift({...receipt,item:c.item,quantity:c.quantity,at:Date.now()});}
  if(c.kind==='activate'){const p=assets.catalog.find(p=>p.id===c.item);assets.active[p.effect]=Date.now()+86400000;assets.inventory[c.item]--;assets.available[c.item]--;}
  if(c.kind==='claim-task')assets.tasks.find(t=>t.id===c.taskId).claimed=true;
  assets.revision++;assets.lastReceipt=receipt;localStorage.setItem('interaction-audit-assets',JSON.stringify(assets));return structuredClone(assets);
},leaderboard:async()=>({top:[],me:null})},createRecorder:()=>({start:async()=>null,record(){},finish:async()=>null,invalidate(){}})};`;}
const texts=page=>page.evaluate(async()=>{const {director,Label}=await System.import('cc');return director.getScene().getComponentsInChildren(Label).filter(l=>l.node.activeInHierarchy).map(l=>l.string);});
try{
  for(const [width,height]of baseline?[[1280,720]]:[[568,320],[800,366],[1280,720]]){
    const touch=width<1000,context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch}),page=await context.newPage(),cdp=await context.newCDPSession(page);
    page.setDefaultTimeout(45000);page.on('pageerror',e=>evidence.errors.push(e.message));
    await page.route('**/game-bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:fixture(assetFixture())}));
    await page.route('**/api/competition/**',r=>r.abort());
    await page.goto(base+'?dev=0');await page.waitForFunction(()=>globalThis.__night?.snapshot().ui.interfaceArtworkReady&&__night.snapshot().progression.assets&&!document.getElementById('night-startup'));
    const click=async id=>{await press(page,id,touch,false);await page.waitForFunction(()=>!__night.snapshot().progression.busy);await settleVisuals(page);};
    const shot=async name=>{const s=await snapshot(page);assertLayout({...s,buttons:s.buttons.filter(b=>!b.disabled)},s.ui.width,s.ui.height);await page.screenshot({path:fileURLToPath(new URL(`${name}-${width}.png`,out))});evidence.screens.push({name,width,height});};
    const check=(name,pass,detail)=>{evidence.checks.push({name,width,pass,detail});if(!baseline)assert(pass,name+': '+JSON.stringify(detail));};
    const button=async id=>{const b=(await snapshot(page)).buttons.find(b=>b.id===id&&!b.disabled);assert(b,id);return {x:b.x+b.w/2,y:b.y+b.h/2};};
    const point=async p=>page.evaluate(({x,y})=>{const r=document.querySelector('canvas').getBoundingClientRect(),s=__night.snapshot();return{x:r.left+x/s.ui.width*r.width,y:r.top+y/s.ui.height*r.height};},p);
    const gesture=async(from,to,end='end',inspect)=>{
      const a=await point(from),b=await point(to);
      if(touch){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*i/8,y:a.y+(b.y-a.y)*i/8,id:1}]});await page.waitForTimeout(20);}}
      else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});}
      await settleVisuals(page);if(inspect)await inspect();
      if(end==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
      if(touch)await cdp.send('Input.dispatchTouchEvent',{type:end==='cancel'?'touchCancel':'touchEnd',touchPoints:[]});else await page.mouse.up();
      if(end==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await settleVisuals(page);
    };
    await shot('home');
    await click('qm:shop');await scrollPage(page);let s=await snapshot(page),visible=s.buttons.filter(b=>b.id.startsWith('product:')).map(b=>b.id.slice(8));
    await click('product:'+visible[0]);
    await click('qm:buy');const bought=await page.evaluate(()=>__uiAudit.calls.at(-1).item);check('shop pagination keeps preview and purchase on current page',visible.includes(bought),{visible,bought});await shot('shop-page');
    await click('qm:back');if((await snapshot(page)).progression.page==='shop')await click('qm:back');
    await click('qm:warehouse');await scrollPage(page);s=await snapshot(page);visible=s.buttons.filter(b=>b.id.startsWith('inventory:')).map(b=>b.id.slice(10));
    await click('inventory:'+visible[0]);await click('qm:sell');await click('qm:confirm');const sold=await page.evaluate(()=>__uiAudit.calls.at(-1).item);check('warehouse pagination keeps selection and sale on current page',visible.includes(sold),{visible,sold});
    await click('qm:sell');await page.keyboard.down('Escape');await page.keyboard.down('Escape');await page.keyboard.up('Escape');await settleVisuals(page);check('escape including held key dismisses only the sale confirmation',(await snapshot(page)).progression.page==='warehouse',(await snapshot(page)).progression.page);
    if(!baseline&&(await snapshot(page)).buttons.some(b=>b.id==='settings'&&!b.disabled)){await click('settings');await page.keyboard.press('Escape');await settleVisuals(page);s=await snapshot(page);check('escape closes foreground settings and preserves warehouse',s.progression.page==='warehouse'&&s.buttons.some(b=>b.id==='qm:sell'&&!b.disabled));}
    if((await snapshot(page)).progression.page)await click('qm:back');
    await click('qm:loadout');await click('loadout:duel');await click('slot:mod:1');await click('equip:power-permanent');await click('qm:save');
    const before=(await snapshot(page)).buttons.filter(b=>b.id.startsWith('slot:mod:')).map(b=>b.text);await page.reload();await page.waitForFunction(()=>globalThis.__night?.snapshot().progression.assets&&!document.getElementById('night-startup'));
    await click('qm:loadout');await click('loadout:duel');const after=(await snapshot(page)).buttons.filter(b=>b.id.startsWith('slot:mod:')).map(b=>b.text);check('confirmed slot order matches reload',JSON.stringify(before)===JSON.stringify(after),{before,after});
    await shot('loadout-order');
    if(!baseline){
      await click('loadout:solo');const original=(await snapshot(page)).progression.draft;
      const first=await button('slot:mod:0'),second=await button('slot:mod:1');
      await gesture(first,second,'blur');check('blur cancels slot drag',JSON.stringify((await snapshot(page)).progression.draft)===JSON.stringify(original));
      if(touch){await gesture(first,second,'cancel');check('touchcancel never swaps',JSON.stringify((await snapshot(page)).progression.draft)===JSON.stringify(original));}
      await gesture(first,second,'end',async()=>{const current=await snapshot(page);await shot('drag-target');check('compatible drop target highlighted',current.progression.drag?.target==='mod:1',{progression:current.progression,buttons:current.buttons.map(b=>({id:b.id,x:b.x,y:b.y,w:b.w,h:b.h}))});});
      check('equipped mods swap by dragging',JSON.stringify((await snapshot(page)).progression.draft.mods)===JSON.stringify([...original.mods].reverse()));
      const beforeInvalid=(await snapshot(page)).progression.draft;await gesture(await button('slot:mod:1'),await button('slot:weapon'));
      check('incompatible drop leaves configuration intact',JSON.stringify((await snapshot(page)).progression.draft)===JSON.stringify(beforeInvalid));
      await click('slot:mod:0');const clip=(await snapshot(page)).buttons.find(b=>b.clip).clip;
      await gesture({x:clip.x+clip.w/2,y:clip.y+clip.h*.8},{x:clip.x+clip.w/2,y:clip.y+clip.h*.8-56});
      check('vertical scroll never equips',JSON.stringify((await snapshot(page)).progression.draft)===JSON.stringify(beforeInvalid));
      check('vertical list scrolls',(await snapshot(page)).progression.scroll>0);
      await page.evaluate(()=>{__uiAudit.failNextSave=true;});await click('qm:save');s=await snapshot(page);
      check('interrupted save retains draft and disables further edits',s.progression.pending&&s.progression.dirty&&s.buttons.find(b=>b.id==='qm:unequip')?.disabled);
      await click('qm:back');s=await snapshot(page);check('uncertain save offers explicit keep-request exit',s.progression.leaveTo===''&&s.buttons.some(b=>b.id==='qm:leavePending'&&!b.disabled)&&!s.buttons.some(b=>b.id==='qm:discard'&&!b.disabled));
      const callsBeforeLeaving=await page.evaluate(()=>__uiAudit.calls.length);await shot('save-pending');await click('qm:leavePending');s=await snapshot(page);check('pending save never traps the player in loadout',s.progression.page===''&&s.progression.pending);
      await click('qm:loadout');s=await snapshot(page);check('returning keeps the draft without automatically resending',s.progression.dirty&&s.progression.pending&&await page.evaluate(()=>__uiAudit.calls.length)===callsBeforeLeaving);
      await click('qm:retry');const saves=await page.evaluate(()=>__uiAudit.calls.filter(c=>c.kind==='loadout'));
      check('retry confirms the original save without new transaction',saves.at(-1).requestId===saves.at(-2).requestId&&!(await snapshot(page)).progression.dirty);
      await click('loadout:duel');
      await click('slot:mod:0');await click('qm:unequip');await click('loadout:solo');await click('slot:weapon');await click('qm:unequip');
      s=await snapshot(page);const tabs=s.buttons.filter(b=>b.id.startsWith('loadout:'));check('both dirty loadout tabs are marked',tabs.every(b=>b.text.includes('•')),tabs.map(b=>b.text));
      await click('qm:back');check('leave dialog names both drafts',(await texts(page)).some(t=>t.includes('单人方案')&&t.includes('双人方案')),await texts(page));
      await page.keyboard.press('Escape');await settleVisuals(page);check('escape returns to draft editing',(await snapshot(page)).progression.leaveTo===undefined);
      await click('qm:save');await click('loadout:duel');await click('qm:save');await click('qm:back');
      await click('qm:warehouse');for(let i=0;i<12&&!(await snapshot(page)).buttons.some(b=>b.id==='inventory:emp-match');i++)await scrollPage(page);
      await click('inventory:emp-match');await click('qm:loadout');check('warehouse opens matching skill slot',(await snapshot(page)).progression.slot==='skill');await click('qm:back');check('nested loadout returns to its warehouse source',(await snapshot(page)).progression.page==='warehouse');await click('qm:back');
      await click('qm:checkin');await click('qm:checkinClaim');check('claim shows crate details',!!(await snapshot(page)).progression.gift?.packs);await shot('gift-detail');
      await click('qm:giftOpen');check('open all shows the actual received contents',(await snapshot(page)).progression.gift?.drops.length===2);await shot('gift-opened');if((await snapshot(page)).buttons.some(b=>b.id==='qm:giftSkip'))await click('qm:giftSkip');
      const info=await button('info:power-match');await gesture(info,info,'end',async()=>{await page.waitForTimeout(550);check('long press in a reward list opens the item explanation',(await snapshot(page)).buttons.some(b=>b.id==='qm:infoClose'&&!b.disabled));});await page.keyboard.press('Escape');await settleVisuals(page);s=await snapshot(page);check('back closes explanation before the underlying reward',s.progression.gift?.opened&&!s.buttons.some(b=>b.id==='qm:infoClose'),{gift:s.progression.gift,buttons:s.buttons.map(b=>b.id)});
      await click('qm:giftWarehouse');await click('qm:back');await click('qm:back');
    }else{await click('qm:back');}
    for(const [id,name]of [['modes','modes'],['growth','growth'],['tasks','tasks'],['inbox','inbox'],['checkin','checkin'],['supply','supply']]){await click('qm:'+id);await shot(name);await click('qm:back');}
    await context.close();
  }
  assert.deepEqual(evidence.errors,[]);
}finally{await browser.close();await writeFile(new URL('evidence.json',out),JSON.stringify(evidence,null,2)+'\n');}
console.log(JSON.stringify(evidence.checks));
