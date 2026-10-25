import { cp, mkdir, rm, readFile, readdir, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
import { verifyEngine } from './scripts/cocos-engine-integrity.mjs';
const root = new URL('./', import.meta.url),
  output = new URL('dist/', root);
const provenance = await verifyEngine();
const engine = await readFile(new URL('vendor/cocos/cc.js', root));
if (engine.length < 1_000_000 || !provenance)
  throw new Error('Pinned Cocos engine missing. Run build:engine.');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'style.css', 'bootstrap.mjs', 'dev-mode.js'])
  await cp(new URL(name, root), new URL(name, output));
await cp(new URL('vendor/', root), new URL('vendor/', output), { recursive: true });
await cp(new URL('assets/resources/art/', root), new URL('art/', output), { recursive: true });
const hashes = [];
async function compile(path = '') {
  const input = new URL('assets/scripts/' + path, root),
    destination = new URL('game/' + path, output);
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(input, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      await compile(path + entry.name + '/');
      continue;
    }
    if (!entry.name.endsWith('.ts') || entry.name === 'Entry.ts') continue;
    const source = await readFile(new URL(entry.name, input), 'utf8');
    const code = stripTypeScriptTypes(source, { mode: 'strip' })
      .replace(/(from\s+['"][^'"]+)\.ts(['"])/g, '$1.js$2')
      .replace(
        /from\s+['"]cc['"]/g,
        `from '${'../'.repeat(path.split('/').length)}vendor/cocos/cc.js'`,
      );
    await writeFile(new URL(entry.name.replace(/\.ts$/, '.js'), destination), code);
    hashes.push([path + entry.name, createHash('sha256').update(source).digest('hex')]);
  }
}
await compile();
const runtimeFiles = [];
async function inventory(path = '') {
  for (const entry of await readdir(new URL(path, output), { withFileTypes: true })) {
    if (entry.isDirectory()) await inventory(path + entry.name + '/');
    else {
      const data = await readFile(new URL(path + entry.name, output));
      runtimeFiles.push({
        path: path + entry.name,
        bytes: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
      });
    }
  }
}
await inventory();
runtimeFiles.sort((a, b) => a.path.localeCompare(b.path));
const artifactSha256 = createHash('sha256').update(JSON.stringify(runtimeFiles)).digest('hex');
await writeFile(
  new URL('build-info.json', output),
  JSON.stringify(
    {
      game: 'chase-thief',
      engine: 'Cocos Engine 3.8.8',
      kind: 'official-engine-source-web',
      creatorEditorBuild: false,
      sourceCommit: provenance.sourceCommit,
      engineSha256: createHash('sha256').update(engine).digest('hex'),
      sources: hashes,
      artifactSha256,
      runtimeFiles,
    },
    null,
    2,
  ),
);
console.log('小贼哪里跑：真实 Cocos 3D Web 制品已生成至 dist/（非 Creator 编辑器导出）。');
