/** Game-owned content, measured in a 390 × 700 portrait playfield. */
export const CONTENT_VERSION = 1;
export const VIEWPORT = Object.freeze({ width: 390, height: 700 });

const cage = (id, x, y, hp = 1) => ({ id, x, y, w: 50, h: 54, hp });
const brick = (id, x, y, w = 54) => ({ id, x, y, w, h: 18, hp: 1 });
const row = (prefix, xs, y) => xs.map((x, i) => brick(`${prefix}-${i + 1}`, x, y));
const makeLevel = (index, name, subtitle, hint, cages, bricks, changes = {}) => ({
  schemaVersion: CONTENT_VERSION,
  id: `rescue-${String(index + 1).padStart(2, '0')}`,
  name,
  subtitle,
  hint,
  unlockAfter: index ? `rescue-${String(index).padStart(2, '0')}` : null,
  target: cages.length,
  lives: 3,
  ballSpeed: 250,
  personSpeed: 38,
  paddleWidth: 108,
  releaseGap: 2.0,
  cages,
  bricks,
  ...changes,
});

export const LEVELS = [
  makeLevel(
    0,
    '初次救援',
    '先破笼，再接住',
    '队友会缓慢下落。先把挡板移到队友下方。',
    [
      cage('a', 49, 108),
      cage('b', 170, 108),
      cage('c', 291, 108),
      cage('d', 49, 211),
      cage('e', 170, 211),
      cage('f', 291, 211),
    ],
    [...row('lower', [89, 247], 305), brick('upper', 168, 181)],
    { initialAngle: -0.38 },
  ),
  makeLevel(
    1,
    '左右照应',
    '把接球与接人串起来',
    '挡板边缘能改变球的方向，让球去往下一位队友。',
    [
      cage('a', 39, 112),
      cage('b', 170, 146),
      cage('c', 301, 112),
      cage('d', 63, 239),
      cage('e', 170, 260),
      cage('f', 277, 239),
    ],
    [...row('bridge', [36, 170, 300], 337), ...row('upper', [105, 229], 215)],
    { initialAngle: 0.4 },
  ),
  makeLevel(
    2,
    '双重锁扣',
    '有些笼子需要两次命中',
    '双重锁扣会先破一层，可以留下最后一下，等路线合适再救。',
    [
      cage('a', 49, 108, 2),
      cage('b', 170, 108, 2),
      cage('c', 291, 108, 2),
      cage('d', 49, 240),
      cage('e', 170, 203),
      cage('f', 291, 240),
    ],
    [...row('bridge', [54, 168, 282], 330), ...row('upper', [107, 227], 188)],
    { ballSpeed: 258, initialAngle: -0.38 },
  ),
  makeLevel(
    3,
    '阶梯营救',
    '从顺手的一侧开始',
    '笼子的高度不同，留意队友到达挡板的先后顺序。',
    [
      cage('a', 35, 107, 2),
      cage('b', 143, 142),
      cage('c', 251, 177, 2),
      cage('d', 67, 235),
      cage('e', 175, 270, 2),
      cage('f', 283, 305),
    ],
    [
      brick('step-a', 91, 180, 45),
      brick('step-b', 199, 221, 45),
      brick('step-c', 115, 355),
      brick('step-d', 234, 382),
    ],
    { ballSpeed: 265, paddleWidth: 104, initialAngle: 0.42 },
  ),
  makeLevel(
    4,
    '两翼救援',
    '别让两边一起着急',
    '先释放一侧的队友，再把球带到另一侧。',
    [
      cage('a', 38, 111, 2),
      cage('b', 104, 191),
      cage('c', 38, 280, 2),
      cage('d', 302, 111, 2),
      cage('e', 236, 191),
      cage('f', 302, 280, 2),
    ],
    [...row('center', [167], 130), ...row('center2', [167], 232), ...row('lower', [85, 250], 373)],
    { ballSpeed: 272, personSpeed: 40, paddleWidth: 104, initialAngle: -0.43 },
  ),
  makeLevel(
    5,
    '全员待命',
    '一个都不能少',
    '救回全部队友才算通关。规划破笼顺序，把每个人都接回家。',
    [
      cage('a', 49, 106, 2),
      cage('b', 170, 146, 2),
      cage('c', 291, 106, 2),
      cage('d', 49, 272, 2),
      cage('e', 170, 234),
      cage('f', 291, 272, 2),
    ],
    [...row('upper', [104, 228], 197), ...row('lower', [39, 168, 297], 368)],
    { ballSpeed: 280, personSpeed: 40, paddleWidth: 100, initialAngle: 0.38 },
  ),
];

/** Chapter mechanics are content; the simulation never branches on a level ID. */
function withMechanics(level, stage) {
  if (stage < 7) return level;
  const wind = stage >= 13 && stage !== 19;
  const beam = stage >= 19;
  const engineer = stage !== 13 && stage !== 19;
  const medic = stage >= 25;
  const names = [
    engineer && '工程师',
    wind && '阵风',
    beam && '金属横梁',
    medic && '医疗员',
  ].filter(Boolean);
  return {
    ...level,
    chapter:
      stage < 13 ? '小队支援' : stage < 19 ? '风中接力' : stage < 25 ? '钢梁迷阵' : '极夜协作',
    subtitle: names.join(' · '),
    hint:
      stage === 7
        ? '蓝色工具标记是工程师，接住后挡板加宽 8 秒。'
        : stage === 13
          ? '阵风会吹动队友，跟着下方的预计落点接人。'
          : stage === 19
            ? '铆钉钢梁无法打碎，让球从两边绕过去。'
            : stage === 25
              ? '绿色十字是医疗员，接住补回一次球机会，最多三次。'
              : '先接支援队员，再绕过钢梁；留意阵风中的接人落点。',
    // New mechanics get reaction room instead of stacking with maximum raw speed.
    ballSpeed: Math.min(level.ballSpeed, 282 + Math.max(0, stage - 7) * 0.85),
    personSpeed: Math.min(level.personSpeed, 39 + Math.max(0, stage - 7) * 0.22),
    releaseGap: Math.max(1.9, level.releaseGap),
    bricks: level.bricks.map((item) => ({ ...item, hp: beam ? 1 : item.hp })),
    cages: level.cages.map((item, index) => ({
      ...item,
      role: engineer && index === 0 ? 'engineer' : medic && index === 4 ? 'medic' : 'teammate',
    })),
    wind: wind
      ? { amplitude: 12 + Math.min(10, (stage - 13) * 0.6), period: 8, phase: stage % 3 }
      : null,
    barriers: beam ? [{ id: 'steel-beam', x: 159, y: 424, w: 72, h: 16, material: 'steel' }] : [],
  };
}

// Keep the first six rescue IDs and layouts stable for existing saves.
const training = LEVELS.slice();
const chapters = ['街区接力', '高塔穿梭', '夜幕突围', '黎明营救'];
for (let index = 6; index < 30; index++) {
  const base = training[index % training.length];
  const tier = (index - 6) / 23;
  const mirror = Math.floor(index / 6) % 2 === 1;
  const transform = (entity, position, reinforced = false) => ({
    ...entity,
    x: Math.max(
      20,
      Math.min(
        370 - entity.w,
        (mirror ? VIEWPORT.width - entity.x - entity.w : entity.x) + ((index % 4) - 1.5) * 2,
      ),
    ),
    hp: reinforced || position < Math.max(1, Math.floor(tier * 6)) ? 2 : entity.hp,
  });
  LEVELS.push(
    withMechanics(
      makeLevel(
        index,
        `${chapters[Math.floor((index - 6) / 6)]} ${(index % 6) + 1}`,
        index < 18 ? '观察锁扣，分配救援顺序' : '狭窄挡板，稳住连续救援',
        '两侧切换前先判断球与队友的落点，连续救援能短暂拓宽挡板。',
        base.cages.map((item, i) => transform(item, i, index >= 18)),
        base.bricks.map((item, i) => transform(item, i, index >= 24)),
        {
          ballSpeed: 281 + tier * 34,
          personSpeed: 40 + tier * 6,
          paddleWidth: 100 - tier * 4,
          releaseGap: 2 - tier * 0.45,
          initialAngle: [12, 29].includes(index)
            ? -0.22
            : (mirror ? -1 : 1) * (0.38 + (index % 4) * 0.015),
        },
      ),
      index + 1,
    ),
  );
}

/** A fresh, deterministic wave; difficulty levels off, the wave count does not. */
export function createEndlessLevel(wave = 1, seed = 0) {
  if (!Number.isSafeInteger(wave) || wave < 1) throw new RangeError('Invalid endless wave.');
  const difficulty = Math.min(29, wave - 1);
  const hash = Math.imul((seed >>> 0) ^ wave, 2654435761) >>> 0;
  const layout = LEVELS[(wave - 1) % Math.min(LEVELS.length, Math.max(1, wave))];
  const shiftX = (hash % 7) - 3;
  const shiftY = ((hash >>> 8) % 7) - 3;
  const shape = (item) => ({
    ...item,
    x: (hash & 128 ? VIEWPORT.width - item.x - item.w : item.x) + shiftX,
    y: item.y + shiftY,
  });
  const tuning = LEVELS[difficulty];
  return withMechanics(
    {
      ...structuredClone(layout),
      id: `endless-${wave}`,
      name: `无尽救援 · 第 ${wave} 波`,
      unlockAfter: null,
      wave,
      ballSpeed: tuning.ballSpeed,
      personSpeed: tuning.personSpeed,
      paddleWidth: tuning.paddleWidth,
      releaseGap: tuning.releaseGap,
      cages: layout.cages.map((item, i) => ({
        ...shape(item),
        hp: difficulty >= 17 || (i + hash) % 6 < difficulty / 5 ? 2 : 1,
      })),
      bricks: layout.bricks.map((item) => ({ ...shape(item), hp: difficulty >= 23 ? 2 : 1 })),
    },
    Math.min(30, wave),
  );
}

/** Return all content errors, keeping validation usable by tests and content tooling. */
export function validateLevels(levels = LEVELS) {
  const errors = [];
  const levelIds = new Set();
  if (!Array.isArray(levels) || levels.length < 1) return ['At least one level is required.'];
  for (const [index, level] of levels.entries()) {
    const prefix = `Level ${index + 1}`;
    if (!level.id || levelIds.has(level.id)) errors.push(`${prefix}: duplicate or missing id.`);
    levelIds.add(level.id);
    if (level.schemaVersion !== CONTENT_VERSION)
      errors.push(`${prefix}: unsupported content version.`);
    if (level.unlockAfter !== (index ? levels[index - 1].id : null))
      errors.push(`${prefix}: invalid unlock dependency.`);
    if (level.target !== level.cages?.length || level.lives !== 3)
      errors.push(`${prefix}: expected all teammates rescued and three lives.`);
    if (!Array.isArray(level.cages) || level.cages.length !== 6)
      errors.push(`${prefix}: six cages are required.`);
    if (!Number.isFinite(level.ballSpeed) || level.ballSpeed < 200 || level.ballSpeed > 320)
      errors.push(`${prefix}: unsafe ball speed.`);
    if (!Number.isFinite(level.personSpeed) || level.personSpeed < 25 || level.personSpeed > 48)
      errors.push(`${prefix}: unsafe falling speed.`);
    if (!Number.isFinite(level.paddleWidth) || level.paddleWidth < 96 || level.paddleWidth > 130)
      errors.push(`${prefix}: unsafe paddle width.`);
    if (!Number.isFinite(level.releaseGap) || level.releaseGap < 1.5)
      errors.push(`${prefix}: insufficient landing separation.`);
    if (
      level.wind &&
      (!Number.isFinite(level.wind.amplitude) ||
        level.wind.amplitude < 0 ||
        level.wind.amplitude > 24 ||
        !Number.isFinite(level.wind.period) ||
        level.wind.period < 6 ||
        !Number.isFinite(level.wind.phase))
    )
      errors.push(`${prefix}: invalid wind field.`);
    for (const member of level.cages || [])
      if (member.role && !['teammate', 'engineer', 'medic'].includes(member.role))
        errors.push(`${prefix}: unknown teammate role.`);
    if (level.barriers && (!Array.isArray(level.barriers) || level.barriers.length > 2))
      errors.push(`${prefix}: invalid barriers.`);
    const ids = new Set();
    const entities = [
      ...(level.cages || []),
      ...(level.bricks || []),
      ...(Array.isArray(level.barriers) ? level.barriers : []),
    ];
    for (const entity of entities) {
      if (!entity.id || ids.has(entity.id))
        errors.push(`${prefix}: duplicate or missing entity id.`);
      ids.add(entity.id);
      if (
        ![entity.x, entity.y, entity.w, entity.h].every(Number.isFinite) ||
        entity.w <= 0 ||
        entity.h <= 0 ||
        entity.x < 20 ||
        entity.x + entity.w > 370 ||
        entity.y < 80 ||
        entity.y + entity.h > 440
      )
        errors.push(`${prefix}: entity outside the upper playfield.`);
      if (entity.material === 'steel' && (entity.w > 96 || entity.h > 20))
        errors.push(`${prefix}: unsafe barrier size.`);
      if (entity.material !== 'steel' && ![1, 2].includes(entity.hp))
        errors.push(`${prefix}: unsupported durability.`);
    }
    for (let i = 0; i < entities.length; i++)
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i],
          b = entities[j];
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y)
          errors.push(`${prefix}: overlapping entities ${a.id} and ${b.id}.`);
      }
  }
  return errors;
}
