import { Color, isValid, Mesh, MeshRenderer, Node, Prefab, utils } from 'cc';
import { loadArt, material, placeModel } from './SceneArt';
import { isSupply, type RoadItem } from './RoadItems';

type Point = [number, number, number];
/** Colour and silhouette both communicate polarity, including on colour-blind displays. */
function categoryMarker(supply: boolean): Mesh {
  const geometry = {
    positions: [] as number[], normals: [] as number[],
    colors: [] as number[], indices: [] as number[],
  };
  const accent = supply ? '#53edc5' : '#ff794d';
  const ink = '#193a53';
  const face = (points: Point[], hex: string) => {
    const offset = geometry.positions.length / 3;
    const color = new Color().fromHEX(hex);
    for (const point of points) {
      geometry.positions.push(...point);
      geometry.normals.push(0, 0, 1);
      geometry.colors.push(color.r / 255, color.g / 255, color.b / 255, 1);
    }
    for (let i = 1; i < points.length - 1; i++) {
      // Visible from either approach; the marker never turns edge-on with an idle spin.
      geometry.indices.push(offset, offset + i, offset + i + 1, offset, offset + i + 1, offset + i);
    }
  };
  const outline = (radius: number, segments: number) => Array.from({ length: segments }, (_, i) => {
    const angle = Math.PI / 2 + i * Math.PI * 2 / segments;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const;
  });
  const segments = supply ? 24 : 3;
  const badgeY = 2.65;
  const radius = supply ? 0.76 : 1.02;
  face(outline(radius + 0.1, segments).map(([x, y]) => [x, badgeY + y, 0]), ink);
  for (const side of [-1, 1]) {
    face(outline(radius, segments).map(([x, y]) => [x, badgeY + y, side * 0.012]), accent);
    const bar = (x: number, y: number, width: number, height: number) => {
      face([
        [x - width / 2, badgeY + y - height / 2, side * 0.026],
        [x + width / 2, badgeY + y - height / 2, side * 0.026],
        [x + width / 2, badgeY + y + height / 2, side * 0.026],
        [x - width / 2, badgeY + y + height / 2, side * 0.026],
      ], ink);
    };
    if (supply) {
      bar(0, 0, 0.9, 0.25);
      bar(0, 0, 0.25, 0.9);
    } else {
      bar(0, 0.18, 0.22, 0.56);
      bar(0, -0.29, 0.22, 0.18);
    }
  }
  // Footprints match the pickup radius and keep low items (oil/peels/pads) conspicuous.
  const ring = (outer: number, inner: number, y: number, color: string) => {
    const a = outline(outer, segments), b = outline(inner, segments);
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      face([
        [a[i][0], y, a[i][1]], [a[next][0], y, a[next][1]],
        [b[next][0], y, b[next][1]], [b[i][0], y, b[i][1]],
      ], color);
    }
  };
  ring(1.86, 1.32, 0.025, ink);
  ring(1.77, 1.42, 0.035, accent);
  return utils.createMesh(geometry);
}
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
    // Two shared meshes, one added draw per item, and no downloaded marker artwork.
    const markers = [categoryMarker(false), categoryMarker(true)];
    parent.once(Node.EventType.NODE_DESTROYED, () => markers.forEach((mesh) => mesh.destroy()));
    this.nodes = items.map((item) => {
      const node = new Node(`Item-${item.kind}`);
      parent.addChild(node);
      const model = placeModel(models.get(item.kind)!, node, item.kind);
      model.setScale(1.3, 1.3, 1.3);
      const supply = isSupply(item.kind);
      const marker = new Node(supply ? 'Supply-Plus' : 'Hazard-Warning');
      node.addChild(marker);
      const renderer = marker.addComponent(MeshRenderer);
      renderer.mesh = markers[Number(supply)];
      renderer.setMaterial(material('#ffffff'), 0);
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
