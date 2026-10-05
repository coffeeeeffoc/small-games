import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
const server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{host:'127.0.0.1',port:0}});
await server.listen();
const base=`http://127.0.0.1:${server.httpServer.address().port}/`;
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const output=new URL('../../../../.scratch/travel-bund-routes/',import.meta.url);await mkdir(output,{recursive:true});
const checks=[],errors=[];
async function open({search='?route=architecture',visits=[],share='copy',viewport={width:390,height:844},enter=true}={}){
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,acceptDownloads:true});
  await context.addInitScript(({visits,share})=>{
    localStorage.setItem('travel-bund.visits.v1',JSON.stringify(visits));window.copied=[];window.shareRequests=0;window.copyRequests=0;
    const deferred=()=>new Promise((resolve,reject)=>{window.finishShare=resolve;window.failShare=reject;});
    Object.defineProperty(navigator,'share',{configurable:true,value:share==='cancel'?async()=>{throw {name:'AbortError'};}:share==='share-pending'?()=>{window.shareRequests++;return deferred();}:undefined});
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:share==='manual'?undefined:{writeText:async text=>{window.copyRequests++;if(share==='copy-pending')await deferred();window.copied.push(text);}}});
  },{visits,share});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/Scene.tsx*',route=>route.fulfill({contentType:'text/javascript',body:'export function Scene({onReady,teleport,renderDetail}) { window.routeLanding = teleport.position; window.routeView = teleport; window.modelDetail = renderDetail; queueMicrotask(onReady); return null; }'}));
  await page.goto(base+search);await expect(page.locator('main')).toHaveAttribute('data-ready','true');if(enter)await page.locator('#enter-world').tap();
  return {context,page};
}
try{
  let {context,page}=await open({search:'?route=architecture&debug=1&private=do-not-share'});
  await expect(page.getByRole('button',{name:'查看探索路线'})).toContainText('0 / 3');
  await page.getByRole('button',{name:'认识 江海关大楼'}).tap();await page.getByRole('button',{name:'收入旅行手记'}).tap();
  await page.getByRole('button',{name:'返回漫游'}).tap();await expect(page.getByRole('button',{name:'查看探索路线'})).toContainText('1 / 3');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('travel-bund.visits.v1'))),['customs-house']);
  await page.getByRole('button',{name:'打开旅行手记'}).tap();await page.getByRole('button',{name:'邀请朋友沿江走走'}).tap();
  await expect.poll(()=>page.evaluate(()=>window.copied)).toEqual([base+'?route=architecture&renderDetail=light']);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'保存我的漫游纪念卡'}).tap();
  const saved=await download,bytes=await readFile(await saved.path());assert.equal(bytes.readUInt32BE(16),1080);assert.equal(bytes.readUInt32BE(20),1350);
  assert(saved.suggestedFilename().includes('1处打卡'));await page.screenshot({path:fileURLToPath(new URL('journal-mobile.png',output))});
  checks.push('Shared route starts with no imported credit; collecting an actual nearby landmark credits exactly one stop; clean route copy and real PNG passport download work');await context.close();
  ({context,page}=await open({visits:['customs-house','hsbc-building','peace-hotel'],share:'cancel',viewport:{width:844,height:390}}));
  await expect(page.getByRole('button',{name:'查看探索路线'})).toContainText('3 / 3');
  await page.getByRole('button',{name:'打开旅行手记'}).tap();await page.getByRole('button',{name:'邀请朋友沿江走走'}).tap();
  await expect(page.getByRole('button',{name:'邀请朋友沿江走走'})).toBeEnabled();assert.deepEqual(await page.evaluate(()=>window.copied),[]);
  checks.push('Existing local completed route stays complete; Web Share cancellation does not copy or report a successful copy');await context.close();
  ({context,page}=await open({share:'manual'}));await page.getByRole('button',{name:'打开旅行手记'}).tap();await page.getByRole('button',{name:'邀请朋友沿江走走'}).tap();
  await expect(page.getByRole('textbox')).toHaveValue(base+'?route=architecture&renderDetail=light');checks.push('Unavailable share and clipboard expose a selectable public route and model-detail URL');await context.close();
  ({context,page}=await open({search:'?route=skyline'}));
  await expect(page.getByRole('button',{name:'查看探索路线'})).toContainText('三种摩天轮廓');
  assert.deepEqual(await page.evaluate(()=>window.routeLanding),[1147,2,405],'A skyline invitation supplies its existing Pudong landing to Scene');
  assert((await page.evaluate(()=>window.routeView.pitch))>1,'The tower invitation looks up instead of starting against its ground-level facade');
  checks.push('A skyline invitation starts at its existing landing instead of making a friend cross the river first');await context.close();
  ({context,page}=await open({search:'?route=architecture&route=skyline'}));assert.equal(await page.getByRole('button',{name:'查看探索路线'}).count(),0);
  await page.getByRole('button',{name:'打开地图'}).tap();await page.getByRole('button',{name:/三种摩天轮廓/}).tap();
  await expect(page.getByRole('button',{name:'查看探索路线'})).toContainText('三种摩天轮廓');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  checks.push('Duplicate route selectors are ignored; route selection through the real map works without horizontal overflow');await context.close();
  for(const viewport of [{width:320,height:568},{width:844,height:390}]) {
    ({context,page}=await open({search:'?renderDetail=original',viewport,enter:false}));
    await expect(page.locator('main')).toHaveAttribute('data-render-detail','original');assert.equal(await page.evaluate(()=>window.modelDetail),'original');
    await expect(page.getByRole('button',{name:/钟楼与旧石墙/})).toBeVisible();
    const choice=page.getByRole('button',{name:/三种摩天轮廓/}),box=await choice.boundingBox();assert(box.y>=0&&box.y+box.height<=viewport.height,'First-screen routes stay inside the viewport');
    await page.screenshot({path:fileURLToPath(new URL(`intro-${viewport.width}.png`,output))});await choice.tap();
    await expect(page.locator('main')).toHaveAttribute('data-phase','playing');await page.getByRole('button',{name:'暂停'}).tap();
    await page.getByRole('combobox',{name:'模型细节'}).selectOption('balanced');await expect(page.locator('main')).toHaveAttribute('data-render-detail','balanced');
    assert.equal(await page.evaluate(()=>localStorage.getItem('travel-bund.render-detail.v1')),'balanced');
    assert.equal(new URL(page.url()).searchParams.get('renderDetail'),'balanced');await page.reload();
    await expect(page.locator('main')).toHaveAttribute('data-render-detail','balanced');
    await context.close();
  }
  checks.push('320px portrait and landscape first-screen routes remain clickable; original URL reaches Scene unchanged, and model-detail selection is saved independently of pixel quality');
  ({context,page}=await open({search:'?renderDetail=original&renderDetail=light'}));await expect(page.locator('main')).toHaveAttribute('data-render-detail','light');await context.close();
  ({context,page}=await open({search:'?route=architecture&renderDetail=light&account=private#room=secret'}));
  await page.getByRole('button',{name:'暂停'}).tap();await page.getByRole('combobox',{name:'模型细节'}).selectOption('original');
  assert.equal(page.url(),base+'?route=architecture&renderDetail=original');await page.reload();await expect(page.locator('main')).toHaveAttribute('data-render-detail','original');
  await expect.poll(()=>page.evaluate(()=>window.modelDetail)).toBe('original');await context.close();
  checks.push('Selecting original from a public light URL updates that selector, strips private data, preserves the route and stays original after refresh; duplicate detail values fall back');
  for(const {share,change,settle} of [
    {share:'share-pending',change:'detail',settle:'reject'},
    {share:'share-pending',change:'route',settle:'resolve'},
    {share:'copy-pending',change:'detail',settle:'reject'},
    {share:'copy-pending',change:'route',settle:'resolve'},
  ]) {
    ({context,page}=await open({search:'?route=architecture&renderDetail=light',share}));
    await page.getByRole('button',{name:'打开旅行手记'}).tap();
    await page.locator('.share-walk').evaluate(button=>{button.click();button.click();});
    await expect.poll(()=>page.evaluate(()=>window.shareRequests+window.copyRequests)).toBe(1);
    await page.getByRole('button',{name:'返回漫游'}).tap();
    if(change==='detail') {
      await page.getByRole('button',{name:'暂停'}).tap();await page.getByRole('combobox',{name:'模型细节'}).selectOption('original');
      await page.getByRole('button',{name:'返回漫游'}).tap();
    } else {
      await page.getByRole('button',{name:'打开地图'}).tap();await page.getByRole('button',{name:/三种摩天轮廓/}).tap();
    }
    await page.getByRole('button',{name:'打开旅行手记'}).tap();await expect(page.locator('.share-walk')).toBeDisabled();
    await page.evaluate(settle=>settle==='reject'?window.failShare(null):window.finishShare(),settle);
    await expect(page.locator('.share-walk')).toBeEnabled();assert.equal(await page.getByRole('textbox').count(),0);
    assert(!(await page.locator('body').innerText()).includes('漫游链接已复制'));assert(!(await page.locator('body').innerText()).includes('分享入口已打开'));
    assert.equal(await page.evaluate(()=>window.shareRequests+window.copyRequests),1,'A stale Web Share rejection must not start clipboard fallback');
    await context.close();
  }
  checks.push('Immediate share lock permits one API call; changing route/detail invalidates pending share or clipboard success/failure and keeps the lock until settlement without stale links or feedback');
  assert.deepEqual(errors,[]);await writeFile(new URL('report.json',output),JSON.stringify({checks,errors,scene:'isolated; no full 3D walk or performance claim'},null,2));console.log(checks.join('\n'));
}finally{await browser.close();await server.close();}
