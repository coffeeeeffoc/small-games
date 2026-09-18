import { Color, isValid, Material, MeshRenderer, Node, Prefab, Texture2D, utils } from 'cc';
import { buildTrack, ribbon } from './Track';
import { loadArt, MeshBatch, placeModel } from './SceneArt';
import { pointAt, projectOnTrack, type TrackData } from './TrackGenerator';
import type { WorldDefinition } from './WorldDefinition';

export async function buildWorld(parent: Node, track: TrackData, world: WorldDefinition) {
  if (world.id === 'seaside') return buildTrack(parent, track);
  const b = new MeshBatch(),
    c = world.colors;
  b.box(c.ground, 0, -1, 0, 1800, 1.8, 1800);
  for (const [points, width] of [
    [track.main, track.width],
    [track.shortcut, track.shortcutWidth],
  ] as const) {
    if (points.length < 2) continue;
    b.add(c.shoulder, ribbon(points, -width / 2 - 1.6, width / 2 + 1.6, -0.04));
    b.add(c.road, ribbon(points, -width / 2, width / 2, 0));
    for (const side of [-1, 1])
      b.add(c.rail, ribbon(points, (side * width) / 2 - 0.12, (side * width) / 2 + 0.12, 0.025));
  }
  for (const [i, wall] of track.barriers.entries())
    b.box(
      i % 4 < 2 ? c.rail : c.accent,
      wall.x,
      wall.y + 0.4,
      wall.z,
      wall.halfWidth * 2,
      0.8,
      wall.halfLength * 2,
      wall.heading,
    );
  // All scenery is separate from the shared drivable road and its exact physical rails.
  for (const shape of world.scenery.shapes ?? []) {
    if (shape.kind === 'ball')
      b.ball(shape.color, shape.x, shape.y, shape.z, shape.sx, shape.sy, shape.sz);
    else
      b.box(shape.color, shape.x, shape.y, shape.z, shape.sx, shape.sy, shape.sz, shape.yaw ?? 0);
  }
  const start = pointAt(track, 0);
  for (let x = -Math.floor(track.width / 2); x <= Math.floor(track.width / 2); x++)
    for (let z = 0; z < 2; z++)
      b.box(
        (x + z) % 2 ? '#fff7dd' : '#193a53',
        start.x + Math.cos(start.heading) * x + Math.sin(start.heading) * z,
        start.y + 0.045,
        start.z - Math.sin(start.heading) * x + Math.cos(start.heading) * z,
        1,
        0.05,
        1,
        start.heading,
      );
  for (const side of [-1, 1])
    b.box(
      c.accent,
      start.x + Math.cos(start.heading) * side * (track.width / 2 + 2),
      start.y + 3.5,
      start.z - Math.sin(start.heading) * side * (track.width / 2 + 2),
      0.6,
      7,
      0.6,
    );
  b.box(c.accent, start.x, start.y + 7, start.z, track.width + 4, 1, 0.6, start.heading);
  for (let s = 40; s < track.length; s += 42) {
    const p = pointAt(track, s);
    b.box('#fff7dd', p.x, p.y + 0.025, p.z, 0.18, 0.04, 3, p.heading);
  }
  b.build(parent, world.name);
  // A narrow textured shoulder keeps each authored terrain texture visible without hiding asphalt.
  const texture = await loadArt(`expansion/textures/${world.id}/texture`, Texture2D);
  if (!isValid(parent)) return;
  texture.setWrapMode(Texture2D.WrapMode.REPEAT, Texture2D.WrapMode.REPEAT);
  const mat = new Material();
  parent.once(Node.EventType.NODE_DESTROYED, () => mat.destroy());
  mat.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } });
  mat.setProperty('mainColor', Color.WHITE);
  mat.setProperty('mainTexture', texture);
  for (const side of [-1, 1]) {
    const node = new Node('TerrainTexture');
    parent.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    const mesh = utils.createMesh(
      ribbon(
        track.main,
        (side * track.width) / 2 + Math.min(side * 0.25, side * 1.5),
        (side * track.width) / 2 + Math.max(side * 0.25, side * 1.5),
        -0.025,
      ),
    );
    renderer.mesh = mesh;
    node.once(Node.EventType.NODE_DESTROYED, () => mesh.destroy());
    renderer.setMaterial(mat, 0);
  }
  const placements = [...(world.scenery.models ?? [])];
  for (const row of world.scenery.roadside ?? [])
    for (let i = 0; i < row.count; i++) {
      const p = pointAt(track, ((i + 0.3) * track.length) / row.count),
        side = i % 2 ? -1 : 1;
      const x = p.x + Math.cos(p.heading) * side * row.offset,
        z = p.z - Math.sin(p.heading) * side * row.offset;
      if (projectOnTrack(track, x, z).distance < track.width / 2 + 5) continue;
      placements.push({ asset: row.asset, x, y: p.y, z, scale: row.scale, yaw: p.heading });
    }
  const paths = Array.from(new Set(placements.map((p) => p.asset)));
  const prefabs = new Map(
    await Promise.all(paths.map(async (path) => [path, await loadArt(path, Prefab)] as const)),
  );
  if (!isValid(parent)) return;
  for (const p of placements) {
    const model = placeModel(prefabs.get(p.asset)!, parent, p.asset);
    model.setPosition(p.x, p.y, p.z);
    model.setScale(p.scale, p.scale, p.scale);
    model.setRotationFromEuler(0, ((p.yaw ?? 0) * 180) / Math.PI, 0);
  }
}
