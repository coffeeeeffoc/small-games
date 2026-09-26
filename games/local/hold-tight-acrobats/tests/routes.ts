import assert from 'node:assert/strict';
import { C } from '../src/config';
import { make, step, charge } from './harness';
import { levels } from '../src/levels';
import type { Simulation } from '../src/simulation';
export function until(s: Simulation, condition: () => boolean, maxMs = 8000, label = '') {
  const end = s.time + maxMs;
  while (!condition() && s.time < end && s.status === 'playing' && !s.paused) step(s, C.step);
  assert.ok(condition(), `${label} @${s.time.toFixed(0)} ${JSON.stringify(s.snapshot())}`);
}
export function walk(s: Simulation, who: number, x: number) {
  s.select(who); const direction = Math.sign(x - s.actors[who].body.position.x);
  if (Math.abs(x - s.actors[who].body.position.x) < 12) return;
  s.movement(direction, 'route');
  until(s, () => (s.actors[who].body.position.x - x) * direction >= 0 || s.status === 'won', 12000, `walk ${who} -> ${x}`);
  s.movement(0, 'route'); step(s, 450);
}
function free(s: Simulation, who: number) { s.select(who); if (s.actors[who].hands[0].grip) s.releaseHand(0); if (s.actors[who].hands[1].grip) s.releaseHand(1); }
export function jumpGap(s: Simulation, who: number, edge: number, landing: number, power = 700) {
  walk(s, who, edge - 32); free(s, who);
  until(s, () => s.qualification(who).action === 'jump', 3000, 'stand before jump');
  assert.ok(charge(s, power), 'jump executes');
  const end = s.time + 6000;
  while(s.time < end && s.status === 'playing') {
    step(s, C.step);
    if(s.actors[who].body.position.x > landing && s.actors[who].groundedMs >= C.supportMs) return;
    if(s.grips.graph(who).anchors.length) free(s, who);
  }
  assert.fail(`jump landing ${JSON.stringify(s.snapshot())}`);
}
export function ringCross(s: Simulation, who: number, ringId: string) {
  const anchor = s.level.anchors.find(a => a.id === ringId)!;
  const offset = anchor.x - 480;
  walk(s, who, 335 + offset); free(s, who); step(s, 300);
  assert.ok(charge(s, 1000), 'ring jump');
  until(s, () => s.grips.graph(who).anchors.some(a => a.id === ringId), 1800, 'catch ring');
  step(s, 300);
  assert.ok(charge(s, 1000), 'ring swing');
  until(s, () => s.actors[who].body.position.x > anchor.x + 28 && s.actors[who].body.velocity.x > 3, 1500, 'release window');
  free(s, who);
  until(s, () => {
    if (s.actors[who].body.position.x > 720 + offset && s.actors[who].hands.some(h => h.grip)) free(s, who);
    return s.actors[who].body.position.x > 720 + offset && s.actors[who].groundedMs >= C.supportMs;
  }, 6000, 'ring landing');
}
export function chainExchange(s: Simulation) {
  step(s, 1000); s.select(2); assert.ok(charge(s, 1000));
  until(s, () => s.grips.occupied.has('new'), 4000, 'new anchor');
  assert.equal(s.grips.graph(0).anchors.length, 2, 'both ends attached');
  s.select(0); s.releaseHand(0); assert.equal(s.grips.graph(0).anchors[0]?.id, 'new');
  step(s, 1900);
  // Detach the middle actor over the lower landing. The first actor stays on the recovery ledge.
  free(s, 1); step(s, 900);
  free(s, 2); step(s, 1700);
  for(const who of [2,1]) { until(s, () => s.actors[who].groundedMs >= C.supportMs, 6000, `chain land ${who}`); walk(s,who,s.level.checkpoint?.spawns[who].x ?? (who===2?950:820)); }
  if(s.actors[0].body.position.x < 380) jumpGap(s,0,375,400,600);
  walk(s,0,s.level.checkpoint?.spawns[0].x ?? 700); step(s,1000);
}
export function route(id: number) {
  const s = make(levels[id - 1]);
  if(id===3 || id===5) {
    chainExchange(s);
    if(id===5) {
      until(s,()=>s.checkpoint,10000,'chain checkpoint');
      for(const who of [2,1,0]) {ringCross(s,who,'ring5');walk(s,who,1380+who*100);}
      step(s,1500);
    }
  }
  else {
    step(s,700);
    for (const who of [2,1,0]) {
      if(id===2) ringCross(s,who,'ring1');
      else jumpGap(s,who,id===1?410:350,id===1?515:455,700);
      const x = id===1 ? 730 + who*90 : id===2 ? 850+who*95 : 555+who*160;
      walk(s,who,x);
    }
    if(id===4) {
      until(s,()=>s.checkpoint,10000,'checkpoint');
      for(const who of [2,1,0]){jumpGap(s,who,995,1120,750);walk(s,who,1250+who*90);}
    }
    step(s,1500);
  }
  if(s.status==='playing'){for(const who of [0,1,2])free(s,who);step(s,2500);}
  assert.equal(s.status,'won',JSON.stringify(s.snapshot())); assert.equal(s.numericalErrors,0);
  return s;
}
