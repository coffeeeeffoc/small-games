import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  reserveNightVersion,
  releaseVersion,
  nightCompilerVersion,
} from './night-build-version.mjs';
import {
  prepareGameServices,
  reconfigureGameServices,
  stampNightBuild,
} from './h5-game-services.mjs';

test('versions are explicit and concurrent builds reserve distinct increasing numbers', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'night-versions-'));
  try {
    await mkdir(path.join(root, 'publishing'));
    const file = path.join(root, 'publishing/versions.json');
    await assert.rejects(reserveNightVersion(root), /ENOENT/);
    await writeFile(file, JSON.stringify({ nextVersion: '2.3.9', backendVersion: '1.2.0' }));
    const values = await Promise.all(Array.from({ length: 5 }, () => reserveNightVersion(root)));
    assert.deepEqual(
      values.map((v) => v.version).sort((a, b) => +a.split('.')[2] - +b.split('.')[2]),
      ['2.3.9', '2.3.10', '2.3.11', '2.3.12', '2.3.13'],
    );
    assert(values.every((v) => v.backendVersion === '1.2.0'));
    assert.equal(JSON.parse(await readFile(file, 'utf8')).nextVersion, '2.3.14');
    assert.deepEqual(
      await nightCompilerVersion(root, {
        NIGHT_BUILD_VERSION: '4.0.1',
        NIGHT_BACKEND_VERSION: '3.0.0',
      }),
      { version: '4.0.1', backendVersion: '3.0.0' },
    );
    assert.equal(JSON.parse(await readFile(file, 'utf8')).nextVersion, '2.3.14');
    await assert.rejects(nightCompilerVersion(root, { NIGHT_BUILD_VERSION: '4.0.1' }));
    for (const version of [
      '',
      'v1.0.0',
      '1.0',
      '01.0.0',
      '1.0.0\nLABEL injected=true',
      '9007199254740992.0.0',
    ])
      assert.throws(() => releaseVersion(version));
  } finally {
    assert.equal(path.dirname(root), tmpdir());
    await rm(root, { recursive: true, force: true });
  }
});

test('restamping and endpoint repack preserve the human version while content changes its build ID', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'night-stamp-'));
  try {
    const entry = path.join(root, 'index.html');
    await writeFile(entry, '<html><head></head></html>');
    await prepareGameServices('night-overwatch', root, { env: {} });
    const first = await stampNightBuild(root, 'taptap-h5', {
      version: '2.1.7',
      backendVersion: '2.0.0',
    });
    assert.deepEqual(await stampNightBuild(root, 'taptap-h5'), first);
    await reconfigureGameServices(entry, {
      COMPETITION_SERVICE_ENABLED: '1',
      COMPETITION_PUBLIC_API_URL: 'https://api.example.test/v1',
    });
    const next = await stampNightBuild(root, 'taptap-h5');
    assert.equal(next.version, first.version);
    assert.equal(next.backendVersion, first.backendVersion);
    assert.notEqual(next.buildId, first.buildId);
  } finally {
    assert.equal(path.dirname(root), tmpdir());
    await rm(root, { recursive: true, force: true });
  }
});
