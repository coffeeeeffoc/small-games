import { expect, it, vi } from 'vitest';
import { createService } from '@coffeeeeffoc/service-kit';
import { registerArtifactDelivery } from '@coffeeeeffoc/management-api';

it('delivers only published verified bytes with strict exposed CSP and fails closed', async () => {
  const app = createService('management', {}, false);
  const read = vi
    .fn<() => Promise<Uint8Array | undefined>>()
    .mockResolvedValue(new Uint8Array([1, 2]));
  const origin = 'http://localhost:5173';
  registerArtifactDelivery(app, read, origin);
  const url = `/published/${'a'.repeat(64)}/remote-entry.js`;
  try {
    expect(
      (await app.inject({ url, headers: { origin: 'https://evil.example' } })).statusCode,
    ).toBe(403);
    expect((await app.inject('/published/not-an-id/remote-entry.js')).statusCode).toBe(404);
    expect(read).not.toHaveBeenCalled();
    const response = await app.inject({ url, headers: { origin } });
    expect(response.rawPayload).toEqual(Buffer.from([1, 2]));
    expect(response.headers['content-security-policy']).toContain("connect-src 'none'");
    expect(response.headers['access-control-expose-headers']).toBe('content-security-policy');
    read.mockResolvedValueOnce(undefined);
    expect((await app.inject(url)).statusCode).toBe(404);
    read.mockRejectedValueOnce(new Error('private S3 error'));
    const failure = await app.inject(url);
    expect(failure.statusCode).toBe(503);
    expect(failure.body).not.toContain('private');
  } finally {
    await app.close();
  }
});
