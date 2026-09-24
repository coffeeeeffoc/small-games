import{chromium}from'playwright';import assert from'node:assert/strict';import{mkdir,writeFile}from'node:fs/promises';
const base=process.env.GAME_URL||'http://127.0.0.1:43690',browser=await chromium.launch({channel:'chrome',headless:true}),checks=[];
try{
 const page=await browser.newPage({viewport:{width:320,height:740},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);const snapshot=()=>page.evaluate(async()=>(await import('./src/main.js')).getSnapshot());
 await page.locator('#levels-button').tap();await page.locator('#chapter-tabs button').last().tap();await page.getByRole('button',{name:/第 100 关/}).tap();
 await page.locator('#start-button').tap();
 await page.locator('.cop-card').first().tap();
 const road=await page.evaluate(async()=>{const app=await import('./src/main.js');const snap=app.getSnapshot();return app.worldToScreen(snap.nodes[5]);});
 await page.touchscreen.tap(road.x,road.y);let dispatched=await snapshot();assert.equal(dispatched.selected,0,'empty F1 must not select a nearby actor');assert.ok(dispatched.cops[0].destination,'empty F1 emits a movement order');checks.push('320px large-map empty road near another actor issues order without stealing selection');
 await page.locator('#restart-button').tap();await page.locator('#role-select').selectOption('robber');await page.locator('#start-button').tap();
 for(const [width,height]of [[320,740],[844,390]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(250);
  const boxes=await page.locator('.cop-card').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}));
  for(const r of boxes)assert.ok(r.w>=44&&r.h>=44&&r.x>=0&&r.y>=0&&r.x+r.w<=width+.1&&r.y+r.h<=height+.1,JSON.stringify({width,height,r}));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('.cop-card').last().tap();assert.equal((await snapshot()).selected,boxes.length-1);
  await mkdir('artifacts',{recursive:true});await page.screenshot({path:`artifacts/late-roster-${width}.png`,fullPage:true});checks.push(`${width}x${height}: ${boxes.length} role buttons fully visible, at least44px, final selection works`);
 }
 await page.locator('#restart-button').tap();await page.locator('#mode-select').selectOption('escape');await page.locator('#initiative-select').selectOption('second');await page.reload();assert.equal(await page.locator('#mode-select').inputValue(),'escape');assert.equal(await page.locator('#role-select').inputValue(),'robber');assert.equal(await page.locator('#initiative-select').inputValue(),'second');checks.push('mode role and initiative survive reload');
 assert.deepEqual(errors,[]);await writeFile('artifacts/mobile-roster-report.json',JSON.stringify({base,checks,errors,testedAt:new Date().toISOString()},null,2));console.log(checks);
}finally{await browser.close();}
