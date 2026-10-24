import * as T from 'three';
import { createHash } from 'node:crypto';
import { MeshKit } from '../src/scene-mesh.js';
import { duelWorld } from '../src/duel-world.js';
import { createDuel } from '../src/duel-simulation.js';

export function bakeWorld() {
  const kit = new MeshKit(),
    scene = new T.Scene();
  const texture = (path: string) => {
    const t = new T.Texture();
    t.name = path;
    return t;
  };
  kit.applyTextures(
    texture('castle-cannon-art/limestone.jpg'),
    texture('castle-cannon-art/oak.jpg'),
  );
  const world = duelWorld(kit, scene, createDuel());
  for (const [id, cell] of world.cells)
    for (const [part, node] of Object.entries(cell)) node.name = `structure:${id}:${part}`;
  for (const gun of world.guns) {
    gun.base.name = `gun:${gun.side}:${gun.id}:base`;
    gun.barrel.name = `gun:${gun.side}:${gun.id}:barrel`;
  }
  world.people.forEach((person, side) => {
    for (const [part, node] of Object.entries(person)) node.name = `person:${side}:${part}`;
  });
  const maps = new Map<string, T.Texture>();
  for (const entry of kit.pbrMaps.values())
    for (const path of Object.values(entry)) maps.set(path, texture(path));
  kit.applyPbrTextures(maps);
  const geometries: Record<string, unknown> = {},
    materials: Record<string, unknown> = {};
  const geometryIds = new Map<T.BufferGeometry, string>(),
    materialIds = new Map<T.Material, string>();
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  function geometry(g: T.BufferGeometry, lines: boolean) {
    if (geometryIds.has(g)) return geometryIds.get(g)!;
    if (!lines && !g.getAttribute('normal')) g.computeVertexNormals();
    if (!lines && g.getAttribute('uv')) {
      if (!g.index)
        g.setIndex(Array.from({ length: g.getAttribute('position').count }, (_, i) => i));
      g.computeTangents();
    }
    const attributes: Record<string, number[]> = {};
    for (const [source, dest] of Object.entries({
      position: 'positions',
      normal: 'normals',
      uv: 'uvs',
      color: 'colors',
      tangent: 'tangents',
    })) {
      const a = g.getAttribute(source);
      if (!a) continue;
      const values: number[] = [];
      for (let i = 0; i < a.count; i++) {
        if (source === 'color') {
          const c = new T.Color(a.getX(i), a.getY(i), a.getZ(i)).convertLinearToSRGB();
          values.push(round(c.r), round(c.g), round(c.b), a.itemSize === 4 ? round(a.getW(i)) : 1);
        } else {
          values.push(round(a.getX(i)), round(a.getY(i)));
          if (a.itemSize > 2) values.push(round(a.getZ(i)));
          if (a.itemSize > 3) values.push(round(a.getW(i)));
        }
      }
      attributes[dest] = values;
    }
    const data = { ...attributes, indices: g.index ? Array.from(g.index.array) : undefined, lines };
    const id = createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 20);
    geometries[id] = data;
    geometryIds.set(g, id);
    return id;
  }
  function material(m: T.MeshStandardMaterial) {
    if (materialIds.has(m)) return materialIds.get(m)!;
    const key =
      [...kit.materials].find(([, v]) => v === m)?.[0] ??
      `material:${Object.keys(materials).length}`;
    materials[key] = {
      color: '#' + m.color.getHexString(),
      opacity: m.opacity,
      transparent: m.transparent,
      side: m.side,
      roughness: m.roughness ?? 1,
      metallic: m.metalness ?? 0,
      vertexColors: m.vertexColors,
      maps: kit.pbrMaps.get(key),
      map: m.map?.name || '',
      tint: m.userData.tunicTint?.toArray(),
    };
    materialIds.set(m, key);
    return key;
  }
  function node(n: T.Object3D): unknown {
    const mesh = n as T.Mesh;
    if (Array.isArray(mesh.material)) throw Error('Unexpected multi-material mesh after compact');
    return {
      name: n.name,
      position: n.position.toArray(),
      rotation: n.quaternion.toArray(),
      scale: n.scale.toArray(),
      visible: n.visible,
      geometry: mesh.geometry ? geometry(mesh.geometry, n instanceof T.LineSegments) : undefined,
      material: mesh.material ? material(mesh.material as T.MeshStandardMaterial) : undefined,
      children: n.children.map(node),
    };
  }
  const tree = node(scene);
  const result = { version: 1, tree, geometries, materials };
  kit.dispose();
  return result;
}
