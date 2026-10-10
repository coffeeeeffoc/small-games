import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { multiplayerClientSource } from '../network-config.mjs';

test('production artifact carries the shared client and the configured public API endpoint', async () => {
  const publicApi = 'https://games.example/api/competition/v1';
  const source = await multiplayerClientSource({ COMPETITION_PUBLIC_API_URL: publicApi });
  const shared = await readFile(
    new URL('../../../../platforms/competition/client.js', import.meta.url),
    'utf8',
  );
  assert.ok(source.endsWith(shared));
  const context = {};
  vm.runInNewContext(source, context);
  assert.equal(context.__CARROM_COMPETITION_CONFIG__.apiUrl, publicApi);
  assert.equal(typeof context.__installCompetition, 'function');
  await assert.rejects(
    multiplayerClientSource({ COMPETITION_PUBLIC_API_URL: 'javascript:alert(1)' }),
    /HTTP/,
  );
  await assert.rejects(
    multiplayerClientSource({ COMPETITION_PUBLIC_API_URL: 'https://user:secret@games.example' }),
    /credentials/,
  );
});

test('per-game H5 release settings override the shared endpoint and omitted config retains same-origin service', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'carrom-network-'));
  try {
    const filename = path.join(directory, 'config.json');
    await writeFile(
      filename,
      JSON.stringify({
        'carrom-club': { h5: { apiUrl: 'https://carrom.example/api/competition/v1' } },
      }),
    );
    const configured = await multiplayerClientSource({
      COMPETITION_RELEASE_CONFIG: filename,
      COMPETITION_PUBLIC_API_URL: 'https://other.example',
    });
    assert.match(configured.split('\n')[0], /https:\/\/carrom.example/);
    const local = await multiplayerClientSource({});
    assert.match(local.split('\n')[0], /"apiUrl":""/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
