import type { WorldDefinition } from '../WorldDefinition.ts';
import { createTrack, pointAt, projectOnTrack } from '../TrackGenerator.ts';

// 南侧驿站直道上山，东侧宽缓回头弯转入山口，西侧沿岩壁下坡。
const track: WorldDefinition['track'] = {
  width: 16,
  shortcut: false,
  controls: [
    [0, -180, 4], [70, -180, 4], [140, -180, 4],
    [205, -135, 7], [235, -60, 12], [215, 20, 17],
    [155, 75, 21], [80, 88, 23], [10, 120, 23],
    [-55, 190, 21], [-135, 205, 18], [-200, 160, 14],
    [-230, 90, 10], [-220, 15, 7], [-180, -65, 5],
    [-180, -140, 4], [-140, -180, 4], [-70, -180, 4],
  ],
};
const road = createTrack(track);
const shapes: NonNullable<WorldDefinition['scenery']['shapes']> = [];
const models: NonNullable<WorldDefinition['scenery']['models']> = [
  // 整体地块只作为山谷远景，实际赛道由独立道路与护栏生成。
  { asset: 'expansion/scenes/highland', x: -5, y: 0, z: -20, scale: 3, yaw: 0.3 },
  { asset: 'expansion/props/snow-peak', x: 70, y: 0, z: -15, scale: 3.8, yaw: -0.6 },
  { asset: 'expansion/props/snow-peak', x: -100, y: 0, z: 45, scale: 4.5, yaw: 0.5 },
  { asset: 'expansion/props/snow-peak', x: 340, y: 0, z: 30, scale: 5.5, yaw: -0.4 },
  { asset: 'expansion/props/snow-peak', x: -320, y: 0, z: 195, scale: 6, yaw: 0.8 },
  { asset: 'expansion/props/snow-peak', x: 15, y: 0, z: 300, scale: 6.5, yaw: 0.2 },
];

// 每段道路下铺 36 米宽山体；平台顶低于该段最低路面，避免掩盖沥青。
for (let i = 1; i < road.main.length; i++) {
  const a = road.main[i - 1], b = road.main[i];
  const top = Math.min(a.y, b.y) - 0.12;
  shapes.push({
    kind: 'box', color: '#877c66', x: (a.x + b.x) / 2,
    y: (top - 1) / 2, z: (a.z + b.z) / 2,
    sx: 36, sy: top + 1, sz: Math.hypot(b.x - a.x, b.z - a.z) + 0.6,
    yaw: Math.atan2(b.x - a.x, b.z - a.z),
  });
}

// 路边低岩和高耸雪峰形成明显山口轮廓，保留护栏外的净空。
for (let i = 0; i < 28; i++) {
  const p = pointAt(road, ((i + 0.5) * road.length) / 28);
  const side = i % 2 ? -1 : 1;
  const x = p.x + Math.cos(p.heading) * side * 29;
  const z = p.z - Math.sin(p.heading) * side * 29;
  if (projectOnTrack(road, x, z).distance < 25) continue;
  const height = 6 + (i % 4) * 2;
  shapes.push({ kind: 'ball', color: i % 2 ? '#a49d83' : '#8a896e', x, y: height / 2, z, sx: 16, sy: height, sz: 20 });
  if (i % 4 === 1)
    models.push({ asset: 'expansion/props/desert-rock', x, y: height * 0.55, z, scale: 1.8, yaw: p.heading });
}

// 高山驿站位于发车直道外侧，木色建筑、红屋顶与前廊可从追尾视角辨认。
for (const x of [-42, 6, 55]) {
  shapes.push({ kind: 'box', color: '#877c66', x, y: 1.9, z: -214, sx: 26, sy: 4, sz: 22 });
  shapes.push({ kind: 'box', color: '#ead4a0', x, y: 7, z: -214, sx: 15, sy: 6, sz: 10 });
  shapes.push({ kind: 'box', color: '#a74b3d', x, y: 10.4, z: -214, sx: 18, sy: 1.2, sz: 13 });
  shapes.push({ kind: 'box', color: '#553f30', x, y: 5.5, z: -208.8, sx: 3, sy: 3, sz: 0.4 });
  for (const side of [-1, 1])
    shapes.push({ kind: 'box', color: '#648e9a', x: x + side * 4.5, y: 7.5, z: -208.8, sx: 2.4, sy: 2, sz: 0.4 });
}

export const world: WorldDefinition = {
  id: 'highland',
  name: '高原与高山',
  tagline: '从高山驿站爬升山口，沿雪峰岩壁回旋',
  track,
  colors: { ground: '#a6ad80', road: '#54565b', shoulder: '#d7c499', rail: '#eee5d1', accent: '#e7a443', sky: '#b9daea' },
  scenery: { shapes, models },
};
