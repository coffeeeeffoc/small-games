export function normalizeServer(value) {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) throw new Error('请填写完整的服务地址，例如 http://localhost:43004');
  if (globalThis.location?.protocol === 'https:' && url.protocol !== 'https:') {
    throw new Error('当前页面需要 HTTPS 服务地址');
  }
  return url.origin;
}

export class RemoteError extends Error {
  constructor(message, { code = 'connection-failed', status = 0 } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    // A completed 4xx response proves rejection. A lost response does not.
    this.rejected = status >= 400 && status < 500;
  }
}

export class RemoteMatch {
  constructor(origin, { fetch: fetchImplementation } = {}) {
    this.origin = normalizeServer(origin);
    this.fetch = fetchImplementation || globalThis.fetch.bind(globalThis);
    this.sequence = 0;
    this.revision = -1;
    this.closed = false;
    this.pending = null;
    this.routePromise = null;
    this.closePromise = null;
  }

  assertOpen() {
    if (this.closed) throw new RemoteError('此对局已退出', { code: 'match-closed' });
  }

  async request(path, body, method = body === undefined ? 'GET' : 'POST') {
    let response;
    try {
      response = await this.fetch(this.origin + path, {
        method,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(6000),
      });
    } catch {
      throw new RemoteError('对局连接暂时中断，请稍后重试');
    }
    let data;
    try { data = await response.json(); }
    catch { throw new RemoteError('对局服务返回了无法识别的内容', { code: 'invalid-response', status: response.status }); }
    if (!response.ok) {
      throw new RemoteError(data?.error?.message || data?.message || '对局连接失败', {
        code: data?.error?.code || 'request-rejected', status: response.status,
      });
    }
    return data;
  }

  async start(levelId, difficulty) {
    this.assertOpen();
    const data = await this.request('/api/matches', { levelId, difficulty });
    this.id = data.matchId;
    this.token = data.token;
    // Creation may finish after the player cancels. Reclaim the late match.
    if (this.closed) { await this.abandon(); this.assertOpen(); }
    return this.accept(data.snapshot);
  }

  accept(snapshot) {
    this.assertOpen();
    if (!snapshot || snapshot.matchId !== this.id || !Number.isInteger(snapshot.revision) || !snapshot.state) {
      throw new RemoteError('对局状态无效，请重新连接', { code: 'invalid-snapshot' });
    }
    if (snapshot.revision >= this.revision) {
      this.revision = snapshot.revision;
      this.snapshot = snapshot;
      if (Number.isSafeInteger(snapshot.lastSequence)) this.sequence = Math.max(this.sequence, snapshot.lastSequence);
    }
    return this.snapshot;
  }

  async poll() {
    this.assertOpen();
    return this.accept((await this.request(`/api/matches/${this.id}`)).snapshot);
  }

  async route(junctionId) {
    this.assertOpen();
    if (this.routePromise) return this.routePromise;
    // Preserve the original instruction when its acknowledgement was lost.
    this.pending ??= { junctionId, sequence: this.sequence + 1 };
    const command = this.pending;
    this.routePromise = (async () => {
      try {
        const data = await this.request(`/api/matches/${this.id}/commands`, command);
        this.sequence = Math.max(this.sequence, command.sequence);
        this.pending = null;
        return this.accept(data.snapshot);
      } catch (error) {
        // Rejected ownership/cooldown commands must not block later instructions.
        if (error.rejected && this.pending === command) this.pending = null;
        throw error;
      } finally { this.routePromise = null; }
    })();
    return this.routePromise;
  }

  async action(action) {
    this.assertOpen();
    if (!['pause', 'resume', 'abandon'].includes(action)) throw new RemoteError('未知对局操作');
    return this.accept((await this.request(`/api/matches/${this.id}/${action}`, {})).snapshot);
  }

  async result() {
    this.assertOpen();
    return this.request(`/api/matches/${this.id}/result`);
  }

  abandon() {
    if (!this.id || !this.token) return Promise.resolve();
    this.closePromise ??= this.request(`/api/matches/${this.id}/abandon`, {}).catch(() => {});
    return this.closePromise;
  }

  close() {
    this.closed = true;
    this.pending = null;
    return this.abandon();
  }
}
