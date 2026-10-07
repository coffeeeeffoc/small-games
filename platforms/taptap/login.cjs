/* global module */
/** Native TapTap login. The server alone exchanges a login code for platform identity. */
const bootstraps = new WeakMap();
const knownErrors = new Set([
  'PLATFORM_NOT_CONFIGURED',
  'PLATFORM_LOGIN_FAILED',
  'PLATFORM_LOGIN_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMITED',
  'INVALID_INPUT',
]);

function failure(code) {
  const error = new Error(`TapTap login failed (${code}).`);
  error.code = code;
  return error;
}

function validCredential(data) {
  if (
    !data ||
    typeof data !== 'object' ||
    typeof data.token !== 'string' ||
    !/^[a-f0-9]{64}$/.test(data.token) ||
    typeof data.playerId !== 'string' ||
    !data.playerId.trim() ||
    data.playerId.length > 256 ||
    !Number.isSafeInteger(data.expiresAt) ||
    data.expiresAt <= Date.now() + 60000
  )
    return null;
  // Do not copy platform session_key, secret, or other server response fields.
  return Object.freeze({
    playerId: data.playerId,
    token: data.token,
    expiresAt: data.expiresAt,
  });
}

function apiBase(value) {
  // TapTap's JS VM has no browser URL dependency. Accept a safe HTTPS authority
  // and path, rejecting userinfo, query strings, fragments, and backslash parsing.
  const match = /^https:\/\/([A-Za-z0-9.-]+)(?::([0-9]{1,5}))?(\/[^\s?#\\]*)?$/.exec(value);
  if (
    !match ||
    !match[1]
      .split('.')
      .every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label)) ||
    (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))
  )
    throw failure('INVALID_INPUT');
  return value.replace(/\/+$/, '');
}

function observe(state, operation) {
  state.ready = Promise.resolve()
    .then(operation)
    .then(
      (credential) => {
        state.status = credential ? 'authenticated' : 'unconfigured';
        return credential;
      },
      (error) => {
        state.status = 'failed';
        state.errorCode = knownErrors.has(error?.code) ? error.code : 'PLATFORM_LOGIN_FAILED';
        throw failure(state.errorCode);
      },
    );
  // Attaching a handler makes fire-and-forget startup safe while the original
  // ready promise still rejects for consumers explicitly awaiting the result.
  state.ready.catch(() => {
    try {
      globalThis.console?.warn?.(`TapTap login failed (${state.errorCode}).`);
    } catch {
      /* A missing or unavailable native logger cannot change the login result. */
    }
  });
  return state;
}

function nativeCall(sdk, method, options, errorCode) {
  return new Promise((resolve, reject) => {
    try {
      sdk[method]({ ...options, success: resolve, fail: () => reject(failure(errorCode)) });
    } catch {
      reject(failure(errorCode));
    }
  });
}

function startTapTapLogin(tap, config = {}) {
  const state = { status: 'authenticating', ready: null, errorCode: null };
  let appId, base;
  try {
    if (!config || config.platform !== 'taptap') throw failure('INVALID_INPUT');
    appId = config.appId ?? '';
    const apiUrl = config.apiUrl ?? '';
    if (
      typeof appId !== 'string' ||
      (appId && (!/^[A-Za-z0-9_-]+$/.test(appId) || appId.length > 100)) ||
      typeof apiUrl !== 'string'
    )
      throw failure('INVALID_INPUT');
    base = apiUrl ? apiBase(apiUrl) : '';
    if (!appId || !base) {
      state.status = 'unconfigured';
      state.ready = Promise.resolve(null);
      return state;
    }
    if (!tap || typeof tap.login !== 'function' || typeof tap.request !== 'function')
      throw failure('PLATFORM_LOGIN_UNAVAILABLE');
  } catch (error) {
    return observe(state, () => {
      throw error;
    });
  }

  const key = JSON.stringify([appId, base]);
  let sessions = bootstraps.get(tap);
  if (!sessions) {
    sessions = new Map();
    bootstraps.set(tap, sessions);
  }
  const existing = sessions.get(key);
  if (existing) return existing;
  sessions.set(key, state);
  const storageKey = `competition-session-v1:taptap:${appId}`;

  return observe(state, async () => {
    let cached;
    try {
      cached = validCredential(JSON.parse(tap.getStorageSync?.(storageKey) || 'null'));
    } catch {
      /* Storage is optional; denied or corrupt storage requires a fresh login. */
    }
    if (cached) return cached;

    const login = await nativeCall(tap, 'login', { timeout: 8000 }, 'PLATFORM_LOGIN_FAILED');
    if (typeof login?.code !== 'string' || !login.code.trim() || login.code.length > 512)
      throw failure('PLATFORM_LOGIN_FAILED');
    const response = await nativeCall(
      tap,
      'request',
      {
        url: `${base}/sessions/platform`,
        method: 'POST',
        header: { 'content-type': 'application/json' },
        data: { platform: 'taptap', appId, code: login.code },
        timeout: 8000,
      },
      'SERVICE_UNAVAILABLE',
    );
    if (
      !Number.isInteger(response?.statusCode) ||
      response.statusCode < 200 ||
      response.statusCode >= 300
    )
      throw failure(
        knownErrors.has(response?.data?.error) ? response.data.error : 'PLATFORM_LOGIN_FAILED',
      );
    const credential = validCredential(response.data);
    if (!credential) throw failure('PLATFORM_LOGIN_FAILED');
    try {
      tap.setStorageSync?.(storageKey, JSON.stringify(credential));
    } catch {
      /* This authenticated session remains usable without claiming persistent storage. */
    }
    return credential;
  });
}

module.exports = { startTapTapLogin, tapTapApiBase: apiBase };
