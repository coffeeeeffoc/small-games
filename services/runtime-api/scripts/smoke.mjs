import assert from 'node:assert/strict';
import { createRuntimeService } from '@coffeeeeffoc/runtime-api';
const app = createRuntimeService(
  { RUNTIME_DATABASE_URL: 'postgres://test:test@127.0.0.1:1/unavailable' },
  false,
);
try {
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const response = await fetch(address + '/health/live');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).service, 'runtime');
  console.log('runtime production entry socket smoke passed');
} finally {
  await app.close();
}
