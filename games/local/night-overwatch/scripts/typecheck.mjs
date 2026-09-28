import { writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { editorRoot } from '../../carding-car/scripts/toolchain.mjs';
const root = new URL('../', import.meta.url);
await mkdir(new URL('reports/', root), { recursive: true });
await writeFile(
  new URL('reports/engine.d.ts', root),
  `/// <reference path="${editorRoot.replaceAll('\\', '/')}/resources/resources/3d/engine/bin/.declarations/cc.d.ts" />\n`,
);
const require = createRequire(new URL('../../carding-car/package.json', import.meta.url));
const tsc = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin/tsc');
process.exit(
  spawnSync(
    process.execPath,
    [tsc, '-p', new URL('../tsconfig.json', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')],
    { stdio: 'inherit' },
  ).status ?? 1,
);
