import { Simulation } from './core/Simulation.ts';
import { createDuel, commandDuel, advanceDuel, viewDuel, type DuelCommand, type DuelState } from './core/Duel.ts';
import { RANKED_RULE_VERSION, observeNightInputs } from './core/Replay.ts';
import { MISSIONS } from './core/MissionCatalog.ts';

export type Player = { id?: string; userId?: string; playerId?: string; name?: string; nickname?: string; ready?: boolean; disconnected?: boolean; reconnectUntil?: number; takenOver?: boolean; settlement?: Settlement };
export const playerId = (player: Player) => player.playerId || player.userId || player.id || '';
export const playerLabel = (player: Player) => `${player.nickname || player.name || '飞行员'} #${playerId(player).replace(/-/g, '').slice(-8).toUpperCase()}`;
type DuelView = ReturnType<typeof viewDuel>;
export type Settlement = { points: number; totalPoints?: number; wins?: number; games?: number; outcome?: string };
export type RoomSummary = { code: string; status: string; mode: string; players: Player[]; playerCount: number; canJoin: boolean; canSpectate: boolean };
export type BattleHistory = { summary: { wins: number; losses: number; draws: number; games: number; winRate: number };
  matches: { id: string; code: string; opponent: Player; outcome: string; reason: string; startedAt: number; finishedAt: number; durationMs: number; points: number }[]; nextCursor?: string };
export type Room = { serverNow?: number; startsAt?: number; spectator?: boolean; visibility?: string; settlement?: Settlement; code: string; status: string; mode: string; you: number; seq: number; players: Player[]; state: DuelView | null };
type RankingRow = Player & { rank: number; score: number; secondary: number; wins?: number; games?: number };
type Ranking = { top: RankingRow[]; me: RankingRow | null };
type Recorder = { start(options: { mode: string; levelId: string; practice: boolean }): Promise<unknown>;
  record(input: Record<string, unknown>, ticks: number): void; finish(): Promise<unknown>; invalidate(reason?: string): void };
type Metadata = { identity: Player; capabilities: { multiplayer: boolean; leaderboards: boolean } };
type Bridge = { ready: Promise<Metadata | undefined>; refresh?: () => Promise<Metadata | undefined>;
  services: { createRoom(input: { mode: string; visibility?: string; password?: string }): Promise<Room>; match(): Promise<Room>; joinRoom(input: { code: string; password?: string }): Promise<Room>;
    listRooms?(): Promise<{ rooms: RoomSummary[] }>; history?(input: { cursor?: string }): Promise<BattleHistory>;
    updateProfile?(input: { nickname: string }): Promise<Player>; connectRoom?(input: { code: string }): Promise<Room>;
    spectateRoom?(input: { code: string; password?: string }): Promise<Room>;
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
const validCode = (code: string) => /^(?:[0-9]{6}|[A-F0-9]{12})$/.test(code);
export function invitation(search: string) { const codes = new URLSearchParams(search).getAll('room'); return codes.length === 1 && validCode(codes[0]) ? codes[0] : undefined; }
export function roomLink(href: string, code: string) {
  if (!validCode(code)) throw Error('Invalid room');
  const url = new URL(href); url.search = new URLSearchParams({ room: code, fullscreen: '1' }).toString();
  url.hash = url.username = url.password = ''; return url.href;
}

/** Transport stays in the shared services bridge; this owns only Night's screen and input state. */
export class Online {
  identity: Player;
  panel: '' | 'menu' | 'room' | 'ranking' | 'profile' | 'create' | 'join' | 'history' = '';
  rooms: RoomSummary[] = [];
  roomPage = 0;
  pageSize = 3;
  history?: BattleHistory;
  historyPage = 0;
  board: 'clears' | 'level' | 'points' | 'win-rate' = 'clears';
  draftName = '';
  draftCode = '';
  draftPassword = '';
  privateRoom = false;
  resumeCode = '';
  enteringUntil = 0;
  connectionLost = false;
  private listAt = 0;
  private roomKey = '';
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
  private replaced = false;
  private nextPoll = 0;
  private botStarted = 0;
  private bridge?: Bridge;
  readonly changed: (view: DuelView, start: boolean) => void;
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'>;
  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>, changed: (view: DuelView, start: boolean) => void) {
    this.storage = storage;
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
    this.draftName = saved.name || '';
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
    if (generation !== this.generation) return;
    try {
      const saved = JSON.parse(this.storage.getItem('night-overwatch-room-v1') || 'null');
      if (saved && saved.playerId === playerId(this.identity) && validCode(saved.code) && Date.now() - saved.at < 30000) this.resumeCode = saved.code;
    } catch { /* Invalid local room memory cannot join a different identity. */ }
    if (code) { this.draftCode = code; this.panel = 'join'; await this.open('join', code); }
    else if (this.resumeCode) await this.open('resume', this.resumeCode);
  }
  private acceptMetadata(metadata: Metadata | undefined) {
    if (!metadata) return;
    this.identity = metadata.identity;
    this.draftName = this.identity.nickname || this.identity.name || '';
    this.available = metadata.capabilities.multiplayer;
    this.ranked = metadata.capabilities.leaderboards;
    this.revision++;
  }
  get active() { return !!this.view; }
  get spectator() { return !!this.room?.spectator || this.room?.you === -1; }
  get entering() { return this.active && performance.now() < this.enteringUntil; }
  get opponent(): Player { return this.room?.players[this.room.you === 1 ? 0 : 1]
    || (this.view?.bot ? { id: 'bot-' + this.view.seed, name: '训练机器人' } : { name: '等待对手' }); }
  get offlineNotice() {
    const player = this.room?.players.find((p, i) => p.disconnected && (this.spectator || i !== this.room?.you));
    return player ? (player.nickname || player.name || '对方') + ' 已下线' : '';
  }
  show(panel: Online['panel']) { this.panel = panel; this.message = ''; this.revision++; }
  private rememberRoom(room?: Room) {
    try { this.storage.setItem('night-overwatch-room-v1', room && !room.spectator && room.you >= 0 && room.status === 'playing'
      ? JSON.stringify({ code: room.code, playerId: playerId(this.identity), at: Date.now() }) : 'null'); } catch { /* Session remains playable without storage. */ }
  }
  async loadRooms() {
    if (this.busy || this.room || this.active) return;
    this.busy = true; const generation = this.generation;
    try {
      if (!this.available) this.acceptMetadata(await this.bridge?.refresh?.());
      if (!this.available || !this.bridge?.services.listRooms) { this.message = '联机暂不可用，可选择本地人机练习'; return; }
      const { rooms } = await this.bridge.services.listRooms();
      if (generation === this.generation) { this.rooms = rooms; this.message = ''; }
    } catch { if (generation === this.generation) this.message = '网络异常，正在重新读取房间'; }
    finally { if (generation === this.generation) { this.busy = false; this.listAt = performance.now() + 3000; this.revision++; } }
  }
  async saveName() {
    if (this.busy) return;
    const nickname = this.draftName.trim();
    if (Array.from(nickname).length < 2 || Array.from(nickname).length > 24 || /[\u0000-\u001f\u007f]/u.test(nickname)) {
      this.message = '昵称需要 2–24 个字符'; this.revision++; return;
    }
    this.busy = true;
    try {
      if (this.bridge?.services.updateProfile) this.identity = await this.bridge.services.updateProfile({ nickname });
      else {
        this.identity = { ...this.identity, name: nickname, nickname };
        this.storage.setItem('night-overwatch-pilot-v1', JSON.stringify(this.identity));
      }
      this.message = this.available ? '昵称已保存' : '昵称已保存在本机'; this.draftName = nickname;
    } catch { this.message = '昵称保存失败，请重试'; }
    finally { this.busy = false; this.revision++; }
  }
  async loadHistory(cursor?: string) {
    if (this.busy) return;
    this.show('history'); this.busy = true;
    const generation = this.generation;
    try {
      if (!this.available) this.acceptMetadata(await this.bridge?.refresh?.());
      if (!this.bridge?.services.history || !this.available) { this.message = '对战记录暂不可用'; return; }
      const result = await this.bridge.services.history({ cursor });
      if (generation !== this.generation || this.panel !== 'history') return;
      this.history = cursor && this.history ? { ...result, matches: [...this.history.matches, ...result.matches] } : result;
      if (!cursor) this.historyPage = 0;
    } catch { if (generation === this.generation) this.message = '对战记录读取失败，请重试'; }
    finally { if (generation === this.generation) { this.busy = false; this.revision++; } }
  }
  async open(kind: 'friend' | 'match' | 'join' | 'bot' | 'watch' | 'resume', code?: string) {
    if (this.busy || this.inflight || this.active || this.room) return;
    if (kind === 'friend' && this.privateRoom && (this.draftPassword.length < 4 || this.draftPassword.length > 64)) {
      this.message = '私密房密码需要 4–64 个字符'; this.revision++; return;
    }
    if (['join', 'watch', 'resume'].includes(kind) && !validCode(code || this.draftCode.trim().toUpperCase())) {
      this.message = '请输入正确的房间号'; this.revision++; return;
    }
    this.message = ''; const generation = ++this.generation;
    this.busy = true; this.revision++;
    try {
      if (!this.available) this.acceptMetadata(await this.bridge?.refresh?.());
      if (generation !== this.generation) return;
      if (!this.available || !this.bridge) {
        if (kind === 'bot') { this.busy = false; this.startBot(performance.now()); return; }
        this.message = '联机服务暂不可用，可选择本地人机练习'; return;
      }
      const services = this.bridge.services, input = { code: code || this.draftCode.trim().toUpperCase(), password: this.draftPassword || undefined };
      const room = kind === 'friend' || kind === 'bot'
        ? await services.createRoom({ mode: kind, visibility: this.privateRoom && kind === 'friend' ? 'private' : 'public', ...(this.privateRoom && kind === 'friend' ? { password: this.draftPassword } : {}) })
        : kind === 'match' ? await services.match()
        : kind === 'watch' ? await services.spectateRoom!(input)
        : kind === 'resume' ? await services.connectRoom!({ code: input.code })
        : await services.joinRoom(input);
      if (generation !== this.generation) { void services.roomAction({ code: room.code, operation: 'leave' }).catch(() => {}); return; }
      this.panel = 'room'; this.draftPassword = ''; this.accept(room); this.nextPoll = 0;
      if (kind === 'bot' && room.status === 'waiting') {
        const started = await services.roomAction({ code: room.code, operation: 'ready' });
        if (generation === this.generation) this.accept(started);
      }
    } catch (error) {
      if (generation === this.generation) {
        const code = (error as { code?: string }).code || '';
        this.message = /PASSWORD/.test(code) ? '房间密码不正确，请重新输入'
          : /FULL|STARTED/.test(code) ? '房间已满或已经开战，请选择其他房间'
          : /STALE_LEASE/.test(code) ? '此对局已在另一个页面恢复'
          : '暂时无法进入房间，请检查房号与网络后重试';
        if (kind === 'resume' && ['PLAYER_DISCONNECTED', 'NOT_A_MEMBER', 'ROOM_NOT_FOUND', 'INVITATION_NOT_FOUND', 'MATCH_CLOSED', 'STALE_LEASE'].includes(code)) { this.resumeCode = ''; this.rememberRoom(); }
      }
    } finally { if (generation === this.generation) { this.busy = false; this.revision++; } }
  }
  startBot(now: number) {
    if (this.busy || this.active || this.room) return;
    this.generation++; this.bot = createDuel(new DataView(randomBytes().buffer).getUint32(0) & 0x7fffffff, true);
    this.botStarted = now + 1200; this.nextPoll = 0; this.panel = ''; this.message = '本地练习 · 不计公开积分';
    this.enteringUntil = this.botStarted;
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
    this.resumeCode = room?.status === 'playing' && !this.view?.finished && !this.spectator ? room.code : '';
    this.rememberRoom(this.resumeCode ? room : undefined); this.connectionLost = false; this.replaced = false; this.roomKey = ''; this.enteringUntil = 0;
    this.room = this.view = this.bot = undefined; this.panel = ''; this.message = '';
    this.commands = []; this.pending = undefined; this.revision++;
    if (room && this.bridge) void this.bridge.services.roomAction({ code: room.code, operation: 'leave' }).catch(() => {});
  }
  control(input: Record<string, unknown>) {
    if (!this.view || this.view.finished || this.spectator || this.entering || !controls.has(String(input.command))) return;
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
    if (this.replaced) return;
    if (this.bot) {
      if (now < this.nextPoll) return;
      this.nextPoll = now + 50;
      if (!this.bot.finished && now >= this.botStarted) { advanceDuel(this.bot, now - this.botStarted); this.acceptView(viewDuel(this.bot)); }
      return;
    }
    if (this.entering) return;
    if (this.panel === 'menu' && !this.room && now >= this.listAt) { await this.loadRooms(); return; }
    if (!this.room || !['waiting', 'playing'].includes(this.room.status) || !this.bridge || this.busy || this.inflight || now < this.nextPoll || this.view?.finished) return;
    const generation = this.generation, code = this.room.code;
    this.inflight = true; this.nextPoll = now + (this.room.status === 'playing' ? 100 : 1000);
    try {
      let room: Room;
      if (this.room.status === 'playing' && !this.spectator) {
        this.pending ||= { seq: this.room.seq + 1, action: { commands: this.commands.splice(0, 64), keepAlive: true } };
        try { room = await this.bridge.services.roomAction({ code, operation: 'actions', body: this.pending }); }
        catch (error) {
          if (!['MATCH_CLOSED', 'PLAYER_FINISHED', 'PLAYER_DISCONNECTED'].includes((error as { code?: string }).code || '')) throw error;
          room = await this.bridge.services.getRoom({ code });
        }
      } else room = await this.bridge.services.getRoom({ code });
      if (generation !== this.generation) return;
      this.pending = undefined; this.connectionLost = false; this.message = ''; this.accept(room);
    } catch (error) {
      if (generation === this.generation) {
        this.connectionLost = true;
        this.replaced = ['STALE_LEASE', 'RULE_VERSION_CHANGED', 'NOT_A_MEMBER', 'INVITATION_NOT_FOUND'].includes((error as { code?: string }).code || '');
        this.message = (error as { code?: string }).code === 'STALE_LEASE' ? '对局已在另一页面恢复，请关闭本页面'
          : (error as { code?: string }).code === 'RULE_VERSION_CHANGED' ? '游戏已更新，请返回大厅重新进入'
          : (error as { code?: string }).code === 'NOT_A_MEMBER' ? '观战连接已过期，请返回大厅重新观战'
          : (error as { code?: string }).code === 'INVITATION_NOT_FOUND' ? '房间已关闭，请返回大厅'
          : '网络异常，正在重连 · 30秒内恢复可继续对战';
        this.nextPoll = now + 1000; this.revision++;
      }
    } finally { this.inflight = false; }
  }
  private accept(room: Room) {
    const start = !this.view && !!room.state;
    this.room = room;
    const key = JSON.stringify([room.code, room.status, room.players, room.settlement, room.you]);
    if (key !== this.roomKey) { this.roomKey = key; this.revision++; }
    if (room.status === 'playing') { this.resumeCode = room.code; this.rememberRoom(room); }
    if (room.state?.finished) { this.resumeCode = ''; this.rememberRoom(); }
    if (start) this.enteringUntil = performance.now() + (room.startsAt === undefined ? 0
      : Math.max(900, room.startsAt - (room.serverNow || Date.now())));
    if (room.state) {
      if (room.you >= 0 && room.players[room.you]?.takenOver && room.settlement) {
        const state = { ...room.state, simulation: { ...room.state.simulation } };
        state.finished = true; state.winner = room.you === 0 ? 1 : 0;
        state.simulation.phase = 'failure';
        this.resumeCode = ''; this.rememberRoom();
        this.message = '重连时间已过，本局已按离线失败结算';
        this.acceptView(state);
        return;
      }
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
  async loadRanking(level = this.level, board = this.board) {
    this.board = board;
    this.level = Math.max(0, Math.min(MISSIONS.length - 1, level)); this.rankPage = 0;
    this.panel = 'ranking'; this.ranking = undefined; this.message = ''; this.revision++;
    const ownLevel = this.level, ownBoard = this.board;
    try {
      if (!this.ranked) this.acceptMetadata(await this.bridge?.refresh?.());
      if (this.level !== ownLevel || this.board !== ownBoard || this.panel !== 'ranking') return;
      if (!this.ranked || !this.bridge) { this.message = '全站排行榜暂不可用；个人最佳仍保存在本机'; this.revision++; return; }
      const ranking = await this.bridge.services.leaderboard({ boardId: ownBoard === 'level' ? 'level-' + MISSIONS[ownLevel].id : ownBoard });
      if (this.level === ownLevel && this.board === ownBoard && this.panel === 'ranking') { this.ranking = ranking; this.revision++; }
    } catch { if (this.level === ownLevel) { this.message = '排行榜读取失败，点击刷新重试'; this.revision++; } }
  }
  async share(href: string) {
    if (!this.room || this.room.status !== 'waiting' || this.spectator) return;
    const url = roomLink(href, this.room.code);
    try {
      if (navigator.share) await navigator.share({ title: '夜航守望 · 好友对战', url });
      else { await navigator.clipboard.writeText(url); this.message = '房间链接已复制'; }
    } catch (error) { if ((error as Error).name !== 'AbortError') this.message = '请复制房间链接：' + url; }
    this.revision++;
  }
}
