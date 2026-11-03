import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { acceptanceBuild, snapshot, press, settleVisuals, assertLayout, navigateMap, aimAt } from './flight-browser.mjs';

const base=process.env.NIGHT_URL,build=await acceptanceBuild(base);
const out=process.env.NIGHT_REPORT_DIR||fileURLToPath(new URL('../reports/immersion-2026-11-03/',import.meta.url));await mkdir(out,{recursive:true});
const evidence={build,fixture:false,environment:'Chromium; offline ordinary first mission; no developer or asset fixture',checks:[],screens:[],errors:[]};
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11'],...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
const pausedState=s=>({time:s.time,aim:s.aim,camera:s.camera,aircraft:s.aircraft,zoom:s.zoom,fired:s.fired,shots:s.shots,units:s.units});
try{
  for(const [width,height]of [[568,320],[844,390],[1280,720]]){
    const touch=width<1000,videoStartedAt=Date.now();
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1,...(width===1280?{recordVideo:{dir:out,size:{width,height}}}:{})});
    await context.addInitScript(()=>{localStorage.setItem('night-overwatch-coach-v2','done');});
    const page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',error=>evidence.errors.push(error.message));
    await page.route('**/game-bootstrap.js',route=>route.fulfill({contentType:'text/javascript',body:'globalThis.__COMPETITION_CONFIG__={competitionEnabled:false};'}));
    await page.route('**/api/competition/**',route=>route.abort());
    const ready=async()=>{await page.waitForFunction(()=>globalThis.__night?.snapshot().ui.homeArtworkReady&&!document.getElementById('night-startup'));await settleVisuals(page);};
    const click=async id=>{await press(page,id,touch,false);await settleVisuals(page);};
    const capture=async name=>{await settleVisuals(page);const s=await snapshot(page);assertLayout(s,s.ui.width,s.ui.height);const file=`${name}-${width}.png`;await page.screenshot({path:`${out}/${file}`});evidence.screens.push(file);return s;};
    await page.goto(base+'?dev=0');await ready();
    let s=await snapshot(page);assert(s.ui.voicePrompts&&s.ui.autoPriority);assert.equal(s.viewMode,'night');
    await click('qm:modes');await click('mode:solo');await click('mode:enter');await click('start');
    await page.waitForFunction(()=>__night.snapshot().phase==='playing'&&!__night.snapshot().modal);
    s=await capture('night');assert(!s.buttons.some(b=>b.id==='equipment'));assert(s.buttons.some(b=>b.id==='battleReport'&&b.text==='战况'));
    assert.match(s.ui.battleStatus,/友军.*撤离.*威胁/);assert(!s.ui.battleStatus.includes('\n'));
    const fireBefore=s.fired;await click('battleReport');await capture('tactics');await click('equipment');await capture('equipment');await click('reportOverview');assert((await snapshot(page)).modal.startsWith('report:'));await click('close');
    assert.equal((await snapshot(page)).fired,fireBefore,'tactics navigation never leaks fire');
    await click('settings');await capture('settings');await click('voicePrompts');await click('autoPriority');
    s=await snapshot(page);assert(!s.ui.voicePrompts&&!s.ui.autoPriority&&!s.ui.muted);assert(!s.radioPending);await capture('settings-off');
    await click('zoomControls');const frozen=pausedState(await snapshot(page));
    for(const mode of ['enhanced','thermal','night']){
      await click('view:'+mode);s=await snapshot(page);assert.equal(s.viewMode,mode);assert.equal(s.thermal,mode==='thermal');assert.deepEqual(pausedState(s),frozen,'views do not move the camera or simulation');await capture('view-settings-'+mode);
    }
    await click('view:enhanced');await click('resume');await capture('enhanced');await click('sensor');assert((await snapshot(page)).thermal);await capture('thermal');await click('sensor');assert.equal((await snapshot(page)).viewMode,'night');
    if(touch){
      const cdp=await context.newCDPSession(page),b=(await snapshot(page)).buttons.find(b=>b.id==='fire');
      const p=await page.evaluate(b=>{const r=document.querySelector('canvas').getBoundingClientRect(),s=__night.snapshot();return{x:r.left+(b.x+b.w/2)/s.ui.width*r.width,y:r.top+(b.y+b.h/2)/s.ui.height*r.height};},b);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});await page.waitForTimeout(120);await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.deepEqual((await snapshot(page)).held,[]);
      const shot=(await snapshot(page)).fired;await page.waitForTimeout(250);assert.equal((await snapshot(page)).fired,shot,'touchcancel releases trigger');
    }
    if(width===1280){
      await click('weapon0');
      evidence.videoCombatStartSeconds=(Date.now()-videoStartedAt)/1000;
      const started=Date.now();
      while(Date.now()-started<20000&&(await snapshot(page)).phase==='playing'){
        const target=(await snapshot(page)).units.find(u=>!u.friendly&&u.hp>0);if(!target)break;
        await navigateMap(page,target);await aimAt(page,target);await page.keyboard.down('Space');await page.waitForTimeout(500);await page.keyboard.up('Space');await page.waitForTimeout(1700);
      }
      evidence.videoCombatSeconds=(Date.now()-started)/1000;await capture('combat-after-input');
    }
    await click('settings');await click('language');await capture('settings-en');await click('language');await click('autoPriority');await click('zoomControls');await click('view:enhanced');
    await page.reload();await ready();s=await snapshot(page);assert(!s.ui.voicePrompts&&s.ui.autoPriority&&!s.ui.muted);assert.equal(s.viewMode,'enhanced');
    await click('settings');await click('voicePrompts');await capture('settings-restored');assert((await snapshot(page)).ui.voicePrompts);
    evidence.checks.push({width,height,touch,preferencesPersisted:true,viewPreservesCamera:true,tacticsNavigation:true,noInputLeak:true});
    const video=page.video();await context.close();if(video){const path=`${out}/ordinary-gameplay-1280.webm`;await video.saveAs(path);evidence.video=path;}
  }
  assert.deepEqual(evidence.errors,[]);await acceptanceBuild(base);
  await writeFile(`${out}/evidence.json`,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await browser.close();}
