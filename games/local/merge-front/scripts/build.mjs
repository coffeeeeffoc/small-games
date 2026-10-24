import { mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { editor, runCreator } from '../../carding-car/scripts/toolchain.mjs';
import { sourceHash, verifyPrebuilt, runtimeManifest } from './artifact.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const target = process.argv[2] || 'web-mobile';
if (!['web-mobile', 'web-desktop'].includes(target))
  throw Error(
    'This project currently validates web-mobile and web-desktop. Native targets require separate acceptance.',
  );
if (target === 'web-mobile' && process.env.MERGE_FRONT_PREBUILT_DIR) {
  const source = await verifyPrebuilt(process.env.MERGE_FRONT_PREBUILT_DIR);
  if (source !== path.join(root, 'dist')) {
    await rm(path.join(root, 'dist'), { recursive: true, force: true });
    await cp(source, path.join(root, 'dist'), { recursive: true });
  }
  console.log('Restored verified Merge Front Creator artifact.');
} else {
  if (!existsSync(editor))
    throw Error(
      'Install Cocos Creator 3.8.8 or provide a source-matching MERGE_FRONT_PREBUILT_DIR. No replacement engine is used.',
    );
  const enginePackage = path.join(
    path.dirname(editor),
    'resources/resources/3d/engine/package.json',
  );
  if (JSON.parse(await readFile(enginePackage, 'utf8')).version !== '3.8.8')
    throw Error('Merge Front requires Cocos Creator 3.8.8.');
  await mkdir(path.join(root, 'reports'), { recursive: true });
  const config = {
    name: 'merge-front',
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
      background: { type: 'color', color: { x: 0.02, y: 0.06, z: 0.09, w: 1 } },
    },
    includeModules: ['base', 'gfx-webgl', 'gfx-webgl2', '2d', 'ui', 'graphics', 'audio'],
    startScene: 'e27ec913-af8a-4ad4-90d9-b94ca3cc99bb',
    scenes: [
      { url: 'db://assets/scenes/main.scene', uuid: 'e27ec913-af8a-4ad4-90d9-b94ca3cc99bb' },
    ],
    packages: { 'web-mobile': { embedWebDebugger: false, orientation: 'landscape' } },
  };
  const configPath = path.join(root, `reports/build-${target}.json`);
  await writeFile(configPath, JSON.stringify(config, null, 2));
  // A failed build cannot accidentally relabel yesterday's generated files.
  await rm(path.join(root, 'build', target), { recursive: true, force: true });
  const inputHash = await sourceHash();
  const { code, output } = await runCreator(
    ['--project', root, '--build', `configPath=${configPath}`],
    path.join(root, `reports/build-${target}.log`),
  );
  if (
    ![0, 36].includes(code) ||
    /Missing class:|attached to .+ is missing or invalid|Build failed/i.test(output)
  )
    throw Error(`Creator failed (${code}); inspect reports/build-${target}.log.`);
  if ((await sourceHash()) !== inputHash)
    throw Error('Source changed during Creator build; rebuild before publishing.');
  const out = path.join(root, 'build', target);
  let html = await readFile(path.join(out, 'index.html'), 'utf8');
  html = html
    .replace(/<title>.*?<\/title>/, '<title>神机合阵 · Merge Front</title>')
    .replace(/<meta name="(?:full-screen|x5-fullscreen|360-fullscreen)"[^>]*>/g, '')
    .replace('minimal-ui=true', 'viewport-fit=cover')
    .replace(
      '</head>',
      '<link rel="icon" href="data:,"><style>html,body{height:100%;width:100%;margin:0;background:#061522;overflow:hidden}canvas{touch-action:none;outline:none}[hidden]{display:none!important}#GameDiv{position:fixed;inset:0;width:100%;height:100%;border:0;margin:0}#GameCanvas{width:100%;height:100%}</style><script src="./dev-mode.js"></script><script type="module" src="./host.js"></script></head>',
    );
  await writeFile(path.join(out, 'index.html'), html);
  for (const file of ['dev-mode.js'])
    await cp(path.join(root, 'scripts', file), path.join(out, file));
  await cp(path.join(root, 'startup/host.js'), path.join(out, 'host.js'));
  await cp(
    new URL('../../../../platforms/h5/game-rewards.js', import.meta.url),
    path.join(out, 'game-rewards.js'),
  );
  for (const file of ['platform-ads.js', 'interstitial.js'])
    await cp(new URL('../../../../platforms/h5/' + file, import.meta.url), path.join(out, file));
  await writeFile(
    path.join(out, 'build-info.json'),
    JSON.stringify({
      creator: '3.8.8',
      target,
      sourceHash: await sourceHash(),
      files: await runtimeManifest(out),
    }),
  );
  if (target === 'web-mobile') {
    await rm(path.join(root, 'dist'), { recursive: true, force: true });
    await cp(out, path.join(root, 'dist'), { recursive: true });
  }
  console.log(`Built Merge Front with Creator 3.8.8: ${out}`);
}
