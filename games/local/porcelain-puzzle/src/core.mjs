import { VERSION, WIDTH, HEIGHT, outline, vesselFor, random, levelAt } from './content.mjs';
export function contains(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function intersection(a, b, c, d) {
  const rx = b.x - a.x,
    ry = b.y - a.y,
    sx = d.x - c.x,
    sy = d.y - c.y,
    den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den,
    u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.x + t * rx, y: a.y + t * ry } : null;
}
function visibleBounds(polygon, silhouette) {
  const points = [
    ...polygon.filter((p) => contains(p, silhouette)),
    ...silhouette.filter((p) => contains(p, polygon)),
  ];
  for (let i = 0; i < polygon.length; i++)
    for (let j = 0; j < silhouette.length; j++) {
      const p = intersection(
        polygon[i],
        polygon[(i + 1) % polygon.length],
        silhouette[j],
        silhouette[(j + 1) % silhouette.length],
      );
      if (p) points.push(p);
    }
  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}
function clip(poly, nx, ny, c) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      da = a.x * nx + a.y * ny - c,
      db = b.x * nx + b.y * ny - c;
    if (da <= 1e-7) out.push(a);
    if (da < 0 !== db < 0) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}
export function makePuzzle(level) {
  const silhouette = outline(vesselFor(level)),
    rng = random(level.seed),
    seeds = [];
  const sample = () => {
    for (let n = 0; n < 10000; n++) {
      const p = { x: 8 + rng() * (WIDTH - 16), y: 8 + rng() * (HEIGHT - 16) };
      if (contains(p, silhouette)) return p;
    }
    throw Error('Empty silhouette');
  };
  for (let i = 0; i < level.pieces; i++) {
    let best = sample(),
      score = -1;
    for (let k = 0; k < 65; k++) {
      const p = sample(),
        d = seeds.length ? Math.min(...seeds.map((s) => distance(p, s))) : 1;
      if (d > score) {
        score = d;
        best = p;
      }
    }
    seeds.push(best);
  }
  const pieces = seeds.map((s, id) => {
    let polygon = [
      { x: 0, y: 0 },
      { x: WIDTH, y: 0 },
      { x: WIDTH, y: HEIGHT },
      { x: 0, y: HEIGHT },
    ];
    seeds.forEach((t, j) => {
      if (id !== j)
        polygon = clip(
          polygon,
          t.x - s.x,
          t.y - s.y,
          (t.x * t.x + t.y * t.y - s.x * s.x - s.y * s.y) / 2,
        );
    });
    return { id, polygon, center: s, bounds: visibleBounds(polygon, silhouette), neighbors: [] };
  });
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++) {
      const shared = pieces[i].polygon.filter((p) =>
        pieces[j].polygon.some((q) => distance(p, q) < 0.01),
      );
      if (shared.length >= 2) {
        const [a, b] = shared;
        const touches =
          contains(a, silhouette) ||
          contains(b, silhouette) ||
          contains({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, silhouette) ||
          silhouette.some((c, k) => intersection(a, b, c, silhouette[(k + 1) % silhouette.length]));
        if (touches) {
          pieces[i].neighbors.push(j);
          pieces[j].neighbors.push(i);
        }
      }
    }
  return { version: VERSION, levelId: level.id, silhouette, pieces };
}
// All groups store a translation from the same canonical vessel coordinates.
// A correct join means equal translations, regardless of where the player assembled it.
export function newAttempt(level = levelAt(1), id = `attempt-${Date.now()}`) {
  const puzzle = makePuzzle(level),
    rng = random(level.seed + 71);
  const columns = level.pieces <= 12 ? 3 : level.pieces <= 24 ? 4 : 5;
  const rows = Math.ceil(level.pieces / columns),
    order = puzzle.pieces.map((p) => p.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const groups = order.map((p, i) => {
    const b = puzzle.pieces[p].bounds;
    return {
      id: p,
      pieces: [p],
      x: Math.max(
        8 - b.minX,
        Math.min(342 - b.maxX, (((i % columns) + 0.5) * 350) / columns - (b.minX + b.maxX) / 2),
      ),
      y: Math.max(
        12 - b.minY,
        Math.min(
          498 - b.maxY,
          ((Math.floor(i / columns) + 0.5) * 510) / rows - (b.minY + b.maxY) / 2,
        ),
      ),
    };
  });
  return {
    version: VERSION,
    id,
    levelId: level.id,
    number: level.number,
    phase: 'intro',
    remainingMs: level.timeMs,
    elapsedMs: 0,
    groups,
    revives: 0,
    hints: level.hints,
    assisted: false,
    revision: 0,
  };
}
export function start(state) {
  if (state.phase === 'intro') {
    state.phase = 'playing';
    state.revision++;
  }
  return state;
}
export function tick(state, ms) {
  if (state.phase !== 'playing' || !Number.isFinite(ms) || ms < 0) return state;
  const spend = Math.min(ms, state.remainingMs);
  state.remainingMs -= spend;
  state.elapsedMs += spend;
  if (state.remainingMs === 0) {
    state.phase = 'timeout';
    state.revision++;
  }
  return state;
}
export function pause(state) {
  if (state.phase === 'playing') {
    state.phase = 'paused';
    state.revision++;
  }
}
export function resume(state) {
  if (state.phase === 'paused') {
    state.phase = 'playing';
    state.revision++;
  }
}
export function move(state, id, x, y) {
  if (
    state.phase !== 'playing' ||
    ![x, y].every(Number.isFinite) ||
    Math.abs(x) > 1000 ||
    Math.abs(y) > 1000
  )
    return false;
  const g = state.groups.find((g) => g.id === id);
  if (!g) return false;
  g.x = x;
  g.y = y;
  return true;
}
export function connected(a, b, puzzle) {
  return a.pieces.some((id) => puzzle.pieces[id].neighbors.some((n) => b.pieces.includes(n)));
}
export function snap(state, id, puzzle, threshold = levelAt(state.number).snap) {
  if (state.phase !== 'playing') return 0;
  let group = state.groups.find((g) => g.id === id);
  if (!group) return 0;
  let joins = 0;
  for (;;) {
    const targets = state.groups
      .filter((g) => g !== group && connected(group, g, puzzle) && distance(group, g) <= threshold)
      .sort((a, b) => distance(a, group) - distance(b, group));
    if (!targets.length) break;
    const target = targets[0];
    group.x = target.x;
    group.y = target.y;
    group.pieces.push(...target.pieces);
    state.groups = state.groups.filter((g) => g !== target);
    joins++;
  }
  if (joins) {
    state.revision++;
    if (state.groups.length === 1) state.phase = 'won';
  }
  return joins;
}
export function hint(state, puzzle) {
  if (state.phase !== 'playing' || state.hints <= 0) return null;
  for (const a of state.groups)
    for (const b of state.groups)
      if (a !== b && connected(a, b, puzzle)) {
        state.hints--;
        state.assisted = true;
        return { from: a.id, to: b.id };
      }
  return null;
}
export function revive(state, attemptId, result) {
  const level = levelAt(state.number);
  if (
    state.id !== attemptId ||
    state.phase !== 'timeout' ||
    result !== 'completed' ||
    state.revives >= level.maxRevives
  )
    return false;
  state.revives++;
  state.assisted = true;
  state.remainingMs = level.reviveMs;
  state.phase = 'playing';
  state.revision++;
  return true;
}
export function restore(raw) {
  if (
    !raw ||
    raw.version !== VERSION ||
    !Number.isInteger(raw.number) ||
    raw.number < 1 ||
    raw.number > 100 ||
    typeof raw.id !== 'string'
  )
    return null;
  const level = levelAt(raw.number),
    n = level.pieces;
  if (
    raw.levelId !== level.id ||
    !Array.isArray(raw.groups) ||
    raw.groups.length < 1 ||
    raw.groups.length > n
  )
    return null;
  const ids = [];
  for (const g of raw.groups) {
    if (
      !g ||
      !Number.isInteger(g.id) ||
      !Array.isArray(g.pieces) ||
      !g.pieces.length ||
      ![g.x, g.y].every(Number.isFinite) ||
      Math.abs(g.x) > 1000 ||
      Math.abs(g.y) > 1000
    )
      return null;
    ids.push(...g.pieces);
  }
  if (
    ids.length !== n ||
    new Set(ids).size !== n ||
    ids.some((i) => !Number.isInteger(i) || i < 0 || i >= n) ||
    new Set(raw.groups.map((g) => g.id)).size !== raw.groups.length
  )
    return null;
  if (
    !['intro', 'playing', 'paused', 'timeout', 'won'].includes(raw.phase) ||
    !Number.isFinite(raw.remainingMs) ||
    raw.remainingMs < 0 ||
    raw.remainingMs > level.timeMs + level.reviveMs ||
    !Number.isFinite(raw.elapsedMs) ||
    raw.elapsedMs < 0
  )
    return null;
  if (
    !Number.isInteger(raw.revives) ||
    raw.revives < 0 ||
    raw.revives > level.maxRevives ||
    !Number.isInteger(raw.hints) ||
    raw.hints < 0 ||
    raw.hints > level.hints
  )
    return null;
  if (
    (raw.phase === 'won') !== (raw.groups.length === 1) ||
    (raw.phase === 'timeout' && raw.remainingMs !== 0)
  )
    return null;
  if (Math.abs(level.timeMs + raw.revives * level.reviveMs - raw.elapsedMs - raw.remainingMs) > 2)
    return null;
  const puzzle = makePuzzle(level);
  for (const g of raw.groups) {
    const seen = new Set([g.pieces[0]]),
      queue = [g.pieces[0]];
    while (queue.length)
      for (const n of puzzle.pieces[queue.pop()].neighbors)
        if (g.pieces.includes(n) && !seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
    if (seen.size !== g.pieces.length) return null;
  }
  const state = structuredClone(raw);
  if (state.phase === 'playing') state.phase = 'paused';
  return state;
}
export function progress(state) {
  return Math.round(
    ((levelAt(state.number).pieces - state.groups.length) / (levelAt(state.number).pieces - 1)) *
      100,
  );
}
export function organize(state, puzzle) {
  if (state.phase !== 'playing') return false;
  const count = state.groups.length,
    columns = count <= 3 ? count : count < 10 ? 3 : 4,
    rows = Math.ceil(count / columns);
  state.groups.forEach((g, i) => {
    const bounds = g.pieces.map((id) => puzzle.pieces[id].bounds),
      minX = Math.min(...bounds.map((b) => b.minX)),
      maxX = Math.max(...bounds.map((b) => b.maxX)),
      minY = Math.min(...bounds.map((b) => b.minY)),
      maxY = Math.max(...bounds.map((b) => b.maxY));
    g.x = Math.max(
      8 - minX,
      Math.min(342 - maxX, (((i % columns) + 0.5) * 350) / columns - (minX + maxX) / 2),
    );
    g.y = Math.max(
      12 - minY,
      Math.min(498 - maxY, ((Math.floor(i / columns) + 0.5) * 510) / rows - (minY + maxY) / 2),
    );
  });
  state.revision++;
  return true;
}
