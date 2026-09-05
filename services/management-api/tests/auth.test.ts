import { afterEach, beforeEach, expect, it } from 'vitest';
import { createService } from '@coffeeeeffoc/service-kit';
import {
  registerAuthentication,
  initializeOperator,
  hasRole,
  roles,
} from '@coffeeeeffoc/management-api';
import { memoryAuthStore } from './auth.fixture.js';

const origin = 'http://127.0.0.1:5174';
const password = 'only-used-in-contract-tests';
let app: ReturnType<typeof createService>;
let time: number;
let store: ReturnType<typeof memoryAuthStore>;
beforeEach(async () => {
  time = 1_000_000;
  store = memoryAuthStore();
  await initializeOperator(store, 'creator', password);
  app = createService('management', {}, false);
  await registerAuthentication(app, store, origin, () => time);
});
afterEach(async () => {
  await app.close();
});
const login = (suppliedPassword = password) =>
  app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin },
    payload: { username: 'creator', password: suppliedPassword },
  });
function cookieHeader(response: Awaited<ReturnType<typeof login>>) {
  const header = response.headers['set-cookie'];
  return (Array.isArray(header) ? header : [header ?? ''])
    .map((value) => value.split(';')[0])
    .join('; ');
}

it('initializes all independent roles without resetting an existing account', async () => {
  expect(await initializeOperator(store, 'other', password)).toBe(false);
  const response = await login();
  expect(response.statusCode).toBe(200);
  expect(response.json().roles).toEqual(roles);
  expect(response.body).not.toContain('password');
  expect(response.body).not.toContain('Hash');
  for (const cookie of response.cookies) {
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Strict');
    expect(cookie.path).toBe(cookie.name === 'studio_access' ? '/api' : '/api/auth');
    expect(cookie.maxAge).toBe(cookie.name === 'studio_access' ? 900 : 28800);
    expect(cookie.secure).not.toBe(true);
  }
  expect(hasRole({ id: 'any', username: 'review-only', roles: ['reviewer'] }, 'publisher')).toBe(
    false,
  );
  expect(hasRole({ id: 'any', username: 'review-only', roles: ['reviewer'] }, 'reviewer')).toBe(
    true,
  );
});
it('rejects wrong passwords and unauthenticated access', async () => {
  expect((await login('wrong')).statusCode).toBe(401);
  const unknown = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin },
    payload: { username: 'unknown', password: 'wrong' },
  });
  expect(unknown.statusCode).toBe(401);
  expect(unknown.json()).toEqual({ error: 'INVALID_CREDENTIALS' });
  expect((await app.inject('/api/auth/session')).statusCode).toBe(401);
});

it('marks both cookies Secure when configured behind an HTTPS Studio origin', async () => {
  const secureApp = createService('management', {}, false);
  try {
    await registerAuthentication(secureApp, store, 'https://studio.example', () => time);
    const response = await secureApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'https://studio.example' },
      payload: { username: 'creator', password },
    });
    expect(response.statusCode).toBe(200);
    expect(response.cookies).toHaveLength(2);
    for (const cookie of response.cookies) expect(cookie.secure).toBe(true);
  } finally {
    await secureApp.close();
  }
});
it('expires access, rotates refresh once, and rejects a replay', async () => {
  const original = cookieHeader(await login());
  expect(
    (await app.inject({ url: '/api/auth/session', headers: { cookie: original } })).statusCode,
  ).toBe(200);
  time += 15 * 60 * 1000;
  expect(
    (await app.inject({ url: '/api/auth/session', headers: { cookie: original } })).statusCode,
  ).toBe(401);
  const refresh = await app.inject({
    method: 'POST',
    url: '/api/auth/refresh',
    headers: { origin, cookie: original },
    payload: {},
  });
  expect(refresh.statusCode).toBe(200);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: { origin, cookie: original },
        payload: {},
      })
    ).statusCode,
  ).toBe(401);
  const rotated = cookieHeader(refresh);
  expect(
    (await app.inject({ url: '/api/auth/session', headers: { cookie: rotated } })).statusCode,
  ).toBe(200);
  time += 8 * 60 * 60 * 1000;
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: { origin, cookie: rotated },
        payload: {},
      })
    ).statusCode,
  ).toBe(401);
});
it('revokes both access and refresh tokens on logout', async () => {
  const cookie = cookieHeader(await login());
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { origin, cookie },
        payload: {},
      })
    ).statusCode,
  ).toBe(200);
  expect((await app.inject({ url: '/api/auth/session', headers: { cookie } })).statusCode).toBe(
    401,
  );
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: { origin, cookie },
        payload: {},
      })
    ).statusCode,
  ).toBe(401);
});
it('rejects cross-Origin requests and bounds login attempts', async () => {
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { origin: 'https://evil.example' },
        payload: { username: 'creator', password },
      })
    ).statusCode,
  ).toBe(403);
  for (let i = 0; i < 5; i++) expect((await login('wrong')).statusCode).toBe(401);
  expect((await login()).statusCode).toBe(429);
});
