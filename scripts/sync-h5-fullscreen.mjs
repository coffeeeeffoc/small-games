import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('platforms/h5/fullscreen.js', root), 'utf8');
const copies = [
  'apps/shell-web/public/fullscreen.js',
  'games/local/carding-car/scripts/fullscreen.js',
  'games/local/cops-robbers/src/fullscreen.js',
  'games/local/cops-robbers-realtime/src/fullscreen.js',
  'games/local/letters-words2/fullscreen.js',
  'games/local/vibeJam-myself-history-guess/public/fullscreen.js',
  'games/submodules/xiangqi-five/fullscreen.js',
];
for (const path of copies) {
  const file = new URL(path, root);
  if (process.argv.includes('--check')) {
    assert.equal((await readFile(file, 'utf8')).replaceAll('\r\n', '\n'), source.replaceAll('\r\n', '\n'), `${path} differs; run node scripts/sync-h5-fullscreen.mjs`);
  } else {
    await mkdir(new URL('./', file), { recursive: true });
    await writeFile(file, source);
  }
}
console.log(`H5 fullscreen: ${copies.length} copies ${process.argv.includes('--check') ? 'verified' : 'updated'}.`);
