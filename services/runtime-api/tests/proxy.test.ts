import { expect, it } from 'vitest';
import { createRuntimeService } from '../src/app.js';

it('takes one sanitized client address only from the exact Nginx peer', async () => {
  const app = createRuntimeService(
    {
      RUNTIME_DATABASE_URL: 'postgres://test:test@127.0.0.1:1/unavailable',
      TRUST_PROXY: '1',
      RUNTIME_TRUSTED_PROXY_IP: '172.18.0.4',
    },
    false,
  );
  app.get('/proxy-test', (request) => ({ ip: request.ip }));
  try {
    for (const peer of ['172.18.0.4', '::ffff:172.18.0.4']) {
      const response = await app.inject({
        url: '/proxy-test',
        remoteAddress: peer,
        headers: { 'x-forwarded-for': '203.0.113.8' },
      });
      expect(response.json()).toEqual({ ip: '203.0.113.8' });
    }
    for (const peer of ['172.18.0.2', '127.0.0.1', '198.51.100.8']) {
      const response = await app.inject({
        url: '/proxy-test',
        remoteAddress: peer,
        headers: {
          'x-forwarded-for': '203.0.113.8',
          'x-real-ip': '203.0.113.9',
          forwarded: 'for=203.0.113.10',
        },
      });
      expect(response.json()).toEqual({ ip: peer });
    }
    // A second purported trusted hop in a supplied chain is still an untrusted client.
    expect(
      (
        await app.inject({
          url: '/proxy-test',
          remoteAddress: '172.18.0.4',
          headers: { 'x-forwarded-for': '203.0.113.8, 172.18.0.4' },
        })
      ).json(),
    ).toEqual({ ip: '172.18.0.4' });
  } finally {
    await app.close();
  }
});
