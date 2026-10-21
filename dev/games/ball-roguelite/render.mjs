import { glassTexture, backgroundTexture, panelTexture, shardTexture } from './src/art.mjs';
import {
  FIELD,
  PHYSICS,
  WIDTH,
  HEIGHT,
  brickCenter,
  targetProfile,
  aimDirection,
} from './core.mjs';
import { LEVELS, UPGRADES } from './levels.mjs';
const TAU = Math.PI * 2;
const C = {
  ink: '#111a50',
  panel: '#20245c',
  mint: '#72f4ff',
  text: '#e9f9f7',
  muted: '#bcc8ee',
  rose: '#f497ae',
  gold: '#ffda7b',
  purple: '#cd9aff',
};
export function createView(cc, root, dimensions, actions) {
  const {
    Node,
    UITransform,
    Sprite,
    SpriteFrame,
    Texture2D,
    ImageAsset,
    Label,
    Graphics,
    Color,
    UIOpacity,
  } = cc;
  let W = 390,
    H = dimensions.height,
    scale = dimensions.scale,
    board,
    screen = 'home',
    menu,
    section,
    effects = [],
    targetNodes = new Map(),
    ballNodes = new Map(),
    time = 0;
  let shards = [],
    collectorPulse = 0;
  const spareShards = [];
  const stats = { shatters: 0, absorptions: 0, returns: 0, recalls: 0, maxShards: 0 };
  const textures = new Map(),
    cleanup = [],
    hud = {},
    hero = [];
  const access = document.getElementById('accessibility');
  const color = (hex, alpha = 255) => {
    const n = parseInt(hex.slice(1), 16);
    return new Color((n >> 16) & 255, (n >> 8) & 255, n & 255, alpha);
  };
  function node(parent = root, name = 'visual') {
    const n = new Node(name);
    n.layer = cc.Layers.Enum.UI_2D;
    n.addComponent(UITransform);
    parent.addChild(n);
    return n;
  }
  function frame(key, bake) {
    if (textures.has(key)) return textures.get(key);
    const image = new ImageAsset(bake()),
      texture = new Texture2D();
    texture.image = image;
    const result = new SpriteFrame();
    result.texture = texture;
    textures.set(key, result);
    cleanup.push(result, texture, image);
    return result;
  }
  function sprite(parent, sf, x, y, w, h = w, sliced = false) {
    const n = node(parent);
    n.setPosition(x, -y);
    const s = n.addComponent(Sprite);
    s.spriteFrame = sf;
    s.sizeMode = Sprite.SizeMode.CUSTOM;
    if (sliced) {
      s.type = Sprite.Type.SLICED;
      sf.insetLeft = sf.insetRight = sf.insetTop = sf.insetBottom = 28;
    }
    n.getComponent(UITransform).setContentSize(w, h);
    return n;
  }
  function panel(parent, x, y, w, h, fill = C.panel, border = '#315365') {
    return sprite(
      parent,
      frame(`panel:${fill}:${border}`, () => panelTexture(fill, border)),
      x + w / 2,
      y + h / 2,
      w,
      h,
      true,
    );
  }
  function text(parent, value, x, y, size = 16, tint = C.text, width = 340, align = 'center') {
    const n = node(parent, String(value).slice(0, 20));
    n.setPosition(x, -y);
    n.getComponent(UITransform).setContentSize(
      width,
      Math.max(size * 2.7, String(value).split('\n').length * size * 1.45 + 4),
    );
    const label = n.addComponent(Label);
    label.string = String(value);
    label.fontSize = size;
    label.lineHeight = size * 1.45;
    label.color = color(tint);
    label.horizontalAlign =
      align === 'left' ? Label.HorizontalAlign.LEFT : Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    label.enableWrapText = true;
    label.fontFamily = 'sans-serif';
    label.isBold = size >= 20;
    return label;
  }
  function graphics(parent) {
    return node(parent).addComponent(Graphics);
  }
  function line(g, points, tint = C.mint, width = 1, alpha = 255) {
    if (!points.length) return;
    g.strokeColor = color(tint, alpha);
    g.lineWidth = width;
    g.moveTo(points[0].x, -points[0].y);
    points.slice(1).forEach((p) => g.lineTo(p.x, -p.y));
    g.stroke();
  }
  function circle(g, x, y, r, tint, alpha = 255, width = 1, fill = false) {
    g.lineWidth = width;
    g.strokeColor = g.fillColor = color(tint, alpha);
    g.circle(x, -y, r);
    if (fill) g.fill();
    else g.stroke();
  }
  function orb(parent, x, y, radius, profile = {}) {
    const {
      color: tint = C.mint,
      material = 'glass',
      shape = 'circle',
      opacity = 0.75,
      rotation = Math.PI / 6,
    } = profile;
    const p = { color: tint, material, shape, opacity, rotation };
    return sprite(
      parent,
      frame(JSON.stringify(p), () => glassTexture(p)),
      x,
      y,
      (radius * 2 * 192) / 168,
    );
  }
  const origin = node(root, 'TopLeft');
  const backdrop = node(origin, 'Backdrop'),
    homeArt = node(origin, 'Home orbits'),
    arena = node(origin, 'Arena'),
    arenaStatic = graphics(arena),
    trail = graphics(arena),
    targets = node(arena),
    projectiles = node(arena),
    fx = graphics(arena),
    overlay = node(origin, 'Interface');
  const launcher = orb(projectiles, 195, FIELD.floor - FIELD.radius, FIELD.radius + 1);
  const aimGraphic = graphics(arena);
  const collector = graphics(arena);
  const fragmentRoot = node(arena, 'Glass fragments');
  const arenaAccess = document.createElement('div');
  arenaAccess.id = 'arena';
  arenaAccess.setAttribute('aria-label', '弹珠场地：按住拖动瞄准，松手发射');
  arenaAccess.setAttribute('role', 'application');
  arenaAccess.className = 'arena-access';
  access.append(arenaAccess);
  function setDimensions(d) {
    H = d.height;
    scale = d.scale;
    origin.setPosition(-W / 2, H / 2);
    access.style.width = `${W}px`;
    access.style.height = `${H}px`;
    access.style.transform = `scale(${scale})`;
    board = { scale: Math.min(1, (H - 184) / HEIGHT), y: 92 };
    board.x = (W - WIDTH * board.scale) / 2;
    arena.setPosition(board.x, -board.y);
    arena.setScale(board.scale, board.scale, 1);
    Object.assign(arenaAccess.style, {
      left: `${board.x}px`,
      top: `${board.y}px`,
      width: `${WIDTH * board.scale}px`,
      height: `${HEIGHT * board.scale}px`,
    });
    backdrop.children.slice().forEach((n) => n.destroy());
    sprite(
      backdrop,
      frame('background', () => backgroundTexture(W, 844)),
      W / 2,
      H / 2,
      W,
      H,
    );
    arenaStatic.clear();
    arenaStatic.fillColor = color('#101944', 185);
    arenaStatic.roundRect(
      FIELD.left,
      -FIELD.floor,
      FIELD.right - FIELD.left,
      FIELD.floor - FIELD.top,
      8,
    );
    arenaStatic.fill();
    const wall = [
      { x: FIELD.left, y: FIELD.floor },
      { x: FIELD.left, y: FIELD.top },
      { x: FIELD.right, y: FIELD.top },
      { x: FIELD.right, y: FIELD.floor },
    ];
    line(arenaStatic, wall, C.purple, 7, 60);
    line(arenaStatic, wall, C.mint, 2, 235);
    line(
      arenaStatic,
      [
        { x: FIELD.left, y: FIELD.floor },
        { x: FIELD.right, y: FIELD.floor },
      ],
      C.purple,
      2,
      160,
    );
    for (let x = FIELD.left; x < FIELD.right; x += 14)
      line(
        arenaStatic,
        [
          { x, y: 557 },
          { x: x + 7, y: 557 },
        ],
        C.rose,
        1.3,
        155,
      );
    for (let c = 0; c < 7; c++)
      for (let r = 0; r < 10; r++)
        circle(
          arenaStatic,
          FIELD.left + c * 50 + 25,
          FIELD.top + r * 50 + 25,
          0.7,
          '#9bc2cd',
          35,
          1,
          true,
        );
  }
  function begin(name, battle = false) {
    screen = name;
    document.body.dataset.screen = name;
    if (menu) menu.destroy();
    if (section) section.remove();
    menu = node(overlay, name);
    section = document.createElement('section');
    section.id = name;
    section.className = 'semantic-screen';
    access.append(section);
    arena.active = battle;
    arenaAccess.hidden = !battle;
    homeArt.active = name === 'home';
    if (!['settings', 'help', 'confirm'].includes(name))
      button('settings-button', '', W - touch() - 16, 14, touch(), touch(), 'settings', {
        icon: 'settings',
        aria: '设置',
      });
  }
  function semantic(id, value, x, y, width, height, tag = 'span') {
    const el = document.createElement(tag);
    if (id) el.id = id;
    el.textContent = value;
    Object.assign(el.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
    section.append(el);
    return el;
  }
  function label(id, value, x, y, size = 16, tint = C.text, width = 340) {
    const l = text(menu, value, x, y, size, tint, width);
    if (id) {
      const el = semantic(id, value, x - width / 2, y - size, width, size * 2);
      hud[id] = { label: l, el };
    }
    return l;
  }
  function button(
    id,
    value,
    x,
    y,
    w,
    h,
    action,
    { primary = false, disabled = false, tint = null, data = {}, aria = value, icon = null } = {},
  ) {
    const n = panel(
      menu,
      x,
      y,
      w,
      h,
      primary ? '#ffcf68' : '#262565',
      primary ? '#fff4c0' : '#727be1',
    );
    n.name = `Button ${id || value}`;
    if (disabled) n.addComponent(UIOpacity).opacity = 100;
    if (icon === 'pause') {
      const g = graphics(menu);
      g.fillColor = color(C.text);
      for (const bx of [x + w / 2 - 7, x + w / 2 + 3]) {
        g.rect(bx, -y - h / 2 - 8, 4, 16);
        g.fill();
      }
    } else if (icon === 'settings') {
      const g = graphics(menu),
        cx = x + w / 2,
        cy = y + h / 2;
      circle(g, cx, cy, 10, C.text, 255, 2);
      circle(g, cx, cy, 4, C.text, 255, 2);
      for (let i = 0; i < 8; i++) {
        const a = (i * TAU) / 8;
        line(
          g,
          [
            { x: cx + Math.cos(a) * 10, y: cy + Math.sin(a) * 10 },
            { x: cx + Math.cos(a) * 14, y: cy + Math.sin(a) * 14 },
          ],
          C.text,
          3,
        );
      }
    } else if (icon === 'back') {
      const g = graphics(menu);
      line(
        g,
        [
          { x: x + w * 0.58, y: y + h * 0.3 },
          { x: x + w * 0.38, y: y + h * 0.5 },
          { x: x + w * 0.58, y: y + h * 0.7 },
        ],
        C.text,
        3,
      );
    } else
      text(
        menu,
        value,
        x + w / 2,
        y + h / 2,
        h > 90 ? 15 : 16,
        tint || (primary ? '#33245c' : disabled ? '#607a8b' : C.text),
        w - 20,
      );
    const b = n.addComponent(cc.Button);
    b.interactable = !disabled;
    const handler = () => {
      if (!disabled) actions.activate(action);
    };
    n.on(cc.Button.EventType.CLICK, handler);
    const el = semantic(id, value, x, y, w, h, 'button');
    el.disabled = disabled;
    el.setAttribute('aria-label', aria);
    for (const [key, v] of Object.entries(data)) el.dataset[key] = v;
    el.addEventListener('click', () => {
      if (!el.disabled) n.emit(cc.Button.EventType.CLICK);
    });
    el.addEventListener('focus', () => {
      if (n.isValid) n.setScale(1.025, 1.025, 1);
    });
    el.addEventListener('blur', () => {
      if (n.isValid) n.setScale(1, 1, 1);
    });
    return el;
  }
  function smallTitle(kicker, title, subtitle, at = 130) {
    label(null, kicker, 195, at - 40, 11, C.mint);
    label(null, title, 195, at, 30);
    if (subtitle) label(null, subtitle, 195, at + 42, 13, C.muted);
  }
  const touch = () => Math.max(48, 44 / scale);
  function backButton(action = 'leave', id = 'back-home') {
    return button(id, '', 16, 14, touch(), touch(), action, { icon: 'back', aria: '返回退出' });
  }
  function modal(height, tint = C.purple) {
    const top = (H - height) / 2;
    panel(menu, 9, top - 6, 372, height + 12, '#111638aa', '#c28aff55');
    panel(menu, 15, top, 360, height, '#25205bea', tint);
    const el = semantic('choice-panel', '', 15, top, 360, height);
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    return top;
  }
  function home(data, saved, challenge) {
    begin('home');
    homeArt.children.slice().forEach((n) => n.destroy());
    hero.length = 0;
    const min = touch(),
      compact = H < 740;
    label(null, '星轨弹珠', 195, compact ? 108 : 132, 42);
    label(null, '折射 · 碎裂 · 连击', 195, compact ? 148 : 175, 13, C.mint);
    const center = H * (compact ? 0.365 : 0.405),
      g = graphics(homeArt);
    for (let j = 0; j < 3; j++)
      line(
        g,
        Array.from({ length: 81 }, (_, i) => {
          const a = (i / 80) * TAU;
          return {
            x: 195 + Math.cos(a) * (140 + j * 8),
            y: center + Math.sin(a) * (57 + j * 12) + Math.cos(a) * 35,
          };
        }),
        j === 1 ? C.gold : C.mint,
        1.5,
        155 - j * 30,
      );
    const size = compact ? 0.66 : 0.92;
    for (const [dx, dy, r, tint, shape] of [
      [-25, 10, 84, C.mint, 'circle'],
      [73, -63, 43, C.purple, 'circle'],
      [70, 78, 48, C.gold, 'circle'],
      [-100, -73, 19, '#ff9bd5', 'circle'],
      [-100, 99, 23, C.purple, 'hexagon'],
      [119, 6, 12, '#e7fff7', 'circle'],
    ]) {
      const n = orb(homeArt, 195 + dx * size, center + dy * size, r * size, { color: tint, shape });
      hero.push({ n, x: 195 + dx * size, y: center + dy * size, phase: dx });
    }
    const bottom = H - 18,
      modeH = min + 12,
      startH = min + 8,
      startY = bottom - min - 10 - modeH - 12 - startH - (challenge ? min + 8 : 0);
    label(
      'home-progress',
      saved
        ? `继续第 ${saved.turn + 1} 轮 · ${saved.levelId === 'endless' ? '无尽航行' : '星域旅程'}`
        : `${Object.keys(data.completed).length} / ${LEVELS.length} 星域已点亮`,
      195,
      startY - 20,
      12,
      C.muted,
    );
    button('start', `${saved ? '继续旅程' : '开启旅程'} →`, 24, startY, 342, startH, 'continue', {
      primary: true,
    });
    if (challenge)
      button('challenge-orbit', challenge, 24, startY + startH + 8, 342, min, 'challenge');
    button('levels-button', '星域挑战', 24, bottom - min - 10 - modeH, 165, modeH, 'levels');
    button(
      'endless-button',
      data.runs?.endless ? '继续无尽' : '无尽模式',
      201,
      bottom - min - 10 - modeH,
      165,
      modeH,
      'endless',
    );
    button('endless-new', '无尽 · 重新开局', 24, bottom - min, 342, min, 'restart-endless', {
      tint: C.gold,
    });
  }
  function levels(data, saved, unlocked, page = 0) {
    begin('levels');
    backButton('home', 'levels-home');
    const min = touch();
    label(null, '星域挑战', 195, 38, 23, C.text, 180);
    label(
      'levels-progress',
      `${Object.keys(data.completed).length} / ${LEVELS.length} 星域 · 侧面切入，绕开吸收器`,
      195,
      99,
      12,
      C.muted,
    );
    const top = saved ? 126 + min : 135;
    if (saved)
      button('campaign-continue', `继续 · 第 ${saved.turn + 1} 轮`, 24, 116, 342, min, 'campaign');
    const row = (H - top - min - 36) / 2;
    LEVELS.slice(page * 4, page * 4 + 4).forEach((level, i) => {
      const index = page * 4 + i,
        x = 24 + (i % 2) * 177,
        y = top + Math.floor(i / 2) * row,
        h = row - 10,
        enabled = unlocked(level.id),
        result = data.completed[level.id];
      const el = button(null, '', x, y, 165, h, `level:${level.id}`, {
        disabled: !enabled,
        data: { level: level.id },
        aria: `${index + 1}. ${level.title}${enabled ? '，开始关卡' : '，未解锁'}`,
      });
      el.className = 'level-card';
      orb(menu, x + 82, y + h * 0.3, Math.min(28, h * 0.22), {
        color: level.color,
        material: index > 2 ? 'absorber' : 'glass',
      });
      text(
        menu,
        `${index + 1} · ${level.title}`,
        x + 82,
        y + h * 0.61,
        14,
        enabled ? C.text : C.muted,
        155,
      );
      text(
        menu,
        result
          ? '★'.repeat(result.stars)
          : enabled
            ? level.hint || '借墙反弹 · 寻找切入角'
            : '完成前一关解锁',
        x + 82,
        y + h * 0.83,
        10,
        result ? C.gold : C.muted,
        150,
      );
    });
    button('levels-prev', '←', 24, H - min - 15, 86, min, 'levels-prev', {
      disabled: page === 0,
      aria: '上一页关卡',
    });
    label(
      'levels-page',
      `${page + 1} / ${Math.ceil(LEVELS.length / 4)}`,
      195,
      H - min / 2 - 15,
      14,
      C.text,
      130,
    );
    button('levels-next', '→', 280, H - min - 15, 86, min, 'levels-next', {
      disabled: (page + 1) * 4 >= LEVELS.length,
      aria: '下一页关卡',
    });
  }
  function battleHeader(game) {
    const min = touch();
    backButton();
    label(
      'level-name',
      game.challenge ? '好友同场' : game.level.endless ? '无尽航行' : game.level.title,
      149,
      32,
      14,
      C.text,
      140,
    );
    label(
      'wave-progress',
      `第 ${game.turn + 1} 轮${game.practice ? ' · 试玩' : ''}`,
      119,
      64,
      11,
      C.muted,
      70,
    );
    label('score', `${game.score} 分`, 189, 64, 11, C.gold, 70);
    button('pause', '', W - min * 2 - 24, 14, min, min, 'pause', {
      aria: '暂停',
      icon: 'pause',
      disabled: screen !== 'playing',
    });
  }
  function playing(game) {
    begin('playing', true);
    battleHeader(game);
    const min = touch(),
      y = H - min - 16,
      w = Math.max(72, min);
    panel(menu, 12, y - 36, 366, min + 48, '#151c55dc', '#697cd0');
    label('ball-count', `${game.count} 颗`, 49, y + min * 0.5, 20, C.mint, 66);
    label(
      'shot-hint',
      game.phase === 'recall'
        ? '星轨召回中'
        : game.phase === 'flight'
          ? '折射连击中'
          : '拖动瞄准 · 松手发射',
      195,
      y - 18,
      11,
      C.muted,
      340,
    );
    button('restart-run', '重开', W - 14 - w * 3 - 16, y, w, min, 'restart-run');
    button('supply', '补给', W - 14 - w * 2 - 8, y, w, min, 'supply', {
      disabled: ['flight', 'recall'].includes(game.phase) || game.practice || game.challenge,
      tint: C.gold,
    });
    button('recall', game.phase === 'recall' ? '归位中' : '收回', W - 14 - w, y, w, min, 'recall', {
      disabled: game.phase !== 'flight',
    });
  }
  function upgrade(game) {
    begin('upgrade', true);
    battleHeader(game);
    const sheetH = Math.min(330, Math.max(285, H * 0.41)),
      top = (H - sheetH) / 2;
    modal(sheetH, C.purple);
    label(null, '星光共鸣', 195, top + 33, 25);
    label(null, '选择一项 · 本局生效', 195, top + 62, 12, C.muted);
    const gap = 10,
      width = (342 - (game.cards.length - 1) * gap) / game.cards.length,
      cardH = sheetH - 106 - touch();
    game.cards.forEach((id, index) => {
      const card = UPGRADES.find((u) => u.id === id),
        x = 24 + index * (width + gap),
        y = top + 82;
      const el = button(null, '', x, y, width, cardH, `upgrade:${id}`, {
        data: { upgrade: id },
        aria: `${card.title}：${card.description}`,
      });
      el.className = 'upgrade-card';
      orb(menu, x + width / 2, y + cardH * 0.25, Math.min(20, cardH * 0.18), {
        color: card.color,
        shape: id === 'pierce' ? 'hexagon' : 'circle',
      });
      text(menu, card.title, x + width / 2, y + cardH * 0.52, 14, card.color, width - 10);
      text(
        menu,
        {
          extra: '每轮 +2 颗\n最多 22 颗',
          power: '伤害 +1\n最多 3 阶',
          pierce: '额外穿透 1 颗\n最多 2 颗',
          blast: '爆裂概率 +10%\n最多 30%',
          chain: '连锁概率 +12%\n最多 36%',
          critical: '暴击概率 +10%\n双倍伤害',
        }[id],
        x + width / 2,
        y + cardH * 0.78,
        11,
        C.muted,
        width - 12,
      );
    });
    button('upgrade-home', '保存离开', 24, top + sheetH - touch() - 12, 128, touch(), 'leave');
    button(
      'upgrade-supply',
      '激励补给  ▷',
      165,
      top + sheetH - touch() - 12,
      201,
      touch(),
      'supply',
      {
        disabled: game.practice || game.challenge,
        tint: C.gold,
      },
    );
  }
  function paused() {
    begin('paused', true);
    backButton();
    const h = 220 + touch(),
      top = modal(h);
    smallTitle('星光暂歇', '已暂停', '你的弹珠会在这里等你', top + 80);
    button('resume', '继续弹射 →', 38, top + h - touch() - 30, 314, touch(), 'resume', {
      primary: true,
    });
  }
  function settings(data, battle, canRestart) {
    begin('settings', battle);
    const min = touch(),
      h = 180 + min * 3,
      top = modal(h);
    button('settings-close', '×', W - min - 20, top + 12, min, min, 'overlay-back', {
      aria: '关闭设置',
    });
    label(null, '星轨设置', 170, top + 40, 25, C.text, 220);
    button(
      'settings-sound',
      `音效 · ${data.sound ? '开' : '关'}`,
      38,
      top + 92,
      151,
      min,
      'sound',
      { data: { action: 'sound' } },
    ).setAttribute('aria-pressed', String(data.sound));
    button(
      'settings-haptics',
      `振动 · ${data.haptics ? '开' : '关'}`,
      201,
      top + 92,
      151,
      min,
      'haptics',
    ).setAttribute('aria-pressed', String(data.haptics));
    button('settings-help', '玩法与特殊球珠', 38, top + 108 + min, 314, min, 'help');
    if (canRestart)
      button('settings-restart', '重新挑战本局', 38, top + 124 + min * 2, 314, min, 'restart-run', {
        tint: C.gold,
      });
    else label(null, '从不同角度切入，发现更长的连击', 195, top + 144 + min * 2, 12, C.muted);
  }
  function confirm(kind, battle) {
    begin('confirm', battle);
    const min = touch(),
      top = modal(210 + min);
    label(null, kind === 'leave' ? '返回主页？' : '重新开局？', 195, top + 44, 25);
    label(
      null,
      kind === 'leave'
        ? '已完成回合会保留。\n飞行中的本轮将从发射前继续。'
        : '当前这局会重新开始。\n已解锁关卡与最高纪录会保留。',
      195,
      top + 105,
      14,
      C.muted,
    );
    button('confirm-cancel', '继续当前对局', 35, top + 164, 154, min, 'overlay-back');
    button(
      'confirm-accept',
      kind === 'leave' ? '保存并返回' : '确认重开',
      201,
      top + 164,
      154,
      min,
      'confirm-accept',
      { primary: true },
    );
  }
  function help(persistent, battle) {
    begin('help', battle);
    const min = touch(),
      h = Math.min(H - 96, 430 + min),
      top = modal(h);
    button('help-back', '←', 28, top + 12, min, min, 'overlay-back', { aria: '返回设置' });
    label(null, '折射指南', 214, top + 38, 24, C.text, 200);
    const entries = [
      [
        '找角度，别只直射',
        '浅角贴墙切入珠群，弱重力让轨迹微弯。\n多次撞击会略微损能，侧面更容易连弹。',
      ],
      ['紫色漩涡会吞球', '未击碎的吸收器会吞掉当前弹珠。\n本轮减少连弹机会，永久球数不变。'],
      ['收回也有代价', '主动或超时召回，弹珠沿弧线加速归仓。\n全部归位后珠群下降，先拆低处目标。'],
      ['成长有上限', '每五轮选一次强化；无尽加球点每四波。\n需要时可看广告领取共鸣或应急清行。'],
    ];
    const step = (h - min - 105) / 4;
    entries.forEach(([title, body], i) => {
      const y = top + min + 42 + i * step;
      label(null, title, 195, y, 15, C.mint);
      label(null, body, 195, y + 31, 11, C.muted);
    });
    label(
      'storage-notice',
      persistent ? '关卡与无尽各自存档' : '存储不可用，本次会话仍可继续',
      195,
      top + h - 22,
      10,
      C.muted,
    );
  }
  function result(game, next, record, shareStatus = '') {
    begin('result', true);
    backButton();
    panel(menu, 18, H * 0.17, 354, H * 0.72, '#102637', '#3c5e6c');
    orb(menu, 195, H * 0.26, 36, { color: game.phase === 'won' ? C.mint : C.purple });
    label('result-title', game.phase === 'won' ? '星域已点亮' : '航行结束', 195, H * 0.36, 29);
    label(
      'result-detail',
      game.challenge
        ? '好友同场 · 不改变正常进度'
        : game.phase === 'won'
          ? next
            ? '下一片星域已解锁'
            : '全部星域已点亮'
          : `珠群越过了警戒线${game.level.endless ? ` · 纪录 ${record}` : ''}`,
      195,
      H * 0.41,
      12,
      C.muted,
    );
    for (const [id, val, title, x] of [
      ['result-score', game.score, '击碎球珠', 88],
      ['result-turns', game.turn, '弹射轮次', 195],
      ['result-combo', game.bestCombo, '最佳连击', 302],
    ]) {
      label(id, val, x, H * 0.48, 26, C.mint, 95);
      label(null, title, x, H * 0.52, 11, C.muted, 95);
    }
    const min = touch(),
      y = H * 0.57;
    if (next && !game.practice && !game.challenge)
      button('next', '下一星域  →', 38, y, 314, min, 'next', { primary: true });
    else if (game.phase === 'lost' && !game.practice && !game.challenge && !game.rewards?.rescue)
      button('result-supply', '激励救援 · 清除底部两行', 38, y, 314, min, 'supply', {
        tint: C.gold,
      });
    button(
      'retry',
      game.challenge ? '同场再试一次' : '再来一局',
      38,
      y + min + 10,
      151,
      min,
      'retry',
      { primary: true },
    );
    button('result-home', '返回主页', 201, y + min + 10, 151, min, 'leave', {
      data: { action: 'home' },
    });
    if (!game.practice && game.initialSeed && !game.rewards?.resonance && !game.rewards?.rescue)
      button('share-orbit', '分享同场挑战  →', 38, y + min * 2 + 20, 314, min, 'share');
    label('share-status', shareStatus, 195, H * 0.87, 11, C.muted);
  }
  function supply(game, { available, pending, message, canResonance, canRescue }) {
    begin('supply-panel', true);
    const min = touch(),
      cardH = 110,
      sh = 90 + cardH + 36 + min + 16,
      top = (H - sh) / 2;
    modal(sh, C.gold);
    label(null, pending ? '等待广告结束' : '星光补给', 195, top + 34, 25, C.gold);
    label(
      null,
      pending ? '完整观看后领取，关闭则不领取' : '自愿观看 · 每种奖励每局限一次',
      195,
      top + 65,
      12,
      C.muted,
    );
    const y = top + 90;
    button(
      'reward-resonance',
      '晶体共鸣\n8% 概率额外 1 伤害\n本局持续',
      24,
      y,
      165,
      cardH,
      'reward:resonance',
      { disabled: !available || pending || !canResonance, tint: C.mint },
    );
    button(
      'reward-rescue',
      '应急清行\n清除底部两行\n不计得分',
      201,
      y,
      165,
      cardH,
      'reward:rescue',
      { disabled: !available || pending || !canRescue, tint: C.gold },
    );
    label(
      'reward-status',
      message || (available ? '也可以直接继续旅程' : '广告暂未就绪，可直接继续'),
      195,
      top + sh - min - 37,
      11,
      C.muted,
    );
    button(
      'supply-back',
      pending ? '取消等待并返回' : '返回旅程',
      24,
      top + sh - min - 16,
      342,
      min,
      'supply-back',
    );
  }
  function shatter(event) {
    const profile = event.profile || targetProfile({ id: event.id, kind: event.kind || 'brick' });
    for (let i = 0; i < 6; i++) {
      const reusable = spareShards.pop() || (shards.length >= 48 ? shards.shift() : null);
      const a = i * 2.399 + (event.id || 0) * 0.7,
        speed = 55 + i * 16,
        size = 6 + (i % 3) * 3;
      const n =
        reusable?.n ||
        sprite(
          fragmentRoot,
          frame(`shard:${i % 2}`, () => shardTexture(i % 2)),
          event.x,
          event.y,
          size,
          size * 1.35,
        );
      n.active = true;
      n.getComponent(UITransform).setContentSize(size, size * 1.35);
      n.getComponent(Sprite).color = color(profile.color);
      const opacity = reusable?.opacity || n.addComponent(UIOpacity);
      opacity.opacity = 220;
      shards.push({
        n,
        opacity,
        x: event.x + Math.cos(a) * profile.radius * 0.25,
        y: event.y + Math.sin(a) * profile.radius * 0.25,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 65,
        spin: (i % 2 ? 1 : -1) * (140 + i * 30),
        angle: (a * 180) / Math.PI,
        age: 0,
        duration: 0.56 + (i % 3) * 0.08,
      });
    }
    stats.maxShards = Math.max(stats.maxShards, shards.length);
  }
  function consume(events, reduced) {
    let bursts = 0;
    for (const e of events) {
      if (e.type === 'hit' || e.type === 'absorb') {
        const target = targetNodes.get(e.id);
        if (target) {
          target.hit = 0.22;
          target.nx = e.nx || 0;
          target.ny = e.ny || 1;
        }
      }
      if (e.type === 'bounce') {
        const ball = ballNodes.get(e.ballId);
        if (ball) {
          ball.hit = 0.16;
          ball.nx = e.nx;
          ball.ny = e.ny;
        }
      }
      if (e.type === 'break') {
        stats.shatters++;
        if (!reduced && bursts++ < 4) shatter(e);
      }
      if (e.type === 'absorb') stats.absorptions++;
      if (e.type === 'returned') {
        stats.returns++;
        collectorPulse = 0.32;
      }
      if (e.type === 'recall') {
        stats.recalls++;
        collectorPulse = 0.7;
      }
      if (['bounce', 'break', 'blast', 'pickup', 'absorb', 'returned'].includes(e.type))
        effects.push({
          ...e,
          age: 0,
          duration: e.type === 'break' ? 0.42 : e.type === 'absorb' ? 0.4 : 0.28,
        });
    }
    effects = effects.slice(-18);
  }
  function crack(entry, brick, profile) {
    const stage =
      brick.kind === 'pickup' ? 0 : Math.min(3, Math.floor((1 - brick.hp / brick.maxHp) * 4));
    if (entry.crackStage === stage) return;
    entry.crackStage = stage;
    const g = entry.cracks;
    g.clear();
    for (let j = 0; j < stage; j++) {
      const a = (brick.id % 7) * 0.6 + j * 2.1,
        r = profile.radius;
      const points = [
        { x: Math.cos(a) * r * 0.85, y: Math.sin(a) * r * 0.85 },
        { x: Math.cos(a + 0.15) * r * 0.51, y: Math.sin(a + 0.15) * r * 0.51 },
        { x: Math.cos(a - 0.25) * r * 0.27, y: Math.sin(a - 0.25) * r * 0.27 },
        { x: 0, y: 0 },
      ];
      line(g, points, '#f5efff', 0.8, 170);
      line(
        g,
        [points[1], { x: Math.cos(a + 0.65) * r * 0.55, y: Math.sin(a + 0.65) * r * 0.55 }],
        '#addefe',
        0.65,
        160,
      );
    }
  }
  function draw(game, aim, dt, reduced) {
    time += dt;
    if (screen === 'home' && !reduced)
      hero.forEach(({ n, x, y, phase }) =>
        n.setPosition(
          x + Math.sin(time * 0.55 + phase) * 3,
          -y + Math.cos(time * 0.65 + phase) * 4,
        ),
      );
    if (!arena.active || !game) return;
    const liveTargets = new Set();
    for (const b of game.bricks) {
      if (b.hp <= 0) continue;
      liveTargets.add(b.id);
      let entry = targetNodes.get(b.id);
      const p = targetProfile(b),
        center = brickCenter(b);
      if (!entry) {
        const n = node(targets, `target-${b.id}`);
        const body = orb(n, 0, 0, p.radius, p),
          cracks = graphics(n);
        const label = text(
          n,
          b.kind === 'pickup' ? '+' : b.hp,
          0,
          0,
          b.kind === 'pickup' ? 19 : 16,
          C.text,
          p.radius * 1.65,
        );
        entry = { n, body, cracks, label, hit: 0, crackStage: -1 };
        targetNodes.set(b.id, entry);
      }
      entry.label.string = b.kind === 'pickup' ? '+' : String(b.hp);
      crack(entry, b, p);
      entry.n.setPosition(center.x, -center.y);
      entry.hit = Math.max(0, entry.hit - dt);
      const squash = !reduced ? Math.sin((entry.hit / 0.22) * Math.PI) * 0.065 : 0;
      entry.body.setScale(1 + squash, 1 - squash, 1);
    }
    for (const [id, entry] of targetNodes)
      if (!liveTargets.has(id)) {
        entry.n.destroy();
        targetNodes.delete(id);
      }
    const liveBalls = new Set();
    trail.clear();
    for (const ball of game.balls) {
      liveBalls.add(ball.id);
      let entry = ballNodes.get(ball.id);
      if (!entry) {
        entry = {
          n: orb(projectiles, ball.x, ball.y, FIELD.radius, { color: '#cefff1', opacity: 0.94 }),
          hit: 0,
        };
        ballNodes.set(ball.id, entry);
      }
      entry.n.setPosition(ball.x, -ball.y);
      entry.hit = Math.max(0, entry.hit - dt);
      const s = !reduced ? Math.sin((entry.hit / 0.16) * Math.PI) * 0.15 : 0;
      const returningScale =
        ball.returning && !reduced
          ? 1 - Math.pow(ball.returnElapsed / ball.returnDuration, 3) * 0.6
          : 1;
      entry.n.setScale((1 + s) * returningScale, (1 - s) * returningScale, 1);
      entry.n.angle = entry.hit > 0 ? (-Math.atan2(entry.ny, entry.nx) * 180) / Math.PI : 0;
      if (!reduced) {
        const points = [...(ball.trail || []), ball];
        for (let i = 1; i < points.length; i++)
          line(
            trail,
            [points[i - 1], points[i]],
            ball.returning ? C.gold : C.mint,
            0.5 + (i / points.length) * 2.0,
            Math.round((i / points.length) * 90),
          );
      }
    }
    for (const [id, entry] of ballNodes)
      if (!liveBalls.has(id)) {
        entry.n.destroy();
        ballNodes.delete(id);
      }
    launcher.active = game.phase === 'aim';
    launcher.setPosition(game.nextX ?? game.launchX, -FIELD.floor + FIELD.radius);
    collectorPulse = Math.max(0, collectorPulse - dt);
    collector.clear();
    const cx = game.nextX ?? game.launchX,
      cy = FIELD.floor + 5;
    circle(collector, cx, cy, 12, C.mint, 180, 2);
    circle(collector, cx, cy, 18 + (!reduced ? Math.sin(time * 5) * 2 : 0), C.purple, 100, 1);
    if (collectorPulse > 0 && !reduced)
      circle(
        collector,
        cx,
        cy,
        12 + (1 - collectorPulse / 0.7) * 20,
        C.gold,
        Math.round(collectorPulse * 250),
        2,
      );
    aimGraphic.clear();
    if (aim && game.phase === 'aim') {
      const dir = aimDirection(aim.x - game.launchX, aim.y - FIELD.floor + FIELD.radius + 1);
      if (dir) {
        let x = game.launchX,
          y = FIELD.floor - FIELD.radius - 1,
          dx = dir.x * 12,
          dy = dir.y * 12;
        const previewStep = 12 / FIELD.speed;
        for (let i = 0; i < 65; i++) {
          x += dx;
          y += dy;
          dy += PHYSICS.gravity * previewStep * previewStep;
          if (x < FIELD.left + FIELD.radius || x > FIELD.right - FIELD.radius) {
            x =
              x < FIELD.left + FIELD.radius
                ? 2 * (FIELD.left + FIELD.radius) - x
                : 2 * (FIELD.right - FIELD.radius) - x;
            dx *= -1;
          }
          if (y < FIELD.top) break;
          circle(aimGraphic, x, y, i % 3 ? 1.35 : 2, '#caffee', Math.round(220 - i * 2.5), 1, true);
          if (
            game.bricks.some(
              (b) =>
                b.hp > 0 &&
                b.kind !== 'pickup' &&
                Math.hypot(x - brickCenter(b).x, y - brickCenter(b).y) <=
                  targetProfile(b).radius + FIELD.radius,
            )
          )
            break;
        }
      }
    }
    fx.clear();
    for (const e of effects) {
      e.age += dt;
      const p = e.age / e.duration,
        fade = Math.round(Math.max(0, 1 - p) * 185),
        tint =
          e.type === 'absorb' ? C.purple : e.type === 'break' ? e.profile?.color || C.gold : C.mint;
      if (reduced) continue;
      circle(
        fx,
        e.x,
        e.y,
        e.type === 'absorb' ? 23 * (1 - p) : 4 + p * (e.type === 'blast' ? 52 : 20),
        tint,
        fade,
        e.type === 'absorb' ? 2 : 1,
      );
    }
    effects = effects.filter((e) => e.age < e.duration);
    for (const shard of shards) {
      shard.age += dt;
      shard.vy += 260 * dt;
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      shard.angle += shard.spin * dt;
      shard.n.active = !reduced;
      shard.n.setPosition(shard.x, -shard.y);
      shard.n.angle = shard.angle;
      shard.opacity.opacity = Math.max(0, Math.round((1 - shard.age / shard.duration) * 220));
    }
    shards = shards.filter((s) => {
      if (s.age >= s.duration || reduced) {
        s.n.active = false;
        spareShards.push(s);
        return false;
      }
      return true;
    });
  }
  function reset() {
    for (const collection of [targetNodes, ballNodes]) {
      for (const v of collection.values()) v.n.destroy();
      collection.clear();
    }
    effects = [];
    shards.forEach((s) => {
      s.n.active = false;
      spareShards.push(s);
    });
    shards = [];
    collectorPulse = 0;
    Object.keys(stats).forEach((k) => (stats[k] = 0));
    fx.clear();
    trail.clear();
  }
  function updateHud(game) {
    const values = {
      score: `${game.score} 分`,
      'ball-count': `${game.count} 颗`,
      'shot-hint':
        game.phase === 'recall'
          ? '星轨召回 · 全部归位后进入下一轮'
          : game.phase === 'flight'
            ? `${game.collisionCount || 0} 次碰撞 · ${game.combo} 连碎${game.absorbed ? ' · 吞噬 ' + game.absorbed + ' 颗' : ''}`
            : '拖动瞄准 · 松手发射',
    };
    for (const [id, value] of Object.entries(values))
      if (hud[id] && hud[id].label.isValid && hud[id].label.string !== value) {
        hud[id].label.string = value;
        hud[id].el.textContent = value;
      }
  }
  setDimensions(dimensions);
  return {
    home,
    levels,
    playing,
    upgrade,
    paused,
    settings,
    confirm,
    help,
    result,
    supply,
    draw,
    consume,
    reset,
    updateHud,
    setDimensions,
    get board() {
      return board;
    },
    get height() {
      return H;
    },
    arenaAccess,
    get stats() {
      return {
        ...stats,
        shards: shards.length,
        shardNodes: shards.length + spareShards.length,
        cracked: [...targetNodes.values()].filter((e) => e.crackStage > 0).length,
      };
    },
    dispose() {
      origin.destroy();
      cleanup.forEach((asset) => asset.destroy());
      access.replaceChildren();
    },
  };
}
