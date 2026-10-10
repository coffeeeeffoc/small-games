import { arenaRadius, nextArenaRadius, shotDistance, physics } from './core.mjs';

export const W = 390,
  H = 780,
  arena = { x: 195, y: 382, scale: 1.04 };
export const colors = ['#348fe2', '#e65d48', '#eba632'];
export const names = ['蓝小侠', '赤小虎', '橙师兄'];
const ink = '#1b292c',
  cream = '#fce9bc';
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
export function draw(c, app) {
  const { time: t, screen, state, layouts } = app;
  const buttons = [];
  c.clearRect(0, 0, W, H);
  background(c, t);
  const button = (id, label, x, y, w = 290, h = 53, primary = false, icon = null) => {
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
    } else
      text(
        c,
        label,
        x + w / 2,
        y + h / 2 + 1,
        primary ? 23 : 17,
        primary ? '#442a1b' : cream,
        'serif',
      );
    buttons.push({ id, label, x, y, w, h });
  };
  const heading = (label, sub) => {
    text(c, label, 195, 155, 35, cream, 'serif');
    if (sub) text(c, sub, 195, 196, 12, '#b8bfa7');
  };
  if (screen === 'home') {
    text(c, '指 尖 比 武  ·  走 位 逼 边', 195, 149, 12, '#cfb98c');
    c.save();
    c.translate(195, 225);
    c.rotate(-0.04);
    text(c, '弹指擂台', 2, 5, 58, '#0c1c21', 'serif');
    text(c, '弹指擂台', 0, 0, 58, '#fbd58a', 'serif');
    c.restore();
    text(c, '先抢好位置，再把对手逼下擂台', 195, 283, 15, '#c0c3a9');
    table(c, 195, 435, 145);
    fighter(c, 117, 406, 32, 2, false, t);
    fighter(c, 266, 392, 32, 1, false, t);
    fighter(c, 195, 489, 40, 0, true, t);
    button('start', '开始匹配', 50, 613, 290, 57, true);
    button('layouts', '练习摆位', 50, 683, 180, 47);
    button('help', '玩法', 242, 683, 98, 47);
    text(c, '单人挑战 · 两位系统对手', 195, 754, 11, '#a3b3a7');
    if (app.save.played)
      text(c, `切磋 ${app.save.played} 局 · 胜 ${app.save.wins} 局`, 195, 574, 12, '#d4be8c');
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
      buttons[buttons.length - 1].label = layout.name;
    });
    button('home', '返回武馆', 80, 681, 230, 48);
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
      ['壹 · 先接近，找角度', '按住蓝盘向后拉，短射程需要先走位。'],
      ['贰 · 留意自己的落点', '虚线是无碰撞停点，撞后仍要判断。'],
      ['叁 · 多次逼边，再终结', '蓝 → 红 → 橙轮流；完全出界才淘汰。'],
      ['肆 · 收圈前，向内留位', '前五回合不收圈，之后看橙色预告。'],
    ];
    tips.forEach(([title, desc], i) => {
      text(c, title, 195, 272 + i * 84, 21, '#f8d58f', 'serif');
      text(c, desc, 195, 305 + i * 84, 13, '#c3c5b0');
    });
    button('home', '记住了，回武馆', 60, 668, 270, 54, true);
  } else {
    const live = state.discs.filter((d) => d.alive).length;
    if (screen === 'playing' || screen === 'replay') {
      text(
        c,
        screen === 'replay' ? '上一弹 · 回放' : `第 ${String(state.turn).padStart(2, '0')} 回合`,
        195,
        85,
        23,
        cream,
        'serif',
      );
      if (screen === 'playing') button('pause', '暂停', 25, 64, 44, 44, false, 'pause');
      text(
        c,
        screen === 'replay'
          ? '真实轨迹 · 再看一次'
          : state.phase === 'moving'
            ? '出招！'
            : state.phase === 'shrinking'
              ? '擂台收圈中'
              : state.phase === 'over'
                ? '切磋结束'
                : `${names[state.active]}${state.active === 0 ? ' · 轮到你了' : ' · 蓄势中'}`,
        195,
        128,
        17,
        colors[state.active],
      );
      [0, 1, 2].forEach((id) => {
        const x = 85 + id * 110,
          alive = state.discs[id].alive;
        c.globalAlpha = alive ? 1 : 0.4;
        circle(c, x - 28, 176, 5, colors[id]);
        text(c, `${id === 0 ? '你' : names[id]}${alive ? '' : ' · 出局'}`, x + 5, 176, 12, cream);
        c.globalAlpha = 1;
      });
      const radius = arenaRadius(state),
        nextRadius = nextArenaRadius(state),
        willShrink = nextRadius < radius;
      table(c, arena.x, arena.y, radius * arena.scale);
      if (willShrink) {
        c.save();
        c.setLineDash([6, 6]);
        circle(c, arena.x, arena.y, nextRadius * arena.scale, null, '#ffae54', 2.5);
        c.restore();
        text(
          c,
          state.phase === 'shrinking' ? '橙色虚线内将是新擂台' : '本回合结束后收圈',
          195,
          205,
          11,
          '#efba7a',
        );
      }
      if (state.phase === 'shrinking')
        circle(c, arena.x, arena.y, radius * arena.scale, null, '#ffe7a2', 3);
      for (const trail of app.trails) {
        circle(
          c,
          arena.x + trail.x * arena.scale,
          arena.y + trail.y * arena.scale,
          3,
          colors[trail.id] + '45',
        );
      }
      for (const d of state.discs) {
        if (!d.alive && d.fall >= 1) continue;
        const fade = d.alive ? 1 : Math.max(0, 1 - d.fall);
        c.globalAlpha = fade;
        const canAim = d.alive && state.active === d.id && state.phase === 'aim';
        if (d.id === 0 && canAim)
          circle(
            c,
            arena.x + d.x * arena.scale,
            arena.y + d.y * arena.scale,
            32,
            null,
            '#fff1b699',
            1.5,
          );
        fighter(
          c,
          arena.x + d.x * arena.scale,
          arena.y + d.y * arena.scale + (1 - fade) * 40,
          physics.puck * arena.scale * fade,
          d.id,
          canAim && d.id !== 0,
          t,
        );
        c.globalAlpha = 1;
      }
      for (const p of app.particles) {
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
        const d = state.discs[0],
          x = arena.x + d.x * arena.scale,
          y = arena.y + d.y * arena.scale;
        const dx = app.drag.dx,
          dy = app.drag.dy,
          len = Math.hypot(dx, dy),
          power = Math.min(1, len / 115),
          distance = shotDistance(power),
          endX = len ? d.x - (dx / len) * distance : d.x,
          endY = len ? d.y - (dy / len) * distance : d.y,
          out = Math.hypot(endX, endY) > radius + physics.puck,
          ringRisk = willShrink && Math.hypot(endX, endY) > nextRadius + physics.puck,
          nearEdge = Math.hypot(endX, endY) > radius - physics.puck,
          previewColor = out || ringRisk ? '#f37e61' : nearEdge ? '#ffd080' : '#fff1ca';
        if (len > 4) {
          const nx = -dx / len,
            ny = -dy / len,
            l = distance * arena.scale,
            xx = x + nx * l,
            yy = y + ny * l;
          c.save();
          c.setLineDash([3, 6]);
          line(
            c,
            [
              [x, y],
              [xx, yy],
            ],
            previewColor,
            2.5,
          );
          circle(c, xx, yy, physics.puck * arena.scale, null, previewColor, 2);
          c.restore();
          circle(c, xx, yy, 2, previewColor);
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
                  : '无碰撞停点 · 撞后仍需判断',
          195,
          673,
          13,
          '#d6c6a3',
        );
      } else {
        text(
          c,
          app.toast ||
            (state.phase === 'moving'
              ? '这一弹，落在哪里？'
              : state.phase === 'shrinking'
                ? '擂台正在收紧'
                : willShrink
                  ? '收圈将至 · 注意落点'
                  : state.active === 0
                    ? '按住蓝小侠，向后拉'
                    : '看准落点，等待你的回合'),
          195,
          611,
          18,
          '#f2d49a',
          'serif',
        );
        text(
          c,
          !state.discs[0].alive
            ? '你已出局 · 观战至本局结束'
            : state.phase === 'shrinking'
              ? '金色实线是边缘 · 橙色虚线是预告'
              : state.active === 0
                ? '先接近，再找角度逼边'
                : '观察对手的位置，准备下一手',
          195,
          648,
          12,
          '#b6bba8',
        );
      }
      text(c, `${live} 人在场 · 你已出手 ${state.playerShots} 次`, 195, 733, 11, '#94a59a');
      if (screen === 'replay') button('result', '返回结算', 100, 671, 190, 47);
    } else if (screen === 'paused') {
      heading('稍歇片刻', '擂台静止，等你再出招');
      const scale = 100 / physics.radius;
      table(c, 195, 363, arenaRadius(state) * scale);
      state.discs
        .filter((d) => d.alive)
        .forEach((d) =>
          fighter(c, 195 + d.x * scale, 363 + d.y * scale, physics.puck * scale, d.id),
        );
      button('resume', '继续切磋', 60, 518, 270, 54, true);
      button('sound', app.save.sound ? '音效：开' : '音效：关', 60, 586, 270, 48);
      button('home', '返回武馆', 60, 648, 270, 48);
    } else if (screen === 'result') {
      const win = state.winner === 0,
        draw = state.winner === -1;
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
      text(c, app.reason || '落点决定下一回合的安全', 195, 528, 13, '#c8c8b0');
      text(c, `${state.turn} 回合 · 你出手 ${state.playerShots} 次`, 195, 561, 13, '#b6bba8');
      button('again', '再战一局', 50, 607, 290, 55, true);
      button('replay', '回看最后一弹', 50, 676, 175, 47);
      button('home', '回武馆', 236, 676, 104, 47);
    }
  }
  return buttons;
}
