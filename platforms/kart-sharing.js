// Loaded before Cocos by the native build; game code only sees __kartPlatform.
(function () {
  const sdk = typeof bl !== 'undefined' ? bl : typeof wx !== 'undefined' ? wx : undefined;
  if (!sdk) return;
  let query = '';
  const payload = () => ({ title: '好友一起开跑，来我的卡丁车房间！', query });
  const bridge = (globalThis.__kartPlatform = {
    serverUrl: globalThis.__kartServerUrl || '',
    query: sdk.getLaunchOptionsSync?.().query || {},
    setQuery(value) {
      query = value;
    },
    share(value) {
      query = value;
      if (!sdk.shareAppMessage) return false;
      sdk.shareAppMessage(payload());
      return true;
    },
  });
  sdk.showShareMenu?.({ menus: ['shareAppMessage'] });
  sdk.onShareAppMessage?.(payload);
  sdk.onShow?.((options) => {
    if (!options.query?.room) return;
    bridge.query = options.query;
    bridge.onInvite?.(bridge.query);
  });
})();
