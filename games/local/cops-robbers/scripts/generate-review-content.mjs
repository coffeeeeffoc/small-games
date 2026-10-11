import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { prepareLevel, initialState, searchSolution, step } from '../src/engine.js';

// Deterministic authoring tool. Search runs here, never while opening the game.
let seed = 20261011;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const shuffle = values => values.map(value => ({ value, key: random() })).sort((a,b) => a.key-b.key).map(item => item.value);
const seen = new Set();
const clean = ({adj,dist,...map}) => map;
const output = (name,exports) => writeFileSync(new URL(`../src/${name}`,import.meta.url), `// Authored and replayed by scripts/generate-review-content.mjs. Keep IDs stable.\n${Object.entries(exports).map(([key,value]) => `export const ${key} = ${JSON.stringify(value)};`).join('\n')}\n`);
function graph(size, quick) {
  let nodes, edges;
  if (quick) {
    const width = size, height = 3;
    nodes = Array.from({length:width*height},(_,i)=>({x:80+(i%width)*440/(width-1),y:80+Math.floor(i/width)*220}));
    const all = [];
    for(let i=0;i<nodes.length;i++) {if(i%width<width-1)all.push([i,i+1]);if(i<width*(height-1))all.push([i,i+width]);}
    const parent = nodes.map((_,i)=>i), root = i => {while(parent[i]!==i)i=parent[i];return i;};
    edges = []; const extras = [];
    for(const [a,b] of shuffle(all)) {if(root(a)!==root(b)){parent[root(a)]=root(b);edges.push([a,b]);}else extras.push([a,b]);}
    edges.push(...extras.slice(0,1+Math.floor(random()*3)));
  } else {
    nodes = [230,140].flatMap(radius => Array.from({length:size},(_,i)=>({x:Math.round(300+Math.sin(i*Math.PI*2/size)*radius),y:Math.round(300-Math.cos(i*Math.PI*2/size)*radius)})));
    edges=[];
    for(let i=0;i<size;i++) {edges.push([i,(i+1)%size],[size+i,size+(i+1)%size]);if(random()<.65)edges.push([i,size+i]);}
    // Fan roads inside the central ring share a junction and never cross.
    for(let i=2;i<size-1;i++)if(random()<.2)edges.push([size,size+i]);
  }
  edges = edges.map(([a,b])=>a<b?[a,b]:[b,a]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  return {nodes,edges};
}
function authored(id, ordinal, kind) {
  const quick=kind==='quick', relay=kind==='relay';
  const size = quick ? ordinal<45?3:4 : relay ? 6+Math.floor(ordinal/40) : 11+Number(ordinal>10);
  const minimum = quick ? 3+Math.floor(ordinal/30) : relay ? 5+Math.floor(ordinal/25) : Math.min(14,10+Math.floor(ordinal/5));
  const maximum = quick ? minimum+3 : minimum+6;
  for(let attempt=0;attempt<120000;attempt++) {
    const {nodes,edges}=graph(size,quick);
    const border=nodes.flatMap(({x,y},i)=>x<=100||x>=500||y<=100||y>=500?[i]:[]);
    const exits=shuffle(border).slice(0,quick?1:2);
    const positions=shuffle(nodes.map((_,i)=>i).filter(i=>!exits.includes(i)));
    const guardCandidates = exits.map(exit=>shuffle(edges.flatMap(([a,b])=>a===exit?[b]:b===exit?[a]:[]).filter(node=>!exits.includes(node))));
    const guards=[];
    for(const candidates of guardCandidates) {const guard=candidates.find(node=>!guards.includes(node));if(guard!==undefined)guards.push(guard);}
    const cops=quick?positions.slice(0,ordinal<45?2:3):[...guards,...positions.filter(node=>!guards.includes(node))].slice(0,3);
    const robbers=shuffle(positions.filter(node=>!cops.includes(node))).slice(0,(ordinal>70&&quick||ordinal>60&&relay||!quick&&!relay?2:1));
    const signature=JSON.stringify({nodes,edges,cops:[...cops].sort(),robbers:[...robbers].sort(),exits:[...exits].sort()});
    if(seen.has(signature))continue;
    const map=prepareLevel({id,chapter:quick||relay?Math.min(7,Math.floor((ordinal-1)/15)):7,name:`${quick?'战术收网':relay?'换防街区':'远港合围'} ${String(ordinal).padStart(3,'0')}`,tip:quick?'先看清逃生口与岔路，分工收紧。步数紧张时可撤销重新安排。':'先安排出口接防，再从环路两侧收紧；别让留守队员提前离岗。',nodes,edges,cops,robbers,exits,par:0});
    if(!map.dist[0].every(Number.isFinite)||robbers.some(n=>map.adj[n].every(p=>cops.includes(p))))continue;
    if(robbers.some(start=>{const reached=new Set([start]),pending=[start];for(let i=0;i<pending.length;i++)for(const next of map.adj[pending[i]])if(!cops.includes(next)&&!reached.has(next)){reached.add(next);pending.push(next);}return !exits.some(n=>reached.has(n));}))continue;
    let idle=initialState(map);
    for(let i=0;i<nodes.length&&!idle.robbers.includes(-2)&&idle.robbers.some(n=>n>=0);i++)idle=step(map,idle,idle.cops).state;
    if(!idle.robbers.includes(-2))continue;
    const answer=searchSolution(map,initialState(map),{maxStates:quick?8000:relay?25000:32000,maxDepth:maximum,relayLast:relay?-1:null});
    if(answer.status!=='solved'||answer.plans.length<minimum)continue;
    let cursor=initialState(map);const moved=new Set();
    for(const plan of answer.plans){plan.forEach((node,i)=>{if(cursor.cops[i]!==node)moved.add(i);});cursor=step(map,cursor,plan).state;}
    if(moved.size!==cops.length)continue;
    assert.ok(cursor.robbers.every(n=>n===-1));
    map.par=answer.plans.length;
    if(quick){map.mode='quick';map.turnLimit=map.par+Number(ordinal<60);map.lesson=ordinal<45?'先守口，再收网。':ordinal<75?'分守岔路，安排轮流推进。':'分清两个目标，留住另一侧出口。';}
    seen.add(signature); console.log(`${kind} ${id}: ${map.nodes.length} nodes, shortest ${map.par}, searched ${answer.examined}`);
    return {map:clean(map),solution:answer.plans};
  }
  throw new Error(`Cannot author ${kind} ${id}`);
}
const extraLevels=[], extraSolutions={};
for(let id=101;id<=120;id++){const item=authored(id,id-100,'standard');extraLevels.push(item.map);extraSolutions[id]=item.solution;output('extended-content.js',{extraLevels,extraSolutions});}
output('extended-content.js',{extraLevels,extraSolutions});
const relayLegacy=[1,4,7,12,16,27], relayExtra=[],relayExtraSolutions={};
let ordinal=7;
for(let id=1;id<=120;id++){if(relayLegacy.includes(id))continue;const item=authored(id,ordinal++,'relay');relayExtra.push(item.map);relayExtraSolutions[id]=item.solution;output('relay-content.js',{relayExtra,relayExtraSolutions});}
output('relay-content.js',{relayExtra,relayExtraSolutions});
const quickExtra=[],quickExtraSolutions={};
for(let id=4;id<=120;id++){const item=authored(id,id,'quick');quickExtra.push(item.map);quickExtraSolutions[id]=item.solution;output('quick-content.js',{quickExtra,quickExtraSolutions});}
output('quick-content.js',{quickExtra,quickExtraSolutions});
