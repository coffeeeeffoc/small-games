import { mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { editor, editorRoot, runCreator } from '../../carding-car/scripts/toolchain.mjs';
import { brandCocos } from '../../carding-car/scripts/cocos-branding.mjs';
import { sourceHash, verifyPrebuilt, runtimeManifest } from './artifact.mjs';
import { platformConfig } from './platform-config.mjs';
import { guardArtifactRestore } from './artifact-paths.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const target = process.argv[2] || 'web-mobile';
const native = target === 'wechatgame';
if (!['web-mobile', 'web-desktop', 'wechatgame'].includes(target))
  throw Error('Unsupported Creator target.');
const config = await platformConfig(process.env.BULLET_GARDEN_PLATFORM_CONFIG);
if ((native && config.platform === 'taptap-h5') || (!native && config.platform === 'taptap'))
  throw Error('Ad channel does not match native/H5 target.');
if (target === 'web-mobile' && process.env.BULLET_GARDEN_PREBUILT_DIR) {
  const source = await verifyPrebuilt(process.env.BULLET_GARDEN_PREBUILT_DIR, config);
  const restore = await guardArtifactRestore(source, path.join(root, 'dist'), root);
  if (restore.copy) {
    await rm(restore.destination, { recursive: true, force: true });
    await cp(restore.source, restore.destination, { recursive: true });
  }
  console.log('Restored source-matching Bullet Garden Creator artifact.');
} else {
  if (!existsSync(editor))
    throw Error('Cocos Creator 3.8.8 or a source-matching BULLET_GARDEN_PREBUILT_DIR is required.');
  const engine = path.join(editorRoot, 'resources/resources/3d/engine');
  if (JSON.parse(await readFile(path.join(engine, 'package.json'), 'utf8')).version !== '3.8.8')
    throw Error('Creator 3.8.8 required.');
  await import('./prepare.mjs');
  await mkdir(path.join(root, 'reports'), { recursive: true });
  const scene = '727a052e-3331-4130-a1d4-f35a67322cba';
  const options = {
    name: 'bullet-garden',
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
      logo: { type: 'none' },
      background: { type: 'color', color: { x: 0.04, y: 0.1, z: 0.06, w: 1 } },
    },
    includeModules: ['base', 'gfx-webgl', 'gfx-webgl2', '2d', 'ui', 'graphics', 'audio'],
    startScene: scene,
    scenes: [{ url: 'db://assets/scenes/main.scene', uuid: scene }],
    packages: {
      'web-mobile': { embedWebDebugger: false, orientation: 'portrait' },
      wechatgame: { orientation: 'portrait' },
    },
  };
  const configPath = path.join(root, `reports/build-${target}.json`);
  await writeFile(configPath, JSON.stringify(options, null, 2));
  // All destructive paths are fixed children of this game's workspace.
  const out = path.join(root, 'build', target);
  await rm(out, { recursive: true, force: true });
  const { code, output } = await runCreator(
    ['--project', root, '--build', `configPath=${configPath}`],
    path.join(root, `reports/build-${target}.log`),
  );
  if (
    ![0, 36].includes(code) ||
    /Missing class:|attached to .+ is missing or invalid|Build failed/i.test(output)
  )
    throw Error(`Creator failed (${code}); see reports/build-${target}.log`);
  await brandCocos(out, native ? path.join(root, 'assets/resources/art/icon.png') : undefined);
  if (native) {
    for (const [file, key] of [
      ['game.json', 'appId'],
      ['project.config.json', 'appid'],
    ]) {
      const filename = path.join(out, file);
      const manifest = JSON.parse(await readFile(filename, 'utf8'));
      manifest[key] = config.appId;
      if (file === 'game.json') manifest.deviceOrientation = 'portrait';
      await writeFile(filename, JSON.stringify(manifest, null, 2) + '\n');
    }
  }
  if (!native) {
    let html = await readFile(path.join(out, 'index.html'), 'utf8');
    html = html
      .replace(/<title>.*?<\/title>/, '<title>子弹花园</title>')
      .replace('minimal-ui=true', 'viewport-fit=cover')
      .replace(
        '</head>',
        '<link rel="icon" href="./icon.png"><style>html,body{margin:0;background:#142b20;overflow:hidden}canvas{touch-action:none;outline:none}#GameDiv{position:absolute;inset:0;width:100%;height:100%;border:0;margin:0}#GameCanvas{width:100%;height:100%}[hidden]{display:none!important}#garden-loading{position:fixed;inset:0;z-index:9999;background:#142b20;color:#f7e5ab;display:flex;align-items:center;justify-content:center;flex-direction:column;font:18px sans-serif;gap:18px}#garden-loading img{width:112px;border-radius:26px}#garden-loading button{padding:15px 30px;background:#edca73;color:#203421;border:0;border-radius:16px;font:inherit}#garden-loading progress{accent-color:#d3b45d;width:220px}</style><script src="./dev-mode.js"></script></head>',
      )
      .replace(
        '<body>',
        '<body><div id="garden-loading" role="status"><img src="./icon.png" alt=""><strong>子弹花园</strong><progress id="garden-progress" max="1" value="0"></progress><span id="garden-status">正在准备花园…</span><button id="garden-retry" hidden>重新加载</button></div><script src="./loading.js"></script>',
      );
    await writeFile(path.join(out, 'index.html'), html);
    await cp(path.join(root, 'scripts/dev-mode.js'), path.join(out, 'dev-mode.js'));
    await cp(path.join(root, 'startup/loading.js'), path.join(out, 'loading.js'));
    await cp(path.join(root, 'assets/resources/art/icon.png'), path.join(out, 'icon.png'));
  }
  await cp(path.join(engine, 'bin/.declarations/cc.d.ts'), path.join(root, 'cc.d.ts'));
  await writeFile(
    path.join(out, 'build-info.json'),
    JSON.stringify(
      {
        creator: '3.8.8',
        target,
        channel: config,
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
  console.log(`Built Bullet Garden with Creator 3.8.8: ${out}`);
}
