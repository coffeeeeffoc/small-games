import { chromium, expect } from '@playwright/test';
import { TEXT } from '../src/strings';

const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??'chrome',headless:true});
try {
  for(const mobile of [false,true]) {
    const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage();
    const click=async(selector:string)=>mobile?page.locator(selector).tap():page.locator(selector).click();
    await page.goto(process.env.GAME_URL??'http://localhost:4312/');
    await click('[data-action="levels"]');
    await expect(page.locator('[data-level]')).toHaveCount(100);
    await expect(page.locator('[data-level]:disabled')).toHaveCount(0);
    await click('[data-chapter="3"] summary');
    await click('[data-level="99"]');
    await expect(page.locator('#page')).toHaveText('100 / 100');
    await expect(page.locator('#overlay')).not.toHaveClass(/visible/);
    await click('#pause');
    await click('[data-action="levels"]');
    await expect(page.locator('[data-chapter="3"] summary')).toContainText('已完成 0/25');
    await click('[data-chapter="0"] summary');
    await click('[data-level="0"]');
    await expect(page.locator('#page')).toHaveText('01 / 100');
    await page.reload();
    await page.getByRole('button',{name:TEXT.start}).click();
    await expect(page.locator('#page')).toHaveText('01 / 100');
    await context.close();
    console.log(`PASS ${mobile?'touch':'mouse'}: free level selection preserves unearned progress`);
  }
} finally {await browser.close();}
