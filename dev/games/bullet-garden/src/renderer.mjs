import { ENEMIES, LEVELS, SEEDS } from './config.mjs';
import * as CONTENT from './config.mjs';
import {
  tint,
  drawMapGround,
  drawMapWall,
  drawMapLandmark,
  drawWeatherGround,
  drawWeatherParticles,
} from './scenery-renderer.mjs';
import {
  drawEnemy,
  drawAdditionalPlant,
  drawPet,
  drawHeartIcon,
  drawShieldIcon,
  drawCombatTelegraph,
} from './ecology-renderer.mjs';

/* Bullet Garden's illustrated world. All artwork is generated locally; there are no
 * remote textures or runtime art dependencies. Simulation coordinates are ground
 * contacts, which lets new plants and enemies share the same depth ordering. */

const TAU = Math.PI * 2;
const COLORS = {
  thorn: '#a2e866',
  ice: '#75ddff',
  mushroom: '#ffc26c',
  normal: '#ff83dc',
  fire: '#ff9a61',
  explosive: '#ffca73',
  split: '#e2bbff',
  enemy: '#ff906d',
  sunflower: '#f5d467',
  stormreed: '#79dfef',
  bloomturret: '#f193d4',
  hostile: '#ff906d',
};
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const noise = (n) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

function path(c, points, close = true) {
  c.beginPath();
  points.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
  if (close) c.closePath();
}
function ellipse(c, x, y, rx, ry, fill, stroke, width = 1) {
  c.beginPath();
  c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, TAU);
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = width;
    c.stroke();
  }
}
function gradient(c, x, y, x2, y2, stops) {
  const g = c.createLinearGradient(x, y, x2, y2);
  stops.forEach(([offset, color]) => g.addColorStop(offset, color));
  return g;
}
function radial(c, x, y, radius, inner, outer) {
  const g = c.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  return g;
}
function shadow(c, x, y, rx, ry, opacity = 0.35) {
  ellipse(
    c,
    x + 5,
    y + 5,
    rx,
    ry,
    radial(c, x + 5, y + 5, rx, `rgba(19,25,23,${opacity})`, 'rgba(19,25,23,0)'),
  );
}
function leaf(c, x, y, length, angle, color = '#498548', light = '#81ab53') {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(-length * 0.45, -length * 0.43, -length * 0.23, -length * 0.9, 0, -length);
  c.bezierCurveTo(length * 0.44, -length * 0.54, length * 0.45, -length * 0.15, 0, 0);
  c.fillStyle = gradient(c, -length / 2, 0, length / 2, -length, [
    [0, color],
    [1, light],
  ]);
  c.fill();
  c.beginPath();
  c.moveTo(0, -1);
  c.lineTo(0, -length * 0.8);
  c.strokeStyle = 'rgba(180,211,110,.28)';
  c.lineWidth = 1;
  c.stroke();
  c.restore();
}
function flower(c, x, y, scale = 1, t = 0, pink = true) {
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  shadow(c, 0, 1, 18, 7, 0.22);
  c.strokeStyle = '#407745';
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(4, -11, Math.sin(t) * 2, -29);
  c.stroke();
  leaf(c, 0, -4, 19, -1.1);
  leaf(c, 0, -10, 17, 1.1, '#396e45', '#90c764');
  c.translate(Math.sin(t) * 2, -30);
  for (let j = 0; j < 5; j++) {
    c.save();
    c.rotate((j * TAU) / 5);
    ellipse(
      c,
      0,
      -8,
      6.5,
      10,
      gradient(c, 0, -18, 0, 0, [
        [0, pink ? '#ffc3ef' : '#fffbd1'],
        [0.4, pink ? '#ff75d1' : '#ffd379'],
        [1, pink ? '#d943a4' : '#d89d54'],
      ]),
    );
    c.restore();
  }
  ellipse(c, 0, 0, 5, 4, '#ffe49c');
  ellipse(c, -1, -1, 2, 1.5, '#fff6d2');
  c.restore();
}

function stone(c, x, y, w = 75, d = 37, h = 54, seed = 1) {
  const warm = noise(seed) > 0.63;
  path(c, [
    [x - w / 2, y - h],
    [x + w / 2, y - h],
    [x + w / 2, y],
    [x - w / 2, y],
  ]);
  c.fillStyle = gradient(c, x - w / 2, y - h, x + w / 2, y, [
    [0, warm ? '#68766d' : '#55665f'],
    [1, '#344942'],
  ]);
  c.fill();
  path(c, [
    [x + w / 2, y - h],
    [x + w / 2 + d * 0.75, y - h - d * 0.58],
    [x + w / 2 + d * 0.75, y - d * 0.58],
    [x + w / 2, y],
  ]);
  c.fillStyle = '#2d423e';
  c.fill();
  path(c, [
    [x - w / 2, y - h],
    [x - w / 2 + d * 0.75, y - h - d * 0.58],
    [x + w / 2 + d * 0.75, y - h - d * 0.58],
    [x + w / 2, y - h],
  ]);
  c.fillStyle = gradient(c, x, y - h - d, x, y - h, [
    [0, '#869084'],
    [1, warm ? '#8b9280' : '#687d73'],
  ]);
  c.fill();
  c.strokeStyle = 'rgba(170,182,145,.3)';
  c.lineWidth = 1.6;
  c.stroke();
  c.strokeStyle = 'rgba(14,34,30,.34)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x - w * 0.2, y - h);
  c.lineTo(x - w * 0.13, y - h * 0.58);
  c.lineTo(x - w * 0.21, y - h * 0.43);
  c.stroke();
  for (let i = 0; i < 8; i++) {
    const xx = x - w / 2 + noise(seed + i * 5) * w,
      yy = y - h + noise(seed + i * 7 + 90) * h;
    ellipse(
      c,
      xx,
      yy,
      noise(seed + i) * 4 + 1,
      noise(seed + i + 1) * 2 + 0.5,
      'rgba(154,172,141,.11)',
    );
  }
  if (noise(seed + 3) > 0.35) {
    for (let i = 0; i < 5; i++) {
      ellipse(
        c,
        x - w * 0.35 + i * w * 0.15,
        y - h + noise(seed + i) * 6,
        7 + noise(seed + i + 10) * 6,
        4 + noise(seed + i + 44) * 5,
        '#506a41',
      );
    }
  }
}
function vinePatch(c, x, y, width, seed = 0, dense = false) {
  c.save();
  c.translate(x, y);
  const n = dense ? 24 : 12;
  for (let i = 0; i < n; i++) {
    const xx = (noise(seed + i * 3) - 0.5) * width,
      yy = (noise(seed + i * 7 + 1) - 0.5) * width * 0.43;
    const len = 10 + noise(seed + i * 9 + 2) * 24;
    leaf(
      c,
      xx,
      yy,
      len,
      noise(seed + i * 11 + 7) * TAU,
      '#254e39',
      noise(seed + i + 8) > 0.5 ? '#658c46' : '#3f7050',
    );
  }
  c.restore();
}
function torchBase(c, x, y) {
  shadow(c, x, y, 27, 12, 0.33);
  stone(c, x, y, 31, 18, 32, 55 + x);
  c.fillStyle = '#5f4831';
  c.fillRect(x - 4, y - 76, 8, 47);
  ellipse(c, x, y - 74, 9, 4, '#b78243');
  path(c, [
    [x - 12, y - 85],
    [x + 12, y - 85],
    [x + 7, y - 69],
    [x - 7, y - 69],
  ]);
  c.fillStyle = '#64452f';
  c.fill();
  c.strokeStyle = '#ba8a45';
  c.lineWidth = 3;
  c.stroke();
}
function fire(c, x, y, t, scale = 1) {
  c.save();
  c.translate(x, y - 84);
  c.scale(scale, scale);
  c.globalCompositeOperation = 'screen';
  ellipse(c, 0, -8, 51, 58, radial(c, 0, -8, 55, 'rgba(255,147,39,.2)', 'rgba(255,113,22,0)'));
  c.globalCompositeOperation = 'source-over';
  const sway = Math.sin(t * 5 + x) * 4;
  c.beginPath();
  c.moveTo(-8, 3);
  c.bezierCurveTo(-20, -12, 5 + sway, -23, -2 + sway, -41);
  c.bezierCurveTo(18 + sway, -25, 10, -18, 12, -9);
  c.bezierCurveTo(15, 1, 4, 8, -8, 3);
  c.fillStyle = gradient(c, 0, -40, 0, 6, [
    [0, '#ffeeb0'],
    [0.45, '#ffd273'],
    [1, '#fc832c'],
  ]);
  c.shadowColor = '#ff982e';
  c.shadowBlur = 13;
  c.fill();
  c.shadowBlur = 0;
  c.beginPath();
  c.moveTo(-5, 1);
  c.quadraticCurveTo(-7, -8, 3 + sway * 0.3, -22);
  c.quadraticCurveTo(12, -3, 3, 3);
  c.fillStyle = '#fff4b3';
  c.fill();
  for (let i = 0; i < 3; i++) {
    const p = (t * 0.48 + i * 0.35) % 1;
    ellipse(
      c,
      Math.sin(t * 2 + i * 3) * 9,
      -8 - p * 55,
      1.5 * (1 - p),
      2 * (1 - p),
      `rgba(255,204,97,${1 - p})`,
    );
  }
  c.restore();
}

function createBackdrop(level = {}) {
  const palette = {
    ground: '#a49773',
    accent: '#ffe3ac',
    sky: '#182e29',
    ...level.visual?.palette,
  };
  const canvas = document.createElement('canvas');
  canvas.width = 1680;
  canvas.height = 1120;
  const c = canvas.getContext('2d');
  c.translate(120, 110);
  c.fillStyle = palette.sky;
  c.fillRect(-120, -110, 1680, 1120);
  const garden = gradient(c, 0, 50, 1350, 860, [
    [0, tint(palette.ground, -40)],
    [0.23, tint(palette.ground, -12)],
    [0.5, tint(palette.ground, 5)],
    [0.82, tint(palette.ground, -20)],
    [1, tint(palette.ground, -58)],
  ]);
  c.fillStyle = garden;
  c.fillRect(15, 65, 1425, 805);
  // Individually shaded diagonal paving creates depth without an image texture.
  c.save();
  c.beginPath();
  c.rect(15, 65, 1425, 805);
  c.clip();
  for (let row = -3; row < 26; row++)
    for (let col = -3; col < 20; col++) {
      const x = col * 89 + (row % 2) * 44.5,
        y = row * 31;
      const n = noise(row * 79 + col * 41),
        tone = Math.round(112 + n * 24);
      path(c, [
        [x, y - 30],
        [x + 43, y],
        [x, y + 29],
        [x - 43, y],
      ]);
      c.fillStyle = tint(palette.ground, tone - 123);
      c.fill();
      c.strokeStyle = 'rgba(69,65,47,.29)';
      c.lineWidth = 1.3;
      c.stroke();
      c.beginPath();
      c.moveTo(x - 41, y - 1);
      c.lineTo(x, y - 28);
      c.lineTo(x + 40, y - 1);
      c.strokeStyle = 'rgba(241,218,176,.2)';
      c.lineWidth = 1.6;
      c.stroke();
      if (n > 0.66) {
        c.beginPath();
        c.moveTo(x - 8, y - 22);
        c.lineTo(x + 2, y - 12);
        c.lineTo(x - 1, y - 1);
        c.lineTo(x + 8, y + 6);
        c.strokeStyle = 'rgba(63,71,53,.24)';
        c.lineWidth = 1;
        c.stroke();
      }
      if (n < 0.15) {
        ellipse(c, x - 26, y + 7, 11, 3, 'rgba(62,98,46,.33)');
        ellipse(c, x - 20, y + 11, 4, 2, 'rgba(84,113,55,.4)');
      }
    }
  c.restore();
  // Light pools and weathered paving imperfections are baked once.
  c.globalCompositeOperation = 'soft-light';
  ellipse(
    c,
    760,
    370,
    700,
    400,
    radial(c, 760, 370, 700, 'rgba(245,211,138,.43)', 'rgba(65,102,67,0)'),
  );
  c.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 480; i++) {
    const x = 25 + noise(i * 5) * 1380,
      y = 110 + noise(i * 7 + 77) * 720;
    ellipse(c, x, y, 0.5 + noise(i + 1) * 1.4, 0.4 + noise(i + 12), 'rgba(36,56,35,.15)');
  }
  // Low garden edging: the top and side walls are outside the playable arena.
  shadow(c, 735, 122, 710, 29, 0.4);
  for (let i = 0; i < 19; i++) {
    const x = 25 + i * 77;
    stone(c, x, 125, 75, 37, 49 + noise(i * 9) * 13, i * 8);
    if (i < 5 || i > 15 || i % 5 === 0)
      stone(c, x + 5, 74, 74, 36, 42 + noise(i + 45) * 20, i * 9 + 4);
    vinePatch(c, x + 10, 99, 64, i * 88);
  }
  for (let i = 0; i < 10; i++) {
    const y = 165 + i * 71;
    stone(c, 41, y, 60, 33, 45 + noise(i + 4) * 18, i + 120);
    stone(c, 1378, y, 62, 34, 43 + noise(i + 66) * 23, i + 234);
    if (i % 3 === 0) {
      stone(c, 40, y - 44, 61, 33, 53, i + 44);
      stone(c, 1378, y - 45, 62, 34, 55, i + 94);
    }
    vinePatch(c, 35, y - 27, 86, i * 71 + 55, true);
    vinePatch(c, 1410, y - 33, 92, i * 96 + 75, true);
  }
  // Tall corner piers with broken silhouettes.
  [
    [42, 148],
    [1345, 153],
    [24, 835],
    [1390, 846],
  ].forEach(([x, y], i) => {
    shadow(c, x, y, 63, 24, 0.5);
    for (let j = 0; j < 3; j++)
      stone(c, x + (j % 2) * 3, y - j * 49, 79, 47, j === 2 ? 56 : 49, i * 23 + j);
    vinePatch(c, x + 4, y - 141, 101, i * 37, true);
  });
  for (let i = 0; i < 34; i++) {
    const x = 76 + noise(i * 7) * 1280,
      y = i % 2 ? 809 + noise(i * 9) * 100 : 110 + noise(i * 9) * 27;
    vinePatch(c, x, y, 65 + noise(i) * 75, i * 29, true);
  }
  for (let i = 0; i < 22; i++) {
    const side = i % 2 === 0;
    const x = side ? 72 + noise(i * 17) * 25 : 1328 + noise(i * 17) * 25,
      y = 180 + noise(i * 7) * 560;
    if (i % 3 === 0) flower(c, x, y, 0.6 + noise(i) * 0.4, noise(i) * 6);
    else vinePatch(c, x, y, 48, i * 12);
  }
  for (let i = 0; i < 40; i++) {
    const x = 35 + noise(i * 29) * 1370,
      y = 805 + noise(i * 31) * 144;
    leaf(c, x, y, 35 + noise(i * 3) * 58, (noise(i * 2) - 0.5) * 2.5, '#173f34', '#436e43');
  }
  [
    [89, 260],
    [1327, 270],
    [91, 721],
    [1324, 737],
    [353, 123],
    [1091, 123],
  ].forEach(([x, y]) => torchBase(c, x, y));
  // A subtle arena crest gives the opening field a focal point.
  c.save();
  c.translate(720, 439);
  c.scale(1, 0.57);
  c.strokeStyle = 'rgba(211,206,163,.18)';
  c.lineWidth = 4;
  ellipse(c, 0, 0, 102, 102, null, 'rgba(216,209,165,.18)', 3);
  ellipse(c, 0, 0, 91, 91, null, 'rgba(72,86,57,.18)', 2);
  for (let i = 0; i < 8; i++) {
    c.save();
    c.rotate((i * TAU) / 8);
    path(c, [
      [0, -73],
      [10, -51],
      [0, -36],
      [-10, -51],
    ]);
    c.stroke();
    c.restore();
  }
  c.restore();
  drawMapLandmark(c, level);
  return canvas;
}

// Fixed rounded leaf clusters keep the control plant friendly and cheap to draw.
const SHRUB_CLUSTERS = [
  [-28, -28, 23, 20, '#548d53'],
  [0, -37, 25, 23, '#65a15b'],
  [29, -26, 23, 21, '#578f50'],
  [-40, -12, 18, 14, '#699f55'],
  [-15, -13, 25, 21, '#77ac5e'],
  [18, -12, 26, 22, '#6fa75a'],
  [42, -9, 17, 13, '#5d944e'],
];
const SHRUB_LEAVES = [
  [-30, -31, -0.5],
  [-4, -46, 0.4],
  [24, -29, 0.65],
  [-14, -17, -0.45],
  [19, -8, 0.5],
];
const SHRUB_FLOWERS = [
  [-23, -19],
  [15, -35],
];
function shrub(c, x, y, size = 1, age = 5, t = 0) {
  c.save();
  c.translate(x, y);
  const grow = clamp(age / 0.65, 0.05, 1);
  c.scale(size * grow, size * grow);
  ellipse(c, 3, 6, 58, 17, 'rgba(22,46,30,.22)');
  ellipse(c, 0, 2, 52, 15, 'rgba(135,194,99,.2)');
  c.rotate(Math.sin(t * 1.6 + x) * 0.015);
  for (const [cx, cy, rx, ry, color] of SHRUB_CLUSTERS) {
    ellipse(c, cx, cy, rx, ry, color);
    ellipse(c, cx - rx * 0.16, cy - ry * 0.4, rx * 0.64, ry * 0.43, 'rgba(179,216,131,.22)');
  }
  for (const [lx, ly, angle] of SHRUB_LEAVES) {
    c.save();
    c.translate(lx, ly);
    c.rotate(angle);
    ellipse(c, 0, 0, 7, 3.8, '#b2d582');
    c.restore();
  }
  for (const [fx, fy] of SHRUB_FLOWERS) {
    ellipse(c, fx - 3, fy, 3.5, 2.8, '#fff3ce');
    ellipse(c, fx + 3, fy, 3.5, 2.8, '#fff3ce');
    ellipse(c, fx, fy - 3, 2.8, 3.5, '#fff7dd');
    ellipse(c, fx, fy + 3, 2.8, 3.5, '#ffeabe');
    ellipse(c, fx, fy, 2.5, 2.5, '#edc36b');
  }
  c.restore();
}
function snowflake(c, x, y, radius, color = '#d7f8ff') {
  c.beginPath();
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI) / 3;
    const dx = Math.cos(angle) * radius,
      dy = Math.sin(angle) * radius;
    c.moveTo(x - dx, y - dy);
    c.lineTo(x + dx, y + dy);
  }
  c.strokeStyle = color;
  c.lineWidth = 2;
  c.stroke();
}
function droplet(c, x, y, radius, color) {
  c.beginPath();
  c.moveTo(x, y - radius);
  c.bezierCurveTo(x - radius * 1.6, y + radius * 0.5, x - radius * 0.7, y + radius, x, y + radius);
  c.bezierCurveTo(x + radius * 0.7, y + radius, x + radius * 1.6, y + radius * 0.5, x, y - radius);
  c.fillStyle = color;
  c.fill();
}
function terrain(c, plant, t = 0) {
  const radius = plant.radius || 60;
  const grow = clamp((plant.age ?? 5) / 0.55, 0.05, 1);
  c.save();
  c.globalAlpha *= clamp(((plant.life ?? 99) - (plant.age ?? 5)) / 1.5, 0, 1);
  c.translate(plant.x, plant.y);
  c.scale(grow, grow);
  if (plant.kind === 'trench') {
    // The rim follows the same 0.45 ellipse as the simulation's ditch.
    ellipse(c, 0, 0, radius, radius * 0.45, '#a8875e', '#d6b585', 3);
    ellipse(c, 0, 2, radius * 0.9, radius * 0.35, '#635443');
    ellipse(c, 0, 7, radius * 0.75, radius * 0.23, '#7c6850');
    for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * radius * 0.26;
      ellipse(c, x, Math.sin(i * 2) * radius * 0.14, 6, 3, '#a58b62');
    }
    c.strokeStyle = '#d1b082';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-radius * 0.6, -radius * 0.19);
    c.lineTo(-radius * 0.54, -radius * 0.33);
    c.moveTo(radius * 0.3, -radius * 0.25);
    c.lineTo(radius * 0.33, -radius * 0.4);
    c.stroke();
  } else if (plant.kind === 'frost') {
    ellipse(c, 0, 0, radius, radius, 'rgba(123,215,247,.24)', '#9bdfef', 2);
    ellipse(c, 0, 0, radius * 0.73, radius * 0.73, 'rgba(179,239,250,.18)');
    c.beginPath();
    c.moveTo(-radius * 0.82, radius * 0.12);
    c.lineTo(-radius * 0.15, -radius * 0.23);
    c.lineTo(radius * 0.65, radius * 0.37);
    c.moveTo(-radius * 0.15, -radius * 0.23);
    c.lineTo(radius * 0.2, -radius * 0.79);
    c.strokeStyle = 'rgba(225,251,255,.65)';
    c.lineWidth = 2;
    c.stroke();
    for (let i = 0; i < 4; i++) {
      const angle = (i * TAU) / 4 + 0.4;
      snowflake(c, Math.cos(angle) * radius * 0.56, Math.sin(angle) * radius * 0.54, 5, '#d9f8ff');
    }
  } else if (plant.kind === 'poison') {
    ellipse(c, 0, 0, radius, radius, 'rgba(141,106,171,.25)', '#bbaa87', 2);
    ellipse(c, -radius * 0.18, radius * 0.08, radius * 0.72, radius * 0.67, 'rgba(181,152,196,.2)');
    for (let i = 0; i < 6; i++) {
      const angle = (i * TAU) / 6 + 0.4;
      const pulse = Math.sin(t * 2 + i) * 1.3;
      ellipse(
        c,
        Math.cos(angle) * radius * 0.6,
        Math.sin(angle) * radius * 0.55,
        4 + pulse,
        4 + pulse,
        'rgba(229,214,163,.55)',
      );
    }
    for (const side of [-1, 1]) {
      const x = side * radius * 0.4,
        y = side * radius * 0.25;
      ellipse(c, x - 5, y + 4, 7, 3, '#90ad73');
      ellipse(c, x + 5, y + 4, 7, 3, '#a9c17f');
      ellipse(c, x - 3, y - 2, 4, 3, '#ddcae5');
      ellipse(c, x + 3, y - 2, 4, 3, '#ddcae5');
      ellipse(c, x, y - 5, 3, 4, '#e8d7ee');
      ellipse(c, x, y - 1, 2.5, 2.5, '#e9df9b');
    }
    droplet(c, 0, -2, Math.min(10, radius * 0.15), '#c6dfa0');
  }
  c.restore();
}
function wagon(c, x, y, angle = 0, progress = 0, size = 1) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.scale(size, size);
  ellipse(c, 0, 4, 47, 16, 'rgba(26,39,31,.23)');
  // A timber cart: slatted box, two spoked wheels, and a leading drawbar.
  c.strokeStyle = '#e4c58c';
  c.lineWidth = 5;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(26, -7);
  c.lineTo(49, -5);
  c.stroke();
  path(c, [
    [-31, -36],
    [27, -36],
    [23, -3],
    [-27, -3],
  ]);
  c.fillStyle = '#b9824d';
  c.fill();
  c.strokeStyle = '#e6bc79';
  c.lineWidth = 3;
  c.stroke();
  c.fillStyle = '#dfb16d';
  c.fillRect(-29, -29, 55, 6);
  c.fillRect(-27, -14, 51, 5);
  c.strokeStyle = '#785737';
  c.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.moveTo(-18 + i * 17, -35);
    c.lineTo(-16 + i * 16, -4);
    c.stroke();
  }
  for (const wx of [-19, 19]) {
    ellipse(c, wx, 1, 12, 12, '#5a4d3d', '#e3c08b', 3);
    c.beginPath();
    for (let j = 0; j < 3; j++) {
      const a = progress * 17 + (j * Math.PI) / 3;
      c.moveTo(wx - Math.cos(a) * 9, 1 - Math.sin(a) * 9);
      c.lineTo(wx + Math.cos(a) * 9, 1 + Math.sin(a) * 9);
    }
    c.strokeStyle = '#e4be7b';
    c.lineWidth = 2;
    c.stroke();
    ellipse(c, wx, 1, 3, 3, '#f5d795');
  }
  c.strokeStyle = '#83be91';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(5, -36);
  c.lineTo(5, -59);
  c.stroke();
  path(c, [
    [5, -59],
    [28, -52],
    [5, -45],
  ]);
  c.fillStyle = '#b7db98';
  c.fill();
  c.restore();
}
function warhorse(c, x, y, angle = 0, progress = 0, size = 1) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.scale(size, size);
  ellipse(c, -2, 5, 46, 14, 'rgba(26,39,31,.23)');
  const stride = Math.sin(progress * 20) * 12;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = '#704b36';
  c.lineWidth = 8;
  c.beginPath();
  c.moveTo(-24, -22);
  c.quadraticCurveTo(-41, -34, -44, -13);
  c.stroke();
  for (let i = 0; i < 4; i++) {
    const back = i < 2,
      baseX = back ? -20 : 18,
      swing = (i % 2 ? -1 : 1) * stride;
    c.strokeStyle = i % 2 ? '#855a3b' : '#b68557';
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(baseX, -16);
    c.lineTo(baseX + swing * 0.55, -4);
    c.lineTo(baseX + swing, 8);
    c.stroke();
    c.strokeStyle = '#f2d8a2';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(baseX + swing - 3, 8);
    c.lineTo(baseX + swing + 3, 8);
    c.stroke();
  }
  ellipse(c, -3, -28, 31, 17, '#bc8a59');
  path(c, [
    [12, -35],
    [19, -63],
    [34, -66],
    [36, -45],
    [23, -20],
  ]);
  c.fillStyle = '#c39463';
  c.fill();
  path(c, [
    [14, -39],
    [18, -65],
    [27, -70],
    [22, -50],
  ]);
  c.fillStyle = '#684b36';
  c.fill();
  ellipse(c, 34, -62, 15, 10, '#d2a576');
  ellipse(c, 44, -59, 9, 7, '#ead1a0');
  path(c, [
    [23, -69],
    [25, -83],
    [32, -71],
    [36, -78],
    [37, -67],
  ]);
  c.fillStyle = '#bd925e';
  c.fill();
  ellipse(c, 36, -65, 2, 2, '#303932');
  c.fillStyle = '#658e7a';
  c.fillRect(-13, -44, 27, 16);
  c.strokeStyle = '#d9dcb0';
  c.lineWidth = 3;
  c.strokeRect(-13, -44, 27, 16);
  c.restore();
}
function directionArrow(c, x, y, angle, color, size = 10) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.beginPath();
  c.moveTo(-size, -size * 0.65);
  c.lineTo(0, 0);
  c.lineTo(-size, size * 0.65);
  c.strokeStyle = color;
  c.lineWidth = 3;
  c.stroke();
  c.restore();
}
function skillEffect(c, effect, t) {
  const definition = CONTENT.SKILLS?.[effect.kind] || {};
  const duration = Math.max(0.01, effect.life || definition.duration || 1);
  const progress = clamp((effect.age || 0) / duration, 0, 1);
  const radius = effect.radius || definition.radius || 90;
  const color = definition.color || '#ffe4a4';
  const angle = Math.atan2(effect.dy || 0, effect.dx ?? 1);
  c.save();
  if (effect.kind === 'blast') {
    const delay = effect.delay ?? definition.delay ?? duration * 0.4;
    const detonated = effect.triggered === true || (effect.age || 0) >= delay;
    if (!detonated) {
      ellipse(c, effect.x, effect.y, radius, radius, 'rgba(255,191,96,.1)', '#f4c67c', 2);
      c.setLineDash([8, 7]);
      ellipse(c, effect.x, effect.y, radius * 0.8, radius * 0.8, null, '#ffe8b2', 2);
      c.setLineDash([]);
      const countdown = clamp((effect.age || 0) / Math.max(delay, 0.01), 0, 1);
      c.beginPath();
      c.arc(effect.x, effect.y, 17, -Math.PI / 2, -Math.PI / 2 + TAU * countdown);
      c.strokeStyle = '#fff4c7';
      c.lineWidth = 4;
      c.stroke();
      ellipse(c, effect.x, effect.y, 6, 6, '#ffe4a5');
    } else {
      const burst = clamp(((effect.age || 0) - delay) / Math.max(0.01, duration - delay), 0, 1);
      c.globalAlpha *= 1 - burst;
      ellipse(c, effect.x, effect.y, radius, radius, 'rgba(255,197,98,.24)', '#ffe7a7', 3);
      ellipse(
        c,
        effect.x,
        effect.y,
        radius * (0.25 + burst * 0.65),
        radius * (0.25 + burst * 0.65),
        'rgba(255,237,176,.26)',
        '#fff1b5',
        4,
      );
      for (let i = 0; i < 10; i++) {
        const a = (i * TAU) / 10,
          inner = radius * (0.3 + burst * 0.3),
          outer = radius * (0.7 + burst * 0.3);
        c.beginPath();
        c.moveTo(effect.x + Math.cos(a) * inner, effect.y + Math.sin(a) * inner);
        c.lineTo(effect.x + Math.cos(a) * outer, effect.y + Math.sin(a) * outer);
        c.strokeStyle = '#ffe9ab';
        c.lineWidth = 4;
        c.stroke();
      }
    }
  } else if (effect.kind === 'gale') {
    c.globalAlpha *= Math.min(1, (1 - progress) * 5);
    ellipse(c, effect.x, effect.y, radius, radius, 'rgba(144,221,194,.1)', '#acd7bb', 1.5);
    for (let i = 0; i < 4; i++) {
      const a = t * 3 + (i * TAU) / 4,
        r = radius * (0.36 + i * 0.16);
      c.beginPath();
      c.arc(effect.x, effect.y, r, a, a + 1.35);
      c.strokeStyle = i % 2 ? '#e2f5c7' : '#a8dfd2';
      c.lineWidth = 3;
      c.stroke();
      directionArrow(
        c,
        effect.x + Math.cos(a + 1.35) * r,
        effect.y + Math.sin(a + 1.35) * r,
        a + 1.35 + Math.PI / 2,
        '#e2f5c7',
        7,
      );
    }
  } else if (effect.kind === 'cart' || effect.kind === 'horse') {
    c.globalAlpha *= Math.min(1, (1 - progress) * 6);
    c.save();
    c.translate(effect.x, effect.y);
    c.rotate(angle);
    c.strokeStyle = color;
    c.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.moveTo(-54 - i * 8, -22 + i * 16);
      c.lineTo(-80 - i * 8, -22 + i * 16);
      c.stroke();
    }
    c.restore();
    if (effect.kind === 'cart') wagon(c, effect.x, effect.y, angle, effect.age || 0);
    else warhorse(c, effect.x, effect.y, angle, effect.age || 0);
  } else if (effect.kind === 'laser') {
    const startX = effect.startX ?? effect.x,
      startY = effect.startY ?? effect.y;
    const length = effect.length || definition.range || 500;
    const endX = effect.targetX ?? startX + Math.cos(angle) * length;
    const endY = effect.targetY ?? startY + Math.sin(angle) * length;
    const width = effect.width || definition.width || 30;
    c.globalAlpha *= Math.min(1, (1 - progress) * 5);
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(startX, startY);
    c.lineTo(endX, endY);
    c.strokeStyle = 'rgba(255,228,142,.2)';
    c.lineWidth = width;
    c.stroke();
    c.strokeStyle = '#ffe997';
    c.lineWidth = Math.max(5, width * 0.28);
    c.stroke();
    c.strokeStyle = '#fff2da';
    c.lineWidth = 3;
    c.stroke();
    const pulse = ((effect.age || 0) * 3) % 1;
    ellipse(c, startX + (endX - startX) * pulse, startY + (endY - startY) * pulse, 6, 6, '#fff6d2');
    ellipse(c, startX, startY, 11, 11, '#fff0cf', '#e9d47c', 3);
    directionArrow(c, endX, endY, angle, '#fff5d6', 11);
  }
  c.restore();
}
const STATUS_MARKERS = [
  ['frozen', '#a2e5f6'],
  ['poison', '#c3dc90'],
  ['stunned', '#f5d27a'],
  ['feared', '#ddc4ed'],
  ['vulnerable', '#f5b5ca'],
];
function enemyStatus(c, enemy, size, t) {
  // Gun elements are independent of boon/skill debuffs and never enter the atlas key.
  if (enemy.chillTime > 0)
    ellipse(
      c,
      enemy.x,
      enemy.y,
      32 * size,
      11 * size,
      'rgba(99,206,255,.16)',
      'rgba(147,231,255,.6)',
      1.5,
    );
  if (enemy.burnTime > 0) {
    for (let i = 0; i < 3; i++) {
      const x = enemy.x + (i - 1) * 17 * size;
      const y = enemy.y + (-7 + Math.sin(t * 12 + i * 2) * 3) * size;
      ellipse(c, x, y, 5 * size, 12 * size, '#f49445');
      ellipse(c, x, y + 3 * size, 2.5 * size, 6 * size, '#ffdf8e');
    }
  }
  if (enemy.frozen > 0) {
    ellipse(
      c,
      enemy.x,
      enemy.y - 23 * size,
      28 * size,
      32 * size,
      'rgba(137,219,247,.22)',
      '#b2e8f5',
      1.5,
    );
  }
  let count = 0;
  for (const [key] of STATUS_MARKERS) if (enemy[key] > 0) count++;
  if (!count) return;
  let index = 0;
  for (const [key, color] of STATUS_MARKERS) {
    if (!(enemy[key] > 0)) continue;
    const x = enemy.x + (index++ - (count - 1) / 2) * 16,
      y = enemy.y - 91 * size;
    ellipse(c, x, y, 7, 7, '#354d42', color, 1);
    if (key === 'frozen') snowflake(c, x, y, 4.5, color);
    else if (key === 'poison') droplet(c, x, y - 1, 3.5, color);
    else if (key === 'stunned') {
      c.save();
      c.translate(x, y);
      c.rotate(t * 2);
      path(c, [
        [0, -5],
        [2, -2],
        [5, 0],
        [2, 2],
        [0, 5],
        [-2, 2],
        [-5, 0],
        [-2, -2],
      ]);
      c.fillStyle = color;
      c.fill();
      c.restore();
    } else if (key === 'feared') {
      c.fillStyle = color;
      c.fillRect(x - 1, y - 4, 2, 5);
      ellipse(c, x, y + 3, 1.2, 1.2, color);
    } else {
      path(c, [
        [x, y - 4],
        [x + 4, y],
        [x, y + 4],
        [x - 4, y],
      ]);
      c.strokeStyle = color;
      c.lineWidth = 1.5;
      c.stroke();
    }
  }
}

function thorn(c, x, y, size = 1, age = 5, t = 0) {
  c.save();
  c.translate(x, y);
  c.scale(size, size);
  const grow = clamp(age / 0.65, 0.05, 1);
  c.scale(grow, grow);
  shadow(c, 0, 0, 60, 22, 0.4);
  ellipse(c, 0, 0, 48, 15, 'rgba(62,108,46,.16)');
  for (let i = 0; i < 7; i++)
    leaf(c, -37 + i * 12, 5 + (i % 2) * 3, 17 + (i % 3) * 3, (i - 3) * 0.28, '#3e7037', '#779344');
  const vines = [
    [
      [-44, 0],
      [-61, -27],
      [-24, -46],
      [-8, -32],
      [10, -9],
      [-16, 10],
      [-38, -1],
    ],
    [
      [-20, 8],
      [15, 22],
      [49, 3],
      [36, -25],
      [24, -52],
      [-4, -46],
      [-7, -28],
    ],
    [
      [13, 8],
      [55, 9],
      [59, -21],
      [40, -36],
      [21, -48],
      [10, -26],
      [32, -19],
    ],
  ];
  vines.forEach((p, i) => {
    c.beginPath();
    c.moveTo(...p[0]);
    c.bezierCurveTo(...p[1], ...p[2], ...p[3]);
    c.bezierCurveTo(...p[4], ...p[5], ...p[6]);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = 19;
    c.strokeStyle = '#355f2c';
    c.stroke();
    c.lineWidth = 14;
    c.strokeStyle = gradient(c, 0, -44, 0, 12, [
      [0, '#75a43e'],
      [0.35, '#568e35'],
      [1, '#3b772e'],
    ]);
    c.stroke();
    c.save();
    c.translate(-2, -3);
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(176,205,85,.45)';
    c.stroke();
    c.restore();
  });
  const spikes = [
    [-44, -18, -1],
    [-29, -32, -0.45],
    [-8, -23, 0.8],
    [-27, 6, 2.5],
    [14, 11, 2.8],
    [38, -2, 1.6],
    [29, -35, -0.2],
    [7, -39, -0.75],
    [47, -25, 0.9],
    [33, -28, -0.25],
    [-53, -7, -1.3],
  ];
  spikes.forEach(([sx, sy, a], i) => {
    c.save();
    c.translate(sx, sy);
    c.rotate(a);
    path(c, [
      [-4, 2],
      [0, -12 - (i % 3) * 2],
      [5, 1],
    ]);
    c.fillStyle = gradient(c, -3, 0, 3, -12, [
      [0, '#c4a24e'],
      [0.5, '#edcf76'],
      [1, '#fff3b0'],
    ]);
    c.fill();
    c.restore();
  });
  leaf(c, -11, -34, 20, -0.8 + Math.sin(t * 1.6 + x) * 0.04, '#4f8735', '#8daf47');
  leaf(c, 34, -4, 16, 1.2, '#416f2e', '#84a53e');
  c.restore();
}
function crystal(c, x, y, width, height, tilt = 0) {
  c.save();
  c.translate(x, y);
  c.rotate(tilt);
  path(c, [
    [0, -height],
    [-width * 0.53, -height * 0.63],
    [-width * 0.38, -4],
    [0, 3],
    [width * 0.43, -6],
    [width * 0.5, -height * 0.66],
  ]);
  c.fillStyle = gradient(c, -width / 2, 0, width / 2, -height, [
    [0, '#199ddd'],
    [0.45, '#46c7ff'],
    [1, '#caf8ff'],
  ]);
  c.fill();
  c.strokeStyle = '#bcf4ff';
  c.lineWidth = 1.3;
  c.stroke();
  path(c, [
    [0, -height],
    [0, 3],
    [width * 0.43, -6],
    [width * 0.5, -height * 0.66],
  ]);
  c.fillStyle = 'rgba(20,122,211,.58)';
  c.fill();
  path(c, [
    [0, -height],
    [-width * 0.53, -height * 0.63],
    [0, -height * 0.51],
    [width * 0.5, -height * 0.66],
  ]);
  c.fillStyle = 'rgba(184,244,255,.65)';
  c.fill();
  path(c, [
    [0, -height * 0.51],
    [-width * 0.53, -height * 0.63],
    [-width * 0.38, -4],
    [0, 3],
  ]);
  c.fillStyle = 'rgba(82,199,248,.45)';
  c.fill();
  c.beginPath();
  c.moveTo(0, -height);
  c.lineTo(0, 2);
  c.moveTo(-width * 0.5, -height * 0.62);
  c.lineTo(0, -height * 0.51);
  c.lineTo(width * 0.48, -height * 0.66);
  c.strokeStyle = 'rgba(204,251,255,.8)';
  c.lineWidth = 1.2;
  c.stroke();
  c.beginPath();
  c.moveTo(-width * 0.3, -height * 0.57);
  c.lineTo(-width * 0.21, -height * 0.13);
  c.strokeStyle = 'rgba(255,255,255,.7)';
  c.lineWidth = 2;
  c.stroke();
  c.restore();
}
function ice(c, x, y, size = 1, age = 5, t = 0) {
  c.save();
  c.translate(x, y);
  c.scale(size, size);
  const grow = clamp(age / 0.55, 0.1, 1);
  c.scale(grow, grow);
  shadow(c, 0, 2, 45, 17, 0.4);
  ellipse(c, 0, 0, 43, 14, radial(c, 0, 0, 43, 'rgba(75,202,255,.4)', 'rgba(98,212,255,0)'));
  crystal(c, -24, -4, 17, 46, -0.22);
  crystal(c, 24, 0, 18, 49, 0.2);
  crystal(c, 3, -1, 31, 83, 0.04);
  crystal(c, -14, 8, 17, 41, -0.12);
  crystal(c, 15, 8, 16, 35, 0.19);
  for (let i = 0; i < 5; i++) {
    const xx = -32 + i * 16;
    path(c, [
      [xx, 5],
      [xx + 7, 1],
      [xx + 11, 7],
      [xx + 4, 10],
    ]);
    c.fillStyle = i % 2 ? '#8dd8e9' : '#b5edf2';
    c.fill();
  }
  for (let i = 0; i < 3; i++) {
    const p = (t * 0.45 + i * 0.31) % 1;
    const xx = Math.sin(i * 11 + x) * 27;
    star(
      c,
      xx,
      -12 - p * 76,
      2 + Math.sin(p * Math.PI) * 1.5,
      `rgba(196,246,255,${Math.sin(p * Math.PI) * 0.8})`,
    );
  }
  c.restore();
}
function mushroom(c, x, y, size = 1, age = 5, t = 0) {
  c.save();
  c.translate(x, y);
  c.scale(size, size);
  const grow = clamp(age / 0.6, 0.1, 1);
  c.scale(grow, grow);
  shadow(c, 0, 0, 38, 16, 0.35);
  ellipse(c, 0, -13, 51, 39, radial(c, 0, -13, 51, 'rgba(255,165,55,.21)', 'rgba(255,180,70,0)'));
  for (let i = 0; i < 6; i++) leaf(c, -27 + i * 11, 6, 12, (i - 2.5) * 0.5, '#6a7140', '#989046');
  c.beginPath();
  c.moveTo(-10, -36);
  c.bezierCurveTo(-11, -23, -7, -12, -15, -3);
  c.quadraticCurveTo(-3, 7, 14, -3);
  c.bezierCurveTo(9, -14, 8, -25, 11, -37);
  c.closePath();
  c.fillStyle = gradient(c, -13, 0, 12, -30, [
    [0, '#ba6e28'],
    [0.35, '#e4a54c'],
    [0.65, '#ffe5a0'],
    [1, '#dc9b48'],
  ]);
  c.fill();
  c.strokeStyle = '#be742a';
  c.lineWidth = 1.5;
  c.stroke();
  ellipse(c, 0, -31, 32, 10, '#c66823');
  ellipse(c, 0, -31, 25, 7, '#ffd393');
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.moveTo(0, -31);
    c.lineTo(-24 + i * 10, -29);
    c.strokeStyle = 'rgba(165,80,25,.3)';
    c.lineWidth = 1;
    c.stroke();
  }
  c.beginPath();
  c.moveTo(-34, -33);
  c.bezierCurveTo(-35, -55, -20, -72, 0, -73);
  c.bezierCurveTo(24, -72, 37, -51, 34, -33);
  c.quadraticCurveTo(0, -18, -34, -33);
  c.fillStyle = gradient(c, -15, -74, 20, -23, [
    [0, '#ffe59c'],
    [0.2, '#ffc057'],
    [0.6, '#f88a23'],
    [1, '#d96113'],
  ]);
  c.fill();
  c.strokeStyle = '#dd8c35';
  c.lineWidth = 1.5;
  c.stroke();
  [
    [-16, -58, 8, 7],
    [12, -57, 7, 9],
    [25, -40, 6, 7],
    [-26, -39, 6, 5],
    [0, -37, 8, 6],
  ].forEach(([xx, yy, rx, ry]) =>
    ellipse(
      c,
      xx,
      yy,
      rx,
      ry,
      gradient(c, xx, yy - ry, xx, yy + ry, [
        [0, '#fff6bc'],
        [1, '#ffe2a0'],
      ]),
    ),
  );
  c.beginPath();
  c.moveTo(-23, -61);
  c.quadraticCurveTo(-12, -72, 1, -71);
  c.strokeStyle = 'rgba(255,246,188,.58)';
  c.lineWidth = 3;
  c.stroke();
  if (age > 1) {
    ellipse(c, 0, -16, 4, 3, 'rgba(255,224,144,.7)');
    star(c, -28, -52 + Math.sin(t * 2) * 4, 2, 'rgba(255,233,169,.7)');
  }
  c.restore();
}
function star(c, x, y, r, color) {
  c.strokeStyle = color;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(x - r, y);
  c.lineTo(x + r, y);
  c.moveTo(x, y - r * 1.35);
  c.lineTo(x, y + r * 1.35);
  c.stroke();
}

function monster(c, enemy, t, sprite = false, healthbarBounds = null) {
  drawEnemy(c, enemy, t, ENEMIES[enemy.kind], sprite, healthbarBounds);
}
function healthbar(c, x, y, width, fraction, color) {
  c.fillStyle = 'rgba(19,31,28,.85)';
  c.fillRect(x - width / 2 - 2, y - 2, width + 4, 8);
  c.fillStyle = color;
  c.fillRect(x - width / 2, y, width * clamp(fraction, 0, 1), 4);
  c.fillStyle = 'rgba(255,231,169,.4)';
  c.fillRect(x - width / 2, y, width * clamp(fraction, 0, 1), 1);
}
function player(c, p, t, portrait = false) {
  const a = p.angle || 0;
  const facingLeft = Math.cos(a) < 0;
  const dir = facingLeft ? -1 : 1;
  c.save();
  c.translate(p.x, p.y);
  if (!portrait) shadow(c, 0, 0, 29, 11, 0.47);
  if (p.invulnerable > 0 && !portrait) {
    ellipse(c, 0, -24, 31, 40, null, `rgba(161,235,208,${0.35 + Math.sin(t * 24) * 0.25})`, 2);
  }
  if (p.invulnerable > 0 && Math.sin(t * 30) > 0.6) c.globalAlpha = 0.65;
  const bob = portrait ? 0 : Math.sin(t * 7) * 1.1;
  c.translate(0, bob);
  // Scarf's long, waving tail and deep shadow under the head.
  c.beginPath();
  c.moveTo(-dir * 8, -38);
  c.bezierCurveTo(-dir * 23, -41, -dir * 35, -51 + Math.sin(t * 5) * 4, -dir * 48, -43);
  c.lineTo(-dir * 39, -32);
  c.lineTo(-dir * 48, -23);
  c.quadraticCurveTo(-dir * 28, -26, -dir * 8, -28);
  c.closePath();
  c.fillStyle = gradient(c, -dir * 40, -48, -dir * 12, -25, [
    [0, '#eb6051'],
    [0.45, '#bf3830'],
    [1, '#7c2925'],
  ]);
  c.fill();
  c.strokeStyle = '#69291f';
  c.lineWidth = 1.3;
  c.stroke();
  c.beginPath();
  c.moveTo(-10, -8);
  c.lineTo(-15, 2);
  c.lineTo(-8, 4);
  c.lineTo(-1, -6);
  c.moveTo(6, -8);
  c.lineTo(12, 2);
  c.lineTo(20, 1);
  c.lineTo(13, -12);
  c.strokeStyle = '#1f2a2d';
  c.lineWidth = 9;
  c.lineCap = 'round';
  c.stroke();
  c.beginPath();
  c.moveTo(-13, -34);
  c.quadraticCurveTo(-16, -22, -11, -9);
  c.quadraticCurveTo(0, -4, 14, -12);
  c.lineTo(10, -35);
  c.closePath();
  c.fillStyle = gradient(c, -14, -29, 15, -8, [
    [0, '#455151'],
    [0.5, '#263435'],
    [1, '#182b2c'],
  ]);
  c.fill();
  c.strokeStyle = '#172727';
  c.lineWidth = 1.5;
  c.stroke();
  path(c, [
    [-9, -33],
    [-5, -17],
    [2, -15],
    [6, -34],
  ]);
  c.fillStyle = '#e6ddba';
  c.fill();
  c.save();
  c.translate(dir * 2, -20);
  c.rotate(-dir * 0.4);
  c.fillStyle = '#9b7552';
  c.fillRect(-12, -1, 24, 4);
  c.fillStyle = '#e0bc70';
  c.fillRect(-2, -2, 5, 6);
  c.restore();
  // Ear and face use warm skin shading against the pale hair.
  ellipse(c, -dir * 17, -46, 5, 7, '#e5ac86');
  ellipse(
    c,
    0,
    -47,
    19,
    20,
    gradient(c, -11, -60, 13, -30, [
      [0, '#fff1cf'],
      [0.5, '#f2c298'],
      [1, '#db9876'],
    ]),
  );
  c.strokeStyle = '#92685a';
  c.lineWidth = 0.8;
  c.stroke();
  c.save();
  c.translate(dir * 5, -45);
  ellipse(c, -5, -1, 3.1, 5, '#2f3034');
  ellipse(c, 8, -1, 3.3, 5.2, '#2f3034');
  ellipse(c, -4, -3, 1.1, 1.8, '#fff9da');
  ellipse(c, 9, -3, 1.1, 1.8, '#fff9da');
  ellipse(c, -9, 5, 3, 1.5, 'rgba(224,125,111,.4)');
  ellipse(c, 11, 5, 3, 1.5, 'rgba(224,125,111,.4)');
  c.beginPath();
  c.moveTo(1, 9);
  c.quadraticCurveTo(4, 11, 7, 8);
  c.strokeStyle = '#8e5b4f';
  c.lineWidth = 1;
  c.stroke();
  c.restore();
  // Deliberately irregular chunky locks: a recognizable white-haired gardener.
  path(c, [
    [-20, -45],
    [-27, -51],
    [-22, -56],
    [-27, -60],
    [-19, -63],
    [-17, -70],
    [-8, -70],
    [-10, -78],
    [1, -74],
    [9, -79],
    [13, -72],
    [23, -70],
    [21, -64],
    [28, -60],
    [22, -54],
    [22, -43],
    [16, -48],
    [14, -59],
    [7, -50],
    [2, -61],
    [-5, -49],
    [-8, -57],
    [-16, -45],
    [-17, -53],
  ]);
  c.fillStyle = gradient(c, -13, -79, 18, -44, [
    [0, '#fff4e5'],
    [0.36, '#e8e6e2'],
    [0.75, '#bebbc4'],
    [1, '#979ba9'],
  ]);
  c.fill();
  c.strokeStyle = '#686c76';
  c.lineWidth = 1.5;
  c.lineJoin = 'round';
  c.stroke();
  c.beginPath();
  c.moveTo(-18, -61);
  c.quadraticCurveTo(-9, -70, -2, -68);
  c.moveTo(4, -70);
  c.lineTo(13, -65);
  c.strokeStyle = 'rgba(255,255,255,.66)';
  c.lineWidth = 2;
  c.stroke();
  c.beginPath();
  c.moveTo(-12, -34);
  c.quadraticCurveTo(1, -26, 14, -34);
  c.lineWidth = 8;
  c.strokeStyle = '#ac3028';
  c.stroke();
  c.lineWidth = 3;
  c.strokeStyle = '#eb7253';
  c.stroke();
  // A dark brass garden blaster follows the actual aiming direction.
  if (!portrait) {
    const gunAngle = clamp(Math.sin(a) * 0.35, -0.35, 0.35);
    c.save();
    c.translate(dir * 8, -26);
    c.scale(dir, 1);
    c.rotate(gunAngle * dir);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(10, 3);
    c.lineTo(16, -3);
    c.strokeStyle = '#edbc94';
    c.lineWidth = 7;
    c.stroke();
    path(c, [
      [9, -10],
      [32, -10],
      [34, -3],
      [22, -1],
      [18, 7],
      [11, 5],
      [13, -1],
      [8, -2],
    ]);
    c.fillStyle = gradient(c, 0, -10, 0, 6, [
      [0, '#746657'],
      [0.45, '#443a33'],
      [1, '#242f30'],
    ]);
    c.fill();
    c.strokeStyle = '#202b2b';
    c.lineWidth = 1.5;
    c.stroke();
    c.fillStyle = '#c09550';
    c.fillRect(12, -9, 13, 3);
    c.fillStyle = '#b65874';
    c.fillRect(28, -10, 5, 7);
    c.fillStyle = '#efabde';
    c.fillRect(32, -8, 4, 3);
    c.restore();
  }
  c.restore();
}

function seedProjectile(c, b, t) {
  const kind = b.element || b.kind || 'normal';
  const angle = Math.atan2(b.vy || 0, b.vx || 1);
  c.save();
  c.translate(b.x, b.y - 10);
  c.rotate(angle);
  if (b.generation > 0 || b.kind === 'split') c.scale(0.68, 0.68);
  const hostile = kind === 'hostile' || kind === 'enemy' || b.source === 'enemy';
  const color = hostile
    ? '#ff785a'
    : b.source === 'pet'
      ? '#ffdb79'
      : b.source === 'plant'
        ? '#ffb0e5'
        : COLORS[kind] || '#ff9b72';
  c.globalAlpha = 0.7;
  c.fillStyle = gradient(c, -30, 0, 5, 0, [
    [0, 'rgba(255,155,224,0)'],
    [1, color],
  ]);
  path(c, [
    [-30, -1],
    [0, -3],
    [8, 0],
    [0, 3],
    [-30, 1],
  ]);
  c.fill();
  c.globalAlpha = 1;
  c.shadowColor = color;
  c.shadowBlur = kind === 'normal' ? 11 : 16;
  if (hostile) {
    ellipse(c, 0, 0, 8, 8, '#752742', '#ffac73', 2);
    ellipse(c, 1, 0, 4, 4, '#ffc36e');
    path(c, [
      [-3, -11],
      [3, -10],
      [0, -6],
    ]);
    c.fillStyle = '#ff7863';
    c.fill();
  } else if (b.source === 'pet') {
    path(c, [
      [10, 0],
      [0, -5],
      [-7, 0],
      [0, 5],
    ]);
    c.fillStyle = '#ffeaa9';
    c.fill();
  } else if (kind === 'ice' || kind === 'stormreed') {
    path(c, [
      [12, 0],
      [-3, -6],
      [-8, 0],
      [-3, 6],
    ]);
    c.fillStyle = '#b5f4ff';
    c.fill();
    c.strokeStyle = '#4dccff';
    c.lineWidth = 2;
    c.stroke();
  } else if (kind === 'mushroom' || kind === 'explosive') {
    ellipse(c, 0, 0, 8, 7, '#71462b', '#ffd081', 1.5);
    ellipse(c, 0, 0, 5, 5, '#ffc263');
    ellipse(c, 2, -2, 2, 2, '#fff1a2');
  } else {
    c.beginPath();
    c.moveTo(11, 0);
    c.bezierCurveTo(-1, -9, -9, -4, -7, 0);
    c.bezierCurveTo(-8, 5, 0, 6, 11, 0);
    c.fillStyle = color;
    c.fill();
    c.beginPath();
    c.moveTo(6, 0);
    c.lineTo(-4, 0);
    c.strokeStyle = '#fff2e8';
    c.lineWidth = 1.5;
    c.stroke();
  }
  if (kind === 'fire') {
    path(c, [
      [-3, -4],
      [-15 - Math.sin(t * 22) * 4, 0],
      [-3, 4],
    ]);
    c.fillStyle = '#ffc46e';
    c.fill();
  }
  if (b.reflected) ellipse(c, 0, 0, 11, 9, null, '#f6df99', 1.2);
  c.restore();
}
function explosion(c, p, t) {
  const progress = clamp(1 - p.life / 0.38, 0, 1);
  const size = (0.35 + progress * 0.85) * clamp((p.radius || 124) / 124, 0.3, 1.25);
  c.save();
  c.translate(p.x, p.y - 12);
  c.scale(size, size);
  c.globalAlpha = 1 - progress * 0.9;
  // Explosive/split gun builds create many bursts: flat layers avoid rebuilding
  // gradients or allocating a blurred surface for every smoke puff every frame.
  ellipse(c, 0, -20, 116, 86, 'rgba(255,205,112,.13)');
  ellipse(c, 0, -20, 92, 66, 'rgba(255,200,98,.15)');
  for (let i = 0; i < 6; i++) {
    const angle = (i * TAU) / 6;
    ellipse(c, Math.cos(angle) * 53, -24 + Math.sin(angle) * 35, 30, 29, '#ae7e4c');
    ellipse(c, Math.cos(angle) * 37, -25 + Math.sin(angle) * 26, 25, 25, '#ffc467');
  }
  ellipse(c, 0, -23, 36, 33, '#ffe6a0');
  ellipse(c, -6, -28, 22, 21, '#fff3c6');
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i * TAU) / 6 + t,
      radius = 75 + progress * 24;
    c.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.67 - 20);
    c.lineTo(Math.cos(angle) * (radius + 23), Math.sin(angle) * (radius + 23) * 0.67 - 20);
  }
  c.strokeStyle = '#ffe4a3';
  c.lineWidth = 3;
  c.stroke();
  c.restore();
}
function drawPlant(c, p, t) {
  const fade = clamp((p.life - p.age) / 2, 0, 1);
  c.save();
  c.globalAlpha = fade;
  const size = p.radius
    ? clamp(p.radius / (p.kind === 'thorn' ? 43 : p.kind === 'ice' ? 29 : 30), 0.7, 1.25)
    : 1;
  if (p.kind === 'thorn') {
    ellipse(
      c,
      p.x,
      p.y,
      p.radius || 58,
      p.radius || 58,
      'rgba(109,176,75,.04)',
      'rgba(122,192,89,.23)',
      1,
    );
    thorn(c, p.x, p.y, size, p.age, t);
  }
  if (p.kind === 'ice') {
    ellipse(c, p.x, p.y, p.radius || 28, p.radius || 28, 'rgba(100,206,245,.08)', '#74c6db', 1.4);
    ice(c, p.x, p.y, size, p.age, t);
    if (p.hp < p.maxHp * 0.6) {
      c.beginPath();
      c.moveTo(p.x - 4, p.y - 70);
      c.lineTo(p.x + 5, p.y - 49);
      c.lineTo(p.x - 6, p.y - 31);
      c.strokeStyle = '#247fa1';
      c.lineWidth = 2.5;
      c.stroke();
    }
  }
  if (!['thorn', 'ice', 'mushroom', 'trench', 'frost', 'poison'].includes(p.kind))
    drawAdditionalPlant(c, p, t, false, SEEDS[p.kind]);
  if (p.kind === 'mushroom') {
    mushroom(c, p.x, p.y, size, p.age, t);
    const remaining = p.life - p.age;
    if (remaining < 1.6) {
      ellipse(
        c,
        p.x,
        p.y,
        60 + (Math.sin(t * 17) + 1) * 3,
        26,
        null,
        `rgba(255,190,85,${0.3 + Math.sin(t * 17) * 0.2})`,
        2,
      );
    }
  }
  if (p.age < 0.7) {
    const r = p.age * 70;
    ellipse(c, p.x, p.y, r, r * 0.4, null, `rgba(223,253,169,${1 - p.age / 0.7})`, 2);
  }
  if (p.maxHp > 1 && p.hp < p.maxHp) healthbar(c, p.x, p.y + 13, 28, p.hp / p.maxHp, '#9ce8ff');
  c.restore();
}

const PREVIEW_ENEMIES = [
  { kind: 'sprout', x: 262, y: 295 },
  { kind: 'runner', x: 348, y: 424 },
  { kind: 'sprout', x: 984, y: 230 },
  { kind: 'brute', x: 1195, y: 396 },
  { kind: 'sprout', x: 899, y: 433 },
  { kind: 'runner', x: 672, y: 608 },
  { kind: 'sprout', x: 1144, y: 538 },
  { kind: 'sprout', x: 552, y: 364 },
];

// Fixed-size atlases share the expensive paths, gradients and blurred glows.
// Their size depends on artwork variants, never on enemy IDs or wave number.
const MONSTER_KINDS = ['sprout', 'runner', 'brute'];
const MONSTER_FRAMES = 6;
const SPRITE_SCALE = 1.5;
const MONSTER_WIDTH = 96;
const MONSTER_HEIGHT = 112;
const PROJECTILE_KINDS = [
  'hostile',
  'pet',
  'plant',
  'sunflower',
  'stormreed',
  'bloomturret',
  'normal',
  'thorn',
  'ice',
  'mushroom',
  'enemy',
  'fire',
  'explosive',
  'split',
];

function createMonsterAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = 12 * MONSTER_WIDTH * SPRITE_SCALE;
  canvas.height = 6 * MONSTER_HEIGHT * SPRITE_SCALE;
  const c = canvas.getContext('2d');
  for (let kind = 0; kind < MONSTER_KINDS.length; kind++)
    for (let hit = 0; hit < 2; hit++)
      for (let facing = 0; facing < 2; facing++)
        for (let frame = 0; frame < MONSTER_FRAMES; frame++) {
          const index = ((kind * 2 + hit) * 2 + facing) * MONSTER_FRAMES + frame;
          c.setTransform(
            SPRITE_SCALE,
            0,
            0,
            SPRITE_SCALE,
            ((index % 12) * MONSTER_WIDTH + 48) * SPRITE_SCALE,
            (Math.floor(index / 12) * MONSTER_HEIGHT + 90) * SPRITE_SCALE,
          );
          monster(
            c,
            {
              kind: MONSTER_KINDS[kind],
              id: 1,
              x: 0,
              y: 0,
              hit,
              hp: 1,
              maxHp: 1,
              angle: facing ? Math.PI : 0,
            },
            ((frame / MONSTER_FRAMES) * TAU) / (kind === 1 ? 13 : 6),
            true,
          );
        }
  return canvas;
}

function createProjectileAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = PROJECTILE_KINDS.length * 96 * SPRITE_SCALE;
  canvas.height = 80 * SPRITE_SCALE;
  const c = canvas.getContext('2d');
  PROJECTILE_KINDS.forEach((kind, index) => {
    c.setTransform(
      SPRITE_SCALE,
      0,
      0,
      SPRITE_SCALE,
      (index * 96 + 48) * SPRITE_SCALE,
      40 * SPRITE_SCALE,
    );
    seedProjectile(
      c,
      {
        kind: ['split', 'pet', 'plant'].includes(kind) ? 'normal' : kind,
        element: ['pet', 'plant'].includes(kind) ? undefined : kind,
        source: ['pet', 'plant'].includes(kind) ? kind : undefined,
        x: 0,
        y: 10,
        vx: 1,
        vy: 0,
      },
      0,
    );
  });
  return canvas;
}

export class GardenRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.contextLost = false;
    this.backdrop = null;
    this.monsterAtlas = null;
    this.projectileAtlas = null;
    this.width = 1;
    this.height = 1;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.camera = { x: 720, y: 450 };
    this.lastState = null;
    canvas.addEventListener('contextlost', () => {
      this.contextLost = true;
    });
    canvas.addEventListener('contextrestored', () => {
      this.contextLost = false;
      // Restored canvas backing stores are empty, including any cached artwork.
      this.releaseArtwork();
      this.resize();
    });
    this.resize();
  }
  releaseArtwork() {
    for (const key of ['backdrop', 'monsterAtlas', 'projectileAtlas']) {
      if (this[key]) this[key].width = this[key].height = 0;
      this[key] = null;
    }
  }
  artwork(key, create) {
    if (!this[key]) {
      const canvas = create();
      this[key] = canvas;
      // Offscreen 2D canvases can lose their contents independently of the arena.
      canvas.addEventListener('contextrestored', () => {
        if (this[key] === canvas) {
          canvas.width = canvas.height = 0;
          this[key] = null;
        }
      });
    }
    return this[key].getContext('2d').isContextLost?.() ? null : this[key];
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width || window.innerWidth);
    this.height = Math.max(1, rect.height || window.innerHeight);
    // Bound backing-store memory on high-DPR / large displays. Camera and input
    // remain in CSS pixels, so rendering resolution never changes hit targets.
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      2,
      Math.sqrt(4_000_000 / (this.width * this.height)),
      4096 / this.width,
      4096 / this.height,
    );
    this.dpr = dpr;
    const width = Math.max(1, Math.floor(this.width * dpr));
    const height = Math.max(1, Math.floor(this.height * dpr));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.vignette = null;
    this.updateCamera(this.lastState);
  }
  updateCamera(state) {
    const portrait = this.height > this.width * 1.15;
    if (portrait) {
      this.scale = Math.max(this.width / 780, (this.height - 150) / 860);
      const px = state?.player?.x ?? 720,
        py = state?.player?.y ?? 450;
      const halfWidth = this.width / this.scale / 2;
      this.camera.x = clamp(px, Math.min(halfWidth + 15, 720), Math.max(1425 - halfWidth, 720));
      this.camera.y = py;
      this.offsetX = this.width / 2 - this.camera.x * this.scale;
      // The canvas ends above the controls; only the upper HUD needs camera clearance.
      const fieldCenter = (Math.min(240, this.height * 0.42) + this.height - 30) / 2;
      this.offsetY = fieldCenter - this.camera.y * this.scale;
    } else {
      const top = this.height < 540 ? 61 : 87,
        bottom = 28;
      this.scale = Math.min(this.width / 1440, (this.height - top - bottom) / 600);
      this.scale = Math.max(this.scale, Math.min(this.width / 1600, this.height / 1060));
      this.camera = { x: 720, y: 450 };
      this.offsetX = (this.width - 1440 * this.scale) / 2;
      this.offsetY = top - 150 * this.scale;
      // Preserve the opening composition, then pan only when the gardener would
      // enter the HUD or seed dock. Include the sprite's height above its feet.
      const maxPlayerY = this.height - 35;
      const minPlayerY = Math.min(
        maxPlayerY,
        Math.max(this.height < 540 ? 90 : 145, top + 83 * this.scale + 24),
      );
      const playerY = (state?.player?.y ?? 450) * this.scale + this.offsetY;
      this.offsetY += clamp(playerY, minPlayerY, maxPlayerY) - playerY;
    }
  }
  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.offsetX) / this.scale,
      y: (clientY - rect.top - this.offsetY) / this.scale,
    };
  }
  worldToScreen(x, y) {
    return { x: x * this.scale + this.offsetX, y: y * this.scale + this.offsetY };
  }
  visible(x, y, radius = 100) {
    const left = (x - radius) * this.scale + this.offsetX;
    const top = (y - radius) * this.scale + this.offsetY;
    const diameter = radius * 2 * this.scale;
    return left < this.width && top < this.height && left + diameter > 0 && top + diameter > 0;
  }
  drawMonster(enemy, t, atlas) {
    if (
      !MONSTER_KINDS.includes(enemy.kind) ||
      enemy.layer === 'underground' ||
      enemy.layer === 'air' ||
      enemy.shield > 0 ||
      ['leader', 'boss'].includes(enemy.rank)
    ) {
      if (!this.visible(enemy.x, enemy.y, 230)) return;
      const animationTime = enemy.frozen > 0 || enemy.stunned > 0 ? 0 : t;
      const healthbarBounds = ['leader', 'boss'].includes(enemy.rank)
        ? {
            top: ((this.height < 540 ? 151 : 245) - this.offsetY) / this.scale,
            bottom: (this.height - 24 - this.offsetY) / this.scale,
          }
        : null;
      monster(this.ctx, enemy, animationTime, false, healthbarBounds);
      enemyStatus(this.ctx, enemy, Math.max(0.5, (enemy.radius || 19) / 19), t);
      return;
    }
    const kind = Math.max(0, MONSTER_KINDS.indexOf(enemy.kind));
    const size = kind === 2 ? 1.6 : kind === 1 ? 0.78 : 1;
    if (!this.visible(enemy.x, enemy.y, 110 * size)) return;
    const animationTime = enemy.frozen > 0 || enemy.stunned > 0 ? 0 : t;
    if (!atlas) {
      monster(this.ctx, enemy, animationTime);
      enemyStatus(this.ctx, enemy, size, t);
      return;
    }
    const phase = (Number(enemy.id) || enemy.x * 0.1) - 1;
    const frame =
      ((Math.floor(((animationTime * (kind === 1 ? 13 : 6) + phase * 1.8) / TAU) * MONSTER_FRAMES) %
        MONSTER_FRAMES) +
        MONSTER_FRAMES) %
      MONSTER_FRAMES;
    const facing = Math.cos(enemy.angle || 0) < 0 ? 1 : 0;
    const index = ((kind * 2 + Number(enemy.hit > 0)) * 2 + facing) * MONSTER_FRAMES + frame;
    this.ctx.drawImage(
      atlas,
      (index % 12) * MONSTER_WIDTH * SPRITE_SCALE,
      Math.floor(index / 12) * MONSTER_HEIGHT * SPRITE_SCALE,
      MONSTER_WIDTH * SPRITE_SCALE,
      MONSTER_HEIGHT * SPRITE_SCALE,
      enemy.x - 48 * size,
      enemy.y - 90 * size,
      MONSTER_WIDTH * size,
      MONSTER_HEIGHT * size,
    );
    if (enemy.hp < enemy.maxHp)
      healthbar(
        this.ctx,
        enemy.x,
        enemy.y - (kind === 2 ? 110 : 68),
        kind === 2 ? 62 : 40,
        enemy.hp / enemy.maxHp,
        '#f57a64',
      );
    enemyStatus(this.ctx, enemy, size, t);
  }
  drawProjectile(bullet, atlas) {
    if (!this.visible(bullet.x, bullet.y, 65)) return;
    if (!atlas) {
      seedProjectile(this.ctx, bullet, 0);
      return;
    }
    const visualKind =
      bullet.source === 'enemy'
        ? 'hostile'
        : bullet.source === 'pet' || bullet.source === 'plant'
          ? bullet.source
          : bullet.element || bullet.kind;
    const index = PROJECTILE_KINDS.indexOf(visualKind);
    if (index < 0) {
      seedProjectile(this.ctx, bullet, 0);
      return;
    }
    const c = this.ctx;
    c.save();
    c.translate(bullet.x, bullet.y - 10);
    c.rotate(Math.atan2(bullet.vy || 0, bullet.vx || 1));
    if (bullet.source === 'normal')
      c.scale(clamp(Math.sqrt((bullet.damage || 19) / 19), 1, 1.35), 1);
    if (bullet.generation > 0 || bullet.kind === 'split') c.scale(0.68, 0.68);
    c.drawImage(
      atlas,
      index * 96 * SPRITE_SCALE,
      0,
      96 * SPRITE_SCALE,
      80 * SPRITE_SCALE,
      -48,
      -40,
      96,
      80,
    );
    if (bullet.remainingPierce > 0) {
      c.strokeStyle = '#ffe2f6';
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(-42, -4);
      c.lineTo(-15, -4);
      c.moveTo(-42, 4);
      c.lineTo(-15, 4);
      c.stroke();
    }
    if (bullet.reflected) ellipse(c, 0, 0, 11, 9, null, '#f6df99', 1.2);
    c.restore();
  }
  render(state, { aim = null, planting = false, time = 0 } = {}) {
    this.lastState = state;
    if (this.contextLost || this.ctx.isContextLost?.()) return;
    this.updateCamera(state);
    const c = this.ctx,
      t = Number.isFinite(state.time) ? state.time : time || performance.now() / 1000;
    const level = LEVELS[state.levelId] || LEVELS.ruins;
    if (this.backdropDefinition !== level) {
      this.releaseArtwork();
      this.backdropDefinition = level;
    }
    const backdrop = this.artwork('backdrop', () => createBackdrop(level));
    const mapTerrain = (state.terrain || level.terrain || []).filter((region) =>
      this.visible(region.x, region.y, region.radius + 100),
    );
    const monsterAtlas = this.artwork('monsterAtlas', createMonsterAtlas);
    const projectileAtlas = this.artwork('projectileAtlas', createProjectileAtlas);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.shadowBlur = 0;
    c.fillStyle = '#152c27';
    c.fillRect(0, 0, this.width, this.height);
    c.save();
    c.translate(this.offsetX, this.offsetY);
    c.scale(this.scale, this.scale);
    if (backdrop) c.drawImage(backdrop, -120, -110);
    else {
      // Keep a readable floor while the background's backing store is restored.
      c.fillStyle = '#8a8666';
      c.fillRect(15, 65, 1425, 805);
    }
    drawMapGround(c, mapTerrain, level.visual?.palette);
    drawWeatherGround(c, state, t, level);
    // Floating motes, torchlight and edge blossoms enliven an otherwise stable field.
    [
      [89, 260],
      [1327, 270],
      [91, 721],
      [1324, 737],
      [353, 123],
      [1091, 123],
    ].forEach(([x, y]) => {
      if (this.visible(x, y, 160)) fire(c, x, y, t);
    });
    [
      [159, 227, 0.85],
      [1287, 362, 0.85],
      [220, 686, 0.85],
      [1254, 723, 1],
      [527, 159, 0.7],
      [876, 160, 0.7],
      [318, 754, 0.8],
    ].forEach(([x, y, s]) => {
      if (this.visible(x, y, 60)) flower(c, x, y, s, t);
    });
    for (let i = 0; i < 20; i++) {
      const x = 100 + noise(i * 33) * 1235 + Math.sin(t * 0.4 + i) * 12,
        y = 140 + noise(i * 49) * 617 + Math.cos(t * 0.3 + i) * 9;
      const opacity = 0.12 + (Math.sin(t * 1.3 + i * 7) + 1) * 0.12;
      ellipse(c, x, y, 1.2, 1.2, `rgba(246,232,137,${opacity})`);
    }
    const preview = state.phase === 'ready';
    // Preparation has no acquired terrain; decorative border plants stay in the backdrop.
    const plants = state.plants || [];
    const enemies =
      preview && !state.enemies?.length
        ? PREVIEW_ENEMIES.map((e, i) => ({ ...e, id: i, hp: 100, maxHp: 100, angle: Math.PI }))
        : state.enemies || [];
    // Ground-only telegraphs are rendered beneath all solid objects.
    (state.telegraphs || [])
      .filter((p) => p.kind !== 'lightning' || p.dangerous)
      .forEach((p) => {
        if (this.visible(p.x, p.y, (p.length || p.radius || 24) + 80)) drawCombatTelegraph(c, p, t);
      });
    // Passive ground patches and area skills stay beneath feet and characters.
    for (const plant of plants) {
      if (
        ['trench', 'frost', 'poison'].includes(plant.kind) &&
        this.visible(plant.x, plant.y, (plant.radius || 90) + 8)
      )
        terrain(c, plant, t);
    }
    for (const effect of state.skillEffects || []) {
      if (
        (effect.kind === 'blast' || effect.kind === 'gale') &&
        this.visible(effect.x, effect.y, (effect.radius || 150) + 10)
      )
        skillEffect(c, effect, t);
    }
    if (aim && state.phase === 'playing') this.drawAim(state, aim, planting, t);
    const objects = [];
    mapTerrain
      .filter((region) => region.kind === 'wall')
      .forEach((region) =>
        objects.push({
          y: region.y + region.radius * 0.4,
          draw: () => drawMapWall(c, region, level.visual?.palette),
        }),
      );
    plants.forEach((p) => {
      if (!['trench', 'frost', 'poison'].includes(p.kind) && this.visible(p.x, p.y, 130))
        objects.push({ y: p.y, draw: () => drawPlant(c, p, t) });
    });
    enemies.forEach((e) =>
      objects.push({ y: e.y, draw: () => this.drawMonster(e, t, monsterAtlas) }),
    );
    if (state.player) objects.push({ y: state.player.y, draw: () => player(c, state.player, t) });
    if (state.pet && this.visible(state.pet.x, state.pet.y, 100))
      objects.push({ y: state.pet.y, draw: () => drawPet(c, state.pet, t) });
    (state.telegraphs || [])
      .filter((p) => p.kind === 'explosion' && this.visible(p.x, p.y, 190))
      .forEach((p) => objects.push({ y: p.y + 5, draw: () => explosion(c, p, t) }));
    for (const effect of state.skillEffects || []) {
      if (
        (effect.kind === 'cart' || effect.kind === 'horse') &&
        this.visible(effect.x, effect.y, 120)
      )
        objects.push({ y: effect.y, draw: () => skillEffect(c, effect, t) });
    }
    objects.sort((a, b) => a.y - b.y).forEach((obj) => obj.draw());
    for (const effect of state.skillEffects || []) {
      if (effect.kind !== 'laser') continue;
      const startX = effect.startX ?? effect.x,
        startY = effect.startY ?? effect.y;
      const endX = effect.targetX ?? startX + (effect.dx ?? 1) * (effect.length || 640);
      const endY = effect.targetY ?? startY + (effect.dy || 0) * (effect.length || 640);
      if (
        this.visible(
          (startX + endX) / 2,
          (startY + endY) / 2,
          Math.hypot(endX - startX, endY - startY) / 2 + 40,
        )
      )
        skillEffect(c, effect, t);
    }
    (state.bullets || []).forEach((b) => this.drawProjectile(b, projectileAtlas));
    (state.telegraphs || [])
      .filter((p) => p.kind === 'lightning' && !p.dangerous)
      .forEach((p) => drawCombatTelegraph(c, p, t));
    for (const p of state.particles || []) {
      if (!this.visible(p.x, p.y, (p.size || 3) + 8)) continue;
      c.save();
      c.globalAlpha = clamp(p.life / (p.maxLife || 1), 0, 1);
      c.fillStyle = p.color || '#ffd086';
      // Soft flat halos avoid a separate blur surface for every large particle.
      if ((p.size || 3) > 5) {
        c.globalAlpha *= 0.2;
        ellipse(c, p.x, p.y, p.size + 4, p.size * 0.8 + 4, p.color || '#ffd086');
        c.globalAlpha = clamp(p.life / (p.maxLife || 1), 0, 1);
      }
      ellipse(c, p.x, p.y, p.size || 3, (p.size || 3) * 0.8, p.color || '#ffd086');
      c.restore();
    }
    drawWeatherParticles(c, state, t, level);
    for (const f of state.floaters || []) {
      if (!this.visible(f.x, f.y, 120)) continue;
      c.save();
      c.globalAlpha = clamp(f.life * 2, 0, 1);
      c.font = '800 24px "Arial", sans-serif';
      c.textAlign = 'center';
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(24,35,28,.85)';
      c.strokeText(f.text, f.x, f.y);
      c.fillStyle = f.color || '#fff4d0';
      c.fillText(f.text, f.x, f.y);
      c.restore();
    }
    // Bottom foreground ivy is safely outside gameplay coordinates.
    for (let i = 0; i < 9; i++)
      leaf(
        c,
        160 + i * 148,
        857 + Math.sin(i * 3) * 18,
        39,
        Math.sin(t * 0.8 + i) * 0.04 + (i % 2 ? 0.6 : -0.6),
        '#214437',
        '#507647',
      );
    c.restore();
    // Soft photographic vignette leaves the combat area bright and the HUD legible.
    if (!this.vignette) {
      const vignette = c.createRadialGradient(
        this.width * 0.5,
        this.height * 0.46,
        this.width * 0.21,
        this.width * 0.5,
        this.height * 0.48,
        Math.max(this.width, this.height) * 0.72,
      );
      vignette.addColorStop(0, 'rgba(8,23,25,0)');
      vignette.addColorStop(0.7, 'rgba(9,27,26,.08)');
      vignette.addColorStop(1, 'rgba(4,18,21,.53)');
      this.vignette = vignette;
    }
    c.fillStyle = this.vignette;
    c.fillRect(0, 0, this.width, this.height);
  }
  drawAim(state, aim, planting, t) {
    const c = this.ctx;
    const slot = state.skillSlots?.[state.selectedSkill ?? 0];
    const definition = CONTENT.SKILLS?.[slot?.kind];
    const color = definition?.color || '#ffe3a1';
    let x = aim.x,
      y = aim.y;
    c.save();
    if (planting && definition && state.player) {
      const px = state.player.x,
        py = state.player.y;
      const distance = Math.hypot(x - px, y - py);
      const dx = distance > 0.01 ? (x - px) / distance : Math.cos(state.player.angle || 0);
      const dy = distance > 0.01 ? (y - py) / distance : Math.sin(state.player.angle || 0);
      const bounds = (LEVELS[state.levelId] || LEVELS.ruins).bounds;
      let travel =
        definition.shape === 'line' ? definition.range : Math.min(distance, definition.range);
      {
        // Both area targets and line endpoints are clipped along the aim ray.
        if (dx > 0) travel = Math.min(travel, (bounds.right - px) / dx);
        if (dx < 0) travel = Math.min(travel, (bounds.left - px) / dx);
        if (dy > 0) travel = Math.min(travel, (bounds.bottom - py) / dy);
        if (dy < 0) travel = Math.min(travel, (bounds.top - py) / dy);
      }
      x = clamp(px + dx * travel, bounds.left, bounds.right);
      y = clamp(py + dy * travel, bounds.top, bounds.bottom);
      c.strokeStyle = color;
      c.lineWidth = 2;
      if (definition.shape === 'line') {
        const half = definition.width / 2;
        path(c, [
          [px - dy * half, py + dx * half],
          [x - dy * half, y + dx * half],
          [x + dy * half, y - dx * half],
          [px + dy * half, py - dx * half],
        ]);
        c.globalAlpha = 0.13;
        c.fillStyle = color;
        c.fill();
        c.globalAlpha = 0.8;
        c.setLineDash([8, 6]);
        c.lineDashOffset = -t * 16;
        c.stroke();
        c.setLineDash([]);
        const angle = Math.atan2(dy, dx);
        for (let i = 1; i <= 3; i++)
          directionArrow(c, px + ((x - px) * i) / 4, py + ((y - py) * i) / 4, angle, color, 9);
        directionArrow(c, x, y, angle, color, 15);
      } else {
        c.globalAlpha = 0.12;
        ellipse(c, x, y, definition.radius, definition.radius, color);
        c.globalAlpha = 0.9;
        c.setLineDash([8, 6]);
        c.lineDashOffset = -t * 12;
        ellipse(c, x, y, definition.radius, definition.radius, null, color, 2.5);
        c.setLineDash([3, 8]);
        c.globalAlpha = 0.4;
        c.beginPath();
        c.moveTo(px, py);
        c.lineTo(x, y);
        c.stroke();
        c.setLineDash([]);
      }
      c.globalAlpha = 1;
    }
    c.strokeStyle = planting ? color : 'rgba(255,240,205,.65)';
    c.lineWidth = 1.8;
    const radius = planting ? 10 : 7;
    ellipse(c, x, y, radius, radius, null, c.strokeStyle, 1.4);
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      c.beginPath();
      c.moveTo(x + dx * (radius + 4), y + dy * (radius + 4));
      c.lineTo(x + dx * (radius + 9), y + dy * (radius + 9));
      c.stroke();
    }
    c.restore();
  }
}

function iconContext(canvas, width, height) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || width,
    h = rect.height || height;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  return { c, w, h };
}
export function drawSeedIcon(canvas, kind) {
  const { c, w, h } = iconContext(canvas, 150, 110);
  const scale = Math.min(w / 132, h / 105);
  c.save();
  c.translate(w * 0.5, h * 0.84);
  c.scale(scale, scale);
  if (kind === 'shrub' || kind === 'thorn') shrub(c, 0, 0, 0.96, 5, 0);
  else if (kind === 'trench' || kind === 'frost' || kind === 'poison')
    terrain(c, { kind, x: 0, y: -35, radius: kind === 'trench' ? 56 : 40, age: 5, life: 99 }, 1);
  else if (kind === 'cart') wagon(c, 0, -21, 0, 0.15, 0.9);
  else if (kind === 'horse') warhorse(c, 0, -8, 0, 0.15, 0.88);
  else if (kind === 'blast' || kind === 'gale')
    skillEffect(
      c,
      {
        kind,
        x: 0,
        y: -36,
        radius: 42,
        age: kind === 'blast' ? 0.65 : 0.4,
        life: 1,
        delay: 0.5,
        triggered: kind === 'blast',
      },
      1,
    );
  else if (kind === 'laser') {
    skillEffect(
      c,
      {
        kind,
        x: -47,
        y: -8,
        startX: -47,
        startY: -8,
        targetX: 45,
        targetY: -68,
        dx: 0.838,
        dy: -0.547,
        width: 22,
        length: 110,
        age: 0.1,
        life: 1,
      },
      1,
    );
  } else if (kind === 'ice') ice(c, 0, 0, 1, 5, 0);
  else if (kind === 'mushroom') mushroom(c, 0, 0, 1, 5, 0);
  else if (SEEDS[kind]) drawAdditionalPlant(c, { kind, x: 0, y: 0, age: 5 }, 0, true, SEEDS[kind]);
  else if (kind === 'heart' || kind === 'health') drawHeartIcon(c);
  else if (kind === 'pet') {
    c.translate(0, -32);
    drawPet(c, { x: 0, y: 0 }, 0, true);
  } else if (kind === 'shield' || kind === 'armor') drawShieldIcon(c);
  else if (kind === 'leaf') leaf(c, 0, 7, 57, 0.65, '#4f842b', '#a3d75f');
  else if (kind === 'flower') flower(c, 0, 0, 1.55, 0);
  else {
    c.rotate(-0.4);
    c.shadowColor = '#ff96da';
    c.shadowBlur = 16;
    for (let i = 0; i < 2; i++) {
      c.save();
      c.translate(i ? 8 : -6, i ? 4 : -5);
      c.rotate(i ? 0.8 : 0);
      c.beginPath();
      c.moveTo(0, -39);
      c.bezierCurveTo(-26, -29, -24, 0, -4, 0);
      c.bezierCurveTo(18, 0, 11, -28, 0, -39);
      c.fillStyle = gradient(c, -14, -36, 10, 0, [
        [0, '#fff0fa'],
        [0.35, '#ff9bdd'],
        [1, '#e749b6'],
      ]);
      c.fill();
      c.restore();
    }
  }
  c.restore();
}
export function drawPortrait(canvas) {
  const { c, w, h } = iconContext(canvas, 84, 84);
  const r = Math.min(w, h) / 2;
  c.save();
  ellipse(
    c,
    w / 2,
    h / 2,
    r - 2,
    r - 2,
    gradient(c, 0, 0, w, h, [
      [0, '#3f6965'],
      [1, '#182f35'],
    ]),
    '#b4b5a0',
    2,
  );
  c.beginPath();
  c.arc(w / 2, h / 2, r - 4, 0, TAU);
  c.clip();
  const scale = r / 43;
  c.translate(w / 2, h * 0.96);
  c.scale(scale, scale);
  player(c, { x: 0, y: 0, angle: 0, invulnerable: 0 }, 0, true);
  c.restore();
}
