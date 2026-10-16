import Fastify from 'fastify';
import { expect, it } from 'vitest';
import { readCorsPolicy, registerCors } from '../src/cors.js';

const defaults = {
  origins: ['https://admin.nenggongzhiren.cn'],
  methods: ['GET', 'POST', 'OPTIONS'],
  headers: ['authorization', 'content-type'],
  credentials: false,
};
it('detaches each request snapshot from provider-owned mutable arrays', async () => {
  const app = Fastify();
  const policy = {
    ...defaults,
    origins: ['https://one.example'],
    methods: ['GET', 'POST', 'OPTIONS'],
    headers: ['authorization'],
    maxAge: 600,
  };
  registerCors(app, async () => policy);
  app.addHook('onRequest', async () => {
    policy.origins.length = 0;
    policy.methods.length = 0;
    policy.headers.length = 0;
  });
  try {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api',
      headers: {
        origin: 'https://one.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization',
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-methods']).toContain('POST');
  } finally {
    await app.close();
  }
});
it('uses one asynchronous snapshot for both preflight stages and fails closed on resolver errors', async () => {
  const app = Fastify();
  let calls = 0,
    failed = false;
  registerCors(app, async () => {
    calls++;
    if (failed) throw new Error('unavailable');
    return {
      ...defaults,
      maxAge: 600,
      origins: calls === 1 ? ['https://one.example'] : ['https://two.example'],
    };
  });
  app.post('/api', async () => ({}));
  try {
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/api',
      headers: {
        origin: 'https://one.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(calls).toBe(1);
    expect(preflight.headers['access-control-allow-credentials']).toBeUndefined();
    expect(
      (
        await app.inject({
          url: '/api',
          method: 'POST',
          headers: { origin: 'https://one.example' },
        })
      ).statusCode,
    ).toBe(403);
    failed = true;
    const unavailable = await app.inject({
      method: 'OPTIONS',
      url: '/api',
      headers: {
        origin: 'https://two.example',
        'access-control-request-method': 'POST',
      },
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toEqual({ error: 'CONTROL_UNAVAILABLE' });
    expect(unavailable.headers['access-control-allow-origin']).toBeUndefined();
  } finally {
    await app.close();
  }
});
it('rejects wildcard, non-origin, invalid method/header, credentials and age configuration without echoing values', () => {
  for (const env of [
    { X_ORIGINS: '*' },
    { X_ORIGINS: 'https://*.example.com' },
    { X_ORIGINS: 'https://site.example/path' },
    { X_METHODS: 'TRACE' },
    { X_HEADERS: '*' },
    { X_HEADERS: 'a:b' },
    { X_CREDENTIALS: '1' },
    { X_MAX_AGE: '-1' },
  ])
    expect(() => readCorsPolicy(env, 'X', defaults)).toThrow('Invalid X CORS configuration');
});
it('validates positive and negative preflight before handlers without treating it as authentication', async () => {
  const app = Fastify();
  registerCors(app, readCorsPolicy({ X_CREDENTIALS: 'true' }, 'X', defaults));
  let calls = 0;
  app.post('/secret', (_request, reply) => {
    calls++;
    return reply.code(401).send();
  });
  const options = (headers: Record<string, string>) =>
    app.inject({ method: 'OPTIONS', url: '/secret', headers });
  const headers = {
    origin: defaults.origins[0]!,
    'access-control-request-method': 'POST',
    'access-control-request-headers': 'Authorization, Content-Type',
  };
  try {
    const good = await options(headers);
    expect(good.statusCode).toBe(204);
    expect(good.headers['access-control-allow-credentials']).toBe('true');
    expect(calls).toBe(0);
    for (const bad of [
      { ...headers, origin: 'https://evil.example' },
      { ...headers, 'access-control-request-method': 'DELETE' },
      { ...headers, 'access-control-request-headers': 'x-internal-key' },
      {},
    ])
      expect((await options(bad)).statusCode).toBe(403);
    expect(
      (await app.inject({ method: 'POST', url: '/secret', headers: { origin: headers.origin } }))
        .statusCode,
    ).toBe(401);
    expect(calls).toBe(1);
  } finally {
    await app.close();
  }
});
it('keeps policies independent and supports finite credentials-free public callers', async () => {
  const publicPolicy = readCorsPolicy(
    { PUBLIC_ORIGINS: 'http://localhost:8080', PUBLIC_METHODS: 'GET,OPTIONS' },
    'PUBLIC',
    defaults,
  );
  const management = readCorsPolicy({}, 'ADMIN', { ...defaults, credentials: true });
  expect(publicPolicy.origins).toEqual(['http://localhost:8080']);
  expect(management.origins).toEqual(defaults.origins);
  const app = Fastify();
  registerCors(app, publicPolicy);
  app.get('/api', async () => ({}));
  try {
    const response = await app.inject({
      url: '/api',
      headers: { origin: 'http://localhost:8080' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api',
          headers: { origin: 'http://localhost:8080' },
        })
      ).statusCode,
    ).toBe(403);
  } finally {
    await app.close();
  }
});
