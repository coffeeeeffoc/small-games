import { stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isGameSource } from './pages-test-scope.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

export function gameTestCommand(env = process.env) {
  const full = env.PAGES_FULL_REGRESSION;
  if (full !== undefined && full !== '' && full !== 'true' && full !== 'false') {
    throw new Error('PAGES_FULL_REGRESSION must be true or false');
  }
  if (full === 'true') return { command: 'pnpm', args: ['games:test'], sources: [] };
  const sources = JSON.parse(env.PAGES_GAME_SOURCES || '[]');
  if (!Array.isArray(sources) || sources.some((source) => !isGameSource(source))) {
    throw new Error('PAGES_GAME_SOURCES must be a JSON array of game package directories');
  }
  const selected = [...new Set(sources)].sort();
  if (selected.length === 0) return null;
  return {
    command: 'pnpm',
    args: [
      'exec',
      'turbo',
      'run',
      'test',
      ...selected.map((source) => `--filter=./${source}`),
      '--concurrency=1',
    ],
    sources: selected,
  };
}

export async function main(env = process.env, root = ROOT) {
  const invocation = gameTestCommand(env);
  if (!invocation) {
    console.log('No affected game package tests.');
    return 0;
  }
  for (const source of invocation.sources) {
    const packageFile = await stat(path.join(root, source, 'package.json'));
    if (!packageFile.isFile()) throw new Error(`Missing game package: ${source}`);
  }
  console.log(`Running ${invocation.command} ${invocation.args.join(' ')}`);
  return await new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: root,
      env,
      stdio: 'inherit',
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`Game tests terminated by ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
