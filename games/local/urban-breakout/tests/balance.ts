import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { BALANCE_LEVELS, OLD_STREET } from '../src/content/levels.ts';
import { createGame, step } from '../src/core/simulation.ts';
import { PLAYER_Z, type GameState, type Input, type Level } from '../src/core/types.ts';
export function policy(state: GameState, name: string): Input {
  const supply = state.supplies.find((s) => s.status === 'active');
  const nearest = Math.min(
    99,
    ...state.enemies.filter((e) => e.kind !== 'boss').map((e) => PLAYER_Z - e.z),
  );
  const boss = state.enemies.find((e) => e.kind === 'boss');
  const cycle = boss ? (state.tick - boss.born) % 210 : 0;
  if (name === '忽略补给') return { targetX: 0 };
  if (name === '无脑贪箱') return { targetX: supply ? supply.config.side * 3.5 : 0 };
  if (boss && ((cycle >= 60 && cycle <= 102) || (cycle >= 140 && cycle <= 182)))
    return { targetX: boss.aimX > 0 ? -2 : 2 };
  const stopTier = supply && supply.config.tiers.length > 1 && supply.claimed > 0;
  return { targetX: supply && nearest > 14 && !stopTier ? supply.config.side * 3.5 : 0 };
}
export function run(level: Level, strategy: string) {
  const state = createGame(level);
  while (state.phase === 'playing') step(state, policy(state, strategy));
  return {
    场景: level.id,
    策略: strategy,
    结果: state.phase,
    存活: state.members.filter((m) => m.hp > 0).length,
    生命: state.members.reduce((n, m) => n + m.hp, 0),
    减员: state.stats.lost,
    击杀: state.stats.kills,
    档位: state.grants.length,
    补给伤害: Math.round(state.stats.supplyDamage),
    得分: state.stats.score,
  };
}
const rows = [...BALANCE_LEVELS, OLD_STREET].flatMap((level) =>
  ['忽略补给', '无脑贪箱', '先清威胁再开箱'].map((strategy) => run(level, strategy)),
);
assert.ok(rows[1].生命 > rows[0].生命, 'A: early weapon should improve survival');
assert.equal(rows[4].结果, 'lost');
assert.equal(rows[5].结果, 'won');
assert.ok(
  rows[3].得分 > rows[5].得分,
  'B: skipping a bad reward should outperform the fixed cautious heuristic',
);
assert.equal(rows[8].档位, 1);
assert.equal(rows[8].结果, 'won');
assert.equal(rows[7].结果, 'lost');
assert.equal(rows[11].结果, 'won');
console.table(rows);
const out = fileURLToPath(new URL('../docs/evidence/', import.meta.url));
mkdirSync(out, { recursive: true });
writeFileSync(
  `${out}/balance.json`,
  JSON.stringify(
    {
      seed: 1002,
      rules: 'p1.1',
      policy:
        'same fixed scripts; no skill; safety threshold 14m; leave tier box after first grant',
      results: rows,
    },
    null,
    2,
  ),
);
