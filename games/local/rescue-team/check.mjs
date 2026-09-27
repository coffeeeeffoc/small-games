import assert from 'node:assert/strict';
import { create, dispatch, runUntil, step, position, multiplier, routes, routePoints, NODES, SITES, siteFor } from './simulation.mjs';
const send=(s,c,e,m)=>assert.equal(dispatch(s,c,e,m).ok,true,`${c} -> ${e} ${m||'fast'}`);
const freeParking=create(0);send(freeParking,1,{point:[353.25,411.5]});
runUntil(freeParking,8);assert.deepEqual(position(freeParking,freeParking.cars[0]),[353.25,411.5]);
assert.equal(freeParking.cars[0].target,null);
// Reaching the road junction is not arriving at the incident site.
const arrival=create(0);send(arrival,3,'pet-1');runUntil(arrival,4);
assert.equal(arrival.cars[2].working,false,'car must enter the park before serving, not work at junction B');
runUntil(arrival,5);assert.deepEqual(position(arrival,arrival.cars[2]),[244,228]);
assert.equal(arrival.cars[2].working,true);assert.equal(arrival.cars[2].service,0);
function advance(s,time) {
 while(s.time+1e-8<time&&s.status==='playing') {
  const before=s.cars.map(c=>position(s,c));step(s);
  for(const [i,c] of s.cars.entries()) {
   const p=position(s,c);
   assert(Math.hypot(p[0]-before[i][0],p[1]-before[i][1])<=13.5+1e-8,`teleport at ${s.time}s, car ${c.id}`);
   if(c.working){assert(c.parked&&!c.edge&&!c.access);assert.deepEqual(p,siteFor(s.events.find(e=>e.id===c.target)).site);assert(!Object.values(NODES).some(n=>n[0]===p[0]&&n[1]===p[1]),'service at road junction');}
   if(c.edge||c.access)assert.equal(c.service,0,'service must wait until fully parked');
  }
 }
 return s;
}
function initial(level,cooperate=true,mode='fast') {
 const s=create(level); if(cooperate)send(s,1,'traffic-1');send(s,2,'fire-1',mode);send(s,3,'pet-1');return s;
}
function solution(level,mode='short') {
 let s;
 if(level===0){s=create(0);send(s,1,'fire-1');send(s,3,'pet-1');advance(s,12);send(s,3,'pet-2');advance(s,18);send(s,2,'fire-2');}
 else if(level===1){s=initial(1);advance(s,18);send(s,3,'pet-2');advance(s,20);send(s,1,'fire-2');}
 else{s=initial(2,true,mode);advance(s,20);send(s,3,'power-1');send(s,1,'fire-2');advance(s,22);send(s,2,'pet-2');}
 advance(s,60);return s;
}
const helped=advance(initial(1),23), alone=advance(initial(1,false),23);
assert.equal(helped.events.find(e=>e.id==='fire-1').state,'done');
assert.equal(alone.events.find(e=>e.id==='fire-1').state,'missed');
assert.equal(helped.events.find(e=>e.id==='fire-1').finished,19);
assert.equal(alone.log.find(e=>e.kind==='miss'&&e.event==='fire-1').at,23);
const shortcut=solution(2,'short'),detour=solution(2,'fast');
assert.equal(shortcut.events.find(e=>e.id==='fire-1').state,'done');
assert.equal(detour.events.find(e=>e.id==='fire-1').state,'missed');
assert.equal(shortcut.loss,0);assert.equal(detour.loss,2);
assert.equal(shortcut.events[1].finished,19);assert.equal(detour.log.find(e=>e.kind==='miss').at,22);
const unassisted=advance(initial(2,false,'short'),22);assert.equal(unassisted.events[1].state,'missed');
// Without the deadline, the detour needs 23 seconds and the unsupported shortcut 25.
for(const [cooperate,mode,finish] of [[true,'fast',23],[false,'short',25]]){const s=initial(2,cooperate,mode);s.events[1].due=40;advance(s,finish);assert.equal(s.events[1].finished,finish);}
const levels=[0,1,2].map(i=>{const s=solution(i);assert.equal(s.status,'won');assert.equal(s.loss,0);assert(s.events.every(e=>e.state==='done'));assert.equal(s.time,[27,34,38][i]);assert.deepEqual(s,solution(i));return{level:i+1,finished:s.time,events:s.events.map(e=>({id:e.id,finished:e.finished})),loss:s.loss};});
// A completion exactly at the deadline succeeds; one tick later does not.
for(const [due,expected] of [[5,'done'],[4.9,'missed']]){const s=create(0);s.events=[{...s.events[0],due}];s.cars[2].node='B';send(s,3,'pet-1');advance(s,5.1);assert.equal(s.events[0].state,expected);assert.deepEqual(position(s,s.cars[2]),[244,228]);}
const moving=initial(1);runUntil(moving,6);const before=position(moving,moving.cars[1]);runUntil(moving,7);const after=position(moving,moving.cars[1]);assert(after[0]>before[0]&&after[0]<510);assert.equal(multiplier(moving,'E','F'),1);assert.equal(dispatch(moving,2,'pet-2').ok,false);
moving.events.push({...moving.events.find(e=>e.id==='pet-1'),id:'reroute',node:'A',assigned:null,due:35,state:'active'});
const point=position(moving,moving.cars[1]);send(moving,2,'reroute');assert.deepEqual(position(moving,moving.cars[1]),point);assert.equal(moving.cars[1].edge.to,'F');
assert.equal(dispatch(moving,3,'reroute').ok,false); // busy service cannot be stolen
assert.equal(dispatch(moving,99,'reroute').ok,false);
assert.equal(dispatch(moving,1,'missing').ok,false);
const stacked=create(1);stacked.events.push({id:'blackout',type:'power',node:'B',at:0,due:40,edges:['EF'],state:'active'});assert.equal(multiplier(stacked,'E','F'),3);stacked.events[0].state='done';assert.equal(multiplier(stacked,'E','F'),2);
const late=create(1);late.events=[{...late.events[0],due:1}];send(late,1,'traffic-1');advance(late,7);assert.equal(late.loss,1);assert.equal(late.events[0].state,'done');assert.equal(multiplier(late,'E','F'),1);
assert.equal(routes(create(2),create(2).cars[1],create(2).events[1]).length,2);
// Both equally fast departures allow the player to choose a route while driving.
const departing=create(2);send(departing,1,'traffic-1');send(departing,2,'fire-1');runUntil(departing,1);
assert.equal(routes(departing,departing.cars[1],departing.events[1]).length,2,'route choice vanished immediately after dispatch');
send(departing,2,'fire-1','short');runUntil(departing,20);assert.equal(departing.events[1].state,'done');
assert.equal(runUntil(create(1),23).status,'lost');assert.equal(create(1).time,0);
// District standby uses real roads, releases old jobs, and never interrupts service.
const standby=create(0);send(standby,1,'B');runUntil(standby,4);assert.equal(standby.cars[0].node,'B');assert.equal(standby.cars[0].target,null);assert.equal(standby.cars[0].working,false);
send(standby,1,'pet-1');assert.equal(standby.cars[0].working,false);assert.equal(standby.cars[0].access.direction,'in');assert.equal(dispatch(standby,1,'C').ok,false);advance(standby,5);assert.equal(standby.cars[0].working,true);assert.equal(dispatch(standby,1,'C').ok,false);
const redirected=create(0);send(redirected,1,'fire-1');runUntil(redirected,1);const continuous=position(redirected,redirected.cars[0]);send(redirected,1,'C');assert.deepEqual(position(redirected,redirected.cars[0]),continuous);assert.equal(redirected.events[1].assigned,null);runUntil(redirected,8);assert.equal(redirected.cars[0].node,'C');assert.equal(redirected.cars[0].target,null);
assert.equal(dispatch(create(0),1,'unknown').ok,false);
// Enter along the two orthogonal segments, then stay parked after completion.
const access=create(0),car=access.cars[2];send(access,3,'pet-1');advance(access,4);
assert.deepEqual(position(access,car),NODES.B);assert.equal(car.access.direction,'in');
assert.deepEqual(routes(access,car,access.events[0]),[]);
for(const target of ['pet-1','fire-1','A']){const snapshot=structuredClone(access),r=dispatch(access,3,target);assert.equal(r.ok,false);assert.match(r.message,/驶入/);assert.deepEqual(access,snapshot);}
advance(access,4.2);assert.deepEqual(position(access,car),[275.2,160]);
advance(access,4.5);assert.deepEqual(position(access,car),[244,166]);
advance(access,9);assert.equal(car.working,false);assert.equal(car.target,null);assert.deepEqual(position(access,car),[244,228]);
advance(access,10);assert.deepEqual(position(access,car),[244,228]);
// Another site at the same junction still exits via the road before entering.
access.events.push({id:'power-test',type:'power',node:'B',at:10,due:40,edges:[],state:'active',assigned:null});
assert.equal(routes(access,car,access.events.at(-1))[0].seconds,12);
send(access,3,'power-test');assert.deepEqual(position(access,car),[244,228]);assert.equal(car.access.direction,'out');
for(const target of ['power-test','fire-1','B']){const snapshot=structuredClone(access),r=dispatch(access,3,target);assert.equal(r.ok,false);assert.match(r.message,/驶出/);assert.deepEqual(access,snapshot);}
advance(access,10.5);assert.deepEqual(position(access,car),[244,166]);
advance(access,11);assert.deepEqual(position(access,car),NODES.B);assert.equal(car.access.direction,'in');
advance(access,12);assert.deepEqual(position(access,car),[360,230]);assert.equal(car.service,0);assert.equal(car.working,true);
// Expiry mid-entry cannot snap the car back to its road node.
const expired=create(0);expired.events[0].due=4.5;send(expired,3,'pet-1');advance(expired,4.5);
assert.equal(expired.events[0].state,'missed');assert.deepEqual(position(expired,expired.cars[2]),[244,166]);advance(expired,5);
assert.deepEqual(position(expired,expired.cars[2]),[244,228]);assert.equal(expired.cars[2].working,false);
send(expired,3,'B');advance(expired,6);assert.deepEqual(position(expired,expired.cars[2]),NODES.B);assert.equal(expired.cars[2].parked,null);assert.equal(expired.cars[2].target,null);
// Exact arbitrary coordinates: road middle, off-road, bounds, and original nodes.
for(const point of [[405,370],[353.25,411.5],[188.125,91.75],[0,0],[600,540],[300,370]]) {
 const s=create(0),car=s.cars[0],target={point:[...point]},start=position(s,car);
 send(s,1,target);assert.deepEqual(position(s,car),start);
 if(car.target)assert.deepEqual(car.target.point,point);
 assert.deepEqual(routePoints(s,car).at(-1),point);
 target.point[0]=-999; // Caller mutation must not move the destination.
 advance(s,15);assert.deepEqual(position(s,car),point);assert.equal(car.target,null);
 assert.deepEqual(car.parked.site,point);assert.equal(car.working,false);
 assert.deepEqual(routePoints(s,car),[point]);
}
// Far off-road travel is distance-based, never a one-second dash.
const distant=create(0);send(distant,1,{point:[600,540]});
assert(distant.cars[0].target.seconds>2);advance(distant,5);
assert.notDeepEqual(position(distant,distant.cars[0]),[600,540]);advance(distant,8);
assert.deepEqual(position(distant,distant.cars[0]),[600,540]);
// Half of EF takes two seconds normally and six with the traffic jam.
for(const blocked of [false,true]) {
 const s=create(1),car=s.cars[0];if(!blocked)s.events[0].state='done';
 send(s,1,{point:[405,370]});advance(s,1);
 assert(Math.abs(position(s,car)[0]-(300+52.5/(blocked?3:1)))<1e-8);
 advance(s,blocked?6:2);assert.deepEqual(position(s,car),[405,370]);assert.equal(car.target,null);
 // Leaving that road parking spot obeys exactly the same slowdown.
 send(s,1,'E');advance(s,blocked?7:3);
 assert(Math.abs(position(s,car)[0]-(405-52.5/(blocked?3:1)))<1e-8);
 advance(s,blocked?12:4);assert.deepEqual(position(s,car),NODES.E);
}
const repaired=create(1);send(repaired,1,{point:[405,370]});advance(repaired,1);
const jammedX=position(repaired,repaired.cars[0])[0];repaired.events[0].state='done';advance(repaired,2);
assert(Math.abs(position(repaired,repaired.cars[0])[0]-jammedX-52.5)<1e-8);
// A parked car can leave its exact spot, reach a real incident, and work there.
const nextJob=create(0),nextCar=nextJob.cars[0];send(nextJob,1,{point:[353.25,411.5]});advance(nextJob,2);
const parkedPosition=position(nextJob,nextCar);send(nextJob,1,'fire-1');
assert.deepEqual(position(nextJob,nextCar),parkedPosition);
assert.deepEqual(routePoints(nextJob,nextCar).at(-1),siteFor(nextJob.events[1]).site);
advance(nextJob,20);assert.equal(nextJob.events[1].state,'done');
// Reroute on ordinary roads, on the parking road segment, and off road, in either direction.
for(const time of [.5,2.5]) {
 const s=create(0),car=s.cars[0];send(s,1,{point:[405,500]});advance(s,time);
 const before=position(s,car);send(s,1,{point:[188.125,91.75]});
 assert.deepEqual(position(s,car),before);assert.deepEqual(routePoints(s,car)[0],before);
 advance(s,time+.2);const exiting=position(s,car);send(s,1,{point:[320.5,400.25]});
 assert.deepEqual(position(s,car),exiting);advance(s,15);
 assert.deepEqual(position(s,car),[320.5,400.25]);assert.equal(car.target,null);
}
const coordinateReroute=create(0);send(coordinateReroute,1,'fire-1');advance(coordinateReroute,1);
const roadPosition=position(coordinateReroute,coordinateReroute.cars[0]);send(coordinateReroute,1,{point:[405,370]});
assert.deepEqual(position(coordinateReroute,coordinateReroute.cars[0]),roadPosition);
assert.equal(coordinateReroute.events[1].assigned,null);advance(coordinateReroute,8);
assert.deepEqual(position(coordinateReroute,coordinateReroute.cars[0]),[405,370]);
const accessReroute=create(0);send(accessReroute,1,{point:[405,500]});advance(accessReroute,1.5);
const accessPosition=position(accessReroute,accessReroute.cars[0]);send(accessReroute,1,'fire-1');
assert.deepEqual(position(accessReroute,accessReroute.cars[0]),accessPosition);advance(accessReroute,21);
assert.equal(accessReroute.events[1].state,'done');
// Reject malformed points without touching any state, including an existing assignment.
const invalid=create(0);send(invalid,1,'fire-1');advance(invalid,.5);
for(const target of [null,undefined,{},[],{point:null},{point:[1]},{point:[1,2,3]},{point:new Array(2)},...[[NaN,1],[1,Infinity],[-1,1],[601,1],[1,-1],[1,541],['2',3],[2,null]].map(point=>({point}))]) {
 const snapshot=structuredClone(invalid);assert.equal(dispatch(invalid,1,target).ok,false);assert.deepEqual(invalid,snapshot);
}
for(const [id,mode] of [[99,'fast'],[1,'missing']]) {
 const snapshot=structuredClone(invalid);assert.equal(dispatch(invalid,id,{point:[405,370]},mode).ok,false);assert.deepEqual(invalid,snapshot);
}
const workLock=create(0);send(workLock,3,'pet-1');advance(workLock,5);
const locked=structuredClone(workLock);assert.equal(dispatch(workLock,3,{point:[405,370]}).ok,false);assert.deepEqual(workLock,locked);
// Preview only the remaining segments, never draw a trip back to a passed entrance.
const preview=create(0),previewCar=preview.cars[0];send(preview,1,{point:[405,500]});
assert.deepEqual(routePoints(preview,previewCar).slice(-2),[[405,370],[405,500]]);
advance(preview,2.5);assert.deepEqual(routePoints(preview,previewCar),[position(preview,previewCar),[405,500]]);
send(preview,1,'fire-1');assert.deepEqual(routePoints(preview,previewCar).slice(1,3),[[405,370],NODES.E]);
advance(preview,3.5);assert.deepEqual(routePoints(preview,previewCar)[1],NODES.E);
assert.equal(Object.keys(SITES).length,8);
for(const site of Object.values(SITES))assert.equal(siteFor(site),site);
assert.deepEqual(siteFor({type:'pet',node:'C'}),siteFor({type:'pet',node:'C'}));assert.notDeepEqual(siteFor({type:'pet',node:'C'}).site,NODES.C);
console.log(JSON.stringify({passed:true,levels,cooperation:{helpedFire:19,unsupportedFire:'missed at 23s'},routeChoice:{shortcutFinish:19,detourMiss:22,detourWithoutDeadline:23,unsupportedShortcutWithoutDeadline:25,shortcutLoss:shortcut.loss,detourLoss:detour.loss},checks:['deadline equality','one tick late','no road service','entry/exit continuity and locks','parked after completion','same-node site transfer','expiry during entry','deterministic fallback','reroute physical continuity','busy/rejected commands','max slowdown','repair after expiry','deterministic replay','idle failure','district standby and reassignment','route choice while departing']},null,2));
