import { existsSync } from 'node:fs';
import { mkdir, writeFile, cp, readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { editor, runCreator } from './toolchain.mjs';
import { sourceHash, verifyPrebuilt } from './artifact.mjs';
import { clearOutput } from './clear-output.mjs';
import { prepareArt } from './prepare-art.mjs';
import { instrumentWechatStartup } from './wechat-startup.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const target = process.argv[2] || 'web-mobile';
if (!['web-mobile', 'wechatgame', 'bilibili'].includes(target))
  throw new Error('Unknown build target');
await prepareArt();
if (target === 'web-mobile' && process.env.KART_PREBUILT_DIR) {
  const source = await verifyPrebuilt(process.env.KART_PREBUILT_DIR),
    dist = path.resolve(root, 'dist');
  if (path.dirname(dist) !== path.resolve(root)) throw new Error('Web output escaped project');
  await rm(dist, { recursive: true, force: true });
  await cp(source, dist, { recursive: true });
  console.log('Restored verified Creator artifact');
  process.exit(0);
}
if (!existsSync(editor))
  throw new Error('Set COCOS_CREATOR to the Cocos Creator 3.8.8 executable.');
const platform = target === 'bilibili' ? 'wechatgame' : target;
const outputName = target === 'bilibili' ? 'wechat-bilibili-source' : platform;
if (
  target === 'bilibili' &&
  !existsSync(path.join(root, 'extensions/biligame-builder/package.json'))
)
  throw new Error('Run node scripts/setup.mjs --bilibili first.');
const localPath = path.join(root, 'release-config.local.json');
const release = existsSync(localPath) ? JSON.parse(await readFile(localPath, 'utf8')) : {};
const report = path.join(root, 'reports');
await mkdir(report, { recursive: true });
const config = {
  name: 'carding-car',
  platform,
  debug: false,
  md5Cache: true,
  buildPath: 'project://build',
  outputName,
  includeModules: [
    'base',
    'gfx-webgl',
    'gfx-webgl2',
    '3d',
    '2d',
    'ui',
    'graphics',
    'audio',
    'primitive',
    'profiler',
  ],
  startScene: '47889f0b-3be6-4dbd-a05d-b4381a0277e9',
  scenes: [{ url: 'db://assets/scenes/main.scene', uuid: '47889f0b-3be6-4dbd-a05d-b4381a0277e9' }],
  packages: {
    'web-mobile': { embedWebDebugger: false, orientation: 'landscape' },
    wechatgame: {
      appid: process.env.WECHAT_APP_ID || release.wechatAppId || 'touristappid',
      orientation: 'landscape',
      separateEngine: false,
    },
    'biligame-builder': {
      isBiliGame: target === 'bilibili',
      biliGameAppId: process.env.BILIBILI_APP_ID || release.bilibiliAppId || 'preview-only',
      biliGameVersion: '0.1.0',
    },
  },
};
const configPath = path.join(report, `build-${target}.json`);
await writeFile(configPath, JSON.stringify(config, null, 2));
const outputDir = path.resolve(root, 'build', outputName);
if (path.dirname(outputDir) !== path.resolve(root, 'build'))
  throw new Error('Build output escaped project');
await clearOutput(outputDir);
if (target === 'bilibili') {
  const biliOutput = path.resolve(root, 'build/biligame');
  if (path.dirname(biliOutput) !== path.resolve(root, 'build'))
    throw new Error('Bilibili output escaped project');
  await clearOutput(biliOutput);
}
const { code, output } = await runCreator(
  ['--project', root, '--build', `configPath=${configPath}`],
  path.join(report, `build-${target}.log`),
);
if (code !== 36 && code !== 0)
  throw new Error(`Creator failed (${code}); see reports/build-${target}.log`);
if (/Missing class:|attached to .+ is missing or invalid|Build failed/i.test(output))
  throw new Error('Creator reported invalid game assets; inspect the build log.');
const entry =
  target === 'bilibili'
    ? 'biligame/game.js'
    : `${platform}/${platform === 'web-mobile' ? 'index.html' : 'game.js'}`;
if (!existsSync(path.join(root, 'build', entry)))
  throw new Error(`Creator did not produce ${entry}; inspect the build log.`);
if (target === 'wechatgame') {
  const gameJs = path.join(root, 'build', entry);
  const settingsFiles = (await readdir(path.join(outputDir, 'src'))).filter((name) =>
    /^settings\.[^.]+\.json$/.test(name),
  );
  if (settingsFiles.length !== 1) throw new Error('Expected one versioned WeChat settings file');
  const settings = JSON.parse(
    await readFile(path.join(outputDir, 'src', settingsFiles[0]), 'utf8'),
  );
  const version = settings.assets.bundleVers.resources;
  if (!version) throw new Error('WeChat resources must have a build version');
  const config = JSON.parse(
    await readFile(path.join(outputDir, `subpackages/resources/config.${version}.json`), 'utf8'),
  );
  const packs = Object.keys(config.packs).sort();
  const versions = new Map();
  const entries = config.versions.import;
  for (let i = 0; i < entries.length; i += 2)
    versions.set(config.uuids[entries[i]] ?? entries[i], entries[i + 1]);
  for (const pack of packs) {
    const suffix = versions.get(pack);
    if (
      !suffix ||
      !existsSync(
        path.join(
          outputDir,
          'subpackages/resources/import',
          pack.slice(0, 2),
          `${pack}.${suffix}.json`,
        ),
      )
    )
      throw new Error(`Missing resource pack: ${pack}`);
  }
  await writeFile(
    gameJs,
    instrumentWechatStartup(await readFile(gameJs, 'utf8'), packs, new Date().toISOString()),
  );
}
if (platform === 'wechatgame') {
  const directory = path.dirname(path.join(root, 'build', entry));
  const serverUrl = process.env.KART_SERVER_URL || release.multiplayerServerUrl || '';
  if (serverUrl && !/^wss:\/\/[^\s/#?]+\/kart$/.test(serverUrl))
    throw new Error('KART_SERVER_URL must be a wss://host/kart URL');
  const bridge = await readFile(
    new URL('../../../../platforms/kart-sharing.js', import.meta.url),
    'utf8',
  );
  await writeFile(
    path.join(directory, 'kart-platform.js'),
    `globalThis.__kartServerUrl = ${JSON.stringify(serverUrl)};\n` + bridge,
  );
  const entryFile = path.join(directory, 'game.js');
  await writeFile(
    entryFile,
    `require('./kart-platform.js');\n` + (await readFile(entryFile, 'utf8')),
  );
  const game = JSON.parse(await readFile(path.join(directory, 'game.json'), 'utf8'));
  if (!game.subpackages?.some((bundle) => bundle.name === 'resources'))
    throw new Error('Mini-game art must be exported as the resources subpackage.');
  let totalBytes = 0,
    mainBytes = 0;
  for (const file of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (!file.isFile()) continue;
    const full = path.join(file.parentPath, file.name);
    const bytes = (await stat(full)).size;
    totalBytes += bytes;
    if (!path.relative(directory, full).startsWith('subpackages' + path.sep)) mainBytes += bytes;
  }
  if (mainBytes > 4 * 1024 * 1024 || totalBytes > 20 * 1024 * 1024)
    throw new Error(`Mini-game package budget exceeded: main=${mainBytes}, total=${totalBytes}`);
  console.log(`Package budget: main=${mainBytes}, total=${totalBytes} bytes`);
}
if (target === 'web-mobile') {
  const index = path.join(outputDir, 'index.html');
  const html = (await readFile(index, 'utf8'))
    .replace('<title>Cocos Creator | carding-car</title>', '<title>浪湾卡丁车</title>')
    .replace('<head>', '<head>\n<link rel="icon" href="data:,">')
    .replace(
      '</head>',
      `<style>
      #kart-fullscreen { position: fixed; z-index: 21; top: max(8px, env(safe-area-inset-top));
        right: max(8px, env(safe-area-inset-right)); min-height: 44px; padding: 0 14px;
        border: 1px solid #69dfc0; border-radius: 12px; background: #173c55; color: #fff6dc;
        font: 600 14px sans-serif; cursor: pointer; }
      #kart-rotate { display: none; }
      @media (orientation: portrait) {
        #kart-rotate { display: block; position: fixed; z-index: 20; top: max(64px, calc(env(safe-area-inset-top) + 56px));
          left: 8%; right: 8%; padding: 18px 12px; border-radius: 16px; color: #fff6dc;
          background: #173c55; text-align: center; font: 600 18px/1.6 sans-serif; pointer-events: none; }
        #kart-rotate small { display: block; color: #69dfc0; font-size: 14px; }
      }
      </style><script defer src="./fullscreen.js"></script></head>`,
    )
    .replace(
      '<body>',
      '<body><button id="kart-fullscreen" type="button" data-game-fullscreen aria-label="全屏">全屏</button><aside id="kart-rotate" role="status">横过手机，驾驶更顺手<small>左手转向 · 右手漂移 · 松手加速</small></aside>',
    )
    .replace(
      'id="GameCanvas"',
      'id="GameCanvas" aria-label="浪湾卡丁车：Enter 开跑，W/上键前进，A/D/左右键转向，S/下键刹车倒车，空格漂移，Shift 氮气加速，P 暂停，M 声音"',
    );
  await writeFile(index, html);
  await cp(new URL('./fullscreen.js', import.meta.url), path.join(outputDir, 'fullscreen.js'));
  await writeFile(
    path.join(outputDir, 'build-info.json'),
    JSON.stringify({ creator: '3.8.8', sourceHash: await sourceHash() }),
  );
  const dist = path.resolve(root, 'dist');
  if (path.dirname(dist) !== path.resolve(root)) throw new Error('Web output escaped project');
  await rm(dist, { recursive: true, force: true });
  await cp(outputDir, dist, { recursive: true });
}
console.log(`Built ${target}`);
