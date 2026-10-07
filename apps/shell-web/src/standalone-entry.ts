import '../dev-mode.js';
import { publicGameQuery } from './game-sharing.js';

/** Keep Catalog links, frames and independent navigation on the same Game entry. */
export function standaloneGameEntry(id: string, search = ''): string {
  const parameters = new URLSearchParams(publicGameQuery(id, search));
  const incoming = new URLSearchParams(search);
  if (incoming.has('dev')) parameters.set('dev', incoming.get('dev') ?? '');
  const query = window.SmallGamesDev.withMode(parameters.toString());
  return `${import.meta.env.BASE_URL}games/${id}/index.html${query ? `?${query}` : ''}`;
}
