import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  markers,
  homeControls,
  legacyEntryIds,
  entryMode,
  enterStandalone,
} from './standalone-game-entry.mjs';
test('every registered standalone has one explicit adapter or legacy mode and a gameplay branch', async () => {
  const games = JSON.parse(
    await readFile(new URL('../src/standalone-games.json', import.meta.url)),
  );
  const source = await readFile(new URL('./standalone-game-checks.mjs', import.meta.url), 'utf8');
  assert.equal(new Set(legacyEntryIds).size, legacyEntryIds.length);
  for (const game of games) {
    assert(markers[game.id]);
    assert.equal(
      Number(Object.hasOwn(homeControls, game.id)) + Number(legacyEntryIds.includes(game.id)),
      1,
      game.id,
    );
    assert(['adapter', 'legacy'].includes(entryMode(game.id)));
    assert(source.includes(`id === '${game.id}'`), `Missing legacy/gameplay branch ${game.id}`);
  }
  assert.throws(() => entryMode('new-unreviewed-game'), /Missing/);
});
test('explicit legacy mode leaves the original native interaction flow in charge', async () => {
  const frame = {
    locator: () => {
      throw new Error('Legacy entry must remain in the existing assertion');
    },
  };
  for (const id of legacyEntryIds) assert.equal(await enterStandalone(frame, id, true), 'legacy');
});
test('entry adapters never force clicks and have only stable semantic selectors', async () => {
  const source = await readFile(new URL('./standalone-game-entry.mjs', import.meta.url), 'utf8');
  assert(!/force\s*:/.test(source));
  for (const control of Object.values(homeControls))
    for (const selector of Array.isArray(control) ? control : [control])
      assert(/^#|^\[data-/.test(selector));
});
