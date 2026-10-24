import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const output = new URL('assets/scripts/generated/', root);
await mkdir(output, { recursive: true });
for (const name of (await readdir(new URL('src/', root)))
  .filter((name) => name.endsWith('.mjs') && name !== 'audio.mjs')
  .sort()) {
  const code = (await readFile(new URL('src/' + name, root), 'utf8')).replace(
    /(from\s+['"]\.\/[^'"]+)\.mjs(['"])/g,
    '$1.js$2',
  );
  await writeFile(new URL(name.replace('.mjs', '.js'), output), code);
  const hex = createHash('sha256')
    .update('three-choose-two/core/' + name)
    .digest('hex');
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  await writeFile(
    new URL(name.replace('.mjs', '.js.meta'), output),
    JSON.stringify(
      {
        ver: '4.0.24',
        importer: 'javascript',
        imported: true,
        uuid,
        files: [],
        subMetas: {},
        userData: {},
      },
      null,
      2,
    ),
  );
}
