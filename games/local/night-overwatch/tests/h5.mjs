import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sourceHash } from '../scripts/artifact.mjs';
import { exerciseStandalone } from '../../../../apps/shell-web/scripts/standalone-game-checks.mjs';

const base = process.env.NIGHT_URL || 'http://localhost:4318';
const shell = process.env.NIGHT_SHELL_URL || 'http://localhost:5173';
const dir = fileURLToPath(new URL(`../reports/polish/${process.env.NIGHT_ROUND || 'round3'}/h5/`, import.meta.url));
await mkdir(dir, { recursive: true });
const build = await fetch(base + '/build-info.json').then(r => r.json());
assert.equal(build.sourceHash, await sourceHash());
assert.equal((await fetch(shell+'/games/night-overwatch/build-info.json').then(r=>r.json())).sourceHash, build.sourceHash, 'Shell serves current build');
const browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const report = {build, errors:[], resourceFailures:[], checks:[]};
const snap = f => f.evaluate(()=>__night.snapshot());
function disjoint(buttons, width, height) {
  for (const a of buttons) {
    assert(a.x>=0 && a.y>=0 && a.x+a.w<=width+1 && a.y+a.h<=height+1, a.id+' inside view');
    for(const b of buttons) if(a!==b) assert(!(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>1 && Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>1),`${a.id}/${b.id} touch regions overlap`);
  }
}
async function press(f,id,touch=true) {
  let s=await snap(f);
  if(!s.buttons.some(b=>b.id===id)&&s.buttons.some(b=>b.id==='flightControls')) {await press(f,'flightControls',touch);s=await snap(f);}
  const b=s.buttons.find(b=>b.id===id); assert(b,id);
  const position={x:b.x+b.w/2,y:b.y+b.h/2};
  if(touch) await f.locator('canvas').tap({position}); else await f.locator('canvas').click({position});
  await new Promise(r=>setTimeout(r,100));
}
function observe(p) {
  p.on('pageerror',e=>report.errors.push(e.message));
  p.on('requestfailed',r=>{if(r.url().includes('/games/night-overwatch/')||r.url().startsWith(base))report.resourceFailures.push(r.url());});
}
try {
  // Actual Shell route, real iframe hit testing and its reduced height.
  const context=await browser.newContext({viewport:{width:568,height:320},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  const p=await context.newPage();observe(p);
  await p.goto(shell+'/#/games/night-overwatch');
  const f=p.frameLocator('iframe[title="夜航守望"]');
  await f.locator('canvas').waitFor();
  await p.waitForTimeout(2500);
  const frame=p.frames().find(f=>f.url().includes('/games/night-overwatch/'));
  assert(frame,'actual Shell iframe');
  await frame.waitForFunction(()=>globalThis.__night?.snapshot().audio==='ready');
  disjoint((await snap(frame)).buttons,568,264);
  await p.screenshot({path:dir+'shell-568-briefing.png'});
  await exerciseStandalone(f,'night-overwatch',true);
  assert.equal((await snap(frame)).selected,2);
  await p.screenshot({path:dir+'shell-568-battle.png'});
  await press(frame,'pause');
  await p.screenshot({path:dir+'shell-568-pause.png'});
  disjoint((await snap(frame)).buttons,568,264);
  await press(frame,'help');
  await p.setViewportSize({width:320,height:568});await p.waitForTimeout(200);
  disjoint((await snap(frame)).buttons,320,512);
  await p.screenshot({path:dir+'shell-320-help.png'});
  await press(frame,'close');
  assert((await snap(frame)).pauses.includes('orientation'));
  assert((await snap(frame)).pauses.includes('manual'));
  await p.setViewportSize({width:568,height:320});await p.waitForTimeout(200);
  await press(frame,'resume');
  const before=(await snap(frame)).time;
  await p.locator('[data-game-fullscreen]').click();
  await p.waitForFunction(()=>!!document.fullscreenElement);
  await p.locator('[data-game-fullscreen]').click();
  await p.waitForFunction(()=>!document.fullscreenElement);
  assert((await snap(frame)).time>=before);
  assert.equal((await snap(frame)).held.length,0);
  report.checks.push('Actual Shell: entry, weapons, help, nested pause/orientation, host fullscreen entry/exit');
  await context.close();

  // Browser capability rejection and safe-area CSS simulation; never modify game state.
  const fallback=await browser.newContext({viewport:{width:568,height:320},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  await fallback.addInitScript(()=>{Element.prototype.requestFullscreen=function(){return Promise.reject(new Error('Test: fullscreen unavailable'));};});
  const q=await fallback.newPage();observe(q);
  await q.goto(base);await q.waitForFunction(()=>globalThis.__night?.snapshot().audio==='ready');
  await press(q,'fullscreen');
  assert.equal(await q.evaluate(()=>!!document.fullscreenElement),false);
  await press(q,'start');
  await q.waitForTimeout(300);assert((await snap(q)).time>0);
  assert((await snap(q)).ui.notice.includes('浏览器'));
  await q.addStyleTag({content:':root{--safe-left:44px!important;--safe-right:44px!important;--safe-bottom:21px!important}'});
  await q.setViewportSize({width:569,height:320});await q.waitForTimeout(200);
  const safe=await snap(q);assert.equal(Math.round(safe.safe.left),44);assert.equal(Math.round(safe.safe.bottom),21);
  disjoint(safe.buttons,569,320);
  for(const b of safe.buttons) assert(b.x>=44 && b.x+b.w<=525 && b.y+b.h<=299,`${b.id} avoids simulated inset`);
  await q.screenshot({path:dir+'simulated-safe-area.png'});
  await press(q,'pause');await press(q,'sound');await press(q,'effects');
  const prefs=(await snap(q)).ui;
  await q.reload();await q.waitForFunction(()=>globalThis.__night?.snapshot().audio==='ready');
  assert.equal((await snap(q)).ui.muted,prefs.muted);assert.equal((await snap(q)).ui.reducedEffects,prefs.reducedEffects);
  await press(q,'start');await press(q,'fire');
  assert((await snap(q)).fired>0,'windowed controls remain playable');
  report.checks.push('Fullscreen rejection: windowed play works; synthetic 44/44/21 insets respected; mute/reduced effects persist after reload');
  await fallback.close();
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.resourceFailures,[]);
} finally {
  await writeFile(dir+'results.json',JSON.stringify(report,null,2));await browser.close();
}
console.log('Actual Shell, low height, orientation, fullscreen fallback and simulated safe areas passed');
