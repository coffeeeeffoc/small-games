import { cp, mkdir, rm, stat } from 'node:fs/promises';

const output = new URL('./dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'style.css', 'main.mjs', 'dev-mode.js', 'fullscreen.js', 'competition.js', 'src']) {
  await cp(new URL(name, import.meta.url), new URL(name, output), { recursive: true });
}
await stat(new URL('src/engine.mjs', output));
console.log('Built 三块选两块 → dist/');
