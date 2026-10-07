import { parseArgs } from 'node:util';
import { mkdir, readFile, writeFile, rm, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildTarget, inventory, verifyArtifact } from './nine-games-build.mjs';
import { scopeCommit } from './nine-games-targets.mjs';
import { tapTapGames, tapTapOptions, tapTapToolOptions } from './taptap-targets.mjs';
import { installTapTapLogin, tapTapLoginHelperPath } from './taptap-login.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const hash = (data) => createHash('sha256').update(data).digest('hex');

async function preflightOutput(selected, outputRoot, env) {
  const destination = path.resolve(outputRoot, 'taptap', selected.id);
  let ancestor = destination;
  while (true) {
    const info = await lstat(ancestor).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    if (info?.isSymbolicLink()) throw new Error('TapTap output may not traverse a symlink.');
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  const contains = (directory, filename) => {
    const relative = path.relative(directory, filename);
    return (
      !relative ||
      (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
    );
  };
  const prefix = `MINIGAME_${selected.id}_TAPTAP`.toUpperCase().replaceAll('-', '_');
  const inputs = [
    ['source', path.join(root, selected.directory), true],
    ...['SOURCE_DIR', 'CONVERTED_DIR', 'PLUGIN_DIR'].map((suffix) => [
      suffix,
      env[`${prefix}_${suffix}`],
      true,
    ]),
    ...['SOURCE_INVENTORY', 'PACKAGE_FILE', 'PACKAGE_RECEIPT'].map((suffix) => [
      suffix,
      env[`${prefix}_${suffix}`],
      false,
    ]),
    ['TAPTAP_PACK_TOOL', env.TAPTAP_PACK_TOOL, false],
  ];
  for (const [name, value, directory] of inputs) {
    if (!value) continue;
    const input = path.resolve(value);
    if (contains(destination, input) || (directory && contains(input, destination)))
      throw new Error(
        `TapTap output must be independent of ${name}; inputs are never removed before validation.`,
      );
  }
}

export async function buildTapTap({
  all = false,
  game,
  preview = false,
  outputRoot = path.join(root, 'apps/shell-minigame/dist/nine-games'),
  env = process.env,
} = {}) {
  if ((all && game) || (!all && !tapTapGames.some((item) => item.id === game)))
    throw new Error(
      'Select --all or one frozen --game; the TapTap route never selects another platform.',
    );
  const targets = (all ? tapTapGames : tapTapGames.filter((item) => item.id === game)).map(
    (selected) => ({ selected, config: tapTapOptions(selected.id, { preview, env }) }),
  ); // Preflight every requested AppID/URL before writing an artifact.
  for (const { selected } of targets) await preflightOutput(selected, outputRoot, env);
  const results = [];
  for (const { selected, config } of targets) {
    const destination = path.join(outputRoot, 'taptap', selected.id);
    // The Cocos importer also checks paths discovered in its source receipt before cleanup.
    if (!selected.cocos) await rm(destination, { recursive: true, force: true });
    try {
      let directory, converted;
      if (selected.cocos) {
        const { buildTapTapCocosTarget } = await import('./taptap-cocos.mjs');
        converted = await buildTapTapCocosTarget(selected, config, { env, outputRoot });
        directory = converted.directory;
      } else {
        directory = await buildTarget(selected, config, outputRoot);
        await installTapTapLogin(directory, config);
        // Add the independent route's source identity to the existing package inventory.
        const manifest = JSON.parse(
          await readFile(path.join(directory, 'artifact-manifest.json'), 'utf8'),
        );
        for (const file of [
          ...[
            'taptap-build.mjs',
            'taptap-targets.mjs',
            'taptap-package.mjs',
            'taptap-login.mjs',
          ].map((name) => path.join(root, 'apps/shell-minigame/scripts', name)),
          tapTapLoginHelperPath,
        ]) {
          manifest.sourceFiles.push({
            path: path.relative(root, file).replaceAll('\\', '/'),
            sha256: hash(await readFile(file)),
          });
        }
        manifest.sourceFiles.sort((a, b) => a.path.localeCompare(b.path));
        manifest.files = await inventory(directory);
        await writeFile(
          path.join(directory, 'artifact-manifest.json'),
          JSON.stringify(manifest, null, 2) + '\n',
        );
        await verifyArtifact(directory);
      }
      const { verifyTapProject, verifyOfficialPackage } = await import('./taptap-package.mjs');
      const verifiedProject = await verifyTapProject({
        directory,
        appId: config.appId,
        mode: preview ? 'preview' : 'release',
        orientation: selected.orientation || 'landscape',
      });
      const tools = tapTapToolOptions(selected.id, env);
      let packaged;
      if (tools.packageFile && !selected.cocos) {
        packaged = await verifyOfficialPackage({
          projectDirectory: directory,
          ...tools,
          verifiedProjectInventory: verifiedProject.files,
          currentSourceHash: verifiedProject.sourceInventorySha256,
          appId: config.appId,
          mode: preview ? 'preview' : 'release',
          orientation: selected.orientation,
          game: selected.id,
          apiUrl: config.apiUrl,
        });
      }
      if (tools.receiptFile) {
        await mkdir(path.dirname(path.resolve(tools.receiptFile)), { recursive: true });
        await writeFile(
          path.resolve(tools.receiptFile),
          JSON.stringify(
            {
              game: selected.id,
              sourceHash: verifiedProject.sourceInventorySha256,
              files: verifiedProject.files,
              package: packaged || converted?.manifest?.package || null,
              officialToolVerified: false,
              realDeviceVerified: false,
            },
            null,
            2,
          ) + '\n',
        );
      }
      results.push({
        game: selected.id,
        platform: 'taptap',
        status: 'built-integrity-checked',
        directory: path.relative(root, directory).replaceAll('\\', '/'),
        artifactType: 'TapTap native mini-game source project',
        package: packaged || converted?.manifest?.package || 'pending-official-tool',
        officialTools: 'unrun',
        device: 'unrun',
      });
    } catch (error) {
      if (!selected.cocos) await rm(destination, { recursive: true, force: true });
      results.push({
        game: selected.id,
        platform: 'taptap',
        status: 'blocked',
        reason: error.message,
        officialTools: 'unrun',
        device: 'unrun',
      });
    }
    console.log(
      `${selected.id}/taptap: ${results.at(-1).status}${results.at(-1).reason ? ' — ' + results.at(-1).reason : ''}`,
    );
  }
  await mkdir(outputRoot, { recursive: true });
  await writeFile(
    path.join(outputRoot, 'taptap-build-status.json'),
    JSON.stringify({ scopeCommit, preview, results }, null, 2) + '\n',
  );
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      all: { type: 'boolean' },
      game: { type: 'string' },
      preview: { type: 'boolean' },
      output: { type: 'string' },
    },
  });
  const results = await buildTapTap({
    all: values.all,
    game: values.game,
    preview: values.preview,
    outputRoot: values.output ? path.resolve(values.output) : undefined,
  });
  if (results.some((item) => item.status === 'blocked')) process.exitCode = 1;
}
