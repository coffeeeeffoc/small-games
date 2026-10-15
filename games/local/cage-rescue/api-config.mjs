/** Static hosting may provide an external gateway; page-injected config wins. */
export function competitionConfigScript(value = process.env.COMPETITION_PUBLIC_API_URL) {
  if (!value) return '';
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('COMPETITION_PUBLIC_API_URL must be an HTTP(S) base URL.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      'COMPETITION_PUBLIC_API_URL must be an HTTP(S) base URL without credentials, query or fragment.',
    );
  const encoded = JSON.stringify(url.href.replace(/\/$/, '')).replace(/</g, '\\u003c');
  return `globalThis.__COMPETITION_CONFIG__ = Object.assign({apiUrl:${encoded}}, globalThis.__COMPETITION_CONFIG__ || {});\n`;
}

export function competitionBootstrapSource(value = process.env.COMPETITION_PUBLIC_API_URL) {
  return competitionConfigScript(value) || '// Use the same-origin game service gateway.\n';
}
