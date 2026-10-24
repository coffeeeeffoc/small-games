import { cp, mkdir, rm } from 'node:fs/promises';

const output = new URL('./dist/', import.meta.url);
const files = ['index.html', 'style.css', 'dev-mode.js', 'src', 'assets'];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of files) {
  await cp(new URL(file, import.meta.url), new URL(file, output), { recursive: true });
}
console.log('Built 灰烬防线 → dist/');
