import type { ThemeDefinition, ThemeScenery } from '../ThemeDefinition.ts';
import { highlandRoadbed } from '../HighlandGeometry.ts';
import { besideRoad, clearOfRoad } from '../ThemeScenery.ts';
import type { TrackData } from '../TrackGenerator.ts';

function createScenery(track: TrackData): ThemeScenery {
  const shapes: NonNullable<ThemeScenery['shapes']> = [];
  const models: NonNullable<ThemeScenery['models']> = [];
  const lodges: { x: number; z: number }[] = [];
  // Locate whole lodges before rocks, so the porch has both road clearance and a clear view.
  for (const [index, fraction] of [0.035, 0.4, 0.76].entries()) {
    for (let attempt = 0; attempt < 16; attempt++) {
      const side = index % 2 ? -1 : 1;
      const p = besideRoad(
        track,
        track.length * fraction + attempt * 16,
        side * (track.width / 2 + 22),
      );
      if (!clearOfRoad(track, p.x, p.z, 14)) continue;
      models.push({
        asset: 'expansion/props/highland-lodge',
        x: p.x,
        y: p.y,
        z: p.z,
        scale: 1,
        yaw: p.heading - (side * Math.PI) / 2,
      });
      const bottom = Math.min(-1, p.y - 1);
      shapes.push({
        kind: 'box',
        color: '#898273',
        x: p.x,
        y: (p.y + bottom) / 2,
        z: p.z,
        sx: 20,
        sy: p.y - bottom,
        sz: 19,
        yaw: p.heading - (side * Math.PI) / 2,
      });
      lodges.push(p);
      break;
    }
  }
  // Taller crags alternate with open valley views; every placement uses the selected branch width/elevation.
  for (const [points, width, shortcut] of [
    [track.main, track.width, false],
    [track.shortcut, track.shortcutWidth, true],
  ] as const) {
    if (points.length < 2) continue;
    const start = shortcut ? track.shortcutStart : 0,
      end = shortcut ? track.shortcutEnd : track.length;
    const count = shortcut ? Math.max(3, Math.round(track.shortcutLength / 42)) : 38;
    for (let i = 0; i < count; i++) {
      const distance = start + ((end - start) * (i + 0.45)) / count;
      const height = besideRoad(track, distance, 0, shortcut).y;
      const side = i % 2 ? -1 : 1,
        scale = 1.25 + (i % 4) * 0.38 + Math.max(0, height) / 19.94;
      const radius = 9 * scale;
      const p = besideRoad(track, distance, side * (width / 2 + radius + 7), shortcut);
      if (
        !clearOfRoad(track, p.x, p.z, radius) ||
        lodges.some((l) => Math.hypot(l.x - p.x, l.z - p.z) < radius + 21)
      )
        continue;
      models.push({
        asset: 'expansion/props/highland-cliff',
        x: p.x,
        y: -1,
        z: p.z,
        scale,
        yaw: p.heading + i * 0.43,
      });
    }
  }
  const points = [...track.main, ...track.shortcut];
  const centerX = (Math.min(...points.map((p) => p.x)) + Math.max(...points.map((p) => p.x))) / 2;
  const centerZ = (Math.min(...points.map((p) => p.z)) + Math.max(...points.map((p) => p.z))) / 2;
  const extent =
    Math.max(...points.map((p) => Math.hypot(p.x - centerX, p.z - centerZ))) +
    Math.max(track.width, track.shortcutWidth) / 2;
  // Authored snowy ridges behind lower granite silhouettes give three distinct depth layers.
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI) / 6,
      distance = extent + 82;
    const x = centerX + Math.cos(angle) * distance,
      z = centerZ + Math.sin(angle) * distance;
    const scale = 2.6 + (i % 3) * 0.4;
    if (clearOfRoad(track, x, z, 9 * scale))
      models.push({ asset: 'expansion/props/highland-cliff', x, y: -1, z, scale, yaw: -angle });
  }
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 + 0.2,
      scale = 5.8 + (i % 3) * 0.7;
    const distance = extent + 37 * scale + 58;
    const x = centerX + Math.cos(angle) * distance,
      z = centerZ + Math.sin(angle) * distance;
    if (clearOfRoad(track, x, z, 37 * scale))
      models.push({
        asset: 'expansion/props/highland-snow-ridge',
        x,
        y: -1,
        z,
        scale,
        yaw: Math.PI / 2 - angle,
      });
  }
  return { shapes, models, meshes: highlandRoadbed(track) };
}

export const theme: ThemeDefinition = {
  id: 'highland',
  name: '高原与高山',
  tagline: '灰岩山口、层叠雪峰与红瓦驿站',
  colors: {
    ground: '#989380',
    road: '#54565b',
    shoulder: '#b8ac94',
    rail: '#eee5d1',
    accent: '#d98839',
    sky: '#b9daea',
  },
  scenery: createScenery,
};
