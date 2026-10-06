import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir, readdir, cp, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { verifyAlipayPackageBudget } from './alipay-package-budget.mjs';
import { prepareHistoryPackages } from './nine-history-assets.mjs';
import { nineGames, fivePlatforms, scopeCommit, targetOptions } from './nine-games-targets.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const sha = (data) => createHash('sha256').update(data).digest('hex');
export async function inventory(directory) {
  const files = [];
  async function visit(relative = '') {
    for (const item of await readdir(path.join(directory, relative), { withFileTypes: true })) {
      const name = path.posix.join(relative, item.name);
      if (item.isSymbolicLink()) throw new Error(`Package symlink is not allowed: ${name}`);
      if (item.isDirectory()) await visit(name);
      else if (name !== 'artifact-manifest.json') {
        const bytes = await readFile(path.join(directory, name));
        files.push({ path: name, bytes: bytes.length, sha256: sha(bytes) });
      }
    }
  }
  await visit();
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
export async function verifyArtifact(directory) {
  const manifest = JSON.parse(
    await readFile(path.join(directory, 'artifact-manifest.json'), 'utf8'),
  );
  const files = await inventory(directory);
  if (JSON.stringify(files) !== JSON.stringify(manifest.files))
    throw new Error('Artifact integrity mismatch or unexpected/missing file.');
  if (
    !files.some((file) => file.path === 'game.js') ||
    !files.some((file) => file.path === 'game.json')
  )
    throw new Error('Native package entry/config is missing.');
  if (manifest.game === 'vibeJam-myself-history-guess') {
    const resources = JSON.parse(
      await readFile(path.join(directory, 'history-assets-manifest.json'), 'utf8'),
    );
    const release = JSON.parse(await readFile(path.join(directory, 'release.json'), 'utf8'));
    if (resources.files.length !== 33)
      throw new Error('History image inventory must preserve all 33 original resources.');
    for (const expected of resources.files) {
      const packaged = files.find((file) => file.path === expected.path);
      if (
        !packaged ||
        packaged.bytes !== expected.bytes ||
        packaged.sha256 !== expected.sha256 ||
        release.assetPackages?.[expected.source]?.path !== expected.path
      )
        throw new Error('History native image resource or package mapping is missing or altered.');
    }
    for (const pack of resources.packages) {
      if (!files.some((file) => file.path === `${pack.root}/game.js`))
        throw new Error('History subpackage entry is missing.');
      const bytes = files
        .filter((file) => file.path.startsWith(`${pack.root}/`))
        .reduce((total, file) => total + file.bytes, 0);
      if (bytes > resources.budget)
        throw new Error('History subpackage exceeds the reviewed native budget.');
    }
  }
  if (manifest.game === 'travel-bund') {
    const resources = JSON.parse(
      await readFile(path.join(directory, 'assets/native-assets-manifest.json'), 'utf8'),
    );
    for (const expected of resources.files.filter((file) => file.delivery !== 'remote-pinned')) {
      const packaged = files.find((file) => file.path === `assets/${expected.path}`);
      if (!packaged || packaged.bytes !== expected.bytes || packaged.sha256 !== expected.sha256)
        throw new Error('Bund native package resource is missing or altered.');
    }
  }
  return manifest;
}
export async function buildTarget(selected, config, outputRoot) {
  const outDir = path.join(outputRoot, config.platform, selected.id);
  // Never leave an older success looking like the result of a failed current build.
  await rm(outDir, { recursive: true, force: true });
  if (selected.blocked) throw new Error(selected.blocked);
  let inputs = [];
  if (selected.cocos) {
    const wrapper = await import(
      pathToFileURL(path.join(root, selected.directory, 'platforms/build.mjs'))
    );
    const publicEnv = { ...process.env, [`${config.platform.toUpperCase()}_APP_ID`]: config.appId };
    if (config.platform === 'kuaishou') {
      for (const suffix of [
        'CONVERTED_DIR',
        'SOURCE_DIR',
        'SOURCE_INVENTORY',
        'PROJECT_CONFIG_FILE',
        'PROJECT_APP_ID_FIELD',
      ]) {
        const scoped = `MINIGAME_${selected.id.toUpperCase().replaceAll('-', '_')}_KUAISHOU_${suffix}`;
        publicEnv[`KUAISHOU_${suffix}`] = process.env[scoped] || '';
      }
    }
    const result = await wrapper.buildPlatform(config.platform, {
      mode: config.preview ? 'preview' : 'release',
      env: publicEnv,
    });
    const source = result.directory || result.outputDir || result.output;
    if (typeof source !== 'string')
      throw new Error('Cocos wrapper returned no verified native artifact directory.');
    await cp(source, outDir, { recursive: true });
  } else {
    const { build } = await import('vite');
    const descriptorPath = path.join(root, 'platforms', config.platform, 'build.mjs');
    const module = await import(pathToFileURL(descriptorPath));
    const adapter = module[`${config.platform}Platform`];
    if (!adapter) throw new Error(`Missing reviewed ${config.platform} build descriptor.`);
    let entry = path.join(root, selected.directory, selected.entry);
    let prepared;
    if (selected.prepare) {
      const preparePath = path.join(root, selected.directory, selected.prepare);
      const preparation = await import(pathToFileURL(preparePath));
      prepared = await preparation.prepareNativeBuild(
        path.join(root, '.scratch/nine-games/prepared', selected.id),
      );
      entry = prepared.entry;
      inputs.push(
        preparePath,
        ...prepared.sourceInputs
          .map((file) => path.resolve(root, file))
          .filter((file) => file.startsWith(root) && !file.includes('/node_modules/')),
      );
      for (const file of [
        'native/generate-sources.mjs',
        'native/prepare-assets.mjs',
        'src/Scene.tsx',
        'src/StreetLife.tsx',
        'src/clouds.ts',
      ])
        inputs.push(path.join(root, selected.directory, file));
    }
    let imagePackages;
    if (selected.subpackageImages) {
      imagePackages = await prepareHistoryPackages(path.join(root, selected.directory), outDir);
      config = { ...config, assetPackages: imagePackages.assetPackages };
      inputs.push(
        ...imagePackages.sourceInputs,
        path.join(root, 'apps/shell-minigame/scripts/nine-history-assets.mjs'),
      );
    }
    await stat(entry);
    const host = path.join(root, 'platforms/competition/native.js');
    const normalize = path.join(root, 'platforms/alipay/normalize.mjs');
    const channelEntry = path.join(root, 'platforms/bilibili/native-entry.mjs');
    const availability = path.join(root, 'apps/shell-minigame/src/competition-availability.mjs');
    const resourceBridge = path.join(root, 'platforms', config.platform, 'native-resources.mjs');
    let source = `${selected.resources ? `import {attachNativeResources} from ${JSON.stringify(resourceBridge)};` : ''}
      ${config.platform === 'alipay' ? `import {normalizeAlipaySdk} from ${JSON.stringify(normalize)};` : ''}
      ${config.platform === 'bilibili' ? `import {attachBilibiliEntry} from ${JSON.stringify(channelEntry)};` : ''}
      import {${selected.start}} from ${JSON.stringify(entry)};
      ${selected.competition === false ? '' : `import {startNativeCompetition} from ${JSON.stringify(host)};`}
      import {withCompetitionAvailability} from ${JSON.stringify(availability)};
      const raw=typeof ${adapter.sdk}==='undefined'?undefined:${adapter.sdk};
      const config=${JSON.stringify({ ...config, title: selected.title })};
      const baseSdk=${config.platform === 'alipay' ? 'normalizeAlipaySdk(raw)' : 'raw'};
      const sdk=withCompetitionAvailability(${selected.resources ? `attachNativeResources(baseSdk,{allowedAssetHosts:${JSON.stringify(config.assetBase ? [new URL(config.assetBase).hostname] : [])}})` : 'baseSdk'},config);
      ${
        config.platform === 'bilibili'
          ? `const channelEntry=attachBilibiliEntry(sdk,{gameId:config.game});
      const gameSdk=new Proxy(sdk,{get(target,key){if(key==='channelEntry')return channelEntry;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});`
          : 'const gameSdk=sdk;'
      }
      let mounted;
      try {mounted=${selected.start}(gameSdk,config${selected.competition === false ? '' : ',startNativeCompetition'});} catch(error) {${config.platform === 'bilibili' ? 'channelEntry.dispose();' : ''}throw error;}
      function finish(value){
        ${
          config.platform === 'bilibili'
            ? `for(const method of ['stop','dispose']){if(typeof value?.[method]==='function'){const original=value[method];value[method]=function(...args){try{return original.apply(this,args);}finally{channelEntry.dispose();}};}}
        if(sdk&&typeof sdk.launchSuccess==='function')sdk.launchSuccess();`
            : ''
        }
        return value;
      }
      export const instance=${selected.async ? 'undefined' : 'finish(mounted)'};
      export const ready=${selected.async ? `Promise.resolve(mounted).then(async value=>{try{await value?.whenReady;return finish(value);}catch(error){await value?.dispose?.();throw error;}}).catch(error=>{${config.platform === 'bilibili' ? 'channelEntry.dispose();' : ''}throw error;})` : 'Promise.resolve(instance)'};`;
    const sourcePlugins = [];
    if (selected.nativeHost) {
      const platformEntry = path.join(root, 'platforms', config.platform, 'src/index.ts');
      source = `import {${adapter.start}} from ${JSON.stringify(platformEntry)};
        import {${selected.definition} as original, ${selected.content} as content} from ${JSON.stringify(entry)};
        const raw=typeof ${adapter.sdk}==='undefined'?undefined:${adapter.sdk};
        const definition={...original,manifest:{...original.manifest,entry:'game.js',loadModes:['native-package']}};
        export const ready=${adapter.start}(raw,{definition,content,viewport:{aspectRatio:390/844,rotateToFit:true,refreshOnResize:"resume"}}${adapter.entryArguments({ title: selected.title, adUnitId: '' }) ? ',' + adapter.entryArguments({ title: selected.title, adUnitId: '' }) : ''});`;
      const pluginPath = path.join(root, selected.directory, selected.sourcePlugin);
      const pluginModule = await import(pathToFileURL(pluginPath));
      sourcePlugins.push(
        pluginModule.wulongSharedSourcePlugin(path.join(root, selected.directory)),
      );
      inputs.push(pluginPath);
    }
    const generatedEntry = path.join(
      root,
      '.scratch/nine-games',
      `${config.platform}-${selected.id}.mjs`,
    );
    await mkdir(path.dirname(generatedEntry), { recursive: true });
    await writeFile(generatedEntry, source);
    await build({
      configFile: false,
      root,
      publicDir: false,
      logLevel: 'warn',
      build: {
        outDir,
        emptyOutDir: false,
        minify: selected.minify ?? false,
        lib: { entry: generatedEntry, formats: ['cjs'], fileName: () => 'game.js' },
      },
      plugins: [
        ...sourcePlugins,
        {
          name: 'frozen-nine-native-entry',
          generateBundle(_, bundle) {
            inputs.push(
              ...Object.values(bundle)
                .filter((item) => item.type === 'chunk')
                .flatMap((item) => Object.keys(item.modules))
                .filter(
                  (file) =>
                    file.startsWith(root) &&
                    !file.includes('/node_modules/') &&
                    !file.includes('/.scratch/'),
                ),
            );
          },
        },
      ],
    });
    if (prepared)
      await cp(prepared.assetDirectory, path.join(outDir, 'assets'), { recursive: true });
    for (const [sourcePath, targetPath] of selected.assets)
      await cp(path.join(root, selected.directory, sourcePath), path.join(outDir, targetPath), {
        recursive: true,
      });
    if (!selected.nativeHost)
      await cp(
        path.join(root, 'games/local/game-cricket/public/cricket-audio/perfect.wav'),
        path.join(outDir, 'competition-action.wav'),
      );
    for (const [name, value] of Object.entries(
      adapter.files({ game: selected.id, appId: config.appId, version: '1.0.0' }),
    ))
      await writeFile(
        path.join(outDir, name),
        JSON.stringify(
          name === 'game.json'
            ? {
                ...value,
                deviceOrientation: selected.orientation,
                ...(imagePackages
                  ? {
                      [config.platform === 'douyin' ? 'subPackages' : 'subpackages']:
                        imagePackages.packages,
                    }
                  : {}),
              }
            : name === 'project.config.json' && config.platform === 'wechat'
              ? { ...value, appid: config.appId }
              : value,
          null,
          2,
        ) + '\n',
      );
    inputs.push(
      descriptorPath,
      path.join(root, 'pnpm-lock.yaml'),
      path.join(root, 'apps/shell-minigame/scripts/nine-games-targets.mjs'),
      fileURLToPath(import.meta.url),
    );
    await writeFile(
      path.join(outDir, 'release.json'),
      JSON.stringify(
        {
          ...config,
          title: selected.title,
          ...(selected.nativeHost ? { gameId: selected.id } : {}),
          mode: config.preview ? 'preview' : 'release',
          gameplayScope:
            selected.id === 'travel-bund'
              ? 'original native WebGL city tour and photography; pinned remote world resources'
              : selected.nativeHost
                ? 'native local solo puzzle; original progress and records'
                : 'native local solo; optional server-authoritative friend competition',
          nativeRuntimeVerified: false,
          platformLoginVerified: false,
          advertisingConfigured: false,
          officialToolsVerified: false,
          deviceVerified: false,
        },
        null,
        2,
      ) + '\n',
    );
  }
  if (selected.id === 'travel-bund') {
    const packagedFiles = await inventory(outDir);
    const bytes = packagedFiles.reduce((total, file) => total + file.bytes, 0);
    if (bytes > 4_000_000)
      throw new Error(
        `Travel main package exceeds the conservative 4,000,000-byte budget: ${bytes}; official tool validation is still required.`,
      );
    await writeFile(
      path.join(outDir, 'package-budget.json'),
      JSON.stringify(
        {
          payloadBytesBeforeBudgetAndIntegrityManifests: bytes,
          budgetBytes: 4_000_000,
          officialToolValidated: false,
        },
        null,
        2,
      ) + '\n',
    );
  }
  const sourceFiles = await Promise.all(
    [...new Set(inputs)].sort().map(async (file) => ({
      path: path.relative(root, file).replaceAll('\\', '/'),
      sha256: sha(await readFile(file)),
    })),
  );
  const manifest = {
    schemaVersion: 1,
    game: selected.id,
    platform: config.platform,
    mode: config.preview ? 'preview' : 'release',
    scopeCommit,
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    sourceTreeDirty: Boolean(
      execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=normal'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
    ),
    sourceFiles,
    files: await inventory(outDir),
    officialToolsVerified: false,
    deviceVerified: false,
  };
  await writeFile(
    path.join(outDir, 'artifact-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  await verifyArtifact(outDir);
  if (config.platform === 'alipay') await verifyAlipayPackageBudget(outDir);
  if (selected.id === 'travel-bund') {
    const completeBytes =
      manifest.files.reduce((total, file) => total + file.bytes, 0) +
      (await stat(path.join(outDir, 'artifact-manifest.json'))).size;
    if (completeBytes > 4_000_000)
      throw new Error(
        `Complete Travel package exceeds the conservative 4,000,000-byte budget: ${completeBytes}`,
      );
  }
  return outDir;
}
export async function runBuild({
  all = false,
  game,
  platform,
  preview = false,
  outputRoot = path.join(root, 'apps/shell-minigame/dist/nine-games'),
  env = process.env,
} = {}) {
  if (!all && (!nineGames.some((item) => item.id === game) || !fivePlatforms.includes(platform)))
    throw new Error('Select --all or a frozen --game and --platform target.');
  if (all && (game || platform))
    throw new Error('--all cannot be combined with --game/--platform.');
  const targets = (all ? nineGames : nineGames.filter((item) => item.id === game)).flatMap(
    (selected) =>
      (all ? fivePlatforms : [platform]).map((channel) => ({
        selected,
        config: targetOptions(selected.id, channel, { preview, env }),
      })),
  );
  const results = [];
  for (const { selected, config } of targets) {
    try {
      const directory = await buildTarget(selected, config, outputRoot);
      results.push({
        game: selected.id,
        platform: config.platform,
        status: 'built-integrity-checked',
        directory: path.relative(root, directory),
        officialTools: 'unrun',
        device: 'unrun',
      });
    } catch (error) {
      await rm(path.join(outputRoot, config.platform, selected.id), {
        recursive: true,
        force: true,
      });
      results.push({
        game: selected.id,
        platform: config.platform,
        status: 'blocked',
        reason: error.message,
        officialTools: 'unrun',
        device: 'unrun',
      });
    }
    console.log(
      `${selected.id}/${config.platform}: ${results.at(-1).status}${results.at(-1).reason ? ' — ' + results.at(-1).reason : ''}`,
    );
  }
  await mkdir(outputRoot, { recursive: true });
  await writeFile(
    path.join(outputRoot, 'build-status.json'),
    JSON.stringify({ scopeCommit, preview, results }, null, 2) + '\n',
  );
  return results;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      all: { type: 'boolean' },
      game: { type: 'string' },
      platform: { type: 'string' },
      preview: { type: 'boolean' },
      output: { type: 'string' },
      verify: { type: 'string' },
    },
  });
  if (values.verify) {
    await verifyArtifact(path.resolve(values.verify));
    console.log('Artifact integrity verified.');
  } else {
    const results = await runBuild({
      all: values.all,
      game: values.game,
      platform: values.platform,
      preview: values.preview,
      outputRoot: values.output ? path.resolve(values.output) : undefined,
    });
    if (results.some((item) => item.status === 'blocked')) process.exitCode = 1;
  }
}
