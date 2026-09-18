import type { WorldDefinition } from '../WorldDefinition.ts';
import { createTrack, pointAt, projectOnTrack } from '../TrackGenerator.ts';

// A wide glacial basin with sweeping headlands and a straight start apron.
const track: WorldDefinition['track'] = {
  width: 16,
  shortcut: false,
  controls: [
    [0, -165], [60, -165], [120, -165], [175, -125], [195, -60],
    [185, 10], [140, 75], [115, 145], [50, 180], [-25, 175],
    [-85, 135], [-150, 130], [-195, 75], [-205, 0], [-190, -75],
    [-145, -140], [-110, -165], [-60, -165],
  ],
};
const road = createTrack(track);
const shapes: NonNullable<WorldDefinition['scenery']['shapes']> = [];
const models: NonNullable<WorldDefinition['scenery']['models']> = [
  // The authored glacier is a distant basin landmark, never the driving surface.
  { asset: 'expansion/scenes/glacier', x: 0, y: 0, z: 20, scale: 2.4, yaw: -0.4 },
  { asset: 'expansion/props/snow-peak', x: 70, y: 0, z: -55, scale: 2.1, yaw: 0.6 },
  { asset: 'expansion/props/snow-peak', x: -75, y: 0, z: 15, scale: 2.5, yaw: -0.6 },
];

// 12 m opening × 1.8 = 21.6 m, clearing both rails of the 16 m road.
for (const distance of [62, road.length * 0.49]) {
  const p = pointAt(road, distance);
  models.push({ asset: 'expansion/props/ice-arch', x: p.x, y: p.y, z: p.z, scale: 1.8, yaw: p.heading });
}

for (let i = 0; i < 40; i++) {
  const p = pointAt(road, (i * road.length) / 40);
  for (const side of [-1, 1]) {
    const at = (offset: number) => ({
      x: p.x + Math.cos(p.heading) * side * offset,
      z: p.z - Math.sin(p.heading) * side * offset,
    });
    const bank = at(25);
    if (projectOnTrack(road, bank.x, bank.z).distance < 22) continue;
    shapes.push({ kind: 'ball', color: '#edf8ff', x: bank.x, y: 0.7, z: bank.z, sx: 12, sy: 3.6, sz: 15 });
    const cliff = at(39), height = 9 + (i % 5) * 2.5;
    if (projectOnTrack(road, cliff.x, cliff.z).distance < 27) continue;
    // Staggered blue facets and snow caps form a glacial canyon.
    shapes.push({ kind: 'box', color: i % 2 ? '#8ed5ea' : '#68bcd9', x: cliff.x, y: height / 2, z: cliff.z, sx: 9, sy: height, sz: 17, yaw: p.heading + side * 0.18 });
    shapes.push({ kind: 'box', color: '#f3fbff', x: cliff.x, y: height + 0.4, z: cliff.z, sx: 9.5, sy: 0.8, sz: 17.5, yaw: p.heading + side * 0.18 });
    if (i % 5 === 2) {
      const peak = at(72), scale = 1.6 + (i % 3) * 0.25;
      if (projectOnTrack(road, peak.x, peak.z).distance > 45)
        models.push({ asset: 'expansion/props/snow-peak', x: peak.x, y: 0, z: peak.z, scale, yaw: p.heading });
    }
    const marker = at(12.5);
    if (projectOnTrack(road, marker.x, marker.z).distance > 11)
      shapes.push({ kind: 'box', color: '#36aecd', x: marker.x, y: 1.2, z: marker.z, sx: 0.6, sy: 2.4, sz: 0.6, yaw: p.heading });
  }
}

export const world: WorldDefinition = {
  id: 'glacier',
  name: '冰川',
  tagline: '穿越冰拱与蓝色冰壁，环绕雪山冰盆',
  track,
  colors: { ground: '#d4eaf1', road: '#4f839f', shoulder: '#eaf9ff', rail: '#f5fbff', accent: '#36b6d1', sky: '#bfdeef' },
  scenery: { shapes, models },
};
