import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
for (const dir of ['src', 'shared', 'web', 'h5', 'wechat', 'scripts', 'tests']) {
  for (const name of await readdir(new URL(`${dir}/`, root), { recursive: true })) {
    if (!/\.(m?js|json)$/.test(name)) continue;
    const file = new URL(`${dir}/${name}`, root);
    if (name.endsWith('.json')) JSON.parse(await readFile(file, 'utf8'));
    else if (
      spawnSync(process.execPath, ['--check', fileURLToPath(file)], { stdio: 'inherit' }).status !==
      0
    )
      process.exit(1);
  }
}
for (const name of ['build.mjs', 'server.js']) {
  if (
    spawnSync(process.execPath, ['--check', fileURLToPath(new URL(name, root))], {
      stdio: 'inherit',
    }).status !== 0
  )
    process.exit(1);
}
console.log('Echo Lab JavaScript and JSON checks passed.');
