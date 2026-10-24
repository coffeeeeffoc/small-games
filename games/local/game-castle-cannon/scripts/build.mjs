import { mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'vite';
import { editor, editorRoot, runCreator } from '../../carding-car/scripts/toolchain.mjs';
import { guardArtifactRestore } from '../../bullet-garden/scripts/artifact-paths.mjs';
import { sourceHash, verifyPrebuilt, runtimeManifest } from './artifact.mjs';
import { prepare, sceneUuid } from './prepare.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const target = process.argv[2] || 'web-mobile';
if (!['web-mobile', 'web-desktop'].includes(target))
  throw Error('Only Creator Web targets are validated; native acceptance is separate.');
await prepare();
if (target === 'web-mobile' && process.env.CASTLE_CANNON_PREBUILT_DIR) {
  const source = await verifyPrebuilt(process.env.CASTLE_CANNON_PREBUILT_DIR);
  const restore = await guardArtifactRestore(source, path.join(root, 'dist'), root);
  if (restore.copy) {
    await rm(path.join(root, 'dist'), { recursive: true, force: true });
    await cp(source, path.join(root, 'dist'), { recursive: true });
  }
} else {
  if (!existsSync(editor))
    throw Error(
      'Install Creator 3.8.8 or provide CASTLE_CANNON_PREBUILT_DIR matching these sources.',
    );
  if (
    JSON.parse(
      await readFile(path.join(editorRoot, 'resources/resources/3d/engine/package.json'), 'utf8'),
    ).version !== '3.8.8'
  )
    throw Error('Creator 3.8.8 required.');
  await mkdir(path.join(root, 'reports'), { recursive: true });
  const config = {
    name: 'castle-cannon',
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
      background: { type: 'color', color: { x: 0.03, y: 0.06, z: 0.09, w: 1 } },
    },
    includeModules: [
      'base',
      'gfx-webgl',
      'gfx-webgl2',
      '2d',
      '3d',
      'ui',
      'graphics',
      'audio',
      'primitive',
    ],
    startScene: sceneUuid,
    scenes: [{ url: 'db://assets/scenes/main.scene', uuid: sceneUuid }],
    packages: { 'web-mobile': { embedWebDebugger: false, orientation: 'portrait' } },
  };
  const configPath = path.join(root, `reports/build-${target}.json`);
  await writeFile(configPath, JSON.stringify(config, null, 2));
  const out = path.resolve(root, 'build', target);
  if (!out.startsWith(path.resolve(root) + path.sep)) throw Error('Invalid output path');
  await rm(out, { recursive: true, force: true });
  const inputHash = await sourceHash();
  const { code, output } = await runCreator(
    ['--project', root, '--build', `configPath=${configPath}`],
    path.join(root, `reports/build-${target}.log`),
  );
  if (
    ![0, 36].includes(code) ||
    /Missing class:|attached to .+ is missing or invalid|Build failed/i.test(output)
  )
    throw Error(`Creator failed (${code}); see reports/build-${target}.log`);
  if ((await sourceHash()) !== inputHash)
    throw Error('Inputs changed during build; rebuild required.');
  let html = await readFile(path.join(out, 'index.html'), 'utf8');
  html = html
    .replace(/<meta name="(?:full-screen|x5-fullscreen|360-fullscreen)"[^>]*>/g, '')
    .replace(/<title>.*?<\/title>/, '<title>一炮拆城</title>')
    .replace('minimal-ui=true', 'viewport-fit=cover')
    .replace(
      '</head>',
      `<link rel="icon" href="./icon.png"><style>:root{--safe-top:env(safe-area-inset-top,0px);--safe-right:env(safe-area-inset-right,0px);--safe-bottom:env(safe-area-inset-bottom,0px);--safe-left:env(safe-area-inset-left,0px)}html,body{width:100%;height:100%;margin:0;background:#101b24;overflow:hidden}#GameDiv{position:fixed;inset:0;width:100%;height:100%;margin:0;border:0}canvas{touch-action:none;outline:none}#castle-loading{position:fixed;inset:0;display:grid;place-content:center;color:#ffe0a1;font:24px sans-serif;background:#162738;z-index:9;text-align:center}#castle-loading small{display:block;font-size:14px;margin-top:16px}</style><script src="./dev-mode.js"></script></head>`,
    )
    .replace(
      '<body>',
      '<body><div id="castle-loading">一炮拆城<small>正在装载城堡与炮手…</small></div>',
    );
  await writeFile(path.join(out, 'index.html'), html);
  await cp(path.join(root, 'scripts/dev-mode.js'), path.join(out, 'dev-mode.js'));
  await cp(path.join(root, 'publishing/icon/castle-cannon-512.png'), path.join(out, 'icon.png'));
  await writeFile(
    path.join(out, 'build-info.json'),
    JSON.stringify(
      { creator: '3.8.8', target, sourceHash: inputHash, files: await runtimeManifest(out) },
      null,
      2,
    ),
  );
  await cp(
    path.join(editorRoot, 'resources/resources/3d/engine/bin/.declarations/cc.d.ts'),
    path.join(root, 'cc.d.ts'),
  );
  if (target === 'web-mobile') {
    await rm(path.join(root, 'dist'), { recursive: true, force: true });
    await cp(out, path.join(root, 'dist'), { recursive: true });
  }
}
await build({ root, configFile: path.join(root, 'vite.server.config.ts') });
console.log('Creator Web artifact and original duel server ready.');
