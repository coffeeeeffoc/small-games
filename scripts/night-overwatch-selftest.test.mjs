import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const script = new URL('./night-overwatch-selftest.mjs', import.meta.url);
const run = (...args) =>
  spawnSync(process.execPath, [script.pathname.replace(/^\/([A-Za-z]:)/, '$1'), ...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
test('local plan validates finite HTTPS configuration without starting Docker or packing', () => {
  const result = run('plan', 'https://phone.example.test:23456', '43003');
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.apiUrl, 'https://phone.example.test:23456/api/competition/v1');
  assert.deepEqual(plan.services, ['postgres', 'runtime', 'gateway']);
  for (const args of [
    ['plan', 'http://phone.example.test'],
    ['plan', 'https://user:password@phone.example.test'],
    ['plan', 'https://phone.example.test/path'],
    ['plan', 'https://phone.example.test', '80'],
    ['start-all', 'https://phone.example.test'],
  ])
    assert.notEqual(run(...args).status, 0);
});
test('existing local database is stopped, binary backed up and independently restored before upgrade', () => {
  const source = readFileSync(script, 'utf8'),
    backup = readFileSync(new URL('./night-overwatch-backup.mjs', import.meta.url), 'utf8');
  assert(source.indexOf("['stop', runtime]") < source.indexOf('await verifyNightBackup'));
  assert(
    source.indexOf('await verifyNightBackup') < source.indexOf("compose(['up', '-d', '--wait'"),
  );
  assert.match(backup, /'--network',\s*'none'/);
  assert(backup.includes('assert.deepEqual(restored, source'));
  assert(backup.includes("'pg_dump', '-Fc'"));
  assert(!backup.includes("encoding: 'utf8'"));
  assert(source.includes("path.join(work, 'h5.json')"));
});
