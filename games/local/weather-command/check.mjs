import assert from 'node:assert/strict';
import {levels,initial} from './levels.mjs';
import {step,actions} from './rules.mjs';
const a = token => ['rain','sun','snow'].includes(token)?{type:token}:{type:'wind',dir:token};
const play = (index,tokens) => tokens.reduce((s,t)=>{const r=step(s,a(t));assert(r.valid,`${index+1}: ${t}: ${r.reason}`);return r.state;},initial(index));
const solutions = [['rain','right'],['rain','right','up'],['sun','right'],['snow','right','up'],['up','right']];
for(let i=0;i<levels.length;i++) assert.equal(play(i,solutions[i]).status,'won');
assert.equal(play(1,['rain','up','right']).status,'won');
assert.equal(play(2,['up','right','down']).status,'won');
assert.equal(play(4,['rain','right','up']).status,'won');
assert.equal(play(1,['rain','right','up']).remaining,0,'第三次停靠判胜');
assert.equal(play(3,['rain','right','right']).status,'lost');
assert.equal(play(1,['snow','right']).x,5);
assert.equal(play(1,['rain','right']).x,4);
assert.equal(step(initial(2),a('right')).valid,false,'高水挡桥');
assert.equal(step(initial(0),a('right')).valid,false,'搁浅');
assert.equal(step(initial(4),a('snow')).valid,false,'重复雪无效');
assert.equal(play(4,['rain']).snow,false,'雨融雪');
assert.equal(play(4,['sun']).snow,false,'日融雪');
assert.equal(play(4,['sun']).h,0);
const history=[];let s=initial(0);history.push(s);s=step(s,a('rain')).state;history.push(s);s=step(s,a('right')).state;
assert.equal(s.grid[3][3],'.');s=history.pop();assert.equal(s.grid[3][3],'W');assert.equal(s.remaining,2);assert.equal(s.x,1);
assert.throws(()=>step(initial(0),{type:'wind',dir:'diagonal'}));
assert.throws(()=>initial(-1));
const reports=[];
for(let index=0;index<levels.length;index++) {
  const wins=[];
  function visit(state,sequence=[],route=[`${state.x},${state.y}`]) {
    const before=structuredClone(state);
    for(const action of actions) {
      const preview=step(state,action), execution=step(state,action);
      assert.deepEqual(state,before,'预演不得改变原状态');
      assert.deepEqual(preview,execution,'同一规则预演/执行一致');
      if(!execution.valid) {assert.equal(execution.state.remaining,state.remaining);continue;}
      assert.equal(execution.state.remaining,state.remaining-1);
      const nextSequence=[...sequence,action.type==='wind'?action.dir:action.type];
      const nextRoute=[...route,...execution.path.slice(1).map(p=>`${p.x},${p.y}`)];
      if(execution.state.status==='won') wins.push({sequence:nextSequence,route:nextRoute.join(' → ')});
      else if(execution.state.status==='playing') visit(execution.state,nextSequence,nextRoute);
    }
  }
  visit(initial(index));
  const routeCount=new Set(wins.map(w=>w.route)).size;
  assert(wins.length>0,`关${index+1}无解`);
  if([1,2,4].includes(index)) assert(routeCount>=2,`关${index+1}缺少两条空间路线`);
  if(index===2) assert(!wins.some(w=>w.sequence.includes('snow') && !w.sequence.includes('sun') && !w.sequence.includes('rain')),'高水桥关不能雪风万能');
  reports.push({level:index+1,name:levels[index].name,solutions:wins.length,spatialRoutes:routeCount,examples:[...new Map(wins.map(w=>[w.route,w])).values()].slice(0,2)});
}
console.log(JSON.stringify({passed:true,checks:'immutable preview, 3-action enumeration, routes, snow/rain landing, bridge, thaw, barrier undo, final-action victory',levels:reports},null,2));
