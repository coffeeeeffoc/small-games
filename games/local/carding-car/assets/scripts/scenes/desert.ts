import type { WorldDefinition } from '../WorldDefinition.ts';
export const world: WorldDefinition = {
  id: 'desert',
  name: '沙漠',
  tagline: '穿过沙丘与岩柱，在绿洲弯道争夺领先',
  track: {
    width: 16,
    shortcut: false,
    controls: [
      [0, -145], [65, -145], [135, -145], [180, -95],
      [165, -25], [130, 40], [160, 115], [100, 165],
      [20, 155], [-60, 185], [-145, 150], [-185, 70],
      [-160, -20], [-175, -95], [-110, -145], [-65, -145],
    ],
  },
  colors: {
    ground: '#e5bd76', road: '#695c50', shoulder: '#f7d793',
    rail: '#fff2c8', accent: '#d8793c', sky: '#a4dceb',
  },
  scenery: {
    shapes: [
      // Low sand mounds sit inside the loop, clear of the drivable road.
      { kind: 'ball', color: '#edcb8a', x: 5, y: 0, z: -35, sx: 115, sy: 28, sz: 85 },
      { kind: 'ball', color: '#dca85f', x: -85, y: -1, z: 45, sx: 95, sy: 38, sz: 90 },
      { kind: 'ball', color: '#f0cf8e', x: 0, y: -1, z: 105, sx: 95, sy: 26, sz: 60 },
      { kind: 'ball', color: '#dca85f', x: -250, y: 0, z: -45, sx: 90, sy: 48, sz: 130 },
      { kind: 'ball', color: '#edcb8a', x: 70, y: -1, z: -235, sx: 135, sy: 34, sz: 95 },
      // The turquoise oasis marks the inside of the eastern S bend.
      { kind: 'ball', color: '#95ab62', x: 86, y: 0, z: 65, sx: 54, sy: 0.5, sz: 58 },
      { kind: 'ball', color: '#41b6be', x: 86, y: 0.22, z: 65, sx: 40, sy: 0.2, sz: 42 },
      // A shaded pit station is visible to the right from the starting grid.
      { kind: 'box', color: '#bd8853', x: 69, y: 2.5, z: -172, sx: 20, sy: 5, sz: 10 },
      { kind: 'box', color: '#f6dfae', x: 69, y: 5.2, z: -169, sx: 24, sy: 0.65, sz: 18 },
      { kind: 'box', color: '#6d4c38', x: 59, y: 2.4, z: -162, sx: 0.6, sy: 4.8, sz: 0.6 },
      { kind: 'box', color: '#6d4c38', x: 79, y: 2.4, z: -162, sx: 0.6, sy: 4.8, sz: 0.6 },
      { kind: 'box', color: '#329ca6', x: 67, y: 2, z: -166.9, sx: 5, sy: 2.5, sz: 0.25 },
      { kind: 'box', color: '#d8793c', x: 46, y: 5, z: -170, sx: 0.8, sy: 10, sz: 0.8 },
      { kind: 'box', color: '#fff2c8', x: 46, y: 9, z: -170, sx: 1, sy: 2, sz: 7 },
    ],
    models: [
      // The authored diorama is a distant landmark, never the drivable surface.
      { asset: 'expansion/scenes/desert', x: 270, y: 0, z: 60, scale: 2.2, yaw: -0.5 },
      { asset: 'expansion/props/desert-rock', x: 207, y: 0, z: -88, scale: 2, yaw: 0.6 },
      { asset: 'expansion/props/desert-rock', x: 199, y: 0, z: -45, scale: 1.5, yaw: -0.7 },
      { asset: 'expansion/props/desert-rock', x: -113, y: 0, z: 114, scale: 1.8, yaw: 1.1 },
      { asset: 'expansion/props/desert-rock', x: -221, y: 0, z: 96, scale: 2.3, yaw: -0.4 },
      { asset: 'expansion/props/desert-rock', x: 26, y: 0, z: 196, scale: 1.7, yaw: 0.9 },
      { asset: 'palm/palm', x: 108, y: -0.58, z: 50, scale: 1.3, yaw: 0.2 },
      { asset: 'palm/palm', x: 109, y: -0.58, z: 82, scale: 1.1, yaw: 1.4 },
      { asset: 'palm/palm', x: 66, y: -0.58, z: 88, scale: 1.2, yaw: -0.8 },
      { asset: 'palm/palm', x: 64, y: -0.58, z: 40, scale: 1.4, yaw: 0.8 },
    ],
    roadside: [{ asset: 'expansion/props/desert-rock', count: 16, offset: 25, scale: 0.8 }],
  },
};
