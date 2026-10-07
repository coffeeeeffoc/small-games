/** Optional competition must never turn an unconfigured native game into guest login. */
export function withCompetitionAvailability(sdk, config) {
  if (!sdk) throw new Error(`Missing ${config.platform} native SDK.`);
  if (config.competitionConfigured && config.platform !== 'alipay') return sdk;
  return new Proxy(sdk, {
    get(target, name) {
      if (name === 'login' || name === 'request')
        return (options) => {
          const error = new Error('此平台的好友挑战暂不可用，单机仍可玩。');
          error.code = 'PLATFORM_LOGIN_UNAVAILABLE';
          options?.fail?.(error);
        };
      const value = Reflect.get(target, name, target);
      if (name === 'getStorageSync')
        return (key) =>
          typeof key === 'string' && key.startsWith('competition-session-v1:')
            ? undefined
            : value.call(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
