import { describe, expect, it, vi } from 'vitest';

import type { GameDefinition, GameHost, GameManifest } from '@coffeeeeffoc/game-contract';
import {
  FallbackGameLoader,
  VersionCircuitBreaker,
  type RemoteGameArtifact,
} from '@coffeeeeffoc/game-loader';

function remote(version: string): RemoteGameArtifact {
  return {
    entryUrl: `https://games.example/cultivation/${version}/index.html`,
    manifest: {
      gameId: 'cultivation',
      version,
      gameContractVersion: 1,
      contentSchemaVersion: 1,
      capabilities: [],
      loadModes: ['iframe'],
      entry: 'index.html',
      integrity: `sha256-${version}`,
    },
  };
}

const builtIn: GameDefinition = {
  manifest: {
    gameId: 'cultivation',
    version: '1.0.0',
    gameContractVersion: 1,
    contentSchemaVersion: 1,
    capabilities: [],
    loadModes: ['in-process'],
    entry: 'index.html',
    integrity: 'builtin',
  },
  async mount(target) {
    target.textContent = 'built-in';
    return { pause: vi.fn(), resume: vi.fn(), dispose: vi.fn(async () => undefined) };
  },
};

function fakeLoader(result: 'pass' | 'fail') {
  return {
    launch: vi.fn(async () => {
      if (result === 'fail') throw new Error('broken');
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('FallbackGameLoader', () => {
  it('uses target, remembers it, and forwards lifecycle to the winner', async () => {
    const winner = fakeLoader('pass');
    const remember = vi.fn();
    const loader = new FallbackGameLoader(() => winner);
    const result = await loader.launch(
      { target: remote('3.0.0'), builtIn, rememberLastKnownGood: remember },
      { replaceChildren: vi.fn() } as unknown as HTMLElement,
      () => ({}) as GameHost,
    );
    await loader.pause();
    await loader.resume();
    await loader.dispose();
    expect(result).toEqual({ source: 'target', version: '3.0.0' });
    expect(remember).toHaveBeenCalledWith(remote('3.0.0'));
    expect(winner.pause).toHaveBeenCalledOnce();
    expect(winner.resume).toHaveBeenCalledOnce();
    expect(winner.dispose).toHaveBeenCalledOnce();
  });

  it('falls back from the target to last-known-good and then built-in', async () => {
    const failed = fakeLoader('fail');
    const lkg = fakeLoader('pass');
    const loaders = [failed, lkg];
    const resolver = new FallbackGameLoader(() => loaders.shift()!);
    const target = { replaceChildren: vi.fn(), textContent: '' } as unknown as HTMLElement;
    const fromLkg = await resolver.launch(
      { target: remote('3.0.0'), lastKnownGood: remote('2.0.0'), builtIn },
      target,
      () => ({}) as GameHost,
    );
    expect(fromLkg).toEqual({ source: 'last-known-good', version: '2.0.0' });
    await resolver.dispose();

    const allBroken = new FallbackGameLoader(() => fakeLoader('fail'));
    const fallback = await allBroken.launch(
      { target: remote('3.0.0'), lastKnownGood: remote('2.0.0'), builtIn },
      target,
      (manifest) => ({ session: { gameVersion: manifest.version } }) as GameHost,
    );
    expect(fallback).toEqual({ source: 'built-in', version: '1.0.0' });
    expect(target.textContent).toBe('built-in');
  });

  it('circuit-breaks a repeatedly failing target on later launches', async () => {
    const createRemote = vi.fn(() => fakeLoader('fail'));
    const breaker = new VersionCircuitBreaker(1, 60_000, () => 100);
    const resolver = new FallbackGameLoader(createRemote, breaker);
    const target = { replaceChildren: vi.fn(), textContent: '' } as unknown as HTMLElement;
    const plan = { target: remote('3.0.0'), builtIn };
    await expect(resolver.launch(plan, target, () => ({}) as GameHost)).resolves.toMatchObject({
      source: 'built-in',
    });
    await expect(resolver.launch(plan, target, () => ({}) as GameHost)).resolves.toMatchObject({
      source: 'built-in',
    });
    expect(createRemote).toHaveBeenCalledOnce();
  });

  it('cancels an older pending resolver launch before the newest candidate wins', async () => {
    let rejectFirst!: (error: Error) => void;
    const firstRemote = {
      ...fakeLoader('pass'),
      launch: vi.fn(() => new Promise<void>((_resolve, reject) => (rejectFirst = reject))),
      dispose: vi.fn(() => rejectFirst(new Error('disposed'))),
    };
    const secondRemote = fakeLoader('pass');
    const remotes = [firstRemote, secondRemote];
    const resolver = new FallbackGameLoader(() => remotes.shift()!);
    const target = { replaceChildren: vi.fn(), textContent: '' } as unknown as HTMLElement;
    const first = expect(
      resolver.launch({ target: remote('2.0.0'), builtIn }, target, () => ({}) as GameHost),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    await vi.waitFor(() => expect(firstRemote.launch).toHaveBeenCalledOnce());
    const second = resolver.launch(
      { target: remote('3.0.0'), builtIn },
      target,
      () => ({}) as GameHost,
    );
    await expect(second).resolves.toEqual({ source: 'target', version: '3.0.0' });
    await first;
    expect(secondRemote.launch).toHaveBeenCalledOnce();
  });
});

describe('VersionCircuitBreaker', () => {
  it('opens after consecutive failures and retries after cooldown or success', () => {
    let now = 100;
    const breaker = new VersionCircuitBreaker(2, 50, () => now);
    const manifest: GameManifest = remote('3.0.0').manifest;
    breaker.recordFailure(manifest);
    expect(breaker.isOpen(manifest)).toBe(false);
    breaker.recordFailure(manifest);
    expect(breaker.isOpen(manifest)).toBe(true);
    now = 151;
    expect(breaker.isOpen(manifest)).toBe(false);
    breaker.recordFailure(manifest);
    breaker.recordSuccess(manifest);
    expect(breaker.isOpen(manifest)).toBe(false);
  });
});
