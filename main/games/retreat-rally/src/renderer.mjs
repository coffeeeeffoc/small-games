import { FLAGS } from './simulation.mjs';

const INK = '#20383c';
function path(c, points, fill, stroke = INK, width = 2) {
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
function ellipse(c, x, y, rx, ry, fill, stroke) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 2;
    c.stroke();
  }
}
function line(c, x, y, x2, y2, color, width = 2) {
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x2, y2);
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = 'round';
  c.stroke();
}

export function drawSoldier(c, u, time, scale = 1, showBars = true) {
  const blue = u.side === 'blue',
    color = blue ? '#397eaa' : '#b65c3c',
    light = blue ? '#7cafc4' : '#d98a5b';
  const y = 425 + u.lane * 29,
    motion = Math.sin(time * 11 + u.lane * 2 + u.x * 0.1);
  const bounce = u.moving ? Math.abs(motion) * 3 : Math.sin(time * 2 + u.lane) * 0.6;
  c.save();
  c.translate(u.x, y);
  c.scale(scale, scale);
  ellipse(c, 0, 4, 21, 6, '#203d3d30');
  if (u.hp <= 0) {
    c.globalAlpha = 0.5;
    c.rotate(1.35);
    c.translate(-22, -5);
  }
  c.translate(0, -bounce);
  const facing = u.moving || (blue ? 1 : -1);
  c.save();
  c.scale(facing > 0 ? 1 : -1, 1);
  // Cloth, articulated legs, layered armour and a distinct original chibi silhouette.
  path(
    c,
    [
      [-10, -37],
      [-25, -17],
      [-5, -18],
    ],
    light,
  );
  const stride = u.moving ? motion * 7 : 0;
  line(c, -6, -14, -11 + stride, -1, '#253e46', 7);
  line(c, 7, -14, 12 - stride, -1, '#253e46', 7);
  line(c, -11 + stride, -1, -4 + stride, 0, '#192f37', 5);
  line(c, 12 - stride, -1, 19 - stride, 0, '#192f37', 5);
  path(
    c,
    [
      [-12, -38],
      [10, -38],
      [15, -14],
      [-14, -14],
    ],
    color,
  );
  line(c, -10, -24, 11, -24, '#dabd75', 4);
  line(c, -8, -34, 7, -17, '#c3af76', 3);
  for (let i = 0; i < 3; i++) line(c, -8 + i * 6, -19, -8 + i * 6, -13, INK, 1);
  ellipse(c, 0, -48, 15, 17, '#f4cc9c', INK);
  path(
    c,
    [
      [-16, -48],
      [-16, -56],
      [-10, -65],
      [3, -68],
      [13, -60],
      [17, -49],
      [4, -53],
      [-5, -49],
    ],
    '#354d54',
  );
  line(c, -13, -57, 12, -58, '#809799', 2);
  ellipse(c, -3, -69, 5, 5, '#243d47', INK);
  path(
    c,
    [
      [-2, -71],
      [3, -80],
      [14, -79],
      [20, -74],
      [9, -75],
      [7, -69],
    ],
    color,
  );
  ellipse(c, 7, -47, 1.6, 2.2, '#263a3b');
  line(c, 7, -39, 11, -40, '#936842', 1.3);
  ellipse(c, -12, -46, 4, 5, '#ecc18f', INK);
  const attack = u.fighting ? Math.sin(time * 13) * 9 : 0;
  line(c, 8, -32, 20, -27 - attack, color, 7);
  ellipse(c, 20, -27 - attack, 4, 4, '#edc794', INK);
  if (u.kind === 'archer') {
    c.beginPath();
    c.arc(17, -35, 24, -1.1, 1.1);
    c.strokeStyle = '#765735';
    c.lineWidth = 3;
    c.stroke();
    line(c, 28, -56, 28, -14, '#ece2be', 1);
  } else {
    c.save();
    c.translate(21, -27 - attack);
    c.rotate(-0.35 + attack * 0.06);
    path(
      c,
      [
        [0, 3],
        [1, -28],
        [7, -35],
        [7, -5],
      ],
      '#d7e3d5',
      INK,
      1.8,
    );
    line(c, -4, 1, 9, 1, '#d2ae58', 3);
    c.restore();
  }
  ellipse(c, -13, -26, 8, 12, '#a2a586', INK);
  ellipse(c, -13, -26, 4, 7, color);
  c.restore();
  if (u.flash > 0) {
    ellipse(c, 0, -35, 22, 32, '#fff4ca66');
  }
  if (showBars && u.hp > 0) {
    c.fillStyle = '#213c41';
    c.fillRect(-21, -94, 42, 6);
    c.fillStyle = u.hp / u.maxHp > 0.4 ? '#b8d17d' : '#e29658';
    c.fillRect(-20, -93, (40 * u.hp) / u.maxHp, 4);
    c.fillStyle = '#2b4d5644';
    c.fillRect(-21, -85, 42, 3);
    c.fillStyle = '#7accda';
    c.fillRect(-21, -85, (42 * u.stamina) / 100, 3);
  }
  c.restore();
}

export function drawFlag(c, x, blue, time, integrity = 100, scale = 1) {
  c.save();
  c.translate(x, 440);
  c.scale(scale, scale);
  const wind = Math.sin(time * 2) * 5;
  ellipse(c, 0, 4, 28, 7, '#223c3530');
  line(c, 0, 3, 0, -192, '#364647', 6);
  line(c, -1, -180, -1, -5, '#b3a277', 2);
  path(
    c,
    [
      [0, -208],
      [-6, -193],
      [0, -185],
      [6, -193],
    ],
    '#e6c57c',
  );
  const color = blue ? '#356b99' : '#aa4d37';
  path(
    c,
    [
      [3, -184],
      [28, -183 + wind],
      [68, -168],
      [83, -172 + wind],
      [79, -78],
      [48, -81 + wind],
      [3, -96],
    ],
    color,
  );
  path(
    c,
    [
      [6, -178],
      [29, -177 + wind],
      [72, -161],
      [77, -163 + wind],
      [73, -88],
      [47, -90 + wind],
      [6, -101],
    ],
    null,
    '#d8bc76',
    2,
  );
  c.fillStyle = '#e9d5a3';
  c.font = 'bold 32px serif';
  c.textAlign = 'center';
  c.fillText(blue ? '岚' : '焰', 40, -124 + wind * 0.3);
  path(
    c,
    [
      [4, -91],
      [55, -78],
      [72, -82],
      [61, -69],
      [40, -72],
      [4, -84],
    ],
    color,
    INK,
    1,
  );
  if (integrity < 100) {
    c.fillStyle = '#233c45';
    c.fillRect(-23, 16, 46, 6);
    c.fillStyle = blue ? '#5eb6dc' : '#d47451';
    c.fillRect(-22, 17, (44 * integrity) / 100, 4);
  }
  c.restore();
}

export function render(c, s, { width, height, time = 0, background = null, home = false } = {}) {
  c.save();
  c.clearRect(0, 0, width, height);
  c.scale(width / 1200, height / 675);
  if (background) {
    c.drawImage(background, 0, 0, 1200, 675);
  } else {
    const sky = c.createLinearGradient(0, 0, 0, 675);
    sky.addColorStop(0, '#abcdd3');
    sky.addColorStop(0.5, '#e8e2c1');
    sky.addColorStop(1, '#88a678');
    c.fillStyle = sky;
    c.fillRect(0, 0, 1200, 675);
    for (let i = 0; i < 10; i++)
      path(
        c,
        [
          [i * 155 - 120, 410],
          [i * 155 - 80, 210 - (i % 3) * 65],
          [i * 155 - 50, 150 - (i % 3) * 45],
          [i * 155 - 10, 230],
          [i * 155 + 65, 420],
        ],
        i % 2 ? '#789f9b' : '#94b4ac',
        null,
      );
    ellipse(c, 650, 615, 850, 190, '#b8be83');
    ellipse(c, 530, 630, 820, 110, '#d4c696');
  }
  if (home) {
    drawFlag(c, 850, true, time, 100, 1.55);
    for (let i = 0; i < 6; i++)
      drawSoldier(
        c,
        {
          x: 710 + i * 52,
          side: 'blue',
          kind: 'sword',
          lane: (i % 3) * 0.85,
          hp: 100,
          maxHp: 100,
          stamina: 100,
          moving: 0,
        },
        time,
        1.3,
        false,
      );
    c.restore();
    return;
  }
  if (!s) {
    c.restore();
    return;
  }
  drawFlag(c, FLAGS.blue, true, time, s.flags.blue);
  drawFlag(c, FLAGS.red, false, time, s.flags.red);
  const v = s.volley;
  for (const z of v.zones) {
    const warning = v.phase === 'warning' || v.phase === 'gap';
    c.fillStyle = warning ? '#f9b54d42' : '#f39c4370';
    c.fillRect(z.x, 310, z.width, 219);
    c.strokeStyle = '#f09339';
    c.lineWidth = 3;
    c.setLineDash([10, 8]);
    c.strokeRect(z.x, 310, z.width, 219);
    c.setLineDash([]);
    c.fillStyle = '#fff0c0';
    c.font = 'bold 24px sans-serif';
    c.textAlign = 'center';
    c.fillText(warning ? '!' : '↓', z.x + z.width / 2, 350);
    if (v.phase === 'impact' || (v.phase === 'warning' && v.timer < 0.65)) {
      const p =
        v.phase === 'impact' ? 1 - Math.max(0, v.timer) / 0.45 : Math.max(0, 1 - v.timer / 0.65);
      for (let i = 0; i < 12; i++) {
        const end = z.x + 12 + ((i * 37) % (z.width - 20)),
          targetY = 397 + ((i * 19) % 100),
          start = z.side === 'blue' ? 1000 : 200;
        const t = Math.min(1, p + (i % 3) * 0.06),
          x = start + (end - start) * t,
          y = 300 + (targetY - 300) * t - 220 * Math.sin(Math.PI * t);
        line(c, x, y, x + (z.side === 'blue' ? 22 : -22), y - 12, '#d1c6a3', 2);
        path(
          c,
          [
            [x, y],
            [x + (z.side === 'blue' ? 10 : -10), y - 10],
            [x + (z.side === 'blue' ? 13 : -13), y - 3],
          ],
          '#4c4a32',
          null,
        );
        if (v.phase === 'impact') {
          ellipse(c, end, targetY, 9 + Math.sin(time * 10 + i) * 3, 3, '#f9d37888');
        }
      }
    }
  }
  // Draw dead soldiers first so living units remain readable.
  [...s.units]
    .sort((a, b) => (a.hp > 0) - (b.hp > 0) || a.lane - b.lane)
    .forEach((u) => drawSoldier(c, u, time));
  for (const u of s.units.filter((u) => u.hp > 0 && s.retreat[u.side] && !u.fighting)) {
    c.fillStyle = '#d6f9d7';
    c.font = 'bold 14px sans-serif';
    c.textAlign = 'center';
    if (u.stamina < 99) c.fillText('+', u.x + 20, 365 + u.lane * 29 - Math.sin(time * 3) * 5);
    c.fillStyle = u.side === 'blue' ? '#72c5dc' : '#edb095';
    c.font = 'bold 26px sans-serif';
    c.fillText(
      u.side === 'blue' ? '‹' : '›',
      u.x - (u.side === 'blue' ? 24 : -24),
      420 + u.lane * 29,
    );
  }
  for (const e of s.effects) {
    c.globalAlpha = Math.min(1, e.life * 3);
    c.fillStyle = '#fff0cf';
    c.strokeStyle = '#694230';
    c.lineWidth = 3;
    c.font = 'bold 17px sans-serif';
    c.textAlign = 'center';
    const y = 355 + e.lane * 29 - (0.5 - e.life) * 40;
    c.strokeText(e.text, e.x, y);
    c.fillText(e.text, e.x, y);
  }
  c.restore();
}
