import { mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { editor, editorRoot, runCreator } from '../../carding-car/scripts/toolchain.mjs';
import { brandCocos } from '../../carding-car/scripts/cocos-branding.mjs';
import { prepare, sceneUuid } from './prepare.mjs';
import { sourceHash, verifyPrebuilt, runtimeManifest } from './artifact.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const target = process.argv[2] || 'web-mobile';
if (!['web-mobile', 'web-desktop'].includes(target))
  throw Error('Native targets require separate acceptance');
await prepare();
if (target === 'web-mobile' && process.env.NULLRANGE_PREBUILT_DIR) {
  const source = await verifyPrebuilt(process.env.NULLRANGE_PREBUILT_DIR);
  if (source !== path.join(root, 'dist')) {
    await rm(path.join(root, 'dist'), { recursive: true, force: true });
    await cp(source, path.join(root, 'dist'), { recursive: true });
  }
  console.log('Restored verified Null Range Creator artifact');
} else {
  if (!existsSync(editor))
    throw Error('Install Creator 3.8.8 or supply source-matching NULLRANGE_PREBUILT_DIR');
  if (
    JSON.parse(
      await readFile(path.join(editorRoot, 'resources/resources/3d/engine/package.json'), 'utf8'),
    ).version !== '3.8.8'
  )
    throw Error('Creator 3.8.8 is required');
  await mkdir(path.join(root, 'reports'), { recursive: true });
  const config = {
    name: 'null-range-mobile-cn',
    platform: target,
    debug: false,
    md5Cache: true,
    buildPath: 'project://build',
    outputName: target,
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
    packages: { 'web-mobile': { embedWebDebugger: false, orientation: 'landscape' } },
    replaceSplashScreen: true,
    useSplashScreen: true,
    splashScreen: {
      totalTime: 0,
      displayRatio: 1,
      autoFit: true,
      watermarkLocation: 'default',
      logo: { type: 'none' },
      background: { type: 'color', color: { x: 0.06, y: 0.14, z: 0.22, w: 1 } },
    },
  };
  const configPath = path.join(root, `reports/build-${target}.json`),
    out = path.join(root, 'build', target);
  await writeFile(configPath, JSON.stringify(config, null, 2));
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
    throw Error(`Creator build failed (${code})`);
  if ((await sourceHash()) !== inputHash)
    throw Error('Sources changed during build; rebuild this candidate');
  await brandCocos(out);
  let html = await readFile(path.join(out, 'index.html'), 'utf8');
  html = html
    .replace(/<title>.*?<\/title>/, '<title>零域 · NULL RANGE</title>')
    .replace(/<meta name="(?:full-screen|x5-fullscreen|360-fullscreen)"[^>]*>/g, '')
    .replace('minimal-ui=true', 'viewport-fit=cover')
    .replace(
      '</head>',
      '<link rel="icon" href="./icon.png"><script src="./dev-mode.js"></script><script defer src="./host.js"></script><style>html,body{margin:0;background:#102538;overflow:hidden;overscroll-behavior:none}canvas{touch-action:none;outline:none}#nullrange-loading{position:fixed;inset:0;z-index:30;display:grid;place-content:center;gap:16px;background:#102538;color:#eef3e5;text-align:center;font:18px system-ui}#nullrange-loading button{min-height:44px;background:#f6bb69;border:0;color:#102538;font:inherit}[hidden]{display:none!important}</style></head>',
    )
    .replace(
      /<body([^>]*)>/,
      '<body$1><div id="nullrange-loading" role="status"><img src="./icon.png" width="80" height="80" alt=""><strong>零域 · NULL RANGE</strong><span>正在准备飞行…</span><button hidden type="button">重新加载</button></div>',
    );
  await writeFile(path.join(out, 'index.html'), html);
  await cp(path.join(root, 'scripts/dev-mode.js'), path.join(out, 'dev-mode.js'));
  for (const file of ['host.js', 'icon.png'])
    await cp(path.join(root, 'startup', file), path.join(out, file));
  const declarations = await readFile(
    path.join(editorRoot, 'resources/resources/3d/engine/bin/.declarations/cc.d.ts'),
  );
  await writeFile(path.join(root, 'cc.d.ts'), declarations);
  await writeFile(
    path.join(out, 'build-info.json'),
    JSON.stringify(
      {
        creator: '3.8.8',
        target,
        gameId: 'vibeJam-myself-nullrange',
        sourceHash: inputHash,
        declarationsHash: createHash('sha256').update(declarations).digest('hex'),
        files: await runtimeManifest(out),
      },
      null,
      2,
    ),
  );
  if (target === 'web-mobile') {
    await rm(path.join(root, 'dist'), { recursive: true, force: true });
    await cp(out, path.join(root, 'dist'), { recursive: true });
    await verifyPrebuilt(root);
  }
  console.log(`Built Null Range with Creator 3.8.8: ${out}`);
}
