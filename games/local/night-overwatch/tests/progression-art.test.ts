import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

const requests=new Map<string,Array<(error:Error|null,asset?:object)=>void>>();
const calls:string[]=[];
const cc={
  Texture2D:class {},TTFFont:class {},Rect:class {constructor(..._args:number[]){}},
  SpriteFrame:class {texture?:object;rect?:object;destroyed=false;destroy(){this.destroyed=true;}},
  isValid:(node:{alive:boolean})=>node.alive,
  resources:{load(path:string,_type:unknown,callback:(error:Error|null,asset?:object)=>void){
    const name=path.replace('ui/progression/','').replace('/texture','');
    calls.push(name);requests.set(name,[...(requests.get(name)||[]),callback]);
  }},
};
(globalThis as any).__nightArtCC=cc;
const folder=new URL('../assets/scripts/',import.meta.url);
const hooks=registerHooks({
  resolve(id,context,next){if(id==='cc'&&context.parentURL?.startsWith(folder.href))return {url:'night-art:cc',shortCircuit:true};return next(id,context);},
  load(url,context,next){if(url==='night-art:cc')return {format:'module',shortCircuit:true,source:`export const {${Object.keys(cc).join(',')}}=globalThis.__nightArtCC;`};return next(url,context);},
});
let ProgressionArt:any;
try{({ProgressionArt}=await import('../assets/scripts/ProgressionArt.ts'));}
finally{hooks.deregister();delete (globalThis as any).__nightArtCC;}
const home=['home','title','skins','01-home','night-ui-serif'];
function harness(){requests.clear();calls.length=0;const hud={root:{alive:true},modalKey:'home',editing:false};return {hud,art:new ProgressionArt(hud)};}
function finish(name:string,error:Error|null=null){const callback=requests.get(name)?.shift();assert(callback,`${name} was requested`);if(!requests.get(name)?.length)requests.delete(name);callback(error,error?undefined:{});}
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};

test('home waits for every picture and font; background warming starts afterwards with two requests',async()=>{
  const {art}=harness();assert.deepEqual(calls,home);
  for(const name of home.slice(0,-1))finish(name);
  art.warm();assert.equal(art.homeReady,false);assert.equal(calls.length,5);
  finish('night-ui-serif');assert.equal(art.homeReady,true);art.warm();art.warm();
  assert.deepEqual([...requests.keys()],['base','hangar']);
  while(requests.size){assert(requests.size<=2);finish(requests.keys().next().value!);await flush();}
  assert(art.frames.has('resultBadge'));assert(art.frames.has('duel'));
  assert(!calls.includes('02-loadout')&&!calls.includes('09-settlement'));
  assert.equal(calls.length,new Set(calls).size,'Background fetches are deduplicated');
  art.destroy();
});

test('page requests reuse preloads, hold incomplete artwork and retry failed requests explicitly',async()=>{
  const {art}=harness();home.forEach(name=>finish(name));art.warm();
  const required=art.required('modes');assert.equal(art.ensure(required),false);
  const request=art.load('03-mode-selection');assert.equal(art.load('03-mode-selection'),request);
  finish('base');finish('03-mode-selection',new Error('offline'));await flush();
  assert(art.failed.has('03-mode-selection'));assert.equal(art.ensure(required),false);
  assert.equal(calls.filter(name=>name==='03-mode-selection').length,1,'Rendering does not retry on every frame');
  art.retry();assert.equal(calls.filter(name=>name==='03-mode-selection').length,2);
  finish('03-mode-selection');assert.equal(art.ensure(required),true);assert(art.frames.has('duel'));
  assert(art.required('warehouse',false,true).includes('base'),'Gift background must be ready too');
  art.destroy();for(const name of [...requests.keys()])finish(name);await flush();
});

test('home failure is observable, and late completion after destruction cannot recreate resources',async()=>{
  const {hud,art}=harness();finish('home',new Error('offline'));assert(art.homeFailed);assert(!art.homeReady);
  art.retry();finish('home');assert(!art.homeFailed);
  const frame=art.frames.get('home');hud.modalKey='unchanged';art.destroy();
  for(const name of [...requests.keys()])finish(name);await flush();
  assert(frame.destroyed);assert.equal(art.frames.size,0);assert.equal(art.font,undefined);
  assert.equal(hud.modalKey,'unchanged');art.warm();assert.equal(requests.size,0);
});

test('background artwork completion does not rebuild a focused text field',async()=>{
  const {hud,art}=harness();home.forEach(name=>finish(name));await flush();
  hud.editing=true;hud.modalKey='online:profile';art.load('base');finish('base');
  assert.equal(hud.modalKey,'online:profile');art.destroy();
});
