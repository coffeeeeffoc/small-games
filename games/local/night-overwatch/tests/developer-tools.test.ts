import test from 'node:test';
import assert from 'node:assert/strict';
import { installDeveloperTools } from '../assets/scripts/DeveloperTools.ts';
import { MISSIONS } from '../assets/scripts/core/MissionCatalog.ts';

function setup(t:any,type='development'){
  const scope=globalThis as any, calls:any[]=[], actions:any[]=[];
  let cleaned=0,snapshot:any;
  scope.__SMALL_GAMES_BUILD__={type};
  scope.SmallGamesDev={isEnabled:()=>true,registerActions:(values:any[])=>{actions.push(...values);return()=>cleaned++;},registerSnapshot:(read:any)=>{snapshot=read;return()=>cleaned++;}};
  t.after(()=>{delete scope.__SMALL_GAMES_BUILD__;delete scope.SmallGamesDev;});
  const q:any={page:'shop',busy:false,assets:{devToolsEnabled:true},message:['',''],execute:async(value:any)=>{calls.push(value);return {};},refresh:async()=>{},pending:undefined};
  const game:any={sim:{phase:'briefing'},quartermaster:q,online:{show:(page:any)=>calls.push(['show',page]),active:false,busy:false},hud:{},selectMission:(id:any)=>calls.push(['mission',id]),snapshot:()=>({phase:game.sim.phase})};
  const cleanup=installDeveloperTools(game);
  return {q,game,calls,actions,cleanup,cleaned:()=>cleaned,snapshot:()=>snapshot?.(),run:(id:string,value?:number)=>actions.find(a=>a.id===id).run(value)};
}
test('only development packages register controls and snapshot; disposal unregisters both',t=>{
  const s=setup(t,'production');assert.equal(s.actions.length,0);s.cleanup();assert.equal(s.cleaned(),0);
});
test('developer controls send real intents, report failures, and retain safe mission selection',async t=>{
  const s=setup(t);assert.equal(s.actions.length,6);assert.deepEqual(s.snapshot(),{phase:'briefing'});
  await s.run('night-coins',-35);await s.run('night-xp',250);
  assert.deepEqual(s.calls.slice(0,2),[{kind:'dev-adjust',coinsDelta:-35},{kind:'dev-adjust',xpDelta:250}]);
  await assert.rejects(s.run('night-coins',1.5),/整数/);
  s.q.assets.devToolsEnabled=false;await assert.rejects(s.run('night-coins',1),/服务器未启用/);s.q.assets.devToolsEnabled=true;
  s.q.execute=async()=>undefined;s.q.message=['网络中断',''];await assert.rejects(s.run('night-coins',1),/网络中断/);
  s.run('night-mission',MISSIONS.length);assert(s.calls.some(c=>Array.isArray(c)&&c[1]===MISSIONS.at(-1)!.id));
  assert.equal(s.q.page,'');assert.equal(s.game.hud.missionPage,39);assert.equal(s.game.hud.missionsOpen,true);
  s.run('night-training');assert.equal(s.game.hud.missionsOpen,false);
  assert.throws(()=>s.run('night-mission',0),/关卡序号/);
  for(const patch of [{room:{}},{active:true},{busy:true}]){
    Object.assign(s.game.online,patch);assert.throws(()=>s.run('night-training'),/正常结束/);Object.assign(s.game.online,{room:undefined,active:false,busy:false});
  }
  s.game.sim.phase='playing';assert.throws(()=>s.run('night-mission',1),/正常结束/);
  s.cleanup();assert.equal(s.cleaned(),2);
});
test('refresh and retry report errors without inventing successful balances',async t=>{
  const s=setup(t);s.q.refresh=async()=>{s.q.message=['刷新失败',''];};await assert.rejects(s.run('night-assets-refresh'),/刷新失败/);
  await assert.rejects(s.run('night-assets-retry'),/没有待确认/);
  s.q.pending={kind:'dev-adjust',requestId:'same-id'};s.q.execute=async(value:any)=>{assert.equal(value,undefined);return {};};
  await s.run('night-assets-retry');assert.equal(s.q.pending.requestId,'same-id');
});
