import {
  _decorator,
  Component,
  Node,
  Camera,
  Canvas,
  UITransform,
  Graphics,
  Color,
  Layers,
  Label,
  Sprite,
  SpriteFrame,
  Texture2D,
  ImageAsset,
  Rect,
  view,
  ResolutionPolicy,
  input,
  Input,
  EventTouch,
  EventMouse,
  assetManager,
  Vec3,
  screen,
  macro,
} from 'cc';
const { ccclass } = _decorator;
type Point = { x: number; y: number };
type City = Point & {
  id: string;
  name: string;
  type: string;
  owner: number | null;
  troops: number;
  capacity: number;
  fortification: number;
  maxFortification: number;
  weapon: { kind: string } | null;
  generalKind: string | null;
  recruitProgress: number;
  junctionId: string;
};
type Packet = {
  id: number;
  owner: number;
  troops: number;
  phase: string;
  engaged: boolean;
  from: Point;
  to: Point;
  progress: number;
  targetCityId: string;
};
type General = {
  id: number;
  kind: string;
  owner: number;
  cityId: string | null;
  packetId: number | null;
  health: number;
  maxHealth: number;
};
type State = {
  levelId: string;
  time: number;
  cities: City[];
  junctions: {
    id: string;
    cityId: string;
    owner: number | null;
    routeIndex: number;
    exits: string[];
  }[];
  roads: { a: string; b: string; type: string }[];
  packets: Packet[];
  generals: General[];
  terrain: (Point & { type: string; radius: number })[];
  events: (Point & {
    id: number;
    type: string;
    time: number;
    position: Point;
    target?: Point;
    cityId?: string;
  })[];
};
type Bridge = {
  state: State | null;
  screen: string;
  selected: string | null;
  preview: Point | null;
  range: (Point & { radius: number; factionId: number }) | null;
  ready: boolean;
  artReady: boolean;
  error?: string;
  cityPoints?: Record<string, Point>;
  pointer: (phase: string, p: Point, id: number, arrow?: boolean) => void;
  layout?: {
    width: number;
    height: number;
    scale: number;
    left: number;
    top: number;
    rotated: boolean;
  };
};
declare global {
  interface Window {
    Tianxia: Bridge;
  }
}
const ink = '#294944',
  colors = ['#b94339', '#467c9a', '#608c65', '#c6943c'];
const color = (value: string) => new Color().fromHEX(value);
const cityFrames: Record<string, number> = { town: 0, barracks: 1, pass: 2, muster: 3 };
const generalFrames: Record<string, number> = {
  warrior: 7,
  commander: 7,
  guardian: 8,
  ranger: 9,
  arbalist: 10,
  medic: 11,
};
@ccclass('TianxiaBattle')
export class TianxiaBattle extends Component {
  canvasRoot!: Node;
  root!: Node;
  camera!: Camera;
  ground!: Graphics;
  marks!: Graphics;
  spritesRoot!: Node;
  labelsRoot!: Node;
  labels = new Map<string, Label>();
  sprites = new Map<string, Sprite>();
  frames: SpriteFrame[] = [];
  texture: Texture2D | null = null;
  background!: Sprite;
  backgroundFrame: SpriteFrame | null = null;
  backgroundTexture: Texture2D | null = null;
  w = 390;
  h = 660;
  rotated = false;
  stamp = '';
  lastDraw = 0;
  activeTouch: number | null = null;
  lastTouch = 0;
  mouseDown = false;
  start() {
    view.setOrientation(macro.ORIENTATION_AUTO);
    this.canvasRoot = new Node('BattleCanvas');
    this.canvasRoot.layer = Layers.Enum.UI_2D;
    this.node.addChild(this.canvasRoot);
    this.canvasRoot.addComponent(UITransform).setContentSize(innerWidth, innerHeight);
    const canvas = this.canvasRoot.addComponent(Canvas);
    this.root = this.child('Map', this.canvasRoot);
    this.root.addComponent(UITransform).setContentSize(this.w, this.h);
    const camera = new Node('BattleCamera');
    this.node.addChild(camera);
    this.camera = camera.addComponent(Camera);
    this.camera.projection = Camera.ProjectionType.ORTHO;
    this.camera.near = 0.1;
    this.camera.far = 2000;
    this.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    this.camera.clearColor = color('#eee5d1');
    this.camera.visibility = Layers.Enum.UI_2D;
    canvas.cameraComponent = this.camera;
    const landscape = this.child('Landscape');
    landscape.addComponent(UITransform);
    this.background = landscape.addComponent(Sprite);
    this.background.sizeMode = Sprite.SizeMode.CUSTOM;
    this.background.color = new Color(255, 255, 255, 105);
    assetManager.loadRemote<ImageAsset>(
      new URL('./art/landscape.webp', location.href).href,
      (error, image) => {
        if (error || !this.isValid) return;
        const texture = new Texture2D();
        texture.image = image;
        this.backgroundTexture = texture;
        const frame = new SpriteFrame();
        frame.texture = texture;
        this.backgroundFrame = frame;
        this.background.spriteFrame = frame;
        this.stamp = '';
      },
    );
    this.ground = this.child('Roads').addComponent(Graphics);
    this.spritesRoot = this.child('Illustrations');
    this.marks = this.child('Orders').addComponent(Graphics);
    this.labelsRoot = this.child('Labels');
    input.on(Input.EventType.TOUCH_START, this.touchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
    input.on(Input.EventType.MOUSE_DOWN, this.mouseStart, this);
    input.on(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
    input.on(Input.EventType.MOUSE_UP, this.mouseEnd, this);
    assetManager.loadRemote<ImageAsset>(
      new URL('./art/units.png', location.href).href,
      (error, image) => {
        if (!this.isValid) return;
        if (error) {
          if (window.Tianxia) window.Tianxia.error = '城池画卷加载失败，请重试。';
          return;
        }
        const texture = new Texture2D();
        texture.image = image;
        this.texture = texture;
        for (let i = 0; i < 12; i++) {
          const x = ((i % 4) * image.width) / 4,
            y = (Math.floor(i / 4) * image.height) / 3;
          const frame = new SpriteFrame();
          frame.texture = texture;
          frame.rect = new Rect(
            Math.round(x),
            Math.round(y),
            Math.round(x + image.width / 4) - Math.round(x),
            Math.round(y + image.height / 3) - Math.round(y),
          );
          this.frames.push(frame);
        }
        if (window.Tianxia) window.Tianxia.artReady = true;
      },
    );
    if (window.Tianxia) window.Tianxia.ready = true;
    this.resize();
  }
  child(name: string, parent = this.root) {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    parent.addChild(node);
    return node;
  }
  resize() {
    const rect = document.querySelector('#board')?.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) return;
    const stamp = [
      innerWidth,
      innerHeight,
      Math.round(rect.width),
      Math.round(rect.height),
      Math.round(rect.left),
      Math.round(rect.top),
    ].join(':');
    if (stamp === this.stamp) return;
    this.stamp = stamp;
    this.rotated = rect.width > rect.height;
    this.w = this.rotated ? 660 : 390;
    this.h = this.rotated ? 390 : 660;
    this.root.getComponent(UITransform)!.setContentSize(this.w, this.h);
    view.setDesignResolutionSize(innerWidth, innerHeight, ResolutionPolicy.EXACT_FIT);
    this.canvasRoot.getComponent(UITransform)!.setContentSize(innerWidth, innerHeight);
    this.canvasRoot.setPosition(innerWidth / 2, innerHeight / 2, 0);
    this.camera.node.setPosition(innerWidth / 2, innerHeight / 2, 1000);
    this.camera.orthoHeight = innerHeight / 2;
    const scale = Math.min(rect.width / this.w, rect.height / this.h);
    this.root.setPosition(
      rect.left + rect.width / 2 - innerWidth / 2,
      innerHeight / 2 - rect.top - rect.height / 2,
      0,
    );
    this.root.setScale(scale, scale, 1);
    this.background.node.getComponent(UITransform)!.setContentSize(this.w, this.h);
    if (this.backgroundTexture && this.backgroundFrame) {
      const tw = this.backgroundTexture.width,
        th = this.backgroundTexture.height,
        ratio = this.w / this.h;
      const cw = Math.min(tw, th * ratio),
        ch = Math.min(th, tw / ratio);
      this.backgroundFrame.rect = new Rect((tw - cw) / 2, (th - ch) / 2, cw, ch);
    }
    if (window.Tianxia)
      window.Tianxia.layout = {
        width: this.w,
        height: this.h,
        scale,
        left: rect.left + (rect.width - this.w * scale) / 2,
        top: rect.top + (rect.height - this.h * scale) / 2,
        rotated: this.rotated,
      };
  }
  project(p: Point): Point {
    return this.rotated ? { x: p.y, y: 390 - p.x } : p;
  }
  offset(p: Point, x: number, y: number): Point {
    return this.rotated ? { x: p.x - y, y: p.y + x } : { x: p.x + x, y: p.y + y };
  }
  local(p: Point) {
    const q = this.project(p);
    return { x: q.x - this.w / 2, y: this.h / 2 - q.y };
  }
  point(x: number, y: number): Point {
    const canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!,
      rect = canvas.getBoundingClientRect();
    const world = this.camera.screenToWorld(
      new Vec3(
        ((x / screen.devicePixelRatio) * canvas.width) / rect.width,
        ((y / screen.devicePixelRatio) * canvas.height) / rect.height,
        0,
      ),
    );
    const local = this.root.inverseTransformPoint(new Vec3(), world);
    const q = { x: local.x + this.w / 2, y: this.h / 2 - local.y };
    return this.rotated ? { x: 390 - q.y, y: q.x } : q;
  }
  client(p: Point): Point {
    const local = this.local(p),
      world = Vec3.transformMat4(new Vec3(), new Vec3(local.x, local.y, 0), this.root.worldMatrix);
    const projected = this.camera.worldToScreen(world),
      canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!,
      rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (projected.x / canvas.width) * rect.width,
      y: rect.top + (1 - projected.y / canvas.height) * rect.height,
    };
  }
  interactive() {
    return ['battle', 'prepare'].includes(window.Tianxia?.screen);
  }
  dispatch(phase: string, x: number, y: number, id: number) {
    if (!this.interactive()) return;
    window.Tianxia.pointer(phase, this.point(x, y), id);
  }
  touchStart(e: EventTouch) {
    const id = e.getID() ?? 0;
    this.lastTouch = performance.now();
    if (this.activeTouch !== null || e.getAllTouches().length > 1) {
      this.activeTouch = null;
      this.dispatch('cancel', 0, 0, -1);
      return;
    }
    this.activeTouch = id;
    const p = e.getLocation();
    this.dispatch('down', p.x, p.y, id);
  }
  touchMove(e: EventTouch) {
    const id = e.getID() ?? 0;
    if (this.activeTouch !== id) return;
    const p = e.getLocation();
    this.dispatch('move', p.x, p.y, id);
  }
  touchEnd(e: EventTouch) {
    const id = e.getID() ?? 0;
    if (this.activeTouch !== id) return;
    const p = e.getLocation();
    this.dispatch('up', p.x, p.y, id);
    this.activeTouch = null;
  }
  touchCancel() {
    this.activeTouch = null;
    this.mouseDown = false;
    window.Tianxia?.pointer('cancel', { x: 0, y: 0 }, -1);
  }
  mouseStart(e: EventMouse) {
    if (e.getButton() !== 0 || performance.now() - this.lastTouch < 700) return;
    this.mouseDown = true;
    const p = e.getLocation();
    this.dispatch('down', p.x, p.y, -2);
  }
  mouseMove(e: EventMouse) {
    if (!this.mouseDown) return;
    const p = e.getLocation();
    this.dispatch('move', p.x, p.y, -2);
  }
  mouseEnd(e: EventMouse) {
    if (!this.mouseDown) return;
    this.mouseDown = false;
    const p = e.getLocation();
    this.dispatch('up', p.x, p.y, -2);
  }
  line(g: Graphics, a: Point, b: Point, hex: string, width = 2) {
    const p = this.local(a),
      q = this.local(b);
    g.strokeColor = color(hex);
    g.lineWidth = width;
    g.moveTo(p.x, p.y);
    g.lineTo(q.x, q.y);
    g.stroke();
  }
  circle(g: Graphics, p: Point, r: number, fill: string, stroke?: string) {
    const q = this.local(p);
    g.fillColor = color(fill);
    g.circle(q.x, q.y, r);
    g.fill();
    if (stroke) {
      g.strokeColor = color(stroke);
      g.lineWidth = 2;
      g.circle(q.x, q.y, r);
      g.stroke();
    }
  }
  label(key: string, value: string, p: Point, size = 14, hex = ink) {
    let label = this.labels.get(key);
    if (!label) {
      const node = this.child(key, this.labelsRoot);
      node.addComponent(UITransform).setContentSize(155, 38);
      label = node.addComponent(Label);
      label.fontFamily = 'Microsoft YaHei';
      label.horizontalAlign = Label.HorizontalAlign.CENTER;
      label.verticalAlign = Label.VerticalAlign.CENTER;
      label.overflow = Label.Overflow.CLAMP;
      this.labels.set(key, label);
    }
    const scale = window.Tianxia?.layout?.scale ?? 1;
    const readable = size / Math.min(1, Math.max(0.55, scale));
    label.node.active = true;
    label.string = value;
    label.fontSize = readable;
    label.lineHeight = readable + 4;
    label.color = color(hex);
    const q = this.local(p);
    label.node.setPosition(q.x, q.y);
  }
  sprite(key: string, index: number, p: Point, size: number) {
    let sprite = this.sprites.get(key);
    if (!sprite) {
      const node = this.child(key, this.spritesRoot);
      node.addComponent(UITransform);
      sprite = node.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      this.sprites.set(key, sprite);
    }
    sprite.node.active = !!this.frames[index];
    if (!this.frames[index]) return;
    sprite.spriteFrame = this.frames[index];
    sprite.node.getComponent(UITransform)!.setContentSize(size, size * 0.89);
    const q = this.local(p);
    sprite.node.setPosition(q.x, q.y);
  }
  packetPoint(s: State, p: Packet) {
    if (p.phase !== 'road') return s.cities.find((c) => c.id === p.targetCityId)!;
    return {
      x: p.from.x + (p.to.x - p.from.x) * p.progress,
      y: p.from.y + (p.to.y - p.from.y) * p.progress,
    };
  }
  arrow(a: Point, b: Point, hex: string) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy);
    if (len < 1) return;
    const start = { x: a.x + (dx / len) * 29, y: a.y + (dy / len) * 29 },
      end = {
        x: a.x + (dx / len) * Math.min(len - 32, 65),
        y: a.y + (dy / len) * Math.min(len - 32, 65),
      };
    this.line(this.marks, start, end, hex, 4);
    this.line(
      this.marks,
      end,
      { x: end.x - (dx / len) * 10 + (dy / len) * 6, y: end.y - (dy / len) * 10 - (dx / len) * 6 },
      hex,
      3,
    );
    this.line(
      this.marks,
      end,
      { x: end.x - (dx / len) * 10 - (dy / len) * 6, y: end.y - (dy / len) * 10 + (dx / len) * 6 },
      hex,
      3,
    );
  }
  update(dt: number) {
    const bridge = window.Tianxia;
    if (!bridge) return;
    bridge.ready = true;
    if (!['prepare', 'battle'].includes(bridge.screen)) {
      this.camera.enabled = false;
      return;
    }
    this.camera.enabled = true;
    this.resize();
    this.lastDraw += dt;
    if (this.lastDraw < 1 / 30) return;
    this.lastDraw = 0;
    const s = bridge.state;
    if (!s) return;
    bridge.cityPoints = Object.fromEntries(s.cities.map((c) => [c.id, this.client(c)]));
    const g = this.ground,
      m = this.marks;
    g.clear();
    m.clear();
    for (const label of this.labels.values()) label.node.active = false;
    for (const sprite of this.sprites.values()) sprite.node.active = false;
    // Low contrast paper contours stay behind roads and readable city labels.
    for (let i = 0; i < 8; i++) {
      const p = { x: 20 + i * 51, y: 90 + (i % 3) * 22 };
      this.line(g, p, { x: p.x + 43, y: p.y - 24 }, '#bfc8b755', 2);
      this.line(g, { x: p.x + 43, y: p.y - 24 }, { x: p.x + 70, y: p.y + 8 }, '#bfc8b755', 2);
    }
    for (const t of s.terrain) {
      if (t.type === 'river') {
        for (let i = -1; i < 2; i++)
          this.line(
            g,
            { x: t.x - 125, y: t.y - 65 + i * 6 },
            { x: t.x + 125, y: t.y + 65 + i * 6 },
            '#82ada767',
            5,
          );
      } else if (t.type === 'forest') {
        for (let i = 0; i < 9; i++) {
          const p = {
            x: t.x + Math.sin(i * 9) * t.radius * 0.75,
            y: t.y + Math.cos(i * 7) * t.radius * 0.6,
          };
          const q = this.local(p);
          g.fillColor = color('#7e998d50');
          g.moveTo(q.x, q.y + 13);
          g.lineTo(q.x - 9, q.y - 9);
          g.lineTo(q.x + 9, q.y - 9);
          g.close();
          g.fill();
        }
      } else if (t.type === 'mountain') {
        for (let i = 0; i < 4; i++) {
          const p = { x: t.x - 45 + i * 30, y: t.y + 20 };
          this.line(g, p, { x: p.x + 18, y: p.y - 35 }, '#8c9b8d66', 4);
          this.line(g, { x: p.x + 18, y: p.y - 35 }, { x: p.x + 40, y: p.y + 10 }, '#8c9b8d66', 4);
        }
      }
    }
    const range = bridge.range;
    if (range)
      this.circle(
        g,
        range,
        range.radius,
        colors[range.factionId] + '20',
        colors[range.factionId] + '88',
      );
    const selected = s.cities.find((c) => c.id === bridge.selected);
    for (const road of s.roads) {
      const a = s.cities.find((c) => c.id === road.a)!,
        b = s.cities.find((c) => c.id === road.b)!;
      const relevant = selected && (a === selected || b === selected);
      this.line(
        g,
        a,
        b,
        road.type === 'fast' ? '#ac904a88' : road.type === 'slow' ? '#716d6688' : '#93877770',
        relevant ? 4 : 2,
      );
      if (relevant && road.type !== 'normal')
        this.label(
          'road:' + road.a + road.b,
          road.type === 'fast' ? '驿道 ×1.35' : '山路 ×0.7',
          { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          11,
        );
    }
    for (const c of s.cities) {
      const faction = c.owner === null ? '#9a9181' : colors[c.owner];
      this.circle(g, c, 26, '#e0d7bf', faction);
      if (c === selected) this.circle(g, c, 36, '#e9c97022', '#ac843e');
      const junction = s.junctions.find((j) => j.cityId === c.id)!;
      if (
        selected?.owner === 0 &&
        s.junctions.find((j) => j.cityId === selected.id)?.exits.includes(c.id)
      )
        this.circle(g, c, 32, '#ffffff00', '#b18a4f88');
      this.sprite('city:' + c.id, cityFrames[c.type], this.offset(c, 0, -5), 65);
      if (c.weapon)
        this.sprite(
          'weapon:' + c.id,
          { crossbow: 4, catapult: 5, cannon: 6 }[c.weapon.kind] ?? 4,
          this.offset(c, 24, 4),
          30,
        );
      this.label('name:' + c.id, c.name, this.offset(c, 0, -37), 15, ink);
      this.circle(m, this.offset(c, 0, 25), 16, faction);
      this.label('troops:' + c.id, String(c.troops), this.offset(c, 0, 25), 16, '#fff7df');
      if (c.fortification > 0)
        this.label('fort:' + c.id, '城防 ' + Math.ceil(c.fortification), this.offset(c, 0, 47), 10);
      if (c.generalKind && c.owner !== null) {
        const p = this.local({ x: c.x - 22, y: c.y + 17 });
        m.strokeColor = color('#b69b55');
        m.lineWidth = 3;
        m.moveTo(p.x, p.y);
        m.lineTo(p.x + 44 * Math.min(1, c.recruitProgress / 20), p.y);
        m.stroke();
      }
      if (c.owner !== null) {
        if (junction.routeIndex >= 0)
          this.arrow(
            c,
            s.cities.find((t) => t.id === junction.exits[junction.routeIndex])!,
            faction,
          );
        else this.label('hold:' + c.id, '屯', this.offset(c, 29, -23), 12, faction);
      }
    }
    for (const packet of s.packets) {
      const p = this.packetPoint(s, packet),
        offset = packet.phase === 'stationed' ? 25 : packet.phase === 'siege' ? 21 : 0;
      const q = { x: p.x + offset, y: p.y + offset };
      this.circle(m, q, packet.engaged ? 7 : 5, colors[packet.owner]);
      this.line(m, q, { x: q.x + Math.cos(s.time * 8) * 4, y: q.y - 9 }, colors[packet.owner], 2);
      this.label(
        'packet:' + packet.id,
        packet.phase === 'stationed' ? '驻 ' + packet.troops : String(packet.troops),
        { x: q.x, y: q.y + 14 },
        11,
      );
      if (packet.engaged) {
        this.line(m, { x: q.x - 7, y: q.y - 5 }, { x: q.x + 7, y: q.y + 5 }, '#ffefb0', 2);
        this.line(m, { x: q.x + 7, y: q.y - 5 }, { x: q.x - 7, y: q.y + 5 }, '#ffefb0', 2);
      }
    }
    for (const general of s.generals) {
      const packet = s.packets.find((p) => p.id === general.packetId),
        p = packet ? this.packetPoint(s, packet) : s.cities.find((c) => c.id === general.cityId);
      if (!p) continue;
      this.sprite(
        'general:' + general.id,
        generalFrames[general.kind],
        { x: p.x - 22, y: p.y + 4 },
        36,
      );
      this.circle(m, { x: p.x - 23, y: p.y + 22 }, 4, colors[general.owner]);
    }
    if (selected && bridge.preview) this.line(m, selected, bridge.preview, '#b4944f', 3);
    for (const event of s.events) {
      const age = s.time - event.time;
      if (age < 0 || age > 0.75) continue;
      if (event.type === 'fire' && event.target) {
        const a = event.position,
          b = event.target;
        this.circle(
          m,
          {
            x: a.x + (b.x - a.x) * Math.min(1, age / 0.4),
            y: a.y + (b.y - a.y) * Math.min(1, age / 0.4),
          },
          3,
          '#c46935',
        );
      }
      if (['capture', 'general', 'elimination'].includes(event.type))
        this.circle(
          m,
          event.position,
          28 + age * 30,
          '#ffffff00',
          '#c79d54' +
            Math.round(180 * (1 - age / 0.75))
              .toString(16)
              .padStart(2, '0'),
        );
    }
  }
  lateUpdate() {
    for (const [key, label] of this.labels)
      if (key.startsWith('packet:') && !label.node.active) {
        label.node.destroy();
        this.labels.delete(key);
      }
    for (const [key, sprite] of this.sprites)
      if (key.startsWith('general:') && !sprite.node.active) {
        sprite.node.destroy();
        this.sprites.delete(key);
      }
  }
  onDestroy() {
    input.off(Input.EventType.TOUCH_START, this.touchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
    input.off(Input.EventType.MOUSE_DOWN, this.mouseStart, this);
    input.off(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
    input.off(Input.EventType.MOUSE_UP, this.mouseEnd, this);
    for (const frame of this.frames) frame.destroy();
    this.texture?.destroy();
    this.backgroundFrame?.destroy();
    this.backgroundTexture?.destroy();
  }
}
