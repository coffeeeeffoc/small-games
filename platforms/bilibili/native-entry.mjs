/** Native entry addon; no Canvas, game mount, gameplay rewards or platform aliases.
 * Official contracts checked 2026-10-06:
 * https://miniapp.bilibili.com/small-game-doc/open/sidebar
 * https://miniapp.bilibili.com/small-game-doc/open/shortcut
 * https://miniapp.bilibili.com/small-game-doc/api/open/sidebar/bl.checkScene
 * https://miniapp.bilibili.com/small-game-doc/ability/scene-type
 */
export function attachBilibiliEntry(sdk, { gameId, now = Date.now } = {}) {
  if (typeof gameId !== 'string' || !gameId) throw new Error('Bilibili entry requires gameId');
  const key = `bilibili:${gameId}:entry-gifts`;
  const listeners = new Set();
  const pending = new Set();
  let disposed = false;
  let ready = false;
  let receivedShow = false;
  let revision = 0;
  let scene = '';
  let launchOptions = {};
  let message = '';
  let writable = true;
  let gifts = { count: 0 };
  const showMethods = typeof sdk?.onShow === 'function' && typeof sdk?.offShow === 'function';
  let removableShow = showMethods;
  let sidebarSupported =
    typeof sdk?.checkScene === 'function' && typeof sdk?.navigateToScene === 'function'
      ? null
      : false;
  const desktopSupported = typeof sdk?.addShortcut === 'function';
  const copyLaunch = () => ({
    ...launchOptions,
    ...(launchOptions.query && typeof launchOptions.query === 'object'
      ? { query: { ...launchOptions.query } }
      : {}),
  });
  const getSnapshot = () => ({
    count: gifts.count,
    message,
    scene,
    launchOptions: copyLaunch(),
    sidebarSupported,
    desktopSupported,
    writable,
    disposed,
  });
  const publish = () => {
    if (disposed) return;
    revision++;
    for (const listener of listeners) {
      try {
        listener(getSnapshot());
      } catch {
        /* A view cannot interrupt saving or other subscribers. */
      }
    }
  };
  const day = () => new Date(now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const validDay = (value) =>
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  const collect = (kind) => {
    if (!removableShow || scene !== (kind === 'sidebar' ? '021036' : '10002')) return false;
    if (!writable) {
      message = '收藏暂时无法读取，请稍后重试。';
      return true;
    }
    const today = day();
    if (gifts[kind] === today) {
      message = '今天的收藏签已领取。';
      return true;
    }
    const count = gifts.count + 1;
    if (!Number.isSafeInteger(count)) {
      message = '收藏签数量已达上限。';
      return true;
    }
    const next = { ...gifts, count, [kind]: today };
    try {
      if (typeof sdk.setStorageSync !== 'function') throw new Error('Storage unavailable');
      sdk.setStorageSync(key, JSON.stringify(next));
      gifts = next;
      message = '每日收藏签 +1，已保存。';
    } catch {
      message = '领取未保存，请稍后重试。';
    }
    return true;
  };
  const show = (options) => {
    if (disposed) return;
    receivedShow = true;
    launchOptions = options && typeof options === 'object' ? { ...options } : {};
    scene = String(launchOptions.scene ?? '');
    if (!ready) return;
    collect('sidebar');
    collect('desktop');
    publish();
  };
  // Must be synchronous at game.js execution, before storage and scene probing.
  if (removableShow) {
    try {
      sdk.onShow(show);
    } catch {
      removableShow = false;
    }
  }
  if (!removableShow) message = '当前客户端无法监听入口，收藏签暂不可用。';
  try {
    if (typeof sdk?.getStorageSync !== 'function') throw new Error('Storage unavailable');
    const stored = sdk.getStorageSync(key);
    if (stored !== undefined && stored !== null && stored !== '') {
      const value = typeof stored === 'string' ? JSON.parse(stored) : null;
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        !Number.isSafeInteger(value.count) ||
        value.count < 0 ||
        !['sidebar', 'desktop'].every((kind) => value[kind] === undefined || validDay(value[kind]))
      ) {
        throw new Error('Invalid entry collection');
      }
      gifts = {
        count: value.count,
        ...(value.sidebar ? { sidebar: value.sidebar } : {}),
        ...(value.desktop ? { desktop: value.desktop } : {}),
      };
    }
  } catch {
    writable = false;
    message = '收藏暂时无法读取，请稍后重试。';
  }
  if (!receivedShow && typeof sdk?.getLaunchOptionsSync === 'function') {
    try {
      show(sdk.getLaunchOptionsSync());
    } catch {
      /* Await the next real onShow. */
    }
  }
  ready = true;
  collect('sidebar');
  collect('desktop');
  if (sidebarSupported === null) {
    let settled = false;
    const finish = (supported) => {
      if (disposed || settled) return;
      settled = true;
      sidebarSupported = supported;
      publish();
    };
    try {
      sdk.checkScene({
        scene: 'sidebar',
        success: (result) => finish(result?.isExist === true),
        fail: () => finish(false),
      });
    } catch {
      finish(false);
    }
  }
  const run = (kind) => {
    if (disposed || pending.has(kind)) return;
    if (collect(kind)) {
      publish();
      return;
    }
    if (
      (kind === 'sidebar' && sidebarSupported !== true) ||
      (kind === 'desktop' && !desktopSupported)
    ) {
      message =
        kind === 'sidebar'
          ? sidebarSupported === null
            ? '正在检查侧边栏能力，请稍后重试。'
            : '当前客户端不支持侧边栏入口。'
          : '当前客户端不支持添加桌面。';
      publish();
      return;
    }
    pending.add(kind);
    const before = revision;
    let settled = false;
    const finish = (success) => {
      if (disposed || settled) return;
      settled = true;
      pending.delete(kind);
      // A fresh onShow takes precedence over an older navigation callback.
      if (revision !== before) return;
      message = success
        ? kind === 'sidebar'
          ? '请从首页侧边栏进入，每天可收藏一签。'
          : '已添加，从桌面进入可领取每日收藏签。'
        : kind === 'sidebar'
          ? '暂时无法打开侧边栏，请稍后重试。'
          : '暂时无法添加桌面，请稍后重试。';
      publish();
    };
    const options = { success: () => finish(true), fail: () => finish(false) };
    try {
      if (kind === 'sidebar') sdk.navigateToScene({ ...options, scene: 'sidebar' });
      else sdk.addShortcut(options);
    } catch {
      finish(false);
    }
  };
  return {
    getSnapshot,
    get menuActions() {
      return [
        {
          label: '侧边栏每日收藏',
          available: sidebarSupported === true,
          run: () => run('sidebar'),
        },
        { label: '添加桌面 · 每日收藏', available: desktopSupported, run: () => run('desktop') },
      ];
    },
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      try {
        listener(getSnapshot());
      } catch {
        /* Views cannot prevent other subscriptions. */
      }
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      pending.clear();
      if (showMethods) {
        try {
          sdk.offShow(show);
        } catch {
          /* Disposal still prevents late callbacks. */
        }
      }
    },
  };
}
