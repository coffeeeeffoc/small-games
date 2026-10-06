/** Original seeded region partitions, generated offline and checked for connected plots and a unique solution. */
export type Level = {
  id: string;
  number: number;
  chapter: number;
  title: string;
  size: number;
  regions: number[];
};

export const LEVELS: Level[] = [
  {
    id: 'moss-01',
    number: 1,
    chapter: 1,
    title: '第一束光',
    size: 4,
    regions: [0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 0, 1, 2, 2, 3, 1],
  },
  {
    id: 'moss-02',
    number: 2,
    chapter: 1,
    title: '露珠方格',
    size: 4,
    regions: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 3, 2, 3, 3, 3, 3],
  },
  {
    id: 'moss-03',
    number: 3,
    chapter: 1,
    title: '轻触苔叶',
    size: 4,
    regions: [0, 0, 3, 3, 0, 0, 3, 1, 2, 2, 3, 3, 2, 3, 3, 3],
  },
  {
    id: 'moss-04',
    number: 4,
    chapter: 1,
    title: '晨风入园',
    size: 4,
    regions: [2, 0, 1, 1, 2, 0, 1, 1, 2, 0, 1, 1, 2, 2, 3, 3],
  },
  {
    id: 'moss-05',
    number: 5,
    chapter: 1,
    title: '微光相伴',
    size: 4,
    regions: [2, 0, 0, 0, 2, 0, 1, 1, 2, 3, 3, 3, 2, 3, 3, 3],
  },
  {
    id: 'moss-06',
    number: 6,
    chapter: 1,
    title: '小径初成',
    size: 4,
    regions: [1, 1, 0, 0, 1, 1, 0, 0, 3, 3, 2, 2, 3, 3, 3, 2],
  },
  {
    id: 'moss-07',
    number: 7,
    chapter: 2,
    title: '溪边芽语',
    size: 5,
    regions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 3, 4, 2, 4, 3, 3, 4, 4, 4, 3, 3],
  },
  {
    id: 'moss-08',
    number: 8,
    chapter: 2,
    title: '水纹绕行',
    size: 5,
    regions: [1, 0, 0, 0, 0, 1, 0, 2, 0, 2, 1, 2, 2, 2, 2, 4, 2, 2, 2, 3, 4, 4, 2, 2, 3],
  },
  {
    id: 'moss-09',
    number: 9,
    chapter: 2,
    title: '石间新芽',
    size: 5,
    regions: [0, 2, 2, 2, 1, 0, 2, 1, 1, 1, 2, 2, 4, 1, 1, 4, 2, 4, 4, 3, 4, 4, 4, 4, 4],
  },
  {
    id: 'moss-10',
    number: 10,
    chapter: 2,
    title: '清流花圃',
    size: 5,
    regions: [1, 0, 0, 2, 2, 1, 3, 2, 2, 2, 3, 3, 3, 2, 2, 3, 3, 3, 2, 4, 3, 3, 3, 3, 4],
  },
  {
    id: 'moss-11',
    number: 11,
    chapter: 2,
    title: '叶影交错',
    size: 5,
    regions: [1, 1, 1, 0, 0, 3, 1, 1, 0, 0, 3, 3, 3, 2, 2, 3, 3, 3, 3, 2, 4, 3, 3, 3, 2],
  },
  {
    id: 'moss-12',
    number: 12,
    chapter: 2,
    title: '溪光汇聚',
    size: 5,
    regions: [4, 1, 1, 0, 0, 4, 1, 1, 0, 2, 4, 1, 3, 3, 2, 4, 4, 3, 3, 3, 4, 4, 4, 3, 3],
  },
  {
    id: 'moss-13',
    number: 13,
    chapter: 3,
    title: '蕨叶舒展',
    size: 6,
    regions: [
      1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 2, 5, 3, 1, 1, 1, 5, 5, 3, 3, 4, 4, 5,
      5, 3, 3, 4, 4,
    ],
  },
  {
    id: 'moss-14',
    number: 14,
    chapter: 3,
    title: '幽径分岔',
    size: 6,
    regions: [
      0, 2, 3, 3, 3, 3, 2, 2, 3, 1, 3, 3, 2, 2, 3, 3, 3, 3, 2, 4, 4, 3, 3, 3, 4, 4, 4, 4, 3, 5, 4,
      4, 4, 4, 3, 5,
    ],
  },
  {
    id: 'moss-15',
    number: 15,
    chapter: 3,
    title: '苔阶错落',
    size: 6,
    regions: [
      2, 2, 0, 3, 3, 1, 2, 2, 2, 3, 3, 1, 2, 2, 2, 2, 3, 1, 4, 2, 2, 3, 3, 3, 4, 3, 3, 3, 3, 3, 4,
      3, 3, 3, 5, 5,
    ],
  },
  {
    id: 'moss-16',
    number: 16,
    chapter: 3,
    title: '林间织影',
    size: 6,
    regions: [
      1, 0, 0, 0, 0, 2, 1, 3, 2, 2, 2, 2, 3, 3, 2, 2, 2, 2, 3, 3, 2, 4, 2, 2, 3, 2, 2, 4, 4, 2, 3,
      2, 2, 4, 4, 5,
    ],
  },
  {
    id: 'moss-17',
    number: 17,
    chapter: 3,
    title: '微雨留痕',
    size: 6,
    regions: [
      1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 2, 2, 3, 3, 1, 2, 2, 2, 5, 3, 4, 4, 4, 2, 5, 5, 4, 4, 4, 2, 5,
      5, 4, 4, 4, 4,
    ],
  },
  {
    id: 'moss-18',
    number: 18,
    chapter: 3,
    title: '蕨影成诗',
    size: 6,
    regions: [
      0, 0, 3, 1, 1, 1, 0, 0, 3, 1, 1, 1, 2, 2, 3, 1, 5, 4, 5, 2, 3, 5, 5, 4, 5, 5, 5, 5, 5, 4, 5,
      5, 5, 5, 5, 5,
    ],
  },
  {
    id: 'moss-19',
    number: 19,
    chapter: 4,
    title: '月露落点',
    size: 7,
    regions: [
      2, 2, 2, 2, 2, 2, 0, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 4, 4, 2, 2, 3, 3, 3, 4, 4, 2,
      2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 3, 6, 5, 5, 5, 5, 5, 5,
    ],
  },
  {
    id: 'moss-20',
    number: 20,
    chapter: 4,
    title: '长廊花影',
    size: 7,
    regions: [
      0, 0, 0, 0, 0, 1, 1, 2, 0, 0, 0, 0, 1, 1, 2, 2, 2, 0, 1, 1, 1, 3, 2, 2, 2, 2, 1, 1, 3, 2, 2,
      4, 2, 5, 5, 2, 2, 2, 4, 6, 5, 5, 2, 2, 2, 6, 6, 6, 6,
    ],
  },
  {
    id: 'moss-21',
    number: 21,
    chapter: 4,
    title: '晚风回环',
    size: 7,
    regions: [
      2, 2, 2, 1, 1, 1, 0, 2, 2, 2, 3, 1, 1, 1, 2, 2, 3, 3, 3, 1, 1, 2, 4, 3, 3, 3, 1, 1, 2, 4, 4,
      3, 3, 5, 1, 6, 6, 6, 3, 3, 5, 1, 6, 6, 6, 6, 3, 3, 1,
    ],
  },
  {
    id: 'moss-22',
    number: 22,
    chapter: 4,
    title: '清辉之间',
    size: 7,
    regions: [
      1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 3, 3, 4, 2, 2, 1, 1, 3, 3, 4, 4, 2, 5, 5, 3, 3, 4, 4, 5,
      5, 5, 3, 3, 5, 5, 5, 5, 5, 3, 5, 6, 5, 5, 5, 5, 5, 5,
    ],
  },
  {
    id: 'moss-23',
    number: 23,
    chapter: 4,
    title: '夜露相连',
    size: 7,
    regions: [
      1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 3, 3, 4, 4, 2, 1, 3, 3, 3, 4, 4, 2, 5, 3, 3, 3, 4, 4, 4,
      5, 3, 5, 3, 4, 4, 4, 5, 5, 5, 3, 6, 4, 4, 5, 5, 5, 3,
    ],
  },
  {
    id: 'moss-24',
    number: 24,
    chapter: 4,
    title: '满庭月光',
    size: 7,
    regions: [
      1, 1, 1, 0, 0, 0, 6, 1, 0, 0, 0, 0, 0, 6, 1, 0, 3, 2, 2, 0, 6, 1, 5, 3, 3, 2, 4, 6, 5, 5, 5,
      5, 4, 4, 6, 5, 5, 5, 5, 5, 6, 6, 5, 5, 5, 5, 6, 6, 6,
    ],
  },
  {
    id: 'moss-25',
    number: 25,
    chapter: 5,
    title: '星苔初现',
    size: 8,
    regions: [
      2, 2, 2, 2, 2, 2, 1, 0, 2, 2, 2, 2, 2, 1, 1, 0, 2, 2, 2, 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 3, 3,
      3, 5, 5, 5, 4, 3, 3, 3, 3, 5, 5, 5, 5, 6, 6, 3, 3, 7, 5, 5, 6, 6, 6, 3, 3, 7, 5, 5, 5, 6, 6,
      6, 3,
    ],
  },
  {
    id: 'moss-26',
    number: 26,
    chapter: 5,
    title: '流萤轨迹',
    size: 8,
    regions: [
      1, 1, 0, 0, 0, 0, 3, 3, 1, 1, 1, 1, 3, 3, 3, 3, 1, 1, 1, 3, 3, 3, 2, 2, 1, 1, 1, 3, 3, 2, 2,
      2, 1, 1, 3, 3, 3, 4, 5, 5, 1, 1, 3, 3, 3, 4, 5, 5, 1, 1, 3, 3, 6, 6, 5, 5, 7, 7, 3, 3, 6, 6,
      5, 5,
    ],
  },
  {
    id: 'moss-27',
    number: 27,
    chapter: 5,
    title: '深庭光屿',
    size: 8,
    regions: [
      4, 4, 4, 4, 4, 0, 0, 1, 4, 4, 4, 4, 4, 0, 3, 1, 6, 4, 4, 4, 2, 3, 3, 3, 6, 6, 4, 4, 3, 3, 3,
      3, 6, 4, 4, 4, 4, 3, 3, 3, 6, 6, 5, 5, 5, 5, 5, 3, 6, 6, 7, 7, 5, 5, 5, 3, 6, 7, 7, 7, 7, 7,
      7, 3,
    ],
  },
  {
    id: 'moss-28',
    number: 28,
    chapter: 5,
    title: '繁星落园',
    size: 8,
    regions: [
      4, 4, 1, 1, 0, 0, 0, 2, 4, 4, 4, 1, 1, 2, 2, 2, 4, 4, 4, 4, 2, 2, 5, 2, 4, 4, 3, 5, 5, 5, 5,
      2, 4, 4, 4, 5, 5, 5, 5, 2, 4, 4, 6, 6, 5, 5, 5, 5, 6, 6, 6, 5, 5, 5, 5, 5, 6, 6, 6, 5, 5, 5,
      5, 7,
    ],
  },
  {
    id: 'moss-29',
    number: 29,
    chapter: 5,
    title: '秘境回声',
    size: 8,
    regions: [
      6, 6, 0, 0, 0, 0, 2, 2, 6, 1, 1, 1, 1, 0, 0, 2, 6, 6, 4, 7, 2, 2, 2, 2, 3, 6, 4, 7, 2, 2, 2,
      2, 6, 6, 4, 7, 2, 2, 5, 2, 6, 6, 4, 7, 7, 5, 5, 2, 6, 6, 7, 7, 7, 5, 5, 2, 6, 7, 7, 7, 7, 7,
      7, 7,
    ],
  },
  {
    id: 'moss-30',
    number: 30,
    chapter: 5,
    title: '花园常明',
    size: 8,
    regions: [
      1, 1, 0, 0, 0, 0, 3, 3, 1, 1, 0, 2, 3, 3, 3, 3, 1, 1, 6, 2, 3, 3, 3, 3, 6, 6, 6, 6, 5, 3, 4,
      4, 6, 6, 6, 6, 5, 3, 4, 4, 6, 6, 6, 6, 5, 7, 4, 4, 6, 6, 6, 7, 7, 7, 4, 4, 6, 6, 6, 7, 7, 7,
      7, 7,
    ],
  },
];

export type Chapter = {
  id: number;
  number: number;
  title: string;
  subtitle: string;
  size: number;
  levelIds: string[];
};

export const CHAPTERS: Chapter[] = [
  {
    id: 1,
    number: 1,
    title: '露珠初醒',
    subtitle: '从小花圃开始，学会为光种留出空间。',
    size: 4,
    levelIds: LEVELS.filter((level) => level.chapter === 1).map((level) => level.id),
  },
  {
    id: 2,
    number: 2,
    title: '溪畔微光',
    subtitle: '花圃延伸到溪边，观察每一行和每一列。',
    size: 5,
    levelIds: LEVELS.filter((level) => level.chapter === 2).map((level) => level.id),
  },
  {
    id: 3,
    number: 3,
    title: '蕨影小径',
    subtitle: '交错的花圃里，先找只剩一格的位置。',
    size: 6,
    levelIds: LEVELS.filter((level) => level.chapter === 3).map((level) => level.id),
  },
  {
    id: 4,
    number: 4,
    title: '月露长廊',
    subtitle: '把排除标记连起来，寻找下一颗光种。',
    size: 7,
    levelIds: LEVELS.filter((level) => level.chapter === 4).map((level) => level.id),
  },
  {
    id: 5,
    number: 5,
    title: '星苔秘境',
    subtitle: '照亮整座花园，完成更细致的推理。',
    size: 8,
    levelIds: LEVELS.filter((level) => level.chapter === 5).map((level) => level.id),
  },
];

export function getLevel(id: string): Level | undefined {
  return LEVELS.find((level) => level.id === id);
}

/** Catalog references are validated alongside individual boards in the content test. */
export function validateCatalog(): void {
  if (new Set(LEVELS.map((level) => level.id)).size !== LEVELS.length)
    throw new Error('Duplicate level IDs');
  for (const [index, level] of LEVELS.entries()) {
    if (
      level.number !== index + 1 ||
      !CHAPTERS.some(
        (chapter) =>
          chapter.id === level.chapter &&
          chapter.size === level.size &&
          chapter.levelIds.includes(level.id),
      )
    )
      throw new Error(`Invalid catalog reference: ${level.id}`);
  }
}
