import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir, cp } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build, parseSync } from 'vite';
import { root, repo, games, creatorConfiguration } from './config.mjs';
import { digest, relativeFile } from '../../../apps/shell-minigame/scripts/taptap-package.mjs';

export const sharedFiles = [
  'CocosMiniGame.ts',
  'runtime.js',
  'runtime.d.ts',
  'browser-sdk.js',
  'browser-sdk.d.ts',
];
export const assetInputs = (game) => [
  ['games/local/game-cricket/public/cricket-audio/perfect.wav', 'competition-action.wav'],
  ...(game === 'cops-robbers'
    ? ['home-chase.webp', 'patrol-garden.webp', 'patrol-characters.svg'].map((name) => [
        `games/local/cops-robbers/assets/${name}`,
        name.replace('.svg', '.webp'),
      ])
    : []),
  ...(game === 'cops-robbers-realtime'
    ? [['games/local/cops-robbers-realtime/src/assets/home-city.png', 'home-city.png']]
    : []),
];
const toolInputs = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'games/local/carding-car/scripts/toolchain.mjs',
  'apps/shell-minigame/scripts/taptap-package.mjs',
  'apps/shell-minigame/scripts/taptap-login.mjs',
  'apps/shell-minigame/scripts/taptap-cocos-inputs.mjs',
  'platforms/taptap/login.cjs',
];
const exec = promisify(execFile);

export function normalizeIterableSpreads(code) {
  // Creator 3.8's loose spread transform assumes arrays. Materialize iterable
  // arguments before that transform, including those in imported H5 rules.
  // Object spreads and rest bindings have different semantics and stay intact.
  const { program, errors } = parseSync('cocos-controller.js', code);
  assert.equal(errors.length, 0, 'Cannot parse controller JavaScript');
  const edits = [];
  const visit = (node, parent) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'SpreadElement' && parent?.type !== 'ObjectExpression') {
      edits.push([node.argument.start, 'Array.from(('], [node.argument.end, '))']);
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) for (const item of child) visit(item, node);
      else if (child && typeof child === 'object') visit(child, node);
    }
  };
  visit(program);
  for (const [offset, insertion] of edits.sort((a, b) => b[0] - a[0]))
    code = code.slice(0, offset) + insertion + code.slice(offset);
  return code;
}

export async function projectSettingsInputs(project, repository = repo) {
  const settings = path.relative(repository, path.join(project, 'settings')).replaceAll('\\', '/');
  relativeFile(settings);
  // Creator writes machine-specific builder/device/information/program profiles
  // during import. Only versioned settings are source inputs; fingerprint their
  // working-tree bytes below so local edits and missing files still invalidate.
  const { stdout } = await exec('git', ['ls-files', '--cached', '-z', '--', settings], {
    cwd: repository,
    encoding: 'utf8',
  });
  return stdout.split('\0').filter(Boolean);
}

export async function fingerprint(paths, config, repository = repo) {
  const files = [];
  for (const file of [...new Set(paths)].sort()) {
    relativeFile(file);
    const bytes = await readFile(path.join(repository, file));
    files.push({ path: file, bytes: bytes.length, sha256: digest(bytes) });
  }
  return { files, sourceHash: digest(JSON.stringify({ config, files })) };
}

export async function prepareGame(config) {
  const project = path.join(root, config.game),
    target = path.join(project, 'assets/scripts');
  await mkdir(target, { recursive: true });
  await mkdir(path.join(project, 'reports'), { recursive: true });
  const definition = games[config.game];
  const code = `
import { ${definition.start} as controller } from ${JSON.stringify(path.join(repo, definition.entry).replaceAll('\\', '/'))};
import { startNativeCompetition } from ${JSON.stringify(path.join(repo, 'platforms/competition/native.js').replaceAll('\\', '/'))};
import { normalizeTapTapSdk } from ${JSON.stringify(path.join(repo, 'platforms/taptap/normalize.mjs').replaceAll('\\', '/'))};
import { normalizeAlipaySdk } from ${JSON.stringify(path.join(repo, 'platforms/alipay/normalize.mjs').replaceAll('\\', '/'))};
import { withCompetitionAvailability } from ${JSON.stringify(path.join(repo, 'apps/shell-minigame/src/competition-availability.mjs').replaceAll('\\', '/'))};
import { attachBilibiliEntry } from ${JSON.stringify(path.join(repo, 'platforms/bilibili/native-entry.mjs').replaceAll('\\', '/'))};
import { createSdkOverlay } from ${JSON.stringify(path.join(root, 'shared/runtime.js').replaceAll('\\', '/'))};
export const config = ${JSON.stringify(config)};
export function prepareSdk(raw) {
  let sdk = config.platform === 'taptap' ? normalizeTapTapSdk(raw) : config.platform === 'alipay' ? normalizeAlipaySdk(raw) : raw;
  sdk = withCompetitionAvailability(sdk, config);
  if (config.platform === 'bilibili') sdk = createSdkOverlay(sdk, { channelEntry: attachBilibiliEntry(sdk, { gameId: config.game }) });
  return sdk;
}
export function start(sdk) {
  const instance = controller(sdk, config, startNativeCompetition);
  const dispose = instance.stop || instance.dispose;
  return { ...instance, getState: () => instance.getState?.() ?? instance.state,
    stop() { try { dispose?.call(instance); } finally { sdk.channelEntry?.dispose(); } } };
}
`;
  const entryFile = path.join(project, 'reports/entry.mjs');
  await writeFile(entryFile, code);
  let imported = [];
  const result = await build({
    configFile: false,
    root: repo,
    logLevel: 'warn',
    plugins: [
      {
        name: 'cocos-controller-entry',
        generateBundle() {
          imported = [...this.getModuleIds()];
        },
      },
    ],
    build: {
      write: false,
      target: 'es2020',
      minify: false,
      lib: { entry: entryFile, formats: ['es'], fileName: 'game-entry' },
      rolldownOptions: { output: { codeSplitting: false } },
    },
  });
  const chunks = (
    Array.isArray(result) ? result.flatMap((item) => item.output) : result.output
  ).filter((file) => file.type === 'chunk');
  assert(
    chunks.length === 1 && chunks[0].imports.length === 0 && chunks[0].dynamicImports.length === 0,
    'Controller bundle must contain every runtime dependency',
  );
  await writeFile(path.join(target, 'game-entry.js'), normalizeIterableSpreads(chunks[0].code));
  await writeFile(
    path.join(target, 'game-entry.d.ts'),
    'export const config: { game:string; platform:string; pixelRatio:number; maxUploadsPerSecond:number; assetRoot:string; debug:boolean };\nexport function prepareSdk(raw:any):any;\nexport function start(sdk:any):any;\n',
  );
  for (const file of sharedFiles) {
    const source = path.join(root, 'shared', file);
    if (file.endsWith('.js'))
      await writeFile(
        path.join(target, file),
        normalizeIterableSpreads(await readFile(source, 'utf8')),
      );
    else await cp(source, path.join(target, file));
  }
  const engineConfig = creatorConfiguration(config);
  const configFile = path.join(project, 'reports', `build-${config.platform}.json`);
  await writeFile(configFile, JSON.stringify(engineConfig, null, 2) + '\n');
  const localInputs = await projectSettingsInputs(project);
  for (const directory of ['scripts', 'shared']) {
    for (const file of await readdir(path.join(root, directory)))
      localInputs.push(`games/minigames/${directory}/${file}`);
  }
  for (const file of await readdir(project, { recursive: true, withFileTypes: true })) {
    if (!file.isFile()) continue;
    const relative = path
      .relative(project, path.join(file.parentPath, file.name))
      .replaceAll('\\', '/');
    if (
      /^(?:package\.json|tsconfig\.json|assets\/scenes(?:\.meta|\/)|assets\/scripts\.meta)/.test(
        relative,
      ) ||
      /^assets\/scripts\/[^/]+\.meta$/.test(relative)
    )
      localInputs.push(`games/minigames/${config.game}/${relative}`);
  }
  const sourcePaths = imported
    .filter((file) => path.isAbsolute(file))
    // Rolldown uses forward slashes on Windows; compare canonical native paths
    // before excluding the generated entry from cross-machine source receipts.
    .map((file) => path.resolve(file.split('?')[0]))
    .filter(
      (file) => file !== path.resolve(entryFile) && !file.split(path.sep).includes('node_modules'),
    )
    .map((file) => path.relative(repo, file).replaceAll('\\', '/'));
  const identity = await fingerprint(
    [
      ...toolInputs,
      ...sourcePaths,
      ...localInputs,
      ...assetInputs(config.game).map(([source]) => source),
    ],
    config,
  );
  return { project, configFile, engineConfig, config, ...identity };
}

export async function copyRuntimeAssets(config, output) {
  for (const [source, destination] of assetInputs(config.game)) {
    if (source.endsWith('/patrol-characters.svg')) {
      // The H5 SVG already embeds the atlas. Native Image loads its original WebP bytes.
      const svg = await readFile(path.join(repo, source), 'utf8');
      const atlas = svg.match(/xlink:href="data:image\/webp;base64,([A-Za-z0-9+/=]+)"/);
      assert(atlas, 'Original patrol character atlas is missing');
      await writeFile(path.join(output, destination), Buffer.from(atlas[1], 'base64'));
    } else await cp(path.join(repo, source), path.join(output, destination));
  }
}
