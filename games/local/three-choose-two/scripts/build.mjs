import { mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { editor, runCreator } from '../../carding-car/scripts/toolchain.mjs';
import { brandCocos } from '../../carding-car/scripts/cocos-branding.mjs';
import { prepareH5Ads } from '../../../../scripts/h5-ad-config.mjs';
import { sourceHash, verifyPrebuilt, runtimeManifest } from './artifact.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const target = process.argv[2] || 'web-mobile';
if (!['web-mobile', 'web-desktop'].includes(target))
  throw Error(
    'This project currently validates web-mobile and web-desktop. Native targets require separate acceptance.',
  );
if (target === 'web-mobile' && process.env.THREE_CHOOSE_TWO_PREBUILT_DIR) {
  const source = await verifyPrebuilt(process.env.THREE_CHOOSE_TWO_PREBUILT_DIR);
  if (source !== path.join(root, 'dist')) {
    await rm(path.join(root, 'dist'), { recursive: true, force: true });
    await cp(source, path.join(root, 'dist'), { recursive: true });
  }
  console.log('Restored verified Three Choose Two Creator artifact.');
} else {
  if (!existsSync(editor))
    throw Error(
      'Install Cocos Creator 3.8.8 or provide a source-matching THREE_CHOOSE_TWO_PREBUILT_DIR. No replacement engine is used.',
    );
  const enginePackage = path.join(
    path.dirname(editor),
    'resources/resources/3d/engine/package.json',
  );
  if (JSON.parse(await readFile(enginePackage, 'utf8')).version !== '3.8.8')
    throw Error('Three Choose Two requires Cocos Creator 3.8.8.');
  await import('./prepare.mjs');
  await mkdir(path.join(root, 'reports'), { recursive: true });
  const config = {
    name: 'three-choose-two',
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
    startScene: '42e96e91-3363-43af-a390-7fc06f5d7120',
    scenes: [
      { url: 'db://assets/scenes/main.scene', uuid: '42e96e91-3363-43af-a390-7fc06f5d7120' },
    ],
    packages: { 'web-mobile': { embedWebDebugger: false, orientation: 'portrait' } },
  };
  const configPath = path.join(root, `reports/build-${target}.json`);
  await writeFile(configPath, JSON.stringify(config, null, 2));
  // A failed build cannot accidentally relabel yesterday's generated files.
  await rm(path.join(root, 'build', target), { recursive: true, force: true });
  const { code, output } = await runCreator(
    ['--project', root, '--build', `configPath=${configPath}`],
    path.join(root, `reports/build-${target}.log`),
  );
  if (
    ![0, 36].includes(code) ||
    /Missing class:|attached to .+ is missing or invalid|Build failed/i.test(output)
  )
    throw Error(`Creator failed (${code}); inspect reports/build-${target}.log.`);
  const out = path.join(root, 'build', target);
  await brandCocos(out);
  let html = await readFile(path.join(out, 'index.html'), 'utf8');
  html = html
    .replace(/<title>.*?<\/title>/, '<title>三块选两块 · 给下一步留点空间</title>')
    .replace('minimal-ui=true', 'viewport-fit=cover')
    .replace(
      '</head>',
      '<link rel="icon" href="./icon.png"><style>html,body{height:100%;width:100%;margin:0;background:#d0dfc2;overflow:hidden}canvas{touch-action:none;outline:none}#GameDiv{position:fixed;inset:0;width:100%;height:100%;border:0;margin:0}#GameCanvas{width:100%;height:100%}[hidden]{display:none!important}#three-choose-two-loading{position:fixed;inset:0;z-index:9999;background:#d0dfc2;color:#183c34;display:flex;align-items:center;justify-content:center;flex-direction:column;font:18px sans-serif;gap:18px}#three-choose-two-loading img{width:112px;border-radius:26px}#three-choose-two-loading button{padding:15px 30px;background:#ed896c;color:#fff9e6;border:0;border-radius:16px;font:inherit}#three-choose-two-loading progress{accent-color:#57b7a4;width:220px}</style><script src="./dev-mode.js"></script><script src="./competition.js"></script><script type="module" src="./host.js"></script></head>',
    )
    .replace(
      '<body>',
      '<body><div id="three-choose-two-loading" role="status"><img src="./icon.png" alt=""><strong>三块选两块</strong><progress id="three-choose-two-progress" max="1" value="0"></progress><span id="three-choose-two-status">正在准备积木…</span><button id="three-choose-two-retry" hidden>重新加载</button></div><script src="./loading.js"></script>',
    );
  await writeFile(path.join(out, 'index.html'), html);
  await cp(path.join(root, 'scripts/dev-mode.js'), path.join(out, 'dev-mode.js'));
  await cp(path.join(root, 'competition.js'), path.join(out, 'competition.js'));
  for (const name of ['host.js', 'loading.js', 'icon.png'])
    await cp(path.join(root, 'startup', name), path.join(out, name));
  await cp(
    new URL('../../../../platforms/h5/publishing.js', import.meta.url),
    path.join(out, 'publishing.js'),
  );
  await prepareH5Ads('three-choose-two', out);
  await cp(
    path.join(path.dirname(editor), 'resources/resources/3d/engine/bin/.declarations/cc.d.ts'),
    path.join(root, 'cc.d.ts'),
  );
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
  console.log(`Built Three Choose Two with Creator 3.8.8: ${out}`);
}
