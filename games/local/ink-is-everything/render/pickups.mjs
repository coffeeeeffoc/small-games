import { INK, TAU, CLAMP, RECLAIM, RECLAIM_LIGHT, GEAR } from './palette.mjs';

const amountText = (value) =>
  Number.isInteger(value) ? String(value) : Number(value || 0).toFixed(1);

/** Distinct silhouettes communicate recovered skill ink, fresh ink and equipment. */
export function createPickupPainter(painter, getState) {
  const { ctx, label, sprite, ring } = painter;

  function glow(x, y, radius, color) {
    const halo = ctx.createRadialGradient(x, y, 0, x, y, radius);
    halo.addColorStop(0, color);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * 0.6, 0, 0, TAU);
    ctx.fill();
  }

  function drawReclaim(pickup, time) {
    const lifetime = pickup.maxTtl || getState().definition?.rules?.dropLifetime || 12;
    const remaining = Math.max(0, pickup.ttl ?? lifetime);
    const armed = (pickup.age || 0) >= (pickup.armDelay ?? 0.5);
    const fading = remaining < 3;
    const bob = Math.sin(time * 4 + pickup.x) * 2;
    ctx.save();
    ctx.globalAlpha = !armed ? 0.5 : fading ? 0.65 + Math.sin(time * 12) * 0.25 : 1;
    glow(pickup.x, pickup.y, 34, 'rgba(65,146,123,.25)');
    ring(pickup.x, pickup.y + 3, 25, RECLAIM, 0.35, 1);
    ctx.strokeStyle = fading ? '#a16d37' : RECLAIM;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.ellipse(
      pickup.x,
      pickup.y + 3,
      23,
      12,
      0,
      -Math.PI / 2,
      -Math.PI / 2 + TAU * CLAMP(remaining / lifetime, 0, 1),
    );
    ctx.stroke();
    ctx.save();
    ctx.translate(pickup.x, pickup.y - 10 + bob);
    ctx.fillStyle = RECLAIM;
    ctx.strokeStyle = '#234e49';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.bezierCurveTo(-3, -8, -12, -2, -11, 5);
    ctx.bezierCurveTo(-9, 18, 12, 16, 12, 4);
    ctx.bezierCurveTo(11, -5, 4, -8, 0, -17);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = RECLAIM_LIGHT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, -2);
    ctx.quadraticCurveTo(-8, 7, -2, 9);
    ctx.stroke();
    ctx.restore();
    label(
      ctx,
      `+${amountText(pickup.value)} 墨${fading ? ` · ${Math.ceil(remaining)}秒` : ''}`,
      pickup.x,
      pickup.y + 24,
      {
        size: 12,
        color: fading ? '#93602b' : RECLAIM,
        background: true,
        accent: true,
      },
    );
    ctx.restore();
  }

  function drawGear(pickup, time) {
    const bob = Math.sin(time * 2.4) * 4;
    const nearby = Math.hypot(getState().player.x - pickup.x, getState().player.y - pickup.y) <= 106;
    ctx.save();
    glow(pickup.x, pickup.y - 4, 53, 'rgba(208,160,61,.36)');
    ring(pickup.x, pickup.y + 4, 33, GEAR, 0.75, 2);
    ctx.strokeStyle = '#b49851';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * TAU + time * 0.35;
      ctx.moveTo(pickup.x + Math.cos(angle) * 25, pickup.y - 15 + bob + Math.sin(angle) * 25);
      ctx.lineTo(pickup.x + Math.cos(angle) * 33, pickup.y - 15 + bob + Math.sin(angle) * 33);
    }
    ctx.stroke();
    // The gold marker is a persistent invitation; reaching it never opens a
    // menu until the player taps the folio or the nearby interact control.
    ctx.strokeStyle = '#f6df8b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pickup.x - 7, pickup.y - 68 + bob);
    ctx.lineTo(pickup.x, pickup.y - 61 + bob);
    ctx.lineTo(pickup.x + 7, pickup.y - 68 + bob);
    ctx.stroke();
    ctx.translate(pickup.x, pickup.y - 21 + bob);
    // A bound, rune-stamped folio differs from the ink bottle and key seal.
    ctx.rotate(-0.12);
    ctx.fillStyle = '#e7d5a0';
    ctx.strokeStyle = '#55472b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-19, -22);
    ctx.lineTo(17, -22);
    ctx.lineTo(21, 19);
    ctx.lineTo(-18, 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#827143';
    ctx.fillRect(-17, -20, 6, 39);
    ctx.strokeStyle = '#8d6930';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, -13);
    ctx.lineTo(-4, -1);
    ctx.lineTo(6, 0);
    ctx.lineTo(-1, 13);
    ctx.stroke();
    ctx.strokeStyle = '#faf0c1';
    ctx.strokeRect(-7, -17, 20, 33);
    ctx.restore();
    label(
      ctx,
      nearby ? '点击拾取装备' : '装备',
      pickup.x,
      pickup.y + 33,
      {
        size: 14,
        color: '#80602c',
        background: nearby,
        accent: true,
      },
    );
  }

  function drawPickup(pickup, time) {
    if (pickup.collected) return;
    if (pickup.kind === 'reclaim') return drawReclaim(pickup, time);
    if (pickup.kind === 'gear') return drawGear(pickup, time);
    const y = pickup.y - 4 + Math.sin(time * 4 + pickup.x) * 3;
    ring(
      pickup.x,
      pickup.y + 3,
      pickup.kind === 'seal' ? 20 : 14,
      '#9b793d',
      0.6 + Math.sin(time * 4) * 0.2,
    );
    if (pickup.kind === 'seal') {
      ctx.save();
      ctx.translate(pickup.x, y - 14);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#c4a863';
      ctx.strokeStyle = '#4c4931';
      ctx.lineWidth = 2;
      ctx.fillRect(-12, -12, 24, 24);
      ctx.strokeRect(-12, -12, 24, 24);
      ctx.strokeStyle = '#eee0b5';
      ctx.strokeRect(-7, -7, 14, 14);
      ctx.restore();
      label(ctx, '钥印 · 靠近拾取', pickup.x, pickup.y + 24, {
        size: 13,
        color: '#806236',
        accent: true,
      });
    } else {
      sprite('bottle', pickup.x, y, { size: 0.8 });
      if (pickup.value)
        label(ctx, `+${amountText(pickup.value)} 墨`, pickup.x, pickup.y + 20, {
          size: 12,
          color: INK,
          background: false,
        });
    }
  }
  return { drawPickup };
}
