/** Minimal local Game Host. Embedded callers supply their own host to mount(). */
export function createLocalHost(storage) {
  if (storage === undefined) {
    try {
      storage = globalThis.localStorage ?? null;
    } catch {
      storage = null;
    }
  }
  const memory = new Map();
  let counter = 0;
  const prefix = 'tiny-signals:host:';
  const error = (code, message) => Object.assign(new Error(message), { code });
  const readRecord = (key) => {
    if (!storage) return memory.get(key) ?? null;
    const raw = storage.getItem(prefix + key);
    if (!raw) return null;
    try {
      const record = JSON.parse(raw);
      if (!record || typeof record.version !== 'string' || !('value' in record)) return null;
      return record;
    } catch {
      return null;
    }
  };
  return {
    session: Object.freeze({
      gameId: 'tiny-signals',
      gameVersion: '0.1.0',
      releaseChannel: 'development',
      adAuthority: 'none',
      sessionId: `local-${Date.now()}`,
      locale: 'zh-CN',
      capabilities: Object.freeze(['storage']),
    }),
    storage: {
      async read(key) {
        return structuredClone(readRecord(key));
      },
      async write(key, value, expectedVersion) {
        // Keep local read/check/write in one synchronous turn for conditional writes.
        const previous = readRecord(key);
        if (expectedVersion !== undefined && expectedVersion !== (previous?.version ?? null)) {
          throw error('CONFLICT', '存档已更新，请重新读取');
        }
        const record = {
          value: structuredClone(value),
          version:
            globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${++counter}-${Math.random()}`,
        };
        memory.set(key, record);
        if (!storage) throw error('UNAVAILABLE', '本机存储不可用');
        storage.setItem(prefix + key, JSON.stringify(record));
        return record;
      },
    },
    content: {
      async load() {
        throw error('CAPABILITY_MISSING', '本版本使用内置关卡');
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
