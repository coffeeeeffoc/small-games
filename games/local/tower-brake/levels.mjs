/** Tower Brake content schema, version 1. All angles are clockwise radians. */
export const LEVEL_SCHEMA_VERSION = 1;
export const LEVEL_HEIGHT = 115;
export const FIRST_LAYER_Y = 120;
export const LAYER_COUNT = 12;

const TAU = Math.PI * 2;
const radians = (degrees) => (degrees * Math.PI) / 180;
const norm = (angle) => ((angle % TAU) + TAU) % TAU;
const arc = (center, width) => ({
  start: norm(radians(center - width / 2)),
  end: norm(radians(center + width / 2)),
});

// Each row is [gap center°, gap width°, danger center°, danger width°].
// Adjacent runs deliberately share a gap; the next run places danger at the
// previous gap and a new opening nearby, giving the brake a visible purpose.
const designs = [
  {
    id: 'first-brake',
    name: '留一脚刹车',
    subtitle: '三层连落，第一次救回',
    difficulty: 1,
    rows: [
      [0, 100, 210, 48],
      [0, 100, 205, 60],
      [0, 100, 215, 66],
      [74, 94, 0, 48],
      [74, 94, 250, 72],
      [74, 94, 255, 72],
      [148, 88, 74, 52],
      [148, 88, 310, 76],
      [148, 88, 320, 76],
      [215, 86, 148, 44],
      [215, 86, 20, 76],
    ],
  },
  {
    id: 'blue-current',
    name: '顺流而下',
    subtitle: '先连落六层，再转身',
    difficulty: 1,
    rows: [
      [0, 102, 225, 58],
      [0, 100, 215, 64],
      [0, 98, 220, 70],
      [0, 94, 230, 74],
      [0, 92, 220, 80],
      [0, 90, 215, 84],
      [78, 92, 0, 56],
      [78, 92, 250, 82],
      [78, 88, 265, 82],
      [150, 90, 78, 50],
      [150, 90, 325, 90],
    ],
  },
  {
    id: 'left-right',
    name: '左右逢源',
    subtitle: '左右切换，抓住空档',
    difficulty: 2,
    rows: [
      [0, 92, 225, 72],
      [0, 88, 215, 78],
      [0, 88, 210, 84],
      [70, 84, 0, 52],
      [70, 84, 265, 90],
      [70, 84, 255, 92],
      [355, 84, 70, 56],
      [355, 84, 180, 96],
      [355, 84, 195, 94],
      [70, 88, 355, 56],
      [70, 88, 255, 100],
    ],
  },
  {
    id: 'stepping-stones',
    name: '借力一跳',
    subtitle: '平台也是调整的机会',
    difficulty: 2,
    rows: [
      [0, 88, 225, 76],
      [18, 88, 220, 82],
      [36, 86, 215, 86],
      [108, 84, 36, 52],
      [124, 82, 300, 94],
      [140, 82, 305, 96],
      [210, 80, 140, 56],
      [226, 80, 35, 100],
      [242, 80, 50, 100],
      [310, 82, 242, 52],
      [325, 84, 150, 104],
    ],
  },
  {
    id: 'return-arc',
    name: '回旋余地',
    subtitle: '越过缺口，反向修正',
    difficulty: 3,
    rows: [
      [0, 86, 225, 80],
      [0, 84, 220, 88],
      [0, 82, 210, 96],
      [80, 80, 0, 64],
      [95, 80, 270, 100],
      [110, 78, 285, 102],
      [30, 78, 110, 66],
      [15, 78, 210, 104],
      [0, 76, 195, 106],
      [280, 80, 0, 64],
      [265, 80, 90, 108],
    ],
  },
  {
    id: 'narrow-margins',
    name: '窄门之间',
    subtitle: '放慢手势，对准落点',
    difficulty: 3,
    rows: [
      [0, 80, 225, 84],
      [0, 78, 215, 92],
      [0, 76, 210, 98],
      [68, 74, 0, 52],
      [68, 72, 250, 106],
      [68, 70, 255, 110],
      [136, 72, 68, 54],
      [136, 70, 310, 112],
      [136, 68, 315, 112],
      [204, 72, 136, 52],
      [204, 74, 25, 112],
    ],
  },
  {
    id: 'double-rescue',
    name: '两次救回',
    subtitle: '刹车用完，再攒一次',
    difficulty: 4,
    rows: [
      [0, 82, 225, 90],
      [0, 78, 215, 98],
      [0, 76, 210, 104],
      [82, 74, 0, 68],
      [82, 72, 265, 112],
      [82, 70, 260, 114],
      [164, 72, 82, 68],
      [164, 70, 345, 114],
      [164, 68, 340, 116],
      [246, 74, 164, 68],
      [246, 76, 65, 116],
    ],
  },
  {
    id: 'last-descent',
    name: '最后一跃',
    subtitle: '十二层，把节奏握在手里',
    difficulty: 4,
    rows: [
      [0, 78, 225, 94],
      [12, 76, 215, 102],
      [24, 74, 210, 110],
      [102, 70, 24, 66],
      [114, 68, 295, 116],
      [126, 66, 305, 120],
      [48, 68, 126, 66],
      [36, 66, 220, 122],
      [24, 64, 205, 124],
      [306, 70, 24, 66],
      [294, 72, 110, 122],
    ],
  },
];

export const LEVELS = designs.map(({ rows, ...description }, order) => ({
  ...description,
  schemaVersion: LEVEL_SCHEMA_VERSION,
  order: order + 1,
  unlockAfter: order === 0 ? null : designs[order - 1].id,
  layers: [
    ...rows.map(([gapCenter, gapWidth, dangerCenter, dangerWidth], index) => ({
      index,
      y: FIRST_LAYER_Y + index * LEVEL_HEIGHT,
      gap: arc(gapCenter, gapWidth),
      danger: [arc(dangerCenter, dangerWidth)],
      finish: false,
    })),
    { index: 11, y: FIRST_LAYER_Y + 11 * LEVEL_HEIGHT, gap: null, danger: [], finish: true },
  ],
}));

/** Fail early on malformed content rather than hiding a broken route in play. */
export function validateLevel(level) {
  const contains = (part, angle) => norm(angle - part.start) < norm(part.end - part.start);
  if (!level?.id) throw new Error('A level ID is required.');
  if (level.schemaVersion !== LEVEL_SCHEMA_VERSION)
    throw new Error(`Unsupported schema: ${level.id}`);
  if (!Array.isArray(level.layers) || level.layers.length !== LAYER_COUNT)
    throw new Error(`Expected 12 layers: ${level.id}`);
  for (const [index, layer] of level.layers.entries()) {
    if (
      layer.index !== index ||
      !Number.isFinite(layer.y) ||
      (index && layer.y <= level.layers[index - 1].y)
    ) {
      throw new Error(`Invalid layer order: ${level.id}/${index}`);
    }
    if (index === 11) {
      if (!layer.finish || layer.gap || layer.danger.length)
        throw new Error(`Finish must be safe: ${level.id}`);
      continue;
    }
    if (layer.finish || !layer.gap || !Array.isArray(layer.danger))
      throw new Error(`Invalid ring: ${level.id}/${index}`);
    for (const part of [layer.gap, ...layer.danger]) {
      if (
        ![part.start, part.end].every(
          (value) => Number.isFinite(value) && value >= 0 && value < TAU,
        ) ||
        norm(part.end - part.start) < 0.2
      ) {
        throw new Error(`Invalid arc: ${level.id}/${index}`);
      }
    }
    for (const part of layer.danger) {
      if (
        contains(layer.gap, part.start) ||
        contains(layer.gap, part.end) ||
        contains(part, layer.gap.start)
      ) {
        throw new Error(`Gap overlaps danger: ${level.id}/${index}`);
      }
    }
  }
  const first = level.layers[0];
  if (
    contains(first.gap, Math.PI / 2) ||
    first.danger.some((part) => contains(part, Math.PI / 2))
  ) {
    throw new Error(`Initial landing must be ordinary: ${level.id}`);
  }
  return true;
}

export function validateLevels(levels = LEVELS) {
  const ids = new Set();
  for (const [position, level] of levels.entries()) {
    validateLevel(level);
    if (ids.has(level.id)) throw new Error('Level IDs must be unique.');
    if (level.unlockAfter !== (position ? levels[position - 1].id : null))
      throw new Error(`Invalid unlock: ${level.id}`);
    ids.add(level.id);
  }
  return true;
}

validateLevels();
