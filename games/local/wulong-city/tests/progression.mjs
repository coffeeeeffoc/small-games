import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { chromium,expect } from '@playwright/test';
const base=process.env.BASE_URL||'http://127.0.0.1:4174/';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,headless:true});
const checks=[],errors=[];
async function open(save,search=''){
  const context=await browser.newContext({viewport:{width:360,height:900},hasTouch:true,isMobile:true});
  if(save)await context.addInitScript(save=>localStorage.setItem('wulong-city-v1',JSON.stringify(save)),save);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));const url=new URL(base);url.search=search;await page.goto(url.href);return{context,page};
}
try{
  let {context,page}=await open({unlocked:20,records:{20:'保留旧的通关记录'},level:20,sound:false});
  await expect(page.locator('#counter')).toHaveText('20 / 24');
  let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('wulong-city-v1')));assert.equal(saved.unlocked,21);assert.equal(saved.records[20],'保留旧的通关记录');assert.equal(saved.sound,false);
  await page.locator('#menu').tap();await expect(page.locator('[data-level="21"]')).toBeEnabled();await expect(page.locator('[data-level="22"]')).toBeDisabled();
  checks.push('Completed 20-level v1 save preserves records/current level/mute and unlocks exactly L21');await context.close();
  ({context,page}=await open({unlocked:20,records:{19:'尚未做完第20关'},level:20,sound:true}));await page.locator('#menu').tap();await expect(page.locator('[data-level="21"]')).toBeDisabled();
  checks.push('An old save that only reached L20 does not unlock L21');await context.close();
  const old={unlocked:3,records:{1:'旧门',2:'旧电梯'},level:3,sound:false};
  ({context,page}=await open(old,'?challenge=21&dev=1&private=strip-this'));
  const snap=()=>page.evaluate(()=>window.__wulong.snapshot());assert.equal((await snap()).challengeMode,true);assert.equal((await snap()).state.id,21);
  await page.locator('[data-zone="fan-power"]').tap();await page.locator('[data-zone="fan-face"]').tap();
  await page.waitForFunction(()=>window.__wulong.snapshot().state.dry===1);await page.locator('canvas').focus();await page.keyboard.down('ArrowRight');
  await page.waitForFunction(()=>window.__wulong.snapshot().state.won);await page.keyboard.up('ArrowRight');await page.locator('#share').waitFor({state:'visible'});
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('wulong-city-v1'))),old);assert.equal((await snap()).unlocked,3);assert.deepEqual((await snap()).records,old.records);
  await page.evaluate(()=>{window.copies=[];Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.copies.push(text)}});});
  await page.locator('#share').tap();const expected=new URL(base);expected.search='';expected.hash='';expected.searchParams.set('challenge','21');await expect.poll(()=>page.evaluate(()=>window.copies)).toEqual([expected.href]);
  await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw {name:'AbortError'};}}));await page.locator('#share').tap();await expect(page.locator('#share')).toBeEnabled();
  assert.equal(await page.locator('#share-status').textContent(),'');assert.deepEqual(await page.evaluate(()=>window.copies),[expected.href]);
  await page.evaluate(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});});
  await page.locator('#share').tap();await expect(page.locator('#share-link')).toHaveValue(expected.href);
  await page.locator('#again').tap();assert.equal((await snap()).challengeMode,true);assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('wulong-city-v1'))),old);
  await page.locator('#menu').tap();await page.locator('[data-level="1"]').tap();assert.equal((await snap()).challengeMode,false);assert.equal((await snap()).unlocked,3);
  checks.push('Locked shared L21 can be solved/replayed without changing regular v1 progress; clean challenge copy, object AbortError cancellation and manual fallback work; returning to unlocked normal levels leaves challenge mode');await context.close();
  for(const search of ['?challenge=0','?challenge=25','?challenge=21&challenge=22','?challenge=21&challenge=21','?challenge=1.5','?challenge=021']){
    ({context,page}=await open(null,search));await expect(page.locator('#counter')).toHaveText('01 / 24');await expect(page.locator('#feedback')).toContainText('分享链接的关卡无效');await context.close();
  }
  checks.push('Out-of-range, noninteger, zero-padded and duplicate challenge parameters fall back visibly to normal progress');
  assert.deepEqual(errors,[]);await mkdir(new URL('evidence/',import.meta.url),{recursive:true});await writeFile(new URL('evidence/progression.json',import.meta.url),JSON.stringify({checks,errors},null,2));console.log(checks.join('\n'));
}finally{await browser.close();}
