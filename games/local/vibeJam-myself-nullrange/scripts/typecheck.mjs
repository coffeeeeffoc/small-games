import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { editorRoot } from '../../carding-car/scripts/toolchain.mjs';
import { prepare } from './prepare.mjs';
import { verifyPrebuilt } from './artifact.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
await prepare();
const prebuilt = process.env.NULLRANGE_PREBUILT_DIR;
if (prebuilt) await verifyPrebuilt(prebuilt);
const declarations = prebuilt
  ? path.resolve(prebuilt, 'cc.d.ts')
  : path.join(editorRoot, 'resources/resources/3d/engine/bin/.declarations/cc.d.ts');
await access(declarations);
// CI test steps reuse this real declaration even when their prebuilt environment is not inherited.
await writeFile(path.join(root, 'cc.d.ts'), await readFile(declarations));
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(
  path.join(root, 'reports/engine.d.ts'),
  `/// <reference path="${declarations.replaceAll('\\', '/')}" />\n`,
);
const require = createRequire(import.meta.url);
const tsc = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin/tsc');
process.exit(spawnSync(process.execPath, [tsc, '-p', root], { stdio: 'inherit' }).status ?? 1);
