import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { chromium,expect } from '@playwright/test';
const base=process.env.BASE_URL||'http://127.0.0.1:4174/';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,headless:true});
const checks=[],errors=[];
async function holdTouch(page,action,ms){
  await page.locator('#'+action).scrollIntoViewIfNeeded();const b=await page.locator('#'+action).boundingBox(),cdp=await page.context().newCDPSession(page),point={id:1,x:b.x+b.width/2,y:b.y+b.height/2};
  try{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await page.waitForTimeout(ms);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[point]});}finally{await cdp.detach();}
}
async function dragTouch(page,id,x,y){
  const zone=page.locator(`[data-zone="${id}"]`);await zone.scrollIntoViewIfNeeded();const z=await zone.boundingBox(),canvas=await page.locator('canvas').boundingBox(),cdp=await page.context().newCDPSession(page),sx=z.x+z.width/2,sy=z.y+z.height/2,ex=canvas.x+x*canvas.width/480,ey=canvas.y+y*canvas.height/520;
  try{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:sx,y:sy}]});for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:sx+(ex-sx)*i/12,y:sy+(ey-sy)*i/12}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{id:1,x:ex,y:ey}]});}finally{await cdp.detach();}
}
async function open(save,search=''){
  const context=await browser.newContext({viewport:{width:360,height:900},hasTouch:true,isMobile:true});
  if(save)await context.addInitScript(save=>{if(!localStorage.getItem('wulong-city-v1'))localStorage.setItem('wulong-city-v1',JSON.stringify(save));},save);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));const url=new URL(base);url.search=search;await page.goto(url.href);return{context,page};
}
try{
  // Old IDs remain in links and records; only the player-facing route is numbered anew.
  let {context:orderContext,page:orderPage}=await open({unlocked:3,records:{1:'旧门',2:'旧电梯'},level:3,sound:false});
  await expect(orderPage.locator('#title')).toHaveText('宠物通道');await expect(orderPage.locator('#counter')).toHaveText('08 / 26');await expect(orderPage.locator('#chapter')).toHaveText('第二章 · 街上的东西各有想法');
  let migrated=await orderPage.evaluate(()=>JSON.parse(localStorage.getItem('wulong-city-v1')));assert.equal(migrated.orderVersion,2);assert.deepEqual(migrated.unlockedLevels,[1,2,4,3]);assert.equal(migrated.level,3);assert.deepEqual(migrated.records,{1:'旧门',2:'旧电梯'});assert.equal(migrated.sound,false);
  await orderPage.locator('#menu').tap();assert.deepEqual(await orderPage.locator('[data-level]').evaluateAll(buttons=>buttons.slice(0,9).map(button=>[Number(button.dataset.level),button.textContent])),[[1,'01'],[2,'02'],[4,'03'],[5,'04'],[6,'05'],[7,'06'],[8,'07'],[3,'08'],[9,'09']]);
  await expect(orderPage.locator('[data-level="3"]')).toHaveAccessibleName('第8关 宠物通道');await expect(orderPage.locator('[data-level="3"]')).toBeEnabled();await expect(orderPage.locator('[data-level="4"]')).toBeEnabled();await expect(orderPage.locator('[data-level="5"]')).toBeDisabled();await expect(orderPage.locator('[data-level="9"]')).toBeDisabled();
  await orderPage.locator('[data-level="4"]').tap();await expect(orderPage.locator('#title')).toHaveText('门卫只看影子');await expect(orderPage.locator('#counter')).toHaveText('03 / 26');await expect(orderPage.locator('#chapter')).toHaveText('第一章 · 先出得了门');
  await orderPage.reload();await expect(orderPage.locator('#counter')).toHaveText('03 / 26');assert.deepEqual((await orderPage.evaluate(()=>JSON.parse(localStorage.getItem('wulong-city-v1')))).unlockedLevels,[1,2,4,3]);await orderContext.close();
  checks.push('Revised menu numbers, chapter boundaries and current level follow the new route; old dog unlock remains available, the new third encounter opens, and migration survives reload without opening skipped encounters');
  ({context:orderContext,page:orderPage}=await open(null,'?challenge=3'));await expect(orderPage.locator('#title')).toHaveText('宠物通道');await expect(orderPage.locator('#counter')).toHaveText('08 / 26');assert.equal(await orderPage.evaluate(()=>localStorage.getItem('wulong-city-v1')),null);await orderContext.close();
  ({context:orderContext,page:orderPage}=await open({unlocked:3,records:{3:'旧宠物关完成'},level:3}));await orderPage.locator('#menu').tap();await expect(orderPage.locator('[data-level="3"]')).toHaveClass(/done/);await expect(orderPage.locator('[data-level="8"]')).not.toHaveClass(/done/);await expect(orderPage.locator('.records')).toContainText('08 / 小狗携带一名人类顺利通过检查。');await expect(orderPage.locator('[data-level="9"]')).toBeEnabled();await orderContext.close();
  checks.push('Existing challenge=3 still opens the dog encounter; old completion records stay with the same puzzle, display eighth, and unlock its new successor');
  let {context,page}=await open({unlocked:20,records:{20:'保留旧的通关记录'},level:20,sound:false});
  await expect(page.locator('#counter')).toHaveText('20 / 26');
  let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('wulong-city-v1')));assert.equal(saved.unlocked,21);assert.equal(saved.records[20],'保留旧的通关记录');assert.equal(saved.sound,false);
  await page.locator('#menu').tap();await expect(page.locator('[data-level="21"]')).toBeEnabled();await expect(page.locator('[data-level="22"]')).toBeDisabled();
  checks.push('Completed 20-level v1 save preserves records/current level/mute and unlocks exactly L21');await context.close();
  ({context,page}=await open({unlocked:20,records:{19:'尚未做完第20关'},level:20,sound:true}));await page.locator('#menu').tap();await expect(page.locator('[data-level="21"]')).toBeDisabled();
  checks.push('An old save that only reached L20 does not unlock L21');await context.close();
  ({context,page}=await open({unlocked:24,records:{24:'奖杯已交给玩家'},level:24,sound:false}));
  await expect(page.locator('#counter')).toHaveText('24 / 26');saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('wulong-city-v1')));assert.equal(saved.unlocked,25);assert.equal(saved.records[24],'奖杯已交给玩家');assert.equal(saved.level,24);assert.equal(saved.sound,false);
  await page.locator('#menu').tap();await expect(page.locator('[data-level="25"]')).toBeEnabled();await expect(page.locator('[data-level="26"]')).toBeDisabled();
  checks.push('Completed 24-level v1 save preserves fields and unlocks exactly L25; sixth chapter includes locked L26');await context.close();
  ({context,page}=await open({unlocked:24,records:{23:'尚未领取奖杯'},level:24,sound:true}));await page.locator('#menu').tap();await expect(page.locator('[data-level="25"]')).toBeDisabled();
  checks.push('An old save that only reached L24 does not unlock L25');await context.close();
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
  ({context,page}=await open(old,'?challenge=26&dev=1'));assert.equal((await page.evaluate(()=>window.__wulong.snapshot())).challengeMode,true);await expect(page.locator('#counter')).toHaveText('26 / 26');await expect(page.locator('#tryout')).toBeHidden();assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('wulong-city-v1'))),old);await context.close();
  checks.push('New final challenge L26 is accepted and remains isolated from regular progress');
  for(const search of ['?challenge=0','?challenge=27','?challenge=21&challenge=22','?challenge=21&challenge=21','?challenge=1.5','?challenge=021']){
    ({context,page}=await open(null,search));await expect(page.locator('#counter')).toHaveText('01 / 26');await expect(page.locator('#feedback')).toContainText('分享链接的关卡无效');await context.close();
  }
  checks.push('Out-of-range, noninteger, zero-padded and duplicate challenge parameters fall back visibly to normal progress');
  const main={unlocked:3,records:{1:'门已主动来接',2:'电梯已有墨镜'},level:1,sound:false};
  ({context,page}=await open(main));assert.equal(await page.evaluate(()=>typeof window.__wulong),'undefined');await expect(page.locator('#tryout-choices')).toBeVisible();
  const original=await page.evaluate(()=>localStorage.getItem('wulong-city-v1')),migratedMain=JSON.parse(original);
  await page.locator('[data-try="25"]').tap();await expect(page.locator('#chapter')).toHaveText('今日试演 · 不改主线进度');await expect(page.locator('#counter')).toHaveText('25 / 26');
  await page.locator('[data-zone="worry-weigh"]').tap();await expect(page.locator('#feedback')).toContainText('先站到秤上');
  await holdTouch(page,'right',1100);await page.locator('[data-zone="worry-weigh"]').tap();await expect(page.locator('#feedback')).toContainText('九十九公斤的心事');
  await dragTouch(page,'worry-cloud',113,190);await expect(page.locator('#feedback')).toContainText('心事挂好了');await page.locator('[data-zone="worry-weigh"]').tap();await expect(page.locator('#feedback')).toContainText('五十七公斤');
  await holdTouch(page,'right',1600);await page.locator('#next').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>localStorage.getItem('wulong-city-v1')),original);
  await page.locator('#again').tap();await expect(page.locator('#counter')).toHaveText('25 / 26');await page.locator('#retry').tap();assert.equal(await page.evaluate(()=>localStorage.getItem('wulong-city-v1')),original);await page.locator('#tryout-back').tap();await expect(page.locator('#counter')).toHaveText('01 / 26');assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('wulong-city-v1'))),migratedMain);
  await page.locator('[data-try="26"]').tap();await page.locator('[data-zone="far-remote"]').tap();await expect(page.locator('#feedback')).toContainText('先走近桌子');
  await holdTouch(page,'right',1250);await page.locator('[data-zone="far-remote"]').tap();await expect(page.locator('#feedback')).toContainText('拿好了');await page.locator('[data-zone="far-remote"]').tap();await expect(page.locator('#feedback')).toContainText('近控器');
  await holdTouch(page,'left',880);await page.locator('[data-zone="far-remote"]').tap();await expect(page.locator('#feedback')).toContainText('局部有门');await page.locator('[data-zone="far-remote"]').tap();await expect(page.locator('#feedback')).toContainText('出口频道开播');
  await holdTouch(page,'right',1850);await page.locator('#next').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>localStorage.getItem('wulong-city-v1')),original);
  await page.evaluate(()=>{window.copies=[];Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.copies.push(text)}});});await page.locator('#share').tap();const finalURL=new URL(base);finalURL.search='';finalURL.hash='';finalURL.searchParams.set('challenge','26');assert.deepEqual(await page.evaluate(()=>window.copies),[finalURL.href]);
  await page.locator('#next').tap();await expect(page.locator('#counter')).toHaveText('01 / 26');assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('wulong-city-v1'))),migratedMain);
  for(const width of [320,360,390]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await expect(page.locator('[data-try="25"]')).toBeVisible();await expect(page.locator('[data-try="26"]')).toBeVisible();}
  checks.push('Normal first-screen previews L25/L26 solve using only real CDP touch and DOM feedback, including wrong attempts; retries, completed L26 share, and return restore the original main save; 320/360/390px cards do not overflow');await context.close();
  ({context,page}=await open(main,'?dev=1'));await page.locator('canvas').focus();await page.keyboard.down('ArrowRight');await page.waitForFunction(()=>window.__wulong.snapshot().state.p.x>110);await page.keyboard.up('ArrowRight');
  await page.locator('#hint').tap();await page.locator('[data-more]').tap();await page.locator('[data-close-hint]').tap();
  const prior=await page.evaluate(()=>window.__wulong.snapshot());await page.locator('[data-try="26"]').tap();await page.waitForTimeout(200);
  await page.locator('[data-try="25"]').evaluate(button=>button.click());await expect(page.locator('#counter')).toHaveText('26 / 26');
  await page.locator('#tryout-back').tap();const resumed=await page.evaluate(()=>window.__wulong.snapshot());assert.equal(resumed.state.p.x,prior.state.p.x);assert.equal(resumed.state.p.dir,prior.state.p.dir);assert(resumed.state.t<prior.state.t+.25);assert.equal(resumed.challengeMode,false);
  await page.locator('#hint').tap();await expect(page.locator('.hint-step')).toHaveText('提示 2 / 3');assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('wulong-city-v1'))),migratedMain);await context.close();
  checks.push('Leaving a preview resumes the paused original actor, puzzle clock and hint step; duplicate or hidden preview activations cannot replace the return state');
  assert.deepEqual(errors,[]);await mkdir(new URL('evidence/',import.meta.url),{recursive:true});await writeFile(new URL('evidence/progression.json',import.meta.url),JSON.stringify({checks,errors},null,2));console.log(checks.join('\n'));
}finally{await browser.close();}
