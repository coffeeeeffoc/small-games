// Loaded before Cocos by the native build; game code only sees __kartPlatform.
(function () {
  const sdks = {
    wechat: typeof wx !== 'undefined' ? wx : undefined,
    bilibili: typeof bl !== 'undefined' ? bl : undefined,
    douyin: typeof tt !== 'undefined' ? tt : undefined,
    kuaishou: typeof ks !== 'undefined' ? ks : undefined,
  };
  const platform = globalThis.__COMPETITION_CONFIG__?.platform;
  const sdk = platform
    ? sdks[platform]
    : sdks.bilibili || sdks.wechat || sdks.douyin || sdks.kuaishou;
  if (!sdk) return;
  let query = '',
    launchQuery = {};
  try {
    launchQuery = sdk.getLaunchOptionsSync?.()?.query || {};
  } catch {
    /* Optional launch metadata. */
  }
  const payload = () => ({ title: '好友一起开跑，来我的卡丁车房间！', query });
  const bridge = (globalThis.__kartPlatform = {
    serverUrl: globalThis.__kartServerUrl || '',
    query: launchQuery,
    setQuery(value) {
      query = value;
    },
    share(value) {
      query = value;
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
  sdk.onShow?.((options) => {
    if (!options?.query?.room) return;
    bridge.query = options.query;
    bridge.onInvite?.(bridge.query);
  });
})();
