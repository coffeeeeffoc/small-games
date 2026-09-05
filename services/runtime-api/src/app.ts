import { createService, openDatabase } from '@coffeeeeffoc/service-kit';
import { z } from 'zod';

/** Creates the runtime HTTP application with only its own database identity. */
export function createRuntimeService(
  env: Record<string, string | undefined> = process.env,
  logger = true,
): ReturnType<typeof createService> {
  const databaseUrl = z.url().parse(env.RUNTIME_DATABASE_URL);
  const database = openDatabase(databaseUrl, 'runtime');
  return createService('runtime', { database }, logger);
}
