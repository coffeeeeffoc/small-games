import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const gameRoot = fileURLToPath(new URL('../', import.meta.url));
const publicBuildCLI = fileURLToPath(new URL('../../../../apps/shell-minigame/scripts/cocos-platform.mjs', import.meta.url));
export async function buildPlatform(channel, options = {}) {
  const args = [publicBuildCLI, gameRoot, channel];
  if (options.mode === 'release') args.push('--release');
  else if (options.mode && options.mode !== 'preview') throw Error('mode must be preview or release');
  if (options.configOnly) args.push('--config-only');
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...(options.env || {}) } });
  if (result.status !== 0) throw Error(result.stderr || result.stdout || 'Native build CLI failed.');
  return JSON.parse(result.stdout.trim().split('\n').at(-1));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await buildPlatform(process.argv[2], {
    mode: process.argv.includes('--release') ? 'release' : 'preview', configOnly: process.argv.includes('--config-only'),
  })));
}
