export const LEVELS = [
  {
    id: 'valley',
    name: '山谷初战',
    subtitle: '避其锋芒，待其弦歇',
    scene: '晨雾青山',
    description: '齐射前收兵，装填时反攻。',
    enemyHealth: 72,
    enemyDamage: 5.4,
    enemySpeed: 17,
    reload: 7.2,
    warning: 2.2,
    volleyCount: 1,
    volleyGap: 0.85,
    arrowDamage: 37,
    pursuit: 1,
    prerequisites: [],
    reward: '追兵压境',
  },
  {
    id: 'pursuit',
    name: '追兵压境',
    subtitle: '退而不溃，回身破阵',
    scene: '暮色苇荡',
    description: '追兵会加速。别退得太久。',
    enemyHealth: 82,
    enemyDamage: 6,
    enemySpeed: 19,
    reload: 6.8,
    warning: 2,
    volleyCount: 1,
    volleyGap: 0.85,
    arrowDamage: 40,
    pursuit: 1.7,
    prerequisites: ['valley'],
    reward: '连弩险关',
  },
  {
    id: 'crossbow',
    name: '连弩险关',
    subtitle: '一阵之后，还有一阵',
    scene: '残阳古道',
    description: '两段箭雨，等最后一箭落地。',
    enemyHealth: 90,
    enemyDamage: 6.3,
    enemySpeed: 18,
    reload: 7.7,
    warning: 1.9,
    volleyCount: 2,
    volleyGap: 1.3,
    arrowDamage: 33,
    pursuit: 1.25,
    prerequisites: ['pursuit'],
    reward: '三关全通',
  },
];

export function validateLevels(levels = LEVELS) {
  if (!Array.isArray(levels) || !levels.length) throw new Error('关卡目录不能为空');
  const seen = new Set();
  for (const level of levels) {
    if (!level.id || seen.has(level.id)) throw new Error('关卡 ID 重复或缺失');
    for (const key of [
      'enemyHealth',
      'enemyDamage',
      'enemySpeed',
      'reload',
      'warning',
      'volleyCount',
      'volleyGap',
      'arrowDamage',
      'pursuit',
    ]) {
      if (!Number.isFinite(level[key]) || level[key] <= 0) throw new Error(`非法关卡参数 ${key}`);
    }
    if (!Number.isInteger(level.volleyCount) || level.volleyCount > 3)
      throw new Error('非法齐射批数');
    if (!Array.isArray(level.prerequisites) || level.prerequisites.some((id) => !seen.has(id)))
      throw new Error('关卡前置不可达');
    seen.add(level.id);
  }
  return true;
}
validateLevels();
