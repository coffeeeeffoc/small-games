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
import { pointAt, type TrackData, type TrackPoint } from './TrackGenerator';
import { createSeasideScenery } from './SeasideGeometry';

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
  const scenery = createSeasideScenery(track);
  const roadMaterial = new Material();
  root.once(Node.EventType.NODE_DESTROYED, () => roadMaterial.destroy());
  roadMaterial.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } });
  roadMaterial.setProperty('mainColor', new Color().fromHEX(P.road));
  b.box('#268fa8', scenery.centerX, scenery.seaY - 0.5, scenery.centerZ, 2400, 1, 2400);
  for (const { color, geometry } of [...scenery.terrainMeshes, ...scenery.meshes])
    b.add(color, geometry);
  for (const shape of scenery.shapes) {
    if (shape.kind === 'ball')
      b.ball(shape.color, shape.x, shape.y, shape.z, shape.sx, shape.sy, shape.sz);
    else
      b.box(shape.color, shape.x, shape.y, shape.z, shape.sx, shape.sy, shape.sz, shape.yaw ?? 0);
  }
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
  const squares = Math.floor(track.width),
    squareWidth = track.width / squares;
  for (let column = 0; column < squares; column++)
    for (let z = 0; z < 2; z++) {
      const x = -track.width / 2 + (column + 0.5) * squareWidth;
      b.box(
        (column + z) % 2 ? P.white : P.navy,
        start.x + Math.cos(h) * x + Math.sin(h) * z,
        start.y + 0.045,
        start.z - Math.sin(h) * x + Math.cos(h) * z,
        squareWidth,
        0.05,
        1,
        h,
      );
    }
  for (const side of [-1, 1])
    b.box(
      P.yellow,
      start.x + Math.cos(h) * side * (track.width / 2 + 2),
      start.y + 3.5,
      start.z - Math.sin(h) * side * (track.width / 2 + 2),
      0.7,
      7,
      0.7,
    );
  b.box(P.navy, start.x, start.y + 7, start.z, track.width + 4.7, 1.3, 0.65, h);
  for (let i = -4; i <= 4; i++)
    b.box(
      i % 2 ? P.white : P.mint,
      start.x + (Math.cos(h) * i * track.width) / 10,
      start.y + 7.1,
      start.z - (Math.sin(h) * i * track.width) / 10,
      track.width / 12,
      0.65,
      0.75,
      h,
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

  const prefabs = new Map([
    ['palm/palm', palm],
    ['broadleaf/broadleaf', tree],
    ['coastal-rocks/coastal-rocks', rocks],
    ['lighthouse/lighthouse', lighthouse],
  ]);
  for (const placement of scenery.models) {
    const model = placeModel(prefabs.get(placement.asset)!, root, 'Seaside:' + placement.asset);
    model.setPosition(placement.x, placement.y, placement.z);
    model.setScale(placement.scale, placement.scale, placement.scale);
    model.setRotationFromEuler(0, ((placement.yaw ?? 0) * 180) / Math.PI, 0);
    if (placement.asset === 'palm/palm' || placement.asset === 'broadleaf/broadleaf') {
      const shadow = groundShadow(root, 5 * placement.scale, 3 * placement.scale);
      shadow.setPosition(placement.x, placement.y + 0.015, placement.z);
    }
  }
}
