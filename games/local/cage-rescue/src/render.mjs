import { getPersonLandingX } from './core.mjs';
/** Original Canvas artwork. All scene coordinates use the 390 × 700 playfield. */
const WIDTH = 390;
const HEIGHT = 700;

const THEMES = {
  rescue: {
    sky: '#081c39',
    horizon: '#163f6a',
    deep: '#030d1d',
    glow: '#195993',
    mint: '#42d9d0',
    mintLight: '#b0fff0',
    gold: '#ffc647',
    goldLight: '#fff1a0',
    jacket: '#f58b25',
    darkGold: '#c86816',
    helmet: '#ffc632',
  },
  mint: {
    sky: '#071d2b',
    horizon: '#104b54',
    deep: '#04151e',
    glow: '#147b7a',
    mint: '#61dfcd',
    mintLight: '#c5fff1',
    gold: '#98f1cc',
    goldLight: '#e3fff3',
    jacket: '#29aa94',
    darkGold: '#249b88',
    helmet: '#96efd0',
  },
  rose: {
    sky: '#17162f',
    horizon: '#39335f',
    deep: '#0a1023',
    glow: '#6b508e',
    mint: '#adacf5',
    mintLight: '#e2dfff',
    gold: '#ffb3b8',
    goldLight: '#ffe4db',
    jacket: '#d86993',
    darkGold: '#b65080',
    helmet: '#ffc0bc',
  },
};

const palette = (name) => THEMES[name] || THEMES.rescue;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const fraction = (n) => n - Math.floor(n);
const seed = (n) => fraction(Math.sin(n * 127.1 + 311.7) * 43758.5453);

// Keep one backing bitmap per live renderer, rather than one per visited level.
// Only damage, theme, scene and resolution invalidate the static artwork.
const fieldLayers = new WeakMap();

export function releaseRenderCache(ctx) {
  const layer = fieldLayers.get(ctx);
  if (!layer) return;
  layer.canvas.width = layer.canvas.height = 0;
  fieldLayers.delete(ctx);
}

function drawField(ctx, p, theme, game = null, home = false) {
  let layer = fieldLayers.get(ctx);
  if (!layer) {
    const canvas = ctx.canvas.ownerDocument.createElement('canvas');
    layer = { canvas, ctx: canvas.getContext('2d') };
    fieldLayers.set(ctx, layer);
  }
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const cages = game?.cages || [];
  const bricks = game?.bricks || [];
  const changed =
    layer.canvas.width !== width ||
    layer.canvas.height !== height ||
    layer.theme !== theme ||
    layer.home !== home ||
    layer.game !== game ||
    cages.some((cage, i) => cage.hp !== layer.cageHp?.[i]) ||
    bricks.some((brick, i) => brick.hp !== layer.brickHp?.[i]);
  if (changed) {
    if (layer.canvas.width !== width) layer.canvas.width = width;
    if (layer.canvas.height !== height) layer.canvas.height = height;
    const background = layer.ctx;
    background.setTransform(width / WIDTH, 0, 0, height / HEIGHT, 0, 0);
    background.clearRect(0, 0, WIDTH, HEIGHT);
    drawBackground(background, p, 0, home, true);
    if (!home) {
      drawNet(background, p);
      for (const brick of bricks) drawBrick(background, brick, p);
      for (const barrier of game?.barriers || []) drawBarrier(background, barrier);
      for (const [index, cage] of cages.entries()) {
        if (cage.hp > 0) drawCage(background, cage, index, p);
      }
    }
    Object.assign(layer, {
      theme,
      home,
      game,
      cageHp: cages.map((cage) => cage.hp),
      brickHp: bricks.map((brick) => brick.hp),
    });
  }
  ctx.drawImage(layer.canvas, 0, 0, WIDTH, HEIGHT);
}

function rounded(ctx, x, y, w, h, r = 4) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function circle(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function line(ctx, x1, y1, x2, y2, color, width = 1) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function glow(ctx, x, y, radius, color, opacity = 1) {
  ctx.save();
  ctx.globalAlpha *= opacity;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'transparent');
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
}

function star(ctx, x, y, radius, fill) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 - Math.PI / 2;
    const length = i % 2 ? radius * 0.3 : radius;
    const px = x + Math.cos(angle) * length;
    const py = y + Math.sin(angle) * length;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = '#041323';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawTower(ctx, x, width, top, bottom, p, foreground = false) {
  const edge = foreground ? '#375e80' : '#183955';
  ctx.fillStyle = foreground ? '#07172b' : '#091d35';
  ctx.fillRect(x, top, width, bottom - top);
  line(ctx, x + 1, top, x + 1, bottom, edge, foreground ? 3 : 2);
  line(ctx, x + width - 1, top, x + width - 1, bottom, edge, foreground ? 3 : 2);
  for (let y = top; y < bottom; y += foreground ? 77 : 59) {
    line(ctx, x, y, x + width, y, edge, 3);
    line(ctx, x + 1, y + 3, x + width - 1, Math.min(bottom, y + (foreground ? 72 : 55)), edge, 2);
    if (foreground) {
      line(ctx, x + width - 1, y + 3, x + 1, Math.min(bottom, y + 72), '#142e47', 2);
      circle(ctx, x + 2, y, 1.5, '#47728c');
      circle(ctx, x + width - 2, y, 1.5, '#47728c');
    }
  }
  if (!foreground) {
    ctx.fillStyle = '#0a2038';
    ctx.fillRect(x - 4, top - 6, width + 8, 6);
    line(ctx, x + width * 0.5, top - 22, x + width * 0.5, top, '#17334c', 2);
    for (let y = top + 17; y < bottom; y += 91) {
      ctx.fillStyle = '#dfa457';
      ctx.globalAlpha *= 0.55;
      ctx.fillRect(x + width * 0.5 - 2, y, 3, 5);
      ctx.globalAlpha /= 0.55;
    }
  }
}

function drawBackground(ctx, p, time, home = false, reducedMotion = false) {
  ctx.save();
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, p.sky);
  sky.addColorStop(0.69, p.horizon);
  sky.addColorStop(1, p.deep);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  glow(ctx, 265, home ? 270 : 330, home ? 270 : 245, p.glow, 0.32);

  // The sky, like the buildings, is deterministic so resets never shift the art.
  for (let i = 0; i < 47; i++) {
    const x = 23 + seed(i + 1) * 344;
    const y = 20 + seed(i + 93) * 563;
    const alpha = 0.13 + seed(i + 78) * 0.4;
    ctx.globalAlpha = alpha * (reducedMotion ? 1 : 0.83 + Math.sin(time * 0.45 + i) * 0.17);
    circle(ctx, x, y, i % 7 === 0 ? 1.05 : 0.6, '#c1e9f6');
  }
  ctx.globalAlpha = 1;

  // Distant roofline gives the rescue a sense of height without competing with play.
  const skylineTop = home ? 416 : 545;
  ctx.fillStyle = '#081d36';
  ctx.beginPath();
  ctx.moveTo(0, HEIGHT);
  ctx.lineTo(0, skylineTop + 45);
  ctx.lineTo(57, skylineTop + 8);
  ctx.lineTo(80, skylineTop + 36);
  ctx.lineTo(143, skylineTop - 16);
  ctx.lineTo(213, skylineTop + 39);
  ctx.lineTo(291, skylineTop + 3);
  ctx.lineTo(390, skylineTop + 61);
  ctx.lineTo(390, HEIGHT);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = home ? 0.72 : 0.56;
  for (let i = 0; i < 12; i++) {
    const x = i * 36 - 12;
    const h = 32 + seed(i + 133) * 70;
    ctx.fillStyle = '#071a30';
    ctx.fillRect(x, skylineTop + 78 - h, 23 + seed(i) * 17, HEIGHT);
    ctx.fillRect(x + 8, skylineTop + 68 - h, 11, 12);
    if (i % 3 !== 0) {
      ctx.fillStyle = '#b37d42';
      ctx.fillRect(x + 9, skylineTop + 87 - h, 2, 4);
    }
  }
  ctx.globalAlpha = 1;

  // Construction silhouettes and a moon give the field a place, rather than a grid.
  const moonX = home ? 61 : 286;
  const moonY = home ? 323 : 518;
  glow(ctx, moonX, moonY, 61, '#a9d9ed', 0.09);
  circle(ctx, moonX, moonY, home ? 22 : 26, '#bdd5dd');
  circle(ctx, moonX + 7, moonY - 7, home ? 17 : 21, p.sky);
  ctx.save();
  ctx.globalAlpha = 0.45;
  for (const [x, y, direction] of [
    [64, 542, 1],
    [324, 565, -1],
  ]) {
    line(ctx, x, y, x, HEIGHT, '#244c6b', 3);
    line(ctx, x - 15, y + 19, x + 15, y + 19, '#244c6b', 4);
    line(ctx, x, y, x + direction * 95, y + 14, '#244c6b', 3);
    line(ctx, x, y - 6, x + direction * 74, y + 3, '#244c6b', 1.5);
    line(ctx, x + direction * 69, y + 10, x + direction * 69, y + 43, '#244c6b', 1);
  }
  ctx.restore();

  if (home) {
    ctx.save();
    ctx.translate(28, 0);
    ctx.rotate(0.075);
    drawTower(ctx, 0, 21, 198, 755, p);
    ctx.restore();
    ctx.save();
    ctx.translate(344, 0);
    ctx.rotate(-0.07);
    drawTower(ctx, 0, 27, 121, 755, p);
    ctx.restore();
    ctx.globalAlpha = 0.3;
    drawTower(ctx, 277, 24, 52, 465, p);
    ctx.globalAlpha = 1;
    // A riveted title plate sits behind the live HTML lettering.
    rounded(ctx, 38, 106, 314, 137, 15);
    ctx.fillStyle = '#041222';
    ctx.fill();
    ctx.strokeStyle = '#284d66';
    ctx.lineWidth = 6;
    ctx.stroke();
    rounded(ctx, 42, 110, 306, 129, 12);
    ctx.strokeStyle = p.mint;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    for (const x of [49, 341])
      for (const y of [118, 231]) {
        circle(ctx, x, y, 3.4, '#041321');
        circle(ctx, x, y - 0.5, 2, '#7da9ba');
      }
  } else {
    ctx.globalAlpha = 0.95;
    drawTower(ctx, 2, 12, 69, 700, p, true);
    drawTower(ctx, 376, 12, 69, 700, p, true);
    ctx.globalAlpha = 1;
    line(ctx, 16, 71, 374, 71, '#274c69', 5);
    line(ctx, 16, 70, 374, 70, '#60849a', 1);
    line(ctx, 16, 70, 16, 669, '#4397b1', 1.5);
    line(ctx, 374, 70, 374, 669, '#4397b1', 1.5);
    for (const y of [121, 314, 507, 652]) {
      for (const x of [10, 380]) {
        glow(ctx, x, y, 18, '#ffc64d', 0.26);
        rounded(ctx, x - 2, y - 4, 4, 8, 1.5);
        ctx.fillStyle = '#e6ad58';
        ctx.fill();
        ctx.fillStyle = '#fff0b5';
        ctx.fillRect(x - 0.6, y - 2.5, 1.2, 5);
      }
    }
  }
  const topShade = ctx.createLinearGradient(0, 0, 0, 125);
  topShade.addColorStop(0, 'rgba(2,10,24,.48)');
  topShade.addColorStop(1, 'rgba(2,10,24,0)');
  ctx.fillStyle = topShade;
  ctx.fillRect(0, 0, WIDTH, 125);
  ctx.restore();
}

function drawNet(ctx, p, y = 669, home = false) {
  ctx.save();
  const left = home ? 38 : 17;
  const right = home ? 352 : 373;
  const sag = home ? 18 : 11;
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = p.mint;
  ctx.globalAlpha = home ? 0.5 : 0.58;
  for (let x = left; x <= right; x += 14) {
    const relative = (x - left) / (right - left);
    const dip = Math.sin(relative * Math.PI) * sag;
    line(ctx, x, y + dip, x + (195 - x) * 0.07, y + 29 + dip * 0.6, p.mint, 0.7);
  }
  for (let row = 0; row < 5; row++) {
    ctx.beginPath();
    ctx.moveTo(left + row * 2, y + row * 7);
    ctx.quadraticCurveTo(195, y + row * 7 + sag * 1.9, right - row * 2, y + row * 7);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.82;
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.quadraticCurveTo(195, y + sag * 1.9, right, y);
  ctx.lineWidth = 2;
  ctx.stroke();
  circle(ctx, left, y, 3, p.mintLight);
  circle(ctx, right, y, 3, p.mintLight);
  ctx.restore();
}

function drawPerson(
  ctx,
  x,
  y,
  p,
  { scale = 1, falling = false, time = 0, parachute = false, waiting = false } = {},
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const sway = falling ? Math.sin(time * 4 + x) * 0.09 : 0;
  if (parachute) {
    ctx.save();
    ctx.rotate(sway);
    line(ctx, -21, -30, -7, -7, '#bcf5ed', 1.1);
    line(ctx, 21, -30, 7, -7, '#bcf5ed', 1.1);
    line(ctx, 0, -36, 0, -8, '#bcf5ed', 0.7);
    ctx.beginPath();
    ctx.moveTo(-22, -29);
    ctx.bezierCurveTo(-21, -52, 21, -52, 22, -29);
    ctx.quadraticCurveTo(16, -34, 10, -29);
    ctx.quadraticCurveTo(0, -35, -10, -29);
    ctx.quadraticCurveTo(-16, -34, -22, -29);
    ctx.fillStyle = p.mint;
    ctx.fill();
    ctx.strokeStyle = p.mintLight;
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -45);
    ctx.quadraticCurveTo(-10, -39, -10, -29);
    ctx.moveTo(0, -45);
    ctx.quadraticCurveTo(10, -39, 10, -29);
    ctx.strokeStyle = '#148e97';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  ctx.rotate(sway * 0.45);

  // Boots and legs: the small silhouette stays readable through cage bars.
  line(ctx, -5, 10, falling ? -7 : -5, 17, '#081d31', 6);
  line(ctx, 5, 10, falling ? 8 : 5, 16, '#081d31', 6);
  line(ctx, -5, 11, falling ? -7 : -5, 16, '#476776', 3);
  line(ctx, 5, 11, falling ? 8 : 5, 15, '#476776', 3);
  rounded(ctx, falling ? -11 : -8, 15, 8, 5, 2);
  ctx.fillStyle = '#071626';
  ctx.fill();
  rounded(ctx, 3, 14, 9, 5, 2);
  ctx.fill();

  // Hands are raised under the canopy, or rest against the bars while captive.
  const armY = falling || waiting ? -6 : 3;
  line(ctx, -7, 1, -12, armY, '#082139', 7);
  line(ctx, 7, 1, 12, armY - (falling ? 1 : 0), '#082139', 7);
  line(ctx, -7, 1, -12, armY, p.jacket, 4);
  line(ctx, 7, 1, 12, armY - (falling ? 1 : 0), p.jacket, 4);
  circle(ctx, -12, armY, 3.8, '#082139');
  circle(ctx, 12, armY - (falling ? 1 : 0), 3.8, '#082139');
  circle(ctx, -12, armY, 2.8, '#fbc6a0');
  circle(ctx, 12, armY - (falling ? 1 : 0), 2.8, '#fbc6a0');
  rounded(ctx, -8, -3, 16, 16, 4);
  ctx.fillStyle = p.jacket;
  ctx.fill();
  ctx.strokeStyle = '#082139';
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.fillStyle = p.goldLight;
  ctx.fillRect(-5.5, 0, 2, 9);
  ctx.fillRect(3.5, 0, 2, 9);
  ctx.fillStyle = '#12344a';
  ctx.fillRect(-7, 8, 14, 3);
  rounded(ctx, -2.2, 7.7, 4.4, 3.5, 0.8);
  ctx.fillStyle = p.goldLight;
  ctx.fill();

  circle(ctx, -9, -9, 2.8, '#f2b38a');
  circle(ctx, 9, -9, 2.8, '#f2b38a');
  circle(ctx, 0, -10, 10.4, '#082139');
  circle(ctx, 0, -9.5, 9.2, '#ffd2a8');
  ctx.fillStyle = '#4b302c';
  ctx.beginPath();
  ctx.arc(0, -12, 9.3, Math.PI, Math.PI * 2);
  ctx.lineTo(8.3, -7);
  ctx.lineTo(6, -10);
  ctx.lineTo(5, -14);
  ctx.lineTo(-6, -14);
  ctx.lineTo(-6.5, -8);
  ctx.lineTo(-8.5, -7);
  ctx.closePath();
  ctx.fill();
  circle(ctx, -3.5, -9.5, 1.8, '#112334');
  circle(ctx, 3.5, -9.5, 1.8, '#112334');
  circle(ctx, -4, -10.1, 0.6, '#fffaf0');
  circle(ctx, 3, -10.1, 0.6, '#fffaf0');
  circle(ctx, -6, -6, 1.6, '#f1a281');
  circle(ctx, 6, -6, 1.6, '#f1a281');
  ctx.beginPath();
  ctx.arc(0, -5.6, 3, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = '#733c2d';
  ctx.fill();
  line(ctx, -1.8, -5.2, 1.8, -5.2, '#fff5dc', 1.3);

  // Hard hat, with a central reinforced strip and its reflective lamp.
  ctx.beginPath();
  ctx.moveTo(-11, -14);
  ctx.bezierCurveTo(-12, -28, 12, -28, 11, -14);
  ctx.closePath();
  ctx.fillStyle = p.helmet;
  ctx.fill();
  ctx.strokeStyle = '#573e23';
  ctx.lineWidth = 2;
  ctx.stroke();
  line(ctx, 0, -23.5, 0, -15.5, p.goldLight, 3.2);
  rounded(ctx, -13, -15.5, 26, 4.5, 2.2);
  ctx.fillStyle = p.gold;
  ctx.fill();
  ctx.strokeStyle = '#ad772b';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  circle(ctx, 0, -18, 2.7, '#fff1b4');
  circle(ctx, -0.4, -18.5, 1.1, '#ffffff');
  ctx.restore();
}

function drawRoleBadge(ctx, x, y, role, scale = 1) {
  if (!['engineer', 'medic'].includes(role)) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  circle(ctx, 0, 0, 9, role === 'medic' ? '#90efb3' : '#71caff');
  ctx.fillStyle = '#123449';
  if (role === 'medic') {
    ctx.fillRect(-2, -6, 4, 12);
    ctx.fillRect(-6, -2, 12, 4);
  } else {
    ctx.rotate(-0.55);
    ctx.fillRect(-2, -2, 4, 9);
    ctx.fillRect(-6, -6, 12, 5);
  }
  ctx.restore();
}

function drawBarrier(ctx, barrier) {
  const { x, y, w, h } = barrier;
  ctx.save();
  rounded(ctx, x, y, w, h, 3);
  ctx.fillStyle = '#718392';
  ctx.fill();
  ctx.strokeStyle = '#d1e0e9';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.clip();
  for (let offset = -h; offset < w; offset += 14)
    line(ctx, x + offset, y + 1, x + offset + h, y + h - 1, '#293a48', 5);
  circle(ctx, x + 5, y + h / 2, 2, '#f0f4ed');
  circle(ctx, x + w - 5, y + h / 2, 2, '#f0f4ed');
  ctx.restore();
}

function drawCage(
  ctx,
  cage,
  index,
  p,
  time = 0,
  { broken = false, empty = false, scale = 1 } = {},
) {
  const { x, y, w, h } = cage;
  ctx.save();
  const centerX = x + w / 2;
  line(ctx, centerX, y - 22 * scale, centerX, y - 5 * scale, '#031323', 4 * scale);
  for (let link = y - 22 * scale; link < y - 5 * scale; link += 6 * scale) {
    ctx.beginPath();
    ctx.ellipse(centerX, link + 2 * scale, 2 * scale, 3 * scale, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#608c9e';
    ctx.lineWidth = 1.3 * scale;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(centerX, y - 3 * scale, 3 * scale, 0, Math.PI * 2);
  ctx.strokeStyle = '#64b6c4';
  ctx.lineWidth = 1.5 * scale;
  ctx.stroke();
  rounded(ctx, x - 2 * scale, y + 4 * scale, w + 4 * scale, h, 6 * scale);
  ctx.fillStyle = '#03101e';
  ctx.fill();
  rounded(ctx, x, y, w, h, 5 * scale);
  ctx.fillStyle = 'rgba(3,19,35,.78)';
  ctx.fill();
  ctx.strokeStyle = '#041626';
  ctx.lineWidth = 6 * scale;
  ctx.stroke();
  ctx.fillStyle = 'rgba(46,141,155,.09)';
  ctx.fillRect(x + 4 * scale, y + 5 * scale, w - 8 * scale, h - 10 * scale);
  for (const ratio of [0.27, 0.73])
    line(ctx, x + w * ratio, y + 4 * scale, x + w * ratio, y + h - 3 * scale, '#254451', 1 * scale);
  if (!empty && !broken)
    drawPerson(ctx, centerX, y + h * 0.6, p, { scale: Math.min(w / 54, h / 60) * 1.05, time });

  const rail = ctx.createLinearGradient(x, y, x, y + h);
  rail.addColorStop(0, p.mintLight);
  rail.addColorStop(0.12, p.mint);
  rail.addColorStop(0.8, '#26859a');
  rail.addColorStop(1, '#65b4bc');
  ctx.strokeStyle = rail;
  ctx.lineWidth = 4.5 * scale;
  ctx.lineCap = 'round';
  if (broken) {
    ctx.beginPath();
    ctx.moveTo(x, y + h - 4);
    ctx.lineTo(x, y + 4);
    ctx.lineTo(x + w, y + 4);
    ctx.lineTo(x + w, y + h - 4);
    ctx.stroke();
    line(ctx, x + w * 0.2, y + 8, x + w * 0.13, y + h * 0.53, p.mint, 2.5 * scale);
    line(ctx, x + w * 0.8, y + 8, x + w * 0.87, y + h * 0.48, p.mint, 2.5 * scale);
    ctx.save();
    ctx.translate(x - 2, y + h * 0.31);
    ctx.rotate(-0.4);
    ctx.strokeStyle = '#58bdc1';
    ctx.lineWidth = 2.6 * scale;
    ctx.strokeRect(-w * 0.28, 0, w * 0.3, h * 0.63);
    line(ctx, -w * 0.14, 0, -w * 0.14, h * 0.63, '#58bdc1', 2 * scale);
    ctx.restore();
  } else {
    rounded(ctx, x + 1, y + 2, w - 2, h - 3, 3 * scale);
    ctx.stroke();
    for (const ratio of [0.19, 0.81])
      line(
        ctx,
        x + w * ratio,
        y + 5 * scale,
        x + w * ratio,
        y + h - 3 * scale,
        '#74c4c6',
        2 * scale,
      );
    line(
      ctx,
      x + 3 * scale,
      y + 3 * scale,
      x + w - 3 * scale,
      y + 3 * scale,
      p.mintLight,
      2 * scale,
    );
    line(
      ctx,
      x + 3 * scale,
      y + h - 5 * scale,
      x + w - 3 * scale,
      y + h - 5 * scale,
      '#79ced0',
      3 * scale,
    );
    for (const bx of [x + 3 * scale, x + w - 3 * scale])
      for (const by of [y + 5 * scale, y + h - 5 * scale]) {
        circle(ctx, bx, by, 2.2 * scale, '#092d3c');
        circle(ctx, bx - 0.3 * scale, by - 0.5 * scale, 1.1 * scale, p.mintLight);
      }
    // Double locks use two lit segments; damage extinguishes one of them.
    const max = cage.maxHp || cage.hp || 1;
    const hp = cage.hp ?? 1;
    const segmentW = max === 2 ? 8 : 14;
    for (let i = 0; i < max; i++) {
      const sx = centerX - (max * (segmentW + 3) - 3) / 2 + i * (segmentW + 3);
      rounded(ctx, sx, y - 3 * scale, segmentW, 7 * scale, 1.8 * scale);
      ctx.fillStyle = i < hp ? (max === 2 ? p.gold : p.mintLight) : '#173344';
      ctx.fill();
      ctx.strokeStyle = i < hp ? '#8c6525' : '#0a2234';
      ctx.lineWidth = 1 * scale;
      ctx.stroke();
      if (i < hp) circle(ctx, sx + segmentW / 2, y + 1 * scale, 0.9 * scale, '#604b29');
    }
    if (max > hp) {
      ctx.beginPath();
      ctx.moveTo(x + w - 8, y + 7);
      ctx.lineTo(x + w - 13, y + 13);
      ctx.lineTo(x + w - 9, y + 18);
      ctx.lineTo(x + w - 15, y + 23);
      ctx.strokeStyle = '#c3faf0';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  if (!broken && index !== undefined) {
    rounded(ctx, centerX - 10, y + h, 20, 13, 4);
    ctx.fillStyle = '#09263c';
    ctx.fill();
    ctx.strokeStyle = '#538599';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#d4f3ef';
    ctx.font = '900 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1).padStart(2, '0'), centerX, y + h + 6.5);
  }
  ctx.restore();
  drawRoleBadge(ctx, x + w - 2, y + 5, cage.role, scale * 0.9);
}

function drawBrick(ctx, brick, p, accent = false) {
  if (brick.hp <= 0) return;
  const { x, y, w, h } = brick;
  ctx.save();
  rounded(ctx, x - 1, y + 3, w + 2, h + 1, 5);
  ctx.fillStyle = '#031727';
  ctx.fill();
  ctx.strokeStyle = '#031222';
  ctx.lineWidth = 3;
  ctx.stroke();
  const fill = ctx.createLinearGradient(x, y, x, y + h);
  fill.addColorStop(0, accent ? '#fbc361' : '#58e2d3');
  fill.addColorStop(1, accent ? '#da762b' : '#129ea9');
  rounded(ctx, x, y, w, h, 4);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = accent ? '#ffd58e' : '#8df6e6';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  line(ctx, x + 5, y + 3, x + w - 5, y + 3, accent ? '#ffe8b2' : '#b4ffef', 1);
  line(ctx, x + 4, y + h - 3, x + w - 4, y + h - 3, 'rgba(0,33,48,.25)', 1);
  for (const bx of [x + 4, x + w - 4]) {
    circle(ctx, bx, y + h / 2, 1.8, '#0a5b70');
    circle(ctx, bx - 0.3, y + h / 2 - 0.4, 0.7, p.mintLight);
  }
  ctx.restore();
}

function drawPaddle(ctx, paddle, p, time = 0, active = false) {
  const { x, y, w, h = 15 } = paddle;
  ctx.save();
  glow(ctx, x, y + h / 2, w * 0.72, p.gold, active ? 0.2 : 0.12);
  rounded(ctx, x - w / 2 - 3, y + 3, w + 6, h + 3, 7);
  ctx.fillStyle = '#041a2d';
  ctx.fill();
  ctx.strokeStyle = '#082032';
  ctx.lineWidth = 3;
  ctx.stroke();
  const fill = ctx.createLinearGradient(0, y, 0, y + h);
  fill.addColorStop(0, p.goldLight);
  fill.addColorStop(0.22, p.gold);
  fill.addColorStop(1, p.darkGold);
  rounded(ctx, x - w / 2, y, w, h, 6);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = p.gold;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.save();
  rounded(ctx, x - w / 2 + 8, y + 5, w - 16, h - 7, 2);
  ctx.clip();
  ctx.fillStyle = '#50291f';
  for (let stripeX = x - w / 2; stripeX < x + w / 2; stripeX += 20) {
    ctx.beginPath();
    ctx.moveTo(stripeX + 8, y + 4);
    ctx.lineTo(stripeX + 19, y + 4);
    ctx.lineTo(stripeX + 10, y + h);
    ctx.lineTo(stripeX - 1, y + h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  line(ctx, x - w / 2 + 10, y + 2.3, x + w / 2 - 10, y + 2.3, '#fff9ce', 1.2);
  for (const side of [-1, 1]) {
    const capX = x + side * (w / 2 - 5);
    rounded(ctx, capX - 3, y + 3, 6, h - 4, 2);
    ctx.fillStyle = '#183f55';
    ctx.fill();
    circle(ctx, capX, y + h / 2 + 0.5, 1.1, '#73adb7');
  }
  for (const offset of [-9, 0, 9])
    line(ctx, x + offset, y + h - 4, x + offset, y + h - 2, 'rgba(255,244,197,.6)', 1);
  if (active) {
    ctx.globalAlpha = 0.3 + Math.sin(time * 4) * 0.1;
    line(ctx, x - w / 2 + 5, y - 4, x + w / 2 - 5, y - 4, p.goldLight, 1);
  }
  ctx.restore();
}

function drawBall(ctx, ball, p, trails = [], reducedMotion = false) {
  if (!ball || !Number.isFinite(ball.x) || !Number.isFinite(ball.y)) return;
  const r = ball.r || 7;
  ctx.save();
  if (!reducedMotion) {
    const samples = trails.slice(-15);
    for (let i = 0; i < samples.length; i++) {
      const point = samples[i];
      const age = (i + 1) / samples.length;
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      ctx.globalAlpha = age * 0.35;
      circle(ctx, point.x, point.y, r * age * 0.65, p.gold);
    }
  }
  ctx.globalAlpha = 1;
  glow(ctx, ball.x, ball.y, r * 4.5, '#ffcc65', 0.34);
  circle(ctx, ball.x, ball.y, r + 2.8, '#071728');
  circle(ctx, ball.x, ball.y, r + 1.6, '#ffbb44');
  circle(ctx, ball.x, ball.y, r, '#fff5c9');
  circle(ctx, ball.x - r * 0.18, ball.y - r * 0.24, r * 0.67, '#ffffff');
  ctx.restore();
}

function drawParticles(ctx, particles, p) {
  ctx.save();
  for (const particle of particles) {
    if (!Number.isFinite(particle.x) || !Number.isFinite(particle.y)) continue;
    const life = particle.life ?? 1;
    const maxLife = particle.maxLife ?? particle.duration ?? 1;
    const opacity = particle.alpha ?? clamp(life / maxLife, 0, 1);
    if (opacity <= 0) continue;
    ctx.globalAlpha = opacity;
    const color = particle.color || p.mint;
    const size = particle.size || particle.r || 3;
    if (particle.type === 'label') {
      ctx.font = '900 19px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#041321';
      ctx.strokeText(particle.label, particle.x, particle.y);
      ctx.fillStyle = color;
      ctx.fillText(particle.label, particle.x, particle.y);
    } else if (particle.type === 'star') {
      star(ctx, particle.x, particle.y, size, color);
    } else if (particle.type === 'ring') {
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (particle.type === 'spark' || particle.kind === 'spark') {
      line(
        ctx,
        particle.x,
        particle.y,
        particle.x - (particle.vx || 0) * 0.028,
        particle.y - (particle.vy || 0) * 0.028,
        color,
        size * 0.5,
      );
    } else {
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation ?? particle.angle ?? 0);
      rounded(ctx, -size / 2, -size / 2, size, size, 0.7);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

/** Paint the live field only. DOM owns HUD, menus, tutorial copy and results. */
export function drawGame(
  ctx,
  game,
  { time = 0, theme = 'rescue', reducedMotion = false, particles = [], trails = [] } = {},
) {
  const p = palette(theme);
  ctx.save();
  drawField(ctx, p, theme, game);
  if (!game) {
    ctx.restore();
    return;
  }
  const paddle = game.paddle || { x: 195, y: 623, w: 108, h: 15 };
  const people = game.people || [];
  for (const person of people) {
    if (person.status !== 'waiting' && person.status !== 'falling') continue;
    const waiting = person.status === 'waiting';
    if (!waiting && person.y > 400 && person.y < paddle.y - 40) {
      ctx.save();
      ctx.globalAlpha = 0.2;
      const landingX = getPersonLandingX(game, person);
      line(ctx, landingX - 11, paddle.y - 12, landingX, paddle.y - 7, p.mintLight, 1.3);
      line(ctx, landingX, paddle.y - 7, landingX + 11, paddle.y - 12, p.mintLight, 1.3);
      ctx.restore();
    }
    drawPerson(ctx, person.x, person.y, p, {
      scale: 1.02,
      falling: !waiting,
      waiting,
      parachute: true,
      time: reducedMotion ? 0 : time,
    });
    drawRoleBadge(ctx, person.x + 12, person.y - 5, person.role, 0.8);
  }
  if (game.level.wind) {
    const direction =
      Math.cos((game.time * Math.PI * 2) / game.level.wind.period + game.level.wind.phase) >= 0
        ? 1
        : -1;
    ctx.save();
    ctx.globalAlpha = 0.38;
    for (let i = 0; i < 3; i++) {
      const x = 70 + i * 88,
        y = 468 + i * 11;
      line(ctx, x, y, x + direction * 30, y, '#9ed5eb', 1.5);
      line(ctx, x + direction * 30, y, x + direction * 23, y - 4, '#9ed5eb', 1.5);
    }
    ctx.restore();
  }
  if (game.phase === 'ready') {
    const angle = game.level?.initialAngle || -0.38;
    ctx.save();
    for (let i = 1; i <= 7; i++) {
      ctx.globalAlpha = 0.3 * (1 - i / 9);
      circle(
        ctx,
        paddle.x + Math.sin(angle) * i * 14,
        paddle.y - 9 - Math.cos(angle) * i * 14,
        1.5,
        '#edddae',
      );
    }
    ctx.restore();
  }
  if (game.slowMotion) {
    ctx.save();
    ctx.strokeStyle = p.mint;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.22;
    rounded(ctx, 18, 73, 354, 571, 5);
    ctx.stroke();
    ctx.restore();
  }
  drawPaddle(ctx, paddle, p, reducedMotion ? 0 : time, game.phase === 'ready');
  if (game.ball && (game.ball.active || game.phase === 'ready' || game.phase === 'paused'))
    drawBall(ctx, game.ball, p, trails, reducedMotion);
  drawParticles(ctx, particles, p);
  ctx.restore();
}

/** A complete native portrait illustration with space for title and actions. */
export function drawHome(ctx, { time = 0, theme = 'rescue', reducedMotion = false } = {}) {
  const p = palette(theme);
  const clock = reducedMotion ? 0 : time;
  ctx.save();
  drawField(ctx, p, theme, null, true);
  // A pale construction spotlight leads the eye from the broken cage to the catcher.
  ctx.save();
  ctx.globalAlpha = 0.045;
  ctx.fillStyle = p.mintLight;
  ctx.beginPath();
  ctx.moveTo(347, 321);
  ctx.lineTo(202, 451);
  ctx.lineTo(60, 435);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  glow(ctx, 183, 420, 118, p.glow, 0.45);
  drawCage(ctx, { x: 67, y: 307, w: 64, h: 63, hp: 0 }, undefined, p, clock, {
    broken: true,
    empty: true,
    scale: 1.1,
  });

  // Scattered fragments are individually composed, never images of text or UI.
  ctx.save();
  ctx.translate(276, 334);
  ctx.rotate(-0.19);
  drawBrick(ctx, { x: -21, y: -9, w: 42, h: 18, hp: 1 }, p, true);
  ctx.restore();
  ctx.save();
  ctx.translate(217, 363);
  ctx.rotate(0.14);
  drawBrick(ctx, { x: -19, y: -8, w: 38, h: 16, hp: 1 }, p);
  ctx.restore();
  ctx.save();
  ctx.translate(318, 378);
  ctx.rotate(-0.28);
  drawBrick(ctx, { x: -14, y: -7, w: 28, h: 14, hp: 1 }, p);
  ctx.restore();
  for (let i = 0; i < 7; i++) {
    const x = 86 + seed(i + 731) * 98;
    const y = 364 + seed(i + 719) * 65;
    ctx.save();
    ctx.translate(x, y + Math.sin(clock + i) * 2);
    ctx.rotate(i * 0.77);
    rounded(ctx, -2, -3, 4 + (i % 3), 6, 1);
    ctx.fillStyle = i % 2 ? '#337d93' : p.mint;
    ctx.fill();
    ctx.restore();
  }
  const personY = 409 + Math.sin(clock * 1.3) * 2;
  drawPerson(ctx, 144, personY, p, { scale: 1.55, falling: true, parachute: true, time: clock });
  // The descending ball on the opposite side makes the central decision visible.
  const ball = { x: 275, y: 422 + Math.sin(clock * 1.5) * 4, r: 8 };
  const trail = Array.from({ length: 10 }, (_, i) => ({
    x: ball.x + (10 - i) * 3.6,
    y: ball.y - (10 - i) * 6.1,
  }));
  drawBall(ctx, ball, p, trail, reducedMotion);
  glow(ctx, 195, 444, 116, p.gold, 0.17);
  // Keep its full underside above the progress line (which starts at y ≈ 468).
  drawPaddle(ctx, { x: 195, y: 443, w: 184, h: 18 }, p, clock, true);
  star(ctx, 270, 441, 12, p.goldLight);
  const footer = ctx.createLinearGradient(0, 472, 0, 680);
  footer.addColorStop(0, 'rgba(3,13,29,0)');
  footer.addColorStop(0.44, 'rgba(3,13,29,.72)');
  footer.addColorStop(1, 'rgba(3,13,29,.15)');
  ctx.fillStyle = footer;
  ctx.fillRect(0, 472, WIDTH, 228);
  ctx.restore();
}

/** Mission formation miniature, using the same artwork as the live field. */
export function drawLevel(ctx, level, { locked = false, theme = 'rescue' } = {}) {
  const p = palette(theme);
  ctx.save();
  ctx.clearRect(0, 0, 160, 72);
  const backdrop = ctx.createLinearGradient(0, 0, 160, 72);
  backdrop.addColorStop(0, p.horizon);
  backdrop.addColorStop(1, p.sky);
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, 160, 72);
  ctx.globalAlpha = locked ? 0.4 : 1;
  drawTower(ctx, 3, 7, 0, 72, p);
  drawTower(ctx, 149, 7, 0, 72, p);
  ctx.save();
  ctx.translate(8, -14);
  ctx.scale(0.369, 0.21);
  for (const cage of level?.cages || []) drawCage(ctx, cage, undefined, p);
  for (const brick of level?.bricks || []) drawBrick(ctx, brick, p);
  ctx.restore();
  ctx.globalAlpha = 1;
  if (locked) {
    ctx.fillStyle = 'rgba(3,13,29,.34)';
    ctx.fillRect(0, 0, 160, 72);
    ctx.strokeStyle = '#7a94a7';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(80, 31, 7, Math.PI, Math.PI * 2);
    ctx.stroke();
    rounded(ctx, 68, 31, 24, 21, 5);
    ctx.fillStyle = '#a0b4c0';
    ctx.fill();
    circle(ctx, 80, 39, 2.2, '#223b50');
    line(ctx, 80, 39, 80, 44, '#223b50', 2.2);
  }
  ctx.restore();
}
