import type { Box, Level, PieceDefinition, Vec3 } from '../core/types.ts';

const box = (min: Vec3, max: Vec3): Box => ({ min, max });
const cube = (x: number, y: number, z: number): Box =>
  box([x - 0.5, y - 0.5, z - 0.5], [x + 0.5, y + 0.5, z + 0.5]);

/** Original introductory fork-slot assemblies, not replicas of a historic burr.
 * The long spine and two teeth of each fork are one face-connected solid.
 * Dependencies arise solely from those teeth physically surrounding another bar.
 * All pieces can translate freely on three axes, individually or as rigid groups.
 */
const pieces: readonly PieceDefinition[] = [
  {
    id: 'key',
    name: '青竹 · 钥匙条',
    color: '#76a796',
    axis: 'x',
    range: [-6, 6],
    removedAt: 6,
    boxes: [box([-3.5, -0.5, -0.5], [2.5, 0.5, 0.5])],
  },
  {
    id: 'cross',
    name: '赤陶 · 双齿榫',
    color: '#ce8768',
    axis: 'y',
    range: [-6, 6],
    removedAt: 6,
    boxes: [box([-0.5, -3.5, 0.5], [0.5, 2.5, 1.5]), cube(0, -1, 0), cube(0, 1, 0)],
  },
  {
    id: 'upright',
    name: '靛蓝 · 立槽榫',
    color: '#7599bc',
    axis: 'z',
    range: [-6, 6],
    removedAt: 6,
    boxes: [box([0.5, 1.5, -3.5], [1.5, 2.5, 2.5]), cube(0, 2, 0), cube(0, 2, 2)],
  },
  {
    id: 'bridge',
    name: '蜜蜡 · 横桥榫',
    color: '#d1ac60',
    axis: 'x',
    range: [-6, 6],
    removedAt: 6,
    boxes: [box([-3.5, 2.5, -1.5], [2.5, 3.5, -0.5]), cube(0, 2, -1), cube(2, 2, -1)],
  },
  {
    id: 'fork',
    name: '紫檀 · 回抱榫',
    color: '#a391b8',
    axis: 'y',
    range: [-6, 6],
    removedAt: 6,
    boxes: [box([-1.5, -0.5, -2.5], [-0.5, 5.5, -1.5]), cube(-1, 2, -1), cube(-1, 4, -1)],
  },
];

export const levels: readonly Level[] = [
  {
    id: 'first-key',
    title: '初见 · 三向榫',
    subtitle: '自由移动，观察榫槽如何相扣',
    description: '三根木条可以沿三个方向移动。既可以逐件分离，也可以先把两件一起挪开，再原样装回。',
    difficulty: '入门',
    estimatedMinutes: '2–3 分钟',
    pieces: pieces.slice(0, 3),
  },
  {
    id: 'cross-roads',
    title: '交错 · 四件锁',
    subtitle: '换个方向，看清阻挡',
    description: '横桥带来一层新的阻挡。旋转视角观察接触处，找到每根木条真正能离开的方向。',
    difficulty: '进阶',
    estimatedMinutes: '3–5 分钟',
    pieces: pieces.slice(0, 4),
  },
  {
    id: 'five-links',
    title: '层叠 · 五件锁',
    subtitle: '拆开之后，再顺着结构复原',
    description: '五根木条交叠相扣。选择一件或组合移动，观察哪些接触阻挡去路，再将所有木条归位。',
    difficulty: '挑战',
    estimatedMinutes: '4–6 分钟',
    pieces,
  },
];

export default levels;
