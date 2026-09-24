import test from 'node:test';
import assert from 'node:assert/strict';
import {getLevels} from '../src/levels.js';
import {roadShape} from '../scripts/road-shape.mjs';
import {createGame,startGame,stepGame,commandCop,commandRobber} from '../src/engine.js';

test('each mode has 100 distinct connected topologies with substantially more late roads',()=>{
 for(const mode of ['challenge','classic','escape']){
  const levels=getLevels(mode);assert.equal(levels.length,100);assert.equal(new Set(levels.map(roadShape)).size,100,mode);
  for(const [i,level]of levels.entries()){
   assert.equal(level.id,i+1);const game=createGame(level);assert.ok(game.graph.distances[0].every(Number.isFinite));
   assert.equal(new Set([...level.cops,...level.robbers]).size,level.cops.length+level.robbers.length);
   assert.equal(new Set(level.edges.map(e=>e.slice().sort((a,b)=>a-b).join(','))).size,level.edges.length);
   for(const[a,b]of level.edges){
    const p=level.nodes[a],q=level.nodes[b];assert.ok(p.x===q.x||p.y===q.y,`axis-aligned road ${mode} ${level.id}`);
    for(const [index,r]of level.nodes.entries())if(index!==a&&index!==b)
      assert.equal((p.x===q.x&&r.x===p.x&&r.y>Math.min(p.y,q.y)&&r.y<Math.max(p.y,q.y))||(p.y===q.y&&r.y===p.y&&r.x>Math.min(p.x,q.x)&&r.x<Math.max(p.x,q.x)),false,`unsplit road junction ${mode} ${level.id}`);
   }
   for(let a=0;a<level.edges.length;a++)for(let b=a+1;b<level.edges.length;b++){
    if(level.edges[a].some(n=>level.edges[b].includes(n)))continue;
    const[p,q]=level.edges[a].map(n=>level.nodes[n]),[r,t]=level.edges[b].map(n=>level.nodes[n]);
    const[h1,h2,v1,v2]=p.y===q.y?[p,q,r,t]:[r,t,p,q];
    if(h1.y===h2.y&&v1.x===v2.x)assert.equal(v1.x>Math.min(h1.x,h2.x)&&v1.x<Math.max(h1.x,h2.x)&&h1.y>Math.min(v1.y,v2.y)&&h1.y<Math.max(v1.y,v2.y),false,`phantom crossing ${mode} ${level.id}`);
   }
   if(mode==='challenge'&&level.id>=81){assert.ok(level.nodes.length>=40);assert.ok(level.edges.length-level.nodes.length+1>=7);assert.equal(level.cops.length,7);assert.equal(level.robbers.length,8);}
   if(mode==='escape')for(const exit of level.exits){
    const guard=Math.min(...level.cops.map(cop=>game.graph.distances[cop][exit]/game.policeSpeed));
    const escape=Math.min(...level.robbers.map(runner=>game.graph.distances[runner][exit]/game.robberSpeed))+game.exitHoldSeconds;
    assert.ok(guard<=escape-2,`opening lead must leave a reachable interception ${level.id}`);
   }

  }
  const avg=(list,field)=>list.reduce((sum,l)=>sum+field(l),0)/list.length;
  const first=levels.slice(0,10),last=levels.slice(-10);assert.ok(avg(last,l=>l.nodes.length)>avg(first,l=>l.nodes.length));
  assert.ok(avg(last,l=>l.edges.length-l.nodes.length+1)>avg(first,l=>l.edges.length-l.nodes.length+1));
 }
});

test('solo runner is human controlled, opponent AI moves, first-side lead cannot be bypassed',()=>{
 for(const firstRole of ['cop','robber']){
  const level=getLevels('classic')[0],game=createGame(level,{playerRole:'robber',firstRole});startGame(game);
  const runner=game.robbers[0],origin={x:runner.x,y:runner.y};
  assert.equal(commandRobber(game,0,level.nodes[8]),firstRole==='robber');
  assert.equal(commandCop(game,0,level.nodes[6]),firstRole==='cop');
  stepGame(game,1);if(firstRole==='cop')assert.deepEqual({x:runner.x,y:runner.y},origin);
  stepGame(game,1);stepGame(game,.1);assert.equal(commandRobber(game,0,level.nodes[8]),true);
  stepGame(game,1);const cop=game.cops[0];assert.ok(Math.hypot(cop.x-level.nodes[0].x,cop.y-level.nodes[0].y)>0,'AI pursuers actually move');
  assert.equal(commandRobber(game,99,level.nodes[8]),false);
 }
});

test('classic survival expires and two human sides never receive AI commands',()=>{
 const level={...getLevels('classic')[0],timeLimit:3},game=createGame(level,{ai:false});startGame(game);
 const initial=game.robbers.map(({x,y})=>({x,y}));for(let i=0;i<4;i++)stepGame(game,1);
 assert.equal(game.phase,'lost');assert.deepEqual(game.robbers.map(({x,y})=>({x,y})),initial);
 assert.equal(game.events.filter(e=>e.type==='lose').length,1);
});
