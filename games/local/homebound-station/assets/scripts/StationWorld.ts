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
  private readonly stationSign: Label;
  private readonly signBacking: Graphics;
  private geometry: StationGeometry = getStationGeometry(LEVELS[0]!);
  private axisWidth = 390;
  private axisHeight = 760;
  private facadeHeight = 90;
  private scaleX = 12;
  private scaleZ = 12;
  private streetScale = 12;
  private waitingHeight = 44;
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
  private rejectedCar = '';
  private rejectedUntil = 0;
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
    this.actors = this.node('Depth-sorted painted town');
    const signage = this.node('Station signage');
    this.signBacking = this.node('Station name plaque', signage).addComponent(Graphics);
    this.stationSign = this.makeLabel('Station name', signage, '归途站');
    const frame = view.getFrameSize();
    this.resize(frame.width, frame.height);
    this.ready = new Promise<void>((resolve, reject) => {
      this.rejectReady = reject;
      void this.loadArt()
        .then(() => {
          if (this.disposed) return;
          this.loaded = true;
          this.buildScenery();
          this.resize(this.w, this.h);
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
        (280 * station.height) / 780,
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

  private logicalProjection(point: Point) {
    const streetStart = -1.65;
    const parkingStart = this.geometry.parking.bounds.top;
    const y =
      point.z < streetStart
        ? ((point.z + 6) / (streetStart + 6)) * this.waitingHeight
        : this.waitingHeight +
          (Math.min(point.z, parkingStart) - streetStart) * this.streetScale +
          Math.max(0, point.z - parkingStart) * this.scaleZ;
    return {
      x: (point.x - this.geometry.bounds.left) * this.scaleX,
      y: this.facadeHeight + y,
    };
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
    // Roof arrows share the body hit target and stay inside dense parking cells.
    return {
      x: p.x,
      y: p.y,
      angle: Math.atan2(toward.y - p.y, toward.x - p.x),
    };
  }

  resize(width: number, height: number) {
    if (this.disposed) return;
    this.w = Math.max(1, width);
    this.h = Math.max(1, height);
    this.landscape = width > height;
    const safe = sys.getSafeAreaRect();
    const l = clamp(safe.x, 0, this.w * 0.2),
      r = clamp(this.w - safe.x - safe.width, 0, this.w * 0.2);
    const t = clamp(this.h - safe.y - safe.height, 0, this.h * 0.2),
      b = clamp(safe.y, 0, this.h * 0.2);
    const top = 58;
    const bottom = 8;
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
    this.facadeHeight = Math.min(64, this.axisWidth / 4.5);
    this.scaleX = this.axisWidth / (this.geometry.bounds.right - this.geometry.bounds.left);
    this.streetScale = Math.min(15.5, this.scaleX);
    this.waitingHeight = 42;
    const parkingStart = this.geometry.parking.bounds.top;
    const upperHeight =
      this.facadeHeight + this.waitingHeight + (parkingStart + 1.65) * this.streetScale;
    const lowerUnits = this.geometry.collector.south + 3 - parkingStart;
    this.scaleZ = Math.max(
      this.landscape ? this.streetScale : 13,
      (this.axisHeight - upperHeight) / lowerUnits,
    );
    const contentHeight = upperHeight + lowerUnits * this.scaleZ;
    if (this.landscape && contentHeight > this.axisHeight) {
      const fit = this.axisHeight / contentHeight;
      this.facadeHeight *= fit;
      this.waitingHeight *= fit;
      this.streetScale *= fit;
      this.scaleZ *= fit;
    } else this.axisHeight = contentHeight;
    if (!this.landscape) this.area.h = this.axisHeight;
    this.maxScroll = this.landscape ? 0 : Math.max(0, this.axisHeight - visibleHeight);
    this.scrollY = clamp(this.scrollY, 0, this.maxScroll);
    const clipY = (this.h - this.clipTop - this.clipBottom) / 2;
    this.viewport.getComponent(UITransform)!.setContentSize(this.area.w, visibleHeight);
    this.viewport.setPosition(this.area.x + this.area.w / 2 - this.w / 2, clipY);
    this.content.setPosition(-(this.area.x + this.area.w / 2 - this.w / 2), -clipY);
    // One body envelope everywhere, including roads, turns and parked taxis.
    this.taxiSize = 3.25 * Math.min(this.scaleX, this.scaleZ, this.streetScale);
    this.personSize = clamp(this.taxiSize * 0.5, 12, 18);
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
    const size = Math.max(7, Math.min(11, this.taxiSize * 0.27));
    this.line(
      this.ground,
      [
        { x: p.x - dx * size, y: p.y - dy * size },
        { x: p.x + dx * size * 0.36, y: p.y + dy * size * 0.36 },
      ],
      '#fff6dfd9',
      2.5,
    );
    this.ground.fillColor = paint('#fff6dfd9');
    for (const [i, x, y] of [
      [0, size, 0], [1, -size * 0.12, -size * 0.43], [2, -size * 0.12, size * 0.43],
    ] as const) {
      const px = p.x + dx * x - dy * y - this.w / 2,
        py = this.h / 2 - (p.y + dy * x + dx * y);
      if (i === 0) this.ground.moveTo(px, py);
      else this.ground.lineTo(px, py);
    }
    this.ground.close();
    this.ground.fill();
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
    const road = this.box(b.left + 0.3, -1.65, b.right - 0.3, geo.collector.south + 1.7);
    this.rect(g, { x: road.x - 4, y: road.y - 4, w: road.w + 8, h: road.h + 8 }, '#baab8c', 13);
    this.rect(g, { x: road.x - 3, y: road.y - 3, w: road.w + 6, h: road.h + 5 }, '#f4e4bc', 12);
    this.rect(g, road, '#3b535e', 10);
    this.rect(
      g,
      { ...road, x: road.x + 2, y: road.y + 2, w: road.w - 4, h: road.h - 4 },
      PALETTE.road,
      9,
    );
    const park = this.box(p.bounds.left, p.bounds.top, p.bounds.right, p.bounds.bottom);
    this.rect(
      g,
      { ...park, x: park.x - 3, y: park.y - 3, w: park.w + 6, h: park.h + 6 },
      '#283f49',
      7,
    );
    this.rect(g, park, '#56717b', 5);
    this.line(
      g,
      [
        { x: park.x + 2, y: park.y + 1 },
        { x: park.x + park.w - 2, y: park.y + 1 },
      ],
      '#dae2cf70',
      2,
    );
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
        const cell = this.box(x - 1.65, z - 1.75, x + 1.65, z + 1.75);
        this.rect(g, cell, (row + column) % 2 ? '#a8babc12' : '#c8d5d51e', 3);
        this.worldLine(
          [
            { x: x - 1.65, z: z - 1.7 },
            { x: x - 1.65, z: z + 1.7 },
            { x: x + 1.65, z: z + 1.7 },
            { x: x + 1.65, z: z - 1.7 },
          ],
          '#eae2c096',
          1,
        );
      }
    for (const lane of geo.lanes) {
      if (lane.kind === 'bay-entry' || lane.kind === 'bay-exit' || lane.id === 'station-departure')
        continue;
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
    this.flowMark({ x: geo.collector.right - 1, z: geo.departureZ }, 0);
    // A raised divider prevents visually suggesting a shortcut across the two
    // opposing station roads. Its west end is the actual entrance in geometry.
    const divider = this.box(geo.collector.left + 2, 5.7, geo.collector.right + 1, 6.3);
    this.rect(g, { ...divider, y: divider.y + 3 }, '#263f4650', 3);
    this.rect(g, divider, '#d5c69d', 3);
    for (let x = geo.collector.left + 4; x < geo.collector.right; x += 2)
      this.worldLine(
        [
          { x, z: 5.75 },
          { x, z: 6.25 },
        ],
        '#ac987a',
        1,
      );
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
        z = bay.point.z,
        halfDepth = 1.15;
      const bayBox = this.box(x - 1.8, z - halfDepth, x + 1.8, z + halfDepth);
      this.rect(g, bayBox, '#568a82', 4);
      this.worldLine(
        [
          { x: x - 1.8, z: z + halfDepth },
          { x: x - 1.8, z: z - halfDepth },
          { x: x + 1.8, z: z - halfDepth },
          { x: x + 1.8, z: z + halfDepth },
        ],
        '#f4d47d',
        1.4,
      );
      this.rect(g, this.box(x - 1.8, -4.4, x + 1.8, -1.8), '#cabd9930', 3);
      this.worldLine(
        [
          { x: x - 1.8, z: -1.9 },
          { x: x + 1.8, z: -1.9 },
        ],
        '#fff0cb',
        2,
      );
    }
    const labelPoint = this.project({ x: 0, z: -6 });
    if (!this.landscape) {
      this.rect(
        g,
        {
          x: this.area.x + 8,
          y: labelPoint.y - this.facadeHeight * 0.53,
          w: this.axisWidth - 16,
          h: this.facadeHeight * 0.53 + 4,
        },
        '#e6d1ad',
        3,
      );
      this.rect(
        g,
        { x: this.area.x + 6, y: labelPoint.y - 3, w: this.axisWidth - 12, h: 6 },
        '#c2ad88',
        2,
      );
    }
    const signY = this.landscape ? this.area.y + 18 : labelPoint.y - this.facadeHeight * 0.48;
    const signX = this.landscape
      ? this.area.x + Math.max(35, this.facadeHeight * 0.48)
      : labelPoint.x;
    const signWidth = this.landscape ? 70 : 82;
    this.signBacking.clear();
    this.rect(
      this.signBacking,
      { x: signX - signWidth / 2, y: signY - 12, w: signWidth, h: 24 },
      '#d9b46b',
      6,
    );
    this.rect(
      this.signBacking,
      { x: signX - signWidth / 2 + 2, y: signY - 11, w: signWidth - 4, h: 21 },
      '#16474d',
      5,
    );
    this.stationSign.node.setPosition(signX - this.w / 2, this.h / 2 - signY);
    this.stationSign.node.getComponent(UITransform)!.setContentSize(signWidth, 28);
    this.stationSign.fontSize = this.landscape ? 16 : 19;
    this.stationSign.lineHeight = 28;
    this.stationSign.isBold = true;
    this.stationSign.color = paint('#fff6dd');
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

  private layoutVisual(visual: Visual) {
    switch (visual.kind) {
      case 'taxi': {
        this.fit(visual, this.taxiSize, this.taxiSize);
        visual.sprite.node.setPosition(0, 0);
        break;
      }
      case 'person':
        this.fit(visual, this.personSize, this.personSize);
        break;
      case 'station': {
        visual.node.active = !this.landscape;
        this.fit(visual, this.axisWidth - 16, this.facadeHeight * 0.72);
        visual.sprite.node.setRotationFromEuler(0, 0, 0);
        break;
      }
      case 'station-door':
        visual.node.active = true;
        const bayWidth = Math.abs(
          this.project(this.geometry.bays[1]!.door).x - this.project(this.geometry.bays[0]!.door).x,
        );
        this.fit(
          visual,
          this.landscape ? Math.min(50, this.facadeHeight * 0.65) : Math.min(62, bayWidth - 6),
          this.landscape ? 42 : this.facadeHeight * 0.32,
        );
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
    if (visual.kind === 'station') p.y -= this.facadeHeight * 0.32 + visual.height * 0.08;
    if (visual.kind === 'station-door') {
      if (this.landscape) p.x -= this.facadeHeight * 0.54;
      else p.y -= visual.height * 0.5;
    }
    visual.depth = p.y;
    visual.node.setPosition(p.x - this.w / 2, this.h / 2 - p.y, 0);
  }

  private buildScenery() {
    for (const x of [-8.7, 8.7]) {
      this.props.push(
        this.visual(`Station flowers ${x}`, this.propFrames[5]!, 'flowers', { x, z: -2.1 }),
      );
      this.props.push(
        this.visual(`Station lamp ${x}`, this.propFrames[7]!, 'lamp', { x, z: -5.6 }),
      );
    }
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
    this.rejectedCar = '';
    this.rejectedUntil = 0;
    this.state = simulation;
    this.scrollY = 0;
    this.geometry = simulation.geometry;
    this.resize(this.w, this.h);
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
      const halfDepth = 1.15;
      const area = this.box(x - 1.8, z - halfDepth, x + 1.8, z + halfDepth);
      this.rect(this.bayInk, area, busy ? '#ffe3a030' : '#d3efd20a', 4);
      if (busy)
        this.worldLine(
          [
            { x: x - 1.8, z: z + halfDepth },
            { x: x - 1.8, z: z - halfDepth },
            { x: x + 1.8, z: z - halfDepth },
            { x: x + 1.8, z: z + halfDepth },
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
      const rejected = vehicle.id === this.rejectedCar && simulation.time < this.rejectedUntil;
      visual.sprite.color = paint(rejected ? '#ffc0a4' : '#ffffff');
      if (rejected) {
        visual.shadow.strokeColor = paint('#ff8d68');
        visual.shadow.lineWidth = 3;
        visual.shadow.ellipse(0, 0, visual.width * 0.55, visual.height * 0.55);
        visual.shadow.stroke();
      }
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
      if (group.state === 'split' || group.state === 'departed' || group.arrivesAt === undefined)
        continue;
      const job = services.get(group.id);
      const queued = group.state === 'ready' || group.state === 'reserved';
      const arriving = queued && group.arrivesAt > simulation.time;
      const origin = queued
        ? queuePosition(simulation, group)
        : (job?.walkFrom ?? queuePosition(simulation, group));
      const car = group.vehicleId ? vehicles.get(group.vehicleId) : undefined;
      const fraction =
        group.state === 'walking' && job
          ? Math.min(1, job.elapsed / Math.max(0.01, job.duration))
          : group.state === 'boarding'
            ? 1
            : 0;
      const target = car ? { x: car.position.x, z: car.position.z - 0.75 } : origin;
      for (const [i, passenger] of group.passengers.entries()) {
        if (i < group.boarded || simulation.delivered.has(passenger.id)) continue;
        const visual =
          this.personViews.get(passenger.id) ?? this.person(passenger.id, group.sequence + i);
        visual.node.active = true;
        visual.sprite.color = new Color(
          255,
          255,
          255,
          Math.round(
            255 * (arriving ? clamp((simulation.time - group.arrivalStartedAt!) * 5, 0, 1) : 1),
          ),
        );
        visible.add(passenger.id);
        this.place(visual, {
          x: origin.x + (target.x - origin.x) * fraction + ((i % 3) - 1) * 0.8 * (1 - fraction),
          z:
            origin.z + (target.z - origin.z) * fraction + -Math.floor(i / 3) * 0.3 * (1 - fraction),
        });
        const walking = group.state === 'walking' || arriving;
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

  presentation() {
    return {
      taxiLength: this.taxiSize,
      area: { ...this.area },
      parking: this.box(
        this.geometry.parking.bounds.left,
        this.geometry.parking.bounds.top,
        this.geometry.parking.bounds.right,
        this.geometry.parking.bounds.bottom,
      ),
      streetScale: this.streetScale,
      rejectedCar: this.state && this.state.time < this.rejectedUntil ? this.rejectedCar : null,
      cars: Array.from(this.carViews.entries())
        .filter(([, v]) => v.node.active)
        .map(([id, v]) => ({
          id,
          ...this.project(v.point),
          width: v.width,
          height: v.height,
          direction: v.frameIndex,
        })),
      people: Array.from(this.personViews.entries())
        .filter(([, v]) => v.node.active)
        .map(([id, v]) => ({
          id,
          ...this.project(v.point),
          width: v.width,
          height: v.height,
        })),
    };
  }

  rejectCar(id: string) {
    this.rejectedCar = id;
    this.rejectedUntil = (this.state?.time ?? 0) + 0.45;
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
