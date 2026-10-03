/** Shared, serializable combat rules. New behaviours use these same hit layers. */
export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);

export function ability(definition, type) {
  const entry = definition?.abilities?.find(
    (item) => (typeof item === 'string' ? item : item.type) === type,
  );
  return entry ? (typeof entry === 'string' ? { type } : entry) : null;
}

export function canHit(enemy, layers = ['ground', 'air']) {
  return enemy.hp > 0 && layers.includes(enemy.layer ?? 'ground');
}

/** Enemy armor is flat mitigation; continuous effects pass their time slice. */
export function enemyDamage(raw, armor = 0, pierce = 0, timeScale = 1) {
  return Math.max(1, finite(raw) - Math.max(0, finite(armor) - finite(pierce))) * timeScale;
}

export function playerDamage(raw, armor = 0) {
  const reduction = Math.min(0.6, Math.max(0, armor) / (Math.max(0, armor) + 100));
  return Math.max(1, raw * (1 - reduction));
}

export function controlledSpeed(slow, resistance = 0) {
  return clamp(1 - (1 - clamp(slow, 0, 1)) * (1 - clamp(resistance, 0, 0.95)), 0.12, 1);
}

/** Effects are declarative: add, addPercent and multiply have a stable order. */
export function resolveStat(base, modifiers = [], minimum = 0, maximum = Infinity) {
  let added = 0,
    percent = 0,
    multiplier = 1;
  for (const effect of modifiers) {
    if (effect.op === 'add') added += finite(effect.value);
    else if (effect.op === 'addPercent') percent += finite(effect.value);
    else if (effect.op === 'multiply') multiplier *= finite(effect.value, 1);
  }
  return clamp((base + added) * (1 + percent) * multiplier, minimum, maximum);
}
