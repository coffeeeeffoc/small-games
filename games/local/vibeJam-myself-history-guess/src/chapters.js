// Narrative names deliberately describe observation, never a scene's answer.
export const CHAPTERS = Object.freeze([
  {
    id: 'lanes',
    number: '壹',
    name: '街巷有回声',
    subtitle: '从人间烟火，读一座城',
    cover: 'kaifeng',
    levels: [
      { id: 'lanes-1', name: '初见烟火', scenes: ['kaifeng', 'changan', 'pingyao'] },
      { id: 'lanes-2', name: '人来人往', scenes: ['shanghai', 'new-york', 'paris'] },
      { id: 'lanes-3', name: '城中旧梦', scenes: ['beijing', 'kyoto-heian', 'hangzhou-song'] },
    ],
  },
  {
    id: 'tides',
    number: '贰',
    name: '沿着风与水',
    subtitle: '越过山海，循一条来路',
    cover: 'venice',
    levels: [
      { id: 'tides-1', name: '水岸来信', scenes: ['quanzhou', 'venice', 'macau'] },
      { id: 'tides-2', name: '远行的风', scenes: ['dunhuang', 'petra', 'istanbul'] },
      { id: 'tides-3', name: '山河之间', scenes: ['dujiangyan', 'suzhou-garden', 'machu-picchu'] },
    ],
  },
  {
    id: 'stones',
    number: '叁',
    name: '石头的记忆',
    subtitle: '以一砖一瓦，丈量岁月',
    cover: 'athens',
    levels: [
      { id: 'stones-1', name: '仰望之间', scenes: ['athens', 'angkor', 'florence'] },
      { id: 'stones-2', name: '不朽轮廓', scenes: ['rome', 'giza', 'lhasa-potala'] },
      { id: 'stones-3', name: '岁月深处', scenes: ['yinxu', 'qin-mausoleum', 'longmen'] },
    ],
  },
]);
export const LEVELS = CHAPTERS.flatMap((chapter) =>
  chapter.levels.map((level, index) => ({ ...level, chapter: chapter.id, number: index + 1 })),
);
export const levelById = (id) => LEVELS.find((level) => level.id === id);
export const chapterById = (id) => CHAPTERS.find((chapter) => chapter.id === id);
export function isUnlocked(id, records) {
  const index = LEVELS.findIndex((level) => level.id === id);
  return index === 0 || (index > 0 && Boolean(records[LEVELS[index - 1].id]?.complete));
}
export function nextLevel(records) {
  return LEVELS.find((level) => !records[level.id]?.complete) || LEVELS[0];
}
export function validateChapters(catalog) {
  const ids = new Set();
  for (const level of LEVELS) {
    if (
      ids.has(level.id) ||
      level.scenes.length !== 3 ||
      new Set(level.scenes).size !== 3 ||
      level.scenes.some((id) => !catalog.some((scene) => scene.id === id))
    )
      throw new Error('旅途目录不完整');
    ids.add(level.id);
  }
  return true;
}
