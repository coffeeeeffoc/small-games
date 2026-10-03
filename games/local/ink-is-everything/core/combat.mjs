import { distance, normalized } from './math.mjs';
import { getRoom } from './definition.mjs';
import { getPlayerStats } from './stats.mjs';
import { circleRect, lineOfSight, moveActor } from './geometry.mjs';
import { effect, nextId } from './events.mjs';
import { addPickup, hurtPlayer, restoreInk } from './resources.mjs';
import { gainExperience } from './growth.mjs';

export function hurtEnemy(state, enemy, damage, fromX, fromY, knockback = 0) {
  if (enemy.hp <= 0 || state.status !== 'playing') return 0;
  const dealt = Math.max(0, Math.min(enemy.hp, damage));
  if (!dealt) return 0;
  enemy.hp = Math.max(0, enemy.hp - dealt);
  enemy.flash = 0.15;
  state.stats.hits++;
  state.stats.damageDealt += dealt;
  effect(state, 'hit', enemy.x, enemy.y, {
    radius: enemy.r,
    text: `−${Math.round(dealt * 10) / 10}`,
    life: 0.42,
  });
  const stats = getPlayerStats(state);
  restoreInk(state, dealt * stats.lifeSteal, 'lifesteal', enemy);
  if (knockback && enemy.behavior !== 'boss') {
    const direction = normalized(enemy.x - fromX, enemy.y - fromY);
    moveActor(getRoom(state), enemy, direction.x * knockback, direction.y * knockback);
  }
  if (!enemy.hp) {
    state.stats.enemiesDefeated++;
    state.stats.kills++;
    effect(state, 'death', enemy.x, enemy.y, { radius: enemy.r + 12, life: 0.7 });
    restoreInk(state, stats.killRestore, 'kill');
    if (enemy.ink > 0) addPickup(state, 'ink', enemy.x, enemy.y, enemy.ink);
    if (enemy.gear)
      addPickup(state, 'gear', enemy.x + 18, enemy.y, 1, { gear: structuredClone(enemy.gear) });
    gainExperience(state, enemy.xp ?? 0);
  }
  return dealt;
}
export function shoot(state, owner, x, y, dx, dy, properties = {}) {
  const direction = normalized(dx, dy);
  const speed = properties.speed ?? (owner === 'player' ? 620 : 175);
  state.projectiles.push({
    id: nextId(state, 'shot'),
    owner,
    x,
    y,
    vx: direction.x * speed,
    vy: direction.y * speed,
    r: owner === 'player' ? 6 : 9,
    damage: properties.damage ?? 12,
    life: properties.life ?? 4,
    ...properties,
  });
}
export function advanceProjectiles(state, dt) {
  const room = getRoom(state);
  for (const shot of state.projectiles) {
    if (shot.life <= 0) continue;
    const samples = Math.max(1, Math.ceil((Math.hypot(shot.vx, shot.vy) * dt) / 7));
    for (let index = 0; index < samples && shot.life > 0; index++) {
      shot.x += (shot.vx * dt) / samples;
      shot.y += (shot.vy * dt) / samples;
      if (
        shot.x < 28 ||
        shot.x > room.width - 28 ||
        shot.y < 28 ||
        shot.y > room.height - 28 ||
        room.obstacles.some((rectangle) => rectangle.kind !== 'pit' && circleRect(shot, rectangle))
      ) {
        shot.life = 0;
        break;
      }
      if (shot.owner === 'player') {
        const hit = state.enemies.find(
          (enemy) => enemy.hp > 0 && distance(shot, enemy) < shot.r + enemy.r,
        );
        if (hit) {
          hurtEnemy(state, hit, shot.damage, shot.x - shot.vx, shot.y - shot.vy, 4);
          state.stats.projectileHits++;
          shot.life = 0;
        }
      } else if (distance(shot, state.player) < shot.r + state.player.r) {
        hurtPlayer(state, shot.damage, shot);
        shot.life = 0;
      }
    }
    shot.life -= dt;
  }
  state.projectiles = state.projectiles.filter((shot) => shot.life > 0);
}
export function areaDamage(state, damage, radius, { directional = false, knockback = 0 } = {}) {
  const player = state.player;
  for (const enemy of state.enemies) {
    const d = distance(player, enemy);
    const facing =
      ((enemy.x - player.x) * player.aimX + (enemy.y - player.y) * player.aimY) / (d || 1);
    if (
      enemy.hp > 0 &&
      d <= radius + enemy.r &&
      (!directional || facing > -0.15) &&
      lineOfSight(getRoom(state), player, enemy)
    )
      hurtEnemy(state, enemy, damage, player.x, player.y, knockback);
  }
}
