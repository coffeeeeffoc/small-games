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
