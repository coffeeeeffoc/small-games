import { createHash } from 'node:crypto';
import { access, readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
export async function sourceHash(directory = fileURLToPath(root)) {
  const files = [
    'package.json',
    'settings/v2/packages/engine.json',
    'settings/v2/packages/project.json',
  ];
  for (const dir of ['assets', 'scripts', 'startup'].filter(
    (dir) => dir !== 'startup' || existsSync(path.join(directory, dir)),
  ))
    for (const e of await readdir(path.join(directory, dir), {
      recursive: true,
      withFileTypes: true,
    }))
      if (e.isFile())
        files.push(
          path.relative(directory, path.join(e.parentPath, e.name)).replaceAll('\\', '/'),
        );
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    const bytes = await readFile(path.join(directory, file));
    hash.update(file + '\0');
    hash.update(
      /\.(?:ts|js|mjs|py|json|meta|scene|gltf|html|css|svg|md)$/.test(file)
        ? bytes.toString('utf8').replaceAll('\r\n', '\n')
        : bytes,
    );
  }
  // The shared Creator launcher also affects the build and its cache identity.
  hash.update(await readFile(new URL('../../carding-car/scripts/toolchain.mjs', import.meta.url), 'utf8')
    .then((source) => source.replaceAll('\r\n', '\n')));
  return hash.digest('hex');
}

export async function verifyPrebuilt(directory) {
  const dist = path.resolve(directory, 'dist');
  const info = JSON.parse(await readFile(path.join(dist, 'build-info.json'), 'utf8'));
  if (info.creator !== '3.8.8' || info.target !== 'web-mobile' || info.sourceHash !== await sourceHash())
    throw Error('Night Overwatch artifact does not match current sources; rebuild it on the Creator runner.');
  await access(path.join(dist, 'index.html'));
  await access(path.resolve(directory, 'cc.d.ts'));
  return dist;
}
