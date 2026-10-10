import { LEVELS } from './content.mjs';

export const SIZE = 1000;
export const STEP = 1 / 240;
export const POCKETS = [
  [104, 104],
  [896, 104],
  [104, 896],
  [896, 896],
];
export const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
export const sideColor = (side) => (side === 0 ? 'white' : 'black');
export const remaining = (game, side) =>
  game.coins.filter((c) => !c.pocketed && c.kind === sideColor(side)).length;
const disk = (id, kind, x, y) => ({
  id,
  kind,
  x,
  y,
  px: x,
  py: y,
  vx: 0,
  vy: 0,
  r: kind === 'striker' ? 24 : 18,
  mass: kind === 'striker' ? 1.7 : 1,
  pocketed: false,
});

export function createGame(levelId = null) {
  const level = levelId ? LEVELS.find((l) => l.id === levelId) : null;
  if (levelId && !level) throw new Error('Unknown level');
  const coins = [];
  if (level) level.coins.forEach(([kind, x, y], i) => coins.push(disk(`coin-${i}`, kind, x, y)));
  else {
    coins.push(disk('queen', 'queen', 500, 500));
    for (let ring = 1; ring <= 2; ring++) {
      for (let i = 0; i < ring * 6; i++) {
        const angle = (i / (ring * 6)) * Math.PI * 2 - Math.PI / 2;
        coins.push(
          disk(
            `coin-${coins.length}`,
            i % 2 ? 'white' : 'black',
            500 + Math.cos(angle) * ring * 38,
            500 + Math.sin(angle) * ring * 38,
          ),
        );
      }
    }
  }
  const game = {
    version: 1,
    levelId,
    coins,
    striker: disk('striker', 'striker', 500, 790),
    turn: 0,
    phase: 'ready',
    shots: 0,
    playerShots: 0,
    fouls: 0,
    debt: [0, 0],
    queen: level?.queen || !level ? 'board' : 'none',
    queenOwner: null,
    shotPots: [],
    shotFoul: false,
    quiet: 0,
    elapsed: 0,
    winner: null,
    message: level?.tip ?? '你的回合 · 白子先行',
    events: [],
    totals: [
      coins.filter((c) => c.kind === 'white').length,
      coins.filter((c) => c.kind === 'black').length,
    ],
  };
  placeStriker(game, 500);
  return game;
}

export function placeStriker(game, requestedX) {
  if (game.phase !== 'ready') return false;
  const y = game.turn === 0 ? 790 : 210;
  const desired = clamp(requestedX, 235, 765);
  const free = (x) =>
    !game.coins.some((c) => !c.pocketed && Math.hypot(c.x - x, c.y - y) < c.r + 25);
  let x = desired;
  if (!free(x)) {
    let best = null;
    for (let candidate = 235; candidate <= 765; candidate += 2) {
      if (
        free(candidate) &&
        (best === null || Math.abs(candidate - desired) < Math.abs(best - desired))
      )
        best = candidate;
    }
    if (best === null) return false;
    x = best;
  }
  Object.assign(game.striker, disk('striker', 'striker', x, y));
  return true;
}

export function shoot(game, dx, dy, power) {
  const length = Math.hypot(dx, dy);
  if (
    game.phase !== 'ready' ||
    !Number.isFinite(length) ||
    length < 0.001 ||
    !Number.isFinite(power) ||
    power < 0.025 ||
    power > 1 ||
    !placeStriker(game, game.striker.x)
  )
    return false;
  game.striker.vx = (dx / length) * (180 + power * 1670);
  game.striker.vy = (dy / length) * (180 + power * 1670);
  game.phase = 'moving';
  game.quiet = 0;
  game.elapsed = 0;
  game.shotPots = [];
  game.shotFoul = false;
  game.shots++;
  if (game.turn === 0) game.playerShots++;
  game.message = '听，棋子在滑行';
  game.events.push({ type: 'strike', strength: power });
  return true;
}

export function step(game, dt = STEP) {
  if (game.phase !== 'moving') return;
  if (!Number.isFinite(dt) || dt <= 0 || dt > 1 / 60) throw new Error('Physics step out of range');
  const bodies = [...game.coins, game.striker].filter((c) => !c.pocketed);
  game.elapsed += dt;
  for (const c of bodies) {
    c.px = c.x;
    c.py = c.y;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    const speed = Math.hypot(c.vx, c.vy);
    const next = Math.max(0, speed - 430 * dt);
    if (speed) {
      c.vx *= next / speed;
      c.vy *= next / speed;
    }
    const pocket = POCKETS.find(([x, y]) => Math.hypot(x - c.x, y - c.y) < 32);
    if (pocket) {
      c.pocketed = true;
      c.vx = c.vy = 0;
      if (c.kind === 'striker') game.shotFoul = true;
      else game.shotPots.push(c.id);
      game.events.push({ type: 'pocket', x: pocket[0], y: pocket[1], kind: c.kind });
      continue;
    }
    let hit = false;
    for (const axis of ['x', 'y']) {
      const key = axis === 'x' ? 'vx' : 'vy';
      if (c[axis] < 70 + c.r) {
        c[axis] = 70 + c.r;
        c[key] = Math.abs(c[key]) * 0.83;
        hit = true;
      }
      if (c[axis] > 930 - c.r) {
        c[axis] = 930 - c.r;
        c[key] = -Math.abs(c[key]) * 0.83;
        hit = true;
      }
    }
    if (hit && speed > 80) game.events.push({ type: 'wall', strength: Math.min(speed / 1200, 1) });
  }
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    if (a.pocketed) continue;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      if (b.pocketed) continue;
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const d = Math.hypot(dx, dy),
        radius = a.r + b.r;
      if (d >= radius) continue;
      const nx = d > 0.0001 ? dx / d : 1,
        ny = d > 0.0001 ? dy / d : 0;
      const inverse = 1 / a.mass + 1 / b.mass;
      const overlap = radius - d + 0.005;
      a.x -= (nx * overlap) / a.mass / inverse;
      a.y -= (ny * overlap) / a.mass / inverse;
      b.x += (nx * overlap) / b.mass / inverse;
      b.y += (ny * overlap) / b.mass / inverse;
      const velocity = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (velocity >= 0) continue;
      const impulse = (-(1 + 0.94) * velocity) / inverse;
      a.vx -= (impulse * nx) / a.mass;
      a.vy -= (impulse * ny) / a.mass;
      b.vx += (impulse * nx) / b.mass;
      b.vy += (impulse * ny) / b.mass;
      if (-velocity > 60)
        game.events.push({ type: 'collision', strength: Math.min(-velocity / 1000, 1) });
    }
  }
  const moving = bodies.some((c) => !c.pocketed && Math.hypot(c.vx, c.vy) > 0.01);
  game.quiet = moving ? 0 : game.quiet + dt;
  if (game.quiet > 0.15) resolveShot(game);
}

function returnCoin(game, coin) {
  if (!coin) return;
  for (let i = 0; i < 2000; i++) {
    const radius = i ? 10 * Math.sqrt(i) : 0,
      angle = i * 2.4;
    const x = 500 + Math.cos(angle) * radius,
      y = 500 + Math.sin(angle) * radius;
    if (x < 130 || x > 870 || y < 130 || y > 870) continue;
    if (
      game.coins.some(
        (c) => c !== coin && !c.pocketed && Math.hypot(c.x - x, c.y - y) < c.r + coin.r + 2,
      )
    )
      continue;
    Object.assign(coin, disk(coin.id, coin.kind, x, y));
    return;
  }
  throw new Error('No return space');
}

export function resolveShot(game) {
  const side = game.turn,
    color = sideColor(side);
  const own = game.coins.filter((c) => game.shotPots.includes(c.id) && c.kind === color);
  const queen = game.coins.find((c) => c.kind === 'queen');
  const queenPotted = queen && game.shotPots.includes(queen.id);
  let keep = own.length > 0;
  if (game.shotFoul) {
    if (side === 0) game.fouls++;
    own.forEach((c) => returnCoin(game, c));
    const penalty = game.coins.find((c) => c.kind === color && c.pocketed);
    if (penalty) returnCoin(game, penalty);
    else game.debt[side]++;
    if (queenPotted || game.queen === `pending-${side}`) {
      returnCoin(game, queen);
      game.queen = 'board';
    }
    keep = false;
    game.message = '击球子落袋 · 罚一子，换手';
  } else {
    for (const c of own)
      if (game.debt[side] > 0) {
        returnCoin(game, c);
        game.debt[side]--;
      }
    const credited = own.filter((c) => c.pocketed).length;
    keep = credited > 0;
    if (game.queen === `pending-${side}` || queenPotted) {
      if (credited > 0) {
        game.queen = 'covered';
        game.queenOwner = side;
        game.message = '红后已补进 · 漂亮的一杆';
        keep = true;
      } else if (queenPotted && !game.queen.startsWith('pending')) {
        game.queen = `pending-${side}`;
        keep = true;
        game.message = '红后入袋 · 下一杆补进本色棋子';
      } else {
        returnCoin(game, queen);
        game.queen = 'board';
        keep = false;
        game.message = '未能补进 · 红后返场';
      }
    } else
      game.message = credited
        ? `漂亮！${credited > 1 ? '一杆多进 · ' : ''}继续出杆`
        : '换个角度，再来一杆';
  }
  for (let player = 0; player < (game.levelId ? 1 : 2); player++) {
    if (remaining(game, player) === 0) {
      if (game.queen === 'covered' || game.queen === 'none') {
        game.phase = 'over';
        game.winner = player;
        game.message = player === 0 ? '清台！这一局属于你' : '阿洛清台 · 再切磋一局';
        return;
      }
      returnCoin(
        game,
        game.coins.find((c) => c.kind === sideColor(player) && c.pocketed),
      );
      game.message = '先完成红后补进 · 最后一子返场';
    }
  }
  const level = LEVELS.find((l) => l.id === game.levelId);
  if (level && game.playerShots >= level.shots) {
    game.phase = 'over';
    game.winner = 1;
    game.message = '杆数用尽 · 再试一次';
    return;
  }
  if (!game.levelId && !keep) game.turn = 1 - side;
  game.phase = 'ready';
  if (!placeStriker(game, 500)) {
    // shortcut: a completely blocked baseline passes the turn; add manual referee placement for tournament rules.
    game.turn = game.levelId ? 0 : 1 - game.turn;
    placeStriker(game, 500);
    game.message = '底线被占满 · 换手';
  }
  game.events.push({ type: 'settled' });
}

export function aimPreview(game, dx, dy) {
  const length = Math.hypot(dx, dy);
  if (!length) return null;
  const nx = dx / length,
    ny = dy / length,
    s = game.striker;
  let distance = 1200,
    hit = null;
  for (const c of game.coins) {
    if (c.pocketed) continue;
    const ax = c.x - s.x,
      ay = c.y - s.y,
      projection = ax * nx + ay * ny;
    const perpendicular = ax * ax + ay * ay - projection * projection;
    const radius = s.r + c.r;
    if (projection < 0 || perpendicular > radius * radius) continue;
    const t = projection - Math.sqrt(Math.max(0, radius * radius - perpendicular));
    if (t >= 0 && t < distance) {
      distance = t;
      hit = c;
    }
  }
  for (const [pos, dir] of [
    [s.x, nx],
    [s.y, ny],
  ]) {
    if (Math.abs(dir) < 0.00001) continue;
    const t = ((dir > 0 ? 906 : 94) - pos) / dir;
    if (t > 0 && t < distance) {
      distance = t;
      hit = null;
    }
  }
  return { x: s.x + nx * distance, y: s.y + ny * distance, hit };
}

export function chooseShot(game) {
  const side = game.turn,
    y = side === 0 ? 790 : 210;
  const targets = game.coins.filter(
    (c) =>
      !c.pocketed &&
      (c.kind === sideColor(side) || (c.kind === 'queen' && !game.queen.startsWith('pending'))),
  );
  let best = null;
  for (const target of targets)
    for (const [px, py] of POCKETS) {
      const distance = Math.hypot(px - target.x, py - target.y);
      const ux = (px - target.x) / distance,
        uy = (py - target.y) / distance;
      const gx = target.x - ux * 42,
        gy = target.y - uy * 42;
      const ideal = Math.abs(uy) > 0.01 ? gx + ((y - gy) * ux) / uy : 500;
      for (const x of [clamp(ideal, 235, 765), 250, 380, 500, 620, 750]) {
        if (game.coins.some((c) => !c.pocketed && Math.hypot(c.x - x, c.y - y) < c.r + 25))
          continue;
        const dx = gx - x,
          dy = gy - y,
          travel = Math.hypot(dx, dy);
        const alignment = (dx * ux + dy * uy) / travel;
        if (alignment < 0.25) continue;
        const shadow = { ...game, striker: { ...game.striker, x, y } };
        const first = aimPreview(shadow, dx, dy);
        const blocked = first?.hit && first.hit.id !== target.id;
        const queenNeeded = game.queen === 'board' && remaining(game, side) <= 2;
        const score =
          Math.pow(alignment, 10) * 10 -
          distance / 1400 -
          travel / 5000 -
          (blocked ? 9 : 0) +
          (queenNeeded && target.kind === 'queen' ? 8 : 0);
        const speed = Math.sqrt(860 * (travel + (distance / Math.max(0.4, alignment)) * 0.8)) + 80;
        if (!best || score > best.score)
          best = { x, dx, dy, power: clamp((speed - 180) / 1670, 0.15, 1), score };
      }
    }
  return (
    best ?? {
      x: 500,
      dx: targets[0]?.x - 500 || 0.1,
      dy: (targets[0]?.y ?? 500) - y,
      power: 0.8,
      score: -100,
    }
  );
}

export function starsFor(game) {
  const level = LEVELS.find((l) => l.id === game.levelId);
  if (!level || game.phase !== 'over' || game.winner !== 0) return 0;
  return game.playerShots <= level.par && !game.fouls
    ? 3
    : game.playerShots <= level.par + 3
      ? 2
      : 1;
}
