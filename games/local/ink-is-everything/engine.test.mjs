import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from './levels.mjs';
import {
  createGame,
  step,
  command,
  getRoom,
  getNearbyInteractable,
  serializeGame,
  restoreGame,
} from './engine.mjs';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const normalize = (x, y) => {
  const d = Math.hypot(x, y) || 1;
  return { x: x / d, y: y / d };
};
const tick = (game, input = {}, count = 1) => {
  for (let i = 0; i < count; i++) step(game, input, 0.05);
};
function start(id) {
  const game = createGame(id);
  command(game, { type: 'start' });
  return game;
}
let fixtureCounter = 0;
function fixture({
  roomId = 'arrival',
  spawn = { x: 150, y: 300 },
  initial = {},
  enemies = [],
  obstacles = [],
} = {}) {
  const level = structuredClone(LEVELS['chapter-1']);
  level.id = `fixture-${++fixtureCounter}`;
  level.start = roomId;
  level.spawn = spawn;
  Object.assign(level.initial, initial);
  const room = level.rooms.find((item) => item.id === roomId);
  room.enemySpawns = enemies;
  room.waves = [];
  room.obstacles = obstacles;
  LEVELS[level.id] = level;
  return start(level.id);
}

test('ready/finished simulations freeze, and tab-resume dt is bounded', () => {
  const game = createGame();
  const x = game.player.x;
  tick(game, { moveX: 1 }, 10);
  assert.equal(game.player.x, x);
  command(game, { type: 'start' });
  step(game, { moveX: 1 }, 20);
  assert.ok(game.player.x - x <= 11.11);
  assert.equal(game.time, 0.05);
});

test('walking and dashing collide with a pillar without tunnelling', () => {
  const game = fixture({
    spawn: { x: 140, y: 270 },
    obstacles: [{ x: 200, y: 200, w: 50, h: 150, kind: 'wall' }],
  });
  tick(game, { moveX: 1, dash: true }, 50);
  assert.ok(game.player.x <= 183);
  assert.equal(game.player.ink, 64);
  assert.ok(game.stats.dashes >= 2);
});

test('aimed ink projectiles spend two ink and deal three damage on an actual collision', () => {
  const game = fixture({
    spawn: { x: 100, y: 300 },
    enemies: [{ type: 'blot', x: 340, y: 300, speed: 0 }],
  });
  tick(game, { shoot: true, aimX: 340, aimY: 300 });
  assert.equal(game.player.ink, 62);
  assert.equal(game.enemies[0].hp, 8);
  tick(game, {}, 10);
  assert.equal(game.enemies[0].hp, 5);
  assert.equal(game.stats.hits, 1);
});

test('pillars block shots from reaching enemies behind them', () => {
  const game = fixture({
    spawn: { x: 100, y: 300 },
    enemies: [{ type: 'blot', x: 340, y: 300, speed: 0 }],
    obstacles: [{ x: 215, y: 250, w: 30, h: 100, kind: 'wall' }],
  });
  tick(game, { shoot: true, aimX: 340, aimY: 300 });
  tick(game, {}, 15);
  assert.equal(game.enemies[0].hp, 8);
  assert.equal(game.projectiles.length, 0);
});

test('dry brush is free, directional, and limited to close range', () => {
  const game = fixture({
    initial: { ink: 0 },
    enemies: [
      { type: 'blot', x: 210, y: 300 },
      { type: 'blot', x: 90, y: 300 },
      { type: 'blot', x: 350, y: 300 },
    ],
  });
  tick(game, { melee: true, aimX: 400, aimY: 300 });
  assert.deepEqual(
    game.enemies.map((enemy) => enemy.hp),
    [6, 8, 8],
  );
  assert.equal(game.player.ink, 0);
  assert.equal(game.stats.freeAttacks, 1);
  tick(game, { melee: true, aimX: 400, aimY: 300 }, 2);
  assert.equal(game.stats.freeAttacks, 1);
});

test('dash grants brief invulnerability and cannot bypass its cooldown', () => {
  const game = fixture({ initial: { ink: 0 } });
  tick(game, { dash: true, moveX: 1 });
  assert.ok(game.player.invuln > 0);
  tick(game, { dash: true, moveX: 1 }, 4);
  assert.equal(game.stats.dashes, 1);
  assert.equal(game.player.ink, 0);
  tick(game, { dash: true, moveX: 1 }, 20);
  assert.equal(game.stats.dashes, 2);
});

test('guard visibly winds up, locks its aim, then commits to a dodgeable charge', () => {
  const game = fixture({ enemies: [{ type: 'guard', x: 400, y: 300 }] });
  for (let i = 0; i < 50 && game.enemies[0].state !== 'windup'; i++) tick(game);
  const enemy = game.enemies[0];
  assert.equal(enemy.state, 'windup');
  const direction = { x: enemy.aimX, y: enemy.aimY };
  tick(game, { moveY: 1 }, 7);
  assert.equal(enemy.state, 'windup');
  assert.equal(enemy.aimX, direction.x);
  assert.equal(enemy.aimY, direction.y);
  assert.equal(game.player.hp, 6);
  for (let i = 0; i < 30 && enemy.state === 'windup'; i++) tick(game, { moveY: 1 });
  assert.equal(enemy.state, 'attack');
  tick(game, { moveY: 1 }, 12);
  assert.equal(game.player.hp, 6);
});

test('standing in an announced lunge causes real damage', () => {
  const game = fixture({ enemies: [{ type: 'blot', x: 230, y: 300 }] });
  tick(game, {}, 55);
  assert.ok(game.player.hp < game.player.maxHp);
  assert.ok(game.stats.damageTaken > 0);
});

test('insufficient ink prevents healing and shooting without disabling free actions', () => {
  const game = fixture({ initial: { ink: 0, hp: 3 } });
  assert.equal(command(game, { type: 'heal' }).ok, false);
  tick(game, { shoot: true, melee: true, dash: true, moveX: 1 });
  assert.equal(game.stats.shots, 0);
  assert.equal(game.stats.freeAttacks, 1);
  assert.equal(game.stats.dashes, 1);
  assert.equal(game.player.hp, 3);
});

test('healing draws from the same ink pool and cannot over-heal or spend at full health', () => {
  const game = fixture({ initial: { hp: 4 } });
  assert.equal(command(game, { type: 'heal' }).ok, true);
  assert.equal(game.player.ink, 54);
  assert.equal(game.player.hp, 6);
  assert.equal(command(game, { type: 'heal' }).ok, false);
  assert.equal(game.player.ink, 54);
});

test('drawing needs the nearby anchor and ink, permanently opens terrain, and pays once', () => {
  const game = fixture({
    spawn: { x: 480, y: 240 },
    obstacles: [{ x: 420, y: 108, w: 120, h: 86, kind: 'pit', bridgeId: 'archive-bridge' }],
  });
  tick(game, { moveY: -1 }, 10);
  assert.ok(game.player.y >= 211);
  assert.equal(command(game, { type: 'draw', bridgeId: 'archive-bridge' }).ok, true);
  assert.equal(game.player.ink, 56);
  assert.equal(command(game, { type: 'draw', bridgeId: 'archive-bridge' }).ok, false);
  tick(game, { moveY: -1 }, 9);
  assert.ok(game.player.y < 160);
  assert.equal(game.stats.spent.explore, 8);
  const poor = fixture({ spawn: { x: 480, y: 240 }, initial: { ink: 7 } });
  assert.equal(command(poor, { type: 'draw', bridgeId: 'archive-bridge' }).ok, false);
});

test('the final portal is locked until both seals have been earned', () => {
  const game = fixture({ roomId: 'market', spawn: { x: 830, y: 300 } });
  const result = command(game, { type: 'interact', target: 'market-east' });
  assert.equal(result.ok, false);
  assert.match(result.message, /2 枚钥印/);
  assert.equal(game.roomId, 'market');
});

test('opened chests issue their finite reward once and nearby pickups are automatic', () => {
  const game = fixture({
    roomId: 'archive',
    spawn: { x: 480, y: 155 },
    initial: { ink: 20, hp: 3 },
  });
  assert.equal(command(game, { type: 'interact', objectId: 'archive-cache' }).ok, true);
  assert.equal(command(game, { type: 'interact', objectId: 'archive-cache' }).ok, false);
  tick(game, {}, 20);
  assert.equal(game.player.ink, 54);
  assert.equal(game.player.hp, 5);
  tick(game, {}, 20);
  assert.equal(game.player.ink, 54);
});

test('contracts use ink, require the merchant, and cannot be purchased twice', () => {
  const far = fixture({ roomId: 'market' });
  assert.equal(command(far, { type: 'buy', contractId: 'fine-nib' }).ok, false);
  const game = fixture({ roomId: 'market', spawn: { x: 665, y: 190 } });
  assert.equal(getNearbyInteractable(game).type, 'merchant');
  assert.equal(command(game, { type: 'interact' }).shop, true);
  assert.equal(command(game, { type: 'buy', contractId: 'fine-nib' }).ok, true);
  assert.equal(game.player.ink, 46);
  assert.equal(command(game, { type: 'buy', contractId: 'fine-nib' }).ok, false);
  assert.equal(game.player.ink, 46);
});

test('save round-trips active projectiles and rebinds current-room arrays', () => {
  const game = start();
  tick(game, { shoot: true, aimX: 900, aimY: 400 });
  const restored = restoreGame(serializeGame(game));
  assert.ok(restored);
  assert.equal(restored.player.ink, game.player.ink);
  assert.equal(restored.projectiles.length, game.projectiles.length);
  assert.equal(restored.enemies, getRoom(restored).enemies);
  assert.equal(restored.pickups, getRoom(restored).pickups);
  tick(restored, { moveY: 1 }, 2);
  assert.ok(restored.time > game.time);
  assert.equal(restoreGame('{broken'), null);
  assert.equal(restoreGame({ ...game, version: 1 }), null);
  assert.equal(restoreGame({ ...game, player: { ...game.player, ink: NaN } }), null);
});

// Deterministic player driver: it only supplies movement/aim/action input. It never changes
// player health, enemy health, encounter state, resources, or progression flags.
let walking = false;
function clearPath(game, a, b) {
  const room = getRoom(game);
  const obstacles = room.obstacles.filter(
    (o) => !o.bridgeId || !room.bridges.find((bridge) => bridge.id === o.bridgeId)?.drawn,
  );
  for (let t = 0; t <= 1; t += 0.06) {
    const x = a.x + (b.x - a.x) * t,
      y = a.y + (b.y - a.y) * t;
    if (x < 51 || x > 909 || y < 51 || y > 549) return false;
    if (
      obstacles.some((o) =>
        walking
          ? Math.hypot(
              x - Math.max(o.x, Math.min(o.x + o.w, x)),
              y - Math.max(o.y, Math.min(o.y + o.h, y)),
            ) < 17
          : x > o.x - 19 && x < o.x + o.w + 19 && y > o.y - 19 && y < o.y + o.h + 19,
      )
    )
      return false;
  }
  return true;
}
function navigate(game, destination) {
  const target = {
    x: Math.max(54, Math.min(906, destination.x)),
    y: Math.max(54, Math.min(546, destination.y)),
  };
  const player = game.player;
  if (clearPath(game, player, target)) return normalize(target.x - player.x, target.y - player.y);
  let closest = null;
  for (let radius = 70; radius <= 400; radius += 50) {
    for (let angle = 0; angle < 6.28; angle += 0.25) {
      const point = {
        x: player.x + Math.cos(angle) * radius,
        y: player.y + Math.sin(angle) * radius,
      };
      if (clearPath(game, player, point)) {
        const score = distance(point, target) + radius * 0.12;
        if (!closest || score < closest.score) closest = { ...point, score };
      }
    }
    if (closest && closest.score < distance(player, target) - 10) break;
  }
  return closest ? normalize(closest.x - player.x, closest.y - player.y) : { x: 0, y: 0 };
}
function fight(game, dry = false) {
  let ticks = 0;
  while (!getRoom(game).cleared && game.status === 'playing' && ticks++ < 10000) {
    const player = game.player;
    const enemies = game.enemies
      .filter((enemy) => enemy.hp > 0)
      .sort((a, b) => distance(player, a) - distance(player, b));
    const target = enemies[0];
    if (!target) {
      tick(game);
      continue;
    }
    const d = distance(player, target);
    let move = navigate(game, target);
    if (d < target.r + 67) {
      const direction = normalize(target.x - player.x, target.y - player.y);
      const radial = (d - (target.r + 42)) * 0.018;
      move = normalize(-direction.y + direction.x * radial, direction.x + direction.y * radial);
      if (!clearPath(game, player, { x: player.x + move.x * 55, y: player.y + move.y * 55 }))
        move = normalize(direction.y + direction.x * radial, -direction.x + direction.y * radial);
    }
    const threat = enemies.find(
      (enemy) =>
        ((enemy.state === 'windup' && enemy.timer < 0.5) ||
          enemy.state === 'attack' ||
          (enemy.state === 'recover' && enemy.attackKind === 'burst' && enemy.timer > 1.0)) &&
        distance(player, enemy) < enemy.range + 80,
    );
    let dash = false;
    if (threat) {
      const cross = (player.x - threat.x) * threat.aimY - (player.y - threat.y) * threat.aimX;
      move = { x: threat.aimY * (cross >= 0 ? 1 : -1), y: -threat.aimX * (cross >= 0 ? 1 : -1) };
      if (!clearPath(game, player, { x: player.x + move.x * 145, y: player.y + move.y * 145 }))
        move = { x: -move.x, y: -move.y };
      dash = true;
    }
    for (const shot of game.projectiles) {
      if (shot.owner !== 'enemy') continue;
      const dx = player.x - shot.x,
        dy = player.y - shot.y,
        speed = Math.hypot(shot.vx, shot.vy);
      const time = (dx * shot.vx + dy * shot.vy) / (speed * speed);
      const cross = (dx * shot.vy - dy * shot.vx) / speed;
      if (time > 0 && time < 0.38 && Math.abs(cross) < 45) {
        move = {
          x: (shot.vy / speed) * (cross >= 0 ? 1 : -1),
          y: (-shot.vx / speed) * (cross >= 0 ? 1 : -1),
        };
        if (!clearPath(game, player, { x: player.x + move.x * 130, y: player.y + move.y * 130 }))
          move = { x: -move.x, y: -move.y };
        dash = true;
        break;
      }
    }
    if (player.hp <= 3 && player.ink >= 10 && !dry) command(game, { type: 'heal' });
    tick(game, {
      moveX: move.x,
      moveY: move.y,
      aimX: target.x,
      aimY: target.y,
      melee: true,
      shoot: !dry && player.ink >= 12,
      dash,
    });
  }
  assert.notEqual(
    game.status,
    'lost',
    `player lost in ${game.roomId}; enemies ${game.enemies.map((enemy) => `${enemy.type}:${enemy.hp}`).join(',')}`,
  );
  assert.ok(getRoom(game).cleared, `${game.roomId} stalled`);
}
function walk(game, target) {
  walking = true;
  for (
    let i = 0;
    i < 1000 && distance(game.player, target) > 45 && game.status === 'playing';
    i++
  ) {
    const move = navigate(game, target);
    tick(game, { moveX: move.x, moveY: move.y });
  }
  walking = false;
}
function door(game, id) {
  const portal = getRoom(game).portals.find((item) => item.id === id);
  const previous = game.roomId;
  assert.ok(portal, `unknown portal ${id} in ${previous}`);
  walk(game, portal);
  if (game.roomId === previous)
    assert.equal(command(game, { type: 'interact', objectId: id }).ok, true, `cannot enter ${id}`);
  assert.equal(game.roomId, portal.target);
}
function completeMainRoute(game) {
  for (const portal of [
    'arrival-east',
    'sentinel-east',
    'market-north',
    'warden-south',
    'market-east',
  ]) {
    fight(game);
    door(game, portal);
  }
  fight(game);
  assert.equal(game.status, 'won');
  assert.equal(game.seals, 2);
}

test('complete main route wins through real movement and combat, without buying or drawing', () => {
  const game = start();
  completeMainRoute(game);
  assert.equal(game.stats.roomsVisited, 5);
  assert.equal(game.stats.bridgesDrawn, 0);
  assert.equal(game.stats.trades, 0);
  assert.equal(game.stats.enemiesDefeated, 17);
  assert.ok(game.stats.shots > 0 && game.stats.freeAttacks > 0 && game.stats.dashes > 0);
});

test('optional archive reward and a contract support a second complete route', () => {
  const game = start();
  fight(game);
  walk(game, getRoom(game).bridges[0].from);
  assert.equal(command(game, { type: 'draw', bridgeId: 'archive-bridge' }).ok, true);
  door(game, 'arrival-north');
  fight(game);
  walk(game, getRoom(game).objects[0]);
  tick(game, {}, 60);
  assert.equal(getRoom(game).objects[0].used, true);
  door(game, 'archive-south');
  walk(game, getRoom(game).bridges[0].from);
  door(game, 'arrival-east');
  fight(game);
  door(game, 'sentinel-east');
  walk(
    game,
    getRoom(game).objects.find((object) => object.kind === 'merchant'),
  );
  assert.equal(command(game, { type: 'buy', contractId: 'fine-nib' }).ok, true);
  door(game, 'market-north');
  fight(game);
  door(game, 'warden-south');
  door(game, 'market-east');
  fight(game);
  assert.equal(game.status, 'won');
  assert.equal(game.stats.roomsVisited, 6);
  assert.equal(game.stats.bridgesDrawn, 1);
  assert.equal(game.stats.spent.explore, 8);
  assert.equal(game.stats.spent.trade, 18);
  assert.equal(game.seals, 2);
  assert.equal(game.stats.enemiesDefeated, 20);
});

test('the full-strength two-phase boss is beatable with zero ink and no upgrades', () => {
  const level = structuredClone(LEVELS['chapter-1']);
  level.id = 'zero-ink-boss';
  level.start = 'gate';
  level.spawn = { x: 102, y: 300 };
  level.initial.ink = 0;
  LEVELS[level.id] = level;
  const game = start(level.id);
  assert.equal(game.enemies[0].hp, 110);
  fight(game, true);
  assert.equal(game.status, 'won');
  assert.equal(game.stats.spent.attack, 0);
  assert.equal(game.stats.spent.heal, 0);
  assert.equal(game.player.ink, 0);
  assert.ok(game.player.hp > 0);
  assert.ok(game.stats.freeAttacks >= 55);
  assert.equal(game.contracts.length, 0);
});
