import { managementEnvironment } from './platform-config.mjs';
import { runCommand } from './platform-process.mjs';
import { fileURLToPath } from 'node:url';

const password = process.env.STUDIO_ADMIN_PASSWORD;
delete process.env.STUDIO_ADMIN_PASSWORD;
if (!password) throw new Error('Set STUDIO_ADMIN_PASSWORD before initializing an operator.');
const root = fileURLToPath(new URL('../', import.meta.url));
await runCommand(process.execPath, ['scripts/platform.mjs', 'up'], { cwd: root });
await runCommand(
  process.execPath,
  ['node_modules/turbo/bin/turbo', 'run', 'build', '--filter=@coffeeeeffoc/management-api...'],
  { cwd: root },
);
const { openDatabase } = await import('@coffeeeeffoc/service-kit');
const { createAuthStore, initializeOperator } = await import('@coffeeeeffoc/management-api');
const database = openDatabase(managementEnvironment.MANAGEMENT_DATABASE_URL, 'management');
try {
  const created = await initializeOperator(
    createAuthStore(database.db),
    process.env.STUDIO_ADMIN_USERNAME ?? 'creator',
    password,
  );
  console.log(
    created
      ? 'Initial operator created with creator/reviewer/publisher/admin roles.'
      : 'An operator already exists; credentials and roles were left unchanged.',
  );
} finally {
  await database.close();
}
