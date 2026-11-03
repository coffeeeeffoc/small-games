import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createOwnedRuntime,ownedChild } from '../../../../scripts/h5-taptap-runtime.mjs';
import { acceptanceBuild,snapshot,press,settleVisuals } from './flight-browser.mjs';
import { scrollToButton,scrollPage } from './scroll-helpers.mjs';

// Isolated real PostgreSQL + HTTP service, two fresh browser identities. No service/asset mocks.
const spectatorOnly=process.env.NIGHT_SPECTATOR_ONLY==='1',workspace=fileURLToPath(new URL('../../../../',import.meta.url)),out=new URL(spectatorOnly?'../reports/2026-11-02-spectator-live/':'../reports/2026-11-02-chat-live/',import.meta.url);
await mkdir(out,{recursive:true});
const evidence={fixture:'isolated-real-postgresql-http',checks:[],errors:[],screens:[]};
let fixture,server,browser;const pages=[];
try{
 fixture=await createOwnedRuntime({workspace});
 const {api,origin,runId}=fixture.descriptor;evidence.runId=runId;
 server=ownedChild(process.execPath,['games/local/night-overwatch/scripts/serve.mjs'],{cwd:workspace,env:{...process.env,PORT:'43810'}});
 for(let i=0;i<50;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 process.env.NIGHT_URL=origin;evidence.build=await acceptanceBuild(origin);
 browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
 const contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:1280,height:720}})));
 const polls=[0,0];
 for(const [i,c]of contexts.entries()){
  const p=await c.newPage();p.setDefaultTimeout(45000);p.on('pageerror',e=>evidence.errors.push(e.message));p.on('request',r=>{if(r.method()==='GET'&&r.url().includes('/night-overwatch/chat'))polls[i]++;});p.on('response',async r=>{if(r.status()>=400&&r.url().includes('/api/competition/')){let code;try{const json=await r.json();code=json.error?.code||json.code;}catch{}evidence.errors.push({path:new URL(r.url()).pathname,status:r.status(),code});}});
  await p.route('**/game-service-config.js',r=>r.fulfill({contentType:'text/javascript',body:`globalThis.__COMPETITION_CONFIG__=Object.freeze(${JSON.stringify({game:'night-overwatch',platform:'h5',competitionEnabled:true,apiUrl:api})});`}));
  await p.goto(origin+'/?dev=0');await p.waitForFunction(()=>globalThis.__night?.snapshot().progression.assets?.playerId&&!document.getElementById('night-startup'));
  for(const id of ['qm:modes','mode:duel','mode:enter'])await press(p,id,false,false);
  await p.waitForFunction(()=>__night.snapshot().online.panel==='menu');pages.push(p);
 }
 const [a,b]=pages;const click=(p,id)=>press(p,id,false,false);
 const type=async(p,text)=>{await p.mouse.click(830,681);const input=p.locator('input:visible');await input.waitFor();await input.fill(text);return input;};
 const shot=async(p,name)=>{await settleVisuals(p);await p.screenshot({path:fileURLToPath(new URL(name+'.png',out))});evidence.screens.push(name);};
 const aid=(await snapshot(a)).progression.assets.playerId,bid=(await snapshot(b)).progression.assets.playerId;assert.notEqual(aid,bid);evidence.players=[aid,bid];
 let code;
 if(!spectatorOnly){
 await type(a,'隔离验收：文字交流');await click(a,'online:chatSend');await b.waitForFunction(()=>__night.snapshot().chat.messages.some(m=>m.text==='隔离验收:文字交流'));
 const input=await type(a,'中文输入尚未完成');const handle=await input.elementHandle();await input.dispatchEvent('compositionstart',{data:'中文'});
 await type(b,'隔离验收：另一位玩家');await click(b,'online:chatSend');await a.waitForFunction(()=>__night.snapshot().chat.messages.some(m=>m.text==='隔离验收:另一位玩家'));
 assert(await handle.evaluate(el=>el.isConnected));assert.equal(await input.inputValue(),'中文输入尚未完成');await input.dispatchEvent('compositionend',{data:'中文输入尚未完成'});await shot(a,'01-ime-survives-new-message');
 await a.waitForTimeout(3100);await click(a,'online:chatSend');await a.waitForFunction(()=>!__night.snapshot().chat.sending);await new Promise(r=>setTimeout(r,3200));
 const longText=Array.from('夜航守望一起出动，交流文字与组队消息。'.repeat(10)).slice(0,118).join('')+'终点';assert.equal(Array.from(longText).length,120);
 await type(b,longText);await click(b,'online:chatSend');await a.waitForFunction(text=>__night.snapshot().chat.messages.some(m=>m.text===text),longText.normalize('NFKC'));await shot(a,'02-long-message-desktop');
 await b.setViewportSize({width:568,height:320});await settleVisuals(b);await b.waitForTimeout(300);let phoneArea=(await snapshot(b)).scrollLists.find(a=>a.key==='chat');assert(phoneArea.max>0);await scrollPage(b,'chat',phoneArea.max*5);phoneArea=(await snapshot(b)).scrollLists.find(a=>a.key==='chat');assert(phoneArea.offset>0);await shot(b,'02-long-message-phone-bottom');await scrollPage(b,'chat',-120);assert((await snapshot(b)).scrollLists.find(a=>a.key==='chat').offset<phoneArea.offset);await shot(b,'02-long-message-phone-middle');await b.setViewportSize({width:1280,height:720});await settleVisuals(b);
 await click(a,'online:friend');await click(a,'online:createConfirm');await a.waitForFunction(()=>__night.snapshot().online.room?.visibility==='public');code=(await snapshot(a)).online.room.code;
 await click(a,'online:chatInvite');await a.waitForFunction(()=>__night.snapshot().online.panel==='menu'&&__night.snapshot().chat.messages.some(m=>m.room));assert.equal((await snapshot(a)).online.room.code,code);
 await b.waitForFunction(()=>__night.snapshot().chat.messages.some(m=>m.room?.canJoin));const invite=(await snapshot(b)).chat.messages.find(m=>m.room?.code===code);assert(invite.room.createdAt);await shot(b,'02-public-room-invitation');
 await scrollToButton(b,'online:chatJoin:'+invite.id,'chat');await click(b,'online:chatJoin:'+invite.id);await b.waitForFunction(()=>__night.snapshot().online.room?.players.length===2);assert.equal((await snapshot(b)).online.room.code,code);
 await a.waitForFunction(()=>__night.snapshot().chat.messages.some(m=>m.room&&!m.room.canJoin),null,{timeout:15000});await shot(a,'03-full-invitation-closed');
 const message=(await snapshot(a)).chat.messages.find(m=>m.playerId===bid);await scrollToButton(a,'online:chatMenu:'+message.id,'chat');await click(a,'online:chatMenu:'+message.id);await click(a,'online:chatBlock:'+bid);assert(!(await snapshot(a)).chat.messages.some(m=>m.playerId===bid));
 await click(a,'online:chatBlocks');await click(a,'online:chatBlock:'+bid);assert((await snapshot(a)).chat.messages.some(m=>m.playerId===bid));
 await click(a,'online:roomReturn');await a.waitForTimeout(6000);const stopped=polls[0];await a.waitForTimeout(1300);assert.equal(polls[0],stopped);await shot(a,'04-joined-room');
 }else{await click(a,'online:friend');await click(a,'online:createConfirm');await a.waitForFunction(()=>__night.snapshot().online.room?.visibility==='public');code=(await snapshot(a)).online.room.code;await b.waitForFunction(code=>__night.snapshot().online.rooms.some(r=>r.code===code),code);await click(b,'online:joinCode:'+code);await a.waitForFunction(()=>__night.snapshot().online.room?.players.length===2);}
 await click(a,'online:ready');await click(b,'online:ready');await a.waitForFunction(()=>__night.snapshot().phase==='playing');
 const spectatorContext=await browser.newContext({viewport:{width:1280,height:720}}),spectator=await spectatorContext.newPage();pages.push(spectator);spectator.on('pageerror',e=>evidence.errors.push(e.message));
 await spectator.route('**/game-service-config.js',r=>r.fulfill({contentType:'text/javascript',body:`globalThis.__COMPETITION_CONFIG__=Object.freeze(${JSON.stringify({game:'night-overwatch',platform:'h5',competitionEnabled:true,apiUrl:api})});`}));await spectator.goto(origin+'/?dev=0');await spectator.waitForFunction(()=>globalThis.__night?.snapshot().progression.assets?.playerId&&!document.getElementById('night-startup'));
 for(const id of ['qm:modes','mode:duel','mode:enter'])await click(spectator,id);await spectator.waitForFunction(code=>__night.snapshot().online.rooms.some(r=>r.code===code&&r.canSpectate),code);await scrollToButton(spectator,'online:watchCode:'+code,'rooms');await click(spectator,'online:watchCode:'+code);await spectator.waitForFunction(()=>__night.snapshot().online.room?.spectator&&__night.snapshot().phase==='playing'&&!__night.snapshot().modal);
 const participants=(await snapshot(spectator)).online.room.players.map(p=>p.nickname||p.name);assert.equal(participants.length,2);
 const labels=()=>spectator.evaluate(async()=>{const {director,Label}=await System.import('cc');return director.getScene().getComponentsInChildren(Label).filter(l=>l.node.activeInHierarchy).map(l=>l.string).join('\n');});
 for(const [width,height]of [[1280,720],[568,320]]){await spectator.setViewportSize({width,height});await settleVisuals(spectator);let state=await snapshot(spectator);for(const id of ['battleReport']){const button=state.buttons.find(b=>b.id===id);assert(button&&button.x+button.w<width*.5&&button.y<150);}await shot(spectator,'05-spectator-'+width);await click(spectator,'battleReport');let text=await labels();for(const name of participants)assert(text.includes(name));await shot(spectator,'05-spectator-report-'+width);await click(spectator,'equipment');text=await labels();for(const name of participants)assert(text.includes(name));await shot(spectator,'05-spectator-equipment-'+width);await click(spectator,'close');}
 if(!spectatorOnly)evidence.checks.push('two fresh real service identities exchange text','new message preserves live Chinese composition input element and draft','120 Chinese characters scroll without clipping at 568 and desktop','host invites without leaving public waiting room','second player joins matching room createdAt; full invitation becomes closed','block and restore by playerId','leaving lobby stops chat polling');
 evidence.checks.push('third real guest spectates both named participants; top-left report/equipment at 568 and 1280');
 assert.deepEqual(evidence.errors,[]);
}catch(error){evidence.failure=String(error);evidence.last=[];for(const [i,p]of pages.entries()){const s=await snapshot(p);evidence.last.push({chat:s.chat,panel:s.online.panel,message:s.online.message});await p.screenshot({path:fileURLToPath(new URL('failure-'+i+'.png',out))});}throw error;}
finally{await browser?.close();await server?.close();if(fixture){await fixture.close();evidence.cleaned=fixture.evidence.cleaned;}await writeFile(new URL('evidence.json',out),JSON.stringify(evidence,null,2));}
console.log(JSON.stringify({sourceHash:evidence.build?.sourceHash,checks:evidence.checks,cleaned:evidence.cleaned}));
