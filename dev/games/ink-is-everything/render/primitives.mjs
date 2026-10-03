import { INK, TAU, random } from './palette.mjs';

export function drawLabel(
  ctx,
  text,
  x,
  y,
  { color = INK, size = 14, background = true, align = 'center', accent = false } = {},
) {
  if (!text) return;
  ctx.save();
  ctx.font = `${accent ? 700 : 600} ${size}px "Noto Serif SC", "Songti SC", SimSun, serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (background) {
    const w = ctx.measureText(text).width + 20;
    const left = align === 'left' ? x - 10 : align === 'right' ? x - w + 10 : x - w / 2;
    ctx.fillStyle = 'rgba(238,226,198,.94)';
    ctx.beginPath();
    ctx.moveTo(left, y - size * 0.72 - 4);
    ctx.lineTo(left + w - 2, y - size * 0.72 - 3);
    ctx.lineTo(left + w, y + size * 0.72 + 4);
    ctx.lineTo(left + 2, y + size * 0.72 + 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = accent ? color : 'rgba(88,76,52,.24)';
    ctx.lineWidth = accent ? 1.4 : 0.7;
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function inkBlot(ctx, x, y, radius, seed, alpha = 1) {
  const rng = random(seed);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (let i = 0; i <= 17; i++) {
    const a = (i / 17) * TAU;
    const r = radius * (0.69 + rng() * 0.31);
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r * 0.64;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 8; i++) {
    const a = rng() * TAU,
      r = radius * (1 + rng() * 0.4);
    ctx.beginPath();
    ctx.ellipse(
      x + Math.cos(a) * r,
      y + Math.sin(a) * r * 0.7,
      1 + rng() * 2,
      1 + rng(),
      a,
      0,
      TAU,
    );
    ctx.fill();
  }
  ctx.restore();
}

export function stoneBlock(ctx, x, y, w, h, seed) {
  const rng = random(seed);
  const top = Math.min(14, h * 0.3);
  ctx.save();
  ctx.fillStyle = 'rgba(31,35,26,.16)';
  ctx.fillRect(x + 4, y + 10, w + 5, h);
  ctx.fillStyle = '#918d74';
  ctx.strokeStyle = '#373b2d';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(x, y + top);
  ctx.lineTo(x + 3, y);
  ctx.lineTo(x + w - 6, y - 3);
  ctx.lineTo(x + w, y + top - 3);
  ctx.lineTo(x + w - 2, y + h);
  ctx.lineTo(x + 3, y + h + 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#bcb397';
  ctx.beginPath();
  ctx.moveTo(x + 3, y);
  ctx.lineTo(x + w - 6, y - 3);
  ctx.lineTo(x + w, y + top - 3);
  ctx.lineTo(x, y + top);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(42,44,32,.3)';
  ctx.lineWidth = 0.9;
  for (let i = 0; i < Math.floor(w / 7); i++) {
    const px = x + 5 + i * 7;
    ctx.beginPath();
    ctx.moveTo(px, y + top + 2);
    ctx.lineTo(px - 3, y + h - 3);
    ctx.stroke();
  }
  ctx.strokeStyle = '#444635';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.3, y + top);
  ctx.lineTo(x + w * 0.34, y + top + 5);
  ctx.lineTo(x + w * 0.25, y + top + 10);
  ctx.lineTo(x + w * 0.36, y + h - 1);
  ctx.moveTo(x + 5, y + h * 0.69);
  ctx.lineTo(x + w - 2, y + h * 0.69 - rng() * 3);
  ctx.stroke();
  ctx.strokeStyle = '#ded0aa';
  ctx.beginPath();
  ctx.moveTo(x + 5, y + 3);
  ctx.lineTo(x + w * 0.5, y + 1);
  ctx.stroke();
  ctx.restore();
}

export function createPainter(ctx, sprites, getView) {
  function label(context, text, x, y, options = {}) {
    // World-space labels remain readable when a phone shows a wider arena.
    drawLabel(context, text, x, y, {
      ...options,
      size: Math.max(options.size || 14, 11 / getView().scale),
    });
  }

  function sprite(name, x, y, { size = 1, flip = false, alpha = 1, rotate = 0 } = {}) {
    const spec = sprites[name];
    if (!spec?.img.complete || !spec.img.naturalWidth) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale((flip ? -1 : 1) * size, size);
    ctx.rotate(rotate);
    ctx.globalAlpha *= alpha;
    ctx.drawImage(spec.img, -spec.w / 2, -spec.h + spec.foot, spec.w, spec.h);
    ctx.restore();
  }

  function ring(x, y, radius, color = '#60734e', alpha = 0.6, width = 2) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha *= alpha;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * 0.48, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  return { ctx, label, sprite, ring };
}
