import * as cc from 'cc';
import { installMaterials } from './Materials.ts';
import { ChaseGame, loadAssets } from './ChaseGame.ts';
/** Creator entry. The source-Web bootstrap uses the same game/controller modules. */
class ChaseEntry extends cc.Component {
  controller: ChaseGame | null = null;
  async start() {
    installMaterials();
    const assets = await loadAssets(false);
    if (!cc.isValid(this.node)) return;
    this.controller = new ChaseGame(this.node.scene!, assets);
    this.controller.buildKind = 'creator-editor';
  }
  update(dt: number) {
    this.controller?.update(dt);
  }
  onDestroy() {
    this.controller?.destroy();
  }
}
cc._decorator.ccclass('ChaseEntry')(ChaseEntry);
export { ChaseEntry };
