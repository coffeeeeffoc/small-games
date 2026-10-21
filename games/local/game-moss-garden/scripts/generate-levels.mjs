import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { INTRODUCTORY_LEVELS } from '../src/content.ts';
import { solve, validateLevel } from '../src/rules.ts';

export const GENERATOR_SEED = 20261021;
export const TOTAL_LEVELS = 1000;
const OUTPUT = new URL('../src/generated-levels.ts', import.meta.url);

/** An explicit integer PRNG makes regeneration independent of engine and platform. */
export function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function boardSize(number) {
  if (number <= 90) return 5;
  if (number <= 270) return 6;
  if (number <= 630) return 7;
  return 8;
}

/** Region labels do not matter; neither rotations nor reflections count as a new puzzle. */
export function canonicalBoard({ size, regions }) {
  const variants = [];
  for (let reflection = 0; reflection < 2; reflection++) {
    for (let rotation = 0; rotation < 4; rotation++) {
      const cells = Array(size * size);
      for (let index = 0; index < regions.length; index++) {
        let row = Math.floor(index / size);
        let column = index % size;
        if (reflection) column = size - 1 - column;
        for (let turn = 0; turn < rotation; turn++) {
          [row, column] = [column, size - 1 - row];
        }
        cells[row * size + column] = regions[index];
      }
      const labels = new Map();
      variants.push(
        cells
          .map((region) => {
            if (!labels.has(region)) labels.set(region, labels.size);
            return labels.get(region);
          })
          .join(''),
      );
    }
  }
  return `${size}:${variants.sort()[0]}`;
}

const placementsBySize = new Map();
function placements(size) {
  if (placementsBySize.has(size)) return placementsBySize.get(size);
  const answers = [];
  const columns = [];
  function visit(used) {
    if (columns.length === size) {
      answers.push(columns.map((column, row) => row * size + column));
      return;
    }
    for (let column = 0; column < size; column++) {
      if (used & (1 << column)) continue;
      if (columns.length && Math.abs(columns.at(-1) - column) <= 1) continue;
      columns.push(column);
      visit(used | (1 << column));
      columns.pop();
    }
  }
  visit(0);
  placementsBySize.set(size, answers);
  return answers;
}

/** Grow connected plots from a legal seed arrangement, then validate uniqueness separately. */
export function generateBoard(size, random) {
  const answers = placements(size);
  const centers = answers[Math.floor(random() * answers.length)];
  const regions = Array(size * size).fill(-1);
  centers.forEach((cell, region) => {
    regions[cell] = region;
  });
  const frontier = [];
  function addNeighbors(cell, region) {
    const row = Math.floor(cell / size);
    const column = cell % size;
    for (const neighbor of [
      row > 0 ? cell - size : -1,
      row + 1 < size ? cell + size : -1,
      column > 0 ? cell - 1 : -1,
      column + 1 < size ? cell + 1 : -1,
    ]) {
      if (neighbor >= 0 && regions[neighbor] === -1) frontier.push([neighbor, region]);
    }
  }
  centers.forEach(addNeighbors);
  while (frontier.length) {
    const index = Math.floor(random() * frontier.length);
    const [cell, region] = frontier[index];
    frontier[index] = frontier.at(-1);
    frontier.pop();
    if (regions[cell] !== -1) continue;
    regions[cell] = region;
    addNeighbors(cell, region);
  }
  return { size, regions };
}

export function generateCatalog(onProgress = () => {}) {
  const random = createRandom(GENERATOR_SEED);
  const seen = new Set(INTRODUCTORY_LEVELS.map(canonicalBoard));
  const generated = [];
  let attempts = 0;
  while (INTRODUCTORY_LEVELS.length + generated.length < TOTAL_LEVELS) {
    if (++attempts > 2_000_000) throw new Error('Generation budget exhausted');
    const number = INTRODUCTORY_LEVELS.length + generated.length + 1;
    const board = generateBoard(boardSize(number), random);
    if (solve(board, 2).length !== 1) continue;
    const key = canonicalBoard(board);
    if (seen.has(key)) continue;
    validateLevel({ ...board, id: `moss-${number}`, number, chapter: 1, title: '生成校验' });
    seen.add(key);
    generated.push(board);
    if (number % 100 === 0) onProgress({ number, attempts });
  }
  return generated;
}

export function serializeCatalog(boards) {
  return [
    '/** Generated offline by scripts/generate-levels.mjs. Do not edit individual layouts. */',
    `// Seed ${GENERATOR_SEED}; unique solutions; connected plots; rotation/reflection deduplicated.`,
    'export const GENERATED_BOARDS: ReadonlyArray<readonly [number, string]> = [',
    ...boards.map(({ size, regions }) => `  [${size}, '${regions.join('')}'],`),
    '];',
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const contents = serializeCatalog(
    generateCatalog(({ number, attempts }) =>
      console.log(`Generated ${number}/1000 (${attempts} candidates)`),
    ),
  );
  if (process.argv.includes('--check')) {
    if (readFileSync(OUTPUT, 'utf8') !== contents)
      throw new Error('Static catalog needs regeneration');
    console.log('Static catalog matches deterministic generation.');
  } else {
    writeFileSync(OUTPUT, contents);
    console.log(`Wrote ${fileURLToPath(OUTPUT)}`);
  }
}
