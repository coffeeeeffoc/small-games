import { readFile } from 'node:fs/promises';

// Only the public file is loaded here; the signer private key never enters service processes.
const publicKey =
  process.env.ARTIFACT_TRUSTED_PUBLIC_KEY ??
  (await readFile(
    new URL('../.scratch/artifact-signing/public-key.txt', import.meta.url),
    'utf8',
  ).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return '';
  }));
const publication = publicKey
  ? {
      ARTIFACT_TRUSTED_PUBLIC_KEY: publicKey.trim(),
      RELEASE_PROJECTION_TOKEN:
        process.env.RELEASE_PROJECTION_TOKEN ?? 'local-projection-only-not-for-production',
    }
  : {};
// Only the local runner supplies development credentials; service binaries fail closed.
export const managementEnvironment = {
  SHELL_ORIGIN: process.env.SHELL_ORIGIN ?? 'http://localhost:5173',
  ...publication,
  ...(publicKey ? { RUNTIME_PROJECTION_URL: 'http://127.0.0.1:53002' } : {}),
  STUDIO_ORIGIN: 'http://127.0.0.1:5174',
  MANAGEMENT_DATABASE_URL:
    'postgres://management_app:local-management-only@127.0.0.1:15432/small_games',
  S3_ENDPOINT: 'http://127.0.0.1:59000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'game-artifacts',
  S3_ACCESS_KEY_ID: 'local-management',
  S3_SECRET_ACCESS_KEY: 'local-management-only',
  ...(process.env.AI_PROVIDER_URL ? { AI_PROVIDER_URL: process.env.AI_PROVIDER_URL } : {}),
  ...(process.env.AI_PROVIDER_KEY ? { AI_PROVIDER_KEY: process.env.AI_PROVIDER_KEY } : {}),
  ...(process.env.AI_PROVIDER_MODEL ? { AI_PROVIDER_MODEL: process.env.AI_PROVIDER_MODEL } : {}),
};
export const runtimeEnvironment = {
  SHELL_ORIGIN: process.env.SHELL_ORIGIN ?? 'http://localhost:5173',
  ARTIFACT_DELIVERY_URL: 'http://127.0.0.1:53001',
  ...publication,
  RUNTIME_DATABASE_URL: 'postgres://runtime_app:local-runtime-only@127.0.0.1:15432/small_games',
};
