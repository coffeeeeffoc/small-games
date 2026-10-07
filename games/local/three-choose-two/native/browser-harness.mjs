import { STORAGE_KEY } from '../src/progress.mjs';

export function nativeHarnessHtml(config = {}) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="icon" href="data:,"><style>html,body{margin:0;background:#F7F2E8}canvas{display:block;width:100vw;height:100vh;touch-action:none}</style><canvas></canvas><script>
window.exports={};window.__COMPETITION_CONFIG__=${JSON.stringify(config)};
const canvas=document.querySelector('canvas'),context=canvas.getContext('2d');
const listeners=Object.fromEntries(['start','move','end','cancel','hide','show','resize'].map(name=>[name,new Set()]));
const labels=new Map(),storage=new Map(JSON.parse(localStorage.getItem('native-check-storage')||'[]')),sounds=[],timers=new Set(),requests=[],vibrations=[],shares=[];
let depth=0,loginCount=0,dropAction=false,failBeforeAction=false,lastServiceSession=null,lastBoard=null,holdAction=false,releaseAction,offline=false,conflictAction=false;
const nativeInterval=window.setInterval.bind(window),nativeClear=window.clearInterval.bind(window);
window.setInterval=(callback,delay)=>{const id=nativeInterval(callback,delay);timers.add(id);return id};
window.clearInterval=id=>{timers.delete(id);nativeClear(id)};
for(const method of ['save','restore','fillText','fillRect']){
 const original=context[method].bind(context);
 context[method]=(...args)=>{if(method==='save')depth++;if(method==='restore')depth--;if(method==='fillRect'&&args[0]===0&&args[1]===0&&depth===1)labels.clear();if(method==='fillText'){const t=context.getTransform();labels.set(String(args[0]),{x:args[1]*t.a+args[2]*t.c+t.e,y:args[1]*t.b+args[2]*t.d+t.f})}return original(...args)};
}
const dispatch=(phase,x,y,id=1)=>{for(const listener of [...listeners[phase]])listener({changedTouches:[{identifier:id,clientX:x,clientY:y}]})};
window.wx={createCanvas:()=>canvas,getSystemInfoSync:()=>({windowWidth:innerWidth,windowHeight:innerHeight}),
login(options){loginCount++;options.success({code:${JSON.stringify(config.loginCode || 'native-offline-unused')}})},
async request(options){
 const pathname=new URL(options.url).pathname;requests.push({pathname,method:options.method,body:options.data});
 if(conflictAction&&pathname.endsWith('/actions')){conflictAction=false;options.data={...options.data,seq:options.data.seq+10}}
 if(offline){options.fail({errMsg:'test network offline'});return}
 if(failBeforeAction&&pathname.endsWith('/actions')){failBeforeAction=false;options.fail({errMsg:'test connection lost before request'});return}
 try{const response=await fetch(options.url,{method:options.method,headers:options.header,...(options.data===undefined?{}:{body:JSON.stringify(options.data)})});const data=await response.json();
 if(data.state)lastServiceSession=data;if(pathname.endsWith('/board'))lastBoard=data;
 if(holdAction&&pathname.endsWith('/actions')){holdAction=false;await new Promise(resolve=>{releaseAction=resolve})}
 if(dropAction&&pathname.endsWith('/actions')){dropAction=false;options.fail({errMsg:'test response lost after server commit'});return}
 options.success({statusCode:response.status,data})}catch(error){options.fail(error)}},
onTouchStart:f=>listeners.start.add(f),offTouchStart:f=>listeners.start.delete(f),onTouchMove:f=>listeners.move.add(f),offTouchMove:f=>listeners.move.delete(f),onTouchEnd:f=>listeners.end.add(f),offTouchEnd:f=>listeners.end.delete(f),onTouchCancel:f=>listeners.cancel.add(f),offTouchCancel:f=>listeners.cancel.delete(f),onHide:f=>listeners.hide.add(f),offHide:f=>listeners.hide.delete(f),onShow:f=>listeners.show.add(f),offShow:f=>listeners.show.delete(f),onWindowResize:f=>listeners.resize.add(f),offWindowResize:f=>listeners.resize.delete(f),
getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>{storage.set(k,v);localStorage.setItem('native-check-storage',JSON.stringify([...storage]))},removeStorageSync:k=>storage.delete(k),getLogManager:()=>({info(){}}),exitMiniProgram:options=>options.success(),
launchSuccess(){},checkScene:options=>options.success({isExist:false}),navigateToScene:options=>options.fail(),addShortcut:options=>options.fail(),showToast(){},
vibrateShort(options){vibrations.push(options.type)},shareAppMessage(options){shares.push({title:options.title,query:options.query});options.success?.()},
createInnerAudioContext(){const sound={src:'',loop:false,volume:1,played:0,stopped:0,destroyed:false,play(){this.played++},stop(){this.stopped++},destroy(){this.destroyed=true},onError(){},offError(){}};sounds.push(sound);return sound}};
if(${JSON.stringify(config.platform)}==='bilibili')window.bl=window.wx;
for(const [event,phase]of [['pointerdown','start'],['pointermove','move'],['pointerup','end'],['pointercancel','cancel']])canvas.addEventListener(event,e=>{e.preventDefault();if(phase==='start')canvas.setPointerCapture(e.pointerId);dispatch(phase,e.clientX,e.clientY,e.pointerId)});
window.addEventListener('resize',()=>{for(const f of listeners.resize)f()});
window.nativeHarness={labels:()=>[...labels.keys()],position:label=>labels.get(label),
tap(label){const p=labels.get(label);if(!p)throw Error('Missing native action: '+label);dispatch('start',p.x,p.y);dispatch('end',p.x,p.y)},touch:dispatch,
saved(){const entry=[...storage].find(([key])=>key.endsWith(${JSON.stringify(STORAGE_KEY)}));return entry?JSON.parse(entry[1]).value:null},
online:()=>lastServiceSession,board:()=>lastBoard,requests:()=>requests,loginCount:()=>loginCount,
vibrations:()=>vibrations,shares:()=>shares,
dropNextActionResponse(){dropAction=true},failNextActionBeforeRequest(){failBeforeAction=true},
holdNextActionResponse(){holdAction=true},releaseHeldAction(){releaseAction?.();releaseAction=null},
conflictNextAction(){conflictAction=true},heldAction:()=>Boolean(releaseAction),
setOffline(value){offline=value},
hide(){for(const f of listeners.hide)f()},show(){for(const f of listeners.show)f()},timerCount:()=>timers.size,listenerCount:()=>Object.values(listeners).reduce((sum,list)=>sum+list.size,0),sounds:()=>sounds.map(s=>({src:s.src,played:s.played,stopped:s.stopped,destroyed:s.destroyed}))};
</script><script src="/game.js"></script></html>`;
}
