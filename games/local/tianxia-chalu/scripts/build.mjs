import { mkdir, readFile, writeFile, cp, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { editor, runCreator } from '../../carding-car/scripts/toolchain.mjs';
import { brandCocos } from '../../carding-car/scripts/cocos-branding.mjs';
import { sourceHash, verifyPrebuilt } from './artifact.mjs';
const root = fileURLToPath(new URL('../', import.meta.url)),
  target = process.argv[2] ?? 'web-mobile';
if (target !== 'web-mobile') throw Error('This delivery validates the Cocos web-mobile target.');
const dist = path.resolve(root, 'dist');
if (path.dirname(dist) !== path.resolve(root)) throw Error('Output escaped project');
if (process.env.TIANXIA_PREBUILT_DIR) {
  const source = await verifyPrebuilt(process.env.TIANXIA_PREBUILT_DIR);
  if (source !== dist) {
    await rm(dist, { recursive: true, force: true });
    await cp(source, dist, { recursive: true });
  }
  console.log('Restored verified 夺城令 Creator artifact');
  process.exit(0);
}
if (!existsSync(editor)) throw Error('Install Cocos Creator 3.8.8 or set COCOS_CREATOR.');
await mkdir(path.join(root, 'reports'), { recursive: true });
const scene = '8c9a23de-4389-41b9-a231-c7527b9d4b77';
const config = {
  name: 'tianxia-chalu',
  platform: target,
  debug: false,
  md5Cache: true,
  buildPath: 'project://build',
  outputName: target,
  replaceSplashScreen: true,
  useSplashScreen: true,
  splashScreen: {
    totalTime: 0,
    displayRatio: 1,
    autoFit: true,
    watermarkLocation: 'default',
    logo: { type: 'none' },
    background: { type: 'color', color: { x: 0.94, y: 0.91, z: 0.85, w: 1 } },
  },
  includeModules: [
    'base',
    'gfx-webgl',
    'gfx-webgl2',
    '3d',
    '2d',
    'ui',
    'graphics',
    'mask',
    'audio',
    'primitive',
    'profiler',
  ],
  startScene: scene,
  scenes: [{ url: 'db://assets/scenes/main.scene', uuid: scene }],
  packages: { 'web-mobile': { embedWebDebugger: false, orientation: 'portrait' } },
};
const configPath = path.join(root, 'reports/build-web-mobile.json');
await writeFile(configPath, JSON.stringify(config, null, 2));
const { code, output } = await runCreator(
  ['--project', root, '--build', 'configPath=' + configPath],
  path.join(root, 'reports/build-web-mobile.log'),
);
if (
  ![0, 36].includes(code) ||
  /Missing class:|attached to .+ is missing or invalid|Build failed/i.test(output)
)
  throw Error('Creator failed (' + code + '); inspect reports/build-web-mobile.log');
const out = path.join(root, 'build', target);
let html = await readFile(path.join(out, 'index.html'), 'utf8');
const template = await readFile(path.join(root, 'index.html'), 'utf8');
const extra = template.match(/<!-- GAME_HEAD -->([\s\S]*?)<!-- \/GAME_HEAD -->/)[1];
const ui = template.match(/<!-- GAME_UI -->([\s\S]*?)<!-- \/GAME_UI -->/)[1];
html = html
  .replace(/<title>.*?<\/title>/, '<title>夺城令</title>')
  .replace('</head>', extra + '</head>')
  .replace(/<body([^>]*)>/, '<body$1 data-screen="home">' + ui)
  .replace('minimal-ui=true', 'viewport-fit=cover');
await writeFile(path.join(out, 'index.html'), html);
for (const file of [
  'main.mjs',
  'style.css',
  'storage.mjs',
  'remote.mjs',
  'audio.mjs',
  'rewards.mjs',
  'publishing.js',
  'fullscreen.js',
  'favicon.svg',
  'art',
  'src',
])
  await cp(path.join(root, file), path.join(out, file), {
    recursive: true,
    filter: (source) => !source.endsWith('.test.mjs'),
  });
await cp(path.join(root, 'scripts/dev-mode.js'), path.join(out, 'dev-mode.js'));
await cp(path.join(root, 'assets/atlas.webp'), path.join(out, 'art/landscape.webp'));
await brandCocos(out);
await writeFile(
  path.join(out, 'build-info.json'),
  JSON.stringify({ creator: '3.8.8', target, sourceHash: await sourceHash() }),
);
await rm(dist, { recursive: true, force: true });
await cp(out, dist, { recursive: true });
let bytes = 0;
for (const entry of await readdir(out, { recursive: true, withFileTypes: true }))
  if (entry.isFile()) bytes += (await stat(path.join(entry.parentPath, entry.name))).size;
await writeFile(
  path.join(root, 'reports/web-mobile-size.json'),
  JSON.stringify({ creator: '3.8.8', target, bytes }, null, 2),
);
console.log('Built real Creator web-mobile: ' + bytes + ' bytes');
