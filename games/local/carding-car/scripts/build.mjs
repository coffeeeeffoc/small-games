import { existsSync } from 'node:fs';
import { mkdir, writeFile, cp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { editor } from './toolchain.mjs';
import { sourceHash, verifyPrebuilt } from './artifact.mjs';
import { clearOutput } from './clear-output.mjs';
import { prepareArt } from './prepare-art.mjs';
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
const proc = spawn(editor, ['--project', root, '--build', `configPath=${configPath}`], {
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
proc.stdout.on('data', (d) => {
  output += d;
});
proc.stderr.on('data', (d) => {
  output += d;
});
proc.on('error', (e) => {
  console.error(e);
  process.exitCode = 1;
});
const code = await new Promise((resolve) => proc.on('close', resolve));
await writeFile(path.join(report, `build-${target}.log`), output);
console.log(
  output
    .split('\n')
    .filter((line) => /error|Missing class|failed|Finished in/i.test(line))
    .slice(-15)
    .join('\n'),
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
if (platform === 'wechatgame') {
  const directory = path.dirname(path.join(root, 'build', entry));
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
      'id="GameCanvas"',
      'id="GameCanvas" aria-label="浪湾卡丁车：Enter 开跑，W/上键前进，A/D/左右键转向，S/下键刹车倒车，空格漂移，Shift 氮气加速，P 暂停，M 声音"',
    );
  await writeFile(index, html);
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
