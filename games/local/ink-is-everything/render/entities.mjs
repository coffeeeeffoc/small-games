import { INK, RED, TAU, CLAMP, RECLAIM, RECLAIM_LIGHT } from './palette.mjs';

/** Actors and their attack telegraphs; no simulation is performed here. */
export function createEntityPainter(painter, getState, getWalking) {
  const { ctx, label, sprite, ring } = painter;
  function drawWarning(enemy, time) {
    const windup = enemy.windup ?? enemy.windupTimer ?? enemy.telegraph ?? 0;
    const state = enemy.state || enemy.mode;
    if (!(windup > 0 || state === 'windup' || state === 'telegraph' || state === 'charging'))
      return;
    const angle =
      enemy.attackAngle ??
      enemy.angle ??
      Math.atan2(
        enemy.aimY ?? (enemy.targetY ?? getState().player.y) - enemy.y,
        enemy.aimX ?? (enemy.targetX ?? getState().player.x) - enemy.x,
      );
    const behavior = enemy.behavior || 'melee';
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(angle);
    ctx.fillStyle = `rgba(157,47,34,${0.14 + 0.08 * Math.sin(time * 14)})`;
    ctx.strokeStyle = '#a34733';
    ctx.lineWidth = 2;
    if (enemy.attackKind === 'burst' || behavior === 'ranged') {
      const count =
        enemy.phase === 2
          ? (enemy.phaseTwoBurstCount ?? enemy.burstCount ?? 3)
          : (enemy.burstCount ?? 3);
      const step = enemy.burstSpacing ?? 0.14;
      const halfAngle = ((count - 1) * step) / 2 + 0.035;
      const radius = enemy.range || 430;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, -halfAngle, halfAngle);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha *= 0.6;
      ctx.setLineDash([7, 8]);
      for (let i = 0; i < count; i++) {
        const a = (i - (count - 1) / 2) * step;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
        ctx.stroke();
      }
    } else {
      const length =
        enemy.attackSpeed && enemy.attackDuration
          ? enemy.attackSpeed * enemy.attackDuration
          : Math.max(0, (enemy.range || 115) - (enemy.r || 20));
      const half = enemy.r || 20;
      ctx.beginPath();
      ctx.moveTo(0, -half);
      ctx.lineTo(length, -half);
      ctx.arc(length, 0, half, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(0, half);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(length - 24, -8);
      ctx.lineTo(length - 13, 0);
      ctx.lineTo(length - 24, 8);
      ctx.stroke();
    }
    ctx.restore();
    const progress = CLAMP(
      1 - (enemy.timer || 0) / (enemy.currentWindup || enemy.windupTime || 1),
      0,
      1,
    );
    ctx.strokeStyle = '#a44731';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, (enemy.r || 20) + 8, -Math.PI / 2, -Math.PI / 2 + TAU * progress);
    ctx.stroke();
    label(
      ctx,
      enemy.attackKind === 'burst'
        ? '墨潮！'
        : behavior === 'boss' || behavior === 'charger'
          ? '冲锋！'
          : '扑击！',
      enemy.x,
      enemy.y - (behavior === 'boss' ? 140 : behavior === 'charger' ? 109 : 82),
      { color: RED, size: 12, accent: true },
    );
  }

  function drawEnemy(enemy, time) {
    if (enemy.hp <= 0) return;
    const behavior = enemy.behavior || 'melee';
    const big = behavior === 'boss' || behavior === 'charger';
    const size = behavior === 'ranged' ? 0.96 : 0.9;
    const bob = Math.sin(time * 5 + enemy.x * 0.01) * 1.5;
    const isHit = (enemy.hitTimer || enemy.flash || 0) > 0;
    const appearance =
      typeof enemy.appearance === 'string'
        ? enemy.appearance
        : enemy.appearance?.sprite || enemy.sprite;
    const spriteName = ['slime', 'guard', 'boss'].includes(appearance)
      ? appearance
      : behavior === 'charger'
        ? 'guard'
        : behavior === 'boss'
          ? 'boss'
          : 'slime';
    sprite(spriteName, enemy.x, enemy.y + bob, {
      size: (enemy.appearance?.scale || 1) * (big ? 1 : size),
      alpha: isHit ? 0.55 : 1,
      flip: getState().player.x < enemy.x,
    });
    if (behavior === 'ranged') {
      ctx.strokeStyle = '#b0a277';
      ctx.fillStyle = '#3e4631';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(enemy.x, enemy.y - 18, 9, 12, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(enemy.x, enemy.y - 18, 3, 5, 0, 0, TAU);
      ctx.fillStyle = '#e0d2b0';
      ctx.fill();
    }
    const maxHp = enemy.maxHp || enemy.hp;
    const w = big ? 84 : 44,
      y = enemy.y - (spriteName === 'boss' ? 119 : spriteName === 'guard' ? 89 : 61);
    ctx.fillStyle = '#504d3c';
    ctx.fillRect(enemy.x - w / 2, y, w, 5);
    ctx.fillStyle = '#ad5542';
    ctx.fillRect(enemy.x - w / 2, y, w * CLAMP(enemy.hp / maxHp, 0, 1), 5);
    ctx.strokeStyle = '#e6d5ac';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(enemy.x - w / 2, y, w, 5);
  }

  function drawPlayer(player, time) {
    const angle = player.angle ?? player.facing ?? Math.atan2(player.aimY || 0, player.aimX || 1);
    const moving =
      getWalking() || Math.abs(player.vx || 0) + Math.abs(player.vy || 0) > 3 || player.moving;
    const bob = moving ? Math.sin(time * 17) * 2 : Math.sin(time * 2) * 0.65;
    const inkRatio = CLAMP((player.ink ?? 0) / (player.maxInk || 100), 0, 1);
    const danger = inkRatio <= 0.25;
    ring(
      player.x,
      player.y + 3,
      20,
      danger ? RED : RECLAIM,
      danger ? 0.5 + Math.sin(time * 7) * 0.25 : 0.65,
      2,
    );
    if ((player.dashTimer || player.dashing || 0) > 0) {
      const dx = player.dashX ?? Math.cos(angle),
        dy = player.dashY ?? Math.sin(angle);
      for (let i = 3; i > 0; i--)
        sprite('hero', player.x - dx * i * 15, player.y - dy * i * 15, {
          alpha: 0.12 + 0.07 * (3 - i),
          flip: Math.cos(angle) < 0,
        });
    }
    const invulnerable = (player.invulnerable || player.invuln || player.invulnerability || 0) > 0;
    sprite('hero', player.x, player.y + bob, {
      flip: Math.cos(angle) < -0.12,
      alpha: invulnerable && Math.sin(time * 35) > 0.25 ? 0.45 : 1,
    });
    ctx.save();
    ctx.translate(player.x, player.y - 16);
    ctx.rotate(angle);
    ctx.strokeStyle = '#615a3e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.lineTo(35, 0);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(35, -3);
    ctx.lineTo(45, 0);
    ctx.lineTo(35, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // The traveller's life is the same ink that powers attacks and exploration.
    ctx.fillStyle = '#eee0bd';
    ctx.fillRect(player.x - 28, player.y + 12, 56, 7);
    ctx.strokeStyle = '#384d3b';
    ctx.lineWidth = 1;
    ctx.strokeRect(player.x - 28, player.y + 12, 56, 7);
    ctx.fillStyle = danger ? RED : RECLAIM;
    ctx.fillRect(player.x - 26, player.y + 14, 52 * inkRatio, 3);
    ctx.fillStyle = RECLAIM_LIGHT;
    ctx.fillRect(player.x - 25, player.y + 14, 2, 1);
  }

  function drawProjectile(p) {
    const enemy = p.enemy || p.owner === 'enemy' || p.team === 'enemy';
    const angle = p.angle ?? Math.atan2(p.vy || 0, p.vx || 1);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    const color = enemy ? '#944231' : '#232a1e';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = enemy ? 9 : 13;
    ctx.beginPath();
    ctx.moveTo(-27, 0);
    ctx.lineTo(0, 0);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.radius || p.r || (enemy ? 6 : 8), enemy ? 4 : 5, 0, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-17, -3);
    ctx.lineTo(-7, -2);
    ctx.moveTo(-23, 4);
    ctx.lineTo(-12, 3);
    ctx.stroke();
    ctx.restore();
  }

  return { drawWarning, drawEnemy, drawPlayer, drawProjectile };
}
