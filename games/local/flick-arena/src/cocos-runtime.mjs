import * as cc from '../vendor/cocos/cc.js';
import { installMaterials } from '../vendor/cocos/materials.mjs';
import { W, H } from './render.mjs';

// Official engine source Web runtime. This is not a Creator editor export.
export async function startCocos(canvas, update) {
  canvas.id = 'GameCanvas';
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
        designResolution: { width: W, height: H, policy: cc.ResolutionPolicy.SHOW_ALL },
      },
    },
  });
  // The engine retains the element reference. Preserve the public accessibility/host contract.
  canvas.id = 'game';
  cc.view.setDesignResolutionSize(W, H, cc.ResolutionPolicy.SHOW_ALL);
  cc.view.resizeWithBrowserSize(true);
  const scene = new cc.Scene('Flick Arena');
  const root = new cc.Node('Flick UI');
  root.layer = cc.Layers.Enum.UI_2D;
  scene.addChild(root);
  root.addComponent(cc.UITransform).setContentSize(W, H);
  root.setPosition(W / 2, H / 2);
  const ui = root.addComponent(cc.Canvas);
  const cameraNode = new cc.Node('Camera');
  scene.addChild(cameraNode);
  const camera = cameraNode.addComponent(cc.Camera);
  camera.projection = cc.Camera.ProjectionType.ORTHO;
  camera.orthoHeight = H / 2;
  camera.near = 0.1;
  camera.far = 2000;
  camera.visibility = cc.Layers.Enum.UI_2D;
  camera.clearFlags = cc.Camera.ClearFlag.SOLID_COLOR;
  camera.clearColor = new cc.Color(13, 32, 38, 255);
  cameraNode.setPosition(W / 2, H / 2, 1000);
  ui.cameraComponent = camera;
  ui.alignCanvasWithScreen = true;
  let lastFrame = performance.now();
  class FrameLoop extends cc.Component {
    update() {
      const now = performance.now();
      // Preserve wall time for turn deadlines/polling; core.tick clamps physics separately.
      const elapsed = (now - lastFrame) / 1000;
      lastFrame = now;
      update(elapsed);
    }
  }
  cc._decorator.ccclass('FlickFrameLoop')(FrameLoop);
  root.addComponent(FrameLoop);
  cc.director.runSceneImmediate(scene);
  await cc.game.run();
  let disposed = false;
  return {
    cc,
    root,
    resize(width, height) {
      // CSS inset sizing does not change the inline dimensions watched by Cocos SubFrame.
      // Update through View so the backing buffer, camera and GPU viewport stay in sync.
      if (width > 0 && height > 0) cc.view.setFrameSize(width, height);
    },
    resetClock() {
      lastFrame = performance.now();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cc.game.pause();
      cc.view.resizeWithBrowserSize(false);
      cc.director.purgeDirector();
    },
  };
}
