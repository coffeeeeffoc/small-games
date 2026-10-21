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
import { getRunLevel, skillTarget, SKILLS } from './generated/core.js';
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
    return this.loaded.size === 5;
  }
  loadArt() {
    this.failed = false;
    for (const name of ['home', 'ground', 'actors', 'icon', 'levels']) {
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
      h: this.h - this.top - 65 - Math.max(120, this.h * 0.24) - this.bottom,
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
    return label;
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
    this.backdrop.node.active = !battle && ['home', 'levels'].includes(screen);
    this.ground.node.active = battle;
    if (this.backdrop.node.active) {
      const key = screen === 'levels' ? 'levels' : 'home';
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
      this.box(this.field, 0, 0, this.w, this.h, GREEN, 0);
      this.circle(this.field, this.w * 0.92, this.h * 0.12, 130, '#3c5941', 70);
      this.circle(this.field, this.w * 0.05, this.h * 0.8, 150, '#658150', 28);
    }
  }
  end() {
    for (let i = this.si; i < this.spritePool.length; i++) this.spritePool[i].node.active = false;
    for (let i = this.li; i < this.labelPool.length; i++) this.labelPool[i].node.active = false;
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
    this.box(this.ui, rect.x, rect.y + 4, w, h, '#0b1d16', 18);
    this.box(this.ui, rect.x, rect.y, w, h, disabled ? '#465047' : primary ? '#dfb859' : GREEN, 18);
    this.box(
      this.ui,
      rect.x + 2,
      rect.y + 2,
      w - 4,
      h - 4,
      disabled ? '#7c8370' : GOLD,
      16,
      255,
      2,
    );
    if (primary) this.box(this.ui, rect.x + 7, rect.y + 7, w - 14, h - 14, '#ffeb9d', 13, 255, 1);
    if (label !== '暂停')
      this.text(
        label,
        x,
        y,
        primary ? 24 : 18,
        primary ? '#243522' : disabled ? '#b7baac' : CREAM,
        w - 20,
        h - 8,
      );
    else {
      for (const offset of [-8, 4]) this.box(this.ui, x + offset, y - 11, 5, 22, CREAM, 0);
    }
  }
  panel(x: number, y: number, w: number, h: number) {
    this.box(this.ui, x, y, w, h, '#142d22', 20, 238);
    this.box(this.ui, x + 2, y + 2, w - 4, h - 4, GOLD, 18, 220, 2);
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
    if (selected) this.circle(this.ui, x, y, r + 7, '#ffe78a', 130, 3);
    this.circle(this.ui, x, y + 4, r + 2, '#16231b');
    this.circle(this.ui, x, y, r + 2, locked ? '#5e6456' : GOLD);
    this.circle(this.ui, x, y, r - 3, locked ? '#303c32' : selected ? '#325734' : '#9d6e27');
    this.circle(this.ui, x, y, r - 6, locked ? '#929686' : '#fff0bb', 255, 1);
    this.text(String(order), x, y - 1, 27, locked ? '#b7bba9' : CREAM, 45, 40);
    if (locked) {
      this.box(this.ui, x - 7, y + 22, 14, 12, '#c3c8b1', 2);
      this.circle(this.ui, x, y + 22, 5, '#c3c8b1', 255, 2);
    }
    if (cleared)
      for (let i = 0; i < 3; i++) this.circle(this.ui, x + (i - 1) * 13, y + 35, 4, GOLD);
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
    this.zoom = this.landscape ? 0.7 : 0.86;
    const level = getRunLevel(state),
      world = level.world,
      bounds = level.bounds;
    const clamp = (value: number, half: number, size: number) =>
      half * 2 >= size ? size / 2 : Math.max(half, Math.min(size - half, value));
    this.cameraX = clamp(state.player.x, this.battle.w / this.zoom / 2, world.width);
    this.cameraY = clamp(state.player.y, this.battle.h / this.zoom / 2, world.height);
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
    this.circle(this.field, hero.x, hero.y + 16, 15, '#213021', 95);
    this.actor('hero', hero.x, hero.y - 5, 54);
    for (const b of state.bullets) {
      const p = this.world(b.x, b.y),
        hostile = b.kind === 'hostile';
      this.circle(
        this.effects,
        p.x,
        p.y,
        Math.max(3, (b.radius || 4) * this.zoom),
        hostile ? '#d7427e' : '#fff4aa',
      );
      this.circle(this.effects, p.x, p.y, 7, hostile ? '#f293c0' : '#ffcb49', 65);
    }
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
    this.disposed = true;
    this.root.destroy();
    this.camera.node.destroy();
    for (const asset of [...this.owned].reverse()) asset.destroy();
    for (const asset of this.images) asset.decRef();
  }
}
