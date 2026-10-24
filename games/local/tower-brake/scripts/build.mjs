import { mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { editor, runCreator } from '../../carding-car/scripts/toolchain.mjs';
import { brandCocos } from '../../carding-car/scripts/cocos-branding.mjs';
import { prepare, sceneUuid } from './prepare.mjs';
import { competitionBootstrapSource } from '../api-config.mjs';
import { pathToFileURL } from 'node:url';
import { sourceHash, verifyPrebuilt, runtimeManifest } from './artifact.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
await prepare();
const target = process.argv[2] || 'web-mobile';
if (!['web-mobile', 'web-desktop'].includes(target))
  throw Error(
    'This project currently validates web-mobile and web-desktop. Native targets require separate acceptance.',
  );
if (target === 'web-mobile' && process.env.TOWER_BRAKE_PREBUILT_DIR) {
  const source = await verifyPrebuilt(process.env.TOWER_BRAKE_PREBUILT_DIR);
  if (source !== path.join(root, 'dist')) {
    await rm(path.join(root, 'dist'), { recursive: true, force: true });
    await cp(source, path.join(root, 'dist'), { recursive: true });
  }
  console.log('Restored verified Tower Brake Creator artifact.');
} else {
  if (!existsSync(editor))
    throw Error(
      'Install Cocos Creator 3.8.8 or provide a source-matching TOWER_BRAKE_PREBUILT_DIR. No replacement engine is used.',
    );
  const enginePackage = path.join(
    path.dirname(editor),
    'resources/resources/3d/engine/package.json',
  );
  if (JSON.parse(await readFile(enginePackage, 'utf8')).version !== '3.8.8')
    throw Error('Tower Brake requires Cocos Creator 3.8.8.');
  await mkdir(path.join(root, 'reports'), { recursive: true });
  const config = {
    name: 'tower-brake',
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
      background: { type: 'color', color: { x: 0.025, y: 0.06, z: 0.12, w: 1 } },
    },
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
  await brandCocos(out);
  let html = await readFile(path.join(out, 'index.html'), 'utf8');
  html = html
    .replace(/<title>.*?<\/title>/, '<title>穿云落星</title>')
    .replace(/<meta name="(?:full-screen|x5-fullscreen|360-fullscreen)"[^>]*>/g, '')
    .replace('minimal-ui=true', 'viewport-fit=cover')
    .replace(
      /<body([^>]*)>/,
      '<body$1><div id="tower-loading" role="status" style="position:fixed;inset:0;z-index:20;display:grid;place-content:center;justify-items:center;gap:18px;background:#101c35;color:#d6eee9;font:18px sans-serif"><img src="./icon.png" width="96" height="96" style="border-radius:22px" alt=""><strong>穿云落星</strong><span style="font-size:13px;color:#b8c9df">正在载入天空…</span></div>',
    )
    .replace(
      '</head>',
      '<link rel="icon" href="./icon.png"><style>html,body{height:100%;width:100%;margin:0;background:#061522;overflow:hidden}canvas{touch-action:none;outline:none}[hidden]{display:none!important}#GameDiv{position:fixed;inset:0;width:100%;height:100%;border:0;margin:0}#GameCanvas{width:100%;height:100%}</style><script src="./dev-mode.js"></script><script src="./competition-config.js"></script><script type="module" src="./host.js"></script></head>',
    );
  await writeFile(path.join(out, 'index.html'), html);
  for (const file of ['dev-mode.js'])
    await cp(path.join(root, 'scripts', file), path.join(out, file));
  await cp(path.join(root, 'startup/host.js'), path.join(out, 'host.js'));
  const outUrl = pathToFileURL(out + path.sep);
  await cp(
    new URL('../../../../platforms/competition/game-services.js', import.meta.url),
    new URL('game-services.js', outUrl),
  );
  await cp(
    new URL('../../../../platforms/competition/client.js', import.meta.url),
    new URL('client.js', outUrl),
  );
  await cp(
    new URL('../../../../platforms/h5/publishing.js', import.meta.url),
    new URL('publishing.js', outUrl),
  );
  await cp(path.join(root, 'startup/icon.png'), path.join(out, 'icon.png'));
  await writeFile(path.join(out, 'competition-config.js'), competitionBootstrapSource());
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
  console.log(`Built Tower Brake with Creator 3.8.8: ${out}`);
}
