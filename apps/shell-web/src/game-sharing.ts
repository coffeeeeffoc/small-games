const publicParameters: Readonly<Record<string, readonly string[]>> = {
  'carding-car': ['kartChallenge', 'mode', 'theme', 'route', 'vehicle', 'driver', 'seed', 'target'],
  'cops-robbers': ['mode', 'level', 'role', 'first', 'rule'],
  'cops-robbers-realtime': ['mode', 'level', 'role', 'first', 'rule'],
  'letters-words2': ['daily', 'mini', 'v'],
  'vibeJam-myself-history-guess': ['daily', 'route', 'v', 'region', 'timed'],
  'xiangqi-five': ['challenge'],
  'travel-bund': ['route', 'renderDetail'],
  'night-overwatch': ['mission'],
  'wulong-city': ['challenge'],
};

/** Public mode parameters shared by catalog entries and same-game sharing. */
export function publicGameQuery(gameId: string, search: string): string {
  if (search.length > 2048) return '';
  const incoming = new URLSearchParams(search);
  const parameters = new URLSearchParams();
  for (const key of publicParameters[gameId] ?? []) {
    const values = incoming.getAll(key);
    if (values.length > 1 || (values[0] && !/^[A-Za-z0-9_-]{1,64}$/.test(values[0]))) return '';
    if (values[0]) parameters.set(key, values[0]);
  }
  return parameters.toString();
}

/** Share the published Game entry and its public challenge, never Shell credentials. */
export function gameShareUrl(gameId: string, entryUrl: string, currentUrl?: string): string {
  const entry = new URL(entryUrl);
  entry.search = publicGameQuery(gameId, entry.search);
  entry.hash = '';
  entry.username = '';
  entry.password = '';
  if (!currentUrl) return entry.href;
  try {
    const current = new URL(currentUrl);
    if (current.origin !== entry.origin || current.pathname !== entry.pathname) return entry.href;
    // Each Game independently validates the selected mode and its rules.
    entry.search = publicGameQuery(gameId, current.search);
  } catch {
    // A navigated or inaccessible frame still has a usable public entry.
  }
  return entry.href;
}
