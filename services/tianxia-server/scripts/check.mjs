import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

for (const directory of ['src', 'scripts', 'tests']) {
  for (const filename of readdirSync(directory).filter((entry) => entry.endsWith('.mjs'))) {
    const result = spawnSync(process.execPath, ['--check', path.join(directory, filename)], {
      stdio: 'inherit',
    });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
await import('../src/server.mjs');
console.log('天下岔路服务语法与共享引擎导入检查通过');
