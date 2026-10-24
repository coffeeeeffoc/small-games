import { mkdir, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { editorRoot } from '../../carding-car/scripts/toolchain.mjs';
import { prepare } from './prepare.mjs';
import { verifyPrebuilt } from './artifact.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
await prepare();
const prebuilt = process.env.CASTLE_CANNON_PREBUILT_DIR;
if (prebuilt) await verifyPrebuilt(prebuilt);
const declarations = prebuilt
  ? path.resolve(prebuilt, 'cc.d.ts')
  : path.join(editorRoot, 'resources/resources/3d/engine/bin/.declarations/cc.d.ts');
await access(declarations);
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(
  path.join(root, 'reports/engine.d.ts'),
  `/// <reference path="${declarations.replaceAll('\\', '/')}" />\n`,
);
const require = createRequire(import.meta.url),
  tsc = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin/tsc');
for (const config of ['tsconfig.json', 'tsconfig.cocos.json']) {
  const result = spawnSync(process.execPath, [tsc, '-p', path.join(root, config)], {
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
