import { HEROES, WEAPONS } from './content.mjs';
import { getLinks } from './engine.mjs';

const TAU = Math.PI * 2;
const INK = '#244940';
const GOLD = '#d9aa52';
const PALETTE = {
  nezha: { main: '#e7684a', light: '#ffb478', dark: '#842f35', skin: '#ffdab0' },
  wukong: { main: '#d9a63e', light: '#ffe2a0', dark: '#695033', skin: '#efbb76' },
  erlang: { main: '#539c91', light: '#b6e7d0', dark: '#2c5863', skin: '#f5d6b6' },
};
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));

function oval(c, x, y, rx, ry, fill, stroke) {
  c.beginPath();
  c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, TAU);
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.stroke();
  }
}

function path(c, points, fill, stroke = INK) {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.stroke();
  }
}

function line(c, points, color = INK, width = 2) {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.strokeStyle = color;
  c.lineWidth = width;
  c.stroke();
}

function rect(c, x, y, w, h, r, fill, stroke) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.stroke();
  }
}

function text(c, value, x, y, size, color, weight = 600) {
  c.fillStyle = color;
  c.font = `${weight} ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(value, x, y);
}

function glow(c, x, y, radius, color) {
  const g = c.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, color.slice(0, 7) + '00');
  oval(c, x, y, radius, radius, g);
}

function gear(c, x, y, radius, rotation, color) {
  c.save();
  c.translate(x, y);
  c.rotate(rotation);
  c.lineWidth = 1.4;
  for (let i = 0; i < 10; i++) {
    c.rotate(TAU / 10);
    rect(c, -2, -radius - 2, 4, 7, 1, color);
  }
  oval(c, 0, 0, radius - 1, radius - 1, null, color);
  oval(c, 0, 0, radius * 0.48, radius * 0.48, null, color);
  c.restore();
}

function sparks(c, x, y, radius, t, color, count = 8) {
  c.save();
  c.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + t;
    const r = radius * (0.78 + 0.2 * Math.sin(i * 13 + t * 4));
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r * 0.8;
    line(
      c,
      [
        [px - 2, py],
        [px + 2, py],
      ],
      color,
      1.5,
    );
    line(
      c,
      [
        [px, py - 2],
        [px, py + 2],
      ],
      color,
      1.5,
    );
  }
  c.restore();
}

function flame(c, x, y, size, t, color = '#ff985d') {
  c.save();
  c.translate(x, y);
  c.scale(size, size);
  c.beginPath();
  c.moveTo(-5, 0);
  c.bezierCurveTo(-11, -8, -4, -11, -5 + Math.sin(t * 7) * 2, -19);
  c.bezierCurveTo(3, -16, 0, -11, 6, -13);
  c.bezierCurveTo(13, -3, 5, 4, -5, 0);
  c.fillStyle = color;
  c.fill();
  path(
    c,
    [
      [-2, 0],
      [-3, -6],
      [1, -12],
      [4, -3],
      [2, 1],
    ],
    '#fff0ab',
    null,
  );
  c.restore();
}

function wheel(c, x, y, t, hot = true) {
  c.save();
  c.translate(x, y);
  c.lineWidth = 2;
  if (hot) glow(c, 0, 0, 17, '#f8864539');
  oval(c, 0, 0, 9, 9, '#6e4437', '#edb04e');
  oval(c, 0, 0, 5.5, 5.5, '#ffdc88', '#ff8050');
  c.rotate(t * 4);
  for (let i = 0; i < 4; i++) {
    c.rotate(Math.PI / 2);
    line(
      c,
      [
        [0, 0],
        [0, 8],
      ],
      '#ae6239',
      1.8,
    );
    if (hot) flame(c, 0, -10, 0.32, t + i);
  }
  c.restore();
}

function drone(c, x, y, t, size = 1, firing = false) {
  c.save();
  c.translate(x, y + Math.sin(t * 5) * 1.6);
  c.scale(size, size);
  c.lineWidth = 1.7;
  line(
    c,
    [
      [-17, -2],
      [0, 1],
      [17, -2],
    ],
    INK,
    3.2,
  );
  for (const side of [-1, 1]) {
    oval(c, side * 18, -4, 10, 3.5, '#dcdfc7', INK);
    line(
      c,
      [
        [side * 18 - Math.cos(t * 45) * 11, -6],
        [side * 18 + Math.cos(t * 45) * 11, -6],
      ],
      '#68a394',
      2,
    );
    rect(c, side * 18 - 2, -7, 4, 6, 2, '#cfaf6a', INK);
  }
  path(
    c,
    [
      [-9, -6],
      [0, -10],
      [10, -5],
      [7, 6],
      [0, 9],
      [-7, 5],
    ],
    '#689d8e',
  );
  oval(c, 0, 0, 4, 4, firing ? '#fff2b2' : '#b9f5dc', '#f5e3a2');
  if (firing) glow(c, 0, 2, 16, '#9cf3dc90');
  line(
    c,
    [
      [-5, 7],
      [-7, 11],
    ],
    '#516960',
    2,
  );
  line(
    c,
    [
      [5, 7],
      [7, 11],
    ],
    '#516960',
    2,
  );
  c.restore();
}

function weapon(c, key, t, action = 0, integrated = false) {
  c.save();
  c.lineWidth = 1.7;
  if (key === 'drone') {
    if (!integrated) {
      oval(c, 0, -1, 15, 4, '#547f6b');
      rect(c, -9, -8, 18, 8, 3, '#ced6b9', INK);
      for (let i = 0; i < 3; i++) {
        c.save();
        c.globalAlpha *= 0.3 + 0.2 * Math.sin(t * 4 - i);
        oval(c, 0, -14 - i * 4, 7 - i, 2, null, '#57b298');
        c.restore();
      }
    }
    drone(c, 0, integrated ? 0 : -32, t, integrated ? 0.62 : 1, action > 0.4);
  } else {
    if (!integrated) {
      oval(c, 0, -2, 21, 7, '#a48d5b', INK);
      oval(c, 0, -6, 21, 7, '#d7c594', INK);
      for (const x of [-13, 13]) {
        rect(c, x - 4, -13, 8, 12, 3, '#647461', INK);
        line(
          c,
          [
            [x - 2, -9],
            [x + 2, -9],
          ],
          '#b4c29b',
          1,
        );
      }
    }
    c.translate(action > 0 ? -action * 3 : 0, integrated ? 0 : -17);
    if (key === 'fire') {
      rect(c, -15, -17, 11, 22, 4, '#b95643', INK);
      rect(c, -13, -20, 7, 5, 2, '#d4b166', INK);
      line(
        c,
        [
          [-11, -10],
          [-11, -3],
          [2, 0],
        ],
        '#d9b668',
        4,
      );
      rect(c, -5, -8, 21, 13, 5, '#667f69', INK);
      rect(c, 5, -9, 22, 6, 2, '#e0b772', INK);
      rect(c, 5, 0, 22, 6, 2, '#e0b772', INK);
      rect(c, 21, -10, 8, 17, 2, '#73674f', INK);
      for (const y of [-6, 2]) oval(c, 29, y, 2, 2.8, '#ffc078');
      if (action > 0.25) {
        c.save();
        c.translate(32, -1);
        c.rotate(Math.PI / 2);
        flame(c, 0, 0, action * 1.4, t);
        c.restore();
      }
    } else {
      oval(c, -3, -5, 16, 12, '#d4b56e', INK);
      path(
        c,
        [
          [-17, -6],
          [-14, -15],
          [0, -18],
          [11, -11],
          [11, 1],
          [-4, 7],
        ],
        '#6a8271',
      );
      rect(c, 0, -13, 28, 14, 3, '#a6b6a2', INK);
      rect(c, 8, -14, 4, 16, 1, '#d9b66a', INK);
      rect(c, 24, -16, 9, 19, 3, '#547464', INK);
      oval(c, 31, -6, 3, 6, '#263f37', '#d5c18a');
      oval(c, -9, -4, 4, 4, '#e6cd8e', INK);
      if (action > 0.55) {
        glow(c, 36, -7, 22, '#ffd585a0');
        path(
          c,
          [
            [32, -11],
            [46, -18],
            [42, -9],
            [54, -5],
            [41, -2],
            [45, 6],
            [32, -2],
          ],
          '#ffe4a7',
          null,
        );
      }
    }
  }
  c.restore();
}

function hero(c, key, t, action, charge, walking, linkedWeapon) {
  const p = PALETTE[key] || PALETTE.erlang;
  const walk = walking ? Math.sin(t * 12) : Math.sin(t * 2) * 0.15;
  const breath = Math.sin(t * (charge ? 14 : 3)) * (charge ? 1.4 : 0.7);
  const swing = action * (key === 'wukong' ? 1.5 : 0.8);
  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.lineWidth = 1.6;

  // Cloth, limbs and weapons each pivot separately so the figures stay alive while idle.
  c.save();
  c.translate(-4, -35 + breath);
  c.rotate(-0.05 + Math.sin(t * 3) * 0.05);
  path(
    c,
    [
      [-7, -8],
      [-19, -3],
      [-24 - Math.sin(t * 4) * 3, 20],
      [-13, 26],
      [2, 13],
    ],
    p.dark,
  );
  path(
    c,
    [
      [-8, -5],
      [-15, 0],
      [-20, 19],
      [-14, 20],
      [-4, 9],
    ],
    p.main,
    null,
  );
  if (key === 'nezha') {
    c.beginPath();
    c.moveTo(0, -4);
    c.bezierCurveTo(-19, -23, -30, -11 + Math.sin(t * 4) * 8, -34, -24 + Math.sin(t * 4) * 3);
    c.bezierCurveTo(-36, -7, -20, -7, 1, 4);
    c.fillStyle = '#de584a';
    c.fill();
  }
  c.restore();

  if (linkedWeapon === 'fire') {
    rect(c, -19, -40, 11, 24, 4, '#ae5542', INK);
    line(
      c,
      [
        [-14, -38],
        [-14, -44],
        [-6, -45],
      ],
      '#d5b773',
      3,
    );
  } else if (linkedWeapon === 'cannon') {
    c.save();
    c.translate(1, -41);
    c.scale(0.78, 0.78);
    weapon(c, 'cannon', t, action, true);
    c.restore();
  } else if (linkedWeapon === 'drone') {
    line(
      c,
      [
        [-5, -34],
        [-17, -48],
        [-22, -48],
      ],
      '#c6bb83',
      2,
    );
    drone(c, -24, -48, t, 0.58, action > 0.4);
  }

  for (const side of [-1, 1]) {
    c.save();
    c.translate(side * 6, -15);
    c.rotate(side * walk * 0.18);
    rect(c, -4, -1, 8, 14, 3, p.dark, INK);
    rect(c, -5, 7, 12, 6, 3, '#35544b', INK);
    line(
      c,
      [
        [-3, 5],
        [4, 5],
      ],
      p.light,
      2,
    );
    c.restore();
  }
  if (key === 'nezha') {
    wheel(c, -10, 1, t, true);
    wheel(c, 11, 1, -t, true);
  }

  c.translate(charge ? Math.sin(t * 34) * 0.65 : 0, breath);
  path(
    c,
    [
      [-13, -37],
      [-7, -43],
      [8, -42],
      [15, -35],
      [11, -17],
      [-10, -17],
    ],
    p.main,
  );
  path(
    c,
    [
      [-10, -34],
      [-1, -30],
      [10, -35],
      [7, -22],
      [-7, -22],
    ],
    p.dark,
    null,
  );
  path(
    c,
    [
      [0, -37],
      [7, -32],
      [0, -25],
      [-7, -32],
    ],
    p.light,
  );
  line(
    c,
    [
      [0, -35],
      [0, -29],
    ],
    '#fff0b8',
    1.4,
  );
  rect(c, -13, -21, 26, 5, 2, '#ddb365', INK);
  path(
    c,
    [
      [-10, -16],
      [0, -14],
      [10, -16],
      [15, -8],
      [5, -9],
      [0, -6],
      [-8, -9],
      [-15, -8],
    ],
    p.main,
  );

  c.save();
  c.translate(-12, -35);
  c.rotate(-0.25 - swing * 0.45);
  rect(c, -5, -1, 9, 14, 4, p.light, INK);
  oval(c, 0, 13, 4.5, 4.5, p.skin, INK);
  c.restore();

  c.save();
  c.translate(12, -34);
  c.rotate(0.3 - swing);
  rect(c, -4, -1, 9, 15, 4, p.light, INK);
  oval(c, 2, 14, 4.5, 4.5, p.skin, INK);
  c.translate(4, 12);
  c.rotate(-0.3 + swing * 0.4);
  const staffColor = key === 'wukong' ? '#684332' : '#93a994';
  line(
    c,
    [
      [7, 24],
      [7, -43],
    ],
    INK,
    5,
  );
  line(
    c,
    [
      [7, 24],
      [7, -43],
    ],
    staffColor,
    3,
  );
  line(
    c,
    [
      [7, 15],
      [7, 22],
    ],
    '#f4cd74',
    4,
  );
  line(
    c,
    [
      [7, -35],
      [7, -42],
    ],
    '#f4cd74',
    5,
  );
  if (key !== 'wukong') {
    path(
      c,
      [
        [7, -57],
        [14, -43],
        [7, -37],
        [0, -43],
      ],
      key === 'nezha' ? '#ffe4ae' : '#d7eee0',
    );
    line(
      c,
      [
        [7, -54],
        [7, -39],
      ],
      '#86a093',
      1.2,
    );
    if (key === 'erlang') {
      path(
        c,
        [
          [0, -46],
          [-4, -53],
          [-5, -40],
          [5, -37],
        ],
        '#cbe2d4',
      );
      path(
        c,
        [
          [14, -46],
          [18, -53],
          [19, -40],
          [9, -37],
        ],
        '#cbe2d4',
      );
    } else {
      line(
        c,
        [
          [7, -37],
          [-1, -34],
          [-4, -25 + Math.sin(t * 7) * 2],
        ],
        '#e65d48',
        3,
      );
    }
  }
  if (linkedWeapon === 'fire') {
    rect(c, 3, -27, 9, 18, 3, '#d9af62', INK);
    rect(c, 2, -31, 11, 7, 2, '#536c59', INK);
    if (action > 0.3 || charge) flame(c, 7, -32, 0.7 + action * 0.5, t);
  }
  c.restore();

  c.save();
  c.translate(action * 1.5, -48);
  c.rotate(action * 0.1);
  oval(c, 0, -2, 15, 14, '#253c35', INK);
  if (key === 'wukong') {
    oval(c, -15, 0, 5, 6, '#b98342', INK);
    oval(c, 15, 0, 5, 6, '#b98342', INK);
    path(
      c,
      [
        [-13, 0],
        [-10, -10],
        [-3, -14],
        [0, -10],
        [6, -15],
        [11, -7],
        [14, 2],
      ],
      '#bd8f49',
    );
    oval(c, 0, 1, 12, 10, p.skin, INK);
    oval(c, -5, -1, 6, 6, '#ffdc9c');
    oval(c, 5, -1, 6, 6, '#ffdc9c');
    oval(c, 0, 6, 6, 4, '#f8d294');
    line(
      c,
      [
        [-14, -7],
        [-6, -8],
        [0, -5],
        [6, -8],
        [14, -7],
      ],
      '#f5d36f',
      3,
    );
  } else {
    oval(c, -13, 1, 3, 4, p.skin, INK);
    oval(c, 13, 1, 3, 4, p.skin, INK);
    oval(c, 0, 2, 11.5, 11, p.skin, INK);
    path(
      c,
      [
        [-12, -2],
        [-9, -12],
        [0, -15],
        [12, -10],
        [13, 0],
        [7, -5],
        [4, -1],
        [0, -6],
        [-5, -2],
        [-6, -6],
      ],
      '#273e36',
    );
    if (key === 'nezha') {
      for (const side of [-1, 1]) {
        oval(c, side * 12, -12, 6, 6, '#263d36', INK);
        line(
          c,
          [
            [side * 9, -13],
            [side * 15, -9],
          ],
          '#e97453',
          2.5,
        );
        path(
          c,
          [
            [side * 13, -9],
            [side * 20, -5],
            [side * 15, -1],
          ],
          '#eb6c4e',
          null,
        );
      }
    } else {
      path(
        c,
        [
          [-13, -10],
          [-15, -20],
          [-6, -14],
          [0, -23],
          [6, -14],
          [15, -20],
          [13, -10],
        ],
        '#b7d2c4',
      );
      path(
        c,
        [
          [0, -20],
          [4, -13],
          [0, -9],
          [-4, -13],
        ],
        '#e4c779',
      );
      oval(c, 0, -3, 2.5, 1.8, charge ? '#fff8cb' : '#bf7f42');
      if (charge) glow(c, 0, -3, 13, '#e9ef9699');
    }
  }
  const blink = Math.sin(t * 1.17) > 0.991;
  line(
    c,
    [
      [-8, 0],
      [-3, charge ? 1 : -1],
    ],
    '#4e4936',
    1.6,
  );
  line(
    c,
    [
      [3, charge ? 1 : -1],
      [8, 0],
    ],
    '#4e4936',
    1.6,
  );
  if (blink) {
    line(
      c,
      [
        [-7, 3],
        [-3, 3],
      ],
      INK,
      1.5,
    );
    line(
      c,
      [
        [3, 3],
        [7, 3],
      ],
      INK,
      1.5,
    );
  } else {
    oval(c, -5, 3, 1.3, 2, INK);
    oval(c, 5, 3, 1.3, 2, INK);
    oval(c, -4.6, 2.3, 0.45, 0.5, '#fff5d8');
    oval(c, 5.4, 2.3, 0.45, 0.5, '#fff5d8');
  }
  line(
    c,
    [
      [-2, 8],
      [2, 8 - action * 2],
    ],
    '#905d46',
    1,
  );
  c.restore();
  c.restore();
}

function sleeper(c, item, t) {
  const p = PALETTE[item.key] || PALETTE.erlang;
  const chars = item.parts || [];
  c.save();
  c.lineWidth = 1.6;
  oval(c, 0, -1, 24, 7, '#b5b99b');
  path(
    c,
    [
      [-18, -3],
      [-15, -22],
      [0, -30],
      [15, -23],
      [19, -3],
    ],
    '#9ba993',
  );
  path(
    c,
    [
      [-13, -8],
      [-10, -22],
      [0, -26],
      [10, -21],
      [13, -8],
    ],
    '#c9ceae',
    null,
  );
  oval(c, 0, -20 + Math.sin(t * 2) * 0.6, 12, 10, '#acb9a0', INK);
  line(
    c,
    [
      [-8, -21],
      [-4, -19],
      [-1, -21],
    ],
    '#4a6756',
    1.3,
  );
  line(
    c,
    [
      [2, -21],
      [5, -19],
      [8, -21],
    ],
    '#4a6756',
    1.3,
  );
  line(
    c,
    [
      [-9, -10],
      [0, -6],
      [9, -11],
    ],
    '#67826a',
    3,
  );
  (HEROES[item.key]?.parts || chars).forEach((char, i, all) => {
    const x = (i - (all.length - 1) / 2) * 17;
    rect(c, x - 7, -3, 14, 18, 3, chars.includes(char) ? p.main : '#cbd0b7', '#789078');
    text(
      c,
      chars.includes(char) ? char : '·',
      x,
      6,
      11,
      chars.includes(char) ? '#fff1ce' : '#718774',
      700,
    );
  });
  const drift = t % 2;
  c.globalAlpha *= 1 - drift / 2;
  text(c, 'z', 18 + drift * 3, -30 - drift * 10, 12 + drift * 3, '#6b8f7c');
  c.restore();
}

function enemy(c, u, t, action, walking) {
  const heavy = u.kind === 'brute' || u.kind === 'boss';
  const boss = u.kind === 'boss';
  const run = u.kind === 'runner';
  c.save();
  c.scale(boss ? 1.35 : heavy ? 1.13 : 0.88, boss ? 1.22 : heavy ? 1.03 : 0.9);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.lineWidth = 1.8;
  const stride = walking ? Math.sin(t * (run ? 17 : 10)) * 4 : 0;
  for (const side of [-1, 1]) {
    line(
      c,
      [
        [side * 8, -13],
        [side * 9 + stride * side, -2],
      ],
      '#586c5e',
      7,
    );
    rect(c, side * 9 + stride * side - 6, -4, 12, 6, 2, '#424f44', INK);
  }
  path(
    c,
    [
      [-15, -36],
      [12, -36],
      [17, -15],
      [7, -9],
      [-15, -14],
    ],
    heavy ? '#8e6f59' : '#80907d',
  );
  path(
    c,
    [
      [-9, -33],
      [9, -33],
      [11, -18],
      [-10, -18],
    ],
    '#566b5c',
  );
  line(
    c,
    [
      [-7, -27],
      [7, -27],
    ],
    '#b8b7a0',
    2,
  );
  c.save();
  c.translate(14, -29);
  c.rotate(-action * 0.7);
  line(
    c,
    [
      [0, 0],
      [6, 11],
    ],
    '#84927a',
    7,
  );
  if (run) {
    line(
      c,
      [
        [6, 13],
        [21, -8],
      ],
      '#cfc7aa',
      4,
    );
  } else {
    line(
      c,
      [
        [7, 17],
        [7, -15],
      ],
      '#655640',
      4,
    );
    path(
      c,
      [
        [7, -20],
        [21, -16],
        [23, -5],
        [7, -6],
      ],
      boss ? '#ca6e51' : '#b7b6a0',
    );
  }
  c.restore();
  if (heavy)
    path(
      c,
      [
        [-17, -32],
        [-28, -27],
        [-27, -12],
        [-17, -7],
        [-9, -15],
        [-9, -29],
      ],
      '#b57b5a',
    );
  c.translate(action * 2, -43 + Math.sin(t * 3) * 0.5);
  oval(c, 0, 0, 13, 12, '#bac5a8', INK);
  path(
    c,
    [
      [-15, 0],
      [-15, -9],
      [-6, -16],
      [7, -14],
      [14, -5],
      [13, 1],
      [6, -4],
      [-6, -4],
    ],
    '#6d7865',
  );
  line(
    c,
    [
      [0, -12],
      [0, -4],
    ],
    '#c58c61',
    3,
  );
  if (boss) {
    path(
      c,
      [
        [-13, -7],
        [-24, -17],
        [-23, -27],
        [-16, -18],
        [-7, -14],
      ],
      '#d1bc88',
    );
    path(
      c,
      [
        [12, -7],
        [22, -17],
        [21, -27],
        [15, -18],
        [6, -14],
      ],
      '#d1bc88',
    );
  } else if (run)
    path(
      c,
      [
        [0, -14],
        [-5, -23],
        [3, -22],
        [8, -12],
      ],
      '#b5714f',
    );
  line(
    c,
    [
      [-9, 1],
      [-3, 3],
    ],
    '#ab4e3d',
    2.5,
  );
  line(
    c,
    [
      [3, 3],
      [9, 1],
    ],
    '#ab4e3d',
    2.5,
  );
  path(
    c,
    [
      [-6, 7],
      [0, 4],
      [6, 7],
      [0, 10],
    ],
    '#707a65',
    null,
  );
  c.restore();
}

function figure(c, item, t, { scale = 1, flip = false, bars = false } = {}) {
  if (!item) return;
  const anim = item.anim || 'idle';
  const age = item.animTime || 0;
  const isEnemy = item.side === 'enemy';
  const color = isEnemy
    ? '#ce8061'
    : HEROES[item.key]?.color || WEAPONS[item.key]?.color || '#80ae8e';
  const asleep =
    anim === 'sleep' ||
    (item.kind === 'hero' &&
      item.parts &&
      item.parts.length < (HEROES[item.key]?.parts.length || 2));
  const duration = item.animDuration || (anim === 'enter' ? 0.45 : 0.65);
  const progress = clamp(age / duration);
  const action =
    anim === 'attack'
      ? Math.sin(clamp(age / (item.animDuration || 0.38)) * Math.PI)
      : anim === 'ultimate'
        ? 0.85
        : 0;
  const charge = anim === 'charge';
  const entering = anim === 'enter';
  const exiting = anim === 'exit';
  c.save();
  c.scale(scale, scale);
  c.globalAlpha *= exiting ? 1 - progress : entering ? clamp(progress * 3) : 1;
  oval(c, 0, 3, 22 * (entering ? 0.5 + progress * 0.5 : 1), 6, '#294d4323');
  if (charge || anim === 'ultimate' || anim === 'upgrade') {
    glow(c, 0, -24, 48, color + '40');
    c.save();
    c.translate(0, 2);
    c.scale(1, 0.35);
    c.rotate(t * 1.6);
    c.lineWidth = 2;
    oval(c, 0, 0, 30 + Math.sin(t * 8) * 2, 30 + Math.sin(t * 8) * 2, null, color);
    for (let i = 0; i < 4; i++) {
      c.rotate(Math.PI / 2);
      path(
        c,
        [
          [-3, -26],
          [0, -34],
          [3, -26],
        ],
        '#fff0be',
        null,
      );
    }
    c.restore();
    sparks(c, 0, -26, 34, t * 2, color, 7);
  }
  const jump = entering
    ? -Math.sin((1 - progress) * Math.PI * 0.5) * 28
    : exiting
      ? -progress * 18
      : anim === 'ultimate'
        ? -Math.sin(progress * Math.PI) * 12
        : 0;
  c.translate(0, jump);
  if (entering) c.scale(1 + Math.sin(progress * Math.PI) * 0.08, 0.85 + progress * 0.15);
  if (exiting) {
    c.rotate(progress * (isEnemy ? -0.22 : 0.18));
    c.scale(1 - progress * 0.15, 1 - progress * 0.15);
  }
  if (anim === 'upgrade')
    c.scale(
      1 + Math.sin(clamp(age / 0.85) * Math.PI) * 0.14,
      1 + Math.sin(clamp(age / 0.85) * Math.PI) * 0.14,
    );
  if (anim === 'ultimate' && !isEnemy && item.kind === 'hero') {
    for (const offset of [14, 27]) {
      c.save();
      c.globalAlpha *= 0.17 * (1 - progress);
      c.translate(-offset * (1 - progress), 2);
      hero(c, item.key, t - offset * 0.01, action, false, false, item.weapon);
      c.restore();
    }
  }
  c.save();
  if (flip) c.scale(-1, 1);
  if (asleep) sleeper(c, item, t);
  else if (isEnemy) enemy(c, item, t, action, anim === 'walk');
  else if (item.kind === 'weapon') weapon(c, item.key, t, action);
  else
    hero(
      c,
      item.key,
      t,
      action,
      charge,
      anim === 'walk',
      typeof item.weapon === 'string' ? item.weapon : item.weapon?.key,
    );
  c.restore();
  if (anim === 'upgrade') text(c, '升阶', 0, -83 - age * 6, 10, '#a17531');
  if (bars && !exiting && !asleep) {
    const top = item.kind === 'weapon' ? -57 : item.kind === 'boss' ? -88 : -78;
    rect(c, -20, top, 40, 4, 2, '#244b3e24');
    rect(
      c,
      -20,
      top,
      Math.max(0.1, 40 * clamp((item.hp ?? 1) / (item.maxHp || 1))),
      4,
      2,
      isEnemy ? '#cb745b' : '#659b75',
    );
    if (!isEnemy && item.kind === 'hero') {
      rect(c, -20, top + 6, 40, 2.5, 1, '#244b3e17');
      if (item.energy)
        rect(
          c,
          -20,
          top + 6,
          40 * clamp(item.energy / 100),
          2.5,
          1,
          charge ? '#f2aa52' : '#d2b25d',
        );
    }
  }
  c.restore();
}

function crystal(c, x, y, t, enemyCore, hp, maxHp, defense) {
  const color = enemyCore ? '#ca8063' : '#6aac8c';
  c.save();
  c.translate(x, y);
  glow(c, 0, -20, 64, enemyCore ? '#d47c6320' : '#62ac8130');
  oval(c, 0, 10, 41, 14, '#294d431b');
  path(
    c,
    [
      [-30, -2],
      [0, -15],
      [30, -2],
      [30, 10],
      [0, 22],
      [-30, 10],
    ],
    '#939f83',
    INK,
  );
  path(
    c,
    [
      [-30, -2],
      [0, -15],
      [30, -2],
      [0, 10],
    ],
    '#dad9b5',
    INK,
  );
  oval(c, 0, -2, 24, 9, '#8baf91', '#ebd69c');
  if (defense) {
    c.lineWidth = 8;
    c.beginPath();
    c.ellipse(0, -31, 23, 33, 0, Math.PI, TAU);
    c.strokeStyle = '#8c8870';
    c.stroke();
    line(
      c,
      [
        [-23, -31],
        [-23, -2],
      ],
      '#8c8870',
      8,
    );
    line(
      c,
      [
        [23, -31],
        [23, -2],
      ],
      '#8c8870',
      8,
    );
    oval(c, 0, -26, 16, 25, '#a968542b');
    c.save();
    c.globalAlpha = 0.5 + Math.sin(t * 2) * 0.2;
    oval(c, 0, -27, 10, 20, '#c9865966');
    c.restore();
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.3 + i / 3) % 1;
      oval(c, Math.sin(i * 3 + t) * 11, -5 - p * 43, 2, 2, '#ddaa75');
    }
  } else {
    c.translate(0, -Math.sin(t * 2) * 3);
    path(
      c,
      [
        [0, -66],
        [19, -40],
        [15, -11],
        [0, 0],
        [-15, -11],
        [-19, -40],
      ],
      color,
    );
    path(
      c,
      [
        [0, -66],
        [0, 0],
        [-15, -11],
        [-19, -40],
      ],
      enemyCore ? '#ad5a4c' : '#377663',
      null,
    );
    path(
      c,
      [
        [0, -66],
        [19, -40],
        [0, -33],
        [-19, -40],
      ],
      enemyCore ? '#ebbea0' : '#bde2b7',
      null,
    );
    path(
      c,
      [
        [0, -33],
        [19, -40],
        [15, -11],
        [0, 0],
      ],
      enemyCore ? '#d99071' : '#7ab69a',
      null,
    );
    line(
      c,
      [
        [0, -60],
        [0, -34],
        [11, -15],
      ],
      '#f3edb597',
      1.4,
    );
    sparks(c, 0, -32, 33, t * 0.3, enemyCore ? '#c79875' : '#8baa76', 5);
  }
  if (!defense) {
    text(c, enemyCore ? '敌方晶核' : '我方晶核', 0, 35, 11, enemyCore ? '#98674f' : '#52745c');
    rect(c, -31, 45, 62, 5, 2.5, '#43594821');
    const ratio = clamp((hp ?? 1) / (maxHp || 1));
    if (ratio > 0) rect(c, -31, 45, 62 * ratio, 5, 2.5, color);
    text(c, `${Math.ceil(hp ?? 0)}`, 0, 60, 10, '#647764');
  }
  c.restore();
}

function battlefield(c, state, t) {
  const sky = c.createLinearGradient(0, 0, 0, 400);
  sky.addColorStop(0, '#e7ebd9');
  sky.addColorStop(0.58, '#f3efdc');
  sky.addColorStop(1, '#d6dfc7');
  c.fillStyle = sky;
  c.fillRect(0, 0, 1000, 400);
  for (let i = 0; i < 8; i++) {
    const x = ((i * 163 + t * (i % 2 ? 1.5 : -1) + 1100) % 1140) - 70;
    const y = i % 2 ? 365 : 25;
    oval(c, x, y, 90, 16, '#ffffff55');
    oval(c, x + 25, y - 7, 45, 16, '#ffffff45');
  }
  gear(c, 39, 58, 22, t * 0.05, '#a8b59644');
  gear(c, 967, 354, 33, -t * 0.04, '#8ca98d2e');
  c.lineWidth = 1;
  oval(c, 497, 349, 465, 35, '#42614913');
  path(
    c,
    [
      [64, 55],
      [912, 55],
      [969, 333],
      [923, 371],
      [81, 371],
      [29, 333],
    ],
    '#a8b494',
    '#c3c9aa',
  );
  path(
    c,
    [
      [29, 319],
      [969, 319],
      [923, 371],
      [81, 371],
    ],
    '#a5b18e',
    null,
  );
  for (let i = 0; i < 17; i++) {
    const x = 67 + i * 53;
    line(
      c,
      [
        [x, 338],
        [x + 8, 363],
      ],
      '#8f9d7a44',
      1,
    );
  }
  path(
    c,
    [
      [72, 36],
      [911, 36],
      [965, 326],
      [39, 326],
    ],
    '#cbd3b2',
    '#a6b596',
  );
  path(
    c,
    [
      [85, 45],
      [900, 45],
      [951, 316],
      [53, 316],
    ],
    '#e3e4c7',
    '#f8efd1',
  );

  for (let row = 0; row < 3; row++) {
    const y = 90 + row * 106;
    rect(c, 95, y - 28, 813, 54, 15, row % 2 ? '#cbd3b452' : '#eff0d83c');
    line(
      c,
      [
        [103, y + 22],
        [889, y + 22],
      ],
      '#bbae774d',
      1,
    );
    for (let i = 0; i < 20; i++) {
      const x = 114 + i * 40;
      path(
        c,
        [
          [x, y + 22],
          [x + 3, y + 19],
          [x + 6, y + 22],
          [x + 3, y + 25],
        ],
        '#c9b77766',
        null,
      );
    }
    for (let col = 0; col < 4; col++) {
      const x = 130 + col * 82;
      const filled = state.board?.[row * 4 + col];
      rect(c, x - 33, y - 24, 66, 48, 8, filled ? '#b7c9a344' : '#dce1c52e', '#91ae8f3d');
      line(
        c,
        [
          [x - 5, y],
          [x + 5, y],
        ],
        '#8eaa873d',
        1,
      );
      line(
        c,
        [
          [x, y - 4],
          [x, y + 4],
        ],
        '#8eaa873d',
        1,
      );
    }
  }
  c.save();
  c.setLineDash([3, 9]);
  line(
    c,
    [
      [470, 49],
      [470, 319],
    ],
    '#a6ad7975',
    1.5,
  );
  c.restore();
  for (let i = 0; i < 27; i++) {
    const x = 58 + ((i * 173) % 884);
    const y = i % 2 ? 329 + (i % 4) * 3 : 42 - (i % 3) * 2;
    line(
      c,
      [
        [x - 3, y],
        [x - 5, y - 6],
        [x, y - 2],
        [x + 3, y - 7],
        [x + 3, y],
      ],
      '#95aa7766',
      1.2,
    );
    if (i % 5 === 0) oval(c, x + 4, y - 8, 2, 2, '#dfbd7b');
  }
  crystal(c, 61, 192, t, false, state.coreHp, state.coreMax, false);
  crystal(c, 939, 192, t + 1, true, state.enemyCoreHp, state.enemyCoreMax, state.mode !== 'attack');
  const label = state.mode === 'attack' ? '机关军团  →  突破敌阵' : '守住三路  ·  护佑晶核';
  text(c, label, 515, 18, 10, '#7a8b6e', 500);
  text(c, '壹', 447, 89, 11, '#a9ae8b');
  text(c, '贰', 447, 195, 11, '#a9ae8b');
  text(c, '叁', 447, 301, 11, '#a9ae8b');
}

function effect(c, e, t) {
  const left = clamp(e.life / (e.maxLife || 1));
  const p = 1 - left;
  const color = e.color || '#e6b96f';
  const attackKind = e.weapon || e.key;
  const fireAttack = attackKind === 'fire' || attackKind === 'nezha';
  const cannonAttack = attackKind === 'cannon' || attackKind === 'wukong';
  const laserAttack = attackKind === 'drone' || attackKind === 'erlang';
  c.save();
  c.lineCap = 'round';
  if (e.type === 'projectile') {
    const x = e.x + ((e.tx ?? e.x) - e.x) * p;
    const y = e.y + ((e.ty ?? e.y) - e.y) * p - (cannonAttack ? Math.sin(p * Math.PI) * 19 : 0);
    const dx = (e.tx ?? e.x) - e.x,
      dy = (e.ty ?? e.y) - e.y;
    const angle = Math.atan2(dy, dx);
    if (laserAttack) {
      line(
        c,
        [
          [e.x, e.y],
          [x, y],
        ],
        color + '45',
        e.linked ? 6 : 3,
      );
      line(
        c,
        [
          [e.x, e.y],
          [x, y],
        ],
        '#f2ffdf',
        1,
      );
    }
    c.translate(x, y);
    c.rotate(angle);
    line(
      c,
      [
        [-16, 0],
        [0, 0],
      ],
      color + '70',
      e.linked ? 7 : 4,
    );
    if (fireAttack) {
      c.rotate(Math.PI / 2);
      flame(c, 0, 0, e.linked ? 1.15 : 0.75, t);
    } else if (cannonAttack) {
      oval(c, 0, 0, e.linked ? 8 : 6, e.linked ? 8 : 6, '#5a6350', color);
      oval(c, -2, -2, 2.5, 2.5, '#e4c683');
      sparks(c, -9, 0, 4, t, '#e1ab5c', 3);
    } else {
      oval(c, 0, 0, laserAttack ? 7 : 5, 3, color);
      oval(c, 1, -1, 2, 1.5, '#fff2c0');
    }
  } else if (e.type === 'hit') {
    c.globalAlpha = left;
    sparks(c, e.x, e.y, 6 + p * 18, p, color, 5);
    if (e.amount || e.text)
      text(c, e.text || `${Math.round(e.amount)}`, e.x, e.y - 20 - p * 24, 12, '#95663b', 800);
  } else if (e.type === 'ultimate') {
    c.globalAlpha = left;
    const x = e.tx ?? e.x,
      y = e.ty ?? e.y;
    glow(c, x, y, 65 + p * 25, color + '55');
    c.lineWidth = 3 * left;
    oval(c, x, y + 20, 12 + p * 74, 6 + p * 25, null, color);
    sparks(c, x, y, 15 + p * 55, p * 2, color, 10);
    if (fireAttack) {
      c.save();
      c.translate(x, y + 18);
      c.scale(1, 0.65);
      for (let i = 0; i < 6; i++) {
        c.save();
        c.rotate((i * TAU) / 6 + p * 0.3);
        path(
          c,
          [
            [0, 0],
            [-13 - p * 8, -22],
            [0, -47 - p * 12],
            [13 + p * 8, -22],
          ],
          '#ed885957',
          '#f0b76e',
        );
        c.restore();
      }
      c.restore();
      flame(c, x, y, 1.4, t);
    } else if (cannonAttack) {
      c.save();
      c.translate(x, y - 10 - (1 - p) * 35);
      c.rotate(-0.2);
      rect(c, -6, -75, 12, 90, 4, '#d2a64488', '#f9d783');
      rect(c, -8, -75, 16, 16, 3, '#ffe1a2');
      rect(c, -8, 0, 16, 15, 3, '#ffe1a2');
      c.restore();
    } else if (laserAttack) {
      path(
        c,
        [
          [x, y - 51],
          [x + 15, y - 33],
          [x, y - 16],
          [x - 15, y - 33],
        ],
        '#b8f2cb55',
        '#f6f4b9',
      );
      oval(c, x, y - 33, 5, 8, '#fff5b3');
      for (const offset of [-14, 0, 14])
        line(
          c,
          [
            [e.x, e.y],
            [x, y + offset],
          ],
          color + 'b0',
          2.5 * left,
        );
    }
    if (Math.abs(x - e.x) > 25) {
      line(
        c,
        [
          [e.x, e.y],
          [x, y],
        ],
        color + '45',
        12 * left,
      );
      line(
        c,
        [
          [e.x, e.y],
          [x, y],
        ],
        '#fff6cd',
        2 * left,
      );
    }
    if (e.text) text(c, e.text, x, y - 65 - p * 15, 13, '#826035', 800);
  } else if (e.type === 'link') {
    c.globalAlpha = left;
    line(
      c,
      [
        [e.x, e.y],
        [e.tx ?? e.x, e.ty ?? e.y],
      ],
      color,
      2,
    );
    sparks(c, e.x, e.y, 24, t, color, 4);
  } else {
    c.globalAlpha = left;
    c.lineWidth = 2;
    oval(c, e.x, e.y, 9 + p * 29, 5 + p * 12, null, color);
    sparks(c, e.x, e.y - 17 - p * 8, 10 + p * 22, p, color, 6);
  }
  c.restore();
}

export function drawPortrait(ctx, item, timeSeconds, { size = 80, selected = false } = {}) {
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  ctx.scale(size / 80, size / 80);
  if (!item) {
    ctx.restore();
    return;
  }
  const color = HEROES[item.key]?.color || WEAPONS[item.key]?.color || '#97b393';
  glow(ctx, 40, 43, 34, color + (selected ? '3a' : '15'));
  ctx.translate(39, item.kind === 'weapon' ? 68 : 65);
  figure(ctx, item, timeSeconds, { scale: item.kind === 'weapon' ? 0.94 : 0.77 });
  ctx.restore();
}

export function drawBattle(ctx, state, timeSeconds, { width = 1000, height = 400 } = {}) {
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.scale(width / 1000, height / 400);
  battlefield(ctx, state, timeSeconds);
  if (state.phase === 'setup' && state.mode === 'defense') {
    const links = getLinks(state);
    const linkedWeapons = new Set(links.map((link) => link.weaponIndex));
    for (const link of links) {
      const x1 = 130 + (link.heroIndex % 4) * 82,
        y1 = 106 + Math.floor(link.heroIndex / 4) * 106;
      const x2 = 130 + (link.weaponIndex % 4) * 82,
        y2 = 106 + Math.floor(link.weaponIndex / 4) * 106;
      ctx.save();
      ctx.setLineDash([3, 5]);
      line(
        ctx,
        [
          [x1, y1],
          [x2, y2],
        ],
        '#bbaa6488',
        2,
      );
      ctx.restore();
      gear(ctx, x2, y2 - 9, 11, timeSeconds * 0.4, '#c1af6d');
    }
    for (let i = 0; i < (state.board?.length || 0); i++) {
      const item = state.board[i];
      if (!item || linkedWeapons.has(i)) continue;
      const link = links.find((candidate) => candidate.heroIndex === i);
      ctx.save();
      ctx.translate(130 + (i % 4) * 82, 102 + Math.floor(i / 4) * 106);
      figure(ctx, link ? { ...item, weapon: link.key } : item, timeSeconds + i * 0.23, {
        scale: 0.9,
      });
      ctx.restore();
    }
  }
  // Stable depth order keeps feet grounded when several units share a lane.
  const units = [...(state.units || [])].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const unit of units) {
    ctx.save();
    ctx.translate(unit.x, unit.y + 15);
    figure(ctx, unit, timeSeconds + (Number(unit.id) || 0) * 0.13, {
      scale: 0.86,
      flip: unit.side === 'enemy',
      bars: true,
    });
    ctx.restore();
  }
  for (const e of state.effects || []) effect(ctx, e, timeSeconds);
  if (state.phase === 'won' || state.phase === 'lost') {
    ctx.fillStyle = '#f5efdb28';
    ctx.fillRect(0, 0, 1000, 400);
  }
  ctx.restore();
}
