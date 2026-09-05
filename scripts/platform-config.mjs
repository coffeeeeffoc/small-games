// Only the local runner supplies development credentials; service binaries fail closed.
export const managementEnvironment = {
  STUDIO_ORIGIN: 'http://127.0.0.1:5174',
  MANAGEMENT_DATABASE_URL:
    'postgres://management_app:local-management-only@127.0.0.1:15432/small_games',
  S3_ENDPOINT: 'http://127.0.0.1:59000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'game-artifacts',
  S3_ACCESS_KEY_ID: 'local-management',
  S3_SECRET_ACCESS_KEY: 'local-management-only',
};
export const runtimeEnvironment = {
  RUNTIME_DATABASE_URL: 'postgres://runtime_app:local-runtime-only@127.0.0.1:15432/small_games',
};
