/** Normalize only documented Alipay mini-game APIs, never a browser or wx shim. */
export function normalizeAlipaySdk(sdk) {
  if (!sdk || typeof sdk.createCanvas !== 'function') {
    throw new Error('Alipay native mini-game my.createCanvas is unavailable');
  }
  const bind = (name) => {
    if (typeof sdk[name] !== 'function') throw new Error(`Alipay my.${name} is unavailable`);
    return sdk[name].bind(sdk);
  };
  const optional = (name) => (typeof sdk[name] === 'function' ? sdk[name].bind(sdk) : undefined);
  const checkedStorage = (result) => {
    // Alipay synchronous storage reports errors in its result as well as by throwing.
    if (result && result.error !== undefined && result.error !== 0) {
      throw new Error(`Alipay storage failed (${String(result.error)})`);
    }
    return result;
  };
  const normalized = {
    createCanvas() {
      const canvas = sdk.createCanvas();
      if (!canvas || typeof canvas.getContext !== 'function') {
        throw new Error('Alipay SDK did not provide a native Canvas');
      }
      return canvas;
    },
    createImage: optional('createImage'),
    request: optional('request'),
    loadSubpackage: optional('loadSubpackage'),
    createInnerAudioContext: optional('createInnerAudioContext'),
    getLaunchOptionsSync: optional('getLaunchOptionsSync'),
    getMenuButtonBoundingClientRect: optional('getMenuButtonBoundingClientRect'),
    showKeyboard: optional('showKeyboard'),
    hideKeyboard: optional('hideKeyboard'),
    getSystemInfoSync: bind('getSystemInfoSync'),
    // Native touch events retain every changed touch and identifier, including cancel.
    onTouchStart: bind('onTouchStart'),
    offTouchStart: bind('offTouchStart'),
    onTouchMove: bind('onTouchMove'),
    offTouchMove: bind('offTouchMove'),
    onTouchEnd: bind('onTouchEnd'),
    offTouchEnd: bind('offTouchEnd'),
    onTouchCancel: bind('onTouchCancel'),
    offTouchCancel: bind('offTouchCancel'),
    onHide: bind('onHide'),
    offHide: bind('offHide'),
    onShow: bind('onShow'),
    offShow: bind('offShow'),
    getStorageSync(key) {
      const result = checkedStorage(bind('getStorageSync')({ key }));
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid Alipay storage response');
      }
      return result.data;
    },
    setStorageSync(key, value) {
      checkedStorage(bind('setStorageSync')({ key, data: value }));
    },
    removeStorageSync(key) {
      checkedStorage(bind('removeStorageSync')({ key }));
    },
    getLogManager: () => ({ info: (...values) => console.info(...values) }),
    exitMiniProgram(options) {
      // This capability is optional and host/user initiated. Never report a fake exit.
      if (typeof sdk.exitMiniProgram !== 'function') return options.fail();
      try {
        sdk.exitMiniProgram(options);
      } catch {
        options.fail();
      }
    },
    // Login/share/rewarded ads are deliberately absent until a verified configuration exists.
  };
  if (typeof sdk.getFileSystemManager === 'function') {
    normalized.getFileSystemManager = () => {
      const manager = sdk.getFileSystemManager();
      if (!manager || typeof manager.readFile !== 'function') return undefined;
      return {
        readFile(options) {
          // Alipay code-package paths must be rooted. Preserve local/protocol paths.
          const path = options.filePath;
          const filePath =
            typeof path === 'string' && !path.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(path)
              ? `/${path.replace(/^\.\//, '')}`
              : path;
          return manager.readFile({ ...options, filePath });
        },
      };
    };
  }
  // Expose subscriptions only when cleanup exists; retain listener/event identity.
  for (const event of ['WindowResize', 'KeyboardInput', 'KeyboardConfirm', 'KeyboardComplete']) {
    if (typeof sdk[`on${event}`] === 'function' && typeof sdk[`off${event}`] === 'function') {
      normalized[`on${event}`] = sdk[`on${event}`].bind(sdk);
      normalized[`off${event}`] = sdk[`off${event}`].bind(sdk);
    }
  }
  return normalized;
}

export const createAlipaySdk = normalizeAlipaySdk;
