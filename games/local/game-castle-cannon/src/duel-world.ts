import * as T from 'three';
import { MeshKit } from './scene-mesh.js';
import { cannonModel } from './scene-cannon.js';
import { sculpture } from './scene-sculpture.js';
import { gatehouseDetail } from './scene-gatehouse.js';
import { DUEL_MAP, nodePoint, duelGroundHeight } from './duel-map.js';
import { distantMassif } from './scene-massif.js';
import { masonry } from './scene-masonry.js';
import { landNoise } from './scene-valley.js';
import { direction, type Duel, type Structure } from './duel-types.js';
import bunkerModel from './models/bunker-rodin.json';
export function duelWorld(k: MeshKit, scene: T.Scene, duel: Duel) {
  const ground = new T.Group();
  const geometry = new T.PlaneGeometry(500, 340, 110, 80);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position'),
    colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      z = positions.getZ(i);
    positions.setY(i, duelGroundHeight(x, z) - 0.06);
    new T.Color('#718653')
      .lerp(new T.Color('#b4a783'), landNoise(x * 0.11, z * 0.11) * 0.55)
      .toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  k.geometries.set('duel-ground', geometry);
  const land = k.mesh(ground, geometry, '#ffffff', 0, 0, 0);
  land.material = k.material('#ffffff').clone();
  (land.material as T.MeshStandardMaterial).vertexColors = true;
  k.materials.set('duel-ground', land.material as T.MeshStandardMaterial);
  for (const side of [-1, 1]) {
    const peaks = new T.Group();
    distantMassif(k, peaks);
    peaks.rotation.y = (side * Math.PI) / 2;
    ground.add(peaks);
  }
  k.box(ground, 0, -3.7, 0, 5, 0.04, 180, '#6e929b', 0);
  for (let i = 0; i < 55; i++) {
    const x = -170 + ((i * 47) % 340),
      z = -100 + ((i * 31) % 185);
    if (Math.abs(x) < 90 && Math.abs(z) < 24) continue;
    const y = duelGroundHeight(x, z);
    if (i % 4) k.tree(ground, x, y, z, 1 + (i % 3) * 0.3);
    else k.rock(ground, x, y, z, 1.5 + (i % 3));
  }
  for (const side of [0, 1] as const) {
    const d = direction(side);
    for (const [a, b] of DUEL_MAP.edges) {
      const from = nodePoint(side, a),
        to = nodePoint(side, b);
      if (Math.abs(from.y - to.y) > 0.1) continue;
      const plank = k.box(
        ground,
        (from.x + to.x) / 2,
        from.y + 0.03,
        (from.z + to.z) / 2,
        Math.hypot(from.x - to.x, from.z - to.z),
        0.08,
        1.2,
        '#9a8a6b',
        0,
      );
      plank.rotation.y = -Math.atan2(to.z - from.z, to.x - from.x);
    }
    // A supported wall platform and a visible stair/ladder route remain as foundations after collapse.
    k.box(ground, -59 * d, 7.7, 15 * d, 6, 0.5, 14, '#8d6236', 0);
    for (const z of [18.7, 21.3]) {
      k.box(ground, -58 * d, 4, z * d, 0.15, 8, 0.15, '#80623e', 0);
    }
    for (let step = 0; step < 16; step++)
      k.box(ground, -58 * d, step * 0.5 + 0.1, 20 * d, 0.18, 0.16, 2.6, '#80623e', 0);
    for (const z of [10, 20]) k.box(ground, -58 * d, 4, z * d, 0.5, 8, 0.5, '#80623e', 0);
    const entry = new T.Group();
    sculpture(k, bunkerModel, { base: entry });
    k.compact(entry);
    entry.position.set(-68 * d, 0, 0);
    entry.rotation.y = (Math.PI / 2) * d;
    scene.add(entry);
    const trench = new T.Group();
    k.box(trench, -51.5 * d, 0.3, 6 * d, 1, 0.65, 9, '#70583b', 0);
    for (let i = 0; i < 9; i++)
      k.box(trench, -51.5 * d, 0.7, (2 + i) * d, 0.9, 0.45, 0.9, '#a07944', 0.1);
    k.flag(ground, -78 * d, 0, 7 * d, side === 0, 1.1);
    k.compact(trench);
    scene.add(trench);
  }
  k.compact(ground);
  scene.add(ground);
  const cells = new Map<string, { intact: T.Group; debris: T.Group; cracks: T.LineSegments }>();
  for (const cell of duel.structures) cells.set(cell.id, structure(k, scene, cell));
  const guns = duel.fighters.flatMap((p) =>
    p.guns.map((g) => {
      const cannon = cannonModel(k);
      cannon.base.scale.setScalar(0.66);
      cannon.base.position.set(g.position.x, g.position.y, g.position.z);
      scene.add(cannon.base);
      const box = new T.Group();
      k.box(
        box,
        g.position.x - direction(p.side) * 2,
        g.position.y + 0.5,
        g.position.z + direction(p.side) * 3,
        1.3,
        1,
        1.1,
        '#8d6236',
        0.1,
      );
      k.compact(box);
      scene.add(box);
      return { ...cannon, side: p.side, id: g.id };
    }),
  );
  const people = duel.fighters.map((p) => {
    const march = k.person(p.side === 0, 'march'),
      load = k.person(p.side === 0, 'load');
    const group = new T.Group();
    group.add(march, load);
    scene.add(group);
    return { group, march, load };
  });
  return { cells, guns, people };
}
function structure(k: MeshKit, scene: T.Scene, s: Structure) {
  const intact = new T.Group(),
    debris = new T.Group();
  k.box(intact, 0, 0, 0, s.size.x, s.size.y, s.size.z, '#cbb78e', 0.12);
  const facing = new T.Group();
  masonry(k, facing, 0, s.size.x / 2, s.size.z, s.size.y);
  facing.rotation.y = (Math.PI / 2) * direction(s.side);
  facing.position.y = -s.size.y / 2;
  intact.add(facing);
  const sideFace = new T.Group();
  masonry(k, sideFace, 0, s.size.z / 2, s.size.x, s.size.y);
  sideFace.position.y = -s.size.y / 2;
  intact.add(sideFace);
  if (s.position.y >= 6)
    for (let col = 0; col < 3; col++)
      k.box(
        intact,
        0,
        s.size.y / 2 + 0.4,
        -s.size.z / 2 + ((col + 0.5) * s.size.z) / 3,
        s.size.x + 0.2,
        0.8,
        s.size.z / 5,
        '#bda984',
        0.08,
      );
  if (s.kind === 'gate') {
    const gallery = new T.Group();
    gatehouseDetail(k, gallery);
    gallery.scale.setScalar(0.4);
    gallery.rotation.y = (Math.PI / 2) * direction(s.side);
    gallery.position.y = s.size.y / 2;
    intact.add(gallery);
  }
  k.compact(intact);
  intact.position.set(s.position.x, s.position.y, s.position.z);
  scene.add(intact);
  for (let i = 0; i < 5; i++) {
    const rock = k.rock(
      debris,
      Math.sin(i * 7 + s.position.z) * 2,
      0.25 + (i % 2) * 0.25,
      Math.cos(i * 9) * 2,
      0.7 + (i % 3) * 0.25,
      '#bda984',
    );
    rock.rotation.set(i, i * 2, i * 0.7);
  }
  k.compact(debris);
  debris.position.set(s.position.x, 0, s.position.z);
  debris.visible = false;
  scene.add(debris);
  const x = direction(s.side) * (s.size.x / 2 + 0.12);
  const cracks = new T.LineSegments(
    new T.BufferGeometry().setFromPoints([
      new T.Vector3(x, 1.3, -1),
      new T.Vector3(x, 0.4, 0.1),
      new T.Vector3(x, 0.4, 0.1),
      new T.Vector3(x, -1.8, 0.6),
      new T.Vector3(x, 0.4, 0.1),
      new T.Vector3(x, -0.6, -1.4),
    ]),
    new T.LineBasicMaterial({ color: '#483c31' }),
  );
  cracks.position.copy(intact.position);
  scene.add(cracks);
  cracks.visible = false;
  return { intact, debris, cracks };
}
