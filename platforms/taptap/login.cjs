/* global module */
/** Native TapTap bootstrap uses the shared anonymous identity lifecycle. */
const bootstraps = new WeakMap();
const knownErrors = new Set([
  'PLATFORM_NOT_CONFIGURED',
  'PLATFORM_LOGIN_FAILED',
  'PLATFORM_LOGIN_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMITED',
  'INVALID_INPUT',
  'SESSION_EXPIRED',
  'REFRESH_EXPIRED',
  'SESSION_CHANGED',
  'IDENTITY_SCOPE_MISMATCH',
]);

function failure(code) {
  const error = new Error(`TapTap login failed (${code}).`);
  error.code = code;
  return error;
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
  state.errorCode = null;
  state.status = 'authenticating';
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
  let base;
  try {
    if (
      config?.platform !== 'taptap' ||
      typeof config.game !== 'string' ||
      !/^[a-z0-9-]{1,80}$/.test(config.game)
    )
      throw failure('INVALID_INPUT');
    if (
      typeof (config.appId ?? '') !== 'string' ||
      (config.appId && !/^[A-Za-z0-9_-]{1,100}$/.test(config.appId))
    )
      throw failure('INVALID_INPUT');
    if (typeof (config.apiUrl ?? '') !== 'string') throw failure('INVALID_INPUT');
    base = config.apiUrl ? apiBase(config.apiUrl) : '';
    if (!base) {
      state.status = 'unconfigured';
      state.ready = Promise.resolve(null);
      return state;
    }
    if (
      typeof tap?.request !== 'function' ||
      typeof globalThis.__createCompetitionIdentity !== 'function'
    )
      throw failure('PLATFORM_LOGIN_UNAVAILABLE');
  } catch (error) {
    return observe(state, () => {
      throw error;
    });
  }
  const key = JSON.stringify([config.appId || '', base, config.game]);
  let sessions = bootstraps.get(tap);
  if (!sessions) bootstraps.set(tap, (sessions = new Map()));
  const current = sessions.get(key) || state;
  sessions.set(key, current);
  const identity = globalThis.__createCompetitionIdentity({
    config: { ...config, apiUrl: base },
    sdk: tap,
    request: async (route, body) => {
      const response = await nativeCall(
        tap,
        'request',
        {
          url: base + route,
          method: 'POST',
          header: { 'content-type': 'application/json' },
          data: body,
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
          knownErrors.has(response?.data?.error) ? response.data.error : 'SERVICE_UNAVAILABLE',
        );
      const data = response.data || {};
      return Object.fromEntries(
        [
          'userId',
          'playerId',
          'identityKind',
          'game',
          'sessionId',
          'token',
          'refreshToken',
          'expiresAt',
          'refreshExpiresAt',
          'name',
          'nickname',
          'avatarId',
          'avatarPolicy',
          'profileUpdatedAt',
        ]
          .filter((field) => field in data)
          .map((field) => [field, data[field]]),
      );
    },
  });
  return observe(current, () => identity.current());
}

module.exports = { startTapTapLogin, tapTapApiBase: apiBase };
