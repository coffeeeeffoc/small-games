const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const html=`<meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;overflow:hidden}canvas{width:100vw;height:100vh}</style><canvas></canvas><script type="module">
import {startNativeCopsGame} from '/src/native.js';
const listeners=new Map(), canvas=document.querySelector('canvas');
const sdk={createCanvas:()=>canvas,getSystemInfoSync:()=>({windowWidth:innerWidth,windowHeight:innerHeight,pixelRatio:devicePixelRatio,safeArea:{top:28,bottom:innerHeight-18}}),getStorageSync:key=>localStorage.getItem(key),setStorageSync:(key,raw)=>localStorage.setItem(key,raw)};
for(const type of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize']){sdk['on'+type]=fn=>listeners.set(type,fn);sdk['off'+type]=()=>listeners.delete(type)}
for(const [type,event] of [['TouchStart','touchstart'],['TouchMove','touchmove'],['TouchEnd','touchend'],['TouchCancel','touchcancel']])canvas.addEventListener(event,e=>{e.preventDefault();listeners.get(type)?.(e)},{passive:false});
window.addEventListener('resize',()=>listeners.get('WindowResize')?.());
window.game=startNativeCopsGame(sdk); window.events=listeners;
</script>`;
const server=createServer(async(req,res)=>{try{res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':'text/html'); res.end(req.url==='/'?html:await readFile(root+req.url));}catch{res.statusCode=404;res.end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}),args:['--no-sandbox']});
try{
 for(const width of [320,390,430]){
  const page=await browser.newPage({viewport:{width,height:width===320?568:844},hasTouch:true,deviceScaleFactor:1});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.game);
  const capture=async name=>page.screenshot({path:root+'docs/design/native-2026-10-06/'+name+'-'+width+'.png'});
  const tap=async id=>{const hit=await page.evaluate(id=>game.getState().hits.find(hit=>hit.id===id),id);assert.ok(hit,id);await page.touchscreen.tap(hit.x+hit.w/2,hit.y+hit.h/2);await page.waitForTimeout(140)};
  await capture('home-actual');await tap('选择关卡');await capture('levels-actual');await tap('返回主页');await tap('开始巡逻');await capture('play-actual');
  const cdp=await page.context().newCDPSession(page);
  const hit=await page.evaluate(()=>game.getState().hits.find(hit=>hit.id==='留守一步'));
  const before=await page.evaluate(()=>game.getState().board);
  const point={x:hit.x+20,y:hit.y+20,id:1};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point,{x:point.x+60,y:point.y,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.deepEqual(await page.evaluate(()=>game.getState().board),before);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:5,y:5,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.deepEqual(await page.evaluate(()=>game.getState().board),before);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  assert.deepEqual(await page.evaluate(()=>game.getState().board),before);
  await cdp.detach();
  await tap('暂停');await capture('pause-actual');await tap('学习 / 帮助');await capture('help-actual');await tap('返回');await tap('继续');
  await page.evaluate(()=>events.get('Hide')());assert.equal(await page.evaluate(()=>game.getState().page),'pause');await page.evaluate(()=>events.get('Show')());assert.equal(await page.evaluate(()=>game.getState().page),'pause');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('native Canvas browser: 320/390/430 touch home/levels/play/pause/help and background/resume passed');
}finally{await browser.close();server.close();}
