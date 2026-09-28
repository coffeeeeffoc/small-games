import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
export async function sourceHash() {
  const files = [
    'package.json',
    'settings/v2/packages/engine.json',
    'settings/v2/packages/project.json',
  ];
  for (const dir of ['assets', 'scripts'])
    for (const e of await readdir(new URL(dir + '/', root), {
      recursive: true,
      withFileTypes: true,
    }))
      if (e.isFile())
        files.push(
          (e.parentPath + '/' + e.name)
            .replaceAll('\\', '/')
            .replace(new URL(root).pathname.replace(/^\/(?=[A-Za-z]:)/, ''), ''),
        );
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    const bytes = await readFile(new URL(file, root));
    hash.update(file + '\0');
    hash.update(
      /\.(?:ts|mjs|json|meta|scene|gltf)$/.test(file)
        ? bytes.toString('utf8').replaceAll('\r\n', '\n')
        : bytes,
    );
  }
  return hash.digest('hex');
}
