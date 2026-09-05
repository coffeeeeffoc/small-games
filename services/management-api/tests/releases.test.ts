import { randomUUID, webcrypto } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createService } from '@coffeeeeffoc/service-kit';
import { buildArtifact } from '@coffeeeeffoc/game-artifact';
import { defaultCultivationEnvelope } from '@coffeeeeffoc/game-cultivation/content';
import { createPublishedVersion, projectionSchema } from '@coffeeeeffoc/release-contract';
import {
  registerAuthentication,
  initializeOperator,
  registerPublications,
  type DraftStore,
  type createPublicationStore,
} from '@coffeeeeffoc/management-api';
import { memoryAuthStore } from './auth.fixture.js';

it('requires publisher, Origin, saved revision and explicit confirmation before verified enqueue or rollback', async () => {
  const auth = memoryAuthStore();
  await initializeOperator(auth, 'publisher', 'publication-test-password');
  const account = await auth.findAccount('publisher');
  const draft = {
    id: randomUUID(),
    name: 'release',
    revision: 0,
    envelope: { ...defaultCultivationEnvelope, revision: 0 },
  };
  const drafts: DraftStore = {
    list: async () => [draft],
    get: async () => draft,
    create: async (value) => value,
    save: async (value) => value,
  };
  const keys = await webcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  if (!('privateKey' in keys)) throw new Error('Expected signing key pair');
  const resources = new Map([
    ['index.html', new Uint8Array([1])],
    ['remote-entry.js', new Uint8Array([2])],
  ]);
  const descriptor = await buildArtifact(
    {
      gameId: 'cultivation',
      version: '1.1.0',
      gameContractVersion: 1,
      contentSchemaVersion: 2,
      capabilities: ['content'],
      loadModes: ['iframe'],
      entry: 'index.html',
      integrity: 'builtin:cultivation@1.1.0',
    },
    resources,
    keys.privateKey,
    keys.publicKey,
  );
  const version = await createPublishedVersion(descriptor, draft.envelope);
  // Keep the fake at the persistence seam; real verification/normalization and route hooks run.
  const store = {
    status: async () => ({ channels: [], versions: [], events: [] }),
    getVersion: async () => version,
    getRequest: vi
      .fn<ReturnType<typeof createPublicationStore>['getRequest']>()
      .mockResolvedValue(undefined),
    enqueue: vi.fn<ReturnType<typeof createPublicationStore>['enqueue']>(async (input) =>
      projectionSchema.parse({
        formatVersion: 1,
        eventId: input.eventId,
        channel: input.channel,
        revision: 1,
        version: input.version,
      }),
    ),
    deliverOne: async () => false,
  };
  const read = vi.fn(async () => ({ descriptor, resources }));
  const app = createService('management', {}, false);
  const origin = 'http://127.0.0.1:5174';
  await registerAuthentication(app, auth, origin);
  await registerPublications(app, auth, drafts, store, origin, { read });
  try {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin },
      payload: { username: 'publisher', password: 'publication-test-password' },
    });
    const cookie = login.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');
    const input = {
      eventId: randomUUID(),
      channel: 'stable',
      expectedRevision: 0,
      confirmation: true,
      draftId: draft.id,
      draftRevision: 0,
      artifactId: descriptor.id,
    };
    const post = (payload: object, source = origin, path = '/publish') =>
      app.inject({
        method: 'POST',
        url: '/api/releases' + path,
        headers: { cookie, origin: source },
        payload,
      });
    expect((await app.inject('/api/releases/')).statusCode).toBe(401);
    expect((await post(input, 'https://evil.example')).statusCode).toBe(403);
    account!.roles = ['creator'];
    expect((await post(input)).statusCode).toBe(403);
    account!.roles = ['publisher'];
    expect((await post({ ...input, confirmation: false })).statusCode).toBe(422);
    expect((await post({ ...input, draftRevision: 1 })).statusCode).toBe(409);
    expect(store.enqueue).not.toHaveBeenCalled();
    expect((await post(input)).statusCode).toBe(202);
    expect(store.enqueue.mock.calls[0][0].actorId).toBe(account!.id);
    expect(
      (
        await post(
          {
            eventId: randomUUID(),
            channel: 'stable',
            expectedRevision: 1,
            confirmation: true,
            versionId: version.id,
          },
          origin,
          '/rollback',
        )
      ).statusCode,
    ).toBe(202);
    expect(read).toHaveBeenCalledTimes(2);
    const saved = await store.enqueue.mock.results[0].value;
    draft.revision = 1;
    read.mockRejectedValueOnce(new Error('S3 offline'));
    store.getRequest.mockResolvedValueOnce(saved);
    expect((await post(input)).json()).toEqual(saved);
    expect(store.enqueue).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledTimes(2);
  } finally {
    await app.close();
  }
});
