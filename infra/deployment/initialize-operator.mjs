import { openDatabase } from './packages/service-kit/dist/index.js';
import { createAuthStore, initializeOperator } from './services/management-api/dist/index.js';

const password = process.env.STUDIO_ADMIN_PASSWORD;
delete process.env.STUDIO_ADMIN_PASSWORD;
if (!password || !process.env.MANAGEMENT_DATABASE_URL)
  throw new Error(
    'Set STUDIO_ADMIN_PASSWORD and MANAGEMENT_DATABASE_URL in the management container',
  );
const database = openDatabase(process.env.MANAGEMENT_DATABASE_URL, 'management');
try {
  const created = await initializeOperator(
    createAuthStore(database.db),
    process.env.STUDIO_ADMIN_USERNAME ?? 'creator',
    password,
  );
  console.log(created ? 'Initial operator created.' : 'Operator already exists; unchanged.');
} finally {
  await database.close();
}
