import expeditions from './expeditions.json' with { type: 'json' };

// Narrative names deliberately describe observation, never a scene's answer.
export const CHAPTERS = Object.freeze([
  {
    id: 'lanes',
    number: '壹',
    name: '街巷有回声',
    subtitle: '从人间烟火，读一座城',
    cover: 'kaifeng',
    levels: [
      {
        id: 'lanes-1',
        name: '初见烟火',
        seconds: 45,
        objective: '从街路、门面和运输方式，找到第一组线索。',
        scenes: ['kaifeng', 'changan', 'pingyao'],
      },
      {
        id: 'lanes-2',
        name: '人来人往',
        seconds: 45,
        objective: '比较建筑高度与街上的交通，分别判断地点和年代。',
        scenes: ['shanghai', 'new-york', 'paris'],
      },
      {
        id: 'lanes-3',
        name: '城中旧梦',
        seconds: 45,
        objective: '观察屋顶、门窗与空间布局，用两条线索核对直觉。',
        scenes: ['beijing', 'kyoto-heian', 'hangzhou-song'],
      },
    ],
  },
  {
    id: 'tides',
    number: '贰',
    name: '沿着风与水',
    subtitle: '越过山海，循一条来路',
    cover: 'venice',
    levels: [
      {
        id: 'tides-1',
        name: '水岸来信',
        seconds: 25,
        objective: '比较水岸、通道和门窗，判断这段水路的方向。',
        scenes: ['quanzhou', 'venice', 'macau'],
      },
      {
        id: 'tides-2',
        name: '远行的风',
        seconds: 25,
        objective: '先观察地形和材料，再用建筑轮廓缩小范围。',
        scenes: ['dunhuang', 'petra', 'istanbul'],
      },
      {
        id: 'tides-3',
        name: '山河之间',
        seconds: 25,
        objective: '观察自然地形与人工空间怎样连接。',
        scenes: ['dujiangyan', 'suzhou-garden', 'machu-picchu'],
      },
    ],
  },
  {
    id: 'stones',
    number: '叁',
    name: '石头的记忆',
    subtitle: '以一砖一瓦，丈量岁月',
    cover: 'athens',
    levels: [
      {
        id: 'stones-1',
        name: '仰望之间',
        seconds: 25,
        objective: '比较柱、塔和上部结构，寻找支撑与装饰线索。',
        scenes: ['athens', 'angkor', 'florence'],
      },
      {
        id: 'stones-2',
        name: '不朽轮廓',
        seconds: 25,
        objective: '结合建筑尺度、材料与环境核对第一眼判断。',
        scenes: ['rome', 'giza', 'lhasa-potala'],
      },
      {
        id: 'stones-3',
        name: '岁月深处',
        seconds: 25,
        objective: '仔细比较材料与布局；地标熟悉也要独立判断年代。',
        scenes: ['yinxu', 'qin-mausoleum', 'longmen'],
      },
    ],
  },
  ...expeditions,
]);
export const LEVELS = CHAPTERS.flatMap((chapter) =>
  chapter.levels.map((level, index) => ({ ...level, chapter: chapter.id, number: index + 1 })),
);
export const levelById = (id) => LEVELS.find((level) => level.id === id);
export const chapterById = (id) => CHAPTERS.find((chapter) => chapter.id === id);
export function isUnlocked(id, records) {
  const index = LEVELS.findIndex((level) => level.id === id);
  return (
    index >= 0 &&
    (index === 0 ||
      records[id]?.complete === true ||
      records[LEVELS[index - 1].id]?.complete === true)
  );
}
export function nextLevel(records) {
  return LEVELS.find((level) => !records[level.id]?.complete) || LEVELS[0];
}
export function validateChapters(catalog, chapters = CHAPTERS) {
  const ids = new Set(),
    chapterIds = new Set(),
    decks = new Set();
  const sceneIds = new Set(catalog.map((scene) => scene.id));
  const text = (value) => typeof value === 'string' && value.trim() && !/[<>]/.test(value);
  const id = (value) => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
  for (const chapter of chapters) {
    if (
      !id(chapter?.id) ||
      chapterIds.has(chapter.id) ||
      !text(chapter.number) ||
      !text(chapter.name) ||
      !text(chapter.subtitle) ||
      !sceneIds.has(chapter.cover) ||
      !Array.isArray(chapter.levels) ||
      !chapter.levels.length
    )
      throw new Error('旅途章节配置无效');
    chapterIds.add(chapter.id);
    for (const level of chapter.levels) {
      if (
        !id(level?.id) ||
        ids.has(level.id) ||
        !text(level.name) ||
        !text(level.objective) ||
        !Number.isInteger(level.seconds) ||
        level.seconds < 25 ||
        level.seconds > 60 ||
        !Array.isArray(level.scenes) ||
        level.scenes.length !== 3 ||
        new Set(level.scenes).size !== 3 ||
        level.scenes.some((id) => !sceneIds.has(id))
      )
        throw new Error('旅途目录不完整');
      const deck = [...level.scenes].sort().join('|');
      if (decks.has(deck)) throw new Error('旅途题组重复');
      ids.add(level.id);
      decks.add(deck);
    }
  }
  return true;
}
