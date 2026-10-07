import { EPSILON, clamp, normalized } from './math.mjs';
import { getRoom } from './definition.mjs';
import { getPlayerStats } from './stats.mjs';
import { effect, notice } from './events.mjs';
import { moveActor } from './geometry.mjs';
import { spendInk, spillSkillInk } from './resources.mjs';
import { areaDamage, shoot } from './combat.mjs';

export function useNova(state) {
  const player = state.player,
    stats = getPlayerStats(state);
  const name = state.definition.skills.nova?.name ?? '技能';
  if (player.novaCd > EPSILON) return { ok: false, message: `${name}尚在冷却` };
  if (!spendInk(state, stats.novaCost, 'nova'))
    return {
      ok: false,
      message: `${name}消耗 ${stats.novaCost} 墨汁，需保留至少 ${stats.minInkAfterSpend} 墨汁`,
    };
  player.novaCd = stats.novaCooldown;
  state.stats.skillsUsed++;
  state.stats.novas++;
  spillSkillInk(state, 'nova', stats.novaCost, state.definition.skills.nova?.reclaimDrops ?? 2);
  effect(state, 'nova', player.x, player.y, { radius: stats.novaRadius, life: 0.7 });
  areaDamage(state, stats.novaDamage, stats.novaRadius, { knockback: 48 });
  return { ok: true, message: `${name}！走位拾回散落的墨滴` };
}
export function playerActions(state, input, dt) {
  const player = state.player,
    stats = getPlayerStats(state);
  for (const key of ['dashCd', 'meleeCd', 'shootCd', 'invuln', 'novaCd'])
    player[key] = Math.max(0, player[key] - dt);
  if (
    Number.isFinite(input.aimX) &&
    Number.isFinite(input.aimY) &&
    Math.hypot(input.aimX - player.x, input.aimY - player.y) > 2
  ) {
    const aim = normalized(input.aimX - player.x, input.aimY - player.y);
    player.aimX = aim.x;
    player.aimY = aim.y;
  }
  const mx = clamp(Number(input.moveX) || 0, -1, 1),
    my = clamp(Number(input.moveY) || 0, -1, 1);
  const move = normalized(mx, my),
    magnitude = Math.min(1, Math.hypot(mx, my));
  if (input.dash && player.dashCd <= EPSILON) {
    player.dashX = magnitude ? move.x : player.aimX;
    player.dashY = magnitude ? move.y : player.aimY;
    player.dashTimer = stats.dashDuration;
    player.dashCd = stats.dashCooldown;
    player.invuln = Math.max(player.invuln, stats.dashInvuln);
    state.stats.dashes++;
    effect(state, 'dash', player.x, player.y, {
      angle: Math.atan2(player.dashY, player.dashX),
      life: 0.26,
    });
  }
  if (player.dashTimer > 0) {
    const duration = Math.min(dt, player.dashTimer);
    moveActor(
      getRoom(state),
      player,
      player.dashX * (stats.dashSpeed ?? 720) * duration,
      player.dashY * (stats.dashSpeed ?? 720) * duration,
    );
    player.dashTimer = Math.max(0, player.dashTimer - dt);
  } else
    moveActor(
      getRoom(state),
      player,
      move.x * stats.speed * magnitude * dt,
      move.y * stats.speed * magnitude * dt,
    );
  if (input.melee && player.meleeCd <= EPSILON) {
    player.meleeCd = stats.meleeCooldown;
    state.stats.freeAttacks++;
    const previousHits = state.stats.hits;
    areaDamage(state, stats.meleeDamage, stats.meleeRange, { directional: true, knockback: 17 });
    effect(state, 'slash', player.x, player.y, {
      angle: Math.atan2(player.aimY, player.aimX),
      radius: stats.meleeRange,
      hit: state.stats.hits > previousHits,
      life: 0.3,
    });
  }
  if (input.nova) useNova(state);
  if (input.shoot && player.shootCd <= EPSILON) {
    if (spendInk(state, stats.attackCost, 'attack')) {
      player.shootCd = stats.attackCooldown;
      state.stats.shots++;
      state.stats.skillsUsed++;
      shoot(
        state,
        'player',
        player.x + player.aimX * 22,
        player.y + player.aimY * 22,
        player.aimX,
        player.aimY,
        { damage: stats.attackDamage },
      );
      spillSkillInk(
        state,
        'shot',
        stats.attackCost,
        state.definition.skills.shot?.reclaimDrops ?? 1,
      );
      effect(state, 'shot', player.x + player.aimX * 25, player.y + player.aimY * 25, {
        angle: Math.atan2(player.aimY, player.aimX),
        life: 0.1,
      });
    } else if (state.messageTimer < 1) notice(state, '墨汁不足：免费近战命中仍能吸墨。');
  }
}
