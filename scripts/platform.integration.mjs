import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import { createManagementService, createObjectStore } from '@coffeeeeffoc/management-api';
import { createRuntimeService } from '@coffeeeeffoc/runtime-api';
import { managementEnvironment, runtimeEnvironment } from './platform-config.mjs';

const management = openDatabase(managementEnvironment.MANAGEMENT_DATABASE_URL, 'management');
const runtime = openDatabase(runtimeEnvironment.RUNTIME_DATABASE_URL, 'runtime');
const owner = openDatabase(
  'postgres://platform_owner:local-owner-only@127.0.0.1:15432/small_games',
  'management',
);
const objects = createObjectStore({
  endpoint: managementEnvironment.S3_ENDPOINT,
  region: managementEnvironment.S3_REGION,
  bucket: managementEnvironment.S3_BUCKET,
  accessKeyId: managementEnvironment.S3_ACCESS_KEY_ID,
  secretAccessKey: managementEnvironment.S3_SECRET_ACCESS_KEY,
});
const apps = [
  createManagementService(managementEnvironment, false),
  createRuntimeService(runtimeEnvironment, false),
];
// Generated identifier contains only ASCII letters/hex/underscores and belongs to this test.
const draftTable = `management.integration_draft_${randomUUID().replaceAll('-', '')}`;
let created = false;
// SQLSTATE insufficient_privilege remains stable across translated driver messages.
const permissionDenied = (error) => error.cause?.code === '42501';
try {
  await management.check();
  await runtime.check();
  await owner.db.execute(`create table ${draftTable} (body text not null)`);
  created = true;
  await owner.db.execute(`insert into ${draftTable} values ('unpublished draft')`);
  await owner.db.execute(`grant select on ${draftTable} to management_app`);
  assert.equal(
    (await management.db.execute(`select body from ${draftTable}`))[0].body,
    'unpublished draft',
  );
  await assert.rejects(runtime.db.execute(`select body from ${draftTable}`), permissionDenied);
  await assert.rejects(
    management.db.execute('select * from runtime.schema_version'),
    permissionDenied,
  );
  await assert.rejects(runtime.db.execute('set role platform_owner'), permissionDenied);
  await assert.rejects(
    runtime.db.execute('create table runtime.unauthorized (id integer)'),
    permissionDenied,
  );
  await objects.initialize();
  await objects.initialize();
  await objects.check();
  const bytes = new TextEncoder().encode('small-games S3 adapter round-trip v1');
  await objects.put('diagnostics/round-trip-v1.txt', bytes);
  assert.deepEqual(await objects.get('diagnostics/round-trip-v1.txt'), bytes);
  await assert.rejects(objects.get(`diagnostics/missing-${randomUUID()}`));
  for (const app of apps) {
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const response = await fetch(address + '/health');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'ok');
  }
  console.log(
    'Live PostgreSQL role/schema isolation, MinIO S3 round-trip and both HTTP services passed.',
  );
} finally {
  try {
    if (created) await owner.db.execute(`drop table ${draftTable}`);
  } finally {
    const cleanup = await Promise.allSettled([
      ...apps.map((app) => app.close()),
      management.close(),
      runtime.close(),
      owner.close(),
      Promise.resolve().then(() => objects.close()),
    ]);
    if (cleanup.some((result) => result.status === 'rejected')) {
      console.error('Integration resource cleanup failed');
      process.exitCode = 1;
    }
  }
}
