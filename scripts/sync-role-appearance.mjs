import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../platforms/h5/role-appearance.js', import.meta.url),
  'utf8',
);
// Realtime owns its illustrated character gallery and page navigation. Its
// module deliberately shares the API contract, rather than this source file.
for (const game of ['cops-robbers']) {
  const file = new URL(`../games/local/${game}/src/role-appearance.js`, import.meta.url);
  if (process.argv.includes('--check'))
    assert.equal(
      (await readFile(file, 'utf8')).replaceAll('\r\n', '\n'),
      source.replaceAll('\r\n', '\n'),
      `${game}: run node scripts/sync-role-appearance.mjs`,
    );
  else await writeFile(file, source);
}
console.log('Shared role appearance modules are synchronized.');
