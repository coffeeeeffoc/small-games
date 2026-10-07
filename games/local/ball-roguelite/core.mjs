import { levelById, UPGRADES, validateLevels } from './levels.mjs';
export const WIDTH = 390, HEIGHT = 620;
export const FIELD = Object.freeze({ left: 20, right: 370, top: 35, floor: 580, cell: 50, row: 50, radius: 6, speed: 690, maxRow: 9 });
export const RHYTHM = Object.freeze({ bpm: 120, beat: 0.5,
  launchPattern: Object.freeze([0, 0.04, 0.125, 0.165, 0.25, 0.29, 0.375, 0.415]),
  reboundBoost: 0.28, reboundDecay: 7.5, trailLimit: 18 });
const MAX_FLIGHT = 14, EPS = 0.00001;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const copy = (data) => JSON.parse(JSON.stringify(data));
const emit = (game, type, data = {}) => { if (game.events.length < 250) game.events.push({ type, ...data }); };
export function random(game) {
  let seed = game.seed | 0;
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  game.seed = seed >>> 0;
  return game.seed / 4294967296;
}
export function brickRect(brick) {
  return { x: FIELD.left + brick.c * FIELD.cell + 4, y: FIELD.top + brick.r * FIELD.row + 4, w: FIELD.cell - 8, h: FIELD.row - 8 };
}
export function brickCenter(brick) { const r = brickRect(brick); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }

function addRow(game) {
  let row;
  if (game.level.endless) {
    const pickup = Math.floor(random(game) * 7);
    row = Array.from({ length: 7 }, (_, c) => c === pickup ? '+' : random(game) < 0.54
      ? (random(game) < 0.1 ? 'b' : '') + Math.max(1, Math.round((1 + game.turn * 1.05) * (0.7 + random(game) * 0.6))) : 0);
  } else row = game.level.waves[game.waveIndex];
  if (!row) return;
  row.forEach((cell, c) => {
    if (cell === 0 || cell === '0') return;
    const kind = cell === '+' ? 'pickup' : String(cell).startsWith('b') ? 'bomb' : 'brick';
    const hp = kind === 'pickup' ? 1 : Number(String(cell).replace(/^b/, ''));
    game.bricks.push({ id: game.nextId++, c, r: 0, kind, hp, maxHp: hp });
  });
  game.waveIndex++;
}
export function createGame(id = 'stardust', { seed = 0x6d2b79f5, practice = false } = {}) {
  const level = typeof id === 'object' ? id : levelById(id);
  if (!level || validateLevels([{ ...level, unlock: null }]).length) throw new Error('无效关卡');
  const game = { schemaVersion: 1, level: copy(level), levelId: level.id, phase: 'aim', seed: (seed >>> 0) || 1,
    practice, turn: 0, score: 0, shots: 0, count: level.balls, damage: 1, upgrades: {}, cards: [],
    launchX: WIDTH / 2, nextX: null, bricks: [], balls: [], waveIndex: 0, nextId: 1,
    elapsed: 0, flight: 0, emitted: 0, volley: 0, direction: null, combo: 0, bestCombo: 0, events: [] };
  for (let i = 0; i < level.initialRows; i++) { game.bricks.forEach((b) => b.r++); addRow(game); }
  return game;
}
export function aimDirection(dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || dy >= -12) return null;
  const angle = clamp(Math.atan2(dy, dx), -Math.PI + 0.16, -0.16);
  return { x: Math.cos(angle), y: Math.sin(angle) };
}
export function fire(game, dx, dy) {
  const direction = aimDirection(dx, dy);
  if (game.phase !== 'aim' || !direction) return false;
  Object.assign(game, { phase: 'flight', direction, flight: 0, emitted: 0, volley: game.count, nextX: null, combo: 0, balls: [] });
  game.shots++;
  launch(game); emit(game, 'fire');
  return true;
}
const launchAt = (index) => Math.floor(index / RHYTHM.launchPattern.length) * RHYTHM.beat + RHYTHM.launchPattern[index % RHYTHM.launchPattern.length];
function launch(game) {
  const id = `${game.shots}:${game.emitted}`, x = game.launchX, y = FIELD.floor - FIELD.radius - 1;
  const accent = game.emitted % RHYTHM.launchPattern.length === 0;
  game.balls.push({ id, x, y,
    vx: game.direction.x * FIELD.speed, vy: game.direction.y * FIELD.speed,
    boost: accent ? RHYTHM.reboundBoost : RHYTHM.reboundBoost / 2,
    trail: [{ x, y, t: game.elapsed }],
    pierce: game.upgrades.pierce || 0, ignored: [], done: false });
  emit(game, 'launch', { ballId: id, index: game.emitted, x, y, at: game.flight, accent });
  game.emitted++;
}

function hurt(game, brick, damage, contact = {}) {
  if (brick.hp <= 0 || brick.kind === 'pickup') return;
  brick.hp -= damage;
  const point = brickCenter(brick);
  emit(game, 'hit', { ...point, damage, id: brick.id, ...contact });
  if (brick.hp > 0) return;
  game.score++; game.combo++; game.bestCombo = Math.max(game.combo, game.bestCombo);
  emit(game, 'break', { ...point, kind: brick.kind, id: brick.id });
  if (brick.kind === 'bomb') {
    emit(game, 'blast', point);
    for (const other of game.bricks) if (other.id !== brick.id && Math.abs(other.c - brick.c) <= 1 && Math.abs(other.r - brick.r) <= 1)
      hurt(game, other, Math.max(1, Math.ceil(brick.maxHp * 0.6)));
  }
}
function hit(game, brick, contact) {
  const critical = random(game) < Math.min(0.75, (game.upgrades.critical || 0) * 0.15);
  hurt(game, brick, game.damage * (critical ? 3 : 1), contact);
  if (critical) emit(game, 'critical', brickCenter(brick));
  if (random(game) < Math.min(0.75, (game.upgrades.blast || 0) * 0.15)) {
    emit(game, 'blast', brickCenter(brick));
    for (const other of game.bricks) if (other.id !== brick.id && Math.abs(other.c - brick.c) <= 1 && Math.abs(other.r - brick.r) <= 1) hurt(game, other, game.damage);
  }
  if (random(game) < Math.min(0.8, (game.upgrades.chain || 0) * 0.2)) {
    const alive = game.bricks.filter((b) => b.hp > 0 && b.kind !== 'pickup' && b.id !== brick.id);
    if (alive.length) {
      const target = alive[Math.floor(random(game) * alive.length)];
      emit(game, 'chain', { from: brickCenter(brick), to: brickCenter(target) }); hurt(game, target, game.damage * 2);
    }
  }
}
function inside(ball, rect) {
  const r = FIELD.radius;
  return ball.x >= rect.x - r - EPS && ball.x <= rect.x + rect.w + r + EPS && ball.y >= rect.y - r - EPS && ball.y <= rect.y + rect.h + r + EPS;
}
// Sweep the circle against faces and rounded corners, including low frame rates.
function sweep(ball, dx, dy, rect) {
  const r = FIELD.radius;
  if (Math.max(ball.x, ball.x + dx) < rect.x - r || Math.min(ball.x, ball.x + dx) > rect.x + rect.w + r
    || Math.max(ball.y, ball.y + dy) < rect.y - r || Math.min(ball.y, ball.y + dy) > rect.y + rect.h + r) return null;
  let nearest = null;
  const consider = (t, nx, ny) => {
    if (t < -EPS || t > 1 || dx * nx + dy * ny >= -EPS || (nearest && t >= nearest.t)) return;
    const length = Math.hypot(nx, ny);
    nearest = { t: Math.max(0, t), nx: nx / length, ny: ny / length };
  };
  if (Math.abs(dx) > EPS) {
    const nx = -Math.sign(dx), edge = dx > 0 ? rect.x : rect.x + rect.w;
    const t = (edge + nx * r - ball.x) / dx, y = ball.y + dy * t;
    if (y >= rect.y && y <= rect.y + rect.h) consider(t, nx, 0);
  }
  if (Math.abs(dy) > EPS) {
    const ny = -Math.sign(dy), edge = dy > 0 ? rect.y : rect.y + rect.h;
    const t = (edge + ny * r - ball.y) / dy, x = ball.x + dx * t;
    if (x >= rect.x && x <= rect.x + rect.w) consider(t, 0, ny);
  }
  const distance = dx * dx + dy * dy;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const cx = rect.x + (sx > 0 ? rect.w : 0), cy = rect.y + (sy > 0 ? rect.h : 0);
    const ox = ball.x - cx, oy = ball.y - cy, dot = ox * dx + oy * dy;
    const discriminant = dot * dot - distance * (ox * ox + oy * oy - r * r);
    if (distance < EPS || discriminant < 0) continue;
    const t = (-dot - Math.sqrt(discriminant)) / distance;
    const nx = (ox + dx * t) / r, ny = (oy + dy * t) / r;
    if (nx * sx >= -EPS && ny * sy >= -EPS) consider(t, nx, ny);
  }
  return nearest;
}
// Base velocity preserves the aimed path; a capped speed kick settles after each
// bounce. Integrating the exponential exactly keeps travel independent of frames.
const travelTime = (dt, boost) => dt + boost * -Math.expm1(-RHYTHM.reboundDecay * dt) / RHYTHM.reboundDecay;
function contactTime(distance, boost) {
  let time = distance / (1 + boost);
  for (let i = 0; i < 5; i++) time -= (travelTime(time, boost) - distance) / (1 + boost * Math.exp(-RHYTHM.reboundDecay * time));
  return Math.max(0, time);
}
function trailPoint(ball, t, contact = false) {
  const previous = ball.trail.at(-1);
  if (previous && Math.hypot(previous.x - ball.x, previous.y - ball.y) < EPS) {
    if (contact) previous.contact = true;
    return;
  }
  ball.trail.push({ x: ball.x, y: ball.y, t, ...(contact ? { contact: true } : {}) });
  if (ball.trail.length > RHYTHM.trailLimit) ball.trail.shift();
}
function moveBall(game, ball, dt) {
  let remaining = dt;
  for (let impact = 0; impact < 16 && remaining > EPS && !ball.done; impact++) {
    const travel = travelTime(remaining, ball.boost);
    const dx = ball.vx * travel, dy = ball.vy * travel;
    ball.ignored = ball.ignored.filter((id) => { const b = game.bricks.find((b) => b.id === id && b.hp > 0); return b && inside(ball, brickRect(b)); });
    let collision = { t: 1, type: 'move', nx: 0, ny: 0 };
    const consider = (candidate) => { if (candidate && candidate.t >= -EPS && candidate.t <= collision.t) collision = candidate; };
    if (dx < 0) consider({ t: (FIELD.left + FIELD.radius - ball.x) / dx, type: 'wall', nx: 1, ny: 0 });
    if (dx > 0) consider({ t: (FIELD.right - FIELD.radius - ball.x) / dx, type: 'wall', nx: -1, ny: 0 });
    if (dy < 0) consider({ t: (FIELD.top + FIELD.radius - ball.y) / dy, type: 'wall', nx: 0, ny: 1 });
    if (dy > 0) consider({ t: (FIELD.floor - FIELD.radius - ball.y) / dy, type: 'return', nx: 0, ny: -1 });
    for (const brick of game.bricks) {
      if (brick.hp <= 0 || ball.ignored.includes(brick.id)) continue;
      const hit = sweep(ball, dx, dy, brickRect(brick));
      if (hit) consider({ ...hit, type: 'brick', brick });
    }
    ball.x += dx * collision.t; ball.y += dy * collision.t;
    const consumed = collision.type === 'move' ? remaining : Math.min(remaining, contactTime(travel * collision.t, ball.boost));
    ball.boost *= Math.exp(-RHYTHM.reboundDecay * consumed);
    remaining -= consumed;
    const at = game.elapsed - remaining;
    trailPoint(ball, at, collision.type !== 'move');
    if (collision.type === 'move') break;
    if (collision.type === 'return') {
      ball.done = true;
      if (game.nextX === null) game.nextX = clamp(ball.x, FIELD.left + FIELD.radius, FIELD.right - FIELD.radius);
      break;
    }
    const contact = { x: ball.x - collision.nx * FIELD.radius, y: ball.y - collision.ny * FIELD.radius,
      ballId: ball.id, nx: collision.nx, ny: collision.ny };
    if (collision.type === 'brick') {
      const brick = collision.brick;
      if (brick.kind === 'pickup') {
        brick.hp = 0; game.count = Math.min(99, game.count + 1); emit(game, 'pickup', brickCenter(brick));
      } else hit(game, brick, contact);
      if (brick.kind === 'pickup' || ball.pierce > 0) {
        if (brick.kind !== 'pickup') ball.pierce--;
        ball.ignored.push(brick.id);
        ball.x += Math.sign(ball.vx) * EPS * 2; ball.y += Math.sign(ball.vy) * EPS * 2;
        continue;
      }
    }
    const normalVelocity = ball.vx * collision.nx + ball.vy * collision.ny;
    ball.vx -= 2 * normalVelocity * collision.nx; ball.vy -= 2 * normalVelocity * collision.ny;
    ball.boost = RHYTHM.reboundBoost;
    emit(game, 'bounce', { ...contact, at, kind: collision.type, brickId: collision.brick?.id });
    ball.x += collision.nx * EPS * 2; ball.y += collision.ny * EPS * 2;
  }
}
function endTurn(game) {
  game.turn++; game.launchX = game.nextX ?? game.launchX;
  game.balls = []; game.bricks = game.bricks.filter((b) => b.hp > 0);
  if (!game.level.endless && game.waveIndex >= game.level.waves.length && !game.bricks.some((b) => b.kind !== 'pickup')) {
    game.phase = 'won'; emit(game, 'won'); return;
  }
  game.bricks.forEach((b) => b.r++);
  addRow(game);
  game.bricks = game.bricks.filter((b) => b.kind !== 'pickup' || b.r <= FIELD.maxRow);
  if (game.bricks.some((b) => b.kind !== 'pickup' && b.r > FIELD.maxRow)) { game.phase = 'lost'; emit(game, 'lost'); return; }
  if (game.turn % game.level.upgradeEvery === 0) {
    const pool = [...UPGRADES];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random(game) * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    game.cards = pool.slice(0, 3).map((u) => u.id); game.phase = 'upgrade';
  } else game.phase = 'aim';
  emit(game, 'turn');
}
export function recall(game) {
  if (game.phase !== 'flight') return false;
  game.nextX ??= game.balls[0]?.x ?? game.launchX;
  emit(game, 'recall'); endTurn(game); return true;
}
export function chooseUpgrade(game, id) {
  if (game.phase !== 'upgrade' || !game.cards.includes(id)) return false;
  game.upgrades[id] = (game.upgrades[id] || 0) + 1;
  if (id === 'extra') game.count = Math.min(99, game.count + 2);
  if (id === 'power') game.damage++;
  game.cards = []; game.phase = 'aim'; emit(game, 'upgrade', { id }); return true;
}
export function update(game, dt) {
  if (game.phase !== 'flight' || !Number.isFinite(dt) || dt <= 0) return;
  let remaining = Math.min(dt, 0.25);
  while (remaining > EPS && game.phase === 'flight') {
    while (game.emitted < game.volley && game.flight + EPS >= launchAt(game.emitted)) launch(game);
    const untilLaunch = game.emitted < game.volley ? launchAt(game.emitted) - game.flight : Infinity;
    const step = Math.min(remaining, 1 / 120, untilLaunch); remaining -= step;
    game.elapsed += step; game.flight += step;
    for (const ball of game.balls) if (!ball.done) moveBall(game, ball, step);
    game.balls = game.balls.filter((b) => !b.done);
    while (game.emitted < game.volley && game.flight + EPS >= launchAt(game.emitted)) launch(game);
    if (game.flight >= MAX_FLIGHT) { recall(game); break; }
    if (game.emitted === game.volley && !game.balls.length) endTurn(game);
  }
}
export function drainEvents(game) { return game.events.splice(0); }

export function checkpoint(game) {
  if (!['aim', 'upgrade'].includes(game.phase) || game.practice) return null;
  const saved = copy(game); saved.events = []; saved.balls = []; return saved;
}
export function restoreGame(saved) {
  if (!saved || saved.schemaVersion !== 1 || saved.practice || !['aim', 'upgrade'].includes(saved.phase)) return null;
  const level = levelById(saved.levelId);
  if (!level || !Array.isArray(saved.bricks) || saved.bricks.length > 77 || !Array.isArray(saved.cards) || !saved.upgrades || typeof saved.upgrades !== 'object') return null;
  const integer = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
  // Schema 1 includes saves made with the original 4.5 px ball. Retain those
  // edge positions during validation, then move the larger ball safely inbounds.
  const savedRadius = 4.5;
  if (!integer(saved.turn, 1000000) || !integer(saved.score, 10000000) || !integer(saved.count, 99) || saved.count < 1 || !integer(saved.damage, 1000000) || saved.damage < 1 || !integer(saved.waveIndex, 1000000) || !integer(saved.shots, 1000000) || !integer(saved.nextId, 10000000) || !integer(saved.seed, 0xffffffff) || saved.seed === 0 || !Number.isFinite(saved.launchX) || saved.launchX < FIELD.left + savedRadius || saved.launchX > FIELD.right - savedRadius || !Number.isFinite(saved.elapsed) || saved.elapsed < 0) return null;
  if (!level.endless && saved.waveIndex > level.waves.length) return null;
  if (!integer(saved.bestCombo, 10000000) || saved.bestCombo > saved.score) return null;
  if (saved.bricks.some((b) => !integer(b.id, 10000000) || !integer(b.c, 6) || !integer(b.r, FIELD.maxRow) || !['brick', 'bomb', 'pickup'].includes(b.kind) || !integer(b.hp, 10000000) || b.hp < 1 || !integer(b.maxHp, 10000000) || b.maxHp < b.hp)) return null;
  if (new Set(saved.bricks.map((b) => b.id)).size !== saved.bricks.length || new Set(saved.bricks.map((b) => `${b.c}:${b.r}`)).size !== saved.bricks.length) return null;
  if (saved.bricks.some((b) => b.id >= saved.nextId)) return null;
  if (Object.entries(saved.upgrades).some(([id, n]) => !UPGRADES.some((u) => u.id === id) || !integer(n, 1000000))) return null;
  if (saved.phase === 'upgrade' && (saved.cards.length !== 3 || new Set(saved.cards).size !== 3 || saved.cards.some((id) => !UPGRADES.some((u) => u.id === id)))) return null;
  const game = createGame(level.id);
  for (const key of ['phase', 'seed', 'turn', 'score', 'shots', 'count', 'damage', 'upgrades', 'cards', 'launchX', 'bricks', 'waveIndex', 'nextId', 'elapsed', 'bestCombo']) game[key] = copy(saved[key] ?? game[key]);
  game.launchX = clamp(game.launchX, FIELD.left + FIELD.radius, FIELD.right - FIELD.radius);
  return game;
}
