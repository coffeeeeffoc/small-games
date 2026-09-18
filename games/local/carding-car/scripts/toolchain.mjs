import { existsSync, writeFileSync, appendFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
export const editor =
  process.env.COCOS_CREATOR ||
  (existsSync('D:/tools/cocos/CocosCreator.exe')
    ? 'D:/tools/cocos/CocosCreator.exe'
    : path.join(os.homedir(), '.cache/cocos/3.8.8/CocosCreator.exe'));
export const editorRoot = path.dirname(editor);

export async function runCreator(
  args,
  logPath,
  { executable = editor, timeoutMs = 15 * 60 * 1000 } = {},
) {
  writeFileSync(logPath, '');
  const proc = spawn(executable, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '',
    timedOut = false;
  const capture = (chunk) => {
    output += chunk;
    appendFileSync(logPath, chunk);
    process.stdout.write(chunk);
  };
  proc.stdout.on('data', capture);
  proc.stderr.on('data', capture);
  const timer = setTimeout(() => {
    timedOut = true;
    capture(`\nCreator exceeded ${timeoutMs / 1000}s; terminating PID ${proc.pid}.\n`);
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else proc.kill('SIGKILL');
  }, timeoutMs);
  try {
    const code = await new Promise((resolve, reject) => {
      proc.once('error', reject);
      proc.once('close', resolve);
    });
    if (timedOut) throw new Error(`Creator timed out; see ${logPath}`);
    return { code, output };
  } finally {
    clearTimeout(timer);
  }
}
