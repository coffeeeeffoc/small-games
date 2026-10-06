/** Ember Bounce owns this versioned content schema; adding a wave never changes the rules. */
export const CONTENT_SCHEMA_VERSION = 1;

export const UPGRADES = Object.freeze([
  { id: 'extra', title: '双星同行', description: '每轮多发射 2 颗弹珠', icon: 'balls' },
  { id: 'power', title: '火花强化', description: '每次撞击伤害增加 1', icon: 'power' },
  { id: 'blast', title: '余烬扩散', description: '爆裂范围扩大，连锁更容易', icon: 'blast' },
]);

const orb = (x, hp = 2) => ({ x, hp, kind: 'orb', r: 23 });
const prism = (x, hp = 3, rotation = 0) => ({ x, hp, kind: 'prism', r: 26, rotation });
const burst = (x, hp = 2) => ({ x, hp, kind: 'burst', r: 23 });
const pickup = (x) => ({ x, hp: 1, kind: 'pickup', r: 15 });
const wave = (...targets) => ({ targets });
const level = (data) => ({
  schemaVersion: CONTENT_SCHEMA_VERSION,
  initialRows: 2,
  upgradeTurns: [2],
  reward: 20,
  ...data,
});

export const LEVELS = [
  level({
    id: 'first-spark',
    title: '第一束火花',
    subtitle: '瞄准数字，让余烬弹回来',
    intro: '按住发射点，拖动瞄准，松手发射。撞击数字球，再接住返回的弹珠。',
    hint: '斜着发射，利用墙壁改变路线；金色的「＋」能多给你一颗弹珠。',
    unlock: null,
    balls: 8,
    waves: [
      wave(orb(135, 2), orb(255, 2)),
      wave(orb(95, 2), pickup(195), orb(295, 2)),
      wave(orb(155, 3), orb(235, 3)),
    ],
  }),
  level({
    id: 'side-glow',
    title: '借一道墙',
    subtitle: '侧墙也能帮你瞄准',
    intro: '这一轮，两侧的目标更分散。用反弹把弹珠送到侧边。',
    hint: '先处理最靠上的数字球。每轮结束，所有目标都会向警戒线移动。',
    unlock: 'first-spark',
    balls: 9,
    reward: 25,
    waves: [
      wave(orb(70, 3), orb(195, 2), orb(320, 3)),
      wave(orb(120, 3), pickup(195), orb(270, 3)),
      wave(orb(75, 4), orb(195, 3), orb(315, 4)),
    ],
  }),
  level({
    id: 'prism-turn',
    title: '棱镜折返',
    subtitle: '沿三角斜面弹向下一颗',
    intro: '三角棱镜按真实斜面反射。试着瞄准它的一侧，弹珠会转向另一条路线。',
    hint: '三角目标的尖端和斜面会产生不同角度。瞄准时的点线会显示第一段反弹。',
    unlock: 'side-glow',
    balls: 10,
    reward: 30,
    waves: [
      wave(orb(90, 3), prism(195, 3), orb(300, 3)),
      wave(prism(120, 4, Math.PI), pickup(195), prism(270, 4)),
      wave(orb(80, 4), prism(195, 4, Math.PI / 3), orb(310, 4)),
    ],
  }),
  level({
    id: 'ember-chain',
    title: '一触连锁',
    subtitle: '先撞开带火花的圆球',
    intro: '橙色爆裂球击碎时，会伤害附近目标。把它当作清除一簇数字的开关。',
    hint: '选择「余烬扩散」能扩大爆裂范围。火花也会点燃另一个爆裂球。',
    unlock: 'prism-turn',
    balls: 11,
    reward: 35,
    waves: [
      wave(orb(110, 4), burst(195, 2), orb(280, 4)),
      wave(prism(120, 4), burst(195, 2), prism(270, 4, Math.PI)),
      wave(orb(100, 5), burst(165, 3), burst(225, 3), orb(290, 5)),
    ],
  }),
  level({
    id: 'green-comet',
    title: '追上金光',
    subtitle: '越早收集，越多弹珠',
    intro: '金光为后续轮次增加弹珠。决定先收集，还是先解决逼近警戒线的目标。',
    hint: '新弹珠从下一轮开始加入；已发射的弹珠数量不会突然改变。',
    unlock: 'ember-chain',
    balls: 11,
    reward: 40,
    waves: [
      wave(prism(100, 5), pickup(195), orb(290, 5)),
      wave(pickup(95), burst(165, 3), orb(245, 5), pickup(315)),
      wave(orb(85, 6), prism(195, 5, Math.PI), orb(305, 6)),
      wave(orb(115, 6), burst(195, 3), orb(275, 6)),
    ],
  }),
  level({
    id: 'crossfire',
    title: '交错火线',
    subtitle: '让斜面和火花互相帮忙',
    intro: '棱镜、爆裂球和金光混在一起。处理上排目标，再为下一排找到角度。',
    hint: '高数字适合「火花强化」；密集的一排适合「余烬扩散」。',
    unlock: 'green-comet',
    balls: 13,
    reward: 45,
    upgradeTurns: [2, 4],
    waves: [
      wave(prism(95, 5, Math.PI / 3), burst(195, 3), prism(295, 5, -Math.PI / 3)),
      wave(orb(80, 6), pickup(155), burst(230, 3), orb(310, 6)),
      wave(prism(105, 6), orb(195, 6), prism(285, 6, Math.PI)),
      wave(orb(90, 7), burst(160, 4), burst(230, 4), orb(300, 7)),
    ],
  }),
  level({
    id: 'hot-horizon',
    title: '炽热边界',
    subtitle: '把握最后一轮的空间',
    intro: '波次更长，上排目标更加坚固。适时回收可以快速进入下一轮，但会放弃剩余撞击。',
    hint: '回收后仍会正常推进目标。只有确实没有好路线时，再结束这一轮。',
    unlock: 'crossfire',
    balls: 14,
    reward: 50,
    upgradeTurns: [2, 4],
    waves: [
      wave(orb(90, 6), burst(195, 3), orb(300, 6)),
      wave(prism(100, 6), pickup(195), prism(290, 6, Math.PI)),
      wave(orb(75, 7), burst(155, 4), burst(235, 4), orb(315, 7)),
      wave(prism(105, 7, Math.PI / 3), burst(195, 4), prism(285, 7, -Math.PI / 3)),
      wave(orb(115, 8), burst(195, 4), orb(275, 8)),
    ],
  }),
  level({
    id: 'last-light',
    title: '最后的光',
    subtitle: '把所有余烬送回夜空',
    intro: '所有机制一起上场。保持目标远离红线，选择成长，打出最后一串连锁。',
    hint: '先看最上排，再看能触发的爆裂球。数字低的橙色球往往能打开局面。',
    unlock: 'hot-horizon',
    balls: 16,
    reward: 60,
    upgradeTurns: [2, 4],
    waves: [
      wave(prism(95, 7), burst(195, 3), prism(295, 7, Math.PI)),
      wave(orb(85, 8), pickup(155), burst(235, 4), orb(315, 8)),
      wave(orb(110, 8), burst(195, 4), orb(280, 8)),
      wave(prism(80, 8, Math.PI / 3), burst(155, 4), burst(235, 4), prism(310, 8, -Math.PI / 3)),
      wave(orb(95, 9), pickup(195), orb(295, 9)),
      wave(prism(110, 9), burst(195, 5), prism(280, 9, Math.PI)),
    ],
  }),
];

export function levelById(id) {
  return LEVELS.find((entry) => entry.id === id);
}

/** Returns human-readable schema errors, suitable for a build-time content check. */
export function validateLevels(levels = LEVELS) {
  const errors = [];
  if (!Array.isArray(levels) || levels.length === 0) return ['levels must be a non-empty array'];
  const ids = new Set();
  const knownKinds = new Set(['orb', 'prism', 'burst', 'pickup']);
  for (const [index, entry] of levels.entries()) {
    const label = entry?.id || `level[${index}]`;
    const bad = (message) => errors.push(`${label}: ${message}`);
    if (!entry || typeof entry !== 'object') {
      bad('must be an object');
      continue;
    }
    if (entry.schemaVersion !== CONTENT_SCHEMA_VERSION) bad('unsupported schemaVersion');
    if (typeof entry.id !== 'string' || !/^[a-z][a-z0-9-]+$/.test(entry.id))
      bad('invalid stable id');
    if (ids.has(entry.id)) bad('duplicate id');
    if (entry.unlock !== null && !ids.has(entry.unlock))
      bad('unlock must reference an earlier level');
    if (index > 0 && entry.unlock === null) bad('later levels need an unlock prerequisite');
    ids.add(entry.id);
    if (typeof entry.title !== 'string' || !entry.title.trim()) bad('title is required');
    if (!Number.isInteger(entry.balls) || entry.balls < 1 || entry.balls > 32)
      bad('balls must be 1..32');
    if (!Number.isInteger(entry.reward) || entry.reward < 0)
      bad('reward must be a nonnegative integer');
    if (!Array.isArray(entry.waves) || entry.waves.length === 0) {
      bad('waves are required');
      continue;
    }
    if (
      !Number.isInteger(entry.initialRows) ||
      entry.initialRows < 1 ||
      entry.initialRows > 2 ||
      entry.initialRows > entry.waves.length
    )
      bad('initialRows must be 1 or 2 within waves');
    if (
      !Array.isArray(entry.upgradeTurns) ||
      entry.upgradeTurns.some((turn) => !Number.isInteger(turn) || turn < 1) ||
      new Set(entry.upgradeTurns).size !== entry.upgradeTurns.length
    )
      bad('upgradeTurns must contain unique positive integers');
    let destructibles = 0;
    entry.waves.forEach((row, rowIndex) => {
      if (!Array.isArray(row?.targets) || row.targets.length === 0) {
        bad(`wave ${rowIndex} requires targets`);
        return;
      }
      row.targets.forEach((target, targetIndex) => {
        const prefix = `wave ${rowIndex} target ${targetIndex}`;
        if (!target || !knownKinds.has(target.kind)) {
          bad(`${prefix}: unknown kind`);
          return;
        }
        if (!Number.isFinite(target.r) || target.r < 12 || target.r > 28)
          bad(`${prefix}: radius must be 12..28`);
        if (!Number.isFinite(target.x) || target.x - target.r < 20 || target.x + target.r > 370)
          bad(`${prefix}: outside the play field`);
        if (!Number.isInteger(target.hp) || target.hp < 1 || target.hp > 99)
          bad(`${prefix}: hp must be 1..99`);
        if (target.rotation !== undefined && !Number.isFinite(target.rotation))
          bad(`${prefix}: invalid rotation`);
        if (target.kind === 'pickup' && target.hp !== 1) bad(`${prefix}: pickups must have hp 1`);
        if (target.kind !== 'pickup') destructibles += 1;
        row.targets.slice(0, targetIndex).forEach((other) => {
          if (!other || !Number.isFinite(other.x) || !Number.isFinite(other.r)) return;
          if (Math.abs(other.x - target.x) < other.r + target.r + 2)
            bad(`${prefix}: overlapping targets`);
        });
      });
    });
    if (destructibles === 0) bad('requires at least one destructible target');
  }
  return errors;
}
