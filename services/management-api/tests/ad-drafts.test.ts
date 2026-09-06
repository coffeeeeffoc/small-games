import { afterEach, beforeEach, expect, it } from 'vitest';
import { createService } from '@coffeeeeffoc/service-kit';
import {
  defaultManagedAdConfig,
  normalizeManagedAdConfig,
  type ManagedAdConfig,
} from '@coffeeeeffoc/ad-config';
import {
  initializeOperator,
  registerAdDrafts,
  registerAuthentication,
  type AdDraft,
  type AdDraftStore,
} from '@coffeeeeffoc/management-api';
import { memoryAuthStore } from './auth.fixture.js';

const origin = 'http://127.0.0.1:5174';
const base = {
  formatVersion: 1,
  gameId: 'cultivation',
  enabled: true,
  policy: { maxPerSession: 2 },
  creatives: [{ id: 'spring', title: '春日礼包', ctaLabel: '查看', durationMs: 5000 }],
  placements: [
    {
      opportunityId: 'cultivation.reincarnate',
      creativeId: 'spring',
      policy: { cooldownMs: 1000 },
      reward: { enabled: true, maxPerSession: 1 },
    },
  ],
};
const planned = (overrides: Record<string, unknown> = {}): ManagedAdConfig => {
  const result = normalizeManagedAdConfig({ ...base, ...overrides });
  if (!result.success) throw new Error('fixture must validate');
  return result.data;
};
let app: ReturnType<typeof createService>;
let headers: { origin: string; cookie: string };
let store: AdDraftStore;
let auth: ReturnType<typeof memoryAuthStore>;
beforeEach(async () => {
  auth = memoryAuthStore();
  await initializeOperator(auth, 'creator', 'ad-draft-test-password');
  const data = new Map<string, AdDraft>();
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
  await registerAdDrafts(app, auth, store, origin);
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin },
    payload: { username: 'creator', password: 'ad-draft-test-password' },
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
  app.inject({
    method: 'POST',
    url: '/api/ad-drafts/',
    headers,
    payload: { name: '运营广告' },
  });

it('creates a disabled plan, validates it, and rejects a stale writer without overwriting', async () => {
  const created = await create();
  expect(created.statusCode).toBe(201);
  const draft = created.json();
  // A fresh draft can never serve advertisements, and it holds no placement at all.
  expect(draft.envelope).toEqual(defaultManagedAdConfig('cultivation'));
  expect((await app.inject({ url: '/api/ad-drafts/', headers })).json()).toEqual([draft]);
  expect((await app.inject({ url: `/api/ad-drafts/${draft.id}`, headers })).json()).toEqual(draft);
  expect((await app.inject({ url: '/api/ad-drafts/not-a-uuid', headers })).statusCode).toBe(400);
  const validate = await app.inject({
    method: 'POST',
    url: '/api/ad-drafts/validate',
    headers,
    payload: planned(),
  });
  expect(validate.statusCode).toBe(200);
  expect(validate.json().data).toEqual(planned());
  const changes = ['甲', '乙'].map((name) =>
    app.inject({
      method: 'PUT',
      url: `/api/ad-drafts/${draft.id}`,
      headers,
      payload: { ...draft, name, envelope: planned() },
    }),
  );
  const responses = await Promise.all(changes);
  expect(responses.map((value) => value.statusCode).sort()).toEqual([200, 409]);
  const saved = responses.find((value) => value.statusCode === 200)!.json();
  expect(saved.revision).toBe(1);
  expect(saved.envelope).toEqual(planned());
  expect(await store.get(draft.id)).toEqual(saved);
});

it('rejects an unusable plan without saving and keeps the revision counter intact', async () => {
  const draft = (await create()).json();
  const save = (envelope: unknown) =>
    app.inject({
      method: 'PUT',
      url: `/api/ad-drafts/${draft.id}`,
      headers,
      payload: { ...draft, envelope },
    });
  const dangling = await save({
    ...base,
    placements: [{ ...base.placements[0], creativeId: 'missing' }],
  });
  expect(dangling.statusCode).toBe(422);
  expect(dangling.json().issues[0]).toEqual({
    path: ['placements', 0, 'creativeId'],
    message: '素材不存在',
  });
  const duplicated = await save({ ...base, placements: [...base.placements, ...base.placements] });
  expect(duplicated.statusCode).toBe(422);
  expect(duplicated.json().issues[0].path).toEqual(['placements', 1, 'opportunityId']);
  const shortView = await save({
    ...base,
    creatives: [{ ...base.creatives[0], durationMs: 100 }],
  });
  expect(shortView.statusCode).toBe(422);
  expect(shortView.json().issues[0].path).toEqual(['creatives', 0, 'durationMs']);
  expect((await store.get(draft.id))?.revision).toBe(0);
});

it('requires creator and trusted origin and does not expose database errors', async () => {
  expect((await app.inject('/api/ad-drafts/')).statusCode).toBe(401);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/ad-drafts/',
        headers: { ...headers, origin: 'https://evil.example' },
        payload: { name: 'bad' },
      })
    ).statusCode,
  ).toBe(403);
  const account = await auth.findAccount('creator');
  account!.roles = ['publisher'];
  expect((await app.inject({ url: '/api/ad-drafts/', headers })).statusCode).toBe(403);
  account!.roles = ['creator'];
  store.list = async () => {
    throw new Error('postgres://private-secret');
  };
  const failure = await app.inject({ url: '/api/ad-drafts/', headers });
  expect(failure.statusCode).toBe(503);
  expect(failure.body).not.toContain('private-secret');
});
