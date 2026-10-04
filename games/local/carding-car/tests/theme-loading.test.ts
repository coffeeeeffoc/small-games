import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { createTrack } from '../assets/scripts/TrackGenerator.ts';
import type { ThemeDefinition } from '../assets/scripts/ThemeDefinition.ts';

// Exercise the production loader with a held road response, without a GPU dependency.
class Node {
  static EventType = { NODE_DESTROYED: 'destroyed' };
  valid = true;
  children: Node[] = [];
  name: string;
  constructor(name = '') { this.name = name; }
  addChild(child: Node) { this.children.push(child); }
  addComponent(Type: new () => any) { return new Type(); }
  once() {}
  setPosition() {}
  setScale() {}
  setRotationFromEuler() {}
}
class Color { static WHITE = {}; }
class Material { initialize() {} setProperty() {} }
class MeshRenderer { setMaterial() {} }
class Texture2D { static WrapMode = { REPEAT: 0 }; setWrapMode() {} }
const calls: string[] = [];
const held = new Map<string, Promise<unknown>>();
const cc = { Color, Material, MeshRenderer, Node, Texture2D, Prefab: class {}, JsonAsset: class {},
  isValid: (node: Node) => node.valid, utils: { createMesh: () => ({ destroy() {} }) } };
const art = {
  async loadArt(path: string) {
    calls.push(path);
    if (held.has(path)) return held.get(path);
    if (path.endsWith('manifest')) return { json: { models: [
      { file: 'props/highland-lodge.glb', bounds: [[-1, 0, -1], [1, 2, 1]] },
      { file: 'props/unused.glb', bounds: [[-1, 0, -1], [1, 2, 1]] },
      { file: 'palm.glb', bounds: [[-1, 0, -1], [1, 2, 1]] },
    ] } };
    return new Texture2D();
  },
  MeshBatch: class { box() {} add() {} ball() {} build() {} },
  placeModel(_prefab: unknown, parent: Node, name: string) {
    const node = new Node(name); parent.addChild(node); return node;
  },
};
(globalThis as any).__kartThemeLoader = { cc, art };
const sourceURL = new URL('../assets/scripts/ThemeView.ts', import.meta.url);
const hooks = registerHooks({
  resolve(id, context, next) {
    if (context.parentURL === sourceURL.href) {
      if (['cc', './SceneArt', './Track', './GlacierSample'].includes(id))
        return { url: 'kart-theme:' + id, shortCircuit: true };
      if (id.startsWith('./')) return next(new URL(id + '.ts', sourceURL).href, context);
    }
    return next(id, context);
  },
  load(url, context, next) {
    const mocked = {
      'kart-theme:cc': `export const { ${Object.keys(cc).join(',')} } = globalThis.__kartThemeLoader.cc;`,
      'kart-theme:./SceneArt': 'export const { loadArt, MeshBatch, placeModel } = globalThis.__kartThemeLoader.art;',
      'kart-theme:./Track': 'export const buildTrack = async () => {}; export const ribbon = () => ({});',
      'kart-theme:./GlacierSample': 'export const buildGlacier = async () => {};',
    }[url];
    if (mocked) return { format: 'module', shortCircuit: true, source: mocked };
    const result = next(url, context);
    if (url === sourceURL.href) return { ...result, format: 'module', source:
      stripTypeScriptTypes(result.source!.toString(), { mode: 'transform' }) };
    return result;
  },
});
let buildTheme: (parent: Node, track: ReturnType<typeof createTrack>, theme: ThemeDefinition) => Promise<void>;
try { ({ buildTheme } = await import(sourceURL.href)); }
finally { hooks.deregister(); delete (globalThis as any).__kartThemeLoader; }
const track = createTrack();
const theme: ThemeDefinition = { id: 'test', name: 'test', tagline: '',
  colors: { ground: '#000', road: '#000', shoulder: '#000', rail: '#000', accent: '#000', sky: '#000' },
  roadTexture: 'selected/road', shoulderTexture: 'selected/terrain', scenery: () => ({}) };
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

test('a procedural theme requests only its own surfaces and never loads unused model catalogs', async () => {
  calls.length = 0;
  await buildTheme(new Node(), track, { ...theme, shoulderTexture: false });
  assert.deepEqual(calls, ['selected/road']);
});

test('selected road, shoulder and safe models load concurrently without unrelated catalog or prefab requests', async () => {
  calls.length = 0;
  let release!: (texture: Texture2D) => void;
  held.set('selected/road', new Promise((resolve) => { release = resolve; }));
  const parent = new Node();
  const loading = buildTheme(parent, track, { ...theme, scenery: () => ({ models: [
    { asset: 'expansion/props/highland-lodge', x: 10000, y: 0, z: 10000, scale: 1 },
    // This second copy intersects the road and must not produce another model or request.
    { asset: 'expansion/props/highland-lodge', x: track.main[0].x, y: track.main[0].y, z: track.main[0].z, scale: 1 },
  ] }) });
  try {
    await flush();
    assert.deepEqual(calls, ['selected/road', 'selected/terrain', 'expansion/manifest', 'expansion/props/highland-lodge']);
    assert.equal(parent.children.filter((child) => child.name === 'expansion/props/highland-lodge').length, 1);
  } finally { release(new Texture2D()); held.clear(); await loading; }
});

test('seaside-only scenery skips the expansion catalog and abandoned scenes stop before loading models', async () => {
  calls.length = 0;
  let release!: (value: unknown) => void;
  held.set('manifest', new Promise((resolve) => { release = resolve; }));
  const parent = new Node();
  const loading = buildTheme(parent, track, { ...theme, shoulderTexture: false, scenery: () => ({ models: [
    { asset: 'palm/palm', x: 10000, y: 0, z: 10000, scale: 1 },
  ] }) });
  parent.valid = false;
  release({ json: { models: [{ file: 'palm.glb', bounds: [[-1, 0, -1], [1, 2, 1]] }] } });
  try {
    await loading;
    assert.deepEqual(calls, ['selected/road', 'manifest']);
    assert.equal(parent.children.length, 0);
  } finally { held.clear(); }
});
