import { mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { editor, runCreator } from '../../carding-car/scripts/toolchain.mjs';
import { brandCocos } from '../../carding-car/scripts/cocos-branding.mjs';
import { prepareH5Ads } from '../../../../scripts/h5-ad-config.mjs';
import { sourceHash, verifyPrebuilt, runtimeManifest } from './artifact.mjs';
import { prepare, sceneUuid } from './prepare.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const target = process.argv[2] || 'web-mobile';
if (!['web-mobile', 'web-desktop'].includes(target))
  throw Error('Only Creator Web targets are accepted.');
await prepare();
// Creator 3.8.8 locks these compiler workspaces before creating them on a fresh checkout.
for (const name of ['editor', 'preview'])
  await mkdir(path.join(root, 'temp/programming/packer-driver/targets', name), { recursive: true });
if (target === 'web-mobile' && process.env.ASHFALL_FRONT_PREBUILT_DIR) {
  const source = await verifyPrebuilt(process.env.ASHFALL_FRONT_PREBUILT_DIR);
  if (source !== path.join(root, 'dist')) {
    await rm(path.join(root, 'dist'), { recursive: true, force: true });
    await cp(source, path.join(root, 'dist'), { recursive: true });
  }
} else {
  if (!existsSync(editor))
    throw Error('Install Creator 3.8.8 or supply ASHFALL_FRONT_PREBUILT_DIR.');
  const engine = path.join(path.dirname(editor), 'resources/resources/3d/engine');
  if (JSON.parse(await readFile(path.join(engine, 'package.json'), 'utf8')).version !== '3.8.8')
    throw Error('Creator 3.8.8 required.');
  await mkdir(path.join(root, 'reports'), { recursive: true });
  const config = {
    name: 'ashfall-front',
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
      background: { type: 'color', color: { x: 0.03, y: 0.07, z: 0.05, w: 1 } },
    },
    includeModules: ['base', 'gfx-webgl', 'gfx-webgl2', '2d', 'ui', 'graphics', 'audio'],
    startScene: sceneUuid,
    scenes: [{ url: 'db://assets/scenes/main.scene', uuid: sceneUuid }],
    packages: { 'web-mobile': { embedWebDebugger: false, orientation: 'landscape' } },
  };
  const configPath = path.join(root, `reports/build-${target}.json`);
  await writeFile(configPath, JSON.stringify(config, null, 2));
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
    throw Error(`Creator failed (${code}). See reports/build-${target}.log.`);
  if ((await sourceHash()) !== inputHash) throw Error('Source changed during build; rebuild.');
  const out = path.join(root, 'build', target);
  await brandCocos(out);
  let html = await readFile(path.join(out, 'index.html'), 'utf8');
  html = html
    .replace(/<title>.*?<\/title>/, '<title>灰烬防线</title>')
    .replace('minimal-ui=true', 'viewport-fit=cover')
    .replace(
      '</head>',
      '<link rel="icon" href="./icon.png"><link rel="stylesheet" href="./ashfall.css"><script src="./dev-mode.js"></script><script src="./viewport.js"></script></head>',
    )
    .replace(
      /<body([^>]*)>/,
      '<body$1><div id="ashfall-loading" role="status"><img src="./icon.png" width="96" height="96" alt=""><strong>灰烬防线</strong><span>正在接通战区…</span></div>',
    );
  await writeFile(path.join(out, 'index.html'), html);
  await cp(path.join(root, 'scripts/dev-mode.js'), path.join(out, 'dev-mode.js'));
  for (const name of ['viewport.js', 'ashfall.css', 'icon.png'])
    await cp(path.join(root, 'startup', name), path.join(out, name));
  await prepareH5Ads('ashfall-front', out);
  await cp(path.join(engine, 'bin/.declarations/cc.d.ts'), path.join(root, 'cc.d.ts'));
  await writeFile(
    path.join(out, 'build-info.json'),
    JSON.stringify(
      {
        creator: '3.8.8',
        target,
        sourceHash: await sourceHash(),
        files: await runtimeManifest(out),
      },
      null,
      2,
    ),
  );
  if (target === 'web-mobile') {
    await rm(path.join(root, 'dist'), { recursive: true, force: true });
    await cp(out, path.join(root, 'dist'), { recursive: true });
  }
  console.log(`Built Ashfall Front with Creator 3.8.8: ${out}`);
}
