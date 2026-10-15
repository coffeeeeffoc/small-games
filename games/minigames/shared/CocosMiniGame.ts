import {
  _decorator,
  Component,
  Camera,
  Canvas,
  Layers,
  ResolutionPolicy,
  EventTouch,
  Game,
  Input,
  Node,
  Size,
  Sprite,
  SpriteFrame,
  Texture2D,
  UITransform,
  game,
  input,
  view,
} from 'cc';
import { config, prepareSdk, start } from './game-entry.js';
import { createCanvasRuntime } from './runtime.js';
import { createBrowserSdk } from './browser-sdk.js';

const { ccclass } = _decorator;
const PLATFORM_GLOBALS: Record<string, string> = {
  taptap: 'tap',
  wechat: 'wx',
  bilibili: 'bl',
  douyin: 'tt',
  kuaishou: 'ks',
  alipay: 'my',
  baidu: 'swan',
};

/** Attach to the scene Canvas. The controller never receives Cocos's WebGL canvas. */
@ccclass('CocosMiniGame')
export class CocosMiniGame extends Component {
  private runtime: ReturnType<typeof createCanvasRuntime> | null = null;
  private texture: Texture2D | null = null;
  private frame: SpriteFrame | null = null;
  private surface: Node | null = null;
  private textureWidth = 0;
  private textureHeight = 0;
  private elapsed = 0;
  private camera: Camera | null = null;
  private hostCleanup: (() => void) | null = null;

  onLoad() {
    const globals = globalThis as unknown as Record<string, any>;
    const hostName = PLATFORM_GLOBALS[config.platform];
    if (config.platform !== 'web-preview' && !hostName)
      throw new Error(`Unknown mini-game platform: ${config.platform}`);
    const raw =
      config.platform === 'web-preview'
        ? createBrowserSdk({ game: config.game })
        : globals[hostName];
    if (!raw)
      throw new Error(
        `The ${config.platform} SDK is unavailable; open the build in its official developer tool`,
      );
    const sdk = prepareSdk(raw);
    this.node.layer = Layers.Enum.UI_2D;
    this.node.addComponent(UITransform);
    const canvas = this.node.addComponent(Canvas);
    canvas.alignCanvasWithScreen = false;
    const cameraNode = new Node('UICamera');
    this.node.addChild(cameraNode);
    cameraNode.setPosition(0, 0, 1000);
    this.camera = cameraNode.addComponent(Camera);
    this.camera.projection = Camera.ProjectionType.ORTHO;
    this.camera.near = 0.1;
    this.camera.far = 2000;
    this.camera.visibility = Layers.Enum.UI_2D;
    this.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    canvas.cameraComponent = this.camera;
    this.surface = new Node('GameSurface');
    this.node.addChild(this.surface);
    this.surface.layer = this.node.layer;
    this.surface.addComponent(UITransform);
    const sprite = this.surface.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    this.texture = new Texture2D();
    this.frame = new SpriteFrame();
    // A changing canvas must not be copied into the static dynamic atlas.
    this.frame.packable = false;
    this.runtime = createCanvasRuntime({
      sdk,
      start,
      maxDpr: config.pixelRatio,
      maxUploadsPerSecond: config.maxUploadsPerSecond,
      assetRoot: config.assetRoot,
      debug: config.debug,
      mainCanvas: game.canvas,
    });
    input.on(Input.EventType.TOUCH_START, this.touchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
    // Cocos already converts mouse input to touch; a second mouse listener doubles clicks.
    if (raw.onHide && raw.offHide && raw.onShow && raw.offShow) {
      const hide = () => this.hide();
      const show = (payload: unknown) => this.show(payload);
      raw.onHide(hide);
      raw.onShow(show);
      this.hostCleanup = () => {
        raw.offHide(hide);
        raw.offShow(show);
      };
    } else {
      game.on(Game.EVENT_HIDE, this.hide, this);
      game.on(Game.EVENT_SHOW, this.show, this);
    }
    view.on('canvas-resize', this.resize, this);
    this.fitSurface();
    if (config.debug)
      globals.__cocosMiniGame = {
        getState: () => this.runtime?.getDebugState?.(),
        hide: this.hide.bind(this),
        show: this.show.bind(this),
      };
  }

  private fitSurface() {
    if (!this.runtime) return;
    const { windowWidth: width, windowHeight: height } = this.runtime.getViewport();
    const current = view.getDesignResolutionSize();
    if (current.width !== width || current.height !== height)
      view.setDesignResolutionSize(width, height, ResolutionPolicy.EXACT_FIT);
    this.node.getComponent(UITransform)?.setContentSize(width, height);
    this.node.setPosition(width / 2, height / 2, 0);
    if (this.camera) this.camera.orthoHeight = height / 2;
    this.surface?.getComponent(UITransform)?.setContentSize(width, height);
  }
  private touch(type: 'start' | 'move' | 'end' | 'cancel', event: EventTouch) {
    if (!this.runtime) return;
    const size = view.getVisibleSize(),
      origin = view.getVisibleOrigin(),
      viewport = this.runtime.getViewport();
    const touches = event.getTouches();
    // The engine dispatches once per changed touch with the same changed-touch array.
    if (event.touch && event.touch !== touches[0]) return;
    const points = touches.map((touch) => {
      const p = touch.getUILocation();
      return {
        identifier: touch.getID(),
        x: ((p.x - origin.x) / size.width) * viewport.windowWidth,
        y: (1 - (p.y - origin.y) / size.height) * viewport.windowHeight,
      };
    });
    this.runtime.dispatchTouch(type, points);
  }
  private touchStart(event: EventTouch) {
    this.touch('start', event);
  }
  private touchMove(event: EventTouch) {
    this.touch('move', event);
  }
  private touchEnd(event: EventTouch) {
    this.touch('end', event);
  }
  private touchCancel(event: EventTouch) {
    this.touch('cancel', event);
  }
  private hide() {
    this.runtime?.hide();
  }
  private show(payload?: unknown) {
    this.runtime?.show(payload);
    this.fitSurface();
  }
  private resize() {
    this.runtime?.resize();
    this.fitSurface();
  }

  onDisable() {
    this.hide();
  }
  onEnable() {
    this.show();
  }

  lateUpdate(dt: number) {
    this.elapsed += dt * 1000;
    this.runtime?.uploadFrame(this.elapsed, (source, size) => {
      if (!this.texture || !this.frame) return;
      if (size.width !== this.textureWidth || size.height !== this.textureHeight) {
        this.textureWidth = size.width;
        this.textureHeight = size.height;
        this.texture.reset({
          width: size.width,
          height: size.height,
          format: Texture2D.PixelFormat.RGBA8888,
          mipmapLevel: 1,
        });
        this.texture.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
        this.frame.reset(
          { texture: this.texture, originalSize: new Size(size.width, size.height) },
          true,
        );
        const sprite = this.surface?.getComponent(Sprite);
        if (sprite) sprite.spriteFrame = this.frame;
      }
      this.texture.uploadData(source);
    });
  }

  onDestroy() {
    input.off(Input.EventType.TOUCH_START, this.touchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
    this.hostCleanup?.();
    game.off(Game.EVENT_HIDE, this.hide, this);
    game.off(Game.EVENT_SHOW, this.show, this);
    view.off('canvas-resize', this.resize, this);
    try {
      this.runtime?.stop();
    } finally {
      this.runtime = null;
      this.frame?.destroy();
      this.texture?.destroy();
      this.surface?.destroy();
      this.frame = null;
      this.texture = null;
      this.surface = null;
      if (config.debug) delete (globalThis as unknown as Record<string, unknown>).__cocosMiniGame;
    }
  }
}
