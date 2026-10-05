// Original fictional scenes. Difficulty changes the signal-to-noise ratio,
// never the master volume. The same source clip is used for scene and answer.
export const LEVELS = [
  ['雨夜门廊', '细雨落在檐下。先记住那个人说话的质感。', 18, 1, 'rain'],
  ['值班走廊', '通风机轻轻转动，一句话从走廊尽头传来。', 16, 1, 'vent'],
  ['旧书店外', '屋外雨声变密，留意气息和字尾。', 14, 1, 'rain'],
  ['末班站台', '远处的车流渐近，别被背景的节奏带走。', 12, 1, 'traffic'],
  ['雨棚之下', '雨声叠上低鸣。可以来回试听，不必急着下结论。', 10, 2, 'rain'],
  ['地下通道', '风声和机械声交错，抓住声音的厚薄。', 8, 2, 'vent'],
  ['街角灯箱', '车流从耳边掠过，留意连续几个字的发声习惯。', 6, 2, 'traffic'],
  ['午夜货梯', '低鸣里多了一层沙沙声，三份录音依然说同一句话。', 4, 2, 'vent'],
  ['天桥雨幕', '雨点、风声与低鸣混在一起，仔细听人声的轮廓。', 2, 3, 'rain'],
  ['十字路口', '多层车流掩住字尾。按自己的节奏重听。', 0, 3, 'traffic'],
  ['机房门外', '人声藏在持续的机械声里，这次需要耐心。', -2, 3, 'vent'],
  ['最后一段录音', '杂声已经盖过人声。凭音色完成最后一次比对。', -4, 3, 'traffic'],
].map(([title, description, snrDb, complexity, texture], index) => ({
  id: index + 1,
  title,
  description,
  snrDb,
  complexity,
  texture,
  phraseIndex: index % 4,
  stage: index < 4 ? '初听 · 寻找轮廓' : index < 8 ? '细听 · 穿过杂声' : '深听 · 捕捉声线',
}));

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function validateManifest(manifest) {
  if (manifest?.voices?.length < 3 || manifest?.phrases?.length < 4)
    throw new Error('需要四句话与至少三个固定音色的本地素材。');
  const voices = manifest.voices.map((voice) => voice.id);
  if (new Set(voices).size !== voices.length) throw new Error('音色标识重复。');
  for (const phrase of manifest.phrases) {
    if (
      !phrase.id ||
      phrase.clips?.length !== voices.length ||
      new Set(phrase.clips?.map((clip) => clip.voiceId)).size !== voices.length
    )
      throw new Error('语音素材映射不完整。');
    for (const id of voices) {
      const clip = phrase.clips.find((item) => item.voiceId === id);
      if (!clip || !/^\.?\/?assets\/audio\/[\w-]+\.wav$/.test(clip.url))
        throw new Error('语音素材必须使用随游戏提供的本地 WAV 文件。');
    }
  }
  return manifest;
}

export function createRun(manifest, seed) {
  validateManifest(manifest);
  const random = seededRandom(seed);
  // Balanced targets; shuffled separately from candidate positions.
  const targets = shuffle(
    LEVELS.map((_, index) => manifest.voices[index % 3].id),
    random,
  );
  return LEVELS.map((level, index) => {
    const phrase = manifest.phrases[level.phraseIndex];
    const targetId = targets[index];
    const candidates = shuffle(
      manifest.voices
        .slice(0, 3)
        .map((voice) => phrase.clips.find((clip) => clip.voiceId === voice.id)),
      random,
    );
    const correctIndex = candidates.findIndex((clip) => clip.voiceId === targetId);
    if (correctIndex < 0) throw new Error('现场音源不在候选中。');
    return {
      ...level,
      candidates,
      correctIndex,
      target: candidates[correctIndex],
      noiseSeed: Math.floor(random() * 4294967296),
    };
  });
}

export function judge(round, selected) {
  if (!Number.isInteger(selected) || selected < 0 || selected > 2)
    throw new Error('请先选择一份录音。');
  return { correct: selected === round.correctIndex, correctIndex: round.correctIndex };
}
