import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, cp, rename, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root, repo, games } from './config.mjs';
import { pluginPaths } from './build.mjs';
import { digest } from '../../../apps/shell-minigame/scripts/taptap-package.mjs';
import {
  verifyPlugin,
  officialPluginSha256,
} from '../../../apps/shell-minigame/scripts/taptap-cocos-inputs.mjs';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repo,
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} failed`);
}
run(process.execPath, [
  'games/local/carding-car/scripts/setup.mjs',
  ...(process.argv.includes('--bilibili') ? ['--bilibili'] : []),
]);
if (process.argv.includes('--bilibili')) {
  for (const game of Object.keys(games))
    await cp(
      path.join(repo, 'games/local/carding-car/extensions/biligame-builder'),
      path.join(root, game, 'extensions/biligame-builder'),
      { recursive: true },
    );
}
if (process.argv.includes('--taptap')) {
  const plugin = pluginPaths();
  await mkdir(path.dirname(plugin.archive), { recursive: true });
  if (!existsSync(plugin.archive)) {
    const temporary = plugin.archive + '.download';
    try {
      run(process.platform === 'win32' ? 'curl.exe' : 'curl', [
        '--fail',
        '--location',
        '--retry',
        '3',
        '--retry-all-errors',
        '--connect-timeout',
        '30',
        '--max-time',
        '120',
        '--referer',
        'https://developer.taptap.cn/',
        '-A',
        'Mozilla/5.0',
        '--output',
        temporary,
        'https://app-res.tapimg.com/file/2026-04-14/67e7d94f5e586596dab061816d1c509d.zip',
      ]);
      assert.equal(
        digest(await readFile(temporary)),
        officialPluginSha256,
        'Official TapTap archive checksum changed',
      );
      await rename(temporary, plugin.archive);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  assert.equal(
    digest(await readFile(plugin.archive)),
    officialPluginSha256,
    'Official TapTap archive checksum changed',
  );
  if (!existsSync(plugin.directory)) {
    await mkdir(path.dirname(plugin.directory), { recursive: true });
    run('tar', ['-xf', plugin.archive, '-C', path.dirname(plugin.directory)]);
  }
  await verifyPlugin(plugin.archive, plugin.directory);
  for (const directory of [plugin.directory, path.join(plugin.directory, 'converter')])
    run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: directory,
      shell: process.platform === 'win32',
    });
  console.log('Verified official TapTap converter ready:', plugin.directory);
}
