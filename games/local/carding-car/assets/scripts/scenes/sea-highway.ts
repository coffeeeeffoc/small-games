import type { WorldDefinition } from '../WorldDefinition.ts';
import { createTrack, pointAt } from '../TrackGenerator.ts';

const track: WorldDefinition['track'] = {
  width: 14,
  shortcut: false,
  controls: [
    [0, -90, 2], [80, -90, 2], [160, -90, 2], [216, -64, 2],
    [240, 0, 2], [216, 64, 2], [160, 90, 2], [80, 90, 2],
    [0, 90, 2], [-80, 90, 2], [-160, 90, 2], [-216, 64, 2],
    [-240, 0, 2], [-216, -64, 2], [-160, -90, 2], [-80, -90, 2],
  ],
};
const route = createTrack(track);
const shapes: NonNullable<WorldDefinition['scenery']['shapes']> = [];
const models: NonNullable<WorldDefinition['scenery']['models']> = [
  { asset: 'expansion/scenes/sea-highway', x: 0, y: -0.08, z: 225, scale: 3, yaw: Math.PI / 2 },
];

// 沿实际曲线铺连续桥底，所有桥体均低于权威道路表面；同色形体由 MeshBatch 合批。
const spans = Math.ceil(route.length / 10);
const spanLength = route.length / spans;
for (let i = 0; i < spans; i++) {
  const p = pointAt(route, (i + 0.5) * spanLength);
  shapes.push({
    kind: 'box', color: '#a2bac2', x: p.x, y: 1.2, z: p.z,
    sx: 18, sy: 1.5, sz: spanLength + 3, yaw: p.heading,
  });
  if (i % 4 === 0) {
    shapes.push({
      kind: 'box', color: '#6d8d9a', x: p.x, y: 0.12, z: p.z,
      sx: 4.5, sy: 1, sz: 3, yaw: p.heading,
    });
    for (const side of [-1, 1]) {
      shapes.push({
        kind: 'box', color: '#e3f4f4',
        x: p.x + Math.cos(p.heading) * side * 8.65,
        y: 4.2, z: p.z - Math.sin(p.heading) * side * 8.65,
        sx: 0.16, sy: 4.4, sz: 0.16,
      });
    }
  }
}

// 桥塔净宽 18m，14m 道路连同护栏总宽 17.35m，塔脚不侵入可驾驶区域。
for (const x of [-64, 64]) {
  for (const z of [-90, 90]) {
    models.push(
      { asset: 'expansion/props/bridge-tower', x, y: -0.1, z, scale: 1, yaw: Math.PI / 2 },
      { asset: 'expansion/props/bridge-deck', x, y: 0.45, z, scale: 1, yaw: Math.PI / 2 },
    );
  }
}

// 潮汐色块低于道路；岛屿放在道路外侧，留出清晰的海上环线轮廓。
for (const [x, z, sx, sz] of [[0, 0, 360, 115], [-345, -80, 120, 110], [300, 180, 190, 95]]) {
  shapes.push({ kind: 'ball', color: '#389fae', x, y: -0.1, z, sx, sy: 0.04, sz });
}
for (const [x, z, size] of [[-330, -155, 55], [325, 120, 70], [70, -185, 48]]) {
  shapes.push(
    { kind: 'ball', color: '#e4cf93', x, y: -1.1, z, sx: size, sy: 5, sz: size * 0.7 },
    { kind: 'ball', color: '#65a784', x, y: 0.5, z, sx: size * 0.7, sy: 7, sz: size * 0.45 },
  );
}

export const world: WorldDefinition = {
  id: 'sea-highway',
  name: '跨海高速',
  tagline: '双桥塔长直道 · 海岛缓回弯',
  track,
  colors: {
    ground: '#258899', road: '#40576a', shoulder: '#a9bec2',
    rail: '#e3f4f4', accent: '#f7bd62', sky: '#bce7f0',
  },
  scenery: { shapes, models },
};
