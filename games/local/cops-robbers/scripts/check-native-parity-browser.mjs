import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Real Canvas/controller interaction; deliberately separate from Creator artifact acceptance.
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const output = path.resolve(process.env.OUTPUT_DIR || path.join(root, 'outputs/h5-parity/canvas'));
await mkdir(output, { recursive: true });
const atlas = (await readFile(path.join(root, 'games/local/cops-robbers/assets/patrol-characters.svg'), 'utf8')).match(/xlink:href="data:image\/webp;base64,([A-Za-z0-9+/=]+)"/)[1];
const assets = {
  'home-chase.webp': 'games/local/cops-robbers/assets/home-chase.webp',
  'patrol-garden.webp': 'games/local/cops-robbers/assets/patrol-garden.webp',
  'home-city.png': 'games/local/cops-robbers-realtime/src/assets/home-city.png',
  'street-characters.webp': 'games/local/cops-robbers-realtime/src/assets/characters-native.webp',
};
const html = `<meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;overflow:hidden}canvas{width:100vw;height:100vh;touch-action:none}</style><canvas></canvas><script type="module">
import {startCocosCopsGame} from '/games/minigames/cops-robbers/controller.mjs';
import {startNativeStreetGame} from '/games/local/cops-robbers-realtime/src/native.js';
const canvas=document.querySelector('canvas'), events=new Map();
const sdk={createCanvas:()=>canvas,createImage:()=>new Image(),getSystemInfoSync:()=>({windowWidth:innerWidth,windowHeight:innerHeight,pixelRatio:1,safeArea:{top:16,bottom:innerHeight-12}}),getStorageSync:key=>localStorage.getItem(key),setStorageSync:(key,value)=>localStorage.setItem(key,value)};
for(const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize']){sdk['on'+name]=fn=>events.set(name,fn);sdk['off'+name]=()=>events.delete(name)}
for(const [name,type] of [['TouchStart','touchstart'],['TouchMove','touchmove'],['TouchEnd','touchend'],['TouchCancel','touchcancel']])canvas.addEventListener(type,event=>{event.preventDefault();events.get(name)?.({touches:Array.from(event.touches),changedTouches:Array.from(event.changedTouches)})},{passive:false});
window.events=events;
window.game=new URLSearchParams(location.search).get('kind')==='street'?startNativeStreetGame(sdk,{adMode:'off',visualAssets:{portraits:'street-characters.webp'}}):startCocosCopsGame(sdk,{adMode:'off'});
</script>`;
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const name = pathname.slice(1);
    response.setHeader('content-type', /\.(m?js)$/.test(name) ? 'text/javascript' : name.endsWith('.webp') ? 'image/webp' : name.endsWith('.png') ? 'image/png' : 'text/html');
    if (pathname === '/') response.end(html);
    else if (name === 'patrol-characters.webp') response.end(Buffer.from(atlas, 'base64'));
    else { const file = path.resolve(root, assets[name] || name); assert(file.startsWith(root)); response.end(await readFile(file)); }
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox'] });
const checks = [], errors = [];
try {
  for (const [kind, width, height] of [['cops',320,568],['cops',390,844],['street',844,390],['street',568,320]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?kind=${kind}`);
    await page.waitForFunction(() => window.game && (game.getState().art?.loaded.length === 3 || game.getState().portraitReady));
    const state = () => page.evaluate(() => game.getState());
    const hit = key => page.evaluate(key => { const data=game.getLayout?.()||game.getState(); const item=data.hits.find(hit=>hit.id===key||hit.label===key); if(!item)throw Error('Missing '+key); return {x:item.x+item.w/2+(data.originX||0),y:item.y+item.h/2+(data.originY||0)}; }, key);
    const tap = async key => { const point=await hit(key); assert(point.x<width&&point.y<height,key); await page.touchscreen.tap(point.x,point.y); await page.waitForTimeout(150); };
    const capture = name => page.screenshot({ path: path.join(output, `${kind}-${width}-${name}.png`) });
    const drag = async (from, to, cancel=false, back=false) => { const cdp=await context.newCDPSession(page); await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]}); await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...to,id:1}]}); if(back)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...from,id:1}]}); await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]}); await cdp.detach(); await page.waitForTimeout(150); };
    await capture('home');
    if (kind === 'cops') {
      await tap('start'); await capture('play');
      await tap('hint'); assert((await state()).hintNode>=0);
      const before=(await state()).board;
      const from=await hit(`cop${(await state()).selected}`), to=await hit(`node${(await state()).hintNode}`);
      await drag(from,to,true); assert.deepEqual((await state()).board,before);
      await drag(from,to,false,true); assert.deepEqual((await state()).board,before);
      await drag(from,to); assert.equal((await state()).board.turn,before.turn+1);
      const moved=(await state()).board;
      await tap('pause'); await capture('pause'); await tap('home'); await tap('levels'); await tap('level:1');
      assert.deepEqual((await state()).board,moved);
      await page.evaluate(()=>events.get('Hide')()); await page.evaluate(()=>events.get('Show')()); assert.equal((await state()).page,'pause');
    } else {
      await tap('角色头像'); await tap('机灵保安'); assert.equal((await state()).avatars.cop,1); await capture('avatars');
      await tap('首页'); await tap('开始游戏 →'); await capture('levels'); await tap('开始行动 →');
      const points=await page.evaluate(()=>{const layout=game.getLayout(), actor=layout.field.hits.find(item=>item.action.local===1), road=layout.field.hits.find(item=>item.action.type==='move'&&Math.hypot(item.x-actor.x,item.y-actor.y)>40);const point=item=>({x:item.x+item.w/2+layout.originX,y:item.y+item.h/2+layout.originY});return{from:point(actor),to:point(road)};});
      await drag(points.from,points.to,true); assert.equal((await state()).orders.length,0);
      await drag(points.from,points.to,false,true); assert.equal((await state()).orders.length,0);
      await drag(points.from,points.to); assert.equal((await state()).orders.length,1);
      await capture('play'); await tap(''); const paused=(await state()).time; await page.waitForTimeout(150); assert.equal((await state()).time,paused); await capture('pause'); await tap('继续行动');
      await page.evaluate(()=>events.get('Hide')()); await page.evaluate(()=>events.get('Show')()); assert.equal((await state()).page,'pause');
    }
    checks.push(`${kind} ${width}×${height}: real touch, artwork, drag/cancel/return, pause, navigation`);
    await page.evaluate(()=>{game.stop?.();game.dispose?.();}); await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output,'canvas-report.json'),JSON.stringify({passed:true,environment:'Chromium real Canvas controllers with touch emulation; not Creator or physical devices',checks,errors},null,2)+'\n');
  console.log(checks.join('\n'));
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
