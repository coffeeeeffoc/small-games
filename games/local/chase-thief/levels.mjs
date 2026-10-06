const obstacle = (lane, type) => ({ lane, type });

function makeWaves(levelId, patterns) {
  return patterns.map((pattern, index) => ({
    id: `${levelId}-${index + 1}`,
    at: index < 3 ? 40 + index * 32 : 104 + (index - 2) * 24,
    obstacles: pattern.obstacles,
    ...(pattern.hint ? { hint: pattern.hint } : {}),
  }));
}

/** Authored waves leave a clear lane and at least 2.5 s between waves. */
export const LEVELS = [
  {
    id: 'old-town',
    name: '晨光里',
    subtitle: '跳过路障，稳住三段',
    duration: 60,
    speed: 8,
    palette: {
      sky: '#f4d6ad',
      wall: '#e4ba86',
      wallAccent: '#bd8c65',
      roof: '#a86445',
      road: '#bb9470',
      lane: '#dfc4a0',
      accent: '#ef9d3c',
      shadow: '#70503d',
    },
    waves: makeWaves('old-town', [
      { obstacles: [obstacle(1, 'barrier')], hint: 'jump' },
      { obstacles: [obstacle(1, 'beam')], hint: 'slide' },
      { obstacles: [obstacle(1, 'crate')], hint: 'switch' },
      { obstacles: [obstacle(0, 'barrier')] },
      { obstacles: [obstacle(2, 'beam')] },
      { obstacles: [obstacle(1, 'crate'), obstacle(0, 'barrier')] },
      { obstacles: [obstacle(0, 'beam'), obstacle(2, 'crate')] },
      { obstacles: [obstacle(1, 'barrier')] },
      { obstacles: [obstacle(0, 'crate'), obstacle(1, 'beam')] },
      { obstacles: [obstacle(2, 'barrier'), obstacle(1, 'crate')] },
      { obstacles: [obstacle(2, 'beam')] },
      { obstacles: [obstacle(0, 'crate'), obstacle(2, 'barrier')] },
      { obstacles: [obstacle(0, 'barrier'), obstacle(1, 'beam')] },
      { obstacles: [obstacle(1, 'crate'), obstacle(2, 'beam')] },
      { obstacles: [obstacle(0, 'beam'), obstacle(2, 'barrier')] },
      { obstacles: [obstacle(1, 'barrier'), obstacle(0, 'crate')] },
      { obstacles: [obstacle(1, 'beam'), obstacle(2, 'crate')] },
    ]),
  },
  {
    id: 'market',
    name: '骑楼巷',
    subtitle: '看清组合，再换一道',
    duration: 60,
    speed: 8,
    palette: {
      sky: '#f1cbaf',
      wall: '#dfad88',
      wallAccent: '#b97b66',
      roof: '#ad6753',
      road: '#a68670',
      lane: '#dfbfa3',
      accent: '#65aaa0',
      shadow: '#634c43',
    },
    waves: makeWaves('market', [
      { obstacles: [obstacle(1, 'barrier'), obstacle(0, 'crate')] },
      { obstacles: [obstacle(2, 'beam'), obstacle(1, 'crate')] },
      { obstacles: [obstacle(0, 'barrier'), obstacle(2, 'crate')] },
      { obstacles: [obstacle(1, 'beam'), obstacle(0, 'crate')] },
      { obstacles: [obstacle(2, 'barrier'), obstacle(1, 'beam')] },
      { obstacles: [obstacle(0, 'crate'), obstacle(2, 'beam')] },
      { obstacles: [obstacle(1, 'barrier'), obstacle(2, 'crate')] },
      { obstacles: [obstacle(0, 'beam'), obstacle(1, 'crate')] },
      { obstacles: [obstacle(0, 'barrier'), obstacle(2, 'beam')] },
      { obstacles: [obstacle(1, 'crate'), obstacle(2, 'barrier')] },
      { obstacles: [obstacle(1, 'beam'), obstacle(0, 'barrier')] },
      { obstacles: [obstacle(2, 'crate'), obstacle(0, 'beam')] },
      { obstacles: [obstacle(1, 'barrier'), obstacle(0, 'crate')] },
      { obstacles: [obstacle(1, 'crate'), obstacle(2, 'beam')] },
      { obstacles: [obstacle(0, 'crate'), obstacle(2, 'barrier')] },
      { obstacles: [obstacle(0, 'beam'), obstacle(1, 'barrier')] },
      { obstacles: [obstacle(1, 'crate'), obstacle(2, 'beam')] },
    ]),
  },
  {
    id: 'canal',
    name: '灯火街',
    subtitle: '稳住最后一段，抓住他',
    duration: 60,
    speed: 8,
    palette: {
      sky: '#c3c8d8',
      wall: '#9f9cac',
      wallAccent: '#737b94',
      roof: '#686877',
      road: '#747184',
      lane: '#c1afaa',
      accent: '#edb768',
      shadow: '#404556',
    },
    waves: makeWaves('canal', [
      { obstacles: [obstacle(0, 'crate'), obstacle(1, 'beam')] },
      { obstacles: [obstacle(1, 'crate'), obstacle(2, 'barrier')] },
      { obstacles: [obstacle(0, 'barrier'), obstacle(2, 'beam')] },
      { obstacles: [obstacle(1, 'beam'), obstacle(2, 'crate')] },
      { obstacles: [obstacle(0, 'beam'), obstacle(1, 'barrier')] },
      { obstacles: [obstacle(0, 'crate'), obstacle(2, 'barrier')] },
      { obstacles: [obstacle(1, 'crate'), obstacle(2, 'beam')] },
      { obstacles: [obstacle(0, 'barrier'), obstacle(1, 'beam')] },
      { obstacles: [obstacle(0, 'beam'), obstacle(2, 'crate')] },
      { obstacles: [obstacle(1, 'barrier'), obstacle(2, 'beam')] },
      { obstacles: [obstacle(0, 'crate'), obstacle(1, 'barrier')] },
      { obstacles: [obstacle(1, 'crate'), obstacle(2, 'barrier')] },
      { obstacles: [obstacle(0, 'beam'), obstacle(2, 'barrier')] },
      { obstacles: [obstacle(0, 'crate'), obstacle(1, 'beam')] },
      { obstacles: [obstacle(0, 'barrier'), obstacle(2, 'crate')] },
      { obstacles: [obstacle(1, 'beam'), obstacle(2, 'barrier')] },
      { obstacles: [obstacle(0, 'crate'), obstacle(1, 'barrier')] },
    ]),
  },
];

// Check the clear-lane route against the fixed pursuit rules, including the
// continuous boost. Content cannot validate while placing its goal past 60 s.
function hasCatchRoute(level) {
  let world = 0,
    elapsed = 0,
    distance = 12,
    combo = 0,
    boostRemaining = 0;
  for (const wave of level.waves) {
    const boostedTime = Math.min(boostRemaining, (wave.at - world) / (level.speed * 1.2));
    if (boostedTime > 0) {
      const captureTime = (distance - 1.5) / 1.5;
      if (captureTime <= boostedTime + 1e-9 && elapsed + captureTime <= level.duration + 1e-9)
        return true;
      distance -= boostedTime * 1.5;
      elapsed += boostedTime;
      world += boostedTime * level.speed * 1.2;
      boostRemaining -= boostedTime;
    }
    elapsed += (wave.at - world) / level.speed;
    if (elapsed > level.duration + 1e-9) return false;
    world = wave.at;
    distance -= 0.15;
    if (distance <= 1.5 + 1e-9) return true;
    if (++combo === 3) {
      combo = 0;
      boostRemaining = 2;
    }
  }
  const captureTime = (distance - 1.5) / 1.5;
  return captureTime <= boostRemaining + 1e-9 && elapsed + captureTime <= level.duration + 1e-9;
}

/** Game-owned content validation; errors are returned so tools can show all of them. */
export function validateLevels(levels = LEVELS) {
  const errors = [];
  if (!Array.isArray(levels) || levels.length === 0) {
    return ['levels must be a nonempty array'];
  }
  const ids = new Set();
  for (const [index, level] of levels.entries()) {
    const errorsBeforeLevel = errors.length;
    const label = `levels[${index}]`;
    if (!level || typeof level !== 'object') {
      errors.push(`${label} must be an object`);
      continue;
    }
    if (typeof level.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(level.id)) {
      errors.push(`${label}.id must be a stable slug`);
    } else if (ids.has(level.id)) {
      errors.push(`${label}.id is duplicated`);
    }
    ids.add(level.id);
    for (const key of ['name', 'subtitle']) {
      if (typeof level[key] !== 'string' || !level[key].trim()) {
        errors.push(`${label}.${key} must be nonempty`);
      }
    }
    for (const key of ['duration', 'speed']) {
      if (!Number.isFinite(level[key]) || level[key] <= 0) {
        errors.push(`${label}.${key} must be positive`);
      }
    }
    for (const key of ['sky', 'wall', 'wallAccent', 'roof', 'road', 'lane', 'accent', 'shadow']) {
      if (!/^#[0-9a-f]{6}$/i.test(level.palette?.[key] ?? '')) {
        errors.push(`${label}.palette.${key} must be a hex color`);
      }
    }
    if (!Array.isArray(level.waves) || level.waves.length === 0) {
      errors.push(`${label}.waves must be a nonempty array`);
      continue;
    }
    let previousAt = 0;
    const waveIds = new Set();
    for (const [waveIndex, wave] of level.waves.entries()) {
      const waveLabel = `${label}.waves[${waveIndex}]`;
      if (!wave || typeof wave !== 'object') {
        errors.push(`${waveLabel} must be an object`);
        continue;
      }
      if (typeof wave.id !== 'string' || !wave.id || waveIds.has(wave.id)) {
        errors.push(`${waveLabel}.id must be unique and nonempty`);
      }
      waveIds.add(wave.id);
      if (!Number.isFinite(wave.at) || wave.at <= previousAt) {
        errors.push(`${waveLabel}.at must increase`);
      } else if ((wave.at - previousAt) / (level.speed * 1.2) < 1.8) {
        errors.push(`${waveLabel} must allow at least 1.8 s at maximum speed`);
      }
      previousAt = wave.at;
      if (wave.hint !== undefined && !['jump', 'slide', 'switch'].includes(wave.hint)) {
        errors.push(`${waveLabel}.hint is invalid`);
      }
      if (
        !Array.isArray(wave.obstacles) ||
        wave.obstacles.length < 1 ||
        wave.obstacles.length > 2
      ) {
        errors.push(`${waveLabel} must have 1–2 obstacles and a clear lane`);
        continue;
      }
      const lanes = new Set();
      for (const item of wave.obstacles) {
        if (!item || !Number.isInteger(item.lane) || item.lane < 0 || item.lane > 2) {
          errors.push(`${waveLabel} has an invalid lane`);
          continue;
        }
        if (lanes.has(item.lane)) errors.push(`${waveLabel} repeats a lane`);
        lanes.add(item.lane);
        if (!['barrier', 'beam', 'crate'].includes(item.type)) {
          errors.push(`${waveLabel} has an unknown obstacle type`);
        }
      }
    }
    if (errors.length === errorsBeforeLevel && !hasCatchRoute(level)) {
      errors.push(`${label} must have a catchable clear route within its duration`);
    }
  }
  return errors;
}
