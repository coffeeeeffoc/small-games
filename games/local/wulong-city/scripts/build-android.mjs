import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadConfig } from './android-config.mjs';
import { prepareAndroid, sdk, assetFiles } from './prepare-android.mjs';

const root = fileURLToPath(new URL('../android/', import.meta.url));
const flags = new Set(process.argv.slice(2));
for (const flag of flags) if (!['--release', '--check'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
const release = flags.has('--release');
const config = await loadConfig(root, process.env, release);
const env = { ...process.env, ...config, NODE_BINARY: process.execPath };
const java = env.JAVA_HOME ? path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
const version = spawnSync(java, ['-version'], { encoding: 'utf8', windowsHide: true });
if (version.error || version.status !== 0 || !/version "17\./.test(version.stderr + version.stdout)) throw new Error('Set JAVA_HOME to a JDK 17 installation');
const androidHome = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
if (!androidHome) throw new Error('Set ANDROID_HOME to an Android SDK with platform 34 and build-tools 34.0.0');
await readFile(path.join(androidHome, 'platforms/android-34/android.jar'));
const buildTools = path.join(androidHome, 'build-tools/34.0.0');
await readFile(path.join(buildTools, process.platform === 'win32' ? 'aapt.exe' : 'aapt'));
console.log(`Android ${release ? 'release' : 'debug'} configuration validated; rewarded ads ${config.TAPAD_MEDIA_ID ? 'configured' : 'disabled'}`);
if (flags.has('--check')) process.exit(0);
async function inputHash() {
  const gameRoot = path.resolve(root, '..');
  const hash = createHash('sha256');
  async function add(relative) {
    const absolute = path.join(gameRoot, relative);
    const entries = await readdir(absolute, { withFileTypes: true }).catch(error => {
      if (error.code === 'ENOTDIR') return null;
      throw error;
    });
    if (entries) { for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) await add(`${relative}/${entry.name}`); }
    else { hash.update(relative + '\0'); hash.update(await readFile(absolute)); }
  }
  for (const name of [...assetFiles, 'assets', 'android/app/src/main', 'android/app/build.gradle', 'android/build.gradle', 'android/settings.gradle', 'android/gradle.properties', 'scripts']) await add(name);
  hash.update(await readFile(path.resolve(gameRoot, '../../../platforms/h5/publishing.js')));
  return hash.digest('hex');
}
const sourceSha256 = await inputHash();
await prepareAndroid();
const windows = process.platform === 'win32';
const variant = release ? 'release' : 'debug';
const capital = release ? 'Release' : 'Debug';
const tasks = [`:app:assemble${capital}`, `:app:lint${capital}`, ':app:testDebugUnitTest'];
const build = spawnSync(windows ? 'cmd.exe' : 'sh', windows
  ? ['/d', '/c', 'gradlew.bat', '--no-daemon', '--console=plain', ...tasks]
  : ['gradlew', '--no-daemon', '--console=plain', ...tasks], { cwd: root, env, stdio: 'inherit', windowsHide: true });
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
const apk = path.join(root, `app/build/outputs/apk/${variant}/app-${variant}.apk`);
const verify = spawnSync(java, ['-jar', path.join(buildTools, 'lib/apksigner.jar'), 'verify', '--verbose', '--print-certs', apk], { env, encoding: 'utf8', windowsHide: true });
if (verify.error) throw verify.error;
if (verify.status !== 0) throw new Error('APK signature verification failed');
if (release && /CN=Android Debug/.test(verify.stdout)) throw new Error('Release APK must not use the Android debug certificate');
const info = spawnSync(path.join(buildTools, windows ? 'aapt.exe' : 'aapt'), ['dump', 'badging', apk], { env, encoding: 'utf8', windowsHide: true });
const appId = (config.WULONG_APPLICATION_ID || 'com.coffeeeeffoc.wulongcity') + (release ? '' : '.debug');
if (info.status !== 0 || !info.stdout.includes(`package: name='${appId}'`)) throw new Error('APK package verification failed');
if (!info.stdout.includes(`versionCode='${config.WULONG_VERSION_CODE || '1'}'`) || !info.stdout.includes(`versionName='${config.WULONG_VERSION_NAME || '2.0.0'}'`)) throw new Error('APK version verification failed');
if (release && info.stdout.includes('application-debuggable')) throw new Error('Release APK is debuggable');
const listing = spawnSync(path.join(buildTools, windows ? 'aapt.exe' : 'aapt'), ['list', apk], { env, encoding: 'utf8', windowsHide: true });
const inventory = new Set(listing.stdout.split(/\r?\n/));
if (listing.status !== 0 || [...assetFiles, 'publishing.js', 'assets/art/city-scene.webp'].some(name => !inventory.has(`assets/game/${name}`))) throw new Error('APK is missing offline game resources');
if (await inputHash() !== sourceSha256) throw new Error('Source changed during APK build; rebuild the exact candidate');
// Keep installable packages outside the Web dist copied by Pages / H5 packaging.
const output = path.resolve(root, 'dist');
await mkdir(output, { recursive: true });
const filename = `wulong-city-taptap-${variant}.apk`;
await copyFile(apk, path.join(output, filename));
const sha256 = createHash('sha256').update(await readFile(apk)).digest('hex');
const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true });
const dirty = spawnSync('git', ['status', '--porcelain', '--', '.'], { cwd: path.resolve(root, '..'), encoding: 'utf8', windowsHide: true });
await writeFile(path.join(output, `${variant}-report.json`), JSON.stringify({
  variant, packageId: appId, versionCode: config.WULONG_VERSION_CODE || '1',
  versionName: config.WULONG_VERSION_NAME || '2.0.0', sourceHead: git.stdout.trim(), sourceDirty: !!dirty.stdout.trim(), sourceSha256,
  sha256, sdkSha256: sdk.sha256, rewardedConfigured: !!config.TAPAD_MEDIA_ID,
  signatureVerified: true, realAdsVerified: false, physicalDeviceVerified: false,
}, null, 2) + '\n');
console.log(`APK: ${path.join(output, filename)}\nSHA256: ${sha256}`);
