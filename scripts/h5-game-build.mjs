import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { additionalH5Games } from './h5-ad-config.mjs';

const game = process.argv[2];
assert(additionalH5Games.includes(game), 'Unknown H5 compiler');
const root = fileURLToPath(
  new URL(`../games/local/${game === 'moss-garden' ? 'game-moss-garden' : game}/`, import.meta.url),
);
if (
  [
    'carding-car',
    'night-overwatch',
    'homebound-station',
    'merge-front',
    'tetracube',
    'place-and-clear',
    'ashfall-front',
    'bullet-garden',
    'tower-brake',
    'tianxia-chalu',
  ].includes(game)
) {
  execFileSync(process.execPath, ['scripts/build.mjs', 'web-mobile'], {
    cwd: root,
    stdio: 'inherit',
    timeout: 1100000,
  });
} else if (
  [
    'porcelain-puzzle',
    'wulong-city',
    'letters-words2',
    'ball-roguelite',
    'flick-arena',
    'chase-thief',
    'cage-rescue',
    'ember-bounce',
    'out-of-frame',
    'surprise-kept',
    'two-sided-box',
  ].includes(game)
) {
  execFileSync(process.execPath, ['build.mjs'], { cwd: root, stdio: 'inherit' });
} else {
  const require = createRequire(path.join(root, 'package.json'));
  const tsc = ['travel-bund', 'moss-garden', 'fold-the-world'].includes(game)
    ? path.join(path.dirname(require.resolve('typescript/package.json')), 'bin/tsc')
    : undefined;
  if (game === 'moss-garden')
    for (const name of ['content-schema', 'game-contract'])
      execFileSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], {
        cwd: path.resolve(root, '../../../packages', name),
        stdio: 'inherit',
      });
  if (['travel-bund', 'moss-garden', 'fold-the-world'].includes(game))
    execFileSync(process.execPath, [tsc, '--noEmit'], { cwd: root, stdio: 'inherit' });
  const { build } = await import(pathToFileURL(require.resolve('vite')).href);
  await build({ root, base: './' });
}
