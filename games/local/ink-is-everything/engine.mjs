/** Compatibility facade. Content is resolved here; core modules never import chapters. */
import { LEVELS, DEFAULT_LEVEL_ID } from './content/chapters/index.mjs';
import { createGame as createSimulation } from './core/runtime.mjs';
import { restoreGame as restoreSimulation } from './core/save.mjs';

export function createGame(chapter = DEFAULT_LEVEL_ID) {
  const definition = typeof chapter === 'string' ? LEVELS[chapter] : chapter;
  if (!definition) throw new Error(`Unknown chapter: ${chapter}`);
  return createSimulation(definition);
}
export function restoreGame(snapshot, chapter) {
  try {
    const saved = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
    const definition =
      typeof chapter === 'string' ? LEVELS[chapter] : (chapter ?? LEVELS[saved?.levelId]);
    return restoreSimulation(saved, definition);
  } catch {
    return null;
  }
}
export { step, command, getSnapshot } from './core/runtime.mjs';
export { getRoom, getLevelDefinition } from './core/definition.mjs';
export { getPlayerStats, getRewardChoices, getEquipmentSummary } from './core/stats.mjs';
export { getObjective, getNearbyInteractable } from './core/world.mjs';
export { serializeGame } from './core/save.mjs';
