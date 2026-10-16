import { expect, it } from 'vitest';
import { readCompetitionCors, validateRuntimeEnvironment } from '../src/config.js';

const base = { RUNTIME_DATABASE_URL: 'postgres://runtime_app:secret@localhost/runtime' };
it('rejects configuration typos and partial capability configuration without echoing secrets', () => {
  for (const invalid of [
    { COMPETITION_ENABLED: 'yes' },
    { TRUST_PROXY: 'true' },
    { TRUST_PROXY: '1' },
    { TRUST_PROXY: '1', RUNTIME_TRUSTED_PROXY_IP: 'uniquelocal' },
    { TRUST_PROXY: '1', RUNTIME_TRUSTED_PROXY_IP: '172.18.0.0/16' },
    { TRUST_PROXY: '1', RUNTIME_TRUSTED_PROXY_IP: '172.18.0.4,127.0.0.1' },
    { TRUST_PROXY: '1', RUNTIME_TRUSTED_PROXY_IP: ' 172.18.0.4' },
    { TRUST_PROXY: '0', RUNTIME_TRUSTED_PROXY_IP: '172.18.0.4' },
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
it('accepts only an explicitly enabled exact proxy address', () => {
  for (const address of ['172.18.0.4', '::1'])
    expect(() =>
      validateRuntimeEnvironment({ ...base, TRUST_PROXY: '1', RUNTIME_TRUSTED_PROXY_IP: address }),
    ).not.toThrow();
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
it('validates the effective independent CORS policy before resources, including new-only production configuration', () => {
  const production = {
    ...base,
    NODE_ENV: 'production',
    COMPETITION_ENABLED: 'true',
    COMPETITION_INTERNAL_KEY: 'a'.repeat(32),
  };
  expect(() =>
    validateRuntimeEnvironment({
      ...production,
      COMPETITION_CORS_ORIGINS: 'https://public.example',
    }),
  ).not.toThrow();
  expect(
    readCompetitionCors({
      COMPETITION_CORS_ORIGINS: 'https://public.example',
      COMPETITION_ORIGINS: 'invalid ignored legacy',
      ADMIN_CORS_ORIGINS: 'https://admin.nenggongzhiren.cn',
    }).origins,
  ).toEqual(['https://public.example']);
  expect(readCompetitionCors({ COMPETITION_ORIGINS: 'http://localhost:8080' }).origins).toEqual([
    'http://localhost:8080',
  ]);
  expect(() =>
    validateRuntimeEnvironment({
      ...production,
      COMPETITION_CORS_ORIGINS: '',
      COMPETITION_ORIGINS: 'http://localhost:8080',
    }),
  ).toThrow(/ORIGINS/);
  for (const invalid of [
    { COMPETITION_CORS_ORIGINS: 'https://*.example.com' },
    { COMPETITION_CORS_METHODS: 'TRACE' },
    { COMPETITION_CORS_HEADERS: '*' },
    { COMPETITION_CORS_CREDENTIALS: 'yes' },
    { COMPETITION_CORS_MAX_AGE: '-1' },
  ]) {
    expect(() => validateRuntimeEnvironment({ ...base, ...invalid })).toThrow(/configuration/);
    try {
      validateRuntimeEnvironment({ ...base, ...invalid });
    } catch (error) {
      expect(String(error)).not.toContain(Object.values(invalid)[0]);
    }
  }
});
