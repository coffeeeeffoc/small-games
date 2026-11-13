import test from 'node:test';
import assert from 'node:assert/strict';
import { Online, playerId, playerLabel, invitation, roomLink, type Release } from '../assets/scripts/Online.ts';
import { createDuel, viewDuel } from '../assets/scripts/core/Duel.ts';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import { assetFixture } from './progression-fixture.ts';
const storage = () => { const map = new Map<string, string>(); return { getItem: (key: string) => map.get(key) || null, setItem: (key: string, value: string) => { map.set(key, value); } }; };
const room = () => ({ code: 'A12BCD456789', status: 'waiting', mode: 'match', you: 0, seq: 0, players: [], state: null as ReturnType<typeof viewDuel> | null });
function fixture() {
  const received: any[] = []; let calls = 0, fail = false;
  const current = room();
  const services = { match: async () => { calls++; return current; }, createRoom: async () => current, joinRoom: async () => current,
    getRoom: async () => current, roomAction: async (input: any) => { received.push(structuredClone(input)); if (fail) { fail = false; throw Error('network'); } current.seq = input.body?.seq || current.seq; return current; },
    leaderboard: async () => ({ top: [], me: null }) };
  const bridge = { services, ready: Promise.resolve({ identity: { id: 'a', name: '飞行员' }, capabilities: { multiplayer: true, leaderboards: true } }),
    createRecorder: () => ({ start: async () => null, record() {}, finish: async () => null, invalidate() {} }) };
  return { current, bridge, received, count: () => calls, fail: () => { fail = true; } };
}

const release = (overrides: Partial<Release> = {}): Release => ({ currentBuildId: 'old', latestBuildId: 'new', update: 'optional', canStartNewGames: true, admissions: { ranked: true, multiplayer: true }, action: 'reopen', ...overrides });
const requiredRelease = () => release({ update: 'required', canStartNewGames: false, admissions: { ranked: false, multiplayer: false } });

test('same-code new rounds claim their lease once through rematch and accept fresh ready commands', async () => {
  const f=fixture(), changes:any[]=[], online=new Online(storage(),(state,start)=>changes.push({state,start}));
  let current:any={...room(),id:'round-1',status:'finished',seq:19,players:[{id:'a'},{id:'b'}],state:{...viewDuel(createDuel(41)),finished:true}};
  f.bridge.services.createRoom=f.bridge.services.getRoom=async()=>structuredClone(current);
  let claims=0;f.bridge.services.roomAction=async(input:any)=>{assert.equal(input.operation,'rematch');claims++;return structuredClone(current);};
  Object.assign(f.bridge.services,{connectRoom:async()=>{throw Error('automatic connect could steal another page');}});
  await online.connect(f.bridge);await online.open('friend');
  current={...current,id:'round-2',status:'waiting',state:null,seq:0,rematch:current.code};
  await online.pump(1e9);await online.pump(1e9+4000);
  assert.equal(claims,1);assert.equal(online.view,undefined);assert.equal(online.active,false);assert.equal(online.panel,'room');
  assert(changes.some(c=>c.state===undefined),'controller must discard its old Simulation');
  f.bridge.services.roomAction=async(input:any)=>{f.received.push(input);return structuredClone(current);};
  await online.ready();assert.equal(f.received.at(-1)?.operation,'ready');online.dispose();
});

test('a cancelled countdown returns the same round to its ready room without reconnecting',async()=>{
  const f=fixture(),changes:any[]=[],online=new Online(storage(),state=>changes.push(state));
  let current:any={...room(),id:'round-1',status:'playing',state:viewDuel(createDuel(41))};
  f.bridge.services.createRoom=f.bridge.services.getRoom=f.bridge.services.roomAction=async()=>structuredClone(current);
  Object.assign(f.bridge.services,{connectRoom:async()=>{throw Error('must not reclaim this lease');}});
  await online.connect(f.bridge);await online.open('friend');
  current={...current,status:'waiting',state:null};await online.pump(1e9);
  assert.equal(online.view,undefined);assert.equal(online.panel,'room');assert.equal(changes.at(-1),undefined);assert.equal(online.resumeCode,'');online.dispose();
});

test('explicit same-code rematch accepts its rotated lease without an extra connect',async()=>{
  const f=fixture(),online=new Online(storage(),()=>{});let actions=0;
  const current:any={...room(),id:'round-1',status:'finished',state:{...viewDuel(createDuel(41)),finished:true}};
  f.bridge.services.match=async()=>current;
  f.bridge.services.roomAction=async(input:any)=>{actions++;assert.equal(input.operation,'rematch');return {...current,id:'round-2',status:'waiting',state:null,rematch:current.code};};
  Object.assign(f.bridge.services,{connectRoom:async()=>{throw Error('rematch already returned the lease');}});
  await online.connect(f.bridge);await online.open('match');assert.equal(await online.rematch(),true);assert.equal(actions,1);assert.equal(online.room?.id,'round-2');assert(!online.active);online.dispose();
});

test('a consumed previous lease stops automatic new-round claims instead of stealing control',async()=>{
  const f=fixture(),online=new Online(storage(),()=>{});let claims=0;
  let current:any={...room(),id:'round-1',status:'finished',state:{...viewDuel(createDuel(41)),finished:true}};
  f.bridge.services.match=f.bridge.services.getRoom=async()=>structuredClone(current);
  f.bridge.services.roomAction=async()=>{claims++;throw Object.assign(Error(),{code:'STALE_LEASE'});};
  Object.assign(f.bridge.services,{connectRoom:async()=>{throw Error('must not take over');}});
  await online.connect(f.bridge);await online.open('match');current={...current,id:'round-2',status:'waiting',state:null};
  await online.pump(1e9);await online.pump(1e9+4000);assert.equal(claims,1);assert.equal(online.room?.id,'round-1');assert.match(online.message,/另一页面/);online.dispose();
});

test('offline choice expires by server deadline without pausing or inventing a result',async(t)=>{
  let now=100;t.mock.method(performance,'now',()=>now);
  const f=fixture(),online=new Online(storage(),()=>{});
  const current:any={...room(),id:'round-1',status:'playing',serverNow:11000,players:[{id:'a'},{id:'b',disconnected:true,reconnectUntil:31000}],state:viewDuel(createDuel(41))};
  f.bridge.services.match=f.bridge.services.getRoom=f.bridge.services.roomAction=async()=>structuredClone(current);
  await online.connect(f.bridge);await online.open('match');assert.equal(online.peerReconnectSeconds,20);
  now=10100;await online.pump(now);assert.equal(online.peerReconnectSeconds,10,'duplicate snapshots cannot extend the deadline');
  now=20100;assert(!online.peerChoice);assert.equal(online.peerReconnectSeconds,0);assert(!online.view!.finished);assert.equal(online.room?.settlement,undefined);online.dispose();
});

test('offline choice uses server time, survives repeated snapshots and clears on reconnect or takeover',async()=>{
  const f=fixture(),online=new Online(storage(),()=>{});
  let current:any={...room(),id:'round-1',status:'playing',serverNow:1000,players:[{id:'a'},{id:'b'}],state:viewDuel(createDuel(41))};
  f.bridge.services.createRoom=f.bridge.services.getRoom=f.bridge.services.roomAction=async(input:any)=>{if(input.operation)f.received.push(input);return structuredClone(current);};
  await online.connect(f.bridge);await online.open('friend');
  current.players[1]={id:'b',disconnected:true,left:true,reconnectUntil:31000};current.serverNow=11000;
  await online.pump(1e9);assert.equal(online.peerReconnectSeconds,20);assert(online.peerChoice);
  online.control({command:'fire',args:[]});await online.pump(1e9+1000);
  assert.deepEqual(f.received.at(-1).body.action.commands,[{command:'clearInput',args:[]}]);
  online.continueWithoutPeer();await online.pump(1e9+2000);assert(!online.peerChoice);assert(!online.view!.finished);
  current.players[1]={id:'b'};await online.pump(1e9+3000);assert.equal(online.peerReconnectSeconds,0);
  current.players[1]={id:'b',disconnected:true,reconnectUntil:41000};await online.pump(1e9+4000);assert(online.peerChoice);
  current.players[1].takenOver=true;await online.pump(1e9+5000);assert(!online.peerChoice);assert(!online.view!.finished);online.dispose();
});
test('private conversations isolate recipients and retry the same intent before changing peers',async()=>{
  const f=fixture(),online=new Online(storage(),()=>{}),sent:any[]=[];
  f.bridge.ready=Promise.resolve({identity:{id:'a',name:'A'},capabilities:{multiplayer:true,leaderboards:true,chat:true,social:true}});
  Object.assign(f.bridge.services,{nightChat:async()=>({messages:[],cursor:'',reset:true,serverNow:0}),sendNightChat:async(input:any)=>{sent.push({...input});if(sent.length===1)throw Error('network');return {messages:[{id:'1',playerId:'a',nickname:'A',at:1,...input}],cursor:'x',reset:true,serverNow:1};}});
  await online.connect(f.bridge);online.show('menu');online.openConversation({playerId:'b',nickname:'B'});online.chatDraft='私聊';await online.sendChat();
  online.closeConversation();assert(!online.socialOpen);assert(online.chatRetryPending);assert.equal(playerId(online.chatPeer!),'b');assert.equal(online.chatDraft,'私聊');
  online.openConversation({playerId:'b',nickname:'B'});assert(online.socialOpen);
  online.selectChat({playerId:'c',nickname:'C'});assert.equal(playerId(online.chatPeer!),'b');
  await online.sendChat();assert.deepEqual(sent[0],sent[1]);assert.equal(sent[0].recipientId,'b');
  online.chatMessages.push({id:'2',playerId:'c',nickname:'C',recipientId:'a',text:'另一会话',at:2},{id:'3',playerId:'c',nickname:'C',text:'公开',at:3});
  assert.equal(online.visibleChat.length,1);assert.equal(online.directUnread,1);
  online.selectChat(undefined,true);assert.equal(online.visibleChat.length,2);assert.equal(online.directUnread,1,'the inbox does not mark unopened conversations read');
  online.openConversation({playerId:'c',nickname:'C'});assert.equal(online.directUnread,0);online.closeConversation();
  online.selectChat();assert.deepEqual(online.visibleChat.map(m=>m.id),['3']);
  online.selectChat({playerId:'b',nickname:'B'});online.toggleBlock('b');assert.equal(online.visibleChat.length,0);online.dispose();
});
test('a direct invitation creates one public room and sends to the selected player',async()=>{
  const f=fixture(),online=new Online(storage(),()=>{});let created=0;const sent:any[]=[];
  f.current.visibility='public';f.current.players=[{id:'a'}];
  f.bridge.ready=Promise.resolve({identity:{id:'a',name:'A'},capabilities:{multiplayer:true,leaderboards:true,chat:true,social:true}});
  Object.assign(f.bridge.services,{createRoom:async(input:any)=>{created++;assert.equal(input.visibility,'public');return f.current;},nightChat:async()=>({messages:[],cursor:'',reset:true,serverNow:0}),sendNightChat:async(input:any)=>{sent.push(input);return {messages:[],cursor:'',reset:true,serverNow:1};}});
  await online.connect(f.bridge);await online.invitePlayer({playerId:'b'});
  assert.equal(created,1);assert.equal(sent[0].recipientId,'b');assert.equal(sent[0].roomCode,f.current.code);assert.equal(online.panel,'room');assert.match(online.message,/邀请已发送/);online.dispose();
});
test('creating a direct invitation pins its recipient across attempted channel switches',async()=>{
  const f=fixture(),online=new Online(storage(),()=>{});let finish!:(value:any)=>void;const sent:any[]=[];
  f.current.visibility='public';f.current.players=[{id:'a'}];
  f.bridge.ready=Promise.resolve({identity:{id:'a',name:'A'},capabilities:{multiplayer:true,leaderboards:true,chat:true,social:true}});
  Object.assign(f.bridge.services,{createRoom:()=>new Promise(r=>{finish=r;}),nightChat:async()=>({messages:[],cursor:'',reset:true,serverNow:0}),sendNightChat:async(input:any)=>{sent.push(input);return {messages:[],cursor:'',reset:true,serverNow:1};}});
  await online.connect(f.bridge);const invite=online.invitePlayer({playerId:'b'});await new Promise(r=>setImmediate(r));
  online.selectChat({playerId:'c'});online.selectChat();online.chatDraft='建房时不能抢先发送';await online.sendChat();assert.equal(sent.length,0);finish(f.current);await invite;
  assert.equal(sent[0].recipientId,'b');online.dispose();
});
test('capability refresh after a rollback drops new read parameters but never publishes a private draft',async()=>{
  const f=fixture(),online=new Online(storage(),()=>{});let social=true;const requests:any[]=[];let sent=0;
  const metadata=()=>({identity:{id:'a',name:'A'},capabilities:{multiplayer:true,leaderboards:true,chat:true,presence:true,social}});
  f.bridge.ready=Promise.resolve(metadata());Object.assign(f.bridge,{refresh:async()=>metadata()});
  Object.assign(f.bridge.services,{nightChat:async(input:any)=>{requests.push(input);if(!social&&input.direct)throw Object.assign(Error(),{code:'INVALID_INPUT'});return {messages:[],cursor:'x',reset:true,serverNow:1};},sendNightChat:async()=>{sent++;},nightPresence:async()=>({onlineCount:1})});
  await online.connect(f.bridge);online.show('menu');online.selectChat({playerId:'b'});online.chatDraft='保密';online.playersCursor='old-page';social=false;
  await online.pump(performance.now()+10000);await new Promise(r=>setImmediate(r));
  assert.equal(online.socialAvailable,false);assert.equal(online.playersCursor,undefined);await online.sendChat();assert.equal(sent,0);
  online.selectChat();await online.pump(performance.now()+10000);await new Promise(r=>setImmediate(r));assert.equal(requests.at(-1).direct,false);online.dispose();
});
test('unknown private delivery can be abandoned after rollback without exposing it publicly',async()=>{
  const f=fixture(),online=new Online(storage(),()=>{}),sent:any[]=[];let social=true;
  const metadata=()=>({identity:{id:'a',name:'A'},capabilities:{multiplayer:true,leaderboards:true,chat:true,social}});
  f.bridge.ready=Promise.resolve(metadata());Object.assign(f.bridge,{refresh:async()=>metadata()});
  Object.assign(f.bridge.services,{nightChat:async()=>({messages:[],cursor:'x',reset:true,serverNow:1}),sendNightChat:async(input:any)=>{sent.push(input);if(sent.length===1)throw Error('lost response');return {messages:[],cursor:'x',reset:true,serverNow:2};}});
  await online.connect(f.bridge);online.selectChat({playerId:'b'});online.chatDraft='私密内容';await online.sendChat();social=false;await online.checkRelease();online.selectChat();
  assert.equal(online.chatPeer,undefined);assert.equal(online.chatDraft,'');assert.match(online.chatStatus,/暂未确认/);
  online.chatDraft='新的公开消息';await online.sendChat();assert.equal(sent[1].recipientId,undefined);assert.equal(sent[1].text,'新的公开消息');online.dispose();
});
test('global social notifications and conversation read cursors work during a battle without leaving it',async()=>{
  const f=fixture(),online=new Online(storage(),()=>{}),reads:any[]=[];
  const msg={id:'9',playerId:'b',nickname:'B',recipientId:'a',text:'战斗中收到',at:2};
  const result={friends:[{playerId:'b',nickname:'B',status:'offline'}],requests:[],conversations:[{playerId:'b',nickname:'B',lastMessage:msg,lastReadId:'0',unread:1}],serverNow:2};
  f.bridge.ready=Promise.resolve({identity:{id:'a',name:'A'},capabilities:{multiplayer:true,leaderboards:true,chat:true,social:true}});
  Object.assign(f.bridge.services,{nightSocial:async(input:any)=>{if(input){reads.push(input);return {...result,conversations:[{...result.conversations[0],unread:0}],serverNow:3};}return result;},nightChat:async()=>({messages:[msg],cursor:'x',reset:true,serverNow:2})});
  await online.connect(f.bridge);await online.open('friend');const original=online.room;online.activity='playing';
  await online.refreshSocial(1e9);assert.equal(online.notification?.id,'9');assert.equal(online.directUnread,1);assert.equal(online.canInvite(result.friends[0] as any),false);
  online.openConversation({playerId:'b',nickname:'B'});await new Promise(r=>setImmediate(r));
  assert(online.socialOpen);assert.equal(online.room,original);assert.equal(online.visibleChat[0].text,'战斗中收到');assert.deepEqual(reads,[{action:'read',playerId:'b',throughId:'9'}]);
  online.closeConversation();assert.equal(online.room,original);assert.equal(online.directUnread,0);online.dispose();
});
test('finished human rooms keep polling and rematch takes a fresh lease without reusing commands',async()=>{
  const f=fixture(),online=new Online(storage(),()=>{});await online.connect(f.bridge);await online.open('friend');
  f.current.status='finished';f.current.state={...viewDuel(createDuel(41)),finished:true};await online.pump(1e9);assert(online.room);assert(online.view?.finished);
  let polls=0;f.bridge.services.getRoom=async()=>{polls++;return {...f.current,rematch:'654321'};};await online.pump(1e9+4000);assert.equal(polls,1);assert.equal(online.room?.code,f.current.code);
  f.bridge.services.roomAction=async()=>({...f.current,rematch:'654321'});Object.assign(f.bridge.services,{connectRoom:async({code}:any)=>({...room(),code})});
  assert.equal(await online.rematch(),true);assert.equal(online.room?.code,'654321');assert.equal(online.view,undefined);assert.equal(online.panel,'room');online.dispose();
});
test('version metadata never blocks working interfaces; checks never interrupt play', async () => {
  const f = fixture(), online = new Online(storage(), () => {});
  let next: Release | undefined = release(), fail = false;
  Object.assign(f.bridge, { refresh: async () => { if(fail)throw Error('offline');return { ...await f.bridge.ready, release: next }; } });
  await online.connect(f.bridge); online.panel = 'room';
  await online.checkRelease(); assert.equal(online.panel, 'room'); assert(online.updateNotice);
  next = release({ admissions: { ranked: false, multiplayer: true }, canStartNewGames: false, update: 'required' });
  let starts=0;online.recorder!.start=async()=>{starts++;return null;};
  await online.checkRelease(); await online.startRanking({ mode: 'campaign', levelId: 'first', practice: false });
  assert.equal(starts,1,'actual start endpoint decides compatibility');
  next=release({admissions:{ranked:false,multiplayer:false},canStartNewGames:false,update:'required'});
  await online.checkRelease();await online.open('match');assert.equal(f.count(),1);
  fail = true; await online.checkRelease(); assert(online.releaseCheckFailed); assert.equal(online.release?.admissions.ranked, false);
  fail = false; next = undefined; await online.checkRelease(); assert.equal(online.release, undefined); assert(!online.updateNotice);
  online.dispose();
});
test('latest version metadata accepts older servers and rejects malformed display values', async () => {
  const f=fixture(),online=new Online(storage(),()=>{});
  let next=release({latestVersion:'1.0.17'});
  Object.assign(f.bridge,{refresh:async()=>({...await f.bridge.ready,release:next})});
  await online.connect(f.bridge);await online.checkRelease();assert.equal(online.release?.latestVersion,'1.0.17');
  for(const invalid of [123,{},'bad\nversion','1'.repeat(101)]){
    next={...next,latestVersion:invalid as string};await online.checkRelease();
    assert(online.releaseCheckFailed);assert.equal(online.release?.latestVersion,'1.0.17');
  }
  for(const latestVersion of [undefined,null]){next=release({latestVersion});await online.checkRelease();assert(!online.releaseCheckFailed);}
  online.dispose();
});

test('automatic record saving waits for commit without requiring a panel or ending a match', async () => {
  for (const outcome of ['saved', 'failed'] as const) {
    const f = fixture(); let finish!: () => void;
    const disk = { ...storage(), flush: () => new Promise<void>((resolve, reject) => { finish = () => outcome === 'failed' ? reject(Error('disk')) : resolve(); }) };
    const online = new Online(disk, () => {}); await online.connect(f.bridge); online.panel='room';online.room=room();
    online.rankStatus = 'pending-sync';
    const save = online.saveRecords();
    assert.equal(online.recordSaveStatus, 'saving');
    finish(); await save;
    assert.equal(online.recordSaveStatus, outcome);assert.equal(online.panel,'room');assert(online.room);
    assert.equal(online.rankStatus, 'pending-sync'); online.dispose();
  }
});
test('automatic saving never reports success for a failed journal or replaced identity', async () => {
  const f = fixture(), online = new Online(storage(), () => {});
  await online.connect(f.bridge);Object.assign(online.recorder!, { saveForReentry: async () => false });
  await online.saveRecords(); assert.equal(online.recordSaveStatus, 'failed');
  let finish!:(saved:boolean)=>void;Object.assign(online.recorder!,{saveForReentry:()=>new Promise<boolean>(resolve=>{finish=resolve;})});
  const saving=online.saveRecords();
  await online.connect({...f.bridge,ready:Promise.resolve({...(await f.bridge.ready),identity:{id:'b',name:'B'}})});
  finish(true);await saving;assert.equal(online.recordSaveStatus,'');
  online.dispose();
});

test('only an outdated client with a real failed request shows an update issue and auto-saves once',async()=>{
  const f=fixture(),online=new Online(storage(),()=>{});let notify!:(result:any)=>void,removed=0,saves=0;
  let metadata = release({update:'none',currentBuildId:'new'});
  Object.assign(f.bridge,{subscribeRequests:(listener:any)=>{notify=listener;return()=>{removed++;};},refresh:async()=>({...await f.bridge.ready,release:metadata})});
  await online.connect(f.bridge);Object.assign(online.recorder!,{saveForReentry:async()=>{saves++;return true;}});
  online.release=metadata;
  notify({path:'/games/night-overwatch/match',method:'POST',playerId:'a',error:'SERVICE_UNAVAILABLE'});
  await new Promise(r=>setImmediate(r));assert.equal(online.releaseIssue,undefined);assert.equal(saves,0);
  online.release=metadata=requiredRelease();
  assert.equal(online.releaseIssue,undefined);
  notify({path:'/games/night-overwatch/match',method:'POST',playerId:'a',error:'INVALID_PASSWORD'});
  assert.equal(saves,0,'ordinary business rejections do not suggest updating');
  const failed={path:'/games/night-overwatch/match',method:'POST',playerId:'a',error:'BUILD_DISABLED'};
  notify(failed);notify(failed);await new Promise(r=>setImmediate(r));
  assert.equal(saves,1);assert.equal(online.recordSaveStatus,'saved');assert.equal(online.releaseIssue?.error,'BUILD_DISABLED');
  online.show('version');assert.equal(online.recordSaveStatus,'saved','navigation does not discard saved evidence');
  notify({path:failed.path,method:'GET',playerId:'a'});assert(online.releaseIssue,'reading a resource does not clear a failed mutation');
  notify({path:failed.path,method:'POST',playerId:'a'});assert.equal(online.releaseIssue,undefined,'a successful retry clears the warning');
  notify({...failed,playerId:'another'});assert.equal(online.releaseIssue,undefined);
  online.dispose();assert.equal(removed,1);notify(failed);assert.equal(saves,1);
});

test('requests share an in-flight version check and successful retries invalidate delayed errors',async()=>{
  for(const recovered of [false,true]){
    const f=fixture(),online=new Online(storage(),()=>{});let notify!:(result:any)=>void,resolve!:(metadata:any)=>void,saves=0,checks=0;
    Object.assign(f.bridge,{subscribeRequests:(listener:any)=>{notify=listener;return()=>{};},refresh:()=>{checks++;return new Promise(r=>{resolve=r;});}});
    await online.connect(f.bridge);Object.assign(online.recorder!,{saveForReentry:async()=>{saves++;return true;}});
    const checking=online.checkRelease();await Promise.resolve();
    const failed={path:'/games/night-overwatch/rooms',method:'POST',playerId:'a',error:'BUILD_DISABLED'};
    notify(failed);
    if(recovered)notify({...failed,error:undefined});
    resolve({...await f.bridge.ready,release:requiredRelease()});await checking;await new Promise(r=>setImmediate(r));
    assert.equal(checks,1);assert.equal(saves,recovered?0:1);assert.equal(!!online.releaseIssue,!recovered);
    online.dispose();
  }
});

test('failed automatic saving retries even after a successful request clears the update issue',async t=>{
  const f=fixture(),online=new Online(storage(),()=>{});let notify!:(result:any)=>void,saves=0,now=10000;
  t.mock.method(Date,'now',()=>now);
  Object.assign(f.bridge,{subscribeRequests:(listener:any)=>{notify=listener;return()=>{};},refresh:async()=>({...await f.bridge.ready,release:requiredRelease()})});
  await online.connect(f.bridge);online.release=requiredRelease();
  Object.assign(online.recorder!,{saveForReentry:async()=>++saves>1});
  const failed={path:'/games/night-overwatch/rooms',method:'POST',playerId:'a',error:'BUILD_DISABLED'};
  notify(failed);await new Promise(r=>setImmediate(r));assert.equal(online.recordSaveStatus,'failed');
  notify({...failed,error:undefined});assert.equal(online.releaseIssue,undefined);
  now+=5001;await online.pump(100);await new Promise(r=>setImmediate(r));
  assert.equal(saves,2);assert.equal(online.recordSaveStatus,'saved');online.dispose();
});

test('creating a room reaches the service before consulting version metadata', async () => {
  for (const [failure, version, blocks] of [
    [undefined, release(), false],
    ['SERVICE_UNAVAILABLE', requiredRelease(), false],
    ['RULE_NEW_GAMES_DISABLED', requiredRelease(), false],
    ['INVALID_PASSWORD', requiredRelease(), false],
    ['BUILD_DISABLED', release(), false],
    ['BUILD_DISABLED', requiredRelease(), true],
  ] as const) {
    const f = fixture(), online = new Online(storage(), () => {}), calls: string[] = [];
    const ready = { ...await f.bridge.ready, capabilities: { multiplayer: false, leaderboards: true }, release: version };
    let notify!: (result: object) => void;
    Object.assign(f.bridge, {
      ready: Promise.resolve(ready),
      refresh: async () => { calls.push('version'); return ready; },
      subscribeRequests: (listener: typeof notify) => { notify = listener; return () => {}; },
    });
    f.bridge.services.createRoom = async () => {
      calls.push('create');
      notify({ path: '/games/night-overwatch/rooms', method: 'POST', playerId: 'a', error: failure });
      if (failure) throw Object.assign(Error(failure), { code: failure });
      return f.current;
    };
    await online.connect(f.bridge);
    online.show('create');
    await online.open('friend');
    await new Promise((resolve) => setImmediate(resolve));
    const checksVersion = failure && failure !== 'INVALID_PASSWORD';
    assert.deepEqual(calls, checksVersion ? ['create', 'version'] : ['create']);
    assert.equal(online.releaseIssue?.error, blocks ? failure : undefined);
    assert.equal(online.room?.code, failure ? undefined : f.current.code);
    if (failure === 'INVALID_PASSWORD') assert.match(online.message, /房间密码/);
    online.dispose();
  }
});

test('a new client refuses incompatible active room state before taking over the existing connection', async () => {
  const f = fixture(), online = new Online(storage(), () => {}); let connections = 0;
  Object.assign(f.current, { status: 'playing', version: 'older-duel', state: { incompatible: true } });
  Object.assign(f.bridge.services, { connectRoom: async () => { connections++; return f.current; } });
  await online.connect(f.bridge); await online.open('resume', f.current.code);
  assert.equal(connections, 0); assert.equal(online.room, undefined); assert.equal(online.simulation, undefined);
  assert(online.message); online.dispose();
});
test('server-confirmed ranked retirement displays a new-run notice instead of pending sync', async () => {
  const f=fixture(), online=new Online(storage(),()=>{}); let status:(value:string)=>void=()=>{};
  Object.assign(f.bridge,{createRecorder:(_version:string, options:any)=>{status=options.onStatus;return {start:async()=>null,record(){},finish:async()=>null,invalidate(){}};}});
  await online.connect(f.bridge); status('expired');
  assert.equal(online.rankStatus,'unavailable'); assert.equal(online.message,'本次行动已结束或超过 24 小时，请重新开始');
  status('recording'); assert.equal(online.rankStatus,'recording'); online.dispose();
});

test('recovered battle receipts refresh authoritative assets once and reject other owners and replaced bridges',async()=>{
 const f=fixture(),online=new Online(storage(),()=>{}),callbacks:Array<(status:string)=>void>=[];
 const recorders:any[]=[];let refreshes=0;
 Object.assign(f.bridge,{createRecorder:(_v:string,options:any)=>{callbacks.push(options.onStatus);const recorder={settlement:undefined,start:async()=>null,record(){},finish:async()=>null,invalidate(){}};recorders.push(recorder);return recorder;}});
 await online.connect(f.bridge);online.refreshAssets=async()=>{refreshes++;return online.assets!;};
 recorders[0].settlement={playerId:'a',runId:'run-a',result:{accepted:false,status:'credited',points:0,coins:40,xp:35}};
 callbacks[0]('local');assert.equal(online.battleReward?.coins,40);assert.equal(refreshes,1,'credited failure is an asset reward even when not ranked');
 callbacks[0]('local');assert.equal(refreshes,1);
 online.authenticatedId='b';online.battleReward=undefined;callbacks[0]('finished');assert.equal(online.battleReward,undefined);assert.equal(refreshes,1);
 await online.connect({...f.bridge});online.battleReward=undefined;callbacks[0]('finished');assert.equal(online.battleReward,undefined);assert.equal(refreshes,1,'replaced bridge cannot deliver a late receipt');
 online.dispose();recorders[1].settlement={playerId:online.authenticatedId,runId:'new',result:{status:'credited',coins:180,xp:120}};callbacks[1]('finished');assert.equal(refreshes,1);
});

test('cancelled metadata lookup cannot start a run after a retry',async()=>{
 const f=fixture(),online=new Online(storage(),()=>{});await online.connect(f.bridge);
 online.ranked=false;let deliver!:(value:any)=>void,starts=0;
 const fresh=await f.bridge.ready;
 Object.assign(f.bridge,{ready:new Promise(resolve=>{deliver=resolve;})});
 online.recorder!.start=async()=>{starts++;return null;};
 const pending=online.startRanking({mode:'campaign',levelId:'first'});
 online.cancelRanking();deliver(fresh);await pending;
 assert.equal(starts,0);assert.equal(online.ranked,false);online.dispose();
});

test('ranking retry refreshes metadata without waiting for an old stalled ready promise',async()=>{
 const f=fixture(),online=new Online(storage(),()=>{}),fresh=await f.bridge.ready;
 await online.connect(f.bridge);online.ranked=false;let starts=0;
 Object.assign(f.bridge,{ready:new Promise(()=>{}),refresh:async()=>fresh});
 online.recorder!.start=async()=>{starts++;return null;};
 await online.startRanking({mode:'campaign',levelId:'first'});
 assert.equal(starts,1);assert.equal(online.ranked,true);online.dispose();
});

test('late finish cannot replace a new run or new identity settlement',async()=>{
 for(const replacement of ['run','owner','training']){
  const f=fixture(),online=new Online(storage(),()=>{});let finish!:(value:any)=>void,refreshes=0;
  Object.assign(f.bridge,{createRecorder:()=>({start:async()=>({loadout:{}}),record(){},finish:()=>new Promise(resolve=>{finish=resolve;}),invalidate(){}})});
  await online.connect(f.bridge);online.refreshAssets=async()=>{refreshes++;return online.assets!;};
  await online.startRanking({mode:'campaign',levelId:'first',practice:false});const pending=online.finishRanking();
  if(replacement==='run')await online.startRanking({mode:'campaign',levelId:'second',practice:false});else if(replacement==='training')online.cancelRanking();else online.authenticatedId='b';
  finish({accepted:true,status:'credited',coins:180,xp:120});await pending;
  assert.equal(online.battleReward,undefined);assert.equal(refreshes,0);online.dispose();
 }
});

test('late asset reads and commands cannot roll back balances or tasks, but keep their own receipts', async () => {
  for (const source of ['read', 'command'] as const) {
    const f = fixture(), online = new Online(storage(), () => {});
    const old = assetFixture('a'), latest = structuredClone(old);
    latest.revision++; latest.coins += 180; latest.xp += 120; latest.tasks[1].progress++;
    old.lastReceipt = { requestId: 'old-opening', drops: [{ coins: 20 }] };
    let deliver!: (value: typeof old) => void;
    Object.assign(f.bridge.services, {
      nightAssets: async () => latest,
      nightAssetCommand: () => new Promise(resolve => { deliver = resolve; }),
    });
    await online.connect(f.bridge);
    if (source === 'read') Object.assign(f.bridge.services, { nightAssets: () => new Promise(resolve => { deliver = resolve; }) });
    const pending = source === 'read' ? online.refreshAssets() : online.assetCommand({ kind: 'checkin', requestId: 'old-opening' });
    await new Promise(resolve => setImmediate(resolve));
    Object.assign(f.bridge.services, { nightAssets: async () => latest });
    await online.refreshAssets();
    const acceptedAt = online.assetsReceivedAt, revision = online.revision;
    deliver(old);
    assert.equal(await pending, old, 'the caller still receives its exact transaction receipt');
    assert.equal(online.assets, latest);
    assert.equal(online.assetsReceivedAt, acceptedAt);
    assert.equal(online.revision, revision);
    const olderTime = { ...latest, serverNow: latest.serverNow - 1 };
    Object.assign(f.bridge.services, { nightAssets: async () => olderTime });
    await online.refreshAssets(); assert.equal(online.assets, latest);
    const newTime = { ...latest, serverNow: latest.serverNow + 1 };
    Object.assign(f.bridge.services, { nightAssetCommand: async () => newTime });
    await online.assetCommand({ kind: 'checkin', requestId: 'new' });
    assert.equal(online.assets, newTime, 'same revision may refresh time-sensitive eligibility');
    online.dispose();
  }
});

test('credited rewards retry failed asset refresh without another receipt, respecting lifecycle and owner', async () => {
  for (const stop of ['none', 'background', 'owner', 'dispose'] as const) {
    const f = fixture(), online = new Online(storage(), () => {});
    const latest = assetFixture('a'); let calls = 0, status!: (value: string) => void;
    const recorder = { settlement: undefined as any, start: async () => null, record() {}, finish: async () => null, invalidate() {} };
    Object.assign(f.bridge, { createRecorder: (_v: string, options: any) => { status = options.onStatus; return recorder; } });
    Object.assign(f.bridge.services, { nightAssets: async () => { if (++calls === 1) throw Error('offline'); return latest; } });
    await online.connect(f.bridge);
    recorder.settlement = { playerId: 'a', runId: 'credited', result: { status: 'credited', coins: 180, xp: 120 } };
    status('finished'); await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1); assert.equal(online.battleReward?.coins, 180);
    status('finished'); await online.pump(performance.now()); assert.equal(calls, 1, 'no duplicate or frame-by-frame retry');
    if (stop === 'background') online.setForeground(false);
    if (stop === 'owner') online.authenticatedId = 'b';
    if (stop === 'dispose') online.dispose();
    await online.pump(performance.now() + 6000); await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, stop === 'none' ? 2 : 1);
    if (stop === 'background') {
      online.setForeground(true); await online.pump(performance.now() + 6000);
      await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 2);
    }
    if (stop === 'none' || stop === 'background') assert.equal(online.assets, latest);
    await online.pump(performance.now() + 12000); assert.equal(calls, stop === 'none' || stop === 'background' ? 2 : 1);
    online.dispose();
  }
});

test('asset responses from a previous owner or disposed game do not replace visible assets', async () => {
  for (const stop of ['owner', 'dispose']) {
    const f = fixture(), online = new Online(storage(), () => {});
    let deliver!: (value: ReturnType<typeof assetFixture>) => void;
    Object.assign(f.bridge.services, { nightAssets: () => new Promise(resolve => { deliver = resolve; }) });
    await online.connect(f.bridge); const pending = online.refreshAssets();
    await new Promise(resolve => setImmediate(resolve));
    if (stop === 'owner') online.authenticatedId = 'b'; else online.dispose();
    deliver(assetFixture('a'));
    if (stop === 'owner') await assert.rejects(pending, { code: 'IDENTITY_CHANGED' }); else await pending;
    assert.equal(online.assets, undefined); online.dispose();
  }
});

test('rankings retain the complete top 100 and the current player outside that list', async () => {
  const f=fixture(), online=new Online(storage(),()=>{}), requests:string[]=[];
  const rows=Array.from({length:100},(_,i)=>({id:String(i),rank:i+1,score:100-i,secondary:1200}));
  const me={id:'a',rank:105,score:1,secondary:2000};
  f.bridge.services.leaderboard=async (input:any)=>{requests.push(input.boardId);return {top:rows,me};};
  await online.connect(f.bridge);
  for(const board of ['clears','level','points','win-rate'] as const){await online.loadRanking(0,board);assert.equal(online.ranking!.top.length,100);assert.equal(online.ranking!.me!.rank,105);}
  assert.deepEqual(requests,['clears','level-corridor-01','points','win-rate']);
});

test('persistent local pilots have UUIDs, distinct display suffixes and sanitized room links', () => {
  const store = storage(), a = new Online(store, () => {}), b = new Online(store, () => {}), c = new Online(storage(), () => {});
  assert.equal(playerId(a.identity), playerId(b.identity)); assert.notEqual(playerId(a.identity), playerId(c.identity));
  assert.match(playerLabel(a.identity), /#[A-F0-9]{8}$/);
  assert.equal(invitation('?room=A12BCD456789'), 'A12BCD456789'); assert.equal(invitation('?room=bad'), undefined);
  assert.equal(invitation('?room=A12BCD456789&room=A12BCD456789'), undefined);
  assert.equal(roomLink('https://user:password@example.com/game?dev=1&token=secret#account', 'A12BCD456789'), 'https://example.com/game?room=A12BCD456789&fullscreen=1');
});

test('late connection and ready failure cannot rejoin or alter a cancelled room', async () => {
  const f = fixture(); let resolve!: (value: any) => void;
  f.bridge.ready = new Promise(r => { resolve = r; });
  const online = new Online(storage(), () => {});
  const connecting = online.connect(f.bridge, '?room=A12BCD456789'); assert(online.recorder, 'ranked start is available before metadata'); online.leave();
  resolve({ identity: { id: 'a', name: '飞行员' }, capabilities: { multiplayer: true, leaderboards: true } });
  await connecting; assert.equal(online.room, undefined); assert.equal(online.panel, ''); assert(online.available);
  await online.open('friend');
  let reject!: (reason: Error) => void;
  f.bridge.services.roomAction = () => new Promise((_r, r) => { reject = r; });
  const ready = online.ready(); await new Promise(resolve => setImmediate(resolve)); const failReady = reject;
  online.leave(); failReady(Error('late')); await ready;
  assert.equal(online.message, ''); assert.equal(online.panel, '');
});

test('leaderboard refresh recovers metadata after an initial network failure', async () => {
  const f = fixture();
  const online = new Online(storage(), () => {});
  await online.connect({ ...f.bridge, ready: Promise.resolve(undefined), refresh: async () => f.bridge.ready });
  assert(!online.ranked); await online.loadRanking(); assert(online.ranked); assert(online.ranking);
});

test('nickname edits keep the same user and adopt the saved server profile', async () => {
  const f = fixture(), online = new Online(storage(), () => {}), calls: string[] = [];
  Object.assign(f.bridge.services, { updateProfile: async ({ nickname }: { nickname: string }) => {
    calls.push(nickname); return { id: 'a', name: '服务端昵称', nickname: '服务端昵称' };
  } });
  await online.connect(f.bridge);
  online.draftName = '  ＡＢ  飞行员  '; await online.saveName();
  assert.deepEqual(calls, ['AB 飞行员']); assert.equal(playerId(online.identity), 'a');
  assert.equal(online.draftName, '服务端昵称');
  for (const invalid of ['飞'.repeat(17), '<昵称>', 'a']) {
    online.draftName = invalid; await online.saveName(); assert.match(online.message, /2–16/);
  }
  assert.equal(calls.length, 1); assert.equal(online.identity.nickname, '服务端昵称');
  online.show('profile');assert.equal(online.draftName,'服务端昵称');
  online.draftName='没有确认的草稿';online.show('');online.show('profile');
  assert.equal(online.draftName,'服务端昵称','reopening discards the unsaved draft');
});
test('nickname confirmation closes only after success and retains the draft on failure', async () => {
  const f = fixture(), online = new Online(storage(), () => {});
  let resolve!: (value: any) => void;
  Object.assign(f.bridge.services, { updateProfile: () => new Promise(done => { resolve = done; }) });
  await online.connect(f.bridge); online.show('profile'); online.draftName = '新的昵称';
  const saving = online.saveName(); assert.equal(online.panel, 'profile'); assert(online.busy);
  resolve({ id: 'a', nickname: '新的昵称' }); await saving;
  assert.equal(online.panel, ''); assert(!online.busy);
  online.show('profile'); assert.equal(online.draftName, '新的昵称'); online.draftName = '保留草稿';
  Object.assign(f.bridge.services, { updateProfile: async () => { throw Error('offline'); } });
  await online.saveName(); assert.equal(online.panel, 'profile'); assert.equal(online.draftName, '保留草稿');
  assert.match(online.message, /保存失败/);
});

test('ranking recovery refreshes the server identity before recording and leaves failure explicitly local', async () => {
  const f=fixture(), online=new Online(storage(),()=>{});let starts=0;
  const metadata=await f.bridge.ready;
  f.bridge.ready=Promise.resolve(undefined as any);
  Object.assign(f.bridge,{refresh:async()=>metadata,createRecorder:(_v:string,{onStatus}:any)=>({start:async()=>{starts++;onStatus('recording');},record(){},finish:async()=>null,invalidate(){}})});
  await online.connect(undefined);assert.equal(online.recorder,undefined);
  await online.connect(f.bridge);assert.notEqual(playerId(online.identity),'a');
  await online.startRanking({mode:'level-corridor-01',levelId:'corridor-01',practice:false});
  assert.equal(playerId(online.identity),'a');assert.equal(starts,1);assert.equal(online.rankStatus,'recording');
  await online.connect(f.bridge);assert.equal(starts,1,'connecting the same bridge does not replace the recorder');
  online.ranked=false;Object.assign(f.bridge,{refresh:async()=>undefined});
  await online.startRanking({mode:'level-corridor-01',levelId:'corridor-01',practice:false});
  assert.equal(starts,1);assert.equal(online.rankStatus,'unavailable');
});

test('a departed room is hidden immediately and for two seconds despite stale list responses', async t => {
  let now=10000;t.mock.method(Date,'now',()=>now);
  const f=fixture(),online=new Online(storage(),()=>{});
  const rooms=[{...f.current,playerCount:1,canJoin:true,canSpectate:false},{...f.current,code:'654321',playerCount:1,canJoin:true,canSpectate:false}];
  Object.assign(f.bridge.services,{listRooms:async()=>({rooms})});await online.connect(f.bridge);
  await online.loadRooms();await online.open('match');online.leave();
  assert.deepEqual(online.rooms.map(r=>r.code),['654321']);
  await new Promise(resolve=>setImmediate(resolve));
  now+=1999;await online.loadRooms();assert.deepEqual(online.rooms.map(r=>r.code),['654321']);
  now++;await online.loadRooms();assert.equal(online.rooms.length,2);
});

test('paused and modal controls cannot fire, while release always reaches the duel', () => {
  const online = new Online(storage(), () => {}); online.startBot(0); online.enteringUntil = 0;
  const sim = Simulation.restore(online.view!.simulation); let modal = false;
  online.bind(sim, () => sim.paused || modal);
  sim.pause('settings', true); sim.setFire('space', true); sim.fire();
  assert.equal(online.bot!.simulation.fired, 0);
  sim.pause('settings', false); modal = true; sim.setFire('mouse', true); sim.fire();
  assert.equal(online.bot!.simulation.fired, 0);
  sim.clearInput(); modal = false; sim.setFire('space', true);
  assert.equal(online.bot!.pilots[0].held.length, 1);
  modal = true; sim.setFire('space', false); assert.deepEqual(online.bot!.pilots[0].held, []);
});
test('match waiting keeps its room and never triggers an automatic bot', async () => {
  const f = fixture(), online = new Online(storage(), () => {}); await online.connect(f.bridge); await online.open('match');
  await online.pump(100); assert.equal(f.count(), 1);
  f.current.status = 'playing'; f.current.state = viewDuel(createDuel(41, true));
  await online.pump(9000); assert(online.active); assert(online.view!.bot);
});
test('retry sends the exact same input sequence and leaving discards queued firing', async () => {
  const f = fixture(), online = new Online(storage(), () => {}); await online.connect(f.bridge); await online.open('match');
  f.current.status = 'playing'; f.current.state = viewDuel(createDuel(41)); await online.pump(1);
  online.control({ command: 'setFire', args: ['mouse', true] }); f.fail(); await online.pump(301);
  await online.pump(1400); assert.deepEqual(f.received.at(-1), f.received.at(-2));
  online.leave(); assert(!online.active); assert.equal(online.room, undefined);
});
test('cancelled room creation cannot reopen the room after its response arrives', async () => {
  const f = fixture(); let resolve!: (r: ReturnType<typeof room>) => void;
  f.bridge.services.createRoom = () => new Promise(r => { resolve = r; });
  const online = new Online(storage(), () => {}); await online.connect(f.bridge);
  const pending = online.open('friend'); await new Promise(r => setImmediate(r)); online.leave(); resolve(room()); await pending;
  assert.equal(online.room, undefined); assert.equal(online.panel, ''); assert.equal(f.received.at(-1).operation, 'leave');
});

test('an opponent leaving or server finishing resolves the terminal snapshot instead of retrying actions', async () => {
  for (const code of ['MATCH_CLOSED', 'PLAYER_FINISHED']) {
    const f = fixture(), online = new Online(storage(), () => {}); await online.connect(f.bridge); await online.open('match');
    f.current.status = 'playing'; f.current.state = viewDuel(createDuel(41)); await online.pump(1);
    f.bridge.services.roomAction = async () => { throw Object.assign(Error(code), { code }); };
    f.bridge.services.getRoom = async () => ({ ...f.current, status: 'abandoned' });
    await online.pump(301); assert.equal(online.room!.status, 'abandoned'); assert(online.view!.finished);
    assert.match(online.message, /房间已结束/); assert.equal(online.view!.simulation.phase, 'failure'); assert.equal(f.current.state.finished, false);
  }
});

test('a room abandoned before readiness stops polling and refuses another ready action', async () => {
  const f = fixture(), online = new Online(storage(), () => {}); await online.connect(f.bridge); await online.open('match');
  f.current.status = 'abandoned'; await online.pump(301); await online.pump(1301); await online.ready();
  assert.equal(f.count(), 1); assert.equal(f.received.length, 0); assert(!online.active);
});

test('lobby, nickname and history use the shared bridge and private room input is validated', async () => {
  const f = fixture(), calls: unknown[] = [];
  Object.assign(f.bridge.services, {
    listRooms: async () => ({ rooms: [{ code: '123456', status: 'waiting', mode: 'friend', players: [], playerCount: 1, canJoin: true, canSpectate: true }] }),
    updateProfile: async (input: { nickname: string }) => { calls.push(input); return { id: 'a', name: input.nickname }; },
    history: async ({ cursor }: { cursor?: string }) => ({ summary: { wins: 1, losses: 1, draws: 0, games: 2, winRate: .5 },
      matches: [{ id: cursor || 'first', code: '123456', opponent: { id: 'b', name: '好友' }, outcome: 'win', reason: 'disconnect', startedAt: 1, finishedAt: 30001, durationMs: 30000, points: 120 }],
      ...(cursor ? {} : { nextCursor: 'next' }) }),
  });
  f.bridge.services.createRoom = async (input: any) => { calls.push(input); return room(); };
  const online = new Online(storage(), () => {}); await online.connect(f.bridge);
  online.show('menu'); await online.loadRooms(); assert.equal(online.rooms[0].code, '123456');
  online.draftName = ' 新的昵称 '; await online.saveName(); assert.equal(online.identity.name, '新的昵称');
  online.draftName = 'a'; await online.saveName(); assert.match(online.message, /2–16/);
  await online.loadHistory(); await online.loadHistory(online.history!.nextCursor);
  assert.equal(online.history!.matches.length, 2); assert.equal(online.history!.summary.games, 2);
  online.privateRoom = true; online.draftPassword = 'abc'; await online.open('friend');
  assert(!online.room); assert.match(online.message, /4–64/);
  online.draftPassword = 'friend-123'; await online.open('friend');
  assert.deepEqual(calls.at(-1), { mode: 'friend', visibility: 'private', password: 'friend-123' });
});

test('10Hz transport is serial, allows short reconnection and stops combat when an authoritative receipt arrives', async () => {
  const f = fixture(), online = new Online(storage(), () => {});
  await online.connect(f.bridge); await online.open('match');
  f.current.status = 'playing'; f.current.players = [{ id: 'a' }, { id: 'b', name: '队友' }] as any;
  f.current.state = viewDuel(createDuel(41)); await online.pump(0);
  let resolve!: (value: any) => void, requests = 0;
  f.bridge.services.roomAction = async () => { requests++; return new Promise(r => { resolve = r; }); };
  const pending = online.pump(100); await online.pump(200); await online.pump(300);
  assert.equal(requests, 1); resolve(f.current); await pending;
  f.bridge.services.roomAction = async () => f.current;
  Object.assign(f.current.players[1], { disconnected: true, reconnectUntil: Date.now() + 30000 });
  await online.pump(400); assert.equal(online.offlineNotice, '队友 已下线'); assert(!online.view!.finished);
  Object.assign(f.current.players[0], { disconnected: true, takenOver: true });
  Object.assign(f.current, { settlement: { points: 40, outcome: 'loss', totalPoints: 40 } });
  f.bridge.services.roomAction = async () => { throw Object.assign(Error('expired'), { code: 'PLAYER_DISCONNECTED' }); };
  await online.pump(500);
  assert.equal(online.room!.status, 'playing'); assert(online.view!.finished);
  assert.equal(online.view!.simulation.phase, 'failure');
  assert.equal(f.current.state.finished, false, 'shared authoritative snapshot is unchanged');
});

test('receipt wins, losses and quit reasons override stale combat snapshots for either player',async()=>{
  for(const you of [0,1])for(const outcome of ['win','loss']){
    const f=fixture(),online=new Online(storage(),()=>{});await online.connect(f.bridge);await online.open('match');
    Object.assign(f.current,{you,status:'finished',players:[{id:'a'},{id:'b'}],state:viewDuel(createDuel(41),you),settlement:{points:outcome==='win'?120:40,outcome,reason:'forfeit',durationMs:12000,coins:outcome==='win'?0:60,xp:outcome==='win'?0:70,status:'credited'}});
    await online.pump(0);
    assert.equal(online.view!.finished,true);assert.equal(online.view!.winner,outcome==='win'?you:1-you);assert.equal(online.view!.simulation.phase,outcome==='win'?'success':'failure');assert.equal(online.view!.simulation.time,12);
    assert.match(online.message,outcome==='win'?/对手已退出/:/你已退出/);assert.equal(online.resumeCode,'');
    assert.equal(f.current.state!.finished,false,'client leaves the received snapshot immutable');online.dispose();
  }
});

test('voluntary exit preserves durable recovery, then reconnect restores the same round without a reward',async()=>{
  const f=fixture(),disk=storage(),online=new Online(disk,()=>{});let flushes=0;
  Object.assign(disk,{flush:async()=>{flushes++;}});
  let current:any={...room(),id:'round-1',status:'playing',serverNow:1000,players:[{id:'a'},{id:'b'}],state:viewDuel(createDuel(41))};
  f.bridge.services.match=f.bridge.services.getRoom=async()=>structuredClone(current);
  f.bridge.services.roomAction=async(input:any)=>{f.received.push(input);current.players[0]={id:'a',left:true,disconnected:true,reconnectUntil:31000};return structuredClone(current);};
  let connects=0;Object.assign(f.bridge.services,{connectRoom:async()=>{connects++;current.players[0]={id:'a'};return structuredClone(current);}});
  await online.connect(f.bridge);await online.open('match');online.lobbyTab='friends';online.leave();await new Promise(r=>setImmediate(r));
  assert.equal(online.lobbyTab,'rooms');
  assert.equal(online.resumeCode,current.code);assert(!online.active);assert.equal(online.room,undefined);assert.equal(online.battleReward,undefined);assert(flushes>0);
  assert.equal(JSON.parse(disk.getItem('night-overwatch-room-v1')!).code,current.code);
  online.leave();assert.equal(online.resumeCode,current.code,'navigating home must preserve the recovery entry');online.dispose();
  const restored=new Online(disk,()=>{});await restored.connect(f.bridge);
  assert.equal(connects,1);assert.equal(restored.room?.id,'round-1');assert(restored.active);assert(!restored.room!.players[0].left);restored.dispose();
});

test('waiting, finished, spectator and taken-over departures clear recovery storage',async()=>{
  for(const mode of ['waiting','finished','spectator','takenOver']){
    const f=fixture(),disk=storage(),online=new Online(disk,()=>{});
    const current:any={...room(),id:'round-1',status:mode==='waiting'?'waiting':mode==='finished'?'finished':'playing',you:mode==='spectator'?-1:0,spectator:mode==='spectator',players:[{id:'a',takenOver:mode==='takenOver'},{id:'b'}],state:mode==='waiting'?null:{...viewDuel(createDuel(41)),finished:mode==='finished'}};
    f.bridge.services.match=f.bridge.services.roomAction=async()=>current;
    await online.connect(f.bridge);await online.open('match');online.leave();await new Promise(r=>setImmediate(r));
    assert.equal(online.resumeCode,'',mode);assert.equal(disk.getItem('night-overwatch-room-v1'),'null',mode);online.dispose();
  }
});

test('a new-round lease claim failure retries serially and never replays old attacks',async()=>{
  const f=fixture(),online=new Online(storage(),()=>{}),calls:any[]=[];
  let current:any={...room(),id:'round-1',status:'playing',seq:9,players:[{id:'a'},{id:'b'}],state:viewDuel(createDuel(41))};
  f.bridge.services.match=f.bridge.services.getRoom=async()=>structuredClone(current);
  let claims=0;f.bridge.services.roomAction=async(input:any)=>{calls.push(structuredClone(input));if(input.operation==='rematch'){if(++claims===1)throw Error('network');return structuredClone(current);}throw Object.assign(Error(),{code:'STALE_LEASE'});};
  Object.assign(f.bridge.services,{connectRoom:async()=>{throw Error('automatic connect could steal another page');}});
  await online.connect(f.bridge);await online.open('match');online.control({command:'fire',args:[]});
  current={...current,id:'round-2',status:'waiting',seq:0,state:null};
  await online.pump(1e9);assert(online.connectionLost);assert.equal(online.room?.id,'round-1');
  await online.pump(1e9+2000);assert.equal(claims,2);assert(!online.active);assert(!online.connectionLost);
  current={...current,status:'playing',state:viewDuel(createDuel(43))};await online.pump(1e9+4000);
  f.bridge.services.roomAction=async(input:any)=>{calls.push(structuredClone(input));return structuredClone(current);};
  await online.pump(1e9+5000);assert.equal(calls.at(-1).body.seq,1);assert.deepEqual(calls.at(-1).body.action.commands,[]);online.dispose();
});

test('old-round STALE_LEASE never reconnects or reopens the recovery entry',async()=>{
  const f=fixture(),online=new Online(storage(),()=>{});let connects=0;
  const current:any={...room(),id:'round-1',status:'playing',state:viewDuel(createDuel(41))};
  f.bridge.services.match=f.bridge.services.getRoom=async()=>structuredClone(current);
  f.bridge.services.roomAction=async()=>{throw Object.assign(Error(),{code:'STALE_LEASE'});};
  Object.assign(f.bridge.services,{connectRoom:async()=>{connects++;return current;}});
  await online.connect(f.bridge);await online.open('match');await online.pump(1e9);await online.pump(1e9+2000);
  assert.equal(connects,0);assert.match(online.message,/另一页面/);online.leave();assert.equal(online.resumeCode,'');online.dispose();
});

test('a final receipt corrects an already-finished simulated view through the controller callback',async()=>{
  const f=fixture(),states:any[]=[],online=new Online(storage(),state=>states.push(state));
  let current:any={...room(),id:'round-1',status:'finished',state:{...viewDuel(createDuel(41)),finished:true,winner:0}};
  f.bridge.services.match=f.bridge.services.getRoom=async()=>structuredClone(current);
  await online.connect(f.bridge);await online.open('match');
  current={...current,settlement:{points:0,outcome:'loss',reason:'elimination',durationMs:123000,coins:0,xp:0,status:'credited',rewardReason:'disconnected'}};
  await online.pump(1e9);assert.equal(states.at(-1).winner,0,'bot winning this seat must not become a human victory');assert.equal(states.at(-1).simulation.phase,'failure');assert.equal(states.at(-1).simulation.time,123);online.dispose();
});

test('destroying the client cancels late room callbacks without issuing a voluntary forfeit or starting bots',async()=>{
  for(const kind of ['bot','match'] as const){
    const f=fixture();let changed=0,finish!:(r:any)=>void;const online=new Online(storage(),()=>{changed++;});await online.connect(f.bridge);
    f.bridge.services.createRoom=f.bridge.services.match=()=>new Promise(r=>{finish=r;});
    const opening=online.open(kind);await new Promise(r=>setImmediate(r));online.dispose();finish({...f.current,mode:kind});await opening;await online.pump(100);
    assert.equal(changed,0);assert.equal(f.received.length,0);assert.equal(online.room,undefined);
  }
  const f=fixture();let changed=0,finish!:(r:any)=>void;const online=new Online(storage(),()=>{changed++;});await online.connect(f.bridge);await online.open('match');
  f.bridge.services.getRoom=()=>new Promise(r=>{finish=r;});const poll=online.pump(0);await new Promise(r=>setImmediate(r));online.dispose();finish({...f.current,status:'playing',state:viewDuel(createDuel(41))});await poll;assert.equal(changed,0);assert.equal(f.received.length,0);
});

test('newer connection ownership stops retries and entry animation rejects firing', async () => {
  const f = fixture(), online = new Online(storage(), () => {}); await online.connect(f.bridge); await online.open('match');
  f.current.status = 'playing'; f.current.state = viewDuel(createDuel(41)); await online.pump(0);
  let calls = 0;
  f.bridge.services.roomAction = async () => { calls++; throw Object.assign(Error('new page'), { code: 'STALE_LEASE' }); };
  await online.pump(100); await online.pump(3000); assert.equal(calls, 1); assert(online.connectionLost);
  online.leave();
  const bot = new Online(storage(), () => {}); bot.startBot(performance.now());
  assert(bot.entering); bot.control({ command: 'setFire', args: ['mouse', true] });
  assert.deepEqual(bot.bot!.pilots[0].held, []); bot.enteringUntil = 0;
  bot.control({ command: 'setFire', args: ['mouse', true] }); assert.equal(bot.bot!.pilots[0].held.length, 1);
});

test('ready and cancel-ready wait for the preceding poll and send explicit idempotent states', async () => {
  const f=fixture(), online=new Online(storage(),()=>{}); f.current.players=[{id:'a',ready:false}] as any;
  await online.connect(f.bridge); await online.open('match');
  let resolve!: (value:any)=>void;
  f.bridge.services.getRoom=()=>new Promise(r=>{resolve=r;});
  f.bridge.services.roomAction=async input=>{f.received.push(input); (f.current.players[0] as any).ready=input.body.ready; return f.current;};
  const polling=online.pump(0); await new Promise(r=>setImmediate(r));
  const ready=online.ready(); await online.ready(); assert.equal(f.received.length,0);
  resolve(structuredClone(f.current)); await polling; await ready;
  assert.equal(f.received.length,1); assert.equal(online.room!.players[0].ready,true);
  await online.ready(); assert.equal(online.room!.players[0].ready,false);
  assert.deepEqual(f.received.map(r=>r.body),[{ready:true},{ready:false}]);
  assert.equal(online.room!.code,f.current.code); assert.equal(online.message,'');
});

test('leaving a network bot completes on the server before immediate human matchmaking', async () => {
  const f=fixture(), online=new Online(storage(),()=>{}), calls:string[]=[];
  f.current.status='playing'; f.current.mode='bot'; f.current.state=viewDuel(createDuel(41,true));
  await online.connect(f.bridge); await online.open('bot');
  let release!:()=>void;
  f.bridge.services.roomAction=async ()=>{calls.push('leave'); await new Promise<void>(r=>{release=r;}); return f.current;};
  f.bridge.services.match=async ()=>{calls.push('match'); return {...room(),code:'654321'};};
  online.leave(); const matching=online.open('match'); await new Promise(r=>setImmediate(r));
  assert.deepEqual(calls,['leave']); assert.equal(online.resumeCode,f.current.code);
  release(); await matching;
  assert.deepEqual(calls,['leave','match']); assert.equal(online.room!.mode,'match');
  assert.equal(online.room!.code,'654321'); assert.equal(online.bot,undefined); assert.equal(online.view,undefined);
});

test('expired room cleanup cannot block future matches, while failed cleanup is retried before entry', async () => {
  for (const code of ['INVITATION_NOT_FOUND','ROOM_NOT_FOUND','NOT_A_MEMBER','STALE_LEASE']) {
    const f=fixture(), online=new Online(storage(),()=>{}); await online.connect(f.bridge); await online.open('match');
    f.bridge.services.roomAction=async()=>{throw Object.assign(Error(code),{code});};
    online.leave(); await online.open('match'); assert(online.room,code); assert.equal(f.count(),2);
  }
  const f=fixture(), online=new Online(storage(),()=>{}); await online.connect(f.bridge); await online.open('match');
  let calls=0, release!:()=>void;
  f.bridge.services.roomAction=async()=>{if(++calls===1)throw Error('offline'); await new Promise<void>(r=>{release=r;}); return f.current;};
  online.leave(); await new Promise(r=>setImmediate(r));
  const pending=online.open('match'); await new Promise(r=>setImmediate(r)); online.leave(); release(); await pending;
  assert.equal(f.count(),1,'cancelled entry must not send a match after cleanup resolves'); assert(!online.room);
});

test('queued readiness is discarded when the preceding poll ends the room',async()=>{
  const f=fixture(),online=new Online(storage(),()=>{}); await online.connect(f.bridge); await online.open('match');
  let resolve!:(r:any)=>void; f.bridge.services.getRoom=()=>new Promise(r=>{resolve=r;});
  const poll=online.pump(0); await new Promise(r=>setImmediate(r)); const ready=online.ready();
  resolve({...f.current,status:'abandoned'}); await poll; await ready;
  assert.deepEqual(f.received,[]); assert.equal(online.room!.status,'abandoned');
});

test('changing ranking tabs ignores an older response',async()=>{
  const f=fixture(),online=new Online(storage(),()=>{}), pending:((r:any)=>void)[]=[];
  await online.connect(f.bridge); online.show('ranking');
  f.bridge.services.leaderboard=()=>new Promise(r=>pending.push(r));
  const first=online.loadRanking(); online.board='points'; const second=online.loadRanking();
  pending[1]({top:[{rank:1,score:900}],me:null}); await second;
  pending[0]({top:[{rank:1,score:6}],me:null}); await first;
  assert.equal(online.ranking!.top[0].score,900);
});

test('chat replaces bounded snapshots, preserves draft and ignores polling after leave',async()=>{
 const f=fixture(),online=new Online(storage(),()=>{});let resolve:any,calls=0;
 (f.bridge.ready as any)=Promise.resolve({identity:{id:'a',name:'A'},capabilities:{multiplayer:true,leaderboards:true,chat:true}});
 (f.bridge.services as any).nightChat=async()=>{calls++;return new Promise(r=>resolve=r);};
 await online.connect(f.bridge);online.show('menu');online.chatDraft='正在输入';void online.pump(1);await new Promise(r=>setImmediate(r));
 online.show('profile');resolve({messages:[{id:'1',playerId:'b',nickname:'B',text:'hello',at:1}],cursor:'1',reset:true,serverNow:1});await new Promise(r=>setImmediate(r));
 assert.deepEqual(online.chatMessages,[]);assert.equal(online.chatDraft,'正在输入');await online.pump(20);assert.equal(calls,1);
 online.setForeground(false);online.show('menu');await online.pump(30);assert.equal(calls,1);online.dispose();
});
test('successful retry of an unknown chat result preserves a newer draft and block controls key by player identity',async()=>{
 const f=fixture(),online=new Online(storage(),()=>{}),sent:any[]=[];
 (f.bridge.services as any).nightChat=async()=>({messages:[],cursor:'',reset:true,serverNow:1});
 (f.bridge.ready as any)=Promise.resolve({identity:{id:'a',name:'A'},capabilities:{multiplayer:true,leaderboards:true,chat:true}});
 (f.bridge.services as any).sendNightChat=async(intent:any)=>{sent.push({...intent});if(sent.length===1)throw Error('lost');return {messages:[{id:'1',playerId:'a',nickname:'A',text:intent.text,at:1}],cursor:'1',reset:true,serverNow:1};};
 await online.connect(f.bridge);online.chatDraft='原消息';await online.sendChat();online.chatDraft='后来输入';await online.sendChat();assert.equal(sent[0].requestId,sent[1].requestId);assert.equal(sent[1].text,'原消息');assert.equal(online.chatDraft,'后来输入');
 online.chatMessages.push({id:'2',playerId:'b',nickname:'A',text:'同名玩家',at:2});online.toggleBlock('b');assert.equal(online.visibleChat.length,1);online.toggleBlock('b');assert.equal(online.visibleChat.length,2);
});
test('a late poll cannot replace a newer acknowledged chat message or move the cursor backwards',async()=>{
 const f=fixture(),online=new Online(storage(),()=>{});let finishPoll:any;
 (f.bridge.ready as any)=Promise.resolve({identity:{id:'a',name:'A'},capabilities:{multiplayer:true,leaderboards:true,chat:true}});
 (f.bridge.services as any).nightChat=()=>new Promise(r=>finishPoll=r);
 (f.bridge.services as any).sendNightChat=async()=>({messages:[{id:'2',playerId:'a',nickname:'A',text:'新消息',at:200}],cursor:'2',reset:true,serverNow:200});
 await online.connect(f.bridge);online.show('menu');void online.pump(1);await new Promise(r=>setImmediate(r));online.chatDraft='新消息';await online.sendChat();finishPoll({messages:[],cursor:'1',reset:true,serverNow:100});await new Promise(r=>setImmediate(r));assert.equal(online.chatMessages[0].id,'2');assert.equal((online as any).chatCursor,'2');assert.equal(online.chatDraft,'');online.dispose();
});

test('level rankings cycle all current and historical rule versions with matching query parameters',async()=>{
 const f=fixture(),online=new Online(storage(),()=>{}),requests:any[]=[];f.bridge.services.leaderboard=async(input:any)=>{requests.push(input);return{top:[],me:null};};await online.connect(f.bridge);await online.loadRanking(0,'level');for(let i=0;i<5;i++)await online.cycleRankingVersion();assert.deepEqual(requests.map(r=>r.ruleVersion),['night-campaign-v4','night-campaign-v3','night-campaign-v2','night-growth-v1','night-records-v1','night-campaign-v4']);assert(requests.every(r=>r.boardId==='level-corridor-01'));
});

test('a minimized waiting room keeps the lobby list live and stops listing once the match starts', async () => {
  const f = fixture(); let lists = 0;
  Object.assign(f.bridge.services, { listRooms: async () => { lists++; return { rooms: [] }; } });
  const online = new Online(storage(), () => {}); await online.connect(f.bridge);
  await online.open('friend'); assert.equal(online.panel, 'room');
  online.show('menu'); await online.pump(1e9); await new Promise(resolve => setImmediate(resolve));
  assert.equal(lists, 1); assert.equal(online.room?.code, f.current.code, 'listing keeps the room');
  online.back(); assert.equal(online.panel, 'room', 'back from the lobby restores the room');
  f.current.status = 'playing'; await online.loadRooms(); assert.equal(lists, 1);
});


test('closing a conversation restores public chat and ignores a late history response',async()=>{
  const f=fixture(),online=new Online(storage(),()=>{});let finish!:(value:any)=>void;
  f.bridge.ready=Promise.resolve({identity:{id:'a',name:'A'},capabilities:{multiplayer:true,leaderboards:true,chat:true,social:true}});
  Object.assign(f.bridge.services,{nightChat:()=>new Promise(r=>{finish=r;}),nightSocial:async()=>({friends:[],requests:[],conversations:[],serverNow:1})});
  await online.connect(f.bridge);online.show('menu');online.openConversation({playerId:'b',nickname:'B'});
  online.closeConversation();finish({messages:[{id:'9',playerId:'b',recipientId:'a',nickname:'B',text:'late',at:1}],cursor:'',reset:true,serverNow:1});await new Promise(r=>setImmediate(r));
  assert(!online.socialOpen);assert(!online.chatInbox);assert.equal(online.chatPeer,undefined);assert.deepEqual(online.conversation,[]);assert.equal(online.panel,'menu');online.dispose();
});

test('removing a confirmed friend requires confirmation and preserves history',async()=>{
  const f=fixture(),online=new Online(storage(),()=>{}),calls:any[]=[];
  f.bridge.ready=Promise.resolve({identity:{id:'a',name:'A'},capabilities:{multiplayer:true,leaderboards:true,chat:true,social:true}});
  const peer={playerId:'b',nickname:'B'},message={id:'9',playerId:'b',recipientId:'a',nickname:'B',text:'keep',at:1};
  Object.assign(f.bridge.services,{nightSocial:async(input:any)=>{calls.push(input);return {friends:[],requests:[],conversations:[{...peer,unread:0,lastReadId:'9',lastMessage:message}],serverNow:2};}});
  await online.connect(f.bridge);online.social.friends=[peer];await online.friendAction('remove','b');assert.equal(calls.length,0);assert.equal(online.friendRemoval,peer);
  online.friendRemoval=undefined;assert.equal(online.social.friends.length,1);
  await online.friendAction('remove','b');await online.friendAction('remove','b',true);
  assert.deepEqual(calls,[{action:'remove',playerId:'b'}]);assert.equal(online.friendRemoval,undefined);assert.equal(online.social.friends.length,0);assert.equal(online.social.conversations[0].lastMessage.text,'keep');online.dispose();
});


test('invitation failures are visible and uncertain delivery cannot silently change recipients', async () => {
  const f=fixture(),online=new Online(storage(),()=>{});let created=0;const sent:any[]=[];
  f.bridge.ready=Promise.resolve({identity:{id:'a'},capabilities:{multiplayer:true,leaderboards:true,chat:true,social:true}});
  Object.assign(f.bridge.services,{
    createRoom:async()=>{created++;throw Object.assign(Error(),{code:'RULE_VERSION_CHANGED'});},
    nightChat:async()=>({messages:[],cursor:'',reset:true,serverNow:0}),
    sendNightChat:async(input:any)=>{sent.push({...input});throw Error('lost response');},
  });
  await online.connect(f.bridge);online.showPlayers();
  await online.invitePlayer({playerId:'b',status:'available'});
  assert.equal(created,1);assert.match(online.chatStatus,/版本不匹配/);assert.equal(online.panel,'players');assert.equal(sent.length,0);assert.equal(online.chatPeer,undefined);assert(!online.chatInbox);
  online.openConversation({playerId:'b'});online.chatDraft='private';await online.sendChat();
  online.closeConversation();assert(online.chatRetryPending);assert.equal(playerId(online.chatPeer!),'b');
  await online.invitePlayer({playerId:'c',status:'available'});
  assert.match(online.chatStatus,/待确认/);assert.equal(created,1);assert.equal(sent.length,1);
  online.openConversation({playerId:'b'});await online.sendChat();assert.deepEqual(sent[1],sent[0]);online.dispose();
});

test('room rejection distinguishes existing games and version rollout from invalid room numbers',async()=>{
  for(const [code,pattern] of [['ACTIVE_ROOM',/未结束/],['BUILD_DISABLED',/版本不匹配/],['RULE_NEW_GAMES_DISABLED',/暂未开放/],['ROOM_NOT_FOUND',/不存在/]] as const){
    const f=fixture(),online=new Online(storage(),()=>{});f.bridge.services.createRoom=async()=>{throw Object.assign(Error(),{code});};
    await online.connect(f.bridge);await online.open('friend');assert.match(online.message,pattern);assert(!online.busy);online.dispose();
  }
});


test('closing an in-flight private send restores public chat only after a definite result',async()=>{
 for(const code of ['', 'RECIPIENT_BUSY', 'network']){
  const f=fixture(),online=new Online(storage(),()=>{});let finish!:(value:any)=>void,fail!:(value:any)=>void;
  f.bridge.ready=Promise.resolve({identity:{id:'a'},capabilities:{multiplayer:true,chat:true,social:true}});
  Object.assign(f.bridge.services,{nightChat:async()=>({messages:[],cursor:'',reset:true,serverNow:0}),sendNightChat:()=>new Promise((resolve,reject)=>{finish=resolve;fail=reject;})});
  await online.connect(f.bridge);online.show('chat');online.openConversation({playerId:'b'});online.chatDraft='private';const pending=online.sendChat();online.closeConversation();
  assert.equal(playerId(online.chatPeer!),'b');
  if(code)fail(Object.assign(Error(),{code}));else finish({messages:[],cursor:'',reset:true,serverNow:1});await pending;
  assert.equal(online.chatRetryPending,code==='network');assert.equal(online.chatInbox,code==='network');
  assert.equal(online.chatPeer?.playerId,code==='network'?'b':undefined);assert.equal(online.chatDraft,code==='network'?'private':'');
  if(code==='RECIPIENT_BUSY')assert.match(online.chatStatus,/暂不能邀请/);online.dispose();
 }
});

test('rejected invite from the lobby keeps its visible error and releases the private recipient',async()=>{
 const f=fixture(),online=new Online(storage(),()=>{});f.current.visibility='public';f.current.players=[{id:'a'}];
 f.bridge.ready=Promise.resolve({identity:{id:'a'},capabilities:{multiplayer:true,chat:true,social:true}});
 Object.assign(f.bridge.services,{nightChat:async()=>({messages:[],cursor:'',reset:true,serverNow:0}),sendNightChat:async()=>{throw Object.assign(Error(),{code:'CHAT_RATE_LIMIT'});}});
 await online.connect(f.bridge);await online.open('friend');online.show('menu');online.lobbyTab='players';await online.invitePlayer({playerId:'b'});
 assert.match(online.chatStatus,/发言间隔/);assert.equal(online.chatPeer,undefined);assert(!online.chatInbox);assert.equal(online.panel,'menu');online.dispose();
});

test('failed conversation history can recover even after a realtime message arrives',async()=>{
 const f=fixture(),online=new Online(storage(),()=>{});let fail=true;
 f.bridge.ready=Promise.resolve({identity:{id:'a'},capabilities:{multiplayer:true,chat:true,social:true}});
 Object.assign(f.bridge.services,{nightChat:async()=>{if(fail)throw Error('offline');return {messages:[],cursor:'',reset:true,serverNow:1};}});
 await online.connect(f.bridge);online.openConversation({playerId:'b'});await new Promise(r=>setImmediate(r));assert(online.conversationFailed);
 online.conversation.push({id:'1',playerId:'b',recipientId:'a',nickname:'B',text:'live',at:1});assert(online.conversationFailed);
 fail=false;await online.loadConversation();assert(!online.conversationFailed);online.dispose();
});
