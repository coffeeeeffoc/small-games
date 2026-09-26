import test from 'node:test';
import assert from 'node:assert/strict';
import { make, step, charge } from './harness';
import { levels, playground, type Level } from '../src/levels';
import { C, distance, length, sub } from '../src/config';
import { Physics } from '../src/physics';
import { Grips } from '../src/grips';
import Matter from 'phaser/src/physics/matter-js/CustomMain.js';

const solo = (): Level => ({ ...structuredClone(playground), spawns: [{ x: 200, y: 400 }], anchors: [] });
const airborne = () => ({ ...solo(), platforms: [], spawns: [{ x: 200, y: 150 }], deathY: 2000 });

test('only the selected body receives a single impulse; idle actors keep simulating', () => {
  const s = make(); step(s, 700); s.select(2); assert.ok(s.begin('key')); step(s,500);
  const before=s.actors.map(c=>({...c.body.velocity})); assert.ok(s.releaseCharge('key'));
  assert.deepEqual(s.actors[0].body.velocity,before[0]);assert.deepEqual(s.actors[1].body.velocity,before[1]);assert.ok(s.actors[2].body.velocity.y<before[2].y-4);
  const once={...s.actors[2].body.velocity}; assert.equal(s.releaseCharge('key'),false);assert.deepEqual(s.actors[2].body.velocity,once);
  const falling=make({...airborne(),spawns:[{x:200,y:150},{x:400,y:150},{x:600,y:150}]});step(falling,250);
  assert.ok(falling.actors.every(c=>c.body.position.y>170));
});
test('switching preserves all physical state and grips, cancels charge and bound movement', () => {
  const s=make(levels[2]);step(s,600);s.begin('pointer-1');s.movement(1,'D');
  const state=s.actors.map(c=>({p:{...c.body.position},v:{...c.body.velocity},g:c.hands.map(h=>h.grip)}));s.select(0);
  assert.equal(s.charge,null);assert.equal(s.move,null);assert.equal(s.releaseCharge('pointer-1'),false);
  assert.deepEqual(s.actors.map(c=>({p:{...c.body.position},v:{...c.body.velocity},g:c.hands.map(h=>h.grip)})),state);
});
test('charge is smooth, capped, game-time based, and higher charge jumps higher', () => {
  const outcomes=[];
  for(const ms of [0,400,700,1000,1500]){const s=make(solo());step(s,1000);assert.ok(charge(s,ms));let min=s.actors[0].body.position.y;
    for(let i=0;i<100;i++){step(s,C.step);min=Math.min(min,s.actors[0].body.position.y);}outcomes.push(min);}
  assert.ok(outcomes[0]>outcomes[1]+7);assert.ok(outcomes[1]>outcomes[2]+15);assert.ok(outcomes[2]>outcomes[3]+7);assert.ok(Math.abs(outcomes[3]-outcomes[4])<5);
  const s=make(solo());step(s,700);s.begin('key');step(s,300);s.pause(true);step(s,2000);assert.equal(s.charge,null);assert.equal(s.releaseCharge('key'),false);
});
test('free fall cannot jump or swing, ground movement gives no air thrust', () => {
  const a=make(airborne()), b=make(airborne());a.movement(1,'D');assert.equal(a.begin('space'),false);
  step(a,500);step(b,500);assert.ok(distance(a.actors[0].body.position,b.actors[0].body.position)<0.001);
});
test('a teammate path to a ring supports swinging; a floating closed loop does not', () => {
  const s=make(levels[2]);assert.equal(s.qualification(2).action,'swing');assert.equal(s.grips.graph(2).members.size,3);
  s.select(0);s.releaseHand(0);assert.equal(s.qualification(2).action,null);
  // Pure graph fixture: add a final peer edge without touching the physics world.
  s.grips.connections.set('loop',{id:'loop',a:s.actors[2].hands[1],b:s.actors[0].hands[0],joint:{} as MatterJS.ConstraintType});
  assert.equal(s.grips.graph(0).members.size,3);assert.equal(s.grips.graph(0).anchors.length,0);assert.equal(s.qualification(2).action,null);
});
test('support changing during charge cancels instead of changing jump into swing', () => {
  const s=make(levels[2]);s.begin('key');s.select(0);s.begin('key');s.releaseHand(0);assert.equal(s.charge,null);assert.equal(s.releaseCharge('key'),false);
  const land=make(solo());step(land,700);land.begin('key');land.actors[0].groundedMs=0;
  assert.equal(land.releaseCharge('key'),false);assert.match(land.message,/支撑已改变/);
});
test('head contact and wall contact do not create foot support', () => {
  const s=make({...airborne(),spawns:[{x:200,y:180,angle:Math.PI}],platforms:[{id:'floor',x:0,y:240,w:600,h:80}]});
  // Inspect actual collision before stance correction can right the actor.
  for(let i=0;i<80;i++){s.p.step();s.p.support(s.actors[0],s.solids,s.time);s.time+=C.step;}
  assert.equal(s.actors[0].groundedMs,0);assert.equal(s.qualification(0).action,null);
  const wall=make({...airborne(),spawns:[{x:190,y:170}],platforms:[{id:'wall',x:208,y:80,w:30,h:600}]});step(wall,200);assert.equal(wall.actors[0].groundedMs,0);
});
test('hand endpoints, finite reach and obstacle occlusion gate catches', () => {
  const s=make(solo()),h=s.actors[0].hands[1],hand=s.p.hand(h);
  const target={id:'test',point:hand,previous:hand,anchor:{id:'test',name:'test',kind:'ring' as const,...hand}};
  assert.equal(s.grips.legal(h,target,0),'');
  const bodyTarget={...target,point:{...s.actors[0].body.position},previous:{...s.actors[0].body.position}};assert.match(s.grips.legal(h,bodyTarget,0),/未进入范围/);
  const far={...target,point:{x:hand.x+200,y:hand.y}};assert.match(s.grips.legal(h,far,0),/臂展/);
  const shoulder=s.p.shoulder(s.actors[0],1);const obstacle=s.p.makePlatform({id:'block',x:(shoulder.x+hand.x)/2-8,y:(shoulder.y+hand.y)/2-8,w:16,h:16});
  s.grips.solids.push(obstacle);assert.equal(s.grips.legal(h,target,0),'实体遮挡');
});
test('swept hand catch detects a fast crossing but still rejects a wall', () => {
  const s=make(solo()),h=s.actors[0].hands[1],p=s.p.hand(h);
  const target={id:'fast',point:{x:p.x+19,y:p.y},previous:{x:p.x+19,y:p.y},anchor:{id:'fast',name:'fast',kind:'ring' as const,x:p.x+19,y:p.y}};
  h.previous={x:p.x+38,y:p.y};
  assert.equal(s.grips.legal(h,target,0,false),'手端未进入范围');assert.equal(s.grips.legal(h,target,0,true),'');
  s.grips.solids.push(s.p.makePlatform({id:'wall',x:p.x+6,y:p.y-10,w:5,h:20}));assert.equal(s.grips.legal(h,target,0,true),'实体遮挡');
});
test('handshake creates one constraint, bilateral slots, and bilateral release cooldown/hysteresis', () => {
  const p=new Physics(Matter,Matter.Engine.create());
  const a=p.character(0,{x:200,y:300,arms:[-Math.PI/2,0]}),b=p.character(1,{x:324,y:300,arms:[Math.PI,-Math.PI/2]});
  const grips=new Grips(p,[a,b],[],[],()=>{}); const h=a.hands[1],other=b.hands[0];const count=p.counts().constraints;
  assert.ok(grips.attach(h,grips.target(other),0));assert.equal(p.counts().constraints,count+1);assert.equal(h.grip,other.grip);
  assert.equal(grips.attach(other,grips.target(h),0),null);grips.release(h,100);assert.equal(h.grip,null);assert.equal(other.grip,null);assert.equal(p.counts().constraints,count);
  assert.equal(grips.attach(other,grips.target(h),101),null);assert.match(grips.legal(h,grips.target(other),1000),/旧抓点/);
  assert.ok(h.blocked.has(other.id));assert.ok(other.blocked.has(h.id));
});
test('Q/E release only the requested edge and add no launch impulse', () => {
  const s=make(levels[2]);step(s,600);s.select(1);const before=s.actors.map(c=>({...c.body.velocity}));const kept=s.actors[1].hands[1].grip;
  s.releaseHand(0);assert.equal(s.grips.connections.size,2);assert.equal(s.actors[1].hands[1].grip,kept);assert.ok(s.actors[0].hands[0].grip);
  assert.deepEqual(s.actors.map(c=>c.body.velocity),before);
});
test('releases preserve momentum after a swing and cannot spend stale charge', () => {
  const s=make(levels[2]);step(s,1000);charge(s,1000);step(s,50);s.select(0);s.begin('key');
  const velocities=s.actors.map(c=>({...c.body.velocity}));s.releaseHand(0);assert.deepEqual(s.actors.map(c=>c.body.velocity),velocities);assert.equal(s.charge,null);
});
test('30/60/120Hz rendering gives equivalent charge and trajectories at fixed physics time', () => {
  const outputs=[];
  for(const hz of [30,60,120]) {const s=make(solo()); for(let n=0;n<hz;n++)s.advance(1000/hz);s.begin('key');for(let n=0;n<hz;n++)s.advance(1000/hz);s.releaseCharge('key');for(let n=0;n<hz/2;n++)s.advance(1000/hz);outputs.push(s.snapshot());}
  for(const result of outputs.slice(1)){assert.ok(Math.abs(result.actors[0].x-outputs[0].actors[0].x)<0.01);assert.ok(Math.abs(result.actors[0].y-outputs[0].actors[0].y)<0.01);}
});
test('all-team stable arrival, never a single actor passing over the goal', () => {
  const level={...structuredClone(levels[0]),goal:{x:100,y:330,w:100,h:130}};
  const s=make(level);step(s,2500);assert.ok(s.safe(s.actors[0],level.goal));assert.equal(s.status,'playing');
  const all=make({...solo(),goal:{x:150,y:300,w:130,h:160}});step(all,400);assert.equal(all.status,'playing');step(all,1000);assert.equal(all.status,'won');
});
test('50 resets leave no bodies, constraints, slots, charge or cooldown behind', () => {
  const s=make(levels[2]);const counts=s.p.counts();
  for(let n=0;n<50;n++){step(s,50);s.begin('key');s.releaseHand(0);s.reset();assert.deepEqual(s.p.counts(),counts);assert.equal(s.charge,null);assert.equal(s.move,null);assert.equal(s.grips.connections.size,3);assert.ok(s.actors.every(c=>c.hands.every(h=>h.until===0&&h.blocked.size===0)));}
});
test('frame gaps discard accumulated time and cancel charge; pause consumes no game time', () => {
  const s=make(solo());step(s,1000);s.begin('key');const time=s.time;s.advance(12000);assert.equal(s.time,time);assert.equal(s.charge,null);s.pause(true);s.advance(30);assert.equal(s.time,time);
});
test('checkpoint reset rebuilds legal safe standing positions', () => {
  const s=make(levels[3]);s.checkpoint=true;s.reset();step(s,700);assert.ok(s.actors.every(c=>c.groundedMs>=C.supportMs));assert.equal(s.grips.connections.size,0);assert.equal(s.checkpoint,true);
});
test('repeat swing cooldown and capped speed keep long-running pendulum finite', () => {
  const s=make(levels[2]);step(s,1000);
  for(let n=0;n<12;n++){if(s.status!=='playing')break;s.select(2);charge(s,400);assert.equal(s.begin('key'),false);step(s,400);}
  assert.equal(s.numericalErrors,0);assert.ok(s.actors.every(c=>Number.isFinite(c.body.position.x+c.body.position.y)&&length(c.body.velocity)<=C.maxSpeed+0.01));
});

test('a second input source cannot duplicate a held charge', () => {
  const s=make(solo());step(s,700);assert.ok(s.begin('pointer-1'));assert.equal(s.begin('keyboard'),false);step(s,300);
  assert.equal(s.releaseCharge('keyboard'),false);assert.ok(s.charge);assert.ok(s.releaseCharge('pointer-1'));assert.equal(s.actions.length,1);
});
test('swing strength is smoothly distinguishable and acts on just the selected body', () => {
  const deltas=[];
  for(const hold of [0,500,1000]){const s=make(levels[2]);step(s,800);assert.ok(s.begin('key'));step(s,hold);const before={...s.actors[2].body.velocity};assert.ok(s.releaseCharge('key'));deltas.push(length(sub(s.actors[2].body.velocity,before)));}
  assert.ok(deltas[0]<deltas[1]&&deltas[1]<deltas[2]);assert.ok(deltas[2]>deltas[0]*4);
});
test('fast catches stay reliable under 30, 60 and 120Hz render frames', () => {
  for(const hz of [30,60,120]){
    const level=airborne();level.spawns=[{x:200,y:200}];level.anchors=[{id:'fast',name:'快抓',kind:'ring',x:246,y:146}];
    const s=make(level);for(const b of [s.actors[0].body,...s.actors[0].arms])s.p.M.Body.setVelocity(b,{x:18,y:0});
    for(let n=0;n<hz/4;n++)s.advance(1000/hz);
    assert.ok(s.grips.occupied.has('fast'),`caught at ${hz}Hz`);
  }
});
test('the ring canyon cannot be skipped by an ordinary standing full-charge jump', () => {
  for(const x of [0.45,0.6,0.7,0.85]){
    const level=structuredClone(levels[1]);level.spawns=[{x:342,y:400}];level.anchors=[];
    const s=make(level);step(s,1000);assert.ok(charge(s,1000,{x,y:-Math.sqrt(1-x*x)}));
    let safelyLanded=false;for(let n=0;n<240;n++){step(s,C.step);if(s.actors[0].body.position.x>705&&s.actors[0].groundedMs>=C.supportMs)safelyLanded=true;}
    assert.equal(safelyLanded,false);
  }
});
