/* Procedural counterparts of docs/design/concepts. Rendering only reads combat
 * state. All variation is a pure function of time/ID, never the simulation RNG. */
const TAU = Math.PI * 2;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const hash = (n) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
function shape(c, points, fill, stroke, width = 1.5) {
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
function oval(c, x, y, rx, ry, fill, stroke, width = 1.5) {
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
function shaded(c, x, y, x2, y2, top, bottom) {
  const g = c.createLinearGradient(x, y, x2, y2);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  return g;
}
function petal(c, x, y, length, angle, fill, highlight) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(-length * 0.6, -length * 0.3, -length * 0.28, -length * 0.9, 0, -length);
  c.bezierCurveTo(length * 0.42, -length * 0.66, length * 0.5, -length * 0.18, 0, 0);
  c.fillStyle = shaded(c, -length * 0.3, 0, length * 0.25, -length, fill, highlight);
  c.fill();
  c.strokeStyle = highlight;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(0, -2);
  c.lineTo(0, -length * 0.8);
  c.stroke();
  c.restore();
}
function segment(c, points, color, width = 2) {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.stroke();
}
function bar(c, x, y, w, fraction, color) {
  c.fillStyle = '#172c28';
  c.fillRect(x - w / 2 - 2, y - 2, w + 4, 9);
  c.fillStyle = color;
  c.fillRect(x - w / 2, y, w * clamp(fraction || 0, 0, 1), 5);
  c.fillStyle = 'rgba(255,255,240,.45)';
  c.fillRect(x - w / 2, y, w * clamp(fraction || 0, 0, 1), 1);
}
const ENEMY_STYLE = {
  sprout: { color: '#243834', accent: '#78a54a', eye: '#ffe55e', scale: 1 },
  runner: { color: '#2d6751', accent: '#91dfa6', eye: '#65edff', scale: 0.78 },
  brute: { color: '#544f45', accent: '#a79c7e', eye: '#ffcb56', scale: 1.6 },
  sentinel: { color: '#593365', accent: '#bd76e4', eye: '#e3a0ff', scale: 1.15 },
  charger: { color: '#6e2735', accent: '#ec626f', eye: '#ff5e62', scale: 1.05 },
  brood: { color: '#854321', accent: '#f39942', eye: '#ffb232', scale: 1.35 },
  minion: { color: '#654524', accent: '#c8b961', eye: '#ffcd56', scale: 0.53 },
  shield: { color: '#235457', accent: '#68cce1', eye: '#5bebff', scale: 1.15 },
  burrower: { color: '#654b32', accent: '#b89961', eye: '#ffcc71', scale: 1.2 },
  glider: { color: '#294a47', accent: '#77e0da', eye: '#7eeeff', scale: 0.95 },
  spitter: { color: '#542e66', accent: '#b063d1', eye: '#f792ff', scale: 1 },
  warden: { color: '#5a5646', accent: '#dab55b', eye: '#ffd75e', scale: 2.05 },
  bastionlord: { color: '#284e57', accent: '#d9b565', eye: '#6aefff', scale: 2.15 },
  overgrowth: { color: '#49213b', accent: '#d43d62', eye: '#ff567f', scale: 2.6 },
};
function eyes(c, color, one = false) {
  c.shadowColor = color;
  c.shadowBlur = 9;
  if (one) oval(c, 0, -25, 6, 9, color);
  else {
    oval(c, -10, -25, 4, 7, color);
    oval(c, 10, -25, 4, 7, color);
  }
  c.shadowBlur = 0;
  oval(c, one ? -1 : -11, -27, 1.5, 2, '#fff8ce');
}
function rockArmor(c, s, crowned = false) {
  for (const [x, y, size] of [
    [-23, -14, 19],
    [23, -14, 19],
    [-17, -39, 17],
    [16, -43, 19],
    [0, -51, 16],
  ]) {
    shape(
      c,
      [
        [x - size * 0.7, y + size * 0.55],
        [x - size, y - size * 0.4],
        [x - size * 0.15, y - size],
        [x + size * 0.7, y - size * 0.65],
        [x + size, y + size * 0.2],
        [x, y + size * 0.65],
      ],
      shaded(c, x - size, y - size, x + size, y + size, s.accent, s.color),
      '#262f2a',
    );
    segment(
      c,
      [
        [x - size * 0.7, y - size * 0.3],
        [x - size * 0.1, y],
        [x + size * 0.65, y - size * 0.55],
      ],
      'rgba(220,211,164,.5)',
      1,
    );
  }
  if (crowned) {
    shape(
      c,
      [
        [-20, -48],
        [-24, -72],
        [-7, -60],
        [0, -82],
        [8, -60],
        [26, -74],
        [21, -48],
        [0, -41],
      ],
      shaded(c, 0, -81, 0, -44, '#ffe5a0', '#a27831'),
      '#654e2e',
    );
    for (let i = 0; i < 3; i++)
      petal(c, (i - 1) * 16, -55, 20, (i - 1) * 0.7, '#ba9a43', '#ffdc77');
  }
}
function shieldLeaf(c, x, y, s, size = 1) {
  c.save();
  c.translate(x, y);
  c.scale(size, size);
  shape(
    c,
    [
      [0, -43],
      [-21, -30],
      [-19, -8],
      [0, 12],
      [19, -8],
      [21, -30],
    ],
    shaded(c, -18, -38, 18, 9, '#91dffe', '#206797'),
    s.accent,
    2.5,
  );
  segment(
    c,
    [
      [0, -37],
      [0, 4],
    ],
    '#d8f7ff',
    1.5,
  );
  segment(
    c,
    [
      [-14, -25],
      [0, -14],
      [14, -26],
    ],
    'rgba(205,246,255,.7)',
    1.4,
  );
  c.restore();
}
const ENEMY_DETAILS = {
  sprout(c, s) {
    petal(c, 0, -49, 21, -0.75, s.color, s.accent);
    petal(c, 0, -49, 23, 0.65, s.color, s.accent);
  },
  runner(c, s, t) {
    for (let i = 0; i < 3; i++) {
      petal(c, -8 - i * 6, -42 + i * 5, 32 - i * 4, -1.25, s.color, s.accent);
      segment(
        c,
        [
          [-27 - i * 5, -14 - i * 10],
          [-45 - i * 6, -10 - i * 10],
        ],
        'rgba(93,229,220,.65)',
        2,
      );
    }
  },
  brute(c, s) {
    rockArmor(c, s);
  },
  sentinel(c, s, t) {
    for (let i = 0; i < 5; i++)
      petal(c, 0, -39, 30 + (i % 2) * 4, (i - 2) * 0.7, s.color, s.accent);
    shape(
      c,
      [
        [0, -39],
        [-8, -27],
        [0, -15],
        [8, -27],
      ],
      '#bd76e4',
      '#edd0ff',
    );
    oval(c, 0, -27, 37, 10, null, `rgba(192,112,247,${0.6 + Math.sin(t * 3) * 0.15})`, 2);
  },
  charger(c, s, t, e) {
    for (let i = 0; i < 4; i++) petal(c, -5 + i * 5, -42, 39, -1.05 + i * 0.6, s.color, s.accent);
    shape(
      c,
      [
        [-7, -37],
        [0, -62],
        [9, -36],
      ],
      '#c54551',
      '#f77c76',
    );
    if (e.abilityState?.charge?.phase === 'windup' || e.abilityState?.charger?.phase === 'windup')
      oval(c, 0, -26, 29, 30, null, '#ffa14d', 3);
  },
  brood(c, s, t, e) {
    for (let i = 0; i < 5; i++)
      segment(
        c,
        [
          [0, -53],
          [(i - 2) * 9, -38],
          [(i - 2) * 12, -10],
        ],
        '#b46524',
        2,
      );
    petal(c, 0, -52, 22, 0.3, s.color, '#d89853');
    oval(c, -25, -12, 12, 16, shaded(c, -28, -25, -18, 4, '#d88833', '#633520'), '#de9f46');
    oval(c, 25, -12, 12, 16, shaded(c, 20, -25, 32, 4, '#d88833', '#633520'), '#de9f46');
    if (e.hp / e.maxHp < 0.7)
      segment(
        c,
        [
          [-16, -36],
          [-4, -25],
          [-11, -11],
        ],
        '#ffca67',
        2.5,
      );
  },
  minion(c, s) {
    petal(c, 0, -49, 21, 0.3, s.color, s.accent);
  },
  shield(c, s) {
    petal(c, 0, -49, 22, -0.7, s.color, s.accent);
    shieldLeaf(c, 23, -9, s);
  },
  burrower(c, s) {
    for (const dir of [-1, 1])
      shape(
        c,
        [
          [dir * 16, -18],
          [dir * 37, -6],
          [dir * 34, 6],
          [dir * 25, -3],
        ],
        '#a88e62',
        '#483b2c',
      );
    shape(
      c,
      [
        [-18, -34],
        [0, -67],
        [18, -34],
        [0, -9],
      ],
      shaded(c, -16, -56, 18, -16, s.accent, s.color),
      '#4b382a',
    );
    segment(
      c,
      [
        [0, -61],
        [0, -16],
      ],
      '#dcc290',
      1.5,
    );
  },
  glider(c, s, t) {
    for (const dir of [-1, 1]) {
      c.save();
      c.scale(dir, 1);
      c.rotate(Math.sin(t * 9) * 0.06);
      shape(
        c,
        [
          [13, -35],
          [28, -57],
          [64, -55],
          [51, -42],
          [55, -23],
          [32, -31],
          [18, -18],
        ],
        shaded(c, 16, -54, 55, -21, '#9cece0', '#2f9396'),
        '#86e7df',
      );
      segment(
        c,
        [
          [17, -32],
          [46, -42],
          [57, -52],
        ],
        'rgba(204,255,235,.7)',
        1,
      );
      c.restore();
    }
    petal(c, 0, -49, 17, 0.4, s.color, '#8aba6f');
  },
  spitter(c, s, t, e) {
    for (let i = 0; i < 3; i++) petal(c, -8, -40, 31, -0.8 - i * 0.45, s.color, s.accent);
    const dir = Math.cos(e.angle || 0) < 0 ? -1 : 1;
    shape(
      c,
      [
        [dir * 10, -37],
        [dir * 45, -27],
        [dir * 16, -18],
      ],
      shaded(c, 0, -34, dir * 45, -22, s.accent, s.color),
      '#35223d',
    );
    oval(c, dir * 37, -27, 6, 4, '#dd7ff2', '#efb3ff');
  },
  warden(c, s) {
    rockArmor(c, s, true);
  },
  bastionlord(c, s) {
    shieldLeaf(c, -25, -3, s, 1.2);
    shieldLeaf(c, 27, -3, s, 1.2);
    shape(
      c,
      [
        [-19, -38],
        [-23, -62],
        [-6, -52],
        [0, -73],
        [8, -52],
        [24, -63],
        [20, -39],
        [0, -31],
      ],
      shaded(c, 0, -71, 0, -33, '#ffe3a2', '#97703b'),
      '#604d35',
    );
    shape(
      c,
      [
        [-10, -27],
        [0, -44],
        [10, -27],
        [0, -11],
      ],
      '#59d5f1',
      '#d3f7ff',
    );
  },
  overgrowth(c, s, t, e) {
    for (let i = 0; i < 6; i++) {
      const dir = i < 3 ? -1 : 1,
        n = i % 3;
      c.beginPath();
      c.moveTo(dir * 12, -8);
      c.bezierCurveTo(
        dir * (34 + n * 4),
        -7 - n * 8,
        dir * (48 + n * 4),
        -43 + n * 5,
        dir * (60 + n * 3),
        -20 + n * 10,
      );
      c.strokeStyle = '#4b213d';
      c.lineWidth = 7;
      c.stroke();
      c.strokeStyle = '#9b3757';
      c.lineWidth = 1.4;
      c.stroke();
    }
    for (let i = 0; i < 7; i++)
      petal(c, 0, -35, 46 + (i % 2) * 9, (i - 3) * 0.45, s.color, s.accent);
    shape(
      c,
      [
        [0, -69],
        [-10, -51],
        [0, -33],
        [10, -51],
      ],
      '#9d163e',
      '#ff7798',
      2,
    );
    oval(c, 0, -51, 3, 10, '#ffbfd1');
    if (e.bossPhase > 1)
      oval(c, 0, -23, 36, 38, null, e.bossPhase === 3 ? '#ff658b' : '#d39aeb', 1.6);
  },
};

export function drawEnemy(c, e, t, definition = {}, sprite = false, healthbarBounds = null) {
  const known = ENEMY_STYLE[e.kind] || ENEMY_STYLE.sprout;
  const visual = e.visual || definition.visual || {};
  const s = {
    ...known,
    color: visual.color || known.color,
    accent: visual.accent || known.accent,
    eye: visual.eye || known.eye,
  };
  const size = sprite ? 1 : s.scale,
    phase = Number(e.id) || e.x * 0.1;
  const underground = e.layer === 'underground';
  const height = Math.max(0, e.height || (e.layer === 'air' ? 32 : 0));
  c.save();
  c.translate(e.x, e.y);
  oval(c, 3, 5, 25 * size, 10 * size, 'rgba(14,29,24,.4)');
  if (e.rank === 'leader' || e.rank === 'boss') {
    const color = e.rank === 'boss' ? '#fd6385' : '#f4cf74';
    oval(c, 0, 1, (e.radius || 30) + 12, (e.radius || 30) + 12, null, color, 2.3);
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8 + t * 0.12,
        r = (e.radius || 30) + 12;
      petal(c, Math.cos(a) * r, Math.sin(a) * r, 8, a + Math.PI / 2, color, color);
    }
  }
  if (underground) {
    oval(c, 0, 0, (e.radius || 25) + 7, (e.radius || 25) * 0.55, '#614b34', '#b49259', 2);
    for (let i = 0; i < 7; i++) {
      const a = (i * TAU) / 7 + t * 0.6;
      oval(c, Math.cos(a) * 23 * size, Math.sin(a) * 9 * size, 4 + (i % 3), 2.5, '#9e7950');
    }
    shape(
      c,
      [
        [-12, 1],
        [0, -15],
        [13, 1],
      ],
      '#83653d',
      '#b18d54',
    );
    c.restore();
    return;
  }
  if (e.controlResistance > 0)
    oval(c, 0, 0, (e.radius || 24) + 5, (e.radius || 24) * 0.6, null, 'rgba(191,117,234,.45)', 1.5);
  c.translate(0, -height + Math.sin(t * (e.kind === 'runner' ? 13 : 6) + phase * 1.8) * 2);
  c.scale(size, size);
  if (height)
    segment(
      c,
      [
        [0, 4],
        [0, height / size],
      ],
      'rgba(135,238,228,.3)',
      1.5,
    );
  for (const dir of [-1, 1]) {
    segment(
      c,
      [
        [dir * 11, -11],
        [dir * 17, 0],
        [dir * 22, 1],
      ],
      '#20312b',
      5,
    );
    oval(c, dir * 21, -21, 7, 10, s.color);
  }
  const flash = e.hit > 0;
  oval(
    c,
    0,
    -27,
    25,
    27,
    shaded(c, -14, -52, 17, 0, flash ? '#d8ceaa' : s.color, flash ? '#a6a88c' : '#17292a'),
    '#142c26',
    1.5,
  );
  (ENEMY_DETAILS[e.kind] || ENEMY_DETAILS[visual.silhouette] || ENEMY_DETAILS.sprout)(c, s, t, e);
  eyes(c, s.eye, e.kind === 'minion');
  if (e.shield > 0) {
    c.globalAlpha = 0.35 + 0.16 * clamp(e.shield / (e.maxShield || e.shield), 0, 1);
    oval(c, 0, -23, 34, 38, 'rgba(65,171,224,.16)', '#8de3ff', 2);
    if (e.shield / (e.maxShield || e.shield) < 0.4)
      segment(
        c,
        [
          [16, -51],
          [4, -39],
          [13, -30],
          [4, -17],
        ],
        '#d5f9ff',
        2,
      );
    c.globalAlpha = 1;
  }
  c.restore();
  if (sprite) return;
  const naturalTop = e.y - height - 77 * size;
  const top = healthbarBounds
    ? clamp(naturalTop, healthbarBounds.top, healthbarBounds.bottom)
    : naturalTop;
  if (e.hp < e.maxHp || e.rank === 'leader' || e.rank === 'boss')
    bar(
      c,
      e.x,
      top,
      Math.max(40, 44 * size),
      e.hp / e.maxHp,
      e.rank === 'boss' ? '#ff648b' : '#ed9871',
    );
  if (e.shield > 0)
    bar(c, e.x, top - 11, Math.max(40, 44 * size), e.shield / (e.maxShield || e.shield), '#77d8ff');
  if (e.rank === 'leader' || e.rank === 'boss') {
    c.save();
    c.font = '700 14px Arial,sans-serif';
    c.textAlign = 'center';
    c.lineWidth = 3;
    c.strokeStyle = '#172a27';
    const label =
      (definition.name || e.kind) +
      (e.rank === 'boss' && e.bossPhase ? ` · ${e.bossPhase} 阶段` : '');
    c.strokeText(label, e.x, top - 17 - (e.shield > 0 ? 10 : 0));
    c.fillStyle = e.rank === 'boss' ? '#ffbdcc' : '#ffe4a0';
    c.fillText(label, e.x, top - 17 - (e.shield > 0 ? 10 : 0));
    c.restore();
  }
}

export function drawAdditionalPlant(c, p, t, icon = false, definition = {}) {
  const grow = clamp((p.age ?? 5) / 0.65, 0.05, 1),
    kind = p.kind;
  c.save();
  c.translate(p.x || 0, p.y || 0);
  c.scale(grow, grow);
  oval(c, 3, 3, 28, 11, 'rgba(23,46,29,.32)');
  const color =
    definition.color ||
    (kind === 'sunflower' ? '#ffe190' : kind === 'stormreed' ? '#9aceff' : '#ff99dd');
  if (!icon) {
    const radius =
      kind === 'sunflower'
        ? p.effectRadius ||
          definition.effects?.find((effect) => effect.type === 'healAura')?.range ||
          85
        : 31;
    oval(
      c,
      0,
      0,
      radius,
      radius,
      kind === 'sunflower' ? 'rgba(241,218,105,.045)' : null,
      kind === 'sunflower' ? 'rgba(244,220,119,.34)' : 'rgba(134,186,130,.15)',
      1.2,
    );
  }
  segment(
    c,
    [
      [0, 0],
      [2, -25],
      [0, -46],
    ],
    '#3d7650',
    6,
  );
  petal(c, 0, -8, 26, -1.1, '#356847', '#9bbd61');
  petal(c, 0, -17, 24, 1.1, '#336b4c', '#9ebf6b');
  if (kind === 'sunflower') {
    c.save();
    c.translate(0, -48);
    for (let i = 0; i < 10; i++) {
      c.save();
      c.rotate((i * TAU) / 10);
      petal(c, 0, 0, 25, 0, '#de9c33', '#fff19b');
      c.restore();
    }
    oval(c, 0, 0, 13, 12, shaded(c, -8, -10, 10, 12, '#9a642c', '#533e25'), '#ffc95d');
    for (let i = 0; i < 9; i++)
      oval(
        c,
        Math.cos(i * 2.4) * Math.sqrt(i) * 3,
        Math.sin(i * 2.4) * Math.sqrt(i) * 3,
        1.2,
        1.2,
        '#efbd63',
      );
    c.restore();
    if (!icon) {
      const a = t * 1.2 + (p.id || 0);
      c.globalAlpha = 0.7;
      const x = Math.cos(a) * 40,
        y = Math.sin(a) * 25;
      segment(
        c,
        [
          [x - 4, y],
          [x + 4, y],
        ],
        '#f7e296',
        2,
      );
      segment(
        c,
        [
          [x, y - 4],
          [x, y + 4],
        ],
        '#f7e296',
        2,
      );
    }
  } else if (kind === 'stormreed') {
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 10,
        y = i % 2 ? -5 : 0;
      segment(
        c,
        [
          [x, y],
          [x + (i - 2) * 2, -31],
          [x + (i - 2) * 4, -64 + (i % 3) * 8],
        ],
        '#3e7b75',
        3,
      );
      petal(c, x + (i - 2) * 4, -40 + (i % 3) * 5, 25, (i - 2) * 0.12, '#446ac0', '#c7e8ff');
    }
    c.shadowColor = '#87c6ff';
    c.shadowBlur = 9;
    segment(
      c,
      [
        [-10, -54],
        [-4, -44],
        [-13, -39],
        [-5, -30],
      ],
      color,
      1.7,
    );
    c.shadowBlur = 0;
  } else {
    const angle = p.angle || 0,
      dir = Math.cos(angle) < 0 ? -1 : 1;
    oval(c, 0, 0, 22, 9, '#655943', '#bd9558', 2);
    shape(
      c,
      [
        [-8, -5],
        [-8, -29],
        [8, -29],
        [10, -5],
      ],
      '#786847',
      '#cca769',
    );
    c.save();
    c.translate(0, -39);
    for (let i = 0; i < 5; i++) {
      c.save();
      c.rotate((i * TAU) / 5 + angle * 0.2);
      petal(c, 0, 0, 27, 0, '#a54179', '#ffc3ec');
      c.restore();
    }
    oval(c, 0, 0, 12, 11, '#976c49', '#dfb874', 2);
    shape(
      c,
      [
        [dir * 4, -7],
        [dir * 28, -9],
        [dir * 31, 4],
        [dir * 6, 6],
      ],
      shaded(c, 0, -7, 0, 6, '#d2ac63', '#4b493e'),
      '#354438',
    );
    oval(c, dir * 29, -2, 5, 7, '#e958b9', '#ffbae8');
    c.restore();
  }
  if (p.flash > 0) {
    c.shadowColor = color;
    c.shadowBlur = 20;
    oval(c, 0, -48, 13, 13, 'rgba(235,247,255,.65)');
  }
  c.restore();
}

export function drawPet(c, p, t, icon = false) {
  if (!p) return;
  c.save();
  c.translate(p.x || 0, (p.y || 0) - (icon ? 0 : 24));
  const size = icon ? 1.6 : 0.75;
  c.scale(size, size);
  if (!icon) oval(c, 3, 28, 20, 7, 'rgba(24,49,31,.2)');
  c.shadowColor = '#ffcb68';
  c.shadowBlur = icon ? 9 : 14;
  for (const dir of [-1, 1]) {
    c.save();
    c.rotate(dir * (0.4 + Math.sin(t * 35) * 0.1));
    petal(c, dir * 5, -8, 28, dir * 0.65, '#d6a354', '#ffefa6');
    c.restore();
  }
  oval(c, 0, 0, 22, 15, shaded(c, -15, -13, 20, 14, '#ffe9a1', '#b97b2d'), '#5b4427', 2);
  c.shadowBlur = 0;
  segment(
    c,
    [
      [-7, -12],
      [-7, 12],
    ],
    '#755128',
    5,
  );
  segment(
    c,
    [
      [-16, -8],
      [-16, 8],
    ],
    '#755128',
    4,
  );
  oval(c, 15, -1, 12, 13, '#333c36', '#ffe3a0', 2);
  oval(c, 19, -4, 3, 5, '#ffda78');
  segment(
    c,
    [
      [9, -13],
      [9, -19],
      [4, -23],
    ],
    '#baa466',
    2,
  );
  if (!icon) {
    c.globalAlpha = 0.45;
    segment(
      c,
      [
        [-26, 4],
        [-39, 9],
        [-48, 6],
      ],
      '#ffdb89',
      2,
    );
  }
  c.restore();
}

export function drawHeartIcon(c) {
  c.save();
  c.translate(0, -28);
  c.beginPath();
  c.moveTo(0, 24);
  c.bezierCurveTo(-53, -11, -24, -44, 0, -20);
  c.bezierCurveTo(24, -44, 53, -11, 0, 24);
  c.fillStyle = shaded(c, -22, -28, 22, 24, '#ffb091', '#c93958');
  c.fill();
  c.strokeStyle = '#ffdb9a';
  c.lineWidth = 2;
  c.stroke();
  petal(c, 0, -19, 23, 0.65, '#527341', '#c6e179');
  petal(c, 0, -19, 20, -0.65, '#527341', '#c6e179');
  c.restore();
}

export function drawShieldIcon(c) {
  c.save();
  c.translate(0, -24);
  shape(
    c,
    [
      [0, -47],
      [-31, -29],
      [-27, 11],
      [0, 32],
      [27, 11],
      [31, -29],
    ],
    shaded(c, -25, -42, 25, 27, '#efcd78', '#8b693e'),
    '#ffe5ac',
    2.5,
  );
  petal(c, 0, 13, 46, 0, '#477438', '#b5d378');
  segment(
    c,
    [
      [0, -28],
      [0, 12],
    ],
    '#e9dc90',
    1.8,
  );
  c.restore();
}

export function drawCombatTelegraph(c, p, t) {
  if (p.kind === 'explosion') return;
  c.save();
  if (
    p.kind === 'lightning' &&
    !p.dangerous &&
    Number.isFinite(p.targetX) &&
    Number.isFinite(p.targetY)
  ) {
    const x = p.targetX ?? p.x,
      y = p.targetY ?? p.y,
      dx = x - p.x,
      dy = y - p.y;
    const normal = Math.hypot(dx, dy) || 1,
      nx = -dy / normal,
      ny = dx / normal;
    const points = Array.from({ length: 7 }, (_, i) => {
      const u = i / 6,
        offset = i === 0 || i === 6 ? 0 : Math.sin(i * 8.4 + t * 23) * 8;
      return [p.x + dx * u + nx * offset, p.y - 24 + dy * u + ny * offset];
    });
    c.globalAlpha = clamp(p.life / (p.maxLife || 0.16), 0, 1);
    c.shadowColor = '#92ceff';
    c.shadowBlur = 12;
    segment(c, points, '#66aafa', 5);
    segment(c, points, '#edfbff', 2);
    c.restore();
    return;
  }
  const ratio = clamp(p.life / (p.maxLife || p.life || 1), 0, 1);
  const cold = p.kind === 'hail' || p.kind === 'ice',
    electric = p.kind === 'thunder' || p.kind === 'lightning',
    boss = p.kind === 'boss-phase';
  const color = cold ? '#bbecff' : electric ? '#8cccff' : boss ? '#ff6d98' : '#ffb16d';
  const radius = p.radius || 24;
  c.globalAlpha = 0.75;
  oval(
    c,
    p.x,
    p.y,
    radius,
    radius,
    cold ? 'rgba(123,214,255,.1)' : boss ? 'rgba(240,58,105,.13)' : 'rgba(255,161,82,.09)',
    color,
    2.5,
  );
  c.setLineDash([5, 6]);
  oval(c, p.x, p.y, radius * ratio, radius * ratio, null, color, 1.5);
  c.setLineDash([]);
  if (p.kind === 'charge') {
    c.translate(p.x, p.y);
    c.rotate(p.angle || 0);
    const length = Math.max(64, p.length || radius * 2);
    const half = Math.max(10, radius * 0.7);
    shape(
      c,
      [
        [14, -half],
        [length - 20, -half],
        [length - 20, -half * 1.6],
        [length, 0],
        [length - 20, half * 1.6],
        [length - 20, half],
        [14, half],
      ],
      'rgba(255,119,76,.16)',
      color,
      2,
    );
  } else if (p.kind === 'ranged') {
    c.translate(p.x, p.y);
    c.rotate(p.angle || 0);
    segment(
      c,
      [
        [radius, 0],
        [radius + 26, 0],
      ],
      color,
      2,
    );
    shape(
      c,
      [
        [radius + 19, -7],
        [radius + 30, 0],
        [radius + 19, 7],
      ],
      color,
    );
  } else if (p.kind === 'emerge' || p.kind === 'burrow') {
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6;
      segment(
        c,
        [
          [p.x + Math.cos(a) * radius * 0.7, p.y + Math.sin(a) * radius * 0.7],
          [p.x + Math.cos(a) * radius * 0.95, p.y + Math.sin(a) * radius * 0.95],
        ],
        color,
        2,
      );
    }
  } else if (cold) {
    segment(
      c,
      [
        [p.x - 8, p.y],
        [p.x + 8, p.y],
      ],
      color,
      2,
    );
    segment(
      c,
      [
        [p.x, p.y - 8],
        [p.x, p.y + 8],
      ],
      color,
      2,
    );
  } else if (electric)
    segment(
      c,
      [
        [p.x + 2, p.y - 13],
        [p.x - 7, p.y + 1],
        [p.x + 3, p.y - 1],
        [p.x - 3, p.y + 13],
      ],
      color,
      3,
    );
  c.restore();
}
