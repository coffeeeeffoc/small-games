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

test('word island readiness is home, with an explicit start adapter before board assertions', () => {
  assert.equal(markers['letters-words2'], '#focus-button');
  assert.equal(homeControls['letters-words2'], '#focus-button');
  assert.equal(entryMode('letters-words2'), 'adapter');
});

test('street chase uses real Cocos canvas controls', () => {
  assert.equal(markers['chase-thief'], '#GameCanvas');
  assert.equal(homeControls['chase-thief'], undefined);
  assert.equal(entryMode('chase-thief'), 'legacy');
});

test('Tianxia enters its ready Creator battlefield through preparation', () => {
  assert.equal(markers['tianxia-chalu'], '#start');
  assert.deepEqual(homeControls['tianxia-chalu'], ['#start', '#begin-battle']);
  assert.equal(entryMode('tianxia-chalu'), 'adapter');
});

test('Orbit Creator owns its native home and interaction checks instead of clicking invisible DOM controls', async () => {
  assert.equal(markers['orbit-atelier'], '#GameCanvas');
  assert.equal(homeControls['orbit-atelier'], undefined);
  assert.equal(entryMode('orbit-atelier'), 'legacy');
  assert.equal(
    await enterStandalone(
      {
        locator() {
          throw Error('No DOM click for Creator');
        },
      },
      'orbit-atelier',
      true,
    ),
    'legacy',
  );
});

test('Tower Creator owns its native menu and touch flow', async () => {
  assert.equal(markers['tower-brake'], '#GameCanvas');
  assert.equal(homeControls['tower-brake'], undefined);
  assert.equal(entryMode('tower-brake'), 'legacy');
  assert.equal(
    await enterStandalone(
      {
        locator() {
          throw Error('No DOM click for Creator');
        },
      },
      'tower-brake',
      true,
    ),
    'legacy',
  );
});

test('Tetracube waits for the real Creator scene and owns its canvas input flow', () => {
  assert.equal(markers.tetracube, 'body[data-tetracube-ready="true"]');
  assert.equal(homeControls.tetracube, undefined);
  assert.equal(entryMode('tetracube'), 'legacy');
});
