import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile, realpath, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { root, ordinaryDirectory, compilerEnvironment } from './h5-taptap-build.mjs';
import {
  inventory,
  zipInventory,
  digest,
  localPath,
} from '../apps/shell-minigame/scripts/taptap-package.mjs';

async function compileNative(config, options) {
  const { buildGame } = await import('../games/minigames/scripts/build.mjs');
  return buildGame(config, options);
}

async function checkNativeWritePaths(workspace, game) {
  const project = path.join(workspace, 'games/minigames', game);
  for (const name of ['assets', 'reports', 'build', 'library', 'temp', 'settings', 'profiles']) {
    const directory = path.join(project, name);
    await ordinaryDirectory(workspace, directory);
    const pending = [directory];
    while (pending.length) {
      const parent = pending.pop();
      for (const entry of await readdir(parent, { withFileTypes: true })) {
        assert(!entry.isSymbolicLink(), 'Native writable path cannot be a link');
        if (entry.isDirectory()) pending.push(path.join(parent, entry.name));
      }
    }
  }
}

export async function buildNativePackages(
  { jobs, output },
  { workspace = root, compile = compileNative } = {},
) {
  workspace = await realpath(workspace);
  const directory = path.resolve(workspace, output);
  const relative = path.relative(path.join(workspace, 'outputs'), directory);
  assert(
    relative && !path.isAbsolute(relative) && !relative.startsWith('..'),
    'Native output must be under outputs',
  );
  await ordinaryDirectory(workspace, path.dirname(directory));
  await mkdir(directory);
  let sourceDirty = 'unknown';
  try {
    sourceDirty = Boolean(
      execFileSync('git', ['status', '--porcelain', '--ignore-submodules=none'], {
        cwd: workspace,
        env: compilerEnvironment(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
    );
  } catch {
    /* An exported source directory has no Git metadata. */
  }
  const variants = [];
  for (const job of jobs) {
    const { game, platform, release, ads, backend, delivery, config } = job;
    const name = `${game}-${platform}-minigame-${release ? 'release' : 'preview'}-ads-${ads ? 'on' : 'off'}-service-${backend ? 'on' : 'off'}`;
    // Creator removes scratch outputs; reject redirected writes before invoking it.
    await checkNativeWritePaths(workspace, game);
    const built = await compile(config, { prepareSource: platform === 'kuaishou' });
    assert.deepEqual(built.config, config, 'Native build configuration mismatch');
    const source = await localPath(built.directory);
    const projectRoot = path.join(workspace, 'games/minigames', game, 'build') + path.sep;
    assert(source.startsWith(projectRoot), 'Native artifact escaped its game build directory');
    const files = await inventory(source);
    assert.deepEqual(files, built.files, 'Native artifact inventory mismatch');
    const receipt = JSON.parse(await readFile(built.receiptPath, 'utf8'));
    assert.deepEqual(receipt.config, config, 'Native receipt configuration mismatch');
    assert.deepEqual(receipt.files, files, 'Native receipt inventory mismatch');
    let zip, bytes, sha256;
    if (platform === 'taptap') {
      const archive = await readFile(path.join(path.dirname(source), 'game.zip'));
      assert.equal(
        digest(archive),
        receipt.conversion?.packageSha256,
        'Official TapTap ZIP hash mismatch',
      );
      const zipped = zipInventory(archive);
      assert.deepEqual(zipped, files, 'Official TapTap ZIP inventory mismatch');
      for (const entry of ['game.js', 'game.json', 'project.config.json'])
        assert(
          zipped.some((file) => file.path === entry),
          `TapTap ZIP requires root ${entry}`,
        );
      zip = name + '.zip';
      // Keep the official converter's exact archive, including its root entry layout.
      await writeFile(path.join(directory, zip), archive, { flag: 'wx' });
      bytes = archive.length;
      sha256 = digest(archive);
    }
    await cp(source, path.join(directory, name), {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
    assert.deepEqual(
      await inventory(path.join(directory, name)),
      files,
      'Copied native project differs',
    );
    await writeFile(
      path.join(directory, name + '.receipt.json'),
      JSON.stringify(receipt, null, 2) + '\n',
      { flag: 'wx' },
    );
    const manifest = {
      name,
      game,
      platform,
      packageType: 'minigame',
      release,
      appId: config.appId,
      adsEnabled: ads,
      serviceEnabled: backend,
      apiUrl: config.apiUrl,
      orientation: config.orientation,
      delivery,
      project: name,
      zip: zip ?? null,
      uploadFile: delivery === 'upload-zip' ? zip : null,
      bytes,
      sha256,
      sourceSHA: receipt.gitSha,
      sourceHash: receipt.sourceHash,
      sourceDirty,
      status: receipt.status,
      receipt: name + '.receipt.json',
      buildOnly: true,
      qualityChecks: 'not-run',
      platformAcceptance: 'not-run',
      realDeviceVerified: false,
    };
    await writeFile(
      path.join(directory, name + '.json'),
      JSON.stringify(manifest, null, 2) + '\n',
      { flag: 'wx' },
    );
    variants.push(manifest);
    console.log(`GAME_BUILD_ARTIFACT ${delivery} ${path.join(directory, zip ?? name)}`);
  }
  await writeFile(
    path.join(directory, 'matrix.json'),
    JSON.stringify({ variants }, null, 2) + '\n',
    { flag: 'wx' },
  );
  return { output: directory, variants };
}
