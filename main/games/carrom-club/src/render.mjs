import { POCKETS, aimPreview } from './core.mjs';

const TAU = Math.PI * 2;
const woodAtlas = new Image();
woodAtlas.src = new URL('../assets/wood.webp', import.meta.url).href;
await woodAtlas.decode().catch(() => {});
function circle(ctx, x, y, r, fill, stroke, width = 1) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}
function round(ctx, x, y, w, h, r, fill, stroke, width = 1) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function boardTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1000;
  const c = canvas.getContext('2d');
  let seed = 23;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  c.shadowColor = '#000';
  c.shadowBlur = 24;
  c.shadowOffsetY = 12;
  round(c, 9, 9, 982, 982, 48, '#25120c', '#9d6c37', 3);
  c.shadowBlur = 0;
  c.shadowOffsetY = 0;
  c.save();
  c.beginPath();
  c.roundRect(18, 18, 964, 964, 40);
  c.clip();
  const wood = c.createLinearGradient(0, 0, 1000, 1000);
  wood.addColorStop(0, '#805036');
  wood.addColorStop(0.15, '#3b2015');
  wood.addColorStop(0.48, '#684027');
  wood.addColorStop(0.8, '#301b12');
  wood.addColorStop(1, '#845236');
  c.fillStyle = wood;
  c.fillRect(0, 0, 1000, 1000);
  if (woodAtlas.naturalWidth)
    c.drawImage(
      woodAtlas,
      woodAtlas.width / 2,
      0,
      woodAtlas.width / 2,
      woodAtlas.height,
      0,
      0,
      1000,
      1000,
    );
  for (let i = 0; i < (woodAtlas.naturalWidth ? 0 : 1200); i++) {
    const y = random() * 1020;
    c.beginPath();
    c.moveTo(-10, y);
    c.bezierCurveTo(260, y + random() * 32, 630, y - random() * 28, 1010, y + random() * 10);
    c.strokeStyle =
      i % 3 ? `rgba(12,5,1,${random() * 0.25})` : `rgba(230,167,94,${random() * 0.2})`;
    c.lineWidth = random() * 3;
    c.stroke();
  }
  c.restore();
  round(c, 31, 31, 938, 938, 32, null, '#c69b60', 1.5);
  round(c, 57, 57, 886, 886, 52, '#1e120a', '#b18144', 4);
  const maple = c.createLinearGradient(80, 65, 860, 930);
  maple.addColorStop(0, '#d3a268');
  maple.addColorStop(0.23, '#efca93');
  maple.addColorStop(0.6, '#e2b67c');
  maple.addColorStop(1, '#c78f51');
  c.save();
  c.beginPath();
  c.roundRect(70, 70, 860, 860, 39);
  c.clip();
  c.fillStyle = maple;
  c.fillRect(70, 70, 860, 860);
  if (woodAtlas.naturalWidth)
    c.drawImage(woodAtlas, 0, 0, woodAtlas.width / 2, woodAtlas.height, 70, 70, 860, 860);
  for (let i = 0; i < (woodAtlas.naturalWidth ? 0 : 2000); i++) {
    const y = 70 + random() * 860,
      x = random() * 1000;
    c.beginPath();
    c.moveTo(x - 400, y);
    c.bezierCurveTo(
      x - 150,
      y + random() * 20,
      x + 150,
      y - random() * 14,
      x + 500,
      y + random() * 8,
    );
    c.strokeStyle =
      i % 3 ? `rgba(128,74,27,${random() * 0.09})` : `rgba(255,242,204,${random() * 0.24})`;
    c.lineWidth = random() * 1.7;
    c.stroke();
  }
  const vignette = c.createRadialGradient(450, 420, 180, 500, 500, 660);
  vignette.addColorStop(0, '#fffff500');
  vignette.addColorStop(0.8, '#5c300011');
  vignette.addColorStop(1, '#22100099');
  c.fillStyle = vignette;
  c.fillRect(70, 70, 860, 860);
  c.restore();
  const ink = '#86392ee0';
  c.save();
  c.translate(500, 500);
  for (let i = 0; i < 4; i++) {
    c.save();
    c.rotate((i * Math.PI) / 2);
    round(c, -265, 275, 530, 31, 16, null, ink, 3);
    for (const x of [-265, 265]) {
      circle(c, x, 290, 22, '#e1b87f', ink, 2.5);
      circle(c, x, 290, 14, ink);
    }
    c.beginPath();
    c.moveTo(-360, 360);
    c.lineTo(-172, 172);
    c.strokeStyle = ink;
    c.lineWidth = 2;
    c.stroke();
    c.beginPath();
    c.moveTo(-172, 172);
    c.lineTo(-193, 181);
    c.lineTo(-181, 193);
    c.closePath();
    c.fillStyle = ink;
    c.fill();
    c.restore();
  }
  for (let i = 0; i < 16; i++) {
    c.save();
    c.rotate((i / 16) * TAU);
    c.beginPath();
    c.moveTo(0, -146);
    c.bezierCurveTo(44, -86, 39, -48, 0, -12);
    c.bezierCurveTo(-39, -48, -44, -86, 0, -146);
    c.fillStyle = '#93422b11';
    c.fill();
    c.strokeStyle = '#8d3a2ca8';
    c.lineWidth = 1.7;
    c.stroke();
    c.beginPath();
    c.moveTo(0, -134);
    c.lineTo(13, -101);
    c.lineTo(0, -50);
    c.lineTo(-13, -101);
    c.closePath();
    c.stroke();
    c.restore();
  }
  circle(c, 0, 0, 137, null, '#8d3a2ca8', 2);
  circle(c, 0, 0, 100, null, ink, 2);
  circle(c, 0, 0, 26, ink, '#b47d49', 2);
  c.restore();
  for (const [x, y] of POCKETS) {
    circle(c, x, y, 43, '#a7713d', '#efc281', 2);
    const hole = c.createRadialGradient(x + 10, y + 14, 4, x, y, 39);
    hole.addColorStop(0, '#111b18');
    hole.addColorStop(0.7, '#040c0b');
    hole.addColorStop(1, '#160c06');
    circle(c, x, y, 38, hole, '#2a170b', 2);
    c.beginPath();
    c.arc(x, y, 36, 0.1, 2.5);
    c.strokeStyle = '#e0b36c60';
    c.lineWidth = 1.5;
    c.stroke();
  }
  for (const [x, y] of [
    [40, 40],
    [960, 40],
    [40, 960],
    [960, 960],
  ]) {
    const brass = c.createLinearGradient(x - 12, y - 12, x + 12, y + 12);
    brass.addColorStop(0, '#fff0ac');
    brass.addColorStop(0.45, '#bf8d43');
    brass.addColorStop(0.6, '#f9db87');
    brass.addColorStop(1, '#725025');
    circle(c, x, y, 15, brass, '#38220d', 3);
    circle(c, x, y, 11, null, '#ffe7a780', 1);
    // Small engraved corner inlays keep the ornament in the static cached layer.
    c.save();
    c.translate(x, y);
    c.rotate(x > 500 ? Math.PI : 0);
    c.beginPath();
    c.moveTo(-18, 24);
    c.lineTo(-18, -18);
    c.lineTo(24, -18);
    c.strokeStyle = '#deb16c99';
    c.lineWidth = 2;
    c.stroke();
    c.restore();
  }
  c.font = '14px Georgia, serif';
  c.textAlign = 'center';
  c.fillStyle = '#deb67cbb';
  c.fillText('C A R R O M   C L U B', 500, 960);
  return canvas;
}

export function drawCoin(c, coin, scale = 1) {
  const { x, y, kind } = coin,
    r = coin.r * scale;
  c.save();
  c.shadowColor = '#2c140995';
  c.shadowBlur = 5 * scale;
  c.shadowOffsetY = 5 * scale;
  circle(c, x, y, r, kind === 'black' ? '#111919' : kind === 'queen' ? '#790e0d' : '#b08d58');
  c.shadowBlur = 0;
  c.shadowOffsetY = 0;
  const face = c.createRadialGradient(x - r * 0.4, y - r * 0.5, 0, x, y, r);
  const colors =
    kind === 'black'
      ? ['#596263', '#232e2e', '#0b1314']
      : kind === 'queen'
        ? ['#ed7160', '#b72725', '#6b100d']
        : kind === 'striker'
          ? ['#fff6d1', '#efd5a0', '#b58a43']
          : ['#fff2d3', '#edcf97', '#b4874b'];
  face.addColorStop(0, colors[0]);
  face.addColorStop(0.65, colors[1]);
  face.addColorStop(1, colors[2]);
  circle(c, x, y - scale, r - scale, face, colors[2], 1);
  for (const ratio of [0.8, 0.66, 0.53])
    circle(
      c,
      x,
      y - scale,
      r * ratio,
      null,
      kind === 'black' ? '#81908b65' : kind === 'queen' ? '#fca88985' : '#fff4d9c9',
      1.4 * scale,
    );
  if (kind === 'striker') {
    circle(c, x, y - scale, r * 0.38, null, '#a7763680', scale);
    circle(c, x, y - scale, 3 * scale, '#c59650');
  }
  c.restore();
}

export function createRenderer(canvas) {
  const c = canvas.getContext('2d'),
    board = boardTexture();
  let width = 0;
  return (game, { aim = null, effects = [], time = 0, alpha = 1 } = {}) => {
    const pixels = Math.round(
      Math.min(devicePixelRatio || 1, 2) * canvas.getBoundingClientRect().width,
    );
    if (pixels > 0 && width !== pixels) {
      canvas.width = canvas.height = pixels;
      width = pixels;
    }
    c.setTransform(width / 1000, 0, 0, width / 1000, 0, 0);
    c.clearRect(0, 0, 1000, 1000);
    c.drawImage(board, 0, 0);
    if (game.phase === 'ready' && game.turn === 0) {
      c.save();
      c.shadowColor = '#ffe39f';
      c.shadowBlur = 18;
      circle(c, game.striker.x, game.striker.y, 34, null, '#fff0ba99', 2);
      c.restore();
    }
    for (const coin of [...game.coins, game.striker])
      if (!coin.pocketed) {
        const moving = game.phase === 'moving';
        drawCoin(
          c,
          moving
            ? {
                ...coin,
                x: coin.px + (coin.x - coin.px) * alpha,
                y: coin.py + (coin.y - coin.py) * alpha,
              }
            : coin,
        );
      }
    if (aim?.power > 0.015) {
      const s = game.striker,
        preview = aimPreview(game, aim.dx, aim.dy);
      if (preview) {
        c.save();
        c.setLineDash([6, 12]);
        c.lineDashOffset = 0;
        c.strokeStyle = '#fffbdf';
        c.lineWidth = 3;
        c.shadowColor = '#594022';
        c.shadowBlur = 3;
        c.beginPath();
        c.moveTo(s.x, s.y);
        c.lineTo(preview.x, preview.y);
        c.stroke();
        c.setLineDash([]);
        circle(c, preview.x, preview.y, s.r, null, '#fffcdeaa', 2);
        if (preview.hit) {
          const h = preview.hit,
            d = Math.hypot(h.x - preview.x, h.y - preview.y);
          c.beginPath();
          c.moveTo(h.x, h.y);
          c.lineTo(h.x + ((h.x - preview.x) / d) * 86, h.y + ((h.y - preview.y) / d) * 86);
          c.strokeStyle = '#a64829';
          c.lineWidth = 3;
          c.stroke();
        }
        const length = Math.hypot(aim.dx, aim.dy);
        const ex = s.x - (aim.dx / length) * aim.pull,
          ey = s.y - (aim.dy / length) * aim.pull;
        c.beginPath();
        c.moveTo(s.x, s.y);
        c.lineTo(ex, ey);
        c.strokeStyle = '#ffe39e';
        c.lineWidth = 5;
        c.shadowColor = '#fbc358';
        c.shadowBlur = 18;
        c.stroke();
        circle(c, ex, ey, 10, '#fff0b5', '#9b6d30', 2);
        c.restore();
      }
    }
    for (const effect of effects) {
      const p = effect.life;
      c.save();
      c.globalAlpha = p;
      if (effect.type === 'pocket') {
        circle(
          c,
          effect.x,
          effect.y,
          40 + (1 - p) * 42,
          null,
          effect.kind === 'queen' ? '#fa8066' : '#ffe7a1',
          3 * p,
        );
        drawCoin(c, { x: effect.x, y: effect.y, kind: effect.kind, r: 18 }, p);
      }
      c.restore();
    }
  };
}
