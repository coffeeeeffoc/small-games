import { createEndless, canPlace, place, previewPlacement } from '../src/engine.mjs';
import { SHAPE_BY_ID } from '../src/shapes.mjs';

const samples = Number(process.argv[2] ?? 100);
const cap = 300;
const results = [];
for (let seed = 1; seed <= samples; seed++) {
  let state = createEndless(seed.toString(16).padStart(64, '0'), { ranked: true });
  for (let step = 0; step < cap && state.status === 'playing'; step++) {
    let best, bestValue = -Infinity;
    for (let slot = 0; slot < 3; slot++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      if (!canPlace(state, slot, x, y)) continue;
      const preview = previewPlacement(state, slot, x, y);
      const board = [...state.board];
      const shape = SHAPE_BY_ID[state.candidates[slot].shapeId];
      for (const i of preview.cells) board[i] = 1;
      for (let i = 0; i < 64; i++) if (preview.rows.includes(Math.floor(i / 8)) || preview.cols.includes(i % 8)) board[i] = 0;
      let compactness = 0, isolated = 0;
      for (let n = 0; n < 8; n++) {
        let row = 0, col = 0;
        for (let k = 0; k < 8; k++) { row += Number(board[n * 8 + k] > 0); col += Number(board[k * 8 + n] > 0); }
        compactness += row * row + col * col;
      }
      for (let i = 0; i < 64; i++) if (!board[i]) {
        const xx = i % 8, yy = Math.floor(i / 8);
        const adjacent = [[xx - 1, yy], [xx + 1, yy], [xx, yy - 1], [xx, yy + 1]].filter(([cx, cy]) => cx >= 0 && cx < 8 && cy >= 0 && cy < 8);
        if (adjacent.every(([cx, cy]) => board[cy * 8 + cx])) isolated++;
      }
      const value = preview.lines * 1200 + shape.size * 5 + compactness - isolated * 35;
      if (value > bestValue) { bestValue = value; best = { slot, x, y }; }
    }
    if (!best) break;
    state = place(state, best.slot, best.x, best.y);
  }
  results.push({ groups: state.completedGroups, score: state.score, status: state.status });
}
const groups = results.map(({ groups: count }) => count).sort((a, b) => a - b);
process.stdout.write(`${JSON.stringify({
  ruleVersion: 'three-choose-two-v1', randomVersion: 'sha256-counter-v1', seeds: `1..${samples} padded to 64 hexadecimal characters`, samples,
  strategy: 'deterministic greedy row/column compactness with isolated-gap penalty', placementCap: cap,
  groups: { min: groups[0], median: groups[Math.floor(samples * .5)], p90: groups[Math.floor(samples * .9)], max: groups.at(-1) },
  earlyBefore5: results.filter(({ groups: count }) => count < 5).length,
  naturalFailures: results.filter(({ status }) => status === 'lost').length,
  capped: results.filter(({ status }) => status === 'playing').length,
  averageScore: Math.round(results.reduce((sum, { score }) => sum + score, 0) / samples),
  limitation: 'Synthetic strategy checks distribution pressure only; it does not establish human session duration or retention.',
}, null, 2)}\n`);
