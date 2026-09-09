import { spawnSync } from 'node:child_process';
import { access, cp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const workspace = new URL('../../../', import.meta.url);
const catalog = JSON.parse(
  await readFile(new URL('../src/standalone-games.json', import.meta.url)),
);
for (const game of catalog) {
  try {
    await access(new URL(`games/${game.id}/package.json`, workspace));
  } catch {
    throw new Error('Game submodules are missing. Run git submodule update --init --recursive.');
  }
}
// Turbo reuses the Game builds when the parent build has already completed them.
const result = spawnSync(
  process.execPath,
  [
    process.env.npm_execpath,
    'exec',
    'turbo',
    'run',
    'build',
    '--filter=./games/*',
    '--concurrency=1',
  ],
  { cwd: fileURLToPath(workspace), stdio: 'inherit' },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const destination = new URL('../public/games/', import.meta.url);
// This is only the Shell's generated directory, never a submodule checkout.
await rm(destination, { recursive: true, force: true });
for (const game of catalog) {
  const source = new URL(`games/${game.id}/${game.output}/`, workspace);
  await access(new URL('index.html', source));
  await cp(source, new URL(`${game.id}/`, destination), { recursive: true });
}
