/** Responsive CSS-pixel layout, shared by Cocos rendering and hit-region tests. */
export function getBoardLayout(level, width = 390, height = 844) {
  const wide = width > height * 1.25;
  const area = {
    x: wide ? 18 : 16,
    y: wide ? 85 : 202,
    width: wide ? width * 0.64 - 28 : width - 32,
  };
  const rows = Math.ceil(level.gates.length / 2);
  const bottom = wide ? height - 24 : height - 148;
  const railHeight = rows * (wide ? 63 : 72) + 22;
  const tankTop = area.y + (level.overflow?.length || 0 ? 24 : 6);
  const tankBottom = Math.max(tankTop + 60, bottom - railHeight);
  const gap = Math.max(10, area.width * 0.035);
  const tankWidth = (area.width - gap * (level.tanks.length - 1)) / level.tanks.length;
  const tanks = level.tanks.map((tank, i) => ({
    id: tank.id,
    x: area.x + i * (tankWidth + gap),
    y: tankTop,
    width: tankWidth,
    height: tankBottom - tankTop,
  }));
  const valves = level.gates.map((gate, i) => ({
    id: gate.id,
    x: area.x + area.width * (i % 2 ? 0.74 : 0.26),
    y: tankBottom + 42 + Math.floor(i / 2) * (wide ? 63 : 72),
    size: 48,
    fromX: tanks[level.tanks.findIndex((t) => t.id === gate.a)].x + tankWidth / 2,
    toX: tanks[level.tanks.findIndex((t) => t.id === gate.b)].x + tankWidth / 2,
    railY: tankBottom + 17 + i * 8,
  }));
  return { width, height, wide, area, tanks, valves, tankTop, tankBottom, bottom, tankWidth };
}
export function unlockedThrough(progress, levels) {
  let last = Math.max(0, progress.selected || 0, progress.unlocked || 0);
  levels.forEach((level, index) => {
    if (progress.best[level.id]) last = Math.max(last, index + 1);
  });
  return Math.min(levels.length - 1, last);
}
export function starCount(level, moves) {
  return moves ? (moves <= level.par ? 3 : moves === level.par + 1 ? 2 : 1) : 0;
}
