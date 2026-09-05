import { vi } from 'vitest';

import type { GameHost, HostMessage } from '@coffeeeeffoc/game-contract';
import type { IframePlatform, RemoteGameArtifact } from '@coffeeeeffoc/game-loader';

export const manifest = {
  gameId: 'cultivation',
  version: '2.0.0',
  gameContractVersion: 1 as const,
  contentSchemaVersion: 1,
  capabilities: ['content', 'storage'] as const,
  loadModes: ['iframe'] as const,
  entry: 'index.html',
  integrity: 'sha256-good',
};

export const artifact: RemoteGameArtifact = {
  entryUrl: 'https://games.example/cultivation/2.0.0/index.html',
  manifest,
};

export function host(): GameHost {
  return {
    session: {
      gameId: 'cultivation',
      gameVersion: '2.0.0',
      releaseChannel: 'stable',
      adAuthority: 'none',
      sessionId: 'session-1',
      locale: 'zh-CN',
      capabilities: ['content', 'storage'],
    },
    content: {
      load: vi.fn(async () => ({
        gameId: 'cultivation',
        schemaVersion: 1,
        revision: 1,
        payload: {},
      })),
    },
    storage: {
      read: vi.fn(async () => ({ value: { qi: 7 }, version: 'v1' })),
      write: vi.fn(async (_key, value) => ({ value, version: 'v2' })),
    },
    ads: { offer: vi.fn(async () => ({ status: 'unavailable' as const })) },
    telemetry: { track: vi.fn(async () => undefined) },
    navigation: { navigate: vi.fn(async () => undefined) },
  };
}

export function fakePlatform(overrides: Partial<IframePlatform> = {}, acknowledgeLifecycle = true) {
  const source = {} as WindowProxy;
  const posted: HostMessage[] = [];
  let listener: ((event: MessageEvent<unknown>) => void) | null = null;
  const remove = vi.fn();
  const platform: IframePlatform = {
    fetchArtifact: vi.fn(async () => ({
      body: new ArrayBuffer(1),
      csp: "default-src 'none'; script-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors https://shell.example",
    })),
    sha256: vi.fn(async () => 'sha256-good'),
    createFrame: vi.fn(() => ({
      source,
      post: (message: HostMessage) => {
        posted.push(message);
        if (
          acknowledgeLifecycle &&
          message.kind === 'event' &&
          message.payload &&
          typeof message.payload === 'object' &&
          'requestId' in message.payload
        ) {
          listener?.({
            data: { ...message, name: 'lifecycle-complete' },
            origin: 'null',
            source,
          } as MessageEvent<unknown>);
        }
      },
      remove,
    })),
    listen: vi.fn((next) => {
      listener = next;
      return () => {
        if (listener === next) listener = null;
      };
    }),
    ...overrides,
  };
  return {
    platform,
    posted,
    remove,
    emit(data: unknown, origin = 'null', eventSource: MessageEventSource | null = source) {
      listener?.({ data, origin, source: eventSource } as MessageEvent<unknown>);
      if (
        origin === 'null' &&
        eventSource === source &&
        (data as { kind?: string }).kind === 'handshake'
      )
        listener?.({
          data: {
            protocolVersion: 1,
            kind: 'event',
            gameId: 'cultivation',
            sessionId: 'session-1',
            name: 'ready',
            payload: null,
          },
          origin,
          source: eventSource,
        } as MessageEvent<unknown>);
    },
    hasListener: () => listener !== null,
  };
}

export function handshake() {
  return {
    protocolVersion: 1,
    kind: 'handshake',
    gameId: 'cultivation',
    sessionId: 'session-1',
    manifest,
  } as const;
}
