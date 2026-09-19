import { isValid, Node, Prefab } from 'cc';
import { loadArt, placeModel } from './SceneArt';
import type { RoadItem } from './RoadItems';
export class ItemsView {
  nodes: Node[] = [];
  ready: Promise<void>;
  constructor(parent: Node, items: RoadItem[]) {
    this.ready = this.load(parent, items);
  }
  async load(parent: Node, items: RoadItem[]) {
    const kinds = Array.from(new Set(items.map((item) => item.kind)));
    const models = new Map(
      await Promise.all(
        kinds.map(
          async (kind) => [kind, await loadArt(`expansion/items/${kind}`, Prefab)] as const,
        ),
      ),
    );
    if (!isValid(parent)) return;
    this.nodes = items.map((item) => {
      const node = placeModel(models.get(item.kind)!, parent, `Item-${item.kind}`);
      node.setScale(1.3, 1.3, 1.3);
      return node;
    });
    this.update(items, 0);
  }
  update(items: RoadItem[], time: number) {
    // A restart reshuffles kinds as well as positions; reuse each matching model exactly once.
    if (this.nodes.some((node, i) => node.name !== `Item-${items[i].kind}`)) {
      const pools = new Map<string, Node[]>();
      for (const node of this.nodes) {
        const pool = pools.get(node.name) ?? [];
        pool.push(node);
        pools.set(node.name, pool);
      }
      this.nodes = items.map((item) => pools.get(`Item-${item.kind}`)!.pop()!);
    }
    this.nodes.forEach((node, i) => {
      const item = items[i];
      node.active = item.availableAt <= time;
      node.setPosition(item.x, item.y + 0.04, item.z);
      node.setRotationFromEuler(0, (item.heading * 180) / Math.PI, 0);
    });
  }
}
