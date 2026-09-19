import { existsSync, openSync, closeSync, readFileSync, appendFileSync } from 'node:fs';
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
  // Workers may retain stdio after Creator exits. A file preserves logs without
  // keeping this process waiting for those inherited pipes to close.
  const log = openSync(logPath, 'w');
  let proc;
  try {
    proc = spawn(executable, args, {
      windowsHide: true,
      stdio: ['ignore', log, log],
    });
  } finally {
    closeSync(log);
  }
  let printed = 0;
  const printLog = () => {
    const output = readFileSync(logPath, 'utf8');
    process.stdout.write(output.slice(printed));
    printed = output.length;
    return output;
  };
  const progress = setInterval(printLog, 1000);
  let timer;
  try {
    const code = await new Promise((resolve, reject) => {
      proc.once('error', reject);
      proc.once('exit', resolve);
      timer = setTimeout(() => {
        appendFileSync(logPath, `\nCreator exceeded ${timeoutMs / 1000}s; terminating PID ${proc.pid}.\n`);
        if (process.platform === 'win32') {
          spawnSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'], {
            windowsHide: true,
            stdio: 'ignore',
            timeout: 10000,
          });
        }
        proc.kill('SIGKILL');
        proc.unref();
        reject(new Error(`Creator timed out; see ${logPath}`));
      }, timeoutMs);
    });
    return { code, output: printLog() };
  } finally {
    clearTimeout(timer);
    clearInterval(progress);
    printLog();
  }
}
