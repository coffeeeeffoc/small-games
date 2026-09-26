import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

// Run after `pnpm build` and `pnpm preview --port 4172 --strictPort`.
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
const challenges=['jump-key','saw-crossing','pulse-gate','charge-stop','soft-landing','double-jump','double-gate','key-parking','charge-gate','wind-key','final-exam'];
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:4172/');
  await page.locator('canvas').waitFor();
  assert.equal(await page.locator('[data-level]').count(),13,'12 关加自由实验');
  assert.equal(await page.evaluate(()=>typeof window.__course),'undefined','生产包不暴露测试控制器');
  assert.ok(await page.locator('script[type=module]').getAttribute('src').then(src=>src?.includes('/assets/')),'加载的是打包后的资源');
  const r=await page.locator('canvas').boundingBox(),x=v=>r.x+v*r.width/1100,y=r.y+410*r.height/560;
  await page.mouse.move(x(155),y);await page.mouse.down();await page.mouse.move(x(500),y,{steps:35});
  await page.locator('#redraw-inline:visible').waitFor();assert.deepEqual(await page.locator('canvas').boundingBox(),r,'重画提示不挤动画布');
  await page.mouse.up();await page.screenshot({path:'docs/redraw-hint.png'});await page.locator('#redraw-inline').click();
  await page.mouse.move(x(155),y);await page.mouse.down();await page.mouse.move(x(955),y,{steps:80});await page.mouse.up();
  await page.locator('#start:enabled').waitFor();await page.screenshot({path:'docs/desktop-course.png'});
  await page.locator('#start').click();await page.keyboard.down('ArrowRight');
  await page.waitForFunction(()=>document.querySelector('#result-title').textContent==='这条路，你跑通了！',{},{timeout:12000});
  await page.keyboard.up('ArrowRight');assert.equal(await page.locator('#result-score').textContent(),'100 分');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'next','成功聚焦下一关');
  await page.screenshot({path:'docs/production-result.png'});
  for(const id of challenges){
    await page.goto(`http://127.0.0.1:4172/?level=${id}`);
    await page.locator('#example').click();await page.locator('#start:enabled').waitFor();
    await page.screenshot({path:`docs/${id}.png`});
    // Timing/parking replay uses deterministic simulation steps in game.browser.ts.
    // Keep this real-time input smoke focused on the wider jump timing window.
    if(id!=='jump-key')continue;
    await page.locator('#start').click();await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1100);await page.keyboard.press('Space');
    await page.locator('#result-panel:not([hidden])').waitFor({timeout:10000}).catch(async error=>{await page.screenshot({path:`test-results/${id}-production.png`});throw error;});await page.keyboard.up('ArrowRight');
    assert.equal(await page.locator('#result-title').textContent(),'这条路，你跑通了！',`${id}: ${await page.locator('#result-advice').textContent()}`);
    console.log(`PASS: ${id} 生产包真实键盘通关，${await page.locator('#result-stats').textContent()}`);
  }
  const mobile=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  mobile.on('pageerror',e=>errors.push(e.message));mobile.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  for(const id of challenges){
    await mobile.goto(`http://127.0.0.1:4172/?level=${id}`);await mobile.locator('#example').click();
    await mobile.screenshot({path:`docs/${id}-mobile.png`});
    for(const selector of ['canvas','#start','#alternate']){
      if(selector==='#alternate'&&!await mobile.locator(selector).isVisible())continue;
      const bounds=await mobile.locator(selector).boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=845&&bounds.y+bounds.height<=391,`${id} ${selector} 在屏内`);
    }
    await mobile.locator('#start').click();
    for(const selector of ['[data-control=left]','[data-control=right]','[data-control=jump]','#pause-button']){
      const bounds=await mobile.locator(selector).boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=845&&bounds.y+bounds.height<=391,`${id} ${selector} 在屏内`);
    }
  }
  assert.deepEqual(errors,[]);console.log('PASS: 生产包实际输入通关、手机布局、控制台零错误、无开发控制器。');
} finally {await browser.close();}
