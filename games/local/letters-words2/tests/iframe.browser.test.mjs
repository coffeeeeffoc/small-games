import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, browserOptions, boardSnapshot } from './browser-helpers.mjs';
import { exerciseStandalone } from '../../../../apps/shell-web/scripts/standalone-game-checks.mjs';

const base = process.env.GAME_URL || 'http://127.0.0.1:4175/';
const origin = new URL(base).origin;
const entry = new URL(base);
entry.searchParams.set('dev', '0');
const output = process.env.QA_OUTPUT || 'outputs/letters-words2-mobile';
await mkdir(output, { recursive: true });
const styles = await readFile(new URL('../../../../apps/shell-web/src/styles.css', import.meta.url), 'utf8');
const browser = await chromium.launch(browserOptions);
const errors = [];

// Minimal fixture mirrors StandaloneGame's iframe permissions, immersive host
// and strict display message validation. It is not a full Shell build.
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/qa-embed.css"></head><body><main class="game-page standalone-page" data-game-display-host data-game-id="letters-words2" data-immersive="true" data-screen="home"><nav aria-label="游戏导航"><button aria-label="返回目录">返回目录</button></nav><iframe title="词屿 · 字母叠叠乐" src="${entry.href}" allow="autoplay; fullscreen" allowfullscreen></iframe></main><script>
const host=document.querySelector('main'), frame=document.querySelector('iframe'), nav=document.querySelector('nav');
window.addEventListener('message',event=>{
 if(event.source!==frame.contentWindow||event.origin!==${JSON.stringify(origin)})return;
 const data=event.data;
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length!==3||data.type!=='small-games:display-state'||data.gameId!=='letters-words2'||!['home','playing'].includes(data.screen))return;
 host.dataset.screen=data.screen;nav.hidden=data.screen==='playing';
});
frame.addEventListener('load',()=>{host.dataset.screen='home';nav.hidden=false;});
</script></body></html>`;

try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/qa-embed.html', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.route('**/qa-embed.css', route => route.fulfill({ contentType: 'text/css', body: styles }));
    await page.goto(new URL('/qa-embed.html', base).href);
    const frame = page.frames().find(item => item.parentFrame());
    await frame.locator('#focus-button').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('main').dataset.screen === 'home' && !document.querySelector('nav').hidden);
    assert.equal(await page.locator('nav[aria-label="游戏导航"]').isVisible(), true, 'home retains the catalog exit');
    await frame.locator('#home-help-button').tap();
    assert.equal(await frame.locator('#help-dialog').isVisible(), true, 'host catalog exit leaves the game help touch target accessible');
    await page.locator('nav[aria-label="游戏导航"]').waitFor({ state: 'hidden' });
    await frame.locator('#help-dialog [data-close]').first().tap();
    await exerciseStandalone(frame, 'letters-words2', true);
    await page.waitForFunction(() => document.querySelector('main').dataset.screen === 'playing');
    assert.equal(await page.locator('nav[aria-label="游戏导航"]').isVisible(), false, 'playing hides the outer Shell navigation');
    const layout = await frame.locator('.board-tools').evaluate(node => ({ bottom: node.getBoundingClientRect().bottom, height: innerHeight }));
    assert.ok(layout.bottom <= layout.height, 'iframe keeps core tools within its full phone viewport');
    await frame.locator('.tile[aria-disabled="false"]').first().tap();
    const partial = await boardSnapshot(frame);
    await frame.locator('#pause-button').tap();
    await frame.locator('#pause-settings').tap();
    await frame.locator('#settings-dialog [data-game-fullscreen]').tap();
    await page.waitForFunction(() => document.fullscreenElement === document.querySelector('[data-game-display-host]'));
    assert.deepEqual(await boardSnapshot(frame), partial, 'host fullscreen includes the entire game without clearing selection');
    await frame.locator('#settings-dialog [data-game-fullscreen]').tap();
    await page.waitForFunction(() => !document.fullscreenElement);
    await frame.locator('#settings-dialog [data-close]').last().tap();
    await frame.locator('#home-button').tap();
    await page.waitForFunction(() => document.querySelector('main').dataset.screen === 'home');
    assert.equal(await page.locator('nav[aria-label="游戏导航"]').isVisible(), true);
    await page.screenshot({ path: join(output, `iframe-home-${viewport.width}.png`) });
    await frame.locator('#focus-button').tap();
    await page.waitForFunction(() => document.querySelector('main').dataset.screen === 'playing');
    assert.deepEqual(await boardSnapshot(frame), partial);
    await page.screenshot({ path: join(output, `iframe-play-${viewport.width}.png`) });
    await context.close();
    console.log(`PASS minimal Shell iframe ${viewport.width}×${viewport.height}: actual entry adapter, touch navigation, fullscreen host and saved selection`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
