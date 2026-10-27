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
  Mask,
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
  seed?: number | string;
  playerFactionId?: number;
  time: number;
  cities: City[];
  junctions: {
    id: string;
    cityId: string;
    owner: number | null;
    routeIndex: number;
    routeIndices?: number[];
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
  inputBlocked?: boolean;
  error?: string;
  cityPoints?: Record<string, Point>;
  routePoints?: { sourceId: string; targetId: string; x: number; y: number }[];
  view?: { zoom: number; mode: 'map' | 'city' };
  setView?: (action: 'in' | 'out' | 'map' | 'city' | 'reset') => void;
  cancelRoute?: (sourceId: string, targetId: string) => void;
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
  viewport!: Node;
  root!: Node;
  camera!: Camera;
  ground!: Graphics;
  marks!: Graphics;
  people: Graphics[] = [];
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
  zoom = 1;
  mode: 'map' | 'city' = 'city';
  pan = { x: 0, y: 0 };
  baseScale = 1;
  boardRect: DOMRect | null = null;
  touches = new Map<number, Point>();
  pinch: { distance: number; zoom: number; anchor: Point } | null = null;
  suppressTouches = false;
  drag: {
    start: Point;
    last: Point;
    pan: boolean;
    moved: boolean;
    route?: { sourceId: string; targetId: string };
  } | null = null;
  hoverCity: string | null = null;
  hoverRoute: string | null = null;
  territoryKey = '';
  territories = new Map<string, Point[]>();
  battleKey = '';
  resetGestures = () => this.touchCancel();
  preventWheel = (event: WheelEvent) => {
    const client = { x: event.clientX, y: event.clientY };
    if (!this.interactive() || !this.insideBoard(client)) return;
    event.preventDefault();
    this.touchCancel();
    this.zoomAt(
      this.zoom * Math.exp(-Math.max(-240, Math.min(240, event.deltaY)) * 0.002),
      this.worldFromClient(client),
      client,
    );
  };
  start() {
    view.setOrientation(macro.ORIENTATION_AUTO);
    this.canvasRoot = new Node('BattleCanvas');
    this.canvasRoot.layer = Layers.Enum.UI_2D;
    this.node.addChild(this.canvasRoot);
    this.canvasRoot.addComponent(UITransform).setContentSize(innerWidth, innerHeight);
    const canvas = this.canvasRoot.addComponent(Canvas);
    canvas.alignCanvasWithScreen = false;
    this.viewport = this.child('Map viewport', this.canvasRoot);
    this.viewport.addComponent(UITransform);
    this.viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    this.root = this.child('Map', this.viewport);
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
    this.people = colors.map((_, i) => this.child('Soldiers ' + i).addComponent(Graphics));
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
    window.addEventListener('blur', this.resetGestures);
    window.addEventListener('resize', this.resetGestures);
    document.addEventListener('wheel', this.preventWheel, { passive: false });
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
    if (window.Tianxia) {
      window.Tianxia.ready = true;
      window.Tianxia.setView = (action) => this.setView(action);
    }
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
    if (this.stamp) this.touchCancel();
    this.stamp = stamp;
    this.boardRect = rect;
    const rotated = rect.width > rect.height;
    if (this.rotated !== rotated) this.pan = { x: 0, y: 0 };
    this.rotated = rotated;
    this.w = this.rotated ? 660 : 390;
    this.h = this.rotated ? 390 : 660;
    this.root.getComponent(UITransform)!.setContentSize(this.w, this.h);
    view.setDesignResolutionSize(innerWidth, innerHeight, ResolutionPolicy.EXACT_FIT);
    this.canvasRoot.getComponent(UITransform)!.setContentSize(innerWidth, innerHeight);
    this.canvasRoot.setPosition(innerWidth / 2, innerHeight / 2, 0);
    this.camera.node.setPosition(innerWidth / 2, innerHeight / 2, 1000);
    this.camera.orthoHeight = innerHeight / 2;
    this.baseScale = Math.min(rect.width / this.w, rect.height / this.h);
    this.viewport.getComponent(UITransform)!.setContentSize(rect.width, rect.height);
    this.viewport.setPosition(
      rect.left + rect.width / 2 - innerWidth / 2,
      innerHeight / 2 - rect.top - rect.height / 2,
      0,
    );
    this.applyView();
    this.background.node.getComponent(UITransform)!.setContentSize(this.w, this.h);
    if (this.backgroundTexture && this.backgroundFrame) {
      const tw = this.backgroundTexture.width,
        th = this.backgroundTexture.height,
        ratio = this.w / this.h;
      const cw = Math.min(tw, th * ratio),
        ch = Math.min(th, tw / ratio);
      this.backgroundFrame.rect = new Rect((tw - cw) / 2, (th - ch) / 2, cw, ch);
    }
  }
  applyView() {
    const rect = this.boardRect;
    if (!rect) return;
    const scale = this.baseScale * this.zoom;
    const limitX = Math.max(0, (this.w * scale - rect.width) / 2),
      limitY = Math.max(0, (this.h * scale - rect.height) / 2);
    this.pan.x = Math.max(-limitX, Math.min(limitX, this.pan.x));
    this.pan.y = Math.max(-limitY, Math.min(limitY, this.pan.y));
    this.root.setPosition(this.pan.x, -this.pan.y, 0);
    this.root.setScale(scale, scale, 1);
    if (window.Tianxia) {
      window.Tianxia.view = { zoom: this.zoom, mode: this.mode };
      window.Tianxia.layout = {
        width: this.w,
        height: this.h,
        scale,
        left: rect.left + (rect.width - this.w * scale) / 2 + this.pan.x,
        top: rect.top + (rect.height - this.h * scale) / 2 + this.pan.y,
        rotated: this.rotated,
      };
    }
  }
  zoomAt(zoom: number, anchor: Point, client = this.client(anchor)) {
    const rect = this.boardRect;
    if (!rect) return;
    this.zoom = Math.max(1, Math.min(3, zoom));
    this.mode = this.zoom > 1.12 ? 'city' : 'map';
    const q = this.project(anchor),
      scale = this.baseScale * this.zoom;
    this.pan.x = client.x - rect.left - rect.width / 2 - (q.x - this.w / 2) * scale;
    this.pan.y = client.y - rect.top - rect.height / 2 - (q.y - this.h / 2) * scale;
    this.applyView();
  }
  setView(action: 'in' | 'out' | 'map' | 'city' | 'reset') {
    this.touchCancel();
    const bridge = window.Tianxia,
      selected = bridge?.state?.cities.find((c) => c.id === bridge.selected);
    const rect = this.boardRect;
    if (!rect) return;
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const anchor = selected ?? this.worldFromClient(center);
    if (action === 'map' || action === 'reset') {
      this.zoom = 1;
      this.mode = action === 'map' ? 'map' : 'city';
      this.pan = { x: 0, y: 0 };
      this.applyView();
    } else if (action === 'city') this.zoomAt(Math.max(1.8, this.zoom), anchor, center);
    else this.zoomAt(this.zoom * (action === 'in' ? 1.25 : 0.8), anchor);
  }
  worldFromClient(p: Point): Point {
    const layout = window.Tianxia?.layout;
    if (!layout) return { x: 195, y: 330 };
    const q = { x: (p.x - layout.left) / layout.scale, y: (p.y - layout.top) / layout.scale };
    return this.rotated ? { x: 390 - q.y, y: q.x } : q;
  }
  insideBoard(p: Point) {
    const rect = this.boardRect;
    return !!rect && p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;
  }
  eventClient(p: Point) {
    return this.client(this.point(p.x, p.y));
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
    return ['battle', 'prepare'].includes(window.Tianxia?.screen) && !window.Tianxia?.inputBlocked;
  }
  hitCity(p: Point) {
    const scale = window.Tianxia?.layout?.scale ?? 1;
    return window.Tianxia?.state?.cities
      .map((city) => ({ city, distance: Math.hypot(city.x - p.x, city.y - p.y) }))
      .sort((a, b) => a.distance - b.distance)
      .find(({ distance }) => distance <= Math.max(29, 22 / scale))?.city;
  }
  routeMidpoint(a: Point, b: Point) {
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return {
      x: (a.x + b.x) / 2 - ((b.y - a.y) / length) * 7,
      y: (a.y + b.y) / 2 + ((b.x - a.x) / length) * 7,
    };
  }
  ownRoutes() {
    const state = window.Tianxia?.state;
    if (!state) return [];
    return state.junctions
      .filter((j) => j.owner === (state.playerFactionId ?? 0))
      .flatMap((j) => {
        const source = state.cities.find((c) => c.id === j.cityId);
        if (!source) return [];
        return (j.routeIndices ?? (j.routeIndex < 0 ? [] : [j.routeIndex])).flatMap((index) => {
          const target = state.cities.find((c) => c.id === j.exits[index]);
          return target
            ? [{ sourceId: source.id, targetId: target.id, ...this.routeMidpoint(source, target) }]
            : [];
        });
      });
  }
  hitRoute(p: Point) {
    if (this.hitCity(p)) return;
    const scale = window.Tianxia?.layout?.scale ?? 1;
    return this.ownRoutes()
      .map((route) => ({ route, distance: Math.hypot(route.x - p.x, route.y - p.y) * scale }))
      .sort((a, b) => a.distance - b.distance)
      .find(({ distance }) => distance <= 22)?.route;
  }
  beginPointer(raw: Point, id: number) {
    if (!this.interactive()) return;
    const client = this.eventClient(raw);
    if (!this.insideBoard(client)) return;
    const p = this.point(raw.x, raw.y),
      city = this.hitCity(p),
      route = city ? undefined : this.hitRoute(p);
    this.drag = { start: client, last: client, moved: false, pan: !city && !route, route };
    window.Tianxia.pointer(route ? 'cancel' : 'down', p, id);
  }
  movePointer(raw: Point, id: number) {
    if (!this.interactive()) {
      this.touchCancel();
      return;
    }
    const down = this.drag;
    if (!down) return;
    const client = this.eventClient(raw);
    const moved = Math.hypot(client.x - down.start.x, client.y - down.start.y) > 8;
    if (moved && !down.moved) {
      down.moved = true;
      if (down.pan || down.route) window.Tianxia.pointer('cancel', { x: 0, y: 0 }, id);
    }
    if (down.pan && down.moved) {
      this.pan.x += client.x - down.last.x;
      this.pan.y += client.y - down.last.y;
      this.applyView();
      this.setCursor('grabbing');
    } else if (!down.route) window.Tianxia.pointer('move', this.point(raw.x, raw.y), id);
    down.last = client;
  }
  endPointer(raw: Point, id: number) {
    const down = this.drag;
    this.drag = null;
    if (!down || !this.interactive()) return;
    const p = this.point(raw.x, raw.y);
    if (down.route) {
      const hit = this.hitRoute(p);
      if (
        !down.moved &&
        hit?.sourceId === down.route.sourceId &&
        hit.targetId === down.route.targetId
      )
        window.Tianxia.cancelRoute?.(hit.sourceId, hit.targetId);
    } else if (!down.pan || !down.moved) window.Tianxia.pointer('up', p, id);
    this.hover(p);
  }
  beginPinch() {
    window.Tianxia?.pointer('cancel', { x: 0, y: 0 }, -1);
    this.drag = null;
    this.activeTouch = null;
    this.suppressTouches = true;
    const [a, b] = [...this.touches.values()].slice(0, 2).map((p) => this.eventClient(p));
    if (!a || !b) return;
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (!this.insideBoard(a) || !this.insideBoard(b)) return;
    this.pinch = {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      zoom: this.zoom,
      anchor: this.worldFromClient(midpoint),
    };
  }
  touchStart(e: EventTouch) {
    if (!this.interactive()) return;
    const id = e.getID() ?? 0,
      p = e.getLocation();
    this.lastTouch = performance.now();
    this.touches.set(id, { x: p.x, y: p.y });
    if (this.touches.size > 1) {
      this.beginPinch();
      return;
    }
    if (this.suppressTouches) return;
    this.activeTouch = id;
    this.beginPointer(p, id);
  }
  touchMove(e: EventTouch) {
    if (!this.interactive()) {
      this.touchCancel();
      return;
    }
    const id = e.getID() ?? 0,
      p = e.getLocation();
    if (!this.touches.has(id)) return;
    this.touches.set(id, { x: p.x, y: p.y });
    if (this.pinch && this.touches.size >= 2) {
      const [a, b] = [...this.touches.values()].slice(0, 2).map((q) => this.eventClient(q));
      this.zoomAt(
        (this.pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / this.pinch.distance,
        this.pinch.anchor,
        { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      );
      return;
    }
    if (!this.suppressTouches && this.activeTouch === id) this.movePointer(p, id);
  }
  touchEnd(e: EventTouch) {
    const id = e.getID() ?? 0;
    this.touches.delete(id);
    if (!this.suppressTouches && this.activeTouch === id) this.endPointer(e.getLocation(), id);
    this.activeTouch = null;
    if (this.touches.size < 2) this.pinch = null;
    if (!this.touches.size) this.suppressTouches = false;
  }
  touchCancel() {
    this.activeTouch = null;
    this.mouseDown = false;
    this.drag = this.pinch = null;
    this.touches.clear();
    this.suppressTouches = false;
    this.hoverCity = this.hoverRoute = null;
    this.setCursor('default');
    window.Tianxia?.pointer('cancel', { x: 0, y: 0 }, -1);
  }
  mouseStart(e: EventMouse) {
    if (e.getButton() !== 0 || performance.now() - this.lastTouch < 700) return;
    this.mouseDown = true;
    this.beginPointer(e.getLocation(), -2);
  }
  mouseMove(e: EventMouse) {
    if (this.mouseDown) this.movePointer(e.getLocation(), -2);
    else this.hover(this.point(e.getLocation().x, e.getLocation().y));
  }
  mouseEnd(e: EventMouse) {
    if (!this.mouseDown) return;
    this.mouseDown = false;
    this.endPointer(e.getLocation(), -2);
  }
  setCursor(value: string) {
    const canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas');
    if (canvas) canvas.style.cursor = value;
  }
  hover(p: Point) {
    this.hoverCity = this.hoverRoute = null;
    if (!this.interactive() || !this.insideBoard(this.client(p))) {
      this.setCursor('default');
      return;
    }
    const city = this.hitCity(p),
      route = city ? undefined : this.hitRoute(p);
    this.hoverCity = city?.id ?? null;
    this.hoverRoute = route ? route.sourceId + ':' + route.targetId : null;
    this.setCursor(city || route ? 'pointer' : this.zoom > 1 ? 'grab' : 'default');
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
  arrow(a: City, b: City, hex: string, cancellable: boolean) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy);
    if (len < 1) return;
    const lane = { x: (-dy / len) * 7, y: (dx / len) * 7 };
    const start = { x: a.x + (dx / len) * 29 + lane.x, y: a.y + (dy / len) * 29 + lane.y },
      end = { x: b.x - (dx / len) * 32 + lane.x, y: b.y - (dy / len) * 32 + lane.y };
    const hovered = this.hoverRoute === a.id + ':' + b.id;
    this.line(this.marks, start, end, hex + (hovered ? 'ee' : 'a8'), hovered ? 3.5 : 2.2);
    this.line(
      this.marks,
      end,
      { x: end.x - (dx / len) * 9 + (dy / len) * 5, y: end.y - (dy / len) * 9 - (dx / len) * 5 },
      hex,
      2.5,
    );
    this.line(
      this.marks,
      end,
      { x: end.x - (dx / len) * 9 - (dy / len) * 5, y: end.y - (dy / len) * 9 + (dx / len) * 5 },
      hex,
      2.5,
    );
    if (cancellable) {
      const middle = this.routeMidpoint(a, b),
        size = 5 / Math.min(1.4, this.zoom);
      this.circle(this.marks, middle, hovered ? 10 : 8, hovered ? '#fff5dfef' : '#f3ead4c0');
      this.line(
        this.marks,
        this.offset(middle, -size, -size),
        this.offset(middle, size, size),
        hovered ? hex : '#9a806abb',
        2,
      );
      this.line(
        this.marks,
        this.offset(middle, -size, size),
        this.offset(middle, size, -size),
        hovered ? hex : '#9a806abb',
        2,
      );
    }
  }
  river(g: Graphics, center: Point, radius: number) {
    const length = Math.max(125, Math.min(200, radius * 1.5));
    const samples = Array.from({ length: 33 }, (_, i) => {
      const t = i / 32;
      return {
        x: center.x + (t - 0.5) * length * 2,
        y: center.y + (t - 0.5) * length + Math.sin(t * Math.PI * 2) * 24,
      };
    });
    g.fillColor = color('#83aaa438');
    const left = samples.map((p) => this.local({ x: p.x, y: p.y - 6 }));
    const right = samples.map((p) => this.local({ x: p.x, y: p.y + 6 })).reverse();
    g.moveTo(left[0].x, left[0].y);
    for (const p of [...left.slice(1), ...right]) g.lineTo(p.x, p.y);
    g.close();
    g.fill();
    for (let i = 4; i < samples.length - 3; i += 7)
      this.line(g, samples[i], samples[i + 2], '#b3c9bb88', 1.1);
  }
  drawTerritories(s: State) {
    const key = s.cities.map((c) => c.id + ':' + c.x + ':' + c.y).join('|');
    if (this.territoryKey !== key) {
      this.territoryKey = key;
      this.territories.clear();
      for (const city of s.cities) {
        let polygon = [
          { x: 0, y: 0 },
          { x: 390, y: 0 },
          { x: 390, y: 660 },
          { x: 0, y: 660 },
        ];
        for (const other of s.cities) {
          if (city === other || !polygon.length) continue;
          const dx = other.x - city.x,
            dy = other.y - city.y,
            boundary = (other.x ** 2 + other.y ** 2 - city.x ** 2 - city.y ** 2) / 2;
          const distance = (p: Point) => p.x * dx + p.y * dy - boundary;
          const clipped: Point[] = [];
          for (let i = 0; i < polygon.length; i++) {
            const a = polygon[i],
              b = polygon[(i + 1) % polygon.length],
              da = distance(a),
              db = distance(b);
            if (da <= 0) clipped.push(a);
            if (da <= 0 !== db <= 0) {
              const t = da / (da - db);
              clipped.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
            }
          }
          polygon = clipped;
        }
        this.territories.set(city.id, polygon);
      }
    }
    for (const city of s.cities) {
      const polygon = this.territories.get(city.id);
      if (!polygon?.length) continue;
      const points = polygon.map((p) => this.local(p)),
        g = this.ground;
      g.fillColor = color((city.owner === null ? '#a9a18d' : colors[city.owner]) + '38');
      g.strokeColor = color('#817e6250');
      g.lineWidth = 1;
      g.moveTo(points[0].x, points[0].y);
      for (const p of points.slice(1)) g.lineTo(p.x, p.y);
      g.close();
      g.fill();
      g.stroke();
    }
  }
  visible(p: Point, margin = 15) {
    const layout = window.Tianxia?.layout,
      rect = this.boardRect;
    if (!layout || !rect) return false;
    const q = this.project(p),
      x = layout.left + q.x * layout.scale,
      y = layout.top + q.y * layout.scale;
    return (
      x >= rect.left - margin &&
      x <= rect.right + margin &&
      y >= rect.top - margin &&
      y <= rect.bottom + margin
    );
  }
  drawSoldiers(s: State) {
    const groups: (Point & { step: number })[][] = colors.map(() => []);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const add = (owner: number, p: Point, index: number, moving: boolean) => {
      if (!this.visible(p) || !groups[owner]) return;
      groups[owner].push({
        ...this.local(p),
        step: moving && !reduced ? Math.sin(s.time * 10 + index * 1.7) : 0,
      });
    };
    for (const city of s.cities) {
      if (city.owner === null) continue;
      for (let i = 0; i < city.troops; i++) {
        const side = i % 2 ? 1 : -1,
          index = Math.floor(i / 2),
          column = Math.floor(index / 6),
          row = index % 6;
        add(city.owner, this.offset(city, side * (29 + column * 4.5), -13 + row * 5.5), i, false);
      }
    }
    for (const packet of s.packets) {
      const p = this.packetPoint(s, packet),
        dx = packet.to.x - packet.from.x,
        dy = packet.to.y - packet.from.y,
        length = Math.hypot(dx, dy) || 1,
        columns = Math.min(5, Math.max(1, Math.ceil(Math.sqrt(packet.troops))));
      for (let i = 0; i < packet.troops; i++) {
        const across = ((i % columns) - (columns - 1) / 2) * 4.5,
          behind = (Math.floor(i / columns) - Math.floor(packet.troops / columns) / 2) * 5;
        const q =
          packet.phase === 'road'
            ? {
                x: p.x - (dy / length) * across - (dx / length) * behind,
                y: p.y + (dx / length) * across - (dy / length) * behind,
              }
            : this.offset(p, 34 + (packet.id % 3) * 9 + across, 20 + behind);
        add(packet.owner, q, i + packet.id, packet.phase === 'road' && !packet.engaged);
      }
    }
    for (let owner = 0; owner < groups.length; owner++) {
      const g = this.people[owner],
        group = groups[owner];
      g.clear();
      g.fillColor = color(colors[owner]);
      // One icon per soldier. Paths are batched by faction, without per-soldier nodes.
      for (const p of group) {
        g.circle(p.x, p.y + 2.1, 1.1);
        g.rect(p.x - 0.8, p.y - 0.7, 1.6, 2.1);
      }
      g.fill();
      g.strokeColor = color(colors[owner]);
      g.lineWidth = 0.9;
      for (const p of group) {
        g.moveTo(p.x - 1.9, p.y + 0.8 + p.step * 0.4);
        g.lineTo(p.x + 1.9, p.y + 0.8 - p.step * 0.4);
        g.moveTo(p.x, p.y - 0.5);
        g.lineTo(p.x - 1.3, p.y - 2.5 + p.step * 0.6);
        g.moveTo(p.x, p.y - 0.5);
        g.lineTo(p.x + 1.3, p.y - 2.5 - p.step * 0.6);
      }
      g.stroke();
    }
  }
  update(dt: number) {
    const bridge = window.Tianxia;
    if (!bridge) return;
    bridge.ready = true;
    if (!['prepare', 'battle'].includes(bridge.screen)) {
      if (this.camera.enabled) this.touchCancel();
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
    const battleKey = s.levelId + ':' + s.seed;
    if (battleKey !== this.battleKey) {
      this.battleKey = battleKey;
      this.setView('reset');
    }
    if (bridge.inputBlocked && (this.drag || this.touches.size)) this.touchCancel();
    bridge.routePoints = this.ownRoutes().map((route) => ({
      sourceId: route.sourceId,
      targetId: route.targetId,
      ...this.client(route),
    }));
    bridge.cityPoints = Object.fromEntries(s.cities.map((c) => [c.id, this.client(c)]));
    const g = this.ground,
      m = this.marks;
    g.clear();
    m.clear();
    if (this.mode === 'map') this.drawTerritories(s);
    this.drawSoldiers(s);
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
        this.river(g, t, t.radius);
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
      this.circle(g, c, this.mode === 'map' ? 19 : 26, '#e0d7bf', faction);
      if (c === selected) this.circle(g, c, 36, '#e9c97022', '#ac843e');
      else if (c.id === this.hoverCity) this.circle(g, c, 34, '#fff5dc22', '#ac843e99');
      const junction = s.junctions.find((j) => j.cityId === c.id)!;
      if (
        selected?.owner === (s.playerFactionId ?? 0) &&
        s.junctions.find((j) => j.cityId === selected.id)?.exits.includes(c.id)
      )
        this.circle(g, c, 32, '#ffffff00', '#b18a4f88');
      this.sprite(
        'city:' + c.id,
        cityFrames[c.type],
        this.offset(c, 0, -5),
        this.mode === 'map' ? 42 : 65,
      );
      if (c.weapon && this.mode === 'city')
        this.sprite(
          'weapon:' + c.id,
          { crossbow: 4, catapult: 5, cannon: 6 }[c.weapon.kind] ?? 4,
          this.offset(c, 24, 4),
          30,
        );
      this.label(
        'name:' + c.id,
        c.name,
        this.offset(c, 0, this.mode === 'map' ? -29 : -37),
        15,
        ink,
      );
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
        const routes =
          junction.routeIndices ?? (junction.routeIndex < 0 ? [] : [junction.routeIndex]);
        for (const index of routes) {
          const target = s.cities.find((t) => t.id === junction.exits[index]);
          if (target) this.arrow(c, target, faction, c.owner === (s.playerFactionId ?? 0));
        }
        if (!routes.length) this.label('hold:' + c.id, '屯', this.offset(c, 29, -23), 12, faction);
      }
    }
    for (const packet of s.packets) {
      const p = this.packetPoint(s, packet),
        offset = packet.phase === 'stationed' ? 25 : packet.phase === 'siege' ? 21 : 0,
        q = this.offset(p, offset, offset);
      if (!this.visible(q)) continue;
      if (this.zoom >= 1.4 && packet.troops >= 3)
        this.label(
          'packet:' + packet.id,
          String(packet.troops),
          this.offset(q, 0, 14),
          9,
          colors[packet.owner],
        );
      if (packet.engaged) {
        this.line(m, this.offset(q, -4, -4), this.offset(q, 4, 4), '#fff0bd', 1.5);
        this.line(m, this.offset(q, 4, -4), this.offset(q, -4, 4), '#fff0bd', 1.5);
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
    window.removeEventListener('blur', this.resetGestures);
    window.removeEventListener('resize', this.resetGestures);
    document.removeEventListener('wheel', this.preventWheel);
    this.touchCancel();
    if (window.Tianxia) window.Tianxia.setView = undefined;
    for (const frame of this.frames) frame.destroy();
    this.texture?.destroy();
    this.backgroundFrame?.destroy();
    this.backgroundTexture?.destroy();
  }
}
