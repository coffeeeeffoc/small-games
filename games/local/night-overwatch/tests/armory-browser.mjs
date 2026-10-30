import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const [baseArg,outArg,hashArg] = process.argv.slice(2);
assert(baseArg && outArg, 'node armory-capture.mjs <http://localhost:port/> <new-output-dir> <source-hash>');
const base = new URL(baseArg);assert(['localhost','127.0.0.1','[::1]'].includes(base.hostname),'Local Creator preview only');
process.env.NIGHT_URL=base.href;process.env.NIGHT_EXPECTED_SOURCE_HASH=hashArg || process.env.NIGHT_EXPECTED_SOURCE_HASH || '';
const repo=path.resolve(process.env.SMALL_GAMES_REPO || '.'), tests=path.join(repo,'games/local/night-overwatch/tests');
const req=createRequire(path.join(repo,'package.json')), {chromium}=req('@playwright/test');
const {acceptanceBuild,snapshot,assertLayout,aimAt,navigateMap}=await import(pathToFileURL(path.join(tests,'flight-browser.mjs')));
const {press,settleVisuals}=await import(pathToFileURL(path.join(tests,'visual-helpers.mjs')));
const build=await acceptanceBuild(base.href),out=path.resolve(outArg),qa=path.join(out,'qa'),media=path.join(out,'gameplay');
await mkdir(out,{recursive:true});assert.equal((await readdir(out)).length,0,'Use a fresh output directory');
await mkdir(qa);await mkdir(media);
const evidence={build,environment:'Creator Web-mobile, local Chromium (touch emulated on narrow screens), backend and all external requests blocked',screens:[],checks:[],errors:[]};
const ff=(bin,args)=>{const value=spawnSync(bin,args,{encoding:'utf8',windowsHide:true});assert.equal(value.status,0,value.error?.message||value.stderr);return value.stdout};
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:process.platform==='win32'?{channel:'msedge'}:{}),args:process.platform==='win32'?['--use-angle=d3d11']:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let page;
try{
 for(const [width,height] of [[568,320],[844,390],[1280,720]]){
  const touch=width!==1280,c=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1,serviceWorkers:'block'});
  await c.route('**/*',r=>{const u=new URL(r.request().url());return ['http:','https:'].includes(u.protocol)&&(u.origin!==base.origin||/\/(?:api|small-games\/v1)(?:\/|$)/.test(u.pathname))?r.abort():r.continue()});
  // Only skip the existing first-run tutorial; never inject a wallet, score or unlock.
  await c.addInitScript(()=>localStorage.setItem('night-overwatch-coach-v2','done'));
  page=await c.newPage();page.setDefaultTimeout(45000);
  page.on('pageerror',e=>evidence.errors.push(e.message));
  const gameURL=new URL(base);gameURL.searchParams.set('dev','0');
  await page.goto(gameURL.href);await page.waitForFunction(()=>globalThis.__night?.snapshot().ui.interfaceArtworkReady&&__night.snapshot().ui.homeArtworkReady&&__night.snapshot().visualMaterialStatus==='ready'&&!document.getElementById('night-startup'),null,{timeout:120000});
  const shot=async(name,menu=true)=>{await settleVisuals(page);const s=await snapshot(page);if(menu)assertLayout(s,width,height);
    await page.screenshot({path:path.join(qa,name+'-'+width+'.png')});evidence.screens.push({name,width,height,modal:s.modal});return s};
  const click=async(id)=>{const b=(await snapshot(page)).buttons.find(b=>b.id===id);assert(b&&!b.disabled,'Missing/disabled '+id);await press(page,id,touch,false)};
  const ids=s=>s.buttons.map(b=>b.id),waitPage=name=>page.waitForFunction(name=>__night.snapshot().armory?.page===name,name);
  let s=await shot('01-cover');assert.deepEqual(ids(s),['armory:base']);
  await click('armory:base');await waitPage('base');s=await shot('02-base');assert(ids(s).includes('armory:shop')&&ids(s).includes('armory:duel'));
  await click('armory:shop');await waitPage('shop');await click('armory:select:spread');s=await shot('03-shop');
  assert(s.buttons.find(b=>b.id==='armory:buy').disabled,'Fresh wallet cannot afford dispersal');
  await click('armory:base');await click('armory:daily');await waitPage('daily');s=await shot('04-daily');
  if(s.armory.available){const old=s.armory.coins;assert(!s.armory.checkedIn);await click('armory:checkin');await page.waitForFunction(old=>__night.snapshot().armory.coins===old+60&&__night.snapshot().armory.checkedIn,old);assert((await snapshot(page)).buttons.find(b=>b.id==='armory:checkin').disabled)}
  else assert(s.buttons.find(b=>b.id==='armory:checkin').disabled);
  assert(!(await snapshot(page)).armory.adsAvailable,'No live ad inventory in offline capture');
  await click('armory:base');await click('armory:duel');await waitPage('loadout');s=await shot('05-duel-kit');assert.equal(s.armory.mode,'duel');
  await click('armory:slot:0');await click('armory:toggle');s=await snapshot(page);assert.equal(s.armory.kits.duel.length,2);assert.equal(s.armory.kits.solo.length,3);
  await click('armory:next');await page.waitForFunction(()=>__night.snapshot().online.panel==='menu');await shot('06-lobby');
  await click('online:back');await page.waitForFunction(()=>!__night.snapshot().online.panel);
  if((await snapshot(page)).armory.page!=='base') await click('armory:base');
  await click('armory:solo');await waitPage('loadout');s=await shot('07-solo-kit');assert.equal(s.armory.kits.solo.length,3);
  await click('armory:next');await page.waitForFunction(()=>__night.snapshot().modal==='missions');await shot('08-missions');
  await click('start');await page.waitForFunction(()=>__night.snapshot().phase==='playing'&&!__night.snapshot().modal);
  s=await snapshot(page);assert.equal(s.loadout.length,3);assert.equal(s.guns[1].ammo,120);
  const locate=async(target)=>{await navigateMap(page,target,touch);await aimAt(page,target,touch)};
  if(touch){const target=s.units.find(u=>!u.friendly&&u.hp>0);assert(target);await locate(target);await click('fire');await page.waitForFunction(()=>__night.snapshot().fired>0);
    await shot('09-combat',false);
  } else {
   // Start recording at the battlefield; no menus, store or ad panes enter the clip.
   await click('weapon0');const target=s.units.find(u=>!u.friendly&&u.hp>0);assert(target);await locate(target);
   await page.evaluate(()=>{const canvas=document.querySelector('canvas'),stream=canvas.captureStream(30);
    const mime=['video/webm;codecs=vp8','video/webm;codecs=vp9','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    if(!mime)throw Error('Missing Chromium MediaRecorder');const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5000000}),chunks=[];
    const done=new Promise((resolve,reject)=>{rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};rec.onerror=e=>reject(e.message||'recorder failed');rec.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const rd=new FileReader();rd.onload=()=>resolve(rd.result.split(',')[1]);rd.onerror=reject;rd.readAsDataURL(new Blob(chunks,{type:mime}))}});
    globalThis.__stopArmoryCapture=()=>{rec.stop();return done};rec.start(500);});
   const started=Date.now(),initial=(await snapshot(page)).fired;let shots=0;
   while(Date.now()-started<18500){s=await snapshot(page);assert.equal(s.phase,'playing');assert.equal(s.modal,'');
    const live=s.units.filter(u=>!u.friendly&&u.hp>0);assert(live.length);const target=live[Math.floor(shots/3)%live.length];await locate(target);
    if(shots===3)await click('weapon1');else if(shots===4)await click('weapon0');
    await page.mouse.down();await page.waitForTimeout(140);await page.mouse.up();
    if([0,3,5].includes(shots)){const file='combat-'+(shots===0?'01-aim':shots===3?'02-he-shot':'03-engage')+'.jpg';
      await page.screenshot({path:path.join(media,file),type:'jpeg',quality:88});assert((await stat(path.join(media,file))).size<4*1024*1024);}
    shots++;await page.waitForTimeout(400);
   }
   const video=path.join(media,'combat-source.webm'),mp4=path.join(media,'combat-1280x720.mp4');
   const bytes=Buffer.from(await page.evaluate(()=>globalThis.__stopArmoryCapture()),'base64');await writeFile(video,bytes);
   assert(shots>=6&&(await snapshot(page)).fired>initial,'Real fire and three captured battle moments');
   ff(process.env.FFMPEG||'ffmpeg',['-v','error','-i',video,'-an','-vf','scale=1280:720:flags=lanczos,fps=30','-t','16','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',mp4]);
   const meta=JSON.parse(ff(process.env.FFPROBE||'ffprobe',['-v','error','-show_entries','stream=codec_name,width,height:format=duration','-of','json',mp4]));
   assert.equal(meta.streams[0].codec_name,'h264');assert.equal(meta.streams[0].width,1280);assert.equal(meta.streams[0].height,720);assert(Number(meta.format.duration)>=15);
   ff(process.env.FFMPEG||'ffmpeg',['-v','error','-i',mp4,'-f','null','-']);
   evidence.video={...meta,sourceSha256:createHash('sha256').update(bytes).digest('hex'),sha256:createHash('sha256').update(await readFile(mp4)).digest('hex'),environment:'desktop Chromium; actual mouse inputs; no device host or instrumentation-generated assets'};
  }
  evidence.checks.push({width,height,touch,shop:true,daily:true,duelKitIsolated:true,mission:true,realFire:true});await c.close();page=undefined;
 }
 assert.deepEqual(evidence.errors,[]);
}catch(e){evidence.failure=String(e);if(page&&!page.isClosed())await page.screenshot({path:path.join(qa,'failure.png')}).catch(()=>{});throw e;}
finally{await browser.close();await writeFile(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');}
console.log('Capture passed:',out);
