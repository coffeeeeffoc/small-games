import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const gameRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mime = { '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.webp': 'image/webp' };

// Test-only browser adapter: production renderer draws into the real Canvas2D context;
// pointer events become the same SDK TouchStart/Move/End/Cancel events as native tests.
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>词屿 · Native Canvas SDK preview</title>
<style>html,body{margin:0;overflow:hidden;background:#f6f0df;width:100%;height:100%;overscroll-behavior:none}canvas{display:block;width:100vw;height:100dvh;touch-action:none}#keyboard{position:fixed;left:12px;right:12px;bottom:16px;z-index:10;background:#fff8e8;padding:12px;border-radius:20px;box-shadow:0 8px 60px #223b3966}#keyboard[hidden]{display:none}textarea{box-sizing:border-box;width:100%;height:190px;font:18px sans-serif;padding:12px;border:1px solid #447675;border-radius:12px}button{height:48px;width:100%;margin-top:8px;background:#176c69;color:white;border:0;border-radius:12px;font:16px sans-serif}</style>
<canvas id="native-canvas"></canvas><div id="keyboard" hidden><textarea id="native-input" aria-label="SDK 输入"></textarea><button id="native-confirm">完成输入</button></div>
<script type="module">
import { startNativeLettersGame } from '/native.js';
import { startNativeCompetition } from '/platforms/competition/native.js';
import rule from '/services/runtime-api/rules/letters.mjs';
const canvas=document.querySelector('canvas'), context=canvas.getContext('2d'), listeners=new Map(), touches=new Map(), labels=[], requests=[], shares=[], storage=new Map(), query=Object.fromEntries(new URLSearchParams(location.search));
let hidden=false,room=null,duel=null,startedAt=0,clipboardValue=query.clipboard||'';
const nativeFillText=context.fillText.bind(context), nativeFillRect=context.fillRect.bind(context), nativeClearRect=context.clearRect.bind(context);
context.fillText=(text,x,y,...rest)=>{const m=context.getTransform(),r=canvas.width/innerWidth||1;labels.push({text:String(text),x:(m.a*x+m.c*y+m.e)/r,y:(m.b*x+m.d*y+m.f)/r,align:context.textAlign});nativeFillText(text,x,y,...rest)};
context.fillRect=(x,y,w,h)=>{if(x===0&&y===0&&w>=innerWidth&&h>=innerHeight)labels.length=0;nativeFillRect(x,y,w,h)};
context.clearRect=(x,y,w,h)=>{if(x===0&&y===0&&w>=innerWidth&&h>=innerHeight)labels.length=0;nativeClearRect(x,y,w,h)};
const emit=(name,event)=>{for(const fn of [...(listeners.get(name)||[])])fn(event)};
const readStore=key=>{try{return localStorage.getItem(key)}catch{return storage.get(key)}};
const writeStore=(key,value)=>{storage.set(key,value);try{localStorage.setItem(key,value)}catch{}};
const sdk={
 createCanvas:()=>canvas,
 getSystemInfoSync:()=>({windowWidth:innerWidth,windowHeight:innerHeight,pixelRatio:devicePixelRatio,safeArea:{top:Number(query.safeTop||24),bottom:innerHeight-Number(query.safeBottom||12),left:0,right:innerWidth}}),
 getMenuButtonBoundingClientRect:()=>({top:24,bottom:56,left:innerWidth-100,right:innerWidth-12,width:88,height:32}),
 getStorageSync:readStore,setStorageSync:writeStore,removeStorageSync:key=>{storage.delete(key);try{localStorage.removeItem(key)}catch{}},getLaunchOptionsSync:()=>({query}),
 createImage:()=>new Image(),
 createInnerAudioContext:()=>({src:'',play(){},stop(){},pause(){},destroy(){},onError(){},offError(){}}),
 getFileSystemManager:()=>({readFile({filePath,success,fail}){fetch('/'+filePath).then(response=>{if(!response.ok)throw new Error('asset unavailable');return response.text()}).then(data=>success({data}),fail)}}),
 showShareMenu(){},hideShareMenu(){},shareAppMessage(input){shares.push(input)},setClipboardData(input){clipboardValue=input.data;shares.push({clipboard:input.data});input.success?.()},getClipboardData(input){input.success?.({data:clipboardValue})},
 showKeyboard(input){const panel=document.querySelector('#keyboard'),textarea=document.querySelector('#native-input');textarea.maxLength=Number.isInteger(input.maxLength)&&input.maxLength>0?input.maxLength:524288;textarea.value=input.defaultValue||'';panel.hidden=false;textarea.focus()},hideKeyboard(){document.querySelector('#keyboard').hidden=true},vibrateShort(){},vibrateLong(){},showToast(){},
 request(input){requests.push(input);input.fail?.({errMsg:'Native preview uses local test competition rules'})}
};
for(const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize','KeyboardConfirm','KeyboardComplete','KeyboardInput','AudioInterruptionBegin','AudioInterruptionEnd','ShareAppMessage']){const set=new Set();listeners.set(name,set);sdk['on'+name]=fn=>set.add(fn);sdk['off'+name]=fn=>set.delete(fn)};
for(const [event,name] of [['pointerdown','TouchStart'],['pointermove','TouchMove'],['pointerup','TouchEnd'],['pointercancel','TouchCancel']])canvas.addEventListener(event,e=>{if(event==='pointermove'&&!touches.has(e.pointerId))return;e.preventDefault();const touch={identifier:e.pointerId,clientX:e.clientX,clientY:e.clientY,x:e.clientX,y:e.clientY};if(event==='pointerup'||event==='pointercancel')touches.delete(e.pointerId);else touches.set(e.pointerId,touch);if(event==='pointerdown')canvas.setPointerCapture(e.pointerId);emit(name,{changedTouches:[touch],touches:[...touches.values()]})});
document.querySelector('#native-input').addEventListener('input',e=>emit('KeyboardInput',{value:e.target.value}));
document.querySelector('#native-confirm').addEventListener('click',()=>{const value=document.querySelector('#native-input').value;document.querySelector('#keyboard').hidden=true;emit('KeyboardConfirm',{value});emit('KeyboardComplete',{value})});
addEventListener('resize',()=>emit('WindowResize',sdk.getSystemInfoSync()));
document.addEventListener('visibilitychange',()=>{hidden=document.hidden;touches.clear();emit(hidden?'Hide':'Show',{})});
globalThis.__competition={async request(url,init={}){requests.push({url,init});if(url==='/me')return{playerId:'preview',name:'预览玩家'};if(url.startsWith('/boards/'))return{version:rule.version,roles:rule.roles,modes:[],top:[],eligiblePlayers:0};if(url==='/rooms'||url==='/rooms/join'){duel=rule.initial('native-browser-preview');startedAt=Date.now();room={game:'letters-words2',version:rule.version,code:'ABCDEF123456',status:'waiting',you:0,seq:0,roles:rule.roles,players:[{id:'preview',name:'预览玩家',ready:false},{id:'friend',name:'好友',ready:true}],pollMs:1200,serverNow:Date.now(),deadline:Date.now()+rule.durationMs,state:null};return structuredClone(room)}if(url.startsWith('/rooms/')){if(!room)throw new Error('请先创建挑战');if(url.endsWith('/ready')){room.status='playing';room.players[0].ready=true}if(url.endsWith('/actions')){const data=JSON.parse(init.body);rule.action(duel,data.action,Math.max(0,Date.now()-startedAt),0);room.seq++;}if(url.endsWith('/leave'))room.status='abandoned';room.state=room.status==='waiting'?null:rule.view(duel,0);room.serverNow=Date.now();return structuredClone(room)}throw new Error('Native preview unsupported request '+url)}};
const instance=startNativeLettersGame(sdk,{game:'letters-words2',platform:'wechat',title:'词屿 · 字母叠叠乐',apiUrl:''},startNativeCompetition);
globalThis.__nativePreview={sdk,instance,labels,requests,shares,listeners,emit,readStore,get room(){return room},get duel(){return duel},tapLabel(text){const p=labels.find(p=>p.text===text)||labels.find(p=>p.text.includes(text));if(!p)throw new Error('missing '+text);const t={identifier:99,clientX:p.x+(p.align==='center'?0:3),clientY:p.y,x:p.x,y:p.y};emit('TouchStart',{changedTouches:[t],touches:[t]});emit('TouchEnd',{changedTouches:[t],touches:[]})}};
</script></html>`;

export async function startNativePreviewServer({ port = 4321 } = {}) {
  const server = createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname); } catch { response.writeHead(400); response.end(); return; }
    if (pathname === '/') { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(request.method === 'HEAD' ? undefined : html); return; }
    let file;
    if (/^\/[A-Za-z0-9._-]+\.(js|png|wav|webp|svg)$/.test(pathname) || /^\/assets\/[A-Za-z0-9_./-]+\.(json|png|svg|webp|wav)$/.test(pathname)) file = path.resolve(gameRoot, '.' + pathname);
    else if (/^\/platforms\/competition\/(native|client|format)\.js$/.test(pathname) || pathname === '/services/runtime-api/rules/letters.mjs' || pathname === '/games/local/letters-words2/engine.js') file = path.resolve(repositoryRoot, '.' + pathname);
    const inside = file && (file.startsWith(gameRoot + path.sep) || file.startsWith(path.join(repositoryRoot, 'platforms/competition') + path.sep) || file === path.join(repositoryRoot, 'services/runtime-api/rules/letters.mjs'));
    if (!inside || pathname.includes('..')) { response.writeHead(404); response.end(); return; }
    try { const content = await readFile(file); response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(request.method === 'HEAD' ? undefined : content); }
    catch { response.writeHead(404); response.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, url: 'http://127.0.0.1:' + server.address().port + '/', close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const preview = await startNativePreviewServer({ port: Number(process.env.NATIVE_PREVIEW_PORT || 4321) });
  console.log('Native Canvas SDK browser preview: ' + preview.url);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => preview.close().then(() => process.exit(0)));
}
