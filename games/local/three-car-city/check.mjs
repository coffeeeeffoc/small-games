import assert from 'node:assert/strict';
import { create, dispatch, runUntil, step, position, multiplier, routes } from './simulation.mjs';
const send=(s,c,e,m)=>assert.equal(dispatch(s,c,e,m).ok,true,`${c} -> ${e} ${m||'fast'}`);
function initial(level,cooperate=true,mode='fast') {
 const s=create(level); if(cooperate)send(s,1,'traffic-1');send(s,2,'fire-1',mode);send(s,3,'pet-1');return s;
}
function solution(level,mode='short') {
 let s;
 if(level===0){s=create(0);send(s,1,'fire-1');send(s,3,'pet-1');runUntil(s,12);send(s,3,'pet-2');runUntil(s,18);send(s,2,'fire-2');}
 else if(level===1){s=initial(1);runUntil(s,18);send(s,3,'pet-2');runUntil(s,20);send(s,1,'fire-2');}
 else{s=initial(2,true,mode);runUntil(s,20);send(s,3,'power-1');send(s,1,'fire-2');runUntil(s,22);send(s,2,'pet-2');}
 runUntil(s,60);return s;
}
const helped=runUntil(initial(1),22), alone=runUntil(initial(1,false),22);
assert.equal(helped.events.find(e=>e.id==='fire-1').state,'done');
assert.equal(alone.events.find(e=>e.id==='fire-1').state,'missed');
assert.equal(helped.events.find(e=>e.id==='fire-1').finished,17.4);
const shortcut=solution(2,'short'),detour=solution(2,'fast');
assert.equal(shortcut.events.find(e=>e.id==='fire-1').state,'done');
assert.equal(detour.events.find(e=>e.id==='fire-1').state,'missed');
assert.equal(shortcut.loss,0);assert.equal(detour.loss,2);
const levels=[0,1,2].map(i=>{const s=solution(i);assert.equal(s.status,'won');assert.equal(s.loss,0);assert(s.events.every(e=>e.state==='done'));assert.deepEqual(s,solution(i));return{level:i+1,finished:s.time,events:s.events.length,loss:s.loss};});
// A completion exactly at the deadline succeeds; one tick later does not.
for(const [due,expected] of [[4,'done'],[3.9,'missed']]){const s=create(0);s.events=[{...s.events[0],due}];s.cars[2].node='B';send(s,3,'pet-1');runUntil(s,4.1);assert.equal(s.events[0].state,expected);}
const moving=initial(1);runUntil(moving,5);const before=position(moving,moving.cars[1]);runUntil(moving,6);const after=position(moving,moving.cars[1]);assert(after[0]>before[0]&&after[0]<510);assert.equal(multiplier(moving,'E','F'),1);assert.equal(dispatch(moving,2,'pet-2').ok,false);
moving.events.push({...moving.events.find(e=>e.id==='pet-1'),id:'reroute',node:'A',assigned:null,due:35,state:'active'});
const point=position(moving,moving.cars[1]);send(moving,2,'reroute');assert.deepEqual(position(moving,moving.cars[1]),point);assert.equal(moving.cars[1].edge.to,'F');
assert.equal(dispatch(moving,3,'reroute').ok,false); // busy service cannot be stolen
assert.equal(dispatch(moving,99,'reroute').ok,false);
assert.equal(dispatch(moving,1,'missing').ok,false);
const stacked=create(1);stacked.events.push({id:'blackout',type:'power',node:'B',at:0,due:40,edges:['EF'],state:'active'});assert.equal(multiplier(stacked,'E','F'),3);stacked.events[0].state='done';assert.equal(multiplier(stacked,'E','F'),2);
const late=create(1);late.events=[{...late.events[0],due:1}];send(late,1,'traffic-1');runUntil(late,6);assert.equal(late.loss,1);assert.equal(late.events[0].state,'done');assert.equal(multiplier(late,'E','F'),1);
assert.equal(routes(create(2),create(2).cars[1],create(2).events[1]).length,2);
// Both equally fast departures allow the player to choose a route while driving.
const departing=create(2);send(departing,1,'traffic-1');send(departing,2,'fire-1');runUntil(departing,1);
assert.equal(routes(departing,departing.cars[1],departing.events[1]).length,2,'route choice vanished immediately after dispatch');
send(departing,2,'fire-1','short');runUntil(departing,20);assert.equal(departing.events[1].state,'done');
assert.equal(runUntil(create(1),23).status,'lost');assert.equal(create(1).time,0);
// District standby uses real roads, releases old jobs, and never interrupts service.
const standby=create(0);send(standby,1,'B');runUntil(standby,4);assert.equal(standby.cars[0].node,'B');assert.equal(standby.cars[0].target,null);assert.equal(standby.cars[0].working,false);
send(standby,1,'pet-1');assert.equal(standby.cars[0].working,true);assert.equal(dispatch(standby,1,'C').ok,false);
const redirected=create(0);send(redirected,1,'fire-1');runUntil(redirected,1);const continuous=position(redirected,redirected.cars[0]);send(redirected,1,'C');assert.deepEqual(position(redirected,redirected.cars[0]),continuous);assert.equal(redirected.events[1].assigned,null);runUntil(redirected,8);assert.equal(redirected.cars[0].node,'C');assert.equal(redirected.cars[0].target,null);
assert.equal(dispatch(create(0),1,'unknown').ok,false);
console.log(JSON.stringify({passed:true,levels,cooperation:{helpedFire:17.4,unsupportedFire:'missed at 22s'},routeChoice:{shortcutLoss:shortcut.loss,detourLoss:detour.loss},checks:['deadline equality','one tick late','reroute physical continuity','busy/rejected commands','max slowdown','repair after expiry','deterministic replay','idle failure','district standby and reassignment','route choice while departing']},null,2));
