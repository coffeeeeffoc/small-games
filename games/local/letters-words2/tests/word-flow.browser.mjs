import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { browserEvidence } from './browser-evidence.mjs';
import { restoreProgress, findSpelling } from '../engine.js';
import { continueGame } from './browser-helpers.mjs';
const env=await browserEvidence();const {page,base,shot}=env;
const record=key=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
async function solve(key){const saved=await record(key),game=restoreProgress(saved.entries,saved.completed,Math.random,saved.board);const path=findSpelling(game,game.activeWordId);assert.ok(path);for(const id of path)await page.locator(`[data-tile-id="${id}"]`).tap();await expect.poll(async()=>(await record(key)).completed.length).toBe(saved.completed.length+1);await page.waitForTimeout(100);}
try {
 await page.goto(base);await shot('home');await continueGame(page);await solve('ciyu-progress');await solve('ciyu-progress');
 await expect(page.locator('#feedback')).toContainText('连对 2 词');await shot('flow-playing');
 const free=await page.evaluate(()=>localStorage.getItem('ciyu-progress'));assert.equal(JSON.parse(free).wordFlow.current,2);
 await page.goto(base+'?daily=2026-10-01&v=1');await continueGame(page);assert.equal((await record('ciyu-daily-v1')).wordFlow.current,0);
 await solve('ciyu-daily-v1');await solve('ciyu-daily-v1');await expect(page.locator('#feedback')).toContainText('连对 2 词');
 await page.locator('#hint-button').tap();assert.equal((await record('ciyu-daily-v1')).wordFlow.current,0);assert.equal((await record('ciyu-daily-v1')).dailyStats.hints,1);
 await page.reload();await continueGame(page);assert.equal((await record('ciyu-daily-v1')).wordFlow.assisted,true);await solve('ciyu-daily-v1');assert.equal((await record('ciyu-daily-v1')).wordFlow.current,0,'restoring an assisted answer cannot turn it into an independent streak');
 await page.locator('#pause-button').tap();await shot('pause');await page.locator('#daily-exit').tap();assert.equal(await page.evaluate(()=>localStorage.getItem('ciyu-progress')),free);await continueGame(page);
 await solve('ciyu-progress');assert.equal((await record('ciyu-progress')).wordFlow.current,3,'ordinary streak resumes independently of the daily hint');
 await page.goto(base+'?mini=dawn&v=1');await continueGame(page);for(let i=0;i<3;i++)await solve('ciyu-mini-v1');
 await expect(page.locator('#win-dialog')).toBeVisible();await expect(page.locator('#win-summary')).toContainText('最佳连续独立拼对 3 词');await shot('result');
 await page.locator('#play-again-button').tap();assert.deepEqual((await record('ciyu-mini-v1')).wordFlow,{current:0,best:0,assisted:false});
 await page.setViewportSize({width:320,height:568});await page.locator('#pause-button').tap();await page.locator('#home-button').tap();await shot('return-small');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(env.errors,[]);
 console.log('PASS word flow: real touch two-word combo, assisted/reloaded word excluded, free/daily/mini save isolation, 3-word result and fresh replay, 320px home.');
}finally{await env.close();}
