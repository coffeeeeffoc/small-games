import { tapLogin, tapError } from './calls.mjs';
const games = new Set(['cops-robbers', 'cops-robbers-realtime', 'xiangqi-five']);
const installed = new WeakMap();
/** Optional three-game composition. The canonical anonymous identity client stays unchanged. */
export function installTapCompetitionIdentity(root = globalThis, nativeSdk = root.tap) {
  const original = root.__createCompetitionIdentity;
  if (typeof original !== 'function') throw tapError('PLATFORM_LOGIN_UNAVAILABLE');
  if (installed.has(original) || original.__tapPlatformIdentityVersion === 1) return original;
  const instances = new WeakMap();
  const factory = (options) => {
    const config = options.config;
    if (config?.identityProvider !== 'taptap') return original(options);
    if (
      !games.has(config.game) ||
      !['h5', 'taptap'].includes(config.platform) ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(config.appId || '')
    )
      throw tapError('IDENTITY_SCOPE_MISMATCH');
    const appId = config.appId;
    let generation = 0;
    const requirePlatform = (value) => {
      if (value && (value.identityKind !== 'platform' || value.game !== config.game))
        throw tapError('IDENTITY_SCOPE_MISMATCH');
      return value;
    };
    const request = async (path, body, owner) => {
      const revision = generation;
      let result;
      if (path === '/sessions/guest') {
        const code = await tapLogin(
          config.platform === 'taptap' ? nativeSdk || options.sdk : root.tap,
        );
        if (revision !== generation) throw tapError('SESSION_CHANGED');
        result = await options.request(
          '/sessions/platform',
          { platform: 'taptap', game: config.game, appId, code },
          null,
        );
      } else result = await options.request(path, body, owner);
      if (path === '/sessions/guest' || path === '/sessions/refresh') {
        if (revision !== generation) throw tapError('SESSION_CHANGED');
        if (!result) throw tapError('PLATFORM_LOGIN_FAILED');
        requirePlatform(result);
      }
      return result;
    };
    // This marker is private to the cache authority, never sent as a MiniApp ID.
    const auth = original({
      ...options,
      config: { ...config, appId: `tap-platform-v1:${appId}` },
      ...(config.platform === 'taptap' && nativeSdk ? { storage: nativeSdk } : {}),
      request,
    });
    if (instances.has(auth)) return instances.get(auth);
    // A cached backend session cannot prove which Tap account owns this new runtime.
    // Clear it synchronously and exchange a fresh host code before exposing an owner.
    if (auth.saved()) void auth.logout().catch(() => {});
    const wrapped = {
      ...auth,
      saved: () => requirePlatform(auth.saved()),
      async current() {
        requirePlatform(auth.saved());
        return requirePlatform(await auth.current());
      },
      assertCurrent(value) {
        requirePlatform(value);
        requirePlatform(auth.saved());
        return auth.assertCurrent(value);
      },
      async forOwner(value) {
        requirePlatform(value);
        requirePlatform(auth.saved());
        return requirePlatform(await auth.forOwner(value));
      },
      logout() {
        generation++;
        return auth.logout();
      },
    };
    instances.set(auth, wrapped);
    return wrapped;
  };
  Object.defineProperty(factory, '__tapPlatformIdentityVersion', { value: 1 });
  installed.set(factory, true);
  root.__createCompetitionIdentity = factory;
  return factory;
}
