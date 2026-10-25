import { harborTexture } from './art.mjs';
import { getBoardLayout, unlockedThrough, starCount } from './layout.mjs';
import { getObjectives, isGateLocked } from './engine.mjs';
import { LEVELS } from './levels.mjs';
const C = {
  ink: '#082635',
  panel: '#103746',
  edge: '#497c80',
  mint: '#bdf4e2',
  text: '#f7edce',
  muted: '#9ebcba',
  water: '#24b8b7',
  orange: '#ef9155',
  gold: '#d6b579',
};
export function createView(runtime, activate) {
  const { cc, ui: root } = runtime;
  const { Node, UITransform, Graphics, Color, Label, Sprite, SpriteFrame, Texture2D, ImageAsset } =
    cc;
  let W = runtime.width,
    H = runtime.height,
    screenNode,
    sceneNode,
    bgNode,
    bgResources = [],
    hits = [],
    board = null,
    model,
    waterGraphics,
    waterLabels = [];
  const access = document.querySelector('#accessibility');
  const color = (hex, a = 255) => {
    const n = parseInt(hex.slice(1), 16);
    return new Color((n >> 16) & 255, (n >> 8) & 255, n & 255, a);
  };
  function node(parent, name = 'visual') {
    const n = new Node(name);
    n.layer = cc.Layers.Enum.UI_2D;
    n.addComponent(UITransform);
    parent.addChild(n);
    return n;
  }
  function graphics(parent) {
    return node(parent).addComponent(Graphics);
  }
  function rect(g, x, y, w, h, fill, r = 0, border = null, lw = 1) {
    g.fillColor = color(fill);
    g.lineWidth = lw;
    if (r) g.roundRect(x, -y - h, w, h, r);
    else g.rect(x, -y - h, w, h);
    g.fill();
    if (border) {
      g.strokeColor = color(border);
      g.stroke();
    }
  }
  function line(g, pts, tint, width = 2, alpha = 255) {
    g.strokeColor = color(tint, alpha);
    g.lineWidth = width;
    g.lineCap = Graphics.LineCap.ROUND;
    g.lineJoin = Graphics.LineJoin.ROUND;
    g.moveTo(pts[0][0], -pts[0][1]);
    pts.slice(1).forEach((p) => g.lineTo(p[0], -p[1]));
    g.stroke();
  }
  function circle(g, x, y, r, fill, border = null, lw = 1) {
    g.fillColor = color(fill);
    g.circle(x, -y, r);
    g.fill();
    if (border) {
      g.lineWidth = lw;
      g.strokeColor = color(border);
      g.stroke();
    }
  }
  function poly(g, points, fill) {
    g.fillColor = color(fill);
    g.moveTo(points[0][0], -points[0][1]);
    points.slice(1).forEach((p) => g.lineTo(p[0], -p[1]));
    g.close();
    g.fill();
  }
  function text(parent, value, x, y, size = 16, tint = C.text, width = W - 40, bold = false) {
    const n = node(parent, 'text');
    n.setPosition(x, -y);
    n.getComponent(UITransform).setContentSize(
      width,
      size * 1.5 * String(value).split('\n').length + 5,
    );
    const l = n.addComponent(Label);
    l.string = String(value);
    l.fontSize = size;
    l.lineHeight = size * 1.45;
    l.color = color(tint);
    l.fontFamily = size >= 26 ? 'serif' : 'sans-serif';
    l.isBold = bold;
    l.horizontalAlign = Label.HorizontalAlign.CENTER;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    l.overflow = Label.Overflow.SHRINK;
    l.enableWrapText = true;
    return l;
  }
  function icon(g, id, x, y, tint = C.text) {
    if (id === 'pause') {
      rect(g, x - 8, y - 9, 5, 18, tint, 1);
      rect(g, x + 3, y - 9, 5, 18, tint, 1);
    }
    if (id === 'back')
      line(
        g,
        [
          [x + 5, y - 9],
          [x - 5, y],
          [x + 5, y + 9],
        ],
        tint,
        2.5,
      );
    if (id === 'next')
      line(
        g,
        [
          [x - 5, y - 9],
          [x + 5, y],
          [x - 5, y + 9],
        ],
        tint,
        2.5,
      );
    if (id === 'lock') {
      circle(g, x, y - 3, 7, C.ink, tint, 2);
      rect(g, x - 9, y - 3, 18, 14, tint, 3);
      rect(g, x - 1, y + 1, 2, 5, C.ink);
    }
    if (id === 'check')
      line(
        g,
        [
          [x - 6, y],
          [x - 1, y + 5],
          [x + 8, y - 6],
        ],
        tint,
        2.8,
      );
    if (id === 'star') {
      const pts = Array.from({ length: 10 }, (_, i) => [
        x + Math.sin((i * Math.PI) / 5) * (i % 2 ? 4 : 10),
        y - Math.cos((i * Math.PI) / 5) * (i % 2 ? 4 : 10),
      ]);
      poly(g, pts, tint);
    }
    if (id === 'settings') {
      circle(g, x, y, 9, C.ink, tint, 2);
      circle(g, x, y, 3, C.ink, tint, 2);
      for (let i = 0; i < 8; i++) {
        let a = (i * Math.PI) / 4;
        line(
          g,
          [
            [x + Math.cos(a) * 10, y + Math.sin(a) * 10],
            [x + Math.cos(a) * 13, y + Math.sin(a) * 13],
          ],
          tint,
          3,
        );
      }
    }
  }
  function hit(id, label, x, y, width, height, action, disabled = false, data = {}) {
    const b = document.createElement('button');
    b.id = id;
    b.textContent = label;
    b.setAttribute('aria-label', label);
    b.disabled = disabled;
    Object.assign(b.style, {
      left: x + 'px',
      top: y + 'px',
      width: width + 'px',
      height: height + 'px',
    });
    Object.assign(b.dataset, data);
    b.addEventListener('click', () => {
      if (!disabled) activate(action);
    });
    access.append(b);
    hits.push({ id, label, x, y, width, height, action, disabled });
    return b;
  }
  function button(
    id,
    label,
    x,
    y,
    w,
    h,
    action,
    { primary = false, disabled = false, icon: ic, data = {}, small = false } = {},
  ) {
    const g = graphics(screenNode);
    rect(
      g,
      x,
      y,
      w,
      h,
      primary ? C.text : C.ink,
      Math.min(15, h / 3),
      primary ? C.text : disabled ? '#274a56' : C.edge,
      1.2,
    );
    const tint = primary ? C.ink : disabled ? '#53717a' : C.text;
    if (ic) icon(g, ic, x + w / 2, y + h / 2, tint);
    else text(screenNode, label, x + w / 2, y + h / 2, small ? 13 : 16, tint, w - 14, primary);
    return hit(id, label, x, y, w, h, action, disabled, data);
  }
  function header(title, back = 'home', id = 'back-home') {
    button(id, back === 'exit-challenge' ? '退出挑战' : '返回', 16, 14, 46, 46, back, {
      icon: 'back',
    });
    text(screenNode, title, W / 2, 37, 18, C.text, W - 145, true);
  }
  function decor(parent, x, y, w, h) {
    const g = graphics(parent);
    rect(g, x, y, w, h, '#0c2d3b', 18, C.edge);
    for (let i = 0; i < 3; i++)
      line(
        g,
        [
          [x + 18, y + h - 18 - i * 4],
          [x + w * 0.45, y + h - 18 - i * 4],
          [x + w * 0.7, y + h - 24 - i * 4],
          [x + w - 18, y + h - 24 - i * 4],
        ],
        '#24545c',
        1,
      );
    return g;
  }
  function boat(g, x, y, s = 1) {
    poly(
      g,
      [
        [x - 19 * s, y],
        [x + 20 * s, y],
        [x + 11 * s, y + 9 * s],
        [x - 12 * s, y + 9 * s],
      ],
      '#c68a51',
    );
    line(
      g,
      [
        [x - 17 * s, y],
        [x + 18 * s, y],
      ],
      C.text,
      2 * s,
    );
    line(
      g,
      [
        [x, y],
        [x, y - 35 * s],
      ],
      C.gold,
      2 * s,
    );
    poly(
      g,
      [
        [x - 3 * s, y - 33 * s],
        [x - 3 * s, y - 3 * s],
        [x - 19 * s, y - 3 * s],
      ],
      '#fff2c9',
    );
    poly(
      g,
      [
        [x + 1 * s, y - 28 * s],
        [x + 17 * s, y - 4 * s],
        [x + 1 * s, y - 4 * s],
      ],
      '#d4dfc8',
    );
  }
  function crate(g, x, y, s = 1) {
    rect(g, x - 13 * s, y - 25 * s, 26 * s, 25 * s, '#d98c50', 2, C.text, 1);
    rect(g, x - 10 * s, y - 22 * s, 20 * s, 19 * s, '#aa5e39', 1, '#efb571', 1);
    line(
      g,
      [
        [x - 10 * s, y - 22 * s],
        [x + 10 * s, y - 3 * s],
      ],
      '#f5bf80',
      2 * s,
    );
    line(
      g,
      [
        [x + 10 * s, y - 22 * s],
        [x - 10 * s, y - 3 * s],
      ],
      '#f5bf80',
      2 * s,
    );
  }
  function wheel(g, x, y, open = false, locked = false, selected = false, angle = 0) {
    const tint = locked ? '#6c8583' : open ? '#83ddc3' : C.orange;
    circle(g, x, y, 25, C.ink, selected ? C.text : '#92724c', selected ? 3 : 2);
    circle(g, x, y, 20, C.ink, tint, 5);
    for (let i = 0; i < 4; i++) {
      const a = angle + (i * Math.PI) / 2;
      line(
        g,
        [
          [x + Math.cos(a) * 7, y + Math.sin(a) * 7],
          [x + Math.cos(a) * 18, y + Math.sin(a) * 18],
        ],
        tint,
        4,
      );
    }
    circle(g, x, y, 7, tint, C.text, 1);
    circle(g, x, y, 2, C.ink);
    if (locked) icon(g, 'lock', x, y, C.text);
  }
  function tank(g, t, value, tank, state, index, preview = null, time = 0) {
    const { x, y, width: w, height: h } = t;
    const pad = Math.min(7, w * 0.12),
      inner = w - pad * 2;
    rect(g, x, y, w, h, '#0d303f', w * 0.17, '#79b0ad', 1.1);
    rect(g, x + pad, y + 8, inner, h - 15, '#154756', 4);
    const waterH = Math.max(2, ((h - 22) * Math.max(0, Math.min(10, value))) / 10);
    const surface = y + h - 10 - waterH;
    rect(g, x + pad + 1, surface, inner - 2, waterH, '#15898f', 3);
    rect(g, x + pad + 1, surface, inner - 2, Math.min(waterH, 12), '#44d9cb', 3);
    rect(
      g,
      x + pad + 3,
      surface + Math.min(12, waterH),
      Math.max(3, inner * 0.14),
      Math.max(0, waterH - 14),
      '#36bdb8',
      2,
    );
    const wave = [];
    for (let k = 0; k <= 12; k++)
      wave.push([
        x + pad + 1 + ((inner - 2) * k) / 12,
        surface + Math.sin(k * 0.8 + time * 2) * 1.2,
      ]);
    line(g, wave, '#c3fff0', 1.6);
    for (let k = 1; k <= 9; k++)
      line(
        g,
        [
          [x + w - pad - 6, y + h - 10 - ((h - 22) * k) / 10],
          [x + w - pad - 1, y + h - 10 - ((h - 22) * k) / 10],
        ],
        '#9acbc5',
        0.7,
        90,
      );
    const threshold =
      tank.kind === 'crate' ? tank.switchAt : tank.kind === 'boat' ? tank.exitAt : null;
    if (threshold !== null) {
      const yy = y + h - 10 - ((h - 22) * threshold) / 10;
      for (let xx = x + pad; xx < x + w - pad; xx += 9)
        line(
          g,
          [
            [xx, yy],
            [Math.min(xx + 5, x + w - pad), yy],
          ],
          C.gold,
          2,
        );
      if (tank.kind === 'boat')
        poly(
          g,
          [
            [x + w - 9, yy],
            [x + w - 9, yy - 11],
            [x + w + 1, yy - 8],
            [x + w - 9, yy - 5],
          ],
          C.gold,
        );
    }
    if (preview !== null) {
      const yy = y + h - 10 - ((h - 22) * preview) / 10;
      for (let xx = x + pad; xx < x + w - pad; xx += 8)
        line(
          g,
          [
            [xx, yy],
            [Math.min(xx + 4, x + w - pad), yy],
          ],
          '#ffffff',
          2,
        );
    }
    const scale = Math.min(1, w / 64);
    const platformY =
      tank.kind === 'crate' ? y + h - 10 - ((h - 22) * tank.switchAt) / 10 : y + h - 12;
    const objY = Math.max(y + 32 * scale, Math.min(platformY, surface));
    if (tank.kind === 'crate') crate(g, x + w / 2, objY, scale);
    if (tank.kind === 'boat') boat(g, x + w / 2, objY - 2, scale);
    rect(g, x - 2, y - 3, w + 4, 9, C.gold, 4, '#ffe2a6', 1);
    rect(g, x - 2, y + h - 6, w + 4, 12, '#b88d54', 3, '#f1d39a', 1);
    for (const xx of [x + 4, x + w - 4]) circle(g, xx, y + h, 2.2, '#ffe5aa');
    line(
      g,
      [
        [x + pad + 1, y + 12],
        [x + pad + 1, y + h - 18],
      ],
      '#b2e8df',
      1.2,
      120,
    );
    if (tank.kind === 'crate') {
      rect(
        g,
        x + w * 0.2,
        platformY + 1,
        w * 0.6,
        5,
        state.latched.includes(tank.id) ? '#b8f5ca' : '#9d8556',
        2,
      );
      circle(
        g,
        x + w * 0.7,
        platformY + 3,
        2.5,
        state.latched.includes(tank.id) ? '#e3ffe3' : '#de9860',
      );
    }
  }
  function station(
    parent,
    level,
    state,
    layout,
    values,
    preview,
    time = 0,
    interactive = true,
    reuse = null,
  ) {
    const g = reuse || graphics(parent);
    for (const v of [...layout.valves].sort(
      (a, b) => Number(a.id === model?.selectedGate) - Number(b.id === model?.selectedGate),
    )) {
      const active = state.gates[level.gates.findIndex((a) => a.id === v.id)];
      const pts = [
        [v.fromX, layout.tankBottom + 5],
        [v.fromX, v.railY],
        [v.x - 17, v.railY],
        [v.x - 17, v.y],
        [v.x + 17, v.y],
        [v.x + 17, v.railY],
        [v.toX, v.railY],
        [v.toX, layout.tankBottom + 5],
      ];
      line(g, pts, '#2b3028', 11);
      line(g, pts, active ? '#6da994' : '#a18358', 7);
      line(
        g,
        pts,
        model?.selectedGate === v.id ? C.text : active ? '#b2f2d1' : '#dec08a',
        model?.selectedGate === v.id ? 4 : 2,
      );
    }
    level.overflow?.forEach((o, i) => {
      const a = layout.tanks.find((t) => t.id === o.from),
        b = layout.tanks.find((t) => t.id === o.to);
      const yy = layout.tankTop - 15 - i * 8;
      line(
        g,
        [
          [a.x + a.width - 6, a.y + a.height * (1 - o.at / 10)],
          [a.x + a.width - 6, yy],
          [b.x + b.width / 2, yy],
          [b.x + b.width / 2, b.y + 8],
        ],
        model?.selectedGate === `overflow:${i}` ? C.text : '#a7cab2',
        model?.selectedGate === `overflow:${i}` ? 5 : 3,
      );
      poly(
        g,
        [
          [b.x + b.width / 2 - 4, b.y + 2],
          [b.x + b.width / 2 + 4, b.y + 2],
          [b.x + b.width / 2, b.y + 8],
        ],
        C.mint,
      );
    });
    layout.tanks.forEach((t, i) => {
      tank(g, t, values[i], level.tanks[i], state, i, preview?.volumes[i] ?? null, time);
      const selected = level.gates.find((g) => g.id === model?.selectedGate),
        overflow = level.overflow?.[Number(String(model?.selectedGate).split(':')[1])];
      if (
        (selected && (selected.a === level.tanks[i].id || selected.b === level.tanks[i].id)) ||
        (overflow && (overflow.from === level.tanks[i].id || overflow.to === level.tanks[i].id))
      ) {
        line(
          g,
          [
            [t.x - 3, t.y + 9],
            [t.x - 3, t.y + t.height - 9],
          ],
          C.mint,
          3,
        );
        line(
          g,
          [
            [t.x + t.width + 3, t.y + 9],
            [t.x + t.width + 3, t.y + t.height - 9],
          ],
          C.mint,
          3,
        );
      }
    });
    layout.valves.forEach((v, i) =>
      wheel(
        g,
        v.x,
        v.y,
        state.gates[i],
        isGateLocked(level, state, level.gates[i]),
        model?.selectedGate === v.id,
        state.gates[i] ? Math.PI / 4 : 0,
      ),
    );
    return g;
  }
  function background() {
    if (bgNode) bgNode.destroy();
    bgResources.forEach((a) => a.destroy());
    bgResources = [];
    bgNode = node(root, 'Harbor');
    bgNode.setPosition(-W / 2, H / 2);
    const img = new ImageAsset(harborTexture(W, H)),
      texture = new Texture2D(),
      sf = new SpriteFrame();
    texture.image = img;
    sf.texture = texture;
    bgResources = [sf, texture, img];
    const n = node(bgNode);
    n.setPosition(W / 2, -H / 2);
    n.getComponent(UITransform).setContentSize(W, H);
    const s = n.addComponent(Sprite);
    s.spriteFrame = sf;
    s.sizeMode = Sprite.SizeMode.CUSTOM;
  }
  function hero(parent, x, y, w, h) {
    const level = LEVELS[0],
      state = { volumes: [6.8, 3.3, 4.6], gates: [false, false], latched: [] };
    const gap = w * 0.07,
      tw = (w - gap * 2) / 3;
    const layout = {
      tankTop: y,
      tankBottom: y + h - 70,
      tanks: level.tanks.map((t, i) => ({ x: x + i * (tw + gap), y, width: tw, height: h - 70 })),
      valves: [
        {
          id: 'AB',
          x: x + w * 0.34,
          y: y + h - 26,
          fromX: x + tw / 2,
          toX: x + tw * 1.5 + gap,
          railY: y + h - 46,
        },
        {
          id: 'BC',
          x: x + w * 0.72,
          y: y + h - 26,
          fromX: x + tw * 1.5 + gap,
          toX: x + tw * 2.5 + gap * 2,
          railY: y + h - 38,
        },
      ],
    };
    station(parent, level, state, layout, state.volumes, null, 0, false);
  }
  function begin(m) {
    model = m;
    W = runtime.width;
    H = runtime.height;
    screenNode?.destroy();
    screenNode = node(root, m.screen);
    screenNode.setPosition(-W / 2, H / 2);
    access.replaceChildren();
    hits = [];
    board = null;
    waterGraphics = null;
    waterLabels = [];
    document.body.dataset.screen = m.screen;
  }
  function home(m) {
    const wide = W > H * 1.25;
    const center = wide ? W * 0.3 : W / 2,
      contentWidth = wide ? W * 0.48 : W - 48;
    const top = wide ? 20 : H < 680 ? 24 : Math.max(34, H * 0.055);
    text(screenNode, 'W A T E R L I N E   S T A T I O N', center, top, 10, C.mint, contentWidth);
    text(
      screenNode,
      '水位联动站',
      center,
      top + 48,
      wide ? 36 : Math.min(40, W * 0.103),
      C.mint,
      contentWidth,
      true,
    );
    if (!wide)
      text(screenNode, '让每一滴水，找到归途', center, top + 87, 13, C.muted, contentWidth);
    if (wide) hero(screenNode, W * 0.59, 66, W * 0.35, H - 85);
    else hero(screenNode, 40, top + 115, W - 80, Math.max(150, H - 251 - (top + 115) - 35));
    const base = wide ? Math.max(104, H - 222) : H - 251;
    const chapter = LEVELS[m.progress.selected].chapter.replace(/^\d+\s*·\s*/, '');
    text(
      screenNode,
      'CHAPTER ' + String(Math.floor(m.progress.selected / 10) + 1).padStart(2, '0'),
      center,
      base,
      10,
      C.muted,
      contentWidth,
    );
    text(screenNode, chapter, center, base + 29, 25, C.text, contentWidth);
    if (!wide)
      text(
        screenNode,
        `${Object.keys(m.progress.best).length} / 50  站已抵达`,
        center,
        base + 57,
        12,
        C.muted,
        contentWidth,
      );
    const bw = Math.min(contentWidth, 330),
      bx = center - bw / 2;
    button(
      'start',
      m.challenge ? '开始好友挑战' : '继续调度  →',
      bx,
      base + (wide ? 58 : 80),
      bw,
      51,
      'start',
      { primary: true },
    );
    button('levels-button', '航线选关', bx, base + (wide ? 118 : 142), bw, 48, 'levels');
    if (!wide) {
      button('help', '帮助', center - 114, H - 52, 104, 44, 'help', { small: true });
      button('settings', '设置', center + 10, H - 52, 104, 44, 'settings', { small: true });
    } else {
      button('help', '帮助', W - 112, 10, 44, 44, 'help', { small: true });
      button('settings', '设置', W - 60, 10, 44, 44, 'settings', { icon: 'settings' });
    }
  }
  function levels(m) {
    header('航线选关');
    const wide = W > H * 1.25;
    const titleY = wide ? 92 : 106;
    const chapter = LEVELS[m.chapter * 10].chapter.replace(/^\d+\s*·\s*/, '');
    text(
      screenNode,
      `CHAPTER ${String(m.chapter + 1).padStart(2, '0')}`,
      W / 2,
      titleY - 15,
      10,
      C.mint,
    );
    text(screenNode, chapter, W / 2, titleY + 16, 27, C.text, W - 135, true);
    button('chapter-prev', '上一章', 18, titleY - 19, 46, 46, 'chapter-prev', {
      icon: 'back',
      disabled: m.chapter === 0,
    });
    button('chapter-next', '下一章', W - 64, titleY - 19, 46, 46, 'chapter-next', {
      icon: 'next',
      disabled: m.chapter === 4,
    });
    const cols = wide ? 5 : 2,
      rows = wide ? 2 : 5,
      gap = 12,
      startY = wide ? 145 : 175,
      cellW = (W - 40 - gap * (cols - 1)) / cols,
      cellH = Math.max(51, Math.min(wide ? 78 : 91, (H - startY - 62 - gap * (rows - 1)) / rows));
    const unlocked = unlockedThrough(m.progress, LEVELS);
    for (let j = 0; j < 10; j++) {
      const i = m.chapter * 10 + j,
        l = LEVELS[i],
        x = 20 + (j % cols) * (cellW + gap),
        y = startY + Math.floor(j / cols) * (cellH + gap);
      const locked = i > unlocked && !m.dev;
      const current = i === m.progress.selected;
      button(
        'level-' + i,
        `第 ${i + 1} 站${locked ? ' · 未解锁' : ''}`,
        x,
        y,
        cellW,
        cellH,
        'level:' + i,
        { disabled: locked, primary: current, data: { levelIndex: String(i) } },
      );
      const g = graphics(screenNode);
      rect(g, x + 4, y + 4, cellW - 8, cellH - 8, current ? C.text : C.ink, 12);
      text(
        screenNode,
        String(i + 1).padStart(2, '0'),
        x + cellW / 2,
        y + cellH * 0.35,
        24,
        current ? C.ink : locked ? '#5d7d85' : C.text,
        cellW - 10,
        true,
      );
      const stars = starCount(l, m.progress.best[l.id]);
      if (locked) icon(g, 'lock', x + cellW / 2, y + cellH * 0.75, '#67858c');
      else if (stars)
        for (let k = 0; k < 3; k++)
          icon(
            g,
            'star',
            x + cellW / 2 + (k - 1) * 22,
            y + cellH * 0.76,
            k < stars ? C.gold : '#355762',
          );
      else
        text(
          screenNode,
          current ? '继续航行' : m.dev && i > unlocked ? '开发试玩' : '准备启航',
          x + cellW / 2,
          y + cellH * 0.77,
          11,
          current ? C.ink : C.muted,
          cellW - 10,
        );
    }
    text(screenNode, `${m.chapter + 1} / 5  章节`, W / 2, H - 26, 12, C.muted);
  }
  function playing(m) {
    const l = LEVELS[m.levelIndex];
    board = getBoardLayout(l, W, H);
    const wide = board.wide;
    header(
      `第 ${String(m.levelIndex + 1).padStart(2, '0')} 站 · ${l.title}`,
      m.challenge ? 'exit-challenge' : 'home',
      m.challenge ? 'exit-challenge' : 'back-home',
    );
    button('pause', '暂停', W - 62, 14, 46, 46, 'pause', { icon: 'pause' });
    const statX = wide ? W * 0.66 : 20,
      statW = wide ? W * 0.31 : W - 40,
      statY = wide ? 77 : 78;
    decor(screenNode, statX, statY, statW, wide ? 73 : 61);
    const remain = l.maxMoves + (m.state.bonusMoves || 0) - m.state.moves;
    text(
      screenNode,
      `${remain} 步`,
      statX + statW * 0.22,
      statY + 23,
      24,
      remain <= 1 ? C.orange : C.text,
      statW * 0.4,
      true,
    );
    text(screenNode, '剩余操作', statX + statW * 0.22, statY + 45, 10, C.muted, statW * 0.4);
    text(
      screenNode,
      m.challenge
        ? `好友目标 ${m.targetMoves ?? '—'} 步`
        : m.practice
          ? '开发试玩 · 不计成绩'
          : `三星目标 ${l.par} 步`,
      statX + statW * 0.69,
      statY + 23,
      12,
      C.mint,
      statW * 0.58,
    );
    text(
      screenNode,
      `${m.state.moves} 次已用`,
      statX + statW * 0.69,
      statY + 45,
      11,
      C.muted,
      statW * 0.58,
    );
    const objectives = getObjectives(l, m.state);
    const targetText = objectives
      .map(
        (o) =>
          `${o.done ? '✓' : '○'} ${o.id.startsWith('switch') ? o.id.slice(-1) + '落箱' : o.id.startsWith('boat') ? o.id.slice(-1) + '到港' : `动力 ${m.state.wheelPower.toFixed(1)}/${o.target}`}`,
      )
      .join('   ');
    text(
      screenNode,
      targetText,
      wide ? statX + statW / 2 : W / 2,
      wide ? 173 : 158,
      11,
      C.mint,
      wide ? statW : W - 22,
    );
    sceneNode = node(screenNode, 'water-station');
    waterGraphics = station(sceneNode, l, m.state, board, m.displayed, m.preview, m.time);
    board.tanks.forEach((t, i) => {
      waterLabels.push(
        text(
          screenNode,
          `${l.tanks[i].id} · ${m.displayed[i].toFixed(1)}`,
          t.x + t.width / 2,
          t.y - 18,
          l.tanks.length > 3 ? 11 : 13,
          C.text,
          t.width + 8,
          true,
        ),
      );
    });
    board.valves.forEach((v, i) => {
      const gate = l.gates[i],
        locked = isGateLocked(l, m.state, gate);
      text(
        screenNode,
        `${gate.a}—${gate.b} · ${locked ? '锁定' : m.state.gates[i] ? '开' : '关'}`,
        v.x,
        v.y + 35,
        11,
        locked ? C.muted : C.text,
        100,
      );
      hit(
        'gate-' + v.id,
        `${gate.a}—${gate.b} 阀门${locked ? '，已锁定' : m.state.gates[i] ? '，打开' : '，关闭'}`,
        v.x - 25,
        v.y - 25,
        50,
        50,
        'gate:' + v.id,
        m.animating,
        { gate: v.id },
      );
    });
    if (wide) {
      text(screenNode, m.message, statX + statW / 2, H - 14, 10, C.muted, statW - 4);
      const w = (statW - 12) / 2;
      button('undo', '撤销', statX, H - 141, w, 48, 'undo', { disabled: !m.historyLength });
      button(
        'predict',
        m.prediction ? '退出预测' : '预测',
        statX + w + 12,
        H - 141,
        w,
        48,
        'predict',
        { primary: m.prediction },
      );
      button('hint', '提示', statX, H - 81, w, 48, 'hint');
      button('restart', '重来', statX + w + 12, H - 81, w, 48, 'restart');
    } else {
      text(screenNode, m.message, W / 2, H - 109, 12, C.muted, W - 35);
      const bw = (W - 56) / 3;
      button('undo', '撤销', 16, H - 72, bw, 53, 'undo', { disabled: !m.historyLength });
      button('predict', m.prediction ? '退出预测' : '预测', 28 + bw, H - 72, bw, 53, 'predict', {
        primary: m.prediction,
      });
      button('hint', '提示', 40 + bw * 2, H - 72, bw, 53, 'hint');
    }
  }
  function menu(m) {
    const wide = W > H * 1.25,
      cx = W / 2,
      bw = Math.min(W - 60, 340);
    header(
      m.screen === 'paused' ? '调度暂停' : m.screen === 'help' ? '调度手册' : '设置',
      m.returnScreen || 'home',
    );
    const y = wide ? 73 : Math.max(125, H * 0.22);
    if (m.screen === 'paused') {
      text(screenNode, '港口等你回来', cx, y, 29, C.mint, bw, true);
      text(screenNode, '当前水位与操作进度已保留', cx, y + 43, 13, C.muted, bw);
      button('resume', '继续调度', cx - bw / 2, y + (wide ? 62 : 81), bw, 52, 'resume', {
        primary: true,
      });
      button('restart', '重新开始', cx - bw / 2, y + (wide ? 124 : 145), bw, 48, 'restart');
      button('pause-home', '返回主页', cx - bw / 2, y + (wide ? 182 : 205), bw, 48, 'home');
    }
    if (m.screen === 'settings') {
      text(screenNode, '听见水流的声音', cx, y, 27, C.mint, bw, true);
      button(
        'sound',
        `音效：${m.progress.sound ? '开启' : '关闭'}`,
        cx - bw / 2,
        y + 64,
        bw,
        55,
        'sound',
        { primary: m.progress.sound },
      );
      text(
        screenNode,
        '设置会保存在当前设备\n尊重系统“减弱动态”偏好',
        cx,
        y + 162,
        14,
        C.muted,
        bw,
      );
    }
    if (m.screen === 'help') {
      const lines = [
        '01  点阀门，连通或隔离水槽',
        '02  降低箱子水位，点亮机关',
        '03  抬高小船，让它抵达金色出口线',
        '04  溢流水量推动水轮，机关解锁新阀',
        '预测：先看虚线，再点同一阀门确认',
        '撤销会恢复水量、机关和水轮动力',
      ];
      const size = wide ? 14 : 15;
      lines.forEach((s, i) =>
        text(screenNode, s, cx, y + i * (wide ? 28 : 43), size, i < 4 ? C.text : C.muted, bw),
      );
      text(
        screenNode,
        '键盘：1–4 阀门 · Z 撤销 · P 预测 · H 提示 · R 重来',
        cx,
        Math.min(H - 40, y + (wide ? 190 : 290)),
        10,
        C.muted,
        W - 40,
      );
    }
  }
  function result(m) {
    const l = LEVELS[m.levelIndex],
      won = m.state.won;
    const wide = W > H * 1.25,
      cx = wide ? W * 0.34 : W / 2,
      bw = Math.min(wide ? W * 0.5 : W - 50, 340),
      y = wide ? 27 : Math.max(65, H * 0.11);
    text(screenNode, won ? 'STATION COMPLETE' : 'ONE MORE TRY', cx, y, 11, C.mint, bw);
    text(screenNode, won ? '小船到港了' : '再试一道闸门', cx, y + 43, 34, C.text, bw, true);
    const g = graphics(screenNode);
    if (won) {
      const stars = starCount(l, m.state.moves);
      for (let i = 0; i < 3; i++)
        icon(g, 'star', cx + (i - 1) * 37, y + 88, i < stars ? C.gold : '#53716e');
    } else text(screenNode, '操作次数用完了，可以撤销或加一步', cx, y + 87, 12, C.muted, bw);
    text(screenNode, `第 ${m.levelIndex + 1} 站 · ${l.title}`, cx, y + 126, 17, C.mint, bw);
    text(
      screenNode,
      `${m.state.moves} 次操作  /  三星目标 ${l.par} 次${m.assisted ? '\n辅助通关' : m.practice ? '\n开发试玩 · 不记入进度' : ''}`,
      cx,
      y + (wide ? 139 : 162),
      13,
      C.muted,
      bw,
    );
    const start = wide ? H - 120 : y + 220;
    const first = won ? '下一站  →' : !m.extraClaimed ? '免费加一步' : '撤销一步';
    button(
      won ? 'next-level' : !m.extraClaimed ? 'extra-move' : 'undo',
      first,
      cx - bw / 2,
      start,
      bw,
      51,
      won ? 'next' : !m.extraClaimed ? 'extra' : 'undo',
      { primary: true, disabled: won && m.levelIndex === LEVELS.length - 1 },
    );
    if (wide) {
      hero(screenNode, W * 0.65, 55, W * 0.29, H - 80);
      button('result-retry', '再试一次', cx - bw / 2, start + 61, (bw - 12) / 2, 47, 'restart');
      button('result-home', '返回主页', cx + 6, start + 61, (bw - 12) / 2, 47, 'home');
    } else {
      button('result-retry', '再试一次', cx - bw / 2, start + 63, (bw - 12) / 2, 48, 'restart');
      button('result-home', '返回主页', cx + 6, start + 63, (bw - 12) / 2, 48, 'home');
      if (won) {
        button('share-result', '邀请好友', cx - bw / 2, start + 124, (bw - 12) / 2, 48, 'share');
        button('result-undo', '撤销末步', cx + 6, start + 124, (bw - 12) / 2, 48, 'undo');
      } else if (!m.extraClaimed && m.historyLength)
        button('undo', '撤销一步', cx - bw / 2, start + 124, bw, 48, 'undo');
      text(
        screenNode,
        m.shareStatus || '每一次调度，都离答案更近一步',
        cx,
        Math.min(H - 40, start + 199),
        12,
        C.muted,
        bw,
      );
    }
    if (wide && won) {
      button('share-result', '分享', W - 186, 10, 64, 44, 'share', { small: true });
      button('result-undo', '撤销末步', W - 104, H - 54, 88, 44, 'undo', { small: true });
    }
    if (m.challenge)
      button('result-exit-challenge', '退出挑战', W - 112, 10, 96, 44, 'exit-challenge', {
        small: true,
      });
  }
  function render(m) {
    begin(m);
    if (m.screen === 'home') home(m);
    else if (m.screen === 'levels') levels(m);
    else if (m.screen === 'playing') playing(m);
    else if (m.screen === 'result') result(m);
    else menu(m);
  }
  background();
  return {
    render,
    get layout() {
      return board;
    },
    get hits() {
      return hits.map(({ action, ...h }) => ({ ...h }));
    },
    hit(x, y) {
      const h = [...hits]
        .reverse()
        .find(
          (h) => !h.disabled && x >= h.x && x <= h.x + h.width && y >= h.y && y <= h.y + h.height,
        );
      if (h) return h;
      if (board && model.screen === 'playing') {
        const outlet = LEVELS[model.levelIndex].overflow?.findIndex((o, i) => {
          const a = board.tanks.find((t) => t.id === o.from),
            b = board.tanks.find((t) => t.id === o.to);
          return (
            Math.abs(y - (board.tankTop - 15 - i * 8)) < 7 &&
            x >= Math.min(a.x + a.width - 6, b.x + b.width / 2) &&
            x <= Math.max(a.x + a.width - 6, b.x + b.width / 2)
          );
        });
        if (outlet >= 0)
          return { id: 'pipe-overflow:' + outlet, action: 'focus:overflow:' + outlet };
        const pipe = board.valves.find(
          (v) =>
            Math.abs(y - v.railY) < 7 &&
            x >= Math.min(v.fromX, v.toX) &&
            x <= Math.max(v.fromX, v.toX),
        );
        if (pipe) return { id: 'pipe-' + pipe.id, action: 'focus:' + pipe.id };
      }
      return null;
    },
    update(m) {
      if (!waterGraphics || m.screen !== 'playing') return;
      waterGraphics.clear();
      station(
        sceneNode,
        LEVELS[m.levelIndex],
        m.state,
        board,
        m.displayed,
        m.preview,
        m.time,
        true,
        waterGraphics,
      );
      waterLabels.forEach(
        (l, i) => (l.string = `${LEVELS[m.levelIndex].tanks[i].id} · ${m.displayed[i].toFixed(1)}`),
      );
    },
    resize() {
      W = runtime.width;
      H = runtime.height;
      background();
    },
    dispose() {
      screenNode?.destroy();
      bgNode?.destroy();
      bgResources.forEach((a) => a.destroy());
      access.replaceChildren();
    },
  };
}
