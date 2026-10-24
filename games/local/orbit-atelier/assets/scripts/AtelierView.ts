import { MetalBoard } from './MetalBoard';
import {
  Camera,
  Canvas,
  Color,
  Graphics,
  Label,
  Layers,
  Node,
  ResolutionPolicy,
  Sprite,
  SpriteFrame,
  ImageAsset,
  Texture2D,
  UITransform,
  resources,
  sys,
  view,
} from 'cc';
import {
  canRelease,
  circleIntersections,
  clearsOpening,
  getBlockers,
  hasBandAt,
  isLocked,
  type Hint,
  type Ring,
  type State,
} from './core/rules';

export const INK = '#061522';
export const GOLD = '#efd39b';
export const MINT = '#8ff5df';
export type Rect = { x: number; y: number; w: number; h: number };
export type Control = Rect & { id: string; label: string; disabled?: boolean };
export type Flight = { ring: Ring; age: number; goal: boolean };
const TAU = Math.PI * 2;
const color = (hex: string, alpha = 255) => {
  const c = new Color().fromHEX(hex);
  c.a = alpha;
  return c;
};
const shade = (hex: string, factor: number) => {
  const c = color(hex);
  return new Color(
    Math.min(255, c.r * factor),
    Math.min(255, c.g * factor),
    Math.min(255, c.b * factor),
    255,
  );
};

/** Native Cocos scene: static art, engraved metal geometry, UI and transient effects. */
export class AtelierView {
  root: Node;
  camera: Camera;
  background: Sprite;
  hero: Sprite;
  ui: Graphics;
  board: Graphics;
  effects: Graphics;
  labels: Node;
  boardLabels: Node;
  controls: Control[] = [];
  w = 390;
  h = 844;
  landscape = false;
  safeTop = 0;
  bounds: Rect = { x: 16, y: 155, w: 358, h: 490 };
  fit = { x: 195, y: 410, scale: 1, cx: 320, cy: 320 };
  assetReady = false;
  disposed = false;
  assetError = false;
  imageStates = new Map<string, string>();
  readyCallback: () => void;
  ownedAssets: (Texture2D | SpriteFrame)[] = [];
  heroY = 0;
  pressed: string | null = null;
  pulses: { x: number; y: number; start: number; unlocked: boolean }[] = [];
  metalScene = new MetalBoard(this);
  resultStars: { x: number; y: number; medal: number; start: number } | null = null;
  constructor(parent: Node, onReady: () => void) {
    this.readyCallback = onReady;
    this.root = new Node('AtelierCanvas');
    parent.addChild(this.root);
    this.root.layer = Layers.Enum.UI_2D;
    this.root.addComponent(UITransform);
    const canvas = this.root.addComponent(Canvas);
    const cameraNode = new Node('AtelierCamera');
    parent.addChild(cameraNode);
    this.camera = cameraNode.addComponent(Camera);
    this.camera.projection = Camera.ProjectionType.ORTHO;
    this.camera.near = 0.1;
    this.camera.far = 2000;
    this.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    this.camera.clearColor = color(INK);
    this.camera.visibility = Layers.Enum.UI_2D;
    canvas.cameraComponent = this.camera;
    this.background = this.node('Workshop').addComponent(Sprite);
    this.hero = this.node('Armillary').addComponent(Sprite);
    this.ui = this.node('Interface').addComponent(Graphics);
    this.board = this.node('MetalRings').addComponent(Graphics);
    this.effects = this.node('Starlight').addComponent(Graphics);
    this.labels = this.node('Labels');
    this.boardLabels = this.node('RingLabels');
    this.resize();
    this.loadArt();
  }
  loadArt() {
    this.assetError = false;
    for (const [key, sprite] of [
      ['atelier', this.background],
      ['armillary', this.hero],
    ] as const) {
      if (['loading', 'loaded'].includes(this.imageStates.get(key) || '')) continue;
      this.imageStates.set(key, 'loading');
      resources.load(key, ImageAsset, (error, asset) => {
        if (this.disposed) return;
        if (error) {
          this.imageStates.set(key, 'error');
          this.assetError = true;
          this.readyCallback();
          return;
        }
        const texture = new Texture2D();
        texture.image = asset;
        const frame = new SpriteFrame();
        frame.texture = texture;
        this.ownedAssets.push(frame, texture);
        sprite.spriteFrame = frame;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.imageStates.set(key, 'loaded');
        this.assetReady =
          Array.from(this.imageStates.values()).filter((value) => value === 'loaded').length === 2;
        this.resize();
        this.readyCallback();
      });
    }
  }
  node(name: string, parent = this.root) {
    const n = new Node(name);
    n.layer = Layers.Enum.UI_2D;
    parent.addChild(n);
    n.addComponent(UITransform);
    return n;
  }
  resize() {
    const frame = view.getFrameSize();
    this.landscape = frame.width > frame.height;
    this.w = this.landscape ? (390 * frame.width) / frame.height : 390;
    this.h = this.landscape ? 390 : Math.max(640, (390 * frame.height) / frame.width);
    view.setDesignResolutionSize(this.w, this.h, ResolutionPolicy.SHOW_ALL);
    this.root.getComponent(UITransform)!.setContentSize(this.w, this.h);
    this.root.setPosition(this.w / 2, this.h / 2, 0);
    const safe = sys.getSafeAreaRect();
    this.safeTop = Math.max(0, Math.min(50, this.h - safe.y - safe.height));
    this.camera.node.setPosition(this.w / 2, this.h / 2, 1000);
    this.camera.orthoHeight = this.h / 2;
    const size = Math.max(this.w / 768, this.h / 1152);
    this.background.node.getComponent(UITransform)!.setContentSize(768 * size, 1152 * size);
    this.bounds = this.landscape
      ? { x: this.w * 0.34, y: 60, w: this.w * 0.64 - 20, h: 280 }
      : { x: 17, y: 157 + this.safeTop, w: this.w - 34, h: this.h - 330 - this.safeTop };
  }
  pos(n: Node, x: number, y: number) {
    n.setPosition(x - this.w / 2, this.h / 2 - y, 0);
  }
  point(x: number, y: number) {
    return { x: x - this.w / 2, y: this.h / 2 - y };
  }
  polygon(g: Graphics, points: number[][], fill: Color) {
    if (!points.length) return;
    g.fillColor = fill;
    points.forEach(([x, y], i) => {
      const p = this.point(x, y);
      if (i) g.lineTo(p.x, p.y);
      else g.moveTo(p.x, p.y);
    });
    g.close();
    g.fill();
  }
  line(g: Graphics, points: number[][], hex = GOLD, width = 1, alpha = 255, round = true) {
    g.strokeColor = color(hex, alpha);
    g.lineWidth = width;
    g.lineCap = round ? Graphics.LineCap.ROUND : Graphics.LineCap.BUTT;
    points.forEach(([x, y], i) => {
      const p = this.point(x, y);
      if (i) g.lineTo(p.x, p.y);
      else g.moveTo(p.x, p.y);
    });
    g.stroke();
  }
  circle(g: Graphics, x: number, y: number, r: number, hex: string, alpha = 255, stroke = 0) {
    const p = this.point(x, y);
    g.circle(p.x, p.y, r);
    if (stroke) {
      g.strokeColor = color(hex, alpha);
      g.lineWidth = stroke;
      g.stroke();
    } else {
      g.fillColor = color(hex, alpha);
      g.fill();
    }
  }
  box(
    g: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
    hex: string,
    alpha = 255,
    stroke = 0,
  ) {
    g.roundRect(x - this.w / 2, this.h / 2 - y - h, w, h, radius);
    if (stroke) {
      g.strokeColor = color(hex, alpha);
      g.lineWidth = stroke;
      g.stroke();
    } else {
      g.fillColor = color(hex, alpha);
      g.fill();
    }
  }
  star(g: Graphics, x: number, y: number, r: number, hex = GOLD, alpha = 255) {
    this.polygon(
      g,
      [
        [x, y - r],
        [x + r * 0.22, y - r * 0.22],
        [x + r, y],
        [x + r * 0.22, y + r * 0.22],
        [x, y + r],
        [x - r * 0.22, y + r * 0.22],
        [x - r, y],
        [x - r * 0.22, y - r * 0.22],
      ],
      color(hex, alpha),
    );
  }
  crystal(g: Graphics, x: number, y: number, r: number, pulse = 1) {
    for (let i = 5; i > 0; i--)
      this.circle(g, x, y, r * (1 + i * 0.22) * pulse, '#50dacb', 5 + (5 - i) * 2);
    this.star(g, x, y, r, '#dcfff5');
    this.polygon(
      g,
      [
        [x, y - r],
        [x, y],
        [x + r, y],
      ],
      color('#9cffe5'),
    );
    this.polygon(
      g,
      [
        [x, y + r],
        [x, y],
        [x - r, y],
      ],
      color('#24a99e'),
    );
    this.star(g, x, y, r * 0.31, '#ffffff');
  }
  text(
    str: string,
    x: number,
    y: number,
    size = 18,
    hex = GOLD,
    width = 340,
    parent = this.labels,
    serif = false,
  ) {
    const n = this.node(str.slice(0, 24), parent);
    this.pos(n, x, y);
    n.getComponent(UITransform)!.setContentSize(
      width,
      Math.max(size * 2.8, str.split('\n').length * size * 1.6),
    );
    const label = n.addComponent(Label);
    label.string = str;
    label.fontFamily = serif
      ? 'Noto Serif CJK SC, Songti SC, SimSun, serif'
      : 'Noto Sans CJK SC, Microsoft YaHei, sans-serif';
    label.fontSize = size;
    label.lineHeight = size * 1.5;
    label.color = color(hex);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    label.enableWrapText = true;
    return label;
  }
  begin() {
    this.ui.clear();
    this.board.clear();
    this.effects.clear();
    this.labels.destroyAllChildren();
    this.boardLabels.destroyAllChildren();
    this.controls = [];
    this.resultStars = null;
    this.hero.node.active = false;
    this.box(this.ui, 0, 0, this.w, this.h, 0, INK, 45);
    // Fade the ornate plinth under controls without a hard panel edge.
    for (let i = 0; i < 30; i++)
      this.box(this.ui, 0, this.h - 186 + i * 6.2, this.w, 6.4, 0, INK, i * 5);
  }
  showHero(x: number, y: number, height: number) {
    this.hero.node.active = true;
    this.pos(this.hero.node, x, y);
    this.heroY = y;
    this.hero.node.getComponent(UITransform)!.setContentSize((height * 2) / 3, height);
  }
  icon(g: Graphics, id: string, x: number, y: number, hex = GOLD) {
    if (id === 'pause') {
      this.box(g, x - 7, y - 9, 4, 18, 1, hex);
      this.box(g, x + 3, y - 9, 4, 18, 1, hex);
    } else if (id === 'back')
      this.line(
        g,
        [
          [x + 5, y - 8],
          [x - 4, y],
          [x + 5, y + 8],
        ],
        hex,
        2,
      );
    else if (id === 'undo') {
      this.line(
        g,
        [
          [x - 8, y + 4],
          [x - 8, y - 5],
          [x + 2, y - 5],
          [x + 7, y],
          [x + 5, y + 7],
          [x, y + 9],
        ],
        hex,
        2,
      );
      this.line(
        g,
        [
          [x - 13, y],
          [x - 8, y - 5],
          [x - 3, y],
        ],
        hex,
        2,
      );
    } else if (id === 'tilt') {
      this.line(
        g,
        [
          [x - 10, y + 3],
          [x - 6, y - 7],
          [x + 6, y - 7],
          [x + 10, y + 3],
          [x - 10, y + 3],
        ],
        hex,
        1.8,
      );
      this.line(
        g,
        [
          [x - 7, y + 8],
          [x + 7, y + 8],
        ],
        hex,
        1.5,
      );
    } else if (id === 'pull') {
      this.line(
        g,
        [
          [x - 10, y],
          [x + 10, y],
          [x + 3, y - 6],
        ],
        hex,
        2,
      );
      this.line(
        g,
        [
          [x + 10, y],
          [x + 3, y + 6],
        ],
        hex,
        2,
      );
    } else if (id === 'hint') {
      this.circle(g, x, y - 4, 7, hex, 255, 1.8);
      this.line(
        g,
        [
          [x - 4, y + 3],
          [x - 3, y + 9],
          [x + 3, y + 9],
          [x + 4, y + 3],
        ],
        hex,
        2,
      );
    } else if (id === 'lock') {
      this.box(g, x - 6, y - 1, 12, 10, 2, hex);
      this.line(
        g,
        [
          [x - 4, y - 1],
          [x - 4, y - 6],
          [x, y - 9],
          [x + 4, y - 6],
          [x + 4, y - 1],
        ],
        hex,
        1.8,
      );
    } else if (id === 'settings') {
      this.circle(g, x, y, 8, hex, 255, 2);
      this.circle(g, x, y, 3, hex, 255, 1.5);
      for (let i = 0; i < 8; i++)
        this.line(
          g,
          [
            [x + Math.cos((i * TAU) / 8) * 8, y + Math.sin((i * TAU) / 8) * 8],
            [x + Math.cos((i * TAU) / 8) * 12, y + Math.sin((i * TAU) / 8) * 12],
          ],
          hex,
          2,
        );
    } else if (id === 'levels') {
      this.circle(g, x, y, 9, hex, 255, 1.5);
      this.line(
        g,
        [
          [x - 12, y + 5],
          [x + 12, y - 5],
        ],
        hex,
        2,
      );
      this.star(g, x, y, 4, hex);
    } else this.star(g, x, y, 9, hex);
  }
  button(
    id: string,
    label: string,
    x: number,
    y: number,
    w = 280,
    primary = false,
    disabled = false,
  ) {
    const h = 54;
    this.controls.push({ id, label, x: x - w / 2, y: y - h / 2, w, h, disabled });
    this.box(this.ui, x - w / 2, y - h / 2 + 4, w, h, h / 2, '#000000', 120);
    this.box(
      this.ui,
      x - w / 2,
      y - h / 2,
      w,
      h,
      h / 2,
      primary ? '#c59752' : '#0a2530',
      disabled ? 100 : 245,
    );
    this.box(
      this.ui,
      x - w / 2 + 2,
      y - h / 2 + 2,
      w - 4,
      h / 2,
      h / 4,
      primary ? '#f6dca0' : '#173d45',
      disabled ? 60 : 180,
    );
    this.box(
      this.ui,
      x - w / 2,
      y - h / 2,
      w,
      h,
      h / 2,
      disabled ? '#4b585d' : GOLD,
      primary ? 255 : 140,
      1,
    );
    this.box(
      this.ui,
      x - w / 2 + 5,
      y - h / 2 + 5,
      w - 10,
      h - 10,
      (h - 10) / 2,
      GOLD,
      primary ? 100 : 30,
      0.7,
    );
    this.text(
      label,
      x,
      y - 1,
      19,
      disabled ? '#708080' : primary ? '#2c271d' : GOLD,
      w - 28,
      this.labels,
      primary,
    );
    if (primary && w > 220) {
      this.star(this.ui, x - w / 2 + 25, y, 4, '#6b4c27');
      this.star(this.ui, x + w / 2 - 25, y, 4, '#6b4c27');
    }
  }
  roundButton(id: string, label: string, x: number, y: number, icon: string, disabled = false) {
    this.controls.push({ id, label, x: x - 27, y: y - 27, w: 54, h: 54, disabled });
    this.circle(this.ui, x, y + 3, 24, '#000000', 120);
    this.circle(this.ui, x, y, 24, '#0c2430', 245);
    this.circle(this.ui, x, y, 23, GOLD, disabled ? 50 : 200, 1.2);
    this.circle(this.ui, x, y, 20, '#475c60', 90, 0.7);
    this.icon(this.ui, icon, x, y, disabled ? '#5d6a6d' : GOLD);
  }
  header(title: string, subtitle: string, back = 'home', pause = false) {
    this.box(this.ui, 0, 0, this.w, 125 + this.safeTop, 0, INK, 130);
    if (!pause) this.roundButton(back, '返回', 39, 57 + this.safeTop, 'back');
    this.text(
      title,
      this.w / 2,
      52 + this.safeTop,
      this.landscape ? 20 : 25,
      GOLD,
      this.w - 145,
      this.labels,
      true,
    );
    if (subtitle) this.text(subtitle, this.w / 2, 86 + this.safeTop, 11, '#94b3ba', this.w - 90);
    if (pause) this.roundButton('pause', '暂停', this.w - 39, 57 + this.safeTop, 'pause');
    this.line(
      this.ui,
      [
        [this.w * 0.23, 109 + this.safeTop],
        [this.w * 0.77, 109 + this.safeTop],
      ],
      GOLD,
      0.6,
      85,
    );
    this.star(this.ui, this.w / 2, 109 + this.safeTop, 4, GOLD);
  }
  boardFit(state: State) {
    const left = Math.min(...state.rings.map((r) => r.x - r.r - 14));
    const right = Math.max(...state.rings.map((r) => r.x + r.r + 14));
    const top = Math.min(...state.rings.map((r) => r.y - r.r - 14));
    const bottom = Math.max(...state.rings.map((r) => r.y + r.r + 14));
    this.fit = {
      x: this.bounds.x + this.bounds.w / 2,
      y: this.bounds.y + this.bounds.h / 2,
      scale: Math.min(this.bounds.w / (right - left), this.bounds.h / (bottom - top), 1.7),
      cx: (left + right) / 2,
      cy: (top + bottom) / 2,
    };
  }
  project(x: number, y: number) {
    return {
      x: this.fit.x + (x - this.fit.cx) * this.fit.scale,
      y: this.fit.y + (y - this.fit.cy) * this.fit.scale,
    };
  }
  unproject(x: number, y: number) {
    return {
      x: this.fit.cx + (x - this.fit.x) / this.fit.scale,
      y: this.fit.cy + (y - this.fit.y) / this.fit.scale,
    };
  }
  arc(
    g: Graphics,
    x: number,
    y: number,
    r: number,
    a: number,
    b: number,
    hex: string,
    width: number,
    alpha = 255,
  ) {
    const count = Math.max(4, Math.ceil((Math.abs(b - a) * r) / 6));
    this.line(
      g,
      Array.from({ length: count + 1 }, (_, i) => [
        x + Math.cos(a + ((b - a) * i) / count) * r,
        y + Math.sin(a + ((b - a) * i) / count) * r,
      ]),
      hex,
      width,
      alpha,
    );
  }
  /** Annular metal strips give an actual thickness, directional bevel and enamel face. */
  metal(
    g: Graphics,
    ring: Ring,
    x: number,
    y: number,
    scale: number,
    selected = false,
    segment?: [number, number],
  ) {
    const r = ring.r * scale,
      thickness = 15 * scale;
    const a = segment ? segment[0] : ring.angle + ring.gap / 2;
    const b = segment ? segment[1] : ring.angle + TAU - ring.gap / 2;
    const hex = ring.color || '#5abbb1';
    if (selected && !segment) {
      this.arc(g, x, y, r, a, b, MINT, thickness + 12, 20);
      this.arc(g, x, y, r, a, b, MINT, thickness + 6, 35);
    }
    this.arc(g, x + 2, y + 8 * scale, r, a, b, '#00090d', thickness + 8, 110);
    this.arc(g, x, y + 4 * scale, r, a, b, '#664b2d', thickness + 1);
    const count = Math.max(6, Math.ceil(((b - a) * r) / 7));
    const strips: [number, number, string, number][] = [
      [-0.5, -0.37, '#765932', 0.85],
      [-0.37, -0.27, '#f8d69b', 1.05],
      [-0.27, 0.27, hex, 0.95],
      [0.27, 0.38, '#a8793c', 0.8],
      [0.38, 0.5, '#ffe4aa', 1.06],
    ];
    for (let i = 0; i < count; i++) {
      const t = a + ((b - a) * i) / count,
        next = a + ((b - a) * (i + 1)) / count + 0.002;
      const light = 0.7 + 0.34 * Math.cos(t + Math.PI * 0.7);
      for (const [inner, outer, base, strength] of strips) {
        const ri = r + inner * thickness,
          ro = r + outer * thickness;
        this.polygon(
          g,
          [
            [x + Math.cos(t) * ri, y + Math.sin(t) * ri],
            [x + Math.cos(next) * ri, y + Math.sin(next) * ri],
            [x + Math.cos(next) * ro, y + Math.sin(next) * ro],
            [x + Math.cos(t) * ro, y + Math.sin(t) * ro],
          ],
          shade(base, light * strength),
        );
      }
    }
    if (segment) return;
    for (let t = a + 0.12, i = 0; t < b - 0.1; t += 0.17, i++) {
      const r1 = r - thickness * 0.19,
        r2 = r1 + thickness * (i % 4 ? 0.14 : 0.31);
      this.line(
        g,
        [
          [x + Math.cos(t) * r1, y + Math.sin(t) * r1],
          [x + Math.cos(t) * r2, y + Math.sin(t) * r2],
        ],
        '#f5ddaa',
        0.65,
        165,
      );
      if (i % 8 === 4)
        this.star(g, x + Math.cos(t) * r, y + Math.sin(t) * r, 2.3 * scale, '#f7d494', 200);
    }
    for (const t of [a, b]) {
      const ex = x + Math.cos(t) * r,
        ey = y + Math.sin(t) * r;
      this.circle(g, ex, ey, thickness / 2, '#9c753f');
      this.circle(g, ex, ey - 1.5, thickness / 2 - 1, '#f6db9e');
      this.circle(g, ex, ey - 1.5, thickness / 2 - 3, hex);
      this.line(
        g,
        [
          [ex - thickness * 0.2, ey - 2],
          [ex + thickness * 0.2, ey + 1],
        ],
        '#fff4c9',
        1,
      );
    }
  }
  drawBoard(
    state: State,
    selected: string | null,
    hint: Hint | null,
    blocked: string | null = null,
  ) {
    const g = this.board;
    g.clear();
    this.boardLabels.destroyAllChildren();
    if (state.rings[0]?.wire) {
      this.metalScene.draw(state, selected, hint);
      return;
    }
    this.boardFit(state);
    const f = this.fit;
    this.circle(g, f.x, f.y, Math.min(this.bounds.w, this.bounds.h) * 0.48, '#b8a472', 30, 0.7);
    for (let i = 0; i < 60; i++) {
      const a = (i * TAU) / 60,
        r = Math.min(this.bounds.w, this.bounds.h) * 0.49;
      this.line(
        g,
        [
          [f.x + Math.cos(a) * r, f.y + Math.sin(a) * r],
          [f.x + Math.cos(a) * (r + (i % 5 ? 3 : 7)), f.y + Math.sin(a) * (r + (i % 5 ? 3 : 7))],
        ],
        GOLD,
        0.6,
        55,
      );
    }
    for (const ring of state.rings.filter((r) => !r.removed)) {
      const p = this.project(ring.x, ring.y);
      this.metal(g, ring, p.x, p.y, f.scale, ring.id === selected);
    }
    state.rings.forEach((a, i) => {
      if (a.removed) return;
      state.rings.slice(i + 1).forEach((b) => {
        if (b.removed) return;
        circleIntersections(a, b)?.forEach((p, k) => {
          const aa = Math.atan2(p.y - a.y, p.x - a.x),
            ab = Math.atan2(p.y - b.y, p.x - b.x);
          if (!hasBandAt(a, aa) || !hasBandAt(b, ab)) return;
          const over = k === 0 ? a : b,
            angle = k === 0 ? aa : ab;
          const rel = (((angle - over.angle) % TAU) + TAU) % TAU;
          const start = over.angle + Math.max(over.gap / 2, rel - 14 / over.r);
          const end = over.angle + Math.min(TAU - over.gap / 2, rel + 14 / over.r);
          const q = this.project(over.x, over.y);
          this.arc(g, q.x, q.y, over.r * f.scale, start, end, '#04121b', 22 * f.scale);
          this.metal(g, over, q.x, q.y, f.scale, false, [start, end]);
        });
      });
    });
    for (const ring of state.rings.filter((r) => !r.removed)) {
      const p = this.project(ring.x, ring.y);
      if (state.goalRingIds?.includes(ring.id))
        this.crystal(g, p.x, p.y, Math.min(24, ring.r * f.scale * 0.29));
      if (isLocked(state, ring.id)) {
        const y = p.y + (state.goalRingIds?.includes(ring.id) ? 34 : 0);
        this.circle(g, p.x, y, 14, '#10252b', 235);
        this.icon(g, 'lock', p.x, y, GOLD);
        const keys =
          ring.requires?.filter((id) => !state.rings.find((r) => r.id === id)?.removed) || [];
        const remaining = keys.length || Math.max(0, (ring.unlockAfter || 0) - state.releasedCount);
        this.text(String(remaining), p.x + 19, y, 13, GOLD, 30, this.boardLabels);
      }
      const dependents = state.rings.filter((r) => !r.removed && r.requires?.includes(ring.id));
      if (dependents.length) {
        this.star(g, p.x, p.y - (state.goalRingIds?.includes(ring.id) ? 30 : 0), 8, GOLD);
        if (selected && dependents.some((r) => r.id === selected)) {
          this.circle(g, p.x, p.y, ring.r * f.scale + 12, GOLD, 170, 1.2);
        }
      }
    }
    const focus = state.rings.find((r) => r.id === selected && !r.removed);
    if (focus && !isLocked(state, focus.id)) {
      for (const blocker of getBlockers(state, focus.id))
        blocker.points.forEach((p, i) => {
          const q = this.project(p.x, p.y),
            clear = clearsOpening(focus, blocker.angles[i]!);
          this.circle(g, q.x, q.y, 6, '#071b23', 245);
          if (clear)
            this.line(
              g,
              [
                [q.x - 3, q.y],
                [q.x - 1, q.y + 2],
                [q.x + 4, q.y - 3],
              ],
              MINT,
              1.6,
            );
          else {
            const c = blocked ? '#ff9c83' : '#cf9d78';
            this.line(
              g,
              [
                [q.x - 2, q.y - 2],
                [q.x + 2, q.y + 2],
              ],
              c,
              1.5,
            );
            this.line(
              g,
              [
                [q.x + 2, q.y - 2],
                [q.x - 2, q.y + 2],
              ],
              c,
              1.5,
            );
          }
        });
      if (canRelease(state, focus.id)) {
        const p = this.project(focus.x, focus.y),
          a = focus.angle + Math.PI;
        const ux = Math.cos(a),
          uy = Math.sin(a),
          r = (focus.r + 20) * f.scale;
        this.line(
          g,
          [
            [p.x + ux * r, p.y + uy * r],
            [p.x + ux * (r + 20), p.y + uy * (r + 20)],
          ],
          MINT,
          2,
        );
        this.line(
          g,
          [
            [p.x + ux * (r + 14) - uy * 5, p.y + uy * (r + 14) + ux * 5],
            [p.x + ux * (r + 20), p.y + uy * (r + 20)],
            [p.x + ux * (r + 14) + uy * 5, p.y + uy * (r + 14) - ux * 5],
          ],
          MINT,
          2,
        );
      }
    }
    if (hint) {
      const ring = state.rings.find((r) => r.id === hint.ringId && !r.removed);
      if (ring) {
        const p = this.project(ring.x, ring.y),
          r = (ring.r + 16) * f.scale;
        this.arc(
          g,
          p.x,
          p.y,
          r,
          hint.angle - ring.gap / 2,
          hint.angle + ring.gap / 2,
          MINT,
          2,
          140,
        );
        this.star(
          g,
          p.x + Math.cos(hint.angle) * (r + 8),
          p.y + Math.sin(hint.angle) * (r + 8),
          8,
          MINT,
        );
      }
    }
  }
  artifact(chapter: number, x: number, y: number, size: number, restored: number) {
    const g = this.ui,
      r = size * 0.36;
    this.circle(g, x, y, r + 23, '#061923', 220);
    this.circle(g, x, y, r + 20, GOLD, 100, 1);
    this.circle(g, x, y, r + 15, '#b18b52', 170, 3);
    for (let i = 0; i < 60; i++) {
      const a = (i * TAU) / 60;
      this.line(
        g,
        [
          [x + Math.cos(a) * (r + 5), y + Math.sin(a) * (r + 5)],
          [x + Math.cos(a) * (r + (i % 5 ? 9 : 13)), y + Math.sin(a) * (r + (i % 5 ? 9 : 13))],
        ],
        GOLD,
        0.8,
        170,
      );
    }
    if (chapter === 1) {
      for (let i = 0; i < 8; i++) {
        const a = (i * TAU) / 8;
        this.polygon(
          g,
          [
            [x, y],
            [x + Math.cos(a - 0.07) * r * 0.24, y + Math.sin(a - 0.07) * r * 0.24],
            [x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85],
            [x + Math.cos(a + 0.07) * r * 0.24, y + Math.sin(a + 0.07) * r * 0.24],
          ],
          color(i % 2 ? '#8da5a4' : '#d4b477'),
        );
      }
    } else if (chapter === 2) {
      this.circle(g, x, y, r * 0.66, '#e0c487');
      this.circle(g, x + r * 0.3, y - r * 0.2, r * 0.66, '#0b2633');
      this.star(g, x + r * 0.36, y + r * 0.1, r * 0.23, MINT);
    } else if (chapter === 3) {
      this.polygon(
        g,
        [
          [x, y - r * 0.8],
          [x + r * 0.58, y],
          [x, y + r * 0.8],
          [x - r * 0.58, y],
        ],
        color('#1b625f'),
      );
      this.line(
        g,
        [
          [x, y - r * 0.8],
          [x + r * 0.58, y],
          [x, y + r * 0.8],
          [x - r * 0.58, y],
          [x, y - r * 0.8],
        ],
        GOLD,
        4,
      );
      this.line(
        g,
        [
          [x - r * 0.2, y + r * 0.25],
          [x + r * 0.2, y - r * 0.25],
        ],
        '#d6fff1',
        2,
        130,
      );
    } else {
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI) / 3;
        this.line(
          g,
          Array.from({ length: 73 }, (_, i) => {
            const t = (i * TAU) / 72,
              px = Math.cos(t) * r * 0.9,
              py = Math.sin(t) * r * 0.36;
            return [
              x + px * Math.cos(a) - py * Math.sin(a),
              y + px * Math.sin(a) + py * Math.cos(a),
            ];
          }),
          k === 1 ? '#7ad9cc' : GOLD,
          4,
        );
      }
    }
    this.crystal(g, x, y, chapter === 2 ? 14 : 22);
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 6,
        px = x + Math.cos(a) * (r + 20),
        py = y + Math.sin(a) * (r + 20);
      this.circle(g, px, py, 8, '#14363b');
      this.circle(g, px, py, 8, GOLD, 180, 1);
      this.star(g, px, py, 5, i < restored ? MINT : '#506269');
    }
  }
  animate(time: number, flights: Flight[], reduced: boolean, playing: boolean) {
    const g = this.effects;
    g.clear();
    const pressed = this.controls.find((c) => c.id === this.pressed);
    if (pressed) this.box(g, pressed.x, pressed.y, pressed.w, pressed.h, 24, '#fff1b7', 35);
    if (this.resultStars) {
      const result = this.resultStars;
      for (let i = 0; i < result.medal; i++) {
        const t = reduced ? 1 : Math.max(0, Math.min(1, (time - result.start - i * 0.13) / 0.25));
        if (t > 0)
          this.star(
            g,
            result.x + (i - 1) * 45,
            result.y,
            (i === 1 ? 17 : 12) * (1 + Math.sin(t * Math.PI) * 0.35),
            GOLD,
            Math.round(t * 255),
          );
      }
    }
    if (!reduced)
      for (let i = 0; i < 14; i++) {
        const x = (i * 137.3 + 42) % this.w,
          y = (i * 83.9 + this.h - time * (3 + (i % 4))) % this.h;
        this.star(
          g,
          x,
          y,
          i % 4 === 0 ? 2 : 1,
          i % 2 ? GOLD : MINT,
          35 + Math.round(Math.sin(time + i) * 20),
        );
      }
    if (this.hero.node.active && !reduced)
      this.hero.node.setPosition(
        this.hero.node.position.x,
        this.h / 2 - this.heroY + Math.sin(time * 1.1) * 3,
        0,
      );
    if (!playing || reduced) return;
    this.pulses = this.pulses.filter((pulse) => time - pulse.start < 0.45);
    for (const pulse of this.pulses) {
      const t = (time - pulse.start) / 0.45,
        p = this.project(pulse.x, pulse.y);
      if (pulse.unlocked) {
        this.circle(g, p.x, p.y, 16 + t * 32, MINT, Math.round(230 * (1 - t)), 2);
        this.star(g, p.x, p.y, 12 * (1 - t), GOLD, Math.round(255 * (1 - t)));
      } else {
        const x = p.x + Math.sin(t * Math.PI * 6) * 3 * (1 - t);
        this.circle(g, x, p.y, 9 + t * 3, '#ff9c83', Math.round(220 * (1 - t)), 1.8);
      }
    }
    for (const flight of flights) {
      const t = Math.min(1, flight.age / (flight.goal ? 0.65 : 0.38)),
        eased = 1 - Math.pow(1 - t, 3),
        p = this.project(flight.ring.x, flight.ring.y);
      const dx = -Math.cos(flight.ring.angle) * eased * 80,
        dy = -Math.sin(flight.ring.angle) * eased * 80;
      if (flight.goal) this.crystal(g, p.x, p.y - eased * 100, 26 * (1 - t * 0.45));
      if (t < 0.65) this.metal(g, flight.ring, p.x + dx, p.y + dy, this.fit.scale * (1 - t * 0.5));
      for (let i = 0; i < 12; i++) {
        const a = (i * TAU) / 12 + t,
          radius = eased * 55;
        this.star(
          g,
          p.x + dx + Math.cos(a) * radius,
          p.y + dy + Math.sin(a) * radius,
          3 * (1 - t),
          i % 2 ? GOLD : MINT,
          Math.round(255 * (1 - t)),
        );
      }
    }
  }
  hit(x: number, y: number) {
    return [...this.controls]
      .reverse()
      .find((c) => !c.disabled && x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
  }
  destroy() {
    this.disposed = true;
    this.root.destroy();
    this.camera.node.destroy();
    this.ownedAssets.forEach((asset) => asset.destroy());
  }
}
