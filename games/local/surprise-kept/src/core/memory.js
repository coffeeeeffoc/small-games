/** Explain only moves of this item missed since this character last saw it. */
export function missedMemories(state, character, item) {
  const since = state.characters[character].lastSeen[item].step;
  return state.events.filter(event => event.type === 'move' && event.item === item && event.step > since)
    .flatMap(event => event.missed.filter(miss => miss.character === character)
      .map(miss => ({ step: event.step, to: event.to, reason: miss.reason })));
}
