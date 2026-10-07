import {
  _decorator,
  Camera,
  Color,
  Component,
  game,
  Game,
  JsonAsset,
  Layers,
  Node,
  profiler,
  resources,
  sys,
  UITransform,
} from 'cc';
import { RaceManager, type RaceMode } from './RaceManager';
import { buildTheme } from './ThemeView';
import { themes } from './ThemeCatalog';
import { routes } from './RouteCatalog';
import {
  cycleSelection,
  defaultSelection,
  readSelection,
  vehicles,
  drivers,
  type Selection,
} from './Selection';
import { ItemsView } from './ItemsView';
import { KartView } from './KartView';
import { ChaseCamera } from './ChaseCamera';
import { HUD } from './HUD';
import { KartController } from './KartController';
import { aiInput } from './KartAI';
import { palette, requestedArt } from './SceneArt';
import { AudioFeedback } from './AudioFeedback';
import { addRecord, readRecords, type RaceRecord } from './RankingSystem';
import { setThemeLighting } from './GlacierSample';
import { MultiplayerClient } from './MultiplayerClient';
import { MultiplayerPanel } from './MultiplayerPanel';
import { multiplayerVersion, type RoomState } from './MultiplayerProtocol';
import { readInvitation, platformSharing } from './Invitation';
import { angleDelta } from './KartConfig';
import { Career, shopItems, type CareerFinish } from './Career';
import { HomePanel } from './HomePanel';
import { MenuPreview } from './MenuPreview';
import { competition, rankedResultText, type CompetitionBoard, type BoardEntry } from './CompetitionClient';
import { readPassport, awardPassport, readKartChallenge, readKartChallengeSearch, readRaceMode, readRaceModeSearch,
  raceRecordKey, kartChallengeQuery, kartChallengeTitle,
  type RoutePassport, type KartChallenge } from './RouteChallenges';
const { ccclass } = _decorator;

@ccclass('KartGame')
export class KartGame extends Component {
  race = new RaceManager();
  views: KartView[] = [];
  camera!: ChaseCamera;
  hud!: HUD;
  controller!: KartController;
  audio!: AudioFeedback;
  accumulator = 0;
  uiTime = 0;
  frames = 0;
  frameTime = 0;
  fps = 60;
  muted = false;
  sceneryLoaded = false;
  records: RaceRecord[] = [];
  selection: Selection = { ...defaultSelection };
  mode: RaceMode = 'standard';
  passport: RoutePassport = {};
  activeChallenge?: KartChallenge;
  pendingChallenge?: KartChallenge;
  sharing = false;
  themeRoot?: Node;
  itemsView?: ItemsView;
  loadVersion = 0;
  seed = Date.now() >>> 0;
  botVehicles: string[] = [];
  botDrivers: string[] = [];
  botCount = 3;
  sameBots = false;
  career!: Career;
  home!: HomePanel;
  menuPreview?: MenuPreview;
  setupNotice = '';
  raceRewardId = '';
  countdownLastTime?: number;
  previewEquipment?: { decoration: string; pet: string };
  previewTime = 0;
  settingsFromHome = false;
  pendingRewards: CareerFinish[] = [];
  nextRewardAttempt = 0;
  refreshHome() {
    const loadError = this.race.loadError || this.menuPreview?.snapshot().error;
    this.home?.update?.({ selection: this.selection, mode: this.mode, loading: !this.race.loaded && !this.race.loadError,
      loadError,
      error: loadError || this.setupNotice || this.career.saveError,
      botCount: this.botCount, sameBots: this.sameBots });
  }
  multiplayer?: MultiplayerClient;
  roomPanel?: MultiplayerPanel;
  rankingKey = '';
  rankingBefore: BoardEntry | null | undefined;
  rankingAfter?: CompetitionBoard;
  rankingBusy = false;
  rankingNextRead = 0;
  rankingMessage = '正在等待全站结算…';
  lobbyLoadKey = '';
  preparedKey = '';
  networkRaceId = 0;
  networkTick = -1;
  networkSelectionBlocked = false;
  networkIndexes: number[] = [];
  inputTime = 0;
  renderPoses: { x: number; y: number; z: number; heading: number }[] = [];
  get recordKey() {
    return raceRecordKey(this.selection.route, this.mode);
  }
  readRouteRecords() {
    try {
      this.records = readRecords(
        sys.localStorage.getItem(this.recordKey),
        this.mode === 'standard' && this.selection.route === 'seaside' ? sys.localStorage.getItem('coastline-best') : null,
      );
    } catch {
      this.records = [];
    }
    this.hud.records = this.records;
    this.hud.previousBest = this.records[0]?.time;
  }
  settingsPausedRace = false;
  toggleSettings = () => {
    this.controller?.clear();
    if (!this.hud.settingsVisible) {
      this.settingsFromHome = !!this.home?.root.active;
      if (this.settingsFromHome) this.home.setInputEnabled(false);
      this.settingsPausedRace = !this.race.networked && ['racing', 'countdown'].includes(this.race.phase);
      if (this.settingsPausedRace) this.race.pause();
      this.hud.settingsVisible = true;
      this.hud.settings.setSiblingIndex(this.hud.root.children.length - 1);
    } else {
      this.hud.settingsVisible = false;
      if (this.settingsPausedRace) this.race.resume();
      this.settingsPausedRace = false;
      if (this.settingsFromHome) this.home.setInputEnabled(true);
      this.settingsFromHome = false;
    }
  };
  toggleSound = () => {
    this.muted = !this.muted;
    this.audio.activate(this.muted);
    this.saveSettings();
  };
  toggleHelp = () => {
    if (this.race.networked) {
      this.hud.rulesVisible = !this.hud.rulesVisible;
      return;
    }
    this.hud.coach.enabled = !this.hud.coach.enabled;
    if (this.hud.coach.enabled) this.hud.coach.step = 0;
    this.saveSettings();
  };
  saveSettings() {
    try {
      sys.localStorage.setItem('kart-settings-v1', JSON.stringify({ muted: this.muted, coaching: this.hud.coach.enabled }));
    } catch { /* Storage is optional in private browsing and native previews. */ }
  }
  toggleFullscreen = () => {
    const display = (globalThis as typeof globalThis & { KartDisplay?: { toggleFullscreen(): unknown } }).KartDisplay;
    if (sys.isBrowser) display?.toggleFullscreen();
  };
  choose = (field: keyof Selection, delta: number) => {
    if (this.race.phase !== 'ready' || this.multiplayer?.room || this.hud.settingsVisible) return;
    this.selection = cycleSelection(this.selection, field, delta);
    this.setupNotice = '';
    if (field === 'route') this.activeChallenge = undefined;
    this.syncModeAddress();
    this.saveSelection();
    this.loadSelection(false, false);
  };
  toggleMode = () => {
    if (this.race.phase !== 'ready' || this.multiplayer?.room || this.hud.settingsVisible) return;
    this.mode = this.mode === 'standard' ? 'sprint' : 'standard';
    this.activeChallenge = undefined;
    this.syncModeAddress();
    this.loadSelection(false, false);
  };
  saveSelection() {
    try {
      sys.localStorage.setItem('kart-selection-v1', JSON.stringify({ ...this.selection,
        vehicle: this.career.profile.equipped.vehicle, driver: this.career.profile.equipped.driver }));
    } catch { /* Browsing does not require writable storage. */ }
  }
  ownedSelection(selection: Selection): Selection {
    const safe = { ...selection };
    for (const field of ['vehicle', 'driver'] as const) {
      if (!this.career.profile.owned.includes(`${field}:${safe[field]}`))
        safe[field] = this.career.profile.equipped[field];
    }
    return safe;
  }
  canUseSelection(): boolean {
    if (this.ownsSelection(this.selection)) return true;
    this.setupNotice = '所选赛车或车手服尚未解锁 · 在商店购买后即可参赛';
    this.refreshHome();
    return false;
  }
  ownsSelection(selection: Pick<Selection, 'vehicle' | 'driver'>): boolean {
    return (['vehicle', 'driver'] as const).every((field) =>
      this.career.profile.owned.includes(`${field}:${selection[field]}`));
  }
  private rejectRoomSelection(): false {
    this.networkSelectionBlocked = true;
    this.controller?.clear();
    if (this.multiplayer) this.multiplayer.status = '房间赛车或车手未解锁，请房主换车或退出后解锁';
    if (this.roomPanel) { this.roomPanel.root.active = true; this.roomPanel.refresh(); }
    return false;
  }
  syncModeAddress() {
    if (!sys.isBrowser) return;
    try {
      const url = new URL(location.href);
      if (!url.searchParams.has('mode') && !url.searchParams.has('kartChallenge')) return;
      url.search = this.activeChallenge
        ? kartChallengeQuery(this.selection, this.activeChallenge.seed, this.activeChallenge.time, this.mode, this.activeChallenge.parts)
        : new URLSearchParams({ mode: this.mode }).toString();
      url.hash = url.username = url.password = '';
      history.replaceState(null, '', url.href);
    } catch { /* Optional address synchronization never blocks mode selection. */ }
  }
  receiveChallenge = (query: Record<string, unknown>) => {
    const received = readKartChallenge(query);
    if (!received) return;
    const challenge = { ...received, selection: this.ownedSelection(received.selection) };
    if (this.race.phase === 'ready' && !this.multiplayer?.room && !this.roomPanel?.root.active && !this.hud.settingsVisible) {
      this.pendingChallenge = undefined;
      this.activeChallenge = challenge;
      this.selection = { ...challenge.selection };
      this.mode = challenge.mode;
      this.loadSelection(false, false);
      this.home?.show('setup');
    } else {
      this.pendingChallenge = challenge;
      this.hud.challengeNotice = '收到同路线挑战 · 更换配置后查看，不中断本场';
    }
  };
  enterGarage = () => {
    if (this.multiplayer?.room && this.roomPanel) {
      this.roomPanel.root.active = true;
      return;
    }
    if (this.pendingChallenge) {
      this.activeChallenge = this.pendingChallenge;
      this.selection = { ...this.pendingChallenge.selection };
      this.mode = this.pendingChallenge.mode;
      this.pendingChallenge = undefined;
      this.hud.challengeNotice = '';
    }
    this.hud.settingsVisible = false;
    this.settingsPausedRace = false;
    this.settingsFromHome = false;
    this.home.setInputEnabled(true);
    this.previewEquipment = undefined;
    this.selection.vehicle = this.activeChallenge?.selection.vehicle ?? this.career.profile.equipped.vehicle;
    this.selection.driver = this.activeChallenge?.selection.driver ?? this.career.profile.equipped.driver;
    this.loadSelection();
    this.home.show('home');
  };
  preview = (selection: Partial<Selection> & { decoration?: string; pet?: string }) => {
    if (this.race.phase !== 'ready' || this.multiplayer?.room || this.hud.settingsVisible) return;
    this.selection = readSelection(JSON.stringify({ ...this.selection, ...selection }));
    if (selection.decoration || selection.pet) {
      const equipment = { ...this.career.profile.equipped, ...this.previewEquipment };
      for (const field of ['decoration', 'pet'] as const) {
        if (shopItems.some(item => item.category === field && item.assetId === selection[field])) equipment[field] = selection[field]!;
      }
      this.previewEquipment = equipment;
    }
    this.setupNotice = '';
    this.loadSelection(false, false);
  };
  equip = () => {
    this.previewEquipment = undefined;
    this.preview({ vehicle: this.career.profile.equipped.vehicle, driver: this.career.profile.equipped.driver });
  };
  setBots = (count: number, same: boolean) => {
    if (this.hud.settingsVisible || !Number.isInteger(count) || count < 0 || count > 7) return;
    this.botCount = count;
    this.sameBots = same === true;
    this.refreshHome();
    try { sys.localStorage.setItem('kart-race-options-v1', JSON.stringify({ count, same: this.sameBots })); } catch {}
  };
  challenge = (stat: 'races' | 'wins' | 'routes') => {
    if (this.race.phase !== 'ready' || this.multiplayer?.room || this.hud.settingsVisible) return;
    this.activeChallenge = this.pendingChallenge = undefined;
    this.previewEquipment = undefined;
    this.selection = { ...this.selection, vehicle: this.career.profile.equipped.vehicle,
      driver: this.career.profile.equipped.driver };
    if (stat === 'routes') {
      const next = routes.find((route) => !this.career.profile.routes.includes(route.id));
      if (next) {
        this.selection.route = next.id;
        if (themes.some((theme) => theme.id === next.id)) this.selection.theme = next.id;
      }
    }
    if (stat === 'wins' && this.botCount < 1) this.setBots(1, this.sameBots);
    this.setupNotice = '';
    this.syncModeAddress();
    this.saveSelection();
    this.loadSelection(false, false);
    this.home.show('setup');
  };
  prepareRace = () => {
    if (this.multiplayer?.room || this.hud.settingsVisible || this.home.page === 'shop' || this.race.phase !== 'ready') return;
    if (this.race.loadError) { this.loadSelection(false, false); return; }
    if (this.menuPreview?.snapshot().error) { void this.menuPreview.load(this.home.page).catch(() => {}); return; }
    if (!this.race.loaded || !this.canUseSelection()) return;
    for (const field of ['vehicle', 'driver'] as const) {
      if (!this.career.equip(`${field}:${this.selection[field]}`)) {
        this.setupNotice = this.career.saveError || '装备保存失败，请重试';
        this.refreshHome();
        return;
      }
    }
    this.saveSelection();
    this.home.hide();
    this.previewEquipment = undefined;
    this.loadSelection(true);
  };
  startRace = () => {
    if (this.home.root.active || this.hud.settingsVisible || !this.hud.staged || !this.race.loaded || this.race.loadError || !this.canUseSelection()) return;
    this.controller.clear();
    this.audio.activate(this.muted);
    this.countdownLastTime = Date.now();
    this.race.start();
  };
  shareChallenge = async () => {
    const p = this.race.drivers[0].progress;
    if (this.sharing || this.race.networked || this.race.phase !== 'finished' || !p.finishedAt) return;
    this.sharing = true;
    const race = this.race, version = this.loadVersion;
    const feedback = (message: string) => {
      if (this.isValid && this.race === race && this.loadVersion === version) this.hud.challengeNotice = message;
    };
    const challenge = { selection: { ...this.selection }, seed: this.seed, time: p.finishedAt, mode: this.race.mode, parts: this.race.upgrades };
    let browserAddressReady = false;
    try {
      const query = kartChallengeQuery(challenge.selection, challenge.seed, challenge.time, challenge.mode, challenge.parts);
      const title = kartChallengeTitle(challenge);
      const platform = platformSharing();
      if (platform) {
        feedback(platform.share(query, title)
          ? '已请求分享 · 好友将挑战同路线、同道具布局'
          : '当前平台未开放分享，可继续挑战路线印章');
      } else if (sys.isBrowser) {
        const url = new URL(location.href);
        url.search = query;
        url.hash = url.username = url.password = '';
        history.replaceState(null, '', url.href);
        browserAddressReady = true;
        if (navigator.share) await navigator.share({ title, text: title, url: url.href });
        else {
          if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(title + '\n' + url.href);
          else { feedback('同道具挑战已写入当前地址 · 复制浏览器地址即可分享'); return; }
        }
        feedback('挑战分享已完成 · 好友使用同路线、同道具布局');
      }
    } catch (error) {
      feedback(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError'
        ? '已取消分享 · 本场成绩仍保留'
        : browserAddressReady ? '同道具挑战已写入当前地址 · 复制浏览器地址即可分享'
          : '分享未完成 · 本场成绩仍保留');
    } finally { this.sharing = false; }
  };
  loadSelection(fullRace = false, rerollBots = true, room?: RoomState) {
    if (fullRace && !room && (this.hud.settingsVisible || !this.canUseSelection())) return false;
    if (room) {
      const self = room.roster[this.networkIndexes[0]];
      if (!self || !this.ownsSelection(self)) return this.rejectRoomSelection();
    }
    this.networkSelectionBlocked = false;
    const version = ++this.loadVersion;
    this.controller?.clear();
    if (this.themeRoot) {
      this.themeRoot.active = false;
      this.themeRoot.destroy();
    }
    this.themeRoot = new Node('SelectedTheme');
    this.node.addChild(this.themeRoot);
    const theme = themes.find((t) => t.id === this.selection.theme)!;
    const route = routes.find((r) => r.id === this.selection.route)!;
    setThemeLighting(this.themeRoot, theme.id === 'glacier');
    if (room) { this.seed = room.seed; this.activeChallenge = undefined; this.mode = 'standard'; }
    else if (this.activeChallenge) { this.seed = this.activeChallenge.seed; this.mode = this.activeChallenge.mode; }
    else this.seed = (this.seed + 1) >>> 0;
    this.race = new RaceManager(route.track, this.seed, room?.roster.length ?? this.botCount + 1, this.mode);
    this.race.upgrades = room ? { engine: 0, grip: 0, nitro: 0 }
      : this.activeChallenge?.parts ?? (this.activeChallenge ? { engine: 0, grip: 0, nitro: 0 } : this.career.performance());
    this.raceRewardId = `${Date.now().toString(36)}:${this.seed}:${version}`;
    this.hud.rewardText = '';
    this.hud.staged = fullRace && !room;
    this.countdownLastTime = undefined;
    this.renderPoses = [];
    this.race.networked = !!room;
    if (room) this.race.names = this.networkIndexes.map((i) => room.roster[i].name);
    this.race.loaded = false;
    this.sceneryLoaded = false;
    this.accumulator = 0;
    this.camera.initialized = false;
    this.camera.camera.clearColor = new Color().fromHEX(theme.colors.sky);
    this.camera.camera.clearFlags = Camera.ClearFlag.SKYBOX;
    this.camera.height = 3.6;
    this.camera.lookHeight = 1.5;
    this.hud.selection = { ...this.selection };
    if (!this.pendingChallenge) this.hud.challengeNotice = '';
    this.hud.passport = this.passport;
    this.hud.challenge = this.activeChallenge;
    this.hud.lastPhase = '';
    this.readRouteRecords();
    this.refreshHome();
    if (fullRace && rerollBots) {
      this.botVehicles = this.race.drivers
        .slice(1)
        .map(() => this.sameBots ? this.selection.vehicle : vehicles[Math.floor(Math.random() * vehicles.length)][0]);
      this.botDrivers = this.race.drivers.slice(1)
        .map(() => this.sameBots ? this.selection.driver : drivers[Math.floor(Math.random() * drivers.length)][0]);
    }
    const colors = [palette.red, palette.blue, palette.yellow, palette.mint];
    const randomEquipment = () => {
      const decorations = shopItems.filter(item => item.category === 'decoration'), pets = shopItems.filter(item => item.category === 'pet');
      return { decoration: decorations[Math.floor(Math.random() * decorations.length)].assetId,
        pet: pets[Math.floor(Math.random() * pets.length)].assetId };
    };
    this.views = this.race.drivers.slice(0, fullRace || room ? undefined : 1).map(
      (_, i) =>
        new KartView(this.themeRoot!, colors[i % colors.length], {
          ...this.selection,
          vehicle: room
            ? room.roster[this.networkIndexes[i]].vehicle
            : i === 0
              ? this.selection.vehicle
              : this.botVehicles[i - 1],
          driver: room ? room.roster[this.networkIndexes[i]].driver : i === 0 ? this.selection.driver : this.botDrivers[i - 1],
        }, i === 0 ? (!fullRace && !room ? this.previewEquipment : undefined) ?? this.career.profile.equipped : this.sameBots ? this.career.profile.equipped : randomEquipment()),
    );
    this.itemsView = fullRace || room ? new ItemsView(this.themeRoot, this.race.items) : undefined;
    Promise.all([
      buildTheme(this.themeRoot, this.race.track, theme),
      ...this.views.map((v) => v.ready),
      this.itemsView?.ready,
      this.home.root.active ? this.menuPreview?.load(this.home.page) : undefined,
    ])
      .then(() => {
        if (version !== this.loadVersion) return;
        if (room && this.networkSelectionBlocked) return;
        this.race.loaded = true;
        this.sceneryLoaded = true;
        this.refreshHome();
        game.emit('kart:loaded');
        if (!room) this.markPrepared();
        if (room) this.multiplayer?.send({ type: 'loaded', raceId: room.raceId });
      })
      .catch((error: Error) => {
        if (version !== this.loadVersion) return;
        this.race.phase = 'ready';
        this.race.loadError = String(error.message || error).slice(0, 100);
        this.refreshHome();
        game.emit('kart:load-error');
        if (room && this.multiplayer && this.roomPanel) {
          this.multiplayer.status = '赛车素材加载失败，请退出房间后重试';
          this.roomPanel.root.active = true;
          this.roomPanel.refresh();
        }
        console.error('[carding-car] selected assets failed', error);
      });
    return true;
  }
  start() {
    profiler.hideStats();
    this.node.layer = Layers.Enum.DEFAULT;
    this.camera = new ChaseCamera(this.node);
    this.camera.camera.visibility = Layers.Enum.DEFAULT;
    this.hud = new HUD(this.node);
    this.audio = new AudioFeedback(this.node);
    this.career = new Career(sys.localStorage);
    this.hud.coach.enabled = false;
    try {
      this.passport = readPassport(sys.localStorage.getItem('kart-route-passport-v1'));
      const settings = JSON.parse(sys.localStorage.getItem('kart-settings-v1') || '{}');
      this.muted = settings?.muted === true;
      this.hud.coach.enabled = settings?.coaching === true;
      const options = JSON.parse(sys.localStorage.getItem('kart-race-options-v1') || '{}');
      if (Number.isInteger(options?.count) && options.count >= 0 && options.count <= 7) this.botCount = options.count;
      this.sameBots = options?.same === true;
    } catch {}
    const launch = sys.isBrowser
        ? Object.fromEntries(new URLSearchParams(location.search))
        : platformSharing()?.query || {};
    this.selection = readSelection(JSON.stringify(launch));
    if (!launch.vehicle) this.selection.vehicle = this.career.profile.equipped.vehicle;
    if (!launch.driver) this.selection.driver = this.career.profile.equipped.driver;
    const invitation = readInvitation(launch);
    if (invitation) { this.selection = invitation.selection; this.mode = 'standard'; }
    else if ((this.activeChallenge = sys.isBrowser ? readKartChallengeSearch(location.search) : readKartChallenge(launch))) {
      this.activeChallenge.selection = this.ownedSelection(this.activeChallenge.selection);
      this.selection = { ...this.activeChallenge.selection };
      this.mode = this.activeChallenge.mode;
    } else this.mode = (sys.isBrowser ? readRaceModeSearch(location.search) : readRaceMode(launch)) || 'standard';
    const sharing = platformSharing();
    if (sharing) sharing.onLaunch = this.receiveChallenge;
    this.home = new HomePanel(this.hud.root, this.career, {
      choose: this.choose, mode: this.toggleMode, prepare: this.prepareRace,
      preview: this.preview, equip: this.equip, bots: this.setBots,
      settings: this.toggleSettings,
      challenge: this.challenge,
    });
    this.home.show(this.activeChallenge ? 'setup' : 'home');
    this.menuPreview = new MenuPreview(this.node);
    this.controller = new KartController(
      () => this.race,
      () => this.restart(),
      this.toggleSound,
      () => this.audio.activate(this.muted),
      this.choose,
      this.enterGarage,
      () =>
        (!!this.home.root.active && !this.hud.settingsVisible) || !!this.roomPanel?.root.active || (!!this.multiplayer?.room && !this.multiplayer.connected),
      this.startRace,
      this.toggleHelp,
      this.shareChallenge,
      this.toggleMode,
      this.toggleSettings,
      () => this.hud.settingsVisible,
      this.toggleFullscreen,
      this.enterGarage,
    );
    const display = (globalThis as typeof globalThis & { KartDisplay?: { setControls(controls: Record<string, () => void>): void } }).KartDisplay;
    if (sys.isBrowser) display?.setControls({
      pause: () => {
        if (this.hud.settingsVisible) return;
        this.controller.clear();
        if (this.race.networked) this.enterGarage();
        else if (this.race.phase === 'paused') this.race.resume();
        else this.race.pause();
      },
      settings: () => { if (!this.roomPanel?.root.active) this.toggleSettings(); },
    });
    this.loadSelection();
    this.setupMultiplayer();
    game.on(Game.EVENT_HIDE, this.hide, this);
    // Read-only diagnostics for real-input checks: no teleport or forced finish hooks.
    if (sys.isBrowser) {
      const browser = globalThis as typeof globalThis & { __kart?: unknown };
      browser.__kart = {
        snapshot: () => ({
          multiplayer: this.multiplayer
            ? {
                connected: this.multiplayer.connected,
                status: this.multiplayer.status,
                selfId: this.multiplayer.selfId,
                room: this.multiplayer.room,
                tick: this.networkTick,
                panelOpen: this.roomPanel?.root.active,
                invite: this.roomPanel?.pendingInvite,
                entryVisible: this.roomPanel?.root.getChildByName('JoinRoom')?.active,
                lobbyVisible: this.roomPanel?.root.getChildByName('RoomLobby')?.active,
                entryLabel: this.roomPanel?.openButton.string,
                panelStatus: this.roomPanel?.status.string,
                ranking: this.roomPanel?.rankingView,
              }
            : null,
          phase: this.race.phase,
          mode: this.race.mode,
          laps: this.race.laps,
          selection: { ...this.selection },
          seed: this.seed,
          challenge: this.activeChallenge ? { ...this.activeChallenge, selection: { ...this.activeChallenge.selection } } : null,
          passport: { ...this.passport },
          loading: !this.race.loaded,
          countdown: this.race.countdown,
          home: this.home.snapshot(),
          menuArtwork: this.menuPreview?.snapshot(),
          staged: this.hud.staged,
          botOptions: { count: this.botCount, same: this.sameBots },
          career: JSON.parse(JSON.stringify(this.career.profile)),
          reward: this.career.lastReward,
          upgrades: { ...this.race.upgrades },
          requestedArt: Array.from(requestedArt),
          loadError: this.race.loadError,
          itemsCollected: this.race.itemsCollected,
          theme: this.selection.theme,
          route: {
            id: this.selection.route,
            width: this.race.track.width,
            length: this.race.track.length,
          },
          items: this.race.items.map((item) => ({
            ...item,
            active: item.availableAt <= this.race.time,
          })),
          renderedVehicles: this.views.map((v) => v.body.children[0]?.name),
          renderedDrivers: this.views.map((v) => v.driver?.name),
          renderedItems: this.itemsView?.nodes.map((n) => n.name),
          time: this.race.time,
          fps: this.fps,
          boosts: this.race.boosts,
          collisions: this.race.collisions,
          resets: this.race.resets,
          order: this.race.order,
          modelsLoaded: this.views.every((v) => v.modelLoaded),
          sceneryLoaded: this.sceneryLoaded,
          audioClips: this.audio.clips.size,
          audioPlaying: this.audio.source.playing,
          muted: this.muted,
          currentLapTime: this.race.currentLapTime,
          bestLapTime: this.race.bestLapTime,
          records: this.records.map((record) => ({ ...record })),
          hud: {
            menuVisible: this.hud.panel.active,
            settingsVisible: this.hud.settingsVisible,
            rulesVisible: this.hud.rulesVisible,
            coachingVisible: this.hud.coaching.node.parent!.active,
            help: this.hud.help.string,
            pause: this.hud.pause.string,
            top: this.hud.top.string,
            title: this.hud.title.string,
            choices: this.hud.choices.map((choice) => choice.string),
            detail: this.hud.detail.string,
            timer: this.hud.timer.string,
            standings: this.hud.standings.string,
            leaderboard: this.hud.leaderboard.string,
            nitro: this.hud.nitro.string,
            coaching: this.hud.coaching.string,
            coachingEnabled: this.hud.coach.enabled,
            coachingStep: this.hud.coach.step,
            target: this.hud.tagline.string,
            footer: this.hud.footer.string,
          },
          player: { ...this.race.drivers[0].kart },
          camera: {
            heading: this.camera.heading,
            x: this.camera.node.position.x,
            z: this.camera.node.position.z,
          },
          progress: { ...this.race.drivers[0].progress },
          input: this.controller.read(),
          suggestedInput: aiInput(
            this.race.drivers[0].kart,
            this.race.track,
            false,
            this.race.drivers[0].progress.s,
          ),
          drivers: this.race.drivers.map((d) => ({
            x: d.kart.x,
            z: d.kart.z,
            lap: d.progress.laps,
            distance: d.progress.distance,
            speed: d.kart.speed,
          })),
        }),
      };
      document.body.dataset.kartReady = 'true';
      document.getElementById('GameCanvas')?.focus();
      window.addEventListener('blur', this.hide);
    }
    this.hud.update(this.race, this.controller.read(), this.muted);
    console.log('[carding-car] ready: native Cocos scene, 4 karts, 3 laps');
  }
  hide = () => {
    this.controller?.clear();
    if (this.audio) this.audio.activated = false;
    this.race.pause();
    this.accumulator = 0;
    this.countdownLastTime = undefined;
  };
  restart() {
    if (this.hud.settingsVisible) return;
    if (this.multiplayer?.room && this.roomPanel) {
      this.roomPanel.root.active = true;
      this.roomPanel.refresh();
      return;
    }
    if (!this.loadSelection(true)) return;
    this.home.hide();
  }
  markPrepared() {
    const client = this.multiplayer,
      room = client?.room;
    if (!room || room.phase !== 'lobby' || !this.race.loaded || this.race.loadError) return;
    if (!this.ownsSelection(room)) { this.rejectRoomSelection(); return; }
    this.networkSelectionBlocked = false;
    if (
      Object.entries(this.selection).some(([key, value]) => room[key as keyof Selection] !== value)
    )
      return;
    const key = `${room.code}:${room.revision}`;
    if (this.preparedKey === key) return;
    this.preparedKey = key;
    client!.send({ type: 'prepared', revision: room.revision });
  }
  setupMultiplayer() {
    resources.load('multiplayer', JsonAsset, (error, asset) => {
      if (!this.isValid) return;
      const query = sys.isBrowser ? new URLSearchParams(location.search) : undefined;
      const configured =
        !error && typeof asset.json?.serverUrl === 'string' ? asset.json.serverUrl : '';
      const endpoint =
        query?.get('kartServer') ||
        (globalThis as typeof globalThis & { __kartServerUrl?: string }).__kartServerUrl ||
        configured ||
        platformSharing()?.serverUrl ||
        (sys.isBrowser && location.pathname.startsWith('/play/')
          ? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/kart`
          : sys.isBrowser && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
            ? `ws://${location.hostname}:43003/kart`
            : '');
      const client = (this.multiplayer = new MultiplayerClient(endpoint));
      this.roomPanel = new MultiplayerPanel(
        this.hud,
        client,
        () => this.ownedSelection(this.selection),
        () => {
          this.controller.clear();
          this.audio.activate(this.muted);
          if (!client.room) this.race.pause();
        },
        () => {
          client.leave();
          this.networkRaceId = 0;
          this.roomPanel!.root.active = false;
          this.enterGarage();
        },
        (selection) => this.ownsSelection(selection),
      );
      const storage = sys.isBrowser ? sessionStorage : sys.localStorage;
      client.onSession = () => {
        try {
          if (client.session)
            storage.setItem('kart-room-session', JSON.stringify({ endpoint, ...client.session }));
          else storage.removeItem('kart-room-session');
        } catch {}
      };
      client.onRoom = (room) => {
        if (room.phase === 'lobby') {
          this.home.hide();
          const wasRacing = this.networkRaceId !== 0;
          this.networkRaceId = 0;
          const key = `${room.code}:${room.revision}`;
          if (key !== this.lobbyLoadKey || this.race.phase !== 'ready' || wasRacing) {
            this.lobbyLoadKey = key;
            this.preparedKey = '';
            const selected = readSelection(JSON.stringify(room));
            if (
              JSON.stringify(selected) !== JSON.stringify(this.selection) ||
              this.race.phase !== 'ready' ||
              wasRacing ||
              this.race.loadError
            ) {
              this.selection = selected;
              this.loadSelection(false, false);
            }
            this.markPrepared();
          }
          this.roomPanel!.root.active = true;
          this.race.networked = true;
          this.controller.clear();
          if (!this.ownsSelection(room)) this.rejectRoomSelection();
          return;
        }
        const self = room.roster.findIndex((r) => r.id === client.selfId);
        if (self < 0) return;
        if (!this.ownsSelection(room.roster[self])) { this.rejectRoomSelection(); return; }
        this.networkSelectionBlocked = false;
        if (room.raceId === this.networkRaceId) {
          if (this.race.loaded) client.send({ type: 'loaded', raceId: room.raceId });
          return;
        }
        this.networkRaceId = room.raceId;
        this.networkTick = -1;
        this.networkIndexes = [self, ...room.roster.map((_, i) => i).filter((i) => i !== self)];
        this.selection = readSelection(JSON.stringify(room));
        this.home.hide();
        this.roomPanel!.root.active = false;
        this.loadSelection(false, false, room);
      };
      const invite = readInvitation(
        query ? Object.fromEntries(query) : platformSharing()?.query || {},
      );
      if (invite) { this.home.hide(); this.roomPanel.showInvite(invite); }
      const platform = platformSharing();
      if (platform)
        platform.onInvite = (query) => {
          const invitation = readInvitation(query);
          if (!invitation || client.room?.code === invitation.code) return;
          this.controller.clear();
          this.home.hide();
          if (!client.room) {
            this.selection = invitation.selection;
            this.loadSelection(false, false);
          }
          this.roomPanel!.showInvite(invitation);
        };
      try {
        const session = JSON.parse(storage.getItem('kart-room-session') || 'null');
        if (
          session?.endpoint === endpoint &&
          (!invite || invite.code === session.code) &&
          /^[A-F0-9]{8}$/.test(session.code) &&
          /^[a-f0-9]{64}$/.test(session.token)
        ) {
          client.session = { code: session.code, token: session.token };
          client.connect({ type: 'resume', version: multiplayerVersion, ...client.session });
        }
      } catch {}
    });
  }
  syncRankedResult(room: RoomState) {
    if (!room.ranked) return;
    const key = `${room.code}:${room.raceId + (room.phase === 'lobby' ? 1 : 0)}`;
    if (key !== this.rankingKey) {
      this.rankingKey = key; this.rankingBefore = undefined; this.rankingAfter = undefined; this.rankingNextRead = 0;
      this.rankingMessage = '正在等待全站结算…';
      try { const saved = JSON.parse(sys.localStorage.getItem('kart-ranked-before') || 'null'); if (saved?.key === key) this.rankingBefore = saved.me; } catch {}
    }
    const before = room.phase === 'lobby';
    if ((!before && (room.phase !== 'finished' || room.settlement !== 'saved')) ||
      (before ? this.rankingBefore !== undefined : !!this.rankingAfter) || this.rankingBusy || Date.now() < this.rankingNextRead) return;
    const client = competition();
    if (!client) { this.rankingMessage = '全站服务尚未配置\n个人最佳与排名尚未确认'; return; }
    this.rankingBusy = true; this.rankingNextRead = Date.now() + 5000;
    void client.request('/boards/carding-car').then(value => {
      if (!this.isValid || this.rankingKey !== key) return;
      const board = value as CompetitionBoard;
      if (!Array.isArray(board.top) || !Number.isInteger(board.eligiblePlayers)) throw new Error('Invalid board');
      if (before) {
        // A delayed lobby response must not be labelled as an observed pre-race record.
        if (this.multiplayer?.room?.phase !== 'lobby') return;
        this.rankingBefore = board.me;
        try { sys.localStorage.setItem('kart-ranked-before', JSON.stringify({key,me:board.me})); } catch {}
      } else this.rankingAfter = board;
    }).catch(() => { if (this.rankingKey === key) this.rankingMessage = '全站服务暂不可用\n个人最佳与排名尚未确认\n正在重新查询…'; })
      .finally(() => { this.rankingBusy = false; });
  }
  saveFinishedRace() {
    const p = this.race.drivers[0].progress;
    if (this.race.networked || this.race.phase !== 'finished' || !p.finishedAt || p.laps < this.race.laps || this.race.mode !== this.mode) return;
    this.pendingRewards.push({
      id: this.raceRewardId, position: this.race.order.indexOf(0) + 1,
      entrants: this.race.drivers.length, time: p.finishedAt, route: this.selection.route,
      mode: this.mode, coins: this.race.drivers[0].kart.coins,
      boosts: this.race.boosts, driftBoosts: this.race.driftBoosts,
    });
    this.settleRewards();
    this.records = addRecord(this.records, {
      time: p.finishedAt,
      bestLap: this.race.bestLapTime,
      place: this.race.order.indexOf(0) + 1,
    });
    this.hud.records = this.records;
    if (this.mode === 'standard') {
      this.passport = awardPassport(this.passport, this.selection.route, this.race);
      this.hud.passport = this.passport;
    }
    try {
      sys.localStorage.setItem(this.recordKey, JSON.stringify(this.records));
      if (this.mode === 'standard') sys.localStorage.setItem('kart-route-passport-v1', JSON.stringify(this.passport));
    } catch {}
  }
  settleRewards() {
    this.nextRewardAttempt = Date.now() + 3000;
    while (this.pendingRewards.length) {
      const pending = this.pendingRewards[0], reward = this.career.finish(pending);
      if (!reward && this.career.saveError) {
        if (pending.id === this.raceRewardId) this.hud.rewardText = '奖励尚未保存 · 恢复存储后自动重试';
        break;
      }
      this.pendingRewards.shift();
      if (reward && pending.id === this.raceRewardId) this.hud.rewardText =
        `奖金 +${reward.coins} 金币 · 成长 +${reward.xp}${reward.levelAfter > reward.levelBefore ? ` · 升至 Lv.${reward.levelAfter}` : ''}`;
    }
  }
  update(dt: number) {
    if (!this.controller) return;
    this.frames++;
    this.frameTime += dt;
    if (this.frameTime >= 1) {
      this.fps = Math.round(this.frames / this.frameTime);
      this.frames = 0;
      this.frameTime = 0;
    }
    this.accumulator += Math.min(dt, 0.1);
    const input = this.controller.read(),
      before = this.race.phase;
    const online = this.multiplayer?.room;
    if (online) {
      this.accumulator = 0;
      const snapshot = this.multiplayer!.snapshot;
      if (
        !this.networkSelectionBlocked && this.race.loaded &&
        snapshot &&
        snapshot.raceId === this.networkRaceId &&
        snapshot.tick >= this.networkTick
      ) {
        this.networkTick = snapshot.tick;
        this.race.drivers.forEach((driver, i) =>
          Object.assign(driver, snapshot.drivers[this.networkIndexes[i]]),
        );
        this.race.networkOrder = snapshot.order.map((i) => this.networkIndexes.indexOf(i));
        this.race.items.forEach((item, i) => {
          item.availableAt = snapshot.itemAvailableAt[i];
        });
        this.race.phase = snapshot.phase;
        this.race.time = snapshot.time;
        this.race.countdown = snapshot.countdown;
      }
      this.inputTime += dt;
      if (!this.networkSelectionBlocked && this.inputTime >= 0.05 && online.phase === 'racing') {
        this.inputTime = 0;
        this.multiplayer!.send({
          type: 'input',
          raceId: online.raceId,
          seq: ++this.multiplayer!.seq,
          input,
        });
      }
    } else if (this.race.phase === 'countdown') {
      const now = Date.now();
      if (this.countdownLastTime !== undefined) this.race.step(input, Math.max(0, (now - this.countdownLastTime) / 1000));
      this.countdownLastTime = now;
      this.accumulator = 0;
    } else {
      this.countdownLastTime = undefined;
      while (this.accumulator >= 1 / 60) {
        this.race.step(input, 1 / 60);
        const wasComplete = this.hud.coach.step === 5;
        this.hud.coach.observe(
          this.race.drivers[0].kart,
          input,
          1 / 60,
          this.race.phase === 'racing',
        );
        if (!wasComplete && this.hud.coach.step === 5) {
          try {
            sys.localStorage.setItem('kart-driving-coach-v1', 'done');
          } catch {}
        }
        this.accumulator -= 1 / 60;
      }
    }
    if (!online && before !== 'finished' && this.race.phase === 'finished') this.saveFinishedRace();
    this.previewTime += Math.min(dt, 0.1);
    this.views.forEach((v, i) => {
      const kart = this.race.drivers[i].kart;
      const pose = (this.renderPoses[i] ??= {
        x: kart.x,
        y: kart.y,
        z: kart.z,
        heading: kart.heading,
      });
      const blend =
        !online || Math.hypot(kart.x - pose.x, kart.z - pose.z) > 10 ? 1 : 1 - Math.exp(-22 * dt);
      pose.x += (kart.x - pose.x) * blend;
      pose.y += (kart.y - pose.y) * blend;
      pose.z += (kart.z - pose.z) * blend;
      pose.heading += angleDelta(kart.heading, pose.heading) * blend;
      const showingHome = this.home.root.active && this.home.page === 'home';
      v.update({ ...kart, ...pose, heading: showingHome ? pose.heading + Math.sin(this.previewTime * 0.7) * 0.13 : pose.heading },
        this.home.root.active ? this.previewTime : this.race.time);
    });
    this.itemsView?.update(this.race.items, this.race.time);
    const menuPage = this.home.root.active || this.settingsFromHome && this.hud.settingsVisible ? this.home.page : undefined;
    this.menuPreview?.update(menuPage,
      this.camera, this.views[0].root, this.race.drivers[0].kart, this.home.advanced);
    if (!menuPage) this.camera.update({ ...this.race.drivers[0].kart, ...this.renderPoses[0] }, Math.min(dt, 0.1));
    this.home.tick?.(dt);
    this.audio.update(this.race, this.muted);
    this.uiTime += dt;
    if (this.uiTime > 0.08) {
      this.hud.update(this.race, input, this.muted);
      this.hud.standings.fontSize = this.race.drivers.length > 4 ? 14 : 18;
      this.hud.standings.lineHeight = this.race.drivers.length > 4 ? 16 : 24;
      if (this.pendingRewards.length && Date.now() >= this.nextRewardAttempt) this.settleRewards();
      if (this.race.phase === 'ready' && !this.hud.staged && !online && !this.home.root.active &&
        !this.roomPanel?.root.active && !this.hud.settingsVisible) this.home.show('home');
      this.refreshHome();
      if (this.home.root.active) this.hud.panel.active = false;
      if (this.roomPanel) this.roomPanel.openButton.node.parent!.active =
        this.race.phase === 'ready' && !this.hud.settingsVisible &&
        (this.home.root.active ? this.home.page === 'home' : !!this.multiplayer?.endpoint);
      if (this.roomPanel) this.roomPanel.openButton.node.parent!.setPosition(
        this.home.root.active ? -160 : 316, this.home.root.active ? -180 : 224,
      );
      if (this.roomPanel) {
        const home = this.home.root.active, label = this.roomPanel.openButton, button = label.node.parent!;
        button.getComponent(UITransform)!.setContentSize(home ? 92 : 152, home ? 92 : 42);
        button.getChildByName('Panel')!.active = !home;
        label.node.setPosition(0, home ? -35 : 0);
        label.string = home ? '好友' : '好友联机';
        label.color = new Color().fromHEX(home ? '#31556a' : '#173b53');
      }
      if (online) {
        this.syncRankedResult(online);
        this.hud.panel.active = this.race.phase === 'finished' && !this.roomPanel?.root.active && !this.hud.settingsVisible;
        this.hud.standings.fontSize = this.race.drivers.length > 4 ? 15 : 18;
        this.hud.standings.lineHeight = this.race.drivers.length > 4 ? 18 : 24;
        if (this.race.phase === 'finished') {
          this.hud.leaderboard.string = online.ranked
            ? this.rankingAfter ? rankedResultText(this.rankingAfter, this.rankingBefore) : this.rankingMessage
            : '好友练习赛\n不计全站或本机纪录';
          this.hud.button.string = '查看房间 →';
          this.hud.footer.string = online.ranked
            ? { practice: '排位赛 · 等待结算', pending: '成绩已进入持久队列 · 等待全站排行榜确认', saved: '成绩已保存至全站榜 · 房间内查看排名并再次挑战', failed: '成绩保存失败 · 请保留房间并联系维护者' }[online.settlement || 'pending']
            : '好友练习赛 · 不进入全站榜或本机纪录 · 房主可再开一场';
          this.hud.title.string = this.race.drivers[0].progress.finishedAt
            ? `第 ${this.race.order.indexOf(0) + 1} 名，冲线！`
            : '比赛结束 · 未完赛';
        }
        if (online.phase === 'loading') this.hud.message.string = '等待所有好友装配赛车…';
        else if (!this.multiplayer!.connected) this.hud.message.string = this.multiplayer!.status || '连接中断，正在重连…';
        else if (this.race.drivers[0].progress.finishedAt && this.race.phase !== 'finished')
          this.hud.message.string = '已完赛，等待其他车手冲线…';
      }
      this.uiTime = 0;
    }
  }
  onDestroy() {
    const platform = platformSharing();
    if (platform) platform.onInvite = undefined;
    if (platform?.onLaunch === this.receiveChallenge) platform.onLaunch = undefined;
    this.multiplayer?.leave();
    this.loadVersion++;
    game.off(Game.EVENT_HIDE, this.hide, this);
    this.controller?.destroy();
    this.home?.dispose();
    this.menuPreview?.dispose();
    if (sys.isBrowser) {
      window.removeEventListener('blur', this.hide);
      (globalThis as typeof globalThis & { KartDisplay?: { setControls(controls: Record<string, () => void>): void } }).KartDisplay?.setControls({});
    }
  }
}
