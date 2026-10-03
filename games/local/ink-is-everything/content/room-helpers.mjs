/** 无运行时状态的章节编写助手；模拟器会复制这些声明生成房间。 */
export const portal = (id, x, y, target, spawn, label, extra = {}) => ({
  id,
  kind: 'portal',
  x,
  y,
  r: 43,
  target,
  spawn,
  label,
  ...extra,
});
export const wall = (x, y, w, h) => ({ x, y, w, h, kind: 'wall' });
export const foe = (type, x, y, extra = {}) => ({ type, x, y, ...extra });
export const room = (id, name, subtitle, mapX, mapY, extra = {}) => ({
  id,
  name,
  subtitle,
  width: 960,
  height: 600,
  mapX,
  mapY,
  objective: subtitle,
  clearedObjective: '前往已开启的出口。',
  clearMessage: '此处墨灵已清散。',
  obstacles: [],
  objects: [],
  portals: [],
  bridges: [],
  enemySpawns: [],
  waves: [],
  ...extra,
});
