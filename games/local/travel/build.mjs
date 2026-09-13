import { cp, mkdir, rm } from 'node:fs/promises';

const output = new URL('./dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of [
  'index.html', 'credits.html', 'app.mjs', 'game-state.mjs', 'style.css',
  'journey.css', 'journey.mjs', 'journey-depth.css', 'journey-depth.mjs',
  'travel-3d.css', 'travel-3d.mjs', 'travel-world.mjs', 'assets', 'vendor',
]) {
  await cp(new URL(name, import.meta.url), new URL(name, output), { recursive: true });
}
