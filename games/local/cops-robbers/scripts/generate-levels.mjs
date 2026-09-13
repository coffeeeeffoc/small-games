import { writeFileSync } from 'node:fs';
import { prepareLevel, initialState, solve, step } from '../src/engine.js';

const chapters = [
  { name: '新手小巷', subtitle: '学会封口，第一次漂亮出击', color: '#efba70' },
  { name: '街角市场', subtitle: '岔路之间，留下一个守路口的人', color: '#e98978' },
  { name: '环形公园', subtitle: '两边包抄，让绕圈无处可绕', color: '#82af83' },
  { name: '码头街区', subtitle: '守住窄桥，逐片收紧包围', color: '#78adb8' },
  { name: '城市总动员', subtitle: '小队集合，把整座城市串起来', color: '#a193be' },
];
const raw = [];
raw.push({ id:1, chapter:0, name:'抢先封口', tip:'红门通向城外！点警察，再点下方路口，抢先截断逃生路。', nodes:[[80,300],[190,300],[300,300],[410,300],[520,300],[190,100]].map(([x,y])=>({x,y})), edges:[[0,1],[1,2],[2,3],[3,4],[1,5]], cops:[5], robbers:[2], exits:[0], par:3 });

// Each sketch changes the actual road graph. Digits identify usable grid intersections.
function grid(rows, omit = []) {
  const height = rows.length, width = Math.max(...rows.map(row => row.length));
  const nodes = [], lookup = new Map();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (rows[y][x] === 'o') {
    lookup.set(`${x},${y}`, nodes.length);
    nodes.push([80 + x * 440 / (width - 1), 80 + y * 440 / (height - 1)]);
  }
  const edges = [];
  for (const [key, from] of lookup) {
    const [x,y] = key.split(',').map(Number);
    for (const other of [`${x+1},${y}`, `${x},${y+1}`]) if (lookup.has(other) && !omit.includes(`${key}-${other}`)) edges.push([from,lookup.get(other)]);
  }
  return { nodes, edges };
}
const catalog = [
  [0,'别让他出城',['.o..','oooo','..o.'],1,1],
  [0,'两侧收网',['ooo','o.o','ooo'],2,1],
  [0,'抢占岔口',['o.o','ooo','.o.'],2,1],
  [0,'抄近路',['oooo','o.o.','ooo.'],2,1],
  [0,'后门危机',['.oo','ooo','o.o'],2,1],
  [0,'绕路截击',['oooo','o..o','oooo'],2,1],
  [0,'两个方向',['o.o','ooo','o.o'],2,2],
  [0,'换人把守',['oooo','.oo.','..o.'],2,1],
  [0,'环外的门',['ooo','o.o','ooo','.o.'],2,2],
  [0,'先守再追',['oo.o','oooo','o...'],2,2],
  [0,'街区毕业',['oooo','o.oo','ooo.'],2,2],
  // Market: trees, crossroads, shortcuts, and an increasing number of independent branches.
  [1,'十字摊位',['.ooo','oooo','o...','oo..'],2,1,'站住中心路口，选择一条短巷收网。'],
  [1,'早点铺后门',['oooo','.o..','.ooo'],2,1,'一位守住岔口，另一位把小偷赶向尽头。'],
  [1,'两条岔路',['o.o','ooo','o.o'],2,2,'先确认谁负责哪条巷子，再一起出发。'],
  [1,'串起小巷',['oooo','o.o.','ooo.'],2,2,'留一个人挡住回头路，别一起绕圈。'],
  [1,'中央花摊',['.oo.','oooo','.oo.'],2,2,'小偷喜欢出口多的地方，提前站住它的下一步。'],
  [1,'三路分工',['o.o.o','ooooo','o...o','oo..o'],3,2,'把守中央路口的警察当作一道活动的墙。'],
  [1,'糕点铺夹击',['oooo','o..o','oooo','..o.'],2,2,'先切开环路，再从两头逼近。'],
  [1,'后街近路',['oooo','oo.o','.ooo'],3,2,'多出的近路，也能成为警察换防的路线。'],
  [1,'忙碌菜市场',['o.o.o','ooooo','o.o.o'],3,3,'先清理一侧，再让腾出的警察去支援。'],
  [1,'双岔连廊',['ooo.','.ooo','ooo.','.o..'],3,3,'窄路把几片区域串起来，先控制连接处。'],
  [1,'收摊时刻',['ooooo','..o..','ooooo'],2,3,'一人守住连接处，一人逐个封住短巷。'],
  [1,'市场总巡逻',['oooo','oo.o','oooo','o.o.'],3,3,'先分区，再收紧；小偷聚集后可以一起抓。'],
  // Park: real cycles of different sizes, chords, and attached branches.
  [2,'湖边一圈',['oooo','o..o','oooo'],2,2,'环路的两头都有人，包围圈才能慢慢缩小。'],
  [2,'林间出口',['oooo','o..o','oooo','.o..'],2,2,'守住通往环外的岔口，再收紧包围。'],
  [2,'花园小环',['oooo','oo.o','oooo'],3,2,'利用中间的短连接，提前换到另一条路。'],
  [2,'双亭连道',['oo.oo','ooooo','oo.oo'],3,2,'连接两个环的路口，是最有价值的位置。'],
  [2,'池塘与长廊',['ooooo','o...o','ooooo','..o..'],2,3,'留住一端，另一端持续推进；别让小偷绕回去。'],
  [2,'树影穿梭',['oooo','o.oo','oooo','.o.o'],3,3,'先把大环分开，小环就好处理。'],
  [2,'三座凉亭',['oo.oo','ooooo','oo.oo','.ooo.'],4,3,'几个小环之间的桥头，值得留人把守。'],
  [2,'湖心捷径',['ooooo','o.o.o','ooooo'],3,3,'中间的小路可以换防，也会让小偷转移。'],
  [2,'花圃迷阵',['oooo','oooo','o..o','oooo'],4,3,'先占住几个连接口，再从外围逐步清理。'],
  [2,'林地环线',['ooooo','o.o.o','ooo.o','..ooo'],3,3,'看清哪几条路属于同一个环，分开安排包抄。'],
  [2,'野餐散场',['ooooo','o...o','ooooo','o...o'],3,2,'两条短支路是天然的收网地点。'],
  [2,'公园闭园',['ooooo','o.o.o','ooooo','o.o.o'],4,3,'同时控制两条环路，让小偷逐步挤到一起。'],
  // Docks: two districts connected through a narrow central road.
  [3,'一座窄桥',['oo.oo','ooooo','o...o'],3,2,'中央桥头留人，左右两片区域分别处理。'],
  [3,'仓库后门',['ooo..','o.ooo','ooo.o','....o'],3,2,'先控制仓库出口，再让警察从两侧合围。'],
  [3,'两岸短巷',['o...o','oo.oo','ooooo','o...o'],3,3,'守桥的人不动，队友也能把两岸清干净。'],
  [3,'货箱通道',['ooo.o','o.ooo','ooo.o','..o..'],3,3,'一旦抓到一组，就把多出的警察调往另一侧。'],
  [3,'渡口换防',['oo.oo','oo.oo','.ooo.','.o.o.'],3,3,'先想好交接位置，再让守桥的警察离开。'],
  [3,'双仓连桥',['oo.oo','ooooo','oo.oo','o...o'],4,3,'每个仓库都有环路，要安排两侧同时推进。'],
  [3,'栈桥尽头',['ooooo','o.o.o','o.o.o','..o..'],3,3,'长栈桥有尽头，先把通向其他区域的路封住。'],
  [3,'码头三岔',['ooo.o','o.ooo','ooo.o','o...o'],4,4,'不同出口都需要人，抓完后再交换岗位。'],
  [3,'旧船坞',['ooo..','o.ooo','ooo.o','..ooo'],3,4,'两侧的环路互相连着，桥头一松就会跑过去。'],
  [3,'货场包围',['oo.oo','ooooo','o...o','oo.oo'],4,4,'小偷分得再散，也可以一片区域一片区域清理。'],
  [3,'夜航之前',['o...o','ooooo','.o.o.','.o.o.'],3,3,'把小偷赶上短栈桥，抓完再回到主路。'],
  [3,'封港行动',['ooo.o','o.ooo','ooo.o','o.ooo'],4,4,'先锁住跨区路线，再把包围圈分成几个小块。'],
  // City: larger connected neighborhoods, mixed rings, hubs and branches.
  [4,'三街会合',['o.o.o','ooooo','o.o.o','..o..'],3,3,'先看中央路口连接了什么，再决定清理顺序。'],
  [4,'路口接力',['oooo.','o.ooo','ooo.o','..ooo'],3,3,'一位站稳，其他人绕行；交接后再继续前进。'],
  [4,'社区巡逻',['ooo.o','o.ooo','ooooo','o.o.o'],4,3,'先把几片区域分开，再安排每支小队负责一片。'],
  [4,'双环夹巷',['oo.oo','ooooo','oo.oo','.o.o.','.ooo.'],4,4,'先守住上下两个连接，再收紧左右两个环。'],
  [4,'街心大花园',['ooooo','o.o.o','ooooo','o.o.o','..o..'],3,4,'人数不多时，更需要把小偷赶向容易封口的地方。'],
  [4,'穿街过巷',['ooooo','oo.oo','ooooo','o.o.o'],4,4,'捷径让换防更快，别让整队堵在同一片街区。'],
  [4,'广场四角',['oo.oo','ooooo','o.o.o','ooooo'],4,4,'先缩小活动范围，再让多位警察靠向同一目标。'],
  [4,'小队大集合',['ooooo','o.o.o','ooooo','oo.oo'],5,4,'给五位警察各安排一个位置，先堵连接再收网。'],
  [4,'穿过老城区',['ooo.o','o.ooo','ooooo','o.o.o','ooo..'],4,5,'警察可以继续支援，先抓一组就能打开局面。'],
  [4,'五路出击',['ooooo','oo.oo','ooooo','o.o.o','..o..'],5,5,'同时安排几条路线，让各个区域的出口都有照应。'],
  [4,'城市晚安',['o.o.o','ooooo','o.o.o','ooooo'],4,3,'把小偷赶向支路，留一点人手准备最后的夹击。'],
  [4,'最后的围捕',['ooooo','ooooo','oo.oo','ooooo','ooooo'],5,5,'用上所有技巧：守口、换防、包抄，再逐片收网。'],
];

let seed = 2026091202;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const shuffle = values => {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
};
const solutions = {};
for (const level of raw) {
  const prepared = prepareLevel(level), solution = solve(prepared, initialState(prepared), { maxStates: 6000 });
  if (!solution) throw new Error(`No solution: ${level.name}`);
  level.par = solution.length; solutions[level.id] = solution;
  console.log(`${level.id} ${level.name}: ${solution.length} turns`);
}
writeOutputs();

function canEscape(level, node, cops) {
  const visited = new Set([node]), queue = [node];
  for (let i=0;i<queue.length;i++) {
    if (level.exits.includes(queue[i])) return true;
    for (const next of level.adj[queue[i]]) if (!cops.includes(next) && !visited.has(next)) { visited.add(next); queue.push(next); }
  }
  return false;
}

for (const [chapter,name,rows,oldM,oldN] of catalog) {
  const { nodes, edges } = grid(rows);
  if (chapter > 0 && nodes.length < 8) for (let i=edges.length-1;i>=0;i--) {
    const [a,b] = edges[i];
    const middle = nodes.length;
    nodes.push([(nodes[a][0]+nodes[b][0])/2,(nodes[a][1]+nodes[b][1])/2]);
    edges.splice(i,1,[a,middle],[middle,b]);
  }
  let chosen;
  const inChapter = raw.length % 12;
  const minimum = chapter === 0 ? (inChapter<3?2:3+Number(inChapter>7)) : 4+chapter+Math.floor(inChapter/6);
  const m = Math.min(oldM,nodes.length<11 || edges.length<nodes.length ? 2 : 4), n = Math.min(oldN,3);
  const exitCount = chapter === 0 ? 1+Number(inChapter>7 && inChapter%2===1) : chapter < 3 ? 1+Number(inChapter%3!==0) : 2+Number(inChapter%3===2);
  const border = nodes.map((point,i)=>point.some(value=>value<=100||value>=500)?i:-1).filter(i=>i>=0);
  const diagnostic = { reachable:0, solved:0, lengths:{}, teamwork:0, separate:0 };
  for (let attempt = 0; attempt < (nodes.length<=13?12000:3000); attempt++) {
    const exits = shuffle(border).slice(0,exitCount);
    const positions = shuffle(nodes.map((_, i) => i).filter(i=>!exits.includes(i)));
    const cops = positions.slice(0,m), robbers = positions.slice(m,m+n);
    const tip = chapter === 0 ? '点警察，再点相邻路口立即移动。每动一人，小偷都会跑一步，先封住红门的路。' : exitCount > 1 ? '留意每一扇红门。先截断最紧急的逃生路，再调动队友包抄；放跑一名就失败。' : '先截断通往红门的路，再收紧包围。每次只动一位警察，留守与换防同样重要。';
    const candidate = prepareLevel({ id: raw.length+1, chapter,name,tip,nodes: nodes.map(([x,y]) => ({x,y})),edges,cops,robbers,exits,par:0 });
    if (candidate.dist[0].some(distance => !Number.isFinite(distance))) throw new Error(`Disconnected map: ${name}`);
    if (robbers.some(node => !canEscape(candidate,node,cops))) continue;
    diagnostic.reachable++;
    const solution = solve(candidate, initialState(candidate), { maxStates: 1800, maxDepth: 30 });
    if (!solution) continue;
    diagnostic.solved++; diagnostic.lengths[solution.length] = (diagnostic.lengths[solution.length]||0)+1;
    if (solution.length < minimum || solution.length > minimum + 8) continue;
    let cursor = initialState(candidate), captureRounds = 0;
    const moved = new Set();
    for (const plan of solution) {
      plan.forEach((node,index)=>{ if (node!==cursor.cops[index]) moved.add(index); });
      const result = step(candidate,cursor,plan); cursor = result.state;
      if (result.caught.length) captureRounds++;
    }
    if (chapter > 0 && moved.size < 2) { diagnostic.teamwork++; continue; }
    if (n>1 && captureRounds < 2 && (chapter === 0 || inChapter%6!==0)) { diagnostic.separate++; continue; }
    chosen = { candidate, solution }; break;
  }
  if (!chosen) throw new Error(`No solution generated: ${name} ${JSON.stringify(diagnostic)}`);
  const { adj, dist, ...level } = chosen.candidate;
  level.par = chosen.solution.length;
  let state = initialState(chosen.candidate);
  for (const plan of chosen.solution) state = step(chosen.candidate,state,plan).state;
  if (state.robbers.some(node => node !== -1)) throw new Error(`Replay failed: ${name}`);
  raw.push(level); solutions[level.id] = chosen.solution;
  console.log(`${level.id} ${name}: ${level.par} turns, ${nodes.length} nodes / ${edges.length} roads, ${m} cops / ${n} robbers / ${exitCount} exits`);
  writeOutputs();
}
function writeOutputs() {
  writeFileSync(new URL('../src/levels.js', import.meta.url), `import { prepareLevel } from './engine.js';\n\nexport const chapters = ${JSON.stringify(chapters,null,2)};\n\nexport const levels = ${JSON.stringify(raw,null,2)}.map(prepareLevel);\n`);
  writeFileSync(new URL('../src/solutions.js', import.meta.url), `// Verified by scripts/check-levels.mjs using the same rules as the game.\nexport const solutions = ${JSON.stringify(solutions,null,2)};\n`);
}
writeOutputs();
