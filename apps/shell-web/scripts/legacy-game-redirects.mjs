import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Keep previously shared URLs working under both root and /dev/ Pages deployments.
export async function writeLegacyGameRedirects(destination, ids) {
  if (!ids.includes('place-and-clear')) return;
  const directory = path.join(destination, 'three-choose-two');
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'index.html'),
    `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><title>摆消乐</title>
<a href="../place-and-clear/index.html">打开摆消乐</a>
<script>
const target = new URL('../place-and-clear/index.html', location.href);
target.search = location.search;
target.hash = location.hash;
location.replace(target.href);
</script></html>\n`,
  );
}
