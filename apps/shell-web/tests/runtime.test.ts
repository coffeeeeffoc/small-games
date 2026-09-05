import { expect, it } from 'vitest';
import { publishedSessionSchema } from '@coffeeeeffoc/release-contract';
import { gameSessionContextSchema } from '@coffeeeeffoc/game-contract';
import {
  builtInGameRegistry,
  withPublishedSession,
  createWebGameHost,
} from '@coffeeeeffoc/shell-web';
import { FallbackGameLoader } from '@coffeeeeffoc/game-loader';

it('keeps target and same-build LKG content/session identities separate from the built-in fallback', async () => {
  const game = builtInGameRegistry[0];
  const content = { ...structuredClone(game.content), revision: 99 };
  const versionId = 'a'.repeat(64);
  const session = gameSessionContextSchema.parse({
    adAuthority: 'none',
    locale: 'zh-CN',
    gameId: game.id,
    gameVersion: game.definition.manifest.version,
    publishedVersionId: versionId,
    releaseChannel: 'canary',
    sessionId: 'runtime-session',
    capabilities: [...game.definition.manifest.capabilities],
  });
  const published = publishedSessionSchema.parse({
    session,
    entryUrl: 'https://assets.example/new.js',
    version: {
      id: versionId,
      gameId: game.id,
      content,
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
  const target = selected.remote!.target;
  const targetHost = createWebGameHost(selected, target.manifest, target);
  expect(targetHost.session.sessionId).toBe('runtime-session');
  expect(Object.isFrozen(targetHost.session)).toBe(true);
  expect((await targetHost.content.load()).revision).toBe(99);
  const lkg = {
    ...target,
    entryUrl: 'https://assets.example/old.js',
    publishedVersionId: 'f'.repeat(64),
    content: { ...content, revision: 98 },
  };
  const seen: number[] = [];
  const resolver = new FallbackGameLoader(() => ({
    async launch(artifact, _target, host) {
      seen.push((await host.content.load()).revision);
      if (artifact.entryUrl === target.entryUrl) throw new Error('corrupt');
      expect(host.session.publishedVersionId).toBe(lkg.publishedVersionId);
      expect(host.session.sessionId).not.toBe(session.sessionId);
    },
    pause() {},
    resume() {},
    dispose() {},
  }));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await resolver.launch(
      { target, lastKnownGood: lkg, builtIn: game.definition },
      document.createElement('div'),
      (manifest, candidate) => createWebGameHost(selected, manifest, candidate),
    );
    expect(result.source).toBe('last-known-good');
  }
  expect(seen).toEqual([99, 98, 99, 98, 98]);
  await resolver.dispose();
  const local = createWebGameHost(selected, game.definition.manifest);
  expect(local.session.publishedVersionId).toBeUndefined();
  expect((await local.content.load()).revision).toBe(game.content.revision);
});
