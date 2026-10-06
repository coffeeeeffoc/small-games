// Original, asset-free street illustration. Scene rendering never mutates the run.
const OUTLINE = '#283b3b';
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mix = (a, b, t) => a + (b - a) * t;
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function polygon(ctx, points, fill, stroke = OUTLINE, width = 1.8) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
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

function line(ctx, points, color = OUTLINE, width = 2) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function ellipse(ctx, x, y, rx, ry, fill, stroke = null, width = 1.5, rotation = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rotation, 0, TAU);
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

function rounded(ctx, x, y, w, h, r, fill, stroke = OUTLINE, width = 2) {
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

function curve(ctx, points, color, width) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (let i = 1; i < points.length; i += 3)
    ctx.bezierCurveTo(...points[i], ...points[i + 1], ...points[i + 2]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function limb(ctx, points, color, width) {
  line(ctx, points, OUTLINE, width + 4);
  line(ctx, points, color, width);
  line(
    ctx,
    points.map(([x, y]) => [x - 2, y - 1]),
    '#ffffff20',
    width * 0.22,
  );
}

function paletteFor(level) {
  const p = level?.palette || {};
  const night = level?.id === 'canal' || p.mode === 'night';
  return {
    sky: p.sky || (night ? '#173c53' : '#9ad4dd'),
    skyBottom: night ? '#b47e56' : '#ffe4ae',
    wall: p.wall || (night ? '#a78664' : '#ecd4ad'),
    wallAccent: p.wallAccent || '#bd7d5b',
    roof: p.roof || '#4c6260',
    road: p.road || (night ? '#8f887b' : '#d5c4a1'),
    lane: p.lane || '#f2dfb4',
    accent: p.accent || '#f1a645',
    shadow: p.shadow || '#31494b',
    night,
  };
}

function newSurface(canvas, width, height, ratio = 1) {
  const surface = canvas.ownerDocument.createElement('canvas');
  surface.width = Math.ceil(width * ratio);
  surface.height = Math.ceil(height * ratio);
  const ctx = surface.getContext('2d');
  ctx.scale(ratio, ratio);
  return { canvas: surface, ctx, width, height, ratio };
}

function leaf(ctx, x, y, size, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-size * 0.65, -size * 0.62, 0, -size);
  ctx.quadraticCurveTo(size * 0.6, -size * 0.48, 0, 0);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#304d3d';
  ctx.lineWidth = Math.max(0.6, size * 0.05);
  ctx.stroke();
  line(
    ctx,
    [
      [0, 0],
      [0, -size * 0.78],
    ],
    '#aac36a80',
    Math.max(0.5, size * 0.06),
  );
  ctx.restore();
}

function plant(ctx, x, y, size, flowers = false, seed = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  ellipse(ctx, 0, 0, 15, 4, '#203a3438');
  polygon(
    ctx,
    [
      [-10, -17],
      [11, -17],
      [7, 0],
      [-6, 0],
    ],
    '#b76c45',
    '#4c473a',
    1.5,
  );
  polygon(
    ctx,
    [
      [-10, -17],
      [-5, -16],
      [-2, -1],
      [-6, 0],
    ],
    '#dd9863',
    null,
  );
  ellipse(ctx, 0.5, -18, 12, 4, '#d99561', '#4c473a', 1.6);
  ellipse(ctx, 0.5, -18, 8.5, 2.5, '#514836');
  for (let i = 0; i < 11; i++) {
    const a = mix(-1.1, 1.1, hash(seed + i));
    const length = 17 + hash(seed + i * 2) * 17;
    const tx = Math.sin(a) * length * 0.6,
      ty = -18 - Math.cos(a) * length;
    line(
      ctx,
      [
        [0, -17],
        [tx, ty],
      ],
      '#4b6844',
      1.8,
    );
    leaf(ctx, tx, ty + 3, 13 + hash(i + seed) * 9, a, i % 3 ? '#597e45' : '#819946');
    if (flowers && i % 3 === 0) {
      for (let j = 0; j < 5; j++)
        ellipse(
          ctx,
          tx + Math.cos((j * TAU) / 5) * 3.2,
          ty - 7 + Math.sin((j * TAU) / 5) * 3.2,
          3,
          3,
          '#e9b24c',
          '#9b7934',
          0.5,
        );
      ellipse(ctx, tx, ty - 7, 2, 2, '#7f5c31');
    }
  }
  ctx.restore();
}

function lantern(ctx, x, y, scale, night) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  if (night) {
    const glow = ctx.createRadialGradient(0, 14, 2, 0, 14, 47);
    glow.addColorStop(0, '#ffbf5860');
    glow.addColorStop(1, '#ffbf5800');
    ctx.fillStyle = glow;
    ctx.fillRect(-48, -32, 96, 96);
  }
  line(
    ctx,
    [
      [0, -19],
      [0, -6],
    ],
    '#48423a',
    2,
  );
  ellipse(ctx, 0, 14, 15, 23, '#dd6538', '#594337', 2);
  ellipse(ctx, -2, 13, 11, 21, '#f08941');
  for (const sx of [-9, -3, 4, 10])
    curve(
      ctx,
      [
        [sx * 0.6, -7],
        [sx * 1.4, 3],
        [sx * 1.4, 24],
        [sx * 0.6, 36],
      ],
      '#e9b267',
      1.5,
    );
  rounded(ctx, -7, -8, 14, 5, 1, '#8a6240', '#514333', 1.2);
  rounded(ctx, -7, 35, 14, 5, 1, '#8a6240', '#514333', 1.2);
  line(
    ctx,
    [
      [0, 41],
      [0, 49],
    ],
    '#df9e44',
    2.4,
  );
  for (let i = -2; i <= 2; i++)
    line(
      ctx,
      [
        [i, 48],
        [i * 1.8, 57],
      ],
      '#dd9b38',
      1.4,
    );
  ctx.restore();
}

function drawTower(ctx, cx, y, scale, p) {
  ctx.save();
  ctx.translate(cx, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = p.night ? 0.65 : 0.46;
  const ink = p.night ? '#3c515b' : '#779082';
  polygon(
    ctx,
    [
      [-33, 3],
      [33, 3],
      [33, -77],
      [-33, -77],
    ],
    ink,
    null,
  );
  polygon(
    ctx,
    [
      [-39, -77],
      [-28, -87],
      [-17, -110],
      [0, -123],
      [17, -110],
      [28, -87],
      [39, -77],
    ],
    ink,
    null,
  );
  polygon(
    ctx,
    [
      [-47, -63],
      [-39, -71],
      [38, -71],
      [47, -63],
      [56, -66],
      [46, -53],
      [-46, -53],
      [-56, -66],
    ],
    ink,
    null,
  );
  polygon(
    ctx,
    [
      [-20, -111],
      [-15, -116],
      [0, -137],
      [15, -116],
      [20, -111],
      [25, -111],
      [17, -104],
      [-17, -104],
      [-25, -111],
    ],
    ink,
    null,
  );
  rounded(ctx, -6, -100, 12, 14, 5, p.skyBottom, null);
  for (const x of [-22, 0, 22]) rounded(ctx, x - 4, -46, 8, 16, 4, p.skyBottom, null);
  polygon(
    ctx,
    [
      [-48, 3],
      [48, 3],
      [43, -10],
      [-43, -10],
    ],
    ink,
    null,
  );
  ctx.restore();
}

// A facade is a perspective quadrilateral; its ornaments use the same mapping.
function facade(ctx, near, far, side, index, p, project, w) {
  const n = project(near),
    f = project(far);
  const wallX = (q) => w / 2 + side * w * 0.465 * q;
  const xn = wallX(n.q),
    xf = wallX(f.q);
  const height = w * (1.65 + (index % 3) * 0.13);
  const nt = n.y - height * n.q,
    ft = f.y - height * f.q;
  const point = (u, v) => [mix(xn, xf, u), mix(nt, ft, u) + mix(n.y - nt, f.y - ft, u) * v];
  const patch = (u1, v1, u2, v2, fill, stroke = OUTLINE, lw = 1.3) =>
    polygon(ctx, [point(u1, v1), point(u2, v1), point(u2, v2), point(u1, v2)], fill, stroke, lw);
  const wall = index % 2 ? p.wall : '#dfbf95';
  patch(0, 0, 1, 1, wall, '#4b5149', 2);
  patch(0, 0, 0.13, 1, '#746b4b20', null);
  patch(0, 0.7, 1, 1, p.wallAccent, null);
  // Worn brickwork around the street-facing plinth.
  ctx.save();
  polygon(ctx, [point(0, 0.7), point(1, 0.7), point(1, 1), point(0, 1)], null, null);
  ctx.clip();
  for (let row = 0; row < 7; row++) {
    const v = 0.7 + row * 0.048;
    line(ctx, [point(0, v), point(1, v)], '#ead4b3a0', 1.2);
    for (let col = 0; col < 4; col++) {
      const u = (col + (row % 2 ? 0.5 : 0)) / 3.5;
      line(ctx, [point(u, v), point(u, v + 0.046)], '#ead4b38c', 1.1);
      if ((col + row + index) % 4 === 0)
        patch(u + 0.018, v + 0.008, u + 0.24, v + 0.038, '#80564225', null);
    }
  }
  ctx.restore();
  // Cream floor ledge, plaster cracks and drainage pipe.
  patch(0, 0.68, 1, 0.715, '#eddcba', '#716d57', 1.2);
  patch(0.035, 0.02, 0.078, 1, '#9c9a82', '#55605a', 1.1);
  for (const v of [0.28, 0.58]) line(ctx, [point(0.026, v), point(0.1, v)], '#495c53', 2);
  line(
    ctx,
    [point(0.88, 0.37), point(0.79, 0.41), point(0.82, 0.49), point(0.73, 0.55)],
    '#99896d70',
    1,
  );
  // Windows have inset glass, solid frames and recognisable green slats.
  const window = (u1, u2, v1, v2, open = false) => {
    patch(u1 - 0.03, v1 - 0.018, u2 + 0.03, v2 + 0.018, '#eee2c2', '#5e6251', 1.4);
    patch(u1, v1, u2, v2, '#203c3c', '#263d3a', 1.3);
    patch(u1 + 0.025, v1 + 0.015, u2 - 0.025, v2 - 0.014, open ? '#dda763' : '#47796d', null);
    if (open) {
      patch(u1, v1, u1 + (u2 - u1) * 0.32, v2, '#558578', '#2f5149', 1.1);
      patch(u2 - (u2 - u1) * 0.32, v1, u2, v2, '#37685e', '#2f5149', 1.1);
      line(ctx, [point((u1 + u2) / 2, v1), point((u1 + u2) / 2, v2)], '#324b43', 2);
    }
    for (let v = v1 + 0.025; v < v2; v += 0.025) {
      if (open) {
        line(ctx, [point(u1 + 0.018, v), point(u1 + (u2 - u1) * 0.28, v)], '#9cb29a', 0.9);
        line(ctx, [point(u2 - (u2 - u1) * 0.28, v), point(u2 - 0.018, v)], '#9cb29a', 0.9);
      } else line(ctx, [point(u1 + 0.015, v), point(u2 - 0.015, v)], '#86a494', 0.9);
    }
    patch(u1 - 0.06, v2 + 0.009, u2 + 0.06, v2 + 0.032, '#b3ae8e', '#58665a', 1);
  };
  window(0.18, 0.69, 0.16, 0.36, index % 3 === 0);
  if (index % 2) window(0.19, 0.67, 0.51, 0.8, false);
  else {
    patch(0.22, 0.55, 0.67, 1, '#203e3b', '#ddd5b3', 3);
    patch(0.26, 0.59, 0.62, 0.985, '#456e61', '#1f3c36', 1.2);
    for (let u = 0.3; u < 0.62; u += 0.065)
      line(ctx, [point(u, 0.61), point(u, 0.97)], '#80917b', 1);
    const handle = point(0.56, 0.8);
    ellipse(ctx, handle[0], handle[1], 1.6 * n.q + 0.7, 2.3 * n.q + 0.7, '#d8b577');
    patch(0.17, 0.985, 0.74, 1.017, '#b5b298', '#5f695d', 1.2);
  }
  // Balcony railing, warm awning, climbing greenery.
  if (index % 2 === 0) {
    patch(0.12, 0.35, 0.79, 0.39, '#9c825d', '#3c4940', 1.5);
    line(ctx, [point(0.12, 0.285), point(0.79, 0.285)], '#66523d', 2);
    for (let u = 0.13; u <= 0.79; u += 0.105)
      line(ctx, [point(u, 0.285), point(u, 0.365)], '#66523d', 2);
    const flowerPosition = point(0.44, 0.358);
    plant(ctx, flowerPosition[0], flowerPosition[1], Math.max(0.2, n.q * 0.55), true, index + 32);
  }
  if (index === 1 || index === 4) {
    patch(0.16, 0.49, 0.8, 0.53, '#e8b071', '#605e48', 1.3);
    for (let u = 0.16; u < 0.8; u += 0.13)
      patch(u, 0.49, Math.min(u + 0.064, 0.8), 0.53, '#c98356', null);
  }
  // Tiles follow the receding roof edge, with individual curved ceramic ends.
  patch(-0.025, -0.015, 1.025, 0.012, p.roof, '#364e4b', 2.2);
  patch(-0.045, 0.018, 1.045, 0.043, '#7b8070', '#354b45', 1.5);
  for (let u = 0; u <= 1; u += 0.085) {
    const pt = point(u, 0.023);
    const radius = 2.2 + 2.8 * n.q;
    ellipse(ctx, pt[0], pt[1], radius, radius * 0.46, '#a3aa90', '#41554b', 0.8);
  }
  line(ctx, [point(0, 0.05), point(1, 0.05)], '#f1dcac70', 1.2);
  const pot = point(side < 0 ? 0.84 : 0.14, 1);
  plant(
    ctx,
    pot[0] - side * 9 * n.q,
    pot[1],
    clamp(n.q * 1.0, 0.19, 1.25),
    index % 2 === 1,
    index * 17,
  );
  if (index % 3 === 0 || p.night) {
    const hanging = point(0.84, 0.45);
    line(
      ctx,
      [
        [hanging[0], hanging[1] - 13 * n.q],
        [hanging[0] - side * 19 * n.q, hanging[1] - 13 * n.q],
      ],
      '#514839',
      2 * n.q + 0.5,
    );
    lantern(
      ctx,
      hanging[0] - side * 19 * n.q,
      hanging[1] - 6 * n.q,
      clamp(n.q * 0.95, 0.22, 1.15),
      p.night,
    );
  }
}

function drawBackdrop(ctx, w, h, p, project) {
  const vy = h * 0.28;
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6);
  sky.addColorStop(0, p.sky);
  sky.addColorStop(1, p.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  if (p.night) {
    for (let i = 0; i < 20; i++)
      ellipse(
        ctx,
        hash(i) * w,
        hash(i + 44) * h * 0.25,
        i % 3 ? 0.6 : 1.2,
        i % 3 ? 0.6 : 1.2,
        '#f9e8bc9c',
      );
    ellipse(ctx, w * 0.7, h * 0.08, w * 0.052, w * 0.052, '#f3d6a2');
    ellipse(ctx, w * 0.73, h * 0.064, w * 0.048, w * 0.048, p.sky);
  } else {
    const sunlight = ctx.createRadialGradient(w * 0.26, h * 0.09, 3, w * 0.26, h * 0.09, w * 0.47);
    sunlight.addColorStop(0, '#fff7d2b0');
    sunlight.addColorStop(1, '#fff7d200');
    ctx.fillStyle = sunlight;
    ctx.fillRect(0, 0, w, h * 0.4);
    ctx.globalAlpha = 0.34;
    for (let i = 0; i < 6; i++)
      ellipse(
        ctx,
        w * (0.22 + i * 0.09),
        h * (0.13 + Math.sin(i) * 0.022),
        w * 0.07,
        h * 0.022,
        '#fff0cf',
      );
    ctx.globalAlpha = 1;
  }
  // Layered silhouettes and a clock-free old-town lookout form the vanishing point.
  drawTower(ctx, w * 0.515, vy + h * 0.078, (w / 390) * 0.7, p);
  for (let i = 0; i < 8; i++) {
    const x = w * (0.2 + i * 0.075),
      y = vy + h * 0.07 + hash(i + 72) * h * 0.015;
    polygon(
      ctx,
      [
        [x - 15, y],
        [x - 15, y - 23],
        [x, y - 36],
        [x + 15, y - 23],
        [x + 15, y],
      ],
      p.night ? '#304856' : '#a3ac89',
      null,
    );
  }
  const ground = ctx.createLinearGradient(0, vy, 0, h);
  ground.addColorStop(0, p.night ? '#927963' : '#d9b888');
  ground.addColorStop(0.3, p.road);
  ground.addColorStop(1, p.night ? '#77796e' : '#bcad90');
  ctx.fillStyle = ground;
  ctx.fillRect(0, vy + h * 0.04, w, h);
  // Distant greenery, kept clear of the action silhouettes.
  for (let i = 0; i < 34; i++) {
    const side = i % 2 ? -1 : 1;
    const x = w / 2 + side * (w * 0.11 + hash(i + 17) * w * 0.26);
    const y = vy + h * 0.06 + hash(i + 47) * h * 0.11;
    ellipse(
      ctx,
      x,
      y,
      w * (0.023 + hash(i + 3) * 0.027),
      w * 0.026,
      i % 3 ? '#879450' : '#afa24f',
      null,
      0,
      hash(i) * 0.7,
    );
  }
  // Far buildings are drawn before their nearer neighbours.
  const sections = [
    [30, 47],
    [21, 30],
    [13, 21],
    [6, 13],
    [-4, 6],
  ];
  for (let i = 0; i < sections.length; i++) {
    facade(ctx, ...sections[i], -1, i, p, project, w);
    facade(ctx, sections[i][0] + 1.5, sections[i][1] + 1.5, 1, i + 1, p, project, w);
  }
  // Overhead utility wires and lantern strings are hand drawn, never UI dividers.
  ctx.save();
  ctx.strokeStyle = '#334642';
  ctx.lineWidth = Math.max(1, w / 250);
  for (let i = 0; i < 3; i++) {
    const y = h * (0.18 + i * 0.078);
    ctx.beginPath();
    ctx.moveTo(0, y - 17);
    ctx.bezierCurveTo(w * 0.25, y + 7, w * 0.63, y + 15, w, y - 15);
    ctx.stroke();
    if (p.night && i !== 0)
      for (let j = 1; j <= 5; j++)
        lantern(ctx, (w * j) / 6, y + Math.sin((j / 6) * Math.PI) * 9, 0.3 + i * 0.07, true);
  }
  ctx.restore();
  // Street-side gutters follow the same perspective as the lane markers.
  for (const side of [-1, 1]) {
    const far = project(44),
      near = project(-4);
    const x = (q) => w / 2 + side * w * 0.445 * q;
    line(
      ctx,
      [
        [x(far.q), far.y],
        [x(near.q), near.y],
      ],
      '#6e746460',
      w * 0.018,
    );
    line(
      ctx,
      [
        [x(far.q) - side * 3, far.y],
        [x(near.q) - side * 3, near.y],
      ],
      '#f1dab28c',
      w * 0.006,
    );
  }
  // A soft corner vignette gives the scene the warmth of a printed illustration.
  const vignette = ctx.createRadialGradient(w / 2, h * 0.48, w * 0.13, w / 2, h * 0.48, h * 0.75);
  vignette.addColorStop(0, '#152a2b00');
  vignette.addColorStop(0.7, '#152a2b00');
  vignette.addColorStop(1, p.night ? '#0b222750' : '#5d513328');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}

function drawStones(ctx, w, h, world, p, project) {
  const vy = h * 0.28,
    foot = h * 0.76;
  const edge = (y) => (w * 0.465 * (y - vy)) / (foot - vy);
  ctx.save();
  polygon(
    ctx,
    [
      [w / 2 - 8, vy],
      [w / 2 + 8, vy],
      [w / 2 + edge(h), h],
      [w / 2 - edge(h), h],
    ],
    null,
    null,
  );
  ctx.clip();
  const spacing = 2.5,
    shift = ((world % spacing) + spacing) % spacing;
  const colors = p.night
    ? ['#9b9381', '#ada18a', '#8a9087', '#b3a086', '#777f78', '#bbaa8c']
    : ['#e0cfab', '#d9c8a7', '#cab998', '#e7d5ad', '#bdb8a1', '#d6b994'];
  for (let row = 20; row >= -2; row--) {
    const z1 = row * spacing - shift,
      z2 = z1 + spacing - 0.09;
    const near = project(z1),
      far = project(z2);
    if (near.y > h + 60 || far.y < vy + 35) continue;
    for (let col = -4; col <= 4; col++) {
      const offset = row % 2 ? 0.47 : 0;
      const a = (col + offset) * w * 0.122,
        b = a + w * 0.117;
      const seed = row * 17 + col * 7 + Math.floor(world / spacing) * 23;
      const pts = [
        [w / 2 + a * near.q, near.y - 1],
        [w / 2 + b * near.q, near.y - 1],
        [w / 2 + b * far.q, far.y + 1],
        [w / 2 + a * far.q, far.y + 1],
      ];
      polygon(
        ctx,
        pts,
        colors[Math.floor(hash(seed) * colors.length)],
        '#77776255',
        clamp(near.q * 0.9, 0.25, 1.2),
      );
      line(ctx, [pts[2], pts[3]], '#fff1c74d', Math.max(0.4, near.q * 1.4));
      if (row < 7 && hash(seed + 1) > 0.62) {
        const x = (pts[0][0] + pts[2][0]) / 2,
          y = (near.y + far.y) / 2;
        line(
          ctx,
          [
            [x - 7 * near.q, y - 2 * near.q],
            [x, y],
            [x + 5 * near.q, y - 2 * near.q],
          ],
          '#696e5d38',
          0.9,
        );
      }
    }
  }
  // Quiet cream seams show three lanes without turning the alley into a highway.
  for (const boundary of [-0.5, 0.5]) {
    for (let i = 0; i < 9; i++) {
      const z = i * 6 - (((world % 6) + 6) % 6);
      const n = project(z),
        f = project(z + 2.7);
      if (n.y > h || f.y < vy + 30) continue;
      line(
        ctx,
        [
          [w / 2 + boundary * w * 0.24 * n.q, n.y],
          [w / 2 + boundary * w * 0.24 * f.q, f.y],
        ],
        p.lane + (p.lane.length === 7 ? 'a6' : ''),
        Math.max(0.6, n.q * 3),
      );
    }
  }
  ctx.restore();
}

function drawObstacle(ctx, type) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (type === 'barrier') {
    polygon(
      ctx,
      [
        [-45, -5],
        [-41, -35],
        [43, -35],
        [48, -5],
      ],
      '#d9ccb0',
      OUTLINE,
      2.5,
    );
    polygon(
      ctx,
      [
        [-45, -5],
        [48, -5],
        [42, 0],
        [-43, 0],
      ],
      '#817e69',
      OUTLINE,
      1.8,
    );
    polygon(
      ctx,
      [
        [-41, -35],
        [43, -35],
        [38, -41],
        [-37, -41],
      ],
      '#eee1bf',
      OUTLINE,
      2,
    );
    ctx.save();
    polygon(
      ctx,
      [
        [-43, -8],
        [-40, -33],
        [42, -33],
        [46, -8],
      ],
      null,
      null,
    );
    ctx.clip();
    for (let i = -2; i < 4; i++)
      polygon(
        ctx,
        [
          [i * 30 - 40, -8],
          [i * 30 - 25, -8],
          [i * 30 - 7, -33],
          [i * 30 - 22, -33],
        ],
        '#c25c43',
        null,
      );
    ctx.restore();
    for (const x of [-38, 37]) {
      polygon(
        ctx,
        [
          [x - 7, -9],
          [x + 7, -9],
          [x + 8, 5],
          [x - 8, 5],
        ],
        '#797b69',
        OUTLINE,
        1.6,
      );
      line(
        ctx,
        [
          [x - 5, -7],
          [x + 4, -7],
        ],
        '#aca892',
        1.2,
      );
    }
    for (const x of [-33, 0, 34]) ellipse(ctx, x, -31, 1.4, 1.4, '#817962');
    line(
      ctx,
      [
        [-37, -37],
        [37, -37],
      ],
      '#f7e9c5',
      2.2,
    );
    // Small distressed chips keep the barrier distinct from a flat UI stripe.
    polygon(
      ctx,
      [
        [-25, -27],
        [-20, -29],
        [-19, -24],
        [-23, -24],
      ],
      '#e7d9b8',
      null,
    );
    polygon(
      ctx,
      [
        [25, -16],
        [29, -18],
        [33, -17],
        [30, -14],
      ],
      '#b5a58a',
      null,
    );
  } else if (type === 'beam') {
    for (const x of [-46, 46]) {
      rounded(ctx, x - 5, -106, 10, 109, 2, '#527077', OUTLINE, 2.5);
      line(
        ctx,
        [
          [x - 2, -101],
          [x - 2, -1],
        ],
        '#94a3a1',
        2,
      );
      polygon(
        ctx,
        [
          [x - 10, 2],
          [x + 10, 2],
          [x + 8, -5],
          [x - 8, -5],
        ],
        '#8b8970',
        OUTLINE,
        1.6,
      );
    }
    rounded(ctx, -55, -108, 110, 28, 3, '#2e6c8a', OUTLINE, 3);
    polygon(
      ctx,
      [
        [-55, -108],
        [55, -108],
        [50, -115],
        [-51, -115],
      ],
      '#7b9a9b',
      OUTLINE,
      2,
    );
    rounded(ctx, -52, -103, 104, 18, 1, '#3c7894', null);
    line(
      ctx,
      [
        [-48, -104],
        [47, -104],
      ],
      '#91b5bc',
      2,
    );
    for (const x of [-45, 45]) ellipse(ctx, x, -92, 2.5, 2.5, '#c2c7b1', OUTLINE, 1);
    for (const x of [-37, 30]) {
      polygon(
        ctx,
        [
          [x - 10, -79],
          [x + 14, -79],
          [x + 13, -72],
          [x - 10, -72],
        ],
        '#e2bb5f',
        OUTLINE,
        1,
      );
      polygon(
        ctx,
        [
          [x - 8, -79],
          [x - 1, -79],
          [x - 5, -72],
          [x - 11, -72],
        ],
        '#293d3d',
        null,
      );
      polygon(
        ctx,
        [
          [x + 5, -79],
          [x + 12, -79],
          [x + 8, -72],
          [x + 1, -72],
        ],
        '#293d3d',
        null,
      );
    }
    // Downward chevrons read as a low passage from afar.
    for (const x of [-10, 9])
      line(
        ctx,
        [
          [x - 4, -96],
          [x, -91],
          [x + 4, -96],
        ],
        '#e7dbb8',
        2.2,
      );
  } else {
    polygon(
      ctx,
      [
        [-43, -5],
        [30, -5],
        [30, -72],
        [-43, -72],
      ],
      '#b47c45',
      OUTLINE,
      2.6,
    );
    polygon(
      ctx,
      [
        [30, -72],
        [45, -84],
        [45, -19],
        [30, -5],
      ],
      '#875d37',
      OUTLINE,
      2.2,
    );
    polygon(
      ctx,
      [
        [-43, -72],
        [-26, -84],
        [45, -84],
        [30, -72],
      ],
      '#dbab65',
      OUTLINE,
      2.2,
    );
    for (let y = -62; y < -5; y += 13) {
      line(
        ctx,
        [
          [-40, y],
          [28, y],
        ],
        '#674c325f',
        1.3,
      );
      line(
        ctx,
        [
          [-40, y + 2],
          [26, y + 2],
        ],
        '#e2b26f50',
        1,
      );
    }
    for (let x = -25; x < 32; x += 20)
      line(
        ctx,
        [
          [x, -83],
          [x - 16, -72],
        ],
        '#99703e',
        1.2,
      );
    for (let y = -71; y < -14; y += 13)
      line(
        ctx,
        [
          [32, y],
          [44, y - 11],
        ],
        '#493e3059',
        1.2,
      );
    polygon(
      ctx,
      [
        [-39, -70],
        [-30, -70],
        [28, -15],
        [28, -5],
        [18, -5],
        [-39, -59],
      ],
      '#d09a55',
      OUTLINE,
      1.7,
    );
    polygon(
      ctx,
      [
        [20, -70],
        [29, -70],
        [29, -61],
        [-31, -5],
        [-40, -5],
        [-40, -15],
      ],
      '#ca9552',
      OUTLINE,
      1.7,
    );
    rounded(ctx, -45, -74, 77, 8, 1, '#d9a15d', OUTLINE, 1.8);
    rounded(ctx, -45, -10, 77, 8, 1, '#ca9552', OUTLINE, 1.8);
    for (const [x, y] of [
      [-38, -70],
      [25, -70],
      [-38, -6],
      [25, -6],
    ])
      ellipse(ctx, x, y, 1.8, 1.8, '#4f4937');
    line(
      ctx,
      [
        [-38, -76],
        [28, -76],
      ],
      '#efc585',
      1.8,
    );
  }
}

function shoe(ctx, x, y, angle, thief, lifted) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  rounded(ctx, -9, -8, 18, 14, 6, thief ? '#4b4b42' : '#5a6250', OUTLINE, 2.1);
  rounded(
    ctx,
    -8,
    lifted ? -7 : 1,
    16,
    lifted ? 11 : 5,
    5,
    thief ? '#d4c6a5' : '#bfcb72',
    OUTLINE,
    1.2,
  );
  if (lifted) {
    line(
      ctx,
      [
        [-5, -4],
        [5, -4],
      ],
      '#858c61',
      1.1,
    );
    line(
      ctx,
      [
        [-5, 0],
        [5, 0],
      ],
      '#858c61',
      1.1,
    );
  }
  ctx.restore();
}

function head(ctx, x, y, thief) {
  ellipse(ctx, x, y + 7, 14.5, 15, '#dfa678', OUTLINE, 2);
  ellipse(ctx, x - 14, y + 8, 3.2, 4.5, '#dfa678', OUTLINE, 1.4);
  ellipse(ctx, x + 14, y + 8, 3.2, 4.5, '#dfa678', OUTLINE, 1.4);
  if (thief) {
    ctx.beginPath();
    ctx.moveTo(x - 16, y + 7);
    ctx.bezierCurveTo(x - 19, y - 15, x + 16, y - 19, x + 17, y + 7);
    ctx.closePath();
    ctx.fillStyle = '#263333';
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.stroke();
    rounded(ctx, x - 17, y + 2, 34, 7, 3, '#3f4941', OUTLINE, 1.3);
    line(
      ctx,
      [
        [x - 9, y - 7],
        [x - 7, y - 13],
      ],
      '#586052',
      1.3,
    );
  } else {
    const tufts = [
      [-17, 8],
      [-20, -2],
      [-13, 0],
      [-17, -9],
      [-8, -7],
      [-7, -16],
      [-2, -11],
      [4, -17],
      [8, -11],
      [15, -12],
      [14, -5],
      [21, -3],
      [16, 1],
      [18, 10],
      [11, 15],
      [-10, 15],
    ];
    polygon(
      ctx,
      tufts.map(([px, py]) => [x + px, y + py]),
      '#233639',
      OUTLINE,
      2,
    );
    for (const [a, b] of [
      [
        [-11, 0],
        [-5, -7],
      ],
      [
        [-3, -2],
        [1, -10],
      ],
      [
        [6, -1],
        [11, -6],
      ],
    ])
      line(
        ctx,
        [
          [x + a[0], y + a[1]],
          [x + b[0], y + b[1]],
        ],
        '#4d5d54',
        1.1,
      );
  }
}

function drawRunner(ctx, thief, pose, progress, frame) {
  const jacket = thief ? '#df7737' : '#2676a2';
  const light = thief ? '#f5ab55' : '#5da7c4';
  const dark = thief ? '#aa542e' : '#1d5273';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (pose === 'slide') {
    limb(
      ctx,
      [
        [0, -27],
        [-19, -14],
        [-35, -2],
      ],
      '#394342',
      16,
    );
    limb(
      ctx,
      [
        [9, -26],
        [28, -15],
        [43, -3],
      ],
      '#46504a',
      17,
    );
    shoe(ctx, -35, -2, -0.38, thief, false);
    shoe(ctx, 43, -3, 0.32, thief, false);
    limb(
      ctx,
      [
        [1, -46],
        [-17, -26],
        [-4, -9],
      ],
      jacket,
      13,
    );
    ellipse(ctx, -3, -7, 6, 5, '#e6ad7e', OUTLINE, 1.8);
    ctx.beginPath();
    ctx.moveTo(-9, -23);
    ctx.bezierCurveTo(-14, -34, -6, -54, 11, -56);
    ctx.bezierCurveTo(25, -55, 33, -43, 25, -29);
    ctx.lineTo(14, -15);
    ctx.closePath();
    ctx.fillStyle = jacket;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    ctx.stroke();
    curve(
      ctx,
      [
        [-4, -26],
        [7, -39],
        [14, -42],
        [24, -44],
      ],
      light,
      3,
    );
    limb(
      ctx,
      [
        [24, -45],
        [35, -29],
        [47, -17],
      ],
      jacket,
      13,
    );
    ellipse(ctx, 48, -15, 5.5, 6, '#e6ad7e', OUTLINE, 1.8);
    head(ctx, 16, -62, thief);
    return;
  }
  const catching = pose === 'catch',
    captured = pose === 'caught';
  const cycle = catching || captured ? 0 : Math.sin((frame / 12) * TAU);
  const jumping = pose === 'jump';
  const tuck = jumping ? Math.sin(progress * Math.PI) : 0;
  const hipY = -50;
  const lFoot = jumping
    ? [-19 - tuck * 6, -7 - tuck * 25]
    : [-14 + cycle * 10, -3 - Math.max(0, cycle) * 23];
  const rFoot = jumping
    ? [19 + tuck * 6, -9 - tuck * 35]
    : [14 + cycle * 8, -3 - Math.max(0, -cycle) * 23];
  limb(ctx, [[-12, hipY], [-17 - cycle * 6, -27 - tuck * 8], lFoot], '#37413f', 19);
  shoe(ctx, lFoot[0], lFoot[1], -0.1 - cycle * 0.18, thief, cycle > 0.15 || jumping);
  limb(ctx, [[12, hipY], [17 + cycle * 6, -29 - tuck * 16], rFoot], '#454c44', 19);
  shoe(ctx, rFoot[0], rFoot[1], 0.08 - cycle * 0.18, thief, cycle < -0.15 || jumping);
  // Arms have elbows and separate rolled sleeves/forearms.
  const arm = (side, back) => {
    const swing = jumping ? side * -0.3 : cycle * side;
    const shoulder = [side * 25, -104];
    const elbow =
      catching && side > 0
        ? [42, -108]
        : [side * (37 + swing * 4), -80 - (back ? swing * 13 : -swing * 7) - tuck * 5];
    const wrist =
      catching && side > 0
        ? [51, -117]
        : [side * (41 + swing * 7), -72 - (back ? swing * 13 : -swing * 10) - tuck * 10];
    limb(ctx, [shoulder, elbow], back ? dark : jacket, 16);
    line(
      ctx,
      [
        [elbow[0] - 5, elbow[1] - 2],
        [elbow[0] + 5, elbow[1] + 1],
      ],
      light,
      2.3,
    );
    limb(ctx, [elbow, wrist], '#e0a473', 10);
    ellipse(ctx, wrist[0], wrist[1] + 2, 5.8, 6.8, '#e7ad7c', OUTLINE, 1.7, side * -0.15);
  };
  arm(-1, true);
  // Under-shirt, waistband and the curved jacket hem.
  polygon(
    ctx,
    [
      [-23, -64],
      [22, -64],
      [21, -48],
      [-21, -48],
    ],
    '#e1d7b9',
    OUTLINE,
    2,
  );
  ctx.beginPath();
  ctx.moveTo(-28, -106);
  ctx.bezierCurveTo(-17, -118, 14, -118, 27, -105);
  ctx.bezierCurveTo(23, -90, 27, -75, 26, -61);
  ctx.bezierCurveTo(9, -52, -12, -62, -25, -54);
  ctx.bezierCurveTo(-29, -64, -24, -87, -28, -106);
  ctx.closePath();
  ctx.fillStyle = jacket;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-21, -105);
  ctx.bezierCurveTo(-12, -111, 8, -114, 18, -106);
  ctx.lineTo(19, -90);
  ctx.bezierCurveTo(7, -102, -8, -100, -20, -97);
  ctx.closePath();
  ctx.fillStyle = light;
  ctx.fill();
  polygon(
    ctx,
    [
      [-25, -89],
      [-18, -88],
      [-18, -69],
      [-25, -59],
    ],
    dark,
    null,
  );
  curve(
    ctx,
    [
      [-16, -81],
      [-3, -77],
      [10, -67],
      [22, -65],
    ],
    '#143f594a',
    2,
  );
  line(
    ctx,
    [
      [-8, -110],
      [7, -107],
    ],
    light,
    2.5,
  );
  arm(1, false);
  if (thief) {
    // An original small tan satchel and diagonal strap, visible from the rear.
    limb(
      ctx,
      [
        [-18, -108],
        [21, -70],
      ],
      '#574d37',
      5,
    );
    ctx.save();
    ctx.translate(6, -73);
    ctx.rotate(-0.12 + cycle * 0.025);
    rounded(ctx, -15, -14, 31, 29, 6, '#d4b579', OUTLINE, 2.3);
    rounded(ctx, -15, -14, 31, 13, 5, '#efd29a', OUTLINE, 1.7);
    line(
      ctx,
      [
        [-10, 4],
        [9, 4],
      ],
      '#b28b54',
      1.3,
    );
    rounded(ctx, -2, -5, 5, 9, 1, '#685a3e', null);
    ctx.restore();
  }
  head(ctx, cycle * 1.2, -131 + Math.abs(cycle) * 1.5, thief);
}

function obstacleKind(type) {
  if (['barrier', 'hurdle', 'jump'].includes(type)) return 'barrier';
  if (['beam', 'bar', 'lowbar', 'slide'].includes(type)) return 'beam';
  return 'crate';
}

export function createScene(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let w = 390,
    h = 844,
    dpr = 1,
    background = null,
    backgroundKey = '',
    destroyed = false;
  let previousState = null,
    previousTime = 0,
    thiefLaneVisual = 1;
  const characterCache = new Map(),
    obstacleCache = new Map();
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';

  function resize() {
    if (destroyed) return;
    const width = Math.max(
      1,
      Math.round(canvas.clientWidth || canvas.parentElement?.clientWidth || 390),
    );
    const height = Math.max(
      1,
      Math.round(canvas.clientHeight || canvas.parentElement?.clientHeight || 844),
    );
    const ratio = Math.min(2, canvas.ownerDocument.defaultView?.devicePixelRatio || 1);
    if (width === w && height === h && ratio === dpr && canvas.width === Math.round(width * ratio))
      return;
    w = width;
    h = height;
    dpr = ratio;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    background = null;
    backgroundKey = '';
  }

  function project(z) {
    const q = 12 / (12 + Math.max(-5, z));
    return { q, y: h * 0.28 + h * 0.48 * q };
  }

  function runnerSprite(thief, pose, progress, frame) {
    const normalizedFrame = ((Math.floor(frame) % 12) + 12) % 12;
    const jumpFrame = clamp(Math.round(progress * 7), 0, 7);
    const key = `${thief ? 't' : 'p'}:${pose}:${pose === 'jump' ? jumpFrame : ['slide', 'catch', 'caught'].includes(pose) ? 0 : normalizedFrame}`;
    if (!characterCache.has(key)) {
      const surface = newSurface(canvas, 180, 185, 1.5);
      surface.ctx.translate(90, 157);
      drawRunner(surface.ctx, thief, pose, jumpFrame / 7, normalizedFrame);
      characterCache.set(key, surface.canvas);
    }
    return characterCache.get(key);
  }

  function obstacleSprite(type) {
    if (!obstacleCache.has(type)) {
      const surface = newSurface(canvas, 132, 144, 1.5);
      surface.ctx.translate(66, 129);
      drawObstacle(surface.ctx, type);
      obstacleCache.set(type, surface.canvas);
    }
    return obstacleCache.get(type);
  }

  function shadow(x, y, size, scale, opacity = 0.23) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ellipse(ctx, x + 5 * scale, y + 3 * scale, size * scale, 7 * scale, '#233a38');
    ctx.restore();
  }

  function character(thief, x, groundY, scale, pose, progress, frame, boost, impact, caught) {
    let lift = pose === 'jump' ? Math.sin(progress * Math.PI) * 75 * scale : 0;
    const bob = pose === 'run' ? Math.abs(Math.sin((frame / 12) * TAU)) * 3 * scale : 0;
    shadow(x, groundY, pose === 'slide' ? 42 : 31, scale, pose === 'jump' ? 0.12 : 0.25);
    const sprite = runnerSprite(thief, pose, progress, frame);
    if (boost && !thief) {
      ctx.save();
      for (let i = 3; i >= 1; i--) {
        ctx.globalAlpha = 0.055 + (3 - i) * 0.025;
        ctx.drawImage(
          sprite,
          x - 90 * scale,
          groundY - lift - bob - 157 * scale + i * 11 * scale,
          180 * scale,
          185 * scale,
        );
      }
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.65;
      for (let i = 0; i < 5; i++) {
        const offset = (i - 2) * 13 * scale;
        line(
          ctx,
          [
            [x + offset, groundY + 9 * scale],
            [x + offset * 1.5, groundY + (20 + (i % 3) * 8) * scale],
          ],
          i % 2 ? '#fff0b3' : '#62c9d1',
          2 * scale,
        );
      }
      ctx.restore();
    }
    ctx.save();
    ctx.translate(x, groundY - lift - bob);
    if (impact && !thief) ctx.rotate(Math.sin(impact * 15) * 0.12 * impact);
    if (caught && !thief) ctx.rotate(0.035);
    ctx.drawImage(sprite, -90 * scale, -157 * scale, 180 * scale, 185 * scale);
    ctx.restore();
    if (!thief && pose === 'slide') {
      ctx.save();
      ctx.globalAlpha = 0.22;
      for (let i = 0; i < 4; i++)
        ellipse(
          ctx,
          x - 35 * scale - i * 10 * scale,
          groundY - 1 - i * 2,
          (7 + i * 2) * scale,
          4 * scale,
          '#eadabc',
        );
      ctx.restore();
    }
    if (impact && !thief) {
      ctx.save();
      ctx.globalAlpha = clamp(impact, 0, 1);
      for (let i = 0; i < 3; i++) {
        const a = (i * TAU) / 3 + frame * 0.07;
        const sx = x + Math.cos(a) * 24 * scale,
          sy = groundY - 151 * scale + Math.sin(a) * 8 * scale;
        polygon(
          ctx,
          [
            [sx, sy - 5],
            [sx + 2, sy - 1],
            [sx + 6, sy],
            [sx + 2, sy + 2],
            [sx + 1, sy + 6],
            [sx - 2, sy + 2],
            [sx - 6, sy],
            [sx - 2, sy - 2],
          ],
          '#ffd880',
          OUTLINE,
          1,
        );
      }
      ctx.restore();
    }
  }

  function speedLines(time, amount) {
    if (amount <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(0.55, amount * 0.55);
    for (let i = 0; i < 16; i++) {
      const side = i % 2 ? -1 : 1;
      const phase = (time * 1.1 + hash(i) * 3) % 1;
      const q1 = 0.3 + phase * 0.83,
        q2 = Math.max(0.25, q1 - 0.12 - hash(i + 2) * 0.14);
      const lateral = side * w * (0.5 + hash(i + 3) * 0.3);
      line(
        ctx,
        [
          [w / 2 + lateral * q1, h * 0.28 + h * 0.49 * q1],
          [w / 2 + lateral * q2, h * 0.28 + h * 0.49 * q2],
        ],
        i % 3 ? '#ffe6a4' : '#b6eff0',
        1 + hash(i + 1) * 1.5,
      );
    }
    ctx.restore();
  }

  function render(state, level, options = {}) {
    if (destroyed) return;
    resize();
    const mode = options.mode || 'play',
      home = mode === 'home';
    const p = paletteFor(level),
      key = JSON.stringify(p);
    if (!background || backgroundKey !== key) {
      background = newSurface(canvas, w, h, dpr);
      drawBackdrop(background.ctx, w, h, p, project);
      backgroundKey = key;
    }
    // Menu ambience has its own clock. A run always uses its simulation clock,
    // so backgrounding and pausing freeze all action animation as well.
    const time =
      home && Number.isFinite(options.time)
        ? options.time
        : Number.isFinite(state?.elapsed)
          ? state.elapsed
          : Number(options.time || 0);
    const world = home ? 3.2 : Number(state?.world || 0);
    const boost = options.boost ?? (state?.boostRemaining > 0 ? 1 : 0);
    const impact = Number(options.impact || 0);
    const caught = ['won', 'caught', 'success'].includes(state?.phase);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(background.canvas, 0, 0, w, h);
    drawStones(ctx, w, h, world, p, project);
    const entities = [];
    const visibleWaves = home
      ? [
          { at: world + 1.5, obstacles: [{ lane: 1, type: 'barrier' }] },
          { at: world + 12, obstacles: [{ lane: 2, type: 'crate' }] },
          { at: world + 24, obstacles: [{ lane: 0, type: 'beam' }] },
        ]
      : level?.waves || [];
    for (const wave of visibleWaves) {
      const z = Number(wave.at) - world;
      if (z < -0.8 || z > 44) continue;
      for (const obstacle of wave.obstacles || [])
        entities.push({
          z,
          kind: 'obstacle',
          lane: obstacle.lane,
          type: obstacleKind(obstacle.type),
        });
    }
    const playerLane = home ? 1 : Number(state?.laneVisual ?? state?.lane ?? 1);
    const targetLane = home ? 1.2 : Number(state?.thiefLane ?? 1);
    if (previousState !== state || time < previousTime || home) thiefLaneVisual = targetLane;
    else
      thiefLaneVisual =
        targetLane +
        (thiefLaneVisual - targetLane) * Math.exp(-10 * clamp(time - previousTime, 0, 0.1));
    previousState = state;
    previousTime = time;
    const distance = home ? 10.5 : caught ? 0.8 : clamp(Number(state?.distance ?? 12), 0.4, 40);
    entities.push({
      z: distance,
      kind: 'thief',
      lane: caught ? playerLane + 0.28 : thiefLaneVisual,
    });
    entities.push({ z: 0, kind: 'player', lane: playerLane });
    entities.sort((a, b) => b.z - a.z || (a.kind === 'player' ? 1 : -1));
    const playerScale = clamp(Math.min(w / 390, (h / 844) * 1.15), 0.7, 1.65);
    for (const entity of entities) {
      const pos = project(entity.z),
        x = w / 2 + (entity.lane - 1) * w * 0.24 * pos.q;
      const scale = playerScale * pos.q;
      if (entity.kind === 'obstacle') {
        shadow(x, pos.y, entity.type === 'beam' ? 49 : 42, scale, 0.22);
        const sprite = obstacleSprite(entity.type);
        ctx.drawImage(sprite, x - 66 * scale, pos.y - 129 * scale, 132 * scale, 144 * scale);
      } else {
        const thief = entity.kind === 'thief';
        const action = !thief && home ? 'jump' : !thief ? state?.action : 'run';
        const pose = caught
          ? thief
            ? 'caught'
            : 'catch'
          : action === 'jump'
            ? 'jump'
            : action === 'slide'
              ? 'slide'
              : 'run';
        const duration = pose === 'jump' ? 1.1 : 1.05;
        const progress =
          home && !thief ? 0.47 : clamp(1 - Number(state?.actionRemaining || 0) / duration, 0, 1);
        const frame =
          time * (thief ? 10.2 : boost ? 16 : state?.slowRemaining > 0 ? 7 : 11.5) +
          (thief ? 4 : 0);
        character(thief, x, pos.y, scale, pose, progress, frame, boost, impact, caught);
      }
    }
    speedLines(time, boost);
    // Foreground leaves frame the street, never the central touch/obstacle area.
    ctx.save();
    for (const side of [-1, 1]) {
      const x = side < 0 ? -5 : w + 5;
      const y = h * 0.82;
      for (let i = 0; i < 4; i++)
        leaf(
          ctx,
          x + side * i * 2,
          y + i * 26,
          w * (0.07 + i * 0.01),
          -side * (0.5 + i * 0.11),
          i % 2 ? '#597340' : '#789547',
        );
    }
    ctx.restore();
    if (p.night) {
      ctx.fillStyle = '#19344415';
      ctx.fillRect(0, h * 0.28, w, h * 0.72);
    }
    if (mode === 'levels') {
      ctx.fillStyle = '#102a37a3';
      ctx.fillRect(0, 0, w, h);
    }
    if (mode === 'result') {
      ctx.fillStyle = caught ? '#223d362e' : '#18333d55';
      ctx.fillRect(0, 0, w, h);
    }
    if (impact > 0) {
      const glow = ctx.createRadialGradient(w / 2, h / 2, w * 0.35, w / 2, h / 2, h * 0.7);
      glow.addColorStop(0, '#d7673d00');
      glow.addColorStop(1, `rgba(212, 83, 47, ${clamp(impact * 0.34, 0, 0.34)})`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function destroy() {
    destroyed = true;
    background = null;
    characterCache.clear();
    obstacleCache.clear();
    previousState = null;
  }

  resize();
  return { render, resize, destroy };
}
