import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { verifyPagesArtifacts } from './pages-validation.mjs';
const games = JSON.parse(await readFile(new URL('../src/standalone-games.json', import.meta.url)));
const result = await verifyPagesArtifacts({
  dist: fileURLToPath(new URL('../dist/', import.meta.url)),
  games,
  basePath: process.env.PAGES_BASE_PATH ?? '/small-games/',
});
console.log(
  `Static Pages artifacts passed: ${result.games} games, ${result.files} files. No browser launched.`,
);
