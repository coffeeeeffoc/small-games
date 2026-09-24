import {chromium} from 'playwright';import assert from 'node:assert/strict';import {writeFile,mkdir}from'node:fs/promises';
const base=process.env.GAME_URL||'http://127.0.0.1:43690';const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[],checks=[];
try {
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);const snapshot=()=>page.evaluate(async()=>(await import('./src/main.js')).getSnapshot());
 await page.locator('#start-button').tap();await page.locator('#lose-dialog[open]').waitFor({timeout:25000});await page.locator('#lose-review').tap();
 assert.equal((await snapshot()).phase,'review');assert.equal(await page.locator('#review-retry').isVisible(),true);assert.equal(await page.locator('#review-return').isVisible(),true);
 const stopped=(await snapshot()).time;await page.waitForTimeout(400);assert.equal((await snapshot()).time,stopped);assert.match(await page.locator('#phase-badge').textContent(),/复盘/);
 await page.locator('#review-retry').tap();assert.equal((await snapshot()).phase,'playing');assert.ok((await snapshot()).time<1);checks.push('natural failure -> explicit review -> retry starts real simulation');
 await page.locator('#lose-dialog[open]').waitFor({timeout:25000});await page.locator('#lose-review').tap();await page.locator('#review-return').tap();assert.equal((await snapshot()).phase,'ready');assert.equal(await page.locator('#game-setup').isVisible(),true);checks.push('review return restores role/mode preparation');
 await page.locator('#mode-select').selectOption('classic');await page.locator('#role-select').selectOption('robber');await page.locator('#initiative-select').selectOption('second');
 await page.locator('#start-button').tap();assert.equal((await snapshot()).firstRole,'cop');await page.waitForTimeout(2600);const before=await snapshot();
 await page.locator('.cop-card').first().tap();const target=before.nodes[before.nodes.length-2];const screen=await page.evaluate(async(point)=>(await import('./src/main.js')).worldToScreen(point),target);await page.touchscreen.tap(screen.x,screen.y);await page.waitForTimeout(400);
 const after=await snapshot();assert.ok(after.robbers[0].destination||Math.hypot(after.robbers[0].x-before.robbers[0].x,after.robbers[0].y-before.robbers[0].y)>0);assert.ok(after.cops.some((cop,i)=>Math.hypot(cop.x-before.cops[i].x,cop.y-before.cops[i].y)>0));checks.push('runner touch movement and real pursuing AI');
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal((await snapshot()).phase,'paused');const paused=(await snapshot()).time;await page.waitForTimeout(300);assert.equal((await snapshot()).time,paused);await page.locator('#resume-button').tap();await page.waitForTimeout(300);assert.ok((await snapshot()).time>paused);checks.push('background blur pauses, explicit resume restores timing');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
 await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/roles-review-mobile.png',fullPage:true});await writeFile('artifacts/roles-review-report.json',JSON.stringify({base,checks,errors,testedAt:new Date().toISOString()},null,2));console.log(checks);
} finally {await browser.close();}
