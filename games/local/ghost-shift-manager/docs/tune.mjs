import {createGame,command,tick,GHOSTS,GUESTS,LEVELS} from '../rules.js';
import {writeFileSync} from 'node:fs';
function value(s) {
 if(s.status==='lost') return -10000;
 if(s.status==='won') return 10000;
 return s.guests.reduce((v,g,i)=>v+g.happy*5-Math.max(0,GUESTS[i].low+.4-g.fear)*2-Math.max(0,g.fear-GUESTS[i].high)*6-(g.fear>=GUESTS[i].red?100:0),0);
}
export function strategy(level,weak=false) {
 const s=createGame(level);
 while(s.status==='playing') {
   const stay=structuredClone(s);tick(stay,8);let best=value(stay), chosen=null;
   for(const kind of weak?[0,'bell']:[0,1,2,'bell']) for(let target=0;target<3;target++) for(const delay of kind==='bell'?[0]:[0,4,8]) {
     const c=structuredClone(s); if(!command(c,kind,target,delay))continue;
     tick(c,8);const v=value(c)-(kind==='bell'?3:.8);
     if(v>best+.01){best=v;chosen={kind,target,delay};}
   }
   if(chosen)command(s,chosen.kind,chosen.target,chosen.delay);
   tick(s,1);
 }
 return s;
}
if(process.argv[1]?.endsWith('tune.mjs')) {
 const wins=LEVELS.map((_,i)=>strategy(i));
 console.log(wins.map(s=>({level:s.level,status:s.status,t:s.t,happy:s.guests.map(g=>Math.round(g.happy)),actions:s.actions.length})));
 console.log('weak',LEVELS.map((_,i)=>{const s=strategy(i,true);return [s.status,s.t,s.guests.map(g=>Math.round(g.happy))]}));
 if(wins.every(s=>s.status==='won'))writeFileSync(new URL('./replays.json',import.meta.url),JSON.stringify(wins.map(s=>({level:s.level,wonAt:s.t,actions:s.actions})),null,2));
}
