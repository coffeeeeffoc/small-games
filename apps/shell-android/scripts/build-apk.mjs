import { spawnSync } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const windows = process.platform === 'win32';
const result = spawnSync(
  windows ? 'cmd.exe' : './gradlew',
  windows
    ? ['/d', '/c', 'gradlew.bat', '--no-daemon', ':app:assembleDebug']
    : ['--no-daemon', ':app:assembleDebug'],
  { cwd: root, stdio: 'inherit' },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const output = new URL('../dist/moyu-arcade-0.1.0-debug.apk', import.meta.url);
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await copyFile(new URL('../app/build/outputs/apk/debug/app-debug.apk', import.meta.url), output);
console.log(`APK: ${fileURLToPath(output)}`);
