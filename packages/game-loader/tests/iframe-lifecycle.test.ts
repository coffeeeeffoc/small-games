import { describe, expect, it, vi } from 'vitest';
import type { GameHost, GameInstance, HostMessage } from '@coffeeeeffoc/game-contract';
import { IframeGameLoader, startIframeGame, type IframePlatform } from '@coffeeeeffoc/game-loader';
import { artifact, host, manifest } from './iframe.fixture.js';

function bridge(instance: (host: GameHost) => GameInstance | Promise<GameInstance>) {
  const parent = {} as WindowProxy;
  const child = {} as WindowProxy;
  let parentListener: ((event: MessageEvent<unknown>) => void) | null = null;
  let childListener: ((event: MessageEvent<unknown>) => void) | null = null;
  let dropAcknowledgements = false;
  const remove = vi.fn(() => {
    childListener = null;
  });
  const platform: IframePlatform = {
    fetchArtifact: async () => ({
      body: new ArrayBuffer(1),
      csp: "default-src 'none'; script-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors https://shell.example",
    }),
    sha256: async () => 'sha256-good',
    listen(listener) {
      parentListener = listener;
      return () => {
        if (parentListener === listener) parentListener = null;
      };
    },
    createFrame() {
      startIframeGame(
        { manifest, mount: async (_target, remoteHost) => instance(remoteHost) },
        {
          shellOrigin: 'https://shell.example',
          platform: {
            parent,
            target: {} as HTMLElement,
            listen(listener) {
              childListener = listener;
              return () => {
                childListener = null;
              };
            },
            post(data: HostMessage) {
              if (
                dropAcknowledgements &&
                data.kind === 'event' &&
                data.name === 'lifecycle-complete'
              )
                return;
              queueMicrotask(() =>
                parentListener?.({ data, origin: 'null', source: child } as MessageEvent<unknown>),
              );
            },
          },
        },
      );
      return {
        source: child,
        remove,
        post(data: HostMessage) {
          queueMicrotask(() =>
            childListener?.({
              data,
              origin: 'https://shell.example',
              source: parent,
            } as MessageEvent<unknown>),
          );
        },
      };
    },
  };
  const loader = new IframeGameLoader({
    platform,
    shellOrigin: 'https://shell.example',
    timeoutMs: 100,
  });
  return {
    loader,
    remove,
    dropAcknowledgements: () => {
      dropAcknowledgements = true;
    },
  };
}

describe('paired iframe lifecycle protocol', () => {
  it('keeps the frame alive when cancellation races an unresolved mount', async () => {
    let finish!: (instance: GameInstance) => void;
    let started!: () => void;
    const mounting = new Promise<GameInstance>((resolve) => {
      finish = resolve;
    });
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    const instance = { pause() {}, resume() {}, dispose: vi.fn(async () => undefined) };
    const fake = bridge(() => {
      started();
      return mounting;
    });
    const launch = expect(
      fake.loader.launch(artifact, {} as HTMLElement, host()),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    await began;
    const disposal = fake.loader.dispose();
    await Promise.resolve();
    expect(fake.remove).not.toHaveBeenCalled();
    finish(instance);
    await disposal;
    await launch;
    expect(instance.dispose).toHaveBeenCalledOnce();
    expect(fake.remove).toHaveBeenCalledOnce();
  });

  it('forces removal if a cancelled mount never settles', async () => {
    let started!: () => void;
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    const fake = bridge(() => {
      started();
      return new Promise<GameInstance>(() => undefined);
    });
    const launch = expect(
      fake.loader.launch(artifact, {} as HTMLElement, host()),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    await began;
    await expect(fake.loader.dispose()).rejects.toMatchObject({ code: 'TIMEOUT' });
    await launch;
    expect(fake.remove).toHaveBeenCalledOnce();
  });

  it('awaits remote disposal including final Host RPC before removing the frame', async () => {
    let finish!: () => void;
    const cleanup = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const gameHost = host();
    const fake = bridge((remoteHost) => ({
      pause() {},
      resume() {},
      async dispose() {
        await cleanup;
        await remoteHost.storage.write('save', { qi: 42 });
      },
    }));
    await fake.loader.launch(artifact, {} as HTMLElement, gameHost);
    const disposal = fake.loader.dispose();
    await Promise.resolve();
    expect(fake.remove).not.toHaveBeenCalled();
    finish();
    await disposal;
    expect(gameHost.storage.write).toHaveBeenCalledWith('save', { qi: 42 }, undefined);
    expect(fake.remove).toHaveBeenCalledOnce();
  });

  it('propagates throwing pause and resume to the Shell-facing loader', async () => {
    const fake = bridge(() => ({
      pause() {
        throw new Error('pause failed');
      },
      resume() {
        throw new Error('resume failed');
      },
      async dispose() {},
    }));
    await fake.loader.launch(artifact, {} as HTMLElement, host());
    await expect(fake.loader.pause()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(fake.loader.resume()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await fake.loader.dispose();
    expect(fake.remove).toHaveBeenCalledOnce();
  });

  it('bounds missing disposal acknowledgements and still removes the frame', async () => {
    const fake = bridge(() => ({ pause() {}, resume() {}, async dispose() {} }));
    await fake.loader.launch(artifact, {} as HTMLElement, host());
    fake.dropAcknowledgements();
    await expect(fake.loader.dispose()).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(fake.remove).toHaveBeenCalledOnce();
    await fake.loader.dispose();
  });
});
