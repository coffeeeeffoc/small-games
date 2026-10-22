import {
  Camera,
  Canvas,
  Color,
  Graphics,
  ImageAsset,
  Label,
  Mask,
  Node,
  Rect,
  Size,
  Sprite,
  SpriteFrame,
  Texture2D,
  UITransform,
  Vec2,
  resources,
  sys,
  view,
} from 'cc';
import {
  getStationGeometry,
  queuePosition,
  type StationGeometry,
  type Simulation,
  type Vehicle,
  type Point,
} from './core/simulation';
import { LEVELS } from './core/levels';
import { DIRECTIONS } from './core/levels';

/** This layer must be reserved for the world; the HUD camera sees UI_2D only. */
export const STATION_WORLD_LAYER = 1 << 19;
const PALETTE = {
  lawn: '#dce8ca',
  lawnLight: '#edf1dc',
  ink: '#244e50',
  cream: '#fcf1d6',
  paving: '#d8ccb0',
  pavingLight: '#eee2c6',
  road: '#506672',
  parking: '#607680',
  roadLine: '#e7dfc5',
  teal: '#3f8d85',
};

// Tight crops measured from the current 1774 x 887 sheet, including padding.
// They also exclude stray pixels from neighbours crossing nominal cell edges.
const TAXI_CROPS = [
  [104, 77, 230, 323],
  [440, 71, 406, 328],
  [887, 100, 437, 281],
  [1352, 76, 385, 324],
  [90, 481, 239, 328],
  [440, 481, 397, 323],
  [887, 506, 434, 279],
  [1360, 470, 390, 335],
] as const;
const paint = (hex: string) => new Color().fromHEX(hex);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
type ScreenPoint = { x: number; y: number };
type ScreenBox = ScreenPoint & { w: number; h: number };
type Kind = 'taxi' | 'person' | 'station' | 'station-door' | 'tree' | 'flowers' | 'bench' | 'lamp';
type Visual = {
  node: Node;
  sprite: Sprite;
  transform: UITransform;
  shadow: Graphics;
  kind: Kind;
  id: string;
  point: Point;
  depth: number;
  width: number;
  height: number;
  frameIndex: number;
  previousState?: Vehicle['state'];
  releasedAt: number;
  quantity?: Label;
};

/**
 * Asset-driven, orthographic Cocos world. All presentation and input coordinates
 * use project(); there is no DOM/canvas rendering and no primitive-art fallback.
 *
 * Art contract (assets/resources/art, extension omitted when loading):
 * taxis: 4 columns x 2 rows, N NE E SE / S SW W NW.
 * props: 4 columns x 2 rows, coral blue green purple travellers /
 *        tree flowers bench streetlamp. Each frame has ~8% transparent padding.
 * station: a tightly framed, wide transparent facade (about 2.6:1 preferred).
 * Sprite art faces screen north/east/south/west; the camera never rotates it.
 *
 * Integration: await world.ready before exposing gameplay/ready events. Catch
 * rejection in the actual loading UI. HUD alone owns design-resolution changes.
 */
export class StationWorld {
  readonly root: Node;
  readonly camera: Camera;
  readonly ready: Promise<void>;
  readonly cars = new Map<string, Node>();
  readonly people = new Map<string, Node>();
  loadError: Error | null = null;

  private readonly ground: Graphics;
  private readonly viewport: Node;
  private readonly content: Node;
  scrollY = 0;
  maxScroll = 0;
  clipTop = 58;
  clipBottom = 844;
  private readonly bayInk: Graphics;
  private readonly actors: Node;
  private readonly bayNumbers: Label[] = [];
  private readonly stationSign: Label;
  private readonly roadSigns: Label[] = [];
  private geometry: StationGeometry = getStationGeometry(LEVELS[0]!);
  private axisWidth = 390;
  private axisHeight = 760;
  private facadeHeight = 90;
  private gridStart = 230;
  private gridEnd = 700;
  private readonly images: ImageAsset[] = [];
  private readonly textures: Texture2D[] = [];
  private readonly frames: SpriteFrame[] = [];
  private taxiFrames: SpriteFrame[] = [];
  private propFrames: SpriteFrame[] = [];
  private stationFrame?: SpriteFrame;
  private stationDoorFrames: SpriteFrame[] = [];
  private readonly carViews = new Map<string, Visual>();
  private readonly personViews = new Map<string, Visual>();
  private readonly props: Visual[] = [];
  private lastOrder = '';
  private baySignature = '';
  private state?: Simulation;
  private loaded = false;
  private disposed = false;
  private stopLoading = false;
  private rejectReady?: (reason: Error) => void;
  private w = 390;
  private h = 844;
  private home = false;
  private landscape = false;
  private area: ScreenBox = { x: 8, y: 64, w: 374, h: 690 };
  private taxiSize = 54;
  private personSize = 29;
  private elevation = 11;

  constructor(parent: Node) {
    this.root = new Node('Station art canvas');
    this.root.layer = STATION_WORLD_LAYER;
    parent.addChild(this.root);
    this.root.addComponent(UITransform);
    const canvas = this.root.addComponent(Canvas);
    // Canvas's automatic alignment otherwise rewrites the camera on HUD resize.
    canvas.alignCanvasWithScreen = false;
    const cameraNode = new Node('Station art camera');
    cameraNode.layer = STATION_WORLD_LAYER;
    parent.addChild(cameraNode);
    this.camera = cameraNode.addComponent(Camera);
    this.camera.projection = Camera.ProjectionType.ORTHO;
    this.camera.near = 0.1;
    this.camera.far = 2000;
    this.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    this.camera.clearColor = paint(PALETTE.lawn);
    this.camera.visibility = STATION_WORLD_LAYER;
    this.camera.priority = 0;
    canvas.cameraComponent = this.camera;
    this.viewport = this.node('Board viewport', this.root);
    this.viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    this.content = this.node('Board content', this.viewport);
    this.ground = this.node('Paved streets and garden').addComponent(Graphics);
    this.bayInk = this.node('Pickup bay status').addComponent(Graphics);
    const signs = this.node('Pickup bay numbers');
    for (let i = 0; i < 4; i++) {
      const label = this.node(`Bay ${i + 1}`, signs).addComponent(Label);
      label.string = String(i + 1);
      label.fontFamily = 'sans-serif';
      label.horizontalAlign = Label.HorizontalAlign.CENTER;
      label.verticalAlign = Label.VerticalAlign.CENTER;
      label.overflow = Label.Overflow.CLAMP;
      label.color = paint(PALETTE.cream);
      this.bayNumbers.push(label);
    }
    this.actors = this.node('Depth-sorted painted town');
    const signage = this.node('Station signage');
    this.stationSign = this.makeLabel('Station name', signage, '归途站');
    for (const name of ['进站 ↑', '离站 →'])
      this.roadSigns.push(this.makeLabel(name, signage, name));
    const frame = view.getFrameSize();
    this.resize(frame.width, frame.height);
    this.ready = new Promise<void>((resolve, reject) => {
      this.rejectReady = reject;
      void this.loadArt()
        .then(() => {
          if (this.disposed) return;
          this.loaded = true;
          this.buildScenery();
          this.resize(this.w, this.h, this.home);
          if (this.state) this.reset(this.state);
        })
        .then(
          () => {
            if (this.disposed) return;
            this.rejectReady = undefined;
            resolve();
          },
          (cause: unknown) => {
            this.stopLoading = true;
            const error = cause instanceof Error ? cause : new Error(String(cause));
            this.loadError = error;
            this.releaseAssets();
            this.rejectReady?.(error);
            this.rejectReady = undefined;
          },
        );
    });
  }

  private node(name: string, parent = this.content ?? this.root) {
    const node = new Node(name);
    // Layers do not inherit. Setting only the Canvas layer is insufficient.
    node.layer = STATION_WORLD_LAYER;
    parent.addChild(node);
    node.addComponent(UITransform);
    return node;
  }

  private loadImage(path: string): Promise<ImageAsset> {
    return new Promise((resolve, reject) => {
      resources.load(path, ImageAsset, (error, image) => {
        if (this.disposed || this.stopLoading) {
          reject(new Error(`Station artwork load cancelled: ${path}`));
          return;
        }
        if (error || !image) {
          reject(
            new Error(
              `Unable to load station artwork ${path}: ${error?.message ?? 'missing image'}`,
            ),
          );
          return;
        }
        if (!image.width || !image.height) {
          reject(new Error(`Station artwork has an empty image: ${path}`));
          return;
        }
        image.addRef();
        this.images.push(image);
        resolve(image);
      });
    });
  }

  private texture(image: ImageAsset) {
    const texture = new Texture2D();
    texture.image = image;
    this.textures.push(texture);
    return texture;
  }

  private frame(texture: Texture2D, rect: Rect) {
    const frame = new SpriteFrame();
    frame.reset(
      {
        texture,
        rect,
        originalSize: new Size(rect.width, rect.height),
        offset: new Vec2(0, 0),
      },
      true,
    );
    // Already an atlas: keep original UVs and avoid another runtime texture copy.
    frame.packable = false;
    this.frames.push(frame);
    return frame;
  }

  private sheet(image: ImageAsset, label: string) {
    if (image.width < 8 || image.height < 4)
      throw new Error(`${label} is too small for a 4-column, 2-row sprite sheet`);
    // Exported art may have fractional pixel cell boundaries (1774 x 887).
    // Rect UVs support them; all cells keep identical dimensions and scale.
    const texture = this.texture(image);
    const cellW = image.width / 4;
    const cellH = image.height / 2;
    return Array.from({ length: 8 }, (_, i) =>
      // Cocos SpriteFrame rectangles start at the texture's TOP left.
      this.frame(texture, new Rect((i % 4) * cellW, Math.floor(i / 4) * cellH, cellW, cellH)),
    );
  }

  private async loadArt() {
    const [taxis, props, station] = await Promise.all([
      this.loadImage('art/taxis'),
      this.loadImage('art/props'),
      this.loadImage('art/station'),
    ]);
    if (this.disposed || this.stopLoading) throw new Error('Station artwork load cancelled');
    const taxiTexture = this.texture(taxis);
    this.taxiFrames = TAXI_CROPS.map(([x, y, w, h]) =>
      this.frame(
        taxiTexture,
        new Rect(
          (x * taxis.width) / 1774,
          (y * taxis.height) / 887,
          (w * taxis.width) / 1774,
          (h * taxis.height) / 887,
        ),
      ),
    );
    this.propFrames = this.sheet(props, 'art/props');
    this.stationFrame = this.frame(
      this.texture(station),
      new Rect(
        (22 * station.width) / 2017,
        (80 * station.height) / 780,
        (1973 * station.width) / 2017,
        (584 * station.height) / 780,
      ),
    );
    this.stationDoorFrames = [360, 795, 1225, 1662].map((x) =>
      this.frame(
        this.stationFrame!.texture as Texture2D,
        new Rect(
          ((x - 155) * station.width) / 2017,
          (360 * station.height) / 780,
          (310 * station.width) / 2017,
          (304 * station.height) / 780,
        ),
      ),
    );
  }

  private makeLabel(name: string, parent: Node, text: string) {
    const label = this.node(name, parent).addComponent(Label);
    label.string = text;
    label.fontFamily = 'Microsoft YaHei, sans-serif';
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.CLAMP;
    label.color = paint(PALETTE.ink);
    return label;
  }

  private map(value: number, knots: readonly number[], pixels: readonly number[]) {
    let i = 0;
    while (i < knots.length - 2 && value > knots[i + 1]!) i++;
    const t = (value - knots[i]!) / Math.max(0.01, knots[i + 1]! - knots[i]!);
    return pixels[i]! + (pixels[i + 1]! - pixels[i]!) * t;
  }

  private logicalProjection(point: Point) {
    const b = this.geometry.bounds,
      p = this.geometry.parking;
    const gridX = this.map(
      point.x,
      [b.left, p.bounds.left, p.bounds.right, b.right],
      [0, 48, this.axisWidth - 48, this.axisWidth],
    );
    const x = gridX;
    const last = p.origin.z + (p.rows - 1) * p.pitch;
    const fieldTop = this.facadeHeight + 117,
      fieldBottom = this.axisHeight - 36;
    const rowSize = (fieldBottom - fieldTop) / p.rows;
    const z = this.map(
      point.z,
      [-6, -4, 0, 4, 8, 10, 12, Math.max(16, last), last + 2, this.geometry.collector.south + 2],
      [
        this.facadeHeight,
        this.facadeHeight + 15,
        this.facadeHeight + 43,
        this.facadeHeight + 73,
        this.facadeHeight + 103,
        fieldTop,
        fieldTop + rowSize / 2,
        fieldBottom - rowSize / 2,
        fieldBottom,
        this.axisHeight,
      ],
    );
    return { x, y: z };
  }

  project(point: Point, height = 0): ScreenPoint {
    const p = this.logicalProjection(point);
    return this.landscape
      ? { x: this.area.x + p.y, y: this.area.y + this.axisWidth - p.x - height * this.elevation }
      : { x: this.area.x + p.x, y: this.area.y + p.y - this.scrollY - height * this.elevation };
  }

  arrow(vehicle: Vehicle) {
    const d = DIRECTIONS[vehicle.direction];
    const p = this.project(vehicle.position);
    const toward = this.project({ x: vehicle.position.x + d.x, z: vehicle.position.z + d.z });
    const visual = this.carViews.get(vehicle.id);
    // Badges stay inside the car's own cell. Arrows are independent of painted headlights.
    return {
      x: p.x - (visual?.width ?? 28) * 0.32,
      y: p.y - (visual?.height ?? 36) / 2 - 8,
      angle: Math.atan2(toward.y - p.y, toward.x - p.x),
    };
  }

  resize(width: number, height: number, home = false) {
    if (this.disposed) return;
    this.w = Math.max(1, width);
    this.h = Math.max(1, height);
    this.home = home;
    this.landscape = width > height;
    const safe = sys.getSafeAreaRect();
    const l = clamp(safe.x, 0, this.w * 0.2),
      r = clamp(this.w - safe.x - safe.width, 0, this.w * 0.2);
    const t = clamp(this.h - safe.y - safe.height, 0, this.h * 0.2),
      b = clamp(safe.y, 0, this.h * 0.2);
    const top = home ? (this.landscape ? 62 : 140) : 58;
    const bottom = home ? (this.landscape ? 136 : 146) : 8;
    this.area = {
      x: l + 4,
      y: t + top,
      w: this.w - l - r - 8,
      h: Math.max(100, this.h - t - b - top - bottom),
    };
    this.axisWidth = this.landscape ? this.area.h : this.area.w;
    this.axisHeight = this.landscape ? this.area.w : this.area.h;
    this.clipTop = this.area.y;
    this.clipBottom = this.area.y + this.area.h;
    const visibleHeight = this.area.h;
    if (!this.landscape && !home) {
      this.axisHeight = Math.max(this.axisHeight, 94 + 117 + this.geometry.parking.rows * 52 + 36);
      this.area.h = this.axisHeight;
    }
    this.maxScroll = this.landscape || home ? 0 : Math.max(0, this.axisHeight - visibleHeight);
    this.scrollY = clamp(this.scrollY, 0, this.maxScroll);
    const clipY = (this.h - this.clipTop - this.clipBottom) / 2;
    this.viewport.getComponent(UITransform)!.setContentSize(this.area.w, visibleHeight);
    this.viewport.setPosition(this.area.x + this.area.w / 2 - this.w / 2, clipY);
    this.content.setPosition(-(this.area.x + this.area.w / 2 - this.w / 2), -clipY);
    this.facadeHeight = Math.min(home ? 88 : 94, this.axisWidth / 3.7, this.axisHeight * 0.15);
    const rows = this.geometry.parking.rows;
    this.gridStart = this.facadeHeight + 133;
    this.gridEnd = this.axisHeight - 32;
    // Compress only the three service-road bands on short viewports, never the station roof.
    if (this.gridEnd - this.gridStart < (rows - 1) * 36) {
      this.facadeHeight = Math.max(44, this.facadeHeight - 22);
      this.gridStart = this.facadeHeight + 133;
    }
    const sx =
      (this.axisWidth - 96) /
      (this.geometry.parking.bounds.right - this.geometry.parking.bounds.left);
    const sy = (this.gridEnd - this.gridStart) / Math.max(4, (rows - 1) * 4);
    this.taxiSize = Math.min(64, sx * 3.35, sy * 3.3);
    this.personSize = clamp(sx * 2.1, 15, 25);
    this.elevation = 0;
    this.root.getComponent(UITransform)!.setContentSize(this.w, this.h);
    this.root.setPosition(this.w / 2, this.h / 2, 0);
    this.camera.node.setPosition(this.w / 2, this.h / 2, 1000);
    this.camera.orthoHeight = this.h / 2;
    this.drawGround();
    for (const v of this.props) this.layoutVisual(v);
    for (const v of this.carViews.values()) this.layoutVisual(v);
    for (const v of this.personViews.values()) this.layoutVisual(v);
    this.baySignature = '';
  }

  pan(delta: number) {
    if (!this.maxScroll || !Number.isFinite(delta)) return;
    this.scrollY = clamp(this.scrollY - delta, 0, this.maxScroll);
    this.drawGround();
    for (const visual of this.props) this.layoutVisual(visual);
    this.baySignature = '';
  }

  inViewport(point: ScreenPoint) {
    return point.y >= this.clipTop + 12 && point.y <= this.clipBottom - 12;
  }

  private rect(graphics: Graphics, box: ScreenBox, hex: string, radius = 0) {
    graphics.fillColor = paint(hex);
    graphics.roundRect(
      box.x - this.w / 2,
      this.h / 2 - box.y - box.h,
      box.w,
      box.h,
      clamp(radius, 0, Math.min(box.w, box.h) / 2),
    );
    graphics.fill();
  }

  private box(x1: number, z1: number, x2: number, z2: number): ScreenBox {
    const a = this.project({ x: x1, z: z1 }, 0);
    const b = this.project({ x: x2, z: z2 }, 0);
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y),
    };
  }

  private line(graphics: Graphics, points: ScreenPoint[], hex: string, width: number) {
    if (!points.length) return;
    graphics.strokeColor = paint(hex);
    graphics.lineWidth = width;
    points.forEach((point, i) => {
      if (i) graphics.lineTo(point.x - this.w / 2, this.h / 2 - point.y);
      else graphics.moveTo(point.x - this.w / 2, this.h / 2 - point.y);
    });
    graphics.stroke();
  }

  private worldLine(points: Point[], hex: string, width: number, graphics = this.ground) {
    this.line(
      graphics,
      points.map((p) => this.project(p, 0)),
      hex,
      width,
    );
  }

  private dashed(a: Point, b: Point) {
    const from = this.project(a, 0);
    const to = this.project(b, 0);
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const count = Math.max(1, Math.floor(length / 19));
    for (let i = 0; i < count; i++) {
      const t1 = (i + 0.22) / count;
      const t2 = (i + 0.67) / count;
      this.line(
        this.ground,
        [
          {
            x: from.x + (to.x - from.x) * t1,
            y: from.y + (to.y - from.y) * t1,
          },
          {
            x: from.x + (to.x - from.x) * t2,
            y: from.y + (to.y - from.y) * t2,
          },
        ],
        '#e3ddc3aa',
        1.15,
      );
    }
  }

  private flowMark(point: Point, angle: number) {
    const p = this.project(point, 0);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const size = Math.max(3, Math.min(5, this.taxiSize * 0.09));
    this.line(
      this.ground,
      [
        { x: p.x - dx * size - dy * size, y: p.y - dy * size + dx * size },
        { x: p.x + dx * size, y: p.y + dy * size },
        { x: p.x - dx * size + dy * size, y: p.y - dy * size - dx * size },
      ],
      '#dce1cd9c',
      1.7,
    );
  }

  private drawGround() {
    const g = this.ground;
    g.clear();
    const geo = this.geometry,
      p = geo.parking,
      b = geo.bounds;
    this.rect(g, { x: 0, y: 0, w: this.w, h: this.h }, '#e8ddc4');
    this.rect(g, { ...this.area, y: this.area.y + 3 }, '#b4a98f', 12);
    this.rect(g, this.area, '#ebe0c9', 12);
    const road = this.box(b.left + 0.3, -4.8, b.right - 0.3, geo.collector.south + 1.7);
    this.rect(g, road, '#3b535e', 10);
    this.rect(
      g,
      { ...road, x: road.x + 2, y: road.y + 2, w: road.w - 4, h: road.h - 4 },
      PALETTE.road,
      9,
    );
    const park = this.box(p.bounds.left, p.bounds.top, p.bounds.right, p.bounds.bottom);
    this.rect(g, park, '#627983', 6);
    // Fine static asphalt grain, kept behind every actionable element.
    for (let i = 0; i < 200; i++)
      this.rect(
        g,
        {
          x: road.x + 4 + ((i * 71) % Math.max(1, road.w - 8)),
          y: road.y + 4 + ((i * 107) % Math.max(1, road.h - 8)),
          w: 1.2,
          h: 0.7,
        },
        '#d4dfda20',
      );
    for (let row = 0; row < p.rows; row++)
      for (let column = 0; column < p.columns; column++) {
        const x = p.origin.x + column * p.pitch,
          z = p.origin.z + row * p.pitch;
        const cell = this.box(x - 1.83, z - 1.8, x + 1.83, z + 1.8);
        this.rect(g, cell, (row + column) % 2 ? '#a8babc12' : '#c8d5d51e', 3);
        this.worldLine(
          [
            { x: x - 1.83, z: z - 1.75 },
            { x: x - 1.83, z: z + 1.75 },
            { x: x + 1.83, z: z + 1.75 },
            { x: x + 1.83, z: z - 1.75 },
          ],
          '#eae2c096',
          1,
        );
      }
    for (const lane of geo.lanes) {
      if (lane.kind === 'bay-entry' || lane.kind === 'bay-exit') continue;
      for (let i = 1; i < lane.points.length; i++) {
        const a = lane.points[i - 1]!,
          b = lane.points[i]!;
        this.dashed(a, b);
        const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        const from = this.project(a),
          to = this.project(b);
        this.flowMark(mid, Math.atan2(to.y - from.y, to.x - from.x));
      }
    }
    // A raised divider prevents visually suggesting a shortcut across the two
    // opposing station roads. Its west end is the actual entrance in geometry.
    const divider = this.box(geo.collector.left + 2, 5.7, geo.collector.right + 1, 6.3);
    this.rect(g, divider, '#d5c69d', 3);
    this.worldLine(
      [
        { x: geo.collector.left + 2, z: 6 },
        { x: geo.collector.right + 1, z: 6 },
      ],
      '#f8e5a4',
      2,
    );
    // Continuous stop lines and separate outbound lane make the traffic topology explicit.
    for (const [i, bay] of geo.bays.entries()) {
      const x = bay.point.x,
        z = bay.point.z;
      const bayBox = this.box(x - 1.72, z - 1.6, x + 1.72, z + 1.6);
      this.rect(g, bayBox, '#568a82', 4);
      this.worldLine(
        [
          { x: x - 1.72, z: z - 1.6 },
          { x: x - 1.72, z: z + 1.6 },
          { x: x + 1.72, z: z + 1.6 },
          { x: x + 1.72, z: z - 1.6 },
        ],
        '#f4d47d',
        1.4,
      );
      const sign = this.project({ x, z: -2.5 });
      this.rect(g, { x: sign.x - 10, y: sign.y - 8, w: 20, h: 16 }, '#214b51', 5);
      const label = this.bayNumbers[i]!;
      label.node.setPosition(sign.x - this.w / 2, this.h / 2 - sign.y);
      label.node.getComponent(UITransform)!.setContentSize(20, 16);
      label.fontSize = 11;
      label.lineHeight = 16;
      // A short pedestrian route starts at the station doorway, not in a remote square.
      for (let j = 0; j < 4; j++)
        this.worldLine(
          [
            { x: x - 0.75, z: -5.7 + j * 0.65 },
            { x: x + 0.75, z: -5.7 + j * 0.65 },
          ],
          '#ede6cdbb',
          2,
        );
    }
    const labelPoint = this.project({ x: 0, z: -6 });
    const signY = this.landscape ? this.area.y + 18 : labelPoint.y - this.facadeHeight * 0.48;
    const signX = this.landscape ? this.area.x + this.facadeHeight * 0.48 : labelPoint.x;
    const signWidth = this.landscape ? 70 : Math.min(118, this.axisWidth * 0.36);
    this.rect(g, { x: signX - signWidth / 2, y: signY - 14, w: signWidth, h: 28 }, '#fff2d6', 8);
    this.stationSign.node.setPosition(signX - this.w / 2, this.h / 2 - signY);
    this.stationSign.node.getComponent(UITransform)!.setContentSize(signWidth, 28);
    this.stationSign.fontSize = this.landscape ? 16 : 22;
    this.stationSign.lineHeight = 28;
    for (const [i, label] of this.roadSigns.entries()) {
      // Legible roadway labels use existing lanes; no decorative posts in narrow verges.
      const point = this.project(
        i
          ? { x: geo.collector.right - 2, z: geo.departureZ }
          : { x: geo.collector.left, z: geo.collector.north + 3 },
      );
      label.node.active = !this.home;
      label.node.setPosition(point.x - this.w / 2, this.h / 2 - point.y);
      label.node.getComponent(UITransform)!.setContentSize(52, 20);
      label.fontSize = 10;
      label.lineHeight = 18;
      label.color = paint('#f6e8c8');
      label.string = i ? '离站 →' : this.landscape ? '进站 →' : '↑ 进站';
    }
  }

  private visual(id: string, frame: SpriteFrame, kind: Kind, point: Point): Visual {
    const node = this.node(id, this.actors);
    const shadow = this.node(`${id} contact shadow`, node).addComponent(Graphics);
    const body = this.node(`${id} painted sprite`, node);
    const transform = body.getComponent(UITransform)!;
    transform.setAnchorPoint(0.5, kind === 'taxi' || kind === 'station-door' ? 0.5 : 0.08);
    const sprite = body.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    const visual: Visual = {
      node,
      sprite,
      transform,
      shadow,
      kind,
      id,
      point,
      depth: 0,
      width: 0,
      height: 0,
      frameIndex: -1,
      releasedAt: -Infinity,
    };
    this.layoutVisual(visual);
    return visual;
  }

  private fit(visual: Visual, maxWidth: number, maxHeight: number) {
    const rect = visual.sprite.spriteFrame!.rect;
    const scale = Math.min(maxWidth / rect.width, maxHeight / rect.height);
    visual.width = rect.width * scale;
    visual.height = rect.height * scale;
    visual.transform.setContentSize(visual.width, visual.height);
  }

  private minimumScale(point: Point, axis: 'x' | 'z', radius: number) {
    // Sample every band boundary crossed by the body, so moving sprites remain
    // within the same collision envelope as the simulation after resizing.
    let minimum = Infinity;
    for (let i = 0; i < 12; i++) {
      const a = { ...point },
        b = { ...point };
      a[axis] -= radius - (i * radius) / 6;
      b[axis] = a[axis] + radius / 6;
      const p = this.project(a),
        q = this.project(b);
      minimum = Math.min(
        minimum,
        Math.abs(axis === (this.landscape ? 'z' : 'x') ? q.x - p.x : q.y - p.y) / (radius / 6),
      );
    }
    return Math.max(0.01, minimum);
  }

  private layoutVisual(visual: Visual) {
    switch (visual.kind) {
      case 'taxi': {
        // Keep visible corners inside a projected 1.68m circle, while the
        // simulation guarantees >=3.43m between vehicle centres. This includes
        // projection breakpoints, so a compressed road cannot cause art overlap.
        const radius = 1.68;
        const sx = this.minimumScale(visual.point, this.landscape ? 'z' : 'x', radius);
        const sy = this.minimumScale(visual.point, this.landscape ? 'x' : 'z', radius);
        const rect = visual.sprite.spriteFrame!.rect;
        const longest = Math.max(rect.width, rect.height);
        const nw = rect.width / longest,
          nh = rect.height / longest;
        const side = Math.min(this.taxiSize, (2 * radius) / Math.hypot(nw / sx, nh / sy));
        this.fit(visual, side * nw, side * nh);
        visual.sprite.node.setPosition(0, 0);
        break;
      }
      case 'person':
        this.fit(visual, this.personSize, this.personSize);
        break;
      case 'station': {
        visual.node.active = !this.landscape;
        visual.width = this.axisWidth - 16;
        visual.height = this.facadeHeight;
        visual.transform.setContentSize(visual.width, visual.height);
        visual.sprite.node.setRotationFromEuler(0, 0, 0);
        break;
      }
      case 'station-door':
        visual.node.active = this.landscape;
        this.fit(visual, Math.min(50, this.facadeHeight * 0.65), 42);
        break;
      case 'tree':
        this.fit(visual, this.taxiSize * 1.24, this.taxiSize * 1.42);
        break;
      case 'flowers':
        this.fit(visual, this.taxiSize * 0.43, this.taxiSize * 0.43);
        break;
      case 'bench':
        this.fit(visual, this.taxiSize * 0.77, this.taxiSize * 0.77);
        break;
      case 'lamp':
        this.fit(visual, this.taxiSize * 0.74, this.taxiSize * 0.93);
        break;
    }
    const shadow = visual.shadow;
    shadow.clear();
    const person = visual.kind === 'person';
    const station = visual.kind === 'station';
    const radiusX = visual.width * (person ? 0.19 : station ? 0.42 : 0.31);
    const radiusY = Math.max(1, visual.height * (station ? 0.037 : person ? 0.03 : 0.065));
    shadow.fillColor = paint('#1d43451c');
    shadow.ellipse(1, -1, radiusX * 1.18, radiusY * 1.4);
    shadow.fill();
    shadow.fillColor = paint('#1d434523');
    shadow.ellipse(0, 0, radiusX, radiusY);
    shadow.fill();
    this.place(visual, visual.point);
  }

  private place(visual: Visual, point: Point) {
    visual.point = point;
    const p = this.project(point, 0);
    if (visual.kind === 'station-door') p.x -= this.facadeHeight * 0.54;
    visual.depth = p.y;
    visual.node.setPosition(p.x - this.w / 2, this.h / 2 - p.y, 0);
  }

  private buildScenery() {
    this.props.push(this.visual('Station facade', this.stationFrame!, 'station', { x: 0, z: -6 }));
    for (const [index, bay] of this.geometry.bays.entries())
      this.props.push(
        this.visual(
          `Side station door ${index + 1}`,
          this.stationDoorFrames[index]!,
          'station-door',
          bay.door,
        ),
      );
  }

  reset(simulation: Simulation) {
    if (this.disposed) return;
    this.state = simulation;
    this.scrollY = 0;
    this.geometry = simulation.geometry;
    this.resize(this.w, this.h, this.home);
    // Creator's production transpiler treats spread operands as arrays.
    // Materialize Map iterators before concatenating the render lists.
    for (const visual of [
      ...Array.from(this.carViews.values()),
      ...Array.from(this.personViews.values()),
    ])
      visual.node.destroy();
    this.cars.clear();
    this.people.clear();
    this.carViews.clear();
    this.personViews.clear();
    this.lastOrder = '';
    this.baySignature = '';
    if (!this.loaded) return;
    for (const vehicle of simulation.vehicles) this.car(vehicle);
    for (const group of simulation.groups)
      for (const [i, passenger] of group.passengers.entries())
        this.person(passenger.id, group.sequence + i);
    this.sync(simulation);
  }

  private heading(vehicle: Vehicle) {
    const a = this.project(vehicle.position),
      b = this.project({
        x: vehicle.position.x + Math.sin(vehicle.angle) * 0.1,
        z: vehicle.position.z + Math.cos(vehicle.angle) * 0.1,
      });
    return ((Math.round(Math.atan2(b.x - a.x, a.y - b.y) / (Math.PI / 4)) % 8) + 8) % 8;
  }

  private car(vehicle: Vehicle) {
    const direction = this.heading(vehicle);
    const visual = this.visual(
      `Taxi ${vehicle.id}`,
      this.taxiFrames[direction]!,
      'taxi',
      vehicle.position,
    );
    visual.frameIndex = direction;
    visual.previousState = vehicle.state;
    this.carViews.set(vehicle.id, visual);
    this.cars.set(vehicle.id, visual.node);
    return visual;
  }

  private person(id: string, index: number) {
    const visual = this.visual(`Passenger ${id}`, this.propFrames[index % 4]!, 'person', {
      x: 0,
      z: 0,
    });
    this.personViews.set(id, visual);
    this.people.set(id, visual.node);
    return visual;
  }

  private groupCount(visual: Visual, count: number, show: boolean) {
    if (!visual.quantity && show) {
      const node = this.node('Waiting party size', visual.node);
      const badge = node.addComponent(Graphics);
      badge.fillColor = paint('#285b5b');
      badge.roundRect(-7, -6, 14, 12, 4);
      badge.fill();
      const label = this.node('Party size', node).addComponent(Label);
      label.node.getComponent(UITransform)!.setContentSize(14, 12);
      label.fontSize = 10;
      label.lineHeight = 12;
      label.horizontalAlign = Label.HorizontalAlign.CENTER;
      label.verticalAlign = Label.VerticalAlign.CENTER;
      label.color = paint('#fff2d4');
      visual.quantity = label;
    }
    if (visual.quantity) {
      const node = visual.quantity.node.parent!;
      node.active = show;
      node.setPosition(this.personSize * 0.52 + 3, this.personSize * 0.42);
      visual.quantity.string = String(count);
    }
  }

  private paintBays(simulation: Simulation) {
    const signature = simulation.bays.map((bay) => `${bay.id}:${bay.state}`).join('|');
    if (signature === this.baySignature) return;
    this.baySignature = signature;
    this.bayInk.clear();
    for (const bay of simulation.bays) {
      const point = this.geometry.bays.find((b) => b.id === bay.id)?.point;
      if (!point) continue;
      const { x, z } = point,
        busy = bay.state !== 'free';
      const area = this.box(x - 1.6, z - 1.5, x + 1.6, z + 1.5);
      this.rect(this.bayInk, area, busy ? '#ffe3a030' : '#d3efd20a', 4);
      if (busy)
        this.worldLine(
          [
            { x: x - 1.6, z: z - 1.5 },
            { x: x - 1.6, z: z + 1.5 },
            { x: x + 1.6, z: z + 1.5 },
            { x: x + 1.6, z: z - 1.5 },
          ],
          '#ffe1a5',
          1.5,
          this.bayInk,
        );
    }
  }

  sync(simulation: Simulation) {
    if (this.disposed) return;
    this.state = simulation;
    if (!this.loaded) return;
    for (const vehicle of simulation.vehicles) {
      const visual = this.carViews.get(vehicle.id) ?? this.car(vehicle);
      visual.node.active = vehicle.state !== 'removed';
      if (!visual.node.active) continue;
      const direction = this.heading(vehicle);
      if (direction !== visual.frameIndex) {
        visual.sprite.spriteFrame = this.taxiFrames[direction]!;
        visual.frameIndex = direction;
      }
      if (visual.previousState === 'holding' && vehicle.state !== 'holding')
        visual.releasedAt = simulation.time;
      visual.previousState = vehicle.state;
      const phase = clamp((simulation.time - visual.releasedAt) / 0.25, 0, 1);
      const pulse = Math.sin(phase * Math.PI);
      visual.point = vehicle.position;
      this.layoutVisual(visual);
      if (pulse > 0.01) {
        // Highlight departure without enlarging/rotating the safety envelope.
        visual.shadow.strokeColor = new Color(255, 218, 112, Math.round(170 * pulse));
        visual.shadow.lineWidth = 1.5;
        visual.shadow.ellipse(0, 0, visual.width * 0.48, visual.height * 0.38);
        visual.shadow.stroke();
      }
    }

    const visible = new Set<string>();
    const services = new Map(simulation.services.map((job) => [job.groupId, job]));
    const vehicles = new Map(simulation.vehicles.map((vehicle) => [vehicle.id, vehicle]));
    for (const group of simulation.groups) {
      if (!['walking', 'boarding'].includes(group.state)) continue;
      const job = services.get(group.id);
      // Committed pickup origins remain the ones captured at dispatch time.
      const origin = job?.walkFrom ?? job?.pickupPoint ?? queuePosition(simulation, group);
      const car = group.vehicleId ? vehicles.get(group.vehicleId) : undefined;
      const fraction =
        group.state === 'walking' && job
          ? Math.min(1, job.elapsed / Math.max(0.01, job.duration))
          : group.state === 'boarding'
            ? 1
            : 0;
      const target = car ? { x: car.position.x + 0.9, z: car.position.z - 0.4 } : origin;
      const queued = group.state === 'ready' || group.state === 'reserved';
      for (const [i, passenger] of group.passengers.entries()) {
        if (i < group.boarded || simulation.delivered.has(passenger.id)) continue;
        // Compact waiting parties remain legible at 100 levels: one traveller
        // and the exact party size. Every individual appears when walking/boarding.
        if (queued && i !== group.boarded) continue;
        const visual =
          this.personViews.get(passenger.id) ?? this.person(passenger.id, group.sequence + i);
        visual.node.active = true;
        visual.sprite.color = new Color(
          255,
          255,
          255,
          Math.round(255 * clamp(fraction * 5 - i * 0.18, 0, 1)),
        );
        visible.add(passenger.id);
        this.groupCount(visual, group.passengers.length - group.boarded, queued);
        this.place(visual, {
          x:
            origin.x +
            (target.x - origin.x) * fraction +
            (queued ? -0.92 : ((i % 3) - 1) * 0.92 * (1 - fraction)),
          z:
            origin.z +
            (target.z - origin.z) * fraction +
            (queued ? 0 : Math.floor(i / 3) * 0.73 * (1 - fraction)),
        });
        const walking = group.state === 'walking';
        const step = Math.sin(simulation.time * 13 + i * 1.7);
        visual.sprite.node.setPosition(
          0,
          walking ? Math.abs(step) * Math.min(1.3, this.personSize * 0.045) : 0,
        );
        visual.sprite.node.setRotationFromEuler(
          0,
          0,
          walking ? step * 2.3 : Math.sin(simulation.time * 0.8 + i) * 0.45,
        );
      }
    }
    for (const [id, visual] of this.personViews) if (!visible.has(id)) visual.node.active = false;
    this.paintBays(simulation);
    const ordered = [
      ...this.props,
      ...Array.from(this.carViews.values()),
      ...Array.from(this.personViews.values()),
    ].sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
    const orderKey = ordered.map((visual) => visual.id).join('|');
    if (orderKey !== this.lastOrder) {
      ordered.forEach((visual, index) => visual.node.setSiblingIndex(index));
      this.lastOrder = orderKey;
    }
  }

  private releaseAssets() {
    for (const frame of this.frames.splice(0)) frame.destroy();
    for (const texture of this.textures.splice(0)) texture.destroy();
    for (const image of this.images.splice(0)) image.decRef();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLoading = true;
    this.rejectReady?.(new Error('Station world disposed before artwork finished loading'));
    this.rejectReady = undefined;
    if (this.root.isValid) {
      this.root.active = false;
      this.root.destroy();
    }
    this.camera.node?.destroy();
    this.releaseAssets();
    this.cars.clear();
    this.people.clear();
    this.carViews.clear();
    this.personViews.clear();
    this.props.length = 0;
  }
}
