import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../platforms/h5/role-appearance.js', import.meta.url),
  'utf8',
);
for (const game of ['cops-robbers', 'cops-robbers-realtime']) {
  const file = new URL(`../games/local/${game}/src/role-appearance.js`, import.meta.url);
  if (process.argv.includes('--check'))
    assert.equal(
      (await readFile(file, 'utf8')).replaceAll('\r\n', '\n'),
      source.replaceAll('\r\n', '\n'),
      `${game}: run node scripts/sync-role-appearance.mjs`,
    );
  else await writeFile(file, source);
}
console.log('Both local role appearance modules are synchronized.');
