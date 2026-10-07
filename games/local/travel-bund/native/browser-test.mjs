import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const repo=fileURLToPath(new URL('../../../../',import.meta.url)),out=join(repo,'.scratch/travel-bund-native'),evidence=fileURLToPath(new URL('../docs/platforms/native-design-2026-10-06/validation/',import.meta.url));
const server=createServer(async(req,res)=>{const name=new URL(req.url,'http://localhost').pathname;try{if(name==='/'){res.setHeader('content-type','text/html');res.end('<link rel="icon" href="data:,"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}canvas.main{position:fixed;inset:0;width:100%;height:100%}</style>');return;}const p=name.startsWith('/remote/')?join(repo,'assets/bund/runtime',name.slice(8)):join(out,name);res.setHeader('content-type',name.endsWith('.mjs')?'text/javascript':name.endsWith('.wasm')?'application/wasm':name.endsWith('.json')?'application/json':'application/octet-stream');res.end(await readFile(p));}catch(e){res.writeHead(404).end(String(e));}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--enable-unsafe-swiftshader']});
const report={bundleSha256:createHash('sha256').update(await readFile(join(out,'native-entry.mjs'))).digest('hex'),environment:'Chromium genuine WebGL2+real Rapier WASM+original GLBs; SDK IO over real files, not official host/device validation',checks:[],errors:[],passed:false};
await mkdir(evidence,{recursive:true});
try{
 for(const viewport of [{width:844,height:390},{width:390,height:844}]){
  const page=await browser.newPage({viewport});page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async()=>{
   const {startNativeTravelBundGame}=await import('/native-entry.mjs');const handlers={},canvas=document.createElement('canvas');canvas.className='main';document.body.append(canvas);let storage={};let first=true;let requested=[];
   const sdk={createCanvas(){if(first){first=false;canvas.requestAnimationFrame=fn=>requestAnimationFrame(fn);canvas.cancelAnimationFrame=id=>cancelAnimationFrame(id);return canvas;}return document.createElement('canvas');},createImage:()=>new Image(),getSystemInfoSync:()=>({windowWidth:innerWidth,windowHeight:innerHeight,pixelRatio:1,safeArea:{left:0,top:12,right:innerWidth,bottom:innerHeight-12}}),getStorageSync:key=>storage[key]||'',setStorageSync:(key,value)=>storage[key]=value,
    readFile:async(path,type)=>{requested.push(path);const r=await fetch('/'+path);if(!r.ok)throw Error('File failed '+path);return type==='utf8'?r.text():r.arrayBuffer();},
    readRemoteAsset:async(url,type)=>{const relative=new URL(url).pathname.replace(/^.*\/games\/travel-bund\//,'');requested.push(relative);const r=await fetch('/remote/'+relative);if(!r.ok)throw Error('Remote failed '+url);return type==='utf8'?r.text():r.arrayBuffer();},
    instantiateWasm:async(path,imports)=>{const r=await fetch('/'+path);return WebAssembly.instantiate(await r.arrayBuffer(),imports);}};
   for(const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show']){sdk['on'+name]=fn=>handlers[name]=fn;sdk['off'+name]=()=>delete handlers[name];}
   window.game=await startNativeTravelBundGame(sdk,{platform:'native-contract',preview:true,assetBase:'https://coffeeeeffoc.github.io/small-games/games/travel-bund/'});window.handlers=handlers;window.requested=requested;
   window.touch=(name,id,x,y)=>{const d=game.snapshot().dimensions;handlers[name]({changedTouches:[{identifier:id,clientX:d.rotated?d.physicalWidth-y:x,clientY:d.rotated?x:y}]});};
   window.tap=id=>{const b=game.snapshot().buttons.find(x=>x.id===id&&!x.disabled);if(!b)throw Error('missing button '+id);touch('TouchStart',99,b.x+b.w/2,b.y+b.h/2);touch('TouchEnd',99,b.x+b.w/2,b.y+b.h/2);};
  });
  await page.waitForFunction(()=>game.ready(),null,{timeout:180000});await page.waitForTimeout(2000);await page.screenshot({path:join(evidence,`home-${viewport.width}.png`),timeout:120000});
  for(const target of ['routes','hunts','settings']){await page.evaluate(id=>tap(id),target);assert.equal(await page.evaluate(()=>game.snapshot().page),target);await page.evaluate(()=>tap('back'));assert.equal(await page.evaluate(()=>game.snapshot().page),'playing');await page.evaluate(()=>tap('home'));}
  await page.evaluate(()=>tap('back'));assert.equal(await page.evaluate(()=>game.snapshot().page),'help');await page.evaluate(()=>tap('back'));await page.evaluate(()=>tap('home'));
  await page.evaluate(()=>tap('hunts'));await page.evaluate(()=>{const b=game.snapshot().buttons.find(x=>x.id.startsWith('hunt-')&&!x.disabled);tap(b.id);});assert.equal(await page.evaluate(()=>game.snapshot().page),'hunt-preview');await page.evaluate(()=>tap('back'));await page.evaluate(()=>tap('home'));
  await page.evaluate(()=>tap('start'));await page.waitForTimeout(1000);await page.evaluate(()=>tap('map'));assert.equal(await page.evaluate(()=>game.snapshot().page),'map');await page.evaluate(()=>tap('back'));
  assert.equal(await page.evaluate(()=>game.snapshot().page),'playing');
  const before=await page.evaluate(()=>game.snapshot().stats.position);
  await page.evaluate(()=>{const b=game.snapshot().buttons.find(x=>x.id==='joystick');touch('TouchStart',1,b.x+b.w/2,b.y+b.h/2);touch('TouchMove',1,b.x+b.w/2+40,b.y+b.h/2);});await page.waitForFunction(p=>{const q=game.snapshot().stats.position;return Math.hypot(p[0]-q[0],p[2]-q[2])>1},before,{timeout:60000});
  const after=await page.evaluate(()=>game.snapshot().stats.position);assert.ok(Math.hypot(before[0]-after[0],before[2]-after[2])>1,'Real Rapier moves original walker');
  await page.evaluate(()=>{const b=game.snapshot().buttons.find(x=>x.id==='joystick');touch('TouchCancel',1,b.x+b.w/2,b.y+b.h/2);});assert.deepEqual(await page.evaluate(()=>game.snapshot().inputs.stick),[0,0]);
  await page.evaluate(()=>{touch('TouchStart',2,400,150);touch('TouchMove',2,445,170);touch('TouchCancel',2,445,170);});
  await page.evaluate(()=>tap('photo'));await page.waitForTimeout(500);await page.evaluate(()=>tap('journal'));assert.equal(await page.evaluate(()=>game.snapshot().page),'journal');assert.ok(await page.evaluate(()=>game.snapshot().buttons.some(b=>b.id==='export')),'Real capture exists');
  await page.screenshot({path:join(evidence,`journal-${viewport.width}.png`),timeout:120000});await page.evaluate(()=>tap('back'));await page.evaluate(()=>handlers.Hide());assert.equal(await page.evaluate(()=>game.snapshot().page),'pause');assert.equal(await page.evaluate(()=>game.snapshot().inputs.touches),0);await page.evaluate(()=>handlers.Show());assert.equal(await page.evaluate(()=>game.snapshot().page),'pause');await page.evaluate(()=>tap('resume'));
  await page.screenshot({path:join(evidence,`playing-${viewport.width}.png`),timeout:120000});
  const state=await page.evaluate(()=>game.snapshot()),assets=await page.evaluate(()=>requested);assert.ok(assets.some(x=>x.includes('city_')));assert.ok(state.stats.triangles>0,'original geometry rendered');report.checks.push({viewport,state,requested:assets,flows:'true scene/real WASM start; routes/hunts/preview/settings/help/map navigation, walker move, touch cancel/look, actual WebGL pixels photo/journal, hide/show/pause/resume',passed:true});
  await page.evaluate(()=>game.dispose());assert.deepEqual(await page.evaluate(()=>Object.keys(handlers)),[]);await page.close();
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await writeFile(join(evidence,'native-browser-report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
console.log(JSON.stringify(report));
