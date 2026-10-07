/** Progress only: an unfinished volley is deliberately not a resumable save. */
export const STORAGE_KEY = 'ember-bounce:progress:v1';

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function copy(data) {
  return {
    ...data,
    unlocked: [...data.unlocked],
    completed: Object.fromEntries(
      Object.entries(data.completed).map(([id, result]) => [id, { ...result }]),
    ),
  };
}

function resultNumbers(result) {
  if (!isRecord(result) || !Number.isFinite(result.score) || !Number.isFinite(result.turns))
    return null;
  if (result.score < 0 || result.turns < 0) return null;
  return {
    score: Math.min(Number.MAX_SAFE_INTEGER, Math.floor(result.score)),
    turns: Math.min(Number.MAX_SAFE_INTEGER, Math.floor(result.turns)),
  };
}

export function createStorage(levels, storage = browserStorage()) {
  if (!Array.isArray(levels) || !levels.length) throw new Error('A level catalog is required.');
  const catalog = levels.map((level) => ({ ...level }));
  const byId = new Map(catalog.map((level) => [level.id, level]));
  if (
    byId.size !== catalog.length ||
    catalog.some((level) => typeof level.id !== 'string' || !level.id)
  ) {
    throw new Error('Level IDs must be unique non-empty strings.');
  }
  const firstId = catalog[0].id;
  let persistent = storage !== null && storage !== undefined;
  let loaded = false;
  let current = defaults();

  function defaults() {
    return {
      schemaVersion: 1,
      unlocked: [firstId],
      completed: {},
      sound: true,
      haptics: true,
      lastLevel: firstId,
    };
  }

  function requirements(level) {
    return Array.isArray(level.unlock) ? level.unlock : level.unlock ? [level.unlock] : [];
  }

  function canUnlock(level, completed) {
    if (level.id === firstId) return true;
    const required = requirements(level);
    return (
      required.length > 0 && required.every((id) => byId.has(id) && Object.hasOwn(completed, id))
    );
  }

  function stars(level, turns) {
    const thresholds =
      Array.isArray(level.starTurns) &&
      level.starTurns.length === 2 &&
      level.starTurns.every((turn) => Number.isFinite(turn) && turn >= 0) &&
      level.starTurns[0] <= level.starTurns[1]
        ? level.starTurns
        : [6, 9];
    return turns <= thresholds[0] ? 3 : turns <= thresholds[1] ? 2 : 1;
  }

  function sanitize(raw) {
    const data = defaults();
    if (!isRecord(raw) || ![undefined, 0, 1].includes(raw.schemaVersion)) return data;
    const legacy = raw.schemaVersion !== 1;
    const candidates = new Map();
    if (isRecord(raw.completed)) {
      for (const [savedId, value] of Object.entries(raw.completed)) {
        // v0 used a catalog index; v1 always uses the stable configured ID.
        const id = byId.has(savedId)
          ? savedId
          : legacy && /^\d+$/.test(savedId)
            ? catalog[Number(savedId)]?.id
            : null;
        const result = resultNumbers(value);
        if (id && result) candidates.set(id, result);
      }
    }
    // A damaged late-level result cannot grant progress past missing prerequisites.
    let changed = true;
    while (changed) {
      changed = false;
      for (const level of catalog) {
        if (
          !candidates.has(level.id) ||
          Object.hasOwn(data.completed, level.id) ||
          !canUnlock(level, data.completed)
        )
          continue;
        const result = candidates.get(level.id);
        Object.defineProperty(data.completed, level.id, {
          value: { ...result, stars: stars(level, result.turns) },
          enumerable: true,
          configurable: true,
          writable: true,
        });
        changed = true;
      }
    }
    data.unlocked = catalog
      .filter((level) => canUnlock(level, data.completed))
      .map((level) => level.id);
    data.sound = typeof raw.sound === 'boolean' ? raw.sound : true;
    data.haptics = typeof raw.haptics === 'boolean' ? raw.haptics : true;
    const selected =
      typeof raw.lastLevel === 'string'
        ? raw.lastLevel
        : legacy && Number.isInteger(raw.currentLevel)
          ? catalog[raw.currentLevel]?.id
          : firstId;
    if (data.unlocked.includes(selected)) data.lastLevel = selected;
    return data;
  }

  function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    if (!storage) return;
    try {
      const serialized = storage.getItem(STORAGE_KEY);
      if (serialized) {
        try {
          current = sanitize(JSON.parse(serialized));
        } catch {
          current = defaults();
        }
      }
    } catch {
      persistent = false;
    }
  }

  function persist(data) {
    current = sanitize(data);
    if (storage) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(current));
        persistent = true;
      } catch {
        persistent = false;
      }
    }
    return copy(current);
  }

  return {
    get isPersistent() {
      ensureLoaded();
      return persistent;
    },
    load() {
      ensureLoaded();
      return copy(current);
    },
    save(data) {
      ensureLoaded();
      if (!isRecord(data) || ![undefined, 0, 1].includes(data.schemaVersion)) return copy(current);
      return persist(data);
    },
    complete(levelId, result = {}) {
      ensureLoaded();
      const level = byId.get(levelId);
      const numbers = resultNumbers(result);
      if (!level || !numbers || result.practice === true || !current.unlocked.includes(levelId))
        return copy(current);
      const previous = current.completed[levelId];
      const best = {
        score: previous ? Math.max(previous.score, numbers.score) : numbers.score,
        turns: previous ? Math.min(previous.turns, numbers.turns) : numbers.turns,
      };
      const next = copy(current);
      Object.defineProperty(next.completed, levelId, {
        value: { ...best, stars: stars(level, best.turns) },
        enumerable: true,
        configurable: true,
        writable: true,
      });
      next.lastLevel = levelId;
      return persist(next);
    },
    settings(patch = {}) {
      ensureLoaded();
      if (!isRecord(patch)) return copy(current);
      const next = copy(current);
      if (typeof patch.sound === 'boolean') next.sound = patch.sound;
      if (typeof patch.haptics === 'boolean') next.haptics = patch.haptics;
      return persist(next);
    },
  };
}
