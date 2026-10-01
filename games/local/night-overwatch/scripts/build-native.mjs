import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeTarget, nativePackages, verifyNativeOutput } from '../../carding-car/scripts/native-targets.mjs';
import { clearOutput } from '../../carding-car/scripts/clear-output.mjs';
import { editor, runCreator } from '../../carding-car/scripts/toolchain.mjs';
import { sourceHash } from './artifact.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function buildNative(target, { configOnly = false, checkOutput = false } = {}) {
  const localPath = path.join(root, 'release-config.local.json');
  const release = existsSync(localPath) ? JSON.parse(await readFile(localPath, 'utf8')) : {};
  const descriptor = nativeTarget(target, release);
  if (checkOutput) {
    const directory = path.join(root, 'build', target === 'bilibili' ? 'biligame' : descriptor.outputName);
    const checked = await verifyNativeOutput(directory, descriptor, await sourceHash());
    console.log(`${target} Creator output matches current source and package budget; platform authorization and devices unverified.`);
    return checked;
  }
  const config = {
    name: 'night-overwatch', platform: descriptor.platform, outputName: descriptor.outputName,
    debug: false, md5Cache: true, buildPath: 'project://build',
    includeModules: ['base', 'gfx-webgl', 'gfx-webgl2', '3d', '2d', 'ui', 'graphics', 'mask', 'audio', 'primitive', 'profiler'],
    startScene: '47889f0b-3be6-4dbd-a05d-b4381a0277e9',
    scenes: [{ url: 'db://assets/scenes/main.scene', uuid: '47889f0b-3be6-4dbd-a05d-b4381a0277e9' }],
    packages: nativePackages(target, release),
  };
  const reports = path.join(root, 'reports');
  await mkdir(reports, { recursive: true });
  const configPath = path.join(reports, `build-${target}.json`);
  await writeFile(configPath, JSON.stringify(config, null, 2));
  if (configOnly) {
    console.log(`Saved ${target} Creator configuration: ${descriptor.configured ? 'AppID configured; authorization unverified' : 'preview configuration; platform AppID missing or tourist mode'}. No Creator build was run.`);
    return config;
  }
  if (!existsSync(editor)) throw new Error('Set COCOS_CREATOR to the Cocos Creator 3.8.8 executable before native builds.');
  if (target === 'douyin' && !descriptor.configured)
    throw new Error('Set DOUYIN_APP_ID or release-config.local.json douyinAppId before building; use --config-only to inspect an unconfigured target.');
  if (target === 'bilibili') {
    const extension = path.join(root, 'extensions/biligame-builder');
    if (!existsSync(path.join(extension, 'package.json'))) {
      const sharedExtension = fileURLToPath(new URL('../../carding-car/extensions/biligame-builder/', import.meta.url));
      if (!existsSync(path.join(sharedExtension, 'package.json')))
        throw new Error('Install the official Bilibili builder with node games/local/carding-car/scripts/setup.mjs --bilibili first.');
      await cp(sharedExtension, extension, { recursive: true });
    }
    const manifest = JSON.parse(await readFile(path.join(extension, 'package.json'), 'utf8'));
    if (manifest.version !== '1.0.3') throw new Error('Night Overwatch requires the verified official biligame-builder 1.0.3.');
  }
  await clearOutput(path.join(root, 'build', descriptor.outputName));
  if (target === 'bilibili') await clearOutput(path.join(root, 'build/biligame'));
  const { code, output } = await runCreator(['--project', root, '--build', `configPath=${configPath}`],
    path.join(reports, `build-${target}.log`));
  if (![0, 36].includes(code) || /Missing class:|attached to .+ is missing or invalid|Build failed/i.test(output))
    throw new Error(`Creator failed (${code}); inspect reports/build-${target}.log.`);
  const directory = path.join(root, 'build', target === 'bilibili' ? 'biligame' : descriptor.outputName);
  if (target === 'bilibili') {
    // The official adapter builds from a WeChat engine export, then owns the bl
    // bindings. Preserve it; only correct the public project identity and label.
    const projectPath = path.join(directory, 'project.config.json');
    const project = JSON.parse(await readFile(projectPath, 'utf8'));
    project.appid = descriptor.outputAppId;
    project.projectname = 'night-overwatch-bilibili' + (descriptor.configured ? '' : '-preview-only');
    const gamePath = path.join(directory, 'game.json');
    const game = JSON.parse(await readFile(gamePath, 'utf8'));
    game.appId = descriptor.outputAppId;
    await writeFile(projectPath, JSON.stringify(project, null, 2));
    await writeFile(gamePath, JSON.stringify(game, null, 2));
    const entry = await readFile(path.join(directory, 'game.js'), 'utf8');
    const adapters = [...entry.matchAll(/require\(['"]\.\/(blapp-adapter[^'"]+)['"]\)/g)];
    if (!adapters.length) throw new Error('Official Bilibili engine adapter is missing.');
    const adapterSource = (await Promise.all(adapters.map((match) => readFile(path.join(directory, match[1]), 'utf8')))).join('\n');
    if (!/\bwx\s*=\s*bl\b/.test(adapterSource)) throw new Error('Official Bilibili bl-to-wx engine binding is missing.');
  }
  await writeFile(path.join(directory, 'build-info.json'), JSON.stringify({
    creator: '3.8.8', target, sourceHash: await sourceHash(),
  }));
  const checked = await verifyNativeOutput(directory, descriptor);
  await writeFile(path.join(reports, `${target}-size.json`), JSON.stringify(checked, null, 2));
  console.log(`Built ${target}: main=${checked.mainBytes}, total=${checked.totalBytes} bytes; ${descriptor.configured ? 'platform authorization and real devices unverified' : 'preview-only; valid platform AppID required for release'}.`);
  return config;
}
