const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.argv[2]);
const routes=JSON.parse(fs.readFileSync('docs/replays.json','utf8'));
const report={browser:'installed Chrome, headless',mobile:'390x844 touch emulation, not a physical phone',checks:[],wins:[],errors:[],networkFailures:[]};
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:960}});
 const page=await context.newPage();page.setDefaultTimeout(10000);
 page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.networkFailures.push([r.url(),r.status()])});
 await page.clock.install({time:new Date('2026-09-27T12:00:00Z')});
 await page.goto('http://127.0.0.1:4407/');
 await page.clock.pauseAt(new Date('2026-09-27T12:00:01Z'));
 const snap=()=>page.evaluate(()=>window.ghostShiftSnapshot());
 async function at(t){let s=await snap();for(let n=0;s.t<t-.001&&n<20;n++){await page.clock.runFor(Math.max(16,Math.ceil((t-s.t)*1000)));s=await snap();}assert.ok(s.t>=t-.051,`time ${s.t} < ${t}`);return s;}
 async function act(kind,target,delay=0){if(kind==='cancel'){await page.locator(`[data-cancel="${target}"]`).click();return;}await page.locator(`[data-ghost="${kind}"]`).click();if(kind!=='bell')await page.locator(`[data-delay="${delay}"]`).click();await page.locator(`[data-room="${target}"]`).click();}
 async function restart(){await page.locator('#restart').click();assert.equal((await snap()).t,0);}
 await page.locator('#start').click();await act(0,1,0);let s=await at(1);assert.match(await page.locator('[data-guest="1"] .reaction').textContent(),/拍到了/);assert.equal(s.events[0].hits[0].active,true);
 await restart();await act(0,1,8);s=await at(8.2);assert.match(await page.locator('[data-guest="1"] .reaction').textContent(),/镜头没开/);assert.equal(s.guests[1].happy,0);report.checks.push('Selfie hit and deliberately missed use actual buttons and different reactions');
 await restart();await act(1,0);await act(2,1,4);await at(3);await act('cancel',2);s=await at(9);assert.equal(s.status,'playing');assert.equal(s.ghosts[2].ready,0);assert.equal(s.events.filter(e=>e.kind==='scare').length,1);report.checks.push('Cancel a pipe ghost before it spills into pastry room');
 await restart();await act(1,0);await act(2,1,4);s=await at(9);assert.equal(s.status,'lost');assert.match(await page.locator('#dialog-text').textContent(),/退房/);report.failureAt=s.t;
 await page.locator('#start').click();await act(1,0);await act(2,1,4);await at(4.2);await act('bell',0);s=await at(10);assert.equal(s.status,'playing');assert.equal(s.guests[0].packing,0);report.checks.push('Over-scare checkout, visible retry, same situation rescued with calming bell');
 await restart();await act(2,1,4);await at(1);await page.locator('#pause').click();const frozen=await snap();await page.clock.runFor(10000);assert.equal((await snap()).t,frozen.t);await page.locator('#continue').click();await at(4.3);assert.equal((await snap()).events.filter(e=>e.kind==='scare').length,1);report.checks.push('Pause preserves queued timer; explicit continue resumes it');
 await page.locator('#mute').click();assert.equal((await snap()).muted,true);await page.clock.runFor(100);assert.equal((await snap()).audioState,'suspended');await page.locator('#mute').click();assert.equal((await snap()).muted,false);report.checks.push('Web Audio initialized by user gesture; mute suspends AudioContext');
 // A real browser focus change rather than injecting a hidden-state flag.
 const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();await page.clock.runFor(1000);
 const background=await snap();report.background={paused:background.paused,visibility:await page.evaluate(()=>document.visibilityState)};
 if(!background.paused){await page.evaluate(()=>window.dispatchEvent(new Event('blur')));report.background.fallback='headless focus event dispatched; physical background not claimed';}
 const afterBackground=await snap();assert.equal(afterBackground.paused,true);await other.close();await page.bringToFront();await page.clock.runFor(3000);assert.equal((await snap()).t,afterBackground.t);await page.locator('#continue').click();report.checks.push('Background/focus-loss pause requires explicit resume');
 for(const route of routes){
   await page.reload();await page.locator(`[data-level="${route.level}"]`).click();await page.locator('#start').click();
   for(const a of route.actions){await at(a.t);await act(a.kind,a.target,a.delay);}
   let r=await snap();for(let n=0;n<140&&r.status==='playing';n++){await page.clock.runFor(1000);r=await snap();}
   assert.equal(r.status,'won',`UI replay night ${route.level+1}: ${JSON.stringify(r)}`);assert.match(await page.locator('#dialog-title').textContent(),/五星/);report.wins.push({night:route.level+1,time:r.t,actions:r.actions.length});
 }
 // Desktop screenshot has real performers, a pending ghost, and visible pipe aftermath.
 await page.reload();await page.locator('#start').click();await act(2,1,0);await act(0,2,4);await page.clock.runFor(550);await page.mouse.move(50,50);await page.screenshot({path:'docs/playtest-desktop.png',fullPage:true});
 // Mouse drag, out-of-room release and cancellation do not produce accidental casts.
 await restart();await page.locator('[data-delay="4"]').click();let from=await page.locator('[data-ghost="0"]').boundingBox(),to=await page.locator('[data-room="1"]').boundingBox();
 await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:6});await page.mouse.up();assert.equal((await snap()).ghosts[0].job.target,1);await act('cancel',0);
 const count=(await snap()).actions.length;await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(15,30,{steps:6});await page.mouse.up();assert.equal((await snap()).actions.length,count);report.checks.push('Real mouse drag schedules ghost; release outside hotel cancels');
 // Reload starts the same ghost state, no network/game state dependencies.
 for(const url of ['http://127.0.0.1:4407/','http://127.0.0.1:4407/ghost-shift-manager/']){await page.goto(url);await page.locator('#start').click();await act(0,1,0);assert.ok((await snap()).actions.length===1);}
 report.checks.push('Both independent root and prefixed entry load and accept real input');
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});const m=await mobile.newPage();m.on('pageerror',e=>report.errors.push('mobile: '+e.message));
 await m.goto('http://127.0.0.1:4407/');await m.locator('#start').tap();await m.locator('[data-ghost="2"]').tap();await m.locator('[data-room="1"]').tap();await m.locator('[data-ghost="0"]').tap();await m.locator('[data-delay="4"]').tap();await m.locator('[data-room="2"]').tap();
 assert.ok((await m.evaluate(()=>window.ghostShiftSnapshot())).ghosts[0].job);await m.waitForTimeout(350);await m.screenshot({path:'docs/playtest-mobile.png',fullPage:true});
 report.mobileLayout=await m.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,minTouch:Math.min(...[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&!b.closest('#overlay')).map(b=>Math.min(b.getBoundingClientRect().height,b.getBoundingClientRect().width)))}));
 assert.ok(report.mobileLayout.scrollWidth<=390);assert.ok(report.mobileLayout.minTouch>=44,'Touch targets must be >=44px');assert.ok(report.mobileLayout.scrollHeight<=844,'Play controls must fit mobile viewport');
 await m.locator('[data-cancel="0"]').tap();assert.equal((await m.evaluate(()=>window.ghostShiftSnapshot())).ghosts[0].job,null);report.checks.push('390x844 touch: start, ghost, fuse, room, cancel; no horizontal overflow');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.networkFailures,[]);
 fs.writeFileSync('docs/playtest-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();
})().catch(e=>{console.error(e);fs.writeFileSync('docs/playtest-failure.json',JSON.stringify({message:e.message,report},null,2));process.exit(1)});
