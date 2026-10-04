import type { Axis, Box, Level, PieceDefinition, Vec3 } from '../core/types.ts';
import { interlockBurr, simpleBurr, solidBurr } from './burr-models.ts';
import type { BurrModel } from './burr-models.ts';
import { crystalBall, knoxli } from './three-piece-models.ts';
import type { ThreePieceModel } from './three-piece-models.ts';

const palette = ['#76a796', '#ce8768', '#7599bc', '#d1ac60', '#a391b8', '#a9ad70'];
const timberNames = ['青竹', '赤陶', '靛蓝', '蜜蜡', '紫檀', '松石'];
const pieceIds = ['key', 'cross', 'upright', 'bridge', 'fork', 'crown'];

/** Merge only occupied face-adjacent cells: boxes in one timber never overlap. */
function timberBoxes(cells: readonly Vec3[], unit: number): Box[] {
  const remaining = new Set(cells.map((cell) => cell.join(',')));
  const result: Box[] = [];
  while (remaining.size) {
    const cell = remaining.values().next().value!.split(',').map(Number);
    let longest = { axis: 0, low: cell[0]!, high: cell[0]! };
    for (let axis = 0; axis < 3; axis++) {
      const neighbor = [...cell];
      while (remaining.has(neighbor.join(','))) neighbor[axis]!--;
      const low = neighbor[axis]! + 1;
      neighbor[axis] = cell[axis]!;
      while (remaining.has(neighbor.join(','))) neighbor[axis]!++;
      const high = neighbor[axis]! - 1;
      if (high - low > longest.high - longest.low) longest = { axis, low, high };
    }
    const { axis, low, high } = longest;
    const current = [...cell];
    for (let position = low; position <= high; position++) {
      current[axis] = position;
      remaining.delete(current.join(','));
    }
    result.push({
      min: cell.map((value, index) => (index === axis ? low : value) * unit) as unknown as Vec3,
      max: cell.map(
        (value, index) => ((index === axis ? high : value) + 1) * unit,
      ) as unknown as Vec3,
    });
  }
  return result;
}

/**
 * Each model records the actual saw cuts, followed by a rigid placement of each
 * rod in the assembled burr. Two parallel rods lie on each of X, Y and Z.
 * The last uncut drawing part is presented first as the removable key.
 */
function burrPieces(model: BurrModel): PieceDefinition[] {
  const unit = model.length === 12 ? 0.5 : 1;
  const drawingParts = [5, 0, 1, 2, 3, 4];
  return drawingParts.map((drawingPart, index) => {
    const { slot, permutation, signs } = model.placements[drawingPart]!;
    const axisIndex = Math.floor(slot / 2);
    const axis = ['x', 'y', 'z'][axisIndex] as Axis;
    const side = slot % 2 ? 1 : -1;
    const cells: Vec3[] = [];
    for (let x = 0; x < model.length; x++)
      for (let y = 0; y < 2; y++)
        for (let z = 0; z < 2; z++) {
          const local: Vec3 = [x, y, z];
          if (
            model.cuts[drawingPart]!.some(([min, max]) =>
              local.every((v, a) => v >= min[a]! && v < max[a]!),
            )
          )
            continue;
          const centered = [x + 0.5 - model.length / 2, y - 0.5, z - 0.5];
          cells.push(
            [0, 1, 2].map(
              (a) =>
                signs[a]! * centered[permutation[a]!]! +
                (a === (axisIndex + 1) % 3 ? side : 0) -
                0.5,
            ) as unknown as Vec3,
          );
        }
    return {
      id: pieceIds[index]!,
      name: `${timberNames[index]} · ${index === 0 ? '通钥' : `${drawingPart + 1} 号榫`}`,
      color: palette[index]!,
      axis,
      boxes: timberBoxes(cells, unit),
      range: [-8, 8],
      removedAt: 8,
    };
  });
}

function threePieces(model: readonly ThreePieceModel[], centeredCells = false): PieceDefinition[] {
  return model.map((part, index) => {
    const cells: Vec3[] = [];
    part.layers.forEach((layer, z) =>
      layer.split('\n').forEach((row, y) =>
        [...row].forEach((voxel, x) => {
          if (voxel !== '#') return;
          const local = [x, y, z];
          cells.push(
            [0, 1, 2].map(
              (axis) => part.signs[axis]! * local[part.permutation[axis]!]! + part.offset[axis]!,
            ) as unknown as Vec3,
          );
        }),
      ),
    );
    const boxes = timberBoxes(cells, 1).map(
      (box): Box =>
        centeredCells
          ? {
              min: box.min.map((value) => value - 0.5) as unknown as Vec3,
              max: box.max.map((value) => value - 0.5) as unknown as Vec3,
            }
          : box,
    );
    return {
      id: pieceIds[index]!,
      name: `${timberNames[index]} · ${'ABC'[index]} 榫`,
      color: palette[index]!,
      axis: ['x', 'y', 'z'][index] as Axis,
      boxes,
      range: [-8, 8],
      removedAt: 8,
    };
  });
}

const burrSource = (document: string, note: string) => ({
  title: document,
  url: `https://www.craftsmanspace.com/sites/default/files/free-plans-pdf-files/${encodeURIComponent(document)}.pdf`,
  note,
});

export const levels: readonly Level[] = [
  {
    id: 'burr-interlocking-6-v1',
    title: '六柱 · 双对榫',
    subtitle: '经典六件互锁',
    chapter: '六柱互锁',
    mechanic: '钥匙与对榫',
    clue: '两对相同榫条和一根双槽条，由通钥锁成整体。先辨认没有缺口的那一根。',
    description:
      '完整的三向六柱锁。抽出通钥后观察里面的槽口，既可以继续拆解，也可以随时沿原路装回。',
    difficulty: '入门',
    estimatedMinutes: '3–5 分钟',
    source: burrSource(
      'Six-piece interlocking puzzle plan',
      '按图纸第 2–4 页的 120×20×20 mm 木条及槽口独立建模；两对重复件。',
    ),
    pieces: burrPieces(interlockBurr),
  },
  {
    id: 'burr-solid-6-v1',
    title: '六柱 · 实心合锁',
    subtitle: '无内部空洞',
    chapter: '六柱互锁',
    mechanic: '五种异形榫',
    clue: '六根木条的槽形各不相同，拼合后内部完全填满。拆到中途，留意相邻榫条怎样互相让位。',
    description:
      '按无内部空洞六件锁制造图复原。每个缺口都有相邻木料填入，比较侧向移动和成组移动的不同。',
    difficulty: '进阶',
    estimatedMinutes: '4–7 分钟',
    source: burrSource(
      'Six-piece burr  puzzle without internal voids plan',
      '按图纸第 3–5 页建模；120×20×20 mm，最小槽阶 10 mm。',
    ),
    pieces: burrPieces(solidBurr),
  },
  {
    id: 'burr-short-6-v1',
    title: '六柱 · 短榫错槽',
    subtitle: '紧凑六件锁',
    chapter: '六柱互锁',
    mechanic: '错位半槽',
    clue: '短而厚的六根木条交错嵌合。先拆通钥，再观察不同宽度、不同方向的半槽。',
    description:
      '按简单槽六件锁制造图复原。102×34×34 mm 的短榫形成紧凑立体十字，拆开后可转动单件检查槽形，再试着复原。',
    difficulty: '进阶',
    estimatedMinutes: '4–7 分钟',
    source: burrSource(
      'Six-piece burr puzzle with simple notches plan',
      '按图纸第 3–8 页建模；102×34×34 mm，最小槽阶 17 mm。',
    ),
    pieces: burrPieces(simpleBurr),
  },
  {
    id: 'knoxli-three-piece-2009-v1',
    title: '三件 · 藏六柱',
    subtitle: 'KNOXLI’s 3 Piece Burr',
    chapter: '三件新构',
    mechanic: '借位与成组移动',
    clue: '看似六根木条，实际只有三个相连的异形件。先让出一格空间，再试着同时挪动另外两件。',
    description:
      'Roland Koch 于 2009 年设计的三件互锁。拼合后的六向十字里有四个内部空格，正确的让位会打开新的出口。',
    difficulty: '挑战',
    estimatedMinutes: '5–8 分钟',
    source: {
      title: 'KNOXLI’s 3 Piece Burr · Roland Koch (2009)',
      url: 'https://www.puzzlewillbeplayed.com/3PieceBurr/KNOXLIs3PieceBurr/',
      note: '由来源的逐层体素数据重建 A / B / C；31 + 31 + 38 格，完整六向十字中有 4 个内部空格。',
    },
    pieces: threePieces(knoxli),
  },
  {
    id: 'crystal-ball-2017-v1',
    title: '三件 · 晶球',
    subtitle: 'Crystal Ball',
    chapter: '三件新构',
    mechanic: '阶梯互锁',
    clue: '三件弯折木榫围成阶梯状晶球。观察中间层的空格，先挪一小步，再寻找能够整件退出的方向。',
    description:
      'Andrey Ustjuzhanin 于 2017 年设计的三件互锁。它用正交阶梯组成球状外形，适合对照完整形态观察每件的去向。',
    difficulty: '进阶',
    estimatedMinutes: '3–6 分钟',
    source: {
      title: 'Crystal Ball · Andrey Ustjuzhanin (2017)',
      url: 'https://www.puzzlewillbeplayed.com/3PieceBurr/CrystalBall/',
      note: '由来源的逐层体素数据重建 A / B / C；19 + 18 + 17 格，5×5×5 外包络，3 个内部空格。',
    },
    pieces: threePieces(crystalBall, true),
  },
];

export default levels;
