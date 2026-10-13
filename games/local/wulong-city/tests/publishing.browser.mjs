import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { browserEvidence } from './browser-evidence.mjs';
const env=await browserEvidence({evidence:new URL('../docs/design/rewarded-android-2026-10-14/publishing/',import.meta.url)});const {page,base,shot}=env;
try {
 await page.goto(base+'?dev=1');await shot('home');await page.locator('#home-levels').tap();await shot('levels');await page.locator('#levels-back').tap();await page.locator('#start-game').tap();
 const normal=await page.evaluate(()=>localStorage.getItem('wulong-city-v1'));
 await page.goto(base+'?dev=1&challenge=21&token=private');
 await page.locator('#hint').tap();await page.locator('[data-more]').tap();await page.locator('[data-more]').tap();await page.locator('[data-more]').tap();
 await expect(page.locator('.hint-step')).toContainText('1 / 3');await shot('hints');await page.locator('[data-close-hint]').tap();
 await page.locator('#pause').tap();await shot('pause');await page.locator('[data-resume]').tap();
 await page.locator('[data-zone="fan-power"]').tap();await page.locator('[data-zone="fan-face"]').tap();
 await page.waitForFunction(()=>window.__wulong.snapshot().state.dry===1);await shot('playing');
 const bounds=await page.locator('#right').boundingBox(),cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2,id:1}]});
 await page.locator('#game[data-page="result"]').waitFor();await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
 await expect(page.locator('.hint-outcome')).toHaveText('看过 3 级提示 · 辅助破解');await shot('result');
 await page.locator('#share').tap();await expect(page.locator('#share-status')).toContainText('已复制');
 const link=await page.evaluate(()=>window.__copies.at(-1));assert.deepEqual([...new URL(link).searchParams],[['challenge','21']]);
 await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async payload=>{window.__payloads.push(payload);throw new DOMException('cancel','AbortError');}}));
 await page.locator('#share').tap();await expect(page.locator('#share-status')).toContainText('已取消');
 const payload=await page.evaluate(()=>window.__payloads[0]);assert.match(payload.text,/看过 3 级提示/);assert.doesNotMatch(payload.text,/风扇|背后|风向/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('wulong-city-v1')),normal);
 await page.locator('#again').tap();await page.locator('#hint').tap();await page.locator('[data-close-hint]').tap();assert.equal(await page.evaluate(()=>window.__wulong.snapshot().state.hintsUsed),1,'a replay starts a fresh assistance record');
 await page.locator('#menu').tap();await expect(page.locator('#game')).toHaveAttribute('data-page','home');await shot('return');
 // Count real host opportunities: revisiting a completed mainline after a trial is not a new result.
 await page.addInitScript(()=>{window.__ads=[];window.SmallGamesPublishingConfig={adMode:'host',provider:{show:async request=>{window.__ads.push(request);return{status:'completed'};}}};});
 await page.goto(base+'?dev=1&level=1');
 async function completeFirst(){
   const input=await page.context().newCDPSession(page);
   const left=await page.locator('#left').boundingBox();
   await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:left.x+left.width/2,y:left.y+left.height/2,id:1}]});await page.waitForTimeout(100);
   await input.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await page.waitForFunction(()=>window.__wulong.snapshot().state.opened,{},{timeout:12000});
   const right=await page.locator('#right').boundingBox();
   await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:right.x+right.width/2,y:right.y+right.height/2,id:1}]});
   await page.locator('#game[data-page="result"]').waitFor();await input.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await input.detach();
 }
 await completeFirst();
 for(let i=0;i<2;i++){await page.locator('[data-home]').tap();await page.locator('#home-records').tap();await page.locator('[data-try="25"]').tap();await page.locator('#tryout-back').tap();await expect(page.locator('#game')).toHaveAttribute('data-page','result');}
 assert.equal(await page.evaluate(()=>window.__ads.length),0,'returning from a trial cannot count the same mainline completion twice');
 for(let i=0;i<2;i++){await page.locator('#again').tap();await completeFirst();}
 assert.equal(await page.evaluate(()=>window.__ads.length),0,'puzzle results never auto-play ads');

 assert.deepEqual(env.errors,[]);
 console.log('PASS wulong publishing: touch-only fan puzzle, 3-tier hint record survives wrap, replay resets, no-spoiler sanitized share/cancel and challenge save isolation.');
}finally{await env.close();}
// The publication gate executes this entry, including the installed-APK bridge contract.
await import('./rewarded.browser.mjs');
