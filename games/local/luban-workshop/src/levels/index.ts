import type { Axis, Box, HintRule, Level, Phase, PieceDefinition, Vec3 } from '../core/types.ts';
import { IDENTITY_ORIENTATION } from '../core/rotation.ts';
import { interlockBurr, simpleBurr, solidBurr } from './burr-models.ts';
import type { BurrModel } from './burr-models.ts';
import { crystalBall, knoxli } from './three-piece-models.ts';
import type { ThreePieceModel } from './three-piece-models.ts';
import {
  beginnerCube,
  intricatePuzzle,
  min333,
  threeEasyPieces,
  tomsLittleBox,
} from './assembled-models.ts';
import type { AssembledModel } from './assembled-models.ts';
import { firstLift } from './tutorial.ts';

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

function assembledPieces(model: AssembledModel): PieceDefinition[] {
  const rows = model.layers.map((layer) => layer.split('\n'));
  const size: Vec3 = [rows[0]![0]!.length, rows[0]!.length, rows.length];
  const letters = [...new Set(model.layers.join('').replace(/[.\n]/g, ''))].sort();
  return letters.map((letter, index) => {
    const cells: Vec3[] = [];
    rows.forEach((layer, z) =>
      layer.forEach((row, y) =>
        [...row].forEach((voxel, x) => {
          if (voxel === letter) cells.push([x, y, z]);
        }),
      ),
    );
    return {
      id: pieceIds[index]!,
      name: `${timberNames[index]} · ${letter} 榫`,
      color: palette[index]!,
      axis: ['x', 'y', 'z'][index % 3] as Axis,
      boxes: timberBoxes(cells, model.unit).map((box) => ({
        min: box.min.map(
          (value, axis) => value - (size[axis]! * model.unit) / 2,
        ) as unknown as Vec3,
        max: box.max.map(
          (value, axis) => value - (size[axis]! * model.unit) / 2,
        ) as unknown as Vec3,
      })),
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

/** A small contact corridor, not a move counter: it also matches half-finished drags.
 * Other pieces can be anywhere; the shared planner validates their live collisions.
 */
function cubeCorridor(
  id: string,
  phase: Phase,
  min: Vec3,
  max: Vec3,
  axis: Axis,
  targetOffset: number,
  direction: -1 | 1,
  message: string,
): HintRule {
  return {
    id,
    phase,
    relativeToPieceId: 'key',
    when: [
      { pieceId: 'key', offset: [0, 0, 0], orientation: IDENTITY_ORIENTATION },
      { pieceId: 'cross', offsetRange: { min, max }, orientation: IDENTITY_ORIENTATION },
    ],
    action: {
      kind: 'move',
      pieceId: 'cross',
      pieceIds: ['cross'],
      axis,
      targetOffset,
      direction,
      message,
    },
  };
}

export const levels: readonly Level[] = [
  firstLift,
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
    hintRules: [
      {
        id: 'identify-the-uncut-key',
        phase: 'disassemble',
        when: pieceIds.map((pieceId) => ({
          pieceId,
          offset: [0, 0, 0] as Vec3,
          orientation: IDENTITY_ORIENTATION,
        })),
        action: {
          kind: 'move',
          pieceId: 'key',
          pieceIds: ['key'],
          axis: 'x',
          targetOffset: 7,
          direction: 1,
          message: 'A 是没有缺口的通钥；沿 X 轴抽出它，另外五根榫条才有让位空间。',
        },
      },
    ],
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
  {
    id: 'min-333-2008-v1',
    title: '方寸 · 九格三分',
    subtitle: 'Min 333-1',
    chapter: '方寸藏机',
    mechanic: '等体积异形榫',
    clue: '三件各占九格，却有不同的凹凸。先找到能滑出的那一件，再把剩下两件的齿口错开。',
    description:
      'Min S. Shih 于 2008 年设计的三件方块锁。完整外形只有 3×3×3，三个等体积零件必须按各自的槽口方向进出。',
    difficulty: '入门',
    estimatedMinutes: '2–4 分钟',
    source: {
      title: 'Min 333-1 · Min S. Shih (2008)',
      url: 'https://www.puzzlewillbeplayed.com/333/Min333/1/solution.html',
      note: '按来源完整装配的逐层字母格重建；A / B / C 各 9 格，实心 3×3×3。',
    },
    pieces: assembledPieces(min333),
  },
  {
    id: 'three-easy-pieces-2011-v1',
    title: '方寸 · 迂回三榫',
    subtitle: 'Three Easy Pieces',
    chapter: '方寸藏机',
    mechanic: '换轴退榫',
    clue: '第一件退出后，另外两件仍会咬住。不要只沿一个方向拉，先留意相扣部分下一条可走的缝。',
    description:
      'Richard Gain 于 2011 年设计的三件方块锁。名称虽叫 Three Easy Pieces，余下两件仍需分段让位，适合练习中途换轴。',
    difficulty: '进阶',
    estimatedMinutes: '3–5 分钟',
    source: {
      title: 'Three Easy Pieces · Richard Gain (2011)',
      url: 'https://www.puzzlewillbeplayed.com/333/ThreeEasyPieces/solution.html',
      note: '按来源完整装配逐层重建；10 + 10 + 7 格，实心 3×3×3，来源分离记录 1.4。',
    },
    pieces: assembledPieces(threeEasyPieces),
    hintRules: [
      cubeCorridor(
        'cross-clear-back-tooth',
        'disassemble',
        [0, 0, 0],
        [0, 0, 1],
        'z',
        1,
        1,
        '先把 B 榫沿 Z 轴移到一格的位置，为相扣的后齿留出通道。',
      ),
      cubeCorridor(
        'cross-slide-through-notch',
        'disassemble',
        [0, -1, 1],
        [0, 0, 1],
        'y',
        -1,
        -1,
        '后齿已经错开；把 B 榫沿 Y 轴负向滑到一格，让侧齿对齐缺口。',
      ),
      cubeCorridor(
        'cross-clear-side-tooth',
        'disassemble',
        [0, -1, 1],
        [1, -1, 1],
        'x',
        1,
        1,
        '沿 X 轴再让出一格，B 榫的侧齿就能越过 A 榫的挡肩。',
      ),
      cubeCorridor(
        'cross-return-to-side-gate',
        'reassemble',
        [1, -4, 1],
        [1, -1, 1],
        'y',
        -1,
        1,
        '先把 B 榫送回侧面的入口，保持 X 和 Z 方向各错开一格。',
      ),
      cubeCorridor(
        'cross-seat-side-tooth',
        'reassemble',
        [0, -1, 1],
        [1, -1, 1],
        'x',
        0,
        -1,
        '入口已对齐；先沿 X 轴收回侧齿，再沿另外两个方向合拢。',
      ),
      cubeCorridor(
        'cross-return-through-notch',
        'reassemble',
        [0, -1, 1],
        [0, 0, 1],
        'y',
        0,
        1,
        '沿 Y 轴把 B 榫送过缺口，最后保留 Z 轴的一格余量。',
      ),
      cubeCorridor(
        'cross-seat-back-tooth',
        'reassemble',
        [0, 0, 0],
        [0, 0, 1],
        'z',
        0,
        -1,
        '最后沿 Z 轴合上后齿，让 B 榫回到装配位置。',
      ),
    ],
  },
  {
    id: 'beginner-cube-levonen-v1',
    title: '方寸 · 藏心钥',
    subtitle: 'Basic Cube for Beginners',
    chapter: '方寸藏机',
    mechanic: '小钥与三面护榫',
    clue: '四件之中藏着一根只有两格的小钥。观察外壳的开放方向，拆开后再把小钥和护榫一层层装回。',
    description:
      'Juha Levonen 设计的四件入门方块锁。三件异形护榫与一根小钥拼成实心方块；两格小件让每一面槽口的作用更容易辨认。',
    difficulty: '入门',
    estimatedMinutes: '2–4 分钟',
    source: {
      title: 'Basic Cube for Beginners · Juha Levonen',
      url: 'https://www.puzzlewillbeplayed.com/333/BasicCubeForBeginners/solution.html',
      note: '按来源完整装配逐层重建；A / B / C / D 为 8 + 9 + 8 + 2 格；页面未注明设计年份。',
    },
    pieces: assembledPieces(beginnerCube),
  },
  {
    id: 'toms-little-box-2009-v1',
    title: '方寸 · 一隙盒',
    subtitle: 'Tom’s Little Box',
    chapter: '方寸藏机',
    mechanic: '借空格换位',
    clue: '方块中央留有一格空隙。先做小幅让位，让咬住的齿口经过空隙，再寻找整件退出的方向。',
    description:
      'Tom Jolly 于 2009 年设计的三件小盒。外表是完整方块，内部的一格空位为拆装提供换位空间。',
    difficulty: '进阶',
    estimatedMinutes: '3–6 分钟',
    source: {
      title: 'Tom’s Little Box · Tom Jolly (2009)',
      url: 'https://www.puzzlewillbeplayed.com/333/TomsLittleBox/solution.html',
      note: '按来源完整装配逐层重建；11 + 8 + 7 格，3×3×3 中央保留 1 格空隙。',
    },
    pieces: assembledPieces(tomsLittleBox),
  },
  {
    id: 'intricate-puzzle-mochalov-v1',
    title: '套匣 · 层叠机关',
    subtitle: 'Intricate Puzzle',
    chapter: '套匣相扣',
    mechanic: '内外套壳让位',
    clue: '三件厚实的套壳层层相扣。先沿接缝让出半格，观察内部横挡，复原时要先对齐内层的通道。',
    description:
      'Leonid Mochalov 设计的三件套匣。两侧外壳包住另外两件，内部留有空腔；需要先错开横挡，再抽出完整的内层。',
    difficulty: '挑战',
    estimatedMinutes: '4–7 分钟',
    source: {
      title: 'Intricate Puzzle · Leonid Mochalov',
      url: 'https://www.puzzlewillbeplayed.com/Misc/IntricatePuzzle/solution.html',
      note: '按来源 8×8×8 完整装配逐层重建，每体素缩为 0.5 场景单位；保留 24 格内部空腔，页面未注明设计年份。',
    },
    pieces: assembledPieces(intricatePuzzle),
  },
];

export default levels;
