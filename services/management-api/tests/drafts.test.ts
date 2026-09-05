import { afterEach, beforeEach, expect, it } from 'vitest';
import { createService } from '@coffeeeeffoc/service-kit';
import {
  registerAuthentication,
  registerDrafts,
  initializeOperator,
  type ContentDraft,
  type DraftStore,
} from '@coffeeeeffoc/management-api';
import { memoryAuthStore } from './auth.fixture.js';

const origin = 'http://127.0.0.1:5174';
let app: ReturnType<typeof createService>;
let headers: { origin: string; cookie: string };
let store: DraftStore;
let auth: ReturnType<typeof memoryAuthStore>;
beforeEach(async () => {
  auth = memoryAuthStore();
  await initializeOperator(auth, 'creator', 'draft-test-password');
  const data = new Map<string, ContentDraft>();
  store = {
    list: async () => [...data.values()],
    get: async (id) => data.get(id),
    create: async (draft) => {
      data.set(draft.id, draft);
      return draft;
    },
    save: async (draft) => {
      const old = data.get(draft.id);
      if (old?.revision !== draft.revision) return undefined;
      const saved = { ...draft, revision: draft.revision + 1 };
      data.set(draft.id, saved);
      return saved;
    },
  };
  app = createService('management', {}, false);
  await registerAuthentication(app, auth, origin);
  await registerDrafts(app, auth, store, origin);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin },
    payload: { username: 'creator', password: 'draft-test-password' },
  });
  headers = {
    origin,
    cookie: login.cookies.map((value) => `${value.name}=${value.value}`).join('; '),
  };
});
afterEach(async () => {
  await app.close();
});
const create = () =>
  app.inject({ method: 'POST', url: '/api/drafts/', headers, payload: { name: '初稿' } });
it('creates, lists, reads, validates, saves, and rejects a stale writer without overwriting', async () => {
  const created = await create();
  expect(created.statusCode).toBe(201);
  const draft = created.json();
  expect((await app.inject({ url: '/api/drafts/', headers })).json()).toEqual([draft]);
  expect((await app.inject({ url: `/api/drafts/${draft.id}`, headers })).json()).toEqual(draft);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/drafts/validate',
        headers,
        payload: draft.envelope,
      })
    ).statusCode,
  ).toBe(200);
  const changes = ['甲', '乙'].map((name) =>
    app.inject({
      method: 'PUT',
      url: `/api/drafts/${draft.id}`,
      headers,
      payload: { ...draft, name },
    }),
  );
  const responses = await Promise.all(changes);
  expect(responses.map((value) => value.statusCode).sort()).toEqual([200, 409]);
  const saved = responses.find((value) => value.statusCode === 200)!.json();
  expect(saved.revision).toBe(1);
  expect(saved.envelope.revision).toBe(1);
  expect(await store.get(draft.id)).toEqual(saved);
});
it('rejects invalid fields without saving and migrates v1 on save', async () => {
  const draft = (await create()).json();
  draft.envelope.payload.events[0].title = '';
  const invalid = await app.inject({
    method: 'PUT',
    url: `/api/drafts/${draft.id}`,
    headers,
    payload: draft,
  });
  expect(invalid.statusCode).toBe(422);
  expect(invalid.json().issues[0].path).toEqual(['payload', 'events', 0, 'title']);
  expect((await store.get(draft.id))?.revision).toBe(0);
  draft.envelope.payload.events[0].title = '旧稿';
  draft.envelope.schemaVersion = 1;
  delete draft.envelope.payload.title;
  const migrated = await app.inject({
    method: 'PUT',
    url: `/api/drafts/${draft.id}`,
    headers,
    payload: draft,
  });
  expect(migrated.statusCode).toBe(200);
  expect(migrated.json().envelope.schemaVersion).toBe(2);
  expect(migrated.json().envelope.payload.title).toBe('三分钟修仙');
});
it('requires creator and trusted origin and does not expose database errors', async () => {
  expect((await app.inject('/api/drafts/')).statusCode).toBe(401);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/drafts/',
        headers: { ...headers, origin: 'https://evil.example' },
        payload: { name: 'bad' },
      })
    ).statusCode,
  ).toBe(403);
  const account = await auth.findAccount('creator');
  account!.roles = ['admin'];
  expect((await app.inject({ url: '/api/drafts/', headers })).statusCode).toBe(403);
  account!.roles = ['creator'];
  store.list = async () => {
    throw new Error('postgres://private-secret');
  };
  const failure = await app.inject({ url: '/api/drafts/', headers });
  expect(failure.statusCode).toBe(503);
  expect(failure.body).not.toContain('private-secret');
});
