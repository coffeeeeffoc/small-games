import { readSelection, type Selection } from './Selection.ts';
export type Invitation = { code: string; selection: Selection };
export function readInvitation(query: Record<string, unknown>): Invitation | undefined {
  if (typeof query.room !== 'string' || !/^[a-f0-9]{8}$/i.test(query.room)) return;
  return { code: query.room.toUpperCase(), selection: readSelection(JSON.stringify(query)) };
}
export function invitationQuery(code: string, selection: Selection) {
  return Object.entries({ room: code, ...selection })
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
}
export const platformSharing = () =>
  (
    globalThis as typeof globalThis & {
      __kartPlatform?: {
        serverUrl: string;
        query: Record<string, unknown>;
        onInvite?: (query: Record<string, unknown>) => void;
        setQuery(query: string): void;
        share(query: string): boolean;
      };
    }
  ).__kartPlatform;
