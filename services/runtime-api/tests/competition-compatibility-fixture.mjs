import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const pinnedCommit = '26756c80cfa4ddf9bda16269265e353fddeaeeaf';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const destination = path.join(root, '.scratch/identity-compat', pinnedCommit);
const require = createRequire(new URL('../package.json', import.meta.url));
const digest = (value) => createHash('sha256').update(value).digest('hex');

/** Exact old sources, transformed only to load TS with this checkout's already installed deps. */
export async function pinnedRuntime() {
  const files = new Map(),
    bindings = new Map();
  async function extract(relative) {
    if (files.has(relative)) return;
    const bytes = execFileSync(
      'git',
      ['-c', 'core.fsmonitor=false', 'show', `${pinnedCommit}:${relative}`],
      {
        cwd: root,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
      },
    );
    files.set(relative, { sourceSha256: digest(bytes) });
    const output = path.join(destination, relative);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, bytes);
    if (!relative.endsWith('.ts')) return;
    let compiled = stripTypeScriptTypes(bytes.toString('utf8'), { mode: 'transform' });
    const dependencies = [...compiled.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)];
    for (const [, specifier] of dependencies) {
      if (specifier.startsWith('node:')) continue;
      if (specifier.startsWith('.')) {
        const target = path.posix.normalize(
          path.posix.join(path.posix.dirname(relative), specifier),
        );
        await extract(target.replace(/\.js$/, '.ts'));
      } else {
        const resolved = require.resolve(specifier);
        bindings.set(specifier, { resolved, entrySha256: digest(await readFile(resolved)) });
        compiled = compiled
          .replaceAll(`'${specifier}'`, `'${pathToFileURL(resolved).href}'`)
          .replaceAll(`"${specifier}"`, `"${pathToFileURL(resolved).href}"`);
      }
    }
    files.get(relative).loadedSha256 = digest(compiled);
    await writeFile(output.replace(/\.ts$/, '.js'), compiled);
  }
  const base = 'services/runtime-api/src/competition/';
  await extract(`${base}routes.ts`);
  await extract(`${base}store.ts`);
  await extract('platforms/competition/client.js');
  const manifest = {
    commit: pinnedCommit,
    node: process.version,
    execution:
      'Fixed old Runtime source; current installed runtime dependencies. No old app bootstrap/build claimed.',
    files: Object.fromEntries(files),
    dependencies: Object.fromEntries(bindings),
    runtimePackage: JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
      .dependencies,
  };
  await writeFile(path.join(destination, 'package.json'), '{"type":"module"}\n');
  await writeFile(
    path.join(destination, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return {
    manifest,
    client: await readFile(path.join(destination, 'platforms/competition/client.js'), 'utf8'),
    routes: await import(pathToFileURL(path.join(destination, `${base}routes.js`)).href),
    store: await import(pathToFileURL(path.join(destination, `${base}store.js`)).href),
  };
}
