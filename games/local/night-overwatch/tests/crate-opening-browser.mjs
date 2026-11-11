import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assetFixture } from './progression-fixture.ts';
import { acceptanceBuild, snapshot, press, settleVisuals } from './flight-browser.mjs';

const base=process.env.NIGHT_URL,build=await acceptanceBuild(base);
const out=new URL('../reports/2026-11-12-crate-opening/',import.meta.url);await mkdir(out,{recursive:true});
const assets=assetFixture();assets.inventory={'pack:general:0':10};assets.available={...assets.inventory};
const fixture=`const assets=${JSON.stringify(assets)};globalThis.crateCommands=[];
const metadata={identity:{playerId:assets.playerId,nickname:'夜航07'},capabilities:{multiplayer:false,leaderboards:false}};
globalThis.SmallGamesServices={ready:Promise.resolve(metadata),refresh:async()=>metadata,services:{
nightAssets:async()=>structuredClone(assets),nightAssetCommand:async c=>{
  if(c.kind==='open'){
    if(assets.inventory[c.item]<c.quantity)throw Error('Insufficient fixture crates');
    globalThis.crateCommands.push(c);assets.inventory[c.item]-=c.quantity;assets.available[c.item]-=c.quantity;
    assets.lastReceipt={drops:Array.from({length:c.quantity},()=>({coins:10}))};
  }else if(c.kind==='claim-mail'){
    const mail=assets.mail.find(m=>m.id===c.mailId);mail.read=mail.claimed=true;
    assets.inventory['pack:general:0']+=mail.reward.packs;assets.available['pack:general:0']+=mail.reward.packs;
    assets.lastReceipt={reward:mail.reward};
  }else if(c.kind==='read-mail'){assets.mail.find(m=>m.id===c.mailId).read=true;assets.lastReceipt={};}
  else throw Error('Unexpected command '+c.kind);
  assets.revision++;return structuredClone(assets);
},leaderboard:async()=>({top:[],me:null})},createRecorder:()=>({start:async()=>null,record(){},finish:async()=>null,invalidate(){}})};`;
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
const checks=[];
try{
  for(const reduced of [true,false])for(const [width,height]of [[844,390],[568,320],[1280,720]]){
    const touch=width<1000,prefix=`${reduced?'reduced':'full'}-${width}`;
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,reducedMotion:reduced?'reduce':'no-preference',recordVideo:{dir:fileURLToPath(out),size:{width,height}}});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    try{
      await page.route('**/game-bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:fixture}));
      await page.route('**/api/competition/**',r=>r.abort());await page.route('**/small-games/v1/**',r=>r.abort());
      await page.goto(base+'?dev=0');await page.waitForFunction(()=>globalThis.__night?.snapshot().ui.interfaceArtworkReady&&!document.getElementById('night-startup'));
      const click=id=>press(page,id,touch,false);
      assert.equal((await snapshot(page)).ui.reducedEffects,false,'fresh installs default to full effects even with a system reduced-motion preference');
      if(reduced){await click('settings');await click('effects');await click('close');
        await page.reload();await page.waitForFunction(()=>globalThis.__night?.snapshot().ui.interfaceArtworkReady&&!document.getElementById('night-startup'));
      }
      assert.equal((await snapshot(page)).ui.reducedEffects,reduced,'only the explicitly saved in-game choice enables reduced effects');
      const shot=name=>page.screenshot({path:fileURLToPath(new URL(`${prefix}-${name}.png`,out))});
      const visual=()=>page.evaluate(async()=>{
        const {director,UIOpacity}=await System.import('cc'),names=[];let angle,opacity;
        const walk=n=>{if(!n.activeInHierarchy)return;names.push(n.name);if(n.name==='CrateActor')angle=n.angle;if(n.name==='CrateGlow')opacity=n.getComponent(UIOpacity)?.opacity;n.children.forEach(walk);};
        walk(director.getScene());return {names,angle,opacity};
      });
      for(const entry of ['single','quantity','gift']){
        if(entry==='gift'){await click('qm:inbox');await click('qm:claimMail');await click('qm:giftOpen');}
        else{
          await click('qm:warehouse');await click('inventory:pack:general:0');
          if(entry==='quantity'){await click('qm:plus');await click('qm:plus');}
          await click('qm:open');
        }
        const initial=await snapshot(page),started=initial.progression.gift?.started;
        await shot(`${entry}-closed`);
        assert(started,`${prefix}/${entry}: opening must appear before rewards`);
        assert(!initial.buttons.some(b=>b.id==='qm:giftClose'&&!b.disabled),'no result action during opening');
        const closed=await visual();assert(closed.names.includes('Illustration:closedCrate'));assert(!closed.names.includes('Scroll:qm:gifts'));
        const motion=[];for(let i=0;i<4;i++){motion.push(await visual());await page.waitForTimeout(45);}
        assert(new Set(motion.map(s=>s.angle?.toFixed(1))).size>1,'both modes animate the crate continuously');
        if(reduced){assert(motion.every(s=>Math.abs(s.angle)<3.1),'reduced mode limits shaking');assert(new Set(motion.map(s=>s.opacity)).size>1,'reduced mode animates the glow');}
        await page.waitForFunction(()=>__night.snapshot().progression.gift?.illuminated,null,{timeout:4000});await settleVisuals(page);
        const opened=await visual();assert(opened.names.includes('Illustration:openCrate'));assert(!opened.names.includes('Scroll:qm:gifts'));
        assert.equal(opened.names.includes('CrateFlash'),!reduced,'reduced mode avoids the full-screen flash');
        assert.equal(opened.names.filter(name=>name==='CrateSpark').length,reduced?8:22,'both modes show opening particles');
        await shot(`${entry}-open`);
        await page.waitForFunction(()=>__night.snapshot().progression.gift?.revealed,null,{timeout:4000});await settleVisuals(page);
        const result=await snapshot(page);assert(result.progression.gift.revealed-started>=2200);
        assert(result.buttons.some(b=>b.id==='qm:giftClose'&&!b.disabled));assert((await visual()).names.includes('Scroll:qm:gifts'));
        await shot(`${entry}-rewards`);checks.push({prefix,entry,duration:result.progression.gift.revealed-started});
        await click('qm:giftClose');await click('qm:back');
      }
      assert.deepEqual(await page.evaluate(()=>crateCommands.map(c=>c.quantity)),[1,3,3],'one request per opening, with the chosen quantity');
      assert.deepEqual(errors,[]);
    }finally{await context.close();await page.video().saveAs(fileURLToPath(new URL(`${prefix}.webm`,out)));}
  }
}finally{await browser.close();}
await writeFile(new URL('results.json',out),JSON.stringify({build,fixture:true,checks},null,2));
console.log(`Crate opening before rewards passed: ${checks.length} clicks across three sizes and both motion modes.`);
