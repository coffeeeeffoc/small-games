import { LEVELS, UPGRADES, levelById, validateLevels } from './levels.mjs';

export { LEVELS, UPGRADES, levelById, validateLevels };
export const WIDTH = 390;
export const HEIGHT = 600;
export const FIELD = Object.freeze({
  left: 20,
  right: 370,
  launchY: 64,
  deadline: 106,
  bottom: 565,
  ballRadius: 4,
  speed: 700,
  rowStep: 58,
});
const EPS = 0.00001;
const STAGGER = 0.065;
const MAX_FLIGHT = 9;
const SUBSTEP = 1 / 240;
const copy = (value) => JSON.parse(JSON.stringify(value));

export function triangleVertices(target) {
  const rotation = target.rotation || 0;
  return Array.from({ length: 3 }, (_, index) => {
    const angle = -Math.PI / 2 + rotation + (index * Math.PI * 2) / 3;
    return { x: target.x + Math.cos(angle) * target.r, y: target.y + Math.sin(angle) * target.r };
  });
}

function emit(game, type, detail = {}) {
  game.events.push({ type, ...detail });
}

function spawnWave(game, rowIndex, y) {
  for (const [index, target] of game.level.waves[rowIndex].targets.entries()) {
    game.targets.push({
      ...target,
      id: `${game.levelId}:${rowIndex}:${index}`,
      y,
      maxHp: target.hp,
      hit: 0,
      rotation: target.rotation || 0,
    });
  }
  game.waveIndex = rowIndex + 1;
}

export function createGame(levelId, { practice = false, upgrade } = {}) {
  const level = typeof levelId === 'object' ? levelId : levelById(levelId);
  if (!level) throw new Error(`Unknown Ember Bounce level: ${levelId}`);
  // Validate custom fixtures without requiring them to keep a campaign prerequisite.
  const errors = validateLevels([{ ...level, unlock: null }]);
  if (errors.length) throw new Error(`Invalid Ember Bounce level: ${errors.join('; ')}`);
  const game = {
    level: copy(level),
    levelId: level.id,
    practice: Boolean(practice),
    phase: 'aim',
    targets: [],
    balls: [],
    launch: { x: WIDTH / 2, y: FIELD.launchY },
    score: 0,
    turn: 1,
    completedTurns: 0,
    ballCount: level.balls,
    damage: 1,
    blastRadius: 92,
    blastDamage: 2,
    upgrades: [],
    destroyed: 0,
    totalTargets: level.waves.reduce(
      (sum, row) => sum + row.targets.filter((target) => target.kind !== 'pickup').length,
      0,
    ),
    elapsed: 0,
    flightTime: 0,
    combo: 0,
    bestCombo: 0,
    events: [],
    waveIndex: 0,
    volleyCount: 0,
    emitted: 0,
    nextBallAt: 0,
    collected: 0,
    recalled: false,
    direction: { x: 0, y: 1 },
    nextBallId: 1,
    failure: null,
  };
  for (let rowIndex = 0; rowIndex < level.initialRows; rowIndex += 1) {
    spawnWave(game, rowIndex, 518 - (level.initialRows - rowIndex - 1) * FIELD.rowStep);
  }
  if (upgrade) grantUpgrade(game, upgrade);
  return game;
}

function direction(dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || dy <= 0) return null;
  const length = Math.hypot(dx, dy);
  if (length < EPS) return null;
  let x = dx / length;
  let y = dy / length;
  // An almost horizontal launch cannot strand a ball along the collection line.
  if (y < 0.16) {
    y = 0.16;
    x = Math.sign(x) * Math.sqrt(1 - y * y);
  }
  return { x, y };
}

function launchBall(game) {
  game.balls.push({
    id: game.nextBallId++,
    x: game.launch.x,
    y: game.launch.y,
    vx: game.direction.x * FIELD.speed,
    vy: game.direction.y * FIELD.speed,
    age: 0,
    bounces: 0,
    trail: [],
    returned: false,
  });
  game.emitted += 1;
  game.nextBallAt = game.emitted * STAGGER;
}

export function fire(game, dx, dy) {
  const shot = direction(dx, dy);
  if (game.phase !== 'aim' || !shot) return false;
  game.phase = 'flight';
  game.direction = shot;
  game.flightTime = 0;
  game.volleyCount = game.ballCount;
  game.emitted = 0;
  game.collected = 0;
  game.combo = 0;
  game.recalled = false;
  game.balls = [];
  launchBall(game);
  emit(game, 'fire', { x: game.launch.x, y: game.launch.y, value: game.volleyCount });
  return true;
}

function circleHit(point, delta, cx, cy, radius) {
  const px = point.x - cx;
  const py = point.y - cy;
  const a = delta.x * delta.x + delta.y * delta.y;
  if (a < EPS * EPS) return null;
  const inward = px * delta.x + py * delta.y;
  const c = px * px + py * py - radius * radius;
  if (c <= EPS) {
    if (inward >= 0) return null;
    const length = Math.hypot(px, py) || 1;
    return { t: 0, nx: px / length, ny: py / length };
  }
  const discriminant = inward * inward - a * c;
  if (discriminant < 0) return null;
  const t = (-inward - Math.sqrt(discriminant)) / a;
  if (t < -EPS || t > 1 + EPS) return null;
  const nx = (px + delta.x * t) / radius;
  const ny = (py + delta.y * t) / radius;
  return { t: Math.max(0, t), nx, ny };
}

/** Sweep a circular ball against each true triangle edge and its rounded vertices. */
function triangleHit(point, delta, target) {
  const vertices = triangleVertices(target);
  let result = null;
  const consider = (hit) => {
    if (hit && (!result || hit.t < result.t)) result = hit;
  };
  for (let index = 0; index < 3; index += 1) {
    const a = vertices[index];
    const b = vertices[(index + 1) % 3];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const length = Math.hypot(ex, ey);
    const nx = ey / length;
    const ny = -ex / length;
    const distance = (point.x - a.x) * nx + (point.y - a.y) * ny;
    const travel = delta.x * nx + delta.y * ny;
    if (travel < -EPS) {
      const t = (FIELD.ballRadius - distance) / travel;
      if (t >= -EPS && t <= 1 + EPS) {
        const x = point.x + delta.x * t - nx * FIELD.ballRadius;
        const y = point.y + delta.y * t - ny * FIELD.ballRadius;
        const projection = ((x - a.x) * ex + (y - a.y) * ey) / length;
        if (projection >= 0 && projection <= length) consider({ t: Math.max(0, t), nx, ny });
      }
    }
    consider(circleHit(point, delta, a.x, a.y, FIELD.ballRadius));
  }
  return result;
}

function earliestCollision(game, point, delta, preview = false) {
  let result = null;
  const consider = (t, type, nx, ny, target) => {
    if (t >= -EPS && t <= 1 + EPS && (!result || t < result.t))
      result = { t: Math.max(0, t), type, nx, ny, target };
  };
  if (delta.x < 0) consider((FIELD.left + FIELD.ballRadius - point.x) / delta.x, 'wall', 1, 0);
  if (delta.x > 0) consider((FIELD.right - FIELD.ballRadius - point.x) / delta.x, 'wall', -1, 0);
  if (delta.y > 0) consider((FIELD.bottom - FIELD.ballRadius - point.y) / delta.y, 'wall', 0, -1);
  if (delta.y < 0) consider((FIELD.launchY - point.y) / delta.y, 'collect', 0, 1);
  for (const target of game.targets) {
    if (target.hp <= 0 || (preview && target.kind === 'pickup')) continue;
    const reach = target.r + FIELD.ballRadius;
    if (
      Math.max(point.x, point.x + delta.x) < target.x - reach ||
      Math.min(point.x, point.x + delta.x) > target.x + reach ||
      Math.max(point.y, point.y + delta.y) < target.y - reach ||
      Math.min(point.y, point.y + delta.y) > target.y + reach
    )
      continue;
    const hit =
      target.kind === 'prism'
        ? triangleHit(point, delta, target)
        : circleHit(point, delta, target.x, target.y, reach);
    if (hit) consider(hit.t, 'target', hit.nx, hit.ny, target);
  }
  return result;
}

function collectPickup(game, target) {
  target.hp = 0;
  target.hit = 0.24;
  const increase = game.ballCount < 32 ? 1 : 0;
  game.ballCount = Math.min(32, game.ballCount + 1);
  game.score += 35;
  emit(game, 'pickup', {
    targetId: target.id,
    kind: 'pickup',
    x: target.x,
    y: target.y,
    value: increase,
  });
}

function damageTarget(game, target, amount, source = 'ball') {
  if (target.hp <= 0 || target.kind === 'pickup') return;
  const damage = Math.min(target.hp, amount);
  target.hp -= damage;
  target.hit = 0.2;
  game.combo += 1;
  game.bestCombo = Math.max(game.bestCombo, game.combo);
  game.score += damage * 10 + Math.min(game.combo, 20) * 2;
  emit(game, 'collision', {
    targetId: target.id,
    kind: target.kind,
    x: target.x,
    y: target.y,
    value: damage,
    source,
  });
  if (target.hp > 0) return;
  game.destroyed += 1;
  game.score += 50;
  emit(game, 'break', {
    targetId: target.id,
    kind: target.kind,
    x: target.x,
    y: target.y,
    value: game.combo,
  });
  if (target.kind === 'burst') {
    emit(game, 'blast', {
      x: target.x,
      y: target.y,
      radius: game.blastRadius,
      value: game.blastDamage,
    });
    for (const neighbor of game.targets) {
      if (
        neighbor !== target &&
        neighbor.hp > 0 &&
        neighbor.kind !== 'pickup' &&
        Math.hypot(neighbor.x - target.x, neighbor.y - target.y) <= game.blastRadius
      ) {
        damageTarget(game, neighbor, game.blastDamage, 'blast');
      }
    }
  }
}

function returnBall(game, ball) {
  if (ball.returned) return;
  ball.returned = true;
  game.collected += 1;
  emit(game, 'collect', { x: ball.x, y: FIELD.launchY, value: 1, ballId: ball.id });
}

function moveBall(game, ball, dt) {
  ball.age += dt;
  let remaining = dt;
  for (let bounce = 0; remaining > EPS && bounce < 8 && !ball.returned; bounce += 1) {
    const delta = { x: ball.vx * remaining, y: ball.vy * remaining };
    const hit = earliestCollision(game, ball, delta);
    if (!hit) {
      ball.x += delta.x;
      ball.y += delta.y;
      break;
    }
    ball.x += delta.x * hit.t;
    ball.y += delta.y * hit.t;
    remaining *= 1 - hit.t;
    if (hit.type === 'collect') {
      returnBall(game, ball);
      break;
    }
    if (hit.target?.kind === 'pickup') {
      collectPickup(game, hit.target);
      // A pickup passes through rather than changing the trajectory.
      continue;
    }
    if (hit.target) damageTarget(game, hit.target, game.damage);
    else emit(game, 'wall', { x: ball.x, y: ball.y, value: 1 });
    const dot = ball.vx * hit.nx + ball.vy * hit.ny;
    ball.vx -= 2 * dot * hit.nx;
    ball.vy -= 2 * dot * hit.ny;
    ball.x += hit.nx * 0.001;
    ball.y += hit.ny * 0.001;
    ball.bounces += 1;
  }
}

function endTurn(game) {
  game.balls = [];
  game.completedTurns += 1;
  game.turn = game.completedTurns + 1;
  game.targets = game.targets.filter((target) => target.hp > 0);
  if (
    game.waveIndex === game.level.waves.length &&
    game.targets.every((target) => target.kind === 'pickup')
  ) {
    game.phase = 'won';
    game.targets = [];
    emit(game, 'win', { value: game.score, turns: game.completedTurns });
    return;
  }
  for (const target of game.targets) target.y -= FIELD.rowStep;
  if (
    game.targets.some((target) => target.kind !== 'pickup' && target.y - target.r <= FIELD.deadline)
  ) {
    game.phase = 'lost';
    game.failure = 'deadline';
    emit(game, 'loss', { reason: 'deadline', value: game.score });
    return;
  }
  // Pickups never cause defeat; remove one when it leaves the reachable field.
  game.targets = game.targets.filter(
    (target) => target.y - target.r > FIELD.deadline || target.kind !== 'pickup',
  );
  if (game.waveIndex < game.level.waves.length) spawnWave(game, game.waveIndex, 518);
  game.phase = game.level.upgradeTurns.includes(game.completedTurns) ? 'upgrade' : 'aim';
  emit(game, 'turn', { value: game.turn, phase: game.phase, waveIndex: game.waveIndex });
}

/** Manual recall gives up remaining hits, then applies the same normal row advance. */
export function recall(game) {
  if (game.phase !== 'flight' || game.recalled) return false;
  game.recalled = true;
  game.collected += game.volleyCount - game.emitted;
  game.emitted = game.volleyCount;
  emit(game, 'recall', { value: game.volleyCount - game.collected });
  return true;
}

export function step(game, dt) {
  if (!Number.isFinite(dt) || dt <= 0) return game;
  const duration = Math.min(dt, 0.25);
  if (game.phase !== 'flight') {
    for (const target of game.targets) target.hit = Math.max(0, target.hit - duration);
    return game;
  }
  const parts = Math.ceil(duration / SUBSTEP);
  const tick = duration / parts;
  for (let index = 0; index < parts && game.phase === 'flight'; index += 1) {
    game.elapsed += tick;
    game.flightTime += tick;
    for (const target of game.targets) target.hit = Math.max(0, target.hit - tick);
    if (game.flightTime >= MAX_FLIGHT && !game.recalled) {
      recall(game);
      emit(game, 'timeout', { value: MAX_FLIGHT });
    }
    while (
      !game.recalled &&
      game.emitted < game.volleyCount &&
      game.flightTime + EPS >= game.nextBallAt
    )
      launchBall(game);
    for (const ball of game.balls) {
      if (ball.returned) continue;
      if (game.recalled) {
        const dx = game.launch.x - ball.x;
        const dy = game.launch.y - ball.y;
        const distance = Math.hypot(dx, dy);
        const travel = 1800 * tick;
        if (distance <= travel) {
          ball.x = game.launch.x;
          ball.y = game.launch.y;
          returnBall(game, ball);
        } else {
          ball.x += (dx / distance) * travel;
          ball.y += (dy / distance) * travel;
        }
      } else moveBall(game, ball, tick);
    }
    game.balls = game.balls.filter((ball) => !ball.returned);
    if (game.emitted === game.volleyCount && game.balls.length === 0) endTurn(game);
  }
  for (const ball of game.balls) {
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 7) ball.trail.shift();
  }
  return game;
}

function grantUpgrade(game, id) {
  if (!UPGRADES.some((upgrade) => upgrade.id === id)) return false;
  if (id === 'extra') game.ballCount = Math.min(32, game.ballCount + 2);
  if (id === 'power') game.damage = Math.min(4, game.damage + 1);
  if (id === 'blast') {
    game.blastRadius = Math.min(190, game.blastRadius + 38);
    game.blastDamage += 1;
  }
  game.upgrades.push(id);
  return true;
}

export function applyUpgrade(game, id) {
  if (game.phase !== 'upgrade' || !grantUpgrade(game, id)) return false;
  game.phase = 'aim';
  emit(game, 'upgrade', { kind: id, value: game.upgrades.length });
  return true;
}

export function previewAim(game, dx, dy) {
  const aim = direction(dx, dy);
  if (!aim || game.phase !== 'aim') return [];
  const point = { ...game.launch };
  const velocity = { x: aim.x, y: aim.y };
  const points = [{ ...point }];
  let distance = 850;
  let reflectedTarget = false;
  for (let bounce = 0; bounce < 6 && distance > EPS; bounce += 1) {
    const delta = { x: velocity.x * distance, y: velocity.y * distance };
    const hit = earliestCollision(game, point, delta, true);
    const travel = hit ? distance * hit.t : distance;
    for (let offset = 16; offset < travel; offset += 16)
      points.push({ x: point.x + velocity.x * offset, y: point.y + velocity.y * offset });
    point.x += velocity.x * travel;
    point.y += velocity.y * travel;
    points.push({ ...point, bounce: Boolean(hit && hit.type !== 'collect') });
    distance -= travel;
    if (!hit || hit.type === 'collect' || reflectedTarget) break;
    if (hit.target) {
      reflectedTarget = true;
      distance = Math.min(distance, 110);
    }
    const dot = velocity.x * hit.nx + velocity.y * hit.ny;
    velocity.x -= 2 * dot * hit.nx;
    velocity.y -= 2 * dot * hit.ny;
    point.x += hit.nx * 0.001;
    point.y += hit.ny * 0.001;
  }
  return points;
}

export function snapshot(game) {
  return copy(game);
}
