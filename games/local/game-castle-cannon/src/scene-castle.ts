import * as T from 'three';
import type { Battle, Module } from './rules.js';
import { MeshKit } from './scene-mesh.js';
import { modulePosition } from './scene-space.js';

import { stones, stoneWall, masonry } from './scene-masonry.js';
import { innerCastle } from './scene-keep.js';
import { gatehouseDetail } from './scene-gatehouse.js';
import { breachedTowerRing, brokenTowerStump } from './scene-damage.js';

export function castleShell(k: MeshKit) {
  const g = new T.Group();
  // One breached curtain wall. The opening reaches the skyline instead of hiding below a gatehouse.
  stoneWall(k, g, -2.1, 14, 16.8, 10.5, 3.0);
  stoneWall(k, g, 25.85, 14, 18.3, 10.5, 3.0);
  for (const x of [-8.6, 31.8]) gateLookout(k, g, x);
  // Broken ends reveal the complete wall thickness and keep the actual doorway unmistakable.
  for (const [x, side] of [
    [6.3, -1],
    [16.7, 1],
  ]) {
    for (let row = 0; row < 11; row++) {
      const stone = k.box(
        g,
        x! + side! * (0.25 + Math.sin(row * 7) * 0.13),
        0.48 + row * 0.94,
        14.35,
        0.65,
        0.88,
        2.7,
        stones[row % 5]!,
        0.15,
      );
      stone.rotation.z = Math.sin(row * 13) * 0.055;
    }
  }
  // The valley-side curtain is a low, short terrace. It does not seal the canyon.
  for (const [x, length, height, z] of [
    [-10.5, 17, 9.6, 5.5],
    [35, 43, 9.6, -7.5],
  ]) {
    const side = new T.Group();
    k.box(side, 0, height! / 2, 0, length!, height!, 2.6, '#b7a583', 0.08);
    masonry(k, side, -length! / 2 + 4, -1.4, 8, height!, false, true);
    for (let i = 0; i < Math.floor(length! / 1.8); i++)
      k.box(side, -length! / 2 + 0.6 + i * 1.8, height! + 0.6, 0, 1.05, 1.3, 2.8, '#d5c29c', 0.08);
    side.rotation.y = Math.PI / 2;
    side.position.set(x!, 0, z!);
    k.compact(side);
    g.add(side);
  }
  stoneWall(k, g, 29, -40, 31, 7, 2.8);
  const city = new T.Group();
  innerCastle(k, city);
  city.position.set(74, 0, -14);
  g.add(city);
  for (const x of [-7, -3, 1, 22, 25, 28]) {
    const guard = k.person(false);
    guard.position.set(x, 10.6, 14.8);
    guard.rotation.y = Math.PI;
    g.add(guard);
  }
  for (let i = 0; i < 8; i++) {
    const x = 66 + (i % 4) * 10,
      z = -58 - Math.floor(i / 4) * 17,
      h = 13 + ((i * 7) % 12);
    k.box(g, x, h / 2, z, 5, h, 5, '#b7a583', 0);
    for (let j = 0; j < 4; j++)
      k.box(g, x - 2 + j * 1.3, h + 0.45, z + 2, 0.8, 0.9, 0.8, '#d5c29c', 0);
    if (i % 2) roof(k, g, x, h + 1, z, 6, 6);
  }
  for (let i = 0; i < 24; i++) {
    const x = -10 + i * 1.6;
    if (x > 6.3 && x < 16.7) continue;
    k.cylinder(g, x, 1.2, 17, 0, 0.18, 2.4, '#80623e');
  }
  for (let i = 0; i < 12; i++) {
    k.rock(g, 3 + Math.sin(i * 3) * 3, 0.12, 16 + Math.cos(i * 2) * 3, 0.35, stones[i % 5]);
  }
  k.compact(g);
  return g;
}
function roof(k: MeshKit, g: T.Group, x: number, y: number, z: number, w: number, d: number) {
  const geometry = new T.ConeGeometry(1, 2.3, 4);
  const m = k.mesh(g, geometry, '#a06a45', x, y, z);
  m.scale.set(w * 0.72, 1, d * 0.72);
  m.rotation.y = Math.PI / 4;
  // Roof shingles are actual geometry strips along the visible sloping faces.
  for (let i = 0; i < 5; i++) {
    const strip = k.box(
      g,
      x,
      y - 0.85 + i * 0.4,
      z + d * 0.42 * (1 - i / 5),
      w * (1 - i / 5),
      0.08,
      0.12,
      '#bb855a',
      0,
    );
    strip.rotation.x = -0.6;
  }
}
export function moduleModel(k: MeshKit, m: Module, b: Battle) {
  const g = new T.Group(),
    p = modulePosition(m, b);
  if (m.kind === 'tower') {
    const h = p.y;
    const sections: T.Group[] = [];
    for (let i = 0; i < 3; i++) {
      const ring = new T.Group(),
        base = i * 7,
        height = i === 2 ? h - 15.5 : 7;
      if (i < 2) {
        k.box(ring, 0, height / 2, 0, 4.6, height, 4.6, '#b7a583', 0.08);
        masonry(k, ring, 0, 2.3, 4.6, height);
      } else {
        const facing = breachedTowerRing(k, ring, height, h - 18);
        facing.position.y = base;
        g.add(facing);
        g.userData.facing = facing;
      }
      masonry(k, ring, -2.4, 0, 4.6, height, true);
      k.compact(ring);
      ring.position.y = base;
      ring.userData.base = base;
      g.add(ring);
      sections.push(ring);
    }
    g.userData.sections = sections;
    const stump = brokenTowerStump(k);
    g.add(stump);
    g.userData.stump = stump;
    for (const side of [-1, 1]) {
      k.box(g, side * 2.1, h - 0.6, 0, 0.3, 2, 4.8, '#8b663f');
      for (const z of [-2, 2]) k.box(g, side * 2.1, h - 1, z, 0.3, 3, 0.3, '#725034');
    }
    k.box(g, 0, h - 1.7, 0, 5.3, 0.35, 5.3, '#a57b4d');
    if (b.modules.filter((n) => n.kind === 'tower')[0]?.id !== m.id)
      roof(k, g, 0, h + 1.3, 0, 6, 6);
    const guard = k.person(false);
    guard.position.set(0, h - 1.4, 1.6);
    g.add(guard);
    k.flag(g, -1.5, h - 0.2, 0, false, 0.5);
  } else if (m.kind === 'gate') {
    for (let i = 0; i < 10; i++)
      k.box(g, -3.3 + i * 0.73, 3.65, 0, 0.7, 7.3, 0.45, i % 2 ? '#926735' : '#a87843');
    for (const y of [1.2, 4.6, 6.5]) {
      k.box(g, 0, y, 0.32, 7.4, 0.34, 0.22, '#54493a');
      for (let x = -3; x < 3.5; x += 0.75) k.sphere(g, x, y, 0.49, 0.07, '#b3a78a', 0.4);
    }
  } else {
    for (const x of [-2, 0, 2]) k.box(g, x, 0.85, 0, 1.8, 1.7, 1.2, '#9f7446');
  }
  if (m.kind === 'gate') g.scale.set(1.37, 1.56, 1);
  if (m.kind !== 'tower') k.compact(g);
  g.position.set(p.x, 0, p.z);
  return g;
}

function gateLookout(k: MeshKit, g: T.Group, x: number) {
  const tower = new T.Group();
  stoneWall(k, tower, 0, 0, 6.4, 10.5, 5.1);
  masonry(k, tower, -3.3, 0, 5.1, 10.5, true);
  const lookout = new T.Group();
  gatehouseDetail(k, lookout, 'lookout', false);
  lookout.position.y = -2.5;
  lookout.scale.set(1.28, 1, 1.28);
  tower.add(lookout);
  k.banner(tower, -0.1, 9.8, 2.94, 2.8, 6.2, true);
  // Open timber fighting deck: cross-braced below, with archers above the parapet.
  for (let plank = 0; plank < 9; plank++)
    k.box(tower, -3.4 + plank * 0.85, 13.45, 0, 0.81, 0.28, 6.4, '#b17d43', 0.06);
  for (const side of [-1, 1]) {
    k.box(tower, 0, 14.25, side * 3.0, 7.6, 0.3, 0.28, '#946835', 0.07);
    for (const post of [-3.4, 0, 3.4])
      k.box(tower, post, 14.0, side * 3.0, 0.25, 1.1, 0.3, '#725034', 0.06);
  }
  for (const x of [-1.8, 1.6]) {
    const guard = k.person(false, 'aim');
    guard.position.set(x, 13.64, 1.9);
    tower.add(guard);
  }
  k.compact(tower);
  const post = new T.Group();
  post.add(tower);
  post.position.set(x, 0, 15.5);
  g.add(post);
}
