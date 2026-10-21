import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { additionalH5Games } from './h5-ad-config.mjs';

const game = process.argv[2];
assert(additionalH5Games.includes(game), 'Unknown H5 compiler');
const root = fileURLToPath(new URL(`../games/local/${game}/`, import.meta.url));
if (['carding-car', 'night-overwatch', 'homebound-station', 'merge-front'].includes(game)) {
  execFileSync(process.execPath, ['scripts/build.mjs', 'web-mobile'], {
    cwd: root,
    stdio: 'inherit',
    timeout: 1100000,
  });
} else if (['wulong-city', 'letters-words2'].includes(game)) {
  execFileSync(process.execPath, ['build.mjs'], { cwd: root, stdio: 'inherit' });
} else {
  const require = createRequire(path.join(root, 'package.json'));
  if (game === 'travel-bund')
    execFileSync(
      process.execPath,
      [path.join(path.dirname(require.resolve('typescript/package.json')), 'bin/tsc'), '--noEmit'],
      { cwd: root, stdio: 'inherit' },
    );
  const { build } = await import(pathToFileURL(require.resolve('vite')).href);
  await build({ root, base: './' });
}
