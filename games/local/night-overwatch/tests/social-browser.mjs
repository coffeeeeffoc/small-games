import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createOwnedRuntime, ownedChild } from '../../../../scripts/h5-taptap-runtime.mjs';
import { acceptanceBuild, snapshot, press, settleVisuals, assertLayout } from './flight-browser.mjs';
import { scrollToButton } from './scroll-helpers.mjs';

const workspace=fileURLToPath(new URL('../../../../',import.meta.url)),out=new URL('../reports/2026-11-12-social-refinement/',import.meta.url);
await mkdir(out,{recursive:true});
const evidence={fixture:'isolated-real-postgresql-http',checks:[],errors:[]};
let fixture,server,browser;const pages=[];
try {
  fixture=await createOwnedRuntime({workspace});
  const {api,origin}=fixture.descriptor;
  server=ownedChild(process.execPath,['games/local/night-overwatch/scripts/serve.mjs'],{cwd:workspace,env:{...process.env,PORT:'43810'}});
  for(let i=0;i<50;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  process.env.NIGHT_URL=origin;evidence.build=await acceptanceBuild(origin);
  browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
  for(let i=0;i<3;i++) {
    const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true});
    await context.route('**/game-service-config.js',async r=>r.fulfill({contentType:'text/javascript',body:(await (await r.fetch()).text())+';globalThis.__COMPETITION_CONFIG__=Object.freeze({...globalThis.__COMPETITION_CONFIG__,...'+JSON.stringify({game:'night-overwatch',platform:'h5',competitionEnabled:true,apiUrl:api})+'});'}));
    if(i===2)await context.addInitScript(()=>{globalThis.tap={getWindowInfo:()=>({windowWidth:innerWidth,windowHeight:innerHeight,statusBarHeight:58}),getMenuButtonBoundingClientRect:()=>({left:innerWidth-124,right:innerWidth-12,top:80,bottom:120})};});
    const page=await context.newPage();pages.push(page);page.setDefaultTimeout(45000);page.on('pageerror',e=>evidence.errors.push(e.message));
    await page.goto(origin+'/?dev=0');await page.waitForFunction(()=>globalThis.__night?.snapshot().online.socialAvailable&&!document.getElementById('night-startup'));
  }
  const [a,b,c]=pages,aid=(await snapshot(a)).online.identity.playerId,bid=(await snapshot(b)).online.identity.playerId,cid=(await snapshot(c)).online.identity.playerId;
  const click=(p,id)=>press(p,id,true,false);
  const choose=async(p,id,key='players')=>{await settleVisuals(p);await scrollToButton(p,id,key);await click(p,id);};
  const type=async(p,text)=>{const send=(await snapshot(p)).buttons.find(b=>b.id==='online:chatSend');await p.touchscreen.tap(send.x-130,send.y+22);await p.locator('input:visible').fill(text);};
  const shot=async(p,name)=>{await settleVisuals(p);await p.screenshot({path:fileURLToPath(new URL(name+'.png',out))});};
  for(const p of pages)await p.waitForFunction(()=>__night.snapshot().online.onlineCount===3);
  await click(a,'social:updates');await a.waitForFunction(()=>__night.snapshot().updatesOpen);await shot(a,'updates-844');await click(a,'updates:close');
  for(const p of [b,c]){const s=await snapshot(p);if(s.buttons.some(b=>b.id==='social:dismiss'))await click(p,'social:dismiss');}
  await click(c,'qm:modes');await settleVisuals(c);const header=(await snapshot(c)).buttons.find(b=>b.id==='qm:back');assert(header.y<12&&header.h===44);await shot(c,'k90-mode-header');await click(c,'qm:back');
  await click(a,'online:players');await a.waitForFunction(()=>__night.snapshot().online.onlinePlayers.length===3);
  for(const [width,height] of [[568,320],[844,390],[1280,720]]){
    await a.setViewportSize({width,height});await settleVisuals(a);assertLayout(await snapshot(a),width,height);await shot(a,'players-'+width);
    await choose(a,'online:whisper:'+bid);await a.waitForFunction(()=>__night.snapshot().online.socialOpen);await shot(a,'conversation-'+width);const controls=(await snapshot(a)).buttons.filter(b=>b.id.startsWith('social:')||b.id.startsWith('online:'));assert(!controls.some(b=>/chatBlock|chatReport/.test(b.id)));assert(controls.every(b=>b.x>=Math.max(32,Math.min(60,width*.05))-.1));await click(a,'social:close');assert.equal((await snapshot(a)).online.chatPeer,undefined);
  }
  await choose(a,'online:whisper:'+bid);await click(a,'online:friendAction:request:'+bid);
  await b.waitForFunction(()=>__night.snapshot().online.social.requests.some(r=>r.direction==='incoming'));
  await click(b,'online:players');await click(b,'online:friends');await choose(b,'online:friendAction:accept:'+aid);await b.waitForFunction(()=>__night.snapshot().online.social.friends.length===1);await click(b,'online:back');
  await type(a,'仅双方可见');await click(a,'online:chatSend');await b.waitForFunction(()=>__night.snapshot().online.notification?.text==='仅双方可见');assert.equal((await snapshot(c)).online.directUnread,0);
  const before=(await snapshot(b)).progression?.page;await click(b,'social:reply');await b.setViewportSize({width:568,height:320});await settleVisuals(b);await type(b,'收到');await click(b,'online:chatSend');await a.waitForFunction(()=>__night.snapshot().chat.messages.some(m=>m.text==='收到'));await shot(b,'private-568');
  await click(b,'social:close');assert.equal((await snapshot(b)).progression?.page,before);
  await b.setViewportSize({width:844,height:390});await settleVisuals(b);await click(b,'qm:warehouse');
  await type(a,'仓库页也能回复');await click(a,'online:chatSend');await b.waitForFunction(()=>__night.snapshot().online.notification?.text==='仓库页也能回复');await click(b,'social:reply');await b.waitForFunction(()=>__night.snapshot().chat.messages.some(m=>m.text==='仓库页也能回复'));await shot(b,'reply-over-warehouse');await click(b,'social:close');assert.equal((await snapshot(b)).progression.page,'warehouse');await shot(b,'notice-closed-warehouse');assert(!(await snapshot(b)).buttons.some(b=>b.id==='social:reply'));
  await b.context().setOffline(true);await a.waitForFunction(id=>__night.snapshot().online.social.friends.some(p=>p.playerId===id&&p.status==='offline'),bid,{timeout:45000});
  await click(a,'social:close');await click(a,'online:friends');await shot(a,'offline-friend');await choose(a,'online:whisper:'+bid);await type(a,'给离线好友留言');await click(a,'online:chatSend');await a.waitForFunction(()=>__night.snapshot().chat.messages.some(m=>m.text==='给离线好友留言'));
  await b.context().setOffline(false);await b.reload();await b.waitForFunction(()=>globalThis.__night?.snapshot().online.socialAvailable&&!document.getElementById('night-startup'));await b.waitForFunction(()=>__night.snapshot().online.notification?.text==='给离线好友留言');await click(b,'social:reply');await b.waitForFunction(()=>__night.snapshot().chat.messages.some(m=>m.text==='仅双方可见')&&__night.snapshot().chat.messages.some(m=>m.text==='给离线好友留言'));
  assert.equal((await snapshot(b)).online.identity.playerId,bid);await shot(b,'persistent-history');await click(b,'social:close');
  evidence.checks.push('mutual friend acceptance, offline status and delivery, private history after reload, third-party isolation, reply restores warehouse page; 568/844/1280 layouts and update history');
  await a.waitForFunction(id=>__night.snapshot().online.social.friends.some(p=>p.playerId===id&&p.status==='available'),bid);
  await click(c,'online:players');await choose(c,'online:whisper:'+aid);await type(c,'第二位好友的会话');await click(c,'online:chatSend');await a.waitForFunction(()=>__night.snapshot().online.social.conversations.length===2);
  await click(a,'social:close');await settleVisuals(a);assert.equal((await snapshot(a)).online.chatPeer,undefined);assert((await snapshot(a)).buttons.some(b=>b.id==='online:whisper:'+cid));await shot(a,'all-conversations');
  await choose(a,'online:whisper:'+bid);await click(a,'online:friendAction:remove:'+bid);await shot(a,'remove-confirm');assert((await snapshot(a)).online.social.friends.some(p=>p.playerId===bid));await click(a,'social:removeCancel');assert((await snapshot(a)).online.social.friends.some(p=>p.playerId===bid));
  await click(a,'online:friendAction:remove:'+bid);await click(a,'social:removeConfirm');await a.waitForFunction(()=>__night.snapshot().online.social.friends.length===0);assert((await snapshot(a)).chat.messages.some(m=>m.text==='给离线好友留言'));
  evidence.checks.push('low K90 capsule keeps secondary header at top; safe side gutters; two-conversation inbox restored; removal cancel/confirm retains history; block/report hidden; no leftover notice frame');
  await click(c,'social:close');await click(c,'online:back');
  await click(a,'online:invitePlayer:'+bid);await a.waitForFunction(()=>__night.snapshot().chat.messages.some(m=>m.room));await b.waitForFunction(()=>__night.snapshot().online.notification?.text?.includes('来我的房间'));
  await click(b,'social:reply');await b.waitForFunction(()=>__night.snapshot().chat.messages.some(m=>m.room?.canJoin));const invite=(await snapshot(b)).chat.messages.find(m=>m.room?.canJoin);await shot(b,'invitation-card');
  await choose(b,'online:chatJoin:'+invite.id,'direct');await b.waitForFunction(()=>__night.snapshot().online.room?.players.length===2);await click(a,'social:close');await click(a,'online:roomReturn');
  await click(a,'online:ready');await click(b,'online:ready');for(const p of [a,b])await p.waitForFunction(()=>__night.snapshot().online.active&&__night.snapshot().phase==='playing');
  await click(c,'online:players');await c.waitForFunction(id=>__night.snapshot().online.onlinePlayers.find(p=>p.playerId===id)?.status==='playing',bid);await choose(c,'online:whisper:'+bid);
  assert.equal((await snapshot(c)).buttons.find(v=>v.id==='online:invitePlayer:'+bid).disabled,true);
  await type(c,'战斗中也能收到');await click(c,'online:chatSend');await b.waitForFunction(()=>__night.snapshot().online.notification?.text==='战斗中也能收到');await click(b,'social:reply');
  const battle=(await snapshot(b)).online.room.code;await type(b,'战斗中回复');await click(b,'online:chatSend');await c.waitForFunction(()=>__night.snapshot().chat.messages.some(m=>m.text==='战斗中回复'));await shot(b,'reply-during-battle');
  assert.equal((await snapshot(b)).online.room.code,battle);assert((await snapshot(b)).online.active);await click(b,'social:close');assert.equal((await snapshot(b)).phase,'playing');
  evidence.checks.push('targeted invitation joins same room, both ready to start; busy indicator disables invitation; global notification and direct reply work during live human battle without leaving');
  assert.deepEqual(evidence.errors,[]);
} catch(error) {
  evidence.failure=String(error);for(const [i,p] of pages.entries()){evidence['last'+i]=await snapshot(p).catch(()=>null);await p.screenshot({path:fileURLToPath(new URL('failure-'+i+'.png',out))}).catch(()=>{});}throw error;
} finally {
  await browser?.close();await server?.close();await fixture?.close();evidence.cleaned=fixture?.evidence.cleaned;evidence.runtimeModules=fixture?.evidence.executedModules;evidence.runtimeErrors=fixture?.evidence.runtimeErrors;
  await writeFile(new URL('evidence.json',out),JSON.stringify(evidence,null,2));
}
console.log(JSON.stringify({checks:evidence.checks,cleaned:evidence.cleaned}));
