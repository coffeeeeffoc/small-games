import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {snapshot,press,navigateMap,aimAt,settleVisuals} from '../../../../tests/flight-browser.mjs';
const out=fileURLToPath(new URL('../../../../reports/night-promo-native1080/',import.meta.url));
const base='http://127.0.0.1:4328/';
const build=await fetch(base+'build-info.json').then(r=>r.json());
assert.equal(build.sourceHash,'c3f32a92a83b06f6421f1f95a4f747e8b8cec02f0270f116dc4aadc7e16fd74a');
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
const takes=[['rapid',0,'enhanced',4],['blast',1,'enhanced',3],['heavy',2,'night',5],['incendiary',3,'enhanced',5],['thermal',1,'thermal',4]];
try{
 for(const [name,weapon,view,zoom] of takes.filter(t=>!process.argv[2]||process.argv.slice(2).includes(t[0]))){
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,acceptDownloads:true});
  await context.addInitScript(()=>localStorage.setItem('night-overwatch-coach-v2','done'));
  const page=await context.newPage();page.setDefaultTimeout(60000);const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/game-bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'globalThis.__COMPETITION_CONFIG__={competitionEnabled:false};'}));
  await page.route('**/api/competition/**',r=>r.abort());
  await page.goto(base+'?dev=0');
  await page.waitForFunction(()=>globalThis.__night?.snapshot().ui.homeArtworkReady&&!document.getElementById('night-startup'));
  for(const id of ['qm:modes','mode:solo','mode:enter','start'])await press(page,id,false,false);
  await page.waitForFunction(()=>__night.snapshot().phase==='playing'&&!__night.snapshot().modal);
  for(let i=0;i<['night','enhanced','thermal'].indexOf(view);i++)await page.keyboard.press('v');
  await page.keyboard.press(['1','2','3','5'][weapon]);
  let state=await snapshot(page),target=state.units.filter(u=>!u.friendly&&u.hp>0&&u.kind==='turret')[name==='rapid'?1:name==='heavy'?2:name==='thermal'?3:0];assert(target);
  await navigateMap(page,target);
  for(let i=0;i<zoom;i++){await page.keyboard.press('x');await page.waitForTimeout(150);}
  await aimAt(page,target);await settleVisuals(page);await page.waitForTimeout(500);
  const canvas=await page.evaluate(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();const gl=c.getContext('webgl2')||c.getContext('webgl');return {width:c.width,height:c.height,cssWidth:r.width,cssHeight:r.height,dpr:devicePixelRatio,drawingBufferWidth:gl?.drawingBufferWidth,drawingBufferHeight:gl?.drawingBufferHeight};});
  assert.equal(canvas.width,1920);assert.equal(canvas.height,1080);assert.equal(canvas.drawingBufferWidth,1920);assert.equal(canvas.drawingBufferHeight,1080);
  await page.screenshot({path:out+name+'-before.png'});
  const before=await snapshot(page);
  await page.evaluate(()=>{
   const canvas=document.querySelector('canvas');const stream=canvas.captureStream(30);
   const mimeType='video/webm;codecs=vp9';if(!MediaRecorder.isTypeSupported(mimeType))throw Error('VP9 recording unavailable');
   const chunks=[];const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:24000000});
   recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   window.__promoRecorder={recorder,stream,chunks};recorder.start(1000);
  });
  const started=Date.now();let nextShot=0;const events=[];
  while(Date.now()-started<11000){
   state=await snapshot(page);
   // Hold the view through impact so the actual explosion remains in the shot.
   await aimAt(page,target);
   const elapsed=(Date.now()-started)/1000;
   if(elapsed>=.3&&elapsed>=nextShot){
    await page.keyboard.down('Space');
    await page.waitForTimeout(weapon<2?350:65);
    await page.keyboard.up('Space');
    nextShot=elapsed+(weapon===2?2.5:weapon===3?5.1:.55);
    events.push({elapsed,fired:(await snapshot(page)).fired,target:target.id});
   }
   if(elapsed>4&&!events.some(e=>e.screenshot)){await page.screenshot({path:out+name+'-action.png'});events.push({elapsed,screenshot:true});}
   await page.waitForTimeout(100);
  }
  const after=await snapshot(page);assert(after.fired>before.fired,'Real input fired the selected weapon');
  const download=page.waitForEvent('download');
  await page.evaluate(async name=>{
   const {recorder,stream,chunks}=window.__promoRecorder;
   await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop()});
   stream.getTracks().forEach(t=>t.stop());
   const url=URL.createObjectURL(new Blob(chunks,{type:'video/webm'}));
   const a=document.createElement('a');a.href=url;a.download=name+'.webm';a.click();
  },name);
  await(await download).saveAs(out+name+'.webm');
  const evidence={build,canvas,weapon,view,zoom,recording:'WebGL canvas.captureStream(30); VP9 target 24Mbps; native 1920x1080; no scale',fixture:false,events,before,after,errors};
  assert.deepEqual(errors,[]);await writeFile(out+name+'-evidence.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({name,canvas,fired:after.fired-before.fired,simulationSeconds:after.time-before.time,phase:after.phase}));
  await context.close();
 }
}finally{await browser.close()}
