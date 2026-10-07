import { miniIslands, validDay } from './challenge.js';
import { validateBook } from './library.js';

export function nativeToday(now = Date.now()) {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function readNativeIsland(query = {}) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) return { error: true };
  if (!Object.hasOwn(query, 'mini') && !Object.hasOwn(query, 'daily')) return {};
  if (query.game !== undefined && query.game !== 'letters-words2'
    || query.v !== undefined && query.v !== '1'
    || Object.hasOwn(query, 'mini') && Object.hasOwn(query, 'daily')) return { error: true };
  if (query.mini !== undefined) return typeof query.mini === 'string' && miniIslands.some(island => island.id === query.mini)
    ? { mini: query.mini } : { error: true };
  return validDay(query.daily) ? { daily: query.daily } : { error: true };
}

export function nativeIslandInvitation(state) {
  const params = state.mini && miniIslands.some(island => island.id === state.mini)
    ? `mini=${encodeURIComponent(state.mini)}` : validDay(state.daily) ? `daily=${state.daily}` : null;
  if (!params) throw new Error('请先进入三词小岛或每日词岛。');
  return { title: `词屿 · ${state.mini ? miniIslands.find(island => island.id === state.mini).name : '每日词岛'}`,
    query: `game=letters-words2&${params}&v=1` };
}

export function createNativeLibrary(sdk, assetBase = 'assets/english-dict/') {
  const cache = new Map();
  let catalog;
  function readJson(path) {
    if (!/^(?:catalog\.json|books\/[A-Za-z0-9_-]+\.json)$/.test(path)) return Promise.reject(new Error('词库路径无效。'));
    return new Promise((resolve, reject) => {
      const failed = () => reject(new Error('教材读取失败，请重试。'));
      try {
        const fs = sdk.getFileSystemManager?.();
        if (!fs) return reject(new Error('当前平台暂不能读取教材，主题词岛仍可玩。'));
        if (typeof fs.readFile === 'function') fs.readFile({ filePath: assetBase + path, encoding: 'utf8',
          success: result => { try { resolve(JSON.parse(result.data)); } catch { failed(); } }, fail: failed });
        else if (typeof fs.readFileSync === 'function') resolve(JSON.parse(fs.readFileSync(assetBase + path, 'utf8')));
        else failed();
      } catch { failed(); }
    });
  }
  return {
    async catalog() {
      if (catalog) return catalog;
      const value = await readJson('catalog.json');
      if (!Array.isArray(value?.books) || !Array.isArray(value?.publishers)) throw new Error('教材目录无效。');
      catalog = value; return catalog;
    },
    async book(book) {
      if (cache.has(book.id)) return cache.get(book.id);
      const value = validateBook(await readJson(book.url), book);
      cache.set(book.id, value); return value;
    },
    clear() { cache.clear(); catalog = null; },
  };
}
