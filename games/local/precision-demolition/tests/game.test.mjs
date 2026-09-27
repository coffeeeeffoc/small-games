import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, begin, pointer, setPaused, step, snapshot } from '../simulation.mjs';
const records = JSON.parse(readFileSync(new URL('./recordings.json', import.meta.url), 'utf8'));
function replay(record, change = () => {}) {
  const s = createGame(record.level); change(s); begin(s); let i = 0;
  for (let tick=0;tick<4000 && s.phase==='playing';tick++) {
    while (record.events[i]?.tick === tick) { const e=record.events[i++]; pointer(s,e.type,e.x,e.y); }
    step(s);
  }
  return s;
}
for (const record of records) test(record.name, () => {
  const s=replay(record); assert.equal(s.phase,record.result,s.failure||'Unsettled scene');
  if(record.cause) assert.equal(s.events.find(e=>e.type==='failure')?.cause,record.cause);
  if(record.other) {
    const impact=s.events.find(e=>e.type==='impact'&&e.other===record.other);
    assert.ok(impact?.impulse>0); assert.equal(s.events.find(e=>e.type==='failure').other,record.other);
    assert.ok(!s.input.some(e=>e.x>=335&&e.y>=460),'No direct hit on protected object');
  }
  if(record.cause==='overload') {
    const failure=s.events.find(e=>e.type==='failure');assert.equal(failure.load,8);assert.equal(failure.capacity,5);
  }
  if(s.phase==='won') {
    assert.ok(s.stable>=.75);assert.ok(s.nodes.filter(n=>n.target).every(n=>!n.attached&&n.y>n.originY+2));
    assert.ok(!s.events.some(e=>e.type==='failure'));
    assert.ok(s.tick-s.events.filter(e=>e.type==='cut').at(-1).tick>45,'Wait after last strike');
    assert.ok(s.tick<3600);
    const nodes=s.nodes;
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++) {
      const a=nodes[i],b=nodes[j];
      assert.ok(!(a.x<b.x+b.w-.1&&a.x+a.w>b.x+.1&&a.y<b.y+b.h-.1&&a.y+a.h>b.y+.1),'Solids overlap at settlement');
    }
  }
  const original=createGame(record.level);assert.equal(s.nodes.reduce((sum,n)=>sum+n.mass,0),original.nodes.reduce((sum,n)=>sum+n.mass,0),'Conserve mass');
  assert.deepEqual(snapshot(replay(record)),snapshot(s),'Deterministic replay');
});
test('Moving vase away changes the same input outcome',()=>{
  const bad=records.find(r=>r.other==='vase');const s=replay(bad,s=>{s.obstacles[0].x=20;});
  assert.ok(!s.obstacles[0].broken);assert.ok(!s.events.some(e=>e.type==='failure'&&e.cause==='impact'));
});
test('Hold, drag, release, cancel, pause and fresh retry use the same input path',()=>{
  const s=createGame(0);begin(s);pointer(s,'down',143,309);step(s);
  pointer(s,'move',258,309);for(let i=0;i<14;i++)step(s);
  assert.ok(s.events.some(e=>e.type==='strike'&&e.id==='upperL-R'));assert.ok(s.events.some(e=>e.type==='strike'&&e.id==='upperR-L'));
  pointer(s,'up');const count=s.events.filter(e=>e.type==='strike').length;for(let i=0;i<40;i++)step(s);assert.equal(s.events.filter(e=>e.type==='strike').length,count);
  pointer(s,'down',143,309);pointer(s,'cancel');const canceled=s.events.filter(e=>e.type==='strike').length;for(let i=0;i<40;i++)step(s);assert.equal(s.events.filter(e=>e.type==='strike').length,canceled);
  pointer(s,'down',258,309);setPaused(s,true);const tick=s.tick;step(s);assert.equal(s.tick,tick);assert.equal(s.held,null);setPaused(s,false);for(let i=0;i<20;i++)step(s);assert.equal(s.held,null);
  const retry=createGame(0);begin(retry);for(let i=0;i<60;i++)step(retry);assert.equal(retry.events.filter(e=>e.type==='strike').length,0);
});
test('No-input timeout is a loss; idle and pause cannot consume the clock',()=>{
  const s=createGame(0);step(s);assert.equal(s.tick,0);begin(s);for(let i=0;i<3900;i++)step(s);assert.equal(s.phase,'lost');assert.match(s.failure,/时间/);
});

test('Captured browser inputs replay through the same rules',()=>{
  const evidence=JSON.parse(readFileSync(new URL('../docs/browser-evidence.json',import.meta.url),'utf8'));
  for(const record of [...evidence.desktop,...evidence.mobile]){
    const s=replay({level:record.level-1,events:record.input});
    assert.equal(s.phase,record.phase,`Browser level ${record.level}`);assert.equal(s.failure,record.failure);
    if(s.phase==='won')assert.ok(s.nodes.filter(n=>n.target).every(n=>n.vx===0&&n.vy===0));
  }
});
