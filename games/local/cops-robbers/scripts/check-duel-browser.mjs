import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { getDuelLevel } from '../src/duel-levels.js';
import { initialDuel, stepDuel, chooseDuelAction } from '../src/duel.js';
const base=process.env.BASE_URL||'http://127.0.0.1:43441';
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge'});
const errors=[],checks=[];
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base);await page.locator('#start-mode').waitFor();
 for(const mode of ['escape','survival'])for(const role of ['pursuer','runner'])for(const initiative of ['first','second']){
  await page.selectOption('#solo-mode',mode);await page.selectOption('#solo-role',role);await page.selectOption('#solo-initiative',initiative);await page.selectOption('#solo-level','100');await page.locator('#start-mode').tap();
  await page.waitForFunction(role=>document.body.dataset.duelSide===role&&document.body.dataset.duelTurn!==(document.querySelector('#solo-initiative').value==='second'?'0':'-1'),role);
  const turn=await page.locator('body').getAttribute('data-duel-turn');assert.equal(Number(turn),initiative==='first'?0:1);
  assert.ok(await page.locator('#duel-wait').isEnabled());await page.locator('#duel-wait').tap();
  await page.waitForFunction(turn=>Number(document.body.dataset.duelTurn)>=turn+2||document.body.dataset.duelWinner,Number(turn));
  await page.locator('#duel-retry').tap();await page.waitForFunction(role=>document.body.dataset.duelSide===role,role);
  assert.equal(await page.locator('body').getAttribute('data-duel-role'),role);
  assert.equal(await page.locator('body').getAttribute('data-duel-turn'),initiative==='first'?'0':'1');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#duel-back').tap();assert.ok(await page.locator('#start-mode').isVisible());
  checks.push(`${mode}/${role}/${initiative}: real wait, AI response, retry order, lobby`);
 }
 // Finish a full real-input game, then verify role-specific local completion after refresh.
 await page.selectOption('#solo-mode','escape');await page.selectOption('#solo-role','pursuer');await page.selectOption('#solo-initiative','first');await page.selectOption('#solo-level','1');await page.locator('#start-mode').tap();
 const level=getDuelLevel('escape',1);let state=initialDuel(level);
 while(!state.winner){
  const action=chooseDuelAction(level,state);state=stepDuel(level,state,action);
  if(action.side==='pursuer'){
   await page.locator(`#duel-squad [data-select="${action.actor}"]`).tap();
   await page.locator(`#duel-board [data-target="${action.target}"] text`).first().tap();
  }
  await page.waitForFunction(turn=>Number(document.body.dataset.duelTurn)>=turn,state.turn);
 }
 assert.equal(state.winner,'pursuer');assert.match(await page.locator('#duel-status').textContent(),/挑战成功/);
 await page.locator('#duel-back').tap();await page.reload();assert.match(await page.locator('#solo-level option[value="1"]').textContent(),/✓/);
 assert.equal(await page.locator('#solo-mode').inputValue(),'escape');assert.equal(await page.locator('#solo-role').inputValue(),'pursuer');
 await page.locator('#friend-duel').tap();assert.match(await page.locator('#friend-note').textContent(),/单机预览/);
 checks.push('full game completed through taps, per-role win and selections survive reload, local preview friend fallback');
 for(const size of [{width:320,height:568},{width:844,height:390}]){
  await page.setViewportSize(size);await page.selectOption('#solo-level','100');await page.locator('#start-mode').tap();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const boardBounds=await page.locator('#duel-board').boundingBox();assert.ok(boardBounds.width>=(size.width>size.height?280:230),'The dense map must stay large enough to play');
  await page.locator('#duel-back').tap();checks.push(`${size.width}x${size.height}: no overflow and reachable return`);
 }
 await page.setViewportSize({width:390,height:844});await page.locator('#start-mode').tap();mkdirSync('outputs',{recursive:true});await page.screenshot({path:'outputs/duel-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);writeFileSync('outputs/duel-browser.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(`PASS ${checks.length} role/order/lifecycle/browser checks`);
}finally{await browser.close();}
