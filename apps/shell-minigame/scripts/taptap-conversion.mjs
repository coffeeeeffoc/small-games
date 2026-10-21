import { copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inventory, digest, zipEntries, localPath } from './taptap-package.mjs';
import { installTapTapLogin, publicTapTapLoginConfig } from './taptap-login.mjs';

export const officialPluginSha256 =
  '6b8a9a3cc62b6c54cefab397097babb771d9d99f90442cddff06310a4c9ed73f';
const options = Object.freeze({ gameVersion: '0.1.0', useSubpackage: false });
const proofs = new WeakMap();
const inventoryHash = (files) => digest(JSON.stringify(files));
const withoutData = ({ path: file, bytes, sha256 }) => ({ path: file, bytes, sha256 });
const equalInventory = (actual, expected, message) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error(message);
};

// This capability is never reconstructed from a JSON receipt. It only follows
// a successful replay and exact final inventory check in this process.
export function acceptsOfficialConversionProof(proof, files) {
  return Boolean(proof && typeof proof === 'object' && proofs.get(proof) === inventoryHash(files));
}

async function exists(file) {
  try {
    return await lstat(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function overlaps(a, b) {
  const inside = (root, candidate) => {
    const relative = path.relative(root, candidate);
    return (
      !relative ||
      (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
    );
  };
  return inside(a, b) || inside(b, a);
}

async function outputPaths(output, inputs) {
  if (typeof output !== 'string' || !path.isAbsolute(output))
    throw Error('Official conversion output must be an absolute path.');
  const directory = path.resolve(output);
  const packageFile = path.join(path.dirname(directory), 'game.zip');
  for (const input of inputs) {
    if (overlaps(directory, input) || overlaps(packageFile, input))
      throw Error('Official conversion output overlaps an input.');
  }
  let ancestor = directory;
  while (!(await exists(ancestor))) ancestor = path.dirname(ancestor);
  await localPath(ancestor);
  const info = await exists(directory);
  if (info) throw Error('Official conversion output must be a new directory.');
  if (await exists(packageFile)) throw Error('Official game.zip output already exists.');
  return { directory, packageFile, existed: Boolean(info) };
}

async function copyInventory(source, destination, files) {
  await mkdir(destination, { recursive: true });
  for (const file of files) {
    const target = path.join(destination, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(source, file.path), target, constants.COPYFILE_EXCL);
  }
  equalInventory(await inventory(destination), files, 'Copied official input changed.');
}

function child(command, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '',
      overflow = false;
    const timer = setTimeout(() => process.kill(), 180_000);
    const append = (chunk) => {
      output += chunk.toString();
      if (Buffer.byteLength(output) > 8 * 1024 * 1024) {
        overflow = true;
        process.kill();
      }
    };
    process.stdout.on('data', append);
    process.stderr.on('data', append);
    process.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    process.once('close', (code, signal) => {
      clearTimeout(timer);
      if (overflow || signal || code !== 0)
        reject(
          Error(`Official converter process failed (${code ?? signal}): ${output.slice(-4000)}`),
        );
      else resolve(output);
    });
  });
}

function isolatedEnvironment(scratch, browserslist) {
  const env = {};
  for (const key of ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'WINDIR'])
    if (process.env[key] !== undefined) env[key] = process.env[key];
  return {
    ...env,
    TMPDIR: scratch,
    TMP: scratch,
    TEMP: scratch,
    BABEL_ENV: 'development',
    BROWSERSLIST_ENV: 'production',
    BROWSERSLIST_CONFIG: browserslist,
    BROWSERSLIST_IGNORE_OLD_DATA: 'true',
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONUTF8: '1',
    LANG: 'C.UTF-8',
  };
}

/** Replays the pinned official converter, then applies only our exact public
 * configuration/bootstrap step. A receipt is audit data, never a bypass. */
export async function replayOfficialConversion({
  sourceDirectory,
  pluginArchive,
  config,
  expectedRawDirectory,
  expectedFinalDirectory,
  outputDirectory,
}) {
  const source = await localPath(sourceDirectory);
  const archive = await localPath(pluginArchive, 'file');
  const expectedRaw = expectedRawDirectory ? await localPath(expectedRawDirectory) : null;
  const expectedFinal = expectedFinalDirectory ? await localPath(expectedFinalDirectory) : null;
  const planned = outputDirectory
    ? await outputPaths(
        outputDirectory,
        [source, archive, expectedRaw, expectedFinal].filter(Boolean),
      )
    : null;
  const archiveBytes = await readFile(archive);
  if (digest(archiveBytes) !== officialPluginSha256)
    throw Error('Official TapTap plugin archive SHA-256 mismatch.');
  const sourceFiles = await inventory(source);
  if (!sourceFiles.length || (await exists(path.join(source, '@babel'))))
    throw Error('Official conversion requires an unconverted Creator source without @babel.');
  const game = JSON.parse(await readFile(path.join(source, 'game.json'), 'utf8'));
  if (
    game.plugins != null &&
    (typeof game.plugins !== 'object' || Object.keys(game.plugins).length)
  )
    throw Error('Official replay does not permit unbound Creator plugins.');
  const publicConfig = config === undefined ? null : publicTapTapLoginConfig(config);
  const entries = zipEntries(archiveBytes, { maxBytes: 128 * 1024 * 1024 });
  const rootPrefix = 'taptap-minigame-tools/';
  if (!entries.length || entries.some((entry) => !entry.path.startsWith(rootPrefix)))
    throw Error('Unexpected fixed official plugin archive layout.');
  const pluginFiles = entries
    .map((entry) => ({
      ...withoutData(entry),
      path: entry.path.slice(rootPrefix.length),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  for (const required of [
    'dist/converter-ts.js',
    'converter/wx_converter.py',
    'converter/.babelrc',
    'converter/node_modules/@babel/core/package.json',
    'converter/node_modules/@babel/preset-env/package.json',
    'node_modules/fs-extra/package.json',
    'node_modules/archiver/package.json',
  ])
    if (!pluginFiles.some((file) => file.path === required))
      throw Error(`Fixed official plugin dependency is missing: ${required}`);

  const scratch = await mkdtemp(path.join(tmpdir(), 'taptap-official-replay-'));
  let outputCreated = false,
    packageCreated = false;
  try {
    const plugin = path.join(scratch, 'taptap-minigame-tools');
    for (const entry of entries) {
      const target = path.join(scratch, entry.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, entry.data, { flag: 'wx' });
    }
    equalInventory(await inventory(plugin), pluginFiles, 'Fixed plugin extraction mismatch.');
    const copiedSource = path.join(scratch, 'source');
    await copyInventory(source, copiedSource, sourceFiles);
    const browserslist = path.join(scratch, 'browserslist');
    await writeFile(browserslist, '');
    await writeFile(path.join(scratch, 'package.json'), '{"private":true}\n');
    const env = isolatedEnvironment(scratch, browserslist);
    const converted = path.join(scratch, 'converted');
    const invocation = path.join(scratch, 'convert.cjs');
    await writeFile(
      invocation,
      `const {convertWechatToTap}=require(process.argv[2]);\n` +
        `convertWechatToTap(JSON.parse(process.argv[3])).catch(error=>{console.error(error);process.exitCode=1;});\n`,
    );
    const log = await child(
      process.execPath,
      [
        invocation,
        path.join(plugin, 'dist/converter-ts.js'),
        JSON.stringify({ source: copiedSource, target: converted, ...options }),
      ],
      scratch,
      env,
    );
    if (
      /\[Babel\]\s*转换失败:/.test(log) ||
      !/Babel转换完成: 成功 \d+, 跳过 \d+, 失败 0(?:\s|$)/.test(log)
    )
      throw Error('Official Babel conversion did not complete with zero failures.');
    const raw = path.join(converted, 'game');
    const rawFiles = await inventory(raw);
    equalInventory(
      zipEntries(await readFile(path.join(converted, 'game.zip'))).map(withoutData),
      rawFiles,
      'Official raw ZIP differs from the converted directory.',
    );
    if (expectedRaw)
      equalInventory(
        await inventory(expectedRaw),
        rawFiles,
        'Supplied raw TapTap conversion differs from the pinned official replay.',
      );
    let finalDirectory = raw;
    let finalPackage = path.join(converted, 'game.zip');
    if (publicConfig) {
      finalDirectory = path.join(scratch, 'configured', 'game');
      await copyInventory(raw, finalDirectory, rawFiles);
      for (const [file, key] of [
        ['game.json', 'appId'],
        ['project.config.json', 'appid'],
      ]) {
        const original = JSON.parse(await readFile(path.join(finalDirectory, file), 'utf8'));
        await writeFile(
          path.join(finalDirectory, file),
          JSON.stringify({ ...original, [key]: publicConfig.appId }, null, 2) + '\n',
        );
      }
      await installTapTapLogin(finalDirectory, config);
      if (planned) {
        const beforePacking = await inventory(finalDirectory);
        const python = process.platform === 'win32' ? 'python' : 'python3';
        await child(
          python,
          [
            '-I',
            '-c',
            'import json,runpy,sys;from pathlib import Path;stage=Path(sys.argv[2]);' +
              'runpy.run_path(sys.argv[1])["pack_game"](stage,json.loads((stage/"game.json").read_text(encoding="utf-8")),False)',
            path.join(plugin, 'converter/wx_converter.py'),
            finalDirectory,
          ],
          scratch,
          env,
        );
        equalInventory(
          await inventory(finalDirectory),
          beforePacking,
          'Official packing changed the stage.',
        );
        finalPackage = path.join(path.dirname(finalDirectory), 'game.zip');
        equalInventory(
          zipEntries(await readFile(finalPackage)).map(withoutData),
          beforePacking,
          'Official configured ZIP differs from the configured directory.',
        );
      }
    }
    const files = publicConfig ? await inventory(finalDirectory) : rawFiles;
    if (expectedFinal)
      equalInventory(
        await inventory(expectedFinal),
        files,
        'Supplied final TapTap stage differs from the pinned official replay and current bootstrap.',
      );
    equalInventory(
      await inventory(source),
      sourceFiles,
      'Creator source changed during official replay.',
    );
    equalInventory(
      await inventory(copiedSource),
      sourceFiles,
      'Official converter changed its source.',
    );
    equalInventory(await inventory(plugin), pluginFiles, 'Official plugin changed during replay.');
    if (digest(await readFile(archive)) !== officialPluginSha256)
      throw Error('Fixed official plugin archive changed during replay.');
    const receipt = {
      schemaVersion: 1,
      pluginSha256: officialPluginSha256,
      sourceInventorySha256: inventoryHash(sourceFiles),
      rawInventorySha256: inventoryHash(rawFiles),
      configuredInventorySha256: inventoryHash(files),
      options: { ...options },
    };
    const proof = publicConfig ? Object.freeze({}) : null;
    if (proof) proofs.set(proof, inventoryHash(files));
    if (planned) {
      await outputPaths(
        planned.directory,
        [source, archive, expectedRaw, expectedFinal].filter(Boolean),
      );
      await mkdir(path.dirname(planned.directory), { recursive: true });
      await localPath(path.dirname(planned.directory));
      await mkdir(planned.directory);
      outputCreated = true;
      await copyInventory(finalDirectory, planned.directory, files);
      await copyFile(finalPackage, planned.packageFile, constants.COPYFILE_EXCL);
      packageCreated = true;
      equalInventory(
        zipEntries(await readFile(planned.packageFile)).map(withoutData),
        files,
        'Published official ZIP differs from its game directory.',
      );
    }
    return {
      sourceFiles,
      rawFiles,
      files,
      pluginFiles,
      receipt,
      proof,
      ...(planned ? { directory: planned.directory, packageFile: planned.packageFile } : {}),
    };
  } catch (error) {
    if (packageCreated) await rm(planned.packageFile, { force: true });
    if (outputCreated) {
      await rm(planned.directory, { recursive: true, force: true });
    }
    throw error;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
