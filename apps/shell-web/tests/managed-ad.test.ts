import { afterEach, expect, it, vi } from 'vitest';
import { normalizeManagedAdConfig, type ManagedAdConfig } from '@coffeeeeffoc/ad-config';
import { publishedSessionSchema } from '@coffeeeeffoc/release-contract';
import {
  builtInGameRegistry,
  createManagedAdProvider,
  createWebGameHost,
  withPublishedSession,
} from '@coffeeeeffoc/shell-web';

const opportunity = { id: 'cultivation.reincarnate', reward: { luck: 2 } };

function plan(): ManagedAdConfig {
  const result = normalizeManagedAdConfig({
    formatVersion: 1,
    gameId: 'cultivation',
    enabled: true,
    policy: {},
    creatives: [{ id: 'spring', title: '春日礼包', ctaLabel: '查看', durationMs: 1000 }],
    placements: [
      {
        opportunityId: opportunity.id,
        creativeId: 'spring',
        policy: {},
        reward: { enabled: true },
      },
    ],
  });
  if (!result.success) throw new Error('fixture must validate');
  return result.data;
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

it('grants a reward only after the configured full view and dismisses on early close', async () => {
  vi.useFakeTimers();
  const provider = createManagedAdProvider(plan(), { intervalMs: 100 });

  const watched = provider.show({ opportunityId: opportunity.id });
  expect(document.querySelector('.managed-ad')?.getAttribute('aria-label')).toBe('春日礼包');
  vi.advanceTimersByTime(900);
  expect(document.querySelector('.managed-ad')).not.toBeNull();
  vi.advanceTimersByTime(100);
  await expect(watched).resolves.toEqual({ status: 'completed' });
  expect(document.querySelector('.managed-ad')).toBeNull();

  const closed = provider.show({ opportunityId: opportunity.id });
  (document.querySelector('.managed-ad button') as HTMLButtonElement).click();
  await expect(closed).resolves.toEqual({ status: 'dismissed' });
  expect(document.querySelector('.managed-ad')).toBeNull();

  await expect(provider.show({ opportunityId: 'unplaced' })).resolves.toEqual({
    status: 'unavailable',
  });
  expect(document.querySelector('.managed-ad')).toBeNull();
});

it('runs published Managed Ad rules only for managed sessions', async () => {
  vi.useFakeTimers();
  const game = builtInGameRegistry[0];
  const versionId = 'a'.repeat(64);
  const advertising = plan();
  const published = publishedSessionSchema.parse({
    entryUrl: 'https://assets.example/new.js',
    session: {
      adAuthority: 'managed',
      locale: 'zh-CN',
      gameId: game.id,
      gameVersion: game.definition.manifest.version,
      publishedVersionId: versionId,
      releaseChannel: 'stable',
      sessionId: 'runtime-session',
      capabilities: [...game.definition.manifest.capabilities],
    },
    version: {
      id: versionId,
      gameId: game.id,
      advertising,
      content: structuredClone(game.content),
      artifact: {
        id: 'b'.repeat(64),
        signature: 'c'.repeat(128),
        manifest: {
          formatVersion: 1,
          game: game.definition.manifest,
          remoteEntry: 'remote-entry.js',
          signingKeyId: 'd'.repeat(64),
          resources: ['index.html', 'remote-entry.js'].map((path) => ({
            path,
            sha256: 'e'.repeat(64),
            size: 1,
          })),
        },
      },
    },
  });
  const selected = withPublishedSession(game, published);
  expect(selected.managedAdPlan).toEqual(advertising);
  const target = selected.remote!.target;
  const managed = createWebGameHost(selected, target.manifest, target);

  const offered = managed.ads.offer(opportunity);
  await Promise.resolve();
  await Promise.resolve();
  expect(document.querySelector('.managed-ad')).not.toBeNull();
  vi.advanceTimersByTime(1000);
  await expect(offered).resolves.toEqual({ status: 'completed' });

  const local = createWebGameHost(selected, game.definition.manifest);
  expect(local.session.adAuthority).toBe('none');
  await expect(local.ads.offer(opportunity)).resolves.toEqual({ status: 'unavailable' });
  expect(document.querySelector('.managed-ad')).toBeNull();
});
