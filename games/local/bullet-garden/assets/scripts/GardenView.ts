import {
  Camera,
  Canvas,
  Color,
  Graphics,
  ImageAsset,
  Label,
  Layers,
  Node,
  Rect,
  ResolutionPolicy,
  Sprite,
  SpriteFrame,
  Texture2D,
  UITransform,
  resources,
  sys,
  view,
} from 'cc';
import { getRunLevel, skillTarget, SKILLS, HERO_FRAMES, gardenCamera, createHeroMotion, advanceHeroMotion } from './generated/core.js';
export type Box = { x: number; y: number; w: number; h: number };
export type Control = { id: string; label: string; rect: Box; disabled: boolean };
export const GOLD = '#efd28a',
  CREAM = '#fff0c1',
  GREEN = '#203c2c';
const color = (hex: string, alpha = 255) => {
  const c = new Color().fromHEX(hex);
  c.a = alpha;
  return c;
};
const ACTORS = [
  'hero',
  'sprout',
  'runner',
  'brute',
  'charger',
  'brood',
  'shield',
  'burrower',
  'glider',
  'spitter',
  'warden',
  'bastionlord',
  'overgrowth',
  'thorn',
  'ice',
  'mushroom',
];
const aliases: Record<string, string> = {
  minion: 'sprout',
  sentinel: 'shield',
  'sprout-helper': 'sprout',
  shrub: 'thorn',
  trench: 'thorn',
  frost: 'ice',
  poison: 'mushroom',
  sunflower: 'thorn',
  stormreed: 'ice',
  bloomturret: 'mushroom',
};

/** Every visible game element is a Creator Sprite, Graphics primitive or Label. */
export class GardenView {
  root: Node;
  camera: Camera;
  backdrop: Sprite;
  ground: Sprite;
  field: Graphics;
  actors: Node;
  effects: Graphics;
  ui: Graphics;
  labels: Node;
  frames = new Map<string, SpriteFrame>();
  owned: (Texture2D | SpriteFrame)[] = [];
  spritePool: Sprite[] = [];
  labelPool: Label[] = [];
  si = 0;
  li = 0;
  controls: Control[] = [];
  w = 390;
  h = 844;
  top = 12;
  bottom = 10;
  landscape = false;
  battle: Box = { x: 0, y: 76, w: 390, h: 540 };
  cameraX = 720;
  cameraY = 450;
  zoom = 0.8;
  loaded = new Set<string>();
  loading = new Set<string>();
  failed = false;
  disposed = false;
  images: ImageAsset[] = [];
  left = 10;
  right = 10;
  artCount = 7;
  heroRun: any = null;
  heroMotion: any = null;
  heroPose: any = null;
  bulletOrigins = new Map<number, { x: number; y: number; time: number }>();
  constructor(
    parent: Node,
    private changed: () => void,
  ) {
    this.root = new Node('GardenCanvas');
    parent.addChild(this.root);
    this.root.layer = Layers.Enum.UI_2D;
    this.root.addComponent(UITransform);
    const canvas = this.root.addComponent(Canvas);
    const camera = new Node('GardenCamera');
    parent.addChild(camera);
    this.camera = camera.addComponent(Camera);
    this.camera.projection = Camera.ProjectionType.ORTHO;
    this.camera.near = 0.1;
    this.camera.far = 2000;
    this.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    this.camera.clearColor = color(GREEN);
    this.camera.visibility = Layers.Enum.UI_2D;
    canvas.cameraComponent = this.camera;
    this.backdrop = this.node('HomeArt').addComponent(Sprite);
    this.ground = this.node('GroundArt').addComponent(Sprite);
    this.field = this.node('TerrainAndWarnings').addComponent(Graphics);
    this.actors = this.node('Actors');
    this.effects = this.node('BulletsAndEffects').addComponent(Graphics);
    this.ui = this.node('Interface').addComponent(Graphics);
    this.labels = this.node('Labels');
    this.resize();
    this.loadArt();
  }
  node(name: string, parent = this.root) {
    const n = new Node(name);
    n.layer = Layers.Enum.UI_2D;
    parent.addChild(n);
    n.addComponent(UITransform);
    return n;
  }
  get ready() {
    return this.loaded.size === this.artCount;
  }
  loadArt() {
    this.failed = false;
    for (const name of ['home', 'home-battle', 'ground', 'actors', 'icon', 'levels', 'hero-motion']) {
      if (this.loaded.has(name) || this.loading.has(name)) continue;
      this.loading.add(name);
      resources.load(`art/${name}`, ImageAsset, (error, asset) => {
        if (this.disposed) return;
        this.loading.delete(name);
        if (error) {
          this.failed = true;
          this.changed();
          return;
        }
        asset.addRef();
        this.images.push(asset);
        const texture = new Texture2D();
        texture.image = asset;
        this.owned.push(texture);
        const frame = new SpriteFrame();
        frame.texture = texture;
        this.frames.set(name, frame);
        this.owned.push(frame);
        if (name === 'actors')
          ACTORS.forEach((key, i) => {
            const tile = new SpriteFrame();
            tile.texture = texture;
            tile.rect = new Rect(
              ((i % 4) * asset.width) / 4,
              (Math.floor(i / 4) * asset.height) / 4,
              asset.width / 4,
              asset.height / 4,
            );
            this.frames.set(key, tile);
            this.owned.push(tile);
          });
        if (name === 'hero-motion')
          HERO_FRAMES.forEach((rect: number[], i: number) => {
            const tile = new SpriteFrame();
            tile.texture = texture;
            tile.rect = new Rect(rect[0] - 2, rect[1] - 2, rect[2] + 4, rect[3] + 4);
            this.frames.set(`hero-${i}`, tile);
            this.owned.push(tile);
          });
        this.loaded.add(name);
        this.resize();
        this.changed();
      });
    }
  }
  resize() {
    const frame = view.getFrameSize();
    this.w = Math.max(280, frame.width);
    this.h = Math.max(320, frame.height);
    this.landscape = this.w > this.h;
    view.setDesignResolutionSize(this.w, this.h, ResolutionPolicy.SHOW_ALL);
    this.root.getComponent(UITransform)!.setContentSize(this.w, this.h);
    this.root.setPosition(this.w / 2, this.h / 2);
    this.camera.node.setPosition(this.w / 2, this.h / 2, 1000);
    this.camera.orthoHeight = this.h / 2;
    const safe = sys.getSafeAreaRect(false);
    this.top = Math.max(12, this.h - safe.y - safe.height);
    this.bottom = Math.max(10, safe.y);
    this.left = Math.max(10, safe.x);
    this.right = Math.max(10, this.w - safe.x - safe.width);
    if (!sys.isBrowser) {
      const sdk = (globalThis as any).tap || (globalThis as any).wx;
      try {
        const capsule = sdk?.getMenuButtonBoundingClientRect?.();
        if (capsule?.bottom) this.top = Math.max(this.top, capsule.bottom + 8);
      } catch {}
    }
    this.battle = {
      x: 0,
      y: this.top + 65,
      w: this.w,
      h: this.h - this.top - 65 - (this.landscape ? 0 : Math.max(120, this.h * 0.24)) - this.bottom,
    };
  }
  pos(n: Node, x: number, y: number) {
    n.setPosition(x - this.w / 2, this.h / 2 - y);
  }
  box(
    g: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    hex: string,
    radius = 14,
    alpha = 255,
    stroke = 0,
  ) {
    g.roundRect(x - this.w / 2, this.h / 2 - y - h, w, h, Math.min(radius, h / 2));
    if (stroke) {
      g.strokeColor = color(hex, alpha);
      g.lineWidth = stroke;
      g.stroke();
    } else {
      g.fillColor = color(hex, alpha);
      g.fill();
    }
  }
  circle(g: Graphics, x: number, y: number, r: number, hex: string, alpha = 255, stroke = 0) {
    g.circle(x - this.w / 2, this.h / 2 - y, r);
    if (stroke) {
      g.strokeColor = color(hex, alpha);
      g.lineWidth = stroke;
      g.stroke();
    } else {
      g.fillColor = color(hex, alpha);
      g.fill();
    }
  }
  line(g: Graphics, x: number, y: number, xx: number, yy: number, hex: string, width = 2) {
    g.moveTo(x - this.w / 2, this.h / 2 - y);
    g.lineTo(xx - this.w / 2, this.h / 2 - yy);
    g.strokeColor = color(hex);
    g.lineWidth = width;
    g.stroke();
  }
  text(
    str: string,
    x: number,
    y: number,
    size = 20,
    hex = CREAM,
    width = this.w - 32,
    height = size * 2.8,
  ) {
    let label = this.labelPool[this.li++];
    if (!label) {
      label = this.node('Text', this.labels).addComponent(Label);
      this.labelPool.push(label);
      label.fontFamily = 'Microsoft YaHei, sans-serif';
      label.horizontalAlign = Label.HorizontalAlign.CENTER;
      label.verticalAlign = Label.VerticalAlign.CENTER;
      label.overflow = Label.Overflow.SHRINK;
      label.enableWrapText = true;
    }
    label.node.active = true;
    this.pos(label.node, x, y);
    label.node.getComponent(UITransform)!.setContentSize(width, height);
    if (label.string !== str) label.string = str;
    label.fontSize = size;
    label.lineHeight = size * 1.4;
    label.color = color(hex);
    label.fontFamily = 'Microsoft YaHei, sans-serif';
    label.isBold = false;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    return label;
  }
  heading(str: string, x: number, y: number, size: number, width = this.w - 32, hex = CREAM) {
    const label = this.text(str, x, y, size, hex, width, size * 1.7);
    label.fontFamily = 'Noto Serif SC, Songti SC, SimSun, serif';
    label.isBold = true;
    return label;
  }
  polygon(points: number[][], hex: string, alpha = 255) {
    const g = this.ui;
    points.forEach(([x, y], i) => {
      if (i === 0) g.moveTo(x - this.w / 2, this.h / 2 - y);
      else g.lineTo(x - this.w / 2, this.h / 2 - y);
    });
    g.close();
    g.fillColor = color(hex, alpha);
    g.fill();
  }
  sprig(x: number, y: number, direction = 1, size = 1) {
    this.line(this.ui, x, y, x + 32 * size * direction, y - 12 * size, '#bca365', 1.4);
    for (let i = 0; i < 3; i++) {
      const xx = x + (8 + i * 10) * size * direction, yy = y - (3 + i * 4) * size;
      this.polygon([[xx, yy], [xx - 7 * size * direction, yy - 10 * size], [xx + 3 * size * direction, yy - 6 * size]], '#9ca86b');
      this.polygon([[xx, yy], [xx + 2 * size * direction, yy + 7 * size], [xx + 8 * size * direction, yy + 2 * size]], '#d4bb75');
    }
    this.circle(this.ui, x, y, 3 * size, GOLD);
  }
  icon(kind: string, x: number, y: number, size = 22, hex = GOLD) {
    const s = size / 24;
    const line = (a: number, b: number, c: number, d: number) => this.line(this.ui, x + a * s, y + b * s, x + c * s, y + d * s, hex, 2 * s);
    const poly = (p: number[][]) => this.polygon(p.map(([a, b]) => [x + a * s, y + b * s]), hex);
    if (kind === 'play') poly([[-6, -10], [10, 0], [-6, 10]]);
    else if (kind === 'back') { line(5, -10, -5, 0); line(-5, 0, 5, 10); }
    else if (kind === 'bolt') poly([[3, -13], [-10, 2], [-1, 2], [-4, 13], [11, -3], [2, -3]]);
    else if (kind === 'camp') { poly([[0, -12], [-13, 10], [13, 10]]); this.polygon([[x, y - 3 * s], [x - 4 * s, y + 10 * s], [x + 4 * s, y + 10 * s]], GREEN); }
    else if (kind === 'book' || kind === 'map') {
      for (const d of [-1, 1]) { line(0, -8, d * 11, -10); line(d * 11, -10, d * 11, 10); line(d * 11, 10, 0, 8); line(d * 3, -3, d * 8, -4); line(d * 3, 2, d * 8, 1); }
      line(0, -8, 0, 9);
    } else if (kind === 'gear') {
      this.circle(this.ui, x, y, 8 * s, hex, 255, 3 * s);
      this.circle(this.ui, x, y, 2 * s, hex);
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; line(Math.cos(a) * 8, Math.sin(a) * 8, Math.cos(a) * 12, Math.sin(a) * 12); }
    } else if (kind === 'coin') {
      this.circle(this.ui, x, y, 10 * s, hex, 255, 2 * s);
      poly([[0, -6], [4, 0], [0, 6], [-4, 0]]);
    } else if (kind === 'lock') {
      this.circle(this.ui, x, y - 3 * s, 6 * s, hex, 255, 2 * s);
      this.box(this.ui, x - 9 * s, y - 2 * s, 18 * s, 13 * s, hex, 3 * s);
      this.circle(this.ui, x, y + 4 * s, 2 * s, GREEN);
    } else if (kind === 'bloom') {
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; this.circle(this.ui, x + Math.cos(a) * 7 * s, y + Math.sin(a) * 7 * s, 4 * s, CREAM); }
      this.circle(this.ui, x, y, 4 * s, GOLD);
    } else {
      poly([[-10, 10], [-7, -5], [2, -11], [12, -12], [8, 2], [1, 8]]);
      this.line(this.ui, x - 9 * s, y + 9 * s, x + 6 * s, y - 6 * s, GREEN, 1.5 * s);
    }
  }
  badge(id: string, label: string, icon: string, x: number, y: number, r = 25, disabled = false, primary = false) {
    this.controls.push({ id, label, disabled, rect: { x: x - r - 3, y: y - r - 3, w: r * 2 + 6, h: r * 2 + 6 } });
    this.circle(this.ui, x, y + 3, r + 2, '#091d16');
    this.circle(this.ui, x, y, r + 1, disabled ? '#566255' : '#ab8546');
    this.circle(this.ui, x, y, r - 1, disabled ? '#293f33' : primary ? '#eccb7b' : '#1c3a2c');
    this.circle(this.ui, x, y - 1, r - 4, disabled ? '#71806a' : GOLD, 240, 1);
    this.icon(icon, x, y - 1, r * 0.95, disabled ? '#819378' : primary ? GREEN : GOLD);
  }
  card(id: string, title: string, description: string, icon: string, x: number, y: number, w: number, h: number, disabled = false) {
    this.controls.push({ id, label: `${title}，${description}`, disabled, rect: { x, y, w, h } });
    this.panel(x, y, w, h, !disabled);
    const r = Math.min(29, h * 0.27), cx = x + r + 18;
    this.circle(this.ui, cx, y + h / 2, r + 2, '#b59555');
    this.circle(this.ui, cx, y + h / 2, r, GREEN);
    this.circle(this.ui, cx, y + h / 2, r - 4, GOLD, 180, 1);
    this.icon(icon, cx, y + h / 2, r * 1.1, disabled ? '#84977c' : GOLD);
    const left = x + r * 2 + 32, tw = w - (left - x) - 17;
    const heading = this.heading(title, left + tw / 2, y + h * 0.3, 21, tw, disabled ? GOLD : GREEN);
    heading.horizontalAlign = Label.HorizontalAlign.LEFT;
    const desc = this.text(description, left + tw / 2, y + h * 0.66, 14, disabled ? '#bfcaac' : '#586044', tw, h * 0.43);
    desc.horizontalAlign = Label.HorizontalAlign.LEFT;
  }
  image(sprite: Sprite, key: string, x: number, y: number, w: number, h = w) {
    sprite.spriteFrame = this.frames.get(key) || this.frames.get(aliases[key]) || null;
    sprite.node.active = !!sprite.spriteFrame;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.node.getComponent(UITransform)!.setContentSize(w, h);
    this.pos(sprite.node, x, y);
  }
  actor(key: string, x: number, y: number, size: number, alpha = 255) {
    let sprite = this.spritePool[this.si++];
    if (!sprite) {
      sprite = this.node('Actor', this.actors).addComponent(Sprite);
      this.spritePool.push(sprite);
    }
    this.image(sprite, key, x, y, size);
    sprite.node.angle = 0;
    sprite.node.setScale(1, 1, 1);
    sprite.color = new Color(255, 255, 255, alpha);
    return sprite;
  }
  begin(battle = false, screen = 'home') {
    this.controls = [];
    this.si = 0;
    this.li = 0;
    this.field.clear();
    this.effects.clear();
    this.ui.clear();
    this.backdrop.node.active = !battle;
    this.ground.node.active = battle;
    if (this.backdrop.node.active) {
      const key = screen === 'levels' ? 'levels' : screen === 'home' ? 'home-battle' : 'home';
      const f = this.frames.get(key);
      const scale = Math.max(this.w / (f?.width || 852), this.h / (f?.height || 1846));
      this.image(
        this.backdrop,
        key,
        this.w / 2,
        this.h / 2,
        (f?.width || 852) * scale,
        (f?.height || 1846) * scale,
      );
    }
    if (!battle && screen !== 'home' && screen !== 'levels') {
      this.box(this.field, 0, 0, this.w, this.h, '#0c241b', 0, 224);
    }
  }
  end() {
    for (let i = this.si; i < this.spritePool.length; i++) this.spritePool[i].node.active = false;
    for (let i = this.li; i < this.labelPool.length; i++) this.labelPool[i].node.active = false;
    if (this.ground.node.active) {
      const foot = (sprite: Sprite) => sprite.node.position.y - sprite.node.getComponent(UITransform)!.height / 2;
      this.spritePool.slice(0, this.si).sort((a, b) => foot(b) - foot(a)).forEach((sprite, i) => sprite.node.setSiblingIndex(i));
    }
  }
  button(
    id: string,
    label: string,
    x: number,
    y: number,
    w: number,
    h = 54,
    primary = false,
    disabled = false,
  ) {
    const rect = { x: x - w / 2, y: y - h / 2, w, h };
    this.controls.push({ id, label, rect, disabled });
    this.box(this.ui, rect.x, rect.y + 4, w, h, '#071c14', 12);
    this.box(this.ui, rect.x, rect.y, w, h, disabled ? '#3b4d3e' : primary ? '#aa7f37' : '#0e281e', 12);
    this.box(this.ui, rect.x + 2, rect.y + 2, w - 4, h - 6, disabled ? '#344637' : primary ? '#f5dfa3' : '#294a35', 10);
    this.box(this.ui, rect.x + 5, rect.y + h * 0.5, w - 10, h * 0.4 - 2, primary ? '#dabb70' : '#1c3929', 7, disabled ? 0 : 120);
    this.box(
      this.ui,
      rect.x + 2,
      rect.y + 2,
      w - 4,
      h - 4,
      disabled ? '#7c8370' : GOLD,
      10,
      255,
      2,
    );
    if (primary) {
      this.box(this.ui, rect.x + 7, rect.y + 7, w - 14, h - 14, '#ab853e', 6, 230, 1);
      this.sprig(rect.x + 7, rect.y + h - 6, 1, 0.55);
      this.sprig(rect.x + w - 7, rect.y + 10, -1, 0.55);
    }
    const symbol = ({ start: 'play', levels: 'map', depart: 'leaf', back: 'back', next: 'play' } as Record<string, string>)[id];
    if (symbol) this.icon(symbol, rect.x + 25, y, primary ? 21 : 18, primary ? GREEN : GOLD);
    if (label !== '暂停')
      this.heading(
        label,
        x + (symbol ? 12 : 0),
        y,
        primary ? 24 : 18,
        w - (symbol ? 58 : 20),
        primary ? '#243522' : disabled ? '#98aa91' : CREAM,
      );
    else {
      for (const offset of [-8, 4]) this.box(this.ui, x + offset, y - 11, 5, 22, CREAM, 0);
    }
  }
  panel(x: number, y: number, w: number, h: number, paper = false) {
    this.box(this.ui, x, y + 4, w, h, '#091b14', 12, 220);
    this.box(this.ui, x, y, w, h, paper ? '#eddcb0' : '#172f23', 12, 248);
    this.box(this.ui, x + 2, y + 2, w - 4, h - 4, '#b49453', 10, 245, 2);
    this.box(this.ui, x + 6, y + 6, w - 12, h - 12, paper ? '#b9a16a' : '#5c7047', 7, 160, 1);
    if (h > 68) {
      this.sprig(x + 8, y + h - 9, 1, 0.65);
      this.sprig(x + w - 8, y + 13, -1, 0.65);
    }
  }
  hit(x: number, y: number) {
    return [...this.controls]
      .reverse()
      .find(
        (b) =>
          !b.disabled &&
          x >= b.rect.x &&
          x <= b.rect.x + b.rect.w &&
          y >= b.rect.y &&
          y <= b.rect.y + b.rect.h,
      );
  }
  levelNode(
    id: string,
    order: number,
    x: number,
    y: number,
    selected: boolean,
    locked: boolean,
    cleared: boolean,
  ) {
    const r = 27;
    this.controls.push({
      id: `level:${id}`,
      label: `${order} ${locked ? '未解锁' : cleared ? '已通关' : '可挑战'}`,
      disabled: locked,
      rect: { x: x - 31, y: y - 31, w: 62, h: 62 },
    });
    if (selected) { this.circle(this.ui, x, y, r + 7, '#ffe78a', 180, 2); this.sprig(x - 24, y + 26, -1, 0.7); this.sprig(x + 24, y + 26, 1, 0.7); }
    this.circle(this.ui, x, y + 4, r + 2, '#16231b');
    this.circle(this.ui, x, y, r + 2, locked ? '#5e6456' : GOLD);
    this.circle(this.ui, x, y, r - 3, locked ? '#303c32' : selected ? '#325734' : '#9d6e27');
    this.circle(this.ui, x, y, r - 6, locked ? '#929686' : '#fff0bb', 255, 1);
    if (!locked) this.heading(String(order), x, y - 1, 27, 45);
    if (locked) {
      this.icon('lock', x, y, 21, '#a2ad95');
    }
    if (cleared)
      this.text('已守护', x, y + 40, 11, CREAM, 62, 20);
  }
  world(x: number, y: number) {
    return {
      x: this.battle.w / 2 + (x - this.cameraX) * this.zoom,
      y: this.battle.y + this.battle.h / 2 + (y - this.cameraY) * this.zoom,
    };
  }
  unworld(x: number, y: number) {
    return {
      x: this.cameraX + (x - this.battle.w / 2) / this.zoom,
      y: this.cameraY + (y - this.battle.y - this.battle.h / 2) / this.zoom,
    };
  }
  drawBattle(state: any, aim: { x: number; y: number; index: number } | null) {
    const level = getRunLevel(state),
      bounds = level.bounds;
    const camera = gardenCamera(bounds, this.battle);
    this.cameraX = camera.x;
    this.cameraY = camera.y;
    this.zoom = camera.zoom;
    const center = this.world((bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2);
    this.image(
      this.ground,
      'ground',
      center.x,
      center.y,
      (bounds.right - bounds.left + 72) * this.zoom,
      (bounds.bottom - bounds.top + 80) * this.zoom,
    );
    // Visible arena limits belong to the same logical world as movement and projectiles.
    const { left, right, top, bottom } = bounds;
    for (const [x1, y1, x2, y2] of [
      [left, top, right, top],
      [left, bottom, right, bottom],
      [left, top, left, bottom],
      [right, top, right, bottom],
    ]) {
      const a = this.world(x1, y1),
        b = this.world(x2, y2);
      this.line(this.field, a.x, a.y, b.x, b.y, '#426b42', 4);
    }
    for (const t of [...state.terrain, ...state.plants]) {
      const p = this.world(t.x, t.y);
      const r = (t.radius || 24) * this.zoom;
      this.circle(
        this.field,
        p.x,
        p.y,
        r,
        t.kind === 'ice' || t.kind === 'frost' ? '#8fd9e5' : '#7daf61',
        60,
      );
      this.actor(t.kind, p.x, p.y, Math.max(36, Math.min(74, r * 1.4)));
    }
    for (const t of state.telegraphs) {
      const p = this.world(t.x, t.y),
        danger = t.dangerous || ['charge', 'ranged', 'emerge'].includes(t.kind),
        hex = danger ? '#d64b45' : GOLD,
        r = (t.radius || 8) * this.zoom;
      this.circle(this.field, p.x, p.y, r, hex, 70);
      this.circle(this.field, p.x, p.y, r, hex, 235, 2);
      if (Number.isFinite(t.angle)) {
        const length = (t.length || 190) * this.zoom;
        this.line(
          this.field,
          p.x,
          p.y,
          p.x + Math.cos(t.angle) * length,
          p.y + Math.sin(t.angle) * length,
          hex,
          5,
        );
      }
      if (
        danger &&
        (p.x < 12 ||
          p.x > this.w - 12 ||
          p.y < this.battle.y + 12 ||
          p.y > this.battle.y + this.battle.h - 12)
      )
        this.circle(
          this.effects,
          Math.max(12, Math.min(this.w - 12, p.x)),
          Math.max(this.battle.y + 12, Math.min(this.battle.y + this.battle.h - 12, p.y)),
          8,
          hex,
        );
    }
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      const p = this.world(e.x, e.y);
      const visible =
        p.x > -30 &&
        p.x < this.w + 30 &&
        p.y > this.battle.y - 30 &&
        p.y < this.battle.y + this.battle.h + 30;
      if (!visible) {
        const dx = p.x - this.w / 2,
          dy = p.y - (this.battle.y + this.battle.h / 2),
          ratio = Math.min(
            (this.w / 2 - 14) / Math.max(1, Math.abs(dx)),
            (this.battle.h / 2 - 14) / Math.max(1, Math.abs(dy)),
          );
        const xx = this.w / 2 + dx * ratio,
          yy = this.battle.y + this.battle.h / 2 + dy * ratio;
        this.circle(this.effects, xx, yy, 5, '#b24153');
        continue;
      }
      const size = Math.max(34, e.radius * this.zoom * 2.4);
      this.circle(this.field, p.x, p.y + size * 0.3, size * 0.24, '#213021', 75);
      this.actor(e.kind, p.x, p.y - size * 0.12, size, e.layer === 'underground' ? 120 : 255);
      if (e.hp < e.maxHp) {
        this.box(this.effects, p.x - 19, p.y - size * 0.58, 38, 5, '#532c32', 2);
        this.box(this.effects, p.x - 19, p.y - size * 0.58, (38 * e.hp) / e.maxHp, 5, '#ed7161', 2);
      }
    }
    if (state.pet) {
      const p = this.world(state.pet.x, state.pet.y);
      this.actor('sprout-helper', p.x, p.y, 28);
    }
    const hero = this.world(state.player.x, state.player.y);
    if (state.player.invulnerable > 0)
      this.circle(this.effects, hero.x, hero.y, 28, '#fff4b2', 180, 2);
    if (this.heroRun !== state) {
      this.heroRun = state;
      this.heroMotion = createHeroMotion(state);
      this.bulletOrigins.clear();
    }
    const motion = advanceHeroMotion(this.heroMotion, state);
    const frameIndex = motion.frame * 8 + motion.direction;
    const source = HERO_FRAMES[frameIndex];
    const height = Math.max(22, Math.min(44, this.zoom * 76));
    const scale = height / 188, sw = (source[2] + 4) * scale, sh = (source[3] + 4) * scale;
    const anchor = [0.42, 0.42, 0.46, 0.57, 0.58, 0.57, 0.52, 0.44][motion.direction];
    const rx = Math.cos(motion.shotAngle) * motion.recoil, ry = Math.sin(motion.shotAngle) * motion.recoil * 0.55;
    const bob = motion.moving ? Math.abs(Math.sin(motion.stride / 88 * Math.PI * 2)) * 1.2 : 0;
    this.field.fillColor = color('#213021', 90);
    this.field.ellipse(hero.x - this.w / 2, this.h / 2 - hero.y, height * 0.24, height * 0.09);
    this.field.fill();
    const body = this.actor(`hero-${frameIndex}`, hero.x + sw * (0.5 - anchor) - rx, hero.y - sh / 2 - bob - ry, sw);
    body.node.getComponent(UITransform)!.setContentSize(sw, sh);
    body.node.angle = motion.lean;
    const muzzleOffsets = [[0.96,0.56],[0.96,0.60],[0.9,0.60],[0.06,0.58],[0.04,0.57],[0.10,0.47],[0.10,0.52],[0.96,0.45]];
    const offset = muzzleOffsets[motion.direction];
    const muzzle = { x: hero.x + sw * (offset[0] - anchor) - rx, y: hero.y - sh * (1 - offset[1]) - bob - ry };
    if (motion.flash) {
      const dx = Math.cos(motion.shotAngle), dy = Math.sin(motion.shotAngle);
      this.line(this.effects, muzzle.x, muzzle.y, muzzle.x + dx * 11, muzzle.y + dy * 11, '#ffca55', 5);
      this.circle(this.effects, muzzle.x, muzzle.y, 3.5, '#fff8cf');
    }
    this.heroPose = { ...motion, screen: hero, muzzle, width: sw, height: sh, frameIndex };
    const liveBullets = new Set<number>();
    for (const b of state.bullets) {
      const p = this.world(b.x, b.y),
        hostile = b.kind === 'hostile';
      liveBullets.add(b.id);
      if (b.source === 'normal' && b.generation === 0 && !b.reflected) {
        if (!this.bulletOrigins.has(b.id))
          this.bulletOrigins.set(b.id, { x: muzzle.x - hero.x, y: muzzle.y - hero.y, time: state.time });
        const origin = this.bulletOrigins.get(b.id)!;
        const blend = Math.max(0, 1 - (state.time - origin.time) / 0.12);
        p.x += origin.x * blend;
        p.y += origin.y * blend;
        this.line(this.effects, p.x - b.vx * 0.009 * this.zoom, p.y - b.vy * 0.009 * this.zoom, p.x, p.y, '#ffe7a0', 2);
      }
      this.circle(
        this.effects,
        p.x,
        p.y,
        Math.max(3, (b.radius || 4) * this.zoom),
        hostile ? '#d7427e' : '#fff4aa',
      );
      this.circle(this.effects, p.x, p.y, 7, hostile ? '#f293c0' : '#ffcb49', 65);
    }
    for (const id of this.bulletOrigins.keys()) if (!liveBullets.has(id)) this.bulletOrigins.delete(id);
    for (const e of state.skillEffects) {
      const p = this.world(e.x, e.y);
      this.circle(
        this.effects,
        p.x,
        p.y,
        e.radius * this.zoom,
        e.kind === 'gale' ? '#b6efd1' : '#ffde83',
        e.triggered ? 90 : 38,
      );
      this.circle(this.effects, p.x, p.y, e.radius * this.zoom, CREAM, 220, 2);
      if (e.width) {
        const end = this.world(e.targetX, e.targetY);
        this.line(
          this.effects,
          p.x,
          p.y,
          end.x,
          end.y,
          GOLD,
          Math.max(3, e.width * this.zoom * 0.4),
        );
      }
    }
    for (const particle of state.particles) {
      const p = this.world(particle.x, particle.y);
      this.circle(
        this.effects,
        p.x,
        p.y,
        particle.size,
        particle.color,
        Math.round((180 * particle.life) / particle.maxLife),
      );
    }
    if (aim) {
      const target = skillTarget(state, this.unworld(aim.x, aim.y), aim.index);
      if (target) {
        const p = this.world(target.point.x, target.point.y),
          def = SKILLS[state.skillSlots[aim.index].kind];
        this.line(
          this.effects,
          hero.x,
          hero.y,
          p.x,
          p.y,
          CREAM,
          def.shape === 'line' ? Math.max(2, def.width * this.zoom) : 2,
        );
        if (def.shape === 'circle') {
          this.circle(this.effects, p.x, p.y, def.radius * this.zoom, GOLD, 65);
          this.circle(this.effects, p.x, p.y, def.radius * this.zoom, CREAM, 240, 2);
        }
      }
    }
  }
  clientRect(rect: Box): Box {
    if (!sys.isBrowser) return { ...rect };
    const canvas = document.getElementById('GameCanvas');
    const box = canvas?.getBoundingClientRect();
    if (!box) return { ...rect };
    const scale = Math.min(box.width / this.w, box.height / this.h),
      ox = box.x + (box.width - this.w * scale) / 2,
      oy = box.y + (box.height - this.h * scale) / 2;
    return { x: ox + rect.x * scale, y: oy + rect.y * scale, w: rect.w * scale, h: rect.h * scale };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root.destroy();
    // The owning node may have already destroyed its Camera child.
    this.camera.node?.destroy();
    for (const asset of [...this.owned].reverse()) asset.destroy();
    for (const asset of this.images) asset.decRef();
  }
}
