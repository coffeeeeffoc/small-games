import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { editor, runCreator } from '../../carding-car/scripts/toolchain.mjs';
import { brandCocos } from '../../carding-car/scripts/cocos-branding.mjs';
import { installStartup } from '../startup/install.mjs';
import { prepareH5Ads } from '../../../../scripts/h5-ad-config.mjs';
import { sourceHash, verifyPrebuilt } from './artifact.mjs';
const root = fileURLToPath(new URL('../', import.meta.url)),
  target = process.argv[2] || 'web-mobile';
if (!['web-mobile', 'wechatgame', 'bytedance-mini-game'].includes(target))
  throw Error('Unsupported Creator target');
if (target === 'web-mobile' && process.env.HOMEBOUND_STATION_PREBUILT_DIR) {
  const source = await verifyPrebuilt(process.env.HOMEBOUND_STATION_PREBUILT_DIR);
  const dist = path.join(root, 'dist');
  if (source !== dist) {
    await rm(dist, { recursive: true, force: true });
    await cp(source, dist, { recursive: true });
  }
  process.exit(0);
}
const scene = 'acdd05a5-ffde-4181-b0ec-721b34e9934e';
const config = {
  name: 'homebound-station',
  platform: target,
  debug: false,
  md5Cache: true,
  buildPath: 'project://build',
  outputName: target,
  replaceSplashScreen: true,
  splashScreen: { totalTime: 0, logo: { type: 'none' } },
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
  ],
  startScene: scene,
  scenes: [{ url: 'db://assets/scenes/main.scene', uuid: scene }],
  packages: {
    'web-mobile': { embedWebDebugger: false, orientation: 'portrait' },
    wechatgame: {
      orientation: 'portrait',
      appid: process.env.WECHAT_APP_ID || 'touristappid',
      separateEngine: false,
    },
    'bytedance-mini-game': { orientation: 'portrait', appid: process.env.DOUYIN_APP_ID || '' },
  },
};
await mkdir(path.join(root, 'reports'), { recursive: true });
const file = path.join(root, 'reports', `build-${target}.json`);
await writeFile(file, JSON.stringify(config, null, 2));
if (process.argv.includes('--config-only')) {
  console.log('Saved Creator build configuration; no engine build was run.');
  process.exit(0);
}
if (!existsSync(editor))
  throw Error(
    '需要真实 Cocos Creator 3.8.8。请在 bolanggu 设置 COCOS_CREATOR 后运行 build；不会用旧 Web 产物替代。',
  );
const inputHash = await sourceHash();
const out = path.join(root, 'build', target);
await rm(out, { recursive: true, force: true });
const result = await runCreator(
  ['--project', root, '--build', `configPath=${file}`],
  path.join(root, 'reports', `build-${target}.log`),
);
if (
  ![0, 36].includes(result.code) ||
  /Missing class:|attached to .+ is missing or invalid|Build failed/i.test(result.output)
)
  throw Error('Creator build failed; inspect reports.');
if ((await sourceHash()) !== inputHash)
  throw Error(
    'Creator changed source inputs during import. Review and commit the canonical metadata/settings, then rebuild.',
  );
if (target === 'web-mobile') {
  await brandCocos(out);
  await installStartup(out);
  await cp(new URL('./dev-mode.js', import.meta.url), path.join(out, 'dev-mode.js'));
  await prepareH5Ads('homebound-station', out);
  await cp(
    new URL('../../../../platforms/h5/publishing.js', import.meta.url),
    path.join(out, 'publishing.js'),
  );
} else {
  if (!existsSync(path.join(out, 'game.js'))) throw Error('Creator native output is missing');
  await brandCocos(out, new URL('../startup/icon.png', import.meta.url));
}
await writeFile(
  path.join(out, 'build-info.json'),
  JSON.stringify({ creator: '3.8.8', target, sourceHash: inputHash }, null, 2),
);
if (target === 'web-mobile') {
  await rm(path.join(root, 'dist'), { recursive: true, force: true });
  await cp(out, path.join(root, 'dist'), { recursive: true });
}
console.log(`Built homebound-station with Creator 3.8.8: ${target}`);
