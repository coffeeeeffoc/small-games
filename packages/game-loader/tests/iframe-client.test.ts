import { describe, expect, it, vi } from 'vitest';

import type { GameDefinition, GameHost, HostMessage } from '@coffeeeeffoc/game-contract';
import { startIframeGame, type IframeClientPlatform } from '@coffeeeeffoc/game-loader';

const manifest = {
  gameId: 'cultivation',
  version: '1.0.0',
  gameContractVersion: 1 as const,
  contentSchemaVersion: 1,
  capabilities: ['content', 'storage'] as const,
  loadModes: ['in-process', 'iframe'] as const,
  entry: 'index.html',
  integrity: 'compiled-identity',
};

function fixture() {
  const parent = {} as WindowProxy;
  const posted: HostMessage[] = [];
  let listener: ((event: MessageEvent<unknown>) => void) | null = null;
  const platform: IframeClientPlatform = {
    parent,
    target: {} as HTMLElement,
    listen(next) {
      listener = next;
      return () => (listener = null);
    },
    post(message) {
      posted.push(message);
    },
  };
  return {
    parent,
    platform,
    posted,
    emit(
      data: unknown,
      origin = 'https://shell.example',
      source: MessageEventSource | null = parent,
    ) {
      listener?.({ data, origin, source } as MessageEvent<unknown>);
    },
  };
}

function event(name: string, payload: unknown = null) {
  return {
    protocolVersion: 1,
    kind: 'event',
    gameId: 'cultivation',
    sessionId: 'session-1',
    name,
    payload,
  };
}

describe('IframeGameClient', () => {
  it('disposes a late mount and cancels pending requests without reporting ready', async () => {
    const fake = fixture();
    let finishMount!: (instance: {
      pause(): void;
      resume(): void;
      dispose(): Promise<void>;
    }) => void;
    let remoteHost!: GameHost;
    const instance = { pause: vi.fn(), resume: vi.fn(), dispose: vi.fn(async () => undefined) };
    const client = startIframeGame(
      {
        manifest,
        mount: (_target, host) => {
          remoteHost = host;
          return new Promise((resolve) => {
            finishMount = resolve;
          });
        },
      },
      { shellOrigin: 'https://shell.example', platform: fake.platform },
    );
    fake.emit(
      event('init', {
        gameVersion: '1.0.0',
        releaseChannel: 'stable',
        adAuthority: 'none',
        locale: 'zh-CN',
        capabilities: ['content', 'storage'],
      }),
    );
    fake.emit(event('mount'));
    const read = remoteHost.storage.read('save');
    const cancelled = expect(read).rejects.toMatchObject({ code: 'CANCELLED' });
    const disposal = client.dispose();
    finishMount(instance);
    await disposal;
    await cancelled;
    await vi.waitFor(() => expect(instance.dispose).toHaveBeenCalledOnce());
    expect(
      fake.posted.some((message) => message.kind === 'event' && message.name === 'ready'),
    ).toBe(false);
  });

  it('reports mount failure instead of readiness', async () => {
    const fake = fixture();
    const client = startIframeGame(
      {
        manifest,
        mount: async () => {
          throw new Error('broken game');
        },
      },
      { shellOrigin: 'https://shell.example', platform: fake.platform },
    );
    fake.emit(
      event('init', {
        gameVersion: '1.0.0',
        releaseChannel: 'stable',
        adAuthority: 'none',
        locale: 'zh-CN',
        capabilities: ['content', 'storage'],
      }),
    );
    fake.emit(event('mount'));
    await vi.waitFor(() =>
      expect(fake.posted.at(-1)).toMatchObject({
        kind: 'event',
        name: 'mount-failed',
        payload: null,
      }),
    );
    await client.dispose();
  });

  it('validates init/source/origin, mounts, validates responses, and owns lifecycle', async () => {
    const fake = fixture();
    let remoteHost!: GameHost;
    const instance = { pause: vi.fn(), resume: vi.fn(), dispose: vi.fn(async () => undefined) };
    const definition: GameDefinition = {
      manifest,
      mount: vi.fn(async (_target, host) => {
        remoteHost = host;
        return instance;
      }),
    };
    const client = startIframeGame(definition, {
      shellOrigin: 'https://shell.example',
      platform: fake.platform,
    });
    const init = event('init', {
      gameVersion: '1.0.0',
      releaseChannel: 'stable',
      adAuthority: 'none',
      locale: 'zh-CN',
      capabilities: ['content', 'storage'],
    });
    fake.emit(init, 'https://evil.example');
    fake.emit(init, 'https://shell.example', {} as WindowProxy);
    fake.emit({ ...init, protocolVersion: 2 });
    expect(fake.posted).toHaveLength(0);
    fake.emit(init);
    expect(fake.posted[0]).toMatchObject({ kind: 'handshake', manifest });
    fake.emit(event('mount'));
    await vi.waitFor(() => expect(definition.mount).toHaveBeenCalledOnce());

    const read = remoteHost.storage.read('save');
    const request = fake.posted[2];
    expect(request).toMatchObject({
      kind: 'request',
      method: 'storage.read',
      params: { key: 'save' },
    });
    if (request.kind !== 'request') throw new Error('Expected request');
    fake.emit(
      {
        protocolVersion: 1,
        kind: 'response',
        gameId: 'cultivation',
        sessionId: 'wrong-session',
        id: request.id,
        result: null,
      },
      'https://shell.example',
    );
    fake.emit({
      protocolVersion: 1,
      kind: 'response',
      gameId: 'cultivation',
      sessionId: 'session-1',
      id: request.id,
      result: { value: { qi: 9 }, version: 'v1' },
    });
    await expect(read).resolves.toEqual({ value: { qi: 9 }, version: 'v1' });

    const invalidRead = remoteHost.storage.read('bad');
    const invalidRequest = fake.posted[3];
    if (invalidRequest.kind !== 'request') throw new Error('Expected request');
    fake.emit({
      protocolVersion: 1,
      kind: 'response',
      gameId: 'cultivation',
      sessionId: 'session-1',
      id: invalidRequest.id,
      result: { value: {}, version: 2 },
    });
    await expect(invalidRead).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    fake.emit(event('pause'));
    fake.emit(event('resume'));
    expect(instance.pause).toHaveBeenCalledOnce();
    expect(instance.resume).toHaveBeenCalledOnce();
    fake.emit(event('dispose'));
    await vi.waitFor(() => expect(instance.dispose).toHaveBeenCalledOnce());
    await client.dispose();
  });
});
