import * as cc from './cc.js';
import { installMaterials } from './materials.mjs';
export { cc };
let started = false;
/** Start real Cocos Scene/Canvas/Camera. Coordinates inside ui are centered, Y up. */
export async function startCocos(
  canvas,
  { width = 390, height = 844, background = [8, 16, 32, 255], update = () => {} } = {},
) {
  if (started) throw new Error('Cocos runtime already started');
  started = true;
  canvas.id = 'GameCanvas';
  Object.assign(canvas.style, {
    width: '100%',
    height: '100%',
    display: 'block',
    touchAction: 'none',
  });
  const container = canvas.parentElement;
  container.id = 'Cocos3dGameContainer';
  container.parentElement.id = 'GameDiv';
  cc.game.onPostSubsystemInitDelegate.add(() => installMaterials(cc));
  await cc.game.init({
    debugMode: cc.DebugMode.ERROR,
    overrideSettings: {
      engine: {},
      assets: { preloadBundles: [], preloadAssets: [] },
      scripting: { scriptPackages: [] },
      rendering: { customPipeline: false },
      splashScreen: { totalTime: 0 },
      screen: {
        exactFitScreen: false,
        designResolution: { width, height, policy: cc.ResolutionPolicy.SHOW_ALL },
      },
    },
  });
  cc.view.setDesignResolutionSize(width, height, cc.ResolutionPolicy.SHOW_ALL);
  cc.view.resizeWithBrowserSize(true);
  const scene = new cc.Scene('Porcelain atelier');
  const ui = new cc.Node('UI');
  ui.layer = cc.Layers.Enum.UI_2D;
  scene.addChild(ui);
  ui.addComponent(cc.UITransform).setContentSize(width, height);
  ui.setPosition(width / 2, height / 2, 0);
  const cv = ui.addComponent(cc.Canvas);
  const cameraNode = new cc.Node('Camera');
  scene.addChild(cameraNode);
  const camera = cameraNode.addComponent(cc.Camera);
  camera.projection = cc.Camera.ProjectionType.ORTHO;
  camera.orthoHeight = height / 2;
  camera.near = 0.1;
  camera.far = 2000;
  camera.visibility = cc.Layers.Enum.UI_2D;
  camera.clearFlags = cc.Camera.ClearFlag.SOLID_COLOR;
  camera.clearColor = new cc.Color(...background);
  cameraNode.setPosition(width / 2, height / 2, 1000);
  cv.cameraComponent = camera;
  cv.alignCanvasWithScreen = true;
  class Loop extends cc.Component {
    update(dt) {
      update(Math.min(dt, 0.05));
    }
  }
  cc._decorator.ccclass('PorcelainFrameLoop')(Loop);
  ui.addComponent(Loop);
  cc.director.runSceneImmediate(scene);
  await cc.game.run();
  let destroyed = false;
  return {
    cc,
    scene,
    ui,
    camera,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    resize(nextWidth, nextHeight) {
      if (
        !Number.isFinite(nextWidth) ||
        !Number.isFinite(nextHeight) ||
        nextWidth <= 0 ||
        nextHeight <= 0
      )
        throw new Error('Invalid design resolution');
      width = nextWidth;
      height = nextHeight;
      cc.view.setDesignResolutionSize(width, height, cc.ResolutionPolicy.SHOW_ALL);
      ui.getComponent(cc.UITransform).setContentSize(width, height);
      ui.setPosition(width / 2, height / 2, 0);
      cameraNode.setPosition(width / 2, height / 2, 1000);
      camera.orthoHeight = height / 2;
    },
    clientToDesign(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((clientX - r.left) / r.width) * width,
        y: ((clientY - r.top) / r.height) * height,
      };
    },
    pause() {
      cc.game.pause();
    },
    resume() {
      cc.game.resume();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cc.game.pause();
      cc.view.resizeWithBrowserSize(false);
      cc.director.purgeDirector();
    },
  };
}
