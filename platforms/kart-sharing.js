// Loaded before Cocos by the native build; game code only sees __kartPlatform.
(function () {
  const sdks = {
    wechat: typeof wx !== 'undefined' ? wx : undefined,
    bilibili: typeof bl !== 'undefined' ? bl : undefined,
    douyin: typeof tt !== 'undefined' ? tt : undefined,
    kuaishou: typeof ks !== 'undefined' ? ks : undefined,
    taptap: typeof tap !== 'undefined' ? tap : undefined,
  };
  const platform = globalThis.__COMPETITION_CONFIG__?.platform;
  const sdk = platform
    ? sdks[platform]
    : sdks.bilibili || sdks.wechat || sdks.douyin || sdks.kuaishou || sdks.taptap;
  if (!sdk) return;
  const defaultTitle = '好友一起开跑，来我的卡丁车房间！';
  let query = '',
    title = defaultTitle,
    launchQuery = {};
  try {
    launchQuery = sdk.getLaunchOptionsSync?.()?.query || {};
  } catch {
    /* Optional launch metadata. */
  }
  function setQuery(value, nextTitle) {
    query = typeof value === 'string' ? value : '';
    title =
      typeof nextTitle === 'string' && nextTitle.trim()
        ? nextTitle.trim().slice(0, 80)
        : defaultTitle;
  }
  const payload = () => ({ title, query });
  const bridge = (globalThis.__kartPlatform = {
    serverUrl: globalThis.__kartServerUrl || '',
    query: launchQuery,
    setQuery,
    share(value, nextTitle) {
      setQuery(value, nextTitle);
      if (!sdk.shareAppMessage) return false;
      try {
        sdk.shareAppMessage(payload());
        // This means the share UI was requested, never that a friend received it.
        return true;
      } catch {
        return false;
      }
    },
  });
  try {
    sdk.showShareMenu?.({ menus: ['shareAppMessage'] });
  } catch {
    /* Manual room codes remain available. */
  }
  try {
    sdk.onShareAppMessage?.(payload);
  } catch {
    /* Optional share-menu capability. */
  }
  try {
    sdk.onShow?.((options) => {
      const incoming = options?.query;
      if (!incoming || typeof incoming !== 'object' || !Object.keys(incoming).length) return;
      bridge.query = incoming;
      // The Game validates public challenge parameters and decides when to start.
      bridge.onLaunch?.(incoming);
      if (incoming.room) bridge.onInvite?.(incoming);
    });
  } catch {
    /* A missing warm-launch subscription must not block cold-launch play. */
  }
})();
