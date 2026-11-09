import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const imports = (source) => [
  ...source.matchAll(/\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g),
];
const digest = (value) => createHash('sha256').update(value).digest('hex');
export const baselineDirectory = resolve(root, 'services/runtime-api/rules/frozen/night-v16-v9');

/** Freeze the complete static dependency closure; never overwrite an existing release. */
export async function freezeNightRules(destination = baselineDirectory) {
  const modules = new Map();
  const names = new Set();
  async function visit(path) {
    if (modules.has(path)) return;
    const name = basename(path).replace(/\.ts$/, '.mjs');
    if (names.has(name)) throw Error('Duplicate frozen module name');
    names.add(name);
    const source = await readFile(path, 'utf8');
    const output = path.endsWith('.ts') ? stripTypeScriptTypes(source, { mode: 'strip' }) : source;
    if (/\b(?:import|require)\s*\(/.test(output)) throw Error('Dynamic rule dependency');
    const dependencies = imports(output).map((match) => {
      const specifier = match[1];
      if (!specifier.startsWith('.')) throw Error('External rule dependency');
      const dependency = resolve(dirname(path), specifier);
      if (!dependency.startsWith(root)) throw Error('Rule dependency outside repository');
      return dependency;
    });
    modules.set(path, { name, source, output, dependencies });
    for (const dependency of dependencies) await visit(dependency);
  }
  for (const name of ['night-ranked.mjs', 'night.mjs'])
    await visit(resolve(root, 'services/runtime-api/rules', name));
  // mkdir without recursive prevents replacing a frozen release in place.
  await mkdir(dirname(destination), { recursive: true });
  await mkdir(destination);
  const files = [];
  for (const [path, entry] of modules) {
    let output = entry.output;
    for (const dependency of entry.dependencies) {
      const specifier = relative(dirname(path), dependency).replaceAll('\\', '/');
      const original = specifier.startsWith('.') ? specifier : `./${specifier}`;
      output = output
        .replaceAll(`'${original}'`, `'./${modules.get(dependency).name}'`)
        .replaceAll(`"${original}"`, `"./${modules.get(dependency).name}"`);
    }
    await writeFile(resolve(destination, entry.name), output);
    files.push({
      source: relative(root, path).replaceAll('\\', '/'),
      sourceSha256: digest(entry.source),
      file: entry.name,
      sha256: digest(output),
    });
  }
  const ranked = (await import(pathToFileURL(resolve(destination, 'night-ranked.mjs')).href))
    .default;
  const multiplayer = (await import(pathToFileURL(resolve(destination, 'night.mjs')).href)).default;
  if (ranked.id !== 'night-overwatch' || multiplayer.id !== 'night-overwatch')
    throw Error('Invalid frozen game');
  const manifest = {
    schemaVersion: 1,
    provenance: 'local-baseline-not-certified-live',
    ranked: ranked.version,
    multiplayer: multiplayer.version,
    files,
  };
  await writeFile(resolve(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function verifyNightRules(directory = baselineDirectory) {
  const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
  if (
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.files) ||
    !['night-ranked.mjs', 'night.mjs'].every((name) =>
      manifest.files.some((file) => file?.file === name),
    ) ||
    new Set(manifest.files.map((file) => file?.file)).size !== manifest.files.length
  )
    throw Error('Invalid frozen manifest');
  for (const file of manifest.files) {
    if (
      !file ||
      !/^[\w.-]+\.mjs$/.test(file.file) ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      !/^[a-f0-9]{64}$/.test(file.sourceSha256)
    )
      throw Error('Invalid frozen module');
    const source = await readFile(resolve(directory, file.file), 'utf8');
    if (digest(source) !== file.sha256) throw Error(`Frozen rule changed: ${file.file}`);
    if (/\b(?:import|require)\s*\(/.test(source)) throw Error('Dynamic frozen dependency');
    for (const match of imports(source))
      if (!manifest.files.some((entry) => `./${entry.file}` === match[1]))
        throw Error('Unfrozen dependency');
  }
  for (const [file, kind] of [
    ['night-ranked.mjs', 'ranked'],
    ['night.mjs', 'multiplayer'],
  ]) {
    const rule = (await import(pathToFileURL(resolve(directory, file)).href)).default;
    if (rule.id !== 'night-overwatch' || rule.version !== manifest[kind])
      throw Error('Frozen rule identity mismatch');
  }
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = process.argv.includes('--freeze')
    ? await freezeNightRules()
    : await verifyNightRules();
  console.log(
    `Night local baseline: ${result.ranked} / ${result.multiplayer}; ${result.files.length} frozen modules`,
  );
}
