import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareNativeProject, adaptationRecipeSha256 } from './night-native-project.mjs';
const repository = fileURLToPath(new URL('../../../', import.meta.url));
// Real canonical inputs, pinned by the native guard recipe; no Creator output is fabricated.
async function fixture() {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'night-project-verification-'));
  const gameRoot = path.join(temp, 'games/local/night-overwatch');
  await mkdir(gameRoot, { recursive: true });
  for (const folder of ['assets', 'scripts', 'settings', 'startup'])
    await cp(
      path.join(repository, 'games/local/night-overwatch', folder),
      path.join(gameRoot, folder),
      { recursive: true },
    );
  for (const file of ['package.json', 'tsconfig.json'])
    await cp(path.join(repository, 'games/local/night-overwatch', file), path.join(gameRoot, file));
  const cardScripts = path.join(temp, 'games/local/carding-car/scripts');
  await mkdir(cardScripts, { recursive: true });
  for (const file of ['toolchain.mjs', 'native-targets.mjs', 'clear-output.mjs'])
    await cp(
      path.join(repository, 'games/local/carding-car/scripts', file),
      path.join(cardScripts, file),
    );
  const artifact = await import(pathToFileURL(path.join(gameRoot, 'scripts/artifact.mjs')));
  return { temp, gameRoot, artifact, stageBase: path.join(temp, '.scratch/nine-native-cocos') };
}
async function runFixture(fn) {
  const f = await fixture();
  try {
    await fn(f);
  } finally {
    await rm(f.temp, { recursive: true, force: true });
  }
}
test('actual native guards preserve canonical source and independently compute the two fingerprints', () =>
  runFixture(async ({ gameRoot, artifact, stageBase }) => {
    const hud = await readFile(path.join(gameRoot, 'assets/scripts/HUD.ts'));
    const platform = await readFile(path.join(gameRoot, 'assets/scripts/Platform.ts'));
    assert.equal(
      await artifact.sourceHash(gameRoot),
      'd1fe27c4d4816adf0ca4d526158e3e92d79bc99c5ee2ac531d9f3c359a4dbdb3',
    );
    const result = await prepareNativeProject(gameRoot, { stageBase });
    assert.equal(result.canonicalSourceHash, await artifact.sourceHash(gameRoot));
    assert.equal(result.sourceHash, await artifact.sourceHash(result.projectRoot));
    assert.equal(
      result.sourceHash,
      '96de5c1d05a01de48631041faffcec6901e335af8bb6ccec806ce69e09a3e63d',
    );
    assert.equal(result.adaptationRecipeSha256, adaptationRecipeSha256);
    assert.equal(result.adaptation.creatorBuildVerified, false);
    assert.deepEqual(await readFile(path.join(gameRoot, 'assets/scripts/HUD.ts')), hud);
    assert.deepEqual(await readFile(path.join(gameRoot, 'assets/scripts/Platform.ts')), platform);
    assert.match(
      await readFile(path.join(result.projectRoot, 'assets/scripts/HUD.ts'), 'utf8'),
      /if \(sys.isBrowser\) this.button\('fullscreen'/,
    );
    assert.match(
      await readFile(path.join(result.projectRoot, 'assets/scripts/Platform.ts'), 'utf8'),
      /return sys.isBrowser && screen.fullScreen\(\)/,
    );
    assert.match(
      await readFile(path.join(result.projectRoot, 'assets/scripts/Platform.ts'), 'utf8'),
      /if \(!sys.isBrowser\) return false/,
    );
    assert.equal(result.adaptation.inputs.length, 2);
    for (const file of ['build-native.mjs', 'artifact.mjs'])
      assert.deepEqual(
        await readFile(path.join(result.projectRoot, 'scripts', file)),
        await readFile(path.join(gameRoot, 'scripts', file)),
      );
  }));
test('fresh persistent stages exclude caches, release secrets, and old outputs', () =>
  runFixture(async ({ gameRoot, stageBase }) => {
    await writeFile(
      path.join(gameRoot, 'release-config.local.json'),
      '{"secret":"synthetic-never-copy"}',
    );
    for (const folder of ['build', 'dist', 'library', 'temp']) {
      await mkdir(path.join(gameRoot, folder));
      await writeFile(path.join(gameRoot, folder, 'old-output'), 'synthetic');
    }
    const first = await prepareNativeProject(gameRoot, { stageBase });
    const second = await prepareNativeProject(gameRoot, { stageBase });
    assert.notEqual(first.projectRoot, second.projectRoot);
    assert.deepEqual((await readdir(first.projectRoot)).sort(), [
      'assets',
      'package.json',
      'scripts',
      'settings',
      'startup',
      'tsconfig.json',
    ]);
    const stagedArtifact = await import(
      pathToFileURL(path.join(first.projectRoot, 'scripts/artifact.mjs'))
    );
    assert.equal(await stagedArtifact.sourceHash(), first.sourceHash);
  }));
test('unreviewed or already adapted canonical files fail closed before staging', () =>
  runFixture(async ({ gameRoot, stageBase }) => {
    const hudPath = path.join(gameRoot, 'assets/scripts/HUD.ts');
    const original = await readFile(hudPath, 'utf8');
    for (const candidate of [
      original + '\n',
      original.replace("this.button('fullscreen'", "if (sys.isBrowser) this.button('fullscreen'"),
    ]) {
      await writeFile(hudPath, candidate);
      await assert.rejects(
        prepareNativeProject(gameRoot, { stageBase }),
        /Unreviewed canonical Night source/,
      );
    }
  }));
test('normalized CRLF input has an honest raw receipt and unchanged source hash', () =>
  runFixture(async ({ gameRoot, stageBase }) => {
    for (const file of ['HUD.ts', 'Platform.ts']) {
      const name = path.join(gameRoot, 'assets/scripts', file);
      await writeFile(
        name,
        (await readFile(name, 'utf8')).replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'),
      );
    }
    const result = await prepareNativeProject(gameRoot, { stageBase });
    assert.equal(
      result.canonicalSourceHash,
      'd1fe27c4d4816adf0ca4d526158e3e92d79bc99c5ee2ac531d9f3c359a4dbdb3',
    );
    assert.notEqual(
      result.adaptation.inputs[0].canonicalSha256,
      result.adaptation.inputs[0].normalizedCanonicalSha256,
    );
  }));
test('all legitimate hash inputs are copied and mutations produce their real native hash', () =>
  runFixture(async ({ gameRoot, artifact, stageBase }) => {
    await writeFile(path.join(gameRoot, 'startup/fixture.txt'), 'synthetic hash input');
    const result = await prepareNativeProject(gameRoot, { stageBase });
    assert.equal(
      await readFile(path.join(result.projectRoot, 'startup/fixture.txt'), 'utf8'),
      'synthetic hash input',
    );
    assert.equal(result.sourceHash, await artifact.sourceHash(result.projectRoot));
    assert.notEqual(
      result.sourceHash,
      '96de5c1d05a01de48631041faffcec6901e335af8bb6ccec806ce69e09a3e63d',
    );
  }));
test('existing extension is copied with digest evidence but no authenticity claim', () =>
  runFixture(async ({ gameRoot, stageBase }) => {
    const extension = path.join(gameRoot, 'extensions/biligame-builder');
    await mkdir(extension, { recursive: true });
    await writeFile(path.join(extension, 'package.json'), '{"version":"1.0.3","fixture":true}');
    const result = await prepareNativeProject(gameRoot, { stageBase });
    assert.equal(result.adaptation.extension.authenticityVerified, false);
    assert.equal(result.adaptation.extension.source, extension);
    assert.match(result.adaptation.extension.inventorySha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(
      await readFile(path.join(result.projectRoot, 'extensions/biligame-builder/package.json')),
      await readFile(path.join(extension, 'package.json')),
    );
  }));
test('non-Night projects return their actual fingerprint without staging or adaptation', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'other-project-verification-'));
  try {
    await mkdir(path.join(temp, 'scripts'));
    await writeFile(
      path.join(temp, 'scripts/artifact.mjs'),
      "import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';import path from'node:path';export async function sourceHash(root){return createHash('sha256').update(await readFile(path.join(root,'input'))).digest('hex');}",
    );
    await writeFile(path.join(temp, 'input'), 'synthetic-other-project');
    const result = await prepareNativeProject(temp);
    const artifact = await import(pathToFileURL(path.join(temp, 'scripts/artifact.mjs')));
    assert.deepEqual(result, {
      projectRoot: temp,
      sourceHash: await artifact.sourceHash(temp),
      canonicalSourceHash: await artifact.sourceHash(temp),
    });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
