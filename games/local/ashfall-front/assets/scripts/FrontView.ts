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
  button(
    id: string,
    label: string,
    x: number,
    y: number,
    w: number,
    h = 66,
    primary = false,
    disabled = false,
  ) {
    h = Math.max(h, 44 / this.scale);
    x = Math.max(this.safe.left + 8, Math.min(x, this.safe.right - w - 8));
    y = Math.max(this.safe.top + 8, Math.min(y, this.safe.bottom - h - 8));
    this.box(
      x,
      y,
      w,
      h,
      disabled ? '#1b2823' : primary ? '#bd813d' : '#182d24',
      primary ? '#efbb68' : '#738370',
    );
    const rows = label.split('\n').length,
      size = rows > 1 ? 20 : 24,
      textHeight = Math.min(h - 12, rows * size * 1.35);
    this.text(
      id,
      label,
      x + 5,
      y + (h - textHeight) / 2,
      w - 10,
      size,
      disabled ? '#738370' : '#f1e6c6',
      textHeight,
    );
    this.controls.push({ id, label, x, y, w, h, disabled });
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
