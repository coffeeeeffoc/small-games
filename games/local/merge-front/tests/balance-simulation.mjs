import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { STARTERS } from '../assets/scripts/core/content.ts';
import {
  createMatch,
  command,
  runAI,
  step,
  restore,
  snapshot,
  traitCounts,
} from '../assets/scripts/core/engine.ts';

// Same legal AI policy and budget; this measures starting-pack sensitivity, not human win rates.
const results = [];
for (const starter of STARTERS) {
  const row = {
    starter: starter.id,
    matches: 32,
    won: 0,
    lost: 0,
    draw: 0,
    rounds: 0,
    fourTraitRounds: 0,
    planningRounds: 0,
  };
  for (let sample = 0; sample < 32; sample++) {
    const seed = Math.imul(sample + 1, 0x9e3779b9) >>> 0;
    const level = ['level-01', 'level-08', 'level-16', 'level-30'][sample % 4];
    const m = createMatch(level, seed, starter.keys);
    while (m.phase === 'running') {
      for (let action = 0; action < 128 && runAI(m, 0)?.ok; action++);
      row.planningRounds++;
      if (Object.values(traitCounts(m.sides[0].formation)).some((n) => n >= 4))
        row.fourTraitRounds++;
      assert(command(m, 0, { type: 'startRound' }).ok);
      step(m, 640);
      restore(snapshot(m));
    }
    row[m.phase]++;
    row.rounds += m.roundNumber;
    assert(m.roundNumber >= 5 && m.roundNumber <= 12);
  }
  results.push({ ...row, winRate: row.won / row.matches, averageRounds: row.rounds / row.matches });
}
const report = {
  method:
    '256 deterministic legal AI games, 8 starting packs, paired seeds across levels 1/8/16/30; no player telemetry',
  results,
};
await writeFile(
  new URL('../docs/design/shop-synergies-2026-10-23/balance-report.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
