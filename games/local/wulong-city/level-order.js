// Level IDs remain stable for records and shared URLs; numbers follow the route.
window.LEVEL_ROUTE = (() => {
  const order = Object.freeze([1, 2, 4, 5, 6, 7, 8, 3, ...Object.keys(LEVEL_DATA).map(Number).filter(id => id >= 9).sort((a, b) => a - b)]);
  const number = id => order.indexOf(id) + 1;
  const next = id => order[number(id)] || null;
  function frontier(unlockedLevels) {
    let count = 0;
    while (unlockedLevels.has(order[count])) count++;
    return count;
  }
  function unlockNext(unlockedLevels, id) {
    if (!number(id)) return;
    unlockedLevels.add(id);
    if (next(id)) unlockedLevels.add(next(id));
  }
  function restore(value = {}) {
    const save = value && typeof value === 'object' ? value : {};
    const records = save.records && typeof save.records === 'object' && !Array.isArray(save.records) ? save.records : {};
    const unlockedLevels = new Set([order[0]]);
    if (save.orderVersion === 2 && Array.isArray(save.unlockedLevels)) {
      for (const id of save.unlockedLevels) if (number(id)) unlockedLevels.add(id);
    } else {
      // Old saves used numeric IDs as a prefix. Preserve every old unlocked level,
      // including the dog level that now appears later in the route.
      // Numeric-prefix saves predate the second route and had at most 26 levels.
      // A stale/untrusted counter must not unlock the new city without completion.
      const oldUnlocked = Math.max(1, Math.min(26, Math.floor(Number(save.unlocked) || 1)));
      for (const id of order) if (id <= oldUnlocked) unlockedLevels.add(id);
    }
    for (const id of order) if (records[id]) unlockNext(unlockedLevels, id);
    const level = Number(save.level);
    return { unlockedLevels, records, level: unlockedLevels.has(level) ? level : order[0], sound: save.sound !== false };
  }
  return Object.freeze({ order, number, next, frontier, unlockNext, restore });
})();
