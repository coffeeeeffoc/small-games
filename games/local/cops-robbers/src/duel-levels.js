import { prepareLevel } from './engine.js';

function makeMap(id, mode) {
  let seed = id * 9137 + (mode === 'escape' ? 7183 : 51031);
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const size = 4 + Math.floor((id - 1) / 34), nodes = Array.from({ length: size * size }, (_, index) => ({ x: 65 + index % size * 470 / (size - 1), y: 70 + Math.floor(index / size) * 460 / (size - 1) }));
  const candidates = [], edges = [], parent = nodes.map((_, index) => index);
  const root = node => { while (node !== parent[node]) node = parent[node]; return node; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const node = y * size + x;
    if (x + 1 < size) candidates.push([node, node + 1]);
    if (y + 1 < size) candidates.push([node, node + size]);
  }
  const shuffled = candidates.map(edge => ({ edge, weight: random() })).sort((a, b) => a.weight - b.weight);
  const extras = [];
  for (const { edge: [a, b] } of shuffled) {
    if (root(a) !== root(b)) { parent[root(a)] = root(b); edges.push([a, b]); } else extras.push([a, b]);
  }
  edges.push(...extras.slice(0, 2 + Math.floor(id / 9)));
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const rotation = Math.floor(random() * 4);
  const rotate = index => { let x = index % size, y = Math.floor(index / size); for (let i = 0; i < rotation; i++) [x, y] = [size - 1 - y, x]; return y * size + x; };
  const cops = [1, size * size - 2, ...(id > 67 ? [size - 1] : [])].map(rotate);
  const robbers = [size * Math.floor(size / 2) + Math.floor(size / 2) - 1].map(rotate);
  const exits = mode === 'escape' ? [0, size * size - 1].map(rotate) : [];
  for (const pair of [[rotate(0), cops[0]], [rotate(size * size - 1), cops[1]]]) {
    const edge = pair.sort((a, b) => a - b);
    if (!edges.some(([a, b]) => a === edge[0] && b === edge[1])) edges.push(edge);
  }
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const level = prepareLevel({ id, mode, name: `${mode === 'escape' ? '出口竞速' : '限步周旋'} ${String(id).padStart(3, '0')}`, nodes, edges, cops, robbers, exits,
    roundLimit: (mode === 'escape' ? 18 : 10) + Math.floor((id - 1) / 5), difficulty: 1 + Math.floor((id - 1) / 20) });
  // Give the runner room to choose; guards still start within one move of each gate.
  const starts = nodes.map((_, index) => index).filter(node => !cops.includes(node) && !exits.includes(node));
  starts.sort((a, b) => Math.min(...cops.map(cop => level.dist[cop][b])) - Math.min(...cops.map(cop => level.dist[cop][a])) || level.adj[b].length - level.adj[a].length);
  level.robbers = [starts[0]];
  return level;
}

export const duelLevels = ['escape', 'survival'].flatMap(mode => Array.from({ length: 100 }, (_, index) => makeMap(index + 1, mode)));
export const getDuelLevel = (mode, id) => duelLevels.find(level => level.mode === mode && level.id === Number(id));
