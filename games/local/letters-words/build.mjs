import { cp, mkdir, rm } from 'node:fs/promises';

const output = new URL('./dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'app.mjs', 'game.mjs', 'library.mjs', 'library-ui.mjs', 'style.css', 'favicon.svg', 'assets']) {
  await cp(new URL(name, import.meta.url), new URL(name, output), { recursive: true });
}
