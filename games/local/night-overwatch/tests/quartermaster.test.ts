import test from 'node:test';
import assert from 'node:assert/strict';
import { Quartermaster, wheelLandingAngle } from '../assets/scripts/Quartermaster.ts';
import { assetFixture } from './progression-fixture.ts';

function setup(){
  const values=new Map<string,string>(),calls:any[]=[];
  const storage={getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
  const online:any={authenticatedId:'A',assets:assetFixture('A'),refreshAssets:async()=>online.assets,assetCommand:async(command:any)=>{calls.push({...command});return online.assets;}};
  return {q:new Quartermaster(online,storage),online,storage,values,calls};
}
test('asset retry retains one request ID across reload; confirmed rejection releases it',async()=>{
  const {q,online,storage,values,calls}=setup();
  online.assetCommand=async(command:any)=>{calls.push({...command});throw Error('response lost');};
  await q.execute({kind:'buy',item:'power-match',quantity:1});const id=q.pending!.requestId;
  const restored=new Quartermaster(online,storage);restored.syncIdentity();assert.equal(restored.pending?.requestId,id);
  await restored.execute();assert.equal(calls[1].requestId,id);
  online.assetCommand=async()=>{throw Object.assign(Error('invalid'),{code:'INVALID_INPUT'});};
  await restored.execute();assert.equal(restored.pending,undefined);assert.equal(values.size,0);
});
test('late asset response cannot clear another account intent or replace its UI state',async()=>{
  const {q,online}=setup();let reply:any;online.assetCommand=()=>new Promise(resolve=>{reply=resolve;});
  const request=q.execute({kind:'buy',item:'power-match'});const original=q.pending;
  online.authenticatedId='B';online.assets=assetFixture('B');q.syncIdentity();
  reply(assetFixture('A'));await request;assert.equal(q.pending,undefined);assert.equal(q.assets?.playerId,'B');
  online.authenticatedId='A';q.syncIdentity();assert.equal(q.pending?.requestId,original?.requestId);
});
test('video cancellation preserves confirmed progress and never calls completion',async()=>{
  const {q,online,calls}=setup();q.quantity=5;
  online.assetCommand=async(command:any)=>{calls.push(command);return {...online.assets,lastReceipt:{attemptId:'attempt'}};};
  await q.watch(async()=> 'dismissed');assert.deepEqual(calls.map(c=>c.kind),['ad-start','ad-cancel']);assert.equal(q.pendingOrder?.completed,1);assert.equal(q.viewing,false);
});
test('failed local intent persistence prevents any purchase; removing accepted journal may fail safely',async()=>{
  const {q,online,storage,calls}=setup();storage.setItem=()=>{throw Error('full');};
  await q.execute({kind:'buy',item:'power-match'});assert.equal(calls.length,0);
  storage.setItem=()=>{};storage.removeItem=()=>{throw Error('denied');};await q.execute({kind:'checkin'});
  assert.equal(q.pending,undefined);assert.deepEqual(q.message,['','']);assert.equal(online.assets.playerId,'A');
});
test('IndexedDB intent commit failure, double tap and account change cannot send a purchase',async()=>{
  for(const fault of ['abort','account','double']){
    const {q,online,storage,calls}=setup();let resolve!:()=>void,reject!:(error:Error)=>void;
    const commit=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});
    Object.assign(storage,{flush:()=>commit});
    const request=q.execute({kind:'buy',item:'power-match'});
    assert.equal(q.busy,true);assert.equal(calls.length,0);
    await q.execute({kind:'buy',item:'power-match'});assert.equal(calls.length,0);
    if(fault==='abort')reject(Error('transaction aborted'));
    else{if(fault==='account')online.authenticatedId='B';resolve();}
    await request;assert.equal(q.busy,false);assert.equal(calls.length,fault==='double'?1:0);
    if(fault==='abort'){assert(q.pending?.requestId);assert.match(q.message[0],/尚未发送/);}
  }
});
test('developer journal retries one ID, clears definite failures, and cannot replay in normal packages',async(t)=>{
  const scope=globalThis as any;
  t.after(()=>{delete scope.__SMALL_GAMES_BUILD__;});
  scope.__SMALL_GAMES_BUILD__={type:'development'};
  const {q,online,storage,values,calls}=setup();
  online.assetCommand=async(command:any)=>{calls.push({...command});throw Error('lost');};
  await q.execute({kind:'dev-adjust',coinsDelta:100});
  const id=q.pending!.requestId;
  await q.execute();assert.equal(calls[1].requestId,id);
  online.assetCommand=async()=>{throw Object.assign(Error('disabled'),{code:'DEV_TOOLS_DISABLED'});};
  await q.execute();assert.equal(q.pending,undefined);assert.equal(values.size,0);assert.match(q.message[0],/未启用/);
  online.assetCommand=async()=>{throw Object.assign(Error('balance'),{code:'INVALID_DEV_BALANCE'});};
  await q.execute({kind:'dev-adjust',coinsDelta:-1e9});assert.equal(q.pending,undefined);
  storage.setItem('night-overwatch-asset-intent:A',JSON.stringify({kind:'dev-adjust',requestId:id,xpDelta:200}));
  scope.__SMALL_GAMES_BUILD__={type:'production'};
  const restored=new Quartermaster(online,storage);restored.syncIdentity();assert.equal(restored.pending,undefined);
  const previous=calls.length;await restored.execute();await restored.execute({kind:'dev-adjust',coinsDelta:100});assert.equal(calls.length,previous);
  storage.setItem('night-overwatch-asset-intent:A',JSON.stringify({kind:'buy',requestId:id,item:'power-match'}));
  const normal=new Quartermaster(online,storage);normal.syncIdentity();assert.equal(normal.pending?.kind,'buy');
});


test('loadout edits select compatible slots, keep empty slot positions and save only on confirmation',async()=>{
  const {q,online,calls}=setup();q.syncIdentity();online.assets.loadouts.solo={mods:[],weapon:null,skill:null};
  q.selectSlot('mod:1');q.equip('burst-match');assert.equal(q.modSlots[0],undefined);assert.equal(q.modSlots[1],'burst-match');
  q.selectSlot('mod:0');q.equip('twin-match');q.unequip();assert.equal(q.modSlots[0],null);assert.equal(q.modSlots[1],'burst-match');
  q.equip('laser-match');assert.equal(q.loadout.weapon,null);assert.equal(calls.length,0);assert.deepEqual(online.assets.loadouts.solo.mods,[]);
  q.selectSlot('mod:0');q.equip('power-permanent');q.mode='duel';q.equip('twin-match');q.mode='solo';assert.deepEqual(q.loadout.mods,['power-permanent','burst-match']);
  q.page='loadout';q.requestLeave('');assert.equal(q.page,'loadout');assert.equal(q.leaveTo,'');
  online.assetCommand=async(command:any)=>{calls.push(command);online.assets.loadouts[command.mode]=command.loadout;return online.assets;};
  await q.save();assert.equal(calls.length,1);assert.equal(calls[0].kind,'loadout');assert.deepEqual(online.assets.loadouts.solo.mods,['power-permanent','burst-match']);
  assert.deepEqual(online.assets.loadouts.duel.mods,[]);q.discard();assert.deepEqual(q.drafts,{});
});

test('available equipment excludes inactive time vouchers and already-equipped effects stay identifiable',()=>{
  const {q,online}=setup();q.syncIdentity();
  assert(!q.availableGear.some(p=>p.term==='24h'));assert(q.availableGear.some(p=>p.id==='power-permanent'));
  assert(q.equipped('burst'));q.equip('burst-permanent');assert.deepEqual(q.loadout.mods,['burst-match','twin-match']);
  online.assets.active.rate=online.assets.serverNow+1000;assert(q.availableGear.some(p=>p.id==='rate-24h'));
});

test('moving mods swaps or fills slots without purchases; confirmed retry normalizes empty positions',async()=>{
  const {q,online,calls}=setup();q.syncIdentity();
  q.moveMod('mod:0','mod:1');assert.deepEqual(q.loadout.mods,['twin-match','burst-match']);assert.equal(q.slot,'mod:1');assert(q.dirty);
  q.moveMod('mod:1','weapon');assert.deepEqual(q.loadout.mods,['twin-match','burst-match']);assert.equal(calls.length,0);
  q.mode='duel';q.equip('power-permanent','mod:0');q.moveMod('mod:0','mod:1');assert.equal(q.modSlots[0],null);assert.equal(q.modSlots[1],'power-permanent');assert.deepEqual(q.dirtyModes,['solo','duel']);
  online.assetCommand=async(command:any)=>{calls.push(command);throw Error('lost');};await q.save();const id=q.pending!.requestId;
  q.moveMod('mod:1','mod:0');assert.equal(q.modSlots[1],'power-permanent');
  q.page='loadout';q.requestLeave('');assert.equal(q.leaveTo,'');assert.equal(q.page,'loadout');q.discard();assert(q.dirty);assert.equal(q.pending!.requestId,id);
  q.leavePending();assert.equal(q.page,'');assert.equal(calls.length,1);assert(q.dirty);assert.equal(q.pending!.requestId,id);q.page='loadout';
  online.assetCommand=async(command:any)=>{calls.push(command);online.assets.loadouts[command.mode]=command.loadout;return online.assets;};await q.execute();
  assert.equal(calls[1].requestId,id);assert.deepEqual(q.modSlots,['power-permanent']);assert.equal(q.slot,'mod:0');assert(!q.dirty);assert.deepEqual(q.dirtyModes,['solo']);
});

test('warehouse loadout entry selects the matching equipment or next empty compatible slot',()=>{
  const {q}=setup();q.syncIdentity();q.item='emp-match';q.selectInventorySlot();assert.equal(q.slot,'skill');
  q.item='twin-match';q.selectInventorySlot();assert.equal(q.slot,'mod:1');
  q.unequip();q.item='power-permanent';q.selectInventorySlot();assert.equal(q.slot,'mod:1');
  q.item='laser-match';q.selectInventorySlot();assert.equal(q.slot,'weapon');
});

test('multi-crate opening retries the same failed transaction and never reopens the completed group',async()=>{
  const {q,online,calls}=setup();q.syncIdentity();q.gift={packs:{'pack:general:0':2,'pack:gold:3':1},drops:[],opened:false};let lose=true;
  online.assetCommand=async(command:any)=>{calls.push({...command});if(command.item==='pack:gold:3'&&lose){lose=false;throw Error('lost reply');}return {...online.assets,lastReceipt:{kind:'open',requestId:command.requestId,drops:command.item==='pack:general:0'?[{coins:10},{item:'power-match'}]:[{item:'burst-match'}]}};};
  await q.openGifts();assert.deepEqual(q.gift?.packs,{'pack:gold:3':1});assert.equal(q.gift?.drops.length,2);const pending=q.pending!.requestId;
  await q.openGifts();assert.deepEqual(calls.map(c=>c.item),['pack:general:0','pack:gold:3','pack:gold:3']);assert.equal(calls[2].requestId,pending);assert.equal(q.gift?.opened,true);assert.equal(q.gift?.drops.length,3);
});

test('gift receipts survive idempotent responses without relying on inventory deltas',async()=>{
  const {q,online}=setup();online.assetCommand=async()=>({...online.assets,lastReceipt:{kind:'buy-packs',packs:{'pack:gold:2':3}}});
  await q.execute({kind:'buy-packs',quantity:3,pool:'gold'});assert.deepEqual(q.gift?.packs,{'pack:gold:2':3});
  online.assetCommand=async()=>({...online.assets,lastReceipt:{kind:'checkin',reward:{packs:1,coins:100}}});
  await q.execute({kind:'checkin'});assert.deepEqual(q.gift?.packs,{'pack:general:0':1});
});

test('switching accounts before opening a gift never spends the new account inventory',async()=>{
  const {q,online,calls}=setup();q.syncIdentity();
  q.gift={packs:{'pack:general:0':1},drops:[],opened:false};
  online.authenticatedId='B';online.assets=assetFixture('B');
  await q.openGifts();assert.equal(calls.length,0);assert.equal(q.gift,undefined);
});

test('identity changes discard draft intentions and cannot resurrect an old account gift',async()=>{
  const {q,online,calls}=setup();q.syncIdentity();q.selectSlot('weapon');q.equip('laser-match');
  online.authenticatedId='B';online.assets=assetFixture('B');await q.save();assert.equal(calls[0].loadout.weapon,'drone-match');
  q.gift={packs:{'pack:general:0':1},drops:[],opened:false};let reply:any;online.assetCommand=()=>new Promise(resolve=>{reply=resolve;});
  const opening=q.openGifts();online.authenticatedId='C';online.assets=assetFixture('C');q.syncIdentity();reply(assetFixture('B'));await opening;assert.equal(q.gift,undefined);assert.deepEqual(q.drafts,{});
});

test('navigation restores source filters, selected item and scroll after nested pages',async()=>{
 const {q}=setup();q.syncIdentity();q.show('warehouse');await Promise.resolve();q.item='power-match';q.scrolls['qm:warehouse']=208;q.show('receipts');await Promise.resolve();q.back();assert.equal(q.page,'warehouse');assert.equal(q.item,'power-match');assert.equal(q.scrolls['qm:warehouse'],208);q.back();assert.equal(q.page,'');
});
test('all six wheel results land their sector centre at the fixed top pointer',()=>{
 for(const start of [0,1830,2010,3960])for(let i=0;i<6;i++){const clockwiseCentre=30+i*60,end=wheelLandingAngle(i,start);assert.equal(Math.abs((clockwiseCentre-end)%360),0);assert(end>=start+1800);}
});
test('retrying a lost ad-start receipt resumes that attempt and cancellation releases it',async()=>{
 const {q,online,calls}=setup();let lost=true,plays=0;
 online.assetCommand=async(command:any)=>{calls.push({...command});if(command.kind==='ad-start'&&lost){lost=false;throw Error('lost');}return {...online.assets,lastReceipt:{attemptId:'accepted-attempt'}};};
 await q.watch(async()=>{plays++;return 'completed';});const id=q.pending!.requestId;assert.equal(plays,0);
 await q.execute();await q.watch(async()=>{plays++;return 'dismissed';});assert.equal(plays,1);assert.equal(calls[1].requestId,id);assert.deepEqual(calls.map(c=>c.kind),['ad-start','ad-start','ad-cancel']);assert.equal(calls[2].attemptId,'accepted-attempt');assert.equal(q.pending,undefined);
});
test('daily wheel rejection releases the journal and cancelled back does not hijack the next destination',async()=>{
 const {q,online}=setup();online.assetCommand=async()=>{throw Object.assign(Error('limit'),{code:'DAILY_WHEEL_LIMIT'});};await q.execute({kind:'ad-order',purpose:'wheel',quantity:1});assert.equal(q.pending,undefined);assert.match(q.message[0],/上限/);
 q.show('warehouse');await Promise.resolve();q.show('loadout');await Promise.resolve();q.equip('power-permanent');q.back();q.cancelLeave();q.requestLeave('shop');q.discard();assert.equal(q.page,'shop');
});
test('video attempts recover from refreshed snapshots, expire by server time and release on confirmed completion failure',async()=>{
 const {q,online,calls}=setup();online.assets.videoOrders[0].attempt={id:'restored-attempt',startedAt:online.assets.serverNow-1000};
 online.assetCommand=async(command:any)=>{calls.push({...command});if(command.kind==='ad-complete')throw Object.assign(Error('limit'),{code:'DAILY_VIDEO_LIMIT'});return {...online.assets,lastReceipt:{attemptId:'new-attempt'}};};
 await q.watch(async()=> 'completed');assert.deepEqual(calls.map(c=>c.kind),['ad-complete','ad-cancel']);assert.equal(calls[0].attemptId,'restored-attempt');assert.match(q.message[0],/额度/);
 calls.length=0;online.assets.videoOrders[0].attempt.startedAt=online.assets.serverNow-31*60000;
 await q.watch(async()=> 'dismissed');assert.deepEqual(calls.map(c=>c.kind),['ad-start','ad-cancel']);assert.equal(calls[1].attemptId,'new-attempt');
 calls.length=0;await q.execute({kind:'ad-start',orderId:'video-order'});online.assets.serverNow+=31*60000;await q.watch(async()=> 'dismissed');assert.deepEqual(calls.map(c=>c.kind),['ad-start','ad-start','ad-cancel'],'an expired in-memory attempt must start a fresh viewing');
});
test('unknown completion is never cancelled, while dispose journals release of an accepted idle attempt',async()=>{
 const {q,online,calls,storage}=setup();online.assets.videoOrders[0].attempt={id:'active',startedAt:online.assets.serverNow};online.assetCommand=async(command:any)=>{calls.push({...command});throw Error('lost');};
 await q.watch(async()=> 'completed');assert.equal(q.pending?.kind,'ad-complete');assert.equal(calls.length,1);q.dispose();assert.equal(calls.length,1);
 const next=setup();next.online.assetCommand=async(command:any)=>{next.calls.push({...command});return {...next.online.assets,lastReceipt:{attemptId:'ready'}};};await next.q.execute({kind:'ad-start',orderId:'video-order'});next.q.dispose();assert.equal(next.calls.at(-1).kind,'ad-cancel');await Promise.resolve();const restored=new Quartermaster(next.online,next.storage);restored.syncIdentity();assert.equal(restored.pending?.kind,'ad-cancel');
});
