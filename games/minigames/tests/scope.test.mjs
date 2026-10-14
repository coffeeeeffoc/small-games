import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cocosMinigameFileScopes, cocosMinigamePlan } from '../scripts/validation-scope.mjs';
const readHead = (file) => readFileSync(new URL('../../../' + file, import.meta.url), 'utf8');
test('native project scope is finite; unknown games, scripts and generated output remain blocked', () => {
  const changedPaths = [
    'games/minigames/cops-robbers/controller.mjs',
    'games/minigames/shared/runtime.js',
    'games/minigames/fourth-game/package.json',
    'games/minigames/scripts/unreviewed.mjs',
    'games/minigames/xiangqi-five/build/game.js',
  ];
  const scopes = cocosMinigameFileScopes({ changedPaths, readHead });
  assert.deepEqual([...scopes.keys()], changedPaths.slice(0, 2));
  assert.deepEqual([...scopes.values()], [[], []]);
  const plan = cocosMinigamePlan({ changedPaths, fileScopes: scopes });
  assert.deepEqual(plan.ids, ['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five']);
  assert.deepEqual(plan.native_only_paths, changedPaths.slice(0, 2));
});
test('original rules select the Cocos consumer without removing original H5 validation', () => {
  const changedPaths = ['games/local/cops-robbers-realtime/src/engine.js'];
  const plan = cocosMinigamePlan({ changedPaths, fileScopes: new Map() });
  assert.deepEqual(plan.ids, ['cops-robbers-realtime']);
  assert.deepEqual(plan.native_only_paths, []);
});
test('only the reviewed required engine workflow is classified', () => {
  const file = '.github/workflows/cocos-minigames.yml';
  const real = readFileSync(
    new URL('../../../.github/workflows/cocos-minigames.yml', import.meta.url),
    'utf8',
  );
  assert(cocosMinigameFileScopes({ changedPaths: [file], readHead: () => real }).has(file));
  assert(
    !cocosMinigameFileScopes({
      changedPaths: [file],
      readHead: () => real.replace('needs: creator', 'needs: []'),
    }).has(file),
  );
});
