/* global window */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { siegeCamera, moduleAimPoint, toScreen } from '../src/scene-space.ts';
import { createBattle } from '../src/rules.ts';
import { LEVELS } from '../src/levels.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const artifact = path.resolve(root, '../../../apps/shell-minigame/dist/wechat/castle-cannon');
const fixture = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}#native-main{width:960px;height:540px}</style><body><script>
window.exports={};window.nativeEvidence={contexts:[],images:[],labels:[],canvases:[]};
const handlers=new Map(),records=new Map();
window.wx={
 createCanvas(){const c=document.createElement('canvas');nativeEvidence.canvases.push(c);if(nativeEvidence.canvases.length===1){c.id='native-main';document.body.append(c);const ctx=c.getContext('2d'),text=ctx.fillText.bind(ctx);ctx.fillText=(s,...args)=>{if(!nativeEvidence.labels.includes(s))nativeEvidence.labels.push(s);return text(s,...args);};for(const [dom,native] of [['touchstart','TouchStart'],['touchmove','TouchMove'],['touchend','TouchEnd'],['touchcancel','TouchCancel']])c.addEventListener(dom,e=>{e.preventDefault();for(const fn of handlers.get(native)??[])fn({changedTouches:Array.from(e.changedTouches,t=>({clientX:t.clientX,clientY:t.clientY,identifier:t.identifier}))});},{passive:false});}const get=c.getContext.bind(c);c.getContext=(kind,options)=>{nativeEvidence.contexts.push(kind);return get(kind,options);};return c;},
 createImage(){const image=new Image();image.addEventListener('load',()=>nativeEvidence.images.push(image.src));return image;},
 getSystemInfoSync(){return{windowWidth:960,windowHeight:540};},
 getStorageSync(k){return records.get(k);},setStorageSync(k,v){records.set(k,v);},removeStorageSync(k){records.delete(k);},
 getLogManager(){return{info(){}};},exitMiniProgram(o){o.success();}
};
for(const event of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show']){handlers.set(event,new Set());wx['on'+event]=fn=>handlers.get(event).add(fn);wx['off'+event]=fn=>handlers.get(event).delete(fn);}
</script><script src="/game.js"></script><script>exports.ready.then(instance=>{window.nativeInstance=instance;window.nativeReady=true;});</script>`;
const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://local').pathname;
    if (p === '/') {
      res.setHeader('Content-Type', 'text/html');
      return res.end(fixture);
    }
    const f = path.resolve(artifact, '.' + p);
    assert(f.startsWith(artifact + path.sep));
    res.setHeader(
      'Content-Type',
      p.endsWith('.js')
        ? 'text/javascript'
        : p.endsWith('.jpg')
          ? 'image/jpeg'
          : 'application/octet-stream',
    );
    res.end(await readFile(f));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? '/usr/bin/chromium',
});
const errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 960, height: 540 },
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => {
    errors.push(String(e));
    console.error('Page error:', String(e));
  });
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('Browser error:', m.text());
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await expect.poll(() => page.evaluate(() => window.nativeReady), { timeout: 30000 }).toBe(true);
  const cdp = await context.newCDPSession(page);
  const touch = (type, p) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ ...p, id: 1 }],
    });
  const tap = async (p) => {
    await Promise.all([touch('touchStart', p), touch('touchEnd', p)]);
  };
  const shoot = async (p) => {
    await Promise.all([
      touch('touchStart', { x: 270, y: 325 }),
      touch('touchMove', p),
      touch('touchEnd', p),
    ]);
  };
  const labels = () => page.evaluate(() => window.nativeEvidence.labels);
  await tap({ x: 480, y: 304 });
  const b = createBattle(LEVELS[0]),
    camera = siegeCamera();
  await shoot(toScreen(moduleAimPoint(b.modules[1], b), camera));
  await expect.poll(labels, { timeout: 15000 }).toContain('箭塔倒下！威胁减少');
  await page.waitForTimeout(2900);
  await shoot(toScreen(moduleAimPoint(b.modules[0], b), camera));
  await expect.poll(labels, { timeout: 15000 }).toContain('城门破了！小队突进');
  await page.screenshot({ path: path.join(root, 'docs/design/immersive/native-webgl-battle.png') });
  await expect.poll(labels, { timeout: 45000 }).toContain('城堡占领！');
  const evidence = await page.evaluate(() => ({
    contexts: window.nativeEvidence.contexts,
    images: window.nativeEvidence.images,
    canvasCount: window.nativeEvidence.canvases.length,
    gpuProgram: !!window.nativeEvidence.canvases[1]
      .getContext('webgl2')
      .getParameter(window.nativeEvidence.canvases[1].getContext('webgl2').CURRENT_PROGRAM),
  }));
  assert(evidence.contexts.includes('webgl2'));
  assert.equal(evidence.images.length, 2);
  assert(evidence.gpuProgram);
  assert.deepEqual(errors, []);
  await page.evaluate(() => window.nativeInstance.dispose());
  const record = {
    environment:
      'Compiled WeChat entry with DOM-backed SDK bridge and real Chromium WebGL2; NOT WeChat tools or device',
    ...evidence,
    nativeTouchDrag: true,
    firstCastleVictory: true,
    advertisingConfigured: false,
    errors,
  };
  await writeFile(
    path.join(root, 'docs/design/immersive/native-webgl-evidence.json'),
    JSON.stringify(record, null, 2) + '\n',
  );
  console.log(JSON.stringify(record, null, 2));
  await context.close();
} finally {
  await browser.close();
  server.close();
}
