/** Versioned persistence is an adapter, never a source of game rules. */
export function createStorage(engine) {
  const key = 'ink-is-everything:action-chapter:v3';
  let available = true;
  return {
    get available() {
      return available;
    },
    load() {
      try {
        const data = localStorage.getItem(key);
        const state = data ? engine.restoreGame(data) : null;
        return state?.status === 'playing' ? state : null;
      } catch {
        return null;
      }
    },
    save(state) {
      try {
        if (state.status === 'playing') localStorage.setItem(key, engine.serializeGame(state));
        else if (['won', 'lost'].includes(state.status)) localStorage.removeItem(key);
        available = true;
      } catch {
        available = false;
      }
    },
  };
}
