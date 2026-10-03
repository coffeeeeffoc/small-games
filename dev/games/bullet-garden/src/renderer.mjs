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

function createBackdrop() {
  const canvas = document.createElement('canvas');
  canvas.width = 1680;
  canvas.height = 1120;
  const c = canvas.getContext('2d');
  c.translate(120, 110);
  c.fillStyle = '#182e29';
  c.fillRect(-120, -110, 1680, 1120);
  const garden = gradient(c, 0, 50, 1350, 860, [
    [0, '#596653'],
    [0.23, '#8a8666'],
    [0.5, '#a49773'],
    [0.82, '#7f8466'],
    [1, '#324f40'],
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
      c.fillStyle = `rgb(${tone + 43},${tone + 14},${tone - 9})`;
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
  return canvas;
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

function monster(c, enemy, t) {
  const brute = enemy.kind === 'brute',
    runner = enemy.kind === 'runner';
  const phase = Number(enemy.id) || enemy.x * 0.1;
  const size = brute ? 1.75 : runner ? 0.8 : 1;
  const bob = Math.sin(t * (runner ? 13 : 6) + phase * 1.8) * 2;
  c.save();
  c.translate(enemy.x, enemy.y);
  c.scale(size, size);
  shadow(c, 0, 0, 29, 10, 0.45);
  if (enemy.chillTime > 0) {
    ellipse(c, 0, 0, 32, 11, 'rgba(99,206,255,.16)', 'rgba(147,231,255,.6)', 1.5);
  }
  if (enemy.burnTime > 0) {
    for (let i = 0; i < 3; i++) {
      const flameX = (i - 1) * 17;
      const flameY = -7 + Math.sin(t * 12 + i * 2) * 3;
      ellipse(c, flameX, flameY, 5, 12, '#f49445');
      ellipse(c, flameX, flameY + 3, 2.5, 6, '#ffdf8e');
    }
  }
  const flash = enemy.hit > 0;
  // Tail, grounded feet, then a soft, round charcoal body.
  c.strokeStyle = flash ? '#929278' : '#293034';
  c.lineWidth = 6;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-19, -12);
  c.bezierCurveTo(-35, -9, -36, -22, -29, -26);
  c.stroke();
  path(c, [
    [-32, -29],
    [-23, -25],
    [-33, -21],
  ]);
  c.fillStyle = flash ? '#d4cdaa' : '#303435';
  c.fill();
  ellipse(c, -13, 0 + Math.sin(t * 8 + phase) * 2, 9, 6, '#252b2c');
  ellipse(c, 13, -Math.sin(t * 8 + phase) * 2, 9, 6, '#252b2c');
  c.translate(0, bob);
  ellipse(c, -23, -20, 7, 11, flash ? '#b9bba2' : '#31363a');
  ellipse(c, 23, -20, 7, 11, flash ? '#b9bba2' : '#31363a');
  ellipse(
    c,
    0,
    -25,
    25,
    27,
    gradient(c, -15, -49, 14, 1, [
      [0, flash ? '#e4e1c2' : '#48504b'],
      [0.35, flash ? '#b7b597' : '#333a3c'],
      [0.75, flash ? '#919577' : '#252d32'],
      [1, '#202a2c'],
    ]),
  );
  c.beginPath();
  c.moveTo(-19, -40);
  c.quadraticCurveTo(-30, -48, -20, -61);
  c.quadraticCurveTo(-18, -50, -11, -45);
  c.fillStyle = flash ? '#b9bba2' : '#33393c';
  c.fill();
  c.beginPath();
  c.moveTo(14, -46);
  c.quadraticCurveTo(25, -62, 26, -47);
  c.quadraticCurveTo(30, -36, 21, -35);
  c.fillStyle = flash ? '#b9bba2' : '#2a3235';
  c.fill();
  if (brute) {
    leaf(c, -3, -46, 26, -1.1, '#3c6438', '#7c994c');
    leaf(c, 0, -46, 33, 0.1, '#38623b', '#6e9750');
    leaf(c, 4, -48, 28, 0.9, '#3b6840', '#84a354');
    ellipse(c, -15, -18, 8, 5, '#3a463a');
    ellipse(c, 13, -6, 7, 4, '#3b453b');
  } else {
    leaf(c, 0, -48, 15, -0.8, '#497143', '#8caf56');
    leaf(c, 0, -49, 12, 0.65, '#496e3a', '#93b755');
  }
  const lookingLeft = Math.cos(enemy.angle || 0) < 0;
  const look = lookingLeft ? -2 : 2;
  c.save();
  c.translate(look, 0);
  c.shadowColor = '#ffc74b';
  c.shadowBlur = 11;
  c.beginPath();
  c.moveTo(-16, -29);
  c.quadraticCurveTo(-6, -26, -5, -17);
  c.quadraticCurveTo(-16, -14, -16, -29);
  c.fillStyle = '#ffe378';
  c.fill();
  c.beginPath();
  c.moveTo(15, -29);
  c.quadraticCurveTo(5, -26, 5, -17);
  c.quadraticCurveTo(16, -14, 15, -29);
  c.fill();
  c.shadowBlur = 0;
  ellipse(c, -11, -23, 2, 3, '#fff5b5');
  ellipse(c, 10, -23, 2, 3, '#fff5b5');
  c.restore();
  if (runner) {
    c.beginPath();
    c.moveTo(-24, -15);
    c.lineTo(-34, -11);
    c.moveTo(-22, -10);
    c.lineTo(-29, -5);
    c.strokeStyle = '#b3c776';
    c.lineWidth = 2;
    c.stroke();
  }
  c.restore();
  if (enemy.hp < enemy.maxHp)
    healthbar(
      c,
      enemy.x,
      enemy.y - (brute ? 110 : 68),
      brute ? 62 : 40,
      enemy.hp / enemy.maxHp,
      '#f57a64',
    );
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
  const color = COLORS[kind] || '#ff9b72';
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
  if (kind === 'ice') {
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
  } else if (kind === 'explosive' || kind === 'mushroom') {
    ellipse(c, 0, 0, 8, 7, '#71462b', '#ffd081', 1.5);
    ellipse(c, 1, 0, 5, 5, '#ffc263');
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
    c.beginPath();
    c.moveTo(-3, -4);
    c.lineTo(-15 - Math.sin(t * 22) * 4, 0);
    c.lineTo(-3, 4);
    c.fillStyle = '#ffc46e';
    c.fill();
  }
  if (b.reflected) ellipse(c, 0, 0, 11, 9, null, '#f6df99', 1.2);
  c.restore();
}
function explosion(c, p, t) {
  const progress = clamp(1 - p.life / 0.38, 0, 1),
    size = 0.35 + progress * 0.85;
  c.save();
  c.translate(p.x, p.y - 12);
  c.scale(size, size);
  c.globalAlpha = 1 - progress * 0.9;
  ellipse(
    c,
    0,
    -24,
    125,
    102,
    radial(c, 0, -24, 125, 'rgba(255,224,115,.75)', 'rgba(255,123,34,0)'),
  );
  for (let i = 0; i < 7; i++) {
    const a = (i * TAU) / 7,
      xx = Math.cos(a) * 55,
      yy = -24 + Math.sin(a) * 38;
    ellipse(
      c,
      xx,
      yy,
      29,
      32,
      gradient(c, xx, yy - 30, xx, yy + 30, [
        [0, '#ac713f'],
        [0.45, '#a85220'],
        [1, '#6c4c33'],
      ]),
    );
  }
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8 + 0.25,
      xx = Math.cos(a) * 36,
      yy = -25 + Math.sin(a) * 28;
    ellipse(
      c,
      xx,
      yy,
      25,
      30,
      gradient(c, xx, yy - 30, xx, yy + 30, [
        [0, '#fff0ac'],
        [0.4, '#ffc74c'],
        [1, '#f38b22'],
      ]),
    );
  }
  c.beginPath();
  c.moveTo(-31, 2);
  c.lineTo(-40, -29);
  c.lineTo(-16, -15);
  c.lineTo(-17, -60);
  c.lineTo(0, -41);
  c.lineTo(18, -78);
  c.lineTo(23, -36);
  c.lineTo(44, -51);
  c.lineTo(31, -14);
  c.lineTo(52, -5);
  c.lineTo(16, 13);
  c.closePath();
  c.fillStyle = '#fff1af';
  c.fill();
  ellipse(c, 0, -12, 28, 27, '#fff7c7');
  for (let i = 0; i < 7; i++) {
    const a = (i * TAU) / 7 + t;
    const r = 73 + progress * 40;
    c.beginPath();
    c.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.67 - 20);
    c.lineTo(Math.cos(a) * (r + 27), Math.sin(a) * (r + 27) * 0.67 - 20);
    c.strokeStyle = '#ffe4a3';
    c.lineWidth = 3;
    c.stroke();
  }
  c.restore();
}
function drawPlant(c, p, t) {
  const fade = clamp((p.life - p.age) / 2, 0, 1);
  c.save();
  c.globalAlpha = fade;
  const size = p.radius
    ? clamp(p.radius / (p.kind === 'thorn' ? 43 : p.kind === 'ice' ? 29 : 30), 0.7, 1.25)
    : 1;
  if (p.kind === 'thorn') thorn(c, p.x, p.y, size, p.age, t);
  if (p.kind === 'ice') ice(c, p.x, p.y, size, p.age, t);
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
  if (p.kind === 'ice' && p.hp < p.maxHp)
    healthbar(c, p.x, p.y + 13, 28, p.hp / p.maxHp, '#9ce8ff');
  c.restore();
}

const PREVIEW_PLANTS = [
  { kind: 'thorn', x: 386, y: 330 },
  { kind: 'thorn', x: 580, y: 239 },
  { kind: 'thorn', x: 785, y: 272 },
  { kind: 'thorn', x: 1120, y: 329 },
  { kind: 'thorn', x: 936, y: 517 },
  { kind: 'thorn', x: 414, y: 614 },
  { kind: 'thorn', x: 1208, y: 622 },
  { kind: 'thorn', x: 1038, y: 688 },
  { kind: 'ice', x: 664, y: 274 },
  { kind: 'ice', x: 1078, y: 425 },
  { kind: 'ice', x: 475, y: 666 },
  { kind: 'ice', x: 1184, y: 657 },
  { kind: 'mushroom', x: 768, y: 352 },
  { kind: 'mushroom', x: 1002, y: 391 },
  { kind: 'mushroom', x: 851, y: 620 },
  { kind: 'mushroom', x: 311, y: 514 },
];
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

export class GardenRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.backdrop = createBackdrop();
    this.width = 1;
    this.height = 1;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.camera = { x: 720, y: 450 };
    this.lastState = null;
    this.resize();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width || window.innerWidth);
    this.height = Math.max(1, rect.height || window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.updateCamera(this.lastState);
  }
  updateCamera(state) {
    const portrait = this.height > this.width * 1.15;
    if (portrait) {
      this.scale = Math.max(this.width / 780, (this.height - 200) / 860);
      const px = state?.player?.x ?? 720,
        py = state?.player?.y ?? 450;
      const halfWidth = this.width / this.scale / 2;
      this.camera.x = clamp(px, Math.min(halfWidth + 15, 720), Math.max(1425 - halfWidth, 720));
      this.camera.y = py;
      this.offsetX = this.width / 2 - this.camera.x * this.scale;
      // Keep the gardener above the thumb controls and compact growth strip.
      const fieldCenter = (Math.min(190, this.height * 0.3) + Math.max(235, this.height - 240)) / 2;
      this.offsetY = fieldCenter - this.camera.y * this.scale;
    } else {
      const top = this.height < 540 ? 61 : 87,
        bottom = this.height < 540 ? 86 : 111;
      this.scale = Math.min(this.width / 1440, (this.height - top - bottom) / 600);
      this.scale = Math.max(this.scale, Math.min(this.width / 1600, this.height / 1060));
      this.camera = { x: 720, y: 450 };
      this.offsetX = (this.width - 1440 * this.scale) / 2;
      this.offsetY = top - 150 * this.scale;
      // Preserve the opening composition, then pan only when the gardener would
      // enter the HUD or growth strip. Include the sprite's height above its feet.
      const maxPlayerY = this.height < 540 ? this.height - 132 : this.height - 190;
      const minPlayerY = Math.min(
        maxPlayerY,
        Math.max(this.height < 540 ? 111 : 159, top + 83 * this.scale + 24),
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
  render(state, { aim = null, time = 0 } = {}) {
    this.lastState = state;
    this.updateCamera(state);
    const c = this.ctx,
      t = time || performance.now() / 1000;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#152c27';
    c.fillRect(0, 0, this.width, this.height);
    c.save();
    c.translate(this.offsetX, this.offsetY);
    c.scale(this.scale, this.scale);
    c.drawImage(this.backdrop, -120, -110);
    // Floating motes, torchlight and edge blossoms enliven an otherwise stable field.
    [
      [89, 260],
      [1327, 270],
      [91, 721],
      [1324, 737],
      [353, 123],
      [1091, 123],
    ].forEach(([x, y]) => fire(c, x, y, t));
    [
      [159, 227, 0.85],
      [1287, 362, 0.85],
      [220, 686, 0.85],
      [1254, 723, 1],
      [527, 159, 0.7],
      [876, 160, 0.7],
      [318, 754, 0.8],
    ].forEach(([x, y, s]) => flower(c, x, y, s, t));
    for (let i = 0; i < 20; i++) {
      const x = 100 + noise(i * 33) * 1235 + Math.sin(t * 0.4 + i) * 12,
        y = 140 + noise(i * 49) * 617 + Math.cos(t * 0.3 + i) * 9;
      const opacity = 0.12 + (Math.sin(t * 1.3 + i * 7) + 1) * 0.12;
      ellipse(c, x, y, 1.2, 1.2, `rgba(246,232,137,${opacity})`);
    }
    const preview = state.phase === 'ready';
    const plants =
      preview && !state.plants?.length
        ? PREVIEW_PLANTS.map((p, i) => ({ ...p, id: i, age: 8, life: 99, hp: 100, maxHp: 100 }))
        : state.plants || [];
    const enemies =
      preview && !state.enemies?.length
        ? PREVIEW_ENEMIES.map((e, i) => ({ ...e, id: i, hp: 100, maxHp: 100, angle: Math.PI }))
        : state.enemies || [];
    // Ground-only telegraphs are rendered beneath all solid objects.
    (state.telegraphs || []).forEach((p) => {
      const alpha = clamp(p.life, 0.15, 0.7);
      const danger = p.kind !== 'ice';
      ellipse(
        c,
        p.x,
        p.y,
        p.radius,
        p.radius * 0.55,
        danger ? `rgba(248,133,63,${alpha * 0.17})` : `rgba(77,199,245,${alpha * 0.16})`,
        danger ? `rgba(255,154,93,${alpha})` : `rgba(122,227,255,${alpha})`,
        2,
      );
      if (p.kind === 'spawn') {
        c.setLineDash([4, 7]);
        ellipse(c, p.x, p.y, p.radius * 0.7, p.radius * 0.38, null, 'rgba(255,189,124,.7)', 1);
        c.setLineDash([]);
      }
    });
    if (aim && state.phase === 'playing') this.drawAim(aim);
    const objects = [];
    plants.forEach((p) => objects.push({ y: p.y, draw: () => drawPlant(c, p, t) }));
    enemies.forEach((e) => objects.push({ y: e.y, draw: () => monster(c, e, t) }));
    if (state.player) objects.push({ y: state.player.y, draw: () => player(c, state.player, t) });
    (state.telegraphs || [])
      .filter((p) => p.kind === 'explosion')
      .forEach((p) => objects.push({ y: p.y + 5, draw: () => explosion(c, p, t) }));
    objects.sort((a, b) => a.y - b.y).forEach((obj) => obj.draw());
    (state.bullets || []).forEach((b) => seedProjectile(c, b, t));
    for (const p of state.particles || []) {
      c.save();
      c.globalAlpha = clamp(p.life / (p.maxLife || 1), 0, 1);
      c.fillStyle = p.color || '#ffd086';
      if ((p.size || 3) > 5) {
        c.shadowColor = p.color || '#ffd086';
        c.shadowBlur = 7;
      }
      ellipse(c, p.x, p.y, p.size || 3, (p.size || 3) * 0.8, p.color || '#ffd086');
      c.restore();
    }
    for (const f of state.floaters || []) {
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
    c.fillStyle = vignette;
    c.fillRect(0, 0, this.width, this.height);
  }
  drawAim(aim) {
    const c = this.ctx;
    c.save();
    c.strokeStyle = 'rgba(255,240,205,.8)';
    c.lineWidth = 1.8;
    const r = 7;
    ellipse(c, aim.x, aim.y, r, r * 0.58, null, c.strokeStyle, 1.4);
    [
      [-1, 0],
      [1, 0],
      [0, -0.6],
      [0, 0.6],
    ].forEach(([dx, dy]) => {
      c.beginPath();
      c.moveTo(aim.x + dx * (r + 4), aim.y + dy * (r + 4));
      c.lineTo(aim.x + dx * (r + 9), aim.y + dy * (r + 9));
      c.stroke();
    });
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
  if (kind === 'thorn') thorn(c, 0, 0, 0.96, 5, 0);
  else if (kind === 'ice') ice(c, 0, 0, 1, 5, 0);
  else if (kind === 'mushroom') mushroom(c, 0, 0, 1, 5, 0);
  else if (kind === 'leaf') leaf(c, 0, 7, 57, 0.65, '#4f842b', '#a3d75f');
  else if (kind === 'flower') flower(c, 0, 0, 1.55, 0);
  else if (kind === 'heart') {
    c.translate(0, -28);
    c.beginPath();
    c.moveTo(0, 16);
    c.bezierCurveTo(-44, -7, -27, -41, 0, -21);
    c.bezierCurveTo(27, -41, 44, -7, 0, 16);
    c.fillStyle = gradient(c, -20, -30, 20, 18, [
      [0, '#ffc4a4'],
      [0.45, '#ef7e70'],
      [1, '#ac4150'],
    ]);
    c.shadowColor = '#f7997e';
    c.shadowBlur = 12;
    c.fill();
    c.strokeStyle = '#ffe1be';
    c.lineWidth = 1.5;
    c.stroke();
  } else {
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
