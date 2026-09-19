import type { ThemeDefinition, ThemeScenery } from '../ThemeDefinition.ts';
import type { TrackData } from '../TrackGenerator.ts';
import { besideRoad, clearOfRoad } from '../ThemeScenery.ts';
import { seaBridge } from '../SeaHighwayGeometry.ts';

function createScenery(track: TrackData): ThemeScenery {
  const { decks, piers, towers, cables, water } = seaBridge(track);
  const shapes: NonNullable<ThemeScenery['shapes']> = [];
  const models: NonNullable<ThemeScenery['models']> = [];
  const meshes = [
    { color: '#b8ced2', geometry: decks },
    { color: '#9aafb3', geometry: piers },
    { color: '#fffaf0', geometry: towers },
    { color: '#edfaff', geometry: cables },
  ];
  let islands = 0;
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? -1 : 1;
    const p = besideRoad(track, 55 + (i * track.length) / 10, side * (track.width / 2 + 58));
    if (!clearOfRoad(track, p.x, p.z, 28)) continue;
    const radius = 17 + (i % 3) * 3;
    shapes.push(
      {
        kind: 'ball',
        color: '#35bfcd',
        x: p.x,
        y: water + 0.03,
        z: p.z,
        sx: radius * 2.6,
        sy: 0.035,
        sz: radius * 2.3,
      },
      {
        kind: 'ball',
        color: '#edd7a2',
        x: p.x,
        y: water + 0.3,
        z: p.z,
        sx: radius * 2,
        sy: 3.6,
        sz: radius * 1.6,
      },
      {
        kind: 'ball',
        color: '#75aa56',
        x: p.x,
        y: water + 2,
        z: p.z,
        sx: radius * 1.6,
        sy: 5.6,
        sz: radius * 1.25,
      },
    );
    for (let j = 0; j < 3; j++) {
      const angle = (j * Math.PI * 2) / 3 + i;
      const x = p.x + Math.cos(angle) * radius * 0.67,
        z = p.z + Math.sin(angle) * radius * 0.53;
      models.push(
        {
          asset: 'coastal-rocks/coastal-rocks',
          x,
          y: water + 0.2,
          z,
          scale: 2.6 + (j % 2),
          yaw: angle,
        },
        {
          asset: j % 2 ? 'palm/palm' : 'broadleaf/broadleaf',
          x: p.x + Math.cos(angle) * radius * 0.38,
          y: water + 4.2,
          z: p.z + Math.sin(angle) * radius * 0.3,
          scale: 0.8 + (j % 2) * 0.25,
          yaw: angle,
        },
      );
    }
    if (islands++ % 4 === 0)
      models.push({ asset: 'lighthouse/lighthouse', x: p.x, y: water + 4.2, z: p.z, scale: 0.9 });
  }
  // Small whitecaps stay on the sea; the bridge shoulders remain concrete.
  for (let i = 0; i < 96; i++) {
    const p = besideRoad(track, (i * track.length) / 96, (i % 2 ? 1 : -1) * (28 + (i % 5) * 17));
    shapes.push({
      kind: 'box',
      color: i % 3 ? '#39afc8' : '#9ae1e3',
      x: p.x,
      y: water + 0.06,
      z: p.z,
      sx: 2 + (i % 4),
      sy: 0.035,
      sz: 0.14,
      yaw: -0.35,
    });
  }
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI * 2) / 10;
    for (let j = 0; j < 3; j++)
      shapes.push({
        kind: 'ball',
        color: '#eef9fb',
        x: Math.cos(angle) * 560 + j * 22,
        y: 88 + (i % 3) * 11 + (j % 2) * 8,
        z: Math.sin(angle) * 560,
        sx: 70,
        sy: 22 + (j % 2) * 12,
        sz: 38,
      });
  }
  return { meshes, shapes, models };
}

export const theme: ThemeDefinition = {
  id: 'sea-highway',
  name: '跨海高速',
  tagline: '白塔斜拉桥 · 碧海灯塔群岛',
  shoulderTexture: false,
  groundDepth: 6,
  colors: {
    ground: '#168eb6',
    road: '#40576a',
    shoulder: '#c9d7d7',
    rail: '#fff9ed',
    accent: '#ee7667',
    sky: '#75c7ee',
  },
  scenery: createScenery,
};
