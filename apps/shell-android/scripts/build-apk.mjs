import { spawnSync } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const windows = process.platform === 'win32';
const variant = process.argv.includes('--release') ? 'release' : 'debug';
if (variant === 'release' && !process.env.ANDROID_KEYSTORE_PATH)
  throw new Error('Release builds require ANDROID_KEYSTORE_PATH and signing environment variables');
const task = variant === 'release' ? ':app:assembleRelease' : ':app:assembleDebug';
const result = spawnSync(
  windows ? 'cmd.exe' : './gradlew',
  windows ? ['/d', '/c', 'gradlew.bat', '--no-daemon', task] : ['--no-daemon', task],
  { cwd: root, stdio: 'inherit' },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const output = new URL(
  `../dist/moyu-arcade${variant === 'debug' ? '-debug' : ''}.apk`,
  import.meta.url,
);
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await copyFile(
  new URL(`../app/build/outputs/apk/${variant}/app-${variant}.apk`, import.meta.url),
  output,
);
console.log(`APK: ${fileURLToPath(output)}`);
