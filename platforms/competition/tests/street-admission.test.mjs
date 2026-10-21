import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startRun, submitRun } from '../../../games/local/cops-robbers-realtime/src/records.js';

test('Street obtains admission at start and retries the original body with owner/config bound ticket', async () => {
  const config = {
      version: 'street-solo-v2',
      mode: 'challenge',
      role: 'cop',
      level: 1,
      rule: 'standard',
      first: 'simultaneous',
    },
    calls = [];
  const previousConfig = globalThis.__COMPETITION_CONFIG__,
    previous = globalThis.__competition;
  let owner = 'player-a';
  globalThis.__COMPETITION_CONFIG__ = {
    competitionEnabled: true,
    apiUrl: 'https://fixture.example/v1',
  };
  globalThis.__competition = {
    session: async () => ({ userId: owner }),
    request: async (path, init, expectedUserId) => {
      if (owner !== expectedUserId)
        throw Object.assign(new Error('SESSION_CHANGED'), { code: 'SESSION_CHANGED' });
      calls.push({ path, body: JSON.parse(init.body), expectedUserId });
      return path.includes('/start?')
        ? { admissionId: '00000000-0000-4000-8000-000000000001', expiresAt: Date.now() + 3600_000 }
        : { accepted: true };
    },
  };
  try {
    const admission = await startRun(config);
    assert.equal(calls.length, 1);
    assert.match(calls[0].path, /\/start\?/);
    const orders = [{ tick: 3, actor: 0, x: 100, y: 200 }];
    await submitRun(config, 100, orders, admission);
    await submitRun(config, 100, orders, admission);
    assert.deepEqual(calls[1], calls[2]);
    assert.deepEqual(calls[1].body, { ticks: 100, orders });
    assert.equal(calls[1].expectedUserId, 'player-a');
    assert.equal(
      new URL('https://fixture.example' + calls[1].path).searchParams.get('admissionId'),
      admission.admissionId,
    );
    await assert.rejects(submitRun({ ...config, level: 2 }, 100, orders, admission), {
      code: 'RUN_ADMISSION_REQUIRED',
    });
    await assert.rejects(submitRun(config, 100, orders), { code: 'RUN_ADMISSION_REQUIRED' });
    owner = 'player-b';
    await assert.rejects(submitRun(config, 100, orders, admission), { code: 'SESSION_CHANGED' });
  } finally {
    globalThis.__COMPETITION_CONFIG__ = previousConfig;
    globalThis.__competition = previous;
  }
});
test('the Street H5 entrypoint starts admission before startGame and carries its ticket to upload', async () => {
  for (const name of ['main']) {
    const source = await readFile(
      new URL(`../../../games/local/cops-robbers-realtime/src/${name}.js`, import.meta.url),
      'utf8',
    );
    assert.match(source, /await startRun\(runConfig\(starting\)\)/);
    assert.match(source, /admission:\s*runAdmission/);
    assert.match(source, /submitRun\([^;]+\.admission\)/);
  }
});
