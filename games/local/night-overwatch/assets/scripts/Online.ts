import { Simulation } from './core/Simulation.ts';
import { createDuel, commandDuel, advanceDuel, viewDuel, type DuelCommand, type DuelState } from './core/Duel.ts';
import { RANKED_RULE_VERSION, observeNightInputs } from './core/Replay.ts';
import { MISSIONS } from './core/MissionCatalog.ts';

export type Player = { id?: string; userId?: string; playerId?: string; name?: string; nickname?: string; ready?: boolean };
export const playerId = (player: Player) => player.playerId || player.userId || player.id || '';
export const playerLabel = (player: Player) => `${player.nickname || player.name || '飞行员'} #${playerId(player).replace(/-/g, '').slice(-8).toUpperCase()}`;
type DuelView = ReturnType<typeof viewDuel>;
export type Room = { code: string; status: string; mode: string; you: number; seq: number; players: Player[]; state: DuelView | null };
type RankingRow = Player & { rank: number; secondary: number };
type Ranking = { top: RankingRow[]; me: RankingRow | null };
type Recorder = { start(options: { mode: string; levelId: string; practice: boolean }): Promise<unknown>;
  record(input: Record<string, unknown>, ticks: number): void; finish(): Promise<unknown>; invalidate(reason?: string): void };
type Metadata = { identity: Player; capabilities: { multiplayer: boolean; leaderboards: boolean } };
type Bridge = { ready: Promise<Metadata | undefined>; refresh?: () => Promise<Metadata | undefined>;
  services: { createRoom(input: { mode: string }): Promise<Room>; match(): Promise<Room>; joinRoom(input: { code: string }): Promise<Room>;
    getRoom(input: { code: string }): Promise<Room>; roomAction(input: { code: string; operation: string; body?: object }): Promise<Room>;
    leaderboard(input: { boardId: string }): Promise<Ranking> };
  createRecorder(version: string, options: { onStatus: (status: string) => void }): Recorder };
const randomBytes = () => {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes; // Local display identity only; authenticated IDs are assigned by the service.
};
const controls = new Set(['setAim', 'choose', 'setFire', 'clearInput', 'fire', 'adjustAltitude', 'adjustRadius', 'setOrbitDirection']);
export function invitation(search: string) { const codes = new URLSearchParams(search).getAll('room'); return codes.length === 1 && /^[A-F0-9]{12}$/.test(codes[0]) ? codes[0] : undefined; }
export function roomLink(href: string, code: string) {
  if (!/^[A-F0-9]{12}$/.test(code)) throw Error('Invalid room');
  const url = new URL(href); url.search = new URLSearchParams({ room: code }).toString();
  url.hash = url.username = url.password = ''; return url.href;
}

/** Transport stays in the shared services bridge; this owns only Night's screen and input state. */
export class Online {
  identity: Player;
  panel: '' | 'menu' | 'room' | 'ranking' = '';
  revision = 0;
  busy = false;
  available = false;
  ranked = false;
  message = '';
  rankStatus = 'local';
  level = 0;
  rankPage = 0;
  ranking?: Ranking;
  room?: Room;
  view?: DuelView;
  bot?: DuelState;
  recorder?: Recorder;
  private generation = 0;
  private commands: DuelCommand[] = [];
  private pending?: { seq: number; action: { commands: DuelCommand[]; keepAlive: true } };
  private inflight = false;
  private nextPoll = 0;
  private botStarted = 0;
  private bridge?: Bridge;
  readonly changed: (view: DuelView, start: boolean) => void;
  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>, changed: (view: DuelView, start: boolean) => void) {
    this.changed = changed;
    let saved: Player | undefined;
    try { saved = JSON.parse(storage.getItem('night-overwatch-pilot-v1') || 'null'); } catch { /* Fresh local identity. */ }
    if (!saved || !/^[a-f0-9-]{36}$/.test(playerId(saved)) || typeof saved.name !== 'string') {
      const bytes = randomBytes();
      bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
      const hex = Array.from(bytes).map(n => n.toString(16).padStart(2, '0')).join('');
      saved = { id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
        name: ['星夜', '远山', '银翼', '晨风', '逐月', '寒霜', '流光', '静海'][bytes[0] % 8] + ['猎鹰', '海燕', '云雀', '白鹭', '苍鹭', '信天翁', '游隼', '雨燕'][bytes[1] % 8] };
      try { storage.setItem('night-overwatch-pilot-v1', JSON.stringify(saved)); } catch { /* Memory-only when storage is unavailable. */ }
    }
    this.identity = saved;
  }
  async connect(bridge: Bridge | undefined, search = '') {
    const generation = this.generation;
    this.bridge = bridge;
    if (bridge) {
      this.recorder = bridge.createRecorder(RANKED_RULE_VERSION, { onStatus: status => { this.rankStatus = status; this.revision++; } });
      const metadata = await bridge.ready;
      this.acceptMetadata(metadata);
    }
    this.revision++;
    const code = search ? invitation(search) : undefined;
    if (code && generation === this.generation) { this.panel = 'room'; await this.open('join', code); }
  }
  private acceptMetadata(metadata: Metadata | undefined) {
    if (!metadata) return;
    this.identity = metadata.identity;
    this.available = metadata.capabilities.multiplayer;
    this.ranked = metadata.capabilities.leaderboards;
    this.revision++;
  }
  get active() { return !!this.view; }
  get opponent(): Player { return this.view?.bot ? { id: 'bot-' + this.view.seed, name: '训练机器人' }
    : this.room?.players[1 - this.room.you] || { name: '等待对手' }; }
  async open(kind: 'friend' | 'match' | 'join', code?: string) {
    if (this.busy || this.inflight || this.active || this.room) return;
    this.panel = 'room'; this.message = '';
    const generation = ++this.generation;
    this.busy = true; this.revision++;
    try {
      if (!this.available) this.acceptMetadata(await this.bridge?.refresh?.());
      if (generation !== this.generation) return;
      if (!this.available || !this.bridge) { this.message = '联机服务暂不可用，可返回进行机器人练习'; return; }
      const room = kind === 'friend' ? await this.bridge.services.createRoom({ mode: 'friend' })
        : kind === 'match' ? await this.bridge.services.match() : await this.bridge.services.joinRoom({ code: code! });
      if (generation !== this.generation) { void this.bridge.services.roomAction({ code: room.code, operation: 'leave' }).catch(() => {}); return; }
      this.accept(room); this.nextPoll = 0;
    } catch { if (generation === this.generation) this.message = '房间暂不可用，请返回重试或选择机器人练习'; }
    finally { if (generation === this.generation) { this.busy = false; this.revision++; } }
  }
  startBot(now: number) {
    if (this.busy || this.active || this.room) return;
    this.generation++; this.bot = createDuel(new DataView(randomBytes().buffer).getUint32(0) & 0x7fffffff, true);
    this.botStarted = now; this.panel = ''; this.message = '';
    this.acceptView(viewDuel(this.bot));
  }
  async ready() {
    if (!this.room || this.room.status !== 'waiting' || !this.bridge || this.busy || this.active) return;
    const generation = this.generation; this.busy = true;
    try { const room = await this.bridge.services.roomAction({ code: this.room.code, operation: 'ready' });
      if (generation === this.generation) this.accept(room);
    } catch { if (generation === this.generation) this.message = '准备失败，请重试'; }
    finally { if (generation === this.generation) { this.busy = false; this.revision++; } }
  }
  leave() {
    const room = this.room; this.generation++; this.busy = false;
    this.room = this.view = this.bot = undefined; this.panel = ''; this.message = '';
    this.commands = []; this.pending = undefined; this.revision++;
    if (room && this.bridge) void this.bridge.services.roomAction({ code: room.code, operation: 'leave' }).catch(() => {});
  }
  control(input: Record<string, unknown>) {
    if (!this.view || this.view.finished || !controls.has(String(input.command))) return;
    const command = input as DuelCommand;
    if (this.bot) { commandDuel(this.bot, 0, [command]); return; }
    if (command.command === 'setAim' && this.commands.at(-1)?.command === 'setAim') this.commands.pop();
    if (this.commands.length >= 60) { this.commands = [{ command: 'clearInput', args: [] }]; this.message = '网络拥堵，已停止开火'; }
    this.commands.push(command);
  }
  bind(sim: Simulation, blocked = () => sim.paused) {
    observeNightInputs(sim, input => {
      const attack = input.command === 'fire' || input.command === 'setFire' && (input.args as unknown[])[1] === true;
      if (!attack || !blocked()) this.control(input);
    });
  }
  async pump(now: number) {
    if (this.bot) {
      if (!this.bot.finished) { advanceDuel(this.bot, now - this.botStarted); this.acceptView(viewDuel(this.bot)); }
      return;
    }
    if (!this.room || !['waiting', 'playing'].includes(this.room.status) || !this.bridge || this.busy || this.inflight || now < this.nextPoll || this.view?.finished) return;
    const generation = this.generation, code = this.room.code;
    this.inflight = true; this.nextPoll = now + 200;
    try {
      let room: Room;
      if (this.room.status === 'playing') {
        this.pending ||= { seq: this.room.seq + 1, action: { commands: this.commands.splice(0, 64), keepAlive: true } };
        try { room = await this.bridge.services.roomAction({ code, operation: 'actions', body: this.pending }); }
        catch (error) {
          if (!['MATCH_CLOSED', 'PLAYER_FINISHED'].includes((error as { code?: string }).code || '')) throw error;
          room = await this.bridge.services.getRoom({ code });
        }
      } else room = this.room.mode === 'match' ? await this.bridge.services.match() : await this.bridge.services.getRoom({ code });
      if (generation !== this.generation) return;
      this.pending = undefined; this.message = ''; this.accept(room);
    } catch {
      if (generation === this.generation) { this.message = '连接中断，正在重连；停止操作后不会持续开火'; this.nextPoll = now + 1000; this.revision++; }
    } finally { this.inflight = false; }
  }
  private accept(room: Room) {
    this.room = room; this.revision++;
    if (room.state) {
      if (!['waiting', 'playing', 'finished'].includes(room.status) && !room.state.finished) {
        room.state.finished = true; room.state.winner = null; this.message = '对手已离开，房间已结束';
      }
      this.acceptView(room.state);
    }
    else if (!['waiting', 'playing'].includes(room.status)) this.message = '房间已结束或对手已离开，请返回';
  }
  private acceptView(view: DuelView) {
    const start = !this.view;
    this.view = view; if (start) this.panel = '';
    this.changed(view, start);
  }
  async loadRanking(level = this.level) {
    this.level = Math.max(0, Math.min(MISSIONS.length - 1, level)); this.rankPage = 0;
    this.panel = 'ranking'; this.ranking = undefined; this.message = ''; this.revision++;
    const ownLevel = this.level;
    try {
      if (!this.ranked) this.acceptMetadata(await this.bridge?.refresh?.());
      if (this.level !== ownLevel || this.panel !== 'ranking') return;
      if (!this.ranked || !this.bridge) { this.message = '全站排行榜暂不可用；个人最佳仍保存在本机'; this.revision++; return; }
      const ranking = await this.bridge.services.leaderboard({ boardId: 'level-' + MISSIONS[ownLevel].id });
      if (this.level === ownLevel && this.panel === 'ranking') { this.ranking = ranking; this.revision++; }
    } catch { if (this.level === ownLevel) { this.message = '排行榜读取失败，点击刷新重试'; this.revision++; } }
  }
  async share(href: string) {
    if (!this.room || this.room.mode !== 'friend') return;
    const url = roomLink(href, this.room.code);
    try {
      if (navigator.share) await navigator.share({ title: '夜航守望 · 好友对战', url });
      else { await navigator.clipboard.writeText(url); this.message = '房间链接已复制'; }
    } catch (error) { if ((error as Error).name !== 'AbortError') this.message = '请复制房间链接：' + url; }
    this.revision++;
  }
}
