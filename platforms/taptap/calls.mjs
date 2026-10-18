/** Host callbacks are the authority; optional Promise-style APIs share one settlement. */
export const tapError = (code, message = 'TapTap 暂不可用，请稍后重试。') =>
  Object.assign(new Error(message), { code });
export function tapCall(
  target,
  method,
  input = {},
  { timeoutMs = 12000, leaderboard = false } = {},
) {
  if (typeof target?.[method] !== 'function')
    return Promise.reject(tapError('TAP_UNAVAILABLE', '请在支持此功能的 TapTap 客户端中打开。'));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      fn(value);
    };
    const timer = globalThis.setTimeout(
      () => finish(reject, tapError('TAP_TIMEOUT', '连接超时，请稍后重试。')),
      timeoutMs,
    );
    const success = (value) => finish(resolve, value);
    const fail = (value) => {
      const code = Number.isInteger(value)
        ? value
        : Number.isInteger(value?.errno)
          ? value.errno
          : 'TAP_FAILED';
      const messages = {
        400001: '云档每分钟可上传一次，请稍后再试。',
        400002: '这份云档已删除，请重新查看。',
        400003: '云档数量已达上限，请在 TapTap 中管理旧云档。',
        400007: '上一项云档操作还未完成。',
        400100: 'TapTap 云档尚未初始化，请稍后重试。',
        500001: '此应用的排行榜暂不可用。',
        500002: '排行榜不属于当前应用。',
      };
      finish(reject, tapError(code, messages[code]));
    };
    try {
      const result = target[method](
        leaderboard
          ? { ...input, callback: { onSuccess: success, onFailure: fail } }
          : { ...input, success, fail },
      );
      if (result?.then) result.then(success, fail);
    } catch {
      fail();
    }
  });
}
export function tapLogin(sdk) {
  return tapCall(sdk, 'login', { timeout: 10000 }).then((result) => {
    if (typeof result?.code !== 'string' || !result.code.trim() || result.code.length > 512)
      throw tapError('PLATFORM_LOGIN_FAILED');
    return result.code;
  });
}
