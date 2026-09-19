import { Color, isValid, JsonAsset, Material, MeshRenderer, Node, Prefab, Texture2D, utils } from 'cc';
import { buildTrack, ribbon } from './Track';
import { loadArt, MeshBatch, placeModel } from './SceneArt';
import { pointAt, projectOnTrack, type TrackData } from './TrackGenerator';
import type { ThemeDefinition } from './ThemeDefinition';
import { buildGlacier } from './GlacierSample';
import { sceneryFits } from './ThemeScenery';

export async function buildTheme(parent: Node, track: TrackData, theme: ThemeDefinition) {
  if (theme.id === 'seaside') return buildTrack(parent, track);
  const scenery = theme.scenery(track);
  const [expansion, seaside] = await Promise.all([loadArt('expansion/manifest', JsonAsset), loadArt('manifest', JsonAsset)]);
  if (!isValid(parent)) return;
  const bounds = new Map<string, number[][]>();
  for (const entry of expansion.json!.models) bounds.set('expansion/' + entry.file.replace(/\.glb$/, ''), entry.bounds);
  for (const entry of seaside.json!.models) {
    const name = entry.file.replace(/\.glb$/, '');
    bounds.set(`${name}/${name}`, entry.bounds);
  }
  const b = new MeshBatch(),
    c = theme.colors;
  b.box(c.ground, 0, -1, 0, 1800, 1.8, 1800);
  for (const [points, width] of [
    [track.main, track.width],
    [track.shortcut, track.shortcutWidth],
  ] as const) {
    if (points.length < 2 || theme.id === 'glacier') continue;
    b.add(c.shoulder, ribbon(points, -width / 2 - 1.6, width / 2 + 1.6, -0.04));
    b.add(c.road, ribbon(points, -width / 2, width / 2, 0));
    for (const side of [-1, 1])
      b.add(c.rail, ribbon(points, (side * width) / 2 - 0.12, (side * width) / 2 + 0.12, 0.025));
  }
  for (const [i, wall] of track.barriers.entries()) {
    if (theme.id === 'glacier') continue;
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
  }
  // All scenery is separate from the shared drivable road and its exact physical rails.
  for (const shape of scenery.shapes ?? []) {
    if (!sceneryFits(track, shape.x, shape.y, shape.z, Math.hypot(shape.sx, shape.sz) / 2, shape.sy / 2)) continue;
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
  b.build(parent, theme.name);
  // A narrow textured shoulder keeps each authored terrain texture visible without hiding asphalt.
  if (theme.id === 'glacier') await buildGlacier(parent, track);
  else {
    const texture = await loadArt(`expansion/textures/${theme.id}/texture`, Texture2D);
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
  }
  const placements = [...(scenery.models ?? [])];
  for (const row of scenery.roadside ?? [])
    for (let i = 0; i < row.count; i++) {
      const p = pointAt(track, ((i + 0.3) * track.length) / row.count),
        side = i % 2 ? -1 : 1;
      const x = p.x + Math.cos(p.heading) * side * row.offset,
        z = p.z - Math.sin(p.heading) * side * row.offset;
      if (projectOnTrack(track, x, z).distance < track.width / 2 + 5) continue;
      placements.push({ asset: row.asset, x, y: p.y, z, scale: row.scale, yaw: p.heading });
    }
  const safePlacements = placements.filter((p) => {
    const box = bounds.get(p.asset);
    if (!box) throw new Error(`Missing scenery bounds: ${p.asset}`);
    const [lo, hi] = box;
    const radius = Math.hypot(Math.max(Math.abs(lo[0]), Math.abs(hi[0])), Math.max(Math.abs(lo[2]), Math.abs(hi[2]))) * p.scale;
    return sceneryFits(track, p.x, p.y + (lo[1] + hi[1]) * p.scale / 2, p.z, radius, (hi[1] - lo[1]) * p.scale / 2);
  });
  const paths = Array.from(new Set(safePlacements.map((p) => p.asset)));
  const prefabs = new Map(
    await Promise.all(paths.map(async (path) => [path, await loadArt(path, Prefab)] as const)),
  );
  if (!isValid(parent)) return;
  for (const p of safePlacements) {
    const model = placeModel(prefabs.get(p.asset)!, parent, p.asset);
    model.setPosition(p.x, p.y, p.z);
    model.setScale(p.scale, p.scale, p.scale);
    model.setRotationFromEuler(0, ((p.yaw ?? 0) * 180) / Math.PI, 0);
  }
}
