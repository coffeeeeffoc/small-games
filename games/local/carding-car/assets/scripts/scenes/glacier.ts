import type { WorldDefinition } from '../WorldDefinition.ts';

// A wide glacial basin with sweeping headlands and a straight start apron.
const track: WorldDefinition['track'] = {
  width: 16,
  shortcut: false,
  controls: [
    [0, -165],
    [60, -165],
    [120, -165],
    [175, -125],
    [195, -60],
    [185, 10],
    [140, 75],
    [115, 145],
    [50, 180],
    [-25, 175],
    [-85, 135],
    [-150, 130],
    [-195, 75],
    [-205, 0],
    [-190, -75],
    [-145, -140],
    [-110, -165],
    [-60, -165],
  ],
};
const models: NonNullable<WorldDefinition['scenery']['models']> = [
  // The authored glacier is a distant basin landmark, never the driving surface.
  { asset: 'expansion/scenes/glacier', x: 0, y: 0, z: 20, scale: 2.4, yaw: -0.4 },
  { asset: 'expansion/props/snow-peak', x: 70, y: 0, z: -55, scale: 2.1, yaw: 0.6 },
  { asset: 'expansion/props/snow-peak', x: -75, y: 0, z: 15, scale: 2.5, yaw: -0.6 },
];

export const world: WorldDefinition = {
  id: 'glacier',
  name: '冰川',
  tagline: '环绕雪山冰谷 · 穿越三座蓝冰拱桥',
  track,
  colors: {
    ground: '#d4eaf1',
    road: '#4f839f',
    shoulder: '#eaf9ff',
    rail: '#f5fbff',
    accent: '#36b6d1',
    sky: '#bfdeef',
  },
  scenery: { models },
};
