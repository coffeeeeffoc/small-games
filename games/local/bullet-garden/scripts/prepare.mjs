import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { platformConfig } from './platform-config.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const config = await platformConfig(process.env.BULLET_GARDEN_PLATFORM_CONFIG);
await mkdir(new URL('../assets/scripts/generated/', import.meta.url), { recursive: true });
await build({
  entryPoints: [root + 'src/cocos-core.mjs'],
  outfile: root + 'assets/scripts/generated/core.js',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2020',
});
await writeFile(
  root + 'assets/scripts/generated/channel.ts',
  `export default ${JSON.stringify(config)};\n`,
);
for (const [file, importer, uuid] of [
  ['core.js', 'javascript', 'bb516fa6-63f2-4e4c-987c-d9596c61b342'],
  ['channel.ts', 'typescript', '009920ad-3038-4eae-83b9-bfd0bd111e5c'],
])
  await writeFile(
    root + 'assets/scripts/generated/' + file + '.meta',
    JSON.stringify(
      { ver: '4.0.24', importer, imported: true, uuid, files: [], subMetas: {}, userData: {} },
      null,
      2,
    ),
  );
