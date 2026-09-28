import { writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { editorRoot } from '../../carding-car/scripts/toolchain.mjs';
import { verifyPrebuilt } from './artifact.mjs';
const root = new URL('../', import.meta.url);
const prebuilt = process.env.NIGHT_OVERWATCH_PREBUILT_DIR;
if (prebuilt) await verifyPrebuilt(prebuilt);
const declarations = prebuilt
  ? path.resolve(prebuilt, 'cc.d.ts')
  : path.join(editorRoot, 'resources/resources/3d/engine/bin/.declarations/cc.d.ts');
await mkdir(new URL('reports/', root), { recursive: true });
await writeFile(
  new URL('reports/engine.d.ts', root),
  `/// <reference path="${declarations.replaceAll('\\', '/')}" />\n`,
);
const require = createRequire(new URL('../../carding-car/package.json', import.meta.url));
const tsc = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin/tsc');
process.exit(
  spawnSync(
    process.execPath,
    [tsc, '-p', fileURLToPath(new URL('../tsconfig.json', import.meta.url))],
    { stdio: 'inherit' },
  ).status ?? 1,
);
