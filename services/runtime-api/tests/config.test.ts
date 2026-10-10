import { expect, it } from 'vitest';
import { validateRuntimeEnvironment } from '../src/config.js';

const base = { RUNTIME_DATABASE_URL: 'postgres://runtime_app:secret@localhost/runtime' };
it('rejects configuration typos and partial capability configuration without echoing secrets', () => {
  for (const invalid of [
    { COMPETITION_ENABLED: 'yes' },
    { TRUST_PROXY: 'true' },
    { RUNTIME_DATABASE_URL: 'https://credential:private@example.com' },
    { RELEASE_PROJECTION_TOKEN: 'sensitive-token' },
    { SHELL_ORIGIN: 'https://games.example.com' },
    { COMPETITION_ORIGINS: 'https://games.example.com/path' },
  ]) {
    expect(() => validateRuntimeEnvironment({ ...base, ...invalid })).toThrow(/configuration/);
  }
  try {
    validateRuntimeEnvironment({ ...base, RELEASE_PROJECTION_TOKEN: 'sensitive-token' });
  } catch (error) {
    expect(String(error)).not.toContain('sensitive-token');
  }
});
it('requires explicit competition origins and internal key in production', () => {
  const env = { ...base, NODE_ENV: 'production', COMPETITION_ENABLED: 'true' };
  expect(() => validateRuntimeEnvironment(env)).toThrow(/COMPETITION_INTERNAL_KEY/);
  expect(() =>
    validateRuntimeEnvironment({
      ...env,
      COMPETITION_ORIGINS: 'https://games.example.com',
      COMPETITION_INTERNAL_KEY: 'a'.repeat(32),
    }),
  ).not.toThrow();
  expect(() => validateRuntimeEnvironment(base)).not.toThrow();
});
