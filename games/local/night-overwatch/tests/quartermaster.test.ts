import assert from 'node:assert/strict';
import test from 'node:test';
import { Quartermaster,type WalletPort,type WalletSnapshot } from '../assets/scripts/Quartermaster.ts';
import { STARTER_OWNED } from '../assets/scripts/core/Armory.ts';
const memory=()=>{const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};};
const turn=()=>new Promise(r=>setImmediate(r));
const wallet=(id:string):WalletSnapshot=>({playerId:id,revision:0,coins:400,inventory:{coolant:0},owned:{...STARTER_OWNED},trials:{},signedDays:[],day:'2026-10-31',signedToday:false});
test('unlimited completed draws award selectable single-battle stock, never coins or permanent weapons',async(t)=>{
  t.mock.method(Math,'random',()=>15.5/18);
  const storage=memory();let completed=false;const q=new Quartermaster(storage,()=>{},async()=>completed);
  q.bind('one',false,undefined,true);assert.equal(q.localClear(q.owner,'corridor-01'),300);assert.equal(q.localClear(q.owner,'corridor-01'),80);
  await q.transact('checkin');await q.transact('checkin');assert.equal(q.view.coins,440);assert.equal(q.view.signedDays.length,1);
  await q.transact('watch');assert.deepEqual(q.view.trials,{});completed=true;
  await q.transact('watch');await q.transact('watch');assert.equal(q.view.trials['emp:1'],2);assert.equal(q.view.coins,440);
  assert.equal(q.view.owned.emp,undefined);assert.deepEqual(q.view.extraWeapons,[]);
  q.selectTrial('emp',1);q.toggleWeapon('emp');const kit=q.view.kits.solo;
  assert(kit.some(x=>x.id==='emp'&&x.trial));assert.equal(kit.length,4);
  assert(q.beginLocalBattle(q.owner,'battle-a','solo',kit));assert.equal(q.view.trials['emp:1'],1);
  assert(q.beginLocalBattle(q.owner,'battle-a','solo',kit));assert.equal(q.view.trials['emp:1'],1);
  q.set({selected:'spread'});await q.transact('buy');assert.equal(q.view.coins,140);
  assert(q.view.kits.solo.some(x=>x.id==='spread'));assert(q.view.kits.duel.some(x=>x.id==='spread'));
  q.bind('two',false,undefined,true);assert.equal(q.view.coins,0);assert.deepEqual(q.view.trials,{});
  q.bind('one',false,undefined,true);assert.equal(q.view.coins,140);assert.equal(q.view.trials['emp:1'],1);
  q.bind('one',true,undefined,false);assert.equal(q.localClear(q.owner,'corridor-01'),undefined);assert(!q.view.available);
});
test('unknown purchase outcome reuses its durable request without charging twice',async()=>{
  const storage=memory(),w=wallet('one');let fail=true;const ids:string[]=[];
  const port:WalletPort={nightWallet:async()=>structuredClone(w),nightWalletAction:async c=>{
    assert.equal(c.item,'heavyVelocity');assert.equal(c.playerId,'one');if(!ids.includes(c.requestId)){w.coins-=300;w.owned.heavyVelocity=1;w.revision++;}
    ids.push(c.requestId);if(fail){fail=false;throw Error('lost response');}return structuredClone(w);
  }};
  const first=new Quartermaster(storage,()=>{},async()=>false);first.bind('one',true,port,false);await turn();
  first.set({selected:'heavyVelocity'});await first.transact('buy');assert.equal(first.view.coins,400);
  const next=new Quartermaster(storage,()=>{},async()=>false);next.bind('one',true,port,false);await turn();
  assert.deepEqual(ids,[ids[0],ids[0]]);assert.equal(next.view.owned.heavyVelocity,1);assert.equal(next.view.coins,100);
});
test('stale reads and advertising callbacks cannot leak or pay another account',async()=>{
  const storage=memory();let finish!:(v:boolean)=>void,stale!:(v:WalletSnapshot)=>void;let claims=0;
  const one=wallet('one'),two=wallet('two');two.coins=10;
  const a:WalletPort={nightWallet:async()=>one,nightWalletAction:async c=>{if(c.kind==='lottery-claim')claims++;return {...one,revision:2,challenge:'ticket'};}};
  const b:WalletPort={nightWallet:async()=>two,nightWalletAction:async()=>two};
  const q=new Quartermaster(storage,()=>{},()=>new Promise(r=>{finish=r;}));q.bind('one',true,a,true);await turn();
  a.nightWallet=()=>new Promise(r=>{stale=r;});const old=q.refresh();const watching=q.transact('watch');await turn();
  stale({...one,coins:777,revision:1});await old;assert.equal(q.view.coins,400);
  q.bind('two',true,b,true);await turn();finish(true);await watching;assert.equal(claims,0);assert.equal(q.view.coins,10);
  b.nightWallet=async()=>one;await q.refresh();assert.equal(q.view.coins,0);assert(!q.view.available);
});
test('old ownership and sign-in dates migrate without losing coins or blocking new orders',async()=>{
  const storage=memory(),key='night-armory-v1:local:one:wallet';
  storage.setItem(key,JSON.stringify({coins:900,owned:{power:2,velocity:1,duration:2,emp:1},coolant:1,signed:'2026-10-28',clears:['01']}));
  storage.setItem('night-armory-v1:local:one:kits',JSON.stringify({solo:[{id:'emp',tier:1}]}));
  const q=new Quartermaster(storage,()=>{},async()=>false);q.bind('one',false,undefined,false);
  assert.equal(q.view.coins,900);assert.equal(q.view.owned.hePower,2);assert.equal(q.view.owned.heavyPower,2);
  assert.equal(q.view.owned.heavyVelocity,1);assert.equal(q.view.owned.duration,2);
  assert.deepEqual(q.view.signedDays,['2026-10-28']);assert.deepEqual(q.view.extraWeapons,['emp']);
  assert.equal(q.view.kits.solo.length,7);assert(!q.view.kits.duel.some(s=>s.id==='coolant'));
  assert(!q.useCoolant(q.owner,()=>false));assert.equal(q.view.coolant,1);assert(q.useCoolant(q.owner,()=>true));assert.equal(q.view.coolant,0);
  const w=wallet('cloud');
  storage.setItem('night-armory-v1:account:cloud:pending',JSON.stringify({kind:'buy',item:'coolant',requestId:'old',playerId:'cloud'}));
  let commands=0;
  q.bind('cloud',true,{nightWallet:async()=>w,nightWalletAction:async()=>{commands++;return w;}},false);await turn();
  assert.equal(commands,0);assert.equal(storage.getItem('night-armory-v1:account:cloud:pending'),'null');
});

test('later missions pay increasing first and repeat gold; practice is unpaid',()=>{
 const q=new Quartermaster(memory(),()=>{},async()=>false);q.bind('one',false,undefined,false);
 assert.equal(q.localClear(q.owner,'corridor-01'),300);assert.equal(q.localClear(q.owner,'operation-060'),890);
 assert.equal(q.localClear(q.owner,'operation-060'),316);assert.equal(q.localClear(q.owner,'operation-120'),1490);
 assert.equal(q.localClear(q.owner,'training-60'),0);
});

test('a newly drawn replacement is not auto-equipped after the previous trial is spent',async(t)=>{
 t.mock.method(Math,'random',()=>15.5/18);
 const store=memory(),q=new Quartermaster(store,()=>{},async()=>true);q.bind('one',false,undefined,true);
 await q.transact('watch');q.selectTrial('emp',1);q.toggleWeapon('emp');assert(q.beginLocalBattle(q.owner,'one'));
 assert.equal(q.view.trialChoices.emp,undefined);await q.transact('watch');assert.equal(q.view.trials['emp:1'],1);assert.equal(q.view.trialChoices.emp,undefined);
 const reopened=new Quartermaster(store,()=>{},async()=>true);reopened.bind('one',false,undefined,true);assert.equal(reopened.view.trialChoices.emp,undefined);
});


test('historical first-clear top-up preserves other earnings and purchases and runs once',()=>{
 const store=memory(),key='night-armory-v1:local:old:wallet';
 store.setItem(key,JSON.stringify({version:2,coins:240,owned:{...STARTER_OWNED,hePower:2},coolant:1,signed:'',signedDays:[],trials:{'emp:2':1},clears:['corridor-01','ambush-02'],battles:[]}));
 store.setItem('night-overwatch-progress-v1',JSON.stringify({version:1,cleared:['corridor-01','ambush-02','patrol-03']}));
 const q=new Quartermaster(store,()=>{},async()=>false);q.bind('old',false,undefined,false);
 assert.equal(q.view.coins,570);assert.equal(q.view.owned.hePower,2);assert.equal(q.view.coolant,1);assert.equal(q.view.trials['emp:2'],1);
 const again=new Quartermaster(store,()=>{},async()=>false);again.bind('old',false,undefined,false);assert.equal(again.view.coins,570);
 assert.equal(again.localClear(again.owner,'patrol-03'),88);assert.equal(again.view.coins,658);
});


test('a failed migration save carries its credit and marker into the next successful save',()=>{
 const memoryStore=memory(),key='night-armory-v1:local:old:wallet';
 memoryStore.setItem(key,JSON.stringify({version:2,coins:240,owned:{...STARTER_OWNED},coolant:0,signed:'',signedDays:[],trials:{},clears:['ambush-02'],battles:[]}));
 let fail=true;const store={getItem:memoryStore.getItem,setItem:(k:string,v:string)=>{if(fail)throw Error('storage full');memoryStore.setItem(k,v);}};
 const q=new Quartermaster(store,()=>{},async()=>false);q.bind('old',false,undefined,false);assert.equal(q.view.coins,250);
 fail=false;assert.equal(q.localClear(q.owner,'patrol-03'),320);
 const again=new Quartermaster(store,()=>{},async()=>false);again.bind('old',false,undefined,false);assert.equal(again.view.coins,570);
});
