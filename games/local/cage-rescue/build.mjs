import { cp, mkdir, rm } from 'node:fs/promises';
import { LEVELS, validateLevels } from './src/levels.mjs';

const errors = validateLevels(LEVELS);
if (errors.length) throw new Error(errors.join('\n'));
const dist = new URL('./dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'style.css', 'dev-mode.js', 'fullscreen.js', 'src']) {
  await cp(new URL(file, import.meta.url), new URL(file, dist), { recursive: true });
}
console.log('Built 打破笼子接住人 → dist/');
