import { glassTexture, backgroundTexture, panelTexture } from './src/art.mjs';
import { FIELD, WIDTH, HEIGHT, brickCenter, targetProfile, aimDirection } from './core.mjs';
import { LEVELS, UPGRADES } from './levels.mjs';
const TAU = Math.PI * 2;
const C = {
  ink: '#091725',
  panel: '#142a3b',
  mint: '#98f5dd',
  text: '#e9f9f7',
  muted: '#8eaab9',
  rose: '#f497ae',
  gold: '#efc18b',
  purple: '#bda6f6',
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
    const p = { color: C.mint, material: 'glass', shape: 'circle', ...profile };
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
    board = { scale: Math.min(1, (H - 164) / HEIGHT), y: 76 };
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
    line(
      arenaStatic,
      [
        { x: FIELD.left, y: FIELD.top - 18 },
        { x: FIELD.left, y: FIELD.floor },
        { x: FIELD.right, y: FIELD.floor },
        { x: FIELD.right, y: FIELD.top - 18 },
      ],
      '#54929d',
      1,
      75,
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
      primary ? '#98e7d3' : '#152b3d',
      primary ? '#d5fff3' : '#39596b',
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
    } else
      text(
        menu,
        value,
        x + w / 2,
        y + h / 2,
        h > 90 ? 15 : 16,
        tint || (primary ? '#0c3434' : disabled ? '#607a8b' : C.text),
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
  const fullscreenLabel = () => {
    try {
      return document.fullscreenElement ||
        document.webkitFullscreenElement ||
        parent.document.fullscreenElement ||
        parent.document.webkitFullscreenElement
        ? '退出'
        : '全屏';
    } catch {
      return document.fullscreenElement ? '退出' : '全屏';
    }
  };
  function home(data, saved, challenge) {
    begin('home');
    homeArt.children.slice().forEach((n) => n.destroy());
    hero.length = 0;
    const min = touch(),
      compact = H < 740;
    button('home-help', '?', 20, 14, min, min, 'help', { aria: '玩法帮助' });
    button('home-sound', data.sound ? '♪' : '静', W - 20 - min * 2 - 8, 14, min, min, 'sound', {
      aria: data.sound ? '关闭音效' : '开启音效',
      data: { action: 'sound' },
    });
    button('home-fullscreen', fullscreenLabel(), W - 20 - min, 14, min, min, 'fullscreen');
    label(null, '星轨弹珠', 195, compact ? 110 : 132, 42);
    label(null, 'O R B I T   B R E A K E R', 195, compact ? 151 : 178, 11, C.mint);
    const center = compact ? H * 0.43 : H * 0.44,
      orbitGraphics = graphics(homeArt);
    for (let j = 0; j < 3; j++) {
      const points = Array.from({ length: 81 }, (_, i) => {
        const a = (i / 80) * TAU;
        return {
          x: 195 + Math.cos(a) * (143 + j * 10),
          y: center + Math.sin(a) * (65 + j * 14) + Math.cos(a) * 30,
        };
      });
      line(orbitGraphics, points, j === 1 ? C.gold : C.mint, 0.8, 80 - j * 15);
    }
    const s = compact ? 0.84 : 1;
    for (const [dx, dy, radius, colorHex, shape] of [
      [-25, 10, 84, C.mint, 'circle'],
      [73, -63, 43, C.purple, 'circle'],
      [70, 78, 48, C.gold, 'circle'],
      [-100, -73, 19, '#c8ecff', 'circle'],
      [-100, 99, 23, C.purple, 'hexagon'],
      [119, 6, 12, '#e7fff7', 'circle'],
    ]) {
      const n = orb(homeArt, 195 + dx * s, center + dy * s, radius * s, { color: colorHex, shape });
      hero.push({ n, x: 195 + dx * s, y: center + dy * s, phase: dx });
    }
    const bottom = H - 30,
      modeH = min + 18,
      startH = min + 10,
      startY = bottom - modeH - 14 - startH - (challenge ? min + 10 : 0);
    label(
      'home-progress',
      saved
        ? `继续第 ${saved.turn + 1} 轮 · ${saved.levelId === 'endless' ? '无尽航行' : '星域旅程'}`
        : `${Object.keys(data.completed).length} / 6 星域已点亮`,
      195,
      startY - 22,
      12,
      C.muted,
    );
    button(
      'start',
      `${saved ? '继续' : '开始'}${data.lastMode === 'endless' ? '无尽' : '关卡'}模式  →`,
      24,
      startY,
      342,
      startH,
      'continue',
      { primary: true },
    );
    if (challenge)
      button('challenge-orbit', challenge, 24, startY + startH + 10, 342, min, 'challenge');
    button('levels-button', '关卡模式\n选择星域 →', 24, bottom - modeH, 165, modeH, 'levels');
    button('endless-button', '无尽模式\n继续探索 →', 201, bottom - modeH, 165, modeH, 'endless');
  }
  function levels(data, saved, unlocked) {
    begin('levels');
    const min = touch();
    button('levels-home', '←', 20, 14, min, min, 'home', {
      aria: '返回主页',
      data: { action: 'home' },
    });
    label(null, '星域图鉴', 220, 40, 25, C.text, 230);
    label(
      'levels-progress',
      `${Object.keys(data.completed).length} / 6 星域已点亮`,
      195,
      94,
      13,
      C.muted,
    );
    const compact = scale < 0.72,
      top = saved ? 123 + min : 127;
    if (saved)
      button('campaign-continue', `继续 · 第 ${saved.turn + 1} 轮`, 24, 113, 342, min, 'campaign');
    const row = Math.min(compact ? 140 : 99, (H - top - 18) / (compact ? 3 : 6)),
      height = row - 9;
    LEVELS.forEach((level, index) => {
      const y = top + (compact ? Math.floor(index / 2) : index) * row,
        enabled = unlocked(level.id),
        result = data.completed[level.id],
        x = compact ? 24 + (index % 2) * 177 : 24,
        width = compact ? 165 : 342;
      const el = button(null, '', x, y, width, height, `level:${level.id}`, {
        disabled: !enabled,
        data: { level: level.id },
        aria: `${index + 1}. ${level.title}${enabled ? '，开始关卡' : '，未解锁'}`,
      });
      el.className = 'level-card';
      orb(
        menu,
        compact ? x + 127 : 318,
        y + height / 2,
        Math.min(compact ? 22 : 33, height * 0.39),
        { color: level.color, opacity: enabled ? 0.8 : 0.4 },
      );
      text(
        menu,
        `0${index + 1}`,
        compact ? x + 28 : 57,
        y + height / 2,
        compact ? 17 : 21,
        enabled ? C.mint : C.muted,
        42,
      );
      text(
        menu,
        level.title,
        compact ? x + 82 : 174,
        y + height * 0.3,
        compact ? 14 : 18,
        enabled ? C.text : C.muted,
        compact ? 145 : 170,
        compact ? 'center' : 'left',
      );
      text(
        menu,
        result ? '★'.repeat(result.stars) : enabled ? '启程  →' : '尚未解锁',
        compact ? x + 82 : 174,
        y + height * 0.75,
        11,
        result ? C.gold : C.muted,
        compact ? 145 : 170,
        compact ? 'center' : 'left',
      );
    });
  }
  function battleHeader(game) {
    const min = touch();
    label(
      'level-name',
      game.challenge
        ? '好友同场'
        : game.level.endless
          ? '无尽模式'
          : `关卡模式 · ${game.level.title}`,
      148,
      28,
      15,
      C.text,
      246,
    );
    label(
      'wave-progress',
      `第 ${game.turn + 1} 轮${game.level.endless ? '' : ` · ${game.waveIndex} / ${game.level.waves.length} 波`}${game.practice ? ' · 试玩' : ''}`,
      125,
      52,
      11,
      C.muted,
      200,
    );
    label('score', game.score, 285, 34, 21, C.mint, 60);
    button('pause', '', W - min - 12, 12, min, min, 'pause', { aria: '暂停', icon: 'pause' });
  }
  function playing(game) {
    begin('playing', true);
    battleHeader(game);
    const min = touch(),
      y = H - min - 18;
    label('ball-count', `${game.count} 颗`, 60, y + 13, 23, C.mint, 90);
    label(
      'shot-hint',
      game.phase === 'flight' ? '折射连击中' : '拖动瞄准 · 松手发射',
      130,
      y + min - 10,
      11,
      C.muted,
      210,
    );
    button(
      'supply',
      '补给',
      W - 24 - Math.max(68, min) * 2 - 9,
      y,
      Math.max(68, min),
      min,
      'supply',
      { disabled: game.phase === 'flight' || game.practice || game.challenge, tint: C.gold },
    );
    button('recall', '回收', W - 14 - Math.max(68, min), y, Math.max(68, min), min, 'recall', {
      disabled: game.phase !== 'flight',
    });
  }
  function upgrade(game) {
    begin('upgrade', true);
    battleHeader(game);
    const sheetH = Math.min(330, Math.max(285, H * 0.41)),
      top = H - sheetH;
    panel(menu, 9, top, 372, sheetH + 12, '#122b3b', '#5a8b99');
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
          extra: '每轮 +2 颗\n最多 36 颗',
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
    button('upgrade-home', '保存离开', 24, H - touch() - 12, 128, touch(), 'home');
    button('upgrade-supply', '激励补给  ▷', 165, H - touch() - 12, 201, touch(), 'supply', {
      disabled: game.practice || game.challenge,
      tint: C.gold,
    });
  }
  function paused(data) {
    begin('paused', true);
    panel(menu, 18, H * 0.2, 354, H * 0.64, '#102637', '#395d6c');
    smallTitle('星光暂歇', '已暂停', '你的弹珠会在这里等你', H * 0.31);
    const min = touch(),
      y = H * 0.46;
    button('resume', '继续弹射  →', 38, y, 314, min + 5, 'resume', { primary: true });
    button('pause-sound', `音效${data.sound ? '开' : '关'}`, 38, y + min + 18, 96, min, 'sound', {
      data: { action: 'sound' },
      aria: data.sound ? '关闭音效' : '开启音效',
    }).setAttribute('aria-pressed', String(data.sound));
    button('haptics', `震动${data.haptics ? '开' : '关'}`, 147, y + min + 18, 96, min, 'haptics');
    button('pause-fullscreen', fullscreenLabel(), 256, y + min + 18, 96, min, 'fullscreen');
    button('pause-help', '玩法帮助', 38, y + min * 2 + 30, 314, min, 'help');
    button('back-home', '保存并返回主页', 38, y + min * 3 + 42, 314, min, 'home');
  }
  function help(persistent) {
    begin('help');
    button('help-back', '← 返回', 22, 16, 106, touch(), 'help-back');
    smallTitle('轻轻瞄准，让连击发生', '让弹珠飞起来', '', 122);
    const entries = [
      [
        '01',
        '拖动瞄准，松手发射',
        '借墙反弹，从珠群侧面切入。\n玻璃曲面与水晶棱面会改变折返方向。',
      ],
      ['02', '留意底部警戒线', '回合结束，珠群下降一行。\n先拆低处目标，回收会放弃剩余伤害。'],
      [
        '03',
        '组合有限的强化',
        '每五轮选择一次强化，每项都有上限。\n每轮击碎 10 颗赠 1 球，球数最多 36。',
      ],
      [
        '04',
        '需要时，再使用补给',
        '可选择观看广告，获得本局共鸣或清行。\n每种限一次，好友挑战和试玩不使用。',
      ],
    ];
    const step = (H - 230) / entries.length;
    entries.forEach(([index, title, body], i) => {
      const y = 195 + i * step;
      label(null, index, 42, y, 13, C.mint, 40);
      text(menu, title, 224, y, 17, C.text, 280, 'left');
      text(menu, body, 224, y + 39, 12, C.muted, 280, 'left');
    });
    label(
      'storage-notice',
      persistent ? '两种模式独立存档，回合开始自动保存' : '存储不可用，本次会话仍可继续游玩',
      195,
      H - 30,
      11,
      C.muted,
    );
  }
  function result(game, next, record, shareStatus = '') {
    begin('result', true);
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
            : '六片星域已点亮'
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
    button('result-home', '返回主页', 201, y + min + 10, 151, min, 'home', {
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
      top = H - sh;
    panel(menu, 9, top, 372, sh + 12, '#142b3b', '#8b795c');
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
      H - min - 37,
      11,
      C.muted,
    );
    button(
      'supply-back',
      pending ? '取消等待并返回' : '返回旅程',
      24,
      H - min - 16,
      342,
      min,
      'supply-back',
    );
  }
  function consume(events, reduced) {
    for (const e of events) {
      if (e.type === 'hit') {
        const entry = targetNodes.get(e.id);
        if (entry) {
          entry.hit = 0.22;
          entry.nx = e.nx || 0;
          entry.ny = e.ny || 1;
        }
      }
      if (e.type === 'bounce') {
        const entry = ballNodes.get(e.ballId);
        if (entry) {
          entry.hit = 0.16;
          entry.nx = e.nx;
          entry.ny = e.ny;
        }
      }
      if (!reduced && ['bounce', 'break', 'blast', 'pickup'].includes(e.type))
        effects.push({ ...e, age: 0, duration: e.type === 'break' ? 0.46 : 0.26 });
    }
    effects = effects.slice(-42);
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
        orb(n, 0, 0, p.radius, p);
        const label = text(
          n,
          b.kind === 'pickup' ? '+' : b.hp,
          0,
          0,
          b.kind === 'pickup' ? 19 : 16,
          C.text,
          p.radius * 1.65,
        );
        entry = { n, label, hit: 0 };
        targetNodes.set(b.id, entry);
      }
      entry.label.string = b.kind === 'pickup' ? '+' : String(b.hp);
      entry.n.setPosition(center.x, -center.y);
      entry.hit = Math.max(0, entry.hit - dt);
      const squash = !reduced ? Math.sin((entry.hit / 0.22) * Math.PI) * 0.065 : 0;
      entry.n.setScale(1 + squash, 1 - squash, 1);
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
      entry.n.setScale(1 + s, 1 - s, 1);
      entry.n.angle = entry.hit > 0 ? (-Math.atan2(entry.ny, entry.nx) * 180) / Math.PI : 0;
      if (!reduced) {
        const points = [...(ball.trail || []), ball];
        for (let i = 1; i < points.length; i++)
          line(
            trail,
            [points[i - 1], points[i]],
            C.mint,
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
    launcher.active = game.phase !== 'flight' || game.nextX !== null;
    launcher.setPosition(game.nextX ?? game.launchX, -FIELD.floor + FIELD.radius);
    aimGraphic.clear();
    if (aim && game.phase === 'aim') {
      const dir = aimDirection(aim.x - game.launchX, aim.y - FIELD.floor + FIELD.radius + 1);
      if (dir) {
        let x = game.launchX,
          y = FIELD.floor - FIELD.radius - 1,
          dx = dir.x * 12,
          dy = dir.y * 12;
        for (let i = 0; i < 65; i++) {
          x += dx;
          y += dy;
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
      if (reduced) continue;
      const progress = e.age / e.duration,
        fade = Math.round(Math.max(0, 1 - progress) * 180),
        tint = e.type === 'break' ? C.gold : C.mint;
      circle(fx, e.x, e.y, 4 + progress * (e.type === 'blast' ? 52 : 20), tint, fade, 1);
      if (e.type === 'break')
        for (let i = 0; i < 6; i++) {
          const a = i * 2.399,
            distance = progress * (24 + i * 4),
            x = e.x + Math.cos(a) * distance,
            y = e.y + Math.sin(a) * distance + progress * progress * 15;
          line(
            fx,
            [
              { x: x - 2, y },
              { x, y: y - 3 },
              { x: x + 2, y: y + 2 },
              { x: x - 2, y },
            ],
            tint,
            1,
            fade,
          );
        }
    }
    effects = effects.filter((e) => e.age < e.duration);
  }
  function reset() {
    for (const collection of [targetNodes, ballNodes]) {
      for (const v of collection.values()) v.n.destroy();
      collection.clear();
    }
    effects = [];
    fx.clear();
    trail.clear();
  }
  function updateHud(game) {
    const values = {
      score: String(game.score),
      'ball-count': `${game.count} 颗`,
      'shot-hint':
        game.phase === 'flight'
          ? `${game.collisionCount || 0} 次碰撞 · ${game.combo} 连碎`
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
    dispose() {
      origin.destroy();
      cleanup.forEach((asset) => asset.destroy());
      access.replaceChildren();
    },
  };
}
