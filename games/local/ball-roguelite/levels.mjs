// Game-owned content: rows arrive from top to bottom; zero means empty space.
export const SCHEMA_VERSION = 1;
export const UPGRADES = Object.freeze([
  { id: 'extra', title: '分裂弹群', description: '每轮多发射 2 颗弹珠', glyph: '◉', color: '#73f5db' },
  { id: 'power', title: '重击核心', description: '每颗弹珠的伤害增加 1', glyph: '◆', color: '#ffb96e' },
  { id: 'pierce', title: '相位穿透', description: '每颗弹珠额外穿过 1 块砖', glyph: '↗', color: '#9ba6ff' },
  { id: 'blast', title: '爆裂余波', description: '命中有 15% 概率伤害周围，可叠加', glyph: '✦', color: '#ff8caa' },
  { id: 'chain', title: '闪电连锁', description: '命中有 20% 概率电击另一块砖，可叠加', glyph: 'ϟ', color: '#83d7ff' },
  { id: 'critical', title: '幸运暴击', description: '暴击率增加 15%，造成三倍伤害', glyph: '✧', color: '#d2a3ff' },
]);

const level = (id, title, subtitle, unlock, balls, waves, color) => ({
  schemaVersion: SCHEMA_VERSION, id, title, subtitle, unlock, balls, waves, color,
  initialRows: 2, upgradeEvery: 3,
});
export const LEVELS = Object.freeze([
  level('stardust', '星尘航道', '让第一束星光，穿过砖阵', null, 5, [
    [0, 2, 2, '+', 2, 2, 0],
    [2, 0, 2, 2, 2, 0, 2],
    [0, 3, 0, '+', 0, 3, 0],
    [2, 2, 0, 'b2', 0, 2, 2],
  ], '#73f5db'),
  level('prism', '紫微残带', '借墙折返，寻找连击的路线', 'stardust', 6, [
    [3, 0, 3, '+', 3, 0, 3],
    [0, 4, 4, 0, 4, 4, 0],
    [3, 3, 0, '+', 0, 3, 3],
    [4, 0, 4, 'b3', 4, 0, 4],
    [0, 5, 4, 0, 4, 5, 0],
  ], '#b79aff'),
  level('flare', '熔核星渊', '击碎爆裂砖，点燃整片星域', 'prism', 7, [
    [4, 4, 'b2', '+', 'b2', 4, 4],
    [0, 5, 4, 'b3', 4, 5, 0],
    [5, 'b3', 5, '+', 5, 'b3', 5],
    [0, 6, 'b3', 5, 'b3', 6, 0],
    [6, 5, 0, '+', 0, 5, 6],
    [5, 'b4', 6, 0, 6, 'b4', 5],
  ], '#ffb96e'),
  level('frost', '霜陨星域', '砖阵渐密，先拆最靠近底线的目标', 'flare', 8, [
    [5, 0, 6, '+', 6, 0, 5],
    [6, 6, 0, 5, 0, 6, 6],
    [0, 7, 'b4', '+', 'b4', 7, 0],
    [6, 0, 7, 6, 7, 0, 6],
    [7, 7, 0, '+', 0, 7, 7],
    [0, 8, 7, 'b4', 7, 8, 0],
  ], '#83d7ff'),
  level('void', '虚空回廊', '穿透与闪电，让反弹变成连锁', 'frost', 9, [
    [7, 6, 0, '+', 0, 6, 7],
    [7, 0, 8, 'b4', 8, 0, 7],
    [0, 8, 7, '+', 7, 8, 0],
    [8, 7, 'b5', 0, 'b5', 7, 8],
    [7, 0, 9, '+', 9, 0, 7],
    [0, 9, 8, 'b5', 8, 9, 0],
    [8, 'b5', 8, '+', 8, 'b5', 8],
  ], '#f194d7'),
  level('orbit', '终焉轨道', '带着你的强化组合，击穿最终砖阵', 'void', 10, [
    [8, 7, 'b4', '+', 'b4', 7, 8],
    [0, 9, 8, 7, 8, 9, 0],
    [9, 0, 9, '+', 9, 0, 9],
    [8, 'b5', 10, 0, 10, 'b5', 8],
    [0, 10, 9, '+', 9, 10, 0],
    [9, 8, 'b6', 10, 'b6', 8, 9],
    [10, 0, 10, '+', 10, 0, 10],
    [10, 'b6', 11, 0, 11, 'b6', 10],
  ], '#e2ca8f'),
]);
export const ENDLESS = Object.freeze({
  schemaVersion: 1, id: 'endless', title: '无尽挑战', subtitle: '每三轮选择强化，看看能走多远',
  unlock: null, balls: 5, initialRows: 3, upgradeEvery: 3, waves: [], color: '#b79aff', endless: true,
});
export const levelById = (id) => id === ENDLESS.id ? ENDLESS : LEVELS.find((item) => item.id === id);

export function validateLevels(levels = LEVELS) {
  const errors = [], seen = new Set();
  for (const item of levels) {
    if (!item.id || seen.has(item.id)) errors.push('关卡 ID 缺失或重复');
    if (item.schemaVersion !== SCHEMA_VERSION) errors.push(`${item.id}: schema 不支持`);
    if (item.unlock && !seen.has(item.unlock)) errors.push(`${item.id}: 解锁前置不可达`);
    seen.add(item.id);
    if (!Number.isInteger(item.balls) || item.balls < 1 || item.balls > 99) errors.push(`${item.id}: 球数无效`);
    if (!Number.isInteger(item.initialRows) || item.initialRows < 1 || item.initialRows > 6) errors.push(`${item.id}: 初始行数无效`);
    if (!Number.isInteger(item.upgradeEvery) || item.upgradeEvery < 1) errors.push(`${item.id}: 强化周期无效`);
    if (!Array.isArray(item.waves) || (!item.endless && item.waves.length < item.initialRows)) errors.push(`${item.id}: 波次不足`);
    for (const row of item.waves ?? []) {
      if (!Array.isArray(row) || row.length !== 7 || row.some((cell) =>
        !(cell === '+' || (Number.isInteger(cell) && cell >= 0 && cell <= 999) || /^b[1-9]\d{0,2}$/.test(cell)))) errors.push(`${item.id}: 行配置无效`);
    }
  }
  return errors;
}
