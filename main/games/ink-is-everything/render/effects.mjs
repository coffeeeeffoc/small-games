import { INK, RED, TAU, CLAMP, RECLAIM, RECLAIM_LIGHT, GEAR } from './palette.mjs';

/** Small state-driven effects. Their lifetimes and results belong to the engine. */
export function createEffectPainter(painter, getState) {
  const { ctx, label, sprite, ring } = painter;

  function splatter(effect, t, color = INK) {
    ctx.fillStyle = color;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * TAU + (effect.seed || 0);
      const distance = 5 + t * (effect.radius || 34);
      ctx.beginPath();
      ctx.ellipse(
        effect.x + Math.cos(angle) * distance,
        effect.y + Math.sin(angle) * distance * 0.65,
        Math.max(0.3, (1 - t) * 4),
        Math.max(0.3, (1 - t) * 2),
        angle,
        0,
        TAU,
      );
      ctx.fill();
    }
  }

  function recovery(effect, t, time) {
    const player = getState().player;
    const from = effect.from || { x: effect.fromX ?? effect.x, y: effect.fromY ?? effect.y };
    const to = effect.to || { x: effect.toX ?? player.x, y: effect.toY ?? player.y - 22 };
    const travel = CLAMP(t * 1.5, 0, 1);
    const x = from.x + (to.x - from.x) * travel;
    const y = from.y + (to.y - from.y) * travel - Math.sin(travel * Math.PI) * 34;
    ctx.strokeStyle = RECLAIM;
    ctx.lineWidth = 2;
    ctx.globalAlpha *= 0.75;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo((from.x + to.x) / 2, Math.min(from.y, to.y) - 38, x, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = RECLAIM_LIGHT;
    ctx.strokeStyle = RECLAIM;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y, 5, 8, time * 2, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ring(to.x, to.y + 22, 18 + t * 22, RECLAIM, 1 - t, 2);
  }

  function nova(effect, t) {
    const radius = (effect.radius || 150) * Math.min(1, 0.35 + t * 1.3);
    ctx.fillStyle = `rgba(36,94,83,${0.12 * (1 - t)})`;
    ctx.strokeStyle = RECLAIM;
    ctx.lineWidth = 8 * (1 - t) + 1;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = RECLAIM_LIGHT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, Math.max(1, radius - 6), 0, TAU);
    ctx.stroke();
    ctx.fillStyle = INK;
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * TAU;
      ctx.beginPath();
      ctx.ellipse(
        effect.x + Math.cos(angle) * radius,
        effect.y + Math.sin(angle) * radius,
        Math.max(0.2, (1 - t) * 7),
        2,
        angle,
        0,
        TAU,
      );
      ctx.fill();
    }
  }

  function levelup(effect, t, time) {
    const radius = 28 + t * 65;
    ring(effect.x, effect.y, radius, GEAR, 1 - t, 4);
    ring(effect.x, effect.y, radius * 0.75, RECLAIM, 1 - t, 2);
    ctx.strokeStyle = GEAR;
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * TAU - time * 0.3;
      const x = effect.x + Math.cos(angle) * radius * 0.65;
      const y = effect.y - 32 + Math.sin(angle) * radius * 0.65 - t * 30;
      ctx.beginPath();
      ctx.moveTo(x - 4, y);
      ctx.lineTo(x + 4, y);
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x, y + 5);
      ctx.stroke();
    }
  }

  function drawEffect(effect, time) {
    const kind = effect.type;
    const inkAmount =
      ['spend', 'pickup', 'lifesteal', 'reclaim'].includes(kind) || effect.source === 'damage';
    const text =
      inkAmount && /^[+−-]\d+(\.\d+)?$/.test(effect.text || '') ? `${effect.text} 墨` : effect.text;
    const life = effect.life ?? 1;
    const maxLife = effect.maxLife || 1;
    const t = CLAMP(1 - life / maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = CLAMP(life / Math.min(maxLife, 0.3), 0, 1);
    if (['text', 'number', 'damage', 'pickup', 'spend'].includes(kind)) {
      const color =
        effect.color ||
        (kind === 'damage'
          ? RED
          : kind === 'spend'
            ? RECLAIM
            : kind === 'pickup'
              ? effect.source === 'reclaim'
                ? RECLAIM
                : '#557048'
              : INK);
      label(ctx, text ?? `${effect.amount ?? effect.value ?? ''}`, effect.x, effect.y - t * 25, {
        color,
        size: effect.size || (kind === 'spend' ? 16 : 20),
        background: false,
        accent: true,
      });
    } else if (kind === 'slash') {
      ctx.translate(effect.x, effect.y);
      ctx.rotate(effect.angle || 0);
      const radius = Math.max(1, effect.radius || 64),
        halfAngle = Math.acos(-0.15),
        sweep = -halfAngle + t * halfAngle * 2;
      // Show the same forward reach used by the dry-brush hit test. The broad
      // stroke stays close to the traveller, unlike a travelling ink bullet.
      ctx.fillStyle = effect.hit ? 'rgba(53,111,104,.2)' : 'rgba(32,34,29,.1)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, -halfAngle, halfAngle);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = effect.color || INK;
      ctx.lineWidth = 16 * (1 - t) + 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, radius, Math.max(-halfAngle, sweep - 1.35), sweep);
      ctx.stroke();
      ctx.strokeStyle = effect.hit ? RECLAIM_LIGHT : '#eee0bc';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 4, -halfAngle, halfAngle);
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, radius - 8 - i * 3, Math.max(-halfAngle, sweep - 1.0), sweep);
        ctx.stroke();
      }
      // A visible brush tip tracks the arc instead of an anonymous ring.
      ctx.save();
      ctx.rotate(sweep);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.moveTo(radius - 13, -4);
      ctx.lineTo(radius + 8, 0);
      ctx.lineTo(radius - 13, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (kind === 'shot') {
      ctx.translate(effect.x, effect.y);
      ctx.rotate(effect.angle || 0);
      ctx.strokeStyle = '#eee0bc';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-14, -8 * (1 - t));
      ctx.lineTo(14 + t * 12, 0);
      ctx.lineTo(-14, 8 * (1 - t));
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.ellipse(7 + t * 10, 0, Math.max(1, 6 * (1 - t)), Math.max(1, 3 * (1 - t)), 0, 0, TAU);
      ctx.fill();
    } else if (kind === 'lifesteal' || kind === 'reclaim') {
      recovery(effect, t, time);
    } else if (kind === 'nova') {
      nova(effect, t);
    } else if (kind === 'levelup' || kind === 'gear') {
      levelup(effect, t, time);
    } else if (kind === 'heal') {
      ring(effect.x, effect.y, 25 + t * 45, RECLAIM, 1 - t, 3);
      splatter(effect, t, RECLAIM);
    } else if (kind === 'dash') {
      sprite('hero', effect.x, effect.y, {
        alpha: 0.3 * (1 - t),
        flip: Math.cos(effect.angle || 0) < 0,
      });
    } else if (kind === 'ring' || kind === 'shockwave') {
      ring(effect.x, effect.y, (effect.radius || 100) * t, effect.color || RED, 1 - t, 3);
    } else {
      splatter(effect, t, effect.color || (effect.source === 'damage' ? RED : INK));
    }
    if (effect.text && !['text', 'number', 'damage', 'pickup', 'spend'].includes(kind)) {
      // Reset coordinates after translated slash/particle rendering.
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = CLAMP(life / Math.min(maxLife, 0.3), 0, 1);
      label(ctx, text, effect.x, effect.y - 40 - t * 26, {
        color: kind === 'hit' ? RED : kind === 'levelup' || kind === 'gear' ? '#8b652a' : RECLAIM,
        size: kind === 'lifesteal' ? 14 : 21,
        background: false,
        accent: true,
      });
    }
    ctx.restore();
  }
  return { drawEffect };
}
