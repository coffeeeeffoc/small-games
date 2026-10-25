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
  disabled?: boolean;
};
const c = (hex: string) => new Color().fromHEX(hex);
export class FrontView {
  W = 844;
  H = 390;
  scale = 1;
  root: Node;
  camera: Camera;
  graphics: Graphics;
  controls: Control[] = [];
  pressed = new Set<string>();
  nodes = new Map<string, Node>();
  seen = new Set<string>();
  frames = new Map<string, SpriteFrame>();
  textures: Texture2D[] = [];
  ready = false;
  disposed = false;
  error = '';
  cameraX = 0;
  worldScale = 1;
  spriteIndex = 0;
  safe = { left: 0, top: 0, right: 844, bottom: 430 };
  constructor(parent: Node) {
    this.root = new Node('FrontCanvas');
    this.root.layer = Layers.Enum.UI_2D;
    parent.addChild(this.root);
    this.root.addComponent(UITransform);
    const canvas = this.root.addComponent(Canvas);
    const cameraNode = new Node('FrontCamera');
    parent.addChild(cameraNode);
    this.camera = cameraNode.addComponent(Camera);
    this.camera.projection = Camera.ProjectionType.ORTHO;
    this.camera.near = 0.1;
    this.camera.far = 2000;
    this.camera.visibility = Layers.Enum.UI_2D;
    this.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    this.camera.clearColor = c('#0b1c16');
    canvas.cameraComponent = this.camera;
    this.graphics = this.node('WorldGraphics').addComponent(Graphics);
    this.resize();
    const names = ['far', 'floor', 'mid-0', 'mid-1', 'mid-2', 'barrel', 'platform'];
    for (const actor of ['player', 'shooter', 'chaser', 'drone', 'boss'])
      for (let i = 0; i < 4; i++) names.push(`${actor}-${i}`);
    for (const name of names)
      resources.load('art/' + name, ImageAsset, (err, asset) => {
        if (this.disposed) return;
        if (err) {
          this.error = '战区资源加载失败，请重新加载';
          return;
        }
        const t = new Texture2D();
        t.image = asset;
        this.textures.push(t);
        const f = new SpriteFrame();
        f.texture = t;
        this.frames.set(name, f);
        this.ready = this.frames.size === names.length;
      });
  }
  resize() {
    const f = view.getFrameSize();
    this.H = Math.max(430, (this.W * f.height) / f.width);
    this.scale = Math.min(f.width / this.W, f.height / this.H);
    view.setDesignResolutionSize(this.W, this.H, ResolutionPolicy.SHOW_ALL);
    this.root.getComponent(UITransform)!.setContentSize(this.W, this.H);
    this.root.setPosition(this.W / 2, this.H / 2);
    this.camera.node.setPosition(this.W / 2, this.H / 2, 1000);
    this.camera.orthoHeight = this.H / 2;
    const area = sys.getSafeAreaRect(false);
    this.safe = {
      left: Math.max(0, area.x),
      right: Math.min(this.W, area.x + area.width),
      top: Math.max(0, this.H - area.y - area.height),
      bottom: Math.min(this.H, this.H - area.y),
    };
  }
  node(id: string) {
    const n = new Node(id);
    n.layer = Layers.Enum.UI_2D;
    this.root.addChild(n);
    n.addComponent(UITransform);
    return n;
  }
  get(id: string) {
    let n = this.nodes.get(id);
    if (!n) {
      n = this.node(id);
      this.nodes.set(id, n);
    }
    n.active = true;
    this.seen.add(id);
    return n;
  }
  begin() {
    this.seen.clear();
    this.controls = [];
    this.graphics.clear();
    this.spriteIndex = 0;
  }
  end() {
    this.graphics.node.setSiblingIndex(this.spriteIndex);
    for (const [id, n] of this.nodes) {
      if (!this.seen.has(id) && /^sprite-[eb]\d+$/.test(id)) {
        n.destroy();
        this.nodes.delete(id);
      } else if (!this.seen.has(id)) n.active = false;
      else if (id.startsWith('text-')) n.setSiblingIndex(this.root.children.length - 1);
    }
  }
  text(
    id: string,
    text: string,
    x: number,
    y: number,
    w: number,
    size = 22,
    color = '#efe5c5',
    height = size * 1.5 * text.split('\n').length,
    left = false,
  ) {
    const n = this.get('text-' + id);
    n.setPosition(x + w / 2 - this.W / 2, this.H / 2 - y - height / 2);
    const l = n.getComponent(Label) || n.addComponent(Label);
    l.string = text;
    l.fontSize = size;
    l.lineHeight = size * 1.35;
    l.color = c(color);
    l.overflow = Label.Overflow.SHRINK;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    l.horizontalAlign = left ? Label.HorizontalAlign.LEFT : Label.HorizontalAlign.CENTER;
    n.getComponent(UITransform)!.setContentSize(w, height);
    return l;
  }
  box(x: number, y: number, w: number, h: number, fill: string, stroke = '#829077') {
    this.graphics.fillColor = c(fill);
    this.graphics.strokeColor = c(stroke);
    this.graphics.lineWidth = 1.5;
    this.graphics.roundRect(x - this.W / 2, this.H / 2 - y - h, w, h, 5);
    this.graphics.fill();
    this.graphics.stroke();
  }
  panel(x: number, y: number, w: number, h: number, fill = '#10221ff5', stroke = '#526b5b') {
    const g = this.graphics,
      cut = Math.min(10, h / 4);
    g.fillColor = c(fill);
    g.strokeColor = c(stroke);
    g.lineWidth = 1;
    g.moveTo(x - this.W / 2, this.H / 2 - y);
    for (const [px, py] of [
      [x + w - cut, y],
      [x + w, y + cut],
      [x + w, y + h],
      [x + cut, y + h],
      [x, y + h - cut],
    ])
      g.lineTo(px - this.W / 2, this.H / 2 - py);
    g.close();
    g.fill();
    g.stroke();
  }
  icon(id: string, x: number, y: number, color: string) {
    const line = (a: number, b: number, d: number, e: number) =>
      this.line(x + a, y + b, x + d, y + e, color, 2.5);
    if (id === 'pause') {
      this.box(x - 8, y - 10, 5, 20, color, color);
      this.box(x + 3, y - 10, 5, 20, color, color);
    } else if (id === 'fire') {
      const g = this.graphics;
      g.strokeColor = c(color);
      g.lineWidth = 2;
      g.circle(x - this.W / 2, this.H / 2 - y, 11);
      g.stroke();
      line(-20, 0, -7, 0);
      line(7, 0, 20, 0);
      line(0, -20, 0, -7);
      line(0, 7, 0, 20);
    } else if (id === 'jump') {
      line(-10, 0, 0, -10);
      line(0, -10, 10, 0);
      line(0, -10, 0, 12);
    } else if (id === 'dash') {
      for (const offset of [-8, 4]) {
        line(offset - 5, -9, offset + 5, 0);
        line(offset + 5, 0, offset - 5, 9);
      }
    } else {
      const direction = id === 'left' ? -1 : 1;
      line(-6 * direction, -10, 6 * direction, 0);
      line(6 * direction, 0, -6 * direction, 10);
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
    quiet = false,
  ) {
    h = Math.max(h, 44 / this.scale);
    w = Math.max(w, 44 / this.scale);
    x = Math.max(this.safe.left + 8, Math.min(x, this.safe.right - w - 8));
    y = Math.max(this.safe.top + 8, Math.min(y, this.safe.bottom - h - 8));
    const pressed = this.pressed.has(id),
      ink = disabled ? '#879589' : primary ? '#fff1d6' : '#e5e8d7',
      fill = disabled ? '#17271fe0' : pressed ? '#526b49f5' : primary ? '#a9753bea' : '#19352ac9',
      stroke = disabled ? '#3d5145' : primary ? '#e9b879' : '#607b67',
      pad = ['left', 'right', 'jump', 'dash', 'fire', 'pause'].includes(id),
      visualH = h >= 100 ? h - 8 : Math.min(h - 10, pad ? 74 : 44),
      top = y + (h - visualH) / 2;
    if (pad) {
      const r = Math.min(w - 10, visualH) / 2;
      const g = this.graphics;
      g.fillColor = c(fill);
      g.strokeColor = c(stroke);
      g.lineWidth = primary ? 2 : 1;
      g.circle(x + w / 2 - this.W / 2, this.H / 2 - y - h / 2, r);
      g.fill();
      g.stroke();
      this.icon(id, x + w / 2, y + h / 2, ink);
    } else {
      if (!quiet || pressed) this.panel(x, top, w, visualH, fill, stroke);
      if (primary) this.line(x + 10, top + 4, x + w - 16, top + 4, '#f0c98b', 1);
    }
    const rows = label.split('\n').length,
      size = rows > 1 ? 19 : 21,
      textHeight = Math.min(h - 12, rows * size * 1.35);
    if (!pad) this.text(id, label, x + 5, y + (h - textHeight) / 2, w - 10, size, ink, textHeight);
    this.controls.push({ id, label, x, y, w, h, disabled });
    return this.controls[this.controls.length - 1];
  }
  image(
    id: string,
    frame: string,
    x: number,
    y: number,
    w: number,
    h: number,
    flip = false,
    flash = false,
  ) {
    const f = this.frames.get(frame);
    if (!f) return;
    const n = this.get('sprite-' + id);
    n.setPosition(x + w / 2 - this.W / 2, this.H / 2 - y - h / 2);
    n.setScale(flip ? -1 : 1, 1, 1);
    const s = n.getComponent(Sprite) || n.addComponent(Sprite);
    s.spriteFrame = f;
    s.sizeMode = Sprite.SizeMode.CUSTOM;
    s.color = flash ? c('#ffe6a2') : Color.WHITE;
    n.getComponent(UITransform)!.setContentSize(w, h);
    n.setSiblingIndex(this.spriteIndex++);
  }
  line(x: number, y: number, tx: number, ty: number, color: string, width = 3) {
    const g = this.graphics;
    g.strokeColor = c(color);
    g.lineWidth = width;
    g.moveTo(x - this.W / 2, this.H / 2 - y);
    g.lineTo(tx - this.W / 2, this.H / 2 - ty);
    g.stroke();
  }
  circle(x: number, y: number, r: number, color: string) {
    this.graphics.fillColor = c(color);
    this.graphics.circle(x - this.W / 2, this.H / 2 - y, r);
    this.graphics.fill();
  }
  world(run: any, menu: boolean, time: number, reduced: boolean) {
    const s = (this.worldScale = this.H / 720),
      width = this.W / s;
    const cx = (this.cameraX = menu
      ? 160
      : Math.max(0, Math.min(run.level.width - width, run.player.x - width * 0.34)));
    // Higher sibling indices paint over the previous layer.
    for (const [layer, speed] of [
      ['far', 0.17],
      [`mid-${run.levelIndex % 3}`, 0.49],
      ['floor', 1],
    ] as [string, number][]) {
      const offset = (cx * speed) % 1800;
      for (let i = 0; i < 3; i++)
        this.image(`${layer}-${i}`, layer, (i * 1800 - offset) * s, 0, 1800 * s, this.H);
    }
    const actor = (a: any, id: string, player = false) => {
      if (a.x < cx - 220 || a.x > cx + width + 220) return;
      const boss = a.type === 'boss',
        name = player ? 'player' : a.type;
      const frame = reduced
        ? 0
        : boss && a.state === 'recover'
          ? 3
          : Math.abs(a.vx || 0) > 10
            ? 1 + (Math.floor(time * 9) % 3)
            : 0;
      const bw = boss ? 320 : 160,
        bh = boss ? 320 : 200,
        feet = boss ? 290 : 170;
      this.image(
        id,
        `${name}-${frame}`,
        (a.x - cx - bw / 2) * s,
        (a.y - feet) * s,
        bw * s,
        bh * s,
        a.facing < 0,
        a.hitFlash > 0,
      );
      if (a.fireFlash > 0) {
        const x = (a.x - cx + Math.cos(a.aimAngle) * 32) * s,
          y = (a.y - a.h * 0.61 + Math.sin(a.aimAngle) * 32) * s;
        this.circle(x, y, 7 * s, '#ffcc70');
        this.line(
          x,
          y,
          x + Math.cos(a.aimAngle) * 16 * s,
          y + Math.sin(a.aimAngle) * 16 * s,
          '#fff4b0',
          4,
        );
      }
      if (boss) {
        this.box((a.x - cx - 75) * s, (a.y - 165) * s, 150 * s, 7, '#14231c');
        this.box(
          (a.x - cx - 75) * s,
          (a.y - 165) * s,
          Math.max(1, (150 * s * a.hp) / a.maxHp),
          7,
          '#db9e58',
        );
        if (a.state === 'telegraph')
          this.line(
            (a.x - cx) * s,
            (a.y - 6) * s,
            (a.attack.targetX - cx) * s,
            (a.y - 6) * s,
            '#ffb55d',
            5,
          );
      }
    };
    if (menu) {
      actor({ ...run.player, x: cx + width * 0.76, y: 570, facing: -1 }, 'hero', true);
      return;
    }
    for (const [i, p] of run.level.platforms.entries())
      if (p.x + p.w > cx && p.x < cx + width)
        this.image('platform-' + i, 'platform', (p.x - cx) * s, (p.y - 4) * s, p.w * s, 48 * s);
    for (const b of run.barrels)
      if (b.active && b.x > cx - 60 && b.x < cx + width + 60)
        this.image(b.id, 'barrel', (b.x - cx - 50) * s, (b.y - 85) * s, 100 * s, 100 * s);
    for (const a of run.enemies) actor(a, a.id);
    actor(run.player, 'player', true);
    for (const b of run.bullets)
      this.line(
        (b.px - cx) * s,
        b.py * s,
        (b.x - cx) * s,
        b.y * s,
        b.owner === 'player' ? '#ffe2a0' : '#ed8f64',
        b.owner === 'player' ? 3 : 4,
      );
    const wave = run.level.waves[run.waveIndex],
      x = (wave.checkpointX - cx) * s;
    this.line(x, 570 * s, x, 400 * s, '#e3b46d', 4);
    this.circle(x, 400 * s, 8, '#ffc76b');
  }
  hit(x: number, y: number) {
    return this.controls.findLast(
      (b) => !b.disabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h,
    );
  }
  dispose() {
    this.disposed = true;
    for (const f of this.frames.values()) f.destroy();
    this.textures.forEach((t) => t.destroy());
  }
}
