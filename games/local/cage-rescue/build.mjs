import { competitionBootstrapSource } from './api-config.mjs';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { LEVELS, validateLevels } from './src/levels.mjs';

const errors = validateLevels(LEVELS);
if (errors.length) throw new Error(errors.join('\n'));
const dist = new URL('./dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of [
  'index.html',
  'style.css',
  'dev-mode.js',
  'fullscreen.js',
  'leaderboard.mjs',
  'src',
]) {
  await cp(new URL(file, import.meta.url), new URL(file, dist), { recursive: true });
}
console.log('Built 打破笼子接住人 → dist/');

await cp(
  new URL('../../../platforms/h5/publishing.js', import.meta.url),
  new URL('publishing.js', dist),
);

await writeFile(new URL('competition.js', dist), await competitionBootstrapSource());
await cp(
  new URL('../../../platforms/competition/game-services.js', import.meta.url),
  new URL('game-services.js', dist),
);

await cp(
  new URL('../../../platforms/competition/client.js', import.meta.url),
  new URL('client.js', dist),
);
