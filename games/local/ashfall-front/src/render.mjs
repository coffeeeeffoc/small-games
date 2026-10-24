const WORLD_HEIGHT = 720;
const GROUND = 570;
const TILE_WIDTH = 1800;
const visuals = new WeakMap();
const sceneCache = new Map();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const mod = (n, d) => ((n % d) + d) % d;

function rng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function polygon(ctx, points, fill, stroke, width = 1) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
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

function line(ctx, x1, y1, x2, y2, color, width = 1) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function ellipse(ctx, x, y, rx, ry, color) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function glow(ctx, x, y, radius, color, alpha = 0.3) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const fill = ctx.createRadialGradient(x, y, 0, x, y, radius);
  fill.addColorStop(0, color);
  fill.addColorStop(1, `${color}00`);
  ctx.fillStyle = fill;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
}

function metal(ctx, x, y, w, h, light = '#566453', dark = '#1b2723') {
  const fill = ctx.createLinearGradient(x, y, x + w, y);
  fill.addColorStop(0, dark);
  fill.addColorStop(0.22, light);
  fill.addColorStop(0.5, '#39483b');
  fill.addColorStop(1, dark);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  line(ctx, x + 1, y, x + 1, y + h, '#8d96743d');
}

function rivets(ctx, x, y, w, h, step = 70) {
  ctx.fillStyle = '#abb08a45';
  for (let dx = 8; dx < w - 3; dx += step) {
    ctx.fillRect(x + dx, y + 5, 2, 2);
    ctx.fillRect(x + dx, y + h - 6, 2, 2);
  }
}

function hazard(ctx, x, y, w, h, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#202822';
  ctx.fillRect(x, y, w, h);
  for (let dx = -h; dx < w + h; dx += 30) {
    polygon(
      ctx,
      [
        [x + dx, y],
        [x + dx + 13, y],
        [x + dx + 13 - h, y + h],
        [x + dx - h, y + h],
      ],
      '#b79a59',
    );
  }
  ctx.restore();
}

function chimney(ctx, x, top, w, bottom, color) {
  polygon(
    ctx,
    [
      [x + 5, top],
      [x + w - 5, top],
      [x + w + 8, bottom],
      [x - 8, bottom],
    ],
    color,
  );
  ctx.fillStyle = '#89937820';
  ctx.fillRect(x + 7, top + 4, 3, bottom - top - 8);
  for (let y = top + 16; y < bottom; y += 62) {
    ctx.fillStyle = '#151f1d60';
    ctx.fillRect(x - 3, y, w + 6, 7);
    line(ctx, x - 3, y, x + w + 3, y, '#6e7b6638');
  }
  ctx.fillStyle = '#394a3d';
  ctx.fillRect(x - 4, top - 4, w + 8, 9);
  ellipse(ctx, x + w / 2, top - 5, 3, 2, '#b98159');
}

function paintFar(ctx) {
  const random = rng(42193);
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#182827');
  sky.addColorStop(0.36, '#3d5044');
  sky.addColorStop(0.75, '#7c8264');
  sky.addColorStop(1, '#999378');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, TILE_WIDTH, WORLD_HEIGHT);
  glow(ctx, 1250, 222, 510, '#c2b384', 0.25);
  for (let i = 0; i < 13; i++) {
    ctx.save();
    ctx.translate(i * 167 - 140, 35 + random() * 155);
    ctx.scale(2.9, 0.45);
    glow(ctx, 0, 0, 96, '#bdc0a3', 0.08);
    ctx.restore();
  }
  for (let i = 0; i < 25; i++) {
    const x = i * 84 - 40,
      w = 60 + random() * 95,
      top = 240 + random() * 130;
    ctx.fillStyle = '#2a3c3370';
    ctx.fillRect(x, top, w, 410 - top);
    polygon(
      ctx,
      [
        [x, top],
        [x + w * 0.5, top - 21],
        [x + w, top],
      ],
      '#2a3c3370',
    );
    for (let wx = x + 10; wx < x + w - 6; wx += 15) {
      for (let wy = top + 17; wy < 380; wy += 25) {
        if (random() > 0.55) {
          ctx.fillStyle = random() > 0.88 ? '#d6ad6e3b' : '#a8ad8826';
          ctx.fillRect(wx, wy, 4, 8);
        }
      }
    }
  }
  chimney(ctx, 239, 72, 36, 403, '#2d4035');
  chimney(ctx, 316, 118, 29, 410, '#334639');
  chimney(ctx, 975, 32, 44, 418, '#334639');
  chimney(ctx, 1095, 95, 36, 415, '#354939');
  chimney(ctx, 1660, 147, 35, 430, '#2c4033');
  // A distant gantry breaks up the skyline without competing with the play space.
  line(ctx, 480, 169, 815, 169, '#314637', 10);
  line(ctx, 537, 164, 537, 409, '#314637', 11);
  line(ctx, 727, 164, 727, 409, '#314637', 11);
  for (let x = 485; x < 807; x += 40) {
    line(ctx, x, 165, x + 20, 141, '#314637', 3);
    line(ctx, x + 20, 141, x + 40, 165, '#314637', 3);
  }
  line(ctx, 479, 140, 820, 140, '#314637', 4);
  line(ctx, 635, 172, 635, 274, '#2a3c32', 2);
  polygon(
    ctx,
    [
      [629, 269],
      [629, 282],
      [640, 285],
      [646, 277],
    ],
    null,
    '#293b31',
    4,
  );
  const haze = ctx.createLinearGradient(0, 240, 0, 470);
  haze.addColorStop(0, '#92977a00');
  haze.addColorStop(1, '#9fa3827a');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 240, TILE_WIDTH, 260);
}

function factoryWindows(ctx, x, y, cols, rows, warm = false) {
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const wx = x + col * 39,
        wy = y + row * 26;
      ctx.fillStyle = warm ? '#ad885036' : '#9da38720';
      ctx.fillRect(wx, wy, 30, 17);
      ctx.fillStyle = '#1c2c234d';
      ctx.fillRect(wx + 14, wy, 2, 17);
      line(ctx, wx, wy + 17, wx + 30, wy + 17, '#b1b4962b');
    }
  }
}

function paintMid(ctx, theme) {
  const random = rng(9014);
  // Low saw-tooth workshops keep an open, atmospheric upper half of the frame.
  ctx.fillStyle = '#29392f';
  ctx.fillRect(0, 359, 638, 218);
  for (let x = -40; x < 640; x += 146) {
    polygon(
      ctx,
      [
        [x, 360],
        [x + 118, 309],
        [x + 118, 360],
      ],
      '#364638',
      '#5f6b523b',
    );
    polygon(
      ctx,
      [
        [x + 18, 353],
        [x + 110, 320],
        [x + 110, 344],
      ],
      '#89927c25',
    );
  }
  factoryWindows(ctx, 20, 383, 15, 3, theme === 1);
  for (let x = 0; x < 641; x += 147) {
    metal(ctx, x, 361, 12, 207, '#56624c');
    line(ctx, x + 15, 496, x + 132, 496, '#17271f', 8);
  }
  // Main hall: riveted sheet metal, a rolling door, large fan and exposed pipes.
  const wall = ctx.createLinearGradient(0, 231, 0, 568);
  wall.addColorStop(0, '#40513f');
  wall.addColorStop(0.6, '#2a3a2e');
  wall.addColorStop(1, '#203027');
  ctx.fillStyle = wall;
  ctx.fillRect(708, 229, 795, 339);
  polygon(
    ctx,
    [
      [687, 233],
      [890, 196],
      [1480, 196],
      [1535, 233],
    ],
    '#26372e',
    '#79816550',
    2,
  );
  line(ctx, 706, 233, 1505, 233, '#9ba08165', 3);
  factoryWindows(ctx, 762, 265, 17, 2, theme === 1);
  for (let x = 710; x < 1510; x += 156) {
    metal(ctx, x, 235, 16, 333, '#61704f');
    rivets(ctx, x + 20, 332, 132, 225, 58);
  }
  ctx.fillStyle = '#17281f';
  ctx.fillRect(975, 361, 219, 204);
  for (let y = 366; y < 563; y += 12) {
    line(ctx, 980, y, 1189, y, '#68705a40', 3);
    line(ctx, 980, y + 4, 1189, y + 4, '#0d1c1590');
  }
  ctx.font = '800 80px sans-serif';
  ctx.fillStyle = '#b1b69924';
  ctx.fillText(theme === 2 ? 'CORE' : 'A–07', 758, 438);
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#b6b99570';
  ctx.fillText('AUTHORIZED PERSONNEL ONLY', 767, 457);
  hazard(ctx, 980, 351, 210, 8, 0.7);
  ellipse(ctx, 1321, 437, 71, 71, '#16281f');
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#677355';
  ctx.stroke();
  ellipse(ctx, 1321, 437, 56, 56, '#314330');
  for (let n = 0; n < 9; n++) {
    const a = (n / 9) * Math.PI * 2;
    polygon(
      ctx,
      [
        [1321 + Math.cos(a) * 12, 437 + Math.sin(a) * 12],
        [1321 + Math.cos(a + 0.15) * 51, 437 + Math.sin(a + 0.15) * 51],
        [1321 + Math.cos(a + 0.6) * 47, 437 + Math.sin(a + 0.6) * 47],
      ],
      '#172a20',
    );
  }
  ellipse(ctx, 1321, 437, 13, 13, '#778065');
  for (let x = 1280; x < 1380; x += 15) line(ctx, x, 383, x, 491, '#66745238', 2);
  // A rusting cylindrical storage tank with ribs and service ladders.
  const tank = ctx.createLinearGradient(1490, 0, 1710, 0);
  tank.addColorStop(0, '#2c3b2c');
  tank.addColorStop(0.4, '#667053');
  tank.addColorStop(1, '#273c2c');
  ctx.fillStyle = tank;
  ctx.fillRect(1515, 333, 200, 234);
  ellipse(ctx, 1615, 333, 100, 30, '#59664a');
  ellipse(ctx, 1615, 334, 93, 25, '#43573c');
  for (let y = 357; y < 565; y += 47) {
    line(ctx, 1515, y, 1715, y, '#16271dc0', 7);
    line(ctx, 1515, y - 4, 1715, y - 4, '#8590705c');
  }
  line(ctx, 1580, 310, 1580, 569, '#12231d', 4);
  line(ctx, 1605, 310, 1605, 569, '#12231d', 4);
  for (let y = 318; y < 568; y += 16) line(ctx, 1580, y, 1605, y, '#89927265', 3);
  // Pipe highlights remain in the static layer, so no blur/filter is needed per frame.
  ctx.beginPath();
  ctx.moveTo(1422, -12);
  ctx.lineTo(1422, 295);
  ctx.quadraticCurveTo(1422, 327, 1450, 327);
  ctx.lineTo(1472, 327);
  ctx.quadraticCurveTo(1495, 327, 1495, 349);
  ctx.lineTo(1495, 566);
  ctx.strokeStyle = '#172b20';
  ctx.lineWidth = 34;
  ctx.stroke();
  ctx.strokeStyle = '#667354';
  ctx.lineWidth = 23;
  ctx.stroke();
  ctx.strokeStyle = '#9a9d7450';
  ctx.lineWidth = 5;
  ctx.stroke();
  for (const [x, y] of [
    [1422, 120],
    [1422, 268],
    [1495, 410],
    [1495, 535],
  ]) {
    ctx.fillStyle = '#263b2a';
    ctx.fillRect(x - 20, y, 40, 9);
    line(ctx, x - 20, y, x + 20, y, '#a4a57d80');
  }
  ctx.beginPath();
  ctx.moveTo(102, 484);
  ctx.lineTo(404, 484);
  ctx.quadraticCurveTo(431, 484, 431, 509);
  ctx.lineTo(431, 570);
  ctx.strokeStyle = '#12261c';
  ctx.lineWidth = 25;
  ctx.stroke();
  ctx.strokeStyle = '#596b4c';
  ctx.lineWidth = 17;
  ctx.stroke();
  line(ctx, 105, 479, 402, 479, '#a0a58070', 3);
  // Catwalk and railings add a scale cue behind the playable platforms.
  line(ctx, 0, 516, TILE_WIDTH, 516, '#12251c', 7);
  line(ctx, 0, 482, TILE_WIDTH, 482, '#6e7e5860', 3);
  for (let x = 13; x < TILE_WIDTH; x += 77) line(ctx, x, 482, x, 563, '#334930', 4);
  // Hanging lamps: baked light cones have soft gradients instead of opaque ellipses.
  for (const x of [356, 946, 1740]) {
    line(ctx, x, 0, x, 214, '#12241e', 3);
    polygon(
      ctx,
      [
        [x - 17, 213],
        [x + 17, 213],
        [x + 28, 225],
        [x - 28, 225],
      ],
      '#17281e',
    );
    ctx.fillStyle = '#e6bd78';
    ctx.fillRect(x - 25, 224, 50, 4);
    const cone = ctx.createLinearGradient(0, 228, 0, 569);
    cone.addColorStop(0, '#dfc48123');
    cone.addColorStop(1, '#d0c68c00');
    polygon(
      ctx,
      [
        [x - 21, 230],
        [x + 21, 230],
        [x + 138, 569],
        [x - 138, 569],
      ],
      cone,
    );
    glow(ctx, x, 239, 116, '#eab778', 0.12);
  }
  for (let i = 0; i < 330; i++) {
    const x = random() * TILE_WIDTH,
      y = 333 + random() * 230;
    ctx.fillStyle = random() > 0.6 ? '#d0c09516' : '#08171035';
    ctx.fillRect(x, y, 1 + random() * 7, 1 + random() * 2);
  }
  if (theme === 1) {
    glow(ctx, 620, 480, 270, '#f0a45c', 0.18);
    glow(ctx, 1120, 500, 260, '#fca757', 0.14);
  }
}

function paintFloor(ctx) {
  const random = rng(754);
  const floor = ctx.createLinearGradient(0, 568, 0, 720);
  floor.addColorStop(0, '#273c2e');
  floor.addColorStop(0.3, '#182b22');
  floor.addColorStop(1, '#091a16');
  ctx.fillStyle = floor;
  ctx.fillRect(0, GROUND, TILE_WIDTH, 150);
  ctx.fillStyle = '#a0a687';
  ctx.fillRect(0, GROUND, TILE_WIDTH, 3);
  ctx.fillStyle = '#576c4c';
  ctx.fillRect(0, GROUND + 3, TILE_WIDTH, 8);
  ctx.fillStyle = '#14281e';
  ctx.fillRect(0, GROUND + 11, TILE_WIDTH, 9);
  hazard(ctx, 0, GROUND + 20, TILE_WIDTH, 7, 0.65);
  for (let x = 0; x < TILE_WIDTH; x += 158) {
    polygon(
      ctx,
      [
        [x + 9, 602],
        [x + 77, 680],
        [x + 146, 602],
      ],
      null,
      '#324b34',
      11,
    );
    line(ctx, x + 17, 605, x + 77, 674, '#68805b33', 2);
    line(ctx, x + 154, 600, x + 154, 720, '#0a1b16', 7);
    ctx.fillStyle = '#77916a44';
    ctx.fillRect(x + 9, 599, 4, 4);
    ctx.fillRect(x + 144, 599, 4, 4);
  }
  line(ctx, 0, 692, TILE_WIDTH, 692, '#344d37', 9);
  line(ctx, 0, 687, TILE_WIDTH, 687, '#5f765046', 2);
  for (let i = 0; i < 260; i++) {
    const x = random() * TILE_WIDTH,
      y = 576 + random() * 70;
    ctx.fillStyle = '#aec09518';
    ctx.fillRect(x, y, random() * 10 + 1, 1);
  }
}

function makeLayer(ctx, painter) {
  let canvas;
  if (ctx.canvas.ownerDocument) canvas = ctx.canvas.ownerDocument.createElement('canvas');
  else if (typeof OffscreenCanvas !== 'undefined')
    canvas = new OffscreenCanvas(TILE_WIDTH, WORLD_HEIGHT);
  else canvas = new ctx.canvas.constructor(TILE_WIDTH, WORLD_HEIGHT);
  canvas.width = TILE_WIDTH;
  canvas.height = WORLD_HEIGHT;
  const layer = canvas.getContext('2d');
  painter(layer);
  return canvas;
}

function assets(ctx, theme) {
  if (!sceneCache.has('far')) sceneCache.set('far', makeLayer(ctx, paintFar));
  if (!sceneCache.has('floor')) sceneCache.set('floor', makeLayer(ctx, paintFloor));
  const key = `mid-${theme}`;
  if (!sceneCache.has(key))
    sceneCache.set(
      key,
      makeLayer(ctx, (layer) => paintMid(layer, theme)),
    );
  return { far: sceneCache.get('far'), mid: sceneCache.get(key), floor: sceneCache.get('floor') };
}

function tile(ctx, canvas, offset, width) {
  const start = -mod(offset, TILE_WIDTH);
  for (let x = start; x < width; x += TILE_WIDTH) ctx.drawImage(canvas, x, 0);
}

function ambient(ctx, width, cameraX, time, foreground, reducedMotion) {
  const t = reducedMotion ? time * 0.2 : time;
  ctx.save();
  if (!foreground) {
    // Narrow, low-opacity mist bands move between the far and middle planes.
    for (let i = 0; i < 3; i++) {
      const x = mod(i * 637 + t * (7 + i * 3) - cameraX * 0.2, width + 900) - 450;
      ctx.save();
      ctx.translate(x, 340 + i * 82);
      ctx.scale(4.7, 0.24);
      glow(ctx, 0, 0, 135, '#c8cdb0', 0.08);
      ctx.restore();
    }
  } else {
    ctx.strokeStyle = '#b7c9b520';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const count = reducedMotion ? 14 : 48;
    for (let i = 0; i < count; i++) {
      const x = mod(i * 131.9 - t * 25 - cameraX * 0.32, width + 70) - 30;
      const y = mod(i * 89.7 + t * (285 + (i % 5) * 23), 645) - 35;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 5, y + 16 + (i % 5));
    }
    ctx.stroke();
    for (let i = 0; i < 20; i++) {
      const x = mod(i * 163 + Math.sin(t * 0.9 + i) * 22 - cameraX * 0.8, width + 60) - 30;
      const y = 576 - mod(i * 79 + t * (13 + (i % 3) * 7), 360);
      const opacity = (0.2 + Math.sin(i * 3 + t * 2) * 0.12) * (1 - (576 - y) / 520);
      ctx.fillStyle = `rgba(244,173,93,${opacity})`;
      ctx.fillRect(x, y, i % 3 === 0 ? 3 : 1.6, 2);
    }
  }
  ctx.restore();
}

function drawPlatform(ctx, p) {
  const h = p.h || 22;
  const fill = ctx.createLinearGradient(0, p.y, 0, p.y + h);
  fill.addColorStop(0, '#819074');
  fill.addColorStop(0.17, '#354b35');
  fill.addColorStop(1, '#172c20');
  ctx.fillStyle = fill;
  ctx.fillRect(p.x, p.y, p.w, h);
  line(ctx, p.x, p.y, p.x + p.w, p.y, '#c2c4a0', 2);
  hazard(ctx, p.x + 4, p.y + 7, p.w - 8, 6, 0.9);
  const supportHeight = Math.min(86, GROUND - p.y - h);
  for (let x = p.x + 8; x < p.x + p.w - 15; x += 91) {
    const right = Math.min(x + 81, p.x + p.w - 6);
    polygon(
      ctx,
      [
        [x, p.y + h],
        [right, p.y + h],
        [x + 24, p.y + h + supportHeight],
      ],
      null,
      '#29422d',
      7,
    );
    line(ctx, x, p.y + h, x + 24, p.y + h + supportHeight, '#5d775347', 2);
  }
  rivets(ctx, p.x, p.y, p.w, h, 65);
}

function drawBarrel(ctx, b) {
  const w = b.w || 32,
    h = b.h || 46;
  ctx.save();
  ctx.translate(b.x, b.y);
  if (!b.active) {
    ellipse(ctx, 0, -2, w * 0.72, 4, '#0b1b14a0');
    polygon(
      ctx,
      [
        [-w / 2, -2],
        [-w / 2 - 2, -11],
        [-7, -7],
        [-2, -15],
        [4, -7],
        [w / 2, -12],
        [w / 2, -2],
      ],
      '#253327',
      '#6a695039',
    );
    ctx.restore();
    return;
  }
  ellipse(ctx, 1, 1, w * 0.75, 4, '#0a1814b3');
  const fill = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  fill.addColorStop(0, '#68492f');
  fill.addColorStop(0.24, '#b4864b');
  fill.addColorStop(1, '#5e492f');
  ctx.fillStyle = b.hitFlash > 0 ? '#eee0b2' : fill;
  ctx.fillRect(-w / 2, -h + 4, w, h - 7);
  ellipse(ctx, 0, -h + 4, w / 2, 5, '#b28c55');
  ellipse(ctx, 0, -h + 3, w / 2 - 3, 3, '#755b37');
  ellipse(ctx, w * 0.22, -h + 3, 2.5, 1.5, '#d1bb83');
  for (const y of [-h + 10, -8]) {
    ctx.fillStyle = '#d2b575';
    ctx.fillRect(-w / 2 - 1, y, w + 2, 3);
    line(ctx, -w / 2, y + 3, w / 2, y + 3, '#4c422d', 2);
  }
  ctx.fillStyle = '#383c27';
  ctx.fillRect(-w / 2 + 3, -h + 16, w - 6, 17);
  polygon(
    ctx,
    [
      [0, -h + 16],
      [-9, -h + 31],
      [9, -h + 31],
    ],
    '#f0c56e',
  );
  line(ctx, 0, -h + 21, 0, -h + 26, '#403824', 2);
  ellipse(ctx, 0, -h + 29, 1, 1, '#403824');
  line(ctx, -w / 2 + 4, -h + 12, -w / 2 + 4, -3, '#e8c99064');
  ctx.restore();
}

function drawCrate(ctx, x, y, size = 56) {
  ctx.fillStyle = '#263d2b';
  ctx.fillRect(x - size / 2, y - size, size, size);
  ctx.strokeStyle = '#738165';
  ctx.lineWidth = 4;
  ctx.strokeRect(x - size / 2, y - size, size, size);
  line(ctx, x - size / 2 + 5, y - size + 5, x + size / 2 - 5, y - 5, '#64795a', 5);
  line(ctx, x + size / 2 - 5, y - size + 5, x - size / 2 + 5, y - 5, '#64795a', 5);
  line(ctx, x - size / 2, y - size, x + size / 2, y - size, '#b0b69577', 2);
}

function limb(ctx, x, y, kneeX, kneeY, endX, endY, color, width = 8) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(kneeX, kneeY);
  ctx.lineTo(endX, endY);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#122018';
  ctx.lineWidth = width + 3;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ellipse(ctx, kneeX, kneeY, width * 0.48, width * 0.48, color);
}

function muzzle(ctx, x, y, t, hostile = false, reducedMotion = false) {
  const length = reducedMotion ? 12 : 23 + Math.sin(t * 211) * 5;
  glow(ctx, x + 4, y, 45, hostile ? '#f69b68' : '#ffd484', reducedMotion ? 0.14 : 0.34);
  polygon(
    ctx,
    [
      [x, y - 3],
      [x + length * 0.45, y - 9],
      [x + length * 0.37, y - 3],
      [x + length, y],
      [x + length * 0.38, y + 3],
      [x + length * 0.48, y + 9],
      [x, y + 3],
    ],
    hostile ? '#ffc38b' : '#fff0bc',
  );
}

function drawSoldier(
  ctx,
  actor,
  time,
  player = false,
  reducedMotion = false,
  scale = 1,
  ghost = false,
) {
  const hScale = ((actor.h || 62) / 62) * scale;
  const facing = actor.facing || 1;
  const speed = Math.abs(actor.vx || 0),
    moving = speed > 20 && actor.onGround;
  const stride = moving ? Math.sin(time * (player ? 17 : 12)) : 0;
  const air = !actor.onGround;
  const dash = actor.dashTime > 0;
  const bounce = moving ? Math.abs(Math.sin(time * 17)) * 1.3 : Math.sin(time * 2.4) * 0.55;
  const hit = actor.hitFlash > 0 && !reducedMotion;
  const coat = hit ? '#f2e9c3' : player ? '#758873' : '#6c7058';
  const darkCoat = hit ? '#d9dcb3' : player ? '#3b5843' : '#4c5140';
  const rim = hit ? '#fff7d3' : player ? '#bec3a1' : '#a39c78';
  const scarf = player ? '#c4a56a' : '#a36346';
  ctx.save();
  ctx.translate(actor.x, actor.y);
  ctx.scale(hScale, hScale);
  if (!ghost) ellipse(ctx, 1, 2 + Math.max(0, (GROUND - actor.y) * 0.05), 25, 4, '#07151086');
  ctx.scale(facing, 1);
  if (player && actor.invulnerable > 0 && !dash && !reducedMotion && Math.floor(time * 19) % 2)
    ctx.globalAlpha *= 0.68;
  ctx.translate(dash ? 6 : 0, -bounce);
  // Wind-blown fabric and a separate backpack give the silhouette a human identity.
  const flap = Math.sin(time * 8.5) * (moving ? 6 : 3);
  polygon(
    ctx,
    [
      [-8, -45],
      [-17, -40],
      [-23 - (moving ? 9 : 0), -22 + flap],
      [-11, -27],
      [-7, -34],
    ],
    scarf,
    '#413f2b',
    1.4,
  );
  line(ctx, -12, -39, -20 - (moving ? 7 : 0), -26 + flap * 0.5, '#e0c9947d');
  polygon(
    ctx,
    [
      [-19, -45],
      [-9, -46],
      [-9, -24],
      [-18, -23],
      [-21, -30],
    ],
    '#253d2e',
    '#14241a',
    1.5,
  );
  ctx.fillStyle = '#637957';
  ctx.fillRect(-19, -41, 5, 12);
  line(ctx, -18, -44, -18, -54, '#8b9c70', 1.3);
  const rearFootX = air ? -10 : -7 - stride * 11;
  const rearFootY = air ? -8 : -1 - Math.max(0, stride) * 6;
  limb(ctx, -5, -24, -6 - stride * 5, air ? -17 : -12, rearFootX, rearFootY - 1, darkCoat, 7.5);
  polygon(
    ctx,
    [
      [rearFootX - 5, rearFootY - 5],
      [rearFootX + 5, rearFootY - 4],
      [rearFootX + 9, rearFootY],
      [rearFootX - 5, rearFootY],
    ],
    '#14231c',
    '#79836766',
  );
  const frontFootX = air ? 10 : 7 + stride * 11;
  const frontFootY = air ? -3 : -1 - Math.max(0, -stride) * 6;
  limb(ctx, 4, -24, 5 + stride * 6, air ? -15 : -13, frontFootX, frontFootY - 1, coat, 8);
  polygon(
    ctx,
    [
      [frontFootX - 4, frontFootY - 5],
      [frontFootX + 4, frontFootY - 4],
      [frontFootX + 10, frontFootY],
      [frontFootX - 4, frontFootY],
    ],
    '#18271e',
    '#79836780',
  );
  line(ctx, 4 + stride * 5, -14, frontFootX - 1, frontFootY - 6, rim, 1.3);
  const lean = dash ? 5 : moving ? 2 : 0;
  ctx.translate(lean, 0);
  polygon(
    ctx,
    [
      [-10, -46],
      [6, -46],
      [12, -36],
      [8, -22],
      [-10, -22],
      [-13, -36],
    ],
    coat,
    '#192d20',
    1.8,
  );
  polygon(
    ctx,
    [
      [-6, -43],
      [7, -42],
      [8, -30],
      [-7, -30],
    ],
    darkCoat,
  );
  line(ctx, -9, -44, -7, -24, '#acb68d', 2.5);
  ctx.fillStyle = '#98a682';
  ctx.fillRect(-9, -27, 18, 4);
  ctx.fillStyle = '#263d2b';
  ctx.fillRect(-5, -33, 5, 6);
  ctx.fillRect(2, -33, 6, 6);
  ctx.fillStyle = '#cab88d';
  ctx.fillRect(-6, -48, 10, 5);
  // A readable helmet, visor and chin; the visor is the player's small gold accent.
  polygon(
    ctx,
    [
      [-9, -55],
      [5, -56],
      [10, -51],
      [7, -44],
      [-5, -43],
      [-10, -49],
    ],
    '#b5ad87',
    '#1f3224',
    1.3,
  );
  polygon(
    ctx,
    [
      [-14, -55],
      [-9, -62],
      [4, -63],
      [11, -57],
      [11, -52],
      [-14, -52],
    ],
    coat,
    '#1f3224',
    1.5,
  );
  line(ctx, -10, -59, 5, -59, rim, 1.5);
  ctx.fillStyle = '#253b2c';
  ctx.fillRect(-7, -51, 17, 4);
  ctx.fillStyle = player ? '#f1d492' : '#e7a16f';
  ctx.fillRect(2, -50, 8, 2);
  ctx.fillStyle = darkCoat;
  ctx.fillRect(-12, -51, 5, 8);
  polygon(
    ctx,
    [
      [-10, -44],
      [5, -44],
      [3, -40],
      [-10, -41],
    ],
    scarf,
  );
  const angle = Number.isFinite(actor.aimAngle) ? actor.aimAngle : facing > 0 ? 0 : Math.PI;
  const localAngle = Math.atan2(Math.sin(angle), Math.cos(angle) * facing);
  ctx.save();
  ctx.translate(4, -38);
  ctx.rotate(clamp(localAngle, -1.18, 1.18));
  const recoil = actor.fireFlash > 0 ? 1.7 : 0;
  ctx.translate(-recoil, 0);
  limb(ctx, -8, 1, 2, 9, 17, 4, darkCoat, 6.5);
  ctx.fillStyle = '#192923';
  ctx.fillRect(8, -5, 28, 8);
  polygon(
    ctx,
    [
      [2, -6],
      [12, -6],
      [11, 1],
      [4, 3],
    ],
    '#162b20',
    '#87967a',
    0.7,
  );
  ctx.fillStyle = '#899a7b';
  ctx.fillRect(18, -4, 17, 2);
  ctx.fillStyle = '#202f27';
  ctx.fillRect(18, -10, 9, 4);
  ctx.fillStyle = '#b6bba2';
  ctx.fillRect(25, -10, 2, 2);
  ctx.fillStyle = '#485943';
  ctx.fillRect(24, 3, 6, 9);
  ctx.fillStyle = '#1a2a21';
  ctx.fillRect(33, -3, 12, 4);
  ctx.fillStyle = '#c0c4a5';
  ctx.fillRect(43, -4, 3, 6);
  limb(ctx, -3, 0, 6, 5, 14, 0, coat, 7);
  ellipse(ctx, 15, 0, 3, 3, '#c3b58d');
  if (actor.type === 'chaser') {
    ctx.fillStyle = '#252f25';
    ctx.fillRect(23, -6, 8, 11);
    drawGear(ctx, 37, 0, 13, time * 12, '#a59b72', '#344332');
  }
  if (actor.fireFlash > 0 && !ghost) muzzle(ctx, 47, -1, time, !player, reducedMotion);
  ctx.restore();
  ctx.restore();
}

function drawGear(ctx, x, y, radius, angle, outside, inside) {
  const points = [];
  for (let n = 0; n < 40; n++) {
    const a = (n / 40) * Math.PI * 2 + angle,
      r = radius * (n % 4 < 2 ? 1 : 0.79);
    points.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
  }
  polygon(ctx, points, outside, '#101e18', 1.2);
  ellipse(ctx, x, y, radius * 0.59, radius * 0.59, inside);
  ellipse(ctx, x, y, radius * 0.2, radius * 0.2, '#b9b99a');
}

function drawDrone(ctx, enemy, time, reducedMotion) {
  const hit = enemy.hitFlash > 0 && !reducedMotion;
  ctx.save();
  ctx.translate(enemy.x, enemy.y - 17);
  const rotor = Math.sin(time * 90) * 8;
  for (const side of [-1, 1]) {
    line(ctx, side * 13, -6, side * 28, -13, '#788669', 5);
    ellipse(ctx, side * 30, -16, 18 + rotor * side * 0.35, 3, '#a4b79785');
    ctx.fillStyle = '#1b3024';
    ctx.fillRect(side * 30 - 4, -16, 8, 9);
    glow(ctx, side * 25, 13, 20, '#adcfa4', 0.07);
    polygon(
      ctx,
      [
        [side * 22 - 3, 9],
        [side * 22 + 3, 9],
        [side * 22 + 1, 22],
        [side * 22 - 1, 22],
      ],
      '#b6c79034',
    );
  }
  polygon(
    ctx,
    [
      [-21, -11],
      [-12, -20],
      [14, -18],
      [24, -7],
      [17, 8],
      [-16, 8],
    ],
    hit ? '#e7e2c0' : '#5a6e53',
    '#15271e',
    2,
  );
  line(ctx, -15, -15, 13, -15, '#b0bb9380', 2);
  ctx.fillStyle = '#213329';
  ctx.fillRect(-14, -7, 28, 9);
  ellipse(
    ctx,
    0,
    -2,
    enemy.state === 'aim' ? 6 : 4,
    4,
    enemy.state === 'aim' ? '#ffbd83' : '#b26a50',
  );
  line(ctx, -9, 7, -8, 16, '#9fa385', 3);
  line(ctx, 10, 7, 8, 16, '#9fa385', 3);
  ctx.save();
  ctx.rotate(enemy.aimAngle || 0);
  ctx.fillStyle = '#102019';
  ctx.fillRect(3, -3, 22, 6);
  ctx.fillStyle = '#8b9476';
  ctx.fillRect(21, -3, 4, 6);
  if (enemy.fireFlash > 0) muzzle(ctx, 26, 0, time, true, reducedMotion);
  ctx.restore();
  ctx.restore();
}

function drawBoss(ctx, boss, time, reducedMotion) {
  const facing = boss.facing || -1,
    charging = boss.state === 'charge';
  const recover = boss.state === 'recover',
    telegraph = boss.state === 'telegraph';
  const phase2 = boss.phase === 2,
    hit = boss.hitFlash > 0 && !reducedMotion;
  const armor = hit ? '#e9e4c6' : '#58644c';
  const bright = hit ? '#fff4d5' : '#929978';
  const pulse = reducedMotion ? 0.5 : Math.sin(time * (phase2 ? 11 : 5)) * 0.5 + 0.5;
  const walk = charging ? Math.sin(time * 20) : Math.sin(time * 2) * 0.15;
  ctx.save();
  ctx.translate(boss.x, boss.y);
  ctx.scale(facing, 1);
  ellipse(ctx, 0, 3, 91, 10, '#05150eb0');
  for (const side of [-1, 1]) {
    const shift = walk * side * (charging ? 20 : 3);
    limb(ctx, side * 24, -62, side * 29 + shift, -34, side * 35 - shift, -10, '#374934', 16);
    polygon(
      ctx,
      [
        [side * 29 + shift - 14, -45],
        [side * 29 + shift + 14, -42],
        [side * 29 + shift + 10, -28],
        [side * 29 + shift - 12, -30],
      ],
      armor,
      '#182d20',
      2,
    );
    polygon(
      ctx,
      [
        [side * 35 - shift - 17, -17],
        [side * 35 - shift + 18, -17],
        [side * 35 - shift + 24, -3],
        [side * 35 - shift - 21, -3],
      ],
      armor,
      '#10271b',
      2.5,
    );
    line(ctx, side * 35 - shift - 13, -5, side * 35 - shift + 17, -5, bright, 2);
    ellipse(ctx, side * 29 + shift, -35, 6, 6, '#a69d68');
  }
  ctx.translate(charging ? 12 : 0, charging ? 5 : Math.sin(time * 2.8) * 1.2);
  // Exhaust cylinders and braced joints stay behind the armoured chest.
  for (const x of [-33, -18]) {
    metal(ctx, x, -136, 13, 67, '#606c4d');
    ctx.fillStyle = '#14291d';
    ctx.fillRect(x - 2, -139, 17, 6);
    line(ctx, x + 3, -130, x + 3, -90, '#a19f7140', 2);
  }
  polygon(
    ctx,
    [
      [-44, -114],
      [-26, -135],
      [28, -133],
      [46, -111],
      [37, -66],
      [20, -53],
      [-27, -58],
      [-45, -82],
    ],
    '#354b35',
    '#11271b',
    3,
  );
  polygon(
    ctx,
    [
      [-31, -121],
      [22, -122],
      [34, -107],
      [27, -66],
      [-25, -66],
      [-35, -88],
    ],
    armor,
    bright,
    1.5,
  );
  hazard(ctx, -30, -121, 56, 7, 0.75);
  ctx.fillStyle = '#172c20';
  ctx.fillRect(-17, -131, 35, 16);
  ctx.fillStyle = phase2 ? '#ec9e68' : '#d2b474';
  ctx.fillRect(-12, -125, 25, 4);
  // The exposed reactor has an unmistakable opening animation and brighter colour.
  const coreRadius = recover ? 22 : 13;
  glow(
    ctx,
    0,
    -91,
    recover ? 96 : 57,
    phase2 ? '#f1a16d' : '#efc078',
    recover ? 0.42 : 0.13 + pulse * 0.09,
  );
  ellipse(ctx, 0, -91, 28, 29, '#172b1e');
  ctx.strokeStyle = '#949875';
  ctx.lineWidth = 3;
  ctx.stroke();
  ellipse(
    ctx,
    0,
    -91,
    coreRadius,
    coreRadius,
    recover ? '#fff0b9' : phase2 ? '#d77951' : '#c49353',
  );
  ellipse(ctx, -3, -94, coreRadius * 0.48, coreRadius * 0.48, recover ? '#fff8dc' : '#f2ca83');
  if (!recover) {
    polygon(
      ctx,
      [
        [-26, -111],
        [-8, -111],
        [-12, -93],
        [-7, -75],
        [-26, -72],
      ],
      armor,
      '#9c9e734a',
    );
    polygon(
      ctx,
      [
        [26, -111],
        [8, -111],
        [12, -93],
        [7, -75],
        [26, -72],
      ],
      armor,
      '#9c9e734a',
    );
  } else {
    polygon(
      ctx,
      [
        [-35, -112],
        [-24, -115],
        [-30, -72],
        [-40, -77],
      ],
      armor,
      bright,
      1.2,
    );
    polygon(
      ctx,
      [
        [35, -112],
        [24, -115],
        [30, -72],
        [40, -77],
      ],
      armor,
      bright,
      1.2,
    );
    for (let i = 0; i < 3; i++) {
      const y = -128 - mod(time * 27 + i * 18, 49);
      ellipse(ctx, -25 + i * 20, y, 10 + i * 3, 5, '#c5cfb521');
    }
  }
  // Heavy shoulder plates and a circular dismantling blade distinguish the boss.
  limb(ctx, -35, -107, -53, -81, -50, -50, '#526847', 17);
  polygon(
    ctx,
    [
      [-53, -118],
      [-27, -116],
      [-30, -93],
      [-60, -95],
    ],
    armor,
    '#acac7a',
    1.5,
  );
  drawGear(ctx, -53, -49, 33, time * (charging ? 18 : 7), '#9e9d77', '#354d33');
  ellipse(ctx, -53, -49, 5, 5, '#dda971');
  limb(ctx, 37, -108, 58, -91, 70, -86, '#445b3d', 19);
  polygon(
    ctx,
    [
      [28, -123],
      [54, -122],
      [65, -107],
      [58, -90],
      [30, -92],
    ],
    armor,
    '#a4a979',
    1.5,
  );
  ctx.save();
  ctx.translate(56, -89);
  const localAngle = Math.atan2(
    Math.sin(boss.aimAngle || 0),
    Math.cos(boss.aimAngle || 0) * facing,
  );
  ctx.rotate(clamp(localAngle, -0.9, 0.9));
  metal(ctx, -4, -13, 49, 26, '#718160', '#1c3121');
  ctx.fillStyle = '#172a1f';
  ctx.fillRect(24, -10, 29, 20);
  for (let x = 4; x < 30; x += 9) line(ctx, x, -12, x, 12, '#b5b48b69', 3);
  ctx.fillStyle = '#9da584';
  ctx.fillRect(51, -12, 6, 24);
  ctx.fillStyle = '#15281d';
  ctx.fillRect(56, -7, 7, 14);
  if (telegraph && boss.attack?.kind === 'volley')
    glow(ctx, 60, 0, 45, '#ffc58a', 0.2 + pulse * 0.2);
  if (boss.fireFlash > 0) {
    ctx.scale(1.4, 1.4);
    muzzle(ctx, 45, 0, time, true, reducedMotion);
  }
  ctx.restore();
  for (const [x, y] of [
    [-37, -104],
    [36, -109],
    [-20, -67],
    [22, -67],
    [-47, -105],
    [48, -105],
  ])
    ellipse(ctx, x, y, 2.4, 2.4, bright);
  if (phase2) {
    line(ctx, -24, -132, -15, -140, '#f3b47a98', 2);
    line(ctx, -15, -140, -7, -132, '#f3b47a98', 2);
  }
  ctx.restore();
}

function drawTelegraph(ctx, enemy, time, reducedMotion) {
  if (enemy.state !== 'telegraph' || !enemy.attack) return;
  const a = enemy.attack,
    progress = 1 - clamp(a.remaining / a.duration, 0, 1);
  const opacity = reducedMotion ? 0.65 : 0.4 + progress * 0.45;
  ctx.save();
  ctx.globalAlpha = opacity;
  if (a.kind === 'charge') {
    const left = Math.min(enemy.x, a.targetX),
      right = Math.max(enemy.x, a.targetX);
    const fill = ctx.createLinearGradient(0, enemy.y - 70, 0, enemy.y);
    fill.addColorStop(0, '#e98d5d00');
    fill.addColorStop(1, '#e98d5d55');
    ctx.fillStyle = fill;
    ctx.fillRect(left, enemy.y - 70, right - left, 70);
    ctx.strokeStyle = '#efc489';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(left, enemy.y - 2);
    ctx.lineTo(right, enemy.y - 2);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let x = left + 25; x < right; x += 74) {
      const direction = Math.sign(a.targetX - enemy.x);
      polygon(
        ctx,
        [
          [x - direction * 10, enemy.y - 25],
          [x + direction * 3, enemy.y - 17],
          [x - direction * 10, enemy.y - 9],
        ],
        null,
        '#f4c68b',
        3,
      );
    }
    line(ctx, a.targetX, enemy.y - 42, a.targetX, enemy.y + 2, '#ffd7a1', 3);
  } else {
    const x = a.targetX,
      y = a.targetY ?? enemy.y - 35;
    ctx.beginPath();
    ctx.arc(x, y, 35 - progress * 11, 0, Math.PI * 2);
    ctx.strokeStyle = '#f4b885';
    ctx.lineWidth = 2;
    ctx.stroke();
    for (const side of [-1, 1]) {
      line(ctx, x + side * 20, y, x + side * 42, y, '#f4b885', 2);
      line(ctx, x, y + side * 20, x, y + side * 42, '#f4b885', 2);
    }
    ctx.setLineDash([7, 13]);
    line(ctx, enemy.x, enemy.y - enemy.h * 0.62, x, y, '#e2a47566', 1.4);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function stateFor(run) {
  if (!visuals.has(run))
    visuals.set(run, {
      lastEvent: -1,
      time: null,
      particles: [],
      rings: [],
      texts: [],
      shake: 0,
      hurt: 0,
      room: run.levelIndex,
    });
  return visuals.get(run);
}

function burst(state, random, x, y, count, kind, color, speed = 170) {
  for (let i = 0; i < count; i++) {
    const a = random() * Math.PI * 2,
      v = (0.3 + random() * 0.7) * speed;
    const life = kind === 'smoke' ? 0.7 + random() * 0.45 : 0.22 + random() * 0.45;
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - (kind === 'smoke' ? 50 : 45),
      life,
      maxLife: life,
      size:
        kind === 'smoke'
          ? 11 + random() * 19
          : kind === 'debris'
            ? 3 + random() * 5
            : 1.5 + random() * 2.5,
      rotation: random() * 6.28,
      spin: random() * 9 - 4.5,
      kind,
      color,
    });
  }
}

/** Consume immediately after each simulation step. Repeated render calls cannot replay an event. */
export function consumeRenderEvents(run) {
  if (!run) return;
  const state = stateFor(run);
  if (state.room !== run.levelIndex) {
    state.particles.length = 0;
    state.rings.length = 0;
    state.texts.length = 0;
    state.shake = 0;
    state.hurt = 0;
    state.room = run.levelIndex;
  }
  for (const event of run.events || []) {
    if (event.id <= state.lastEvent) continue;
    state.lastEvent = event.id;
    const random = rng(event.id * 12739 + 471);
    if (event.type === 'shoot') {
      const side = Math.cos(event.angle) >= 0 ? 1 : -1;
      state.particles.push({
        x: event.x - side * 27,
        y: event.y - 3,
        vx: -side * (35 + random() * 55),
        vy: -100 - random() * 60,
        life: 0.43,
        maxLife: 0.43,
        size: 2.2,
        rotation: 0,
        spin: 16,
        kind: 'debris',
        color: '#d6b06c',
      });
      if (event.owner === 'player') state.shake = Math.max(state.shake, 0.6);
    } else if (event.type === 'hit') {
      burst(state, random, event.x, event.y, 7, 'spark', '#f0cf8d', 215);
      state.rings.push({
        x: event.x,
        y: event.y,
        size: 23,
        life: 0.14,
        maxLife: 0.14,
        kind: 'hit',
      });
    } else if (event.type === 'kill') {
      burst(state, random, event.x, event.y, 12, 'debris', '#75856b', 190);
      burst(state, random, event.x, event.y, 10, 'spark', '#efba74', 260);
      burst(state, random, event.x, event.y, 5, 'smoke', '#829073', 45);
      state.shake = Math.max(state.shake, event.enemyType === 'boss' ? 7 : 2.3);
      state.rings.push({
        x: event.x,
        y: event.y,
        size: event.enemyType === 'boss' ? 160 : 45,
        life: 0.35,
        maxLife: 0.35,
        kind: 'kill',
      });
    } else if (event.type === 'explode') {
      burst(state, random, event.x, event.y, 28, 'spark', '#ffd090', 490);
      burst(state, random, event.x, event.y, 15, 'debris', '#b79259', 350);
      burst(state, random, event.x, event.y, 11, 'smoke', '#8d795a', 150);
      state.rings.push({
        x: event.x,
        y: event.y,
        size: event.radius || 170,
        life: 0.52,
        maxLife: 0.52,
        kind: 'explosion',
      });
      state.shake = Math.max(state.shake, 6.5);
      if (event.chain)
        state.texts.push({
          x: event.x,
          y: event.y - 79,
          text: '连锁爆破',
          life: 1.15,
          maxLife: 1.15,
        });
    } else if (event.type === 'jump' || event.type === 'dash') {
      burst(
        state,
        random,
        event.x,
        event.type === 'jump' ? event.y : event.y + 29,
        8,
        'smoke',
        '#abb08e',
        65,
      );
    } else if (event.type === 'hurt') {
      state.hurt = 0.22;
      state.shake = Math.max(state.shake, 4);
      burst(state, random, event.x, event.y, 9, 'spark', '#e4ae7c', 170);
    } else if (event.type === 'wave' && event.waveIndex > 0) {
      state.texts.push({
        x: run.player.x + 210,
        y: 295,
        text: '增援接近',
        life: 1.5,
        maxLife: 1.5,
      });
    } else if (event.type === 'warning' && event.kind === 'phase2') {
      state.texts.push({
        x: event.x,
        y: event.y - 192,
        text: '过载 · 第二阶段',
        life: 1.5,
        maxLife: 1.5,
      });
      state.rings.push({
        x: event.x,
        y: event.y - 90,
        size: 120,
        life: 0.4,
        maxLife: 0.4,
        kind: 'kill',
      });
    }
  }
  if (state.particles.length > 260) state.particles.splice(0, state.particles.length - 260);
  if (state.rings.length > 24) state.rings.splice(0, state.rings.length - 24);
  if (state.texts.length > 5) state.texts.splice(0, state.texts.length - 5);
}

function updateVisuals(state, time) {
  const dt = state.time === null ? 0 : clamp(time - state.time, 0, 0.08);
  state.time = time;
  state.shake = Math.max(0, state.shake - dt * 19);
  state.hurt = Math.max(0, state.hurt - dt);
  for (const p of state.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += dt * (p.kind === 'smoke' ? -25 : 450);
    p.rotation += p.spin * dt;
  }
  for (const ring of state.rings) ring.life -= dt;
  for (const text of state.texts) {
    text.life -= dt;
    text.y -= dt * 19;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
  state.rings = state.rings.filter((p) => p.life > 0);
  state.texts = state.texts.filter((p) => p.life > 0);
}

function drawEffects(ctx, state, reducedMotion) {
  ctx.save();
  for (const p of state.particles) {
    const life = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = life * (p.kind === 'smoke' ? 0.18 : 0.95);
    if (p.kind === 'smoke')
      ellipse(ctx, p.x, p.y, p.size * (2 - life), p.size * (1.2 - life * 0.4), p.color);
    else if (p.kind === 'debris') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size * 1.6, p.size * 0.65);
      ctx.restore();
    } else {
      line(ctx, p.x, p.y, p.x - p.vx * 0.019, p.y - p.vy * 0.019, p.color, p.size * 0.6);
    }
  }
  for (const ring of state.rings) {
    const life = ring.life / ring.maxLife,
      progress = 1 - life;
    ctx.globalAlpha = life * (reducedMotion ? 0.5 : 0.8);
    const radius = Math.max(1, ring.size * (0.12 + Math.sin((progress * Math.PI) / 2) * 0.88));
    if (ring.kind === 'explosion') {
      glow(ctx, ring.x, ring.y, radius * 1.6, '#ffb765', life * 0.7);
      if (progress < 0.5) {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          ellipse(
            ctx,
            ring.x + Math.cos(a) * radius * 0.32,
            ring.y + Math.sin(a) * radius * 0.3,
            radius * (0.35 + (i % 2) * 0.07),
            radius * 0.34,
            progress < 0.16 ? '#ffebad' : '#e99e56',
          );
        }
      }
    }
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = ring.kind === 'hit' ? '#fff0ba' : '#e8b577';
    ctx.lineWidth = ring.kind === 'explosion' ? 3 * life : 1.5;
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.font = '700 25px sans-serif';
  for (const text of state.texts) {
    ctx.globalAlpha = Math.min(1, text.life * 2.5);
    ctx.strokeStyle = '#15271e';
    ctx.lineWidth = 4;
    ctx.strokeText(text.text, text.x, text.y);
    ctx.fillStyle = '#f2d49c';
    ctx.fillText(text.text, text.x, text.y);
    line(ctx, text.x - 30, text.y + 9, text.x + 30, text.y + 9, '#d7aa66', 2);
  }
  ctx.restore();
}

function drawBullets(ctx, bullets) {
  ctx.save();
  ctx.lineCap = 'round';
  for (const b of bullets) {
    const speed = Math.hypot(b.vx, b.vy) || 1,
      length = b.owner === 'player' ? 35 : 15;
    const tailX = b.x - (b.vx / speed) * length,
      tailY = b.y - (b.vy / speed) * length;
    if (b.owner === 'player') {
      line(ctx, tailX, tailY, b.x, b.y, '#d4ba6d33', 8);
      line(ctx, tailX, tailY, b.x, b.y, '#eacb86b3', 3);
      line(ctx, b.x - (b.vx / speed) * 12, b.y - (b.vy / speed) * 12, b.x, b.y, '#fff5ce', 2);
    } else {
      line(ctx, tailX, tailY, b.x, b.y, '#c567414d', 9);
      ellipse(ctx, b.x, b.y, 6, 6, '#d78459');
      ellipse(ctx, b.x, b.y, 2.5, 2.5, '#ffe1b0');
    }
  }
  ctx.restore();
}

function foreground(ctx, width, cameraX) {
  // Cropped fencing sits below the action line, so it never conceals a target.
  const offset = mod(cameraX * 1.1, 590);
  ctx.save();
  ctx.globalAlpha = 0.82;
  for (let x = -offset - 45; x < width; x += 590) {
    ctx.fillStyle = '#071b15';
    ctx.fillRect(x, 648, 11, 74);
    ctx.fillRect(x + 220, 648, 11, 74);
    line(ctx, x, 656, x + 230, 656, '#0c2218', 7);
    for (let i = 0; i < 12; i++) {
      line(ctx, x + i * 20, 660, x + i * 20 + 44, 720, '#27453150', 1);
      line(ctx, x + i * 20, 720, x + i * 20 + 44, 660, '#27453150', 1);
    }
  }
  ctx.restore();
}

function drawMenuHero(ctx, width, time, reducedMotion) {
  const x = width * 0.71;
  glow(ctx, x + 35, 458, 248, '#d1a568', 0.16);
  drawCrate(ctx, x + 244, GROUND, 71);
  drawBarrel(ctx, { x: x + 178, y: GROUND, w: 36, h: 51, active: true });
  drawBarrel(ctx, { x: x + 139, y: GROUND, w: 30, h: 45, active: true });
  line(ctx, x + 134, 571, x + 134, 321, '#89936b', 3);
  const flutter = reducedMotion ? 0 : Math.sin(time * 2.2) * 8;
  polygon(
    ctx,
    [
      [x + 136, 323],
      [x + 230, 313 + flutter],
      [x + 217, 359],
      [x + 227, 379],
      [x + 136, 395],
    ],
    '#1a3328',
    '#6c7d585c',
  );
  polygon(
    ctx,
    [
      [x + 151, 336],
      [x + 205, 330 + flutter * 0.5],
      [x + 198, 340],
      [x + 151, 346],
    ],
    '#b08a56',
  );
  drawSoldier(
    ctx,
    { x, y: GROUND - 1, h: 62, vx: 0, onGround: true, facing: 1, aimAngle: -0.045, fireFlash: 0 },
    time,
    true,
    reducedMotion,
    2.35,
  );
  // Cables and spent shells make the foreground vignette feel inhabited.
  ctx.strokeStyle = '#071812';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x - 114, GROUND - 1);
  ctx.bezierCurveTo(x - 59, 553, x + 62, 592, x + 196, GROUND - 1);
  ctx.stroke();
  for (let i = 0; i < 7; i++)
    line(ctx, x + 60 + i * 14, 566 + (i % 3), x + 65 + i * 14, 567 + (i % 3), '#b2985f', 2);
}

/** This deterministic camera excludes shake, and is also the mouse-to-world mapping. */
export function getCamera(run, width, height, screen = 'playing') {
  const scale = Math.max(1, height) / WORLD_HEIGHT;
  const viewWidth = Math.max(1, width) / scale;
  const menu = !run || screen === 'home' || screen === 'levels' || screen === 'help';
  const cameraX = menu
    ? 160
    : clamp(run.player.x - viewWidth * 0.34, 0, Math.max(0, run.level.width - viewWidth));
  return { cameraX, scale };
}

/** Pure scene presentation; all collision, clocks, damage and outcomes remain in core.mjs. */
export function renderer(
  ctx,
  run,
  { width, height, time = 0, screen = 'playing', reducedMotion = false },
) {
  const { cameraX, scale } = getCamera(run, width, height, screen);
  const viewWidth = width / scale;
  const menu = !run || screen === 'home' || screen === 'levels' || screen === 'help';
  const theme = menu ? 0 : run.levelIndex % 3;
  const images = assets(ctx, theme);
  let state;
  if (!menu) {
    consumeRenderEvents(run);
    state = stateFor(run);
    updateVisuals(state, time);
  }
  ctx.save();
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.rect(0, 0, viewWidth, WORLD_HEIGHT);
  ctx.clip();
  const shake = !reducedMotion && state ? state.shake : 0;
  if (shake) ctx.translate(Math.sin(time * 71) * shake, Math.cos(time * 91) * shake * 0.65);
  tile(ctx, images.far, cameraX * 0.17, viewWidth);
  ambient(ctx, viewWidth, cameraX, time, false, reducedMotion);
  tile(ctx, images.mid, cameraX * 0.49, viewWidth);
  tile(ctx, images.floor, cameraX, viewWidth);
  if (menu) drawMenuHero(ctx, viewWidth, time, reducedMotion);
  else {
    ctx.save();
    ctx.translate(-cameraX, 0);
    const left = cameraX - 170,
      right = cameraX + viewWidth + 170;
    for (const platform of run.level.platforms) {
      if (platform.x + platform.w >= left && platform.x <= right) drawPlatform(ctx, platform);
    }
    // Sparse, uncollidable set dressing is visually distinct from platforms and barrels.
    drawCrate(ctx, 162, GROUND, 53);
    drawCrate(ctx, run.level.width - 74, GROUND, 63);
    for (const barrel of run.barrels)
      if (barrel.x > left && barrel.x < right) drawBarrel(ctx, barrel);
    for (const enemy of run.enemies)
      if (enemy.type === 'boss') drawTelegraph(ctx, enemy, time, reducedMotion);
    for (const enemy of run.enemies) {
      if (enemy.x < left || enemy.x > right) continue;
      if (enemy.type === 'boss') drawBoss(ctx, enemy, time, reducedMotion);
      else if (enemy.type === 'drone') drawDrone(ctx, enemy, time, reducedMotion);
      else drawSoldier(ctx, enemy, time, false, reducedMotion);
      if (enemy.type !== 'boss' && enemy.hp < enemy.maxHp) {
        const y = enemy.y - enemy.h - 11;
        ctx.fillStyle = '#10231bd9';
        ctx.fillRect(enemy.x - 22, y, 44, 5);
        ctx.fillStyle = '#bf9770';
        ctx.fillRect(enemy.x - 21, y + 1, 42 * Math.max(0, enemy.hp / enemy.maxHp), 3);
      }
    }
    if (run.player.dashTime > 0 && !reducedMotion) {
      for (let i = 3; i > 0; i--) {
        ctx.save();
        ctx.globalAlpha = 0.17 - i * 0.035;
        drawSoldier(
          ctx,
          {
            ...run.player,
            x: run.player.x - (run.player.dashDirection || run.player.facing) * i * 31,
            fireFlash: 0,
          },
          time,
          true,
          true,
          1,
          true,
        );
        ctx.restore();
      }
    }
    drawSoldier(ctx, run.player, time, true, reducedMotion);
    drawBullets(ctx, run.bullets);
    drawEffects(ctx, state, reducedMotion);
    ctx.restore();
  }
  ambient(ctx, viewWidth, cameraX, time, true, reducedMotion);
  foreground(ctx, viewWidth, cameraX);
  // The top and bottom frame the scene; the playable middle keeps its contrast.
  const shade = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  shade.addColorStop(0, '#081913a6');
  shade.addColorStop(0.22, '#07181200');
  shade.addColorStop(0.76, '#07181200');
  shade.addColorStop(1, '#04120dd9');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, viewWidth, WORLD_HEIGHT);
  if (menu) {
    const fade = ctx.createLinearGradient(0, 0, viewWidth * 0.75, 0);
    fade.addColorStop(0, '#091916fa');
    fade.addColorStop(0.38, '#091916ec');
    fade.addColorStop(0.7, '#0b1b1580');
    fade.addColorStop(1, '#0b1b1500');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, viewWidth * 0.75, WORLD_HEIGHT);
  }
  if (state?.hurt > 0 && !reducedMotion) {
    ctx.strokeStyle = `rgba(195,115,75,${state.hurt * 1.8})`;
    ctx.lineWidth = 20;
    ctx.strokeRect(0, 0, viewWidth, WORLD_HEIGHT);
  }
  ctx.restore();
  return { cameraX, scale };
}

export default renderer;

// Offline-only baking entry. Creator imports PNGs, never this Canvas renderer.
export function bakeArt() {
  const result = {};
  const bake = (name, w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'));
    result[name] = c.toDataURL('image/png').split(',')[1];
  };
  bake('far', 1800, 720, paintFar);
  bake('floor', 1800, 720, paintFloor);
  for (let theme = 0; theme < 3; theme++)
    bake(`mid-${theme}`, 1800, 720, (ctx) => paintMid(ctx, theme));
  for (const kind of ['player', 'shooter', 'chaser', 'drone', 'boss']) {
    for (let frame = 0; frame < 4; frame++) {
      const boss = kind === 'boss',
        size = boss ? 320 : 160,
        feet = boss ? 290 : 170;
      bake(`${kind}-${frame}`, size, boss ? 320 : 200, (ctx) => {
        const a = {
          x: size / 2,
          y: feet,
          w: boss ? 112 : 40,
          h: boss ? 140 : 62,
          facing: 1,
          vx: frame ? 120 : 0,
          onGround: true,
          hp: 100,
          maxHp: 100,
          aimAngle: 0,
          state: frame === 3 ? 'recover' : 'idle',
          phase: 1,
        };
        if (boss) drawBoss(ctx, a, frame * 0.09, false);
        else if (kind === 'drone') drawDrone(ctx, a, frame * 0.09, false);
        else drawSoldier(ctx, a, frame * 0.09, kind === 'player', false);
      });
    }
  }
  bake('barrel', 100, 100, (ctx) => drawBarrel(ctx, { x: 50, y: 85, w: 32, h: 46, active: true }));
  bake('platform', 340, 48, (ctx) => drawPlatform(ctx, { x: 0, y: 4, w: 340, h: 22 }));
  return result;
}
