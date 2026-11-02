import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { acceptanceBuild, snapshot, press, settleVisuals } from './flight-browser.mjs';
import { assetFixture } from './progression-fixture.ts';

const base=process.env.NIGHT_URL,build=await acceptanceBuild(base);
const out=new URL('../reports/artwork-loading/',import.meta.url);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
const evidence={build,fixture:true,checks:[],errors:[]};
const assets=assetFixture();
const services=`const assets=${JSON.stringify(assets)},identity={playerId:assets.playerId,nickname:'夜航07'},metadata={identity,capabilities:{multiplayer:true,leaderboards:true,chat:true}};
globalThis.SmallGamesServices={ready:Promise.resolve(metadata),refresh:async()=>metadata,services:{nightAssets:async()=>structuredClone(assets),listRooms:async()=>({rooms:[]}),leaderboard:async()=>({top:[],me:null}),nightChat:async()=>({messages:[],cursor:'0',reset:true,serverNow:Date.now()})},createRecorder:()=>({start:async()=>null,record(){},finish:async()=>null,invalidate(){}})};`;
const uuid=async name=>JSON.parse(await readFile(new URL(`../assets/resources/ui/progression/${name}.png.meta`,import.meta.url),'utf8')).uuid;
const home=await uuid('home'),baseArt=await uuid('base'),hangar=await uuid('hangar');
const imagePattern=id=>new RegExp(`/native/[^/]+/${id}\\.[^/]+\\.png$`);
const save=async(page,name)=>{await settleVisuals(page);await page.screenshot({path:fileURLToPath(new URL(name+'.png',out))});};
async function open(width,height){
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000,reducedMotion:'reduce',userAgent:width<1000?'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36':undefined});
  const page=await context.newPage();
  page.on('pageerror',error=>evidence.errors.push(error.message));
  await page.route('**/game-bootstrap.js',route=>route.fulfill({contentType:'text/javascript',body:services}));
  await page.route('**/api/competition/**',route=>route.abort());
  return {context,page};
}
const ready=page=>page.waitForFunction(()=>globalThis.__night?.snapshot().ui.interfaceArtworkReady&&!document.getElementById('night-startup'),null,{timeout:60000});
const modesReady=page=>page.waitForFunction(()=>__night.snapshot().buttons.some(button=>button.id==='mode:enter'),null,{timeout:30000});
const content=page=>page.waitForFunction(async()=>{
  const {director,Label}=await System.import('cc');
  return !director.getScene().getComponentsInChildren(Label).some(label=>label.node.activeInHierarchy&&/正在加载画面|画面加载未完成/.test(label.string));
},null,{timeout:30000});
try{
  for(const [width,height] of [[568,320],[844,390],[1280,720],[390,844]]){
    const {context,page}=await open(width,height);let releaseHome,releaseNext;
    const homeGate=new Promise(resolve=>releaseHome=resolve),nextGate=new Promise(resolve=>releaseNext=resolve);
    const requests=new Map();
    page.on('request',request=>{if(request.url().includes('/native/'))requests.set(request.url(),(requests.get(request.url())||0)+1);});
    await page.route(imagePattern(home),async route=>{await homeGate;await route.continue();});
    for(const id of [baseArt,hangar])await page.route(imagePattern(id),async route=>{await nextGate;await route.continue();});
    await page.goto(base+'?dev=0',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>globalThis.__night?.snapshot().modelImport==='loaded'&&globalThis.__night?.snapshot().ui.artwork.loading.includes('home'),null,{timeout:30000}).catch(async error=>{
      console.log(await page.evaluate(()=>({status:document.getElementById('night-status')?.textContent,hint:document.getElementById('night-hint')?.textContent,artwork:globalThis.__night?.snapshot().ui.artwork})));throw error;
    });
    const overlay=page.locator('#night-startup');
    assert(await overlay.isVisible());
    const rectangle=await overlay.boundingBox();assert.equal(rectangle.width,width);assert.equal(rectangle.height,height);
    const art=await page.locator('.night-art').evaluate(element=>({image:getComputedStyle(element).backgroundImage,animation:getComputedStyle(element).animationName,width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height}));
    assert.match(art.image,/data:image\/webp;base64,/);assert.equal(art.width,width);assert.equal(art.height,height);assert.equal(art.animation,'none');
    await page.keyboard.press('Enter');await page.keyboard.press('Enter');
    assert.equal((await snapshot(page)).progression.page,'','Keyboard cannot leave hidden home');
    assert.equal((await snapshot(page)).phase,'briefing');
    await save(page,`startup-${width}`);
    releaseHome();await ready(page);await page.waitForFunction(()=>__night.snapshot().buttons.some(button=>button.id==='qm:modes'));await settleVisuals(page);
    const initial=await snapshot(page);assert(initial.ui.homeArtworkReady);assert(initial.ui.artwork.ready.includes('home'));assert(!initial.ui.artwork.failed.length);
    assert(initial.ui.artwork.loading.includes('base'),'Base starts preloading before any navigation');
    assert(initial.ui.artwork.loading.includes('hangar'),'Hangar starts preloading before any navigation');
    if(width===844)await save(page,'home-844');
    await press(page,'qm:modes',width<1000,false);
    assert(!(await snapshot(page)).buttons.some(button=>button.id==='mode:enter'),'Do not reveal incomplete mode cards');
    assert((await snapshot(page)).ui.homeArtworkReady,'Keep a loaded full-screen background');
    if(width===844||width===568)await save(page,`page-loading-${width}`);
    await press(page,'qm:back',width<1000,false);assert.equal((await snapshot(page)).progression.page,'');
    await press(page,'qm:modes',width<1000,false);releaseNext();await modesReady(page);await content(page);
    assert((await snapshot(page)).buttons.some(button=>button.id==='mode:enter'));
    await page.waitForFunction(()=>__night.snapshot().ui.artwork.ready.includes('resultBadge')&&__night.snapshot().ui.artwork.loading.length===0,null,{timeout:60000});
    if(width===844)await save(page,'modes-844');
    const before=[...requests.values()].reduce((a,b)=>a+b,0);
    await press(page,'qm:back',width<1000,false);
    for(const name of ['loadout','shop','supply','growth','tasks','inbox','warehouse','checkin']){
      await press(page,'qm:'+name,width<1000,false);await content(page);
      assert.equal((await snapshot(page)).progression.page,name);
      await press(page,'qm:back',width<1000,false);
    }
    assert.equal([...requests.values()].reduce((a,b)=>a+b,0),before,'Warm pages need no additional image requests');
    for(const id of [home,baseArt,hangar])assert.equal([...requests].filter(([url])=>imagePattern(id).test(url)).reduce((sum,[,count])=>sum+count,0),1,'Each background is requested once');
    evidence.checks.push({width,height,fullScreenLoading:true,homeWait:true,keyboardBlocked:true,preloadBeforeNavigation:true,fastOpenAndBack:true,warmPages:8,repeatImageRequests:[...requests.values()].filter(count=>count>1).length});
    await context.close();
  }
  // A failed home stays on the illustrated startup; retry is a real page reload.
  {
    const {context,page}=await open(844,390);let fail=true;
    await page.route(imagePattern(home),route=>fail?route.fulfill({status:404,body:''}):route.continue());
    await page.goto(base+'?dev=0',{waitUntil:'domcontentloaded'});
    await page.locator('#night-retry').waitFor({state:'visible',timeout:60000});
    assert.equal(await page.locator('#night-startup').getAttribute('data-state'),'error');
    const retry=await page.locator('#night-retry').boundingBox();assert(retry.height>=44&&retry.y>=0&&retry.y+retry.height<=390);
    await page.screenshot({path:fileURLToPath(new URL('home-failure-844.png',out))});fail=false;
    await page.locator('#night-retry').focus();await page.keyboard.press('Enter');await ready(page);
    evidence.checks.push({homeFailure:true,keyboardRetry:true});await context.close();
  }
  // A failed secondary picture can be retried without reloading the game or changing account data.
  {
    const {context,page}=await open(844,390);let fail=true;
    await page.route(imagePattern(baseArt),route=>fail?route.fulfill({status:404,body:''}):route.continue());
    await page.goto(base+'?dev=0',{waitUntil:'domcontentloaded'});await ready(page);
    await page.waitForFunction(()=>__night.snapshot().ui.artwork.failed.includes('base'),null,{timeout:60000});
    await press(page,'qm:modes',true,false);
    assert((await snapshot(page)).buttons.some(button=>button.id==='qm:artRetry'));
    await save(page,'page-failure-844');fail=false;await press(page,'qm:artRetry',true,false);await modesReady(page);await content(page);
    assert((await snapshot(page)).buttons.some(button=>button.id==='mode:enter'));
    assert(!(await snapshot(page)).ui.artwork.failed.includes('base'));
    evidence.checks.push({secondaryFailure:true,inPlaceRetry:true});await context.close();
  }
  assert.deepEqual(evidence.errors,[]);
}finally{
  await browser.close();await writeFile(new URL('evidence.json',out),JSON.stringify(evidence,null,2));
}
console.log(JSON.stringify(evidence));
