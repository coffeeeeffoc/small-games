import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { CHAPTERS, INTRODUCTORY_LEVELS, LEVELS, getLevel, getLevelIndex } from '../src/content.ts';
import { GENERATED_BOARDS } from '../src/generated-levels.ts';
import { solve } from '../src/rules.ts';
import {
  GENERATOR_SEED,
  canonicalBoard,
  createRandom,
  generateBoard,
} from '../scripts/generate-levels.mjs';

test('the original thirty levels retain their exact IDs, metadata, and layouts', () => {
  assert.equal(INTRODUCTORY_LEVELS.length, 30);
  assert.equal(
    createHash('sha256').update(JSON.stringify(INTRODUCTORY_LEVELS)).digest('hex'),
    'be518d0aed8d5c8afb7ef81bf2af60152abf150814c5dde78f071b203f85576e',
  );
  assert.deepEqual(LEVELS.slice(0, 30), INTRODUCTORY_LEVELS);
});

test('the thousand puzzles are distinct even after reflection, rotation, or relabeling', () => {
  assert.equal(new Set(LEVELS.map(canonicalBoard)).size, 1000);
  const first = LEVELS[0];
  const mirrored = {
    ...first,
    regions: first.regions.map((_, cell) => {
      const row = Math.floor(cell / first.size);
      const column = first.size - 1 - (cell % first.size);
      return first.size - 1 - first.regions[row * first.size + column];
    }),
  };
  assert.equal(canonicalBoard(mirrored), canonicalBoard(first));
});

test('the deterministic generator reproduces the first new static layouts', () => {
  const random = createRandom(GENERATOR_SEED);
  const seen = new Set(INTRODUCTORY_LEVELS.map(canonicalBoard));
  const generated: Array<[number, string]> = [];
  for (let attempt = 0; generated.length < 3 && attempt < 1000; attempt++) {
    const board = generateBoard(5, random);
    if (solve(board, 2).length !== 1) continue;
    const key = canonicalBoard(board);
    if (seen.has(key)) continue;
    seen.add(key);
    generated.push([board.size, board.regions.join('')]);
  }
  assert.equal(generated.length, 3);
  assert.deepEqual(generated, GENERATED_BOARDS.slice(0, 3));
});

test('catalog pages remain bounded and every stable ID is indexed, including the final plot', () => {
  assert.deepEqual(CHAPTERS.at(-1)?.levelIds, ['moss-997', 'moss-998', 'moss-999', 'moss-1000']);
  assert.ok(CHAPTERS.every((chapter) => chapter.levelIds.length <= 6));
  for (const [index, level] of LEVELS.entries()) {
    assert.equal(getLevelIndex(level.id), index);
    assert.equal(getLevel(level.id), level);
  }
  assert.equal(getLevelIndex('unknown'), -1);
  assert.equal(getLevel('unknown'), undefined);
  for (const [number, size] of [
    [31, 5],
    [90, 5],
    [91, 6],
    [270, 6],
    [271, 7],
    [630, 7],
    [631, 8],
    [1000, 8],
  ]) {
    assert.equal(LEVELS[number - 1].size, size);
  }
});
