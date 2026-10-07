/* global process, URL, nativeHarness, exports, console */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');

const artifact = path.resolve(
  process.env.NATIVE_ARTIFACT ||
    fileURLToPath(
      new URL('../../apps/shell-minigame/dist/nine-games/wechat/wulong-city', import.meta.url),
    ),
);
const output = fileURLToPath(new URL('./docs/design/safe-viewport-actual/', import.meta.url));
const harness = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="icon" href="data:,"><style>html,body{margin:0;background:#153d47}canvas{display:block;width:100vw;height:100vh;touch-action:none}</style><canvas></canvas><script>
window.exports={};
const canvas=document.querySelector('canvas'),context=canvas.getContext('2d');
const listeners={start:new Set(),move:new Set(),end:new Set(),cancel:new Set(),hide:new Set(),show:new Set(),resize:new Set()};
const labels=new Map(),storage=new Map(),timers=new Map(),images=[];
let clock=Date.now(),timerId=0,depth=0,drawMatrix;const active=new Map();
const RealDate=Date;window.Date=class extends RealDate{static now(){return clock}};
window.setInterval=(callback,delay)=>{const id=++timerId;timers.set(id,{callback,delay,previous:clock});return id};
window.clearInterval=id=>timers.delete(id);
for(const method of ['save','restore','fillText','fillRect']){
 const original=context[method].bind(context);
 context[method]=(...args)=>{if(method==='save')depth++;if(method==='restore')depth--;if(method==='fillRect'&&args[1]===0&&depth===1)labels.clear();if(method==='fillText'){drawMatrix=context.getTransform();const p=new DOMPoint(args[1],args[2]).matrixTransform(drawMatrix);labels.set(args[0],{x:p.x,y:p.y})};return original(...args)};
}
const dispatch=(phase,x,y,id=1)=>{const p={identifier:id,clientX:x,clientY:y};if(phase==='start'||phase==='move')active.set(id,p);else active.delete(id);for(const listener of [...listeners[phase]])listener({changedTouches:[p],touches:[...active.values()]})};
window.wx={createCanvas:()=>canvas,createImage:()=>{const image=new Image();images.push(image);return image},getSystemInfoSync:()=>({windowWidth:innerWidth,windowHeight:innerHeight,safeArea:{left:12,top:30,right:innerWidth-16,bottom:innerHeight-24}}),getMenuButtonBoundingClientRect:()=>({bottom:72}),onWindowResize:f=>listeners.resize.add(f),offWindowResize:f=>listeners.resize.delete(f),
onTouchStart:f=>listeners.start.add(f),offTouchStart:f=>listeners.start.delete(f),onTouchMove:f=>listeners.move.add(f),offTouchMove:f=>listeners.move.delete(f),onTouchEnd:f=>listeners.end.add(f),offTouchEnd:f=>listeners.end.delete(f),onTouchCancel:f=>listeners.cancel.add(f),offTouchCancel:f=>listeners.cancel.delete(f),onHide:f=>listeners.hide.add(f),offHide:f=>listeners.hide.delete(f),onShow:f=>listeners.show.add(f),offShow:f=>listeners.show.delete(f),getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),getLogManager:()=>({info:console.info})};
for(const [event,phase]of [['pointerdown','start'],['pointermove','move'],['pointerup','end'],['pointercancel','cancel']])canvas.addEventListener(event,e=>{e.preventDefault();if(phase==='start')canvas.setPointerCapture(e.pointerId);dispatch(phase,e.clientX,e.clientY,e.pointerId)});
window.nativeHarness={
labels:()=>[...labels.keys()],
imagesReady:()=>images.length===7&&images.every(image=>image.complete&&image.naturalWidth>0),
sceneMetrics(){const pixels=context.getImageData(0,0,innerWidth,innerHeight).data,colors=new Set();let hash=0;for(let i=0;i<pixels.length;i+=52){colors.add([pixels[i],pixels[i+1],pixels[i+2]].join(','));hash=(hash*31+pixels[i]*65536+pixels[i+1]*256+pixels[i+2])%1000000007}return{colors:colors.size,hash}},
tap(label){const p=labels.get(label)||(label==='返回'?(labels.has('奇遇 01 / 100')?{x:37,y:46}:{x:43,y:74}):null);if(!p)throw Error('Missing native action: '+label);if(label==='返回'&&!labels.has(label)){const projected=new DOMPoint(p.x,p.y).matrixTransform(drawMatrix);p.x=projected.x;p.y=projected.y}dispatch('start',p.x,p.y);dispatch('end',p.x,p.y)},
touch:(phase,x,y,id)=>{const p=new DOMPoint(x,y).matrixTransform(drawMatrix);dispatch(phase,p.x,p.y,id)},physicalTouch:dispatch,resize(){for(const f of listeners.resize)f();nativeHarness.advance(40)},safePixels(){const points=[[3,3],[20,45],[innerWidth-4,120],[60,innerHeight-3]];return points.map(([x,y])=>Array.from(context.getImageData(x,y,1,1).data))},
advance(milliseconds){const end=clock+milliseconds;while(clock<end){clock=Math.min(end,clock+16);for(const timer of timers.values())if(clock-timer.previous>=timer.delay){timer.previous=clock;timer.callback()}}},
storage:()=>[...storage.entries()],
hide(){for(const f of listeners.hide)f()},show(){for(const f of listeners.show)f()},
timerCount:()=>timers.size,listenerCount:()=>Object.values(listeners).reduce((sum,list)=>sum+list.size,0)
};
</script><script src="/game.js"></script></html>`;
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/') {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(harness);
      return;
    }
    const filename = path.resolve(artifact, '.' + url.pathname);
    assert.ok(filename.startsWith(artifact + path.sep));
    response.setHeader(
      'content-type',
      filename.endsWith('.js')
        ? 'application/javascript'
        : filename.endsWith('.png')
          ? 'image/png'
          : 'image/webp',
    );
    response.end(await readFile(filename));
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
await mkdir(output, { recursive: true });
const executablePath =
  process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
const tap = (label) => page.evaluate((label) => nativeHarness.tap(label), label);
const screenshot = async (name) => {
  assert.ok(
    (await page.evaluate(() => nativeHarness.sceneMetrics())).colors > 150,
    'Rendered screen content must survive resize: ' + name,
  );
  await page.screenshot({ path: path.join(output, `${name}.png`) });
};
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(() => exports.ready);
  await page.waitForFunction(() => nativeHarness.labels().includes('开始奇遇'));
  await page.waitForFunction(() => nativeHarness.imagesReady());
  assert.deepEqual(
    await page.evaluate(() => nativeHarness.safePixels()),
    Array(4).fill([16, 34, 30, 255]),
    'Game must not paint outside safe clipped viewport',
  );
  await screenshot('home');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => nativeHarness.resize());
  await screenshot('landscape-home');
  assert.deepEqual(
    await page.evaluate(() => nativeHarness.safePixels()),
    Array(4).fill([16, 34, 30, 255]),
  );
  await tap('选择关卡');
  await screenshot('landscape-levels');
  await tap('返回');
  await page.setViewportSize({ width: 320, height: 740 });
  await page.evaluate(() => nativeHarness.resize());
  await screenshot('small-home');
  await tap('选择关卡');
  await screenshot('small-levels');
  await tap('返回');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => nativeHarness.resize());
  await tap('选择关卡');
  await screenshot('levels');
  await tap('返回');
  await tap('开始奇遇');
  await screenshot('play');
  const sceneMetrics = await page.evaluate(() => nativeHarness.sceneMetrics());
  assert.ok(
    sceneMetrics.colors > 150,
    'Native clip must preserve textured scene pixels, not an empty panel',
  );
  await page.evaluate(() => {
    nativeHarness.touch('start', 124, 770, 10);
    nativeHarness.advance(250);
    nativeHarness.touch('end', 124, 770, 10);
  });
  const beforeHome = await page.evaluate(() => nativeHarness.sceneMetrics().hash);
  await tap('返回');
  await tap('开始奇遇');
  assert.equal(
    await page.evaluate(() => nativeHarness.sceneMetrics().hash),
    beforeHome,
    'Returning home must preserve the active puzzle',
  );
  await page.evaluate(() => {
    nativeHarness.touch('start', 124, 770, 42);
    nativeHarness.physicalTouch('move', 20, 20, 42);
    nativeHarness.physicalTouch('end', 20, 20, 42);
  });
  await tap('提示');
  await screenshot('hint');
  await tap('回去试试');
  await page.evaluate(() => nativeHarness.hide());
  await screenshot('pause');
  await page.evaluate(() => {
    nativeHarness.advance(120000);
    nativeHarness.show();
  });
  await tap('继续探索');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => nativeHarness.resize());
  await screenshot('landscape-play');
  await page.evaluate(() => {
    nativeHarness.touch('start', 353, 46, 88);
    nativeHarness.touch('end', 353, 46, 88);
  });
  assert.ok(await page.evaluate(() => nativeHarness.labels().includes('继续探索')));
  await screenshot('landscape-pause');
  await tap('继续探索');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => nativeHarness.resize());
  await page.evaluate(() => {
    nativeHarness.touch('start', 44, 770, 11);
    nativeHarness.advance(180);
    nativeHarness.touch('end', 44, 770, 11);
    nativeHarness.advance(8000);
    nativeHarness.touch('start', 124, 770, 12);
    nativeHarness.advance(550);
    nativeHarness.touch('end', 124, 770, 12);
    nativeHarness.advance(2200);
  });
  assert.ok(await page.evaluate(() => nativeHarness.labels().includes('乌龙解决啦！')));
  await screenshot('result');
  await tap('返回主页');
  await tap('奇遇手记');
  await screenshot('records');
  assert.equal(errors.length, 0, errors.join('\n'));
  const storage = await page.evaluate(() => nativeHarness.storage());
  const saved = storage.find(([key]) => key.includes('wulong-city-v1'));
  assert.ok(JSON.parse(saved[1]).value.records['1']);
  await page.evaluate(async () => (await exports.ready).dispose());
  assert.equal(
    await page.evaluate(() => nativeHarness.timerCount() + nativeHarness.listenerCount()),
    0,
  );
  await writeFile(
    path.join(output, 'verification.json'),
    JSON.stringify(
      {
        artifactSha256: createHash('sha256')
          .update(await readFile(path.join(artifact, 'game.js')))
          .digest('hex'),
        environment:
          'Chromium touch browser with wx SDK adapter running the built native Canvas definition (not H5)',
        viewport: [390, 844],
        physicalLandscape: [844, 390],
        safeAreaAndCapsuleClipped: true,
        inputMappedAcrossResize: true,
        smallViewport: [320, 740],
        rotatedPlayPauseResumed: true,
        pages: ['home', 'levels', 'play', 'hint', 'pause', 'result', 'records'],
        firstLevelCompleted: true,
        storageSaved: true,
        listenersDisposed: true,
        pageErrors: errors,
        sceneColors: sceneMetrics.colors,
        activePuzzleRetained: true,
        physicalDeviceVerified: false,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'Native safe viewport Canvas pages, rotation, touch completion and listener cleanup passed.',
  );
} finally {
  await browser.close();
  server.close();
}
