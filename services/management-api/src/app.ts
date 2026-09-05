import { createService, openDatabase } from '@coffeeeeffoc/service-kit';
import { z } from 'zod';
import { createObjectStore } from './object-store.js';

/** Creates the management HTTP application with only its own database identity. */
export function createManagementService(
  env: Record<string, string | undefined> = process.env,
  logger = true,
): ReturnType<typeof createService> {
  const databaseUrl = z.url().parse(env.MANAGEMENT_DATABASE_URL);
  const objects = createObjectStore({
    endpoint: z.url().parse(env.S3_ENDPOINT),
    region: env.S3_REGION ?? 'us-east-1',
    bucket: z.string().min(3).parse(env.S3_BUCKET),
    accessKeyId: z.string().min(1).parse(env.S3_ACCESS_KEY_ID),
    secretAccessKey: z.string().min(1).parse(env.S3_SECRET_ACCESS_KEY),
  });
  const database = openDatabase(databaseUrl, 'management');
  return createService('management', { database, objects }, logger);
}
