import { expect, it } from 'vitest';
import { parseSnapshot, snapshotDigest } from '../src/admin/control-model.js';
import { origin } from './admin.fixture.js';
import { controlFixture, controlSnapshot } from './control.fixture.js';

it('accepts only known games and canonical public origins, with an order-stable digest', () => {
  const snapshot = controlSnapshot();
  for (const apiOrigin of [
    'null',
    '*',
    'https://*.example.com',
    'https://user:pass@api.example',
    'https://api.example/',
    'https://api.example/path',
    'https://api.example?a=1',
    'https://api.example#x',
    'https://API.EXAMPLE',
    'https://api.example:443',
    origin,
  ])
    expect(() => parseSnapshot({ ...snapshot, apiOrigins: [apiOrigin] }, origin)).toThrow();
  for (const invalid of [
    { ...snapshot, cookie: 'secret' },
    { ...snapshot, games: { ...snapshot.games, unknown: 'enabled' } },
    {
      ...snapshot,
      games: { ...snapshot.games, 'cops-robbers': { state: 'enabled', killEpoch: 1 } },
    },
    { ...snapshot, apiOrigins: ['https://api.example', 'https://api.example'] },
    { ...snapshot, games: {} },
  ])
    expect(() => parseSnapshot(invalid)).toThrow();
  expect(
    parseSnapshot({
      ...snapshot,
      apiOrigins: ['http://127.0.0.1:8080', 'https://api.example:8443'],
    }),
  ).toBeTruthy();
  const first = { ...snapshot, apiOrigins: ['https://b.example', 'https://a.example'] };
  expect(snapshotDigest(first)).toBe(
    snapshotDigest({
      ...first,
      apiOrigins: [...first.apiOrigins].reverse(),
      games: Object.fromEntries(Object.entries(first.games).reverse()) as typeof first.games,
    }),
  );
});

it('serializes CAS publishing, retains immutable drafts/history, and rollback creates a new version', async () => {
  const f = await controlFixture();
  expect(await f.service.state(f.session)).toMatchObject({
    version: 0,
    configured: false,
    snapshot: null,
    status: 'unpublished',
  });
  const snapshot = controlSnapshot();
  const [a, b] = await Promise.all([
    f.service.draft(f.session, { expectedVersion: 0, snapshot, reason: 'first' }),
    f.service.draft(f.session, { expectedVersion: 0, snapshot, reason: 'second' }),
  ]);
  const results = await Promise.allSettled([
    f.service.publish(f.session, a.id, 0),
    f.service.publish(f.session, b.id, 0),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(f.state().revisions).toHaveLength(2);
  const first = f.state().head.revisionId!;
  const draft = await f.service.draft(f.session, {
    expectedVersion: 1,
    snapshot: { ...snapshot, games: { ...snapshot.games, 'cops-robbers': 'disabled' } },
    reason: 'disable',
  });
  await expect(
    f.service.rollback(f.session, {
      revisionId: draft.id,
      expectedVersion: 1,
      reason: 'cannot rollback unpublished',
    }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await f.service.publish(f.session, draft.id, 1);
  await f.service.rollback(f.session, {
    revisionId: first,
    expectedVersion: 2,
    reason: 'restore policy',
  });
  expect(f.state().head.version).toBe(3);
  expect(f.state().revisions).toHaveLength(4);
  expect(f.state().revisions.at(-1)).toMatchObject({ rollbackOf: first, parentVersion: 2 });
  expect(f.state().revisions.find((row) => row.id === first)).toEqual(first === a.id ? a : b);
  expect(f.state().audits.filter((row) => row.action === 'revisions.publish')).toHaveLength(3);
});

it('preserves killEpoch across disabled to enabled gaps and draining; only entering disabled increments', async () => {
  const f = await controlFixture();
  for (const [index, state] of [
    'disabled',
    'disabled',
    'enabled',
    'draining',
    'disabled',
  ].entries()) {
    const snapshot = controlSnapshot();
    snapshot.games['cops-robbers'] = state as 'disabled' | 'enabled' | 'draining';
    const revision = await f.service.draft(f.session, {
      expectedVersion: index,
      snapshot,
      reason: state,
    });
    await f.service.publish(f.session, revision.id, index);
    expect(f.state().policies.find((row) => row.gameId === 'cops-robbers')!.killEpoch).toBe(
      index === 4 ? 2 : 1,
    );
    expect(f.state().policies.find((row) => row.gameId === 'xiangqi-five')!.killEpoch).toBe(0);
  }
});

it('reports desired, partial, observed and stale observations without inventing applied state', async () => {
  const f = await controlFixture();
  const draft = await f.service.draft(f.session, {
    expectedVersion: 0,
    snapshot: controlSnapshot(),
    reason: 'publish',
  });
  expect(await f.service.publish(f.session, draft.id, 0)).toMatchObject({ status: 'desired' });
  const observation = {
    instanceId: 'runtime-1',
    consumer: 'runtime' as const,
    version: 1,
    digest: draft.digest,
    status: 'applied' as const,
    observedAt: f.now(),
  };
  expect((await f.service.state(f.session)).status).toBe('desired');
  f.state().observations.push(observation);
  expect((await f.service.state(f.session)).status).toBe('partial');
  f.state().observations.push({ ...observation, consumer: 'kart', instanceId: 'kart-1' });
  expect((await f.service.state(f.session)).status).toBe('observed');
  f.state().observations.push({ ...observation, instanceId: 'runtime-2', status: 'failed' });
  expect((await f.service.state(f.session)).status).toBe('partial');
  f.advance(60_001);
  expect((await f.service.state(f.session)).status).toBe('desired');
});
