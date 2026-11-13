import { expect, it, vi } from 'vitest';
import { readNightRuntime, validateRuntimeOrigin } from '../src/admin/night-runtime.js';

const report = {
  instanceId: 'primary',
  ranked: { current: 'solo-v18', supported: ['solo-v18', 'solo-v17'] },
  multiplayer: { current: 'duel-v11', supported: ['duel-v11', 'duel-v10'] },
};
it('reads real rules with a deadline, prohibits redirects, and marks uncovered active instances', async () => {
  const request = vi.fn<typeof fetch>(async () => Response.json(report));
  const observation = {
    consumer: 'runtime' as const,
    instanceId: 'other',
    observedAt: 100_000,
    version: 1,
    digest: 'a'.repeat(64),
    status: 'applied' as const,
  };
  const result = await readNightRuntime(
    'http://runtime:43002',
    [observation, { ...observation, instanceId: 'expired', observedAt: 1 }],
    () => 100_001,
    request,
  );
  expect(result).toEqual({ checkedAt: 100_001, report, error: null, otherInstances: ['other'] });
  expect(request).toHaveBeenCalledWith(
    'http://runtime:43002/health/night-rules',
    expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }),
  );
});
it('keeps unconfigured, old, invalid and unreachable services unknown without leaking responses', async () => {
  const request = vi.fn<typeof fetch>(async () => {
    throw Error('private-host-secret');
  });
  expect((await readNightRuntime(undefined, [], Date.now, request)).error).toBe('NOT_CONFIGURED');
  expect(request).not.toHaveBeenCalled();
  expect((await readNightRuntime('http://runtime:43002', [], Date.now, request)).report).toBeNull();
  for (const response of [
    new Response('old service', { status: 404 }),
    Response.json({ ...report, ranked: { current: 'solo-v18', supported: ['solo-v17'] } }),
    Response.json({ ...report, secret: 'private' }),
  ]) {
    request.mockResolvedValueOnce(response);
    expect(await readNightRuntime('http://runtime:43002', [], Date.now, request)).toMatchObject({
      report: null,
      error: 'UNAVAILABLE',
    });
  }
  for (const url of [
    'file:///tmp',
    'http://name:secret@runtime:43002',
    'http://runtime:43002/path',
  ])
    expect(() => validateRuntimeOrigin(url)).toThrow('ADMIN_RUNTIME_ORIGIN');
});
