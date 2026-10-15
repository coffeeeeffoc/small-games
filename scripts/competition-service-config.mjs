export const serviceGames = ['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'];

/** Only public client configuration belongs here. Disabled builds discard every URL. */
export function competitionService({ env = process.env, apiUrl, local = false } = {}) {
  const flag = env.COMPETITION_SERVICE_ENABLED ?? '0';
  if (!['0', '1'].includes(flag)) throw new Error('COMPETITION_SERVICE_ENABLED must be 0 or 1');
  if (flag === '0') return { competitionEnabled: false, apiUrl: '' };
  const value = apiUrl ?? env.COMPETITION_PUBLIC_API_URL ?? '';
  if (!value)
    throw new Error('Service enabled: set COMPETITION_PUBLIC_API_URL (or channel API_URL)');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Competition service requires an HTTP(S) URL');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(local && loopback && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /[\\\s<>?#]/.test(value)
  )
    throw new Error(
      'Competition service requires HTTPS (local previews allow loopback HTTP), without credentials, query or fragment',
    );
  return { competitionEnabled: true, apiUrl: url.href.replace(/\/+$/, '') };
}

export function serviceEnvironment(args = [], env = process.env) {
  const on = args.includes('--with-service'),
    off = args.includes('--without-service');
  if (on && off) throw new Error('Choose --with-service or --without-service');
  return { ...env, ...(on || off ? { COMPETITION_SERVICE_ENABLED: on ? '1' : '0' } : {}) };
}
