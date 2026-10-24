// A pending local save survives an offline Host and is reconciled before retrying.
function mergeProgress(remote, local) {
  if (!remote || !local || remote.version !== local.version || !Array.isArray(local.collection))
    return local;
  const best = { ...remote.best, ...local.best };
  for (const [key, result] of Object.entries(remote.best || {}))
    if (!best[key] || result.elapsedMs < best[key].elapsedMs) best[key] = result;
  return {
    ...local,
    unlocked: Math.max(remote.unlocked || 1, local.unlocked || 1),
    collection: [...new Set([...(remote.collection || []), ...local.collection])],
    best,
  };
}
export async function storagePort() {
  let local;
  try {
    local = globalThis.localStorage;
  } catch {
    local = { getItem: () => null, setItem: () => {} };
  }
  const host = globalThis.PorcelainHost?.storage;
  if (!host?.read || !host?.write) return local;
  const key = 'porcelain-puzzle.save.v1',
    pendingKey = key + '.pending';
  const readLocal = (k) => {
    try {
      return local.getItem(k);
    } catch {
      return null;
    }
  };
  const writeLocal = (k, v) => {
    try {
      local.setItem(k, v);
    } catch {}
  };
  const readHost = async () => {
    let timer;
    try {
      return await Promise.race([
        host.read(key),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Storage timeout')), 2500);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  let record = null,
    known = false;
  try {
    record = await readHost();
    known = true;
  } catch {}
  const fallback = readLocal(key);
  let dirty = readLocal(pendingKey) === '1' && !!fallback,
    value = dirty || !record ? fallback : JSON.stringify(record.value),
    version = record?.version ?? null,
    queue = Promise.resolve();
  if (dirty && record) {
    try {
      value = JSON.stringify(mergeProgress(record.value, JSON.parse(value)));
    } catch {}
  }
  if (value) writeLocal(key, value);
  const enqueue = (json) => {
    queue = queue.then(async () => {
      try {
        if (!known) {
          record = await readHost();
          version = record?.version ?? null;
          known = true;
        }
        if (record) {
          const merged = JSON.stringify(mergeProgress(record.value, JSON.parse(json)));
          if (json === value) {
            value = merged;
            writeLocal(key, merged);
          }
          json = merged;
        }
        const next = await host.write(key, JSON.parse(json), version);
        record = next;
        version = next.version;
        if (value === json) {
          dirty = false;
          writeLocal(pendingKey, '0');
        }
      } catch {
        known = false; /* Keep the pending local save for the next retry. */
      }
    });
  };
  if (dirty) enqueue(value);
  return {
    getItem: () => value,
    setItem(k, json) {
      if (json === value && !dirty) return;
      value = json;
      dirty = true;
      writeLocal(key, json);
      writeLocal(pendingKey, '1');
      enqueue(json);
    },
    flush: () => queue,
  };
}
export class Rewards {
  constructor() {
    this.generation = 0;
    this.pending = false;
  }
  get provider() {
    return globalThis.PorcelainHost?.ads || globalThis.SmallGamesRewardAds;
  }
  get available() {
    return !!this.provider && this.provider.available !== false;
  }
  cancel() {
    this.generation++;
    this.provider?.cancel?.();
    this.pending = false;
  }
  async offer(id, reward) {
    if (this.pending || !this.available) return { status: 'unavailable' };
    const generation = this.generation;
    this.pending = true;
    try {
      const result = await this.provider.offer({ id, reward });
      return generation === this.generation ? result : { status: 'dismissed' };
    } catch {
      return { status: 'failed' };
    } finally {
      if (generation === this.generation) this.pending = false;
    }
  }
}
export class RoomClient {
  constructor() {
    this.base = (globalThis.PorcelainConfig?.roomServiceUrl || '').replace(/\/$/, '');
    this.session = null;
    this.busy = false;
    this.generation = 0;
  }
  async available() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
      const response = await fetch(this.base + '/api/porcelain/health', {
        signal: controller.signal,
      });
      return response.ok && (await response.json()).game === 'porcelain-puzzle';
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
  async request(path, body, token) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(this.base + '/api/porcelain/rooms' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error || '房间连接中断');
      return data;
    } catch (e) {
      if (e instanceof SyntaxError || e.name === 'AbortError' || e instanceof TypeError)
        throw Error('好友房暂时连不上，请稍后再试');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  cancel() {
    this.generation++;
  }
  async connect(path, input) {
    const generation = ++this.generation,
      data = await this.request(path, input);
    if (generation !== this.generation) {
      this.request(`/${data.code}/actions`, { type: 'leave' }, data.token).catch(() => {});
      throw Error('邀请已取消');
    }
    this.session = { code: data.code, token: data.token };
    this.remember();
    return data;
  }
  async create(input) {
    return this.connect('', input);
  }
  async join(code, name) {
    const saved = this.recall();
    return this.connect(`/${encodeURIComponent(code)}/join`, {
      name,
      token: saved?.code === code ? saved.token : undefined,
    });
  }
  async poll() {
    if (!this.session) return null;
    return this.request(`/${this.session.code}`, undefined, this.session.token);
  }
  async action(input) {
    if (!this.session) throw Error('尚未加入房间');
    return this.request(`/${this.session.code}/actions`, input, this.session.token);
  }
  remember() {
    try {
      sessionStorage.setItem('porcelain-room', JSON.stringify(this.session));
    } catch {}
  }
  recall() {
    try {
      return JSON.parse(sessionStorage.getItem('porcelain-room'));
    } catch {
      return null;
    }
  }
  async leave() {
    this.cancel();
    const session = this.session;
    this.session = null;
    try {
      sessionStorage.removeItem('porcelain-room');
    } catch {}
    if (session) await this.request(`/${session.code}/actions`, { type: 'leave' }, session.token);
  }
}
export function shareURL({ level, room } = {}) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  if (room) url.searchParams.set('room', room);
  else if (level) url.searchParams.set('level', String(level));
  return url.href;
}
export async function share({
  title = '青花拾光',
  text = '拾起一片青花，赴一场限时挑战。',
  level,
  room,
} = {}) {
  const url = shareURL({ level, room });
  const payload = { title, text, url };
  if (globalThis.PorcelainHost?.share) {
    await globalThis.PorcelainHost.share(payload);
    return 'shared';
  }
  if (navigator.share) {
    try {
      await navigator.share(payload);
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
    }
  }
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return 'copied';
    } catch {}
  }
  return url;
}
export class Feedback {
  constructor(settings) {
    this.settings = settings;
    this.context = null;
  }
  unlock() {
    try {
      this.context ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
      this.context.resume();
    } catch {}
  }
  play(type) {
    if (this.settings.haptics && type === 'snap') navigator.vibrate?.(12);
    if (!this.settings.sound) return;
    this.unlock();
    if (!this.context) return;
    const frequencies =
      type === 'snap'
        ? [660, 990]
        : type === 'win'
          ? [523, 659, 784, 1046]
          : type === 'laugh'
            ? [640, 820, 680, 880]
            : [160, 95, 66];
    frequencies.forEach((hz, i) => {
      const o = this.context.createOscillator(),
        g = this.context.createGain(),
        t = this.context.currentTime + i * 0.065;
      o.type = type === 'break' ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(hz, t);
      o.frequency.exponentialRampToValueAtTime(hz * (type === 'laugh' ? 1.16 : 0.8), t + 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(type === 'break' ? 0.08 : 0.035, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(this.context.destination);
      o.start(t);
      o.stop(t + 0.19);
    });
  }
  suspend() {
    this.context?.suspend();
  }
}
