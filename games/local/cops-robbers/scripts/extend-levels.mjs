import { writeFileSync } from 'node:fs';
import { levels, chapters } from '../src/levels.js';
import { solutions } from '../src/solutions.js';
import { prepareLevel, initialState, solve, step } from '../src/engine.js';
let seed=9252601;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const shuffled=items=>items.map(value=>({value,key:random()})).sort((a,b)=>a.key-b.key).map(item=>item.value);
const raw=levels.slice(0,60).map(({adj,dist,...map})=>map);
const answers=Object.fromEntries(Object.entries(solutions).filter(([id])=>Number(id)<=60));
const seen=new Set(raw.map(map=>JSON.stringify(map.edges)));
for(let id=61;id<=100;id++){
 const minimum=20+Math.floor((id-61)/5); let found;
 for(let layoutAttempt=0;layoutAttempt<120&&!found;layoutAttempt++){
  const size=9+Math.floor((id-61)/14)+(layoutAttempt%2), nodes=[235,140].flatMap(radius=>Array.from({length:size},(_,i)=>({x:Math.round(300+Math.cos(i*Math.PI*2/size-Math.PI/2)*radius),y:Math.round(300+Math.sin(i*Math.PI*2/size-Math.PI/2)*radius)})));
  const edges=[];
  for(let i=0;i<size;i++){edges.push([i,(i+1)%size],[size+i,size+(i+1)%size]);if(random()<.65)edges.push([i,size+i]);}
  for(let i=2;i<size-1;i++)if(random()<.25)edges.push([size,size+i]);
  if(seen.has(JSON.stringify(edges)))continue;
  const border=nodes.flatMap(({x,y},i)=>x<=100||x>=500||y<=100||y>=500?[i]:[]);
  for(let trial=0;trial<80&&!found;trial++){
   const exits=shuffled(border).slice(0,2), positions=shuffled(nodes.map((_,i)=>i).filter(i=>!exits.includes(i)));
   const cops=positions.slice(0,3), robbers=positions.slice(3,5+Number(id>80));
   const map=prepareLevel({id,chapter:id<=80?5:6,name:`${id<=80?'立体环街':'终极迷城'} ${id<=80?id-60:id-80}`,tip:'多重回环与长距换防：先守出口，再分路收紧包围。挑战仅保证存在击败固定电脑策略的走法。',nodes,edges,cops,robbers,exits,par:0});
   if(robbers.some(n=>map.adj[n].every(p=>cops.includes(p))))continue;
   let idle=initialState(map);for(let turn=0;turn<map.nodes.length&&!idle.robbers.includes(-2)&&idle.robbers.some(n=>n>=0);turn++)idle=step(map,idle,idle.cops).state;
   if(!idle.robbers.includes(-2))continue;
   const solution=solve(map,initialState(map),{maxStates:1600,maxDepth:minimum+9});
   if(!solution||solution.length<minimum)continue;
   let cursor=initialState(map); const moved=new Set();
   for(const plan of solution){plan.forEach((node,i)=>{if(cursor.cops[i]!==node)moved.add(i)});cursor=step(map,cursor,plan).state;}
   if(moved.size!==cops.length)continue;
   const {adj,dist,...clean}=map;clean.par=solution.length;found={map:clean,solution};
  }
 }
 if(!found)throw new Error(`No verified map ${id}`);
 raw.push(found.map);answers[id]=found.solution;seen.add(JSON.stringify(found.map.edges));
 console.log(`${id}: ${found.map.nodes.length} nodes, ${found.map.edges.length} edges, ${found.solution.length} turns`);
}
const districts=[...chapters.slice(0,5),{name:'立体环街',subtitle:'长距换防，双环捷径',color:'#7a9da9'},{name:'终极迷城',subtitle:'三目标、多环路、远距合围',color:'#9b87a4'}];
writeFileSync(new URL('../src/levels.js',import.meta.url),`import { prepareLevel } from './engine.js';\nexport const chapters = ${JSON.stringify(districts,null,2)};\nexport const levels = ${JSON.stringify(raw,null,2)}.map(prepareLevel);\n`);
writeFileSync(new URL('../src/solutions.js',import.meta.url),`// All 100 routes are replayed by scripts/check-levels.mjs.\nexport const solutions = ${JSON.stringify(answers,null,2)};\n`);
