import { mkdir, writeFile, readFile, cp, readdir, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { editor, runCreator } from '../../carding-car/scripts/toolchain.mjs';
import { sourceHash, verifyPrebuilt } from './artifact.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const target = process.argv[2] || 'web-mobile';
if (['wechatgame', 'bilibili', 'douyin'].includes(target)) {
  const { buildNative } = await import('./build-native.mjs');
  await buildNative(target, { configOnly: process.argv.includes('--config-only'), checkOutput: process.argv.includes('--check-output') });
  process.exit(0);
}
if (!['web-mobile', 'web-desktop'].includes(target))
  throw Error('Supported targets: web-mobile, web-desktop, wechatgame, bilibili, douyin. Kuaishou requires a separately validated Creator adapter.');
if (target === 'web-mobile' && process.env.NIGHT_OVERWATCH_PREBUILT_DIR) {
  const source = await verifyPrebuilt(process.env.NIGHT_OVERWATCH_PREBUILT_DIR);
  const dist = path.resolve(root, 'dist');
  if (path.dirname(dist) !== path.resolve(root)) throw Error('Build output escaped project');
  if (source !== dist) {
    await rm(dist, { recursive: true, force: true });
    await cp(source, dist, { recursive: true });
  }
  console.log('Restored verified Night Overwatch Creator artifact');
  process.exit(0);
}
if (!existsSync(editor))
  throw Error('Install Creator 3.8.8 or set COCOS_CREATOR; no automatic installation.');
await mkdir(root + 'reports', { recursive: true });
const config = {
  name: 'night-overwatch',
  platform: target,
  debug: false,
  md5Cache: true,
  // Prefer Creator replacement; startup also applies the official runtime override.
  replaceSplashScreen: true,
  useSplashScreen: true,
  splashScreen: {
    totalTime: 0,
    displayRatio: 1,
    autoFit: true,
    watermarkLocation: 'default',
    logo: { type: 'none' },
    background: { type: 'color', color: { x: 0.02, y: 0.04, z: 0.06, w: 1 } },
  },
  buildPath: 'project://build',
  outputName: target,
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
  startScene: '47889f0b-3be6-4dbd-a05d-b4381a0277e9',
  scenes: [{ url: 'db://assets/scenes/main.scene', uuid: '47889f0b-3be6-4dbd-a05d-b4381a0277e9' }],
  packages: { 'web-mobile': { embedWebDebugger: false, orientation: 'landscape' } },
};
const configPath = root + `reports/build-${target}.json`;
await writeFile(configPath, JSON.stringify(config, null, 2));
const { code, output } = await runCreator(
  ['--project', root, '--build', `configPath=${configPath}`],
  root + `reports/build-${target}.log`,
);
if (
  ![0, 36].includes(code) ||
  /Missing class:|attached to .+ is missing or invalid|Build failed/i.test(output)
)
  throw Error(`Creator failed (${code}); inspect reports.`);
const out = root + `build/${target}/`;
let html = await readFile(out + 'index.html', 'utf8');
html = html
  .replace(/<title>.*?<\/title>/, '<title>夜航守望 · Night Overwatch</title>')
  .replace('<head>', '<head><link rel="icon" href="data:,">');
html = html.replace('</head>', '<style>canvas{touch-action:none;outline:none}</style></head>');
html = html.replace('minimal-ui=true', 'viewport-fit=cover');
if (target === 'web-desktop')
  html = html
    .replace(/<h1 class="header">[\s\S]*?<\/h1>/, '')
    .replace(/<p class="footer">[\s\S]*?<\/p>/, '')
    .replace('cc_exact_fit_screen="false"', 'cc_exact_fit_screen="true"')
    .replace('style="width: 1280px; height: 960px;"', 'style="width:100%;height:100%;"')
    .replace(
      '</head>',
      '<style>html,body{width:100%;height:100%;margin:0;overflow:hidden}#GameDiv{position:absolute;inset:0;margin:0;border:0;border-radius:0;box-shadow:none}</style></head>',
    );
html = html.replace(
  'name="screen-orientation" content="portrait"',
  'name="screen-orientation" content="landscape"',
);
await writeFile(out + 'index.html', html);
const { installStartup } = await import('../startup/install.mjs');
await installStartup(out, target);
await writeFile(
  out + 'build-info.json',
  JSON.stringify({ creator: '3.8.8', target, sourceHash: await sourceHash() }),
);
if (target === 'web-mobile') {
  const dist = path.resolve(root, 'dist');
  if (path.dirname(dist) !== path.resolve(root)) throw Error('Build output escaped project');
  await rm(dist, { recursive: true, force: true });
  await cp(out, dist, { recursive: true });
}
let bytes = 0;
for (const entry of await readdir(out, { recursive: true, withFileTypes: true }))
  if (entry.isFile()) bytes += (await stat(entry.parentPath + '/' + entry.name)).size;
await writeFile(
  root + `reports/${target}-size.json`,
  JSON.stringify({ creator: '3.8.8', target, bytes }, null, 2),
);
console.log(`Built ${target}: ${bytes} bytes`);
