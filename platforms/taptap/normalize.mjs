/** Small NativeSdk overlay. Every native method retains its actual tap receiver. */
export function normalizeTapTapSdk(sdk) {
  if (!sdk || typeof sdk.createCanvas !== 'function')
    throw new Error('TapTap mini-game tap.createCanvas is unavailable');
  const overrides = {
    getSystemInfoSync() {
      // TapTap recommends the synchronous getWindowInfo API for window/safe-area data.
      // Older hosts retain the documented, NativeSdk-compatible getSystemInfoSync.
      const getInfo = sdk.getWindowInfo ?? sdk.getSystemInfoSync;
      if (typeof getInfo !== 'function')
        throw new Error('TapTap window information is unavailable');
      const info = getInfo.call(sdk);
      if (!(info?.windowWidth > 0) || !(info?.windowHeight > 0))
        throw new Error('TapTap returned invalid window information');
      return info;
    },
    getLogManager() {
      if (typeof sdk.getLogManager === 'function') return sdk.getLogManager();
      return { info: (...values) => globalThis.console.info(...values) };
    },
    exitMiniProgram(options) {
      if (typeof sdk.exitMiniProgram !== 'function') return options.fail();
      return sdk.exitMiniProgram(options);
    },
  };
  const bound = new Map();
  return new Proxy(Object.create(null), {
    get(_target, key) {
      if (Object.hasOwn(overrides, key)) return overrides[key];
      const value = Reflect.get(sdk, key, sdk);
      if (typeof value !== 'function') return value;
      if (!bound.has(key) || bound.get(key).source !== value)
        bound.set(key, { source: value, method: value.bind(sdk) });
      return bound.get(key).method;
    },
    ownKeys() {
      return [...new Set([...Reflect.ownKeys(sdk), ...Reflect.ownKeys(overrides)])];
    },
    getOwnPropertyDescriptor(_target, key) {
      if (Object.hasOwn(overrides, key) || key in sdk)
        return { configurable: true, enumerable: true };
    },
    has(_target, key) {
      return Object.hasOwn(overrides, key) || key in sdk;
    },
    set(_target, key, value) {
      return Reflect.set(sdk, key, value, sdk);
    },
  });
}
