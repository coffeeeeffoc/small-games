import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assetFixture } from './progression-fixture.ts';
import { acceptanceBuild, snapshot, assertLayout, press, settleVisuals, navigateMap, aimAt } from './flight-browser.mjs';

const base=process.env.NIGHT_URL,build=await acceptanceBuild(base);
const out=new URL('../reports/2026-11-01-volley-balance/',import.meta.url);await mkdir(out,{recursive:true});
const evidence={build,fixture:true,checks:[],screens:[],errors:[]};
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
function fixture(assets){return `
const assets=JSON.parse(localStorage.getItem('loadout-qa-assets')||'null')||${JSON.stringify(assets)};
const metadata={identity:{playerId:assets.playerId,nickname:'夜航07'},capabilities:{multiplayer:false,leaderboards:false}};
globalThis.__loadoutQA={calls:[]};
globalThis.SmallGamesServices={ready:Promise.resolve(metadata),refresh:async()=>metadata,services:{
nightAssets:async()=>structuredClone(assets),nightAssetCommand:async c=>{
  __loadoutQA.calls.push(structuredClone(c));let receipt={kind:c.kind,requestId:c.requestId};
  if(c.kind==='loadout')assets.loadouts[c.mode]=structuredClone(c.loadout);
  if(c.kind==='checkin'){assets.signedToday=true;assets.signedDays.push(assets.day);assets.inventory['pack:general:0']++;assets.available['pack:general:0']++;receipt.reward={coins:100,xp:40,packs:1};}
  if(c.kind==='open'){assets.inventory[c.item]-=c.quantity;assets.available[c.item]-=c.quantity;receipt={...receipt,item:c.item,quantity:c.quantity,drops:[{item:'power-match'},{coins:40}]};assets.openReceipts.unshift({...receipt,at:Date.now()});}
  assets.revision++;assets.lastReceipt=receipt;localStorage.setItem('loadout-qa-assets',JSON.stringify(assets));return structuredClone(assets);
},leaderboard:async()=>({top:[],me:null})},createRecorder:()=>({start:async()=>null,record(){},finish:async()=>null,invalidate(){}})};`;}
try{
  for(const [width,height,touch]of [[568,320,true],[800,366,true],[844,390,true],[1280,720,false]]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});
    const page=await context.newPage(),cdp=await context.newCDPSession(page);
    page.setDefaultTimeout(45000);page.on('pageerror',e=>evidence.errors.push(e.message));
    const assets=assetFixture();assets.coins=1897300;
    await page.route('**/game-bootstrap.js',route=>route.fulfill({contentType:'text/javascript',body:fixture(assets)}));
    await page.route('**/api/competition/**',route=>route.abort());
    await page.goto(base+'?dev=1');
    await page.waitForFunction(()=>globalThis.__night?.snapshot().ui.interfaceArtworkReady&&!document.getElementById('night-startup')&&__night.snapshot().progression.assets);
    const click=async id=>{await press(page,id,touch,false);await page.waitForFunction(()=>!__night.snapshot().progression.busy);};
    const point=async(x,y)=>page.evaluate(({x,y})=>{const r=document.querySelector('canvas').getBoundingClientRect(),s=__night.snapshot();return{x:r.left+x/s.ui.width*r.width,y:r.top+y/s.ui.height*r.height};},{x,y});
    const button=async id=>{const b=(await snapshot(page)).buttons.find(b=>b.id===id&&!b.disabled);assert(b,id);return b;};
    const gesture=async(from,to,cancel=false)=>{
      const a=await point(from.x,from.y),b=await point(to.x,to.y);
      if(touch){
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});
        for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*i/8,y:a.y+(b.y-a.y)*i/8,id:1}]});await page.waitForTimeout(18);}
        await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
      }else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();}
      await settleVisuals(page);
    };
    const scroll=async()=>{
      const clipped=(await snapshot(page)).buttons.find(b=>b.clip);assert(clipped,'scroll viewport');const a=clipped.clip;
      const from={x:a.x+a.w*.5,y:a.y+a.h*.8};
      if(touch)await gesture(from,{x:from.x,y:from.y-52});
      else{const p=await point(from.x,from.y);await page.mouse.move(p.x,p.y);await page.mouse.wheel(0,300);await settleVisuals(page);}
    };
    const findGear=async(id)=>{for(let i=0;i<12;i++){const b=(await snapshot(page)).buttons.find(b=>b.id===id&&!b.disabled&&b.h>=40);if(b)return b;await scroll();}assert.fail('Cannot scroll to '+id);};
    const shot=async name=>{
      await settleVisuals(page);const s=await snapshot(page);
      assertLayout({...s,buttons:s.buttons.filter(b=>!b.disabled)},s.ui.width,s.ui.height);
      await page.screenshot({path:fileURLToPath(new URL(`${name}-${width}.png`,out))});evidence.screens.push({name,width,height});
    };
    await shot('home-coins');await click('qm:loadout');await shot('loadout');
    assert(!(await snapshot(page)).buttons.some(b=>b.id==='qm:chooseNext'||b.id==='qm:choosePrev'));
    await click('slot:weapon');
    assert((await snapshot(page)).buttons.filter(b=>b.id.startsWith('equip:')).every(b=>/drone|laser/.test(b.id)));
    await findGear('equip:laser-match');await click('equip:laser-match');
    let s=await snapshot(page);assert.equal(s.progression.draft.weapon,'laser-match');assert.equal(s.progression.assets.loadouts.solo.weapon,'drone-match');
    await click('qm:unequip');assert.equal((await snapshot(page)).progression.draft.weapon,null);
    const from=await findGear('gear:laser-match'),to=await button('slot:weapon');
    const a={x:from.x+from.w/2,y:from.y+from.h/2},b={x:to.x+to.w/2,y:to.y+to.h/2};
    if(touch){await gesture(a,b,true);assert.equal((await snapshot(page)).progression.draft.weapon,null,'cancelled drag never equips');}
    await gesture(a,b);assert.equal((await snapshot(page)).progression.draft.weapon,'laser-match','drop replaces the chosen slot');
    await click('slot:skill');await findGear('equip:emp-match');await click('equip:emp-match');
    await click('slot:mod:0');const beforeScroll=(await snapshot(page)).progression.draft;
    await scroll();assert((await snapshot(page)).progression.scroll>0);assert.deepEqual((await snapshot(page)).progression.draft,beforeScroll,'scroll never equips');
    await shot('selected-scroll');await click('qm:save');assert.equal((await snapshot(page)).progression.dirty,false);
    assert.equal((await snapshot(page)).progression.assets.available['burst-match'],5,'saving consumes no stock');
    await click('loadout:duel');await click('slot:mod:1');
    const gear=await findGear('gear:power-permanent'),target=await button('slot:mod:1');
    await gesture({x:gear.x+gear.w/2,y:gear.y+gear.h/2},{x:target.x+target.w/2,y:target.y+target.h/2});
    s=await snapshot(page);assert.match(s.buttons.find(b=>b.id==='slot:mod:1').text,/威力/);assert.match(s.buttons.find(b=>b.id==='slot:mod:0').text,/选择/);assert.deepEqual(s.progression.assets.loadouts.duel.mods,[]);
    await click('qm:back');assert.equal((await snapshot(page)).progression.leaveTo,'');await click('qm:keepEditing');await click('qm:save');
    await click('loadout:solo');assert.deepEqual((await snapshot(page)).progression.draft.mods,['burst-match','twin-match']);
    await click('qm:back');await click('qm:checkin');await click('qm:checkinClaim');await shot('gift-detail');
    assert.deepEqual((await snapshot(page)).progression.gift.packs,{'pack:general:0':1});
    await click('qm:giftOpen');assert((await snapshot(page)).progression.gift.opened);assert.equal((await snapshot(page)).progression.gift.drops.length,2);await shot('gift-opened');await click('qm:giftClose');await click('qm:back');
    await click('qm:modes');await click('mode:training');await click('mode:enter');await page.waitForFunction(()=>__night.snapshot().phase==='playing');
    s=await snapshot(page);assert.deepEqual(s.loadout.effects,['burst','twin','laser','emp']);
    await click('weapon2');s=await snapshot(page);const enemy=s.units.find(u=>!u.friendly&&u.hp>0);
    await navigateMap(page,enemy,touch);await aimAt(page,enemy,touch);
    const before=await snapshot(page);
    // Desktop aim follows the moving camera; sample it at the real firing input, not an earlier frame.
    if(!touch)await page.evaluate(()=>window.addEventListener('keydown',event=>{
      if(event.code==='Space')globalThis.__volleyFireAim=structuredClone(__night.snapshot().aim);
    },{capture:true,once:true}));
    if(touch)await click('fire');else await page.keyboard.press('Space');
    await page.waitForFunction(fired=>__night.snapshot().fired>=fired+4,before.fired);
    s=await snapshot(page);assert.equal(s.fired-before.fired,4);assert.equal(before.guns[2].ammo-s.guns[2].ammo,1);assert.equal(s.ammoSpent-before.ammoSpent,1);
    const volley=s.shots.filter(shot=>shot.weapon===2);
    assert.equal(volley.length,4,'Four real projectiles remain in flight');
    assert.deepEqual(volley.map(projectile=>projectile.strength),[1,.6,.6,.6]);
    const fireAim=touch?before.aim:await page.evaluate(()=>globalThis.__volleyFireAim);
    assert(fireAim,'Firing input captures the reticle');
    assert(Math.hypot(volley[0].x-fireAim.x,volley[0].z-fireAim.z)<1e-4,'Primary keeps the reticle landing point');
    assert.equal(new Set(volley.map(shot=>`${shot.x},${shot.z}`)).size,4,'Each projectile has a distinct landing point');
    const [first,second,third]=volley;
    assert(Math.abs((second.x-first.x)*(third.z-first.z)-(second.z-first.z)*(third.x-first.x))>1,'Combined upgrades cover a two-dimensional area');
    evidence.checks.push({width,height,ammoSpent:s.ammoSpent-before.ammoSpent,fireAim,spread:volley.map(({x,z,born,strength})=>({x,z,born,strength}))});
    await shot('spread-flight');
    const shotIds=volley.map(projectile=>projectile.id);
    await page.waitForFunction(ids=>ids.every(id=>__night.snapshot().impacts.some(impact=>impact.shot===id)),shotIds);
    const impacts=(await snapshot(page)).impacts.filter(impact=>shotIds.includes(impact.shot));
    assert.equal(new Set(impacts.map(impact=>`${impact.x.toFixed(3)},${impact.z.toFixed(3)}`)).size,4,'Terrain contacts also remain distinct');
    evidence.checks.push({width,height,impacts});await shot('spread-impact');
    await click('battleReport');await click('equipment');assert((await snapshot(page)).equipmentOpen);await shot('battle-equipment');
    await click('equipmentClose');await click('close');await click('skillUse');assert((await snapshot(page)).skill.remaining>0);
    await click('settings');await click('home');await click('exitConfirm');
    await click('qm:modes');await click('mode:duel');await click('mode:enter');await click('online:bot');
    await page.waitForFunction(()=>__night.snapshot().online.active&&!__night.snapshot().modal);
    s=await snapshot(page);assert.deepEqual(s.loadout.effects,['power']);assert.deepEqual(s.enemyEquipment.loadout.effects,[]);
    await click('battleReport');await click('equipment');await shot('duel-equipment');
    const time=(await snapshot(page)).time;await page.waitForTimeout(700);assert((await snapshot(page)).time>time,'equipment view keeps the battle live');
    await page.reload();await page.waitForFunction(()=>globalThis.__night?.snapshot().progression.assets&&!document.getElementById('night-startup'));
    assert.equal((await snapshot(page)).progression.assets.loadouts.solo.weapon,'laser-match');
    evidence.checks.push({width,height,touch,shots:4,draft:true,drag:true,cancel:touch,scroll:true,gifts:true,reload:true});await context.close();
  }
  assert.deepEqual(evidence.errors,[]);
}finally{await browser.close();await writeFile(new URL('evidence.json',out),JSON.stringify(evidence,null,2));}
console.log(JSON.stringify(evidence.checks));
