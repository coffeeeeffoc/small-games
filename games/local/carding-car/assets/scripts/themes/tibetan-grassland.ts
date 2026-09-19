import type { ThemeDefinition, ThemeScenery } from '../ThemeDefinition.ts';
import { pointAt, projectOnTrack, type TrackData } from '../TrackGenerator.ts';

function createScenery(track: TrackData): ThemeScenery {
const shapes: NonNullable<ThemeScenery['shapes']> = [];
const box = (color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
  shapes.push({ kind: 'box', color, x, y, z, sx, sy, sz });
const ball = (color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
  shapes.push({ kind: 'ball', color, x, y, z, sx, sy, sz });

// 起步直路能看到毡房营地；屋门朝向跑道，红色腰带连成清楚的轮廓。
for (const [x, z] of [[25, -113], [49, -106], [77, -113]]) {
  box('#eee6cc', x, 1.6, z, 9, 3.2, 8);
  ball('#eee6cc', x, 2.9, z, 10, 4.8, 9);
  box('#ad5749', x, 2, z - 4.1, 9, 0.45, 0.15);
  box('#51473e', x, 1.25, z - 4.15, 1.8, 2.5, 0.2);
  box('#51473e', x + 2.5, 4.9, z + 1, 0.45, 2, 0.45);
}

// 浅溪完全位于赛道内侧草甸，不穿越公路；交叠椭圆形成柔和的水岸。
for (const [x, z, sx, sz] of [[-28, -48, 20, 65], [-23, 2, 27, 65], [-5, 42, 34, 48]]) {
  ball('#72b9ca', x, -0.05, z, sx, 0.22, sz);
}

// 牦牛保持在护栏外的牧场里，矮长身体、下垂长毛和浅色双角区别于普通石块。
for (const [x, z] of [[-68, -100], [-51, -89], [112, 13], [123, 26], [-84, 46], [-97, 33]]) {
  ball('#51473e', x, 1.5, z, 4.5, 2.6, 2.3);
  box('#51473e', x, 0.85, z, 4, 1.1, 1.9);
  ball('#51473e', x + 2.15, 1.4, z, 1.5, 1.7, 1.5);
  for (const side of [-1, 1]) {
    box('#eee6cc', x + 2.2, 2.35, z + side * 0.7, 0.25, 0.75, 0.25);
    box('#51473e', x - 1.25, 0.5, z + side * 0.7, 0.5, 1, 0.5);
    box('#51473e', x + 1.25, 0.5, z + side * 0.7, 0.5, 1, 0.5);
  }
}

for (const [x, z] of [[-65, -115], [-47, -110], [103, -107], [126, -94], [140, -15],
  [100, 43], [68, 87], [8, 96], [-61, 87], [-121, 37], [-133, -12], [-120, -70]]) {
  box('#6a8e48', x, 0.65, z, 0.4, 1.3, 2.4);
  box('#6a8e48', x, 0.45, z, 2.2, 0.9, 0.4);
}


return {
    shapes,
    models: [
      { asset: 'expansion/scenes/tibetan-grassland', x: 115, y: 0, z: -225, scale: 1.8, yaw: -0.25 },
      { asset: 'expansion/scenes/tibetan-grassland', x: -245, y: 0, z: 20, scale: 1.7, yaw: 1.2 },
      { asset: 'expansion/props/grass-hill', x: -45, y: 0, z: -35, scale: 2.5, yaw: 0.6 },
      { asset: 'expansion/props/grass-hill', x: 72, y: 0, z: 25, scale: 3, yaw: -0.3 },
      { asset: 'expansion/props/grass-hill', x: 5, y: 0, z: 78, scale: 2.3, yaw: 1.1 },
      { asset: 'expansion/props/grass-hill', x: 224, y: 0, z: -64, scale: 2.5, yaw: 0.4 },
      { asset: 'expansion/props/grass-hill', x: -87, y: 0, z: 158, scale: 2.8, yaw: -0.7 },
    ],
  };
}

export const theme: ThemeDefinition = {
  ...{
  "id": "tibetan-grassland",
  "name": "青藏高原草原",
  "tagline": "绕过毡房与牦牛牧场，沿溪流追逐草原长风",
  "colors": {
    "ground": "#9bae65",
    "road": "#686e64",
    "shoulder": "#d4c899",
    "rail": "#eee6cc",
    "accent": "#ad5749",
    "sky": "#addbe9"
  }
},
  scenery: createScenery,
};
