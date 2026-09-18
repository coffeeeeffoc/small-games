import { writeFileSync } from 'node:fs';
import { prepareLevel, initialState, solve, step } from '../src/engine.js';
import { reducedSquadCanWin } from './teamwork.mjs';

const chapters = [
  { name: '连环小巷', subtitle: '三人分守岔路，少堵一条就能突围', color: '#efba70' },
  { name: '街角市场', subtitle: '内街外街都有捷径，守口与包抄轮流交接', color: '#e98978' },
  { name: '环形公园', subtitle: '多环相连，先截逃生路再收紧包围', color: '#82af83' },
  { name: '码头街区', subtitle: '两岸多桥，追赶时也别放空另一侧', color: '#78adb8' },
  { name: '城市总动员', subtitle: '四路合围，每一位警察都要守住一条退路', color: '#a193be' },
];
const names = [
  ['三路合围','内外夹击','巷口接力','绕到背后','岔路换防','缺口危机','回环追逃','两门之间','街心穿行','不能漏岗','转角包抄','小巷总动员'],
  ['十字摊位','早点铺后街','双街追逃','串起小巷','中央花摊','三路分工','糕点铺夹击','后街近路','忙碌菜市场','双环连廊','收摊时刻','市场总巡逻'],
  ['湖边双环','林间出口','花园捷径','双亭连道','池塘与长廊','树影穿梭','凉亭换防','湖心捷径','花圃迷阵','林地环线','野餐散场','公园闭园'],
  ['两岸多桥','仓库后门','两岸回廊','货箱通道','渡口换防','双仓连桥','栈桥回环','码头三岔','旧船坞','货场包围','夜航之前','封港行动'],
  ['四路会合','路口接力','社区巡逻','双环夹巷','街心大花园','穿街过巷','广场四角','小队大集合','穿过老城区','四路出击','城市晚安','最后的围捕'],
];
let seed = 2026091901;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const shuffle = values => {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

// Connected rings and diagonals inside each annular face: no dead ends or road crossings.
// Guarding the exits and closing the pincer must consume the whole squad.
function streets(size, officers, mask, fan) {
  const nodes = [230, 135].flatMap((radius, ring) => Array.from({ length: size }, (_, i) => {
    const angle = (i + (officers === 4 && ring ? -0.5 : 0)) * Math.PI * 2 / size - Math.PI / 2;
    return { x: Math.round(300 + Math.cos(angle) * radius), y: Math.round(300 + Math.sin(angle) * radius) };
  }));
  const edges = [];
  for (let i = 0; i < size; i++) {
    const next = (i + 1) % size;
    edges.push([i, next], [size + i, size + next]);
    if (officers === 4 || mask & (1 << i)) edges.push([i, size + i]);
    if (officers === 4 && mask & (1 << i)) edges.push([i, size + next]);
  }
  // Triangulate the inner plaza without introducing fake intersections.
  for (let i = 2; i < size - 1; i++) if (fan & (1 << (i - 2))) edges.push([size, size + i]);
  return { nodes, edges };
}
function canEscape(level, node, cops) {
  const visited = new Set([node]), queue = [node];
  for (let i = 0; i < queue.length; i++) {
    if (level.exits.includes(queue[i])) return true;
    for (const next of level.adj[queue[i]]) if (!cops.includes(next) && !visited.has(next)) {
      visited.add(next); queue.push(next);
    }
  }
  return false;
}

const raw = [], solutions = {}, layouts = new Set();
for (let id = 1; id <= 60; id++) {
  const chapter = Math.floor((id - 1) / 12), slot = (id - 1) % 12;
  const officers = chapter === 4 ? 4 : 3;
  const thieves = chapter === 0 ? 1 : chapter < 3 ? 1 + Number(slot >= 4) : 2 + Number(chapter === 4 && slot >= 8);
  const exitCount = officers - 1;
  const minimum = [4, 7, 9, 11, 13][chapter] + Math.floor(slot / 4);
  let chosen;
  for (let layoutAttempt = 0; layoutAttempt < 40 && !chosen; layoutAttempt++) {
    const size = chapter === 4 ? 8 + (slot + layoutAttempt) % 2 : 5 + (slot + layoutAttempt) % (chapter === 0 ? 2 : 4);
    const mask = chapter === 4 ? 1 << Math.floor(random() * size) : Math.floor(random() * ((1 << size) - 1));
    const fan = chapter < 2 ? 0 : Math.floor(random() * (chapter === 4 ? 4 : 1 << (size - 3)));
    const { nodes, edges } = streets(size, officers, mask, fan);
    const layoutKey = JSON.stringify(edges);
    if (layouts.has(layoutKey)) continue;
    const border = nodes.flatMap(({ x, y }, i) => x <= 100 || x >= 500 || y <= 100 || y >= 500 ? [i] : []);
    for (let attempt = 0; attempt < 250 && !chosen; attempt++) {
      const exits = shuffle(border).slice(0, exitCount);
      const positions = shuffle(nodes.map((_, i) => i).filter(i => !exits.includes(i)));
      const cops = positions.slice(0, officers), robbers = positions.slice(officers, officers + thieves);
      const candidate = prepareLevel({ id, chapter, name: names[chapter][slot],
        tip: `${officers} 人合作：有人守住逃生口，有人沿内外环路包抄。封口的队友离岗前，先安排另一人接防。`,
        nodes, edges, cops, robbers, exits, par: 0 });
      if (robbers.some(node => !canEscape(candidate, node, cops))) continue;
      const solution = solve(candidate, initialState(candidate), { maxStates: 2400, maxDepth: minimum + 5 });
      if (!solution || solution.length < minimum || solution.length > minimum + 5) continue;
      let cursor = initialState(candidate), captures = 0;
      const moved = new Set();
      for (const plan of solution) {
        plan.forEach((node, i) => { if (node !== cursor.cops[i]) moved.add(i); });
        const result = step(candidate, cursor, plan); cursor = result.state;
        if (result.caught.length) captures++;
      }
      if (moved.size !== officers || thieves > 1 && captures < 2) continue;
      if (cops.some((_, omitted) => reducedSquadCanWin(candidate, omitted))) continue;
      chosen = { candidate, solution, layoutKey };
    }
  }
  if (!chosen) throw new Error(`No cooperative solution generated for level ${id}`);
  const { adj, dist, ...level } = chosen.candidate;
  level.par = chosen.solution.length;
  raw.push(level); solutions[id] = chosen.solution; layouts.add(chosen.layoutKey);
  console.log(`${id} ${level.name}: ${level.par} turns, ${level.nodes.length} junctions / ${level.edges.length} roads, ${officers} cops / ${thieves} robbers`);
}
// Publish only after the entire catalogue has a verified cooperative solution.
writeFileSync(new URL('../src/levels.js', import.meta.url), `import { prepareLevel } from './engine.js';\n\nexport const chapters = ${JSON.stringify(chapters, null, 2)};\n\nexport const levels = ${JSON.stringify(raw, null, 2)}.map(prepareLevel);\n`);
writeFileSync(new URL('../src/solutions.js', import.meta.url), `// Verified by scripts/check-levels.mjs using the same rules as the game.\nexport const solutions = ${JSON.stringify(solutions, null, 2)};\n`);
