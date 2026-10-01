import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { sourceHash } from '../scripts/artifact.mjs';

test('restores matching web artifacts without Creator and rejects stale or incomplete artifacts before replacing output', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'night-artifact-'));
  try {
    const game = path.join(temp, 'games/local/night-overwatch');
    const prebuilt = path.join(temp, 'prebuilt');
    for (const dir of ['assets', 'scripts', 'settings/v2/packages', 'dist'])
      await mkdir(path.join(game, dir), { recursive: true });
    await mkdir(path.join(temp, 'games/local/carding-car/scripts'), { recursive: true });
    for (const name of ['build.mjs', 'artifact.mjs'])
      await cp(new URL(`../scripts/${name}`, import.meta.url), path.join(game, 'scripts', name));
    for (const name of ['toolchain.mjs', 'native-targets.mjs', 'clear-output.mjs'])
      await cp(new URL('../../carding-car/scripts/' + name, import.meta.url),
        path.join(temp, 'games/local/carding-car/scripts', name));
    await writeFile(path.join(game, 'package.json'), '{"type":"module"}\n');
    for (const name of ['engine', 'project'])
      await writeFile(path.join(game, `settings/v2/packages/${name}.json`), '{}\n');
    const script = path.join(game, 'assets/example.js');
    const modelScript = path.join(game, 'scripts/model-aircraft.py');
    await writeFile(modelScript, 'print("aircraft")\n');
    await writeFile(script, 'const active = true;\n');
    const hash = await sourceHash(game);
    const bundleSettings = path.join(game, 'settings/v2/packages/builder.json');
    await writeFile(bundleSettings, '{"bundleConfig":{}}\n');
    assert.notEqual(await sourceHash(game), hash, 'Native resource-bundle settings invalidate artifacts');
    await rm(bundleSettings);
    await writeFile(script, 'const active = true;\r\n');
    assert.equal(await sourceHash(game), hash, 'Windows and Unix text must hash identically');
    await writeFile(modelScript, 'print("aircraft")\r\n');
    assert.equal(await sourceHash(game), hash, 'Python model scripts must hash identically across CI runners');
    await writeFile(modelScript, 'print("changed aircraft")\n');
    assert.notEqual(await sourceHash(game), hash, 'Model script changes must invalidate the artifact');
    await writeFile(modelScript, 'print("aircraft")\n');
    await writeFile(script, 'const active = false;\n');
    assert.notEqual(await sourceHash(game), hash);
    await writeFile(script, 'const active = true;\n');
    await mkdir(path.join(prebuilt, 'dist'), { recursive: true });
    await writeFile(path.join(prebuilt, 'dist/index.html'), '<title>Verified build</title>');
    await writeFile(path.join(prebuilt, 'cc.d.ts'), '// engine types');
    const manifest = { creator: '3.8.8', target: 'web-mobile', sourceHash: hash };
    const info = path.join(prebuilt, 'dist/build-info.json');
    await writeFile(info, JSON.stringify(manifest));
    const build = () => spawnSync(process.execPath, [path.join(game, 'scripts/build.mjs')], {
      encoding: 'utf8',
      env: { ...process.env, COCOS_CREATOR: path.join(temp, 'missing-Creator.exe'), NIGHT_OVERWATCH_PREBUILT_DIR: prebuilt },
    });
    const accepted = build();
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(accepted.stdout, /Restored verified/);
    assert.equal(await readFile(path.join(game, 'dist/index.html'), 'utf8'), '<title>Verified build</title>');
    for (const override of [{ sourceHash: 'stale' }, { creator: '3.8.7' }, { target: 'web-desktop' }]) {
      await writeFile(info, JSON.stringify({ ...manifest, ...override }));
      const rejected = build();
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /does not match/);
      assert.equal(await readFile(path.join(game, 'dist/index.html'), 'utf8'), '<title>Verified build</title>');
    }
    await writeFile(info, JSON.stringify(manifest));
    await rm(path.join(prebuilt, 'cc.d.ts'));
    assert.notEqual(build().status, 0, 'Engine declarations must accompany the artifact');
  } finally {
    if (path.dirname(temp) !== path.resolve(os.tmpdir()) || !path.basename(temp).startsWith('night-artifact-'))
      throw Error('Invalid test cleanup directory');
    await rm(temp, { recursive: true, force: true });
  }
});
