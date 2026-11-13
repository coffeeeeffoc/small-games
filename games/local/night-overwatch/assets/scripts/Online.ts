import { practiceLoadout, offlineLoadout } from './core/Progression.ts';
import { Simulation } from './core/Simulation.ts';
import { DUEL_VERSION, createDuel, configureDuel, commandDuel, advanceDuel, viewDuel, type DuelCommand, type DuelState } from './core/Duel.ts';
import { RANKED_RULE_VERSION, observeNightInputs } from './core/Replay.ts';
import { MISSIONS, CAMPAIGN_BOARD_VERSION } from './core/MissionCatalog.ts';
import type { AssetCommand, AssetSnapshot, BattleLoadout } from './core/Progression.ts';

export type Player = { id?: string; userId?: string; playerId?: string; name?: string; nickname?: string; ready?: boolean; disconnected?: boolean; reconnectUntil?: number; takenOver?: boolean; left?:boolean; online?:boolean; status?:'available'|'playing'|'offline'; settlement?: Settlement };
export const playerId = (player: Player) => player.playerId || player.userId || player.id || '';
export const playerTag = (id: string) => `#${id.replace(/-/g, '').slice(-8).toUpperCase()}`;
export const playerLabel = (player: Player) => `${player.nickname || player.name || '飞行员'} ${playerTag(playerId(player))}`;
type DuelView = Omit<ReturnType<typeof viewDuel>,'enemyEquipment'>&Partial<Pick<ReturnType<typeof viewDuel>,'enemyEquipment'>>;
export type Settlement = { points: number; totalPoints?: number; wins?: number; games?: number; outcome?: string; reason?:string; rewardReason?:string; durationMs?:number; coins?:number; xp?:number; totalXp?:number; status?:string; firstClear?:boolean; fragments?:Record<string,number> };
export function duelEndNotice(settlement?: Settlement): [string,string] | undefined {
  const lost=settlement?.outcome==='loss';
  if(settlement?.reason==='forfeit')return lost?['你已退出，本局判负','YOU LEFT · DEFEAT']:['对手已退出，对战结束','OPPONENT LEFT · MATCH ENDED'];
  if(settlement?.reason==='disconnect')return lost?['重连超时，本局判负','RECONNECT EXPIRED · DEFEAT']:['对手重连超时，本局获胜','OPPONENT TIMED OUT · VICTORY'];
  if(settlement?.reason==='abandoned')return ['双方离线，对战结束','BOTH PLAYERS OFFLINE · MATCH ENDED'];
}
export function duelRewardNotice(settlement?: Settlement): [string,string] | undefined {
  if(settlement?.rewardReason==='opponent-left')return ['对手退出，本局不发放金币与经验','OPPONENT LEFT · NO COINS OR EXP'];
  if(settlement?.rewardReason==='too-short')return ['对局不足 10 秒，本局无金币与经验','MATCH UNDER 10s · NO COINS OR EXP'];
  if(settlement?.rewardReason==='not-participated')return ['未有效参战，本局无金币与经验','NO COMBAT PARTICIPATION · NO COINS OR EXP'];
  if(settlement?.rewardReason==='disconnected'||settlement?.rewardReason==='abandoned')return ['离线结束，本局无金币与经验','DISCONNECTED · NO COINS OR EXP'];
}
export type RoomSummary = { code: string; status: string; mode: string; players: Player[]; playerCount: number; canJoin: boolean; canSpectate: boolean };
export type BattleHistory = { summary: { wins: number; losses: number; draws: number; games: number; winRate: number };
  matches: { id: string; code: string; opponent: Player; outcome: string; reason: string; startedAt: number; finishedAt: number; durationMs: number; points: number }[]; nextCursor?: string };
export type Room = { id?:string; rematch?:string; version?: string; serverNow?: number; startsAt?: number; spectator?: boolean; visibility?: string; settlement?: Settlement; code: string; status: string; mode: string; you: number; seq: number; players: Player[]; state: DuelView | null };
type RankingRow = Player & { rank: number; score: number; secondary: number; wins?: number; games?: number };
type Ranking = { top: RankingRow[]; me: RankingRow | null };
type Recorder = { start(options: { mode: string; levelId: string; practice: boolean }): Promise<{loadout?:BattleLoadout}|null|undefined>;
  record(input: Record<string, unknown>, ticks: number): void; finish(): Promise<Settlement & { accepted?: boolean; fastestEligible?: boolean } | null | undefined>; invalidate(reason?: string): void;
  persist?(): void; saveForReentry?(): Promise<boolean>; recover?(): Promise<void>; pending?: number; storageDiagnostic?: string;
  startOffline?(options: { mode: string; levelId: string; loadout: BattleLoadout }): Promise<object | null>;
  settlement?: { playerId: string; runId: string; result: Settlement } };
export type ChatMessage={id:string;playerId:string;nickname:string;text:string;at:number;recipientId?:string;recipientNickname?:string;room?:{code:string;createdAt:number;canJoin:boolean}};
export type ChatSnapshot={messages:ChatMessage[];cursor:string;reset:boolean;serverNow:number;nextBefore?:string};
type ChatIntent = { requestId: string; text: string; roomCode?: string; recipientId?: string };
type ChatComposer = { draft: string; status: string; sending: boolean; intent?: ChatIntent };
export type Release = { currentBuildId: string | null; currentVersion?: string | null; latestBuildId: string | null; latestVersion?: string | null; update: 'none' | 'optional' | 'required'; canStartNewGames: boolean; admissions: { ranked: boolean; multiplayer: boolean }; action: 'reopen' };
export type SocialSnapshot={friends:Player[];requests:(Player&{direction:'incoming'|'outgoing';createdAt:number})[];conversations:(Player&{unread:number;lastReadId:string;lastMessage:ChatMessage})[];serverNow:number};
type RequestResult = { path: string; method: 'GET' | 'POST'; playerId: string; error?: string };
type Metadata = { identity: Player; capabilities: { multiplayer: boolean; leaderboards: boolean;chat?:boolean;presence?:boolean;social?:boolean }; release?: Release };
type OnlineStorage = Pick<Storage, 'getItem' | 'setItem'> & { flush?(): Promise<void> };
function validRelease(value: Release) {
  const build = (id: unknown) => id === null || typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id);
  const version = value?.latestVersion;
  return value && (version === undefined || version === null || typeof version === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(version)) && build(value.currentBuildId) && build(value.latestBuildId) && ['none', 'optional', 'required'].includes(value.update) && typeof value.canStartNewGames === 'boolean' && typeof value.admissions?.ranked === 'boolean' && typeof value.admissions?.multiplayer === 'boolean' && value.action === 'reopen';
}
type Bridge = { ready: Promise<Metadata | undefined>; refresh?: () => Promise<Metadata | undefined>;
  subscribeRequests?(listener: (result: RequestResult) => void): () => void;
  services: { createRoom(input: { mode: string; visibility?: string; password?: string }): Promise<Room>; match(): Promise<Room>; joinRoom(input: { code: string; password?: string; createdAt?: number; switchFrom?: string }): Promise<Room>;
    listRooms?(): Promise<{ rooms: RoomSummary[] }>; history?(input: { cursor?: string }): Promise<BattleHistory>;
    updateProfile?(input: { nickname: string }): Promise<Player>; connectRoom?(input: { code: string }): Promise<Room>;
    spectateRoom?(input: { code: string; password?: string }): Promise<Room>;
    getRoom(input: { code: string }): Promise<Room>; roomAction(input: { code: string; operation: string; body?: object }): Promise<Room>;
    nightAssets?(expectedPlayerId?:string):Promise<AssetSnapshot>;nightAssetCommand?(input:AssetCommand,expectedPlayerId?:string):Promise<AssetSnapshot>;
    nightChat?(input:{cursor?:string;waitMs?:number;direct?:boolean;peer?:string;before?:string},expectedPlayerId?:string):Promise<ChatSnapshot>;
    nightPresence?(expectedPlayerId?:string,input?:{cursor?:string;activity?:'available'|'playing'}):Promise<{onlineCount:number;players?:Player[];nextCursor?:string}>;
    nightSocial?(input?:{action:'request'|'accept'|'decline'|'cancel'|'remove'|'read';playerId:string;throughId?:string},expectedPlayerId?:string):Promise<SocialSnapshot>;
    sendNightChat?(input:{requestId:string;text:string;roomCode?:string;recipientId?:string},expectedPlayerId?:string):Promise<ChatSnapshot>;
    reportNightChat?(input:{id:string;reason:string},expectedPlayerId?:string):Promise<unknown>;
    leaderboard(input: { boardId: string;ruleVersion?:string }): Promise<Ranking> };
  createRecorder(version: string, options: { onStatus: (status: string) => void; onSettled?: (settled: { playerId: string; runId: string; result: Settlement; active: boolean }) => void; startTimeoutMs?: number; durable?: { storage: Pick<Storage, 'getItem' | 'setItem'>; source?: string } }): Recorder };
const randomBytes = () => {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes; // Local display identity only; authenticated IDs are assigned by the service.
};
const controls = new Set(['setAim', 'choose', 'setFire', 'clearInput', 'fire', 'adjustAltitude', 'adjustRadius', 'setOrbitDirection','useSkill']);
const validCode = (code: string) => /^(?:[0-9]{6}|[A-F0-9]{12})$/.test(code);
export function invitation(search: string) { const codes = new URLSearchParams(search).getAll('room'); return codes.length === 1 && validCode(codes[0]) ? codes[0] : undefined; }
export function roomLink(href: string, code: string) {
  if (!validCode(code)) throw Error('Invalid room');
  const url = new URL(href); url.search = new URLSearchParams({ room: code, fullscreen: '1' }).toString();
  url.hash = url.username = url.password = ''; return url.href;
}

/** Transport stays in the shared services bridge; this owns only Night's screen and input state. */
export class Online {
  release?: Release;
  checkingRelease = false;
  releaseCheckFailed = false;
  recordSaveStatus: '' | 'saving' | 'saved' | 'failed' = '';
  releaseIssue?: RequestResult;
  private recordSaveAttempt = 0;
  private unsubscribeRequests?: () => void;
  private releaseCheckedAt = 0;
  private recordSaveAt = 0;
  private releaseCheck?: Promise<void>;
  private pendingRequests = new Map<string, RequestResult>();
  get updateNotice() { return !!this.release && this.release.update !== 'none'; }
  private get updateRequired() {
    const release = this.release;
    return release?.update === 'required' && !!release.latestBuildId && release.latestBuildId !== release.currentBuildId;
  }
  async checkRelease() {
    const bridge = this.bridge;
    if (this.destroyed || !bridge) return;
    if (this.releaseCheck) return this.releaseCheck;
    this.checkingRelease = true; this.releaseCheckedAt = performance.now(); this.revision++;
    const check = Promise.resolve().then(async () => {
    try {
      const metadata = await (bridge.refresh?.() ?? bridge.ready);
      if (this.destroyed || this.bridge !== bridge) return;
      if (!metadata || metadata.release !== undefined && !validRelease(metadata.release)) throw Error('Release unavailable');
      this.release = metadata.release; this.releaseCheckFailed = false;
      if(playerId(metadata.identity) === this.authenticatedId) this.acceptCapabilities(metadata.capabilities);
      if (!this.updateRequired) this.releaseIssue = undefined;
    } catch { if (this.bridge === bridge) this.releaseCheckFailed = true; }
    finally { if (this.releaseCheck === check) { this.releaseCheck = undefined; this.checkingRelease = false; if (!this.destroyed) this.revision++; } }
    });
    this.releaseCheck = check;
    return check;
  }
  private async observeRequest(result: RequestResult) {
    if (this.destroyed || result.playerId !== this.authenticatedId) return;
    const key = result.method + ':' + result.path;
    const sameRequest = this.releaseIssue?.path === result.path && this.releaseIssue?.method === result.method;
    if (!result.error || !/^(?:SERVICE_UNAVAILABLE|INTERNAL_ERROR|NOT_FOUND|RULE_VERSION_CHANGED|RULE_NEW_GAMES_DISABLED|RULE_VERSION_RETIRED|BUILD_DISABLED|BUILD_REMOVED|BACKEND_VERSION_DISABLED|NIGHT_RELEASE_UNAVAILABLE)$/.test(result.error)) {
      this.pendingRequests.delete(key);
      if (sameRequest) { this.releaseIssue = undefined; this.revision++; }
      return;
    }
    this.pendingRequests.set(key, result);
    const bridge = this.bridge;
    await this.checkRelease();
    if (this.pendingRequests.get(key) !== result) return;
    this.pendingRequests.delete(key);
    if (this.destroyed || this.bridge !== bridge || result.playerId !== this.authenticatedId) return;
    const versionRejected = /^(?:RULE_VERSION_CHANGED|RULE_VERSION_RETIRED|BUILD_DISABLED|BUILD_REMOVED|BACKEND_VERSION_DISABLED)$/.test(result.error);
    if (this.releaseCheckFailed || !versionRejected || !this.updateRequired) {
      if (sameRequest && this.releaseIssue) { this.releaseIssue = undefined; this.revision++; }
      return;
    }
    const repeated = this.releaseIssue?.path === result.path && this.releaseIssue?.method === result.method;
    this.releaseIssue = result; this.revision++;
    if (!repeated || this.recordSaveStatus === 'failed' && Date.now() - this.recordSaveAt >= 5000) void this.saveRecords();
  }
  async saveRecords() {
    if (this.destroyed || this.recordSaveStatus === 'saving') return;
    const attempt = ++this.recordSaveAttempt, owner = this.authenticatedId, recorder = this.recorder;
    this.recordSaveAt = Date.now(); this.recordSaveStatus = 'saving'; this.revision++;
    try {
      if (recorder?.saveForReentry) {
        if (!(await recorder.saveForReentry())) throw Error('Journal not committed');
      } else recorder?.persist?.();
      await this.storage.flush?.();
      if (attempt !== this.recordSaveAttempt || this.destroyed || owner !== this.authenticatedId || recorder !== this.recorder) return;
      this.recordSaveStatus = 'saved';
    } catch { if (attempt === this.recordSaveAttempt && !this.destroyed && owner === this.authenticatedId) this.recordSaveStatus = 'failed'; }
    finally { if (!this.destroyed) this.revision++; }
  }
  onlineCount: number | null = null;
  onlinePlayers: Player[] = [];
  playersCursor?: string;
  playersNext?: string;
  playersPrevious: (string | undefined)[] = [];
  socialAvailable = false;
  lobbyTab: 'rooms' | 'players' | 'friends' = 'rooms';
  chatInbox = false;
  chatPeer?: Player;
  private inviting = false;
  socialOpen=false;
  activity:'available'|'playing'='available';
  social:SocialSnapshot={friends:[],requests:[],conversations:[],serverNow:0};
  socialBusy=false;
  friendRemoval?:Player;
  socialStatus='';
  conversation:ChatMessage[]=[];
  conversationBefore?:string;
  conversationLoading=false;
  conversationFailed=false;
  notification?:ChatMessage;
  notificationUntil=0;
  private notified=new Set<string>();
  private socialNext=0;
  private socialPolling=false;
  private conversationEpoch=0;
  private readPending=false;
  private readThrough='';
  get incomingFriends(){return this.social.requests.filter(p=>p.direction==='incoming'&&!this.blockedPlayers.has(playerId(p))).length;}
  peer(id:string):Player|undefined{return [...this.onlinePlayers,...this.social.friends,...this.social.requests,...this.social.conversations].find(p=>playerId(p)===id);}
  canInvite(peer:Player){return this.socialAvailable&&this.activity!=='playing'&&!this.active&&!this.busy&&!this.inviting&&!this.chatSending&&!this.blockedPlayers.has(playerId(peer))&&peer.status!=='playing'&&peer.status!=='offline'&&(!this.room||this.room.status==='waiting'&&this.room.visibility==='public'&&this.room.players.length<2&&playerId(this.room.players[0])===this.authenticatedId);}
  canJoinInvitation(message: ChatMessage) {
    const room = message.room;
    return !!room?.canJoin && message.playerId !== this.authenticatedId && !this.busy && !this.active && this.activity !== 'playing' &&
      (!this.room || this.room.status === 'waiting' && !this.spectator && this.room.code !== room.code);
  }
  async refreshSocial(now=performance.now()) {
    if(!this.socialAvailable||!this.foreground||this.destroyed||this.socialPolling||now<this.socialNext||!this.bridge?.services.nightSocial)return;
    const owner=this.authenticatedId;this.socialPolling=true;
    try{const result=await this.bridge.services.nightSocial(undefined,owner);if(owner===this.authenticatedId&&!this.destroyed)this.acceptSocial(result);}
    catch{if(owner===this.authenticatedId){this.socialStatus='好友与会话暂不可用，正在重连';this.revision++;}}
    finally{this.socialPolling=false;this.socialNext=performance.now()+5000;}
  }
  private acceptSocial(result:SocialSnapshot){
    if(result.serverNow<this.social.serverNow)return;
    this.social=result;this.socialStatus='';this.chatRevision++;this.revision++;
    for(const c of [...result.conversations].reverse())if(c.unread&&c.lastMessage.playerId!==this.authenticatedId&&!this.blockedPlayers.has(playerId(c))&&!this.notified.has(c.lastMessage.id)){
      this.notified.add(c.lastMessage.id);
      if(!this.socialOpen||!this.chatPeer||playerId(this.chatPeer)!==playerId(c)){this.notification={...c.lastMessage,nickname:c.nickname||'飞行员'};this.notificationUntil=performance.now()+10000;}
    }
    this.markDirectRead();
  }
  async friendAction(action:'request'|'accept'|'decline'|'cancel'|'remove',peer:string,confirmed=false){
    if(this.socialBusy||!this.bridge?.services.nightSocial||!this.socialAvailable)return;
    if(action==='remove'&&!confirmed){this.friendRemoval=this.social.friends.find(p=>playerId(p)===peer);this.revision++;return;}
    this.friendRemoval=undefined;
    const owner=this.authenticatedId;this.socialBusy=true;this.socialStatus='';this.revision++;
    try{const result=await this.bridge.services.nightSocial({action,playerId:peer},owner);if(owner===this.authenticatedId)this.acceptSocial(result);}
    catch(error){if(owner===this.authenticatedId){const code=(error as {code?:string}).code;this.socialStatus=code==='FRIEND_LIMIT'?'好友已达200人，请先清理':code==='FRIEND_REQUEST_LIMIT'?'待确认的申请已达50条，请先清理':code==='CHAT_RATE_LIMIT'?'操作太快，请稍后重试':'操作未完成，请稍后重试';}}
    finally{this.socialBusy=false;this.revision++;}
  }
  async loadConversation(before?:string){
    if(!this.chatPeer||!this.bridge?.services.nightChat||!this.socialAvailable||this.conversationLoading)return;
    const peer=playerId(this.chatPeer),owner=this.authenticatedId,epoch=this.conversationEpoch;this.conversationLoading=true;this.chatRevision++;
    try{const result=await this.bridge.services.nightChat({direct:true,peer,...(before?{before}:{})},owner);if(epoch!==this.conversationEpoch||owner!==this.authenticatedId)return;
      this.conversation=before?[...result.messages,...this.conversation.filter(m=>!result.messages.some(v=>v.id===m.id))]:result.messages;
      this.conversationBefore=result.nextBefore;this.conversationFailed=false;if(this.chatStatus==='会话读取失败，可点击重试')this.chatStatus='';this.markDirectRead();
    }catch{if(epoch===this.conversationEpoch){this.conversationFailed=true;this.chatStatus='会话读取失败，可点击重试';}}
    finally{if(epoch===this.conversationEpoch){this.conversationLoading=false;this.chatRevision++;}}
  }
  openConversation(peer:Player){this.selectChat(peer);if(this.chatPeer&&playerId(this.chatPeer)===playerId(peer)){this.socialOpen=true;this.notification=undefined;this.markDirectRead();this.revision++;}}
  closeConversation() {
    this.socialOpen = false;
    if (this.chatInbox && !this.inviting && !this.directChat.sending && !this.directChat.intent) this.selectChat();
    this.revision++;
  }
  private directRead = new Set<string>();
  get directUnread() { return this.bridge?.services.nightSocial?this.social.conversations.reduce((n,c)=>n+(this.blockedPlayers.has(playerId(c))?0:c.unread),0):this.chatMessages.filter(m => m.recipientId === this.authenticatedId && !this.blockedPlayers.has(m.playerId) && !this.directRead.has(m.id)).length; }
  showPlayers() { this.lobbyTab = 'players'; if(this.panel !== 'menu')this.show('players'); else this.revision++; this.presenceNext = 0; }
  pagePlayers(next: boolean) {
    if(next && !this.playersNext || !next && !this.playersPrevious.length) return;
    if(next) { this.playersPrevious.push(this.playersCursor); this.playersCursor = this.playersNext; }
    else this.playersCursor = this.playersPrevious.pop();
    this.presenceEpoch++; this.presenceNext = 0; this.onlinePlayers = []; this.playersNext = undefined; this.revision++;
  }
  selectChat(peer?: Player, inbox = false) {
    const abandoned = !!this.directChat.intent && !this.socialAvailable && !this.directChat.sending;
    if (abandoned) this.directChat.intent = undefined;
    if (this.inviting || this.directChat.sending || this.directChat.intent) {
      if (peer && playerId(peer) !== playerId(this.chatPeer || {})) {
        this.publicChat.status = this.inviting ? '正在创建邀请，请稍候' : '请先在原会话确认上一条私信的发送结果';
        this.chatRevision++;
      }
      return;
    }
    if(peer && (!this.socialAvailable || playerId(peer) === this.authenticatedId)) return;
    this.chatPeer = peer; this.chatInbox = inbox || !!peer; this.chatMenu = ''; this.chatRevision++;
    this.directChat.draft = ''; this.directChat.status = '';
    if (abandoned) this.publicChat.status = '已停止重试上一条私信，是否送达暂未确认';
    this.conversationEpoch++;this.conversation=[];this.conversationBefore=undefined;this.conversationLoading=false;this.conversationFailed=false;this.readThrough='';
    if(peer)void this.loadConversation();
    this.markDirectRead();
  }
  private markDirectRead() {
    if(!this.socialOpen || !this.chatInbox || !this.chatPeer) return;
    for(const m of this.visibleChat) if(m.recipientId === this.authenticatedId) this.directRead.add(m.id);
    const peer=this.chatPeer&&playerId(this.chatPeer),last=this.conversation.at(-1),owner=this.authenticatedId;
    if(!peer||!last||this.readPending||this.readThrough===peer+':'+last.id||!this.bridge?.services.nightSocial)return;
    this.readPending=true;
    void this.bridge.services.nightSocial({action:'read',playerId:peer,throughId:last.id},owner).then(result=>{if(owner===this.authenticatedId){this.readThrough=peer+':'+last.id;this.acceptSocial(result);}}).catch(()=>{}).finally(()=>{this.readPending=false;});
  }
  async invitePlayer(peer: Player) {
    if(!this.canInvite(peer)){this.publicChat.status='双方需在线且不在游戏中才能邀请';this.chatRevision++;return;}
    if(this.directChat.intent){this.publicChat.status='上一条私信发送结果待确认，请打开原会话重试';this.chatRevision++;return;}
    if(!this.socialAvailable || this.inviting || this.busy || this.active || this.chatSending || this.blockedPlayers.has(playerId(peer))) return;
    const owner = this.authenticatedId;
    this.selectChat(peer);
    this.inviting = true;this.publicChat.status='正在创建邀请…';this.chatRevision++;
    try {
      if(!this.room) { this.privateRoom = false; await this.open('friend'); }
      if(owner !== this.authenticatedId || this.destroyed) return;
      if(!this.room){this.publicChat.status=this.message||'创建邀请失败，请稍后重试';return;}
      const room = this.room, generation = this.generation;
      this.publicChat.status = ''; this.inviting=false;
      const sent = await this.sendChat(true, 'direct');
      if(owner !== this.authenticatedId || this.destroyed || generation !== this.generation)return;
      if(this.chatRetryPending){this.socialOpen=true;}
      else {
        const confirmation = this.isWaitingForInvitee(room) ? '邀请已发送，等待对方加入' : '';
        const message = this.directChat.status || (sent ? confirmation : '邀请未发送，请稍后重试');
        this.closeConversation();
        if (message) this.message = this.publicChat.status = message;
      }
    } finally { this.inviting = false;if(owner===this.authenticatedId&&!this.socialOpen&&!this.directChat.intent)this.closeConversation();this.chatRevision++;this.revision++; }
  }
  private presenceAvailable = false;
  private presenceEpoch = 0;
  private presenceNext = 0;
  private presencePolling = false;
  onlineLabel(lang: string) {
    return this.onlineCount === null
      ? (lang === 'zh' ? '在线人数暂不可用' : 'Online unavailable')
      : (lang === 'zh' ? `当前在线 ${this.onlineCount} 人` : `${this.onlineCount} online`);
  }
  private setOnlineCount(count: number | null) {
    if (this.onlineCount === count) return;
    this.onlineCount = count;
    this.revision++;
  }
  private resetPresence() {
    this.presenceEpoch++;
    this.presenceNext = 0;
    this.onlinePlayers = []; this.playersNext = this.playersCursor = undefined; this.playersPrevious = [];
    this.setOnlineCount(null);
  }
  private async pollPresence(now: number) {
    if (this.destroyed || !this.foreground || !this.presenceAvailable || this.presencePolling || now < this.presenceNext || !this.bridge?.services.nightPresence) return;
    const epoch = this.presenceEpoch, owner = this.authenticatedId;
    this.presencePolling = true;
    try {
      const result = await this.bridge.services.nightPresence(owner, this.socialAvailable ? {cursor:this.playersCursor,activity:this.activity} : {});
      if (epoch !== this.presenceEpoch || owner !== this.authenticatedId || this.destroyed) return;
      if (!Number.isSafeInteger(result.onlineCount) || result.onlineCount < 0) throw Error('Invalid presence');
      this.setOnlineCount(result.onlineCount);
      if(JSON.stringify(this.onlinePlayers) !== JSON.stringify(result.players || []) || this.playersNext !== result.nextCursor) {
        this.onlinePlayers = result.players || []; this.playersNext = result.nextCursor; this.revision++;
      }
    } catch (error) {
      if (epoch === this.presenceEpoch) { this.onlinePlayers = []; this.playersNext = undefined; this.setOnlineCount(null); this.revision++; }
      if(this.socialAvailable && (error as {code?:string}).code === 'INVALID_INPUT') void this.checkRelease();
    } finally {
      this.presencePolling = false;
      if (epoch === this.presenceEpoch) this.presenceNext = performance.now() + 5000;
    }
  }
  chatMessages:ChatMessage[]=[];chatRevision=0;chatAvailable=false;chatMenu='';
  publicChat: ChatComposer = { draft: '', status: '', sending: false };
  private directChat: ChatComposer = { draft: '', status: '', sending: false };
  private get selectedChat() { return this.chatInbox ? this.directChat : this.publicChat; }
  get chatDraft() { return this.selectedChat.draft; }
  set chatDraft(value: string) { this.selectedChat.draft = value; }
  get chatStatus() { return this.selectedChat.status; }
  set chatStatus(value: string) { this.selectedChat.status = value; }
  get chatSending() { return this.publicChat.sending || this.directChat.sending; }
  get chatRetryPending() { return !!this.selectedChat.intent && !this.selectedChat.sending; }
  get publicMessages() { return this.chatMessages.filter(m => !m.recipientId && !this.blockedPlayers.has(m.playerId)); }
  blockedPlayers=new Set<string>();private chatOwner='';private chatEpoch=0;private chatPoll=false;private chatNext=0;private chatCursor='';private foreground=true;private destroyed=false;
  panelHistory:Online['panel'][]=[];
  get visibleChat(){return (this.chatPeer&&this.bridge?.services.nightSocial?this.conversation:this.chatMessages).filter(m=>!this.blockedPlayers.has(m.playerId === this.authenticatedId ? m.recipientId || '' : m.playerId) && (this.chatInbox ? !!m.recipientId && (!this.chatPeer || m.playerId === playerId(this.chatPeer) || m.recipientId === playerId(this.chatPeer)) : !m.recipientId));}
  setForeground(value:boolean){if(this.foreground===value)return;this.foreground=value;this.chatEpoch++;this.chatNext=0;this.resetPresence();if(value)void this.checkRelease();}
  private chatAcceptedAt=0;
  private acceptChat(result:ChatSnapshot){if(result.serverNow<this.chatAcceptedAt)return;this.chatAcceptedAt=result.serverNow;if(JSON.stringify(this.chatMessages)!==JSON.stringify(result.messages)){this.chatMessages=result.messages;this.chatRevision++;this.revision++;}this.chatCursor=result.cursor;if(this.chatPeer&&this.bridge?.services.nightSocial){const peer=playerId(this.chatPeer),incoming=result.messages.filter(m=>m.recipientId&&(m.playerId===peer||m.recipientId===peer));const ids=new Set(incoming.map(m=>m.id));this.conversation=[...this.conversation.filter(m=>!ids.has(m.id)),...incoming].sort((a,b)=>a.id.length-b.id.length||a.id.localeCompare(b.id));}if(this.publicChat.status==='交流暂不可用，正在重连'){this.publicChat.status='';this.chatRevision++;}this.markDirectRead();}
  private async pollChat(now:number){
    if(this.destroyed||!this.foreground||(!['menu','chat'].includes(this.panel)&&!this.socialAvailable)||!this.chatAvailable||!this.bridge?.services.nightChat||this.chatPoll||now<this.chatNext)return;
    const epoch=this.chatEpoch,owner=this.authenticatedId;this.chatPoll=true;
    try{const result=await this.bridge.services.nightChat({cursor:this.chatCursor||undefined,waitMs:['menu','chat'].includes(this.panel)&&this.chatCursor?5000:0,direct:this.socialAvailable},owner);if(epoch!==this.chatEpoch||owner!==this.authenticatedId||this.destroyed)return;this.acceptChat(result);this.chatNext=performance.now()+(['menu','chat'].includes(this.panel)?200:5000);}
    catch(error){if(epoch===this.chatEpoch){if(!this.publicChat.intent)this.publicChat.status='交流暂不可用，正在重连';this.chatNext=performance.now()+4000;this.chatRevision++;if(this.socialAvailable && (error as {code?:string}).code==='INVALID_INPUT')void this.checkRelease();}}
    finally{this.chatPoll=false;}
  }
  async sendChat(invite=false, channel: 'public' | 'direct' = this.chatInbox ? 'direct' : 'public') {
    if(this.inviting||this.chatSending||!this.chatAvailable||!this.bridge?.services.sendNightChat)return;
    const direct = channel === 'direct', chat = direct ? this.directChat : this.publicChat;
    const peer = direct && this.chatPeer ? playerId(this.chatPeer) : '';
    if (direct && !peer) return;
    if (direct && (!this.socialAvailable || this.blockedPlayers.has(peer))) {
      chat.status = this.socialAvailable ? '请先取消屏蔽后再私信' : '私信服务暂不可用，可返回大厅交流';
      this.chatRevision++;
      return;
    }
    const text = chat.draft.normalize('NFKC').trim();
    const room=invite?this.room:undefined;
    if (invite && chat.intent && (!room || chat.intent.roomCode !== room.code)) {
      chat.status = '请先返回大厅交流重试上一条消息';
      this.chatRevision++;
      return;
    }
    if (!chat.intent) {
      if ((!text && !invite) || Array.from(text).length > 120) {
        chat.status = '请输入1–120个字'; this.chatRevision++; return;
      }
      if (invite && (!room || room.visibility !== 'public' || room.status !== 'waiting' || room.players[0] && playerId(room.players[0]) !== this.authenticatedId)) {
        chat.status = '只有自己创建的公开等待房间可以邀请'; this.chatRevision++; return;
      }
      const bytes = randomBytes();
      bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      chat.intent = {
        requestId: `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`,
        text: text || '来我的房间，一起出动！',
        ...(room ? { roomCode: room.code } : {}),
        ...(direct ? { recipientId: peer } : {}),
      };
    }
    const owner = this.authenticatedId, intent = chat.intent, wasOpen = this.socialOpen;
    const generation = this.generation, invitedRoom = intent.roomCode === this.room?.code ? this.room : undefined;
    chat.sending = true; this.chatRevision++;
    try {
      const result = await this.bridge.services.sendNightChat(intent, owner);
      if (owner !== this.authenticatedId || this.destroyed) return;
      this.chatEpoch++; this.chatNext = 0; this.acceptChat(result);
      chat.intent = undefined;
      if (chat.draft.normalize('NFKC').trim() === intent.text) chat.draft = '';
      chat.status = !direct && this.generation === generation && this.isWaitingForInvitee(invitedRoom) ? '邀请已发到大厅' : '';
      return true;
    } catch(error) {
      if (owner !== this.authenticatedId || this.destroyed) return;
      const code = (error as {code?:string}).code || '';
      const known = ['CHAT_RATE_LIMIT','CHAT_MUTED','INVALID_INPUT','INVITATION_UNAVAILABLE','REQUEST_ID_CONFLICT','RECIPIENT_UNAVAILABLE','RECIPIENT_BUSY'].includes(code);
      if (known) chat.intent = undefined;
      chat.status = code==='CHAT_RATE_LIMIT'?'发言间隔3秒，请稍后再发':code==='CHAT_MUTED'?'当前账号暂时无法发言':code==='RECIPIENT_BUSY'?'对方已离线或正在游戏，暂不能邀请':code==='RECIPIENT_UNAVAILABLE'?'该玩家暂不可接收私信':code==='INVITATION_UNAVAILABLE'?'房间已不再接受邀请':known?'消息未发送，请检查内容':'发送结果待确认，点击发送可安全重试';
    } finally {
      if (owner === this.authenticatedId) {
        chat.sending = false;
        if (direct && wasOpen && !this.socialOpen && !chat.intent) {
          if (chat.status) this.publicChat.status = chat.status;
          this.closeConversation();
        }
        this.chatRevision++;
      }
    }
  }
  toggleBlock(id:string){if(id===this.authenticatedId)return;this.blockedPlayers.has(id)?this.blockedPlayers.delete(id):this.blockedPlayers.add(id);try{this.storage.setItem('night-chat-blocks:'+this.authenticatedId,JSON.stringify(Array.from(this.blockedPlayers)));}catch{}this.chatMenu='';this.chatRevision++;}
  async reportChat(id:string){const owner=this.authenticatedId;try{await this.bridge?.services.reportNightChat?.({id,reason:'玩家举报：不适当或骚扰内容'},owner);if(owner===this.authenticatedId)this.publicChat.status='举报已提交';}catch{if(owner===this.authenticatedId)this.publicChat.status='举报失败，请稍后重试';}if(owner===this.authenticatedId){this.chatMenu='';this.chatRevision++;}}
  back(){this.show(this.panelHistory.pop()||'',false);}
  dispose(){this.destroyed=true;this.generation++;this.unsubscribeRequests?.();this.pendingRequests.clear();this.rewardRefresh=undefined;this.chatEpoch++;this.chatMessages=[];this.publicChat.draft='';this.directChat.draft='';this.resetPresence();}
  identity: Player;
  panel: '' | 'menu' | 'chat' | 'players' | 'friends' | 'room' | 'ranking' | 'profile' | 'create' | 'join' | 'history' | 'version' = '';
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
  private syncAt = 0;
  private hiddenRooms = new Map<string, number>();
  private roomKey = '';
  revision = 0;
  busy = false;
  /** 正在进入的房号（或匹配入口），让按钮在请求返回前立即显示“进入中…”。 */
  opening = '';
  private listing = false;
  private syncedAt = 0;
  private peerOffline = new Map<string, boolean>();
  private peerNotice = { text: '', online: false, until: 0 };
  private peerWait?: { key: string; until: number };
  private peerContinued = '';
  available = false;
  ranked = false;
  message = '';
  rankStatus = 'local';
  assets?:AssetSnapshot;
  battleReward?:Settlement;
  /** A run played offline earlier and credited after the player left its result screen. */
  offlineSettled?:Settlement;
  private battleReceipt = '';
  private rewardRefresh?: { owner: string; inflight: boolean; retryAt: number };
  private rankingAttempt = 0;
  rankingVersion=CAMPAIGN_BOARD_VERSION;
  authenticatedId='';
  level = 0;
  ranking?: Ranking;
  room?: Room;
  view?: DuelView;
  bot?: DuelState;
  recorder?: Recorder;
  private generation = 0;
  private rankingRequest = 0;
  private restoreRoomOnConnect = true;
  private commands: DuelCommand[] = [];
  private pending?: { seq: number; action: { commands: DuelCommand[]; keepAlive: true } };
  private inflight = false;
  private roomRequests: Promise<unknown> = Promise.resolve();
  private releasing?: Room;
  private replaced = false;
  private nextPoll = 0;
  private botStarted = 0;
  private bridge?: Bridge;
  // Serialize room mutations with polls; a cancelled creation must leave before the next join.
  private requestRoom<T>(request: () => Promise<T>): Promise<T> {
    const pending = this.roomRequests.catch(() => {}).then(request);
    this.roomRequests = pending;
    return pending;
  }
  private async releaseRoom(room: Room) {
    if (room.status !== 'playing') this.hideRoom(room.code);
    this.releasing = room;
    let result:Room|undefined;
    try { result=await this.bridge!.services.roomAction({ code: room.code, operation: 'leave' }); }
    catch (error) { if (!['INVITATION_NOT_FOUND','ROOM_NOT_FOUND','NOT_A_MEMBER','STALE_LEASE'].includes((error as {code?:string}).code || '')) throw error; }
    if (this.releasing === room) this.releasing = undefined;
    return result;
  }
  private hideRoom(code: string) {
    for (const [id, until] of this.hiddenRooms) if (until <= Date.now()) this.hiddenRooms.delete(id);
    this.hiddenRooms.set(code, Date.now() + 2000);
    this.rooms = this.rooms.filter(room => room.code !== code);
    this.revision++;
  }
  readonly changed: (view: DuelView | undefined, start: boolean) => void;
  private readonly storage: OnlineStorage;
  constructor(storage: OnlineStorage, changed: (view: DuelView | undefined, start: boolean) => void) {
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
    if (!bridge || this.bridge === bridge) return;
    const generation = this.generation;
    this.unsubscribeRequests?.(); this.recordSaveAttempt++; this.recordSaveStatus = ''; this.releaseIssue = undefined;
    this.releaseCheck = undefined; this.checkingRelease = false; this.pendingRequests.clear();
    this.bridge = bridge;
    this.unsubscribeRequests = bridge.subscribeRequests?.(result => { if (this.bridge === bridge) void this.observeRequest(result); });
    this.presenceAvailable = false;
    this.socialAvailable = false;
    this.resetPresence();
    if (bridge) {
      const recorder = bridge.createRecorder(RANKED_RULE_VERSION, { durable: { storage: this.storage, source: (this.storage as {source?:string}).source || 'cocos.localStorage' }, startTimeoutMs: 8000, onStatus: status => {
        if (this.destroyed || this.bridge !== bridge || this.recorder !== recorder) return;
        this.rankStatus = status === 'expired' ? 'unavailable' : status;
        if (status === 'expired') this.message = '本次行动已结束或超过 24 小时，请重新开始';
        const settled = this.recorder?.settlement;
        if (settled?.playerId === this.authenticatedId) this.receiveBattleReward(settled.result, settled.runId);
        this.revision++;
      }, onSettled: settled => {
        if (this.destroyed || this.bridge !== bridge || this.recorder !== recorder || settled.active || settled.playerId !== this.authenticatedId || settled.result?.status !== 'credited') return;
        this.offlineSettled = settled.result; this.revision++;
        this.rewardRefresh = { owner: this.authenticatedId, inflight: false, retryAt: 0 };
      } });
      this.recorder = recorder;
      const metadata = await bridge.ready;
      if (this.destroyed || this.bridge !== bridge) return;
      this.acceptMetadata(metadata);
      void this.recorder.recover?.();
    }
    this.revision++;
    const code = search ? invitation(search) : undefined;
    if (generation !== this.generation || !this.restoreRoomOnConnect) return;
    try {
      const saved = JSON.parse(this.storage.getItem('night-overwatch-room-v1') || 'null');
      if (saved && saved.playerId === playerId(this.identity) && validCode(saved.code) && Date.now() - saved.at < 30000) this.resumeCode = saved.code;
    } catch { /* Invalid local room memory cannot join a different identity. */ }
    if (code) { this.draftCode = code; this.panel = 'join'; await this.open('join', code); }
    else if (this.resumeCode) await this.open('resume', this.resumeCode);
  }
  async startRanking(options: Parameters<Recorder['start']>[0]) {
    this.battleReward = undefined; this.battleReceipt = '';
    const attempt = ++this.rankingAttempt;
    const generation = this.generation;
    if (!this.ranked) {
      try {
        const metadata = await (this.bridge?.refresh ? this.bridge.refresh() : this.bridge?.ready);
        if (generation !== this.generation || attempt !== this.rankingAttempt || this.destroyed) return;
        this.acceptMetadata(metadata);
      } catch { /* A failed identity lookup must not start a run under an unconfirmed pilot. */ }
    }
    if (generation !== this.generation || attempt !== this.rankingAttempt || this.destroyed) return;
    if (!this.ranked && !this.recorder?.recover) {
      this.rankStatus = options.practice ? 'practice' : 'unavailable'; this.revision++;
      return;
    }
    return this.recorder?.start(options);
  }
  /** Journal a solo run locally while the mission service is unreachable; settles on a later sync. */
  async startOffline(levelId: string) {
    const recorder = this.recorder, attempt = ++this.rankingAttempt;
    this.battleReward = undefined; this.battleReceipt = '';
    if (!recorder?.startOffline) return undefined;
    const loadout = offlineLoadout(this.assets);
    const run = await recorder.startOffline({ mode: 'level-' + levelId, levelId, loadout });
    if (this.destroyed || recorder !== this.recorder || attempt !== this.rankingAttempt || !run) return undefined;
    return loadout;
  }
  cancelRanking() {
    this.rankingAttempt++; this.battleReward = undefined; this.battleReceipt = '';
    this.recorder?.invalidate();
  }
  get storageDiagnostic() { return this.recorder?.storageDiagnostic || ''; }
  private receiveBattleReward(result: Settlement | null | undefined, receipt: string) {
    if (result?.status !== 'credited' || !Number.isSafeInteger(result.coins) || !Number.isSafeInteger(result.xp) || result.coins! < 0 || result.xp! < 0 || this.battleReceipt === receipt) return;
    this.battleReward = result; this.battleReceipt = receipt; this.revision++;
    this.rewardRefresh = { owner: this.authenticatedId, inflight: false, retryAt: 0 };
    void this.refreshBattleAssets(performance.now());
  }
  private async refreshBattleAssets(now: number) {
    const pending = this.rewardRefresh;
    if (!pending || pending.inflight || now < pending.retryAt || !this.foreground || this.destroyed) return;
    if (pending.owner !== this.authenticatedId) { this.rewardRefresh = undefined; return; }
    pending.inflight = true;
    try {
      await this.refreshAssets();
      if (this.rewardRefresh === pending) this.rewardRefresh = undefined;
    } catch {
      pending.retryAt = performance.now() + 5000;
    } finally { pending.inflight = false; }
  }
  async finishRanking() {
    const recorder = this.recorder, owner = this.authenticatedId, attempt = this.rankingAttempt;
    try {
      const result = await recorder?.finish();
      if (this.destroyed || recorder !== this.recorder || owner !== this.authenticatedId || attempt !== this.rankingAttempt) return;
      this.receiveBattleReward(result, recorder?.settlement?.runId || 'attempt:' + attempt);
      if (result?.accepted && result.fastestEligible === false) { this.rankStatus = (result as {offline?:boolean}).offline ? 'offline-finished' : 'assisted'; this.revision++; }
    } catch { this.revision++; }
  }
  private acceptMetadata(metadata: Metadata | undefined) {
    if (!metadata) return;
    if (metadata.release === undefined || validRelease(metadata.release)) this.release = metadata.release;
    else this.releaseCheckFailed = true;
    if (!this.updateRequired) this.releaseIssue = undefined;
    const owner=playerId(metadata.identity);
    if (owner !== this.authenticatedId) { this.resetPresence(); this.recordSaveAttempt++; this.recordSaveStatus = ''; this.releaseIssue = undefined; this.pendingRequests.clear(); }
    if (owner !== this.authenticatedId) this.rewardRefresh = undefined;
    if(owner!==this.authenticatedId){this.assets=undefined;this.battleReward=undefined;this.authenticatedId=owner;this.chatEpoch++;this.chatMessages=[];this.publicChat={draft:'',status:'',sending:false};this.directChat={draft:'',status:'',sending:false};this.chatMenu='';this.chatCursor='';this.chatAcceptedAt=0;this.chatOwner=owner;this.chatRevision++;this.blockedPlayers=new Set();try{this.blockedPlayers=new Set(JSON.parse(this.storage.getItem('night-chat-blocks:'+owner)||'[]'));}catch{}}
    if(owner !== playerId(this.identity)) { this.chatPeer = undefined; this.chatInbox = false; this.directRead.clear();this.socialOpen=false;this.friendRemoval=undefined;this.social={friends:[],requests:[],conversations:[],serverNow:0};this.socialNext=0;this.conversation=[];this.conversationEpoch++;this.conversationLoading=false;this.conversationFailed=false;this.notification=undefined;this.notified.clear();this.readThrough=''; this.resetPresence(); }
    this.identity = metadata.identity;
    this.draftName = this.identity.nickname || this.identity.name || '';
    this.acceptCapabilities(metadata.capabilities);
    this.revision++;
  }
  private acceptCapabilities(capabilities: Metadata['capabilities']) {
    this.available = capabilities.multiplayer;
    this.ranked = capabilities.leaderboards;
    this.chatAvailable=!!capabilities.chat&&!!this.bridge?.services.nightChat;
    if(this.socialAvailable && !capabilities.social) { this.playersCursor = this.playersNext = undefined; this.playersPrevious = []; this.onlinePlayers = []; this.presenceEpoch++; this.presenceNext = 0; this.chatEpoch++; this.chatCursor = ''; this.chatNext = 0; }
    this.socialAvailable=!!capabilities.social;if(!this.socialAvailable)this.notification=undefined;
    this.presenceAvailable=!!capabilities.presence&&!!this.bridge?.services.nightPresence;
    if (!this.presenceAvailable) this.resetPresence();
    this.revision++;
  }
  assetsReceivedAt=0;
  private acceptAssets(result: AssetSnapshot) {
    const current = this.assets;
    // 迟到的读取不能撤销已到账的资产；命令仍向调用方返回自己的交易回执。
    if (current?.playerId === result.playerId && (result.revision < current.revision ||
      result.revision === current.revision && result.serverNow < current.serverNow)) return;
    this.assets=result;this.assetsReceivedAt=performance.now();this.revision++;
  }
  async refreshAssets(){
    if(!this.bridge?.services.nightAssets)throw Error('Assets unavailable');
    this.acceptMetadata(await (this.bridge.refresh?.()??this.bridge.ready));
    const owner=this.authenticatedId,result=await this.bridge.services.nightAssets(owner);
    if(owner!==this.authenticatedId||result.playerId!==owner)throw Object.assign(Error('Identity changed'),{code:'IDENTITY_CHANGED'});
    if (!this.destroyed) this.acceptAssets(result);return result;
  }
  async assetCommand(command:AssetCommand){
    if(!this.bridge?.services.nightAssetCommand)throw Error('Assets unavailable');
    const owner=this.authenticatedId,result=await this.bridge.services.nightAssetCommand(command,owner);
    if(owner!==this.authenticatedId||result.playerId!==owner)throw Object.assign(Error('Identity changed'),{code:'IDENTITY_CHANGED'});
    if (!this.destroyed) this.acceptAssets(result);return result;
  }
  get active() { return !!this.view; }
  get spectator() { return !!this.room?.spectator || this.room?.you === -1; }
  get entering() { return this.active && performance.now() < this.enteringUntil; }
  get combatants():Player[]{const seat=this.view?.you??(this.room?.you===1?1:0);return [this.room?.players[seat]||this.identity,this.room?.players[1-seat]||this.opponent];}
  get opponent(): Player { return this.room?.players[this.room.you === 1 ? 0 : 1]
    || (this.view?.bot ? { id: 'bot-' + this.view.seed, name: '训练机器人' } : { name: '等待对手' }); }
  /** 对手下线／重新上线各提示 4 秒；结算后不再显示。 */
  get offlineNotice() {
    return !this.view?.finished && performance.now() < this.peerNotice.until ? this.peerNotice.text : '';
  }
  get peerBackOnline() { return this.peerNotice.online; }
  get peerReconnectSeconds() { return Math.max(0, Math.ceil(((this.peerWait?.until ?? 0) - performance.now()) / 1000)); }
  get peerChoice() { return !!this.peerWait && this.peerWait.key !== this.peerContinued && this.peerReconnectSeconds > 0 && !this.view?.finished; }
  continueWithoutPeer() { this.peerContinued = this.peerWait?.key || ''; this.revision++; }
  /** 自己的请求报错，或超过 3 秒没有收到房间同步时，提示正在重连。 */
  get reconnecting() {
    return this.connectionLost || !this.bot && this.room?.status === 'playing' && !this.view?.finished
      && this.syncedAt > 0 && performance.now() - Math.max(this.syncedAt, this.enteringUntil) > 3000;
  }
  private trackPeers(room: Room) {
    const peer = !this.spectator && !room.players[room.you]?.takenOver && room.players[room.you === 1 ? 0 : 1];
    if (room.status !== 'playing' || room.state?.finished || room.settlement || !peer || !peer.disconnected || peer.takenOver || !peer.reconnectUntil) {
      this.peerWait = undefined; this.peerContinued = '';
    } else {
      const key = `${playerId(peer)}:${peer.reconnectUntil}`;
      if (key !== this.peerWait?.key) {
        this.peerContinued = '';
        this.commands = [{ command: 'clearInput', args: [] }];
        this.revision++;
      }
      const until = performance.now() + Math.max(0, peer.reconnectUntil - (room.serverNow ?? Date.now()));
      this.peerWait = { key, until: key === this.peerWait?.key ? Math.min(until, this.peerWait.until) : until };
    }
    if (room.status !== 'playing' || room.state?.finished || room.settlement) { this.peerNotice.until = 0; return; }
    room.players.forEach((player, i) => {
      if (!this.spectator && i === room.you) return;
      const id = playerId(player) || String(i), was = this.peerOffline.get(id), offline = !!player.disconnected;
      this.peerOffline.set(id, offline);
      if (was === undefined ? !offline : was === offline) return;
      this.peerNotice = { text: (player.nickname || player.name || '对方') + (offline ? ' 已下线' : ' 已重新上线'), online: !offline, until: performance.now() + 4000 };
      this.revision++;
    });
  }
  show(panel: Online['panel'],push=true) {
    if(push&&panel&&panel!==this.panel)this.panelHistory.push(this.panel);
    if(panel!==this.panel){this.chatEpoch++;this.chatNext=0;}
    if (panel === 'profile') this.draftName = this.identity.nickname || this.identity.name || '';
    this.panel = panel; this.message = ''; this.revision++;
    if (['', 'menu', 'version'].includes(panel)) void this.checkRelease();
  }
  private rememberRoom(room?: Room) {
    try { this.storage.setItem('night-overwatch-room-v1', room && !room.spectator && room.you >= 0 && room.status === 'playing'
      ? JSON.stringify({ code: room.code, playerId: playerId(this.identity), at: Date.now() - (room.players[room.you]?.reconnectUntil ? Math.max(0, 30000 - (room.players[room.you].reconnectUntil! - (room.serverNow ?? Date.now()))) : 0) }) : 'null'); } catch { /* Session remains playable without storage. */ }
  }
  async loadRooms() {
    // 列表刷新不占用 busy，否则刷新期间点“加入／观战”会被静默忽略。
    // 收起等待中的房间时大厅仍需实时列表；开战后停止。
    if (this.listing || this.busy || this.active || this.room && this.room.status !== 'waiting') return;
    this.listing = true; const generation = this.generation;
    try {
      if (!this.bridge?.services.listRooms) { this.message = '联机暂不可用，可选择本地人机练习'; return; }
      const { rooms } = await this.bridge.services.listRooms();
      if (generation === this.generation) {
        this.rooms = rooms.filter(room => (this.hiddenRooms.get(room.code) || 0) <= Date.now());
        if(['网络异常，正在重新读取房间','联机暂不可用，可选择本地人机练习'].includes(this.message))this.message='';
      }
    } catch { if (generation === this.generation) this.message = '网络异常，正在重新读取房间'; }
    finally { this.listing = false; if (generation === this.generation) { this.listAt = performance.now() + 3000; this.revision++; } }
  }
  async saveName() {
    if (this.busy) return;
    const nickname = this.draftName.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (this.draftName.length > 100 || Array.from(nickname).length < 2 || Array.from(nickname).length > 16 || !/^[\p{L}\p{N} ·_-]+$/u.test(nickname)) {
      this.message = '昵称需为 2–16 个字，可用文字、数字、空格、·、_、-'; this.revision++; return;
    }
    this.busy = true;
    try {
      if (this.bridge?.services.updateProfile) this.identity = await this.bridge.services.updateProfile({ nickname });
      else {
        this.identity = { ...this.identity, name: nickname, nickname };
        this.storage.setItem('night-overwatch-pilot-v1', JSON.stringify(this.identity));
      }
      this.message = this.available ? '昵称已保存' : '昵称已保存在本机'; this.draftName = this.identity.nickname || this.identity.name || nickname;
      if (this.panel === 'profile') this.back();
    } catch { this.message = '昵称保存失败，请重试'; }
    finally { this.busy = false; this.revision++; }
  }
  async loadHistory(cursor?: string) {
    if (this.busy) return;
    this.show('history'); this.busy = true;
    const generation = this.generation;
    try {
      if (!this.bridge?.services.history) { this.message = '对战记录暂不可用'; return; }
      const result = await this.bridge.services.history({ cursor });
      if (generation !== this.generation || this.panel !== 'history') return;
      this.history = cursor && this.history ? { ...result, matches: [...this.history.matches, ...result.matches] } : result;
      if (!cursor) this.historyPage = 0;
    } catch { if (generation === this.generation) this.message = '对战记录读取失败，请重试'; }
    finally { if (generation === this.generation) { this.busy = false; this.revision++; } }
  }
  async open(kind: 'friend' | 'match' | 'join' | 'bot' | 'watch' | 'resume', code?: string,createdAt?:number) {
    const invitation = kind === 'join' && createdAt !== undefined;
    const previous = invitation && this.room?.status === 'waiting' && !this.spectator && this.room.code !== code ? this.room : undefined;
    if (this.destroyed || this.busy || this.active || this.room && !previous || invitation && this.activity === 'playing') return;
    if (kind === 'friend' && this.privateRoom && (this.draftPassword.length < 4 || this.draftPassword.length > 64)) {
      this.message = '私密房密码需要 4–64 个字符'; this.revision++; return;
    }
    if (['join', 'watch', 'resume'].includes(kind) && !validCode(code || this.draftCode.trim().toUpperCase())) {
      this.message = '请输入正确的房间号'; this.revision++; return;
    }
    this.message = ''; const generation = ++this.generation;
    if (previous) { this.inflight = false; this.nextPoll = 0; }
    this.busy = true; this.opening = code || (['join', 'watch'].includes(kind) ? this.draftCode.trim().toUpperCase() : kind); this.revision++;
    try {
      if (!this.bridge || kind === 'bot' && !this.available) {
        if (kind === 'bot') { this.busy = false; this.startBot(performance.now()); return; }
        this.message = '联机服务暂不可用，可选择本地人机练习'; return;
      }
      const services = this.bridge.services, input = { code: code || this.draftCode.trim().toUpperCase(), password: invitation ? undefined : this.draftPassword || undefined, createdAt };
      const room = await this.requestRoom(async () => {
        if (generation !== this.generation) return;
        if (this.releasing) await this.releaseRoom(this.releasing);
        if (generation !== this.generation) return;
        if (kind === 'resume') {
          const previous = await services.getRoom({ code: input.code });
          this.assertRoomVersion(previous);
          if (generation !== this.generation) return;
        }
        const room = kind === 'friend' || kind === 'bot'
        ? await services.createRoom({ mode: kind, visibility: this.privateRoom && kind === 'friend' ? 'private' : 'public', ...(this.privateRoom && kind === 'friend' ? { password: this.draftPassword } : {}) })
        : kind === 'match' ? await services.match()
        : kind === 'watch' ? await services.spectateRoom!(input)
        : kind === 'resume' ? await services.connectRoom!({ code: input.code })
        : await services.joinRoom(previous ? { ...input, switchFrom: previous.code } : input);
        if(this.destroyed)return;
        if (generation !== this.generation) { await this.releaseRoom(room); return; }
        return room;
      });
      if (!room || generation !== this.generation) return;
      if (previous) this.hideRoom(previous.code);
      if (invitation) this.closeConversation();
      this.panel = 'room'; this.draftPassword = ''; this.accept(room); this.nextPoll = 0;
      if (kind === 'bot' && room.status === 'waiting') {
        const started = await this.requestRoom(async () => generation === this.generation
          ? services.roomAction({ code: room.code, operation: 'ready', body: { ready: true } }) : undefined);
        if (started && generation === this.generation) this.accept(started);
      }
    } catch (error) {
      if (generation === this.generation) {
        const { code = '', incompatibleRoom } = error as { code?: string; incompatibleRoom?: boolean };
        this.message = incompatibleRoom ? '此房间使用不同的对战规则，请返回大厅'
          : /PASSWORD/.test(code) ? '房间密码不正确，请重新输入'
          : /FULL|STARTED/.test(code) ? '房间已满或已经开战，请选择其他房间'
          : /STALE_LEASE/.test(code) ? '此对局已在另一个页面恢复'
          : code === 'ACTIVE_ROOM' ? '你还有一场未结束的对战，请先返回原房间'
          : code === 'INVITATION_EXPIRED' ? '邀请已失效，请让对方重新邀请'
          : /^(?:RULE_VERSION_CHANGED|RULE_VERSION_RETIRED|BUILD_DISABLED|BUILD_REMOVED|BACKEND_VERSION_DISABLED)$/.test(code) ? '版本不匹配，请重新进入游戏或等待服务更新'
          : code === 'RULE_NEW_GAMES_DISABLED' ? '对战暂未开放新开局，请稍后重试'
          : /^(?:SERVICE_UNAVAILABLE|INTERNAL_ERROR|NIGHT_RELEASE_UNAVAILABLE)$/.test(code) ? '房间服务暂不可用，请稍后重试'
          : /ROOM_NOT_FOUND|INVITATION_NOT_FOUND|MATCH_CLOSED/.test(code) ? '房间不存在或已关闭，请确认房间号'
          : kind === 'friend' || kind === 'bot' ? '创建房间失败，请稍后重试' : '暂时无法进入房间，请检查房号与网络后重试';
        if (invitation && this.socialOpen) { this.directChat.status = this.message; this.chatRevision++; }
        if (kind === 'resume' && ['PLAYER_DISCONNECTED', 'NOT_A_MEMBER', 'ROOM_NOT_FOUND', 'INVITATION_NOT_FOUND', 'MATCH_CLOSED', 'STALE_LEASE'].includes(code)) { this.resumeCode = ''; this.rememberRoom(); }
      }
    } finally { if (generation === this.generation) { this.busy = false; this.opening = ''; this.revision++; } }
  }
  startBot(now: number) {
    if (this.busy || this.active || this.room) return;
    this.generation++; this.bot = createDuel(new DataView(randomBytes().buffer).getUint32(0) & 0x7fffffff, true);
    configureDuel(this.bot,[practiceLoadout(this.assets,'duel',performance.now()-this.assetsReceivedAt)]);
    this.botStarted = now + 1200; this.nextPoll = 0; this.panel = ''; this.message = '本地练习 · 不计公开积分';
    this.enteringUntil = this.botStarted;
    this.acceptView(viewDuel(this.bot));
  }
  async ready() {
    if (!this.room || this.room.status !== 'waiting' || !this.bridge || this.busy || this.active || this.spectator) return;
    const generation = this.generation, code = this.room.code, round = this.room.id, ready = !this.room.players[this.room.you]?.ready;
    this.busy = true; this.message = ''; this.revision++;
    try { const room = await this.requestRoom(async () => generation === this.generation && this.room?.code === code && this.room.id === round && this.room.status === 'waiting' && !this.active && !this.spectator
      ? this.bridge!.services.roomAction({ code, operation: 'ready', body: { ready } }) : undefined);
      if (room && generation === this.generation) this.accept(room);
    } catch { if (generation === this.generation) this.message = '准备状态更新失败，请重试'; }
    finally { if (generation === this.generation) { this.busy = false; this.revision++; } }
  }
  async rematch(){
    if(!this.room||!this.view?.finished||this.spectator||this.busy||!this.bridge)return false;
    const generation=this.generation,code=this.room.code;this.busy=true;this.message='';this.revision++;
    try {
      const next=await this.requestRoom(async()=>{
        const old=await this.bridge!.services.roomAction({code,operation:'rematch'});
        if(generation!==this.generation||!old.rematch)return;
        return old.rematch === old.code ? old : this.bridge!.services.connectRoom!({code:old.rematch});
      });
      if(!next||generation!==this.generation)return false;
      this.accept(next);this.nextPoll=0;return true;
    }catch{if(generation===this.generation)this.message='再战准备未完成，队友可能已退出；可重试或退出房间';return false;}
    finally{if(generation===this.generation){this.busy=false;this.revision++;}}
  }
  leave() {
    this.restoreRoomOnConnect = false;
    this.clearInvitationConfirmation();
    const room = this.room; this.generation++; this.busy = false; this.opening = ''; this.inflight = false;
    const resumable = room?.status === 'playing' && !this.view?.finished && !this.spectator && !this.replaced && !room.players[room.you]?.takenOver;
    if (resumable) this.lobbyTab = 'rooms';
    this.syncedAt = 0; this.peerOffline.clear(); this.peerNotice = { text: '', online: false, until: 0 };
    this.peerWait = undefined; this.peerContinued = '';
    if (room && !resumable) this.hideRoom(room.code);
    this.resumeCode = resumable ? room!.code : room || this.bot ? '' : this.resumeCode;
    if (room || !this.resumeCode) this.rememberRoom(resumable ? room : undefined);
    void this.storage.flush?.().catch(() => {});
    this.connectionLost = false; this.replaced = false; this.roomKey = ''; this.enteringUntil = 0;
    this.room = this.view = this.bot = undefined; this.panel = ''; this.message = resumable ? '已离开，可在30秒内返回原对战；超时由机器人接管，未回归不获收益' : '';
    this.commands = []; this.pending = undefined; this.nextPoll = 0; this.botStarted = 0; this.revision++;
    const generation=this.generation,owner=this.authenticatedId;
    if (room && this.bridge) void this.requestRoom(() => this.releaseRoom(room)).then(result=>{
      if(generation!==this.generation||owner!==this.authenticatedId||this.destroyed)return;
      if(resumable && result){
        if(result.status !== 'playing' || result.settlement || result.players[result.you]?.takenOver){this.resumeCode='';this.rememberRoom();}
        else this.rememberRoom(result);
        this.revision++;
      }
      return this.storage.flush?.();
    }).catch(() => {
      if(generation===this.generation&&owner===this.authenticatedId){this.message = '离开房间未确认，再次进入时会重试'; this.revision++;}
    });
  }
  control(input: Record<string, unknown>) {
    if (!this.view || this.view.finished || this.spectator || this.entering || !controls.has(String(input.command))) return;
    const command = input as DuelCommand;
    if (this.room?.players[this.room.you]?.takenOver || this.peerChoice && command.command !== 'clearInput' && !(command.command === 'setFire' && command.args[1] === false)) return;
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
    if(this.destroyed)return;
    if (this.foreground && now - this.releaseCheckedAt >= 60000) void this.checkRelease();
    if (this.foreground && this.recordSaveStatus === 'failed' && Date.now() - this.recordSaveAt >= 5000) void this.saveRecords();
    void this.pollPresence(now);
    void this.refreshSocial(now);
    void this.refreshBattleAssets(now);
    void this.pollChat(now);
    if (now >= this.syncAt) { this.syncAt = now + 10000; void this.recorder?.recover?.(); }
    if (this.replaced) return;
    if (this.bot) {
      if (now < this.nextPoll) return;
      this.nextPoll = now + 50;
      if (!this.bot.finished && now >= this.botStarted) { advanceDuel(this.bot, now - this.botStarted); this.acceptView(viewDuel(this.bot)); }
      return;
    }
    if (this.entering) return;
    if (this.panel === 'menu' && now >= this.listAt) { if (!this.room) { await this.loadRooms(); return; } void this.loadRooms(); }
    if (!this.room || !['waiting', 'playing','finished'].includes(this.room.status) || !this.bridge || this.busy || this.inflight || now < this.nextPoll) return;
    const generation = this.generation, code = this.room.code;
    this.inflight = true; this.nextPoll = now + (this.room.status === 'playing'&&!this.view?.finished ? 100 : this.room.status==='finished'?3000:1000);
    try {
      const room = await this.requestRoom(async () => {
      if (generation !== this.generation || !this.room || !this.bridge) return;
      let room: Room;
      if (this.room.status === 'playing' && !this.spectator&&!this.view?.finished && !this.room.players[this.room.you]?.takenOver) {
        this.pending ||= { seq: this.room.seq + 1, action: { commands: this.commands.splice(0, 64), keepAlive: true } };
        try { room = await this.bridge.services.roomAction({ code, operation: 'actions', body: this.pending }); }
        catch (error) {
          const stale = (error as { code?: string }).code === 'STALE_LEASE';
          if (!stale && !['MATCH_CLOSED', 'PLAYER_FINISHED', 'PLAYER_DISCONNECTED'].includes((error as { code?: string }).code || '')) throw error;
          room = await this.bridge.services.getRoom({ code });
          if (stale && !this.isNewRound(room)) throw error;
        }
      } else room = await this.bridge!.services.getRoom({ code });
      if (generation !== this.generation) return;
      if (this.isNewRound(room) && !this.spectator) {
        this.assertRoomVersion(room);
        room = await this.bridge.services.roomAction({ code, operation: 'rematch' });
      }
      return room;
      });
      if (!room || generation !== this.generation) return;
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
    } finally { if (generation === this.generation) this.inflight = false; }
  }
  private assertRoomVersion(room: Room) {
    if (room.state && room.version && room.version !== DUEL_VERSION)
      throw Object.assign(Error('This build cannot render the historical room'), { code: 'RULE_VERSION_CHANGED', incompatibleRoom: true });
  }
  private isNewRound(room: Room) { return !!this.room && (this.room.code !== room.code || !!this.room.id && !!room.id && this.room.id !== room.id); }
  private isWaitingForInvitee(invited?: Room) {
    return !!invited && this.room?.code === invited.code && this.room.id === invited.id && this.room.status === 'waiting' && this.room.players.length < 2;
  }
  private clearInvitationConfirmation() {
    const confirmed = (status: string) => status === '邀请已发到大厅' || status === '邀请已发送，等待对方加入';
    if (confirmed(this.message)) this.message = '';
    if (confirmed(this.publicChat.status)) { this.publicChat.status = ''; this.chatRevision++; }
  }
  private accept(room: Room) {
    this.assertRoomVersion(room);
    const reset = this.isNewRound(room) || !!this.view && room.status === 'waiting' && !room.state;
    if (reset) {
      this.view = this.bot = undefined; this.pending = undefined; this.commands = [];
      this.peerWait = undefined; this.peerContinued = ''; this.peerOffline.clear(); this.peerNotice = { text: '', online: false, until: 0 };
      this.roomKey = ''; this.enteringUntil = 0; this.botStarted = 0; this.nextPoll = 0;
      this.connectionLost = this.replaced = false; this.message = ''; this.panelHistory = []; this.panel = 'room';
    }
    if (reset || room.status !== 'waiting' || room.players.length >= 2) this.clearInvitationConfirmation();
    const start = !this.view && !!room.state;
    this.room = room; this.syncedAt = performance.now(); this.trackPeers(room);
    if (reset) this.changed(undefined, true);
    const key = JSON.stringify([room.code, room.id, room.status, room.players, room.settlement, room.you]);
    if (key !== this.roomKey) { this.roomKey = key; this.revision++; }
    if (room.status === 'playing' && !this.spectator && !room.players[room.you]?.takenOver) { this.resumeCode = room.code; this.rememberRoom(room); }
    else { this.resumeCode = ''; this.rememberRoom(); }
    if (room.state?.finished) { this.resumeCode = ''; this.rememberRoom(); }
    if (start) this.enteringUntil = performance.now() + (room.startsAt === undefined ? 0
      : Math.max(900, room.startsAt - (room.serverNow || Date.now())));
    if (room.state) {
      if (room.you >= 0 && room.settlement) {
        const state = { ...room.state, simulation: { ...room.state.simulation } };
        state.finished = true;
        if (room.settlement.reason !== 'elimination') state.winner = room.settlement.outcome==='draw'||room.settlement.reason==='abandoned'?null:room.settlement.outcome==='win'?room.you:1-room.you;
        state.simulation.phase = room.settlement.outcome==='win'?'success':'failure';
        if(room.settlement.durationMs!==undefined){state.elapsed=room.settlement.durationMs/1000;state.simulation.time=state.elapsed;state.simulation.completionTime=state.elapsed;}
        state.simulation.held=[];
        this.resumeCode = ''; this.rememberRoom();
        this.message = duelEndNotice(room.settlement)?.[0]||'';
        this.acceptView(state);
        return;
      }
      if (!['waiting', 'playing', 'finished'].includes(room.status) && !room.state.finished) {
        const state = { ...room.state, finished: true, winner: null, simulation: { ...room.state.simulation, phase: 'failure' as const } };
        this.message = '房间已结束'; this.acceptView(state); return;
      }
      if(this.view?.finished&&room.state.finished)this.view=room.state;
      else this.acceptView(room.state);
    }
    else if (!['waiting', 'playing'].includes(room.status)) this.message = '房间已结束或对手已离开，请返回';
  }
  private acceptView(view: DuelView) {
    const start = !this.view;
    this.view = view; if (start) this.panel = '';
    this.changed(view, start);
  }
  async cycleRankingVersion() { this.rankingVersion=this.rankingVersion===CAMPAIGN_BOARD_VERSION?'night-campaign-v3':this.rankingVersion==='night-campaign-v3'?'night-campaign-v2':this.rankingVersion==='night-campaign-v2'?'night-growth-v1':this.rankingVersion==='night-growth-v1'?'night-records-v1':CAMPAIGN_BOARD_VERSION;await this.loadRanking(); }
  async loadRanking(level = this.level, board = this.board) {
    const request = ++this.rankingRequest;
    this.board = board;
    this.level = Math.max(0, Math.min(MISSIONS.length - 1, level));
    if(this.panel!=='ranking')this.show('ranking'); this.ranking = undefined; this.message = ''; this.revision++;
    const ownLevel = this.level, ownBoard = this.board, ownVersion=this.rankingVersion;
    try {
      if (!this.ranked) this.acceptMetadata(await this.bridge?.refresh?.());
      if (request !== this.rankingRequest || this.level !== ownLevel || this.board !== ownBoard || this.panel !== 'ranking') return;
      if (!this.ranked || !this.bridge) { this.message = '全站排行榜暂不可用；个人最佳仍保存在本机'; this.revision++; return; }
      const ranking = await this.bridge.services.leaderboard({ boardId: ownBoard === 'level' ? 'level-' + MISSIONS[ownLevel].id : ownBoard, ...(ownBoard==='level'?{ruleVersion:ownVersion}:{}) });
      if (request === this.rankingRequest && this.level === ownLevel && this.board === ownBoard && this.rankingVersion===ownVersion && this.panel === 'ranking') { this.ranking = ranking; this.revision++; }
    } catch { if (request === this.rankingRequest && this.panel === 'ranking') { this.message = '排行榜读取失败，点击刷新重试'; this.revision++; } }
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
