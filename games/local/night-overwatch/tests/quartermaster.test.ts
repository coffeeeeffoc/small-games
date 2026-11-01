import test from 'node:test';
import assert from 'node:assert/strict';
import { Quartermaster } from '../assets/scripts/Quartermaster.ts';
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
  await q.watch(async()=> 'dismissed');assert.deepEqual(calls.map(c=>c.kind),['ad-start']);assert.equal(q.pendingOrder?.completed,1);assert.equal(q.viewing,false);
});
test('failed local intent persistence prevents any purchase; removing accepted journal may fail safely',async()=>{
  const {q,online,storage,calls}=setup();storage.setItem=()=>{throw Error('full');};
  await q.execute({kind:'buy',item:'power-match'});assert.equal(calls.length,0);
  storage.setItem=()=>{};storage.removeItem=()=>{throw Error('denied');};await q.execute({kind:'checkin'});
  assert.equal(q.pending,undefined);assert.match(q.message[0],/成功/);assert.equal(online.assets.playerId,'A');
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
