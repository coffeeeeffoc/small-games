import type { ThemeDefinition, ThemeScenery } from '../ThemeDefinition.ts';
import { pointAt, type TrackData } from '../TrackGenerator.ts';
import { besideRoad, clearOfRoad, sceneryFits } from '../ThemeScenery.ts';

type Point = [number, number, number];
type Anchor = { x: number; y: number; z: number; heading: number };

function createScenery(track: TrackData): ThemeScenery {
  const shapes: NonNullable<ThemeScenery['shapes']> = [];
  const meshes: NonNullable<ThemeScenery['meshes']> = [];
  const cream = '#f2dfbf',
    glass = '#65b2cc',
    stone = '#d4bf9f';
  const awnings = ['#ed7957', '#edba45', '#4b9bad'];
  const count = Math.min(44, Math.max(24, Math.floor(track.length / 34)));

  function position(p: Anchor, x: number, y: number, z: number): Point {
    return [
      p.x + x * Math.cos(p.heading) + z * Math.sin(p.heading),
      p.y + y,
      p.z - x * Math.sin(p.heading) + z * Math.cos(p.heading),
    ];
  }
  function box(
    p: Anchor,
    color: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) {
    const [px, py, pz] = position(p, x, y, z);
    shapes.push({ kind: 'box', color, x: px, y: py, z: pz, sx, sy, sz, yaw: p.heading });
  }
  function ball(
    p: Anchor,
    color: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) {
    const [px, py, pz] = position(p, x, y, z);
    shapes.push({ kind: 'ball', color, x: px, y: py, z: pz, sx, sy, sz });
  }
  // Small authored polygons share the same colour batches as the existing roadside shapes.
  function polygon(p: Anchor, color: string, vertices: Point[]) {
    let batch = meshes.find((mesh) => mesh.color === color);
    if (!batch) {
      batch = { color, geometry: { positions: [], normals: [], indices: [] } };
      meshes.push(batch);
    }
    const geometry = batch.geometry;
    const points = vertices.map((v) => position(p, ...v));
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[0],
        b = points[i],
        c = points[i + 1];
      const u = b.map((v, k) => v - a[k]),
        v = c.map((n, k) => n - a[k]);
      const normal = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      const length = Math.hypot(...normal),
        offset = geometry.positions.length / 3;
      for (const point of [a, b, c]) {
        geometry.positions.push(...point);
        geometry.normals.push(...normal.map((n) => n / length));
      }
      geometry.indices.push(offset, offset + 1, offset + 2);
    }
  }
  function roundTower(p: Anchor, color: string, y: number, height: number, rx: number, rz: number) {
    const ring = (i: number, h: number): Point => [
      Math.cos((i * Math.PI) / 8) * rx,
      h,
      Math.sin((i * Math.PI) / 8) * rz,
    ];
    for (let i = 0; i < 16; i++) {
      polygon(p, color, [ring(i, y), ring(i, y + height), ring(i + 1, y + height), ring(i + 1, y)]);
      polygon(p, color, [[0, y + height, 0], ring(i + 1, y + height), ring(i, y + height)]);
      polygon(p, color, [[0, y, 0], ring(i, y), ring(i + 1, y)]);
    }
  }
  function tree(p: Anchor) {
    // Raised streets use grounded planter piers rather than floating tree pots.
    box(p, stone, 0, (0.8 - p.y) / 2, 0, 3.1, p.y + 1, 3.1);
    box(p, '#846748', 0, 2.5, 0, 0.65, 4.2, 0.65);
    ball(p, '#559453', 0, 5, 0, 4.2, 4.2, 4.2);
    ball(p, '#77ad55', -0.8, 6, 0.7, 3.8, 3.7, 3.5);
    ball(p, '#97bd5b', 0.7, 6.4, -0.7, 3.2, 3, 3.2);
  }

  // Each complete shop is checked before adding windows, awnings and balcony planters.
  for (let i = 0; i < count; i++) {
    const distance = ((i + 0.25) * track.length) / count;
    for (const side of [-1, 1]) {
      const shop = besideRoad(track, distance, side * (track.width / 2 + 16));
      if (clearOfRoad(track, shop.x, shop.z, 11.3)) {
        const h = 9.5 + (i % 3) * 2.5,
          front = -side * 4.1;
        box(shop, '#dfd3be', -side * 0.4, 0.12, 0, 10, 0.4, 19);
        // Facades reach the ground even when the chosen route climbs above it.
        box(shop, i % 2 ? cream : '#e6cda7', 0, (h - shop.y) / 2, 0, 8, h + shop.y + 0.2, 17);
        box(shop, stone, 0, h - 0.5, 0, 8.6, 0.6, 17.6);
        box(shop, cream, 0, h + 0.2, 0, 8.8, 0.55, 17.8);
        for (const z of [-5.7, 0, 5.7]) {
          box(shop, '#386b79', front, 1.95, z, 0.18, 3.3, 4.8);
          box(shop, '#bbdbdd', front - side * 0.11, 2.15, z - 1.25, 0.08, 2.8, 0.14);
          box(shop, '#f6e5c9', front - side * 0.12, 0.35, z, 0.15, 0.5, 4.9);
          for (let floor = 6; floor < h - 1; floor += 3) {
            box(shop, '#73aaba', front, floor, z, 0.15, 1.9, 3.5);
            box(shop, cream, front - side * 0.13, floor, z, 0.2, 2.2, 0.18);
          }
        }
        // Twelve canvas strips slope toward the street instead of a flat sign bar.
        for (let stripe = 0; stripe < 12; stripe++) {
          const z = -8.1 + stripe * 1.35,
            color = stripe % 2 ? '#fff1d7' : awnings[i % 3];
          const points: Point[] = [
            [front, 4.35, z],
            [front, 4.35, z + 1.35],
            [front - side * 2.2, 3.65, z + 1.35],
            [front - side * 2.2, 3.65, z],
          ];
          polygon(shop, color, side > 0 ? points.reverse() : points);
          box(shop, color, front - side * 2.2, 3.45, z + 0.675, 0.08, 0.42, 1.35);
        }
        for (const z of [-6.5, 6.5]) {
          box(shop, stone, front - side * 0.45, h - 0.05, z, 1.1, 0.8, 2.5);
          ball(shop, '#6d9e50', front - side * 0.45, h + 0.45, z, 1.4, 1.2, 2.9);
        }
      }

      // The outer row supplies a skyline, with alternating glass cylinders and stepped towers.
      const tower = besideRoad(track, distance + 9, side * (track.width / 2 + 42));
      if (clearOfRoad(track, tower.x, tower.z, 10.5)) {
        const h = 23 + ((i * 7 + side + 1) % 5) * 6;
        if (i % 3 === 0) {
          roundTower(tower, glass, -tower.y, h + tower.y, 7.2, 6);
          for (let y = 3; y <= h; y += 4) roundTower(tower, cream, y, 0.45, 7.5, 6.3);
          roundTower(tower, '#d4e0d3', h, 1, 7.5, 6.3);
        } else {
          box(tower, cream, 0, (h - tower.y) / 2, 0, 13, h + tower.y, 12);
          box(tower, glass, 0, h / 2, 6.05, 10, h - 3, 0.16);
          box(tower, glass, 0, h / 2, -6.05, 10, h - 3, 0.16);
          box(tower, glass, 6.55, h / 2, 0, 0.16, h - 3, 9.3);
          box(tower, glass, -6.55, h / 2, 0, 0.16, h - 3, 9.3);
          for (let y = 4; y < h; y += 4) box(tower, '#d8e7de', 0, y, 0, 13.3, 0.35, 12.3);
          box(tower, '#d4c8b4', 0, h + 1.2, 0, 9, 2.4, 8);
          box(tower, cream, 0, h + 2.6, 0, 9.5, 0.4, 8.5);
        }
      }
    }
  }

  // Smaller street furniture has its own footprint so tight bends remain populated and clear.
  for (let i = 0; i < count * 2; i++) {
    const distance = (i * track.length) / (count * 2);
    for (const side of [-1, 1]) {
      const p = besideRoad(track, distance, side * (track.width / 2 + 5.8));
      if (clearOfRoad(track, p.x, p.z, 3.7)) {
        tree(p);
        const bench = position(p, 0, 0, 3.5);
        if (clearOfRoad(track, bench[0], bench[2], 1.3)) {
          box(p, '#be9d71', 0, 0.8, 3.5, 1.1, 0.22, 2.2);
          box(p, '#586a69', 0, (0.625 - p.y) / 2, 3.5, 0.45, p.y + 0.825, 1.8);
        }
      }
      const lamp = besideRoad(track, distance + 7, side * (track.width / 2 + 3.6));
      if (clearOfRoad(track, lamp.x, lamp.z, 1.2)) {
        box(lamp, '#57686a', 0, (6.9 - lamp.y) / 2, 0, 0.18, lamp.y + 7.1, 0.18);
        box(lamp, '#57686a', -side * 0.5, 7, 0, 1.2, 0.18, 0.18);
        ball(lamp, '#ffdfa0', -side * 0.9, 6.85, 0, 0.9, 0.2, 0.7);
      }
    }
  }

  // Decorative green viaducts cross above the race; all supports stay outside every road branch.
  for (const fraction of [0.15, 0.6]) {
    const p = pointAt(track, track.length * fraction),
      span = track.width / 2 + 11;
    const supports = [-1, 1].map((side) => besideRoad(track, track.length * fraction, side * span));
    if (supports.some((s) => !clearOfRoad(track, s.x, s.z, 3.8))) continue;
    const radius = Math.hypot(span + 3, 4);
    let deck = p.y + 12;
    const ceiling = Math.max(...track.main.map((s) => s.y), ...track.shortcut.map((s) => s.y)) + 16;
    while (!sceneryFits(track, p.x, deck, p.z, radius, 2) && deck < ceiling) deck += 2;
    const bridge = { ...p, y: deck };
    box(bridge, '#c3b9a4', 0, -0.9, 0, span * 2 + 6, 1.8, 7);
    box(bridge, '#a9af9c', 0, 0.12, 0, span * 2 + 6, 0.25, 6.7);
    for (const side of [-1, 1]) {
      const support = supports[(side + 1) / 2];
      box({ ...support, y: 0 }, stone, 0, (deck - 1) / 2, 0, 3.8, deck - 1, 3.8);
      box(bridge, cream, 0, 0.65, side * 3.25, span * 2 + 6, 1.3, 0.55);
      box(bridge, '#df8866', 0, 1.4, side * 3.25, span * 2 + 6, 0.22, 0.62);
      for (let x = -span; x <= span; x += 5)
        ball(bridge, '#7aab55', x, 1.15, side * 3, 4.4, 1.3, 1.1);
    }
  }
  return { shapes, meshes };
}

export const theme: ThemeDefinition = {
  id: 'city',
  name: '城市',
  tagline: '彩篷商街与蓝玻璃楼群 · 穿过绿化高架',
  roadTexture: 'expansion/textures/city/texture',
  shoulderTexture: false,
  colors: {
    ground: '#c6c9ad',
    road: '#74736e',
    shoulder: '#d7cbb7',
    rail: '#fff0d4',
    accent: '#e97957',
    sky: '#99d4ea',
  },
  scenery: createScenery,
};
