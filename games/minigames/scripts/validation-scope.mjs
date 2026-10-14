import { createHash } from 'node:crypto';

export const cocosMinigameIds = ['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'];
const prefix = 'games/minigames/';
const common = new Set([
  '.gitignore',
  '.env.example',
  'package.json',
  'shared/CocosMiniGame.ts',
  'shared/runtime.js',
  'shared/runtime.d.ts',
  'shared/browser-sdk.js',
  'shared/browser-sdk.d.ts',
  'scripts/config.mjs',
  'scripts/prepare.mjs',
  'scripts/build.mjs',
  'scripts/setup.mjs',
  'scripts/import-kuaishou.mjs',
  'scripts/browser.mjs',
  'scripts/validation-scope.mjs',
  'tests/build.test.mjs',
  'tests/runtime.test.mjs',
  'tests/cops.test.mjs',
  'tests/scope.test.mjs',
]);
const projectFiles = new Set([
  'package.json',
  'tsconfig.json',
  'settings/v2/packages/engine.json',
  'settings/v2/packages/project.json',
  'assets/scenes.meta',
  'assets/scripts.meta',
  'assets/scenes/main.scene',
  'assets/scenes/main.scene.meta',
  ...[
    'CocosMiniGame.ts',
    'runtime.js',
    'runtime.d.ts',
    'browser-sdk.js',
    'browser-sdk.d.ts',
    'game-entry.js',
    'game-entry.d.ts',
  ].map((file) => 'assets/scripts/' + file + '.meta'),
]);
const workflow = '.github/workflows/cocos-minigames.yml';
const workflowSha256 = '8fc5cca7a1b2fed65e540073b2e7a86b67fafc85b2976152fed0c6bb84e17527';
export function cocosMinigameFileScopes({ changedPaths, readHead }) {
  const scopes = new Map();
  for (const file of changedPaths) {
    if (file === workflow) {
      try {
        if (
          createHash('sha256').update(readHead(file).replaceAll('\r\n', '\n')).digest('hex') ===
          workflowSha256
        )
          scopes.set(file, []);
      } catch {
        /* Unknown workflow remains unclassified. */
      }
      continue;
    }
    if (!file.startsWith(prefix)) continue;
    const relative = file.slice(prefix.length),
      [game, ...parts] = relative.split('/');
    if (
      common.has(relative) ||
      (cocosMinigameIds.includes(game) &&
        (projectFiles.has(parts.join('/')) ||
          (game === 'cops-robbers' && parts.join('/') === 'controller.mjs')))
    )
      scopes.set(file, []);
  }
  return scopes;
}

export function cocosMinigamePlan({ changedPaths, fileScopes }) {
  const ids = new Set(),
    nativePaths = [];
  for (const file of changedPaths) {
    if ((file.startsWith(prefix) || file === workflow) && fileScopes.has(file)) {
      nativePaths.push(file);
      const game = file.slice(prefix.length).split('/')[0];
      if (cocosMinigameIds.includes(game)) ids.add(game);
      else for (const id of cocosMinigameIds) ids.add(id);
    }
    for (const id of ['cops-robbers', 'cops-robbers-realtime'])
      if (file.startsWith(`games/local/${id}/src/`)) ids.add(id);
    if (
      file === 'games/submodules/xiangqi-five' ||
      file.startsWith('games/submodules/xiangqi-five/') ||
      file.startsWith('platforms/competition/xiangqi-five/')
    )
      ids.add('xiangqi-five');
    if (
      /^platforms\/(?:competition\/(?:native|client|format)\.js|taptap\/|alipay\/normalize\.mjs|bilibili\/native-entry\.mjs)/.test(
        file,
      ) ||
      /^apps\/shell-minigame\/(?:src\/competition-availability\.mjs|scripts\/taptap-[^/]+\.mjs)$/.test(
        file,
      ) ||
      [
        'games/local/game-cricket/public/cricket-audio/perfect.wav',
        'games/local/carding-car/scripts/toolchain.mjs',
        'games/local/carding-car/scripts/setup.mjs',
      ].includes(file)
    )
      for (const id of cocosMinigameIds) ids.add(id);
  }
  return { ids: [...ids].sort(), native_only_paths: nativePaths };
}
