/** Publish only a public, explicit API endpoint paired with this platform's AppID. */
export function nativeCompetitionConfiguration({ enabled, platform, appId, preview, apiUrl }) {
  if (!enabled || !appId || !apiUrl) return null;
  if (typeof apiUrl !== 'string') throw new Error('Invalid native competition API URL');
  const url = new URL(apiUrl);
  const localPreview =
    preview &&
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !localPreview) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Native competition needs HTTPS; preview permits loopback HTTP only');
  return { platform, appId, apiUrl: url.href.replace(/\/$/, '') };
}
