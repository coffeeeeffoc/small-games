import { competitionBootstrapSource } from './api-config.mjs';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';

const output = new URL('./dist/', import.meta.url);
const files = [
  'index.html',
  'style.css',
  'main.mjs',
  'render.mjs',
  'engine.mjs',
  'levels.mjs',
  'progress.mjs',
  'leaderboard.mjs',
  'dev-mode.js',
  'fullscreen.js',
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of files) {
  await cp(new URL(file, import.meta.url), new URL(file, output));
}
console.log('Built 转塔留一脚刹车 → dist/');

await cp(
  new URL('../../../platforms/h5/publishing.js', import.meta.url),
  new URL('publishing.js', output),
);

await writeFile(new URL('competition.js', output), await competitionBootstrapSource());
await cp(
  new URL('../../../platforms/competition/game-services.js', import.meta.url),
  new URL('game-services.js', output),
);
