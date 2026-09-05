import assert from 'node:assert/strict';
import { createManagementService } from '@coffeeeeffoc/management-api';
const app = createManagementService(
  {
    STUDIO_ORIGIN: 'http://127.0.0.1:5174',
    MANAGEMENT_DATABASE_URL: 'postgres://test:test@127.0.0.1:1/unavailable',
    S3_ENDPOINT: 'http://127.0.0.1:1',
    S3_BUCKET: 'test',
    S3_ACCESS_KEY_ID: 'test',
    S3_SECRET_ACCESS_KEY: 'test',
  },
  false,
);
try {
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const response = await fetch(address + '/health/live');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).service, 'management');
  console.log('management production entry socket smoke passed');
} finally {
  await app.close();
}
