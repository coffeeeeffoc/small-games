import { levelById, UPGRADES, validateLevels } from './levels.mjs';
export const WIDTH = 390,
  HEIGHT = 620;
export const FIELD = Object.freeze({
  left: 20,
  right: 370,
  top: 35,
  floor: 580,
  cell: 50,
  row: 50,
  radius: 8,
  speed: 690,
  maxRow: 9,
});
export const LIMITS = Object.freeze({ balls: 22, damage: 4 });
export const RHYTHM = Object.freeze({
  bpm: 120,
  beat: 0.5,
  launchPattern: Object.freeze([0, 0.04, 0.125, 0.165, 0.25, 0.29, 0.375, 0.415]),
  reboundBoost: 0.28,
  reboundDecay: 7.5,
  trailLimit: 18,
});
export const PHYSICS = Object.freeze({
  gravity: 8,
  step: 1 / 240,
  minSpeed: 400,
  maxSpeed: 760,
  maxFlight: 24,
  minAngle: (7 * Math.PI) / 180,
  restitution: 0.986,
});
const MAX_FLIGHT = PHYSICS.maxFlight,
  EPS = 0.00001;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const copy = (data) => JSON.parse(JSON.stringify(data));
const emit = (game, type, data = {}) => {
  if (game.events.length < 250) game.events.push({ type, ...data });
};
export function random(game) {
  let seed = game.seed | 0;
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  game.seed = seed >>> 0;
  return game.seed / 4294967296;
}
// Retained for integrations which use a cell rectangle; collisions use targetProfile.
export function brickRect(brick) {
  return {
    x: FIELD.left + brick.c * FIELD.cell + 4,
    y: FIELD.top + brick.r * FIELD.row + 4,
    w: FIELD.cell - 8,
    h: FIELD.row - 8,
  };
}
export function brickCenter(brick) {
  return {
    x: FIELD.left + brick.c * FIELD.cell + FIELD.cell / 2,
    y: FIELD.top + brick.r * FIELD.row + FIELD.row / 2,
  };
}
const profileCache = new Map(),
  vertexCache = new WeakMap();
const PALETTE = ['#73f5db', '#87cfff', '#b7a1ff', '#ffb98d', '#f7a6d5'];
/** Stable material/contour contract shared by the Cocos renderer and simulation. */
export function targetProfile(brick) {
  const id = Math.abs(brick.id | 0),
    key = `${brick.kind}:${id % 60}`;
  if (profileCache.has(key)) return profileCache.get(key);
  if (brick.kind === 'absorber')
    return Object.freeze({
      shape: 'circle',
      material: 'absorber',
      radius: 21,
      color: '#9374bd',
      opacity: 0.94,
      rotation: 0,
    });
  if (brick.kind === 'pickup')
    return {
      shape: 'circle',
      material: 'pearl',
      radius: 9,
      color: '#d5ffe8',
      opacity: 0.92,
      rotation: 0,
    };
  const crystal = brick.kind === 'bomb' || id % 5 === 0;
  const profile = {
    shape: crystal ? 'hexagon' : 'circle',
    material: crystal ? 'crystal' : id % 4 === 0 ? 'pearl' : 'glass',
    radius: [18, 20, 22][id % 3],
    color: brick.kind === 'bomb' ? '#ffc18b' : PALETTE[id % PALETTE.length],
    opacity: crystal ? 0.82 : id % 4 === 0 ? 0.92 : 0.68,
    rotation: Math.PI / 6,
  };
  profileCache.set(key, Object.freeze(profile));
  return profile;
}
function vertices(brick) {
  const old = vertexCache.get(brick);
  if (old?.c === brick.c && old?.r === brick.r) return old.points;
  const p = targetProfile(brick),
    c = brickCenter(brick);
  const points = Array.from({ length: 6 }, (_, i) => ({
    x: c.x + Math.cos(p.rotation + (i * Math.PI) / 3) * p.radius,
    y: c.y + Math.sin(p.rotation + (i * Math.PI) / 3) * p.radius,
  }));
  vertexCache.set(brick, { c: brick.c, r: brick.r, points });
  return points;
}
function addRow(game) {
  let row;
  if (game.level.endless) {
    const pickup = game.waveIndex % 4 === 0 ? Math.floor(random(game) * 7) : -1;
    const health =
      1 +
      game.turn * 0.65 +
      Math.max(0, game.turn - 30) * 0.5 +
      0.18 * Math.max(0, game.turn - 40) ** 2;
    row = Array.from({ length: 7 }, (_, c) =>
      c === pickup
        ? '+'
        : random(game) < 0.46
          ? (game.turn >= 14 && random(game) < 0.08 ? 'a' : random(game) < 0.08 ? 'b' : '') +
            Math.min(10000000, Math.max(1, Math.round(health * (0.7 + random(game) * 0.6))))
          : 0,
    );
    // An entirely empty row is a brief breathing space, never a hidden difficulty reset.
  } else row = game.level.waves[game.waveIndex];
  if (!row) return;
  row.forEach((cell, c) => {
    if (cell === 0 || cell === '0') return;
    const kind =
      cell === '+'
        ? 'pickup'
        : String(cell).startsWith('a')
          ? 'absorber'
          : String(cell).startsWith('b')
            ? 'bomb'
            : 'brick';
    const hp = kind === 'pickup' ? 1 : Number(String(cell).replace(/^[ab]/, ''));
    game.bricks.push({ id: game.nextId++, c, r: 0, kind, hp, maxHp: hp });
  });
  game.waveIndex++;
}
export function createGame(
  id = 'stardust',
  { seed = 0x6d2b79f5, practice = false, challenge = false } = {},
) {
  const level = typeof id === 'object' ? id : levelById(id);
  if (!level || validateLevels([{ ...level, unlock: null }]).length) throw new Error('无效关卡');
  const game = {
    schemaVersion: 3,
    level: copy(level),
    levelId: level.id,
    phase: 'aim',
    seed: seed >>> 0 || 1,
    initialSeed: seed >>> 0 || 1,
    challenge,
    practice,
    turn: 0,
    score: 0,
    shots: 0,
    count: Math.min(LIMITS.balls, level.balls),
    damage: 1,
    upgrades: {},
    cards: [],
    rewards: { resonance: 0, rescue: 0 },
    launchX: WIDTH / 2,
    nextX: null,
    bricks: [],
    balls: [],
    waveIndex: 0,
    nextId: 1,
    elapsed: 0,
    flight: 0,
    emitted: 0,
    volley: 0,
    direction: null,
    combo: 0,
    bestCombo: 0,
    collisionCount: 0,
    absorbed: 0,
    stepRemainder: 0,
    events: [],
  };
  for (let i = 0; i < level.initialRows; i++) {
    game.bricks.forEach((b) => b.r++);
    addRow(game);
  }
  return game;
}
export function aimDirection(dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || dy >= -6) return null;
  const angle = clamp(Math.atan2(dy, dx), -Math.PI + PHYSICS.minAngle, -PHYSICS.minAngle);
  return { x: Math.cos(angle), y: Math.sin(angle) };
}
export function fire(game, dx, dy) {
  const direction = aimDirection(dx, dy);
  if (game.phase !== 'aim' || !direction) return false;
  Object.assign(game, {
    phase: 'flight',
    direction,
    flight: 0,
    emitted: 0,
    volley: Math.min(LIMITS.balls, game.count),
    nextX: null,
    combo: 0,
    collisionCount: 0,
    absorbed: 0,
    stepRemainder: 0,
    balls: [],
  });
  game.shots++;
  launch(game);
  emit(game, 'fire');
  return true;
}
const launchAt = (index) =>
  Math.floor(index / RHYTHM.launchPattern.length) * RHYTHM.beat +
  RHYTHM.launchPattern[index % RHYTHM.launchPattern.length];
function launch(game) {
  const id = `${game.shots}:${game.emitted}`,
    x = game.launchX,
    y = FIELD.floor - FIELD.radius - 1;
  const accent = game.emitted % RHYTHM.launchPattern.length === 0;
  game.balls.push({
    id,
    x,
    y,
    vx: game.direction.x * FIELD.speed,
    vy: game.direction.y * FIELD.speed,
    boost: accent ? RHYTHM.reboundBoost : RHYTHM.reboundBoost / 2,
    trail: [{ x, y, t: game.elapsed }],
    pierce: game.upgrades.pierce || 0,
    ignored: [],
    done: false,
  });
  emit(game, 'launch', { ballId: id, index: game.emitted, x, y, at: game.flight, accent });
  game.emitted++;
}
function hurt(game, brick, damage, contact = {}) {
  if (brick.hp <= 0 || brick.kind === 'pickup') return;
  brick.hp -= damage;
  const point = brickCenter(brick);
  emit(game, 'hit', {
    ...point,
    damage,
    id: brick.id,
    kind: brick.kind,
    hp: brick.hp,
    maxHp: brick.maxHp,
    profile: targetProfile(brick),
    ...contact,
  });
  if (brick.hp > 0) return;
  game.score++;
  game.combo++;
  game.bestCombo = Math.max(game.combo, game.bestCombo);
  emit(game, 'break', {
    ...point,
    kind: brick.kind,
    id: brick.id,
    hp: brick.hp,
    maxHp: brick.maxHp,
    profile: targetProfile(brick),
    collisionCount: game.collisionCount,
  });
  if (!game.level.endless && game.combo === 12 && game.count < LIMITS.balls) {
    game.count++;
    emit(game, 'combo-reward', { combo: game.combo, count: game.count });
  }
  if (brick.kind === 'bomb') {
    emit(game, 'blast', point);
    for (const other of game.bricks)
      if (
        other.id !== brick.id &&
        Math.abs(other.c - brick.c) <= 1 &&
        Math.abs(other.r - brick.r) <= 1
      )
        hurt(game, other, Math.max(1, Math.ceil(brick.maxHp * 0.45)));
  }
}
function hit(game, brick, contact) {
  const critical = random(game) < Math.min(0.3, (game.upgrades.critical || 0) * 0.1);
  const resonant = game.rewards.resonance > 0 && random(game) < 0.08;
  // Resonance is a single additive point; critical and secondary damage never multiply it.
  hurt(game, brick, game.damage * (critical ? 2 : 1) + (resonant ? 1 : 0), contact);
  if (critical) emit(game, 'critical', brickCenter(brick));
  if (resonant) emit(game, 'resonance', brickCenter(brick));
  if (random(game) < Math.min(0.3, (game.upgrades.blast || 0) * 0.1)) {
    emit(game, 'blast', brickCenter(brick));
    for (const other of game.bricks)
      if (
        other.id !== brick.id &&
        Math.abs(other.c - brick.c) <= 1 &&
        Math.abs(other.r - brick.r) <= 1
      )
        hurt(game, other, game.damage);
  }
  if (random(game) < Math.min(0.36, (game.upgrades.chain || 0) * 0.12)) {
    const alive = game.bricks.filter((b) => b.hp > 0 && b.kind !== 'pickup' && b.id !== brick.id);
    if (alive.length) {
      const target = alive[Math.floor(random(game) * alive.length)];
      emit(game, 'chain', { from: brickCenter(brick), to: brickCenter(target) });
      hurt(game, target, game.damage);
    }
  }
}
function sweepPoint(ball, dx, dy, center, radius) {
  const ox = ball.x - center.x,
    oy = ball.y - center.y;
  const distance = dx * dx + dy * dy,
    dot = ox * dx + oy * dy;
  const discriminant = dot * dot - distance * (ox * ox + oy * oy - radius * radius);
  if (distance < EPS || discriminant < 0 || dot >= 0) return null;
  const t = (-dot - Math.sqrt(discriminant)) / distance;
  if (t < -EPS || t > 1) return null;
  const nx = ox + dx * t,
    ny = oy + dy * t,
    length = Math.hypot(nx, ny);
  return { t: Math.max(0, t), nx: nx / length, ny: ny / length };
}
function inside(ball, brick) {
  const p = targetProfile(brick),
    c = brickCenter(brick);
  if (p.shape === 'circle')
    return Math.hypot(ball.x - c.x, ball.y - c.y) <= p.radius + FIELD.radius + EPS;
  const points = vertices(brick);
  let polygonInside = true,
    nearest = Infinity;
  for (let i = 0; i < 6; i++) {
    const a = points[i],
      b = points[(i + 1) % 6],
      dx = b.x - a.x,
      dy = b.y - a.y;
    if ((ball.x - a.x) * dy - (ball.y - a.y) * dx > EPS) polygonInside = false;
    const t = clamp(((ball.x - a.x) * dx + (ball.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
    nearest = Math.min(nearest, Math.hypot(ball.x - a.x - t * dx, ball.y - a.y - t * dy));
  }
  return polygonInside || nearest <= FIELD.radius + EPS;
}
/** Continuous circle-circle / circle-convex-hex collision, including rounded vertex contact. */
function sweep(ball, dx, dy, brick) {
  const p = targetProfile(brick),
    center = brickCenter(brick),
    reach = p.radius + FIELD.radius;
  if (
    Math.max(ball.x, ball.x + dx) < center.x - reach ||
    Math.min(ball.x, ball.x + dx) > center.x + reach ||
    Math.max(ball.y, ball.y + dy) < center.y - reach ||
    Math.min(ball.y, ball.y + dy) > center.y + reach
  )
    return null;
  if (p.shape === 'circle') return sweepPoint(ball, dx, dy, center, reach);
  const points = vertices(brick);
  let nearest = null;
  const consider = (candidate) => {
    if (candidate && (!nearest || candidate.t < nearest.t)) nearest = candidate;
  };
  for (let i = 0; i < 6; i++) {
    const a = points[i],
      b = points[(i + 1) % 6],
      ex = b.x - a.x,
      ey = b.y - a.y,
      length = Math.hypot(ex, ey);
    const nx = ey / length,
      ny = -ex / length,
      rate = dx * nx + dy * ny;
    if (rate < -EPS) {
      const t = (FIELD.radius - (ball.x - a.x) * nx - (ball.y - a.y) * ny) / rate;
      const along =
        ((ball.x + dx * t - a.x) * ex + (ball.y + dy * t - a.y) * ey) / (length * length);
      if (t >= -EPS && t <= 1 && along >= 0 && along <= 1) consider({ t: Math.max(0, t), nx, ny });
    }
    consider(sweepPoint(ball, dx, dy, a, FIELD.radius));
  }
  return nearest;
}
const travelTime = (dt, boost) =>
  dt + (boost * -Math.expm1(-RHYTHM.reboundDecay * dt)) / RHYTHM.reboundDecay;
function contactTime(distance, boost) {
  let time = distance / (1 + boost);
  for (let i = 0; i < 5; i++)
    time -=
      (travelTime(time, boost) - distance) / (1 + boost * Math.exp(-RHYTHM.reboundDecay * time));
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
function refract(game, ball, collision) {
  if (collision.type !== 'brick') return 0;
  const profile = targetProfile(collision.brick);
  const limit = ((profile.material === 'crystal' ? 18 : 12) * Math.PI) / 180;
  const base = Math.atan2(ball.vy, ball.vx);
  let choice = null;
  for (const other of game.bricks) {
    if (other.hp <= 0 || other.kind === 'pickup' || other.id === collision.brick.id) continue;
    const c = brickCenter(other),
      dx = c.x - ball.x,
      dy = c.y - ball.y,
      distance = Math.hypot(dx, dy);
    if (
      distance < targetProfile(other).radius + FIELD.radius ||
      distance > 165 ||
      dx * ball.vx + dy * ball.vy <= 0
    )
      continue;
    const difference = Math.atan2(
      Math.sin(Math.atan2(dy, dx) - base),
      Math.cos(Math.atan2(dy, dx) - base),
    );
    if (Math.abs(difference) > Math.PI / 6) continue;
    const adjustment = clamp(difference, -limit, limit),
      angle = base + adjustment;
    // Never bend back into the contact surface, or steer an otherwise departing ball backwards.
    if (Math.cos(angle) * collision.nx + Math.sin(angle) * collision.ny < 0.03) continue;
    // Refraction cannot see through another target; the first body owns the ray.
    if (
      game.bricks.some(
        (blocker) =>
          blocker.hp > 0 &&
          blocker.id !== other.id &&
          blocker.id !== collision.brick.id &&
          blocker.kind !== 'pickup' &&
          sweep(ball, dx, dy, blocker),
      )
    )
      continue;
    const value = Math.abs(difference) + distance / 1800;
    if (!choice || value < choice.value) choice = { value, angle, adjustment };
  }
  if (!choice) return 0;
  const speed = Math.hypot(ball.vx, ball.vy);
  ball.vx = Math.cos(choice.angle) * speed;
  ball.vy = Math.sin(choice.angle) * speed;
  return choice.adjustment;
}
function moveBall(game, ball, dt) {
  let remaining = dt;
  for (let impact = 0; impact < 16 && remaining > EPS && !ball.done; impact++) {
    const travel = travelTime(remaining, ball.boost),
      dx = ball.vx * travel,
      dy = ball.vy * travel;
    ball.ignored = ball.ignored.filter((id) => {
      const b = game.bricks.find((b) => b.id === id && b.hp > 0);
      return b && inside(ball, b);
    });
    let collision = { t: 1, type: 'move', nx: 0, ny: 0 };
    const consider = (candidate) => {
      if (candidate && candidate.t >= -EPS && candidate.t <= collision.t) collision = candidate;
    };
    if (dx < 0)
      consider({ t: (FIELD.left + FIELD.radius - ball.x) / dx, type: 'wall', nx: 1, ny: 0 });
    if (dx > 0)
      consider({ t: (FIELD.right - FIELD.radius - ball.x) / dx, type: 'wall', nx: -1, ny: 0 });
    if (dy < 0)
      consider({ t: (FIELD.top + FIELD.radius - ball.y) / dy, type: 'wall', nx: 0, ny: 1 });
    if (dy > 0)
      consider({ t: (FIELD.floor - FIELD.radius - ball.y) / dy, type: 'return', nx: 0, ny: -1 });
    for (const brick of game.bricks) {
      if (brick.hp <= 0 || ball.ignored.includes(brick.id)) continue;
      const contact = sweep(ball, dx, dy, brick);
      if (contact) consider({ ...contact, type: 'brick', brick });
    }
    ball.x += dx * collision.t;
    ball.y += dy * collision.t;
    const consumed =
      collision.type === 'move'
        ? remaining
        : Math.min(remaining, contactTime(travel * collision.t, ball.boost));
    ball.boost *= Math.exp(-RHYTHM.reboundDecay * consumed);
    remaining -= consumed;
    const at = game.elapsed - remaining;
    trailPoint(ball, at, collision.type !== 'move');
    if (collision.type === 'move') break;
    if (collision.type === 'return') {
      if (game.nextX === null)
        game.nextX = clamp(ball.x, FIELD.left + FIELD.radius, FIELD.right - FIELD.radius);
      beginReturn(game, ball, 'natural');
      break;
    }
    if (collision.type !== 'brick' || collision.brick.kind !== 'pickup') game.collisionCount++;
    const contact = {
      x: ball.x - collision.nx * FIELD.radius,
      y: ball.y - collision.ny * FIELD.radius,
      ballId: ball.id,
      nx: collision.nx,
      ny: collision.ny,
      collisionCount: game.collisionCount,
    };
    if (collision.type === 'brick') {
      const brick = collision.brick;
      if (brick.kind === 'pickup') {
        brick.hp = 0;
        game.count = Math.min(LIMITS.balls, game.count + 1);
        emit(game, 'pickup', brickCenter(brick));
      } else hit(game, brick, contact);
      if (brick.kind === 'absorber' && brick.hp > 0) {
        ball.done = true;
        game.absorbed++;
        emit(game, 'absorb', {
          ...contact,
          ...brickCenter(brick),
          id: brick.id,
          kind: brick.kind,
          hp: brick.hp,
          maxHp: brick.maxHp,
          profile: targetProfile(brick),
          remaining: Math.max(0, game.volley - game.absorbed),
        });
        break;
      }
      if (brick.kind === 'pickup' || ball.pierce > 0) {
        if (brick.kind !== 'pickup') ball.pierce--;
        ball.ignored.push(brick.id);
        // Keep the exact entry point until natural travel leaves this body.
        // A component-wise nudge can push a grazing contact outside `inside`,
        // clear the ignore entry and charge damage again at the same surface.
        continue;
      }
    }
    const normalVelocity = ball.vx * collision.nx + ball.vy * collision.ny;
    ball.vx -= 2 * normalVelocity * collision.nx;
    ball.vy -= 2 * normalVelocity * collision.ny;
    const oldSpeed = Math.hypot(ball.vx, ball.vy),
      speed = clamp(oldSpeed * PHYSICS.restitution, PHYSICS.minSpeed, PHYSICS.maxSpeed);
    ball.vx *= speed / oldSpeed;
    ball.vy *= speed / oldSpeed;
    const refraction = refract(game, ball, collision);
    ball.boost = RHYTHM.reboundBoost * (0.65 + 0.35 * ((game.collisionCount % 4) / 3));
    emit(game, 'bounce', {
      ...contact,
      at,
      kind: collision.type,
      brickId: collision.brick?.id,
      refraction,
      speed,
    });
    ball.x += collision.nx * EPS * 2;
    ball.y += collision.ny * EPS * 2;
  }
}
export function upgradeAvailable(game, id) {
  const item = UPGRADES.find((u) => u.id === id);
  if (!item || (game.upgrades[id] || 0) >= item.max) return false;
  if (id === 'extra' && game.count >= LIMITS.balls) return false;
  if (id === 'power' && game.turn < [5, 20, 40][game.upgrades.power || 0]) return false;
  return true;
}
function offerUpgrades(game) {
  const pool = UPGRADES.filter((u) => upgradeAvailable(game, u.id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random(game) * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  game.cards = pool.slice(0, 3).map((u) => u.id);
  game.phase = game.cards.length ? 'upgrade' : 'aim';
}
function endTurn(game) {
  game.turn++;
  game.launchX = game.nextX ?? game.launchX;
  game.balls = [];
  game.bricks = game.bricks.filter((b) => b.hp > 0);
  if (
    !game.level.endless &&
    game.waveIndex >= game.level.waves.length &&
    !game.bricks.some((b) => b.kind !== 'pickup')
  ) {
    game.phase = 'won';
    emit(game, 'won');
    return;
  }
  game.bricks.forEach((b) => b.r++);
  addRow(game);
  game.bricks = game.bricks.filter((b) => b.kind !== 'pickup' || b.r <= FIELD.maxRow);
  if (game.bricks.some((b) => b.kind !== 'pickup' && b.r > FIELD.maxRow)) {
    game.phase = 'lost';
    emit(game, 'lost');
    return;
  }
  if (game.turn % game.level.upgradeEvery === 0) offerUpgrades(game);
  else game.phase = 'aim';
  emit(game, 'turn');
}
function beginReturn(game, ball, reason) {
  if (ball.done) return;
  const to = { x: game.nextX ?? game.launchX, y: FIELD.floor - FIELD.radius - 1 };
  const from = { x: ball.x, y: ball.y };
  const index = Number(String(ball.id).split(':').at(-1)) || 0;
  const duration =
    reason === 'natural'
      ? 0.26 + Math.min(0.28, Math.abs(from.x - to.x) / 1000)
      : 0.88 + (index % 4) * 0.07;
  const control = {
    x: clamp(
      (from.x + to.x) / 2 + (index % 2 ? 36 : -36),
      FIELD.left + FIELD.radius,
      FIELD.right - FIELD.radius,
    ),
    y: Math.max(FIELD.top + 12, Math.min(from.y, to.y) - (reason === 'natural' ? 26 : 60)),
  };
  Object.assign(ball, {
    returning: true,
    returnFrom: from,
    returnTo: to,
    returnControl: control,
    returnElapsed: 0,
    returnDuration: duration,
    returnReason: reason,
  });
  emit(game, 'return', {
    ballId: ball.id,
    x: from.x,
    y: from.y,
    toX: to.x,
    toY: to.y,
    controlX: control.x,
    controlY: control.y,
    duration,
    reason,
  });
}
function advanceReturn(game, ball, dt) {
  ball.returnElapsed = Math.min(ball.returnDuration, ball.returnElapsed + dt);
  const progress = ball.returnElapsed / ball.returnDuration,
    t = progress * progress;
  const a = ball.returnFrom,
    c = ball.returnControl,
    b = ball.returnTo;
  ball.x = (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x;
  ball.y = (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y;
  trailPoint(ball, game.elapsed);
  if (progress >= 1 - 1e-10) {
    ball.done = true;
    emit(game, 'returned', { ballId: ball.id, x: b.x, y: b.y, reason: ball.returnReason });
  }
}
export function recall(game, reason = 'manual') {
  if (game.phase !== 'flight') return false;
  game.nextX ??= game.launchX;
  game.phase = 'recall';
  game.recallReason = reason === 'timeout' ? 'timeout' : 'manual';
  for (const ball of game.balls) if (!ball.done) beginReturn(game, ball, game.recallReason);
  emit(game, 'recall', {
    reason: game.recallReason,
    x: game.nextX,
    y: FIELD.floor - FIELD.radius - 1,
  });
  return true;
}
export function chooseUpgrade(game, id) {
  if (game.phase !== 'upgrade' || !game.cards.includes(id) || !upgradeAvailable(game, id))
    return false;
  game.upgrades[id] = (game.upgrades[id] || 0) + 1;
  if (id === 'extra') game.count = Math.min(LIMITS.balls, game.count + 2);
  if (id === 'power') game.damage = Math.min(LIMITS.damage, game.damage + 1);
  game.cards = [];
  game.phase = 'aim';
  emit(game, 'upgrade', { id });
  return true;
}
export function canReward(game, id) {
  if (!game || game.challenge || game.practice || !['aim', 'upgrade', 'lost'].includes(game.phase))
    return false;
  if (id === 'resonance') return game.phase !== 'lost' && !game.rewards.resonance;
  if (id === 'rescue')
    return (
      !game.rewards.rescue &&
      game.bricks.some((b) => b.hp > 0 && b.kind !== 'pickup' && b.r >= FIELD.maxRow - 2)
    );
  return false;
}
export function grantReward(game, id) {
  if (!canReward(game, id)) return false;
  game.rewards[id] = 1;
  if (id === 'rescue') {
    const occupied = [
      ...new Set(game.bricks.filter((b) => b.hp > 0 && b.kind !== 'pickup').map((b) => b.r)),
    ]
      .sort((a, b) => b - a)
      .slice(0, 2);
    const removed = game.bricks.filter((b) => occupied.includes(b.r));
    game.bricks = game.bricks.filter((b) => !occupied.includes(b.r));
    for (const b of removed) emit(game, 'rescue-clear', { ...brickCenter(b), id: b.id });
    if (game.phase === 'lost') {
      game.phase = 'aim';
      game.cards = [];
      game.balls = [];
    }
    if (
      !game.level.endless &&
      game.waveIndex >= game.level.waves.length &&
      !game.bricks.some((b) => b.kind !== 'pickup')
    )
      game.phase = 'won';
  }
  emit(game, 'reward', { id });
  return true;
}
function advanceStep(game, dt) {
  if (game.phase === 'recall') {
    game.elapsed += dt;
    for (const ball of game.balls) if (!ball.done) advanceReturn(game, ball, dt);
    game.balls = game.balls.filter((b) => !b.done);
    if (!game.balls.length) endTurn(game);
    return;
  }
  let remaining = dt;
  while (remaining > 1e-10 && game.phase === 'flight') {
    while (game.emitted < game.volley && game.flight + 1e-10 >= launchAt(game.emitted))
      launch(game);
    const untilLaunch =
      game.emitted < game.volley ? launchAt(game.emitted) - game.flight : Infinity;
    const step = Math.min(remaining, untilLaunch);
    remaining -= step;
    game.elapsed += step;
    game.flight += step;
    for (const ball of game.balls)
      if (!ball.done) {
        if (ball.returning) {
          advanceReturn(game, ball, step);
          continue;
        }
        ball.vy += (PHYSICS.gravity * step) / 2;
        moveBall(game, ball, step);
        if (!ball.done && !ball.returning) {
          ball.vy += (PHYSICS.gravity * step) / 2;
          const speed = Math.hypot(ball.vx, ball.vy);
          if (speed > PHYSICS.maxSpeed) {
            ball.vx *= PHYSICS.maxSpeed / speed;
            ball.vy *= PHYSICS.maxSpeed / speed;
          }
        }
      }
    game.balls = game.balls.filter((b) => !b.done);
    while (game.emitted < game.volley && game.flight + 1e-10 >= launchAt(game.emitted))
      launch(game);
    if (game.flight >= MAX_FLIGHT - 1e-10) {
      recall(game, 'timeout');
      break;
    }
    if (game.emitted === game.volley && !game.balls.length) endTurn(game);
  }
}
export function update(game, dt) {
  if (!['flight', 'recall'].includes(game.phase) || !Number.isFinite(dt) || dt <= 0) return;
  game.stepRemainder = (game.stepRemainder || 0) + Math.min(dt, 0.25);
  while (game.stepRemainder + 1e-10 >= PHYSICS.step && ['flight', 'recall'].includes(game.phase)) {
    game.stepRemainder = Math.max(0, game.stepRemainder - PHYSICS.step);
    advanceStep(game, PHYSICS.step);
  }
  if (!['flight', 'recall'].includes(game.phase)) game.stepRemainder = 0;
}
export function drainEvents(game) {
  return game.events.splice(0);
}
export function checkpoint(game) {
  if (!['aim', 'upgrade'].includes(game.phase) || game.practice || game.challenge) return null;
  const saved = copy(game);
  saved.events = [];
  saved.balls = [];
  return saved;
}
// Trusted catalog lengths for checkpoint schemas 1/2; never trust saved.level to skip waves.
const LEGACY_WAVE_COUNTS = Object.freeze({
  stardust: 4,
  prism: 5,
  flare: 6,
  frost: 6,
  void: 7,
  orbit: 8,
});
export function restoreGame(saved) {
  if (
    !saved ||
    ![1, 2, 3].includes(saved.schemaVersion) ||
    saved.practice ||
    saved.challenge ||
    !['aim', 'upgrade'].includes(saved.phase)
  )
    return null;
  const level = levelById(saved.levelId),
    legacy = saved.schemaVersion < 3;
  if (
    !level ||
    !Array.isArray(saved.bricks) ||
    saved.bricks.length > 77 ||
    !Array.isArray(saved.cards) ||
    !saved.upgrades ||
    typeof saved.upgrades !== 'object' ||
    Array.isArray(saved.upgrades)
  )
    return null;
  const integer = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
  if (
    !integer(saved.turn, 1000000) ||
    !integer(saved.score, 10000000) ||
    !integer(
      saved.count,
      saved.schemaVersion === 1 ? 99 : saved.schemaVersion === 2 ? 36 : LIMITS.balls,
    ) ||
    saved.count < 1 ||
    !integer(saved.damage, saved.schemaVersion === 1 ? 1000000 : LIMITS.damage) ||
    saved.damage < 1 ||
    !integer(saved.waveIndex, 1000000) ||
    !integer(saved.shots, 1000000) ||
    !integer(saved.nextId, 10000000) ||
    !integer(saved.seed, 0xffffffff) ||
    saved.seed === 0 ||
    !Number.isFinite(saved.launchX) ||
    saved.launchX < FIELD.left + 4.5 ||
    saved.launchX > FIELD.right - 4.5 ||
    !Number.isFinite(saved.elapsed) ||
    saved.elapsed < 0
  )
    return null;
  if (
    !level.endless &&
    legacy &&
    (!Object.hasOwn(LEGACY_WAVE_COUNTS, level.id) || saved.waveIndex > LEGACY_WAVE_COUNTS[level.id])
  )
    return null;
  if (!level.endless && saved.waveIndex > level.waves.length) return null;
  if (!integer(saved.bestCombo, 10000000) || saved.bestCombo > saved.score) return null;
  if (
    saved.bricks.some(
      (b) =>
        !integer(b.id, 10000000) ||
        !integer(b.c, 6) ||
        !integer(b.r, FIELD.maxRow) ||
        !(legacy ? ['brick', 'bomb', 'pickup'] : ['brick', 'bomb', 'pickup', 'absorber']).includes(
          b.kind,
        ) ||
        !integer(b.hp, 10000000) ||
        b.hp < 1 ||
        !integer(b.maxHp, 10000000) ||
        b.maxHp < b.hp,
    )
  )
    return null;
  if (
    new Set(saved.bricks.map((b) => b.id)).size !== saved.bricks.length ||
    new Set(saved.bricks.map((b) => `${b.c}:${b.r}`)).size !== saved.bricks.length ||
    saved.bricks.some((b) => b.id >= saved.nextId)
  )
    return null;
  if (
    Object.entries(saved.upgrades).some(
      ([id, n]) =>
        !UPGRADES.some((u) => u.id === id) ||
        !integer(n, saved.schemaVersion === 1 ? 1000000 : UPGRADES.find((u) => u.id === id).max),
    )
  )
    return null;
  if (
    saved.phase === 'upgrade' &&
    (saved.cards.length < 1 ||
      saved.cards.length > 3 ||
      new Set(saved.cards).size !== saved.cards.length ||
      saved.cards.some((id) => !UPGRADES.some((u) => u.id === id)))
  )
    return null;
  if (
    (saved.schemaVersion >= 2 && saved.rewards === undefined) ||
    (saved.rewards !== undefined &&
      (!saved.rewards ||
        Array.isArray(saved.rewards) ||
        !integer(saved.rewards.resonance, 1) ||
        !integer(saved.rewards.rescue, 1)))
  )
    return null;
  const game = createGame(level.id);
  for (const key of [
    'phase',
    'seed',
    'turn',
    'score',
    'shots',
    'count',
    'damage',
    'upgrades',
    'cards',
    'launchX',
    'bricks',
    'waveIndex',
    'nextId',
    'elapsed',
    'bestCombo',
    'rewards',
  ])
    game[key] = copy(saved[key] ?? game[key]);
  game.count = Math.min(LIMITS.balls, game.count);
  game.damage = Math.min(LIMITS.damage, game.damage);
  for (const item of UPGRADES)
    if (game.upgrades[item.id]) game.upgrades[item.id] = Math.min(item.max, game.upgrades[item.id]);
  if (legacy) {
    // Preserve the current board's relative effort when old uncapped builds are normalized.
    const ratio = Math.min(1, (game.count * game.damage) / (saved.count * saved.damage));
    for (const brick of game.bricks)
      if (brick.kind !== 'pickup') {
        brick.hp = Math.max(1, Math.ceil(brick.hp * ratio));
        brick.maxHp = Math.max(brick.hp, Math.ceil(brick.maxHp * ratio));
      }
  }
  game.cards =
    game.phase === 'upgrade' ? game.cards.filter((id) => upgradeAvailable(game, id)) : [];
  if (game.phase === 'upgrade' && !game.cards.length) game.phase = 'aim';
  game.initialSeed =
    integer(saved.initialSeed, 0xffffffff) && saved.initialSeed > 0 ? saved.initialSeed : null;
  game.launchX = clamp(game.launchX, FIELD.left + FIELD.radius, FIELD.right - FIELD.radius);
  return game;
}
