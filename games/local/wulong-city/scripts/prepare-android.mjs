import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
export const sdk = Object.freeze({
  name: 'dirichlet_ad_5.3.0.4.aar',
  url: 'https://tapad-platform.tapimg.com/sdk/dirichlet_ad/dirichlet_ad_5.3.0.4.aar',
  sha256: '5aec884e2c546aa2f3edf9d5809c2862a006fd1cc0e65e9c9b74ee492a34bb41',
});
export const assetFiles = ['index.html', 'dev-mode.js', 'android-bridge.js', 'reward-hints.js', 'style.css', 'levels-data.js', 'level-order.js', 'render.js', 'game.js', 'levels.js'];
export async function prepareAndroid() {
  const cache = path.join(root, 'android/.cache');
  await mkdir(cache, { recursive: true });
  const archive = path.join(cache, sdk.name);
  let data;
  try { data = await readFile(archive); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!data) {
    const response = await fetch(sdk.url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`TapADN download failed (${response.status})`);
    data = Buffer.from(await response.arrayBuffer());
  }
  if (createHash('sha256').update(data).digest('hex') !== sdk.sha256) throw new Error('TapADN SDK checksum mismatch');
  await writeFile(archive, data);
  const buildRoot = path.resolve(root, 'android/app/build');
  const destination = path.resolve(buildRoot, 'generated/assets/game');
  if (!destination.startsWith(buildRoot + path.sep)) throw new Error('Unsafe Android asset destination');
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const name of assetFiles) await cp(path.join(root, name), path.join(destination, name));
  await cp(path.join(root, 'assets'), path.join(destination, 'assets'), { recursive: true });
  await cp(path.resolve(root, '../../../platforms/h5/publishing.js'), path.join(destination, 'publishing.js'));
  const htmlPath = path.join(destination, 'index.html');
  let html = await readFile(htmlPath, 'utf8');
  html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">`);
  await writeFile(htmlPath, html);
  console.log('Prepared offline Wulong City assets and verified TapADN 5.3.0.4');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await prepareAndroid();
