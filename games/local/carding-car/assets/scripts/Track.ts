import { Node, primitives } from 'cc';
import { MeshBatch, palette as P } from './SceneArt';
import { pointAt, projectOnTrack, type TrackData, type TrackPoint } from './TrackGenerator';

function ribbon(points: TrackPoint[], left: number, right: number, lift: number) {
  const positions: number[] = [],
    normals: number[] = [],
    indices: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)],
      p = points[i];
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    for (const width of [left, right]) {
      positions.push(p.x + Math.cos(heading) * width, p.y + lift, p.z - Math.sin(heading) * width);
      normals.push(0, 1, 0);
    }
    if (i) {
      const n = i * 2;
      indices.push(n - 2, n, n - 1, n - 1, n, n + 1);
    }
  }
  return { positions, normals, indices };
}

export function buildTrack(parent: Node, track: TrackData) {
  const b = new MeshBatch();
  b.box(P.sea, 0, -2.2, 0, 2400, 1, 2400);
  b.add(P.sand, primitives.cylinder(213, 218, 1.5, { radialSegments: 64 }), 0, -1.4, 0);
  b.add(P.grass, primitives.cylinder(201, 208, 0.6, { radialSegments: 64 }), 0, -0.9, 0);
  for (const [points, width] of [
    [track.main, track.width],
    [track.shortcut, track.shortcutWidth],
  ] as const) {
    b.add(P.sand, ribbon(points, -width / 2 - 1.6, width / 2 + 1.6, -0.04));
    b.add(P.road, ribbon(points, -width / 2, width / 2, 0));
    for (const side of [-1, 1]) {
      b.add(P.white, ribbon(points, (side * width) / 2 - 0.14, (side * width) / 2 + 0.14, 0.025));
    }
  }
  track.barriers.forEach((wall, i) =>
    b.box(
      i % 4 < 2 ? P.white : P.red,
      wall.x,
      wall.y + 0.375,
      wall.z,
      wall.halfWidth * 2,
      0.75,
      wall.halfLength * 2,
      wall.heading,
    ),
  );
  // Checkered finish line and a toy gantry, clearly visible from the starting grid.
  const start = pointAt(track, 0),
    h = start.heading;
  for (let x = -6; x < 7; x++)
    for (let z = 0; z < 2; z++)
      b.box(
        (x + z) % 2 ? P.white : P.navy,
        start.x + Math.cos(h) * x + Math.sin(h) * z,
        0.045,
        start.z - Math.sin(h) * x + Math.cos(h) * z,
        1,
        0.05,
        1,
        h,
      );
  for (const side of [-1, 1])
    b.box(
      P.yellow,
      start.x + Math.cos(h) * side * 9,
      3.5,
      start.z - Math.sin(h) * side * 9,
      0.7,
      7,
      0.7,
    );
  b.box(P.navy, start.x, 7, start.z, 20, 1.3, 0.65, h);
  for (let i = -4; i <= 4; i++)
    b.box(
      i % 2 ? P.white : P.mint,
      start.x + Math.cos(h) * i * 1.6,
      7.1,
      start.z - Math.sin(h) * i * 1.6,
      1.25,
      0.65,
      0.75,
      h,
    );
  // Deterministic, batched props keep the mobile draw-call budget predictable.
  for (let i = 0; i < 82; i++) {
    const angle = i * 2.399963,
      r = 45 + ((i * 37) % 144),
      x = Math.cos(angle) * r,
      z = Math.sin(angle) * r;
    if (projectOnTrack(track, x, z).distance < 17) continue;
    const height = 3 + (i % 4);
    b.box('#a17f5d', x, height / 2 - 0.6, z, 0.8, height, 0.8);
    b.ball(i % 3 ? '#56b893' : '#aad98a', x, height, z, 5.5, 5.5, 5.5);
    if (i % 3 === 0) b.ball('#b1c2c3', x + 4, 0.3, z + 3, 3, 2, 2.5);
  }
  for (let i = 0; i < 14; i++) {
    const p = pointAt(track, (i * track.length) / 14 + 60),
      side = i % 2 ? 1 : -1;
    const x = p.x + Math.cos(p.heading) * side * 12,
      z = p.z - Math.sin(p.heading) * side * 12;
    b.box(P.navy, x, 3, z, 0.22, 6, 0.22);
    b.ball(P.yellow, x, 6, z, 1.1, 0.55, 1.1);
    b.box(i % 2 ? P.mint : P.yellow, x, 3.8, z, 3.2, 1.4, 0.25, p.heading);
    b.box(P.white, x, 3.8, z, 1.4, 0.25, 0.31, p.heading + 0.5);
  }
  // Grandstand at the long straight.
  for (let row = 0; row < 4; row++) {
    b.box(P.white, 42, 0.8 + row * 0.65, -165 - row * 2, 35, 0.5, 1.7);
    for (let seat = 0; seat < 12; seat++)
      b.ball(
        [P.red, P.yellow, P.blue][seat % 3],
        26 + seat * 2.8,
        1.5 + row * 0.65,
        -165 - row * 2,
        0.65,
      );
  }
  for (let i = 0; i < 5; i++)
    b.ball('#6abda8', -280 + i * 130, -0.7, 290 + (i % 2) * 80, 80, 40 + i * 8, 65);
  return b.build(parent, 'Track');
}
