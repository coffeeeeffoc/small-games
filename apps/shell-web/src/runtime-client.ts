import {
  catalogSchema,
  publishedSessionSchema,
  saveRecordSchema,
  saveVersionSchema,
  saveWriteSchema,
  sessionRequestSchema,
  type SessionRequest,
  type PublishedSession,
} from '@coffeeeeffoc/release-contract';
import { HostError, type StoragePort } from '@coffeeeeffoc/game-contract';
import type { BuiltInGame } from './registry.js';

export type PlayerCredential = Readonly<{ playerId: string; playerToken: string }>;
const playerIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const playerTokenPattern = /^[a-f0-9]{64}$/;
const playerCredentialKey = 'runtime-player-credential';

/** Opaque possession credential paired with the local or account-backed player identity. */
function newPlayerToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function validCredential(value: unknown): value is PlayerCredential {
  const candidate = value as Partial<PlayerCredential> | null;
  return (
    !!candidate &&
    typeof candidate.playerId === 'string' &&
    playerIdPattern.test(candidate.playerId) &&
    typeof candidate.playerToken === 'string' &&
    playerTokenPattern.test(candidate.playerToken)
  );
}

export function savePlayerCredential(credential: PlayerCredential): void {
  if (!validCredential(credential)) throw new Error('Invalid cloud-save login code');
  localStorage.setItem(playerCredentialKey, JSON.stringify(credential));
}

/** Stable guest credential that can be copied to another browser as a login code. */
export function localPlayerCredential(): PlayerCredential {
  try {
    const stored = JSON.parse(localStorage.getItem(playerCredentialKey) ?? 'null') as unknown;
    if (validCredential(stored)) return stored;
    const legacy = {
      playerId: localStorage.getItem('runtime-player-id'),
      playerToken: localStorage.getItem('runtime-player-token'),
    };
    const credential = validCredential(legacy)
      ? legacy
      : { playerId: crypto.randomUUID(), playerToken: newPlayerToken() };
    savePlayerCredential(credential);
    localStorage.removeItem('runtime-player-id');
    localStorage.removeItem('runtime-player-token');
    return credential;
  } catch {
    return { playerId: crypto.randomUUID(), playerToken: newPlayerToken() };
  }
}

export const playerLoginCode = ({ playerId, playerToken }: PlayerCredential) =>
  `${playerId}.${playerToken}`;

export function parsePlayerLoginCode(value: string): PlayerCredential | null {
  const [playerId, playerToken, extra] = value.trim().toLowerCase().split('.');
  const credential = { playerId, playerToken };
  return !extra && validCredential(credential) ? credential : null;
}

export const unavailableRuntimeStorage: StoragePort = {
  read: () =>
    Promise.reject(
      new HostError({ code: 'OFFLINE', message: 'Runtime is offline', retryable: true }),
    ),
  write: () =>
    Promise.reject(
      new HostError({ code: 'OFFLINE', message: 'Runtime is offline', retryable: true }),
    ),
};

/** Published Runtime transport has no Management cookies or operator credentials. */
export function createRuntimeClient(baseUrl: string, transport: typeof fetch = fetch) {
  async function send(path: string, init: RequestInit = {}) {
    const response = await transport(new URL(`/api/runtime/${path}`, baseUrl), {
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(2000),
      ...init,
    });
    return response;
  }
  async function request(path: string, body?: SessionRequest) {
    const response = await send(
      path,
      body
        ? {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }
        : undefined,
    );
    if (!response.ok) throw new Error('Runtime 暂不可用或目标版本不兼容，将使用本地版本。');
    return response.json();
  }
  return {
    catalog: async () => catalogSchema.parse(await request('catalog')),
    session: async (input: SessionRequest, playerToken: string) => {
      const body = sessionRequestSchema.parse(input);
      const response = await send('sessions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${playerToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('Runtime 暂不可用或玩家身份无效，将使用本地版本。');
      return publishedSessionSchema.parse(await response.json());
    },
    storage(sessionId: string): StoragePort {
      const headers = { 'content-type': 'application/json', 'x-game-session-id': sessionId };
      async function saveRequest(key: string, init?: RequestInit) {
        try {
          return await send(`saves/${encodeURIComponent(key)}`, { headers, ...init });
        } catch {
          throw new HostError({ code: 'OFFLINE', message: 'Runtime is offline', retryable: true });
        }
      }
      return {
        async read(key) {
          const response = await saveRequest(key);
          if (response.status === 404) return null;
          if (!response.ok)
            throw new HostError({
              code: 'UNAVAILABLE',
              message: 'Cloud save is unavailable',
              retryable: true,
            });
          return saveRecordSchema.parse(await response.json());
        },
        async write(key, value, expectedVersion) {
          const input = saveWriteSchema.parse({ value, expectedVersion });
          const response = await saveRequest(key, {
            method: 'PUT',
            body: JSON.stringify(input),
          });
          if (response.status === 409) {
            const payload = (await response.json()) as { actualVersion?: unknown };
            const actualVersion = saveVersionSchema.nullable().safeParse(payload.actualVersion);
            throw new HostError({
              code: 'CONFLICT',
              message: 'Cloud save changed since it was read',
              details: { actualVersion: actualVersion.success ? actualVersion.data : null },
            });
          }
          if (!response.ok)
            throw new HostError({
              code: 'UNAVAILABLE',
              message: 'Cloud save is unavailable',
              retryable: true,
            });
          return saveRecordSchema.parse(await response.json());
        },
      };
    },
  };
}

/** Converts a validated published session into the existing loader plan, preserving local fallback. */
export function withPublishedSession(
  game: BuiltInGame,
  published: PublishedSession,
  runtimeStorage?: StoragePort,
  playerId?: string,
): BuiltInGame {
  const checked = publishedSessionSchema.parse(published);
  if (checked.version.gameId !== game.id) throw new Error('Catalog Game identity mismatch');
  const resource = checked.version.artifact.manifest.resources.find(
    (entry) => entry.path === checked.version.artifact.manifest.remoteEntry,
  );
  if (!resource) throw new Error('Missing remote entry');
  const bytes = resource.sha256.match(/../g)!.map((value) => Number.parseInt(value, 16));
  return {
    ...game,
    runtimeSession: checked.session,
    runtimeStorage,
    playerId,
    remote: {
      target: {
        entryUrl: checked.entryUrl,
        manifest: {
          ...checked.version.artifact.manifest.game,
          integrity: `sha256-${btoa(String.fromCharCode(...bytes))}`,
        },
        publishedVersionId: checked.version.id,
        content: checked.version.content,
      },
    },
  };
}
