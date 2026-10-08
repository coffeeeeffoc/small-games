import { DUEL_MAP } from './duel-map.js';
import type { DuelMessage } from './duel-protocol.js';
import type { Command } from './duel-types.js';
export function serverAddress(value = '') {
  const fallback = typeof location !== 'undefined' ? location.origin : '';
  const url = new URL(value || fallback);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('请输入 http/https 对战服务地址');
  if (
    typeof location !== 'undefined' &&
    location.protocol === 'https:' &&
    url.protocol !== 'https:'
  )
    throw new Error('当前页面需要 HTTPS 对战服务');
  return url.href.replace(/\/$/, '');
}
export class DuelConnection {
  private pendingAim: Extract<Command, { type: 'aim' }> | null = null;
  private aimTimer: ReturnType<typeof setTimeout> | null = null;
  private inputEpoch = 0;
  private inputAbort = new AbortController();
  private token = '';
  private seq = 0;
  private stream: EventSource | null = null;
  private pending = Promise.resolve();
  private disposed = false;
  private abort = new AbortController();
  constructor(
    readonly address: string,
    private receive: (message: DuelMessage) => void,
    private status: (message: string) => void,
  ) {}
  async join() {
    const timer = setTimeout(() => this.abort.abort(), 5000);
    try {
      const response = await fetch(`${this.address}/duel/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 'duel-v1', mapId: DUEL_MAP.id }),
        signal: this.abort.signal,
      });
      if (!response.ok) throw new Error('对战服务暂时不可用');
      const result = (await response.json()) as { token?: unknown };
      if (typeof result.token !== 'string' || !/^[a-f0-9]{48}$/.test(result.token))
        throw new Error('对战服务响应异常');
      this.token = result.token;
      if (this.disposed) {
        await this.cancelRemote();
        return;
      }
      this.stream = new EventSource(`${this.address}/duel/events?token=${this.token}`);
      this.stream.onmessage = (event) => {
        try {
          const m = JSON.parse(event.data) as DuelMessage;
          if (m.kind === 'waiting' && Number.isFinite(m.seconds)) this.receive(m);
          else if (
            m.kind === 'state' &&
            (m.side === 0 || m.side === 1) &&
            ['human', 'bot'].includes(m.mode) &&
            m.state?.version === 'duel-v1' &&
            m.state.mapId === DUEL_MAP.id &&
            m.state.fighters?.length === 2 &&
            m.state.fighters.every((p) => Number.isFinite(p.hp) && p.hp >= 0 && p.hp <= 100)
          )
            this.receive(m);
        } catch {
          this.status('对战同步异常，请重新连接');
        }
      };
      this.stream.onerror = () => {
        if (!this.disposed) {
          this.send({ type: 'cancel' });
          this.status('连接中断，正在重连 · 20秒内返回');
        }
      };
      this.stream.onopen = () => {
        if (!this.disposed) this.status('');
      };
    } finally {
      clearTimeout(timer);
    }
  }
  send(command: Command) {
    if (this.disposed || !this.token) return;
    if (command.type === 'aim') {
      this.pendingAim = command;
      if (!this.aimTimer) this.aimTimer = setTimeout(() => this.flushAim(), 40);
      return;
    }
    if (command.type === 'cancel') {
      this.inputEpoch++;
      this.inputAbort.abort();
      this.inputAbort = new AbortController();
      this.pendingAim = null;
    } else this.flushAim();
    this.enqueue(command);
  }
  private flushAim() {
    if (this.aimTimer) clearTimeout(this.aimTimer);
    this.aimTimer = null;
    if (this.pendingAim) {
      const aim = this.pendingAim;
      this.pendingAim = null;
      this.enqueue(aim);
    }
  }
  private enqueue(command: Command) {
    const seq = ++this.seq;
    const epoch = this.inputEpoch,
      signal = this.inputAbort.signal;
    this.pending = this.pending.then(async () => {
      if (this.disposed || epoch !== this.inputEpoch) return;
      try {
        const response = await fetch(`${this.address}/duel/input`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: this.token, seq, command }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
        });
        if (response.status === 401) this.status('对局已失效，请返回主页重新匹配');
        else if (!response.ok) this.status('操作暂未送达，请检查连接');
      } catch {
        if (!this.disposed && epoch === this.inputEpoch && command.type !== 'cancel')
          this.status('连接中断，正在重连 · 20秒内返回');
      }
    });
  }
  private async cancelRemote() {
    if (!this.token) return;
    try {
      await fetch(`${this.address}/duel/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this.token }),
        keepalive: true,
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      /* Server disconnect grace resolves unreachable exits. */
    }
  }
  dispose() {
    this.disposed = true;
    if (this.aimTimer) clearTimeout(this.aimTimer);
    this.inputAbort.abort();
    this.abort.abort();
    this.stream?.close();
    void this.cancelRemote();
  }
}
