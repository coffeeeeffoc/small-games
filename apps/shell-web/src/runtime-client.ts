import {
  catalogSchema,
  publishedSessionSchema,
  sessionRequestSchema,
  type SessionRequest,
  type PublishedSession,
} from '@coffeeeeffoc/release-contract';
import type { BuiltInGame } from './registry.js';

/** Stable local guest identity; account-backed identity is added by cloud-save authentication. */
export function localPlayerId(): string {
  try {
    const stored = localStorage.getItem('runtime-player-id');
    if (
      stored &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(stored)
    )
      return stored;
    const id = crypto.randomUUID();
    localStorage.setItem('runtime-player-id', id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Published Runtime transport has no Management cookies or operator credentials. */
export function createRuntimeClient(baseUrl: string, transport: typeof fetch = fetch) {
  async function request(path: string, body?: SessionRequest) {
    const response = await transport(new URL(`/api/runtime/${path}`, baseUrl), {
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(2000),
      method: body ? 'POST' : 'GET',
      ...(body
        ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
        : {}),
    });
    if (!response.ok) throw new Error('Runtime 暂不可用或目标版本不兼容，将使用本地版本。');
    return response.json();
  }
  return {
    catalog: async () => catalogSchema.parse(await request('catalog')),
    session: async (input: SessionRequest) =>
      publishedSessionSchema.parse(await request('sessions', sessionRequestSchema.parse(input))),
  };
}

/** Converts a validated published session into the existing loader plan, preserving local fallback. */
export function withPublishedSession(game: BuiltInGame, published: PublishedSession): BuiltInGame {
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
