import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { createOwnedRuntime, ownedChild, assertOwnedContainer } from '../../../../scripts/h5-taptap-runtime.mjs';
import { acceptanceBuild, snapshot, press, settleVisuals, assertLayout } from './flight-browser.mjs';
import { scrollPage, scrollToButton } from './scroll-helpers.mjs';

const workspace=fileURLToPath(new URL('../../../../',import.meta.url)),out=new URL('../reports/2026-11-14-reconnect/',import.meta.url);
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
  const sentAt=new WeakMap();
  const click=async(p,id)=>{await p.waitForFunction(id=>__night.snapshot().buttons.some(b=>b.id===id),id);if(id==='online:chatSend'){const wait=3200-(Date.now()-(sentAt.get(p)||0));if(wait>0)await p.waitForTimeout(wait);sentAt.set(p,Date.now());}await press(p,id,true,false);};
  const choose=async(p,id,key='players')=>{await settleVisuals(p);await scrollToButton(p,id,key);await click(p,id);};
  const type=async(p,text)=>{const send=(await snapshot(p)).buttons.find(b=>b.id==='online:chatSend');await p.touchscreen.tap(send.x-130,send.y+22);await p.locator('input:visible').fill(text);};
  const shot=async(p,name)=>{await settleVisuals(p);await p.screenshot({path:fileURLToPath(new URL(name+'.png',out))});};
  const finishFixture=(code,round,loser,rewardSeat)=>{
    assert(/^[0-9]{6}$/.test(code)&&/^[a-f0-9-]{36}$/.test(round)&&[0,1].includes(loser));
    const container=fixture.descriptor.postgresContainer;
    const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',windowsHide:true});
    assertOwnedContainer(JSON.parse(docker(['container','inspect',container]))[0],fixture.names,container,true);
    // Only the owned test battle is accelerated; real HTTP performs its settlement and next-round transition.
    docker(['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','platform_owner','-d','h5_acceptance'],`DO $$ DECLARE r jsonb; BEGIN
      SELECT data INTO r FROM runtime.competition_rooms WHERE code='${code}' FOR UPDATE;
      ASSERT r->>'id'='${round}' AND r->>'status'='playing';
      r=jsonb_set(r,'{players,0,state,simulation,units}',(SELECT jsonb_agg(CASE WHEN (u->>'group')::int=${loser} THEN jsonb_set(u,'{hp}','0') ELSE u END) FROM jsonb_array_elements(r#>'{players,0,state,simulation,units}') u));
      ${rewardSeat===1?"r=jsonb_set(r,'{players,0,state,simulation,duelStats,1,ammoSpent}','3'); r=jsonb_set(r,'{players,0,state,simulation,duelStats,1,hitShots}','1');":''}
      UPDATE runtime.competition_rooms SET data=r WHERE code='${code}'; END $$;`);
    (evidence.terminalFixtures??=[]).push({code,round,loser,participationInjected:rewardSeat===1});
  };
  const dropdown=async(p,entry,s)=>{
    s??=await snapshot(p);
    const list=s.scrollLists.find(v=>v.key==='players'),{width,height}=p.viewportSize();
    assert(list&&list.w<=396);
    assert(Math.abs(list.x-12-Math.max(s.safe.left+16,Math.min(entry.x,width-s.safe.right-list.w-40)))<1,'dropdown follows its toolbar entry');
    const capsule=(s.safeSources.hosts.find(v=>v.capsule)?.capsule);
    const top=Math.max(entry.y+entry.h+6,capsule&&list.x+list.w+12>capsule.left?capsule.bottom+6:0);
    assert(Math.abs(list.y-60-top)<1,'dropdown starts below its toolbar entry');
    assert(Math.abs(list.y+list.h-(height-s.safe.bottom-24))<1,'dropdown extends to the bottom safe margin');
  };
  for(const p of pages)await p.waitForFunction(()=>__night.snapshot().online.onlineCount===3);
  await click(a,'social:updates');await a.waitForFunction(()=>__night.snapshot().updatesOpen);await shot(a,'updates-844');await click(a,'updates:close');
  for(const [width,height] of [[568,320],[844,390],[1280,720]]){
    await a.setViewportSize({width,height});await settleVisuals(a);await shot(a,'home-'+width);
    const header=(await snapshot(a)).buttons;
    for(const id of ['online:players','online:friends','online:chat'])assert(header.some(b=>b.id===id));
    await click(a,'online:friends');await shot(a,'friends-'+width);await dropdown(a,header.find(b=>b.id==='online:friends'));await click(a,'online:back');
    await click(a,'online:players');await a.waitForFunction(()=>__night.snapshot().online.onlinePlayers.length===3);
    assert.equal((await snapshot(a)).online.panel,'players');await shot(a,'players-'+width);
    await dropdown(a,header.find(b=>b.id==='online:players'));
    const list=(await snapshot(a)).scrollLists.find(v=>v.key==='players');assert(list.w<=400);
    await choose(a,'online:whisper:'+bid);await a.waitForFunction(()=>__night.snapshot().online.socialOpen);await shot(a,'conversation-'+width);
    const controls=(await snapshot(a)).buttons;assert(!controls.some(b=>/friendAction|invitePlayer/.test(b.id)));assert(controls.find(b=>b.id==='online:chatSend').x>width-120);
    await click(a,'social:close');assert.equal((await snapshot(a)).online.panel,'players');await click(a,'online:back');
    await click(a,'online:chat');await a.waitForFunction(()=>__night.snapshot().online.panel==='chat');await shot(a,'public-lobby-'+width);
    assert(!(await snapshot(a)).buttons.some(b=>['online:players','online:friends','online:chatInbox','online:lobbyRooms'].includes(b.id)));await click(a,'online:back');
    await click(a,'online:profile');await shot(a,'nickname-'+width);await click(a,'online:close');
    await click(a,'settings');await shot(a,'settings-'+width);await click(a,'close');
  }
  for(const panel of ['friends','players']){
    await click(c,'online:'+panel);await c.setViewportSize({width:568,height:320});await shot(c,panel+'-capsule-568');
    const resized=await snapshot(c);await click(c,'online:back');await dropdown(c,(await snapshot(c)).buttons.find(b=>b.id==='online:'+panel),resized);
    await c.setViewportSize({width:844,height:390});await settleVisuals(c);
  }
  await a.setViewportSize({width:844,height:390});await settleVisuals(a);await click(a,'online:players');await choose(a,'online:friendAction:request:'+bid);
  await b.waitForFunction(()=>__night.snapshot().online.social.requests.some(r=>r.direction==='incoming'));
  await click(b,'online:friends');await choose(b,'online:friendAction:accept:'+aid);await b.waitForFunction(()=>__night.snapshot().online.social.friends.length===1);await click(b,'online:back');
  await choose(a,'online:whisper:'+bid);await type(a,'仅双方可见');await click(a,'online:chatSend');await b.waitForFunction(()=>__night.snapshot().online.notification?.text==='仅双方可见');assert.equal((await snapshot(c)).online.directUnread,0);await shot(b,'message-bubble');
  const before=(await snapshot(b)).progression?.page;await click(b,'social:reply');await type(b,'收到');await click(b,'online:chatSend');await a.waitForFunction(()=>__night.snapshot().chat.messages.some(m=>m.text==='收到'));await shot(b,'private-844');
  for(const [width,height]of [[568,320],[844,390]]){
    await b.setViewportSize({width,height});await settleVisuals(b);
    assert((await snapshot(b)).ui.pageControls.includes('qm:loadout'),'home remains drawn underneath chat after resizing');
    const text='调整尺寸后继续聊天'+width;await type(b,text);await click(b,'online:chatSend');await a.waitForFunction(text=>__night.snapshot().chat.messages.some(m=>m.text===text),text);
    await shot(b,'home-chat-resized-'+width);assert((await snapshot(b)).ui.pageControls.includes('qm:loadout'));
  }
  await click(b,'social:close');assert.equal((await snapshot(b)).progression?.page,before);
  await click(b,'qm:warehouse');await type(a,'仓库页也能回复');await click(a,'online:chatSend');await b.waitForFunction(()=>__night.snapshot().online.notification?.text==='仓库页也能回复');await click(b,'social:reply');await b.waitForFunction(()=>__night.snapshot().chat.messages.some(m=>m.text==='仓库页也能回复'));await shot(b,'reply-over-warehouse');await click(b,'social:close');assert.equal((await snapshot(b)).progression.page,'warehouse');await shot(b,'notice-closed-warehouse');assert(!(await snapshot(b)).buttons.some(b=>b.id==='social:reply'));await click(b,'qm:back');
  await click(b,'qm:loadout');await type(a,'配置页继续聊天');await click(a,'online:chatSend');await b.waitForFunction(()=>__night.snapshot().online.notification?.text==='配置页继续聊天');await click(b,'social:reply');
  const loadout=(await snapshot(b)).progression;await b.setViewportSize({width:568,height:320});await settleVisuals(b);await scrollPage(b,'direct',-100);
  assert.equal((await snapshot(b)).progression.page,'loadout');assert.equal((await snapshot(b)).progression.scroll,loadout.scroll);assert.deepEqual((await snapshot(b)).progression.draft,loadout.draft);
  assert((await snapshot(b)).ui.pageControls.includes('qm:back'));await shot(b,'chat-over-loadout-resized');await click(b,'social:close');await click(b,'qm:back');await b.setViewportSize({width:844,height:390});await settleVisuals(b);
  await b.context().setOffline(true);await a.waitForFunction(id=>__night.snapshot().online.social.friends.some(p=>p.playerId===id&&p.status==='offline'),bid,{timeout:45000});
  await click(a,'social:close');await click(a,'online:back');await click(a,'online:friends');await shot(a,'offline-friend');await choose(a,'online:whisper:'+bid);await type(a,'给离线好友留言');await click(a,'online:chatSend');await a.waitForFunction(()=>__night.snapshot().chat.messages.some(m=>m.text==='给离线好友留言'));
  await b.context().setOffline(false);await b.reload();await b.waitForFunction(()=>globalThis.__night?.snapshot().online.socialAvailable&&!document.getElementById('night-startup'));await b.waitForFunction(()=>__night.snapshot().online.notification?.text==='给离线好友留言');await click(b,'social:reply');await b.waitForFunction(()=>__night.snapshot().chat.messages.some(m=>m.text==='仅双方可见')&&__night.snapshot().chat.messages.some(m=>m.text==='给离线好友留言'));
  assert.equal((await snapshot(b)).online.identity.playerId,bid);await shot(b,'persistent-history');await click(b,'social:close');
  evidence.checks.push('three viewport home entries, compact lists and pure conversation windows; independent public lobby; nickname/settings; mutual friends, offline delivery, durable history, third-party isolation, original page restoration');
  await click(a,'social:close');await choose(a,'online:friendAction:remove:'+bid);await shot(a,'remove-confirm');assert((await snapshot(a)).online.social.friends.some(p=>p.playerId===bid));await click(a,'social:removeCancel');
  await a.waitForFunction(id=>__night.snapshot().online.social.friends.some(p=>p.playerId===id&&p.status==='available'),bid);
  const rejectCreate=route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'RULE_VERSION_CHANGED'})});
  await a.route('**/games/night-overwatch/rooms',rejectCreate);await choose(a,'online:invitePlayer:'+bid);
  await a.waitForFunction(()=>__night.snapshot().chat.status.includes('版本不匹配'));await shot(a,'invite-failure');assert(!(await snapshot(a)).online.room);await a.unroute('**/games/night-overwatch/rooms',rejectCreate);
  await choose(a,'online:invitePlayer:'+bid);await a.waitForFunction(()=>__night.snapshot().online.panel==='room'&&__night.snapshot().online.room);await b.waitForFunction(()=>__night.snapshot().online.notification?.text?.includes('来我的房间'));
  for(const [width,height]of [[568,320],[844,390],[1280,720]]){await a.setViewportSize({width,height});await shot(a,'ready-room-empty-'+width);assertLayout(await snapshot(a),width,height);}
  await a.setViewportSize({width:844,height:390});await settleVisuals(a);
  await click(b,'social:reply');await b.waitForFunction(()=>__night.snapshot().chat.messages.some(m=>m.room?.canJoin));const invite=(await snapshot(b)).chat.messages.find(m=>m.room?.canJoin);await shot(b,'invitation-card');
  await choose(b,'online:chatJoin:'+invite.id,'direct');await b.waitForFunction(()=>__night.snapshot().online.room?.players.length===2);await shot(a,'created-room');
  await a.waitForFunction(()=>__night.snapshot().online.room?.players.length===2);await shot(a,'ready-room-two');
  await click(a,'online:ready');await click(b,'online:ready');for(const p of [a,b])await p.waitForFunction(()=>__night.snapshot().online.active&&__night.snapshot().phase==='playing');
  await click(c,'online:players');await c.waitForFunction(id=>__night.snapshot().online.onlinePlayers.find(p=>p.playerId===id)?.status==='playing',bid);
  await c.waitForFunction(id=>__night.snapshot().buttons.find(v=>v.id==='online:invitePlayer:'+id)?.disabled===true,bid);
  assert.equal((await snapshot(c)).buttons.find(v=>v.id==='online:invitePlayer:'+bid).disabled,true);await choose(c,'online:whisper:'+bid);
  await type(c,'战斗中也能收到');await click(c,'online:chatSend');await b.waitForFunction(()=>__night.snapshot().online.notification?.text==='战斗中也能收到');await click(b,'social:reply');
  const battle=(await snapshot(b)).online.room.code;await type(b,'战斗中回复');await click(b,'online:chatSend');await c.waitForFunction(()=>__night.snapshot().chat.messages.some(m=>m.text==='战斗中回复'));await shot(b,'reply-during-battle');
  assert.equal((await snapshot(b)).online.room.code,battle);assert((await snapshot(b)).online.active);await click(b,'social:close');assert.equal((await snapshot(b)).phase,'playing');
  const round=(await snapshot(b)).online.room.id;
  await a.waitForFunction(()=>__night.snapshot().time>=11);await click(a,'settings');await click(a,'home');await click(a,'exitConfirm');
  await a.waitForFunction(code=>__night.snapshot().online.resumeCode===code&&!__night.snapshot().online.active,battle);
  await b.waitForFunction(()=>__night.snapshot().online.peerChoice);
  let waiting=await snapshot(b);assert(waiting.online.peerReconnectSeconds>0&&waiting.online.peerReconnectSeconds<=30);assert.equal(waiting.phase,'playing');assert.equal(waiting.online.room.settlement,null);
  assert(waiting.buttons.some(v=>v.id==='online:peerLeave'));await shot(b,'opponent-offline-choice');await shot(a,'quit-recovery-entry');
  await click(b,'online:peerContinue');const beforeWait=(await snapshot(b)).time;await b.waitForTimeout(1200);
  waiting=await snapshot(b);assert(!waiting.online.peerChoice);assert(waiting.time>beforeWait,'continuing does not pause the battle');
  const rejoin='online:resumeRoom:'+battle;
  await a.waitForFunction(id=>__night.snapshot().buttons.some(b=>b.id===id&&b.text==='返回对战'&&!b.disabled),rejoin);
  assert(!(await snapshot(a)).buttons.some(b=>b.id==='online:watchCode:'+battle));
  await choose(a,rejoin,'rooms');await a.waitForFunction(id=>__night.snapshot().online.room?.id===id&&__night.snapshot().phase==='playing',round);
  await b.waitForFunction(id=>{const p=__night.snapshot().online.room?.players.find(p=>(p.id||p.playerId)===id);return p&&!p.disconnected&&!p.left&&!p.takenOver;},aid);
  assert.equal((await snapshot(b)).online.room.code,battle);await shot(a,'voluntary-return-control');
  await a.context().setOffline(true);await b.waitForFunction(()=>__night.snapshot().online.peerChoice);
  await shot(b,'network-offline-choice');await a.context().setOffline(false);
  await b.waitForFunction(id=>{const s=__night.snapshot(),p=s.online.room?.players.find(p=>(p.id||p.playerId)===id);return !s.online.peerChoice&&p&&!p.disconnected&&!p.takenOver;},aid);
  assert.equal((await snapshot(a)).online.room.id,round);await shot(b,'network-return-choice-dismissed');
  await click(a,'settings');await click(a,'home');await click(a,'exitConfirm');await b.waitForFunction(()=>__night.snapshot().online.peerChoice);await click(b,'online:peerContinue');
  await b.waitForFunction(id=>__night.snapshot().online.room?.players.some(p=>(p.id||p.playerId)===id&&p.takenOver),aid,{timeout:45000});
  const taken=await snapshot(b);assert.equal(taken.online.room.id,round);assert.equal(taken.online.room.code,battle);assert.equal(taken.online.room.settlement,null);assert.equal(taken.phase,'playing');assert(!taken.online.peerChoice);
  assert(taken.online.room.state.bots[0]);await shot(b,'timeout-bot-continues');
  await click(a,'online:resumeRoom');await a.waitForFunction(()=>!__night.snapshot().online.resumeCode&&!__night.snapshot().online.active);assert(!(await snapshot(a)).online.room);
  finishFixture(battle,round,0,1);
  await b.waitForFunction(()=>__night.snapshot().phase==='success'&&__night.snapshot().online.room?.settlement);
  const receipt=(await snapshot(b)).online.room.settlement;
  assert.equal(receipt.points,120);assert.equal(receipt.coins,200);assert.equal(receipt.xp,140);await shot(b,'eligible-win-receipt');
  let droppedRematch=false;
  const lostReply=async route=>{
    if(droppedRematch)return route.continue();
    const response=await route.fetch();assert(response.ok());droppedRematch=true;return route.abort('connectionfailed');
  };
  await b.route('**/rooms/'+battle+'/rematch',lostReply);
  await click(b,'online:roomReturn');await b.waitForFunction(()=>__night.snapshot().online.room?.status==='waiting'&&__night.snapshot().online.panel==='room');
  assert(droppedRematch);await b.unroute('**/rooms/'+battle+'/rematch',lostReply);
  assert.equal((await snapshot(b)).online.room.code,battle);await shot(b,'same-room-after-bot');
  await a.goto(origin+'/?room='+battle+'&dev=0');await a.waitForFunction(code=>globalThis.__night?.snapshot().online.room?.code===code&&__night.snapshot().online.panel==='room',battle);
  await b.waitForFunction(()=>__night.snapshot().online.room?.players.length===2);
  const secondRound=(await snapshot(b)).online.room.id;assert.notEqual(secondRound,round);
  await click(a,'online:ready');await click(b,'online:ready');await a.waitForFunction(()=>__night.snapshot().phase==='playing'&&__night.snapshot().time>1);
  finishFixture(battle,secondRound,1);
  for(const p of [a,b])await p.waitForFunction(()=>!!__night.snapshot().online.room?.settlement);
  await click(b,'online:roomReturn');
  for(const p of [a,b])await p.waitForFunction(id=>__night.snapshot().online.room?.status==='waiting'&&__night.snapshot().online.room.id!==id&&__night.snapshot().buttons.some(b=>b.id==='online:ready'),secondRound);
  assert.equal((await snapshot(a)).online.room.code,battle);await shot(a,'passive-same-room-next-round');
  await click(b,'online:backLobby');await b.waitForFunction(()=>!__night.snapshot().online.room);
  await click(b,'online:players');await choose(b,'online:whisper:'+aid);await b.waitForFunction(id=>__night.snapshot().chat.messages.some(m=>m.id===id&&m.room?.canJoin),invite.id);
  await choose(b,'online:chatJoin:'+invite.id,'direct');await b.waitForFunction(code=>__night.snapshot().online.room?.code===code,battle);await shot(b,'original-invitation-rejoined');
  for(const p of [a,b])await click(p,'online:backLobby');
  evidence.checks.push('voluntary leave shows rejoin instead of watch on the original public room row; opponent chooses continue without pausing; tapping the room row restores control of the same round; real network loss/recovery dismisses choice; 30s expiry hands the existing battle to a bot without settling; expired recovery is refused; final remaining player leaves');
  evidence.checks.push('owned SQL fixtures accelerate two terminal battles; real server credits eligible winner 120/200/140; a lost committed rematch response recovers without stealing control; stay retains room code; original URL returns; partner automatically receives next round; original chat invitation joins again');
  evidence.notCovered=['natural full-length battle and reward eligibility earned solely by browser gameplay'];
  evidence.terminalInjection=true;
  evidence.checks.push('failed invite exposes version rejection in place; successful targeted invitation creates one room and recipient joins; both ready; busy player invitation disabled; battle continues through private reply');
  await click(c,'social:close');await click(c,'online:back');
  await click(c,'qm:modes');await click(c,'mode:duel');await click(c,'mode:enter');await c.waitForFunction(()=>__night.snapshot().online.panel==='menu');await shot(c,'battle-lobby');
  assert(!(await snapshot(c)).buttons.some(b=>b.id==='online:chatInbox'));
  await click(c,'online:lobbyRooms');await click(c,'online:join');await shot(c,'join-844');await click(c,'online:close');await click(c,'online:friend');await shot(c,'create-844');
  await c.route('**/games/night-overwatch/rooms',rejectCreate);await click(c,'online:createConfirm');await c.waitForFunction(()=>__night.snapshot().online.message.includes('版本不匹配'));await shot(c,'create-failure');await c.unroute('**/games/night-overwatch/rooms',rejectCreate);await click(c,'online:close');await click(c,'online:back');
  if((await snapshot(c)).progression.page!=='modes')await click(c,'qm:modes');
  await click(c,'mode:solo');await click(c,'mode:enter');await c.waitForFunction(()=>__night.snapshot().buttons.some(b=>b.id==='training'));await click(c,'training');await c.waitForFunction(()=>__night.snapshot().phase==='playing'&&__night.snapshot().mission.id==='training-60');await shot(c,'one-tap-training');
  evidence.checks.push('battle lobby retains room/player/friend tabs without inbox; compact join/create forms and explicit failure; single tap from mission selection starts three-target practice');
  assert.deepEqual(evidence.errors,[]);
} catch(error) {
  evidence.failure=String(error);for(const [i,p] of pages.entries()){evidence['last'+i]=await snapshot(p).catch(()=>null);await p.screenshot({path:fileURLToPath(new URL('failure-'+i+'.png',out))}).catch(()=>{});}throw error;
} finally {
  await browser?.close();await server?.close();await fixture?.close();evidence.cleaned=fixture?.evidence.cleaned;evidence.runtimeModules=fixture?.evidence.executedModules;evidence.runtimeErrors=fixture?.evidence.runtimeErrors;
  await writeFile(new URL('evidence.json',out),JSON.stringify(evidence,null,2));
}
console.log(JSON.stringify({checks:evidence.checks,cleaned:evidence.cleaned}));
