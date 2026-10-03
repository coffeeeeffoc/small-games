/* One terrain geometry feeds simulation and artwork. No Canvas-only obstacles,
 * no level-ID branches, and no calls to the combat random number generator. */
const TAU = Math.PI * 2;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const noise = (n) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
function oval(c, x, y, rx, ry, fill, stroke, width = 1) {
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
function poly(c, points, fill, stroke, width = 1.5) {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
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
export function tint(color, amount = 0) {
  const hex = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : '8a8666';
  return `rgb(${[0, 2, 4].map((i) => clamp(parseInt(hex.slice(i, i + 2), 16) + amount, 0, 255)).join(',')})`;
}
export function drawMapGround(c, terrain, palette = {}) {
  for (const region of terrain) {
    if (region.kind === 'wall') continue;
    const r = region.radius || 30;
    c.save();
    c.translate(region.x, region.y);
    if (region.kind === 'mud') {
      oval(c, 0, 0, r, r, 'rgba(46,70,56,.4)', '#758c69', 1.5);
      const seed = region.x + region.y * 2;
      for (let i = 0; i < 11; i++) {
        const a = noise(seed + i * 2) * TAU,
          d = Math.sqrt(noise(seed + i * 5)) * r * 0.75;
        oval(
          c,
          Math.cos(a) * d,
          Math.sin(a) * d,
          9 + noise(i + seed) * 19,
          5 + noise(i + seed + 8) * 8,
          'rgba(73,108,115,.36)',
          'rgba(146,181,161,.23)',
        );
      }
      c.setLineDash([3, 6]);
      oval(c, 0, 0, r, r, null, 'rgba(203,212,154,.4)', 1);
      c.setLineDash([]);
    } else if (region.kind === 'slope') {
      oval(c, 0, 0, r, r, tint(palette.ground || '#899278', -17), '#a4ad7f', 1.5);
      c.beginPath();
      c.arc(0, 0, r - 2, 0, TAU);
      c.clip();
      const angle = Math.atan2(region.direction?.y ?? -1, region.direction?.x ?? 0) + Math.PI / 2;
      c.rotate(angle);
      for (let i = -2; i <= 2; i++) {
        const y = i * r * 0.28;
        c.beginPath();
        c.moveTo(-r, y);
        c.lineTo(r, y);
        c.strokeStyle = '#4f694e';
        c.lineWidth = 5;
        c.stroke();
        c.beginPath();
        c.moveTo(-r, y - 3);
        c.lineTo(r, y - 3);
        c.strokeStyle = '#b2bc8d';
        c.lineWidth = 2;
        c.stroke();
      }
      for (const y of [-r * 0.4, r * 0.28])
        poly(
          c,
          [
            [-9, y + 6],
            [0, y - 5],
            [9, y + 6],
            [0, y],
          ],
          '#dfce80',
        );
    }
    c.restore();
  }
}
export function drawMapWall(c, wall, palette = {}) {
  const r = wall.radius || 30,
    h = Math.min(62, r * 0.95);
  c.save();
  c.translate(wall.x, wall.y);
  // This full ground circle is the collision footprint, including behind the rock.
  oval(c, 0, 0, r, r, 'rgba(30,50,38,.35)', '#c0bb8f', 1.8);
  const body = tint(palette.ground || '#868c76', -27),
    top = tint(palette.ground || '#868c76', 22);
  poly(
    c,
    [
      [-r * 0.76, r * 0.35],
      [-r * 0.82, -h],
      [r * 0.56, -h - r * 0.1],
      [r * 0.8, r * 0.2],
      [r * 0.33, r * 0.62],
    ],
    body,
    '#364d3d',
    2,
  );
  poly(
    c,
    [
      [-r * 0.82, -h],
      [-r * 0.45, -h - r * 0.42],
      [r * 0.62, -h - r * 0.43],
      [r * 0.56, -h - r * 0.1],
    ],
    top,
    '#c3c5a0',
    1.5,
  );
  poly(
    c,
    [
      [r * 0.56, -h - r * 0.1],
      [r * 0.62, -h - r * 0.43],
      [r * 0.83, -h - r * 0.17],
      [r * 0.86, r * 0.15],
      [r * 0.8, r * 0.2],
    ],
    tint(palette.ground || '#868c76', -48),
    '#364d3d',
  );
  c.beginPath();
  c.moveTo(-r * 0.45, -h);
  c.lineTo(-r * 0.3, -h * 0.4);
  c.lineTo(-r * 0.45, r * 0.3);
  c.strokeStyle = '#354939';
  c.lineWidth = 2;
  c.stroke();
  for (let i = 0; i < 5; i++)
    oval(c, -r * 0.6 + i * r * 0.25, -h + 2 + Math.sin(i * 5 + wall.x) * 4, 7, 3, '#66854c');
  c.restore();
}

export function drawMapLandmark(c, level) {
  const kind = level.visual?.landmark,
    accent = level.visual?.palette?.accent || '#f5cd88';
  c.save();
  if (kind === 'core') {
    c.translate(level.playerStart?.x || 720, level.playerStart?.y || 470);
    c.globalAlpha = 0.22;
    oval(c, 0, 0, 98, 65, null, '#fa5c83', 3);
    for (let i = 0; i < 8; i++) {
      c.save();
      c.rotate((i * TAU) / 8);
      poly(
        c,
        [
          [0, -73],
          [-15, -37],
          [0, -14],
          [15, -37],
        ],
        'rgba(223,49,88,.12)',
        '#ea6c8d',
      );
      c.restore();
    }
  } else if (kind === 'pods') {
    for (const [x, y] of [
      [155, 167],
      [1240, 732],
    ]) {
      c.strokeStyle = '#5b4835';
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(x - 43, y + 7);
      c.bezierCurveTo(x - 22, y - 18, x + 34, y + 14, x + 52, y - 29);
      c.stroke();
      for (let i = 0; i < 4; i++)
        oval(c, x - 30 + i * 22, y - 5 + Math.sin(i * 3) * 6, 8, 12, '#b87837', '#e3b169', 1.5);
    }
  } else if (kind === 'shield-gate') {
    for (const x of [430, 1000]) {
      poly(
        c,
        [
          [x - 17, 114],
          [x + 17, 114],
          [x + 14, 151],
          [x, 167],
          [x - 14, 151],
        ],
        '#2e687e',
        accent,
        2,
      );
      poly(
        c,
        [
          [x, 125],
          [x - 6, 138],
          [x, 151],
          [x + 6, 138],
        ],
        accent,
      );
    }
  } else if (kind === 'mist-tree' || kind === 'root-hole') {
    for (const [x, y] of [
      [100, 167],
      [1320, 744],
    ]) {
      c.beginPath();
      c.moveTo(x - 40, y);
      c.bezierCurveTo(x - 13, y - 27, x + 10, y + 20, x + 38, y - 17);
      c.strokeStyle = '#455942';
      c.lineWidth = 8;
      c.stroke();
    }
  } else if (kind === 'frost-garden') {
    for (let i = 0; i < 20; i++)
      oval(
        c,
        130 + noise(i * 7) * 1190,
        165 + noise(i * 9 + 31) * 565,
        4 + noise(i) * 7,
        2,
        'rgba(212,238,248,.25)',
      );
  }
  c.restore();
}

export function drawWeatherGround(c, state, t, level) {
  const weather = state.weather || level.weather || {},
    kind = weather.kind;
  c.save();
  if (kind === 'fog') {
    const p = state.player || level.playerStart || { x: 720, y: 470 };
    const fog = c.createRadialGradient(p.x, p.y, 190, p.x, p.y, 720);
    fog.addColorStop(0, 'rgba(190,211,207,0)');
    fog.addColorStop(0.35, 'rgba(174,200,196,.1)');
    fog.addColorStop(1, 'rgba(172,197,194,.33)');
    c.fillStyle = fog;
    c.fillRect(15, 65, 1425, 805);
    for (let i = 0; i < 3; i++)
      oval(
        c,
        160 + i * 460 + Math.sin(t * 0.12 + i) * 50,
        230 + i * 170,
        250,
        55,
        'rgba(191,218,211,.055)',
      );
  } else if (kind === 'overcast' || kind === 'cloudy' || kind === 'rain') {
    c.fillStyle = kind === 'rain' ? 'rgba(37,63,83,.08)' : 'rgba(45,67,65,.07)';
    c.fillRect(15, 65, 1425, 805);
    oval(c, 450 + Math.sin(t * 0.06) * 240, 390, 500, 180, 'rgba(20,47,47,.06)');
  } else if (kind === 'hail') {
    c.fillStyle = 'rgba(120,192,226,.08)';
    c.fillRect(15, 65, 1425, 805);
  } else if (kind === 'sunny') {
    c.fillStyle = 'rgba(244,205,107,.045)';
    c.fillRect(15, 65, 1425, 805);
  }
  c.restore();
}
export function drawWeatherParticles(c, state, t, level) {
  const weather = state.weather || level.weather || {},
    kind = weather.kind,
    wind = weather.wind || 0;
  c.save();
  if (kind === 'rain' || kind === 'hail') {
    const count = kind === 'rain' ? 48 : 28;
    c.strokeStyle = 'rgba(181,223,236,.26)';
    c.lineWidth = 1;
    for (let i = 0; i < count; i++) {
      const speed = kind === 'rain' ? 310 : 180;
      const y = 140 + ((noise(i * 3 + 29) * 615 + t * speed) % 630),
        x = 100 + ((noise(i * 7) * 1220 + t * wind * 70) % 1235);
      if (kind === 'rain') {
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x - 3 - wind * 6, y + 12);
        c.stroke();
      } else oval(c, x, y, 2.4, 3.1, 'rgba(225,250,255,.55)');
    }
    if (kind === 'rain')
      for (let i = 0; i < 7; i++) {
        const age = (t * 0.7 + i * 0.31) % 1;
        oval(
          c,
          160 + noise(i * 7) * 1120,
          175 + noise(i * 9) * 560,
          age * 11,
          age * 4,
          null,
          `rgba(188,221,222,${(1 - age) * 0.18})`,
        );
      }
  }
  if (wind > 0) {
    for (let i = 0; i < 12; i++) {
      const x = 80 + ((noise(i * 11) * 1270 + t * (45 + wind * 65)) % 1300),
        y = 150 + noise(i * 13) * 620 + Math.sin(t + i) * 6;
      c.save();
      c.translate(x, y);
      c.rotate(0.5 + Math.sin(t * 0.8 + i) * 0.4);
      oval(c, 0, 0, 5, 2, 'rgba(220,208,139,.5)');
      c.restore();
    }
  }
  c.restore();
}
