import assert from 'node:assert/strict';
import { stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const prebuiltVariables = {
  'games/local/carding-car': 'KART_PREBUILT_DIR',
  'games/local/night-overwatch': 'NIGHT_OVERWATCH_PREBUILT_DIR',
};
/** Always verify before consulting Turbo cache, including external prebuilt directories. */
export async function verifyCocosBuildInputs(root, targets, env) {
  for (const pkg of targets.filter((target) => target.creator)) {
    const variable = prebuiltVariables[pkg.dir];
    assert(variable && pkg.creator.version === '3.8.8', `Unsupported Creator input: ${pkg.dir}`);
    try {
      if (env[variable]) {
        const artifact = await import(
          pathToFileURL(path.join(root, pkg.dir, 'scripts/artifact.mjs')).href
        );
        const dist = await artifact.verifyPrebuilt(path.resolve(root, env[variable]));
        for (const file of [
          path.join(dist, 'index.html'),
          path.resolve(root, env[variable], 'cc.d.ts'),
        ])
          assert((await stat(file)).isFile(), `Incomplete Creator artifact: ${file}`);
        console.log(
          `Verified ${pkg.name} prebuilt sources, Creator version, entry and declarations before cache lookup.`,
        );
      } else {
        const { editor } = await import(
          pathToFileURL(path.join(root, 'games/local/carding-car/scripts/toolchain.mjs')).href
        );
        const executable = env.COCOS_CREATOR || editor;
        assert(
          (await stat(executable).catch(() => null))?.isFile(),
          `${pkg.name} requires Creator 3.8.8 or a source-matching ${variable}. No automatic Creator installation.`,
        );
        // Independent snapshots also need the verified SDK's declarations for typecheck.
        const declarations = path.join(
          path.dirname(executable),
          'resources/resources/3d/engine/bin/.declarations/cc.d.ts',
        );
        assert(
          (await stat(declarations).catch(() => null))?.isFile(),
          `${pkg.name}: missing Creator declarations`,
        );
        const reports = path.join(root, pkg.dir, 'reports');
        await mkdir(reports, { recursive: true });
        await writeFile(
          path.join(reports, 'engine.d.ts'),
          `/// <reference path="${declarations.replaceAll('\\', '/')}" />\n`,
        );
      }
    } catch (error) {
      throw new Error(`Required Cocos target ${pkg.dir}: ${error.message}`);
    }
  }
}
