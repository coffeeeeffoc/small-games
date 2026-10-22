import * as cc from './vendor/cocos/cc.js';
import { installMaterials } from './game/Materials.js';
import { ChaseGame, loadAssets } from './game/ChaseGame.js';

const loading = document.querySelector('#loading');
try {
  cc.game.onPostSubsystemInitDelegate.add(installMaterials);
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
        designResolution: { width: 390, height: 844, policy: cc.ResolutionPolicy.SHOW_ALL },
      },
    },
  });
  cc.view.resizeWithBrowserSize(true);
  const assets = await loadAssets(true);
  const scene = new cc.Scene('Endless city chase');
  let controller;
  class ChaseLoop extends cc.Component {
    update(dt) {
      controller?.update(dt);
    }
    onDestroy() {
      controller?.destroy();
    }
  }
  cc._decorator.ccclass('ChaseWebLoop')(ChaseLoop);
  const driver = new cc.Node('Chase controller');
  scene.addChild(driver);
  driver.addComponent(ChaseLoop);
  cc.director.runSceneImmediate(scene);
  controller = new ChaseGame(scene, assets);
  await cc.game.run();
  controller.update(0);
  loading.hidden = true;
  document.querySelector('#game').dataset.ready = 'true';
  document.querySelector('#GameCanvas').focus();
} catch (error) {
  console.error(error);
  loading.classList.add('error');
  loading.querySelector('strong').textContent = '街区加载失败';
  loading.querySelector('p').textContent = '请检查网络后重新加载。';
  loading.querySelector('button').hidden = false;
}
