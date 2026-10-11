// Offline authoring only. Fixed boards, stocks and legal reference routes are
// committed as content; the runtime never adapts stock to the player's board.
import { writeFile } from 'node:fs/promises';
import { SHAPES } from '../src/shapes.mjs';
let seed = 0x31b8c7a9;
const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
const pick = (pool) => pool[Math.floor(random() * pool.length)];
const pool = SHAPES.filter(shape => shape.size >= 2);
const themes = ['长边接力','拐角回廊','纵横留白','双线织园','交叉花径','预算回旋','大块腾挪','连组取舍','花园大师'];
const hints = ['先接成长边，留出下一组的落点。','拐角朝向固定，先观察两块能否接续。','清线后重新安排横向和竖向的空间。','先铺两条半成的线，再找同时收尾的机会。','行列交点也需要给下一块留余地。','比较剩下那一块的面积，再决定落子顺序。','大块需要连续空地，别只补零散缺口。','这一组留出的空隙，要能接上下一组。','同时考虑组数、留白和弃格预算。'];
function move(board, shape, x, y) {
  if (x + shape.width > 8 || y + shape.height > 8 || shape.cells.some(([dx, dy]) => board[(y + dy) * 8 + x + dx])) return null;
  const next = [...board];
  for (const [dx, dy] of shape.cells) next[(y + dy) * 8 + x + dx] = 1;
  const rows = [], cols = [];
  for (let line = 0; line < 8; line++) {
    if (next.slice(line * 8, line * 8 + 8).every(Boolean)) rows.push(line);
    if (Array.from({ length: 8 }, (_, y) => next[y * 8 + line]).every(Boolean)) cols.push(line);
  }
  for (let i = 0; i < 64; i++) if (rows.includes(Math.floor(i / 8)) || cols.includes(i % 8)) next[i] = 0;
  let potential = 0;
  for (let line = 0; line < 8; line++) {
    const r = next.slice(line * 8, line * 8 + 8).reduce((a,b) => a+b, 0);
    const c = Array.from({length:8},(_,y)=>next[y*8+line]).reduce((a,b)=>a+b,0);
    potential += r * r + c * c;
  }
  return { board: next, lines: rows.length + cols.length, cross: rows.length > 0 && cols.length > 0, potential };
}
function greedyWins(puzzle, policy) {
  let board = puzzle.rows.replaceAll('/', '').split('').map(Number), lines = 0, multi = 0, cross = 0, discarded = 0;
  for (let group = 0; group < puzzle.max; group++) {
    const shapes = puzzle.stock[group].split(',').map(id => SHAPES.find(shape => shape.id === id)), used = [];
    for (let step = 0; step < 2; step++) {
      let best;
      for (let slot = 0; slot < 3; slot++) {
        if (used.includes(slot)) continue;
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const result = move(board, shapes[slot], x, y);
          if (!result) continue;
          const occupancy = result.board.reduce((a,b)=>a+b,0);
          const score = result.lines * 100000 + (policy >= 2 ? (result.potential - occupancy * 6) * 100 : 0) + (policy % 2 ? -shapes[slot].size : shapes[slot].size) * 10;
          if (!best || score > best.score) best = { ...result, slot, score };
        }
      }
      if (!best) return false;
      board = best.board; used.push(best.slot); lines += best.lines; multi += Number(best.lines >= 2); cross += Number(best.cross);
      if (lines >= puzzle.goal.lines && multi >= (puzzle.goal.multi ?? 0) && cross >= (puzzle.goal.cross ?? 0)) return true;
    }
    discarded += shapes[[0,1,2].find(slot=>!used.includes(slot))].size;
    if (discarded > (puzzle.budget ?? Infinity)) return false;
  }
  return false;
}
const puzzles = [], seen = new Set();
for (let number = 31; number <= 120; number++) {
  const chapter = Math.floor((number - 31) / 10);
  let accepted;
  for (let attempt = 0; attempt < 20000 && !accepted; attempt++) {
    const density = .29 + random() * .11;
    const initial = Array.from({length:64}, () => Number(random() < density));
    // No completed line or ready opening clear: these are planning challenges.
    if (initial.some((_,i) => i < 8 && (initial.slice(i*8,i*8+8).every(Boolean) || Array.from({length:8},(_,y)=>initial[y*8+i]).every(Boolean)))) continue;
    const signature = initial.join('');
    if (seen.has(signature)) continue;
    let board = initial, lines = 0, multi = 0, cross = 0, setups = 0, discarded = 0, run = 0, longestRun = 0;
    const route = [], stock = [], minMoves = 12 + Math.floor(chapter / 3) * 2;
    const target = 8 + Math.floor(chapter / 3) * 2;
    for (let group = 0; group < 15; group++) {
      const shapes = [pick(pool), pick(pool), pick(pool)];
      stock.push(shapes.map(shape=>shape.id).join(','));
      const used = [];
      for (let step = 0; step < 2; step++) {
        let best;
        for (let slot = 0; slot < 3; slot++) {
          if (used.includes(slot)) continue;
          for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
            const result = move(board, shapes[slot], x, y);
            if (!result || group === 0 && step === 0 && result.lines) continue;
            const occupancy = result.board.reduce((a,b)=>a+b,0);
            const score = result.lines * 90 + result.potential - occupancy * 5 + random() * (18 + chapter);
            if (!best || score > best.score) best = { ...result, score, slot, x, y };
          }
        }
        if (!best) break;
        board = best.board; lines += best.lines; multi += Number(best.lines >= 2); cross += Number(best.cross); setups += Number(best.lines === 0);
        run = best.lines ? 0 : run + 1; longestRun = Math.max(longestRun, run);
        used.push(best.slot); route.push([best.slot,best.x,best.y]);
        if (best.lines && lines >= target && route.length >= minMoves && setups >= route.length / 3 && longestRun >= 2) {
          const goal = {lines};
          if (chapter === 3 || chapter === 7 || chapter === 8) { if (multi < 2) continue; goal.multi = Math.min(multi,3); }
          if (chapter === 4) { if (!cross) continue; goal.cross = Math.min(cross,2); }
          const max = Math.ceil(route.length / 2);
          while (stock.length < max + 2) stock.push([pick(pool).id,pick(pool).id,pick(pool).id].join(','));
          accepted = { title: `${themes[chapter]} · ${number - 30 - chapter * 10}`, max, goal, rows: initial.map((cell,i)=>(i && i%8===0?'/':'')+cell).join(''), stock, route,
            ...(chapter >= 5 ? {budget: discarded + (chapter >= 7 ? 3 : 6)} : {}), hint: hints[chapter] };
          break;
        }
      }
      if (accepted || used.length < 2) break;
      discarded += shapes[[0,1,2].find(slot=>!used.includes(slot))].size;
    }
    if (accepted && [0,1,2,3].some(policy => greedyWins(accepted, policy))) accepted = null;
    if (accepted) seen.add(signature);
  }
  if (!accepted) throw new Error(`Unable to author ${number}`);
  puzzles.push(accepted);
  console.log(`Authored ${number}: ${accepted.route.length} moves, ${accepted.goal.lines} lines`);
}
await writeFile(new URL('../src/extended-puzzles.mjs', import.meta.url), `// Fixed expansion content authored offline by scripts/generate-expansion.mjs.\nexport const EXTENDED_PUZZLES = ${JSON.stringify(puzzles,null,2)};\n`);
