import { arenaRadius, nextArenaRadius, previewAim, outsideArena, physics } from './core.mjs';
import { levels, chapters } from './levels.mjs';
import { isLevelUnlocked, nextLevel, totalStars } from './progress.mjs';

export const W = 390,
  H = 780,
  arena = { x: 195, y: 382, scale: 1.04 };
export const colors = ['#348fe2', '#e65d48', '#eba632', '#aa7edc'];
export const names = ['蓝小侠', '赤小虎', '橙师兄', '紫飞燕'];
const cream = '#fce9bc';
function circle(c, x, y, r, fill, stroke, line = 1) {
  if (r <= 0) return;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = line;
    c.stroke();
  }
}
function text(c, str, x, y, size = 16, color = cream, font = 'sans-serif') {
  c.fillStyle = color;
  c.font = `bold ${size}px ${font}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(str, x, y);
}
function rect(c, x, y, w, h, r, fill, stroke) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 1.5;
    c.stroke();
  }
}
function line(c, points, color, width = 2) {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = 'round';
  c.stroke();
}
function cloud(c, x, y, s) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  line(
    c,
    [
      [0, 0],
      [15, 0],
      [15, -8],
      [22, -14],
      [32, -14],
      [39, -8],
      [39, 0],
      [58, 0],
    ],
    '#9bb7a324',
    3,
  );
  c.restore();
}
function background(c, t) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#102b32');
  g.addColorStop(0.55, '#203738');
  g.addColorStop(1, '#0e2227');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 12; i++) {
    line(
      c,
      [
        [0, 530 + i * 27],
        [W, 530 + i * 27],
      ],
      '#b67a4120',
      1,
    );
    line(
      c,
      [
        [195 + (i - 6) * 26, 510],
        [195 + (i - 6) * 85, H],
      ],
      '#b67a4115',
      1,
    );
  }
  c.fillStyle = '#492c20';
  c.fillRect(0, 0, 13, H);
  c.fillRect(377, 0, 13, H);
  c.fillRect(0, 22, W, 12);
  c.fillStyle = '#976443';
  c.fillRect(10, 0, 3, H);
  c.fillRect(377, 0, 3, H);
  for (const x of [40, 350]) {
    line(
      c,
      [
        [x, 0],
        [x, 58],
      ],
      '#92643d',
      2,
    );
    const glow = c.createRadialGradient(x, 83, 3, x, 83, 75);
    glow.addColorStop(0, '#ffb54835');
    glow.addColorStop(1, '#ffb54800');
    circle(c, x, 83, 75, glow);
    rect(c, x - 15, 58, 30, 43, 12, '#df973e', '#ffce7b');
    for (const off of [-7, 0, 7])
      line(
        c,
        [
          [x + off, 60],
          [x + off, 99],
        ],
        '#ac592b',
        1,
      );
    rect(c, x - 10, 54, 20, 5, 2, '#573c2e');
    rect(c, x - 10, 100, 20, 5, 2, '#573c2e');
    line(
      c,
      [
        [x, 105],
        [x, 120],
      ],
      '#df983f',
      3,
    );
  }
  cloud(c, 15, 177, 1.5);
  cloud(c, 278, 246, 1.5);
  cloud(c, 22, 605, 1);
  cloud(c, 289, 680, 1.1);
  for (let i = 0; i < 8; i++) {
    c.globalAlpha = 0.15 + Math.sin(t * 0.5 + i) * 0.12;
    circle(c, 40 + ((i * 47) % 320), 150 + ((i * 91) % 550), 1.2, '#ffda8e');
  }
  c.globalAlpha = 1;
}
export function table(c, x, y, r) {
  c.save();
  c.shadowColor = '#0009';
  c.shadowBlur = 22;
  c.shadowOffsetY = 17;
  circle(c, x, y + 10, r + 5, '#51331f');
  c.shadowBlur = 0;
  c.shadowOffsetY = 0;
  circle(c, x, y + 7, r + 3, '#82502d', '#c28a4d', 2);
  const wood = c.createLinearGradient(x - r, y - r, x + r, y + r);
  wood.addColorStop(0, '#e5b46c');
  wood.addColorStop(0.5, '#ca8d48');
  wood.addColorStop(1, '#ac6737');
  circle(c, x, y, r, wood, '#f1c584', 3);
  c.save();
  c.beginPath();
  c.arc(x, y, Math.max(0, r - 3), 0, Math.PI * 2);
  c.clip();
  for (let i = -8; i < 9; i++) {
    const yy = y + (i * r) / 7;
    line(
      c,
      [
        [x - r, yy],
        [x + r, yy + 8],
      ],
      '#6538144a',
      1.4,
    );
    line(
      c,
      [
        [x - r, yy + 2],
        [x + r, yy + 10],
      ],
      '#ffe2a936',
      1,
    );
    for (let j = 0; j < 5; j++) {
      c.beginPath();
      c.moveTo(x - r, yy + j * 4 + 5);
      c.bezierCurveTo(x - r / 3, yy + j * 4 - 4, x + r / 3, yy + j * 4 + 14, x + r, yy + j * 4 + 7);
      c.strokeStyle = '#7a432316';
      c.lineWidth = 0.8;
      c.stroke();
    }
  }
  for (let i = 0; i < 40; i++) {
    const a = i * 2.4,
      rr = (i * 39) % r;
    line(
      c,
      [
        [x + Math.cos(a) * rr, y + Math.sin(a) * rr],
        [x + Math.cos(a) * rr + 8, y + Math.sin(a) * rr + 1],
      ],
      '#ffdc9d26',
      1,
    );
  }
  c.restore();
  circle(c, x, y, r - 9, null, '#70431e7a', 1);
  circle(c, x, y, r - 12, null, '#fbd39980', 1);
  for (let i = 0; i < 20; i++) {
    const a = (i * Math.PI) / 10;
    line(
      c,
      [
        [x + Math.cos(a) * (r - 9), y + Math.sin(a) * (r - 9)],
        [x + Math.cos(a) * (r - 1), y + Math.sin(a) * (r - 1)],
      ],
      '#855428',
      1,
    );
  }
  circle(c, x, y, r * 0.51, null, '#f9db9b55', 3);
  c.save();
  c.globalAlpha = 0.2;
  text(c, '武', x, y + 1, r * 0.43, '#5c371e', 'serif');
  c.restore();
  c.restore();
}
export function fighter(c, x, y, r, id, active = false, t = 0) {
  const color = colors[id];
  c.save();
  c.translate(x, y);
  if (active) {
    circle(c, 0, 2, r + 7 + Math.sin(t * 4) * 1.3, null, '#fff1b6', 2);
  }
  c.shadowColor = '#23170899';
  c.shadowBlur = 7;
  c.shadowOffsetY = 7;
  circle(c, 0, 5, r, '#24333b');
  c.shadowBlur = 0;
  c.shadowOffsetY = 0;
  circle(c, 0, 3, r, color, '#16252b', 2);
  circle(c, 0, 0, r, color, '#ffd994', 1.5);
  circle(c, 0, -1, r - 4, null, '#ffffff65', 1.5);
  c.scale(r / 24, r / 24);
  // Original vector martial artist: robe, bun, face, headband, eyebrows and fists.
  c.fillStyle = '#f9e3b9';
  c.beginPath();
  c.ellipse(0, 11, 15, 10, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(-13, 8);
  c.lineTo(1, 17);
  c.lineTo(12, 8);
  c.lineTo(14, 20);
  c.lineTo(-14, 20);
  c.fill();
  line(
    c,
    [
      [-10, 8],
      [2, 18],
      [11, 9],
    ],
    '#333738',
    2,
  );
  circle(c, -6, -18, 7, '#302725', '#111e25', 1);
  circle(c, -7, -21, 3, '#665044');
  circle(c, 0, -3, 16, '#2e2928', '#152227', 1.2);
  c.fillStyle = '#f5c48b';
  c.beginPath();
  c.ellipse(0, 1, 12.8, 13, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#302725';
  c.beginPath();
  c.moveTo(-14, -7);
  c.quadraticCurveTo(-5, -23, 13, -10);
  c.lineTo(9, -1);
  c.lineTo(5, -8);
  c.lineTo(-3, -2);
  c.lineTo(-1, -10);
  c.lineTo(-12, -1);
  c.fill();
  line(
    c,
    [
      [-14, -9],
      [-1, -12],
      [13, -9],
    ],
    color,
    5,
  );
  line(
    c,
    [
      [-13, -10],
      [-23, -4],
      [-18, 3],
    ],
    color,
    4,
  );
  line(
    c,
    [
      [-9, -1],
      [-4, 0],
    ],
    '#302724',
    1.8,
  );
  line(
    c,
    [
      [4, 0],
      [9, -2],
    ],
    '#302724',
    1.8,
  );
  circle(c, -6, 3, 1.8, '#2a2521');
  circle(c, 6, 3, 1.8, '#2a2521');
  line(
    c,
    [
      [-3, 8],
      [0, 10],
      [4, 8],
    ],
    '#925036',
    1.3,
  );
  circle(c, -10, 6, 2, '#e7956c88');
  circle(c, 10, 6, 2, '#e7956c88');
  circle(c, -14, 13, 4, '#f5c48b', '#493224', 1);
  circle(c, 14, 12, 4, '#f5c48b', '#493224', 1);
  c.restore();
}
// Stars and locks are vector shapes so native Canvas never relies on an emoji font.
function star(c, x, y, radius, earned) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? radius * 0.46 : radius;
    const xx = x + Math.cos(a) * r,
      yy = y + Math.sin(a) * r;
    if (i) c.lineTo(xx, yy);
    else c.moveTo(xx, yy);
  }
  c.closePath();
  c.fillStyle = earned ? '#ffd579' : '#253d3c';
  c.fill();
  c.strokeStyle = earned ? '#a86b28' : '#70877a';
  c.lineWidth = 1.5;
  c.stroke();
}
function stars(c, x, y, count, radius = 11, spacing = 29) {
  for (let i = 0; i < 3; i++) star(c, x + (i - 1) * spacing, y, radius, i < count);
}
function lock(c, x, y) {
  c.beginPath();
  c.arc(x, y - 5, 6, Math.PI, 0);
  c.strokeStyle = '#a1aaa1';
  c.lineWidth = 3;
  c.stroke();
  rect(c, x - 9, y - 5, 18, 16, 3, '#a1aaa1');
  circle(c, x, y + 1, 2, '#263a38');
  line(
    c,
    [
      [x, y + 2],
      [x, y + 6],
    ],
    '#263a38',
    2,
  );
}
function trim(value, max = 12) {
  const chars = Array.from(String(value ?? ''));
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : chars.join('');
}
function clipGaps(c, state, x, y, scale, radius) {
  for (const gap of state.gaps ?? []) {
    const nx = Math.cos(gap.angle),
      ny = Math.sin(gap.angle),
      reach = 1000;
    const edge = Math.max(0, radius - gap.depth) * scale;
    const a = [x + nx * edge - ny * reach, y + ny * edge + nx * reach];
    const b = [x + nx * edge + ny * reach, y + ny * edge - nx * reach];
    c.beginPath();
    c.moveTo(...a);
    c.lineTo(...b);
    c.lineTo(b[0] - nx * reach * 2, b[1] - ny * reach * 2);
    c.lineTo(a[0] - nx * reach * 2, a[1] - ny * reach * 2);
    c.closePath();
    c.clip();
  }
}
function terrainTable(c, state, x, y, scale) {
  const radius = arenaRadius(state),
    r = radius * scale;
  c.save();
  clipGaps(c, state, x, y, scale, radius);
  table(c, x, y, r);
  c.save();
  c.beginPath();
  c.arc(x, y, Math.max(0, r - 2), 0, Math.PI * 2);
  c.clip();
  for (const ice of state.ice ?? []) {
    const xx = x + ice.x * scale,
      yy = y + ice.y * scale,
      rr = ice.radius * scale;
    const sheen = c.createRadialGradient(xx - rr * 0.3, yy - rr * 0.4, 0, xx, yy, rr);
    sheen.addColorStop(0, '#dff9ffc9');
    sheen.addColorStop(0.65, '#6fc9e6aa');
    sheen.addColorStop(1, '#4da3d06b');
    circle(c, xx, yy, rr, sheen, '#c2f3ffb8', 1.5);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + 0.3;
      line(
        c,
        [
          [xx, yy],
          [xx + Math.cos(a) * rr * 0.48, yy + Math.sin(a) * rr * 0.48],
          [xx + Math.cos(a + 0.16) * rr * 0.84, yy + Math.sin(a + 0.16) * rr * 0.84],
        ],
        '#e0fbffab',
        1,
      );
    }
  }
  for (const pillar of state.obstacles ?? []) {
    const xx = x + pillar.x * scale,
      yy = y + pillar.y * scale,
      rr = pillar.radius * scale;
    circle(c, xx + 3, yy + 5, rr + 3, '#362c2055');
    circle(c, xx, yy + 3, rr, '#64675e', '#494b42', 1.5);
    const stone = c.createLinearGradient(xx - rr, yy - rr, xx + rr, yy + rr);
    stone.addColorStop(0, '#d1c8ae');
    stone.addColorStop(1, '#85877a');
    circle(c, xx, yy, rr, stone, '#e2d6b2', 1.8);
    line(
      c,
      [
        [xx - rr * 0.7, yy - rr * 0.45],
        [xx - rr * 0.15, yy],
        [xx + rr * 0.52, yy - rr * 0.62],
      ],
      '#636b62',
      1.3,
    );
    line(
      c,
      [
        [xx - rr * 0.15, yy],
        [xx + rr * 0.14, yy + rr * 0.8],
      ],
      '#636b62',
      1.3,
    );
  }
  c.restore();
  // The bright chord is the exact collision boundary of a clipped edge.
  for (const gap of state.gaps ?? []) {
    const edge = Math.max(0, radius - gap.depth),
      half = Math.sqrt(radius * radius - edge * edge);
    const nx = Math.cos(gap.angle),
      ny = Math.sin(gap.angle);
    line(
      c,
      [
        [x + (nx * edge - ny * half) * scale, y + (ny * edge + nx * half) * scale],
        [x + (nx * edge + ny * half) * scale, y + (ny * edge - nx * half) * scale],
      ],
      '#f4cb87',
      3,
    );
  }
  c.restore();
}
function miniature(c, level, x, y, radius, t = 0) {
  const scale = radius / physics.radius;
  terrainTable(c, { ...level, radius: physics.radius }, x, y, scale);
  (level.points ?? []).forEach(([xx, yy], id) =>
    fighter(c, x + xx * scale, y + yy * scale, Math.max(11, physics.puck * scale), id, id === 0, t),
  );
}

export function draw(c, app) {
  const { time: t = 0, screen, state, layouts = [] } = app;
  const buttons = [];
  app.fields = [];
  c.clearRect(0, 0, W, H);
  background(c, t);
  const busy = Boolean(app.onlineBusy);
  const button = (
    id,
    label,
    x,
    y,
    w = 290,
    h = 53,
    primary = false,
    icon = null,
    disabled = false,
  ) => {
    c.save();
    if (disabled) c.globalAlpha = 0.48;
    rect(c, x, y + 4, w, h, 12, '#0c1b1e');
    const grad = c.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, primary ? '#ffe0a0' : '#785037');
    grad.addColorStop(1, primary ? '#d79a42' : '#492f23');
    rect(c, x, y, w, h, 12, grad, primary ? '#ffdf96' : '#a2784c');
    rect(c, x + 4, y + 4, w - 8, h - 8, 9, '#00000000', primary ? '#b77a35' : '#c3995a55');
    if (icon === 'pause') {
      c.fillStyle = cream;
      c.fillRect(x + w / 2 - 7, y + h / 2 - 8, 5, 16);
      c.fillRect(x + w / 2 + 2, y + h / 2 - 8, 5, 16);
    } else if (label) {
      const size = primary && w >= 210 ? 23 : w < 90 ? 15 : 17;
      text(c, label, x + w / 2, y + h / 2 + 1, size, primary ? '#442a1b' : cream, 'serif');
    }
    c.restore();
    buttons.push({ id, label, x, y, w, h, disabled });
  };
  const heading = (label, sub, y = 143) => {
    text(c, label, 195, y, 32, cream, 'serif');
    if (sub) text(c, sub, 195, y + 40, 12, '#b8bfa7');
  };
  const notice = (y = 582) => {
    if (app.error) {
      const chunks = Array.from(String(app.error));
      text(c, chunks.slice(0, 25).join(''), 195, y, 12, '#ffba9a');
      if (chunks.length > 25) text(c, chunks.slice(25, 50).join(''), 195, y + 20, 12, '#ffba9a');
    } else if (app.toast) text(c, trim(app.toast, 25), 195, y, 12, '#efcf92');
  };
  const playerName = (id, max = 10) =>
    trim(app.playerNames?.[id] ?? names[id] ?? `玩家 ${id + 1}`, max);
  const currentLevel = app.chosenLevel;
  const earnedStars = totalStars(app.save);
  const theme = app.themes?.find((item) => item.id === (app.theme ?? app.save.theme));
  const accent = theme?.color;
  const customAccent = accent && theme.id !== 'wood';
  if (screen === 'home') {
    text(c, '指 尖 比 武  ·  走 位 逼 边', 195, 128, 11, '#cfb98c');
    c.save();
    c.translate(195, 189);
    c.rotate(-0.035);
    text(c, '弹指擂台', 2, 5, 56, '#0c1c21', 'serif');
    text(c, '弹指擂台', 0, 0, 56, '#fbd58a', 'serif');
    c.restore();
    text(c, `${levels.length} 关江湖 · 与好友一决高下`, 195, 242, 14, '#c0c3a9');
    table(c, 195, 411, 136);
    fighter(c, 119, 385, 29, 2, false, t);
    fighter(c, 267, 373, 29, 1, false, t);
    if (customAccent) circle(c, 194, 461, 48, null, accent, 3);
    fighter(c, 194, 461, 37, 0, true, t);
    const next = nextLevel(app.save);
    text(
      c,
      app.invited
        ? app.invited.targetShots
          ? `好友自报：${app.invited.targetShots} 次出手守擂`
          : '接受好友的同擂台挑战'
        : `第 ${next.index} 关 · ${next.name}`,
      195,
      567,
      13,
      '#d5c09a',
    );
    button(
      'start',
      app.invited ? '接受同擂台挑战' : app.save.campaign ? '继续闯关' : '开始闯关',
      45,
      589,
      300,
      55,
      true,
    );
    button('levels', '章节选关', 28, 660, 161, 45);
    button('friends', '好友擂台', 201, 660, 161, 45);
    button('layouts', '练习场', 28, 719, 101, 44);
    button('wardrobe', `藏阁 ${earnedStars} 星`, 140, 719, 111, 44);
    button('help', '玩法', 262, 719, 100, 44);
  } else if (screen === 'levels') {
    const chapterIndex = Math.max(0, Math.min(chapters.length - 1, app.chapter ?? 0));
    const chapter = chapters[chapterIndex];
    heading('章节选关', `共 ${levels.length} 关 · 已获 ${earnedStars} / ${levels.length * 3} 星`);
    button('chapter-prev', '上章', 28, 205, 68, 44, false, null, chapterIndex === 0);
    button(
      'chapter-next',
      '下章',
      294,
      205,
      68,
      44,
      false,
      null,
      chapterIndex === chapters.length - 1,
    );
    text(c, chapter.name, 195, 221, 24, '#f6d28c', 'serif');
    text(c, `第 ${chapterIndex + 1} 章`, 195, 246, 11, '#b8bfa7');
    levels
      .filter((level) => level.chapter === chapter.id)
      .forEach((level, i) => {
        const y = 274 + i * 73;
        const unlocked = isLevelUnlocked(app.save, level.id);
        const record = app.save.campaign?.levels?.[level.id];
        button(`level-${level.id}`, '', 28, y, 334, 63, false, null, !unlocked);
        circle(
          c,
          62,
          y + 31,
          21,
          unlocked ? '#382e24' : '#263734',
          unlocked ? '#e2b362' : '#62766a',
          1.5,
        );
        text(
          c,
          String(level.index).padStart(2, '0'),
          62,
          y + 31,
          20,
          unlocked ? '#f8d28a' : '#99a298',
          'serif',
        );
        text(c, level.name, 204, y + 20, 18, unlocked ? cream : '#9ea497', 'serif');
        if (unlocked) stars(c, 204, y + 45, record?.stars ?? 0, 8, 25);
        else text(c, '通过上一关解锁', 204, y + 46, 11, '#99a298');
        if (!unlocked) lock(c, 334, y + 31);
        else if (level.boss) text(c, '守关', 332, y + 34, 11, '#f2cb80');
        buttons.at(-1).label = `第 ${level.index} 关 ${level.name}${unlocked ? '' : ' 未解锁'}`;
      });
    text(c, chapter.subtitle, 195, 665, 12, '#b8bfa7');
    button('home', '返回武馆', 80, 704, 230, 48);
  } else if (screen === 'briefing' && currentLevel) {
    heading(
      currentLevel.name,
      `第 ${currentLevel.index} 关 · ${chapters.find((ch) => ch.id === currentLevel.chapter)?.name ?? ''}`,
    );
    miniature(c, currentLevel, 195, 328, 106, t);
    text(c, currentLevel.hint, 195, 468, 13, '#f2d5a1');
    const record = app.save.campaign?.levels?.[currentLevel.id];
    const goals = [
      { label: '站到最后，即可解锁下一关', complete: Boolean(record?.stars) },
      ...currentLevel.challenges.map((goal) => ({
        ...goal,
        complete: record?.goals?.includes(goal.id),
      })),
    ];
    goals.forEach((goal, i) => {
      star(c, 65, 510 + i * 29, 9, goal.complete);
      text(c, goal.label, 217, 510 + i * 29, 12, goal.complete ? '#f8d28a' : '#c1c6b2');
    });
    button('play-level', '上擂台', 50, 606, 290, 55, true);
    button('levels', '返回选关', 80, 683, 230, 48);
  } else if (screen === 'friends') {
    heading('好友擂台', '同机切磋，或邀请朋友各自入席');
    table(c, 195, 316, 87);
    fighter(c, 145, 308, 30, 0, false, t);
    fighter(c, 245, 308, 30, 1, false, t);
    button('local2', '同机双人 · 三局两胜', 40, 440, 310, 55, true);
    button(
      'online-create',
      '创建房间 · 2–4 人',
      40,
      512,
      310,
      51,
      false,
      null,
      app.onlineAvailable === false,
    );
    button(
      'online-join',
      '输入房间码加入',
      40,
      578,
      310,
      51,
      false,
      null,
      app.onlineAvailable === false,
    );
    text(
      c,
      app.onlineAvailable === false
        ? '此平台暂未提供联机，可直接同机切磋'
        : '双人三局两胜 · 多人积分争擂',
      195,
      658,
      12,
      '#b8bfa7',
    );
    button('home', '返回武馆', 80, 704, 230, 48);
  } else if (screen === 'room-create') {
    heading('约上好友，开擂', '每位朋友使用自己的设备加入');
    text(c, '入席人数', 195, 255, 19, '#f3d49a', 'serif');
    [2, 3, 4].forEach((count, i) =>
      button(
        `room-size-${count}`,
        `${count} 人`,
        39 + i * 108,
        285,
        96,
        54,
        app.roomSize === count,
        null,
        busy,
      ),
    );
    text(
      c,
      app.roomSize === 2
        ? '三局两胜 · 每局交换先手'
        : `${app.roomSize ?? 2} 小局积分赛 · 轮换先手与位置`,
      195,
      367,
      13,
      '#b8bfa7',
    );
    text(c, '每手计时', 195, 422, 19, '#f3d49a', 'serif');
    button('timer-10', '10 秒 · 利落', 40, 450, 149, 50, app.turnSeconds !== 15, null, busy);
    button('timer-15', '15 秒 · 从容', 201, 450, 149, 50, app.turnSeconds === 15, null, busy);
    text(c, '超时跳过 · 第 3 轮后开始收圈', 195, 531, 12, '#b8bfa7');
    notice(563);
    button('create-room', busy ? '正在开擂…' : '创建房间', 50, 620, 290, 55, true, null, busy);
    button('friends', '返回', 80, 704, 230, 48, false, null, busy);
  } else if (screen === 'room-join') {
    heading('凭帖入席', '输入朋友分享的 12 位房间码');
    text(c, '房间码', 195, 275, 20, '#f3d49a', 'serif');
    rect(c, 45, 310, 300, 58, 10, '#0b252a', '#b28e53');
    app.fields = [
      {
        id: 'room-code',
        label: '房间码',
        x: 45,
        y: 310,
        w: 300,
        h: 58,
        type: 'text',
        maxLength: 12,
      },
    ];
    text(
      c,
      app.roomCode || '例如 A8C2D4E6F901',
      195,
      339,
      app.roomCode ? 23 : 17,
      app.roomCode ? cream : '#899e94',
    );
    text(c, '字母和数字，不区分大小写', 195, 400, 12, '#b8bfa7');
    notice(480);
    button('join-room', busy ? '正在入席…' : '加入好友擂台', 50, 578, 290, 55, true, null, busy);
    button('friends', '返回', 80, 704, 230, 48, false, null, busy);
  } else if (screen === 'lobby') {
    const room = app.room ?? {},
      players = room.players ?? [];
    const capacity = room.capacity ?? room.state?.capacity ?? app.roomSize ?? 2;
    const closed = ['expired', 'abandoned'].includes(room.status);
    heading(
      '好友擂台',
      closed
        ? room.status === 'expired'
          ? '邀请已过期，请重新开房'
          : '有玩家离开，本场已结束'
        : '人齐并准备后，一起开擂',
    );
    rect(c, 35, 213, 320, 74, 9, '#0b252a', '#b28e53');
    text(c, '房 间 码', 195, 235, 12, '#bdbf9f');
    text(c, room.code ?? '正在连接…', 195, 266, 24, '#ffe3a6', 'serif');
    for (let i = 0; i < capacity; i++) {
      const player = players[i];
      const x = capacity === 2 ? 106 + i * 178 : 106 + (i % 2) * 178;
      const y = capacity === 2 ? 395 : 358 + Math.floor(i / 2) * 140;
      if (player) {
        fighter(c, x, y, 31, i, false, t);
        const isYou = i === room.you;
        text(
          c,
          `${i + 1}号·${trim(player.name ?? player.displayName ?? '好友', 6)}` +
            (isYou ? ' · 你' : ''),
          x,
          y + 53,
          13,
          cream,
        );
        text(
          c,
          player.ready ? '已准备' : '未准备',
          x,
          y + 76,
          12,
          player.ready ? '#b9ddb2' : '#b8bfa7',
        );
      } else {
        c.save();
        c.setLineDash([5, 5]);
        circle(c, x, y, 32, null, '#7c9a91', 2);
        c.restore();
        text(c, '？', x, y, 30, '#a3b4a2', 'serif');
        text(c, '等待好友', x, y + 57, 13, '#a3b4a2');
      }
    }
    const self = players[room.you];
    text(
      c,
      capacity === 2
        ? '三局两胜 · 每小局交换先手'
        : `${capacity} 人 · ${capacity} 小局积分赛 · 同分加赛`,
      195,
      608,
      12,
      '#c6c1a4',
    );
    notice(636);
    button('share-room', '分享邀请', 28, 670, 157, 49, false, null, busy || closed);
    button(
      'ready',
      closed ? '本场已结束' : busy ? '稍候…' : self?.ready ? '已准备，等好友' : '准备',
      197,
      670,
      165,
      49,
      true,
      null,
      busy || closed || Boolean(self?.ready),
    );
    button('leave-room', '离开房间', 105, 729, 180, 44, false, null, busy);
  } else if (screen === 'wardrobe') {
    heading('江湖藏阁', `收集挑战星，解锁装扮 · 已获 ${earnedStars} 星`);
    const themes = app.themes ?? [
      { id: 'classic', name: '初入江湖', threshold: 0, color: '#ffd579' },
    ];
    themes.forEach((theme, i) => {
      const y = 242 + i * 103,
        unlocked = earnedStars >= theme.threshold;
      const selected = app.theme === theme.id || app.save.theme === theme.id;
      button(`theme-${theme.id}`, '', 35, y, 320, 85, selected, null, !unlocked);
      circle(c, 84, y + 40, 25, null, theme.color, 4);
      fighter(c, 84, y + 40, 18, 0);
      text(c, theme.name, 226, y + 29, 20, selected ? '#442a1b' : cream, 'serif');
      text(
        c,
        selected ? '正在使用' : unlocked ? '已解锁 · 点击装扮' : `${theme.threshold} 星解锁`,
        226,
        y + 58,
        12,
        selected ? '#725022' : '#d0c5a1',
      );
      if (!unlocked) lock(c, 324, y + 40);
      buttons.at(-1).label = `${theme.name} ${selected ? '正在使用' : `${theme.threshold} 星解锁`}`;
    });
    button('home', '返回武馆', 80, 704, 230, 48);
  } else if (screen === 'layouts') {
    heading('挑一处，开擂', '五种摆位全部开放 · 同样的物理与实力');
    layouts.forEach((layout, i) => {
      const y = 228 + i * 84;
      button('layout-' + i, '', 28, y, 334, 72);
      circle(c, 69, y + 35, 27, '#b27d43', '#e3b46c', 1);
      layout.points.forEach(([x, z], id) =>
        circle(c, 69 + x * 0.15, y + 35 + z * 0.15, 4, colors[id], '#f7daa2'),
      );
      text(c, layout.name, 219, y + 25, 19, cream, 'serif');
      text(c, layout.hint, 219, y + 50, 11, '#ceb791');
      buttons.at(-1).label = layout.name;
    });
    button('home', '返回武馆', 80, 704, 230, 48);
  } else if (screen === 'matching') {
    heading('江湖相逢', '正在准备本地人机切磋');
    [0, 1, 2].forEach((id) => {
      fighter(c, 95 + id * 100, 365, 34, id, id === 0, t);
      text(c, names[id], 95 + id * 100, 431, 17);
      text(c, id === 0 ? '你' : '系统对手', 95 + id * 100, 459, 12, '#b8bfa7');
    });
    text(c, '随机摆位 · 公平力量', 195, 548, 18, '#efd3a0');
    text(c, '不连接真人匹配', 195, 581, 12, '#a3b3a7');
    button('home', '返回', 80, 681, 230, 48);
  } else if (screen === 'help') {
    heading('弹指之间，自有分寸', '一只手，一座擂台，最后一位大侠');
    const tips = [
      ['壹 · 先接近，找角度', '按住自己的圆盘向后拉，松手弹出。'],
      ['贰 · 留意自己的落点', '虚线计入冰面和石柱，不计对手碰撞。'],
      ['叁 · 借力，也要保位', '冰面更滑、石柱可反弹，完全出界才淘汰。'],
      ['肆 · 收圈前，向内留位', '看橙色预告；好友局第 3 轮后开始收圈。'],
      ['伍 · 好友争擂，轮流出手', '双人三局两胜，多人按存活名次积分。'],
    ];
    tips.forEach(([title, desc], i) => {
      text(c, title, 195, 252 + i * 73, 21, '#f8d58f', 'serif');
      text(c, desc, 195, 283 + i * 73, 12, '#c3c5b0');
    });
    button('home', '记住了，回武馆', 60, 686, 270, 54, true);
  } else if (state) {
    const identity = (id) =>
      state.seats ? Number(state.seats[id]?.replace('player-', '')) - 1 : id;
    const live = state.discs.filter((d) => d.alive).length;
    const localDisc = app.localDisc ?? 0;
    const ownDisc = state.discs[localDisc];
    const canAim = app.canAim ?? (state.phase === 'aim' && state.active === 0);
    const friendly = app.mode === 'local' || app.mode === 'online';
    if (screen === 'playing' || screen === 'replay') {
      const roundTitle =
        app.mode === 'campaign' && currentLevel
          ? `第 ${currentLevel.index} 关 · ${currentLevel.name}`
          : friendly && app.series
            ? app.series.stage === 'tiebreak'
              ? '决胜加赛'
              : `好友擂台 · 第 ${app.series.round} 小局`
            : `第 ${String(state.turn).padStart(2, '0')} 回合`;
      text(
        c,
        screen === 'replay' ? '上一弹 · 回放' : roundTitle,
        205,
        85,
        app.mode === 'campaign' ? 19 : 21,
        cream,
        'serif',
      );
      if (screen === 'playing') {
        if (app.mode === 'online') button('leave-room', '离开', 25, 64, 44, 44, false, null, busy);
        else button('pause', '暂停', 25, 64, 44, 44, false, 'pause');
      }
      const turnLabel =
        screen === 'replay'
          ? '真实轨迹 · 再看一次'
          : state.phase === 'moving'
            ? '出招！'
            : state.phase === 'shrinking'
              ? '擂台收圈中'
              : state.phase === 'over'
                ? '切磋结束'
                : `${playerName(state.active, 9)}${canAim ? (app.mode === 'local' ? ' · 请接手' : ' · 轮到你了') : friendly ? ' · 正在瞄准' : ' · 蓄势中'}`;
      text(c, turnLabel, 195, 128, 17, colors[identity(state.active)]);
      if (
        friendly &&
        app.remainingSeconds !== null &&
        app.remainingSeconds !== undefined &&
        screen === 'playing'
      ) {
        const seconds = Math.max(0, Math.ceil(app.remainingSeconds));
        circle(c, 340, 87, 20, '#102b2d', seconds <= 3 ? '#ef9c72' : '#ab975e', 1);
        text(c, `${seconds}`, 340, 87, 18, seconds <= 3 ? '#ffba90' : '#eddaad');
      }
      const count = state.discs.length,
        width = 334 / count;
      state.discs.forEach((disc, i) => {
        const x = 28 + width * (i + 0.5);
        c.globalAlpha = disc.alive ? 1 : 0.42;
        circle(c, x - width * 0.35, 174, 8, colors[identity(disc.id)]);
        text(c, String(identity(disc.id) + 1), x - width * 0.35, 174, 10, '#fff9de');
        const name = friendly
          ? playerName(disc.id, count === 4 ? 4 : 6)
          : disc.id === 0
            ? '你'
            : playerName(disc.id, 5);
        text(c, name, x + 10, 172, count === 4 ? 10 : 12, cream);
        if (!disc.alive) text(c, '出局', x + 10, 191, 10, '#c3bea3');
        c.globalAlpha = 1;
      });
      const radius = arenaRadius(state),
        nextRadius = nextArenaRadius(state),
        willShrink = nextRadius < radius;
      terrainTable(c, state, arena.x, arena.y, arena.scale);
      if (willShrink) {
        c.save();
        clipGaps(c, { ...state }, arena.x, arena.y, arena.scale, nextRadius);
        c.setLineDash([6, 6]);
        circle(c, arena.x, arena.y, nextRadius * arena.scale, null, '#ffae54', 2.5);
        for (const gap of state.gaps ?? []) {
          const edge = Math.max(0, nextRadius - gap.depth),
            half = Math.sqrt(nextRadius * nextRadius - edge * edge);
          const nx = Math.cos(gap.angle),
            ny = Math.sin(gap.angle);
          line(
            c,
            [
              [
                arena.x + (nx * edge - ny * half) * arena.scale,
                arena.y + (ny * edge + nx * half) * arena.scale,
              ],
              [
                arena.x + (nx * edge + ny * half) * arena.scale,
                arena.y + (ny * edge - nx * half) * arena.scale,
              ],
            ],
            '#ffae54',
            2.5,
          );
        }
        c.restore();
        text(
          c,
          state.phase === 'shrinking' ? '橙色虚线内将是新擂台' : '本回合结束后收圈',
          195,
          205,
          11,
          '#efba7a',
        );
      } else if (app.mode === 'campaign' || friendly)
        text(c, `第 ${state.turn} 回合`, 195, 205, 11, '#b8bba0');
      for (const trail of app.trails ?? [])
        circle(
          c,
          arena.x + trail.x * arena.scale,
          arena.y + trail.y * arena.scale,
          3,
          colors[identity(trail.id)] + '45',
        );
      for (const d of state.discs) {
        if (!d.alive && d.fall >= 1) continue;
        const fade = d.alive ? 1 : Math.max(0, 1 - (d.fall ?? 0));
        c.globalAlpha = fade;
        const active = d.alive && state.active === d.id && state.phase === 'aim';
        const x = arena.x + d.x * arena.scale,
          y = arena.y + d.y * arena.scale;
        if (active && canAim) circle(c, x, y, 32, null, '#fff1b699', 1.5);
        if (customAccent && d.id === localDisc && d.alive)
          circle(c, x, y, physics.puck * arena.scale + 4, null, accent, 2);
        fighter(
          c,
          x,
          y + (1 - fade) * 40,
          physics.puck * arena.scale * fade,
          identity(d.id),
          active && !canAim,
          t,
        );
        if (friendly && fade > 0.8) {
          circle(c, x + 13, y + 13, 6, '#172e31', '#f4d792', 1);
          text(c, String(identity(d.id) + 1), x + 13, y + 13, 9, cream);
        }
        c.globalAlpha = 1;
      }
      for (const p of app.particles ?? []) {
        const a = 1 - p.age / 0.45;
        circle(
          c,
          arena.x + p.x * arena.scale,
          arena.y + p.y * arena.scale,
          (1 - a) * 21 + 3,
          null,
          `rgba(255,239,180,${Math.max(0, a)})`,
          3,
        );
      }
      if (app.drag) {
        const dx = app.drag.dx,
          dy = app.drag.dy,
          len = Math.hypot(dx, dy),
          power = Math.min(1, len / 115);
        const preview = previewAim(state, -dx, -dy, power),
          end = preview.end ?? state.discs[state.active];
        const out = preview.out;
        const ringRisk = willShrink && outsideArena({ ...state, radius: nextRadius }, end.x, end.y);
        const nearEdge = outsideArena(state, end.x, end.y, -physics.puck);
        const previewColor = out || ringRisk ? '#f37e61' : nearEdge ? '#ffd080' : '#fff1ca';
        if (len > 4) {
          c.save();
          c.setLineDash([3, 6]);
          line(
            c,
            preview.points.map((point) => [
              arena.x + point.x * arena.scale,
              arena.y + point.y * arena.scale,
            ]),
            previewColor,
            2.5,
          );
          circle(
            c,
            arena.x + end.x * arena.scale,
            arena.y + end.y * arena.scale,
            physics.puck * arena.scale,
            null,
            previewColor,
            2,
          );
          c.restore();
          circle(c, arena.x + end.x * arena.scale, arena.y + end.y * arena.scale, 2, previewColor);
        }
        text(c, `力度 ${Math.round(power * 100)}% · 预计滑行`, 195, 605, 18, '#f9d58b');
        rect(c, 90, 632, 210, 7, 3, '#07191e');
        if (power > 0.01)
          rect(c, 90, 632, 210 * power, 7, 3, out || ringRisk ? '#e97950' : '#f4ca77');
        text(
          c,
          len < 9
            ? '拉回圆盘可取消'
            : out
              ? '预计出界 · 减小力度或改变方向'
              : ringRisk
                ? '这个落点有收圈风险'
                : nearEdge
                  ? '落点靠边 · 碰撞后仍需判断'
                  : app.mode === 'practice' || !app.mode
                    ? '无碰撞停点 · 撞后仍需判断'
                    : '忽略对手的预计停点 · 注意碰撞',
          195,
          673,
          13,
          '#d6c6a3',
        );
      } else {
        const hint =
          state.phase === 'moving'
            ? '这一弹，落在哪里？'
            : state.phase === 'shrinking'
              ? '擂台正在收紧'
              : canAim
                ? app.mode === 'local'
                  ? `${playerName(state.active, 10)}接手 · 按住圆盘向后拉`
                  : '按住自己的圆盘，向后拉'
                : willShrink
                  ? '收圈将至 · 注意落点'
                  : '看准落点，等待你的回合';
        text(c, trim(app.toast || hint, 24), 195, 611, 17, '#f2d49a', 'serif');
        text(
          c,
          !ownDisc?.alive && app.mode !== 'local'
            ? '你已出局 · 观战至本局结束'
            : state.phase === 'shrinking'
              ? '金色实线是边缘 · 橙色虚线是预告'
              : canAim
                ? '先接近，再找角度逼边'
                : '观察对手的位置，准备下一手',
          195,
          648,
          12,
          '#b6bba8',
        );
      }
      text(
        c,
        friendly
          ? `${live} 人在场 · ${app.series?.mode === 'duel' ? '三局两胜' : '存活名次积分'}`
          : `${live} 人在场 · 你已出手 ${state.playerShots} 次`,
        195,
        733,
        11,
        '#94a59a',
      );
      if (screen === 'replay') button('result', '返回结算', 100, 671, 190, 47);
      else if (app.mode === 'online' && app.error) notice(685);
    } else if (screen === 'paused') {
      heading(
        '稍歇片刻',
        app.mode === 'online' ? '好友擂台仍在进行，计时继续' : '擂台静止，等你再出招',
      );
      const scale = 100 / physics.radius;
      terrainTable(c, state, 195, 363, scale);
      state.discs
        .filter((d) => d.alive)
        .forEach((d) =>
          fighter(c, 195 + d.x * scale, 363 + d.y * scale, physics.puck * scale, identity(d.id)),
        );
      button('resume', '继续切磋', 60, 518, 270, 54, true);
      button('sound', app.save.sound ? '音效：开' : '音效：关', 60, 586, 270, 48);
      button(
        app.mode === 'online' ? 'leave-room' : 'home',
        app.mode === 'online' ? '离开房间' : '返回武馆',
        60,
        648,
        270,
        48,
      );
    } else if (screen === 'result') {
      const win = state.winner === 0,
        draw = state.winner === -1;
      if (friendly && app.series) {
        const series = app.series,
          finished = series.phase === 'finished';
        const result = app.roundResult ?? series.lastResult;
        const readyNext =
          app.mode === 'online' && app.room?.state?.nextReady?.includes(app.room.you);
        const onlineName = (player) => {
          const index = series.players?.findIndex((entry) => entry.id === player?.id);
          return app.mode === 'online'
            ? index >= 0
              ? `${index + 1}号·${app.room?.players?.[index]?.name ?? player?.name}`
              : null
            : player?.name;
        };
        const champion = series.players?.find((player) => player.id === series.winnerId);
        heading(
          finished
            ? champion
              ? '擂主诞生！'
              : '本场已结束'
            : draw
              ? '同归于尽'
              : '这一局，痛快！',
          finished
            ? champion
              ? `${trim(onlineName(champion), 12)}赢得整场擂台`
              : '对局超时，重新开擂再切磋'
            : result?.needsReplay
              ? '平局重赛，比分保持'
              : `${series.stage === 'tiebreak' ? '加赛' : `第 ${series.round} 小局`}结束 · ${draw ? '无人留在擂台' : `${playerName(state.winner, 10)}守擂成功`}`,
        );
        const rows =
          app.standings ??
          (series.players ?? []).map((player, index) => ({
            ...player,
            rank: index + 1,
            score: series.scores[player.id],
            wins: series.wins[player.id],
          }));
        rows.forEach((row, i) => {
          const y = 247 + i * 76;
          const discId = series.players.findIndex((player) => player.id === row.id);
          rect(
            c,
            36,
            y,
            318,
            62,
            9,
            row.id === series.winnerId ? '#605438' : '#153339',
            row.id === series.winnerId ? '#edc572' : '#6e7455',
          );
          fighter(c, 72, y + 28, 18, discId, false, t);
          text(c, trim(onlineName(row), 10), 174, y + 23, 15, cream);
          text(c, `第 ${row.rank ?? i + 1} 名`, 174, y + 44, 10, '#b6bfa8');
          text(
            c,
            series.mode === 'duel' ? `${row.wins ?? 0} 胜` : `${row.score ?? 0} 分`,
            304,
            y + 31,
            21,
            '#f5d38e',
            'serif',
          );
        });
        if (
          !finished &&
          app.mode === 'online' &&
          !app.error &&
          Number.isFinite(app.nextRoundSeconds)
        ) {
          text(
            c,
            `${readyNext ? '你已准备' : '准备好再来一局'} · ${Math.ceil(Math.max(0, app.nextRoundSeconds))} 秒后自动开擂`,
            195,
            576,
            12,
            '#e1c892',
          );
        } else notice(576);
        button(
          finished ? 'rematch' : 'next-round',
          busy
            ? '等待同步…'
            : readyNext
              ? '已准备，等好友'
              : app.mode === 'online'
                ? finished
                  ? '再战一场'
                  : '准备下一局'
                : finished
                  ? '再战一场'
                  : result?.needsReplay
                    ? '重赛这一局'
                    : series.next?.stage === 'tiebreak'
                      ? '决胜加赛'
                      : '下一小局',
          45,
          620,
          300,
          55,
          true,
          null,
          busy || readyNext,
        );
        button('replay', '回看最后一弹', 28, 697, 175, 47, false, null, app.hasReplay === false);
        button(
          app.mode === 'online' ? 'leave-room' : 'home',
          app.mode === 'online' ? '离开房间' : '回武馆',
          215,
          697,
          147,
          47,
          false,
          null,
          busy,
        );
      } else if (app.mode === 'campaign' && currentLevel) {
        heading(
          win
            ? currentLevel.index === levels.length
              ? '巅峰已至！'
              : '闯关成功！'
            : draw
              ? '同归于尽'
              : '胜败，都是修行',
          `第 ${currentLevel.index} 关 · ${currentLevel.name}`,
        );
        table(c, 195, 328, 85);
        if (!draw) fighter(c, 195, 316, 43, state.winner, true, t);
        stars(c, 195, 446, app.challengeResult?.stars ?? Number(win), 23, 58);
        const goals = app.challengeResult?.goals ?? [];
        goals.forEach((goal, i) => {
          star(c, 58, 505 + i * 30, 9, goal.complete);
          text(c, goal.label, 209, 505 + i * 30, 12, goal.complete ? '#f0d09a' : '#b6bba8');
        });
        text(
          c,
          win
            ? currentLevel.index === levels.length
              ? `${levels.length} 关通关 · 回头挑战满星吧`
              : '下一关已解锁 · 挑战星可重复收集'
            : trim(app.reason || '留一点余力，再试一次', 27),
          195,
          580,
          12,
          '#c8c8b0',
        );
        button(
          win && currentLevel.index < levels.length ? 'next-level' : 'retry',
          win && currentLevel.index < levels.length ? '下一关' : win ? '再挑战一次' : '重试这一关',
          45,
          621,
          300,
          55,
          true,
        );
        button('replay', '回看最后一弹', 28, 699, 175, 47, false, null, app.hasReplay === false);
        button('levels', '章节选关', 215, 699, 147, 47);
      } else {
        heading(
          win ? '守擂成功！' : draw ? '同归于尽' : '胜败，都是修行',
          win
            ? '这一局，你站到了最后'
            : draw
              ? '最后两位同时滑出了擂台'
              : `${names[state.winner]}守住了擂台`,
        );
        table(c, 195, 376, 112);
        if (!draw) fighter(c, 195, 360, 62, state.winner, true, t);
        text(c, win ? '擂 主' : draw ? '平 局' : '再 来 一 局', 195, 460, 22, '#f8d185', 'serif');
        text(
          c,
          app.targetShots
            ? `好友自报 ${app.targetShots} 次守擂 · ${win && state.playerShots <= app.targetShots ? (state.playerShots < app.targetShots ? '已超越！' : '已追平') : '再试一次'}`
            : app.reason || '落点决定下一回合的安全',
          195,
          528,
          13,
          '#c8c8b0',
        );
        text(
          c,
          `${state.turn} 回合 · 出手 ${state.playerShots} 次 · 击落 ${app.playerKnockouts ?? 0} 位`,
          195,
          561,
          13,
          '#b6bba8',
        );
        button('again', '再战一局', 50, 594, 290, 55, true);
        button('rematch', '同局再战', 50, 661, app.canShare ? 140 : 290, 47);
        if (app.canShare) button('share', '分享战帖', 200, 661, 140, 47);
        button('replay', '回看最后一弹', 50, 720, 175, 47);
        button('home', '回武馆', 236, 720, 104, 47);
        if (app.shareNotice) text(c, app.shareNotice, 195, 578, 11, '#f8d185');
      }
    }
  }
  return buttons;
}
