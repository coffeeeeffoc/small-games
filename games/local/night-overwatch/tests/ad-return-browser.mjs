import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {acceptanceBuild,snapshot} from './flight-browser.mjs';
import {press,settleVisuals} from './visual-helpers.mjs';
const base=process.env.NIGHT_URL,build=await acceptanceBuild(base),out=new URL('../reports/ad-return/',import.meta.url);
await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
const checks=[],errors=[];
try{
 for(const kind of ['zoom','rate','tracking','ammo'])for(const trigger of ['completion','visibility','canvas']){
  const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{
   localStorage.setItem('night-overwatch-coach-v2','done');globalThis.__adFocused=true;globalThis.__offers=0;
   document.hasFocus=()=>globalThis.__adFocused;
   globalThis.SmallGamesRewardAds={available:true,offer:()=>{globalThis.__offers++;return new Promise(resolve=>{globalThis.__finishAd=()=>resolve({status:'completed'});});}};
  });
  const page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.route('**/game-service-config.js',route=>route.fulfill({contentType:'text/javascript',body:'globalThis.__COMPETITION_CONFIG__={game:"night-overwatch",platform:"h5",competitionEnabled:false,apiUrl:""};'}));
   await page.goto(base+'?dev=0');await page.waitForFunction(()=>globalThis.__night?.snapshot().audio==='ready'&&!document.getElementById('night-startup'));
   await page.evaluate(async()=>{
    const {Graphics}=await System.import('cc');let path=[];
    for(const name of ['moveTo','lineTo','close','rect']){const original=Graphics.prototype[name];Graphics.prototype[name]=function(...args){if(this.node.name==='Telemetry')path.push(name);return original.apply(this,args);};}
    const clear=Graphics.prototype.clear,stroke=Graphics.prototype.stroke;
    Graphics.prototype.clear=function(...args){if(this.node.name==='Telemetry'){path=[];globalThis.__redMarks={diamonds:0,rectangles:0};}return clear.apply(this,args);};
    Graphics.prototype.stroke=function(...args){if(this.node.name==='Telemetry'){
     if(this.strokeColor.r===255&&this.strokeColor.g===82&&this.strokeColor.b===91){
      if(path.join(',')==='moveTo,lineTo,lineTo,lineTo,close')globalThis.__redMarks.diamonds++;
      if(path.includes('rect'))globalThis.__redMarks.rectangles++;
     }path=[];
    }return stroke.apply(this,args);};
   });
   const hit=id=>press(page,id,true);await hit('missions');await hit('start');
   await page.waitForFunction(()=>__night.snapshot().phase==='playing'&&!__night.snapshot().modal&&globalThis.__redMarks?.diamonds>0);
   const before=await page.evaluate(()=>({state:__night.snapshot(),marks:__redMarks}));
   await hit('settings');
   if(kind==='zoom'){await hit('zoomControls');await hit('zoomUpgrade');}
   else{await hit('supply');await hit('reward:'+kind);await hit('supplyWatch');}
   if(trigger==='canvas'){
    await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>__night.snapshot().pauses.includes('orientation'));
    await page.setViewportSize({width:844,height:390});await page.waitForFunction(()=>!__night.snapshot().pauses.includes('orientation'));
   }
   await page.evaluate(trigger=>{globalThis.__adFocused=false;window.dispatchEvent(new Event('blur'));
    if(trigger==='visibility'){Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));}
    if(trigger==='completion')globalThis.__adFocused=true;globalThis.__finishAd();
   },trigger);
   await page.waitForFunction(()=>!__night.snapshot().advert);
   if(trigger!=='completion')assert((await snapshot(page)).pauses.includes('focus'));
   if(trigger==='visibility')await page.evaluate(()=>{globalThis.__adFocused=true;delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
   if(trigger==='canvas'){await page.evaluate(()=>{globalThis.__adFocused=true;});await page.locator('canvas').tap({position:{x:420,y:110}});}
   await page.waitForFunction(()=>!__night.snapshot().modal&&__night.snapshot().pauses.length===0&&globalThis.__redMarks?.diamonds>0);
   await page.waitForFunction(async()=>{const {director,UIOpacity}=await System.import('cc');return director.getScene().getComponentsInChildren(UIOpacity).filter(c=>c.node.name==='Panel'&&c.node.activeInHierarchy).length===0;},null,{timeout:5000});
   const resumedAt=(await snapshot(page)).time;
   await page.waitForFunction(time=>__night.snapshot().time>time+.4,resumedAt);
   await settleVisuals(page);
   const after=await page.evaluate(()=>({state:__night.snapshot(),marks:__redMarks,offers:__offers}));
   assert.equal(after.offers,1);assert.deepEqual(after.state.held,[]);assert(after.marks.diamonds>0);
   await page.screenshot({path:fileURLToPath(new URL(kind+'-'+trigger+'.png',out))});
   checks.push({kind,trigger,before:before.marks,after:after.marks,pauses:after.state.pauses,offers:after.offers});
  }finally{await context.close();}
 }
 assert.deepEqual(errors,[]);await writeFile(new URL('evidence.json',out),JSON.stringify({build,checks,errors,fixture:'Ad completion and focus/visibility boundaries; actual UI input and per-frame red-diamond draw calls. No real ad inventory or device validation.'},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser.close();}
