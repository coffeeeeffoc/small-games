import assert from 'node:assert/strict';
import { chromium, browserOptions, continueGame, pauseGame, goHome, activate } from './browser-helpers.mjs';
import { miniIslands } from '../challenge.js';
import { restoreProgress, findSpelling } from '../engine.js';
const base=process.env.GAME_URL||'http://127.0.0.1:4175/';
const browser=await chromium.launch(browserOptions);
const errors=[];
const board=page=>page.locator('.tile').evaluateAll(tiles=>tiles.map(tile=>({id:tile.dataset.tileId,left:tile.style.left,top:tile.style.top,z:tile.style.zIndex,selected:tile.getAttribute('aria-pressed')})));
const data=(page,key)=>page.evaluate(key=>localStorage.getItem(key),key);
const mini=async page=>JSON.parse(await data(page,'ciyu-mini-v1'));
try{
 const context=await browser.newContext({viewport:{width:320,height:568},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
 await context.addInitScript(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('unavailable'))}});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await continueGame(page);await page.locator('.tile[aria-disabled="false"]').first().tap();
 const ordinary=await data(page,'ciyu-progress');
 await page.goto(`${base}?daily=2026-10-01&v=1`);const daily=await data(page,'ciyu-daily-v1');
 await pauseGame(page);await page.locator('#daily-exit').tap();
 await activate(page,'#islands-button');
 const quick=await page.locator('[data-mini="dawn"]').boundingBox();assert.ok(quick.y>=0&&quick.y+quick.height<568,'three-word start is visible on the first phone screen');
 await page.locator('[data-mini="dawn"]').tap();assert.equal(await page.locator('body').evaluate(body=>body.classList.contains('is-playing')),true);
 assert.equal((await mini(page)).mini,'dawn');
 for(const island of miniIslands){
  await page.goto(`${base}?mini=${island.id}&v=1&token=private#secret`);
  assert.equal(await page.locator('body').evaluate(body=>body.classList.contains('is-playing')),true,'shared theme opens directly into play');
  assert.equal((await mini(page)).mini,island.id);assert.equal((await mini(page)).entries.length,3);
  const initial=await board(page);
  await page.locator('.tile[aria-disabled="false"]').first().tap();const partial=await board(page);await page.reload();assert.deepEqual(await board(page),partial);
  await page.locator('#clear-button').tap();
  while((await mini(page)).completed.length<3){
   const record=await mini(page),game=restoreProgress(record.entries,record.completed,Math.random,record.board),path=findSpelling(game,game.activeWordId);assert.ok(path);
   for(const id of path)await page.locator(`[data-tile-id="${id}"]`).tap();
   await page.waitForFunction(count=>Number(document.querySelector('#completed-count').textContent)>count,record.completed.length);
  }
  await page.locator('#win-dialog').waitFor({state:'visible'});assert.match(await page.locator('#win-summary').innerText(),/三份收获.*独立拾词/);
  assert.equal(await page.locator('#mini-progress .collected').count(),3);
  await page.locator('#win-share').tap();const url=new URL(await page.locator('#challenge-link').inputValue());assert.deepEqual([...url.searchParams.keys()],['mini','v']);assert.equal(url.searchParams.get('mini'),island.id);assert.equal(url.hash,'');
  await page.locator('#copy-challenge').tap();assert.match(await page.locator('#share-status').innerText(),/请长按/);await page.locator('#share-dialog [data-close]').last().tap();
  if(island.id==='orbit'){await page.locator('#next-mini').tap();assert.equal((await mini(page)).mini,'dawn','next island directly starts a different playable theme');await page.goto(`${base}?mini=orbit&v=1`);assert.deepEqual(await board(page),initial);}else{await page.locator('#play-again-button').tap();assert.deepEqual(await board(page),initial,'same theme replay uses identical initial cards');}
  assert.equal(await data(page,'ciyu-progress'),ordinary);assert.equal(await data(page,'ciyu-daily-v1'),daily);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const tools=await page.locator('.board-tools').boundingBox();assert.ok(tools.y+tools.height<=568,'mini controls fit on the first play screen');
  await page.locator('#pause-button').tap();await page.locator('#mini-exit').tap();assert.equal(await data(page,'ciyu-progress'),ordinary);
 }
 await page.goto(`${base}?mini=unknown&v=1`);assert.match(await page.locator('#feedback').innerText(),/链接.*无效/);assert.equal(await data(page,'ciyu-progress'),ordinary);assert.equal(await data(page,'ciyu-daily-v1'),daily);
 await page.goto(`${base}?mini=dawn&v=1`);await goHome(page);await page.locator('#daily-start').tap();assert.ok(JSON.parse(await data(page,'ciyu-daily-v1')).challenge);await page.reload();assert.equal(await page.locator('#mini-progress').isVisible(),false,'switching to daily cannot reload an old mini invitation');
 const canceled=await browser.newContext();await canceled.addInitScript(()=>Object.defineProperty(navigator,'share',{configurable:true,value:()=>Promise.reject(new DOMException('cancel','AbortError'))}));
 const cancelPage=await canceled.newPage();cancelPage.on('pageerror',e=>errors.push(e.message));await cancelPage.goto(`${base}?mini=shore&v=1`);await cancelPage.locator('#pause-button').click();await cancelPage.locator('#mini-share').click();assert.match(await cancelPage.locator('#feedback').innerText(),/取消分享/);assert.equal(await cancelPage.locator('#share-dialog').isVisible(),false);
 const deferred=await browser.newContext();await deferred.addInitScript(()=>{window.shareCalls=0;Object.defineProperty(navigator,'share',{configurable:true,value:()=>{window.shareCalls++;return new Promise((resolve,reject)=>window.rejectShare=reject);}});});
 const delayed=await deferred.newPage();delayed.on('pageerror',e=>errors.push(e.message));await delayed.goto(`${base}?mini=shore&v=1`);await delayed.locator('#pause-button').click();await delayed.locator('#mini-share').click();await delayed.locator('#mini-share').click();assert.equal(await delayed.evaluate(()=>window.shareCalls),1,'rapid clicks create only one native share request');
 await delayed.locator('#mini-exit').click();const focus=await delayed.evaluate(()=>document.activeElement.id);await delayed.evaluate(async()=>{window.rejectShare(new Error('late rejection'));await Promise.resolve();await Promise.resolve();});assert.equal(await delayed.locator('#share-dialog').isVisible(),false,'leaving the mini prevents stale share fallback');assert.equal(await delayed.evaluate(()=>document.activeElement.id),focus);
 await delayed.goto(`${base}?mini=dawn&v=1`);await delayed.evaluate(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise((resolve,reject)=>window.rejectCopy=reject)}});});await delayed.locator('#pause-button').click();await delayed.locator('#mini-share').click();await delayed.locator('#copy-challenge').click();await delayed.locator('#share-dialog [data-close]').last().click();await continueGame(delayed);await delayed.locator('#pause-button').focus();await delayed.evaluate(async()=>{window.rejectCopy(new Error('late clipboard rejection'));await Promise.resolve();await Promise.resolve();});assert.equal(await delayed.evaluate(()=>document.activeElement.id),'pause-button','closed clipboard fallback cannot reclaim focus');
 assert.deepEqual(errors,[]);console.log('PASS 320px island-selection quick start; 3 actual touch theme wins/collections; ordinary/daily/mini isolation; partial reload; exact replay/next island; strict shared entry; failed/canceled/single-flight/stale sharing; mini-to-daily refresh');
}finally{await browser.close();}
