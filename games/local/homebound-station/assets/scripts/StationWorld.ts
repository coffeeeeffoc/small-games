import {
  Camera,
  Canvas,
  Color,
  Graphics,
  ImageAsset,
  Label,
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
import { BAY_X, queuePosition, type Simulation, type Vehicle, type Point } from './core/simulation';
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
const X_KNOTS = [-20, -16, -10, 10, 16, 20] as const;
// Extend the grid's scale beyond the first/last row so a parked car's body
// never crosses straight into a compressed road band.
const Z_KNOTS = [-13, -9.5, -7, 0.5, 4.5, 6.2, 8, 20, 21.8, 28, 31] as const;
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
type Kind = 'taxi' | 'person' | 'station' | 'tree' | 'flowers' | 'bench' | 'lamp';
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
  private readonly bayInk: Graphics;
  private readonly actors: Node;
  private readonly bayNumbers: Label[] = [];
  private readonly images: ImageAsset[] = [];
  private readonly textures: Texture2D[] = [];
  private readonly frames: SpriteFrame[] = [];
  private taxiFrames: SpriteFrame[] = [];
  private propFrames: SpriteFrame[] = [];
  private stationFrame?: SpriteFrame;
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

  private node(name: string, parent = this.root) {
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
      new Rect(0, 0, station.width, station.height),
    );
  }

  /** Piecewise projection gives the playable grid more room than empty verges. */
  private map(value: number, knots: readonly number[], fractions: readonly number[]) {
    let i = 0;
    while (i < knots.length - 2 && value > knots[i + 1]!) i++;
    const t = (value - knots[i]!) / (knots[i + 1]! - knots[i]!);
    return fractions[i]! + (fractions[i + 1]! - fractions[i]!) * t;
  }

  project(point: Point, height = 1.5): ScreenPoint {
    const xf = this.map(point.x, X_KNOTS, [0, 0.072, 0.18, 0.82, 0.928, 1]);
    const zf = this.map(
      point.z,
      Z_KNOTS,
      this.landscape
        ? [0, 0.1, 0.18, 0.3, 0.36, 0.4, 0.447, 0.76, 0.807, 0.94, 1]
        : [0, 0.14, 0.18, 0.33, 0.41, 0.445, 0.49, 0.79, 0.835, 0.93, 1],
    );
    return {
      x: this.area.x + xf * this.area.w,
      y: this.area.y + zf * this.area.h - height * this.elevation,
    };
  }

  arrow(vehicle: Vehicle) {
    const direction = DIRECTIONS[vehicle.direction];
    const ground = this.project(vehicle.position, 0);
    const toward = this.project(
      {
        x: vehicle.position.x + direction.x,
        z: vehicle.position.z + direction.z,
      },
      0,
    );
    const visual = this.carViews.get(vehicle.id);
    const width = visual?.width ?? this.taxiSize * 0.55;
    const height = visual?.height ?? this.taxiSize * 0.7;
    return {
      x: ground.x + width * 0.18,
      y: ground.y - height / 2 - 11,
      angle: Math.atan2(toward.y - ground.y, toward.x - ground.x),
    };
  }

  resize(width: number, height: number, home = false) {
    if (this.disposed) return;
    this.w = Math.max(1, width);
    this.h = Math.max(1, height);
    this.home = home;
    this.landscape = width > height;
    const safe = sys.getSafeAreaRect();
    const safeLeft = clamp(safe.x, 0, this.w * 0.2);
    const safeRight = clamp(this.w - safe.x - safe.width, 0, this.w * 0.2);
    const safeTop = clamp(this.h - safe.y - safe.height, 0, this.h * 0.2);
    const safeBottom = clamp(safe.y, 0, this.h * 0.2);
    const top = home ? (this.landscape ? 70 : 150) : 64;
    const bottom = home ? (this.landscape ? 112 : 174) : this.landscape ? 76 : 90;
    const availableH = Math.max(80, this.h - safeTop - safeBottom - top - bottom);
    const availableW = Math.max(80, this.w - safeLeft - safeRight - 16);
    const sceneW = this.landscape
      ? Math.min(availableW, Math.max(360, availableH * 2.2))
      : availableW;
    this.area = {
      x: safeLeft + (this.w - safeLeft - safeRight - sceneW) / 2,
      y: safeTop + top,
      w: sceneW,
      h: availableH,
    };
    const centralX =
      (this.project({ x: 10, z: 8 }, 0).x - this.project({ x: -10, z: 8 }, 0).x) / 20;
    const rowStep = (this.project({ x: 0, z: 20 }, 0).y - this.project({ x: 0, z: 8 }, 0).y) / 3;
    this.taxiSize = Math.min(centralX * 4.55, rowStep * 1.1);
    const queueStep = this.project({ x: 0, z: -3.3 }, 0).y - this.project({ x: 0, z: -4.6 }, 0).y;
    this.personSize = Math.max(12, Math.min(25, queueStep * 1.05));
    this.elevation = this.taxiSize * 0.22;
    this.root.getComponent(UITransform)!.setContentSize(this.w, this.h);
    this.root.setPosition(this.w / 2, this.h / 2, 0);
    this.camera.node.setPosition(this.w / 2, this.h / 2, 1000);
    this.camera.orthoHeight = this.h / 2;
    this.drawGround();
    for (const visual of this.props) this.layoutVisual(visual);
    for (const visual of this.carViews.values()) this.layoutVisual(visual);
    for (const visual of this.personViews.values()) this.layoutVisual(visual);
    this.baySignature = '';
    if (this.state && this.loaded) this.sync(this.state);
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
    return { ...a, w: b.x - a.x, h: b.y - a.y };
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
    this.rect(g, { x: 0, y: 0, w: this.w, h: this.h }, PALETTE.lawn);
    const garden = this.box(-20, -13, 20, 31);
    this.rect(g, { ...garden, x: garden.x - 3, y: garden.y + 6, w: garden.w + 6 }, '#54795b13', 24);
    this.rect(g, garden, PALETTE.lawnLight, 22);
    const plaza = this.box(-17.5, -10.5, 17.5, 2.5);
    this.rect(g, { ...plaza, y: plaza.y + 3 }, '#aab6a044', 13);
    this.rect(g, plaza, PALETTE.pavingLight, 12);
    // Small paving joints establish scale without making the station a flat slab.
    for (let z = -9.8; z < 2.4; z += 1.45)
      this.worldLine(
        [
          { x: -17, z },
          { x: 17, z },
        ],
        '#c7bba341',
        0.7,
      );
    for (let x = -16; x < 17; x += 2.4)
      this.worldLine(
        [
          { x, z: -10 },
          { x, z: 2.4 },
        ],
        '#cabda037',
        0.65,
      );

    const curb = this.box(-18.2, 2.4, 18.2, 30.1);
    this.rect(g, { ...curb, x: curb.x - 2, y: curb.y + 5, w: curb.w + 4 }, '#29495125', 21);
    this.rect(g, curb, PALETTE.paving, 19);
    const road = this.box(-17.6, 2.7, 17.6, 29.6);
    this.rect(g, road, '#3c535e', 16);
    this.rect(g, { ...road, y: road.y + 1.5, h: road.h - 4 }, PALETTE.road, 15);
    const parking = this.box(-12.5, 6, 12.5, 24.1);
    this.rect(g, { ...parking, y: parking.y + 2 }, '#384f5960', 12);
    this.rect(g, parking, PALETTE.parking, 10);
    this.rect(
      g,
      {
        ...parking,
        x: parking.x + 2,
        y: parking.y + 2,
        w: parking.w - 4,
        h: 1,
      },
      '#a2b1af55',
    );
    // Road grain is static and restrained; all objects come from real art assets.
    for (let i = 0; i < 54; i++) {
      const x = road.x + 7 + ((i * 71) % Math.max(1, Math.floor(road.w - 14)));
      const y = road.y + 7 + ((i * 107) % Math.max(1, Math.floor(road.h - 14)));
      this.rect(g, { x, y, w: 1.2, h: 0.7 }, '#c6d0ce17');
    }
    this.dashed({ x: -16, z: 6 }, { x: -16, z: 26.5 });
    this.dashed({ x: 16, z: 6 }, { x: 16, z: 26.5 });
    this.dashed({ x: -13.8, z: 28 }, { x: 13.8, z: 28 });
    this.dashed({ x: -13.8, z: 4.5 }, { x: 13.8, z: 4.5 });
    for (const x of [-11, 11]) this.flowMark({ x, z: 4.5 }, 0);
    for (const z of [11.5, 21.5]) {
      this.flowMark({ x: 16, z }, Math.PI / 2);
      this.flowMark({ x: -16, z }, -Math.PI / 2);
    }
    for (const x of [-8, 8]) this.flowMark({ x, z: 28 }, Math.PI);

    for (let row = 0; row < 4; row++) {
      for (let column = 0; column < 5; column++) {
        const x = -8 + column * 4;
        const z = 8 + row * 4;
        const cell = this.box(x - 1.8, z - 1.85, x + 1.8, z + 1.85);
        this.rect(
          g,
          {
            ...cell,
            x: cell.x + 1,
            y: cell.y + 1,
            w: cell.w - 2,
            h: cell.h - 2,
          },
          (row + column) % 2 ? '#81959c10' : '#adc0c118',
          4,
        );
        this.worldLine(
          [
            { x: x - 1.8, z: z - 1.75 },
            { x: x - 1.8, z: z + 1.75 },
            { x: x + 1.8, z: z + 1.75 },
            { x: x + 1.8, z: z - 1.75 },
          ],
          '#e8e1cbb0',
          1.05,
        );
      }
    }

    Object.values(BAY_X).forEach((x, index) => {
      const bay = this.box(x - 2.15, -0.9, x + 2.15, 2.1);
      this.rect(g, { ...bay, y: bay.y + 2.5 }, '#355d602e', 7);
      this.rect(g, bay, '#397c78', 7);
      this.rect(
        g,
        { ...bay, x: bay.x + 1.5, y: bay.y + 1.5, w: bay.w - 3, h: bay.h - 3 },
        '#58998b',
        5.5,
      );
      this.worldLine(
        [
          { x: x - 2.1, z: -1.12 },
          { x: x + 2.1, z: -1.12 },
        ],
        '#b8a37b',
        3.5,
      );
      this.worldLine(
        [
          { x: x - 2.1, z: -1.2 },
          { x: x + 2.1, z: -1.2 },
        ],
        '#fff4d7',
        1.5,
      );
      const sign = this.project({ x, z: -1.55 }, 0);
      const diameter = clamp(this.taxiSize * 0.34, 13, 19);
      this.rect(
        g,
        {
          x: sign.x - diameter / 2,
          y: sign.y - diameter / 2,
          w: diameter,
          h: diameter,
        },
        '#285b5b',
        6,
      );
      const label = this.bayNumbers[index]!;
      label.node.setPosition(sign.x - this.w / 2, this.h / 2 - sign.y);
      label.node.getComponent(UITransform)!.setContentSize(diameter, diameter);
      label.fontSize = Math.max(10, diameter * 0.67);
      label.lineHeight = diameter;
    });
    // Curved garden verges stay outside the ring, including the exit on the right.
    for (const side of [-1, 1]) {
      for (const z of [8, 16, 24]) {
        const flowerbed = this.box(side < 0 ? -20 : 18.8, z - 1.2, side < 0 ? -18.8 : 20, z + 1.2);
        this.rect(g, { ...flowerbed, y: flowerbed.y + 1.5 }, '#92a783', 6);
        this.rect(g, flowerbed, '#a8c28e', 6);
      }
    }
  }

  private visual(id: string, frame: SpriteFrame, kind: Kind, point: Point): Visual {
    const node = this.node(id, this.actors);
    const shadow = this.node(`${id} contact shadow`, node).addComponent(Graphics);
    const body = this.node(`${id} painted sprite`, node);
    const transform = body.getComponent(UITransform)!;
    transform.setAnchorPoint(0.5, kind === 'taxi' ? 0.5 : 0.08);
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
    const value = point[axis];
    const knots = axis === 'x' ? X_KNOTS : Z_KNOTS;
    const cuts = [
      value - radius,
      ...knots.filter((k) => k > value - radius && k < value + radius),
      value + radius,
    ];
    const projected = (v: number) => {
      const p = this.project(axis === 'x' ? { x: v, z: point.z } : { x: point.x, z: v }, 0);
      return axis === 'x' ? p.x : p.y;
    };
    let minimum = Infinity;
    for (let i = 1; i < cuts.length; i++)
      minimum = Math.min(
        minimum,
        Math.abs(projected(cuts[i]!) - projected(cuts[i - 1]!)) / (cuts[i]! - cuts[i - 1]!),
      );
    return Math.max(0.01, minimum);
  }

  private layoutVisual(visual: Visual) {
    switch (visual.kind) {
      case 'taxi': {
        // Keep visible corners inside a projected 1.68m circle, while the
        // simulation guarantees >=3.43m between vehicle centres. This includes
        // projection breakpoints, so a compressed road cannot cause art overlap.
        const radius = 1.68;
        const sx = this.minimumScale(visual.point, 'x', radius);
        const sy = this.minimumScale(visual.point, 'z', radius);
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
        // The roof can extend behind the HUD; its feet stay behind the queue.
        // Do not squash the facade into the short band above its ground point.
        const maxWidth = this.area.w * (this.landscape ? 0.48 : 0.82);
        const maxHeight = this.landscape ? 62 : 145;
        this.fit(visual, maxWidth, maxHeight);
        break;
      }
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
    visual.depth = p.y;
    visual.node.setPosition(p.x - this.w / 2, this.h / 2 - p.y, 0);
  }

  private buildScenery() {
    this.props.push(
      this.visual('Station facade', this.stationFrame!, 'station', {
        x: 0,
        z: -10.1,
      }),
    );
    const add = (kind: Kind, index: number, x: number, z: number) =>
      this.props.push(
        this.visual(`${kind}:${x}:${z}`, this.propFrames[index]!, kind, {
          x,
          z,
        }),
      );
    for (const side of [-1, 1]) {
      add('tree', 4, side * 17.9, -7.7);
      add('tree', 4, side * 15.8, -10.7);
      add('flowers', 5, side * 13.5, -2.2);
      add('bench', 6, side * 15.7, -2.6);
      for (const z of [8, 16, 24]) add('flowers', 5, side * 19.55, z + 0.8);
      // Narrow lamp silhouettes sit beyond the kerb, never in the circulation lane.
      for (const z of [5.8, 20]) add('lamp', 7, side * 19.05, z);
    }
  }

  reset(simulation: Simulation) {
    if (this.disposed) return;
    this.state = simulation;
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

  private heading(angle: number) {
    return ((Math.round((Math.PI - angle) / (Math.PI / 4)) % 8) + 8) % 8;
  }

  private car(vehicle: Vehicle) {
    const direction = this.heading(vehicle.angle);
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
      const x = BAY_X[bay.id];
      if (x === undefined) continue;
      const busy = bay.state !== 'free';
      const area = this.box(x - 1.94, -0.7, x + 1.94, 1.9);
      this.rect(
        this.bayInk,
        { ...area, x: area.x + 1, y: area.y + 1, w: area.w - 2, h: area.h - 2 },
        busy ? '#ffe3a050' : '#d3efd214',
        4,
      );
      this.worldLine(
        [
          { x: x - 1.94, z: -0.7 },
          { x: x - 1.94, z: 1.9 },
          { x: x + 1.94, z: 1.9 },
          { x: x + 1.94, z: -0.7 },
        ],
        busy ? '#ffe1a5' : '#bfe0ba',
        busy ? 1.7 : 1,
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
      const direction = this.heading(vehicle.angle);
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
      if (group.state === 'split' || group.state === 'departed') continue;
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
