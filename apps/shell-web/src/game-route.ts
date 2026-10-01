import { publicGameQuery } from './game-sharing.js';

/** Hash navigation keeps the Shell's own query out of the Game frame. */
export function parseGameRoute(hash: string): { id: string; search: string } | undefined {
  const match = /^#\/games\/([^/?#]+)(?:\?([^#]*))?$/.exec(hash);
  if (!match) return undefined;
  try {
    const id = decodeURIComponent(match[1]);
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/.test(id)) return undefined;
    return { id, search: publicGameQuery(id, match[2] ?? '') };
  } catch {
    return undefined;
  }
}

export function gameRouteHash(id?: string, search = ''): string {
  if (!id) return '';
  const query = publicGameQuery(id, search);
  return `#/games/${encodeURIComponent(id)}${query ? `?${query}` : ''}`;
}
