import { access, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { editorRoot } from '../../carding-car/scripts/toolchain.mjs';
import { verifyPrebuilt } from './artifact.mjs';
const root = fileURLToPath(new URL('../', import.meta.url)),
  prebuilt = process.env.HOMEBOUND_STATION_PREBUILT_DIR;
if (prebuilt) await verifyPrebuilt(prebuilt);
const declaration = prebuilt
  ? path.resolve(prebuilt, 'cc.d.ts')
  : path.join(editorRoot, 'resources/resources/3d/engine/bin/.declarations/cc.d.ts');
try {
  await access(declaration);
} catch {
  throw Error(
    '需要真实 Creator 3.8.8 引擎声明：设置 COCOS_CREATOR 或源码匹配的 HOMEBOUND_STATION_PREBUILT_DIR。',
  );
}
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(
  path.join(root, 'reports/engine.d.ts'),
  `/// <reference path="${declaration.replaceAll('\\', '/')}" />\n`,
);
const require = createRequire(import.meta.url),
  tsc = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin/tsc');
process.exit(spawnSync(process.execPath, [tsc, '-p', root], { stdio: 'inherit' }).status ?? 1);
