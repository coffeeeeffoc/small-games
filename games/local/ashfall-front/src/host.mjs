// The local adapter follows the repository GameHost storage port. An embedding
// host may supply the same port to mountAshfall(host); no SDK enters the rules.
export function createLocalHost(storage) {
  if (storage === undefined) {
    try {
      storage = globalThis.localStorage;
    } catch {
      storage = null;
    }
  }
  const memory = new Map();
  const unsaved = new Set();
  const prefix = 'ashfall-front:host:';
  let counter = 0;
  function read(key) {
    if (unsaved.has(key)) return memory.get(key) ?? null;
    try {
      const value = JSON.parse(storage?.getItem(prefix + key) ?? 'null');
      if (value && typeof value.version === 'string' && 'value' in value) return value;
    } catch {
      /* Keep this session available when persistent storage is blocked. */
    }
    return memory.get(key) ?? null;
  }
  return {
    session: Object.freeze({
      gameId: 'ashfall-front',
      gameVersion: '1.0.0',
      releaseChannel: 'development',
      sessionId: 'local-' + Date.now(),
      locale: 'zh-CN',
      capabilities: ['storage'],
    }),
    storage: {
      async read(key) {
        return structuredClone(read(key));
      },
      async write(key, value, expectedVersion) {
        if (expectedVersion !== undefined && expectedVersion !== (read(key)?.version ?? null)) {
          throw Object.assign(new Error('存档已更新'), { code: 'CONFLICT' });
        }
        const record = { version: Date.now() + '-' + ++counter, value: structuredClone(value) };
        memory.set(key, record);
        try {
          if (!storage) throw new Error('Storage unavailable');
          storage.setItem(prefix + key, JSON.stringify(record));
          unsaved.delete(key);
        } catch {
          unsaved.add(key);
          throw Object.assign(new Error('本机存储不可用，进度保留至关闭页面'), {
            code: 'UNAVAILABLE',
          });
        }
        return record;
      },
    },
  };
}
