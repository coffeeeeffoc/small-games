import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {ownedChild,cleanupOwnedSteps} from '../../../../scripts/h5-taptap-runtime.mjs';
import {acceptanceBuild,snapshot,press,settleVisuals} from './flight-browser.mjs';

const workspace=fileURLToPath(new URL('../../../../',import.meta.url)),out=new URL('../reports/indexeddb-startup/',import.meta.url);
const origin='http://127.0.0.1:43812',evidence={checks:[],errors:[]};
let server,browser;
await mkdir(out,{recursive:true});
try{
 server=ownedChild(process.execPath,['games/local/night-overwatch/scripts/serve.mjs'],{cwd:workspace,env:{...process.env,PORT:'43812'}});
 for(let i=0;i<50;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 process.env.NIGHT_URL=origin;evidence.build=await acceptanceBuild(origin);
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||process.env.CHROMIUM_PATH,args:['--use-angle=d3d11']});
 for(const scenario of ['ordinary','developer','unsupported','missing-script','missing-runtime','missing-store','missing-indexeddb']){
  const context=await browser.newContext({viewport:{width:844,height:390}});
  try{
   await context.addInitScript(scenario=>{
    localStorage.setItem('night-overwatch-coach-v2','done');localStorage.setItem('night-overwatch-muted','true');
    globalThis.__nightNativeWrites=0;
    for(const method of ['setItem','removeItem','clear'])Storage.prototype[method]=function(){globalThis.__nightNativeWrites++;throw new Error('Legacy localStorage is read-only');};
    if(scenario==='unsupported')Object.defineProperty(window,'indexedDB',{value:undefined});
   },scenario);
   const page=await context.newPage();page.on('pageerror',error=>evidence.errors.push({scenario,message:error.message}));
   let requests=0;
   await page.route('**/game-service-config.js',route=>route.fulfill({contentType:'text/javascript',body:`globalThis.__COMPETITION_CONFIG__=Object.freeze(${JSON.stringify({game:'night-overwatch',platform:'h5',competitionEnabled:true,apiUrl:origin+'/api'})});`}));
   await page.route('**/api/**',route=>{requests++;return route.fulfill({status:503,contentType:'application/json',body:'{"error":{"code":"SERVICE_UNAVAILABLE"}}'});});
   if(scenario==='missing-script')await page.route('**/game-services/night-storage.js',route=>route.fulfill({status:404,body:'Missing storage component'}));
   if(scenario.startsWith('missing-')&&scenario!=='missing-script')await page.route('**/game-services/night-storage/'+scenario.slice('missing-'.length)+'.mjs',route=>route.fulfill({status:404,body:'Missing module'}));
   await page.goto(origin+'/?dev='+(scenario==='developer'?'1':'0'));
   if(scenario.startsWith('missing-')){
    await page.waitForFunction(()=>document.getElementById('night-startup')?.dataset.state==='error');
    assert.equal(await page.locator('#night-retry').isVisible(),true);
    assert.match(await page.locator('#night-hint').textContent(),scenario==='missing-script'?/本地存储组件/:/module|import|加载/i);
    assert.equal(await page.evaluate(()=>typeof globalThis.__night),'undefined');
    assert.equal(requests,0,'no metadata, identity or run requests without the storage adapter');
   }else{
    await page.waitForFunction(()=>globalThis.__night&&!document.getElementById('night-startup'));
    const state=await page.evaluate(async()=>{const {sys}=await System.import('cc');return {engineStorageIsBrowser:sys.localStorage===globalThis.__nightStorage&&window.localStorage===globalThis.__nightStorage,source:localStorage.source,developer:SmallGamesDev.isEnabled(),muted:__night.snapshot().ui.muted};});
    assert.deepEqual(state,{engineStorageIsBrowser:true,source:'indexedDB',developer:scenario==='developer',muted:true});
    if(scenario==='ordinary'){
     for(const id of ['settings','sound']){await press(page,id,false,false);await settleVisuals(page);}
     assert.equal((await snapshot(page)).ui.muted,false);await page.evaluate(()=>localStorage.flush());
     await page.reload();await page.waitForFunction(()=>globalThis.__night&&!document.getElementById('night-startup'));
     assert.equal((await snapshot(page)).ui.muted,false,'new IndexedDB preference wins over the old true value after reload');
    }
    if(scenario==='unsupported'){
     for(const id of ['qm:modes','mode:training','mode:enter']){await press(page,id,false,false);await settleVisuals(page);}
     await page.waitForFunction(()=>__night.snapshot().phase==='playing');
     assert.equal((await snapshot(page)).mission.mode,'training');
     assert.match(await page.evaluate(async()=>{try{await localStorage.flush();return 'unexpected success';}catch(error){return error.message;}}),/not supported/);
    }
   }
   assert.equal(await page.evaluate(()=>globalThis.__nightNativeWrites),0);
   await page.screenshot({path:fileURLToPath(new URL(scenario+'.png',out))});
   evidence.checks.push({scenario,nativeWrites:0,requests,screenshot:scenario+'.png'});
  }finally{await context.close();}
 }
 assert.deepEqual(evidence.errors,[]);await acceptanceBuild(origin);
}catch(error){evidence.failure=String(error);throw error;}
finally{
 evidence.cleanupFailures=await cleanupOwnedSteps([['browser',()=>browser?.close()],['server',()=>server?.close()]]);
 await writeFile(new URL('evidence.json',out),JSON.stringify(evidence,null,2));
 assert.deepEqual(evidence.cleanupFailures,[]);
}
console.log(JSON.stringify(evidence,null,2));
