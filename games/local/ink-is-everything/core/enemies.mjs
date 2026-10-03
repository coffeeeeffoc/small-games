import { distance, normalized } from './math.mjs';
import { getRoom } from './definition.mjs';
import { effect, nextId, notice } from './events.mjs';
import { moveActor } from './geometry.mjs';
import { hurtPlayer } from './resources.mjs';
import { shoot } from './combat.mjs';

export function spawnEnemy(state, data, index = 0, wave = -1) {
  const template = state.definition.enemyTypes[data.type];
  if (!template) throw new Error(`Unknown enemy type: ${data.type}`);
  const specification = {
    behavior: 'melee',
    hp: 18,
    r: 20,
    speed: 90,
    ink: 4,
    xp: 6,
    damage: 12,
    windupTime: 0.7,
    recoverTime: 1.05,
    triggerRange: 148,
    attackSpeed: 440,
    attackDuration: 0.26,
    ...template,
    ...data,
  };
  return {
    id: nextId(state, 'foe'),
    spawnIndex: index,
    spawnWave: wave,
    ...specification,
    maxHp: specification.hp,
    state: 'chase',
    timer: 0.7 + index * 0.22,
    aimX: -1,
    aimY: 0,
    phase: 1,
    cycle: 0,
    attackKind: 'lunge',
    flash: 0,
  };
}
function beginWindup(state, enemy) {
  const aim = normalized(state.player.x - enemy.x, state.player.y - enemy.y);
  enemy.aimX = aim.x;
  enemy.aimY = aim.y;
  enemy.state = 'windup';
  enemy.attackKind =
    enemy.behavior === 'ranged'
      ? 'burst'
      : enemy.behavior === 'boss'
        ? enemy.cycle % 2 === 0
          ? 'charge'
          : 'burst'
        : enemy.behavior === 'charger'
          ? 'charge'
          : 'lunge';
  enemy.currentWindup =
    enemy.phase === 2 ? (enemy.phaseTwoWindup ?? enemy.windupTime) : enemy.windupTime;
  enemy.timer = enemy.currentWindup;
  enemy.range =
    enemy.attackKind === 'burst'
      ? (enemy.triggerRange ?? 430)
      : enemy.attackSpeed * enemy.attackDuration + enemy.r;
}
function beginAttack(state, enemy) {
  enemy.cycle++;
  if (enemy.attackKind === 'burst') {
    const count =
      enemy.phase === 2 ? (enemy.phaseTwoBurstCount ?? enemy.burstCount) : enemy.burstCount;
    const angle = Math.atan2(enemy.aimY, enemy.aimX);
    for (let index = 0; index < (count ?? 3); index++) {
      const a = angle + (index - ((count ?? 3) - 1) / 2) * (enemy.burstSpacing ?? 0.14);
      shoot(
        state,
        'enemy',
        enemy.x + Math.cos(a) * (enemy.r + 12),
        enemy.y + Math.sin(a) * (enemy.r + 12),
        Math.cos(a),
        Math.sin(a),
        {
          speed:
            enemy.phase === 2
              ? (enemy.phaseTwoProjectileSpeed ?? enemy.projectileSpeed ?? 165)
              : (enemy.projectileSpeed ?? 165),
          damage: enemy.projectileDamage ?? enemy.damage,
        },
      );
    }
    enemy.state = 'recover';
    enemy.timer = enemy.burstRecover ?? enemy.recoverTime;
  } else {
    enemy.state = 'attack';
    enemy.timer = enemy.attackDuration;
    enemy.hitPlayer = false;
  }
}
export function advanceEnemy(state, enemy, dt) {
  if (enemy.hp <= 0) return;
  enemy.flash = Math.max(0, enemy.flash - dt);
  if (
    enemy.behavior === 'boss' &&
    enemy.hp <= enemy.maxHp * (enemy.phaseThreshold ?? 0.5) &&
    enemy.phase === 1
  ) {
    enemy.phase = 2;
    notice(state, enemy.phaseMessage ?? '敌人的攻势变得更猛烈了');
    effect(state, 'text', enemy.x, enemy.y - 60, { text: enemy.phaseLabel ?? '第二阶段', life: 2 });
  }
  enemy.timer -= dt;
  const player = state.player,
    d = distance(player, enemy);
  if (enemy.state === 'chase') {
    const direction = normalized(player.x - enemy.x, player.y - enemy.y);
    let speed = enemy.speed;
    if (enemy.behavior === 'ranged' && d < (enemy.retreatRange ?? 170)) speed *= -0.7;
    else if (enemy.behavior === 'ranged' && d < (enemy.preferredRange ?? 315)) speed = 0;
    else if (d < (enemy.moveStopDistance ?? 0)) speed = 0;
    moveActor(getRoom(state), enemy, direction.x * speed * dt, direction.y * speed * dt);
    if (d < enemy.triggerRange && enemy.timer <= 0) beginWindup(state, enemy);
  } else if (enemy.state === 'windup') {
    if (enemy.timer <= 0) beginAttack(state, enemy);
  } else if (enemy.state === 'attack') {
    const activeTime = Math.max(0, Math.min(dt, enemy.timer + dt));
    moveActor(
      getRoom(state),
      enemy,
      enemy.aimX * enemy.attackSpeed * activeTime,
      enemy.aimY * enemy.attackSpeed * activeTime,
    );
    if (!enemy.hitPlayer && distance(player, enemy) < player.r + enemy.r + 5)
      enemy.hitPlayer = hurtPlayer(state, enemy.chargeDamage ?? enemy.damage, enemy);
    if (enemy.timer <= 0) {
      enemy.state = 'recover';
      enemy.timer = enemy.chargeRecover ?? enemy.recoverTime;
    }
  } else if (enemy.timer <= 0) {
    enemy.state = 'chase';
    enemy.timer =
      enemy.phase === 2 ? (enemy.phaseTwoChaseDelay ?? 0.1) : (enemy.chaseDelay ?? 0.28);
  }
}
