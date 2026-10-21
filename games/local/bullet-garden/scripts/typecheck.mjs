import { mkdir, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { editorRoot } from '../../carding-car/scripts/toolchain.mjs';
import { platformConfig } from './platform-config.mjs';
import { verifyPrebuilt } from './artifact.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
await import('./prepare.mjs');
const prebuilt = process.env.BULLET_GARDEN_PREBUILT_DIR;
if (prebuilt)
  await verifyPrebuilt(prebuilt, await platformConfig(process.env.BULLET_GARDEN_PLATFORM_CONFIG));
const declarations = prebuilt
  ? path.resolve(prebuilt, 'cc.d.ts')
  : path.join(editorRoot, 'resources/resources/3d/engine/bin/.declarations/cc.d.ts');
await access(declarations);
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(
  path.join(root, 'reports/engine.d.ts'),
  `/// <reference path="${declarations.replaceAll('\\', '/')}" />\n`,
);
const require = createRequire(import.meta.url);
const tsc = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin/tsc');
process.exit(spawnSync(process.execPath, [tsc, '-p', root], { stdio: 'inherit' }).status ?? 1);
