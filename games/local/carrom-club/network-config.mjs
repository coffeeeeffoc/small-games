import { readFile } from 'node:fs/promises';

export async function multiplayerClientSource(env = process.env) {
  const release = env.COMPETITION_RELEASE_CONFIG
    ? JSON.parse(await readFile(env.COMPETITION_RELEASE_CONFIG, 'utf8'))
    : {};
  const apiUrl = release['carrom-club']?.h5?.apiUrl || env.COMPETITION_PUBLIC_API_URL || '';
  if (apiUrl) {
    let url;
    try {
      url = new URL(apiUrl);
    } catch {
      throw new Error('Competition API URL must be HTTP(S)');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error(
        'Competition API URL must be HTTP(S), without credentials or query parameters',
      );
  }
  const shared = await readFile(
    new URL('../../../platforms/competition/client.js', import.meta.url),
    'utf8',
  );
  return `globalThis.__CARROM_COMPETITION_CONFIG__=${JSON.stringify({ apiUrl })};\n${shared}`;
}
