/** Shared by H5 and native entries; no origin fallback for optional services. */
export function competitionAvailable(config = globalThis.__COMPETITION_CONFIG__) {
  return config?.competitionEnabled === true && /^https?:\/\//.test(config.apiUrl || '');
}
