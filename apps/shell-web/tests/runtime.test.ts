import { expect, it, vi } from 'vitest';
import { publishedSessionSchema } from '@coffeeeeffoc/release-contract';
import { gameSessionContextSchema } from '@coffeeeeffoc/game-contract';
import {
  builtInGameRegistry,
  withPublishedSession,
  createWebGameHost,
  createRuntimeClient,
  localPlayerCredential,
  parsePlayerLoginCode,
  playerLoginCode,
  savePlayerCredential,
  unavailableRuntimeStorage,
} from '@coffeeeeffoc/shell-web';
import { FallbackGameLoader } from '@coffeeeeffoc/game-loader';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';

it('stores a transferable cloud-save credential atomically', () => {
  localStorage.clear();
  const credential = {
    playerId: crypto.randomUUID(),
    playerToken: 'a'.repeat(64),
  };
  savePlayerCredential(credential);

  expect(localPlayerCredential()).toEqual(credential);
  expect(parsePlayerLoginCode(playerLoginCode(credential))).toEqual(credential);
  expect(parsePlayerLoginCode('not-a-login-code')).toBeNull();
});

it('maps Runtime cloud-save responses to StoragePort without exposing transport to a Game', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(Response.json({ value: { cultivationChapter: 2 }, version: '1' }))
    .mockResolvedValueOnce(
      Response.json({ error: 'SAVE_CONFLICT', actualVersion: '2' }, { status: 409 }),
    );
  const sessionId = crypto.randomUUID();
  const storage = createRuntimeClient('https://runtime.example', transport).storage(sessionId);

  await expect(storage.read('save')).resolves.toBeNull();
  await expect(storage.write('save', { cultivationChapter: 2 }, null)).resolves.toEqual({
    value: { cultivationChapter: 2 },
    version: '1',
  });
  await expect(storage.write('save', { cultivationChapter: 3 }, '1')).rejects.toMatchObject({
    code: 'CONFLICT',
    details: { actualVersion: '2' },
  });
  expect(transport.mock.calls[1]?.[1]).toMatchObject({
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-game-session-id': sessionId },
  });
});

it('isolates local fallback by player and syncs a write made before Runtime recovers', async () => {
  localStorage.clear();
  const game = builtInGameRegistry[0];
  const playerId = crypto.randomUUID();
  const offline = createWebGameHost({
    ...game,
    playerId,
    runtimeStorage: unavailableRuntimeStorage,
  });
  await offline.storage.write('save', { cultivationChapter: 2 }, null);

  const otherPlayer = createWebGameHost({
    ...game,
    playerId: crypto.randomUUID(),
    runtimeStorage: unavailableRuntimeStorage,
  });
  await expect(otherPlayer.storage.read('save')).resolves.toBeNull();

  const remote = createInMemoryGameHost().storage;
  const recovered = createWebGameHost({ ...game, playerId, runtimeStorage: remote });
  await expect(recovered.storage.read('save')).resolves.toMatchObject({
    value: { cultivationChapter: 2 },
    version: '1',
  });
});

it('moves an existing unscoped browser save into the first player account and cloud', async () => {
  localStorage.clear();
  localStorage.setItem(
    'small-games:save',
    JSON.stringify({ value: { cultivationChapter: 7 }, version: '3' }),
  );
  const playerId = crypto.randomUUID();
  const remote = createInMemoryGameHost().storage;
  const host = createWebGameHost({
    ...builtInGameRegistry[0],
    playerId,
    runtimeStorage: remote,
  });

  await expect(host.storage.read('save')).resolves.toMatchObject({
    value: { cultivationChapter: 7 },
    version: 'local:1',
  });
  const otherPlayer = createWebGameHost({
    ...builtInGameRegistry[0],
    playerId: crypto.randomUUID(),
    runtimeStorage: unavailableRuntimeStorage,
  });
  await expect(otherPlayer.storage.read('save')).resolves.toBeNull();
  await expect(host.storage.read('save')).resolves.toMatchObject({ version: '1' });
  await expect(remote.read('save')).resolves.toMatchObject({
    value: { cultivationChapter: 7 },
  });
});

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
