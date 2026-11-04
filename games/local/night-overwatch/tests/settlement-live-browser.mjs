import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {createOwnedRuntime,ownedChild,cleanupOwnedSteps} from '../../../../scripts/h5-taptap-runtime.mjs';
import {acceptanceBuild,snapshot,press,settleVisuals,navigateMap,aimAt,waitForImpact} from './flight-browser.mjs';

const workspace=fileURLToPath(new URL('../../../../',import.meta.url)),out=new URL('../reports/settlement-live/',import.meta.url);
await mkdir(out,{recursive:true});
const evidence={environment:'Isolated real PostgreSQL/HTTP; fresh guest; ordinary first mission and real mouse input; network failures are injected',checks:[],errors:[],screens:[]};
const storageFaults=process.env.NIGHT_STORAGE_FAULTS==='1';
const startDiagnostics=process.env.NIGHT_START_STORAGE_DIAGNOSTICS==='1';
if(storageFaults){evidence.environment+='; missing journal keys return empty strings, journal writes fail after admission, and receipt writes fail';evidence.storageFaults={missingKey:'empty string',journalWriteAfterAdmission:'QuotaExceededError',receiptWrite:'QuotaExceededError'};}
let fixture,server,browser,context,page;
try{
 fixture=await createOwnedRuntime({workspace});
 const {origin,api}=fixture.descriptor;
 server=ownedChild(process.execPath,['games/local/night-overwatch/scripts/serve.mjs'],{cwd:workspace,env:{...process.env,PORT:'43810'}});
 for(let i=0;i<50;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 process.env.NIGHT_URL=origin;evidence.build=await acceptanceBuild(origin);
 browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
 if(startDiagnostics){
  evidence.startDiagnostics=[];
  for(const [fault,width,height]of [['quota',568,320],['noop',844,390]]){
   const diagnosticContext=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
   try{
    await diagnosticContext.addInitScript(fault=>{
     localStorage.setItem('night-overwatch-coach-v2','done');const set=Storage.prototype.setItem;
     Storage.prototype.setItem=function(key,value){if(String(key).startsWith('night-pending-run-v1:')){if(fault==='quota')throw new DOMException('Injected initial quota; token=private-sentinel; retry required','QuotaExceededError');return;}return set.call(this,key,value);};
    },fault);
    const diagnosticPage=await diagnosticContext.newPage();diagnosticPage.on('pageerror',e=>evidence.errors.push(e.message));
    await diagnosticPage.route('**/game-service-config.js',r=>r.fulfill({contentType:'text/javascript',body:`globalThis.__COMPETITION_CONFIG__=Object.freeze(${JSON.stringify({game:'night-overwatch',platform:'h5',competitionEnabled:true,apiUrl:api})});`}));
    let starts=0;diagnosticPage.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/runs'))starts++;});
    await diagnosticPage.goto(origin+'/?dev=0');await diagnosticPage.waitForFunction(()=>globalThis.__night?.snapshot().progression.assets?.playerId&&!document.getElementById('night-startup'));
    for(const id of ['qm:modes','mode:solo','mode:enter','start']){await press(diagnosticPage,id,true,false);await settleVisuals(diagnosticPage);}
    await diagnosticPage.waitForFunction(()=>__night.snapshot().modal.startsWith('storageError:'));let diagnostic=await snapshot(diagnosticPage);
    assert.equal(diagnostic.phase,'briefing');assert.equal(starts,0);assert(diagnostic.modal.includes('source=window.localStorage'));assert(!diagnostic.modal.includes('private-sentinel'));
    assert(diagnostic.modal.includes(fault==='quota'?'name=QuotaExceededError':'matches=false'));assert(diagnostic.modal.includes(fault==='quota'?'stage=set':'stage=readback'));if(fault==='quota')assert(diagnostic.scrollMax>0,'small-screen long details require scrolling');
    const name=`storage-${fault}-${width}`;await diagnosticPage.screenshot({path:fileURLToPath(new URL(name+'.png',out))});evidence.screens.push(name+'.png');
    const cdp=await diagnosticContext.newCDPSession(diagnosticPage);
    for(let drag=0;drag<8&&(await snapshot(diagnosticPage)).scroll<diagnostic.scrollMax;drag++){
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width/2,y:height*.58}]});
     for(let step=1;step<=6;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width/2,y:height*.58-step*10}]});
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settleVisuals(diagnosticPage);
    }
    const scrolled=await snapshot(diagnosticPage);assert.equal(scrolled.scroll,scrolled.scrollMax,'touch can reach the last diagnostic line');
    await diagnosticPage.screenshot({path:fileURLToPath(new URL(name+'-scrolled.png',out))});evidence.screens.push(name+'-scrolled.png');
    const close=scrolled.buttons.find(b=>b.id==='close');assert(close&&close.h>=44&&close.y+close.h<=height);
    await press(diagnosticPage,'close',true,false);await settleVisuals(diagnosticPage);assert(!(await snapshot(diagnosticPage)).modal.startsWith('storageError:'));
    await press(diagnosticPage,'start',true,false);await diagnosticPage.waitForFunction(()=>__night.snapshot().modal.startsWith('storageError:'));assert.equal(starts,0);
    evidence.startDiagnostics.push({fault,width,height,detail:diagnostic.modal.slice('storageError:'.length),scrollMax:scrolled.scrollMax,starts,closeAndRetry:true});
   }finally{await diagnosticContext.close();}
  }
 }
 context=await browser.newContext({viewport:{width:1280,height:720}});await context.addInitScript(()=>localStorage.setItem('night-overwatch-coach-v2','done'));
 if(startDiagnostics)await context.addInitScript(()=>{
  const set=Storage.prototype.setItem;globalThis.__nightEngineProbeFailures=0;
  Storage.prototype.setItem=function(key,value){if(key==='storage'&&!globalThis.__nightEngineProbeFailures){globalThis.__nightEngineProbeFailures++;throw new DOMException('Injected engine initialization probe','QuotaExceededError');}return set.call(this,key,value);};
 });
 if(storageFaults)await context.addInitScript(()=>{
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
  globalThis.__nightStorageFaults={emptyReads:0,receiptFailures:0,journalFailures:0,blockJournalWrites:false};
  Storage.prototype.getItem=function(key){const value=get.call(this,key);if(String(key).startsWith('night-pending-run-v1:')&&value===null){globalThis.__nightStorageFaults.emptyReads++;return '';}return value;};
  Storage.prototype.setItem=function(key,value){if(String(key).startsWith('night-pending-run-v1:')){if(String(key).endsWith(':synced')){globalThis.__nightStorageFaults.receiptFailures++;throw new DOMException('Injected receipt quota','QuotaExceededError');}if(globalThis.__nightStorageFaults.blockJournalWrites){globalThis.__nightStorageFaults.journalFailures++;throw new DOMException('Injected journal quota','QuotaExceededError');}}return set.call(this,key,value);};
 });
 page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>evidence.errors.push(e.message));
 await page.route('**/game-service-config.js',r=>r.fulfill({contentType:'text/javascript',body:`globalThis.__COMPETITION_CONFIG__=Object.freeze(${JSON.stringify({game:'night-overwatch',platform:'h5',competitionEnabled:true,apiUrl:api})});`}));
 let blockStart=true,dropSettlement=true,finishResponses=0;
 await page.route(/\/games\/night-overwatch\/runs(?:\/|$)/,async route=>{
  const request=route.request(),url=new URL(request.url());
  if(blockStart&&request.method()==='POST'&&url.pathname.endsWith('/runs'))return route.abort('connectionfailed');
  if(dropSettlement&&url.pathname.endsWith('/finish')){const response=await route.fetch();if(response.ok())finishResponses++;return route.abort('connectionfailed');}
  if(dropSettlement&&finishResponses&&request.method()==='GET'&&/\/runs\/[^/]+$/.test(url.pathname))return route.abort('connectionfailed');
  return route.continue();
 });
 const click=async id=>{await press(page,id,false,false);await settleVisuals(page);};
 const shot=async name=>{await settleVisuals(page);await page.screenshot({path:fileURLToPath(new URL(name+'.png',out))});evidence.screens.push(name+'.png');};
 await page.goto(origin+'/?dev=0');await page.waitForFunction(()=>globalThis.__night?.snapshot().progression.assets?.playerId&&!document.getElementById('night-startup'));
 if(startDiagnostics){evidence.engineStorage=await page.evaluate(async()=>{const {sys}=await System.import('cc');return {probeFailures:globalThis.__nightEngineProbeFailures,engineStorageIsBrowser:sys.localStorage===window.localStorage};});assert.equal(evidence.engineStorage.probeFailures,1);assert.equal(evidence.engineStorage.engineStorageIsBrowser,false);}
 await shot('home-1280');
 for(const id of ['qm:modes','mode:solo','mode:enter','start'])await click(id);
 await page.waitForFunction(()=>__night.snapshot().online.rankStatus==='pending-sync');
 let s=await snapshot(page);assert.equal(s.phase,'briefing');assert.equal(s.fired,0);await shot('start-retry');
 evidence.checks.push('A failed official start stays in briefing instead of silently becoming a local run');
 blockStart=false;await click('start');await page.waitForFunction(()=>__night.snapshot().phase==='playing'&&__night.snapshot().online.rankStatus==='recording');
 const before=(await snapshot(page)).progression.assets;
 await click('settings');await shot('settings-1280');await click('buttonControls');await shot('controls-1280');await click('resume');await click('weapon2');
 if(storageFaults)await page.evaluate(()=>{globalThis.__nightStorageFaults.blockJournalWrites=true;});
 for(let attempt=0;attempt<25;attempt++){
  s=await snapshot(page);if(!s.threatsRemaining||s.phase!=='playing')break;
  const enemy=s.units.find(u=>!u.friendly&&u.hp>0);assert(enemy);await navigateMap(page,enemy);await aimAt(page,enemy);
  await page.waitForFunction(()=>__night.snapshot().guns[2].cooldown===0);await page.keyboard.press('Space');const fired=await snapshot(page),shell=fired.shots.at(-1);
  assert(shell&&fired.fired>s.fired);await waitForImpact(page,shell);
 }
 await page.waitForFunction(()=>__night.snapshot().phase==='success',null,{timeout:90000});
 for(let i=0;i<450&&!finishResponses;i++)await page.waitForTimeout(100);
 await page.waitForFunction(faults=>(faults?['pending-sync','syncing','storage-unavailable']:['pending-sync','syncing']).includes(__night.snapshot().online.rankStatus),storageFaults,{timeout:30000});
 assert(finishResponses>0,'the real server accepted a finish before its response was lost');
 const captions=()=>page.evaluate(async()=>{const {director,Label}=await System.import('cc');return director.getScene().getComponentsInChildren(Label).filter(l=>l.node.activeInHierarchy).map(l=>l.string);});
 let text=await captions();assert(text.includes('本局积分'));assert(text.some(t=>/待确认|未确认/.test(t)));assert(!text.includes('+0'),'pending rewards are not fake zeroes');await shot('settlement-pending');
 dropSettlement=false;await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await page.waitForFunction(()=>__night.snapshot().online.rankStatus==='finished'&&__night.snapshot().progression.assets.coins>0,null,{timeout:45000});
 await page.waitForFunction(value=>__night.snapshot().progression.assets.coins>value,before.coins);
 s=await snapshot(page);const after=s.progression.assets;
 assert.equal(after.coins-before.coins,180);assert.equal(after.xp-before.xp,120);
 text=await captions();for(const value of ['本局积分','+100','+180','+120'])assert(text.includes(value),value+' shown from authoritative receipt');
 const tasks=after.tasks.filter(t=>['complete','solo','win'].includes(t.event)).map(t=>({id:t.id,event:t.event,before:before.tasks.find(b=>b.id===t.id)?.progress,after:t.progress,target:t.target}));
 assert(tasks.length&&tasks.every(t=>t.after===Math.min(t.target,t.before+1)),JSON.stringify(tasks));
 evidence.result={points:100,coins:after.coins-before.coins,xp:after.xp-before.xp,shots:s.ammoSpent,tasks};
 for(const [width,height]of [[1280,720],[844,390],[568,320]]){await page.setViewportSize({width,height});await shot('settlement-'+width);}
 await page.setViewportSize({width:1280,height:720});await click('home');await click('qm:tasks');await shot('tasks-updated');
 for(let i=0;i<2;i++){await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForTimeout(1000);}
 await click('qm:back');await click('qm:tasks');await page.waitForFunction(()=>!__night.snapshot().progression.busy);
 const repeated=(await snapshot(page)).progression.assets;assert.equal(repeated.coins,after.coins);assert.equal(repeated.xp,after.xp);
 for(const task of tasks)assert.equal(repeated.tasks.find(t=>t.id===task.id).progress,task.after,'retry cannot count the task twice');
 if(storageFaults){
  evidence.storageFaults.observed=await page.evaluate(()=>globalThis.__nightStorageFaults);
  assert(evidence.storageFaults.observed.emptyReads>0&&evidence.storageFaults.observed.receiptFailures>0&&evidence.storageFaults.observed.journalFailures>0,'all three storage fault paths were exercised');
  await page.reload();await page.waitForFunction(()=>globalThis.__night?.snapshot().progression.assets?.playerId&&!document.getElementById('night-startup'));
  await click('qm:tasks');await page.waitForTimeout(1500);const reloaded=(await snapshot(page)).progression.assets;
  assert.equal(reloaded.coins,after.coins);assert.equal(reloaded.xp,after.xp);for(const task of tasks)assert.equal(reloaded.tasks.find(t=>t.id===task.id).progress,task.after);
  evidence.checks.push('Reload after failed receipt storage preserves credited assets and exactly-once task progress');
 }
 evidence.checks.push('Real completed first mission credits 100 points, 180 coins, 120 EXP and each applicable task once after a lost finish response');
 evidence.checks.push('Opening the task page and repeated online recovery preserve exactly-once rewards and progress');
 assert.deepEqual(evidence.errors,[]);await acceptanceBuild(origin);
}catch(error){evidence.failure=String(error);if(page){const state=await snapshot(page).catch(()=>null);evidence.lastState=state&&{phase:state.phase,rankStatus:state.online?.rankStatus,coins:state.progression?.assets?.coins,xp:state.progression?.assets?.xp};}await page?.screenshot({path:fileURLToPath(new URL('failure.png',out))}).catch(()=>{});throw error;}
finally{
 evidence.cleanupFailures=await cleanupOwnedSteps([['browser',()=>browser?.close()],['server',()=>server?.close()],['fixture',()=>fixture?.close()]]);
 if(fixture)evidence.cleaned=fixture.evidence.cleaned;
 await writeFile(new URL('evidence.json',out),JSON.stringify(evidence,null,2));
 assert.deepEqual(evidence.cleanupFailures,[],'all owned resources must be cleaned');
}
console.log(JSON.stringify(evidence,null,2));
