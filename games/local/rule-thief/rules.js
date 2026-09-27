export const RULES = {
  phase: { name: '穿墙', icon: '▱', description: '所有位移都能穿过内墙。不能穿过人或外框。' },
  stride: { name: '直行', icon: '→', description: '每拍沿朝向走一格；受阻就原地右转。' },
  drift: { name: '北漂', icon: '↑', description: '每拍最后向上漂一格。受阻就停，不是重力。' }
};
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const entity = (id, name, kind, x, y, dir) => ({ id, name, kind, x, y, dir });
export const LEVELS = [
  {
    title: '借道', subtitle: '拿走一条规则，改变两个人。',
    hint: '把哨兵的直行交给载体一，让它停下。',
    map: ['######', '#....#', '#....#', '######', '#...E#', '######'],
    entities: [entity('p', '小贼', 'player', 2, 2, 1), entity('a', '载体一', 'stone', 2, 1, 1), entity('b', '载体二', 'stone', 1, 2, 0), entity('s', '哨兵', 'sentry', 3, 2, 3)],
    owners: { phase: 'a', stride: 's', drift: 'b' }
  },
  {
    title: '隔墙接力', subtitle: '先叠在一起，再拆开借回。',
    hint: '墙里的穿墙卡不能直接取走。先借给它北漂。',
    map: ['######', '#..#E#', '#.##.#', '#..#.#', '#..#.#', '######'],
    entities: [entity('p', '小贼', 'player', 2, 3, 0), entity('a', '载体一', 'stone', 2, 2, 1), entity('b', '载体二', 'stone', 2, 4, 0), entity('c', '载体三', 'stone', 4, 4, 0)],
    owners: { phase: 'a', stride: 'c', drift: 'b' }
  },
  {
    title: '带走麻烦', subtitle: '能力留给自己，还是交给别人？',
    hint: '北漂会让你越过出口。借来直行抵消它，或把它交出去。',
    map: ['######', '#....#', '#..#E#', '#.##.#', '#....#', '######'],
    entities: [entity('p', '小贼', 'player', 2, 4, 0), entity('a', '载体一', 'stone', 2, 3, 1), entity('b', '载体二', 'stone', 1, 4, 0), entity('s', '哨兵', 'sentry', 3, 4, 3)],
    owners: { phase: 'a', stride: 's', drift: 'p' }
  }
];
export function initial(level = 0) {
  return { level, entities: LEVELS[level].entities.map(e => ({ ...e })), owners: { ...LEVELS[level].owners }, turn: 0, status: 'playing' };
}
export const clone = state => ({ ...state, entities: state.entities.map(e => ({ ...e })), owners: { ...state.owners } });
export const actor = (state, id) => state.entities.find(e => e.id === id);
export const near = (state, id) => {
  const p = actor(state, 'p'), e = actor(state, id);
  return !!e && Math.abs(e.x - p.x) + Math.abs(e.y - p.y) <= 1;
};
export function transferError(state, rule, target) {
  if (!RULES[rule] || !actor(state, target)) return '找不到这条规则或目标。';
  const source = state.owners[rule];
  if (source === target) return '规则已经在它身上。';
  if (!near(state, source) || !near(state, target)) return '靠近一点：只能在自己和上下左右的邻居之间转移。';
  const e = actor(state, source);
  if (rule === 'phase' && LEVELS[state.level].map[e.y][e.x] === '#') return '先让它离开墙体，才能揭走穿墙。';
  return '';
}
export function step(state, action, trace = false) {
  if (state.status !== 'playing') return { ok: false, state, frames: [], reason: '这一拍已经结束，可以撤销或重试。' };
  if (!action || !['move', 'wait', 'transfer'].includes(action.type)) return { ok: false, state, frames: [], reason: '未知操作。' };
  if (action.type === 'move' && !Number.isInteger(action.dir)) return { ok: false, state, frames: [], reason: '无效方向。' };
  if (action.type === 'move' && (action.dir < 0 || action.dir > 3)) return { ok: false, state, frames: [], reason: '无效方向。' };
  if (action.type === 'transfer') {
    const reason = transferError(state, action.rule, action.target);
    if (reason) return { ok: false, state, frames: [], reason };
  }
  const next = clone(state), frames = [], map = LEVELS[state.level].map;
  const capture = stage => { if (trace) frames.push({ stage, state: clone(next) }); };
  const move = (e, dir) => {
    const [dx, dy] = DIRS[dir], x = e.x + dx, y = e.y + dy;
    if (x <= 0 || y <= 0 || y >= map.length - 1 || x >= map[0].length - 1) return false;
    if (map[y][x] === '#' && next.owners.phase !== e.id) return false;
    const occupied = next.entities.find(other => other.id !== e.id && other.x === x && other.y === y);
    if (occupied) {
      if ((e.kind === 'player' && occupied.kind === 'sentry') || (e.kind === 'sentry' && occupied.kind === 'player')) next.status = 'lost';
      return false;
    }
    e.x = x; e.y = y;
    return true;
  };
  if (action.type === 'move') {
    const p = actor(next, 'p'); p.dir = action.dir; move(p, p.dir);
  } else if (action.type === 'transfer') next.owners[action.rule] = action.target;
  next.turn++;
  capture('主动动作');
  // Each movement rule is unique: at most one actor moves in each automatic phase.
  if (next.status === 'playing') {
    const e = actor(next, next.owners.stride);
    if (!move(e, e.dir)) e.dir = (e.dir + 1) % 4;
    capture('直行');
  }
  if (next.status === 'playing') {
    move(actor(next, next.owners.drift), 0);
    capture('北漂');
  }
  const p = actor(next, 'p');
  if (next.status === 'playing' && map[p.y][p.x] === 'E') next.status = 'won';
  if (trace && frames.length) frames[frames.length - 1].state.status = next.status;
  return { ok: true, state: next, frames, reason: '' };
}
export function actions(state) {
  const list = [0, 1, 2, 3].map(dir => ({ type: 'move', dir }));
  list.push({ type: 'wait' });
  for (const rule of Object.keys(RULES)) {
    for (const target of state.entities) {
      if (!transferError(state, rule, target.id)) list.push({ type: 'transfer', rule, target: target.id });
    }
  }
  return list;
}
export const stateKey = s => `${s.level}|${s.entities.map(e => `${e.x}${e.y}${e.dir}`).join(',')}|${Object.values(s.owners).join('')}|${s.status}`;
export function solve(start, { maxStates = 30000, maxMs = 5000, allow = () => true } = {}) {
  // ponytail: BFS retains at most 30k small states; use packed keys if larger puzzles are ever needed.
  maxStates = Math.max(1, Math.min(30000, Number.isFinite(maxStates) ? Math.floor(maxStates) : 30000));
  maxMs = Math.max(1, Math.min(5000, Number.isFinite(maxMs) ? maxMs : 5000));
  const began = performance.now(), queue = [{ state: start, parent: -1, action: null }], seen = new Set([stateKey(start)]);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    if (performance.now() - began >= maxMs) return { status: 'unknown', reason: 'time-limit', visited: seen.size };
    const node = queue[cursor];
    if (node.state.status === 'won') {
      const path = [];
      for (let i = cursor; queue[i].parent !== -1; i = queue[i].parent) path.push(queue[i].action);
      return { status: 'solved', visited: seen.size, path: path.reverse() };
    }
    if (node.state.status !== 'playing') continue;
    for (const action of actions(node.state)) {
      const next = step(node.state, action).state;
      if (next.status === 'lost' || !allow(next, action, node.state)) continue;
      const key = stateKey(next);
      if (seen.has(key)) continue;
      if (seen.size >= maxStates) return { status: 'unknown', reason: 'state-limit', visited: seen.size };
      seen.add(key); queue.push({ state: next, parent: cursor, action });
    }
  }
  return { status: 'unsolvable', visited: seen.size };
}
