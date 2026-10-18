import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const output = process.env.NATIVE_SCREENSHOT_ROOT
  ? process.env.NATIVE_SCREENSHOT_ROOT + '/xiangqi-five/'
  : root + 'outputs/xiangqi-native/';
await mkdir(output, { recursive: true });
const html = `<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;overflow:hidden}canvas{width:100vw;height:100vh;touch-action:none}</style><canvas></canvas><script type="module">
import {startNativeXiangqiGame}from '/platforms/competition/xiangqi-five/native.js';
const canvas=document.querySelector('canvas'),events=new Map();window.visualImages=[];
const sdk={createCanvas:()=>canvas,createImage:()=>{const image=new Image();visualImages.push(image);return image},getSystemInfoSync:()=>({windowWidth:innerWidth,windowHeight:innerHeight,pixelRatio:devicePixelRatio,safeArea:{top:28,bottom:innerHeight-18}}),getMenuButtonBoundingClientRect:()=>({bottom:54}),getStorageSync:key=>localStorage.getItem(key),setStorageSync:(key,value)=>localStorage.setItem(key,value)};
for(const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize']){sdk['on'+name]=fn=>events.set(name,fn);sdk['off'+name]=()=>events.delete(name)}
for(const [name,event]of [['TouchStart','touchstart'],['TouchMove','touchmove'],['TouchEnd','touchend'],['TouchCancel','touchcancel']])canvas.addEventListener(event,e=>{e.preventDefault();events.get(name)?.({changedTouches:Array.from(e.changedTouches),touches:Array.from(e.touches)})},{passive:false});
const withAds=new URL(location.href).searchParams.has('ads');
if(withAds)sdk.createRewardedVideoAd=()=>({onClose:fn=>window.closeAd=fn,onError:fn=>window.failAd=fn,offClose(){},offError(){},destroy(){},show:async()=>{},load:async()=>{}});
addEventListener('resize',()=>events.get('WindowResize')?.());window.game=startNativeXiangqiGame(sdk,{...(withAds?{platform:'taptap',rewardedAdUnitId:'test-slot'}:{}),visualAssets:{pavilion:'/games/submodules/xiangqi-five/assets/pavilion-background.png',logo:'/games/submodules/xiangqi-five/assets/five-piece-logo.webp'}});window.events=events;
</script>`;
const server = createServer(async (req, res) => {
  try {
    if (new URL(req.url, 'http://localhost').pathname === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end(html);
    } else {
      const url = new URL(req.url, 'http://localhost');
      res.setHeader(
        'Content-Type',
        /\.m?js$/.test(url.pathname)
          ? 'text/javascript'
          : /\.png$/.test(url.pathname)
            ? 'image/png'
            : /\.webp$/.test(url.pathname)
              ? 'image/webp'
              : 'text/html',
      );
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
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox'],
});
try {
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
    await page.waitForFunction(
      () =>
        visualImages.length === 2 &&
        visualImages.every((image) => image.complete && image.naturalWidth > 0),
    );
    await screenshot('home');
    await tap('开始对弈');
    await tap('同屏双人');
    await screenshot('setup');
    await tap('开始对局');
    await tap('棋格0');
    assert.equal(await page.evaluate(() => game.state.game.ply), 1);
    for (const cell of [9, 1, 10]) await tap(`棋格${cell}`);
    await screenshot('play');
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
    const saved = await page.evaluate(() => JSON.stringify(game.state.game));
    await tap('开始对弈');
    await tap('同屏双人');
    await tap('五子棋盘 15×15');
    await tap('开始对局');
    await screenshot('restart');
    await tap('取消，保留棋局');
    assert.equal(await page.evaluate(() => JSON.stringify(game.state.game)), saved);
    await tap('开始对局');
    await tap('确认重开');
    const before = await page.evaluate(() => game.state.game.ply);
    await screenshot('gomoku');
    const area = await page.evaluate(() => game.getLayout().area);
    await swipe(100, area.x + area.w / 2, area.y + area.h / 2);
    assert.equal(await page.evaluate(() => game.state.game.ply), before);
    assert(await page.evaluate(() => game.getLayout().panY > 0));
    await page.goto('http://127.0.0.1:' + server.address().port + '/?ads=1');
    await page.waitForFunction(() => window.game);
    await tap('战术练习');
    await screenshot('training');
    await tap('01 一车架桥');
    await screenshot('rewarded-hint');
    await tap('获取提示');
    assert(await page.evaluate(() => game.getLayout().hits.some((hit) => hit.label === '观看中…')));
    await page.evaluate(() => {
      events.get('Hide')();
      closeAd({ isEnded: false });
    });
    await page.evaluate(() => events.get('Show')());
    await page.waitForFunction(() => game.getLayout().hits.some((hit) => hit.label === '获取提示'));
    assert.equal(await page.evaluate(() => game.state.page), 'play');
    await tap('获取提示');
    await page.evaluate(() => {
      events.get('Hide')();
      closeAd({ isEnded: true });
      events.get('Hide')();
    });
    await page.evaluate(() => events.get('Show')());
    await page.waitForFunction(() => game.state.page === 'help');
    await screenshot('earned-hint');
    await tap('返回');
    assert.equal(await page.evaluate(() => game.state.page), 'play');
    await tap('暂停');
    await tap('返回原棋局');
    await tap('暂停');
    await tap('返回首页');
    await tap('开始对弈');
    await tap('电脑对弈');
    await screenshot('setup-computer');
    await tap('开始对局');
    await page.evaluate(() => {
      for (let i = 0; i < 4; i++) game.state.game.board[i] = { side: 'red', type: 'pawn' };
      window.closeAd = null;
    });
    await screenshot('computer-hint-ready');
    await tap('获取提示');
    await page.waitForFunction(() => typeof closeAd === 'function');
    await page.evaluate(() => {
      events.get('Hide')();
      closeAd({ isEnded: true });
      events.get('Hide')();
    });
    await page.evaluate(() => events.get('Show')());
    await page.waitForFunction(() => game.getLayout().hits.some((hit) => hit.label === '重看提示'));
    await screenshot('computer-hint-earned');
    await tap('重看提示');
    assert.equal(await page.evaluate(() => game.state.game.ply), 0);
    await tap('暂停');
    await tap('继续对局');
    assert(
      await page.evaluate(() => game.getLayout().hits.some((hit) => hit.label === '重看提示')),
    );
    await page.evaluate(async () => {
      const { newGame, deployDirectly } = await import('/games/submodules/xiangqi-five/game.js');
      const state = newGame();
      for (const to of [0, 9, 1, 20]) deployDirectly(state, to, () => 0.99);
      Object.assign(game.state.game, state);
      events.get('WindowResize')();
    });
    await tap('悔棋·免费1次');
    assert.equal(await page.evaluate(() => game.state.game.ply), 2);
    await page.evaluate(async () => {
      const { deploy, deployDirectly } = await import('/games/submodules/xiangqi-five/game.js');
      deploy(game.state.game, 1);
      deployDirectly(game.state.game, 20, () => 0.99);
      events.get('WindowResize')();
    });
    await tap('悔棋');
    await page.evaluate(() => {
      events.get('Hide')();
      closeAd({ isEnded: false });
    });
    await page.evaluate(() => events.get('Show')());
    await page.waitForFunction(() => game.getLayout().hits.some((hit) => hit.label === '悔棋'));
    assert.equal(await page.evaluate(() => game.state.game.ply), 4);
    await screenshot('undo-dismissed');
    await tap('悔棋');
    await page.evaluate(() => {
      events.get('Hide')();
      closeAd({ isEnded: true });
      events.get('Hide')();
    });
    await page.evaluate(() => events.get('Show')());
    await page.waitForFunction(() => game.state.game.ply === 2);
    await screenshot('undo-earned');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    'Actual native Canvas: 320/390/430/844 touch pages, rules, pause/help return, background, 15x15 drag and simulated rewarded hints passed (browser Canvas; not Creator, real Tap playback or device validation).',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
