import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Serial execution: H5 preparation writes ignored generated outputs.
const cwd = fileURLToPath(new URL('../', import.meta.url));
for (const args of [
  ['--test', 'platforms/taptap/tests/tap-multiplayer.test.mjs'],
  ['platforms/taptap/tests/tap-multiplayer.browser.mjs'],
])
  execFileSync(process.execPath, args, { cwd, stdio: 'inherit', env: process.env });
