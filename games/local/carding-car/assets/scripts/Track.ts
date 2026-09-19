import {
  Color,
  isValid,
  JsonAsset,
  Material,
  MeshRenderer,
  Node,
  Prefab,
  primitives,
  Texture2D,
  utils,
} from 'cc';
import { groundShadow, loadArt, MeshBatch, palette as P, placeModel } from './SceneArt';
import { pointAt, projectOnTrack, type TrackData, type TrackPoint } from './TrackGenerator';

export function ribbon(points: TrackPoint[], left: number, right: number, lift: number) {
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const closed =
    points[0].x === points[points.length - 1].x && points[0].z === points[points.length - 1].z;
  for (let i = 0; i < points.length; i++) {
    const a = points[i === 0 && closed ? points.length - 2 : Math.max(0, i - 1)],
      b = points[i === points.length - 1 && closed ? 1 : Math.min(points.length - 1, i + 1)],
      p = points[i];
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    for (const width of [left, right]) {
      positions.push(p.x + Math.cos(heading) * width, p.y + lift, p.z - Math.sin(heading) * width);
      uvs.push((p.x + Math.cos(heading) * width) / 2, (p.z - Math.sin(heading) * width) / 2);
      normals.push(0, 1, 0);
    }
    if (i) {
      const n = i * 2;
      indices.push(n - 2, n, n - 1, n - 1, n, n + 1);
    }
  }
  return { positions, normals, uvs, indices };
}

export async function buildTrack(parent: Node, track: TrackData) {
  const root = new Node('Track');
  parent.addChild(root);
  const b = new MeshBatch();
  const lighthouseX = 240,
    lighthouseZ = -200;
  const roadMaterial = new Material();
  root.once(Node.EventType.NODE_DESTROYED, () => roadMaterial.destroy());
  roadMaterial.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } });
  roadMaterial.setProperty('mainColor', new Color().fromHEX(P.road));
  b.box(P.sea, 0, -2.2, 0, 2400, 1, 2400);
  b.add(P.sand, primitives.cylinder(213, 218, 1.5, { radialSegments: 64 }), 0, -1.4, 0);
  b.add(P.grass, primitives.cylinder(201, 208, 0.6, { radialSegments: 64 }), 0, -0.9, 0);
  for (const [points, width] of [
    [track.main, track.width],
    [track.shortcut, track.shortcutWidth],
  ] as const) {
    if (points.length < 2) continue;
    b.add(P.sand, ribbon(points, -width / 2 - 1.6, width / 2 + 1.6, -0.04));
    const road = new Node('Asphalt');
    root.addChild(road);
    const renderer = road.addComponent(MeshRenderer);
    const mesh = utils.createMesh(ribbon(points, -width / 2, width / 2, 0));
    renderer.mesh = mesh;
    road.once(Node.EventType.NODE_DESTROYED, () => mesh.destroy());
    renderer.setMaterial(roadMaterial, 0);
    for (const side of [-1, 1]) {
      b.add(P.white, ribbon(points, (side * width) / 2 - 0.14, (side * width) / 2 + 0.14, 0.025));
    }
  }
  const arrow = {
    positions: [
      -1.6, 0, -0.5, 0, 0, 1.4, 1.6, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, -2.4, -0.5, 0, -2.4, -0.5, 0,
      -0.5,
    ],
    normals: Array.from({ length: 7 }, () => [0, 1, 0]).flat(),
    indices: [0, 1, 2, 6, 3, 4, 6, 4, 5],
  };
  // Sparse road markings remain readable ahead of the chase camera without extra draw calls.
  for (let s = 45; s < track.length; s += 95) {
    const p = pointAt(track, s);
    b.add(P.white, arrow, p.x, p.y + 0.04, p.z, 1, 1, 1, p.heading);
  }
  const ratio = (track.shortcutEnd - track.shortcutStart) / track.shortcutLength;
  for (let metres = 8; metres < track.shortcutLength - 5; metres += 35) {
    const p = pointAt(track, track.shortcutStart + metres * ratio, true);
    b.add(P.yellow, arrow, p.x, p.y + 0.045, p.z, 0.75, 1, 1, p.heading);
  }
  const safety = new MeshBatch();
  track.barriers.forEach((wall, i) =>
    safety.box(
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
  const fallbackRails = safety.build(root, 'FallbackRails');
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
  // A separate offshore landmark is visible from the starting straight.
  b.add(
    '#b9e5d9',
    primitives.cylinder(26, 28, 0.15, { radialSegments: 48 }),
    lighthouseX,
    -1.62,
    lighthouseZ,
  );
  b.add(
    P.sand,
    primitives.cylinder(18, 24, 2, { radialSegments: 48 }),
    lighthouseX,
    -1.3,
    lighthouseZ,
  );
  b.build(root, 'Coast');

  const [palm, tree, rocks, lighthouse, asphalt, profiles] = await Promise.all([
    loadArt('palm/palm', Prefab),
    loadArt('broadleaf/broadleaf', Prefab),
    loadArt('coastal-rocks/coastal-rocks', Prefab),
    loadArt('lighthouse/lighthouse', Prefab),
    loadArt('asphalt/texture', Texture2D),
    loadArt('road-profiles', JsonAsset),
  ]);
  if (!isValid(root)) return;
  asphalt.setWrapMode(Texture2D.WrapMode.REPEAT, Texture2D.WrapMode.REPEAT);
  asphalt.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
  roadMaterial.setProperty('mainTexture', asphalt);
  roadMaterial.setProperty('mainColor', Color.WHITE);
  const kit = profiles.json as Record<
    'barrier' | 'kerb',
    (primitives.IGeometry & { material: number })[]
  >;
  const edges = new MeshBatch();
  for (const wall of track.barriers) {
    for (const part of kit.barrier)
      edges.add(
        part.material === 1 ? P.red : P.white,
        part,
        wall.x,
        wall.y,
        wall.z,
        (wall.halfWidth * 2) / 0.6,
        1,
        (wall.halfLength * 2) / 4,
        wall.heading,
      );
    for (const part of kit.kerb)
      edges.add(
        part.material === 1 ? P.red : P.white,
        part,
        wall.x + wall.inwardX * 1.05,
        wall.y,
        wall.z + wall.inwardZ * 1.05,
        1,
        1,
        (wall.halfLength * 2) / 4,
        wall.heading,
      );
  }
  edges.build(root, 'SeasideRails');
  fallbackRails.destroy();

  // Shared meshes/textures; keep scenery sparse instead of drawing a forest on phones.
  for (let i = 0; i < 28; i++) {
    const p = pointAt(track, (i * track.length) / 28 + 15),
      side = i % 2 ? 1 : -1;
    const offset = side * (19 + (i % 3) * 3);
    const x = p.x + Math.cos(p.heading) * offset,
      z = p.z - Math.sin(p.heading) * offset;
    if (projectOnTrack(track, x, z).distance < 13) continue;
    const model = placeModel(i % 3 ? tree : palm, root, i % 3 ? 'SeasideTree' : 'SeasidePalm');
    model.setPosition(x, -0.58, z);
    const scale = 0.82 + (i % 4) * 0.1;
    model.setScale(scale, scale, scale);
    model.setRotationFromEuler(0, i * 137.5, 0);
    const shadow = groundShadow(root, 5 * scale, 3 * scale);
    shadow.setPosition(x, -0.585, z);
  }
  for (let i = 0; i < 18; i++) {
    const p = pointAt(track, (i * track.length) / 18 + 40),
      side = i % 2 ? -1 : 1;
    const x = p.x + Math.cos(p.heading) * side * 17,
      z = p.z - Math.sin(p.heading) * side * 17;
    if (projectOnTrack(track, x, z).distance < 12) continue;
    const model = placeModel(rocks, root, 'SeasideRocks');
    model.setPosition(x, -0.6, z);
    model.setRotationFromEuler(0, i * 73, 0);
    const scale = 0.8 + (i % 3) * 0.25;
    model.setScale(scale, scale, scale);
  }
  for (const x of [18, 62]) {
    const model = placeModel(palm, root, 'CoastalPalm');
    model.setPosition(x, -0.58, -169);
    model.setRotationFromEuler(0, x * 7, 0);
  }
  const tower = placeModel(lighthouse, root, 'SeasideLighthouse');
  tower.setPosition(lighthouseX, -0.3, lighthouseZ);
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const model = placeModel(rocks, root, 'LighthouseShore');
    model.setPosition(lighthouseX + Math.cos(angle) * 17, -1.5, lighthouseZ + Math.sin(angle) * 17);
    model.setScale(2.5, 2, 2.5);
    model.setRotationFromEuler(0, i * 60, 0);
  }
}
