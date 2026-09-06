import { expect, it, vi } from 'vitest';
import { createService } from '@coffeeeeffoc/service-kit';
import {
  initializeOperator,
  registerAuthentication,
  registerProtection,
  type createProtectionStore,
} from '@coffeeeeffoc/management-api';
import { memoryAuthStore } from './auth.fixture.js';

it('shows Artifact impact, rejects references, and requires explicit cleanup confirmation', async () => {
  const auth = memoryAuthStore();
  await initializeOperator(auth, 'admin', 'protection-test-password');
  const cleanupArtifact = vi
    .fn<ReturnType<typeof createProtectionStore>['cleanupArtifact']>()
    .mockResolvedValueOnce({
      artifactId: 'a'.repeat(64),
      objectCount: 2,
      versions: ['v1'],
      channels: [],
      keys: [],
      blocked: true,
    })
    .mockResolvedValueOnce({
      artifactId: 'b'.repeat(64),
      objectCount: 2,
      versions: [],
      channels: [],
      keys: ['one', 'two'],
      confirmationRequired: true,
    })
    .mockResolvedValueOnce({
      artifactId: 'b'.repeat(64),
      objectCount: 2,
      versions: [],
      channels: [],
      keys: ['one', 'two'],
      removed: true,
    });
  const app = createService('management', {}, false);
  const origin = 'http://127.0.0.1:5174';
  await registerAuthentication(app, auth, origin);
  await registerProtection(
    app,
    auth,
    {
      artifactImpact: async () => ({
        artifactId: '',
        objectCount: 0,
        versions: [],
        channels: [],
        keys: [],
      }),
      cleanupArtifact,
    },
    origin,
  );
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin },
    payload: { username: 'admin', password: 'protection-test-password' },
  });
  const headers = {
    origin,
    cookie: login.cookies.map(({ name, value }) => `${name}=${value}`).join('; '),
  };
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `/api/protection/artifacts/${'a'.repeat(64)}/cleanup`,
        headers,
        payload: {},
      })
    ).statusCode,
  ).toBe(409);
  const preview = await app.inject({
    method: 'POST',
    url: `/api/protection/artifacts/${'b'.repeat(64)}/cleanup`,
    headers,
    payload: {},
  });
  expect(preview.json()).toMatchObject({ objectCount: 2, confirmationRequired: true });
  const removed = await app.inject({
    method: 'POST',
    url: `/api/protection/artifacts/${'b'.repeat(64)}/cleanup`,
    headers,
    payload: { confirmation: true },
  });
  expect(removed.json()).toMatchObject({ removed: true });
  expect(cleanupArtifact.mock.calls.map((call) => call[2])).toEqual([false, false, true]);
  await app.close();
});
