import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Serial execution: native/H5 preparation writes ignored generated outputs.
const cwd = fileURLToPath(new URL('../../../', import.meta.url));
for (const args of [
  ['--test', 'games/minigames/tests/tap-multiplayer.test.mjs'],
  [
    '--test',
    '--test-name-pattern',
    '^Tap multiplayer build ',
    'games/minigames/tests/build.test.mjs',
  ],
  ['games/minigames/tests/tap-multiplayer.browser.mjs'],
])
  execFileSync(process.execPath, args, { cwd, stdio: 'inherit', env: process.env });
