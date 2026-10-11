import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { browserEvidence, touchPath } from './browser-evidence.mjs';
const env=await browserEvidence();const {page,base,shot}=env;
const {levels}=JSON.parse(await readFile(new URL('../content/chapters/birthday.json',import.meta.url)));
const key='surprise-kept.progress.v1';
async function tap(selector){await page.locator(selector).tap();}
try {
 await page.goto(base);await expect(page.locator('#game')).toHaveAttribute('data-ready','true');await shot('room-start');
 await tap('#box-green');const normal=await page.evaluate(key=>localStorage.getItem(key),key);
 await page.goto(base+'?challenge=birthday-03&token=private');await expect(page.locator('#steps')).toContainText('不改存档');
 const a=await page.locator('#item-gift').boundingBox(),b=await page.locator('#box-blue').boundingBox();
 await touchPath(page,[{x:a.x+a.width/2,y:a.y+a.height/2},{x:b.x+b.width/2,y:b.y+b.height/2}],true);
 assert.equal(await page.evaluate(()=>window.__surprise.snapshot().state.steps),0);
 for(const action of levels[2].solution){if(action.type==='move')await tap('#box-'+action.to);else{if(action.type==='screen')await tap('#screen');await tap('#character-'+action.character);}}
 await shot('arranged');await tap('#memory-blue');
 await expect(page.locator('#modal-body')).toContainText('第 2 步，礼物搬到了蓝箱');await expect(page.locator('#modal-body')).toContainText('第 4 步，礼物搬到了绿箱');await expect(page.locator('#modal-body')).toContainText('在倒茶，没看到');await shot('memory-cause');
 await tap('[data-action="close"]');await tap('#memory-orange');await expect(page.locator('#modal-body')).toContainText('被屏风挡住，没看到');await tap('[data-action="close"]');
 await tap('#pause');await shot('pause');await tap('#resume');
 await tap('#reveal');await expect(page.locator('body')).toHaveAttribute('data-phase','success',{timeout:20000});await expect(page.locator('[data-action="share"]')).toBeVisible();await shot('result');
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),normal,'invited puzzle preserves the exact original save');
 await tap('[data-action="share"]');await expect(page.locator('#share-status')).toContainText('已复制');
 const link=await page.evaluate(()=>window.__copies.at(-1));assert.deepEqual([...new URL(link).searchParams],[['challenge','birthday-03']]);
 await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async payload=>{window.__payloads.push(payload);throw new DOMException('cancel','AbortError');}}));
 await tap('[data-action="share"]');await expect(page.locator('#share-status')).toContainText('已取消');
 const payload=await page.evaluate(()=>window.__payloads[0]);assert.match(payload.text,/5 步/);assert.doesNotMatch(payload.text,/绿箱|蓝箱|红箱|屏风|倒茶/);
 await tap('[data-action="own-progress"]');assert.equal(await page.evaluate(()=>window.__surprise.snapshot().state.locations.gift),'green');assert.equal(await page.evaluate(()=>window.__surprise.snapshot().level),'birthday-01');
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),normal);await shot('return-own');
 await page.setViewportSize({width:320,height:568});await tap('#level-menu');await shot('levels-small');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 // Three real normal completions open the visible simulation inside the result dialog's top layer.
 await page.goto(base+'?level=1');
 for(let round=0;round<3;round++) {
   await tap('#box-blue');await tap('#reveal');
   await expect(page.locator('[data-action="share"]')).toBeVisible({timeout:20000});
   if(round<2){await expect(page.locator('[data-game-ad]')).toHaveCount(0);await tap('[data-action="close"]');await tap('#pause');await tap('[data-action="restart"]');}
 }
 await expect(page.locator('#modal [data-game-ad="mock"]')).toBeVisible();await shot('simulated-ad');
 const beforeAd=await page.evaluate(key=>localStorage.getItem(key),key);
 await page.getByRole('button',{name:'关闭并继续',exact:true}).tap();
 await expect(page.locator('[data-game-ad]')).toHaveCount(0);assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),beforeAd);
 await expect(page.locator('[data-action="share"]')).toBeVisible();
 assert.deepEqual(env.errors,[]);console.log('PASS surprise publishing: real touch cancellation, causal missed memories for away/screen, full five-action solve, no-spoiler same-scene share/cancel, exact normal-save recovery, 320px selection.');
}finally{await env.close();}
