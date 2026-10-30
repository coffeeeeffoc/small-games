import assert from 'node:assert/strict';
import test from 'node:test';
import { Quartermaster,type WalletPort,type WalletSnapshot } from '../assets/scripts/Quartermaster.ts';
const memory=()=>{const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};};
const turn=()=>new Promise(r=>setImmediate(r));
const wallet=(id:string):WalletSnapshot=>({playerId:id,revision:0,coins:400,inventory:{coolant:0},owned:{power:1,velocity:1,duration:1},day:'2026-10-31',signedToday:false,drawnToday:false});
test('local first/repeat, single daily rewards, purchases, loadouts and consumables stay local to this pilot',async()=>{
  const storage=memory();let completed=false;const q=new Quartermaster(storage,()=>{},async()=>completed);
  q.bind('one',false,undefined,true);assert.equal(q.localClear(q.owner,'01'),300);assert.equal(q.localClear(q.owner,'01'),80);
  await q.transact('checkin');await q.transact('checkin');assert.equal(q.view.coins,440);
  await q.transact('watch');assert(!q.view.adClaimed);completed=true;await q.transact('watch');const balance=q.view.coins;assert(balance>=480);
  await q.transact('watch');assert.equal(q.view.coins,balance);
  q.set({selected:'spread'});await q.transact('buy');assert.equal(q.view.coins,balance-300);assert.equal(q.view.owned.spread,1);
  q.toggle();assert.equal(q.view.kits.solo.length,3);q.set({selected:'power'});q.toggle();q.set({selected:'spread'});q.toggle();
  assert(q.view.kits.solo.some(x=>x.id==='spread'));assert(q.view.kits.duel.some(x=>x.id==='power'));
  q.set({selected:'coolant'});await q.transact('buy');assert.equal(q.view.coolant,1);
  assert(!q.useCoolant(q.owner,()=>false));assert.equal(q.view.coolant,1);
  assert(q.useCoolant(q.owner,()=>true));assert.equal(q.view.coolant,0);
  q.bind('two',false,undefined,true);assert.equal(q.view.coins,0);assert.equal(q.view.owned.spread,undefined);
  q.bind('one',false,undefined,true);assert.equal(q.view.coins,balance-380);assert(!q.view.kits.solo.some(x=>x.id==='power'));
  q.bind('one',true,undefined,false);assert.equal(q.view.coins,0);assert.equal(q.localClear(q.owner,'01'),undefined);assert(!q.view.available);
});
test('unknown purchase outcome reuses durable request after restart and never spends twice',async()=>{
  const storage=memory(),w=wallet('one');let fail=true;const ids:string[]=[];
  const port:WalletPort={nightWallet:async()=>structuredClone(w),nightWalletAction:async c=>{
    assert.equal(c.item,'coolant');assert.equal(c.playerId,'one');if(!ids.includes(c.requestId)){w.coins-=80;w.inventory.coolant++;w.revision++;}
    ids.push(c.requestId);if(fail){fail=false;throw Error('lost response');}return structuredClone(w);
  }};
  const first=new Quartermaster(storage,()=>{},async()=>false);first.bind('one',true,port,false);await turn();
  first.set({selected:'coolant'});await first.transact('buy');assert.equal(first.view.coins,400);
  const next=new Quartermaster(storage,()=>{},async()=>false);next.bind('one',true,port,false);await turn();
  assert.deepEqual(ids,[ids[0],ids[0]]);assert.equal(next.view.coolant,1);assert.equal(next.view.coins,320);
});
test('stale wallet reads and advertising callbacks cannot leak or pay another account',async()=>{
  const storage=memory();let finish!:(v:boolean)=>void,stale!:(v:WalletSnapshot)=>void;let claims=0;
  const one=wallet('one'),two=wallet('two');two.coins=10;
  const a:WalletPort={nightWallet:async()=>one,nightWalletAction:async c=>{if(c.kind==='ad-claim')claims++;return {...one,revision:2,challenge:'ticket'};}};
  const b:WalletPort={nightWallet:async()=>two,nightWalletAction:async()=>two};
  const q=new Quartermaster(storage,()=>{},()=>new Promise(r=>{finish=r;}));q.bind('one',true,a,true);await turn();
  a.nightWallet=()=>new Promise(r=>{stale=r;});const old=q.refresh();const watching=q.transact('watch');await turn();
  stale({...one,coins:777,revision:1});await old;assert.equal(q.view.coins,400);
  q.bind('two',true,b,true);await turn();finish(true);await watching;assert.equal(claims,0);assert.equal(q.view.coins,10);
  b.nightWallet=async()=>one;await q.refresh();assert.equal(q.view.coins,0);assert(!q.view.available);
});
