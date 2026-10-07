import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../../../', import.meta.url)), output = fileURLToPath(new URL('../docs/design/native-2026-10-06/', import.meta.url));
await mkdir(output, { recursive: true });
const html = `<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;overflow:hidden}canvas{width:100vw;height:100vh;touch-action:none}</style><canvas></canvas><script type="module">
import '/platforms/competition/native.js';import {startNativeStreetGame}from '/games/local/cops-robbers-realtime/src/native.js';
const canvas=document.querySelector('canvas'),events=new Map();
const sdk={createCanvas:()=>canvas,createImage:()=>new Image(),getSystemInfoSync:()=>({windowWidth:innerWidth,windowHeight:innerHeight,pixelRatio:devicePixelRatio,safeArea:{left:18,top:12,right:innerWidth-18,bottom:innerHeight-18}}),getMenuButtonBoundingClientRect:()=>({bottom:44}),getStorageSync:key=>localStorage.getItem(key),setStorageSync:(key,value)=>localStorage.setItem(key,value),getLaunchOptionsSync:()=>({query:{}}),request:options=>options.fail?.({errMsg:'Unconfigured fixture service'}),login:options=>options.fail?.({errMsg:'Unconfigured fixture login'})};
for(const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize']){sdk['on'+name]=fn=>events.set(name,fn);sdk['off'+name]=()=>events.delete(name)}
for(const [name,event]of [['TouchStart','touchstart'],['TouchMove','touchmove'],['TouchEnd','touchend'],['TouchCancel','touchcancel']])canvas.addEventListener(event,e=>{e.preventDefault();events.get(name)?.({changedTouches:Array.from(e.changedTouches),touches:Array.from(e.touches)})},{passive:false});
addEventListener('resize',()=>events.get('WindowResize')?.());window.game=startNativeStreetGame(sdk,{game:'cops-robbers-realtime',platform:'wechat',apiUrl:''});window.events=events;
</script>`;
const server = createServer(async (req, res) => { try { const pathname = new URL(req.url, 'http://localhost').pathname; res.setHeader('Content-Type', pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.png') ? 'image/png' : 'text/html'); res.end(pathname === '/' ? html : await readFile(pathname === '/home-city.png' ? root + 'games/local/cops-robbers-realtime/src/assets/home-city.png' : root + pathname)); } catch { res.statusCode = 404; res.end(); } });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  for (const [width, height] of [[667, 375], [844, 390], [932, 430]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true }); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port); await page.waitForFunction(() => window.game);
    const capture = name => page.screenshot({ path: output + `actual-${name}-${width}.png` });
    const tap = async label => { const { originX, originY, hits } = await page.evaluate(() => game.getLayout()); const hit = hits.find(item => label ? item.label.startsWith(label) : item.label === ''); assert(hit, label); await page.touchscreen.tap(originX + hit.x + hit.w / 2, originY + hit.y + hit.h / 2); };
    await capture('home'); await tap('玩法说明'); await capture('help'); await tap('首页'); await tap('开始游戏'); await capture('levels'); await tap('开始行动'); await capture('play');
    const before = await page.evaluate(() => game.getState().ticks); await page.waitForTimeout(150); assert(await page.evaluate(() => game.getState().ticks) > before);
    await tap(''); // The only empty label is the geometry pause icon.
    assert.equal(await page.evaluate(() => game.getState().page), 'pause'); await capture('pause'); await tap('继续行动');
    await page.evaluate(() => events.get('Hide')()); const tick = await page.evaluate(() => game.getState().ticks); await page.waitForTimeout(150); await page.evaluate(() => events.get('Show')()); assert.equal(await page.evaluate(() => game.getState().page), 'pause'); assert.equal(await page.evaluate(() => game.getState().ticks), tick);
    assert.deepEqual(errors, []); await page.evaluate(() => game.stop()); await page.close();
  }
  console.log('Actual native street Canvas 667/844/932: safe/capsule offset touch home/help/levels/live play/pause and background resume passed.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
