import type { WorldDefinition } from '../WorldDefinition.ts';
import { createTrack, pointAt, projectOnTrack } from '../TrackGenerator.ts';

// Broad boulevards circle the business district, then sweep through the park quarter.
const track: WorldDefinition['track'] = {
  width: 18,
  shortcut: false,
  controls: [
    [0, -165], [60, -165], [120, -165], [175, -135], [200, -80],
    [200, 0], [160, 70], [155, 135], [105, 180], [20, 185],
    [-65, 160], [-130, 170], [-190, 125], [-215, 60], [-215, -25],
    [-190, -100], [-160, -150], [-120, -165], [-60, -165],
  ],
};
const road = createTrack(track);
const shapes: NonNullable<WorldDefinition['scenery']['shapes']> = [];
const models: NonNullable<WorldDefinition['scenery']['models']> = [
  // Authored 36 m city diorama forms the central skyline, outside the racing ribbon.
  { asset: 'expansion/scenes/city', x: 15, y: 0, z: 25, scale: 2.8, yaw: -0.4 },
  { asset: 'expansion/scenes/city', x: 285, y: 0, z: -45, scale: 2, yaw: Math.PI / 2 },
];
const facades = ['#f7d7ab', '#a7ccd2', '#d9a798', '#b6bdde'];
const signs = ['#ee7159', '#4eacb5', '#efbf4b'];

function box(color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0) {
  shapes.push({ kind: 'box', color, x, y, z, sx, sy, sz, yaw });
}

for (let i = 0; i < 36; i++) {
  const p = pointAt(road, (i * road.length) / 36);
  const rightX = Math.cos(p.heading), rightZ = -Math.sin(p.heading);
  for (const side of [-1, 1]) {
    const at = (offset: number) => ({ x: p.x + rightX * side * offset, z: p.z + rightZ * side * offset });
    // The 5.4 m square model at scale 2.4 still leaves 8 m beyond the rail.
    const b = at(31), scale = 1.55 + ((i + (side + 1)) % 4) * 0.28;
    if (projectOnTrack(road, b.x, b.z).distance < 22) continue;
    if (i % 3 !== 2) {
      models.push({ asset: 'expansion/props/city-building', x: b.x, y: 0, z: b.z, scale, yaw: p.heading });
    } else {
      const height = 12 + (i % 4) * 5;
      box(facades[i % facades.length], b.x, height / 2, b.z, 12, height, 11, p.heading);
      box('#546579', b.x, height + 0.3, b.z, 12.7, 0.6, 11.7, p.heading);
      // Windows and shopfronts face the track; repeated batches share materials.
      const front = at(24.9);
      for (let floor = 4; floor < height - 1; floor += 4)
        box('#dff0e9', front.x, floor, front.z, 0.25, 1.6, 8, p.heading);
      box(signs[i % 3], front.x, 3.2, front.z, 1.2, 0.65, 10, p.heading);
      box('#385b6b', front.x, 1.4, front.z, 0.3, 2.2, 8.5, p.heading);
    }
    const pavement = at(19);
    box('#d9d6c8', pavement.x, 0.06, pavement.z, 9, 0.2, 22, p.heading);
    const lamp = at(13.7);
    box('#52697b', lamp.x, 3.6, lamp.z, 0.22, 7.2, 0.22);
    box('#52697b', lamp.x - rightX * side * 0.55, 7.2, lamp.z - rightZ * side * 0.55, 1.5, 0.18, 0.18, p.heading);
    box('#fff1bd', lamp.x - rightX * side, 7.06, lamp.z - rightZ * side, 0.7, 0.16, 0.5, p.heading);
    if (i % 2 === 0) {
      const tree = at(19);
      box('#b6bf9b', tree.x, 0.45, tree.z, 3.5, 0.9, 3.5, p.heading);
      box('#856e52', tree.x, 2.2, tree.z, 0.7, 4, 0.7);
      shapes.push({ kind: 'ball', color: '#75a888', x: tree.x, y: 5.1, z: tree.z, sx: 4.6, sy: 5.2, sz: 4.6 });
      const bench = { x: tree.x + Math.sin(p.heading) * 4.5, z: tree.z + Math.cos(p.heading) * 4.5 };
      box('#8b725c', bench.x, 0.7, bench.z, 1.1, 0.25, 2.7, p.heading);
      box('#536874', bench.x, 0.3, bench.z, 0.5, 0.6, 2.2, p.heading);
    }
  }
}

// A civic plaza and stepped landmark rise above the street's shop roofs.
box('#d4c8ad', -75, 0.05, -25, 62, 0.2, 52);
box('#789d91', -75, 0.25, -25, 29, 0.5, 23);
box('#87c4d2', -75, 1.1, -25, 22, 1.2, 17);
box('#e9d6ad', -75, 4, -25, 2.5, 8, 2.5);
box('#6794ae', 78, 19, -40, 21, 38, 18);
box('#a6c7d0', 78, 43, -40, 15, 10, 13);
box('#eac985', 78, 50, -40, 6, 4, 5);
for (let y = 6; y < 38; y += 6) {
  box('#d7efe8', 78, y, -49.1, 17, 1.3, 0.2);
  box('#d7efe8', 88.6, y, -40, 0.2, 1.3, 14);
}

export const world: WorldDefinition = {
  id: 'city',
  name: '城市',
  tagline: '穿越商业街与中央广场的宽街竞速',
  track,
  colors: { ground: '#b5bba5', road: '#435365', shoulder: '#c9c8b9', rail: '#fff2d1', accent: '#ea8765', sky: '#b6dce9' },
  scenery: { shapes, models },
};
