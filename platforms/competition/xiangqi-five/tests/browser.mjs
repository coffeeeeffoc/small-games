import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const output = fileURLToPath(new URL('../docs/design/', import.meta.url));
await mkdir(output, { recursive: true });
const html = `<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;overflow:hidden}canvas{width:100vw;height:100vh;touch-action:none}</style><canvas></canvas><script type="module">
import {startNativeXiangqiGame}from '/platforms/competition/xiangqi-five/native.js';
const canvas=document.querySelector('canvas'),events=new Map();
const sdk={createCanvas:()=>canvas,getSystemInfoSync:()=>({windowWidth:innerWidth,windowHeight:innerHeight,pixelRatio:devicePixelRatio,safeArea:{top:28,bottom:innerHeight-18}}),getMenuButtonBoundingClientRect:()=>({bottom:54}),getStorageSync:key=>localStorage.getItem(key),setStorageSync:(key,value)=>localStorage.setItem(key,value)};
for(const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize']){sdk['on'+name]=fn=>events.set(name,fn);sdk['off'+name]=()=>events.delete(name)}
for(const [name,event]of [['TouchStart','touchstart'],['TouchMove','touchmove'],['TouchEnd','touchend'],['TouchCancel','touchcancel']])canvas.addEventListener(event,e=>{e.preventDefault();events.get(name)?.({changedTouches:Array.from(e.changedTouches),touches:Array.from(e.touches)})},{passive:false});
addEventListener('resize',()=>events.get('WindowResize')?.());window.game=startNativeXiangqiGame(sdk,{});window.events=events;
</script>`;
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end(html);
    } else {
      const url = new URL(req.url, 'http://localhost');
      res.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : 'text/html');
      res.end(await readFile(root + url.pathname));
    }
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
try {
  const concept = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await concept.setContent(await readFile(output + 'concept.html', 'utf8'));
  await concept.screenshot({ path: output + 'concept-home.png' });
  await concept.evaluate(() => {
    document.querySelector('.home').style.display = 'none';
    document.querySelector('.game').style.display = 'block';
  });
  await concept.screenshot({ path: output + 'concept-play.png' });
  await concept.close();
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [430, 932],
    [844, 390],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => window.game);
    const screenshot = (name) => page.screenshot({ path: output + `actual-${name}-${width}.png` });
    const swipe = async (delta, startX = 20, startY = height / 2) => {
      const client = await page.context().newCDPSession(page);
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: startX, y: startY }],
      });
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: startX, y: Math.max(20, Math.min(height - 20, startY - delta)) }],
      });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await client.detach();
    };
    const tap = async (label) => {
      let hit;
      for (let attempt = 0; attempt < 8; attempt++) {
        hit = await page.evaluate(
          (label) => game.getLayout().hits.find((item) => item.label === label),
          label,
        );
        assert(hit, label);
        if (hit.y >= 62 && hit.y + hit.h <= height - 18) break;
        await swipe(
          hit.y < 62 ? -Math.min(200, 62 - hit.y) : Math.min(200, hit.y + hit.h - height + 18),
        );
      }
      assert(hit.y >= 62 && hit.y + hit.h <= height - 18, `${label} not fully visible`);
      await page.touchscreen.tap(hit.x + hit.w / 2, hit.y + hit.h / 2);
    };
    await screenshot('home');
    await tap('同屏双人');
    await screenshot('play');
    await tap('棋格0');
    assert.equal(await page.evaluate(() => game.state.game.ply), 1);
    await tap('暂停');
    await screenshot('pause');
    await tap('玩法与设置');
    await screenshot('help');
    await tap('返回');
    await tap('继续对局');
    await page.evaluate(() => events.get('Hide')());
    await page.evaluate(() => events.get('Show')());
    assert.equal(await page.evaluate(() => game.state.page), 'pause');
    await tap('返回首页');
    await tap('棋盘：象棋盘');
    await tap('同屏双人');
    const before = await page.evaluate(() => game.state.game.ply);
    await screenshot('gomoku');
    const area = await page.evaluate(() => game.getLayout().area);
    await swipe(100, area.x + area.w / 2, area.y + area.h / 2);
    assert.equal(await page.evaluate(() => game.state.game.ply), before);
    assert(await page.evaluate(() => game.getLayout().panY > 0));
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    'Actual native Canvas: 320/390/430/844 touch pages, rules, pause/help return, background and 15x15 board drag passed.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
