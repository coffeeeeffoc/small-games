import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createKart } from '../assets/scripts/KartPhysics.ts';
import { defaultSelection } from '../assets/scripts/Selection.ts';

// Run the actual view's assembly/update without downloading art or requiring a GPU.
class Node {
  valid = true;
  children: Node[] = [];
  parent?: Node;
  position: number[] = [];
  rotation: number[] = [];
  parts: unknown[][] = [];
  name: string;
  constructor(name = '') {
    this.name = name;
  }
  addChild(child: Node) {
    child.parent = this;
    this.children.push(child);
  }
  destroy() {
    this.valid = false;
  }
  getComponentsInChildren() {
    return [];
  }
  setPosition(...value: number[]) {
    this.position = value;
  }
  setRotationFromEuler(...value: number[]) {
    this.rotation = value;
  }
  setScale() {}
}
class MeshBatch {
  parts: unknown[][] = [];
  box(...args: unknown[]) {
    this.parts.push(['box', ...args]);
  }
  ball(...args: unknown[]) {
    this.parts.push(['ball', ...args]);
  }
  add(...args: unknown[]) {
    this.parts.push(['add', ...args]);
  }
  build(parent: Node, name: string) {
    const node = new Node(name);
    node.parts = this.parts;
    parent.addChild(node);
    return node;
  }
}
const calls: string[] = [];
let pending = Promise.resolve();
const cc = {
  Node,
  Prefab: class {},
  JsonAsset: class {},
  MeshRenderer: class {},
  isValid: (node: Node) => node.valid,
  primitives: { cone: () => ({ cone: true }) },
};
const art = {
  MeshBatch,
  material: () => ({}),
  palette: {
    navy: '#193a53',
    blue: '#549cea',
    white: '#fff7dd',
    yellow: '#ffd15a',
    red: '#fb6555',
    mint: '#53ddb9',
  },
  async loadArt(path: string) {
    calls.push(path);
    await pending;
    return {
      json: {
        models: [
          {
            category: 'vehicles',
            id: 'classic-kart',
            bounds: [
              [-0.8, 0, -1.45],
              [0.8, 1.42, 1.45],
            ],
          },
        ],
      },
    };
  },
  placeModel(_asset: unknown, parent: Node, name: string) {
    const node = new Node(name);
    parent.addChild(node);
    return node;
  },
  groundShadow(parent: Node) {
    const node = new Node('Shadow');
    parent.addChild(node);
    return node;
  },
};
const source = new URL('../assets/scripts/KartView.ts', import.meta.url);
(globalThis as any).__kartEquipment = { cc, art };
const hooks = registerHooks({
  resolve(id, context, next) {
    if (context.parentURL === source.href && (id === 'cc' || id === './SceneArt'))
      return { url: 'kart-equipment:' + (id === 'cc' ? 'cc' : 'art'), shortCircuit: true };
    return next(id, context);
  },
  load(url, context, next) {
    if (url.startsWith('kart-equipment:')) {
      const key = url.slice('kart-equipment:'.length) as 'cc' | 'art';
      return {
        format: 'module',
        shortCircuit: true,
        source: `export const { ${Object.keys(key === 'cc' ? cc : art).join(',')} } = globalThis.__kartEquipment.${key};`,
      };
    }
    return next(url, context);
  },
});
let KartView: any;
try {
  ({ KartView } = await import(source.href));
} finally {
  hooks.deregister();
  delete (globalThis as any).__kartEquipment;
}

test('equipped geometry waits for models, mounts on the kart and follows/bobs without extra art requests', async () => {
  for (const equipment of [
    undefined,
    { decoration: 'none', pet: 'none' },
    { decoration: 'unknown', pet: 'unknown' },
  ]) {
    const view = new KartView(new Node(), '#fb6555', defaultSelection, equipment);
    await view.ready;
    assert.equal(view.pet, undefined);
    assert.ok(!view.body.children.some((node: Node) => node.name.startsWith('Decoration:')));
    assert.equal(view.modelLoaded, true);
  }
  const shapes = new Set<string>();
  for (const [decoration, pet] of [
    ['racing-stripes', 'cloud-cat'],
    ['halo', 'star-bot'],
    ['comet', 'mini-dragon'],
  ]) {
    calls.length = 0;
    let release!: () => void;
    pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const view = new KartView(new Node(), '#fb6555', defaultSelection, { decoration, pet });
    assert.equal(view.modelLoaded, false);
    assert.equal(view.pet, undefined);
    release();
    await view.ready;
    assert.deepEqual(calls, [
      'expansion/vehicles/classic-kart',
      'expansion/drivers/rookie',
      'expansion/manifest',
    ]);
    const mounted = view.body.children.find(
      (node: Node) => node.name === 'Decoration:' + decoration,
    );
    assert.ok(mounted?.parts.length > 0);
    assert.equal(mounted.parent, view.body);
    assert.equal(view.pet.name, 'Pet:' + pet);
    assert.equal(view.pet.parent, view.root);
    shapes.add(JSON.stringify(mounted.parts));
    shapes.add(JSON.stringify(view.pet.parts));
    const kart = {
      ...createKart(12, -5, Math.PI / 2),
      y: 3,
      speed: 20,
      spinAngle: 1,
      drifting: true,
      driftSide: 1,
    };
    view.update(kart, 0.4);
    assert.equal(view.root.position[0], 12);
    assert.equal(view.root.position[2], -5);
    assert.equal(view.root.rotation[1], 90);
    assert.ok(view.pet.position[1] > 2 && view.pet.position[2] < -1.9);
    const pose = [...view.pet.position];
    view.update({ ...kart, x: 30, heading: -Math.PI / 2, airborne: true }, 1.1);
    assert.equal(view.root.position[0], 30);
    assert.equal(view.root.rotation[1], -90);
    assert.notDeepEqual(view.pet.position, pose);
    assert.equal(
      view.pet.parent,
      view.root,
      'pets follow turns/jumps without inheriting body spin',
    );
  }
  assert.equal(shapes.size, 6, 'every item has different procedural geometry');
  const abandoned = new KartView(new Node(), '#fb6555', defaultSelection, {
    decoration: 'halo',
    pet: 'star-bot',
  });
  abandoned.root.destroy();
  await abandoned.ready;
  assert.equal(abandoned.modelLoaded, false);
  assert.equal(abandoned.pet, undefined);
});
