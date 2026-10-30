import {
  _decorator,
  Component,
  input,
  Input,
  EventMouse,
  EventTouch,
  EventKeyboard,
  game,
  Game,
  view,
  sys,
  macro,
  director,
} from 'cc';
import { Simulation, type PauseReason } from './core/Simulation';
import { ACTIONS, TUTORIAL } from './core/Actions';
import { World } from './World';
import { HUD } from './HUD';
import { Platform, RADIO } from './Platform';
import { Online, playerId } from './Online';
import { Quartermaster } from './Quartermaster';
import { MODS, type ModId } from './core/Armory.ts';
import { DuelPresentation } from './Presentation';
import { shareScreenControl } from './ShareScreen';
import { observeNightInputs } from './core/Replay';
import { MAP, ALL_WEAPONS, type Point } from './core/Data';
import { MISSIONS, nextMission, readMissionSearch, type MissionId } from './core/MissionCatalog';
import { completeMission, missionUnlocked } from './core/MissionProgress';
import { bestTrainingRecord } from './core/TrainingRecords';
import { recordMissionTime } from './core/BattleRecords';
import { type SupplyReward } from './core/Rewards';
const { ccclass } = _decorator;
type TouchRole = { role: string; x: number; y: number; originX?: number; originY?: number; button?: string; moved?: boolean };
@ccclass('Overwatch')
export class Overwatch extends Component {
  sim = new Simulation();
  world!: World;
  hud!: HUD;
  platform!: Platform;
  online?: Online;
  armory?:Quartermaster;
  private runOwner='';
  private confirmed?:'solo'|'duel';
  private starting?: Simulation;
  private servicesReady?: Promise<void>;
  touches = new Map<number, TouchRole>();
  keys = new Set<number>();
  mouseButton = '';
  accumulator = 0;
  lastEvent = 0;
  frameCount = 0;
  frameSeconds = 0;
  measuredFps = 0;
  resizeKey = '';
  lastAimInput = 0;
  selectedMission: MissionId = 'corridor-01';
  private radioMission?: Simulation;
  private radioTarget?: number;
  private radioAt = -Infinity;
  operationPractice = false;
  private settledMission?:Simulation;
  private disposed = false;
  private startupSignalled = false;
  private pauseControl?: HTMLButtonElement;
  private screenControl?: ReturnType<typeof shareScreenControl>;
  private presentation = new DuelPresentation();
  private presentedTime = 0;
  private completionSpoken = false;
  start() {
    view.enableAutoFullScreen(false);
    view.resizeWithBrowserSize(true);
    view.setOrientation(macro.ORIENTATION_LANDSCAPE);
    this.world = new World(this.node);
    this.hud = new HUD(this.node);
    this.world.camera.visibility = 1 << 30;
    this.platform = new Platform(this.node, this.pause, this.clear);
    this.prepareMission(sys.isBrowser ? location.search : '');
    this.online = new Online(sys.localStorage, (state, start) => {
      const previous = this.sim, pauses = new Set(previous.pauses);
      this.sim = Simulation.restore(state.simulation);
      this.sim.pauses = pauses;
      if (state.finished) {
        for (const reason of ['settings', 'help', 'manual', 'countdown'] as const) this.sim.pauses.delete(reason);
        this.hud.exitConfirm = this.hud.reportOpen = this.hud.toolsOpen = this.hud.zoomOpen = false;
      }
      if (!start) this.sim.aim = { ...previous.aim };
      this.online!.bind(this.sim, () => this.sim.paused || !!this.hud.modal);
      if (start) {
        this.presentation = new DuelPresentation(); this.completionSpoken = false;
        this.clear(); this.lastEvent = 0; this.accumulator = 0;
        this.hud.reportOpen = false; this.hud.timeComparison = undefined;
        this.hud.missionsOpen = false; this.hud.tutorial = false;
        this.syncWorld(); this.world.follow = false; this.world.center = { x: 0, z: 0 }; this.world.updateCamera();
      }
      this.presentation.push(this.sim, performance.now());
      this.hud.modalKey = state.finished ? 'rebuild' : this.hud.modalKey;
    });
    this.hud.online = this.online;
    this.armory=new Quartermaster(sys.localStorage,v=>{this.hud.armory=v;},()=>this.platform.offerGold(),()=>{void this.online?.refreshAccount().then(()=>this.syncArmory());});
    this.syncArmory();
    this.servicesReady = this.connectServices();
    this.syncWorld();
    this.hud.tutorial = this.platform.readCoach();
    this.hud.muted = this.platform.muted;
    this.hud.reducedEffects = this.platform.reducedEffects;
    if (sys.isBrowser) {
      this.screenControl = shareScreenControl(location.search, active => { this.hud.screenActive = active; });
      this.hud.screenControl = !!this.screenControl;
      this.hud.resize();
      const button = document.createElement('button');
      button.setAttribute('aria-label', '设置');
      button.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);';
      button.addEventListener('click', () => this.action('settings'));
      document.body.appendChild(button);
      this.pauseControl = button;
    }
    input.on(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
    input.on(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
    input.on(Input.EventType.MOUSE_UP, this.mouseUp, this);
    input.on(Input.EventType.MOUSE_WHEEL, this.wheel, this);
    input.on(Input.EventType.TOUCH_START, this.touchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
    input.on(Input.EventType.KEY_DOWN, this.keyDown, this);
    input.on(Input.EventType.KEY_UP, this.keyUp, this);
    game.on(Game.EVENT_HIDE, this.hide, this);
    game.on(Game.EVENT_SHOW, this.show, this);
    if (sys.isBrowser) window.addEventListener('pagehide', this.persistRanking);
    if (sys.isBrowser && (location.hostname === 'localhost' || location.hostname === '127.0.0.1'))
      (globalThis as any).__night = {
        snapshot: () => this.snapshot(),
        // Read-only observability. Tests send real keyboard/mouse/touch inputs.
        screenPoint: (p: Point) => {
          const q = this.world.project(p);
          return { x: q.x / view.getScaleX(), y: this.hud.h - q.y / view.getScaleY() };
        },
        flightTime: (p: Point, weapon: number) => this.sim.flightTime(weapon, p),
      };
  }
  pause = (reason: PauseReason, on: boolean) => {
    if (on) this.clear();
    this.sim.pause(reason, on);
    this.accumulator = 0;
    if (on) this.platform?.stop(this.sim.extractionRemaining !== undefined && this.sim.extractionRadioPending);
  };
  prepareMission(search: string) {
    this.hud.missionProgress = this.platform.readOperationProgress();
    this.hud.developer = this.platform.developer;
    this.operationPractice = this.hud.developer;
    this.selectedMission = this.platform.readMission();
    if (!this.hud.developer && !missionUnlocked(this.hud.missionProgress, this.selectedMission)) this.selectedMission = 'corridor-01';
    let launch = readMissionSearch(search);
    if (launch && launch !== 'training-60' && !this.hud.developer && !missionUnlocked(this.hud.missionProgress, launch)) launch = undefined;
    if (launch && launch !== 'training-60') this.selectedMission = launch;
    this.sim = new Simulation(launch || this.selectedMission);
    this.hud.trainingBest = this.platform.readWarmupRecord();
  }
  clear = () => {
    if (this.hud) this.hud.mousePointer = undefined;
    this.sim.clearInput();
    this.touches.clear();
    this.keys.clear();
    this.mouseButton = '';
    if (this.world) {
      this.world.temporary = false;
      this.world.updateCamera();
    }
  };
  private persistRanking = () => this.online?.recorder?.persist?.();
  hide() {
    this.pause('background', true);
    this.online?.recorder?.persist?.();
  }
  show() {
    this.platform?.restoreFocus();
    this.pause('background', false);
    void this.online?.recorder?.recover?.();
    void this.armory?.refresh();
  }
  retry() {this.selectMission(this.sim.mission.id);this.armoryAction('solo');}
  selectMission(id: MissionId, persist = false) {
    if (this.sim.phase === 'playing') return;
    this.online?.recorder?.invalidate();
    this.hud.developer = this.platform.developer;
    if (id !== 'training-60' && !this.hud.developer && !missionUnlocked(this.hud.missionProgress || this.platform.missions, id)) {
      this.hud.toast = this.hud.t('完成上一任务后解锁', 'COMPLETE THE PREVIOUS OPERATION TO UNLOCK');
      this.hud.toastUntil = Date.now() + 3000;
      return;
    }
    this.operationPractice = this.hud.developer;
    const pauses = new Set(this.sim.pauses);
    this.clear();
    const kit=this.armory?.view.kits.solo;
    this.sim = new Simulation(id,id==='training-60'?kit?.filter(x=>x.id!=='coolant'):kit);
    this.hud.rewardCoins=undefined;
    if (this.sim.mission.mode === 'escort') {
      this.selectedMission = this.sim.mission.id;
      if (persist) this.platform.saveMission(this.selectedMission);
    }
    this.syncMissionAddress();
    for (const reason of pauses)
      if (['background', 'orientation', 'focus'].includes(reason)) this.sim.pauses.add(reason);
    this.hud.trainingBest = this.platform.readWarmupRecord();
    this.syncWorld();
    this.lastEvent = this.accumulator = 0;
    this.hud.modalKey = 'rebuild';
    this.hud.supplyOpen = this.hud.reportOpen = false;
    this.hud.timeComparison = undefined;
    this.hud.exitConfirm = this.hud.toolsOpen = this.hud.zoomOpen = false;
  }
  syncWorld() {
    if (this.world.map !== this.sim.mission.map || this.world.light !== this.sim.mission.light) {
      this.world.root.active = false;
      this.world.root.destroy();
      this.world = new World(this.node, this.sim.mission.map, this.sim.mission.light);
      this.world.camera.visibility = 1 << 30;
    }
    this.world.reset();
    this.syncRewards();
  }
  private syncArmory() {
    if (!this.online || !this.armory) return;
    const host=globalThis as any;
    const cloud=host.__COMPETITION_CONFIG__?.competitionEnabled ?? (host.SmallGamesPublishingConfig?.backendEnabled ?? !!host.SmallGamesServices);
    if(this.armory.bind(cloud?(this.online.accountId||''):playerId(this.online.identity||{}),cloud,this.online.walletPort,this.platform.goldAdsAvailable)){
      this.confirmed=undefined;
      this.hud.rewardCoins=undefined;
      if(this.hud.missionsOpen){this.hud.missionsOpen=false;this.armory.set({page:'loadout',mode:'solo'});}
    }
  }
  private armoryAction(id:string) {
    const a=this.armory;if(!a || this.sim.phase!=='briefing' || this.online?.panel)return;
    this.syncArmory();
    const v=a.view;
    if(a.owner.startsWith('account:')&&!v.available&&!this.online?.walletPort)
      void this.online?.refreshAccount().then(()=>this.syncArmory());
    if(this.starting===this.sim && ['base','solo','duel','shop','daily','ads'].includes(id))this.selectMission(this.sim.mission.id);
    if(id==='base'){this.confirmed=undefined;this.hud.missionsOpen=false;a.set({page:'base',message:''});void a.refresh();return;}
    if(id==='solo'||id==='duel'){this.confirmed=undefined;this.hud.missionsOpen=false;a.set({page:'loadout',mode:id,selected:'power',message:''});void a.refresh();return;}
    if(id==='shop'||id==='daily'||id==='ads'){a.set({page:id==='shop'?'shop':'daily',message:''});void a.refresh();return;}
    if(id.startsWith('select:')&&Object.hasOwn(MODS,id.slice(7))){a.set({selected:id.slice(7) as ModId,message:''});return;}
    if(id.startsWith('slot:')){const slot=v.kits[v.mode][Number(id.slice(5))];if(slot)a.set({selected:slot.id,message:''});return;}
    if(id==='toggle'&&v.page==='loadout'){a.toggle();return;}
    if(id==='buy'&&v.page==='shop'||(id==='checkin'||id==='watch')&&v.page==='daily'){void a.transact(id as 'buy'|'watch'|'checkin');return;}
    if(id!=='next'||v.page!=='loadout'||v.busy)return;
    this.confirmed=v.mode;
    if(v.mode==='duel'&&this.online){
      this.online.duelKit=v.kits.duel;
      if(this.online.inviteCode){const code=this.online.inviteCode;this.online.inviteCode='';this.online.show('join');void this.online.open('join',code);}
      else{this.online.show('menu');void this.online.loadRooms();}
    }else{
      this.selectMission(this.sim.mission.id);
      this.hud.missionPage=Math.floor(Math.max(0,MISSIONS.findIndex(m=>m.id===this.selectedMission))/3);
      this.hud.missionsOpen=true;
    }
  }
  async connectServices() {
    const globals = globalThis as any, deadline = Date.now() + 8000;
    while (!globals.SmallGamesServices && globals.__COMPETITION_CONFIG__?.competitionEnabled && !this.disposed && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 50));
    if (this.disposed) return;
    await this.online?.connect(globals.SmallGamesServices, sys.isBrowser ? location.search : '');
    if (!this.disposed) {
      this.syncArmory();
      if(this.online?.inviteCode&&!this.online.panel && this.sim.phase==='briefing')this.armoryAction('duel');
      this.hud.modalKey = 'rebuild';
    }
  }
  beginCampaign() {
    if (this.starting === this.sim) return;
    this.online?.leave();
    const sim = this.sim, online = this.online;
    this.runOwner=this.armory?.owner||'';
    const begin = () => { if (this.sim !== sim || this.disposed) return; sim.start(); this.completionSpoken = false;
      const recorder = online?.recorder;
      if (online?.rankStatus === 'recording') this.hud.toastUntil = 0;
      if (sim.mission.mode === 'escort' && online?.rankStatus === 'pending-sync') {
        this.hud.toast = this.hud.t('进度暂存本机，联网后自动同步', 'PROGRESS SAVED · SYNC WHEN ONLINE'); this.hud.toastUntil = Date.now() + 5000;
      } else if (sim.mission.mode === 'escort' && online?.rankStatus !== 'recording') {
        this.hud.toast = this.hud.t('本局成绩仅保存在本机，不计入全站榜', 'LOCAL RESULT · NOT RANKED'); this.hud.toastUntil = Date.now() + 5000;
      }
      if (recorder) observeNightInputs(sim, (input, ticks) => recorder.record(input, ticks));
      if (recorder && sim.homingAmmo > 0) recorder.record({ command: 'grantHomingAmmo', args: [sim.homingAmmo] }, 0);
      if (recorder) for (const reason of sim.pauses) recorder.record({ command: 'pause', args: [reason, true] }, 0);
    };
    if (!online || sim.mission.mode !== 'escort') { begin(); return; }
    this.starting = sim;
    this.hud.toast = this.hud.t('正在准备计时…', 'PREPARING TIMER…'); this.hud.toastUntil = Date.now() + 16000;
    const start = async () => {
      await this.servicesReady;
      if (this.sim !== sim || this.disposed) return;
      await online.startRanking({ mode: 'level-' + sim.mission.id, levelId: sim.mission.id,
        practice: this.operationPractice || this.platform.developer, loadout:sim.loadout });
    };
    void start().then(begin, begin).finally(() => { if (this.starting === sim) this.starting = undefined; });
  }
  syncRewards() {
    if (this.sim.duelMode) { this.hud.rewardsAvailable = false; this.hud.pendingSupply = false; this.sim.homingAmmo = 0; return; }
    this.hud.rewardsAvailable = false;
    const additionalAmmo = this.platform.rewards.ammo - this.sim.homingAmmo;
    if (additionalAmmo > 0) this.sim.grantHomingAmmo(additionalAmmo);
    this.world.zoomLimit = this.platform.rewards.zoomLimit;
    this.hud.zoomLimit = this.platform.rewards.zoomLimit;
    this.hud.pendingSupply = this.platform.rewards.pendingSupply;
    this.world.updateCamera();
  }
  openSupply() {
    if (!this.platform.rewards.pendingSupply) return;
    if (this.sim.phase !== 'playing' || this.sim.resumeCountdown > 0) return;
    this.hud.reportOpen = this.hud.toolsOpen = this.hud.zoomOpen = false;
    this.pause('supply', true);
    this.pause('settings', false);
    this.hud.supplyOpen = true;
    this.hud.supplyMessage = '';
    this.hud.pendingSupply = this.platform.rewards.pendingSupply;
    this.hud.modalKey = 'rebuild';
  }
  closeSupply() {
    this.hud.supplyOpen = false;
    this.clear();
    this.hud.toast = '';
    this.hud.toastUntil = 0;
    this.pause('countdown', false);
    this.pause('supply', false);
    this.pause('manual', false);
    this.accumulator = 0;
  }
  claimSupply(reward: SupplyReward) {
    if (this.sim.phase !== 'playing' || !this.hud.supplyOpen || this.sim.buff ||
        !['tracking', 'ammo', 'rate', 'restock'].includes(reward) || !this.platform.claimSupply(reward)) return;
    if (reward === 'restock') this.sim.grantAmmoSupply();
    else if (reward !== 'ammo') this.sim.grantBuff(reward);
    this.syncRewards();
    if (reward === 'ammo') this.sim.selectHoming();
    this.hud.toast = this.hud.t(reward === 'ammo' ? '追踪弹 +2 · 点选敌人，再按开火' : reward === 'tracking' ? '自动追踪已启用 · 持续60秒' : '射速提升30% · 持续60秒',
      reward === 'ammo' ? '+2 HOMING · TAP ENEMY, THEN FIRE' : reward === 'tracking' ? 'AUTO TRACKING · 60 SECONDS' : '+30% FIRE RATE · 60 SECONDS');
    this.hud.toastUntil = Date.now() + 7500;
    if (reward === 'restock') this.hud.toast = this.hud.t('弹药已补充：榴弹 +60 · 重炮 +24 · 燃烧 +6', 'RESTOCKED: HE +60 · HEAVY +24 · FIRE +6');
    this.hud.supplyOpen = false;
    this.pause('supply', false);
    this.resumeBattle(false);
  }
  resumeBattle(_countdown = false) {
    this.clear();
    this.accumulator = 0;
    this.pause('countdown', false);
    this.pause('manual', false);
  }
  syncMissionAddress() {
    if (!sys.isBrowser) return;
    try {
      const url = new URL(location.href);
      if (!url.searchParams.has('mission')) return;
      const dev = url.searchParams.get('dev');
      url.search = new URLSearchParams({ mission: this.sim.mission.id }).toString();
      if (dev !== null) url.searchParams.set('dev', dev);
      url.hash = url.username = url.password = '';
      history.replaceState(null, '', url.href);
    } catch { /* A public shortcut stays optional when browser history is unavailable. */ }
  }
  saveMissionResult() {
    if (this.sim.duelMode || this.settledMission===this.sim || this.sim.mission.mode==='training') return;
    const sim = this.sim, online = this.online, owner=this.runOwner;
    this.settledMission=sim;
    if(!this.operationPractice && !this.platform.developer && sim.phase==='success' && sim.threatsRemaining===0)
      this.hud.rewardCoins=this.armory?.localClear(owner,sim.mission.id);
    void online?.recorder?.finish().then(result => {
      if(this.disposed || this.sim!==sim || owner!==(this.armory?.owner||''))return;
      if(result?.accepted && typeof result.coins==='number'){
        this.hud.rewardCoins=result.coins;this.hud.modalKey='rebuild';void this.armory?.refresh();
      }
      if (this.sim === sim && result?.accepted && result.fastestEligible === false) {
        online.rankStatus = 'assisted'; online.revision++;
      }
    }).catch(()=>{});
    this.hud.timeComparison = recordMissionTime(this.platform.times, this.sim, this.operationPractice || this.platform.developer);
    if (this.hud.timeComparison) this.platform.saveTimes();
    const previous = this.platform.missions;
    const next = completeMission(previous, this.sim.mission.id,
      this.sim.mission.mode === 'escort' && this.sim.phase === 'success' && this.sim.threatsRemaining === 0,
      this.operationPractice || this.platform.developer);
    if (next !== previous) this.platform.saveOperationProgress(next);
    this.hud.missionProgress = next;
  }
  saveTrainingResult() {
    if (this.sim.mission.mode !== 'training') return;
    const previous = this.platform.readWarmupRecord();
    const best = bestTrainingRecord(previous, this.sim);
    this.hud.trainingBest = best;
    if (best && best !== previous) this.platform.saveWarmupRecord(best);
  }
  action(id: string) {
    if (id === 'resultClose') id = 'home';
    const online = this.online;
    this.platform.activate();
    if (id.startsWith('armory:')) {this.armoryAction(id.slice(7));return;}
    if (id === 'screen') {
      void this.screenControl?.toggle().catch(() => {
        this.hud.toast = this.hud.t('浏览器暂不支持此操作', 'SCREEN MODE UNAVAILABLE'); this.hud.toastUntil = Date.now() + 3000;
      });
      return;
    }
    if (online && id.startsWith('online:')) {
      const action = id.slice(7);
      if (action === 'dismiss') { this.action(online.room || online.active ? 'online:backLobby' : 'online:back'); return; }
      this.clear(); this.hud.modalKey = 'rebuild';
      if (action === 'menu') {if(this.confirmed!=='duel'){this.armoryAction('duel');return;}online.show('menu'); void online.loadRooms(); }
      if (action === 'profile') { this.pause('settings', false); online.show('profile'); }
      if (action === 'saveName') void online.saveName();
      if (action === 'friend') { online.draftPassword = ''; online.show('create'); }
      if (action === 'join') { online.draftPassword = ''; online.show('join'); }
      if (action === 'public' || action === 'private') { online.privateRoom = action === 'private'; online.revision++; }
      if (action === 'createConfirm') void online.open('friend');
      if (action === 'joinConfirm') void online.open('join');
      if (action.startsWith('joinCode:')) void online.open('join', action.slice(9));
      if (action.startsWith('watchCode:')) void online.open('watch', action.slice(10));
      if (action === 'resumeRoom') void online.open('resume', online.resumeCode);
      if (action === 'roomsRefresh') void online.loadRooms();
      if (action === 'roomPrev' || action === 'roomNext') {
        online.roomPage = Math.max(0, Math.min(Math.ceil(online.rooms.length / online.pageSize) - 1, online.roomPage + (action === 'roomNext' ? 1 : -1))); online.revision++;
      }
      if (action === 'history') void online.loadHistory();
      if (action === 'historyPrev') { online.historyPage = Math.max(0, online.historyPage - 1); online.revision++; }
      if (action === 'historyNext' && online.history) {
        if ((online.historyPage + 1) * online.pageSize < online.history.matches.length) online.historyPage++;
        else if (online.history.nextCursor) {
          void online.loadHistory(online.history.nextCursor).then(() => {
            online.historyPage = Math.min(online.historyPage + 1, Math.max(0, Math.ceil((online.history?.matches.length || 0) / online.pageSize) - 1)); online.revision++;
          });
        }
        online.revision++;
      }
      if (action === 'ranking') void online.loadRanking(Math.max(0, MISSIONS.findIndex(m => m.id === this.selectedMission)));
      if (action === 'category:solo' && !['clears', 'level'].includes(online.board)) void online.loadRanking(online.level, 'clears');
      if (action === 'category:duel' && !['points', 'win-rate'].includes(online.board)) void online.loadRanking(online.level, 'points');
      if (action.startsWith('board:') && ['clears', 'level', 'points', 'win-rate'].includes(action.slice(6))) void online.loadRanking(online.level, action.slice(6) as typeof online.board);
      if (action === 'previous') void online.loadRanking(online.level - 1);
      if (action === 'next') void online.loadRanking(online.level + 1);
      if (action === 'refresh') void online.loadRanking();
      if (action === 'match' || action === 'bot') void online.open(action);
      if (action === 'ready') void online.ready();
      if (action === 'share' && sys.isBrowser) void online.share(location.href);
      if (action === 'back' || action === 'backLobby') {
        this.platform.stopRadio();
        online.leave(); this.sim.phase = 'briefing'; this.selectMission(this.selectedMission); this.hud.missionsOpen = false;
        if (sys.isBrowser) { const url = new URL(location.href); url.searchParams.delete('room'); history.replaceState(null, '', url.href); }
        this.armoryAction(action==='backLobby'?'duel':'base');
      }
      return;
    }
    if (online?.panel && !this.sim.pauses.has('settings') && !this.sim.pauses.has('help') && ['close', 'home', 'resume'].includes(id)) { this.action('online:back'); return; }
    if (this.sim.duelMode && ['supply', 'homingReward', 'homing', 'zoomUpgrade', 'convoy', 'mission', 'retry', 'missionNext'].includes(id)) return;
    if (this.sim.duelMode && (id === 'exitConfirm' || id === 'home' && this.sim.phase !== 'playing')) { this.hud.exitConfirm = false; this.action('online:backLobby'); return; }
    if (id === 'battleReport' && this.sim.phase === 'playing') {
      this.clear(); this.hud.reportOpen = !this.hud.reportOpen; this.hud.modalKey = 'rebuild'; return;
    }
    if (this.hud.reportOpen && ['close', 'resume', 'pause'].includes(id)) {
      this.hud.reportOpen = false; this.hud.modalKey = 'rebuild'; return;
    }
    if (id === 'lensIn') id = 'zoomIn';
    if (id === 'lensOut') id = 'zoomOut';
    this.platform.activate();
    if (this.hud.exitConfirm) {
      if (id === 'exitConfirm') {
        this.hud.exitConfirm = false;
        this.clear();
        this.sim.phase = 'briefing';
        this.selectMission(this.selectedMission);
        this.hud.missionsOpen = false;
        this.armoryAction('base');
      } else if (['exitCancel', 'close', 'resume', 'pause', 'settings'].includes(id)) {
        this.hud.exitConfirm = false;
        this.action('resume');
      }
      return;
    }
    if (this.sim.resumeCountdown > 0) {
      if (id === 'pause') this.pause('manual', true);
      return;
    }
    if (id === 'supply' || id === 'homingReward') { this.openSupply(); return; }
    if (this.hud.supplyOpen) {
      if (id === 'supplyWatch') {
        if (this.platform.rewards.pendingSupply) this.claimSupply(this.hud.supplySelection);

      } else if (id.startsWith('reward:') && ['tracking', 'ammo', 'rate', 'restock'].includes(id.slice(7))) {
        this.hud.supplySelection = id.slice(7) as SupplyReward;
        this.hud.modalKey = 'rebuild';
      }
      else if (['supplyLater', 'close', 'resume', 'pause'].includes(id)) this.closeSupply();
      return;
    }
    if (id === 'zoomUpgrade') return;
    if (id === 'zoomControls') {
      this.pause('settings', true);
      this.hud.zoomOpen = !this.hud.zoomOpen;
      this.hud.toolsOpen = false;
      return;
    }
    if (id === 'home') {
      if (this.sim.phase === 'playing') {
        this.hud.exitConfirm = true;
        this.hud.toolsOpen = this.hud.zoomOpen = false;
        this.pause('settings', true);
        return;
      }
      this.clear();
      this.sim.phase = 'briefing';
      this.selectMission(this.selectedMission);
      this.hud.missionsOpen = false;this.armoryAction('base');
      return;
    }
    if (id === 'missions' || id === 'homeMenu') {
      this.online?.leave();
      this.clear();
      this.hud.missionsOpen = false;
      this.armoryAction(id==='missions' || this.confirmed==='solo'?'solo':'base');
      this.hud.modalKey = 'rebuild';
      return;
    }
    if (id === 'missionsPrevious' || id === 'missionsNext') {
      if (!this.hud.missionsOpen || this.sim.phase !== 'briefing') return;
      this.clear();
      this.hud.missionPage = Math.max(0, Math.min(Math.ceil(MISSIONS.length / 3) - 1,
        this.hud.missionPage + (id === 'missionsNext' ? 1 : -1)));
      this.hud.modalKey = 'rebuild';
      return;
    }
    if (id.startsWith('mission:')) {
      const mission = MISSIONS.find(m => m.id === id.slice(8));
      if (mission && this.hud.missionsOpen && this.confirmed==='solo') this.selectMission(mission.id, true);
      return;
    }
    if (id === 'training' || id === 'missionReturn') {
      if(id==='training' && (!this.hud.missionsOpen || this.confirmed!=='solo'))return;
      this.selectMission(id === 'training' ? 'training-60' : this.selectedMission);
      if(id==='missionReturn' && this.sim.phase==='briefing')this.armoryAction('solo');
      return;
    }
    if (id === 'missionNext') {
      if (this.sim.phase !== 'success')return;
      const id = nextMission(this.sim.mission.mode === 'training' ? this.selectedMission : this.sim.mission.id);
      this.selectMission(id, true);
      this.armoryAction('solo');
      return;
    }
    if (id === 'tools' || id === 'flightControls') {
      this.pause('settings', true);
      this.hud.zoomOpen = false;
      this.hud.toolsOpen = !this.hud.toolsOpen;
      return;
    }
    const flightActions = ['rotateLeft', 'rotateRight', 'orbitLeft', 'orbitRight',
      'altitudeUp', 'altitudeDown', 'radiusIn', 'radiusOut'];
    if (id === 'close' || id === 'resume') {
      if (this.sim.pauses.has('help')) this.pause('help', false);
      else if (this.sim.pauses.has('mission')) this.pause('mission', false);
      else if (id === 'close' && (this.hud.toolsOpen || this.hud.zoomOpen)) {
        this.hud.toolsOpen = this.hud.zoomOpen = false;
        this.hud.modalKey = 'rebuild';
      } else {
        this.hud.toolsOpen = this.hud.zoomOpen = false;
        this.pause('settings', false);
        if (this.sim.resumeRequired) this.resumeBattle();
        else this.pause('manual', false);
      }
      return;
    }
    if (id === 'settings') {
      if (this.sim.pauses.has('settings') || this.sim.pauses.has('manual')) { this.action('resume'); return; }
      this.hud.toolsOpen = this.hud.zoomOpen = false;
      const wasHelp = this.sim.pauses.has('help');
      if (wasHelp) this.pause('help', false);
      this.pause('settings', wasHelp || !this.sim.pauses.has('settings'));
      return;
    }
    if (id === 'help') {
      this.hud.helpTouch = this.hud.touch;
      this.pause('help', !this.sim.pauses.has('help'));
      return;
    }
    if (id === 'pause') { this.action('settings'); return; }
    if (id === 'mission') {
      this.pause('mission', !this.sim.pauses.has('mission'));
      return;
    }
    if (id === 'language') {
      this.hud.lang = this.hud.lang === 'zh' ? 'en' : 'zh';
      this.hud.resize();
      return;
    }
    if (id === 'input') {
      this.hud.helpTouch = !this.hud.helpTouch;
      return;
    }
    if (id.startsWith('tab:')) {
      this.hud.helpGroup = id.slice(4) as HUD['helpGroup'];
      return;
    }
    if (id === 'tutorial') {
      this.hud.tutorial = true;
      this.sim.completed.clear();
      this.pause('help', false);
      return;
    }
    if (id === 'sound') {
      this.platform.muted = !this.platform.muted;
      this.hud.muted = this.platform.muted;
      this.platform.savePreferences();
      this.hud.modalKey = 'rebuild';
      if (this.platform.muted) this.platform.stop();
      return;
    }
    if (id === 'effects') {
      this.platform.reducedEffects = !this.platform.reducedEffects;
      this.hud.reducedEffects = this.platform.reducedEffects;
      this.platform.savePreferences();
      this.hud.modalKey = 'rebuild';
      return;
    }
    if (id === 'retry') {
      if(this.sim.phase==='success'||this.sim.phase==='failure')this.retry();
      return;
    }
    if (id === 'start') {
      if(this.starting===this.sim||this.sim.phase!=='briefing'||!this.hud.missionsOpen||this.confirmed!=='solo')return;
      this.selectMission(this.sim.mission.id);
      this.world.reset();
      this.beginCampaign();
      return;
    }
    const menuAction = [...flightActions, 'sensor', 'convoy', 'locate', 'zoomIn', 'zoomOut'].includes(id);
    const menuPaused = this.sim.paused && Array.from(this.sim.pauses).every(reason => ['settings', 'manual'].includes(reason));
    if (this.online?.entering || this.online?.spectator || this.sim.phase !== 'playing' || this.sim.paused && !(menuPaused && menuAction)) return;
    if (menuPaused) { this.pause('settings', true); this.hud.modalKey = 'rebuild'; }
    if (id === 'priority') {
      const threat = this.sim.priorityThreat;
      if (threat) this.locateMap(threat.unit);
      return;
    }
    if (flightActions.includes(id)) {
      this.sim.clearInput();
      if (id === 'rotateLeft' || id === 'rotateRight')
        this.world.rotate(id === 'rotateLeft' ? -12 : 12);
      if (id === 'orbitLeft' || id === 'orbitRight')
        this.sim.setOrbitDirection(id === 'orbitLeft' ? -1 : 1);
      if (id === 'altitudeUp' || id === 'altitudeDown')
        this.sim.adjustAltitude(id === 'altitudeUp' ? 20 : -20);
      if (id === 'radiusIn' || id === 'radiusOut')
        this.sim.adjustRadius(id === 'radiusOut' ? 20 : -20);
      return;
    }
    if(id==='coolant' && !this.sim.duelMode && !this.operationPractice && this.sim.mission.mode==='escort' &&
      (!this.runOwner.startsWith('account:') || ['recording','pending-sync'].includes(this.online?.rankStatus||''))){this.armory?.useCoolant(this.runOwner,()=>this.sim.useCoolant());return;}
    if (id.startsWith('weapon')) this.sim.choose(Number(id.slice(-1)));
    if (id === 'homing') {
      if (this.sim.homingAmmo <= 0) { this.openSupply(); return; }
      this.clear();
      this.sim.selectHoming();
    }
    if (id === 'previous') this.sim.choose((this.sim.selected + this.sim.guns.length - 1) % this.sim.guns.length);
    if (id === 'next') this.sim.choose((this.sim.selected + 1) % this.sim.guns.length);
    if (id === 'sensor') {
      this.world.sensor();
      this.sim.completed.add('sensor');
    }
    if (id === 'convoy') this.sim.command();
    if (id === 'locate') {
      this.world.locate(this.sim.rescue);
      this.sim.setAim({ x: this.sim.rescue.x + 8, z: this.sim.rescue.z - 6 });
      this.sim.completed.add('locate');
    }
    if (id === 'zoomIn' || id === 'zoomOut') {
      this.world.adjustZoom(id === 'zoomIn' ? 1.5 : 1 / 1.5);
      this.sim.completed.add('zoom');
    }
  }
  mousePosition(e: EventMouse) {
    const p = e.getUILocation();
    return { x: p.x, y: this.hud.h - p.y };
  }
  lockAt(x: number, y: number) {
    const target = this.sim.units.filter(u => u.hp > 0).map(u => {
      const p = this.world.project(u);
      return { id: u.id, distance: Math.hypot(p.x / view.getScaleX() - x, this.hud.h - p.y / view.getScaleY() - y) };
    }).filter(u => u.distance <= 28).sort((a, b) => a.distance - b.distance)[0];
    if (target) this.sim.lockHoming(target.id);
    else {
      const aim = this.world.aimAt(x * view.getScaleX(), (this.hud.h - y) * view.getScaleY());
      if (aim) this.sim.setAim(aim);
    }
  }
  locateMap(p: Point) {
    if (this.sim.paused || this.sim.phase !== 'playing') return;
    this.clear();
    this.world.center = { ...p };
    this.world.follow = false;
    this.world.updateCamera();
    this.sim.setAim(p);
  }
  mouseMove(e: EventMouse) {
    if (this.platform.touchInput) return;
    this.hud.touch = false;
    const p = this.mousePosition(e);
    this.hud.mousePointer = p;
    if (this.mouseButton && this.hud.hit(p.x, p.y)?.id !== this.mouseButton) {
      this.sim.setFire('mouse', false);
      this.mouseButton = '';
    }
    if (this.hud.blocksBattlefield(p.x, p.y) && this.mouseButton !== 'fire')
      this.sim.setFire('mouse', false);
    if (!this.sim.homingSelected && !this.hud.modal && !this.hud.blocksBattlefield(p.x, p.y)) {
      const q = e.getLocation();
      const aim = this.world.aimAt(q.x, q.y);
      if (aim) this.sim.setAim(aim);
      else this.sim.setFire('mouse', false);
      this.lastAimInput = Date.now();
    }
  }
  mouseDown(e: EventMouse) {
    if (this.platform.touchInput) return;
    this.hud.touch = false;
    this.platform.activate();
    const p = this.mousePosition(e),
      b = this.hud.hit(p.x, p.y);
    this.hud.mousePointer = p;
    if (b) {
      if (e.getButton() !== 0) return;
      if (this.hud.modal && b.label.node.parent !== this.hud.modal && !this.hud.isGlobalAction(b.id)) return;
      this.mouseButton = b.id;
      if (b.id === 'fire' && e.getButton() === 0 && !this.online?.spectator && !this.online?.entering) this.sim.setFire('mouse', true);
      return;
    }
    const mapPoint = this.hud.minimapPoint(p.x, p.y);
    if (mapPoint && e.getButton() === 0) {
      this.locateMap(mapPoint);
      return;
    }
    if (this.hud.modal || this.online?.spectator || this.online?.entering || this.hud.blocksBattlefield(p.x, p.y)) return;
    if (e.getButton() === 2) {
      this.world.temporary = true;
      this.world.updateCamera();
      this.sim.completed.add('zoom');
      return;
    }
    if (e.getButton() === 0) {
      if (this.sim.homingSelected) { this.lockAt(p.x, p.y); return; }
      const q = e.getLocation();
      const aim = this.world.aimAt(q.x, q.y);
      if (!aim) return;
      this.sim.setAim(aim);
      this.sim.setFire('mouse', true);
    }
  }
  mouseUp(e: EventMouse) {
    if (this.platform.touchInput) return;
    if (e.getButton() === 2) {
      this.world.temporary = false;
      this.world.updateCamera();
    }
    if (e.getButton() !== 0) return;
    this.sim.setFire('mouse', false);
    const p = this.mousePosition(e),
      b = this.hud.hit(p.x, p.y);
    const id = this.mouseButton;
    this.mouseButton = '';
    if (id && id !== 'fire' && b?.id === id) this.action(id);
  }
  wheel(e: EventMouse) {
    if (this.hud.modal) {
      if (this.hud.scrollNode) this.hud.scrollBy(-e.getScrollY() * 0.2);
      return;
    }
    const p = this.mousePosition(e);
    if (this.sim.phase !== 'playing' || this.sim.paused || this.hud.blocksBattlefield(p.x, p.y)) return;
    const q = e.getLocation();
    this.world.adjustZoom(Math.exp(Math.max(-0.35, Math.min(0.35, e.getScrollY() * 0.0015))), q.x, q.y);
    this.sim.completed.add('zoom');
  }
  touchStart(e: EventTouch) {
    // Creator 3.8.8 leaves simulate=false on mouse-generated touches; browser pointer type is authoritative.
    if (e.simulate || (sys.isBrowser && !this.platform.touchInput)) return;
    this.platform.useTouchInput(true);
    this.hud.mousePointer = undefined;
    this.hud.touch = true;
    this.platform.activate();
    for (const t of e.getTouches()) {
      const p = t.getUILocation(),
        x = p.x,
        y = this.hud.h - p.y,
        b = this.hud.hit(x, y),
        id = t.getID();
      if (this.touches.has(id)) continue;
      const mapPoint = this.hud.minimapPoint(x, y);
      if (!b && mapPoint) {
        this.locateMap(mapPoint);
        this.touches.set(id, { role: 'map', x, y });
        continue;
      }
      if (b && (!this.hud.modal || b.label.node.parent === this.hud.modal || this.hud.isGlobalAction(b.id))) {
        if (b.id === 'fire' && Array.from(this.touches.values()).some((t) => t.role === 'pinch')) {
          this.touches.set(id, { role: 'cancelled', x, y });
          continue;
        }
        this.touches.set(id, { role: b.id === 'fire' ? 'fire' : 'button', x, y, button: b.id });
        if (b.id === 'fire' && !this.online?.spectator && !this.online?.entering) this.sim.setFire('touch:' + id, true);
      } else if (this.hud.modal) {
        const area = this.hud.scrollArea;
        if (this.hud.scrollNode && x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h)
          this.touches.set(id, { role: 'scroll', x, y });
      } else if (
        !this.hud.blocksBattlefield(x, y) && this.sim.phase === 'playing' && !this.sim.paused
      )
        this.touches.set(id, { role: 'aim', x, y, originX: x, originY: y });
    }
    const fingers = Array.from(this.touches.values()).filter((t) => t.role === 'aim' || t.role === 'pinch');
    if (fingers.length >= 2) {
      this.sim.clearInput();
      fingers.forEach((t, i) => { t.role = i < 2 ? 'pinch' : 'cancelled'; });
      for (const t of this.touches.values()) if (t.role === 'fire') t.role = 'cancelled';
    }
  }
  touchMove(e: EventTouch) {
    if (e.simulate || (sys.isBrowser && !this.platform.touchInput)) return;
    for (const t of e.getTouches()) {
      const role = this.touches.get(t.getID()), p = t.getUILocation();
      if (role?.role === 'button' && this.hud.hit(p.x,this.hud.h-p.y)?.id !== role.button) role.role='cancelled';
    }
    const fingers = Array.from(this.touches.values()).filter((t) => t.role === 'pinch');
    if (fingers.length === 2) {
      const before = Math.hypot(fingers[0].x - fingers[1].x, fingers[0].y - fingers[1].y);
      const previousX = (fingers[0].x + fingers[1].x) / 2 * view.getScaleX();
      const previousY = (this.hud.h - (fingers[0].y + fingers[1].y) / 2) * view.getScaleY();
      for (const t of e.getTouches()) {
        const role = this.touches.get(t.getID());
        if (role?.role !== 'pinch') continue;
        const p = t.getUILocation();
        role.x = p.x;
        role.y = this.hud.h - p.y;
      }
      const after = Math.hypot(fingers[0].x - fingers[1].x, fingers[0].y - fingers[1].y);
      if (before > 8 && after > 8 && !this.sim.paused) {
        this.world.adjustZoom(after / before,
          (fingers[0].x + fingers[1].x) / 2 * view.getScaleX(),
          (this.hud.h - (fingers[0].y + fingers[1].y) / 2) * view.getScaleY(), previousX, previousY);
        this.sim.completed.add('zoom');
      }
      return;
    }
    for (const t of e.getTouches()) {
      const role = this.touches.get(t.getID());
      if (!role) continue;
      const p = t.getUILocation(),
        x = p.x,
        y = this.hud.h - p.y;
      if (role.role === 'scroll') this.hud.scrollBy(role.y - y);
      if (role.role === 'fire' && this.hud.hit(x, y)?.id !== 'fire') {
        this.sim.setFire('touch:' + t.getID(), false);
        role.role = 'cancelled';
      }
      if (role.role === 'aim' && !this.sim.paused) {
        if (Math.hypot(x - (role.originX ?? role.x), y - (role.originY ?? role.y)) > 2) role.moved = true;
        // Move from the reticle's depth, preserving the finger offset and excluding visual recoil.
        const reticle = this.world.project(this.sim.aim, 0, true);
        const aim = this.world.aimAt(reticle.x + (x - role.x) * view.getScaleX(),
          reticle.y - (y - role.y) * view.getScaleY());
        if (aim) this.sim.setAim(aim);
      }
      role.x = x;
      role.y = y;
    }
  }
  touchEnd(e: EventTouch) {
    if (e.simulate || (sys.isBrowser && !this.platform.touchInput)) return;
    for (const t of e.getTouches()) {
      const id = t.getID(),
        role = this.touches.get(id);
      this.touches.delete(id);
      this.sim.setFire('touch:' + id, false);
      if (role?.role === 'pinch')
        for (const finger of this.touches.values()) if (finger.role === 'pinch') finger.role = 'cancelled';
      if (role?.role === 'button') {
        const p = t.getUILocation(),
          b = this.hud.hit(p.x, this.hud.h - p.y);
        if (b && b.id === role.button) this.action(b.id);
      }
      if (role?.role === 'aim' && !this.sim.paused) {
        const p = t.getUILocation(), x = p.x, y = this.hud.h - p.y;
        const tap = !role.moved && Math.hypot(x - (role.originX ?? role.x), y - (role.originY ?? role.y)) <= 2;
        if (tap && !this.hud.blocksBattlefield(x, y)) {
          if (this.sim.homingSelected) this.lockAt(x, y);
          else {
            const aim = this.world.aimAt(x * view.getScaleX(), (this.hud.h - y) * view.getScaleY());
            if (aim) this.sim.setAim(aim);
          }
        }
        else if (this.sim.homingSelected && this.sim.homingTarget) this.sim.lockHoming(this.sim.homingTarget.id);
      }
    }
  }
  touchCancel(e: EventTouch) {
    if (e.simulate || (sys.isBrowser && !this.platform.touchInput)) return;
    this.clear();
  }
  keyDown(e: EventKeyboard) {
    if (!this.platform.focused || this.keys.has(e.keyCode)) return;
    this.keys.add(e.keyCode);
    this.hud.touch = false;
    this.platform.activate();
    if (this.online?.panel || this.online?.entering) { if (e.keyCode === 27) this.action('online:back'); return; }
    if (e.keyCode === 27 && ['help', 'settings', 'mission', 'advert', 'supply'].some((reason) => this.sim.pauses.has(reason as PauseReason))) {
      this.action('close');
      return;
    }
    if (e.keyCode === 13 && this.sim.phase !== 'playing') {
      const page=this.armory?.view.page;
      if(this.sim.paused || this.hud.exitConfirm)return;
      this.action(this.sim.phase!=='briefing'?'retry':this.hud.missionsOpen?'start':page==='cover'?'armory:base':page==='base'?'armory:solo':page==='loadout'?'armory:next':'armory:base');
      return;
    }
    if(this.sim.phase==='briefing' && e.keyCode===27){this.action(this.hud.missionsOpen?'missions':'armory:base');return;}
    if(this.sim.phase==='briefing' && !this.hud.missionsOpen)return;
    if(e.keyCode===53&&this.sim.phase==='playing'&&!this.hud.modal&&!this.sim.paused){this.action('weapon4');return;}
    const a = ACTIONS.find((a) => (a.keys as readonly number[]).includes(e.keyCode));
    if (!a) return;
    if (a.id === 'fire') { if (!this.hud.modal && !this.sim.paused && !this.online?.spectator) this.sim.setFire('space', true); }
    else this.action(a.id);
  }
  keyUp(e: EventKeyboard) {
    this.keys.delete(e.keyCode);
    if (e.keyCode === 32) this.sim.setFire('space', false);
  }
  updateRadio(dt = 0) {
    if (this.sim.phase === 'success') {
      if (!this.completionSpoken) { this.completionSpoken = true; this.platform.speak('complete', this.hud.lang); }
      this.platform.advanceRadio(dt);
      return;
    }
    if (this.sim.duelMode || this.sim.phase !== 'playing') { this.platform.stopRadio(); this.hud.radioText = ''; return; }
    if (this.sim.paused) { this.platform.stop(this.sim.extractionRemaining !== undefined && this.sim.extractionRadioPending); return; }
    let cue: keyof typeof RADIO | undefined;
    const threat = this.sim.priorityThreat;
    const newMission = this.radioMission !== this.sim;
    if (newMission) {
      this.radioMission = this.sim;
      this.radioTarget = undefined;
      this.radioAt = -Infinity;
    }
    if (this.sim.extractionRemaining !== undefined && this.radioTarget !== -1) {
      cue = 'clear'; this.radioTarget = -1;
    } else if (newMission) {
      cue = this.sim.mission.light === 'night' ? 'night' : 'day';
    } else if (this.sim.time - this.radioAt >= 10) {
      if (threat && (threat.unit.id !== this.radioTarget || this.sim.time - this.radioAt >= 24)) {
        cue = threat.critical ? 'critical' : 'priority';
        this.radioTarget = threat.unit.id;
      } else if (!threat && this.radioTarget !== undefined && this.sim.units.find(u => u.id === this.radioTarget)?.hp === 0) {
        cue = 'clear'; this.radioTarget = undefined;
      }
    }
    if (cue) {
      this.platform.speak(cue, this.hud.lang);
      this.hud.radioText = RADIO[cue][this.hud.lang === 'zh' ? 0 : 1];
      this.radioAt = this.sim.time;
    } else if (this.sim.time - this.radioAt > 8) this.hud.radioText = '';
    this.platform.advanceRadio(dt);
    if (this.sim.extractionRemaining !== undefined && this.sim.extractionRadioPending !== this.platform.radioPending)
      this.sim.setExtractionRadioPending(this.platform.radioPending);
  }
  update(dt: number) {
    if (!this.hud) return;
    this.syncArmory();
    if (this.online && !this.online.recorder && (globalThis as any).SmallGamesServices)
      this.servicesReady = this.connectServices();
    const frame = view.getFrameSize(),
      key = frame.width + 'x' + frame.height + ':' + this.hud.touch;
    // Keyboard resize and input-mode changes must not destroy an active EditBox.
    if (key !== this.resizeKey && !this.hud.editing) {
      this.resizeKey = key;
      this.hud.resize();
      this.world.updateCamera();
      this.pause('orientation', frame.width < frame.height);
    }
    if (this.online) void this.online.pump(performance.now());
    const before = this.sim.phase;
    const wasExtracting = this.sim.extractionRemaining !== undefined;
    // Arm before stepping: a convoy already at its destination can clear on this very frame.
    if (!this.sim.duelMode && before === 'playing' && this.sim.mission.mode === 'escort' && !wasExtracting && !this.sim.extractionRadioPending)
      this.sim.setExtractionRadioPending(true);
    const buffBefore = this.sim.buff?.kind;
    if (this.sim.duelMode) { this.accumulator = 0; }
    else if (this.sim.resumeCountdown > 0) {
      this.sim.stepCountdown(Math.min(dt, 0.1));
      this.accumulator = 0;
    } else if (this.sim.phase === 'playing' && !this.sim.paused) {
      this.accumulator += Math.min(dt, 0.1);
      let steps = 0;
      while (this.accumulator >= 1 / 60 && steps++ < 6) {
        this.sim.step(1 / 60);
        this.accumulator -= 1 / 60;
      }
    } else this.accumulator = 0;
    if (!wasExtracting && this.sim.extractionRemaining !== undefined) {
      this.world.zoom = 1;
      this.world.locate(this.sim.rescue);
    }
    if (buffBefore && !this.sim.buff) {
      this.hud.toast = buffBefore === 'tracking' ? this.hud.t('追踪模式已结束', 'TRACKING ENDED') : this.hud.t('射速已恢复', 'FIRE RATE RESTORED');
      this.hud.toastUntil = Date.now() + 3000;
    }
    if (!this.sim.duelMode && before === 'playing' && this.sim.phase !== 'playing') {
      this.saveTrainingResult(); this.saveMissionResult();
      const finished = this.sim;
      (globalThis as typeof globalThis & { SmallGamesRewardAds?: { atBreak(id: object, current: () => boolean): void } })
        .SmallGamesRewardAds?.atBreak?.(finished, () => this.sim === finished && ['success', 'failure'].includes(this.sim.phase));
    }
    // Pan in screen space: the ground axes rotate with the aircraft and sensor.
    if (
      !this.sim.paused &&
      !this.hud.modal &&
      this.sim.phase === 'playing' &&
      this.world.zoom > 1.05 &&
      (Array.from(this.touches.values()).some((t) => t.role === 'aim') ||
        (!this.platform.touchInput && Date.now() - this.lastAimInput < 500))
    ) {
      const p = this.world.project(this.sim.aim),
        x = p.x / view.getScaleX(),
        y = this.hud.h - p.y / view.getScaleY();
      const dx = x < 55 ? -1 : x > this.hud.w - 68 ? 1 : 0;
      const dy = y < 78 ? 1 : y > this.hud.h - 105 ? -1 : 0;
      if (dx || dy) {
        const a = this.world.aimAt(this.hud.w * view.getScaleX() / 2, this.hud.h * view.getScaleY() / 2);
        const b = this.world.aimAt(
          (this.hud.w / 2 + dx * dt * 70) * view.getScaleX(),
          (this.hud.h / 2 + dy * dt * 70) * view.getScaleY(),
        );
        if (a && b && Number.isFinite(a.x) && Number.isFinite(a.z) && Number.isFinite(b.x) && Number.isFinite(b.z)) {
          this.world.center.x = Math.max(-MAP.halfWidth, Math.min(MAP.halfWidth, this.world.center.x + b.x - a.x));
          this.world.center.z = Math.max(-MAP.halfDepth, Math.min(MAP.halfDepth, this.world.center.z + b.z - a.z));
        }
        this.world.follow = false;
        this.world.updateCamera();
      }
    }
    for (const e of this.sim.events)
      if (e.id > this.lastEvent) {
        if (e.type === 'shot' && (!this.sim.duelMode || e.side === this.sim.pilotSide)) this.platform.play(e.weapon===4?'alert':ALL_WEAPONS[e.weapon].id);
        else if (e.type === 'impact') {
          if (e.weapon > 0 && e.weapon < 4) this.platform.play('impact' + e.weapon);
          if (e.outcome === 'hit' || e.outcome === 'destroyed') this.platform.play('hit');
        } else if (e.type === 'attack') this.platform.play(e.friendly ? 'rapid' : 'alert', .22);
        else if (e.type === 'wave') this.platform.play('alert');
        this.lastEvent = e.id;
      }
    this.world.root.active = this.sim.phase !== 'briefing' || this.hud.missionsOpen;
    const presented = this.sim.duelMode ? this.presentation.sample(this.sim, performance.now()) : this.sim;
    this.presentedTime = presented.time;
    this.world.update(presented, this.platform.reducedEffects);
    if (presented !== this.sim && !this.online?.spectator) this.sim.aim = { ...presented.aim };
    if (!this.sim.duelMode && this.platform.rewards.ammo !== this.sim.homingAmmo) {
      this.platform.rewards.ammo = this.sim.homingAmmo;
      this.platform.saveRewards();
    }
    this.updateRadio(Math.min(dt, .1));
    this.hud.pressedButton=this.mouseButton || Array.from(this.touches.values()).find(t=>t.role==='button'||t.role==='fire')?.button || '';
    this.hud.update(presented, this.world);
    if (this.pauseControl) {
      this.pauseControl.hidden = !this.hud.buttons.find(button => button.id === 'settings')?.label.node.activeInHierarchy;
      this.pauseControl.disabled = !!this.armory?.view.busy || this.hud.supplyOpen || this.sim.resumeCountdown > 0 || this.hud.exitConfirm;
      this.pauseControl.setAttribute('aria-pressed', String(this.sim.pauses.has('settings') || this.sim.pauses.has('manual')));
    }
    if (sys.isBrowser && !this.startupSignalled && this.world.aircraftModel.status !== 'loading' && this.world.modelImport !== 'loading') {
      this.startupSignalled = true;
      if (this.world.aircraftModel.status === 'error')
        window.dispatchEvent(new CustomEvent('night-overwatch:error', { detail: new Error('机舱资源加载失败，请重试。') }));
      else window.dispatchEvent(new Event('night-overwatch:ready'));
    }
    this.platform.ambience(this.sim.phase === 'playing' && !this.sim.paused);
    if (TUTORIAL.every((e) => this.sim.completed.has(e)) && this.hud.tutorial) {
      this.hud.tutorial = false;
      this.platform.saveCoach();
    }
    this.frameCount++;
    this.frameSeconds += dt;
    if (this.frameSeconds >= 2) {
      this.measuredFps = this.frameCount / this.frameSeconds;
      this.frameCount = 0;
      this.frameSeconds = 0;
    }
  }
  snapshot() {
    return {
      online: this.online && { identity: this.online.identity, panel: this.online.panel, room: this.online.room,
        active: this.online.active, message: this.online.message, rankStatus: this.online.rankStatus,
        rooms: this.online.rooms, history: this.online.history, ranking: this.online.ranking, board: this.online.board },
      armory:this.armory?.view,loadout:this.sim.loadout,coolantUsed:this.sim.coolantUsed,rewardCoins:this.hud.rewardCoins,
      fireZones: this.sim.fireZones,
      battleReport: this.hud.reportOpen,
      timeComparison: this.hud.timeComparison,
      homingAmmo: this.sim.homingAmmo,
      homingSelected: this.sim.homingSelected,
      homingTarget: this.sim.homingSelected ? this.sim.homingTarget?.id : undefined,
      zoomLimit: this.world.zoomLimit,
      advert: this.hud.advert,
      pendingSupply: this.platform.rewards.pendingSupply,
      supplySelection: this.hud.supplySelection,
      supplyMessage: this.hud.supplyMessage,
      extractionRemaining: this.sim.extractionRemaining,
      extractionRadioPending: this.sim.extractionRadioPending,
      buff: this.sim.buff ? { ...this.sim.buff } : null,
      resumeCountdown: this.sim.resumeCountdown,
      locks: this.hud.lockedTargets,
      phase: this.sim.phase,
      mission: { id: this.sim.mission.id, mode: this.sim.mission.mode, map: this.sim.mission.map, name: this.sim.mission.name, spawned: this.sim.spawned.size, total: this.sim.mission.events.length },
      trainingBest: this.hud.trainingBest,
      operationProgress: this.hud.missionProgress,
      operationPractice: this.operationPractice,
      missionPage: this.hud.missionPage,
      time: this.sim.time,
      presentedTime: this.presentedTime,
      completionTime: this.sim.completionTime,
      remaining: this.sim.remaining,
      pauses: Array.from(this.sim.pauses),
      convoy: this.sim.convoy,
      progress: this.sim.ratio,
      aim: this.sim.aim,
      aircraft: { ...this.sim.aircraft },
      aircraftModel: {
        status: this.world.aircraftModel.status,
        error: this.world.aircraftModel.error,
        triangles: this.world.aircraftModel.triangleCount,
        muzzle: this.world.aircraftModel.worldMuzzle,
      },
      flightTime: this.sim.flightTime(),
      threatsRemaining: this.sim.threatsRemaining,
      camera: {
        position: { x: this.world.cameraNode.position.x, y: this.world.cameraNode.position.y, z: this.world.cameraNode.position.z },
        rotation: { x: this.world.cameraNode.eulerAngles.x, y: this.world.cameraNode.eulerAngles.y, z: this.world.cameraNode.eulerAngles.z },
        center: { ...this.world.center },
        fov: this.world.camera.fov,
        projection: this.world.camera.projection,
      },
      shotPositions: this.sim.shots.map((shot) => ({ id: shot.id, ...this.sim.shotPosition(shot) })),
      unitLabels: Array.from(this.hud.unitLabels, ([id, label]) => ({
        id, text: label.string, active: label.node.activeInHierarchy,
        x: label.node.position.x, y: label.node.position.y,
      })),
      effects: this.hud.effects,
      recoil: this.world.recoil,
      lastSound: this.platform.lastSound,
      mousePointer: this.hud.mousePointer,
      selected: this.sim.selected,
      guns: this.sim.guns.map((g) => ({ ...g, ammo: g.ammo === Infinity ? 'infinite' : g.ammo })),
      shots: this.sim.shots,
      units: this.sim.units.map((u) => ({ ...u })),
      kills: this.sim.kills,
      friendlyKills: this.sim.friendlyKills,
      groundAttacks: this.sim.events.filter((e) => e.type === 'attack').slice(-12),
      fired: this.sim.fired,
      hits: this.sim.hits,
      friendlyDamage: this.sim.friendlyDamage,
      rescueDamage: this.sim.rescueDamage,
      damageByThreat: this.sim.damageByThreat,
      failureCause: this.sim.failureCause,
      impacts: this.sim.events.filter((e) => e.type === 'impact').slice(-5),
      rating: this.sim.rating,
      failure: this.sim.failure,
      failedGroup: this.sim.failedGroup,
      reason: this.sim.reason(),
      friendlyRisk: this.sim.friendlyRisk,
      aimedUnit: this.sim.aimedUnit?.id,
      ui: {
        homeArtworkReady: !!this.hud.homeArtwork.spriteFrame,
        interfaceArtworkReady: this.hud.interfaceArtworkReady,
        pressedButton: this.hud.pressedButton,
        worldVisible: this.world.root.active,
        width: this.hud.w,
        height: this.hud.h,
        minimap: this.hud.minimapLayout,
        notice: this.hud.labels.get('notice')?.string,
        warning: this.hud.labels.get('friendWarning')?.string,
        warningColor: this.hud.labels.get('friendWarning')?.color.toHEX(),
        fire: this.hud.buttons.find((b) => b.id === 'fire')?.label.string,
        radio: this.hud.radioText,
        tutorial: this.hud.labels.get('tutorial')?.string,
        feedback: this.hud.labels.get('target')?.string,
        muted: this.platform.muted,
        reducedEffects: this.platform.reducedEffects,
      },
      held: Array.from(this.sim.held),
      completed: Array.from(this.sim.completed),
      modal: this.hud.modalKey,
      scroll: this.hud.scroll,
      scrollMax: this.hud.scrollMax,
      lastHelpLine: this.hud.lastHelpLine,
      buttons: this.hud.buttons
        .filter(
          (b) =>
            b.label.node.activeInHierarchy &&
            (!this.hud.modal || b.label.node.parent === this.hud.modal || this.hud.isGlobalAction(b.id)),
        )
        .map(({ id, x, y, w, h, label, visual, disabled }) => ({ id, x, y, w, h, visual, disabled:!!disabled, text: label.string, bold: label.isBold, color: label.color.toHEX() })),
      zoom: this.world.zoom,
      follow: this.world.follow,
      safe: this.hud.safe,
      temporary: this.world.temporary,
      thermal: this.world.thermal,
      modelImport: this.world.modelImport,
      visualMaterialStatus: this.world.visualMaterialStatus,
      visualMaterialError: this.world.visualMaterialError,
      audio: this.platform.audioStatus,
      enginePlaying: this.platform.engine.playing,
      radioPlaying: this.platform.radio.playing,
      radioPending: this.platform.radioPending,
      radioTime: this.platform.radio.currentTime,
      radioDuration: this.platform.radio.duration,
      light: this.sim.mission.light,
      priority: this.sim.priorityThreat && { id: this.sim.priorityThreat.unit.id, targetId: this.sim.priorityThreat.target.id,
        dueIn: this.sim.priorityThreat.dueIn, critical: this.sim.priorityThreat.critical },
      assets: Array.from(this.world.assets),
      renderNodes: this.world.views.size,
      wrecks: Array.from(this.world.views, ([id, v]) => ({ id, wreck: v.wreck, scale: v.node.scale.x })),
      markerLabels: this.hud.unitLabels.size,
      frameRate: this.measuredFps,
      drawCalls: (director.root as any)?.device?.numDrawCalls,
      triangles: (director.root as any)?.device?.numTris,
      visibleEffects: this.sim.events.filter((e) => this.sim.time - e.time < 0.7).length,
    };
  }
  onDestroy() {
    this.disposed = true;
    this.armory?.dispose();
    this.online?.recorder?.persist?.();
    this.online?.leave(); this.online?.recorder?.invalidate();
    this.pauseControl?.remove();
    this.screenControl?.dispose();
    input.off(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
    input.off(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
    input.off(Input.EventType.MOUSE_UP, this.mouseUp, this);
    input.off(Input.EventType.MOUSE_WHEEL, this.wheel, this);
    input.off(Input.EventType.TOUCH_START, this.touchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
    input.off(Input.EventType.KEY_DOWN, this.keyDown, this);
    input.off(Input.EventType.KEY_UP, this.keyUp, this);
    game.targetOff(this);
    if (sys.isBrowser) window.removeEventListener('pagehide', this.persistRanking);
    this.platform?.dispose();
  }
}
