import assert from 'node:assert/strict';
import { command, getPlayerStats, getRewardChoices, getRoom, step } from '../engine.mjs';

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const normalize = (x, y) => {
  const magnitude = Math.hypot(x, y) || 1;
  return { x: x / magnitude, y: y / magnitude };
};
export function tick(game, input = {}, count = 1) {
  for (let i = 0; i < count; i++) step(game, input, 0.05);
}
export function takeRewards(game, preference) {
  for (let i = 0; i < 20; i++) {
    const choices = getRewardChoices(game);
    if (!choices.length) return;
    const selected = choices.find((item) => item.id === preference) ?? choices[0];
    assert.equal(command(game, { type: 'chooseReward', itemId: selected.id }).ok, true);
  }
  assert.fail('reward choice queue did not drain');
}

// This driver only submits public movement/aim/action inputs. It never changes
// player ink, enemy health, room completion, equipment or progression flags.
function clearPath(game, a, b, walking = false) {
  const room = getRoom(game);
  const boundary = (room.boundary ?? 33) + game.player.r - 0.01;
  const obstacles = room.obstacles.filter(
    (obstacle) =>
      !obstacle.bridgeId || !room.bridges.find((bridge) => bridge.id === obstacle.bridgeId)?.drawn,
  );
  for (let fraction = 0; fraction <= 1; fraction += 0.06) {
    const x = a.x + (b.x - a.x) * fraction;
    const y = a.y + (b.y - a.y) * fraction;
    if (x < boundary || x > room.width - boundary || y < boundary || y > room.height - boundary)
      return false;
    if (
      obstacles.some((obstacle) =>
        walking
          ? Math.hypot(
              x - Math.max(obstacle.x, Math.min(obstacle.x + obstacle.w, x)),
              y - Math.max(obstacle.y, Math.min(obstacle.y + obstacle.h, y)),
            ) < 17
          : x > obstacle.x - 19 &&
            x < obstacle.x + obstacle.w + 19 &&
            y > obstacle.y - 19 &&
            y < obstacle.y + obstacle.h + 19,
      )
    )
      return false;
  }
  return true;
}
export function navigate(game, destination, walking = false) {
  const room = getRoom(game);
  const boundary = (room.boundary ?? 33) + game.player.r + 1;
  const target = {
    x: Math.max(boundary, Math.min(room.width - boundary, destination.x)),
    y: Math.max(boundary, Math.min(room.height - boundary, destination.y)),
  };
  const player = game.player;
  if (clearPath(game, player, target, walking))
    return normalize(target.x - player.x, target.y - player.y);
  let closest = null;
  for (let radius = 70; radius <= 400; radius += 50) {
    for (let angle = 0; angle < 6.28; angle += 0.25) {
      const point = {
        x: player.x + Math.cos(angle) * radius,
        y: player.y + Math.sin(angle) * radius,
      };
      if (clearPath(game, player, point, walking)) {
        const score = distance(point, target) + radius * 0.12;
        if (!closest || score < closest.score) closest = { ...point, score };
      }
    }
    if (closest && closest.score < distance(player, target) - 10) break;
  }
  return closest ? normalize(closest.x - player.x, closest.y - player.y) : { x: 0, y: 0 };
}
export function fight(game, { meleeOnly = false, preference } = {}) {
  let ticks = 0;
  while (!getRoom(game).cleared && game.status === 'playing' && ticks++ < 14000) {
    takeRewards(game, preference);
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
        dy = player.y - shot.y;
      const speed = Math.hypot(shot.vx, shot.vy);
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
    tick(game, {
      moveX: move.x,
      moveY: move.y,
      aimX: target.x,
      aimY: target.y,
      melee: true,
      shoot: !meleeOnly && player.ink >= 35,
      nova:
        !meleeOnly &&
        player.ink >= 60 &&
        enemies.filter((enemy) => distance(player, enemy) < 120).length >= 2,
      dash,
    });
  }
  takeRewards(game, preference);
  assert.notEqual(
    game.status,
    'lost',
    `player lost in ${game.roomId}; ink ${game.player.ink}; enemies ${game.enemies.map((enemy) => `${enemy.type}:${enemy.hp}`).join(',')}`,
  );
  assert.ok(getRoom(game).cleared, `${game.roomId} stalled at ${game.player.x}, ${game.player.y}`);
}
export function walk(game, target, stopDistance = 40) {
  for (
    let i = 0;
    i < 1600 && distance(game.player, target) > stopDistance && game.status === 'playing';
    i++
  ) {
    takeRewards(game);
    const move = navigate(game, target, true);
    const scale = Math.min(1, distance(game.player, target) / (getPlayerStats(game).speed * 0.05));
    tick(game, { moveX: move.x * scale, moveY: move.y * scale });
  }
}
export function door(game, id) {
  const portal = getRoom(game).portals.find((item) => item.id === id);
  const previous = game.roomId;
  assert.ok(portal, `unknown portal ${id} in ${previous}`);
  walk(game, portal);
  if (game.roomId === previous)
    assert.equal(command(game, { type: 'interact', objectId: id }).ok, true, `cannot enter ${id}`);
  assert.equal(game.roomId, portal.target);
}
