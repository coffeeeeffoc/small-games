import type { ThemeDefinition, ThemeScenery } from '../ThemeDefinition.ts';
import type { TrackData } from '../TrackGenerator.ts';
import { besideRoad, clearOfRoad } from '../ThemeScenery.ts';
import { danxiaRidge } from '../DanxiaGeometry.ts';

function createScenery(track: TrackData): ThemeScenery {
  const shapes: NonNullable<ThemeScenery['shapes']> = [];
  const meshes: NonNullable<ThemeScenery['meshes']> = [];
  const ground = Math.min(...track.main.map((p) => p.y), ...track.shortcut.map((p) => p.y)) - 0.12;

  // A nearer rolling ridge and taller overlapping outer chain enclose any chosen route.
  for (const [spacing, length, width, height, gap] of [
    [56, 52, 36, 23, 5],
    [100, 120, 80, 58, 15],
  ]) {
    const count = Math.ceil(track.length / spacing);
    for (let i = 0; i < count; i++)
      for (const side of [-1, 1]) {
        const seed = i * 1.7 + side * 0.8;
        const scale = 0.9 + 0.12 * Math.sin(seed);
        const ridgeLength = length * scale,
          ridgeWidth = width * scale;
        const radius = Math.hypot(ridgeLength, ridgeWidth) / 2;
        const p = besideRoad(
          track,
          ((i + 0.35) * track.length) / count,
          side * (track.width / 2 + radius + gap),
        );
        if (!clearOfRoad(track, p.x, p.z, radius)) continue;
        meshes.push(
          ...danxiaRidge(
            p.x,
            ground,
            p.z,
            ridgeLength,
            ridgeWidth,
            p.y - ground + height * scale,
            p.heading + Math.PI / 2 + 0.13 * Math.sin(seed),
            seed,
          ),
        );
      }
  }

  // Entire platform is checked once: a blocked location never leaves a floating roof or fence.
  for (let i = 0; i < 5; i++) {
    const side = i % 2 ? -1 : 1;
    const p = besideRoad(track, ((i + 0.2) * track.length) / 5, side * (track.width / 2 + 19));
    if (!clearOfRoad(track, p.x, p.z, 16)) continue;
    const yaw = p.heading + Math.PI / 2,
      c = Math.cos(yaw),
      s = Math.sin(yaw);
    const deck = p.y + 0.65;
    const box = (
      color: string,
      dx: number,
      y: number,
      dz: number,
      sx: number,
      sy: number,
      sz: number,
    ) => {
      shapes.push({
        kind: 'box',
        color,
        x: p.x + dx * c + dz * s,
        y,
        z: p.z + dz * c - dx * s,
        sx,
        sy,
        sz,
        yaw,
      });
    };
    box('#997352', 0, (deck + ground) / 2, 0, 21, deck - ground, 8);
    box('#d7b680', 0, deck, 0, 22, 0.28, 8.5);
    // Board joints and two levels of rails make the deck readable from the chase camera.
    for (let dx = -10; dx <= 10; dx += 1) box('#b88752', dx, deck + 0.15, 0, 0.055, 0.025, 8.2);
    for (const dz of [-4, 4]) {
      for (const dy of [0.65, 1.3]) box('#805334', 0, deck + dy, dz, 22, 0.17, 0.2);
      for (let dx = -10.5; dx <= 10.5; dx += 3) box('#755035', dx, deck + 0.7, dz, 0.22, 1.6, 0.22);
    }
    for (const dx of [-10.6, 10.6]) {
      for (const dy of [0.65, 1.3]) box('#805334', dx, deck + dy, 0, 0.2, 0.17, 8.2);
    }
    // Compact kiosk at one end: supporting posts, counter, pitched-looking stacked roof.
    for (const dx of [4, 9])
      for (const dz of [-2.5, 2.5]) box('#815c3c', dx, deck + 1.6, dz, 0.3, 3.2, 0.3);
    box('#ad7e4a', 6.5, deck + 0.7, 2.3, 4.8, 1.35, 0.3);
    box('#e4c692', 6.5, deck + 1.45, 2.25, 5.3, 0.16, 0.75);
    box('#536776', 6.5, deck + 3.25, 0, 6.8, 0.3, 6.5);
    box('#627886', 6.5, deck + 3.5, 0, 6.4, 0.3, 4.5);
    box('#718697', 6.5, deck + 3.74, 0, 6, 0.25, 2.2);
    // A bench and a small information stand on the open half of the platform.
    box('#875d39', -5, deck + 0.6, -2.7, 4.2, 0.2, 0.75);
    box('#875d39', -5, deck + 1.1, -3.1, 4.2, 0.6, 0.12);
    for (const dx of [-6.5, -3.5]) box('#604734', dx, deck + 0.3, -2.7, 0.22, 0.6, 0.5);
    box('#705039', -7.5, deck + 0.8, 2.8, 0.16, 1.6, 0.16);
    box('#d4dcc6', -7.5, deck + 1.7, 2.8, 1.6, 0.75, 0.12);
  }

  // Sparse shrubs and rubble fill the road verge, including the selected route's shortcut.
  const branches = [
    [track.main, track.width, false],
    [track.shortcut, track.shortcutWidth, true],
  ] as const;
  for (const [points, width, shortcut] of branches) {
    if (points.length < 2) continue;
    const start = points[0].s,
      span = points[points.length - 1].s - start;
    const count = Math.ceil((shortcut ? track.shortcutLength : span) / 22);
    for (let i = 0; i < count; i++)
      for (const side of [-1, 1]) {
        const p = besideRoad(
          track,
          start + ((i + 0.4) * span) / count,
          side * (width / 2 + 5 + (i % 3) * 1.8),
          shortcut,
        );
        if (!clearOfRoad(track, p.x, p.z, 2.2)) continue;
        const h = 0.7 + (i % 4) * 0.2;
        shapes.push({
          kind: 'ball',
          color: i % 3 ? '#85916a' : '#a3a478',
          x: p.x,
          y: ground + h / 2,
          z: p.z,
          sx: 2.1,
          sy: h,
          sz: 1.65,
        });
        shapes.push({
          kind: 'ball',
          color: i % 2 ? '#ca8a55' : '#bd7047',
          x: p.x + 1.1,
          y: ground + 0.3,
          z: p.z + 0.5,
          sx: 0.9,
          sy: 0.6,
          sz: 0.8,
        });
      }
  }
  return { meshes, shapes };
}

export const theme: ThemeDefinition = {
  id: 'danxia',
  name: '七彩丹霞',
  tagline: '穿过层层彩岩，掠过山谷观景台',
  roadTexture: 'asphalt/texture',
  shoulderTexture: false,
  groundDepth: 0.12,
  colors: {
    ground: '#c69663',
    road: '#49525a',
    shoulder: '#d6ae75',
    rail: '#dce2de',
    accent: '#879398',
    sky: '#87c8ed',
  },
  scenery: createScenery,
};
