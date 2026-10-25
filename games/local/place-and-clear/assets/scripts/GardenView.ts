import {
  Camera,
  Canvas,
  Color,
  Graphics,
  ImageAsset,
  Label,
  Layers,
  Node,
  ResolutionPolicy,
  Sprite,
  SpriteFrame,
  Texture2D,
  UITransform,
  resources,
  view,
  sys,
} from 'cc';
export type Control = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  disabled: boolean;
};
export const C = {
  ink: '#183c34',
  muted: '#63745d',
  cream: '#fff7e4',
  orange: '#ed896c',
  gold: '#e8be55',
};
const color = (value: string) => new Color().fromHEX(value);
const mix = (a: string, b: string, t: number) => {
  const x = color(a),
    y = color(b);
  return new Color(
    x.r + (y.r - x.r) * t,
    x.g + (y.g - x.g) * t,
    x.b + (y.b - x.b) * t,
    x.a + (y.a - x.a) * t,
  );
};

/** Native Creator nodes render all game UI; only accessibility mirrors live in HTML. */
export class GardenView {
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
  W = 390;
  H = 844;
  scroll = 0;
  ready = false;
  disposed = false;
  error = '';
  constructor(
    parent: Node,
    private changed: () => void,
  ) {
    this.root = this.node('ThreeChooseTwoCanvas', parent);
    const canvas = this.root.addComponent(Canvas);
    const cn = new Node('GardenCamera');
    parent.addChild(cn);
    this.camera = cn.addComponent(Camera);
    this.camera.projection = Camera.ProjectionType.ORTHO;
    this.camera.near = 0.1;
    this.camera.far = 2000;
    this.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    this.camera.clearColor = color('#d0dfc2');
    this.camera.visibility = Layers.Enum.UI_2D;
    canvas.cameraComponent = this.camera;
    for (let i = 0; i < 8; i++) {
      const layer = this.node('Layer' + i, this.root);
      this.layers.push(layer);
      this.graphics.push(this.node('Draw' + i, layer).addComponent(Graphics));
    }
    this.resize();
    this.load();
  }
  resize() {
    const frame = view.getFrameSize();
    const width = sys.isBrowser ? window.innerWidth : frame.width,
      height = sys.isBrowser ? window.innerHeight : frame.height;
    this.W = Math.min(440, Math.max(320, width));
    this.H = (height * this.W) / Math.min(width, 440);
    view.setDesignResolutionSize(this.W, this.H, ResolutionPolicy.SHOW_ALL);
    this.root.getComponent(UITransform)!.setContentSize(this.W, this.H);
    this.root.setPosition(this.W / 2, this.H / 2);
    this.camera.node.setPosition(this.W / 2, this.H / 2, 1000);
    this.camera.orthoHeight = this.H / 2;
  }
  node(name: string, parent: Node) {
    const n = new Node(name);
    n.layer = Layers.Enum.UI_2D;
    parent.addChild(n);
    n.addComponent(UITransform);
    return n;
  }
  load() {
    for (const key of ['garden', 'logo', 'hero'])
      resources.load('art/' + key, ImageAsset, (error, asset) => {
        if (this.disposed) return;
        if (error) {
          this.error = '花园素材加载失败，请重试';
          this.changed();
          return;
        }
        const t = new Texture2D();
        t.image = asset;
        this.textures.push(t);
        const f = new SpriteFrame();
        f.texture = t;
        this.frames.set(key, f);
        (globalThis as any).ThreeChooseTwoLoading?.progress(this.frames.size / 3);
        this.ready = this.frames.size === 3;
        this.changed();
      });
  }
  begin(scroll = 0) {
    this.scroll = scroll;
    this.seen.clear();
    this.controls = [];
    this.graphics.forEach((g) => g.clear());
  }
  end() {
    for (const [id, n] of this.nodes)
      if (!this.seen.has(id)) {
        n.destroy();
        this.nodes.delete(id);
      }
  }
  cached(id: string, layer: number) {
    this.seen.add(id);
    let n = this.nodes.get(id);
    if (!n) {
      n = this.node(id, this.layers[layer]);
      this.nodes.set(id, n);
    }
    if (n.parent !== this.layers[layer]) n.setParent(this.layers[layer]);
    return n;
  }
  panel(
    x: number,
    y: number,
    w: number,
    h: number,
    fill = C.cream,
    stroke = '',
    r = 16,
    layer = 2,
  ) {
    const g = this.graphics[layer];
    g.fillColor = color(fill);
    g.roundRect(
      x - this.W / 2,
      this.H / 2 - y - h + this.scroll,
      w,
      h,
      Math.min(r, h / 2, w / 2),
    );
    g.fill();
    if (stroke) {
      g.strokeColor = color(stroke);
      g.lineWidth = 1.6;
      g.stroke();
    }
  }
  gradient(
    x: number,
    y: number,
    w: number,
    h: number,
    top: string,
    bottom: string,
    r = 18,
    layer = 2,
  ) {
    this.panel(x, y, w, h, bottom, '', r, layer);
    const g = this.graphics[layer];
    const steps = Math.max(8, Math.min(768, Math.ceil(h * 2)));
    for (let i = 0; i < steps; i++) {
      const t = i / steps,
        yy = t * h,
        hh = h / steps + 0.02;
      const dist = yy < r ? r - yy : yy + hh > h - r ? yy + hh - (h - r) : 0;
      const inset = dist ? r - Math.sqrt(Math.max(0, r * r - dist * dist)) : 0;
      g.fillColor = mix(top, bottom, t);
      g.rect(x + inset - this.W / 2, this.H / 2 - y - yy - hh + this.scroll, w - 2 * inset, hh);
      g.fill();
    }
  }
  line(x: number, y: number, tx: number, ty: number, fill: string, width = 2, layer = 3) {
    const g = this.graphics[layer];
    g.strokeColor = color(fill);
    g.lineWidth = width;
    g.moveTo(x - this.W / 2, this.H / 2 - y + this.scroll);
    g.lineTo(tx - this.W / 2, this.H / 2 - ty + this.scroll);
    g.stroke();
  }
  circle(x: number, y: number, r: number, fill: string, layer = 3) {
    const g = this.graphics[layer];
    g.fillColor = color(fill);
    g.circle(x - this.W / 2, this.H / 2 - y + this.scroll, r);
    g.fill();
  }
  text(
    id: string,
    value: string,
    x: number,
    y: number,
    size = 18,
    width = 330,
    fill = C.ink,
    layer = 5,
    height = size * 1.6,
    bold = true,
  ) {
    const n = this.cached('text:' + id, layer);
    n.setPosition(x - this.W / 2, this.H / 2 - y + this.scroll);
    n.getComponent(UITransform)!.setContentSize(width, height);
    const l = n.getComponent(Label) || n.addComponent(Label);
    l.string = value;
    l.fontFamily = 'Microsoft YaHei';
    l.fontSize = size;
    l.lineHeight = size * 1.45;
    l.isBold = bold;
    l.color = color(fill);
    l.overflow = Label.Overflow.CLAMP;
    l.horizontalAlign = Label.HorizontalAlign.CENTER;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    return l;
  }
  image(id: string, key: string, x: number, y: number, w: number, h: number, layer = 1) {
    const n = this.cached('image:' + id, layer);
    n.setPosition(x - this.W / 2, this.H / 2 - y + this.scroll);
    n.getComponent(UITransform)!.setContentSize(w, h);
    const s = n.getComponent(Sprite) || n.addComponent(Sprite);
    s.sizeMode = Sprite.SizeMode.CUSTOM;
    s.spriteFrame = this.frames.get(key) || null;
  }
  background(screen: string, contrast = false) {
    const old = this.scroll;
    this.scroll = 0;
    const f = this.frames.get('garden');
    const ratio = f ? f.width / f.height : 2 / 3;
    const h = Math.max(this.H, this.W / ratio),
      w = h * ratio;
    this.image('garden', 'garden', this.W / 2, this.H / 2, w, h, 0);
    if (contrast || !['home', 'levels', 'endless', 'playing'].includes(screen))
      this.panel(0, 0, this.W, this.H, contrast ? '#fff8e8e6' : '#fff8e8bb', '', 0, 1);
    this.scroll = old;
  }
  hit(id: string, label: string, x: number, y: number, w: number, h: number, disabled = false) {
    this.controls.push({ id, label, x, y: y - this.scroll, w, h, disabled });
  }
  at(x: number, y: number) {
    return [...this.controls]
      .reverse()
      .find((c) => !c.disabled && x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
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
    layer = 2,
    font = 19,
  ) {
    const down = this.pressed === id;
    this.panel(x, y + 4, w, h, primary ? '#ac6048' : '#a48b60', '', h > 60 ? 25 : 17, layer);
    this.gradient(
      x,
      y + (down ? 3 : 0),
      w,
      h,
      disabled ? '#e6e0ce' : primary ? '#f5987e' : '#fff8e9',
      disabled ? '#c9c2ae' : primary ? '#e57660' : '#ecdbb9',
      h > 60 ? 25 : 17,
      layer,
    );
    const g = this.graphics[layer];
    g.strokeColor = color(primary ? '#ffc5a2' : '#fff8e9');
    g.lineWidth = 2;
    g.roundRect(
      x - this.W / 2,
      this.H / 2 - y - h + this.scroll + (down ? -3 : 0),
      w,
      h,
      h > 60 ? 25 : 17,
    );
    g.stroke();
    this.text(
      'button:' + id,
      label,
      x + w / 2,
      y + h / 2 + (down ? 3 : 0),
      font,
      w - 8,
      disabled ? '#77796c' : primary ? '#fff9e6' : C.ink,
      layer === 6 ? 7 : 5,
      h - 4,
    );
    this.hit(id, label, x, y, w, h, disabled);
  }
  iconButton(id: string, label: string, icon: string, x: number, y: number, size = 44) {
    this.button(id, '', x, y, size, size);
    this.icon(icon, x + size / 2, y + size / 2, 22);
    this.controls[this.controls.length - 1].label = label;
  }
  icon(name: string, x: number, y: number, size = 24, fill = C.ink, layer = 5) {
    const g = this.graphics[layer],
      s = size / 24;
    const line = (a: number, b: number, c: number, d: number) =>
      this.line(
        x + (a - 12) * s,
        y + (b - 12) * s,
        x + (c - 12) * s,
        y + (d - 12) * s,
        fill,
        2 * s,
        layer,
      );
    if (name === 'pause') {
      this.panel(x - 7 * s, y - 8 * s, 4 * s, 16 * s, fill, '', 0.8, layer);
      this.panel(x + 3 * s, y - 8 * s, 4 * s, 16 * s, fill, '', 0.8, layer);
    } else if (name === 'back') {
      line(15, 4, 7, 12);
      line(7, 12, 15, 20);
    } else if (name === 'levels') {
      for (const a of [4, 14])
        for (const b of [4, 14])
          this.panel(
            x + (a - 12) * s,
            y + (b - 12) * s,
            6 * s,
            6 * s,
            '#ffffff00',
            fill,
            1,
            layer,
          );
    } else if (name === 'play') {
      g.fillColor = color(fill);
      g.moveTo(x - 5 * s - this.W / 2, this.H / 2 - y + 8 * s + this.scroll);
      g.lineTo(x + 8 * s - this.W / 2, this.H / 2 - y + this.scroll);
      g.lineTo(x - 5 * s - this.W / 2, this.H / 2 - y - 8 * s + this.scroll);
      g.close();
      g.fill();
    } else if (name === 'star') {
      g.fillColor = color(fill);
      for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + (i * Math.PI) / 5,
          r = i % 2 ? size * 0.23 : size * 0.5,
          px = x + Math.cos(angle) * r - this.W / 2,
          py = this.H / 2 - y - Math.sin(angle) * r + this.scroll;
        if (i) g.lineTo(px, py);
        else g.moveTo(px, py);
      }
      g.close();
      g.fill();
    } else if (name === 'lock') {
      this.panel(x - 5 * s, y, 10 * s, 7 * s, fill, '', 2, layer);
      line(8, 12, 8, 7);
      line(8, 7, 16, 7);
      line(16, 7, 16, 12);
    } else if (name === 'help') {
      this.circle(x, y, size / 2, fill, layer);
      this.circle(x, y, size / 2 - 2, '#fff4da', layer);
      this.text('icon-help:' + x + ':' + y, '?', x, y, size * 0.72, size, fill, layer, size);
    } else if (name === 'settings') {
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        this.line(
          x + Math.cos(a) * 7,
          y + Math.sin(a) * 7,
          x + Math.cos(a) * 11,
          y + Math.sin(a) * 11,
          fill,
          3,
          layer,
        );
      }
      this.circle(x, y, 7, fill, layer);
      this.circle(x, y, 3, '#fff4da', layer);
    } else if (name === 'trophy') {
      line(7, 4, 17, 4);
      line(7, 4, 7, 11);
      line(17, 4, 17, 11);
      line(7, 11, 12, 15);
      line(17, 11, 12, 15);
      line(12, 15, 12, 20);
      line(8, 21, 16, 21);
      line(7, 6, 3, 6);
      line(3, 6, 4, 12);
      line(4, 12, 8, 13);
      line(17, 6, 21, 6);
      line(21, 6, 20, 12);
      line(20, 12, 16, 13);
    } else
      this.text(
        'icon:' + name + ':' + x + ':' + y,
        name === 'endless' ? '∞' : name === 'undo' ? '↶' : '↻',
        x,
        y,
        size * 1.2,
        size * 1.5,
        fill,
        layer,
        size * 1.5,
      );
  }
  block(x: number, y: number, size: number, fill: string, layer = 3) {
    const r = Math.max(3, size * 0.14);
    this.panel(x, y + 1.5, size, size, fill, '#314c385a', r, layer);
    this.gradient(
      x + 1,
      y,
      size - 2,
      size - 2,
      mix('#ffffff', fill, 0.62).toHEX('#rrggbb'),
      mix(fill, '#34412b', 0.12).toHEX('#rrggbb'),
      r,
      layer,
    );
    const g = this.graphics[layer];
    g.strokeColor = color('#ffffff66');
    g.lineWidth = 0.8;
    g.roundRect(
      x + 2.5 - this.W / 2,
      this.H / 2 - y - size + 6 + this.scroll,
      size - 5,
      size - 6,
      Math.max(2, r - 1),
    );
    g.stroke();
  }
  dispose() {
    this.disposed = true;
    this.root.destroy();
    this.camera.node.destroy();
    this.frames.forEach((f) => f.destroy());
    this.textures.forEach((t) => t.destroy());
    for (const k of ['garden', 'logo', 'hero']) resources.release('art/' + k, ImageAsset);
  }
}
