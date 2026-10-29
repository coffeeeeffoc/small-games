import test from 'node:test';
import assert from 'node:assert/strict';
import { Online, playerId, playerLabel, invitation, roomLink } from '../assets/scripts/Online.ts';
import { createDuel, viewDuel } from '../assets/scripts/core/Duel.ts';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
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

test('10Hz transport is serial, preserves opponent disconnect play and ends only the taken-over player view', async () => {
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
  assert.deepEqual(calls,['leave']); assert.equal(online.resumeCode,'');
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
