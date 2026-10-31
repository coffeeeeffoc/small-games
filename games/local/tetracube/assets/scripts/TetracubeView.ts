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
} from 'cc';
import { Projection, cubeFaces, rotateVector, type Point, type Turn } from './core/projection.js';
import type { Cell, Vec } from './core/engine.js';

export type Rect = { x: number; y: number; w: number; h: number };
export type Control = Rect & { id: string; label: string; disabled: boolean };
export const C = {
  ink: '#0b122b',
  panel: '#162543',
  muted: '#9bacd0',
  text: '#edf5ff',
  mint: '#83eed9',
  amber: '#ffd28c',
  violet: '#bc9cf5',
};
const color = (hex: string) => new Color().fromHEX(hex);
const shade = (hex: string | Color, brightness: number, alpha = 255) => {
  const c = typeof hex === 'string' ? color(hex) : hex;
  return new Color(
    Math.min(255, c.r * brightness),
    Math.min(255, c.g * brightness),
    Math.min(255, c.b * brightness),
    alpha,
  );
};
const lighting = (normal: Vec) => 0.84 + normal[0] * 0.1 + normal[1] * 0.06 + normal[2] * 0.24;
const faces = [
  {
    axis: 0,
    sign: -1,
    light: 0.58,
    v: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
  },
  {
    axis: 0,
    sign: 1,
    light: 0.78,
    v: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  },
  {
    axis: 1,
    sign: -1,
    light: 0.7,
    v: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    axis: 1,
    sign: 1,
    light: 0.6,
    v: [
      [0, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
    ],
  },
  {
    axis: 2,
    sign: -1,
    light: 0.48,
    v: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
  },
  {
    axis: 2,
    sign: 1,
    light: 1.12,
    v: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
];

/** Real Cocos Graphics geometry and Label/Sprite nodes; no Canvas texture renderer. */
export class TetracubeView {
  root: Node;
  camera: Camera;
  layers: Node[] = [];
  graphics: Graphics[] = [];
  nodes = new Map<string, Node>();
  seen = new Set<string>();
  controls: Control[] = [];
  projection = new Projection();
  w = 390;
  h = 844;
  pressed = '';
  ready = false;
  error = '';
  disposed = false;
  frame?: SpriteFrame;
  texture?: Texture2D;
  imageAsset?: ImageAsset;
  constructor(parent: Node) {
    this.root = this.node('TetracubeCanvas', parent);
    const canvas = this.root.addComponent(Canvas);
    const cn = new Node('TetracubeCamera');
    parent.addChild(cn);
    this.camera = cn.addComponent(Camera);
    this.camera.projection = Camera.ProjectionType.ORTHO;
    this.camera.near = 0.1;
    this.camera.far = 2000;
    this.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    this.camera.clearColor = color(C.ink);
    this.camera.visibility = Layers.Enum.UI_2D;
    canvas.cameraComponent = this.camera;
    // Background sprite, world, world labels, interface, interface labels, modal, modal labels.
    for (let i = 0; i < 7; i++) {
      const n = this.node('Layer' + i, this.root);
      this.layers.push(n);
      this.graphics.push(this.node('Geometry' + i, n).addComponent(Graphics));
    }
    this.resize();
    this.load();
  }
  node(name: string, parent: Node) {
    const n = new Node(name);
    n.layer = Layers.Enum.UI_2D;
    parent.addChild(n);
    n.addComponent(UITransform);
    return n;
  }
  resize() {
    const size = view.getFrameSize();
    this.w = Math.max(1, size.width);
    this.h = Math.max(1, size.height);
    view.setDesignResolutionSize(this.w, this.h, ResolutionPolicy.SHOW_ALL);
    this.root.getComponent(UITransform)!.setContentSize(this.w, this.h);
    this.root.setPosition(this.w / 2, this.h / 2);
    this.camera.node.setPosition(this.w / 2, this.h / 2, 1000);
    this.camera.orthoHeight = this.h / 2;
  }
  load() {
    this.error = '';
    resources.load('space', ImageAsset, (err, asset) => {
      if (this.disposed) return;
      if (err) {
        this.error = '星舱背景加载失败';
        return;
      }
      this.imageAsset = asset;
      this.texture = new Texture2D();
      this.texture.image = asset;
      this.frame = new SpriteFrame();
      this.frame.texture = this.texture;
      this.ready = true;
    });
  }
  begin() {
    this.controls = [];
    this.seen.clear();
    this.graphics.forEach((g) => g.clear());
  }
  end() {
    for (const [id, n] of this.nodes) n.active = this.seen.has(id);
  }
  cached(id: string, layer: number) {
    this.seen.add(id);
    let n = this.nodes.get(id);
    if (!n) {
      n = this.node(id, this.layers[layer]);
      this.nodes.set(id, n);
    }
    if (n.parent !== this.layers[layer]) n.setParent(this.layers[layer]);
    n.active = true;
    return n;
  }
  background() {
    if (this.frame && this.imageAsset) {
      const n = this.cached('space', 0);
      n.setPosition(0, 0);
      const scale = Math.max(this.w / this.imageAsset.width, this.h / this.imageAsset.height);
      n.getComponent(UITransform)!.setContentSize(
        this.imageAsset.width * scale,
        this.imageAsset.height * scale,
      );
      const s = n.getComponent(Sprite) || n.addComponent(Sprite);
      s.spriteFrame = this.frame;
      s.sizeMode = Sprite.SizeMode.CUSTOM;
      s.color = color('#7c8fa8');
    }
    this.panel(0, 0, this.w, this.h, '#080d2670', '', 0, 1);
  }
  polygon(
    points: { x: number; y: number }[],
    fill: string | Color,
    stroke = '',
    width = 1,
    layer = 1,
  ) {
    const g = this.graphics[layer];
    g.moveTo(points[0].x - this.w / 2, this.h / 2 - points[0].y);
    for (const p of points.slice(1)) g.lineTo(p.x - this.w / 2, this.h / 2 - p.y);
    g.close();
    g.fillColor = typeof fill === 'string' ? color(fill) : fill;
    g.fill();
    if (stroke) {
      g.strokeColor = color(stroke);
      g.lineWidth = width;
      g.stroke();
    }
  }
  panel(
    x: number,
    y: number,
    w: number,
    h: number,
    fill = C.panel,
    stroke = '',
    r = 12,
    layer = 3,
  ) {
    const g = this.graphics[layer];
    g.fillColor = color(fill);
    g.roundRect(x - this.w / 2, this.h / 2 - y - h, w, h, Math.min(r, h / 2));
    g.fill();
    if (stroke) {
      g.strokeColor = color(stroke);
      g.lineWidth = 1.5;
      g.stroke();
    }
  }
  line(
    a: { x: number; y: number },
    b: { x: number; y: number },
    stroke: string,
    width = 1,
    layer = 1,
  ) {
    const g = this.graphics[layer];
    g.strokeColor = color(stroke);
    g.lineWidth = width;
    g.moveTo(a.x - this.w / 2, this.h / 2 - a.y);
    g.lineTo(b.x - this.w / 2, this.h / 2 - b.y);
    g.stroke();
  }
  text(
    id: string,
    value: string,
    x: number,
    y: number,
    size = 16,
    w = 220,
    fill = C.text,
    layer = 4,
    h = size * 1.4,
  ) {
    const n = this.cached('text:' + id, layer);
    n.setPosition(x - this.w / 2, this.h / 2 - y);
    n.getComponent(UITransform)!.setContentSize(w, h);
    const l = n.getComponent(Label) || n.addComponent(Label);
    if (l.string !== value) l.string = value;
    l.fontFamily = 'Microsoft YaHei';
    l.fontSize = size;
    l.lineHeight = size * 1.35;
    l.isBold = true;
    l.color = color(fill);
    l.overflow = Label.Overflow.CLAMP;
    l.horizontalAlign = Label.HorizontalAlign.CENTER;
    l.verticalAlign = Label.VerticalAlign.CENTER;
  }
  button(
    id: string,
    label: string,
    x: number,
    y: number,
    w: number,
    h = 44,
    tone = 'blue',
    disabled = false,
    layer = 3,
  ) {
    const pressed = this.pressed === id,
      offset = pressed ? 3 : 0;
    const edge = disabled
      ? '#4d5977'
      : tone === 'mint'
        ? C.mint
        : tone === 'amber'
          ? C.amber
          : tone === 'violet'
            ? C.violet
            : '#749bc7';
    const fill = disabled
      ? '#1b2339'
      : tone === 'mint'
        ? '#19434c'
        : tone === 'amber'
          ? '#f4bc6d'
          : tone === 'violet'
            ? '#413260'
            : '#192b49';
    this.panel(x, y + 4, w, h - 3, '#05091b', '', 11, layer);
    this.panel(x, y + offset, w, h - 4, fill, edge, 10, layer);
    this.line(
      { x: x + 10, y: y + offset + 3 },
      { x: x + w - 10, y: y + offset + 3 },
      disabled ? '#51617b' : '#e9f8ff80',
      1.3,
      layer,
    );
    this.text(
      'button:' + id,
      label,
      x + w / 2,
      y + h / 2 + offset - 1,
      Math.min(16, w < 55 ? 13 : 16),
      w - 6,
      disabled ? '#76839e' : tone === 'amber' ? '#412812' : C.text,
      layer === 5 ? 6 : 4,
      h - 4,
    );
    this.controls.push({ id, label, x, y, w, h, disabled });
  }
  pause(x: number, y: number) {
    this.button('pause', '', x, y, 44, 44);
    this.panel(x + 14, y + 12, 5, 19, C.text, '', 1);
    this.panel(x + 25, y + 12, 5, 19, C.text, '', 1);
    this.controls[this.controls.length - 1].label = '暂停';
  }
  rotationButton(
    plane: 'XY' | 'XZ' | 'YZ',
    direction: number,
    x: number,
    y: number,
    w: number,
    disabled = false,
  ) {
    const id = 'rotate-' + plane + '-' + (direction < 0 ? 'minus' : 'plus');
    const label = { XY: '平转', XZ: '前后', YZ: '左右' }[plane];
    this.button(id, '', x, y, w, 64, 'mint', disabled);
    this.controls[this.controls.length - 1].label =
      label + (direction < 0 ? '反向' : '正向') + '旋转90度';
    const offset = this.pressed === id ? 3 : 0;
    const cx = x + w / 2,
      cy = y + 24 + offset,
      scale = Math.min(10, (w - 10) / 3.2);
    const project = ([a, b, c]: number[]) => ({
      x: cx + (a - b) * scale * 0.8,
      y: cy + (a + b) * scale * 0.4 - c * scale,
    });
    const axes = { XY: [0, 1], XZ: [0, 2], YZ: [1, 2] }[plane];
    const tint = disabled ? '#69778b' : { XY: C.mint, XZ: '#8ccaff', YZ: '#efc18a' }[plane];
    const corners = Array.from({ length: 8 }, (_, i) =>
      [0, 1, 2].map((axis) => ((i >> axis) & 1) * 2 - 1),
    );
    for (let i = 0; i < 8; i++)
      for (let axis = 0; axis < 3; axis++)
        if (!(i & (1 << axis)))
          this.line(project(corners[i]), project(corners[i | (1 << axis)]), '#839abe', 1, 3);
    const onPlane = (a: number, b: number) => {
      const v = [0, 0, 0];
      v[axes[0]] = a;
      v[axes[1]] = b;
      return project(v);
    };
    this.polygon(
      [onPlane(-1, -1), onPlane(1, -1), onPlane(1, 1), onPlane(-1, 1)],
      tint + '55',
      tint,
      1.2,
      3,
    );
    // Match rotateCells: (a, b) becomes (b, -a) for a positive turn.
    const arc = Array.from({ length: 21 }, (_, i) => {
      const angle = -Math.PI / 4 - (direction * i * Math.PI * 1.5) / 20;
      return onPlane(Math.cos(angle) * 1.25, Math.sin(angle) * 1.25);
    });
    const arrow = disabled ? '#93a0b2' : '#f1fff6';
    for (let i = 1; i < arc.length; i++) this.line(arc[i - 1], arc[i], arrow, 2, 3);
    const tip = arc[arc.length - 1],
      previous = arc[arc.length - 2],
      angle = Math.atan2(tip.y - previous.y, tip.x - previous.x);
    for (const side of [-1, 1])
      this.line(
        tip,
        {
          x: tip.x - 5 * Math.cos(angle + side * 0.55),
          y: tip.y - 5 * Math.sin(angle + side * 0.55),
        },
        arrow,
        2,
        3,
      );
    this.text(
      'rotation:' + id,
      direction < 0 ? '反向' : label,
      cx,
      y + 50 + offset,
      11,
      w - 4,
      disabled ? '#76839e' : C.text,
    );
  }
  at(x: number, y: number) {
    return [...this.controls]
      .reverse()
      .find((r) => !r.disabled && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  }
  mini(id: string, cells: Vec[], fill: string, x: number, y: number, scale = 9) {
    if (!cells.length) return;
    const center = [0, 1, 2].map(
      (a) => (Math.min(...cells.map((c) => c[a])) + Math.max(...cells.map((c) => c[a]))) / 2,
    );
    const p = (v: Vec) => ({
      x: x + (v[0] - v[1]) * scale * 0.8,
      y: y + (v[0] + v[1]) * scale * 0.4 - v[2] * scale,
    });
    for (const cell of [...cells].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]))) {
      for (const f of cubeFaces.filter((f) => f.normal.reduce((a, b) => a + b, 0) > 0.001))
        this.polygon(
          f.vertices.map((v) => p(v.map((n, a) => n + cell[a] - center[a]))),
          shade(fill, lighting(f.normal)),
          '',
          0.8,
          3,
        );
    }
  }
  world(
    rect: Rect,
    dims: Vec,
    board: Cell[],
    active: Vec[],
    activeColor: string,
    ghost: Vec[],
    flip: { axis: number; angle: number } | null = null,
    activeTurn: Turn | null = null,
  ) {
    const p = this.projection;
    p.dims = dims;
    p.width = rect.w;
    p.height = rect.h;
    p.flip = flip;
    p._fit();
    const project = (v: Vec) => {
      const q = p.project(v);
      return { ...q, x: q.x + rect.x, y: q.y + rect.y };
    };
    const [w, d, h] = dims;
    const line = (a: Vec, b: Vec, c = '#557ca84d', width = 1) =>
      this.line(project(a), project(b), c, width);
    // Far walls and world-down floor keep every height readable.
    for (let z = 0; z <= h; z++) {
      line([0, 0, z], [w, 0, z]);
      line([0, 0, z], [0, d, z]);
    }
    for (let x = 0; x <= w; x++) line([x, 0, 0], [x, d, 0], '#78dac04d');
    for (let y = 0; y <= d; y++) line([0, y, 0], [w, y, 0], '#78dac04d');
    for (let x = 0; x <= w; x++) line([x, 0, 0], [x, 0, h]);
    for (let y = 0; y <= d; y++) line([0, y, 0], [0, y, h]);
    for (const z of [0, h])
      for (const [a, b] of [
        [
          [0, 0, z],
          [w, 0, z],
        ],
        [
          [w, 0, z],
          [w, d, z],
        ],
        [
          [w, d, z],
          [0, d, z],
        ],
        [
          [0, d, z],
          [0, 0, z],
        ],
      ])
        line(a, b, z ? '#74cbd2b8' : '#8df2d9', 1.5);
    for (const x of [0, w]) for (const y of [0, d]) line([x, y, 0], [x, y, h], '#76cad07c', 1.2);
    for (let z = 1; z <= h; z += h > 10 ? 3 : 2) {
      const q = project([0, d, z]);
      this.text('ruler:' + z, String(z), q.x - 11, q.y, 10, 22, C.muted, 2);
    }
    type Face = {
      points: Point[];
      depth: number;
      fill: Color;
      ghost: boolean;
      top: boolean;
      cell: Cell;
      active: boolean;
    };
    const polygons: Face[] = [];
    const occupied = new Set(
      board.filter((c) => (c.scale ?? 1) >= 1).map((c) => `${c.x},${c.y},${c.z}`),
    );
    const dir = p._direction();
    const add = (cells: Cell[], isActive = false, isGhost = false) => {
      const turn = isActive ? activeTurn : null;
      const surfaces = (
        isGhost
          ? faces.map((face) => ({
              ...face,
              center: true,
              vertices: face.v.map((v) => v.map((n) => n - 0.5)),
              normal: [0, 1, 2].map((a) => (a === face.axis ? face.sign : 0)),
            }))
          : cubeFaces
      )
        .map((face) => {
          const normal = p._rotate(rotateVector(face.normal, turn));
          return {
            ...face,
            normal,
            light: lighting(normal),
            vertices: face.vertices.map((v) => rotateVector(v, turn)),
            occluders: face.normal.flatMap((n, a) =>
              Math.abs(n) > 0.001 ? [a * 2 + (n > 0 ? 1 : 0)] : [],
            ),
          };
        })
        .filter((face) => face.normal.reduce((sum, n, a) => sum + n * dir[a], 0) > 0.001);
      for (const cell of cells) {
        const neighbors =
          !isActive && !isGhost
            ? faces.map((face) => {
                const neighbor = [cell.x, cell.y, cell.z];
                neighbor[face.axis] += face.sign;
                return occupied.has(neighbor.join(','));
              })
            : null;
        if (neighbors?.every(Boolean)) continue;
        const baseColor = color(cell.color);
        for (const f of surfaces) {
          // An edge stays visible unless neighbors hide every direction of its normal.
          if (neighbors && f.occluders.every((index) => neighbors[index])) continue;
          const s = cell.scale ?? 1;
          const vertices = f.vertices.map((v) =>
            project(v.map((n, a) => [cell.x, cell.y, cell.z][a] + 0.5 + n * s)),
          );
          polygons.push({
            points: vertices,
            depth: vertices.reduce((sum, v) => sum + v.depth, 0) / 4,
            fill: shade(
              baseColor,
              f.light * (isActive ? 1.06 : 0.96 + (0.04 * (cell.z + 1)) / h),
              isGhost ? 12 : 255,
            ),
            ghost: isGhost,
            top: f.center && f.axis === 2 && f.sign === 1,
            cell,
            active: isActive,
          });
        }
      }
    };
    add(board);
    add(
      ghost.map(([x, y, z], id) => ({ x, y, z, id, color: C.mint })),
      false,
      true,
    );
    add(
      active.map(([x, y, z], id) => ({ x, y, z, id, color: activeColor })),
      true,
    );
    polygons.sort((a, b) => a.depth - b.depth);
    const visibleTop = new Map<string, Face>();
    for (const f of polygons) {
      this.polygon(f.points, f.fill, '', 0);
      if (f.ghost) {
        for (let i = 0; i < 4; i++) {
          const a = f.points[i],
            b = f.points[(i + 1) % 4];
          for (let t = 0; t < 1; t += 0.28)
            this.line(
              { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
              {
                x: a.x + (b.x - a.x) * Math.min(1, t + 0.13),
                y: a.y + (b.y - a.y) * Math.min(1, t + 0.13),
              },
              C.mint,
              1.5,
            );
        }
      }
      if (f.top && !f.ghost && !f.active && f.cell.scale === undefined)
        visibleTop.set(f.cell.x + ',' + f.cell.y, f);
    }
    for (const [id, f] of visibleTop) {
      const q = project([f.cell.x + 0.5, f.cell.y + 0.5, f.cell.z + 1.02]);
      if (p.scale > 10)
        this.text(
          'layer:' + id,
          String(Math.round(f.cell.z) + 1),
          q.x,
          q.y,
          Math.min(11, p.scale * 0.42),
          22,
          '#f5faff',
          2,
        );
    }
    if (ghost.length) {
      const z = Math.min(...ghost.map((c) => c[2])) + 1;
      this.text(
        'landing',
        '落点 ' + z + ' 层',
        rect.x + rect.w / 2,
        rect.y + rect.h - 5,
        12,
        180,
        C.mint,
        2,
      );
    }
  }
  dispose() {
    this.disposed = true;
    this.root.destroy();
    this.camera.node.destroy();
    this.frame?.destroy();
    this.texture?.destroy();
    resources.release('space', ImageAsset);
  }
}
