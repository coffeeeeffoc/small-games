// Local implementation of the repository's GameHost ports. Embedders may pass a
// real host to mountCageRescue(); iframe pages are not assumed to inherit one.
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
  const prefix = 'cage-rescue:host:';
  let counter = 0;
  function read(key) {
    if (unsaved.has(key)) return memory.get(key) ?? null;
    try {
      const data = JSON.parse(storage?.getItem(prefix + key) ?? 'null');
      if (data && typeof data.version === 'string' && 'value' in data) return data;
    } catch {
      /* Session-only play remains available when storage is blocked. */
    }
    return memory.get(key) ?? null;
  }
  return {
    session: Object.freeze({
      gameId: 'cage-rescue',
      gameVersion: '0.1.0',
      releaseChannel: 'development',
      adAuthority: 'none',
      sessionId: `local-${Date.now()}`,
      locale: 'zh-CN',
      capabilities: ['storage'],
    }),
    storage: {
      async read(key) {
        return structuredClone(read(key));
      },
      async write(key, value, expectedVersion) {
        if (expectedVersion !== undefined && expectedVersion !== (read(key)?.version ?? null))
          throw Object.assign(new Error('存档已更新'), { code: 'CONFLICT' });
        const record = { value: structuredClone(value), version: `${Date.now()}-${++counter}` };
        memory.set(key, record);
        try {
          if (!storage) throw new Error('Storage unavailable');
          storage.setItem(prefix + key, JSON.stringify(record));
          unsaved.delete(key);
        } catch {
          unsaved.add(key);
          throw Object.assign(new Error('本机存储不可用，本次进度保留至关闭页面'), {
            code: 'UNAVAILABLE',
          });
        }
        return record;
      },
    },
    content: {
      async load() {
        throw Object.assign(new Error('使用内置关卡'), { code: 'CAPABILITY_MISSING' });
      },
    },
    ads: {
      async offer() {
        return { status: 'unavailable' };
      },
    },
    telemetry: { async track() {} },
    navigation: { async navigate() {} },
  };
}
