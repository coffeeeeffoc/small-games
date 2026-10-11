import { MIN_YEAR, MAX_YEAR, validPoint } from './game.js';
import { levelById, isUnlocked } from './chapters.js';

// A checkpoint must describe its configured level before it can award that level.
export function restorePracticeJourney(journey, catalog, records = {}) {
  const level = levelById(journey?.level);
  if (
    !journey ||
    journey.version !== 2 ||
    (journey.level !== null && !level) ||
    typeof journey.dev !== 'boolean' ||
    (level && journey.dev !== true && !isUnlocked(level.id, records)) ||
    !Array.isArray(journey.deck) ||
    journey.deck.length < 1 ||
    journey.deck.length > 5 ||
    new Set(journey.deck).size !== journey.deck.length ||
    journey.deck.some((id) => !catalog.some((scene) => scene.id === id)) ||
    (level && JSON.stringify(journey.deck) !== JSON.stringify(level.scenes)) ||
    !['guessing', 'revealed', 'paused'].includes(journey.phase) ||
    !Number.isInteger(journey.index) ||
    journey.index < 0 ||
    journey.index >= journey.deck.length ||
    !Array.isArray(journey.results) ||
    journey.results.length !== journey.index + (journey.phase === 'revealed' ? 1 : 0) ||
    journey.results.some(
      (result, index) =>
        !result ||
        result.id !== journey.deck[index] ||
        !Number.isInteger(result.total) ||
        result.total < 0 ||
        result.total > 5000 ||
        (result.timedOut === true && result.total !== 0),
    ) ||
    !Number.isFinite(journey.deadline) ||
    !Number.isInteger(journey.year) ||
    journey.year === 0 ||
    journey.year < MIN_YEAR ||
    journey.year > MAX_YEAR ||
    typeof journey.yearTouched !== 'boolean' ||
    (journey.guess !== null && !validPoint(journey.guess)) ||
    (journey.phase === 'paused' &&
      (!Number.isFinite(journey.pausedRemaining) ||
        journey.pausedRemaining < 0 ||
        journey.pausedRemaining > (level?.seconds || 25) * 1000))
  )
    return null;
  return { ...journey, deck: journey.deck.map((id) => catalog.find((scene) => scene.id === id)) };
}
