import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPrebuilt } from '../scripts/artifact.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
await verifyPrebuilt(root);
const referencePath = path.join(root, 'reports/engine.d.ts');
const priorReference = await readFile(referencePath).catch((error) => {
  if (error.code !== 'ENOENT') throw error;
  return undefined;
});
const fixture = await mkdtemp(path.join(root, 'reports/prebuilt-'));
assert.ok(path.resolve(fixture).startsWith(path.resolve(root, 'reports') + path.sep));
try {
  await cp(path.join(root, 'dist'), path.join(fixture, 'dist'), { recursive: true });
  await cp(path.join(root, 'cc.d.ts'), path.join(fixture, 'cc.d.ts'));
  await verifyPrebuilt(fixture);
  const htmlPath = path.join(fixture, 'dist/index.html'),
    html = await readFile(htmlPath);
  await writeFile(htmlPath, 'tampered');
  await assert.rejects(verifyPrebuilt(fixture), /integrity/);
  await writeFile(htmlPath, html);
  const extra = path.join(fixture, 'dist/unlisted.js');
  await writeFile(extra, 'unexpected');
  await assert.rejects(verifyPrebuilt(fixture), /Incomplete/);
  await rm(extra);
  const declarations = await readFile(path.join(fixture, 'cc.d.ts'));
  await writeFile(path.join(fixture, 'cc.d.ts'), 'forged');
  await assert.rejects(verifyPrebuilt(fixture), /declarations/);
  await writeFile(path.join(fixture, 'cc.d.ts'), declarations);
  for (const args of [['scripts/build.mjs', 'web-mobile'], ['scripts/typecheck.mjs']]) {
    if (args[0] === 'scripts/typecheck.mjs') await rm(path.join(root, 'cc.d.ts'));
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      windowsHide: true,
      stdio: 'inherit',
      env: { ...process.env, NULLRANGE_PREBUILT_DIR: fixture },
    });
    assert.equal(result.status, 0, args.join(' '));
  }
  assert.deepEqual(await readFile(path.join(root, 'cc.d.ts')), declarations);
  const cachedEnv = { ...process.env, COCOS_CREATOR: path.join(fixture, 'not-installed.exe') };
  delete cachedEnv.NULLRANGE_PREBUILT_DIR;
  const cachedTest = spawnSync(process.execPath, ['--test', 'tests/artifact.test.mjs'], {
    cwd: root,
    windowsHide: true,
    stdio: 'inherit',
    env: cachedEnv,
  });
  assert.equal(
    cachedTest.status,
    0,
    'next CI test step can use declarations without an editor or inherited prebuilt env',
  );
  await verifyPrebuilt(root);
  console.log(
    'PASS actual Creator artifact reuse, type declarations, tampering and extra-file rejection',
  );
} finally {
  if (priorReference) await writeFile(referencePath, priorReference);
  else await rm(referencePath, { force: true });
  await rm(fixture, { recursive: true, force: true });
}
