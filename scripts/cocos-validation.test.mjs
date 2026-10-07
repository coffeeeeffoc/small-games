import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyCocosBuildInputs, cocosPreflightTargets } from './cocos-validation.mjs';
test('unrelated ordinary game needs no Creator; required Cocos inputs are checked before cache reuse', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cocos-input-'));
  const pkg = { dir: 'games/local/carding-car', name: 'kart', creator: { version: '3.8.8' } };
  try {
    await verifyCocosBuildInputs(root, [{ dir: 'games/local/a', scripts: { build: 'vite' } }], {});
    const scripts = path.join(root, pkg.dir, 'scripts');
    await mkdir(scripts, { recursive: true });
    await writeFile(
      path.join(scripts, 'toolchain.mjs'),
      `export const editor=${JSON.stringify(path.join(root, 'no-Creator'))};`,
    );
    await assert.rejects(
      verifyCocosBuildInputs(root, [pkg], {}),
      /Required Cocos target.*requires Creator/,
    );
    const editor = path.join(root, 'Creator', 'CocosCreator.exe');
    await mkdir(path.dirname(editor), { recursive: true });
    await writeFile(editor, 'fixture');
    await assert.rejects(
      verifyCocosBuildInputs(root, [pkg], { COCOS_CREATOR: editor }),
      /missing Creator declarations/,
    );
    const declarations = path.join(
      path.dirname(editor),
      'resources/resources/3d/engine/bin/.declarations/cc.d.ts',
    );
    await mkdir(path.dirname(declarations), { recursive: true });
    await writeFile(declarations, 'engine types');
    await verifyCocosBuildInputs(root, [pkg], { COCOS_CREATOR: editor });
    assert(
      (await readFile(path.join(root, pkg.dir, 'reports/engine.d.ts'), 'utf8')).includes(
        declarations.replaceAll('\\', '/'),
      ),
    );
    await writeFile(
      path.join(scripts, 'artifact.mjs'),
      `import {readFile} from 'node:fs/promises';import path from 'node:path';export async function verifyPrebuilt(dir){if(await readFile(path.join(dir,'hash'),'utf8')!=='source-match')throw new Error('source mismatch');return path.join(dir,'dist');}`,
    );
    const artifact = path.join(root, 'external-artifact');
    await mkdir(path.join(artifact, 'dist'), { recursive: true });
    await writeFile(path.join(artifact, 'hash'), 'wrong');
    const env = { KART_PREBUILT_DIR: artifact };
    await assert.rejects(verifyCocosBuildInputs(root, [pkg], env), /source mismatch/);
    await writeFile(path.join(artifact, 'hash'), 'source-match');
    await assert.rejects(verifyCocosBuildInputs(root, [pkg], env), /index.html/);
    await writeFile(path.join(artifact, 'dist/index.html'), 'entry');
    await assert.rejects(verifyCocosBuildInputs(root, [pkg], env), /cc.d.ts/);
    await writeFile(path.join(artifact, 'cc.d.ts'), 'engine types');
    await rm(path.join(root, pkg.dir, 'reports/engine.d.ts'));
    await verifyCocosBuildInputs(root, [pkg], env);
    assert(
      (await readFile(path.join(root, pkg.dir, 'reports/engine.d.ts'), 'utf8')).includes(
        path.join(artifact, 'cc.d.ts').replaceAll('\\', '/'),
      ),
    );
    await writeFile(path.join(artifact, 'hash'), 'changed-under-the-same-directory');
    await assert.rejects(verifyCocosBuildInputs(root, [pkg], env), /source mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Creator preflight follows only actual builds, type consumers and source-matching native targets', () => {
  const kart = {
    dir: 'games/local/carding-car',
    name: 'kart',
    creator: { version: '3.8.8' },
    scripts: { typecheck: 'node scripts/typecheck.mjs' },
  };
  const night = {
    dir: 'games/local/night-overwatch',
    name: 'night',
    creator: { version: '3.8.8' },
  };
  const unrelated = {
    dir: 'games/local/unrelated-cocos',
    name: 'unrelated',
    creator: { version: '3.8.8' },
    scripts: { typecheck: 'tsc' },
  };
  const ordinary = { dir: 'games/local/ordinary', name: 'ordinary', scripts: { typecheck: 'tsc' } };
  const packages = [kart, night, unrelated, ordinary];
  const select = (changes = {}) =>
    cocosPreflightTargets({
      packages,
      buildTargets: [],
      affected: [ordinary, kart],
      nativeTargets: [{ game: 'night-overwatch', source: night.dir, requiresCreator: '3.8.8' }],
      ...changes,
    });
  assert.deepEqual(select(), [kart, night]);
  assert.deepEqual(select({ buildTargets: [ordinary, night], nativeTargets: [] }), [kart, night]);
  assert.deepEqual(select({ affected: [ordinary], nativeTargets: [] }), []);
  assert.deepEqual(select({ affected: [night], nativeTargets: [] }), []);
  for (const nativeTargets of [
    [{ game: 'missing', source: 'games/local/missing', requiresCreator: '3.8.8' }],
    [{ game: 'ordinary', source: ordinary.dir, requiresCreator: '3.8.8' }],
    [{ game: 'night-overwatch', source: night.dir, requiresCreator: '3.8.9' }],
  ])
    assert.throws(() => select({ nativeTargets }), /Unresolved native Creator/);
});
