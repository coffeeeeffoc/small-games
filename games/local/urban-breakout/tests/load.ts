import { performance } from 'node:perf_hooks';
import { OLD_STREET } from '../src/content/levels.ts';
import { createGame, step } from '../src/core/simulation.ts';
import { writeFileSync, mkdirSync } from 'node:fs';
import { cpus } from 'node:os';
const start = performance.now();
let ticks = 0,
  peak = 0;
for (let run = 0; run < 100; run++) {
  const state = createGame(OLD_STREET, 1002 + run);
  while (state.phase === 'playing') {
    step(state, { moveX: Math.sin(state.tick / 90), skill: state.tick % 720 === 0 });
    ticks++;
    peak = Math.max(peak, state.enemies.length);
  }
}
const report = {
  kind: 'local headless core throughput, NOT online concurrency',
  runs: 100,
  ticks,
  peakEnemies: peak,
  elapsedMs: Math.round(performance.now() - start),
  node: process.version,
  os: process.platform,
  cpu: cpus()[0]?.model,
};
console.log(JSON.stringify(report, null, 2));
mkdirSync(new URL('../docs/evidence/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('../docs/evidence/load.json', import.meta.url),
  JSON.stringify(report, null, 2),
);
