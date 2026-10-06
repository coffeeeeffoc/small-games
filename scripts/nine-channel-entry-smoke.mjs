import assert from 'node:assert/strict';
import {
  createNativeSDKFixture,
  flushNative,
} from '../games/local/letters-words2/tests/native-sdk-fixture.mjs';
import { tapNativeTarget } from '../games/local/letters-words2/tests/native-test-actions.mjs';
import { attachBilibiliEntry } from '../platforms/bilibili/native-entry.mjs';
import '../platforms/competition/native.js';
import { startNativeCopsGame } from '../games/local/cops-robbers/src/native.js';
import { startNativeStreetGame } from '../games/local/cops-robbers-realtime/src/native.js';
import { startNativeLettersGame } from '../games/local/letters-words2/native.js';
import { startNativeHistoryGame } from '../games/local/vibeJam-myself-history-guess/native.js';
import { startNativeXiangqiGame } from '../platforms/competition/xiangqi-five/native.js';

for (const [id, start, entry] of [
  ['cops-robbers', startNativeCopsGame, '学习 / 帮助 / 设置'],
  ['cops-robbers-realtime', startNativeStreetGame, '玩法说明'],
  ['letters-words2', startNativeLettersGame, '设置'],
  ['vibeJam-myself-history-guess', startNativeHistoryGame, '设置'],
  ['xiangqi-five', startNativeXiangqiGame, '玩法与设置'],
]) {
  const fixture = createNativeSDKFixture({
    width: id === 'cops-robbers-realtime' ? 844 : 390,
    height: id === 'cops-robbers-realtime' ? 390 : 844,
  });
  let navigation = 0,
    desktop = 0;
  fixture.sdk.checkScene = (options) => {
    assert.equal(options.scene, 'sidebar');
    options.success({ isExist: true });
  };
  fixture.sdk.navigateToScene = (options) => {
    assert.equal(options.scene, 'sidebar');
    navigation++;
    options.success();
  };
  fixture.sdk.addShortcut = (options) => {
    desktop++;
    options.success();
  };
  const restore = fixture.installGlobals(),
    channel = attachBilibiliEntry(fixture.sdk, { gameId: id });
  fixture.sdk.channelEntry = channel;
  let game;
  try {
    game = start(fixture.sdk, { game: id, platform: 'bilibili' });
    await flushNative();
    const tap = async (label) => {
      await fixture.tick(140);
      if (id === 'letters-words2') await tapNativeTarget(fixture, game, label);
      else fixture.tapLabel(label);
      await flushNative();
    };
    await tap(entry);
    await tap('B站入口');
    assert(fixture.findLabel('收藏签 0 枚'));
    await tap('侧边栏每日收藏');
    assert.equal(navigation, 1);
    assert.equal(
      channel.getSnapshot().count,
      0,
      'navigation callback alone never grants a signature',
    );
    await tap('添加桌面 · 每日收藏');
    assert.equal(desktop, 1);
    assert.equal(channel.getSnapshot().count, 0, 'shortcut success alone never grants a signature');
    fixture.emit('Show', { scene: '021036' });
    await flushNative();
    assert.equal(channel.getSnapshot().count, 1);
    assert(fixture.findLabel('收藏签 1 枚'));
    fixture.emit('Show', { scene: '021036' });
    assert.equal(channel.getSnapshot().count, 1, 'same-day entry is idempotent');
    (game.stop || game.dispose).call(game);
    channel.dispose();
    assert.equal(
      [...fixture.listeners.values()].reduce((sum, set) => sum + set.size, 0),
      0,
    );
    console.log(
      `${id}: real channel-addon UI calls sidebar/desktop SDK ports, entry-only idempotent signature, view update and disposal passed.`,
    );
  } finally {
    (game?.stop || game?.dispose)?.call(game);
    channel.dispose();
    restore();
  }
}

if (process.env.BILIBILI_BROWSER === '1') {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
  const { createServer } = await import('node:http');
  const { readFile, mkdir } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const descriptors = [
    [
      'cops-robbers',
      'games/local/cops-robbers/src/native.js',
      'startNativeCopsGame',
      '学习 / 帮助 / 设置',
      'games/local/cops-robbers/docs/design/native-2026-10-06',
    ],
    [
      'cops-robbers-realtime',
      'games/local/cops-robbers-realtime/src/native.js',
      'startNativeStreetGame',
      '玩法说明',
      'games/local/cops-robbers-realtime/docs/design/native-2026-10-06',
    ],
    [
      'letters-words2',
      'games/local/letters-words2/native.js',
      'startNativeLettersGame',
      '设置',
      'games/local/letters-words2/docs/design/mobile-2026-10-06',
    ],
    [
      'vibeJam-myself-history-guess',
      'games/local/vibeJam-myself-history-guess/native.js',
      'startNativeHistoryGame',
      '设置',
      'games/local/vibeJam-myself-history-guess/docs/design/native-2026-10-06',
    ],
    [
      'xiangqi-five',
      'platforms/competition/xiangqi-five/native.js',
      'startNativeXiangqiGame',
      '玩法与设置',
      'platforms/competition/xiangqi-five/docs/design',
    ],
  ];
  const html = (
    item,
  ) => `<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;overflow:hidden}canvas{width:100vw;height:100vh;touch-action:none}</style><canvas></canvas><script type="module">
  import '/platforms/competition/native.js';import {attachBilibiliEntry}from '/platforms/bilibili/native-entry.mjs';import {${item[2]} as start}from '/${item[1]}';
  const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),events=new Map();window.labels=[];
  const fillText=ctx.fillText.bind(ctx),fillRect=ctx.fillRect.bind(ctx);ctx.fillText=(text,x,y,...rest)=>{const m=ctx.getTransform();labels.push({text:String(text),x:(m.a*x+m.c*y+m.e)/devicePixelRatio,y:(m.b*x+m.d*y+m.f)/devicePixelRatio,align:ctx.textAlign});fillText(text,x,y,...rest)};ctx.fillRect=(x,y,w,h)=>{if(x===0&&y===0&&w===innerWidth&&h===innerHeight)labels.length=0;fillRect(x,y,w,h)};
  window.calls={sidebar:0,desktop:0};const sdk={createCanvas:()=>canvas,createImage:()=>new Image(),getSystemInfoSync:()=>({windowWidth:innerWidth,windowHeight:innerHeight,pixelRatio:devicePixelRatio,safeArea:{top:28,bottom:innerHeight-18}}),getMenuButtonBoundingClientRect:()=>({bottom:54}),getLaunchOptionsSync:()=>({query:{}}),getStorageSync:key=>localStorage.getItem(key),setStorageSync:(key,value)=>localStorage.setItem(key,typeof value==='string'?value:JSON.stringify(value)),checkScene:o=>o.success({isExist:true}),navigateToScene:o=>{calls.sidebar++;o.success()},addShortcut:o=>{calls.desktop++;o.success()},request:o=>o.fail?.({errMsg:'fixture unconfigured'})};
  for(const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize']){const set=new Set();events.set(name,set);sdk['on'+name]=fn=>set.add(fn);sdk['off'+name]=fn=>set.delete(fn)}
  for(const [name,event]of [['TouchStart','touchstart'],['TouchMove','touchmove'],['TouchEnd','touchend'],['TouchCancel','touchcancel']])canvas.addEventListener(event,e=>{e.preventDefault();for(const fn of events.get(name))fn({changedTouches:Array.from(e.changedTouches),touches:Array.from(e.touches)})},{passive:false});
  sdk.channelEntry=attachBilibiliEntry(sdk,{gameId:${JSON.stringify(item[0])}});window.channel=sdk.channelEntry;window.game=start(sdk,{game:${JSON.stringify(item[0])},platform:'bilibili'});window.showScene=scene=>{for(const fn of events.get('Show'))fn({scene})};
  </script>`;
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname,
        item = descriptors.find((item) => pathname === '/' + item[0] + '/');
      if (item) {
        res.setHeader('Content-Type', 'text/html');
        res.end(html(item));
        return;
      }
      res.setHeader(
        'Content-Type',
        /\.(js|mjs)$/.test(pathname)
          ? 'text/javascript'
          : pathname.endsWith('.png')
            ? 'image/png'
            : 'application/json',
      );
      res.end(await readFile(root + pathname));
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
    for (const item of descriptors) {
      const width = item[0] === 'cops-robbers-realtime' ? 667 : 390,
        height = item[0] === 'cops-robbers-realtime' ? 375 : 844;
      const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('http://127.0.0.1:' + server.address().port + '/' + item[0] + '/');
      await page.waitForFunction(() => window.game);
      const tap = async (label) => {
        const p = await page.evaluate((label) => {
          const layout = game.getLayout?.(),
            state = game.getState?.(),
            hit = (layout?.targets || layout?.hits || state?.hits || []).find(
              (hit) => (hit.id || hit.label) === label,
            );
          if (hit)
            return {
              x: hit.x + hit.w / 2 + (layout?.originX && layout?.hits ? layout.originX : 0),
              y: hit.y + hit.h / 2 + (layout?.originY || 0),
            };
          const text =
            labels.find((item) => item.text === label) ||
            labels.find((item) => item.text.includes(label));
          if (!text) throw Error('missing ' + label);
          return { x: text.x + (text.align === 'center' ? 0 : 3), y: text.y };
        }, label);
        await page.touchscreen.tap(p.x, p.y);
        await page.waitForTimeout(150);
      };
      await tap(item[3]);
      await tap('B站入口');
      await tap('侧边栏每日收藏');
      await tap('添加桌面 · 每日收藏');
      assert.deepEqual(await page.evaluate(() => calls), { sidebar: 1, desktop: 1 });
      assert.equal(await page.evaluate(() => channel.getSnapshot().count), 0);
      await page.evaluate(() => showScene('021036'));
      assert.equal(await page.evaluate(() => channel.getSnapshot().count), 1);
      const screenshotDirectory = process.env.NATIVE_SCREENSHOT_ROOT
        ? process.env.NATIVE_SCREENSHOT_ROOT + '/' + item[0] + '/'
        : root + item[4] + '/';
      await mkdir(screenshotDirectory, { recursive: true });
      await page.screenshot({ path: screenshotDirectory + 'bilibili-entry-actual.png' });
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(
      'Five actual Chromium native Canvas Bilibili entry pages: touch sidebar/desktop, entry-only count and view update passed.',
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
