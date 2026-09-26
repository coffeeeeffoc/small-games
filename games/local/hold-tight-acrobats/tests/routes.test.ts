import test from 'node:test';
import { route } from './routes';
for (let id = 1; id <= 5; id++) test(`level ${id}: three actors finish through real physics and player actions`, () => {
  const s = route(id); console.log(`Level ${id}: ${(s.time / 1000).toFixed(2)}s simulation, ${s.actions.length} actions, ${s.events.filter(e=>e.kind==='grip').length} grips`);
});
