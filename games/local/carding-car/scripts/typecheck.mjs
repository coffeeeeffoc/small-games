import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { verifyPrebuilt } from './artifact.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
if (process.env.KART_PREBUILT_DIR) {
  await verifyPrebuilt(process.env.KART_PREBUILT_DIR);
  await mkdir(path.join(root, 'reports'), { recursive: true });
  await writeFile(
    path.join(root, 'reports/engine.d.ts'),
    `/// <reference path="${path.resolve(process.env.KART_PREBUILT_DIR, 'cc.d.ts').replaceAll('\\', '/')}" />\n`,
  );
}
if (!existsSync(root + '/reports/engine.d.ts'))
  throw new Error('Run pnpm setup in carding-car first to locate the engine declarations.');
const tsc = path.join(
  path.dirname(fileURLToPath(import.meta.resolve('typescript/package.json'))),
  'bin/tsc',
);
const result = spawnSync(process.execPath, [tsc, '-p', root], { stdio: 'inherit' });
process.exit(result.status ?? 1);
