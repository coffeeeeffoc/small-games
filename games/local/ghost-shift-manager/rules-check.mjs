import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createGame,command,tick,effects,forecast,LEVELS,GUESTS} from './rules.js';
import {strategy} from './docs/tune.mjs';
const replays=JSON.parse(readFileSync(new URL('./docs/replays.json',import.meta.url),'utf8'));
function replay(route){const s=createGame(route.level);for(const a of route.actions){tick(s,a.t-s.t);assert.equal(command(s,a.kind,a.target,a.delay),true,`Rejected replay action ${JSON.stringify(a)}`);}tick(s,120-s.t);return s;}
const report={date:'2026-09-27',wins:[],contrasts:{},baselines:[]};
for(const r of replays){const a=replay(r),b=replay(r);assert.equal(a.status,'won');assert.deepEqual(a,b);assert.equal(a.t,r.wonAt);report.wins.push({night:r.level+1,time:a.t,actions:a.actions.length,target:LEVELS[r.level].target});}
const selfie=createGame(),miss=createGame();command(selfie,0,1,0);command(miss,0,1,8);tick(selfie,8);tick(miss,8);
assert.equal(selfie.events.find(e=>e.kind==='scare').hits[0].active,true);assert.equal(miss.events.find(e=>e.kind==='scare').hits[0].active,false);assert.ok(selfie.guests[1].happy>6);assert.equal(miss.guests[1].happy,0);report.contrasts.selfie={hitFear:selfie.guests[1].fear,missFear:miss.guests[1].fear,hitHappy:selfie.guests[1].happy,missHappy:miss.guests[1].happy};
function accident(save){const s=createGame();command(s,1,0,0);command(s,2,1,4);tick(s,4);assert.ok(s.guests[0].fear>=GUESTS[0].red);if(save)command(s,'bell',0);tick(s,6);return s;}
const fail=accident(false),saved=accident(true);assert.equal(fail.status,'lost');assert.match(fail.reason,/甜点师/);assert.equal(saved.status,'playing');assert.equal(saved.guests[0].packing,0);report.contrasts.pipe={failureAt:fail.t,savedFear:saved.guests[0].fear};
const cancel=createGame();command(cancel,1,0);command(cancel,2,1,4);tick(cancel,3);assert.ok(command(cancel,'cancel',2));tick(cancel,7);assert.equal(cancel.status,'playing');assert.equal(cancel.ghosts[2].ready,0);assert.equal(cancel.events.filter(e=>e.kind==='scare').length,1);
for(let l=0;l<3;l++)for(let ghost=0;ghost<3;ghost++)for(let target=0;target<3;target++)for(const delay of [0,4,8]){const a=createGame(l);if(l===2)command(a,'bell',0);command(a,(ghost+1)%3,(target+1)%3,4);const prediction=forecast(a,ghost,target,delay),b=structuredClone(a);assert.ok(command(b,ghost,target,delay));tick(b,delay);assert.deepEqual(prediction.fears,b.guests.map(g=>g.fear));}
assert.notDeepEqual(effects(createGame(0),2,1).map(x=>x.guest),effects(createGame(1),2,1).map(x=>x.guest));
const invalid=createGame();const original=structuredClone(invalid);for(const a of [[0,0,2],[8,0,0],[0,9,0],['bell',-1,0],['cancel',7,0]])assert.equal(command(invalid,...a),false);assert.deepEqual(invalid,original);assert.throws(()=>tick(invalid,-1));
function randomPolicy(level,seed){const s=createGame(level);let n=seed;const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/2**32;};while(s.status==='playing'){for(let i=0;i<3;i++)command(s,i,Math.floor(random()*3),[0,4,8][Math.floor(random()*3)]);const danger=s.guests.findIndex((g,i)=>g.fear>=GUESTS[i].red);if(danger>=0)command(s,'bell',danger);tick(s,1);}return s;}
for(let l=0;l<3;l++){const weak=strategy(l,true),random=Array.from({length:100},(_,i)=>randomPolicy(l,i+1));const wins=random.filter(s=>s.status==='won').length;assert.equal(weak.status,'lost');assert.ok(wins<20,'Random dumping too reliable');report.baselines.push({night:l+1,weakLookahead:weak.status,randomWins:wins,trials:100,randomIncludesEmergencyBell:true});}
report.checks=['deterministic three-night wins','selfie now vs deliberately missed','pipe causes real checkout','same pipe rescued by bell','cancel avoids spill without cooldown','81 forecasts equal real effects with pending jobs','room adjacency differs','invalid inputs rejected'];
writeFileSync(new URL('./docs/rules-report.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
