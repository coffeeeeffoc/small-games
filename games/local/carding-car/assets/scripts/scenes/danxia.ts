import type { WorldDefinition } from '../WorldDefinition.ts';

const shapes: NonNullable<WorldDefinition['scenery']['shapes']> = [];
// 相交的扁椭球形成连续的侵蚀山脊；暖色岩层沿坡面逐级露出。
for (const [x, z, width, height, depth] of [
  [100, -69, 58, 34, 45],
  [40, -38, 77, 45, 58],
  [-44, 18, 75, 35, 62],
  [23, 87, 66, 29, 43],
  [265, -34, 78, 49, 62],
  [223, 124, 80, 41, 68],
  [60, 265, 116, 54, 66],
  [-159, 188, 86, 42, 64],
  [-288, 22, 74, 46, 91],
  [-82, -202, 106, 30, 51],
]) {
  for (const [layer, color] of ['#a6533f', '#cf6e46', '#e3a953', '#98534f', '#db8750'].entries()) {
    const shrink = 1 - layer * 0.125;
    shapes.push({
      kind: 'ball', color, x: x + layer * 1.2, z: z - layer * 0.8,
      y: height * (0.11 + layer * 0.15),
      sx: width * shrink, sy: height * 0.65, sz: depth * shrink,
    });
  }
}

// 谷底观景栈道与亭子在护栏之外，木柱直落地面。
for (const [x, z, yaw] of [[68, -99, 0], [-126, 64, 0.5], [70, 128, -0.5]]) {
  shapes.push({ kind: 'box', color: '#9c6543', x, y: 1.7, z, sx: 23, sy: 0.4, sz: 4, yaw });
  for (const side of [-1, 1]) {
    const dz = side * 1.8;
    shapes.push({ kind: 'box', color: '#dab284', x: x + Math.sin(yaw) * dz, y: 2.8,
      z: z + Math.cos(yaw) * dz, sx: 23, sy: 0.2, sz: 0.18, yaw });
    for (const dx of [-10, -5, 0, 5, 10]) {
      shapes.push({ kind: 'box', color: '#73513c', x: x + Math.cos(yaw) * dx + Math.sin(yaw) * dz,
        y: 1.4, z: z - Math.sin(yaw) * dx + Math.cos(yaw) * dz,
        sx: 0.24, sy: 2.8, sz: 0.24, yaw });
    }
  }
  for (const dx of [-2.2, 2.2])
    for (const dz of [-1.6, 1.6])
      shapes.push({ kind: 'box', color: '#694935', x: x + dx, y: 3.1, z: z + dz,
        sx: 0.28, sy: 2.4, sz: 0.28 });
  shapes.push({ kind: 'box', color: '#863f35', x, y: 4.45, z, sx: 6.5, sy: 0.45, sz: 5 });
  shapes.push({ kind: 'box', color: '#b36744', x, y: 4.9, z, sx: 4.5, sy: 0.45, sz: 3.5 });
}

export const world: WorldDefinition = {
  id: 'danxia', name: '七彩丹霞', tagline: '穿过彩色岩谷，掠过观景栈道',
  track: {
    width: 16, shortcut: false,
    // 起终点两侧均为连续直线，蛇形弯在峡谷外侧缓缓展开；路面贴地。
    controls: [
      [0, -130], [80, -130], [150, -130], [197, -74], [177, -4],
      [129, 43], [146, 110], [96, 169], [24, 179], [-46, 142],
      [-99, 109], [-158, 106], [-204, 49], [-189, -27],
      [-151, -98], [-140, -130], [-80, -130],
    ],
  },
  colors: { ground: '#be875e', road: '#69544b', shoulder: '#dca475', rail: '#fff0c2',
    accent: '#c9543d', sky: '#f3c89d' },
  scenery: {
    shapes,
    models: [
      { asset: 'expansion/scenes/danxia', x: 255, y: 0, z: -186, scale: 2.3, yaw: -0.45 },
      { asset: 'expansion/props/danxia-rock', x: 120, y: 0, z: -91, scale: 1.6, yaw: 0.7 },
      { asset: 'expansion/props/danxia-rock', x: 88, y: 0, z: 53, scale: 1.5, yaw: -0.8 },
      { asset: 'expansion/props/danxia-rock', x: -104, y: 0, z: 4, scale: 2, yaw: 1.2 },
    ],
    roadside: [{ asset: 'expansion/props/danxia-rock', count: 36, offset: 29, scale: 0.85 }],
  },
};
