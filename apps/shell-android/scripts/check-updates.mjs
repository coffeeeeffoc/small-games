import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const output = await mkdtemp(join(tmpdir(), 'small-games-java-'));
function run(command, args) {
  const executable = process.env.JAVA_HOME
    ? join(process.env.JAVA_HOME, 'bin', command + (process.platform === 'win32' ? '.exe' : ''))
    : command;
  const result = spawnSync(executable, args, { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed: ${result.status}`);
}
try {
  run('javac', [
    '-encoding',
    'UTF-8',
    '-d',
    output,
    fileURLToPath(
      new URL('../app/src/main/java/com/coffeeeeffoc/smallgames/UpdateFiles.java', import.meta.url),
    ),
    fileURLToPath(new URL('./UpdateFilesCheck.java', import.meta.url)),
  ]);
  run('java', ['-ea', '-cp', output, 'com.coffeeeeffoc.smallgames.UpdateFilesCheck']);
} finally {
  await rm(output, { recursive: true, force: true });
}
