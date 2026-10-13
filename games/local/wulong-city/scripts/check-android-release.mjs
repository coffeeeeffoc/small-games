import { fileURLToPath } from 'node:url';
import { loadConfig } from './android-config.mjs';

await loadConfig(fileURLToPath(new URL('../android/', import.meta.url)), process.env, true);
console.log('Android release configuration validated');
