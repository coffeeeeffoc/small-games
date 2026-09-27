import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { LEVELS,CX,CY,TICKS,createRound,step,normalizeInput,hazards,angleDelta,finishRecording,replayDigest,idle } from './sim.mjs';
// A coarse 200ms steering loop, not a frame-perfect solution or runtime AI.
export function steer(s,target,jitter=0) {
  const a=s.actors.at(-1), dx=a.x-CX,dy=a.y-CY,r=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
  const warnings=hazards(s), ring=warnings.find(h=>h.type!=='cross');
  const radius=ring?.type==='outer'?218:288;
  const offset=warnings.some(h=>h.type==='cross')?0.22:0;
  const error=angleDelta(target+offset+jitter,angle);
  const radial=Math.max(-1,Math.min(1,(radius-r)/22));
  const angular=Math.max(-1,Math.min(1,error*8));
  return normalizeInput(Math.cos(angle)*radial-Math.sin(angle)*angular,Math.sin(angle)*radial+Math.cos(angle)*angular,true);
}
export function drive(s,target,jitter=0) {
  let command=idle;
  while(s.status==='playing'){
    if(s.tick%12===0)command=steer(s,target,jitter*Math.sin(s.tick/83));
    step(s,command);
  }
  return s;
}
export function solve(level,gentle=true,jitter=0){
  let bank=[];
  for(const target of LEVELS[level].seals){
    const s=drive(createRound(level,bank,gentle),target,jitter);
    assert.equal(s.status,'timeout',`record level ${level}: ${s.status}`);
    bank=finishRecording(s,bank);
  }
  const victory=drive(createRound(level,bank,gentle),LEVELS[level].core,jitter);
  assert.equal(victory.status,'won',`win level ${level}: ${victory.status}, hp ${victory.hp}`);
  return {bank,victory};
}
function main(){
  const reports=[];
  for(const gentle of [true,false])for(let level=0;level<3;level++){
    const {bank,victory}=solve(level,gentle,0.035);
    reports.push({level:level+1,mode:gentle?'温和':'标准',recordings:bank.length,winSeconds:victory.tick/60,remainingLife:victory.actors.at(-1).hp});
    const alone=drive(createRound(level,[],gentle),LEVELS[level].core);
    assert.notEqual(alone.status,'won'); assert.equal(alone.damage,0);
    if(level===2){
      for(const gone of bank){
        const absent=createRound(level,bank.filter(r=>r.id!==gone.id),gentle);
        for(const input of victory.input)step(absent,input);
        assert.equal(absent.damage,0,`required recording ${gone.id} was redundant`);
      }
      const stopped=createRound(level,bank,gentle);
      for(const input of victory.input)step(stopped,[input[0],input[1],0]);
      assert.equal(stopped.damage,0);
      // All valid firing radii and sector centres: fixed actors cannot tank both rings.
      for(const radius of [182,218,245,260,288,320]){
        const s=createRound(level,bank,gentle);
        s.actors.at(-1).y=CY+radius;
        while(s.status==='playing')step(s,[0,0,1]);
        assert.equal(s.status,'lost',`standing radius ${radius} survived`);
      }
    }
    // Old actors keep the exact damage/movement/cooldown trace as new actors join.
    for(const record of bank){
      const s=createRound(level,bank,gentle);
      for(let t=0;t<TICKS;t++){
        step(s,bank.at(-1).inputs[t]);
        const a=s.actors.find(a=>a.id===record.id);
        assert.deepEqual([a.x,a.y,a.hp,a.nextShot,a.hurtUntil],record.trace[t],`drift level ${level} actor ${a.id} tick ${t}`);
      }
    }
  }
  const recording=drive(createRound(0),Math.PI);
  assert.equal(recording.input.length,1200);
  const expected=replayDigest(recording.actors[0]);
  for(let i=0;i<100;i++){
    const s=createRound(0);
    for(const input of recording.input)step(s,input);
    assert.deepEqual(replayDigest(s.actors[0]),expected);
  }
  for(const fps of [30,60,144]){
    const s=createRound(0);let clock=0;
    while(s.status==='playing'){
      clock+=60/fps;
      while(clock>=1 && s.status==='playing'){step(s,recording.input[s.tick]);clock--;}
    }
    assert.deepEqual(replayDigest(s.actors[0]),expected);
  }
  const original=finishRecording(recording,[]), encoded=JSON.stringify(original);
  const retry=createRound(0,original);
  for(let i=0;i<100;i++)step(retry,idle);
  assert.equal(JSON.stringify(finishRecording(retry,original,0)),encoded);
  const replaced=finishRecording(recording,original,0);
  assert.equal(replaced.length,1);assert.equal(JSON.stringify(original),encoded);
  assert.ok(180*(40*Math.PI/180)/170>33/60);
  const stop=createRound(0);step(stop,[0,0,1]);const shots=stop.actors[0].shots;
  for(let i=0;i<40;i++)step(stop,idle);
  assert.equal(stop.actors[0].shots,shots);
  console.table(reports);
  console.log('PASS: 6 complete solutions; coarse steering; required-ghost removal; no-fire; stationary failure; live/ghost damage parity; 100 replays; 30/60/144 FPS; 1200 ticks; retry/replace isolation.');
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)main();
