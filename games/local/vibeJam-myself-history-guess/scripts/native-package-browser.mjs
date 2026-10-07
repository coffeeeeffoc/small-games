import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const gameRoot = fileURLToPath(new URL('../', import.meta.url));
const artifact = path.resolve(process.env.NATIVE_ARTIFACT || path.join(gameRoot, '../../../apps/shell-minigame/dist/nine-games/wechat/vibeJam-myself-history-guess'));
const output = path.join(gameRoot, 'docs/design/native-package-2026-10-06');
const manifest = JSON.parse(await readFile(path.join(artifact, 'history-assets-manifest.json'), 'utf8'));
assert.equal(manifest.files.length, 33);
for (const file of manifest.files) {
  const original = await readFile(path.join(gameRoot, 'public', file.source));
  const packaged = await readFile(path.join(artifact, file.path));
  assert.deepEqual(packaged, original);
  assert.equal(createHash('sha256').update(packaged).digest('hex'), file.sha256);
}
const harness = `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>html,body{margin:0;background:#f4efe4;overflow:hidden}canvas{display:block;width:100vw;height:100vh;touch-action:none}</style><canvas></canvas><script>
window.exports={};
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),listeners={},storage=new Map(),loaded=new Set(),packageCalls=[],sources=[],decoded=[],images=[],executed=[];
let texts=[],photo=null,failNext=true;
const setTransform=ctx.setTransform.bind(ctx),fillText=ctx.fillText.bind(ctx),drawImage=ctx.drawImage.bind(ctx);
ctx.setTransform=(...args)=>{texts=[];photo=null;setTransform(...args)};
ctx.fillText=(text,x,y,...args)=>{const m=ctx.getTransform();texts.push({text:String(text),x:x*m.a+y*m.c+m.e,y:x*m.b+y*m.d+m.f});fillText(text,x,y,...args)};
ctx.drawImage=(image,...args)=>{if(!(image instanceof HTMLImageElement)||!image.complete||image.naturalWidth===0)throw Error('Expected actual decoded HTMLImageElement');const m=ctx.getTransform(),[x,y,w,h]=args.slice(-4);photo={src:new URL(image.src).pathname,rect:{x:x*m.a+y*m.c+m.e,y:x*m.b+y*m.d+m.f,w:w*m.a,h:h*m.d}};drawImage(image,...args)};
const imageSrc=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
window.wx={createCanvas:()=>canvas,createImage(){const image=new Image();images.push(image);image.addEventListener('load',()=>decoded.push(new URL(image.src).pathname));Object.defineProperty(image,'src',{get(){return imageSrc.get.call(image)},set(value){const name=value.split('/')[0];if(!loaded.has(name))throw Error('Image read before real package entry: '+value);sources.push(value);imageSrc.set.call(image,value)}});return image},
loadSubpackage(options){packageCalls.push(options.name);Promise.resolve().then(async()=>{if(failNext){failNext=false;throw Error('Injected one native package download failure')}const response=await fetch('/'+options.name+'/game.js');if(!response.ok)throw Error('Missing actual subpackage entry');const text=await response.text();const module={exports:{}};new Function('module','exports',text)(module,module.exports);executed.push(options.name);loaded.add(options.name);options.success({})}).catch(error=>options.fail({errMsg:error.message}))},
getSystemInfoSync:()=>({windowWidth:innerWidth,windowHeight:innerHeight,pixelRatio:1,safeArea:{top:24,bottom:innerHeight-20}}),getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),getLogManager:()=>({info:()=>{}})};
for(const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize']){const set=listeners[name]=new Set();wx['on'+name]=fn=>set.add(fn);wx['off'+name]=fn=>set.delete(fn)};
const points=new Map();for(const [dom,event]of [['pointerdown','TouchStart'],['pointermove','TouchMove'],['pointerup','TouchEnd'],['pointercancel','TouchCancel']])canvas.addEventListener(dom,e=>{const t={clientX:e.clientX,clientY:e.clientY,identifier:e.pointerId};if(dom==='pointerdown'||dom==='pointermove'&&points.has(e.pointerId))points.set(e.pointerId,t);if(dom==='pointerup'||dom==='pointercancel')points.delete(e.pointerId);for(const fn of [...listeners[event]])fn({touches:[...points.values()],changedTouches:[t]})});
window.harness={labels:()=>texts,photo:()=>photo,packageCalls,executed,sources,decoded,listenerCount:()=>Object.values(listeners).reduce((n,s)=>n+s.size,0),photoColors(){if(!photo)return 0;const r=photo.rect,pixels=ctx.getImageData(r.x+5,r.y+5,r.w-10,r.h-10).data,colors=new Set();for(let i=0;i<pixels.length;i+=28)colors.add(pixels[i]+','+pixels[i+1]+','+pixels[i+2]);return colors.size}};
</script><script src="/game.js"></script></html>`;
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://local').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(harness); return; }
    const filename = path.resolve(artifact, '.' + pathname);
    assert.ok(filename.startsWith(artifact + path.sep));
    res.setHeader('content-type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.webp') ? 'image/webp' : 'application/octet-stream');
    res.end(await readFile(filename));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const has = label => page.evaluate(label => harness.labels().some(t => t.text === label), label);
const tap = async label => { const hit = await page.evaluate(label => harness.labels().find(t => t.text === label), label); assert.ok(hit, label); await page.touchscreen.tap(hit.x, hit.y); };
const capture = name => page.screenshot({ path: path.join(output, name + '.png') });
const photo = async source => { const entry = manifest.files.find(file => file.source === source); assert.ok(entry); await page.waitForFunction(expected => harness.photo()?.src === '/' + expected, entry.path); const colors = await page.evaluate(() => harness.photoColors()); assert.ok(colors > 150, 'Actual photo must contain textured original pixels'); return colors; };
try {
  await page.goto('http://127.0.0.1:' + server.address().port); await page.evaluate(() => exports.ready);
  await tap('选择一幕练习'); await tap('莲花塔影落进护城河');
  await page.waitForFunction(() => harness.labels().some(t => t.text.includes('场景加载失败')));
  assert.equal(await page.evaluate(() => harness.sources.length), 0); await capture('package-failed');
  await page.touchscreen.tap(195, 260); const firstColors = await photo('assets/angkor.webp'); await capture('angkor-after-retry');
  await tap('暂停'); await tap('保存并返回主页'); await tap('选择一幕练习');
  const scenes = JSON.parse(await readFile(path.join(gameRoot, 'src/scenes/dunhuang.json'), 'utf8'));
  // The practice list uses titles, so choose the actual Dunhuang title, paging if needed.
  for (let count = 0; !await has(scenes.title) && count < 10; count++) await tap('上一页 / 下一页');
  await tap(scenes.title); const secondColors = await photo('assets/dunhuang.webp'); await capture('dunhuang-switched');
  await tap('暂停'); await tap('保存并返回主页'); await tap('选择一幕练习');
  for (let count = 0; !await has('莲花塔影落进护城河') && count < 10; count++) await tap('上一页 / 下一页');
  await tap('莲花塔影落进护城河'); await photo('assets/angkor.webp'); await capture('angkor-returned');
  const extraColors = [];
  for (const id of ['hangzhou-song','macau','quanzhou']) {
    await tap('暂停'); await tap('保存并返回主页'); await tap('选择一幕练习');
    const scene = JSON.parse(await readFile(path.join(gameRoot,'src/scenes/'+id+'.json'),'utf8'));
    for (let count=0; !await has(scene.title) && count<10; count++) await tap('上一页 / 下一页');
    await tap(scene.title); extraColors.push(await photo(scene.image)); await capture(id+'-package-photo');
  }
  const state = await page.evaluate(() => ({ packageCalls:harness.packageCalls,executed:harness.executed,sources:harness.sources,decoded:harness.decoded }));
  assert.equal(state.packageCalls.length, 6, 'One failed attempt plus five actual resource package entries');
  assert.equal(new Set(state.executed).size, 5); assert.equal(state.decoded.length, 6);
  await page.evaluate(async () => (await exports.ready).stop()); assert.equal(await page.evaluate(() => harness.listenerCount()), 0);
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'verification.json'), JSON.stringify({
    environment:'Chromium touch Canvas + wx callback SDK shim loading actual built CJS and resource-package entries; not official SDK/device',
    artifactSha256:createHash('sha256').update(await readFile(path.join(artifact,'game.js'))).digest('hex'),
    viewport:[390,844],unchangedOriginalImagesVerified:33,actualPhotosDrawn:['angkor','dunhuang','angkor','hangzhou-song','macau','quanzhou'],
    photoColors:[firstColors,secondColors,...extraColors],failureInjected:true,retrySucceeded:true,packageSuccessBeforeImageRead:true,
    actualNativeImageIdentity:true,listenersDisposed:true,pageErrors:errors,physicalDeviceVerified:false,...state,
  },null,2)+'\n');
  console.log('Built CJS native resource packages: original textured photos, scene switch, failed-package retry and cleanup passed.');
} finally { await browser.close(); server.close(); }
