import test from 'node:test';
import assert from 'node:assert/strict';
import rule from '../../../../services/runtime-api/rules/realtime.mjs';

test('opposing teams obey lead, server validation, persistence and survival settlement',()=>{
 let state=rule.initial(41,'classic','runner');
 assert.equal(rule.view(state,0).role,'pursuer');assert.equal(rule.view(state,1).role,'runner');
 assert.notEqual(rule.view(rule.initial(42)).levelId,rule.view(state).levelId);
 for(const input of [{type:'score',score:999},{type:'move',actor:0,x:Infinity,y:0},{type:'move',actor:-1,x:500,y:300},{type:'hold',actor:0,elapsedMs:120000}])assert.throws(()=>rule.action(state,input,0,0));
 assert.throws(()=>rule.action(state,{type:'hold',actor:0},0,0));
 rule.action(state,{type:'hold',actor:0},0,1);
 const before=rule.view(state,1).robbers[0];
 rule.advance(state,2001);rule.action(state,{type:'hold',actor:0},2001,0);
 state=JSON.parse(JSON.stringify(state));rule.advance(state,120000);
 assert.equal(rule.result(state,0).finished,true);assert.equal(rule.result(state,0).eligible,true);
 assert.equal(rule.result(state,0).score,0);assert.equal(rule.result(state,1).score,3);
 assert.equal(rule.view(state,1).robbers[0].x,before.x);
 assert.throws(()=>rule.action(state,{type:'hold',actor:0},120000,1));
 assert.equal(rule.view(state).map.solution,undefined);
});
