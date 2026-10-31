// Run serially after a real Creator build; temporarily reconfigures dist and restores it.
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPrebuilt, runtimeManifest } from '../scripts/artifact.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const workspace = path.resolve(root, '../../..');
const cache = await mkdtemp(path.join(tmpdir(), 'tetracube-real-cache-'));
const dist = path.join(root, 'dist');
const original = JSON.parse(await readFile(path.join(dist, 'build-info.json'), 'utf8'));
try {
  await cp(dist, path.join(cache, 'dist'), { recursive: true });
  await cp(path.join(root, 'reports/engine.d.ts'), path.join(cache, 'cc.d.ts'));
  await verifyPrebuilt(cache);
  for (const enabled of ['1', '0']) {
    const result = spawnSync(process.execPath, [path.join(workspace, 'node_modules/turbo/bin/turbo'), 'run', 'build', '--filter=@coffeeeeffoc/tetracube', '--env-mode=strict'], {
      cwd: workspace,
      encoding: 'utf8',
      env: {
        ...process.env,
        TETRACUBE_PREBUILT_DIR: cache,
        COMPETITION_SERVICE_ENABLED: enabled,
        COMPETITION_PUBLIC_API_URL: 'https://api.example.test/small-games/v1',
      },
    });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const configuration = await readFile(path.join(dist, 'game-service-config.js'), 'utf8');
    assert(configuration.includes('"competitionEnabled":' + (enabled === '1')));
    assert.equal(configuration.includes('https://api.example.test'), enabled === '1');
    const current = JSON.parse(await readFile(path.join(dist, 'build-info.json'), 'utf8'));
    assert.equal(current.sourceHash, original.sourceHash);
    assert.deepEqual(current.files, await runtimeManifest(dist));
    for (const [name, hash] of Object.entries(original.files)) {
      if (name.startsWith('assets/'))
        assert.equal(current.files[name], hash, 'Creator asset ' + name);
    }
  }
  assert.deepEqual(
    JSON.parse(await readFile(path.join(cache, 'dist/build-info.json'), 'utf8')),
    original,
    'verified cache is immutable',
  );
  console.log(
    'Real Creator offline cache → Turbo strict-env HTTPS release → disabled release passed; source hash and engine assets preserved.',
  );
} finally {
  // Restore the exact original public config/manifest after exercising release mutation.
  await cp(path.join(cache, 'dist'), dist, { recursive: true });
  assert.equal(path.dirname(cache), tmpdir());
  await rm(cache, { recursive: true, force: true });
}
