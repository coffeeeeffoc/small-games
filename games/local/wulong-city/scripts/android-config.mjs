import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const requiredRelease = [
  'WULONG_APPLICATION_ID', 'WULONG_VERSION_CODE', 'WULONG_VERSION_NAME',
  'TAPAD_MEDIA_ID', 'TAPAD_MEDIA_KEY', 'TAPAD_HINT_SPACE_ID', 'WULONG_PRIVACY_URL',
  'ANDROID_KEYSTORE_PATH', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD',
];
export function validateConfig(config, { release = false, root, exists = existsSync } = {}) {
  const present = key => typeof config[key] === 'string' && config[key].trim().length > 0;
  const missing = requiredRelease.filter(key => !present(key));
  if (release && missing.length) throw new Error(`Missing release settings: ${missing.join(', ')}`);
  const adKeys = ['TAPAD_MEDIA_ID', 'TAPAD_MEDIA_KEY', 'TAPAD_HINT_SPACE_ID', 'WULONG_PRIVACY_URL'];
  if (adKeys.some(present) && !adKeys.every(present)) throw new Error('Advertising settings must be configured together: ' + adKeys.join(', '));
  if (present('WULONG_APPLICATION_ID') && !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/.test(config.WULONG_APPLICATION_ID)) throw new Error('Invalid WULONG_APPLICATION_ID');
  for (const key of ['WULONG_VERSION_CODE', 'TAPAD_MEDIA_ID', 'TAPAD_HINT_SPACE_ID']) {
    if (present(key) && (!/^[1-9]\d*$/.test(config[key]) || BigInt(config[key]) > (key === 'WULONG_VERSION_CODE' ? 2100000000n : 9223372036854775807n))) throw new Error(`Invalid ${key}`);
  }
  if (present('WULONG_VERSION_NAME') && !/^\d+\.\d+\.\d+(?:[-.][a-zA-Z0-9]+)*$/.test(config.WULONG_VERSION_NAME)) throw new Error('Invalid WULONG_VERSION_NAME');
  if (present('WULONG_PRIVACY_URL')) {
    let url;
    try { url = new URL(config.WULONG_PRIVACY_URL); } catch { throw new Error('Invalid WULONG_PRIVACY_URL'); }
    if (url.protocol !== 'https:' || url.username || url.password || ['localhost', 'example.com'].includes(url.hostname)) throw new Error('WULONG_PRIVACY_URL must be your public HTTPS privacy policy');
  }
  if (present('ANDROID_KEYSTORE_PATH')) {
    config.ANDROID_KEYSTORE_PATH = path.resolve(root, config.ANDROID_KEYSTORE_PATH);
    if (!exists(config.ANDROID_KEYSTORE_PATH)) throw new Error('ANDROID_KEYSTORE_PATH does not exist');
  }
  return { ...config };
}
export async function loadConfig(root, env = process.env, release = false) {
  const filename = path.resolve(root, env.WULONG_ANDROID_CONFIG || 'release-config.local.json');
  let local = {};
  try { local = JSON.parse(await readFile(filename, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT' || env.WULONG_ANDROID_CONFIG) throw new Error('Cannot read WULONG_ANDROID_CONFIG; expected a local JSON object'); }
  if (!local || typeof local !== 'object' || Array.isArray(local)) throw new Error('Android config must be an object');
  const config = Object.fromEntries(requiredRelease.map(key => [key, env[key] ?? local[key] ?? '']));
  return validateConfig(config, { release, root });
}
