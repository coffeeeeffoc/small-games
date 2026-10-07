// Test-only genuine OffscreenCanvas/WebGL2/WASM environment, no window or document.
delete globalThis.TextDecoder;
let startNativeTravelBundGame;try{({startNativeTravelBundGame}=await import('/native-entry.mjs'));}catch(error){self.postMessage({kind:'error',message:'Native bundle import: '+(error.stack||error)});throw error;}
self.addEventListener('error',e=>self.postMessage({kind:'error',message:e.message}));self.addEventListener('unhandledrejection',e=>self.postMessage({kind:'error',message:e.reason?.stack||String(e.reason)}));
let game;const handlers={},storage={},frames=new Map();let serial=0,first=true;
self.onmessage=async({data})=>{try{
 if(data.kind==='init'){
  if(typeof document!=='undefined'||typeof window!=='undefined')throw Error('Worker unexpectedly has DOM globals');
  self.postMessage({kind:'boot',noDom:true,portableTextDecoder:true});const canvas=data.canvas;
  canvas.requestAnimationFrame=fn=>{frames.set(++serial,fn);return serial;};canvas.cancelAnimationFrame=id=>frames.delete(id);
  const sdk={loadImage:async path=>createImageBitmap(await(await fetch('/'+path)).blob()),createCanvas:()=>first?(first=false,canvas):new OffscreenCanvas(1,1),getSystemInfoSync:()=>({windowWidth:data.width,windowHeight:data.height,pixelRatio:1,safeArea:{left:0,top:12,right:data.width,bottom:data.height-12}}),getStorageSync:key=>storage[key]||'',setStorageSync:(key,value)=>storage[key]=value,
   readFile:async(path,type)=>{const r=await fetch('/'+path);if(!r.ok)throw Error('file '+path);return type==='utf8'?r.text():r.arrayBuffer();},readRemoteAsset:async(url,type)=>{const name=new URL(url).pathname.replace(/^.*\/games\/travel-bund\//,'');const r=await fetch('/remote/'+name);if(!r.ok)throw Error('remote '+name);return type==='utf8'?r.text():r.arrayBuffer();},instantiateWasm:async(path,imports)=>WebAssembly.instantiate(await(await fetch('/'+path)).arrayBuffer(),imports)};
  for(const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show']){sdk['on'+name]=fn=>handlers[name]=fn;sdk['off'+name]=()=>delete handlers[name];}
  game=await startNativeTravelBundGame(sdk,{platform:'worker-no-dom-contract',preview:true,assetBase:'https://coffeeeeffoc.github.io/small-games/games/travel-bund/'});self.postMessage({kind:'started',noDom:true});
 }else if(data.kind==='frame'){const pending=[...frames.entries()];frames.clear();for(const[,fn]of pending)fn(data.now);if(game)self.postMessage({kind:'snapshot',snapshot:game.snapshot()});}
 else if(data.kind==='tap'&&game){const b=game.snapshot().buttons.find(b=>b.id===data.id&&!b.disabled);if(!b)throw Error('button '+data.id);const d=game.snapshot().dimensions,p={identifier:99,clientX:d.rotated?d.physicalWidth-(b.y+b.h/2):b.x+b.w/2,clientY:d.rotated?b.x+b.w/2:b.y+b.h/2};handlers.TouchStart({changedTouches:[p]});handlers.TouchEnd({changedTouches:[p]});}
 else if(data.kind==='dispose'){game?.dispose();self.postMessage({kind:'disposed',listeners:Object.keys(handlers)});}
 }catch(error){self.postMessage({kind:'error',message:error.stack||String(error)});}};

self.postMessage({kind:'module-ready'});
