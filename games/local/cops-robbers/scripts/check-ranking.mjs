import assert from 'node:assert/strict';
import rules from '../../../../services/runtime-api/rules/cops.mjs';
import { getDuelLevel } from '../src/duel-levels.js';
import { chooseDuelAction } from '../src/duel.js';
for (const mode of ['escape','survival']) for (const firstRole of ['pursuer','runner']) {
 let state=rules.initial(0,mode,firstRole);
 assert.equal(state.board.side,firstRole);
 assert.throws(()=>rules.action(state,{type:'score',score:100000},1,0));
 assert.throws(()=>rules.action(state,{type:'move',side:firstRole,actor:99,target:1},1,firstRole==='pursuer'?0:1));
 assert.throws(()=>rules.action(state,{type:'move',side:firstRole,actor:0,target:999},1,firstRole==='pursuer'?0:1));
 const view=rules.view(state,1);view.board.turn=999;assert.equal(state.board.turn,0);assert.equal(view.role,'runner');
 const level=getDuelLevel(mode,state.levelId);
 while(!state.board.winner){
  const action=chooseDuelAction(level,state.board),seat=action.side==='pursuer'?0:1;
  assert.throws(()=>rules.action(state,action,(state.board.turn+1)*1000,1-seat),'cannot act for opposite role');
  state=rules.action(state,action,(state.board.turn+1)*1000,seat);
 }
 const winner=state.board.winner==='pursuer'?0:1;
 assert.deepEqual(rules.result(state,winner),{finished:true,eligible:true,score:3,secondary:0});
 assert.equal(rules.result(state,1-winner).score,0);
 assert.throws(()=>rules.action(state,{type:'move',side:state.board.side,actor:0,target:state.board.cops[0]},(state.board.turn+1)*1000,0));
 assert.equal(rules.advance(rules.initial(0,mode,firstRole),300000).board.winner,'runner');
}
console.log('PASS both modes/initiatives, authoritative roles, invalid/forged moves, immutable views, settlement and timeout');
