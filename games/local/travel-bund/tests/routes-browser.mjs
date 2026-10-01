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
async function open({search='?route=architecture',visits=[],share='copy',viewport={width:390,height:844}}={}){
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,acceptDownloads:true});
  await context.addInitScript(({visits,share})=>{
    localStorage.setItem('travel-bund.visits.v1',JSON.stringify(visits));window.copied=[];
    Object.defineProperty(navigator,'share',{configurable:true,value:share==='cancel'?async()=>{throw {name:'AbortError'};}:undefined});
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:share==='manual'?undefined:{writeText:async text=>window.copied.push(text)}});
  },{visits,share});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/Scene.tsx*',route=>route.fulfill({contentType:'text/javascript',body:'export function Scene({onReady,teleport}) { window.routeLanding = teleport.position; queueMicrotask(onReady); return null; }'}));
  await page.goto(base+search);await expect(page.locator('main')).toHaveAttribute('data-ready','true');await page.locator('#enter-world').tap();
  return {context,page};
}
try{
  let {context,page}=await open({search:'?route=architecture&debug=1&private=do-not-share'});
  await expect(page.getByRole('button',{name:'查看探索路线'})).toContainText('0 / 3');
  await page.getByRole('button',{name:'认识 江海关大楼'}).tap();await page.getByRole('button',{name:'收入旅行手记'}).tap();
  await page.getByRole('button',{name:'返回漫游'}).tap();await expect(page.getByRole('button',{name:'查看探索路线'})).toContainText('1 / 3');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('travel-bund.visits.v1'))),['customs-house']);
  await page.getByRole('button',{name:'打开旅行手记'}).tap();await page.getByRole('button',{name:'邀请朋友沿江走走'}).tap();
  await expect.poll(()=>page.evaluate(()=>window.copied)).toEqual([base+'?route=architecture']);
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
  await expect(page.getByRole('textbox')).toHaveValue(base+'?route=architecture');checks.push('Unavailable share and clipboard expose a selectable public route URL');await context.close();
  ({context,page}=await open({search:'?route=skyline'}));
  await expect(page.getByRole('button',{name:'查看探索路线'})).toContainText('三种摩天轮廓');
  assert.deepEqual(await page.evaluate(()=>window.routeLanding),[1147,2,405],'A skyline invitation supplies its existing Pudong landing to Scene');
  checks.push('A skyline invitation starts at its existing landing instead of making a friend cross the river first');await context.close();
  ({context,page}=await open({search:'?route=architecture&route=skyline'}));assert.equal(await page.getByRole('button',{name:'查看探索路线'}).count(),0);
  await page.getByRole('button',{name:'打开地图'}).tap();await page.getByRole('button',{name:/三种摩天轮廓/}).tap();
  await expect(page.getByRole('button',{name:'查看探索路线'})).toContainText('三种摩天轮廓');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  checks.push('Duplicate route selectors are ignored; route selection through the real map works without horizontal overflow');await context.close();
  assert.deepEqual(errors,[]);await writeFile(new URL('report.json',output),JSON.stringify({checks,errors,scene:'isolated; no full 3D walk or performance claim'},null,2));console.log(checks.join('\n'));
}finally{await browser.close();await server.close();}
