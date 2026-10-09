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
  target: 4,
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
    '四次接住，就是胜利',
    '不必打破所有笼子，规划最容易接住的四位队友。',
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

/** Return all content errors, keeping validation usable by tests and content tooling. */
export function validateLevels(levels = LEVELS) {
  const errors = [];
  const levelIds = new Set();
  if (!Array.isArray(levels) || levels.length !== 6) return ['Exactly six levels are required.'];
  for (const [index, level] of levels.entries()) {
    const prefix = `Level ${index + 1}`;
    if (!level.id || levelIds.has(level.id)) errors.push(`${prefix}: duplicate or missing id.`);
    levelIds.add(level.id);
    if (level.schemaVersion !== CONTENT_VERSION)
      errors.push(`${prefix}: unsupported content version.`);
    if (level.unlockAfter !== (index ? levels[index - 1].id : null))
      errors.push(`${prefix}: invalid unlock dependency.`);
    if (level.target !== 4 || level.lives !== 3)
      errors.push(`${prefix}: expected four rescues and three lives.`);
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
    const ids = new Set();
    const entities = [...(level.cages || []), ...(level.bricks || [])];
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
      if (![1, 2].includes(entity.hp)) errors.push(`${prefix}: unsupported durability.`);
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
