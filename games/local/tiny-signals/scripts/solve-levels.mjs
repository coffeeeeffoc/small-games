/** Recheck published minimum-move claims after changing any map or rule. */
import { LEVELS } from '../levels.mjs';
import { createState, step, solve, validateLevel } from '../rules.mjs';

const arrows = { up: '↑', right: '→', down: '↓', left: '←' };
let failed = false;
for (const level of LEVELS) {
  const errors = validateLevel(level);
  if (errors.length) {
    console.error(`${level.name}: ${errors.join('; ')}`);
    failed = true;
    continue;
  }
  const result = solve(level);
  let replay = createState(level);
  for (const direction of level.solution) replay = step(level, replay, direction);
  if (
    !result.optimal ||
    result.solution?.length !== level.optimalMoves ||
    replay.status !== 'won'
  ) {
    console.error(`${level.name}: published solution or minimum is no longer verified`);
    failed = true;
    continue;
  }
  console.log(
    `${level.name} · 最优 ${result.solution.length} 步 · 搜索 ${result.explored} 个联合状态 · ${result.solution.map((direction) => arrows[direction]).join(' ')}`,
  );
}
if (failed) process.exitCode = 1;
