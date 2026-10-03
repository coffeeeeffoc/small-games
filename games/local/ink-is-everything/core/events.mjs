export const nextId = (state, prefix) => `${prefix}-${++state.serial}`;
export function effect(state, type, x, y, properties = {}) {
  const life = properties.life ?? 0.36;
  state.effects.push({ id: nextId(state, 'fx'), type, x, y, life, maxLife: life, ...properties });
}
export function notice(state, message) {
  if (!message) return;
  state.message = message;
  state.messageTimer = 3.2;
  state.log.push(message);
  if (state.log.length > 30) state.log.shift();
}
export function advanceEffects(state, dt) {
  for (const key of ['messageTimer', 'transitionCd', 'roomIntroTimer', 'shake'])
    state[key] = Math.max(0, (state[key] || 0) - dt);
  for (const item of state.effects) item.life -= dt;
  state.effects = state.effects.filter((item) => item.life > 0);
}
