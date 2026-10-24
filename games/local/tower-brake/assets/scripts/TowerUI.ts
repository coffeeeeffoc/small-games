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
  view,
} from 'cc';
export const W = 360;
export const C = {
  deep: '#101c35',
  ink: '#163d50',
  gold: '#f4d493',
  jade: '#8ed6ca',
  white: '#fff5dc',
  muted: '#bdd4e1',
  border: '#647b9b80',
  red: '#ff8477',
};
export const color = (hex: string) => new Color().fromHEX(hex);
export type Control = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  disabled: boolean;
};
const SKY = 1 << 19;
export class TowerUI {
  H = 740;
  scale = 1;
  hitSize = 52;
  root: Node;
  sky: Node;
  camera: Camera;
  skyCamera: Camera;
  graphics: Graphics;
  nodes = new Map<string, Node>();
  seen = new Set<string>();
  controls: Control[] = [];
  pressed = '';
  ready = false;
  error = '';
  disposed = false;
  textures: Texture2D[] = [];
  loadId = 0;
  frames: SpriteFrame[] = [];
  skies: Sprite[] = [];
  constructor(parent: Node) {
    const makeCanvas = (name: string, layer: number, priority: number) => {
      const root = this.node(name, parent, layer);
      const canvas = root.addComponent(Canvas);
      const cn = new Node(name + 'Camera');
      parent.addChild(cn);
      const cam = cn.addComponent(Camera);
      cam.projection = Camera.ProjectionType.ORTHO;
      cam.priority = priority;
      cam.near = 0.1;
      cam.far = 2000;
      cam.visibility = layer;
      cam.clearFlags = priority === 0 ? Camera.ClearFlag.SOLID_COLOR : Camera.ClearFlag.DEPTH_ONLY;
      cam.clearColor = color(C.deep);
      canvas.cameraComponent = cam;
      return { root, cam };
    };
    const bg = makeCanvas('SkyCanvas', SKY, 0),
      ui = makeCanvas('TowerCanvas', Layers.Enum.UI_2D, 2);
    this.root = ui.root;
    this.camera = ui.cam;
    this.sky = bg.root;
    this.skyCamera = bg.cam;
    for (let i = 0; i < 4; i++)
      this.skies.push(this.node('Sky' + i, this.sky, SKY).addComponent(Sprite));
    this.graphics = this.node('Ornament', this.root).addComponent(Graphics);
    this.resize();
    this.load();
  }
  node(name: string, parent: Node, layer = Layers.Enum.UI_2D) {
    const n = new Node(name);
    n.layer = layer;
    parent.addChild(n);
    n.addComponent(UITransform);
    return n;
  }
  resize() {
    const frame = view.getFrameSize();
    this.H = Math.max(640, Math.min(960, (W * frame.height) / frame.width));
    this.scale = Math.min(frame.width / W, frame.height / this.H);
    this.hitSize = Math.max(52, 44 / this.scale);
    view.setDesignResolutionSize(W, this.H, ResolutionPolicy.SHOW_ALL);
    for (const [root, cam] of [
      [this.root, this.camera],
      [this.sky, this.skyCamera],
    ] as [Node, Camera][]) {
      root.getComponent(UITransform)!.setContentSize(W, this.H);
      root.setPosition(W / 2, this.H / 2);
      cam.node.setPosition(W / 2, this.H / 2, 1000);
      cam.orthoHeight = this.H / 2;
    }
  }
  load() {
    const id = ++this.loadId;
    this.ready = false;
    this.error = '';
    this.frames.forEach((f) => f.destroy());
    this.textures.forEach((t) => t.destroy());
    this.frames = [];
    this.textures = [];
    ['sky-atlas', 'sky-alternate'].forEach((name, atlas) =>
      resources.load(name, ImageAsset, (error, asset) => {
        if (this.disposed || id !== this.loadId) return;
        if (error) {
          this.error = '天空加载失败 · 点击重试';
          return;
        }
        const texture = new Texture2D();
        texture.image = asset;
        this.textures[atlas] = texture;
        for (let i = 0; i < 4; i++) {
          const f = new SpriteFrame();
          f.texture = texture;
          f.rect = new Rect((i * asset.width) / 4 + 1, 0, asset.width / 4 - 2, asset.height);
          this.frames[atlas * 4 + i] = f;
        }
        this.ready = this.frames.filter(Boolean).length === 8;
      }),
    );
  }
  background(environment: any, time: number, reduced: boolean, distance: number) {
    if (!this.ready) return;
    const e = environment;
    const motion = reduced ? 0.2 : 1;
    const local = 0.5 - 0.5 * Math.cos(time * 0.075 + distance * 0.2 * motion);
    const weights = [
      (1 - e.blend) * (1 - local),
      (1 - e.blend) * local,
      e.blend * (1 - local),
      e.blend * local,
    ];
    const views = [e.from, e.from + 4, e.to, e.to + 4];
    let total = 0;
    this.skies.forEach((s, i) => {
      s.spriteFrame = this.frames[views[i]];
      s.sizeMode = Sprite.SizeMode.CUSTOM;
      total += weights[i];
      s.color = new Color(255, 255, 255, total ? Math.round((weights[i] / total) * 255) : 0);
      const phase = time * 0.055 + distance * 0.11 * motion;
      s.node.getComponent(UITransform)!.setContentSize(W + 56, this.H + 110);
      s.node.setPosition(
        Math.sin(phase + (i % 2)) * 16 * motion,
        Math.sin(phase * 0.8 + (i % 2)) * 38 * motion,
      );
    });
  }
  begin() {
    this.controls = [];
    this.seen.clear();
    this.graphics.clear();
  }
  end() {
    for (const [id, n] of this.nodes) if (!this.seen.has(id)) n.active = false;
  }
  cached(id: string) {
    this.seen.add(id);
    let n = this.nodes.get(id);
    if (!n) {
      n = this.node(id, this.root);
      this.nodes.set(id, n);
    }
    n.active = true;
    return n;
  }
  panel(x: number, y: number, w: number, h: number, fill = C.deep, stroke = '', r = 14) {
    const g = this.graphics;
    g.fillColor = color(fill);
    g.roundRect(x - W / 2, this.H / 2 - y - h, w, h, r);
    g.fill();
    if (stroke) {
      g.strokeColor = color(stroke);
      g.lineWidth = 1.5;
      g.stroke();
    }
  }
  line(x: number, y: number, tx: number, ty: number, fill = C.gold, width = 2) {
    const g = this.graphics;
    g.strokeColor = color(fill);
    g.lineWidth = width;
    g.moveTo(x - W / 2, this.H / 2 - y);
    g.lineTo(tx - W / 2, this.H / 2 - ty);
    g.stroke();
  }
  circle(x: number, y: number, r: number, fill: string, stroke = '', width = 2) {
    const g = this.graphics;
    g.fillColor = color(fill);
    g.circle(x - W / 2, this.H / 2 - y, r);
    g.fill();
    if (stroke) {
      g.strokeColor = color(stroke);
      g.lineWidth = width;
      g.stroke();
    }
  }
  text(
    id: string,
    value: string,
    x: number,
    y: number,
    size = 20,
    width = 320,
    fill = C.white,
    height = size * 1.5,
  ) {
    const n = this.cached(id);
    n.setPosition(x - W / 2, this.H / 2 - y);
    n.getComponent(UITransform)!.setContentSize(width, height);
    const l = n.getComponent(Label) || n.addComponent(Label);
    if (l.string !== value) l.string = value;
    l.fontFamily = 'Microsoft YaHei';
    l.fontSize = size;
    l.lineHeight = size * 1.45;
    l.isBold = size >= 22;
    l.color = color(fill);
    l.overflow = Label.Overflow.SHRINK;
    l.horizontalAlign = Label.HorizontalAlign.CENTER;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    return l;
  }
  button(
    id: string,
    label: string,
    x: number,
    y: number,
    w: number,
    h = this.hitSize,
    primary = false,
    disabled = false,
  ) {
    h = Math.max(h, this.hitSize);
    const pressed = this.pressed === id;
    this.panel(x, y + 3, w, h - 3, primary ? '#659d98' : '#0b1427b0', '', 13);
    this.panel(
      x,
      y + (pressed ? 3 : 0),
      w,
      h - 3,
      disabled ? '#293b53' : primary ? '#b8eadc' : '#263b5bed',
      primary ? '#e0fff280' : C.border,
      13,
    );
    this.text(
      'b:' + id,
      label,
      x + w / 2,
      y + h / 2 + (pressed ? 2 : 0),
      primary ? 22 : 18,
      w - 10,
      disabled ? '#8c9cac' : primary ? '#123448' : '#edf4ff',
      h - 6,
    );
    this.hit(id, label, x, y, w, h, disabled);
  }
  hit(id: string, label: string, x: number, y: number, w: number, h: number, disabled = false) {
    this.controls.push({ id, label, x, y, w, h, disabled });
  }
  at(x: number, y: number) {
    return [...this.controls]
      .reverse()
      .find((c) => !c.disabled && x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
  }
  pause(x: number, y: number) {
    const s = this.hitSize;
    this.panel(x, y, s, s, '#1b2c48cc', C.border, 14);
    this.panel(x + s * 0.32, y + s * 0.27, 6, s * 0.46, C.white, '', 0);
    this.panel(x + s * 0.57, y + s * 0.27, 6, s * 0.46, C.white, '', 0);
    this.hit('pause', '暂停', x, y, s, s);
  }
  brake(y: number, charge: number, left: number) {
    const x = W / 2,
      r = 47;
    this.circle(x, y, r + 7, '#18233c80', charge || left ? '#b8eadccc' : '#647b9b80', 2);
    this.circle(x, y, r, charge || left ? '#31566be6' : '#26364cc0');
    this.text('brake-title', left > 0 ? '定格' : '刹车', x, y - 7, 25, 100, C.white);
    this.text(
      'brake-sub',
      left > 0 ? left.toFixed(1) + '秒' : charge ? '轻点 · 0.8秒' : '连穿3层补充',
      x,
      y + 20,
      12,
      112,
      '#c5d9e8',
    );
    this.hit('brake', '刹车', x - r - 7, y - r - 7, 2 * (r + 7), 2 * (r + 7), !charge || left > 0);
  }
  radar(landing: any, x: number, y: number) {
    if (!landing) return;
    const g = this.graphics,
      r = 27;
    this.circle(x, y, r + 4, '#0f233ac0');
    const layer = landing.layer;
    for (let a = 0; a < Math.PI * 2; a += 0.08) {
      const local =
        (((a - landing.effectiveRotation) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const inside = (arc: any) =>
        arc &&
        (local - arc.start + Math.PI * 2) % (Math.PI * 2) <
          (arc.end - arc.start + Math.PI * 2) % (Math.PI * 2);
      if (inside(layer.gap)) continue;
      g.strokeColor = color(layer.danger.some(inside) ? C.red : C.jade);
      g.lineWidth = 7;
      g.moveTo(x - W / 2 + Math.cos(a) * r, this.H / 2 - y - Math.sin(a) * r);
      g.lineTo(x - W / 2 + Math.cos(a + 0.08) * r, this.H / 2 - y - Math.sin(a + 0.08) * r);
      g.stroke();
    }
    this.circle(x, y + r, 4, C.white, C.gold, 1);
    const labels: any = { gap: '可穿越', danger: '危险', normal: '可反弹', finish: '终点' };
    this.text(
      'radar-label',
      labels[landing.type],
      x,
      y + 46,
      13,
      90,
      landing.type === 'danger' ? C.red : C.white,
    );
  }
  dispose() {
    this.disposed = true;
    this.root.destroy();
    this.sky.destroy();
    this.camera.node.destroy();
    this.skyCamera.node.destroy();
    this.frames.forEach((f) => f.destroy());
    this.textures.forEach((t) => t.destroy());
    resources.release('sky-atlas', ImageAsset);
    resources.release('sky-alternate', ImageAsset);
  }
}
