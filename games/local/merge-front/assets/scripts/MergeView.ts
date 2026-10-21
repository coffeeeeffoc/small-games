import {
  Camera,
  Canvas,
  Color,
  Graphics,
  ImageAsset,
  Label,
  LabelOutline,
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
  macro,
} from 'cc';

export const W = 960,
  H = 540;
export const C = {
  ink: '#123d37',
  deep: '#0d2928',
  jade: '#247064',
  mint: '#8ce4cb',
  gold: '#f3cb79',
  paper: '#fff2cf',
  muted: '#b8c8b5',
  red: '#eb7973',
};
export type Control = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  disabled: boolean;
};
const color = (hex: string) => new Color().fromHEX(hex);

/** Cocos owns every visible game object; nodes are reused between frames. */
export class MergeView {
  root: Node;
  camera: Camera;
  layers: Node[] = [];
  graphics: Graphics[] = [];
  nodes = new Map<string, Node>();
  frames = new Map<string, SpriteFrame>();
  textures: Texture2D[] = [];
  seen = new Set<string>();
  controls: Control[] = [];
  pressed = '';
  ready = false;
  error = '';
  disposed = false;
  assets = new Map<string, ImageAsset>();
  constructor(parent: Node) {
    this.root = this.node('MergeFrontCanvas', parent);
    const canvas = this.root.addComponent(Canvas);
    const cn = new Node('MergeFrontCamera');
    parent.addChild(cn);
    this.camera = cn.addComponent(Camera);
    this.camera.projection = Camera.ProjectionType.ORTHO;
    this.camera.near = 0.1;
    this.camera.far = 2000;
    this.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    this.camera.clearColor = color(C.deep);
    this.camera.visibility = Layers.Enum.UI_2D;
    canvas.cameraComponent = this.camera;
    // Background, units, battlefield effects, interface, portraits, text, overlay, overlay text.
    for (let i = 0; i < 8; i++) {
      const layer = this.node('Layer' + i, this.root);
      this.layers.push(layer);
      this.graphics.push(this.node('Draw' + i, layer).addComponent(Graphics));
    }
    view.setOrientation(macro.ORIENTATION_LANDSCAPE);
    view.setDesignResolutionSize(W, H, ResolutionPolicy.SHOW_ALL);
    this.root.getComponent(UITransform)!.setContentSize(W, H);
    this.root.setPosition(W / 2, H / 2);
    this.camera.node.setPosition(W / 2, H / 2, 1000);
    this.camera.orthoHeight = H / 2;
    this.load();
  }
  node(name: string, parent: Node) {
    const n = new Node(name);
    n.layer = Layers.Enum.UI_2D;
    parent.addChild(n);
    n.addComponent(UITransform);
    return n;
  }
  load() {
    this.error = '';
    for (const key of ['units', 'world']) {
      if (this.assets.has(key)) continue;
      resources.load(key, ImageAsset, (error, asset) => {
        if (this.disposed) return;
        if (error) {
          this.error = '画面加载失败，点击重试';
          return;
        }
        this.assets.set(key, asset);
        const texture = new Texture2D();
        texture.image = asset;
        this.textures.push(texture);
        const frame = (id: string, x: number, y: number, width: number, height: number) => {
          const f = new SpriteFrame();
          f.texture = texture;
          f.rect = new Rect(x, y, width, height);
          this.frames.set(id, f);
        };
        if (key === 'world') {
          frame('home', 0, 0, asset.width, asset.height / 2);
          frame('field', 0, asset.height / 2, asset.width, asset.height / 2);
        } else {
          const rows = [0, 297, 599, 836, 1086];
          for (let i = 0; i < 16; i++) {
            const r = Math.floor(i / 4);
            frame(
              'unit' + i,
              ((i % 4) * asset.width) / 4,
              rows[r],
              asset.width / 4,
              rows[r + 1] - rows[r],
            );
          }
        }
        this.ready = this.assets.size === 2;
      });
    }
  }
  begin() {
    this.controls = [];
    this.seen.clear();
    this.graphics.forEach((g) => g.clear());
  }
  end() {
    for (const [key, node] of this.nodes)
      if (!this.seen.has(key)) {
        node.destroy();
        this.nodes.delete(key);
      }
  }
  cached(id: string, layer = 5) {
    this.seen.add(id);
    let n = this.nodes.get(id);
    if (!n) {
      n = this.node(id, this.layers[layer]);
      this.nodes.set(id, n);
    }
    n.active = true;
    if (n.parent !== this.layers[layer]) n.setParent(this.layers[layer]);
    return n;
  }
  panel(
    x: number,
    y: number,
    w: number,
    h: number,
    fill = C.ink,
    stroke = C.gold,
    radius = 18,
    layer = 3,
  ) {
    const g = this.graphics[layer];
    g.fillColor = color(fill);
    g.roundRect(x - W / 2, H / 2 - y - h, w, h, radius);
    g.fill();
    if (stroke) {
      g.strokeColor = color(stroke);
      g.lineWidth = 2;
      g.stroke();
    }
  }
  circle(x: number, y: number, r: number, fill: string, stroke = '', layer = 3) {
    const g = this.graphics[layer];
    g.fillColor = color(fill);
    g.circle(x - W / 2, H / 2 - y, r);
    g.fill();
    if (stroke) {
      g.strokeColor = color(stroke);
      g.lineWidth = 3;
      g.stroke();
    }
  }
  line(x: number, y: number, tx: number, ty: number, stroke: string, width = 3, layer = 2) {
    const g = this.graphics[layer];
    g.strokeColor = color(stroke);
    g.lineWidth = width;
    g.moveTo(x - W / 2, H / 2 - y);
    g.lineTo(tx - W / 2, H / 2 - ty);
    g.stroke();
  }
  text(
    id: string,
    value: string,
    x: number,
    y: number,
    size = 24,
    width = 300,
    fill = C.paper,
    layer = 5,
    height = size * 1.5,
  ) {
    const n = this.cached('text:' + id, layer);
    n.setPosition(x - W / 2, H / 2 - y);
    n.getComponent(UITransform)!.setContentSize(width, height);
    const l = n.getComponent(Label) || n.addComponent(Label);
    if (l.string !== value) l.string = value;
    l.fontFamily = 'Microsoft YaHei';
    l.fontSize = size;
    l.lineHeight = size * 1.3;
    l.isBold = true;
    l.color = color(fill);
    l.overflow = Label.Overflow.CLAMP;
    l.horizontalAlign = Label.HorizontalAlign.CENTER;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    const outline = n.getComponent(LabelOutline) || n.addComponent(LabelOutline);
    outline.color = color(C.deep);
    outline.width = fill === C.ink ? 0 : 1.3;
    return l;
  }
  image(
    id: string,
    frameKey: string,
    x: number,
    y: number,
    w: number,
    h: number,
    layer = 4,
    flip = false,
    tint = '#ffffff',
    angle = 0,
  ) {
    const n = this.cached('image:' + id, layer);
    n.setPosition(x - W / 2, H / 2 - y);
    n.setScale(flip ? -1 : 1, 1, 1);
    n.angle = angle;
    n.getComponent(UITransform)!.setContentSize(w, h);
    const s = n.getComponent(Sprite) || n.addComponent(Sprite);
    s.sizeMode = Sprite.SizeMode.CUSTOM;
    s.spriteFrame = this.frames.get(frameKey) || null;
    s.color = color(tint);
    return n;
  }
  button(
    id: string,
    label: string,
    x: number,
    y: number,
    w: number,
    h = 78,
    primary = false,
    disabled = false,
    layer = 3,
  ) {
    const pressed = this.pressed === id;
    this.panel(x, y + 4, w, h, '#092420', '', 20, layer);
    this.panel(
      x,
      y + (pressed ? 4 : 0),
      w,
      h - 4,
      disabled ? '#344d46' : primary ? '#eeb750' : C.ink,
      disabled ? '#667767' : C.gold,
      18,
      layer,
    );
    this.text(
      'button:' + id,
      label,
      x + w / 2,
      y + h / 2 + (pressed ? 3 : 0),
      primary ? 30 : 25,
      w - 10,
      disabled ? '#89988a' : primary ? C.ink : C.paper,
      layer === 6 ? 7 : 5,
      h - 10,
    );
    this.hit(id, label, x, y, w, h, disabled);
  }
  hit(id: string, label: string, x: number, y: number, w: number, h: number, disabled = false) {
    this.controls.push({ id, label, x, y, w, h, disabled });
  }
  at(x: number, y: number) {
    return [...this.controls]
      .reverse()
      .find((r) => !r.disabled && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  }
  progress(x: number, y: number, w: number, fraction: number, fill = C.mint, h = 8, layer = 3) {
    this.panel(x, y, w, h, C.deep, '', h / 2, layer);
    const p = Math.max(0, Math.min(1, fraction));
    if (p > 0) this.panel(x, y, Math.max(h, w * p), h, fill, '', h / 2, layer);
  }
  crystal(x: number, y: number, enemy: boolean, pulse: number) {
    this.circle(x, y + 20, 30, '#173d3790', '', 2);
    this.circle(x, y + 20, 24 + Math.sin(pulse) * 2, enemy ? '#aa434f88' : '#45ceb088', C.gold, 2);
    const g = this.graphics[2];
    const polygon = (points: number[][], fill: string) => {
      g.fillColor = color(fill);
      g.moveTo(points[0][0] - W / 2, H / 2 - points[0][1]);
      for (const p of points.slice(1)) g.lineTo(p[0] - W / 2, H / 2 - p[1]);
      g.close();
      g.fill();
      g.strokeColor = color(C.paper);
      g.lineWidth = 2;
      g.stroke();
    };
    polygon(
      [
        [x, y - 54],
        [x + 24, y - 9],
        [x, y + 23],
        [x - 23, y - 9],
      ],
      enemy ? '#ec7a8e' : '#72e4d1',
    );
    polygon(
      [
        [x, y - 54],
        [x + 24, y - 9],
        [x, y + 23],
      ],
      enemy ? '#ad3d63' : '#279e9c',
    );
    this.line(x, y - 44, x - 12, y - 8, '#ffffff', 4, 2);
  }
  pause(x: number, y: number) {
    this.panel(x, y, 76, 72, C.ink, C.gold, 18);
    this.panel(x + 24, y + 20, 9, 30, C.paper, '', 0);
    this.panel(x + 43, y + 20, 9, 30, C.paper, '', 0);
    this.hit('pause', '暂停', x, y, 76, 72);
  }
  dispose() {
    this.disposed = true;
    this.root.destroy();
    this.camera.node.destroy();
    for (const frame of this.frames.values()) frame.destroy();
    this.textures.forEach((t) => t.destroy());
    for (const key of this.assets.keys()) resources.release(key, ImageAsset);
    this.frames.clear();
    this.nodes.clear();
  }
}
