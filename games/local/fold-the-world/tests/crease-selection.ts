import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { levels } from '../src/levels';
import { TEXT } from '../src/strings';

const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??'chrome',headless:true});
try {
  for(const mobile of [false,true]) {
    const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage();
    await page.addInitScript(key=>localStorage.setItem(key,JSON.stringify({unlocked:3,best:{},muted:true})),TEXT.storageKey);
    await page.goto(process.env.GAME_URL??'http://localhost:4312/');
    await page.getByRole('button',{name:TEXT.start}).click();
    const canvas=page.locator('canvas');
    const box=await canvas.boundingBox();assert.ok(box);
    for(const y of [202,350])for(const crease of [...levels[2].creases].reverse()) {
      const point={x:crease.x/1200*box.width,y:(y-180)/380*box.height};
      if(mobile)await canvas.tap({position:point});else await canvas.click({position:point});
      await page.waitForFunction(id=>document.querySelector(`[data-crease="${id}"]`)?.getAttribute('aria-pressed')==='true',crease.id);
      assert.equal(await page.locator('#status').textContent(),`${TEXT.flat} · ${TEXT.folds} 0 次`);
    }
    assert.ok(await page.locator('button,button *,canvas').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).userSelect==='none')));
    await page.locator('#fold').click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('已折叠')||document.querySelector('#fold-label')?.textContent==='展开');
    const selected=await page.locator('#creases [aria-pressed="true"]').getAttribute('data-crease');
    const other=levels[2].creases.find(c=>c.id!==selected)!;
    await canvas.click({position:{x:other.x/1200*box.width,y:22/380*box.height}});
    assert.equal(await page.locator('#creases [aria-pressed="true"]').getAttribute('data-crease'),selected);
    await context.close();
    console.log(`PASS ${mobile?'touch':'mouse'} crease labels / lines / folded guard / non-selectable controls`);
  }
} finally {await browser.close();}
