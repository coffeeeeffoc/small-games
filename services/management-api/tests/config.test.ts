import { expect, it } from 'vitest';
import { validateManagementEnvironment } from '../src/config.js';

const base = {
  MANAGEMENT_DATABASE_URL: 'postgres://management_app:secret@localhost/platform',
  STUDIO_ORIGIN: 'http://localhost:5174',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'artifacts',
  S3_ACCESS_KEY_ID: 'test',
  S3_SECRET_ACCESS_KEY: 'test',
};
it('rejects partial integrations before creating resources, with field-only errors', () => {
  for (const invalid of [
    { AI_PROVIDER_KEY: 'private-test-secret' },
    { RELEASE_PROJECTION_TOKEN: 'private-test-secret' },
    { TRUST_PROXY: 'yes' },
    { S3_ENDPOINT: 'ftp://private-test-secret@host' },
  ]) {
    expect(() => validateManagementEnvironment({ ...base, ...invalid })).toThrow(/configuration/);
    try {
      validateManagementEnvironment({ ...base, ...invalid });
    } catch (error) {
      expect(String(error)).not.toContain('private-test-secret');
    }
  }
});
it('production sessions require HTTPS except for explicit loopback development', () => {
  expect(() => validateManagementEnvironment({ ...base, NODE_ENV: 'production' })).not.toThrow();
  expect(() =>
    validateManagementEnvironment({
      ...base,
      NODE_ENV: 'production',
      STUDIO_ORIGIN: 'http://studio.example.com',
    }),
  ).toThrow(/HTTPS/);
});
