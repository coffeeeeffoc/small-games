import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const buildTypes = ['development', 'test', 'production'];

export async function prepareBuildType(directory, type) {
  assert(buildTypes.includes(type), 'BUILD_TYPE');
  const entry = path.join(directory, 'index.html');
  let html = await readFile(entry, 'utf8');
  assert(/<head(?:\s[^>]*)?>/i.test(html), 'BUILD_TYPE_ENTRY_HEAD');
  html = html.replace(/<script[^>]*src=["']\.\/build-type\.js["'][^>]*><\/script>/g, '');
  await writeFile(
    path.join(directory, 'build-type.js'),
    `Object.defineProperty(globalThis, '__SMALL_GAMES_BUILD__', {value:Object.freeze(${JSON.stringify({ type })}),writable:false,configurable:false});\n`,
  );
  await writeFile(
    entry,
    html.replace(/<head(?:\s[^>]*)?>/i, '$&<script src="./build-type.js"></script>'),
  );
}
