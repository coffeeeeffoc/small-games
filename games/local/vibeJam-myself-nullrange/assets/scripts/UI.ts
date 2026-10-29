import { MISSILE_RANGE } from './core/content';
import { WATER_LEVEL } from './core/terrain';
import {
  Camera,
  Sprite,
  SpriteFrame,
  Texture2D,
  Rect,
  resources,
  Canvas,
  Color,
  Graphics,
  Label,
  Layers,
  Node,
  ResolutionPolicy,
  UITransform,
  macro,
  sys,
  view,
} from 'cc';
import { DT, distance, targetInCone, terrainHeight } from './core/rules';
import type { State, Point } from './core/rules';
import type { Progress } from './core/progress';
import { missionUnlocked, craftUnlocked } from './core/progress';
import { MISSIONS, CRAFTS, totalEnemies } from './core/content';
import {
  logicalInsets,
  safeBounds,
  ZERO_INSETS,
  radarContacts,
  missionRating,
  objectiveText,
  navigationTarget,
  engagementHint,
  distanceText,
} from './core/presentation';
import type { Insets } from './core/presentation';
export type Screen =
  | 'home'
  | 'missions'
  | 'prepare'
  | 'playing'
  | 'paused'
  | 'result'
  | 'settings'
  | 'help'
  | 'online';
export type Control = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  disabled: boolean;
  round?: boolean;
};
const C = {
  navy: '#102538',
  cyan: '#5ed5ce',
  amber: '#f6bb69',
  white: '#eef3e5',
  muted: '#a9c3ce',
  red: '#ff8a70',
  edge: '#8aa7b566',
};
const color = (hex: string) => new Color().fromHEX(hex);
const center = Label.HorizontalAlign.CENTER,
  right = Label.HorizontalAlign.RIGHT;
export class UI {
  root: Node;
  camera: Camera;
  graphics: Graphics;
  width = 844;
  height = 390;
  scale = 1;
  safe = safeBounds(844, 390, ZERO_INSETS, ZERO_INSETS);
  controls: Control[] = [];
  cards: Sprite[] = [];
  atlasReady = false;
  private disposed = false;
  labels = new Map<string, Label>();
  seen = new Set<string>();
  pressed = new Set<string>();
  stick = { x: 0, y: 0 };
  project?: (p: Point) => { x: number; y: number; visible: boolean };
  targetMarker: { id: number; x: number; y: number; labelY: number } | null = null;
  constructor(parent: Node) {
    this.root = new Node('FlightUI');
    this.root.layer = Layers.Enum.UI_2D;
    parent.addChild(this.root);
    const canvas = this.root.addComponent(Canvas),
      cn = new Node('UICamera');
    parent.addChild(cn);
    this.camera = cn.addComponent(Camera);
    this.camera.projection = Camera.ProjectionType.ORTHO;
    this.camera.priority = 2;
    this.camera.visibility = Layers.Enum.UI_2D;
    this.camera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
    this.camera.near = 0.1;
    this.camera.far = 2000;
    canvas.cameraComponent = this.camera;
    const drawing = new Node('Instruments');
    drawing.layer = Layers.Enum.UI_2D;
    this.root.addChild(drawing);
    drawing.addComponent(UITransform);
    this.graphics = drawing.addComponent(Graphics);
    for (let i = 0; i < 6; i++) {
      const n = new Node('MissionIllustration' + i);
      n.layer = Layers.Enum.UI_2D;
      this.root.addChild(n);
      n.addComponent(UITransform);
      this.cards.push(n.addComponent(Sprite));
      n.active = false;
    }
    resources.load('textures/mission-atlas/texture', Texture2D, (err, texture) => {
      if (err || this.disposed) return;
      const bounds = [0, 683, 1365, 2048];
      this.cards.forEach((sprite, i) => {
        const f = new SpriteFrame();
        f.texture = texture;
        f.rect = new Rect(
          bounds[i % 3],
          Math.floor(i / 3) * 384,
          bounds[(i % 3) + 1] - bounds[i % 3],
          384,
        );
        sprite.spriteFrame = f;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      });
      this.atlasReady = true;
    });
    this.resize();
  }
  resize() {
    view.setOrientation(macro.ORIENTATION_LANDSCAPE);
    const f = view.getFrameSize(),
      short = Math.min(f.width, f.height),
      long = Math.max(f.width, f.height);
    this.width = (390 * long) / short;
    this.scale = short / 390;
    view.setDesignResolutionSize(this.width, this.height, ResolutionPolicy.SHOW_ALL);
    const host = (
        globalThis as typeof globalThis & {
          NullRangeHost?: { safeArea(): Insets & { rotated: boolean } };
        }
      ).NullRangeHost,
      physical = host?.safeArea();
    // Web's host already rotates physical CSS insets; Creator reads those unrotated.
    if (physical) {
      this.safe = safeBounds(
        this.width,
        this.height,
        logicalInsets(physical, physical.rotated, this.scale),
        ZERO_INSETS,
      );
    } else {
      const n = sys.getSafeAreaRect(false);
      this.safe = safeBounds(this.width, this.height, ZERO_INSETS, {
        left: n.x,
        bottom: n.y,
        right: this.width - n.x - n.width,
        top: this.height - n.y - n.height,
      });
    }
    this.root.getComponent(UITransform)!.setContentSize(this.width, this.height);
    this.root.setPosition(this.width / 2, this.height / 2);
    this.camera.node.setPosition(this.width / 2, this.height / 2, 1000);
    this.camera.orthoHeight = this.height / 2;
  }
  polygon(points: number[][], fill: string, stroke = '', width = 1) {
    const g = this.graphics;
    if (fill) {
      g.moveTo(points[0][0] - this.width / 2, this.height / 2 - points[0][1]);
      for (const [x, y] of points.slice(1)) g.lineTo(x - this.width / 2, this.height / 2 - y);
      g.close();
      if (fill) {
        g.fillColor = color(fill);
        g.fill();
      }
    }
    if (stroke)
      for (let i = 0; i < points.length; i++) {
        const a = points[i],
          b = points[(i + 1) % points.length];
        this.line(a[0], a[1], b[0], b[1], stroke, width);
      }
  }
  rect(x: number, y: number, w: number, h: number, fill: string, stroke = '') {
    this.polygon(
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ],
      fill,
      stroke,
    );
  }
  plate(x: number, y: number, w: number, h: number, fill = '#091e2be8', stroke = C.edge, cut = 8) {
    this.polygon(
      [
        [x + cut, y],
        [x + w, y],
        [x + w, y + h - cut],
        [x + w - cut, y + h],
        [x, y + h],
        [x, y + cut],
      ],
      fill,
      stroke,
    );
  }
  line(x: number, y: number, tx: number, ty: number, stroke = C.cyan, width = 1) {
    const length = Math.hypot(tx - x, ty - y) || 1,
      dx = ((-(ty - y) / length) * width) / 2,
      dy = (((tx - x) / length) * width) / 2;
    this.polygon(
      [
        [x + dx, y + dy],
        [tx + dx, ty + dy],
        [tx - dx, ty - dy],
        [x - dx, y - dy],
      ],
      stroke,
    );
  }
  circle(x: number, y: number, r: number, fill: string, stroke = C.cyan, width = 1) {
    const g = this.graphics;
    if (fill) g.circle(x - this.width / 2, this.height / 2 - y, r);
    if (fill) {
      g.fillColor = color(fill);
      g.fill();
    }
    if (stroke) this.arc(x, y, r, 1, stroke, width);
  }
  arc(x: number, y: number, r: number, fraction: number, stroke: string, width = 3) {
    const n = Math.ceil(Math.max(0, Math.min(1, fraction)) * 40);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / 40) * Math.PI * 2,
        b = -Math.PI / 2 + (Math.min(i + 1, fraction * 40) / 40) * Math.PI * 2;
      this.line(
        x + Math.cos(a) * r,
        y + Math.sin(a) * r,
        x + Math.cos(b) * r,
        y + Math.sin(b) * r,
        stroke,
        width,
      );
    }
  }
  text(
    id: string,
    value: string,
    x: number,
    y: number,
    size = 16,
    fill = C.white,
    w = 300,
    align = Label.HorizontalAlign.LEFT,
    bold = false,
    lines = 1,
  ) {
    this.seen.add(id);
    let l = this.labels.get(id);
    if (!l) {
      const n = new Node(id);
      n.layer = Layers.Enum.UI_2D;
      this.root.addChild(n);
      n.addComponent(UITransform);
      l = n.addComponent(Label);
      l.useSystemFont = true;
      l.fontFamily = 'Arial, Microsoft YaHei, sans-serif';
      l.overflow = Label.Overflow.CLAMP;
      l.enableWrapText = true;
      this.labels.set(id, l);
    }
    l.node.active = true;
    l.string = value;
    l.fontSize = size;
    l.lineHeight = size * 1.45;
    l.color = color(fill);
    l.isBold = bold;
    l.horizontalAlign = align;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    l.node.getComponent(UITransform)!.setContentSize(w, size * 1.6 * lines);
    l.node.setPosition(x + w / 2 - this.width / 2, this.height / 2 - y);
  }
  icon(id: string, x: number, y: number, size = 20, ink = C.white) {
    const k = size / 24,
      line = (a: number, b: number, c: number, d: number) =>
        this.line(x + a * k, y + b * k, x + c * k, y + d * k, ink, 1.8 * k);
    const poly = (p: number[][], fill = ink) =>
      this.polygon(
        p.map(([a, b]) => [x + a * k, y + b * k]),
        fill,
        ink,
        1.2 * k,
      );
    if (id === 'pause') {
      this.rect(x - 8 * k, y - 10 * k, 5 * k, 20 * k, ink);
      this.rect(x + 3 * k, y - 10 * k, 5 * k, 20 * k, ink);
    } else if (id === 'fire') {
      for (const a of [-7, 0, 7])
        poly([
          [a - 1.7, 10],
          [a - 1.7, -5],
          [a, -10],
          [a + 1.7, -5],
          [a + 1.7, 10],
        ]);
    } else if (id === 'missile') {
      poly([
        [-9, 8],
        [-5, 1],
        [-4, -4],
        [6, -9],
        [10, -10],
        [9, -6],
        [4, 4],
        [-1, 5],
        [-8, 10],
      ]);
      line(-5, 5, -11, 11);
    } else if (id === 'boost') {
      for (const b of [-5, 4]) {
        line(-10, b + 5, 0, b - 4);
        line(0, b - 4, 10, b + 5);
      }
    } else if (id === 'scan') {
      this.circle(x, y, 9 * k, '', ink, 1.5);
      this.circle(x, y, 5 * k, '', ink, 1.5);
      this.circle(x, y, 1.5 * k, ink, '');
      line(6, -6, 11, -11);
    } else if (id === 'shield') {
      poly(
        [
          [-8, -9],
          [0, -12],
          [8, -9],
          [7, 4],
          [0, 11],
          [-7, 4],
        ],
        '',
      );
      line(0, -7, 0, 5);
    } else if (id === 'plane') {
      poly([
        [0, -12],
        [3, -4],
        [11, 4],
        [11, 7],
        [3, 4],
        [3, 9],
        [6, 12],
        [0, 10],
        [-6, 12],
        [-3, 9],
        [-3, 4],
        [-11, 7],
        [-11, 4],
        [-3, -4],
      ]);
    } else if (id === 'missions') {
      poly(
        [
          [-12, 10],
          [-4, -8],
          [4, 10],
        ],
        '',
      );
      poly(
        [
          [-1, 10],
          [6, -3],
          [13, 10],
        ],
        '',
      );
      line(-7, 0, -3, 1);
      line(-3, 1, -1, -2);
    } else if (id === 'online') {
      line(-10, -10, 10, 10);
      line(-10, 10, 10, -10);
      line(5, -10, 10, -10);
      line(10, -10, 10, -5);
      line(-10, -10, -5, -10);
      line(-10, -10, -10, -5);
    } else if (id === 'settings') {
      this.circle(x, y, 7 * k, '', ink, 2);
      this.circle(x, y, 2 * k, '', ink, 2);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        line(Math.cos(a) * 8, Math.sin(a) * 8, Math.cos(a) * 11, Math.sin(a) * 11);
      }
    } else if (id === 'help') {
      this.circle(x, y, 10 * k, '', ink, 1.7);
      line(-3, -4, 0, -6);
      line(0, -6, 4, -3);
      line(4, -3, 0, 1);
      line(0, 1, 0, 3);
      this.circle(x, y + 7 * k, 1 * k, ink, '');
    } else if (id === 'back') {
      line(4, -9, -5, 0);
      line(-5, 0, 4, 9);
    } else if (id === 'chevron') {
      line(-3, -6, 3, 0);
      line(3, 0, -3, 6);
    } else if (id === 'sound') {
      poly([
        [-10, -3],
        [-5, -3],
        [1, -9],
        [1, 9],
        [-5, 3],
        [-10, 3],
      ]);
      line(5, -5, 8, 0);
      line(8, 0, 5, 5);
    } else if (id === 'reduced') {
      line(-10, 7, -3, -7);
      line(-3, -7, 3, 4);
      line(3, 4, 7, -3);
      line(7, -3, 12, 7);
    }
  }
  hot(
    id: string,
    label: string,
    x: number,
    y: number,
    w: number,
    h: number,
    disabled = false,
    round = false,
  ) {
    this.controls.push({ id, label, x, y, w, h, disabled, round });
  }
  button(
    id: string,
    label: string,
    x: number,
    y: number,
    w = 180,
    h = 48,
    accent = false,
    icon = '',
    disabled = false,
  ) {
    const down = this.pressed.has(id),
      ink = disabled ? C.muted : accent ? C.navy : C.white;
    this.hot(id, label, x, y, w, h, disabled);
    this.plate(
      x,
      y,
      w,
      h,
      disabled
        ? '#10253899'
        : accent
          ? down
            ? '#ffdda4'
            : C.amber
          : down
            ? '#345461f2'
            : '#091e2bdf',
      accent ? C.amber : C.edge,
      12,
    );
    if (accent) this.line(x + 16, y + 3, x + w - 4, y + 3, '#ffe1a8');
    if (icon) this.icon(icon, x + 28, y + h / 2, 22, ink);
    this.text(
      'button:' + id,
      label,
      x + (icon ? 42 : 12),
      y + h / 2,
      17,
      ink,
      w - (icon ? 72 : 38),
      center,
      true,
    );
    this.icon('chevron', x + w - 18, y + h / 2, 17, ink);
  }
  lightButton(id: string, label: string, x: number, y: number, w = 110) {
    this.hot(id, label, x, y, w, 46);
    if (this.pressed.has(id)) this.plate(x, y, w, 46, '#102538bb');
    this.icon(id, x + 20, y + 23, 20);
    this.text('button:' + id, label, x + 42, y + 23, 15, C.white, w - 42);
  }
  hit(x: number, y: number) {
    return this.controls.find(
      (c) =>
        !c.disabled &&
        (c.round
          ? Math.hypot((x - c.x - c.w / 2) / (c.w / 2), (y - c.y - c.h / 2) / (c.h / 2)) <= 1
          : x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h),
    );
  }
  shade(side: 'left' | 'right', strength = 0.8) {
    for (let i = 0; i < 96; i++) {
      const alpha = Math.round(strength * 255 * (1 - i / 96) ** 1.6)
        .toString(16)
        .padStart(2, '0');
      this.rect(
        side === 'left' ? (i * this.width) / 120 : this.width - ((i + 1) * this.width) / 120,
        0,
        this.width / 120,
        this.height,
        '#071a29' + alpha,
      );
    }
  }
  header(title: string, back = 'home', dim = true) {
    const a = this.safe;
    this.rect(0, 0, this.width, this.height, dim ? '#071b2bdc' : '#071b2b22');
    if (!dim) this.rect(0, 0, this.width, a.top + 58, '#071b2be8');
    this.hot(back, '返回', a.left, a.top, 46, 46);
    this.icon('back', a.left + 22, a.top + 23, 22, C.amber);
    this.text(
      'title',
      title,
      a.left + 58,
      a.top + 23,
      24,
      C.white,
      260,
      Label.HorizontalAlign.LEFT,
      true,
    );
    this.text(
      'small-brand',
      '零域  /  NULL RANGE',
      a.right - 210,
      a.top + 23,
      13,
      C.muted,
      210,
      right,
    );
    this.line(a.left, a.top + 51, a.right, a.top + 51, C.edge);
    this.line(a.left, a.top + 51, a.left + 74, a.top + 51, C.amber, 2);
  }
  actionCircle(
    id: string,
    label: string,
    x: number,
    y: number,
    r: number,
    disabled: boolean,
    amount = 0,
    accent = false,
  ) {
    const ink = disabled ? C.muted : C.white;
    this.hot(id, label, x - r, y - r, 2 * r, 2 * r, disabled, true);
    this.circle(
      x,
      y,
      r,
      this.pressed.has(id) ? '#456675dd' : '#0a202cbb',
      accent ? C.amber : disabled ? '#8aa7b566' : C.white,
      accent ? 2.4 : 1.2,
    );
    this.circle(x, y, r - 4, '', '#8aa7b536');
    this.icon(id, x, y - 7, r * 0.78, ink);
    this.text('button:' + id, label, x - r, y + r * 0.48, 11, ink, r * 2, center);
    if (amount > 0) this.arc(x, y, r + 3, amount, disabled ? C.muted : C.amber, 2.5);
  }
  diagram(x: number, y: number, w: number, h: number) {
    this.plate(x, y, w, h, '#071b2b88', C.edge, 10);
    const sy = y + h * 0.64,
      sx = x + 30;
    this.circle(sx, sy, 20, '#a9c3ce19', C.muted);
    this.circle(sx, sy, 7, '#a9c3ce66', C.white);
    this.line(sx - 8, sy, sx + 8, sy, C.white);
    this.line(sx, sy - 8, sx, sy + 8, C.white);
    for (const [id, dx, dy] of [
      ['scan', -58, -29],
      ['boost', -24, -37],
      ['missile', -62, 9],
      ['fire', -24, 7],
    ] as const) {
      this.circle(x + w + dx, sy + dy, 14, '#102538aa', C.muted);
      this.icon(id, x + w + dx, sy + dy, 14);
    }
    this.text('diagram-label', '左侧驾驶  ·  右侧武器', x, y + h + 17, 12, C.muted, w, center);
  }
  hud(s: State, practice: boolean, reduced: boolean) {
    const a = this.safe,
      x = a.left,
      y = a.top,
      w = a.width;
    this.plate(x, y, 202, 76, '#0a202bab', '#6a95a338', 4);
    for (const [id, name, value, max, dy] of [
      ['shield', '护盾', s.player.shield, s.craft.shield, 17],
      ['plane', '机体', s.player.hull, s.craft.hull, 39],
    ] as const) {
      this.icon(id, x + 12, y + dy, 14);
      this.text(id, name, x + 27, y + dy, 12, C.white, 30);
      this.plate(x + 61, y + dy - 4, 91, 7, '#274553', C.edge, 2);
      this.plate(
        x + 61,
        y + dy - 4,
        Math.max(3, (91 * value) / max),
        7,
        id === 'shield' ? C.cyan : '#8adce4',
        '',
        2,
      );
      this.text(
        id + '%',
        Math.ceil((value / max) * 100) + '%',
        x + 154,
        y + dy,
        11,
        C.white,
        42,
        right,
      );
    }
    this.polygon(
      [
        [x + 7, y + 60],
        [x + 12, y + 55],
        [x + 17, y + 60],
        [x + 12, y + 65],
      ],
      '',
      C.amber,
    );
    this.text('objective', objectiveText(s), x + 27, y + 60, 12, C.white, 245);
    this.text(
      'speed',
      `${Math.round(s.player.speed * 3.6)} km/h  ·  海拔 ${Math.round(s.player.y)}m`,
      x + w / 2 - 105,
      y + 11,
      12,
      C.white,
      210,
      center,
    );
    const rx = a.right - 82,
      ry = y + 47,
      rr = 43;
    this.circle(rx, ry, rr, '#071e2bba', '#73b6c2', 1.2);
    for (const r of [14, 28]) this.circle(rx, ry, r, '', '#5ed5ce45');
    this.line(rx - rr, ry, rx + rr, ry, '#5ed5ce45');
    this.line(rx, ry - rr, rx, ry + rr, '#5ed5ce45');
    this.line(rx, ry, rx - 26, ry - 34, '#5ed5ce55');
    this.line(rx, ry, rx + 26, ry - 34, '#5ed5ce55');
    for (const e of radarContacts(s)) {
      const ex = rx + e.x * (rr - 5),
        ey = ry + e.y * (rr - 5);
      this.polygon(
        [
          [ex, ey - 3],
          [ex + 3, ey + 2],
          [ex - 3, ey + 2],
        ],
        e.outside ? '' : C.red,
        C.red,
      );
    }
    this.icon('plane', rx, ry, 11, C.white);
    this.hot('pause', '暂停', a.right - 46, y, 46, 46);
    this.plate(a.right - 44, y + 1, 42, 40, '#102538a8', C.edge, 5);
    this.icon('pause', a.right - 23, y + 21, 22);
    const target = targetInCone(s, 25, MISSILE_RANGE),
      cx = x + w / 2,
      cy = this.height * 0.46;
    for (const sign of [-1, 1]) {
      this.line(cx + sign * 7, cy, cx + sign * 15, cy, C.white);
      this.line(cx, cy + sign * 7, cx, cy + sign * 15, C.white);
    }
    this.targetMarker = null;
    for (const enemy of s.enemies) {
      const marker = this.project?.(enemy);
      if (!marker?.visible || enemy === target) continue;
      const ex = marker.x * this.width,
        ey = marker.y * this.height;
      if (enemy.priority)
        this.polygon(
          [
            [ex, ey - 9],
            [ex + 9, ey],
            [ex, ey + 9],
            [ex - 9, ey],
          ],
          '',
          C.amber,
          2,
        );
      else this.rect(ex - 5, ey - 5, 10, 10, '', C.red);
    }
    const marker = target && this.project?.(target);
    if (target && marker?.visible) {
      const mx = marker.x * this.width,
        my = marker.y * this.height;
      const labelX = Math.max(a.left + 4, Math.min(a.right - 144, mx - 70));
      const labelY =
        my - 28 >= a.top + 125 ? Math.min(a.bottom - 75, my - 28) : Math.max(a.top + 125, my + 28);
      this.targetMarker = { id: target.id, x: mx, y: my, labelY };
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) {
          this.line(mx + sx * 14, my + sy * 8, mx + sx * 14, my + sy * 14, C.amber);
          this.line(mx + sx * 8, my + sy * 14, mx + sx * 14, my + sy * 14, C.amber);
        }
      this.rect(labelX, labelY - 10, 140, 20, '#102538dc');
      this.text(
        'lock',
        `${target.priority ? '主目标' : '敌机'} ${distanceText(distance(target, s.player))} ${target.y - s.player.y > 80 ? '↑' : target.y - s.player.y < -80 ? '↓' : ''}`,
        labelX,
        labelY,
        12,
        C.amber,
        140,
        center,
      );
    }
    const jx = x + 58,
      jy = a.bottom - 59;
    this.hot('stick', '飞行摇杆', jx - 55, jy - 55, 110, 110, false, true);
    this.circle(jx, jy, 53, '#0a202b45', '#b8d5dfa0');
    this.circle(jx, jy, 37, '', '#a9c3ce26');
    for (const sign of [-1, 1]) {
      this.line(jx + sign * 46, jy, jx + sign * 50, jy, C.muted);
      this.line(jx, jy + sign * 46, jx, jy + sign * 50, C.muted);
    }
    this.circle(
      jx + this.stick.x * 32,
      jy - this.stick.y * 32,
      19,
      this.pressed.has('stick') ? '#5ed5ce88' : '#a9c3ce4d',
      C.white,
    );
    const fx = a.right - 41,
      fy = a.bottom - 41;
    this.actionCircle(
      'fire',
      s.overheated ? '冷却中' : '开火',
      fx,
      fy,
      36,
      s.overheated,
      s.heat,
      true,
    );
    this.actionCircle(
      'missile',
      s.missileCooldown > 0
        ? `${Math.ceil(s.missileCooldown)}s`
        : !target && s.missiles > 0
          ? '待锁定'
          : `导弹 ${s.missiles}`,
      fx - 83,
      fy + 4,
      28,
      s.missiles === 0 || s.missileCooldown > 0 || !target,
      s.missileCooldown / 3,
    );
    this.actionCircle(
      'boost',
      '加速',
      fx + 5,
      fy - 82,
      27,
      s.player.energy < 1,
      1 - s.player.energy / 100,
    );
    this.actionCircle(
      'scan',
      s.scanTime > 0 ? '扫描中' : s.scanCooldown > 0 ? `${Math.ceil(s.scanCooldown)}s` : '扫描',
      fx - 72,
      fy - 68,
      26,
      s.scanCooldown > 0,
      s.scanCooldown / 10,
    );
    this.rect(fx - 42, fy - 131, 84, 20, '#102538c9');
    this.text(
      'energy',
      `能量 ${Math.ceil(s.player.energy)}`,
      fx - 42,
      fy - 121,
      11,
      C.cyan,
      84,
      center,
    );
    this.rect(cx - 58, a.bottom - 11, 116, 3, '#173a4bcc');
    this.rect(cx - 58, a.bottom - 11, 116 * s.heat, 3, s.overheated ? C.red : C.amber);
    this.text(
      'heat',
      `热量 ${Math.round(s.heat * 100)}%`,
      cx - 58,
      a.bottom - 23,
      11,
      s.overheated ? C.red : C.white,
      116,
      center,
    );
    const nav = navigationTarget(s);
    if (nav && !(nav.point === target && marker?.visible)) {
      const navColor = s.enemies.some((e) => e === nav.point && e.priority) ? C.amber : C.cyan;
      const delta =
        Math.atan2(nav.point.x - s.player.x, -(nav.point.z - s.player.z)) - s.player.yaw;
      const heading = Math.atan2(Math.sin(delta), Math.cos(delta));
      const nx = cx + Math.max(-150, Math.min(150, heading * 110));
      this.polygon(
        [
          [nx, cy + 61],
          [nx + 5, cy + 66],
          [nx, cy + 71],
          [nx - 5, cy + 66],
        ],
        '',
        navColor,
        1.5,
      );
      this.rect(nx - 85, cy + 74, 170, 20, '#102538dc');
      this.text(
        'navigation',
        `${heading < -0.3 ? '‹ ' : heading > 0.3 ? '› ' : ''}${nav.label} ${distanceText(distance(nav.point, s.player))} ${nav.point.y - s.player.y > 80 ? '↑' : nav.point.y - s.player.y < -80 ? '↓' : ''}`,
        nx - 85,
        cy + 84,
        11,
        navColor,
        170,
        center,
      );
    }
    const threat = s.enemies.find((e) => e.telegraph > 0.1);
    if (threat) {
      const heading = Math.atan2(threat.x - s.player.x, -(threat.z - s.player.z)) - s.player.yaw;
      const relative = Math.atan2(Math.sin(heading), Math.cos(heading));
      const bearing =
        Math.abs(relative) > Math.PI * 0.65
          ? '后方'
          : relative < -0.3
            ? '左侧'
            : relative > 0.3
              ? '右侧'
              : '前方';
      const marker = this.project?.(threat);
      if (marker?.visible)
        this.circle(
          marker.x * this.width,
          marker.y * this.height,
          17 + threat.telegraph * 5,
          '',
          C.red,
          1.5,
        );
      this.rect(cx - 100, y + 66, 200, 20, '#102538dc');
      this.text(
        'threat',
        `${bearing}${threat.kind === 'elite' ? '精英' : '重机'}蓄能 · 规避`,
        cx - 100,
        y + 76,
        12,
        C.red,
        200,
        center,
        true,
      );
    }
    this.rect(cx - 72, y + 19, 144, 20, '#102538c9');
    this.text(
      'clearance',
      `离地 ${Math.max(0, Math.round(s.player.y - Math.max(WATER_LEVEL, terrainHeight(s.player.x, s.player.z))))}m`,
      cx - 70,
      y + 29,
      11,
      C.white,
      140,
      center,
    );
    this.text(
      'timer',
      `${Math.ceil(s.mission.timeLimit - s.tick * DT)}s`,
      x + 212,
      y + 39,
      11,
      C.white,
      55,
    );
    const hit = !reduced && s.impacts.some((e) => e.kind === 'hit' && s.tick - e.tick < 12);
    if (hit) {
      for (const a of [-1, 1])
        for (const b of [-1, 1])
          this.line(cx + a * 5, cy + b * 5, cx + a * 9, cy + b * 9, C.amber, 2);
    }
    const message =
      s.mission.objective.kind === 'intercept' && nav && s.enemies.some((e) => e.priority)
        ? engagementHint(s, nav.point)
        : s.noticeTime > 0
          ? s.notice
          : s.tick * DT < 5
            ? '左侧驾驶 · 右侧开火 · 松手回平'
            : '';
    if (message) {
      this.plate(cx - 156, a.bottom - 55, 312, 25, '#102538dc', '', 4);
      this.text('notice', message, cx - 153, a.bottom - 43, 12, C.white, 306, center);
    }
    if (practice) this.text('practice', '试玩', x + 218, y + 60, 11, C.muted, 40);
  }
  draw(screen: Screen, s: State, p: Progress, practice: boolean) {
    const a = this.safe,
      x = a.left,
      y = a.top,
      w = a.width,
      h = a.height,
      b = a.bottom;
    this.controls = [];
    this.seen.clear();
    this.graphics.clear();
    for (const card of this.cards) card.node.active = false;
    if (screen === 'playing') this.hud(s, practice, p.reduced);
    if (screen === 'home') {
      this.shade('left', 0.79);
      this.text(
        'brand',
        '零 域',
        x + 22,
        y + h * 0.22,
        64,
        C.white,
        270,
        Label.HorizontalAlign.LEFT,
        true,
      );
      this.text('latin', 'N U L L   R A N G E', x + 26, y + h * 0.36, 15, C.white, 280);
      this.line(x + 25, y + h * 0.43, x + 206, y + h * 0.43, C.edge);
      this.text('subtitle', '穿越群峰，守住这片天空。', x + 26, y + h * 0.49, 13, C.muted, 280);
      this.lightButton('settings', '设置', x + 8, b - 101);
      this.lightButton('help', '帮助', x + 8, b - 50);
      const bw = Math.min(220, (w - 170) / 2 - 8),
        bx = a.right - 2 * bw - 12;
      this.button('missions', '单机任务', bx, b - 58, bw, 54, true, 'missions');
      this.button('online', '玩家对战', bx + bw + 12, b - 58, bw, 54, false, 'online');
      if (p.best > 0)
        this.text('best', `本机纪录  ${p.best}`, a.right - 160, b - 77, 12, C.white, 160, right);
    } else if (screen === 'paused') {
      this.controls = [];
      this.rect(0, 0, this.width, this.height, '#04131cb0');
      const pw = 238,
        ph = 278,
        px = x + (w - pw) / 2,
        py = y + (h - ph) / 2;
      this.plate(px, py, pw, ph, '#081c29eb', C.edge, 8);
      this.text('title', '暂  停', px, py + 34, 27, C.white, pw, center, true);
      this.line(px + 24, py + 60, px + pw - 24, py + 60, C.edge);
      this.button('resume', '继续行动', px + 24, py + 77, pw - 48, 48, true);
      this.button('settings', '设置', px + 24, py + 137, pw - 48, 46);
      this.button('home', '返回机库', px + 24, py + 195, pw - 48, 46);
    } else if (screen === 'missions') {
      this.header('任务选择', 'home');
      const selected = Math.max(
          0,
          MISSIONS.findIndex((m) => m.id === s.mission.id),
        ),
        page = Math.floor(selected / 3);
      const top = y + 67,
        cw = (w - 24) / 3,
        ch = h - 146;
      for (let i = 0; i < 3; i++) {
        const index = page * 3 + i,
          m = MISSIONS[index],
          cx = x + i * (cw + 12),
          unlocked = practice || missionUnlocked(p, m.id),
          active = index === selected;
        this.plate(cx, top, cw, ch, '#0a2438ee', active ? C.amber : C.edge, 4);
        const image = this.cards[index],
          ih = Math.min(ch - 70, ((cw - 4) * 384) / 683);
        image.node.active = this.atlasReady;
        image.node.getComponent(UITransform)!.setContentSize(cw - 4, ih);
        image.node.setPosition(cx + cw / 2 - this.width / 2, this.height / 2 - top - 2 - ih / 2);
        this.text(
          'mission-title' + i,
          m.title,
          cx + 12,
          top + ch - 48,
          20,
          unlocked ? C.white : C.muted,
          cw - 24,
          Label.HorizontalAlign.LEFT,
          true,
        );
        this.text(
          'mission-meta' + i,
          unlocked
            ? `${totalEnemies(m)} 架 · ${m.objective.kind === 'recover' ? '扫描回收' : m.objective.kind === 'escort' ? '守护航程' : m.objective.kind === 'intercept' ? '优先截击' : m.objective.kind === 'elite' ? '三阶段精英' : '清除波次'}`
            : '完成上一任务解锁',
          cx + 12,
          top + ch - 22,
          12,
          C.muted,
          cw - 24,
        );
        const medal = p.completed[m.id]?.medal || 0;
        this.text(
          'mission-rating' + i,
          medal ? '★'.repeat(medal) : String(index + 1).padStart(2, '0'),
          cx + cw - 69,
          top + ch - 48,
          12,
          C.amber,
          56,
          right,
        );
        this.hot('mission:' + m.id, m.title, cx, top, cw, ch);
      }
      this.text(
        'mission-brief',
        s.mission.briefing,
        x,
        b - 67,
        11,
        C.muted,
        w,
        Label.HorizontalAlign.LEFT,
        false,
        1,
      );
      this.button('mission-page', page ? '前 3 关' : '后 3 关', x, b - 50, 118, 48, false);
      this.button('prepare', '机体准备', x + 130, b - 50, 146, 48, false, 'plane');
      this.button(
        'start',
        missionUnlocked(p, s.mission.id) || practice ? '部署任务' : '任务未解锁',
        a.right - 194,
        b - 50,
        194,
        48,
        true,
        '',
        !practice && !missionUnlocked(p, s.mission.id),
      );
    } else if (screen === 'prepare') {
      this.shade('right', 0.94);
      this.hot('back', '返回任务', x, y, 46, 46);
      this.icon('back', x + 23, y + 23, 22, C.amber);
      this.text(
        'prep-title',
        '机体准备',
        x + 59,
        y + 23,
        24,
        C.white,
        220,
        Label.HorizontalAlign.LEFT,
        true,
      );
      const dx = x + w * 0.56,
        dw = w * 0.44;
      this.text('craft-id', s.craft.id.toUpperCase(), dx, y + 77, 14, C.amber, dw);
      this.text(
        'craft-name',
        s.craft.name,
        dx,
        y + 112,
        34,
        C.white,
        dw,
        Label.HorizontalAlign.LEFT,
        true,
      );
      this.text('craft-role', s.craft.role, dx, y + 149, 14, C.muted, dw);
      this.line(dx, y + 172, a.right, y + 172, C.edge);
      this.text(
        'loadout',
        `导弹 ${s.craft.missiles} / 护盾 ${s.craft.shield} / 机体 ${s.craft.hull}\n巡航 ${s.craft.speed} / 加速 ${s.craft.boost} m/s\n转向 ${s.craft.turn.toFixed(2)} / 热量 ${s.craft.heat}`,
        dx,
        y + 220,
        15,
        C.white,
        dw,
        Label.HorizontalAlign.LEFT,
        false,
        3,
      );
      this.text(
        'prep-mission',
        '出击任务 · ' + s.mission.title,
        x + 12,
        b - 24,
        14,
        C.white,
        w * 0.52,
      );
      const sw = (w * 0.52 - 20) / 3;
      for (const [i, c] of CRAFTS.entries()) {
        const unlocked = practice || craftUnlocked(p, c.id);
        this.button(
          'craft:' + c.id,
          c.name,
          x + i * (sw + 6),
          b - 112,
          sw,
          48,
          c.id === s.craft.id,
          '',
          !unlocked,
        );
        this.text(
          'craft-unlock' + i,
          unlocked ? '已解锁' : `通过第 ${c.id === 'kestrel' ? 2 : 4} 关`,
          x + i * (sw + 6),
          b - 122,
          10,
          C.muted,
          sw,
          center,
        );
      }
      this.button(
        'start',
        '部署任务',
        dx,
        b - 53,
        dw,
        50,
        true,
        'plane',
        !practice && !missionUnlocked(p, s.mission.id),
      );
    } else if (screen === 'result') {
      this.shade('right', 0.97);
      const dx = x + w * 0.57,
        dw = w * 0.43,
        won = s.status === 'won',
        k = Math.min(1, h / 366);
      this.text(
        'result-title',
        won ? '任务完成' : '行动结束',
        dx,
        y + 33 * k,
        29,
        won ? C.white : C.red,
        dw,
        center,
        true,
      );
      const stars = missionRating(s);
      for (let i = 0; i < 3; i++) {
        const cx = dx + dw / 2 + (i - 1) * 43,
          cy = y + 80 * k,
          pts = [];
        for (let j = 0; j < 10; j++) {
          const r = j % 2 ? 7 : 16,
            an = -Math.PI / 2 + (j * Math.PI) / 5;
          pts.push([cx + Math.cos(an) * r, cy + Math.sin(an) * r]);
        }
        this.polygon(pts, i < stars ? C.amber : '#10253899', i < stars ? C.amber : C.muted);
      }
      this.text('reason', s.reason, dx, y + 116 * k, 13, won ? C.muted : C.red, dw, center);
      for (const [i, label, value] of [
        [0, '任务评分', s.score],
        [1, '击落敌机', s.kills],
        [2, '残骸回收', s.recovered],
        [
          3,
          '飞行时间',
          `${Math.floor((s.tick * DT) / 60)
            .toString()
            .padStart(2, '0')}:${Math.floor((s.tick * DT) % 60)
            .toString()
            .padStart(2, '0')}`,
        ],
      ] as const) {
        const yy = y + (153 + i * 29) * k;
        this.text('stat-label' + i, label, dx, yy, 14, C.muted, dw * 0.55);
        this.text(
          'stat' + i,
          String(value),
          dx + dw * 0.55,
          yy,
          17,
          C.white,
          dw * 0.45,
          right,
          true,
        );
        this.line(dx, yy + 14, a.right, yy + 14, C.edge);
      }
      this.text(
        'rating-note',
        won ? '星级：完成任务、机体 ≥50% / ≥80%' : '保持高度，避开山体再试一次。',
        dx,
        y + 282 * k,
        11,
        C.muted,
        dw,
        center,
      );
      this.text(
        'result-practice',
        practice
          ? '开发试玩 · 不记录成绩与解锁'
          : s.status === 'won'
            ? `已记录 ${s.mission.title} · ${p.completed[s.mission.id]?.medal || 0} 星`
            : '失败不解锁 · 可立即重试',
        x + 10,
        b - 23,
        12,
        C.white,
        w * 0.49,
      );
      const bw = (dw - 10) / 2;
      this.button(won ? 'next' : 'home', won ? '下一任务' : '机库', dx, b - 49, bw, 48);
      this.button('restart', '再出击', dx + bw + 10, b - 49, bw, 48, true);
    } else if (screen === 'settings') {
      this.header('设置', 'back');
      const top = y + 68,
        dh = h - 81,
        nav = Math.min(133, w * 0.18),
        middle = w * 0.45,
        dx = x + nav + 14;
      this.plate(x, top, nav, dh, '#071b2ba8');
      this.plate(x + 5, top + 8, nav - 10, 45, '#51432db0', C.amber, 4);
      this.icon('settings', x + 23, top + 30, 19, C.amber);
      this.text('settings-category', '飞行偏好', x + 43, top + 30, 14, C.amber, nav - 45);
      this.icon('plane', x + nav / 2, top + 119, 38, C.muted);
      this.text(
        'settings-note',
        '随时调整\n返回后继续',
        x,
        top + 176,
        12,
        C.muted,
        nav,
        center,
        false,
        2,
      );
      this.plate(dx, top, middle, dh, '#071b2bbd');
      for (const [id, label, on, i] of [
        ['sound', '音效', !p.muted, 0],
        ['reduced', '减弱动态', p.reduced, 1],
      ] as const) {
        const yy = top + 19 + i * 79;
        this.hot(id, label, dx + 12, yy, middle - 24, 56);
        this.icon(id, dx + 30, yy + 25, 20);
        this.text(id + 'label', label, dx + 50, yy + 25, 15, C.white, middle - 130);
        const tx = dx + middle - 67;
        this.plate(tx, yy + 12, 48, 25, on ? '#258b9b' : '#364a54', on ? C.cyan : C.edge, 12);
        this.circle(tx + (on ? 35 : 13), yy + 24.5, 9, C.white, '');
        this.text(
          id + 'desc',
          id === 'sound' ? (on ? '已开启战斗与引擎音效' : '已静音') : '降低镜头与场景动态',
          dx + 20,
          yy + 56,
          11,
          C.muted,
          middle - 40,
        );
      }
      const sy = top + 181;
      this.hot('sensitivity', '操纵灵敏度', dx + 12, sy, middle - 24, 58);
      this.text('sensitivity-label', '操纵灵敏度', dx + 20, sy + 10, 14, C.white, middle - 40);
      const opts = [0.7, 1, 1.3],
        sliderW = middle - 104,
        sx = dx + 26;
      this.line(sx, sy + 39, sx + sliderW, sy + 39, C.muted, 3);
      for (let i = 0; i < 3; i++) this.circle(sx + (i * sliderW) / 2, sy + 39, 3, C.muted, '');
      this.circle(sx + (opts.indexOf(p.sensitivity) * sliderW) / 2, sy + 39, 7, C.white, C.cyan);
      this.text(
        'sensitivity-value',
        p.sensitivity.toFixed(1) + '×',
        dx + middle - 62,
        sy + 39,
        14,
        C.cyan,
        44,
        right,
      );
      const rx = dx + middle + 14,
        rw = a.right - rx;
      this.plate(rx, top, rw, dh, '#071b2ba8');
      this.text('operation-title', '操纵示意', rx + 12, top + 22, 14, C.white, rw - 24);
      this.diagram(rx + 12, top + 54, rw - 24, 100);
      this.text(
        'operation-help',
        '左摇杆转向 / 升降\n长按开火 / 加速\n点按导弹 / 扫描',
        rx + 12,
        top + 221,
        12,
        C.muted,
        rw - 24,
        Label.HorizontalAlign.LEFT,
        false,
        3,
      );
    } else if (screen === 'help') {
      this.header('飞行手册', 'back');
      const top = y + 72,
        cw = w * 0.44,
        dx = x + cw + 26,
        dw = w - cw - 26;
      this.plate(x, top, cw, h - 83, '#071b2ba8');
      this.text(
        'help-lead',
        '驾驶与武器',
        x + 18,
        top + 26,
        20,
        C.white,
        cw - 36,
        Label.HorizontalAlign.LEFT,
        true,
      );
      this.diagram(x + 22, top + 58, cw - 44, 100);
      this.text(
        'help-thumb',
        '左侧驾驶，松手回平。触地即坠毁。\n右侧长按开火或加速。',
        x + 18,
        top + 215,
        15,
        C.white,
        cw - 36,
        Label.HorizontalAlign.LEFT,
        false,
        2,
      );
      for (const [i, icon, title, body] of [
        [0, 'missile', '锁定与导弹', `前方 25° / ${MISSILE_RANGE / 1000} km 内锁定。`],
        [1, 'fire', '热量与护盾', '机炮过热会冷却；护盾不能抵挡撞山。'],
        [2, 'scan', '扫描回收', '吸引残骸，补充护盾、能量并获得分数。'],
      ] as const) {
        const yy = top + 19 + i * 71;
        this.icon(icon, dx + 12, yy + 1, 20, C.amber);
        this.text(
          'help-title' + i,
          title,
          dx + 34,
          yy,
          16,
          C.white,
          dw - 34,
          Label.HorizontalAlign.LEFT,
          true,
        );
        this.text(
          'help-body' + i,
          body,
          dx,
          yy + 32,
          13,
          C.muted,
          dw,
          Label.HorizontalAlign.LEFT,
          false,
          2,
        );
      }
      this.text(
        'keyboard',
        'WASD / 方向键 · 空格开火\nShift 加速 · E 导弹 · Q 扫描 · Esc 暂停',
        dx,
        b - 26,
        12,
        C.cyan,
        dw,
        Label.HorizontalAlign.LEFT,
        false,
        2,
      );
    } else if (screen === 'online') {
      this.header('玩家对战', 'back');
      const pw = Math.min(510, w - 60),
        px = x + (w - pw) / 2,
        py = y + 83;
      this.plate(px, py, pw, h - 100, '#071b2bd9', C.edge, 10);
      this.icon('online', px + pw / 2, py + 40, 36, C.amber);
      this.text(
        'online-title',
        '玩家对战尚未开放',
        px + 20,
        py + 88,
        23,
        C.white,
        pw - 40,
        center,
        true,
      );
      this.text(
        'online-body',
        '开放后可与另一位真实玩家同场对战。\n现在可以先在单机任务中熟悉飞行。',
        px + 26,
        py + 137,
        15,
        C.muted,
        pw - 52,
        center,
        false,
        2,
      );
      this.button(
        'missions',
        '前往单机任务',
        px + pw / 2 - 120,
        py + 186,
        240,
        49,
        true,
        'missions',
      );
    }
    for (const [id, l] of this.labels) if (!this.seen.has(id)) l.node.active = false;
  }
  dispose() {
    this.disposed = true;
    for (const c of this.cards) c.spriteFrame?.destroy();
    this.root.destroy();
    this.camera.node.destroy();
  }
}
