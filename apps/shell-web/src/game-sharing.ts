const publicParameters: Readonly<Record<string, readonly string[]>> = {
  'carding-car': ['kartChallenge', 'theme', 'route', 'vehicle', 'driver', 'seed', 'target'],
  'cops-robbers': ['mode', 'level', 'role', 'first', 'rule'],
  'cops-robbers-realtime': ['mode', 'level', 'role', 'first', 'rule'],
  'letters-words2': ['daily', 'v'],
  'vibeJam-myself-history-guess': ['daily', 'v', 'region', 'timed'],
  'xiangqi-five': ['challenge'],
  'travel-bund': ['route'],
  'wulong-city': ['challenge'],
};

/** Share the published Game entry and its public challenge, never Shell credentials. */
export function gameShareUrl(gameId: string, entryUrl: string, currentUrl?: string): string {
  const entry = new URL(entryUrl);
  entry.search = '';
  entry.hash = '';
  entry.username = '';
  entry.password = '';
  if (!currentUrl) return entry.href;
  try {
    const current = new URL(currentUrl);
    if (current.origin !== entry.origin || current.pathname !== entry.pathname) return entry.href;
    const parameters = new URLSearchParams();
    for (const key of publicParameters[gameId] ?? []) {
      const values = current.searchParams.getAll(key);
      // The Game independently validates its rules. Here reject ambiguous or oversized data.
      if (values.length > 1 || (values[0] && !/^[A-Za-z0-9_-]{1,64}$/.test(values[0])))
        return entry.href;
      if (values[0]) parameters.set(key, values[0]);
    }
    entry.search = parameters.toString();
  } catch {
    // A navigated or inaccessible frame still has a usable public entry.
  }
  return entry.href;
}
