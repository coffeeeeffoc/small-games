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
} from 'cc';
import { RaceManager } from './RaceManager';
import { buildTheme } from './ThemeView';
import { themes } from './ThemeCatalog';
import { routes, routeRecordKey } from './RouteCatalog';
import {
  cycleSelection,
  defaultSelection,
  readSelection,
  vehicles,
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
import { competition, rankedResultText, type CompetitionBoard, type BoardEntry } from './CompetitionClient';
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
  themeRoot?: Node;
  itemsView?: ItemsView;
  loadVersion = 0;
  seed = Date.now() >>> 0;
  botVehicles: string[] = [];
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
  networkIndexes: number[] = [];
  inputTime = 0;
  renderPoses: { x: number; y: number; z: number; heading: number }[] = [];
  get recordKey() {
    return routeRecordKey(this.selection.route);
  }
  readRouteRecords() {
    try {
      this.records = readRecords(
        sys.localStorage.getItem(this.recordKey),
        this.selection.route === 'seaside' ? sys.localStorage.getItem('coastline-best') : null,
      );
    } catch {
      this.records = [];
    }
    this.hud.records = this.records;
    this.hud.previousBest = this.records[0]?.time;
  }
  choose = (field: keyof Selection, delta: number) => {
    if (this.race.phase !== 'ready' || this.multiplayer?.room) return;
    this.selection = cycleSelection(this.selection, field, delta);
    try {
      sys.localStorage.setItem('kart-selection-v1', JSON.stringify(this.selection));
    } catch {}
    this.loadSelection(false, false);
  };
  loadSelection(autoStart = false, rerollBots = true, room?: RoomState) {
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
    if (room) this.seed = room.seed;
    else this.seed++;
    this.race = new RaceManager(route.track, this.seed, room?.roster.length ?? 4);
    this.renderPoses = [];
    this.race.networked = !!room;
    if (room) this.race.names = this.networkIndexes.map((i) => room.roster[i].name);
    if (autoStart) this.race.start();
    this.race.loaded = false;
    this.sceneryLoaded = false;
    this.accumulator = 0;
    this.camera.initialized = false;
    this.camera.camera.clearColor = new Color().fromHEX(theme.colors.sky);
    this.camera.camera.clearFlags = Camera.ClearFlag.SKYBOX;
    this.camera.height = 3.6;
    this.camera.lookHeight = 1.5;
    this.hud.selection = { ...this.selection };
    this.hud.lastPhase = '';
    this.readRouteRecords();
    if (rerollBots)
      this.botVehicles = this.race.drivers
        .slice(1)
        .map(() => vehicles[Math.floor(Math.random() * vehicles.length)][0]);
    const colors = [palette.red, palette.blue, palette.yellow, palette.mint];
    this.views = this.race.drivers.slice(0, autoStart || room ? undefined : 1).map(
      (_, i) =>
        new KartView(this.themeRoot!, colors[i % colors.length], {
          ...this.selection,
          vehicle: room
            ? room.roster[this.networkIndexes[i]].vehicle
            : i === 0
              ? this.selection.vehicle
              : this.botVehicles[i - 1],
          driver: room ? room.roster[this.networkIndexes[i]].driver : this.selection.driver,
        }),
    );
    this.itemsView = autoStart || room ? new ItemsView(this.themeRoot, this.race.items) : undefined;
    Promise.all([
      buildTheme(this.themeRoot, this.race.track, theme),
      ...this.views.map((v) => v.ready),
      this.itemsView?.ready,
    ])
      .then(() => {
        if (version !== this.loadVersion) return;
        this.race.loaded = true;
        this.sceneryLoaded = true;
        if (!room) this.markPrepared();
        if (room) this.multiplayer?.send({ type: 'loaded', raceId: room.raceId });
      })
      .catch((error: Error) => {
        if (version !== this.loadVersion) return;
        this.race.phase = 'ready';
        this.race.loadError = String(error.message || error).slice(0, 100);
        if (room && this.multiplayer && this.roomPanel) {
          this.multiplayer.status = '赛车素材加载失败，请退出房间后重试';
          this.roomPanel.root.active = true;
          this.roomPanel.refresh();
        }
        console.error('[carding-car] selected assets failed', error);
      });
  }
  start() {
    profiler.hideStats();
    this.node.layer = Layers.Enum.DEFAULT;
    this.camera = new ChaseCamera(this.node);
    this.camera.camera.visibility = Layers.Enum.DEFAULT;
    this.hud = new HUD(this.node);
    this.audio = new AudioFeedback(this.node);
    try {
      this.selection = readSelection(sys.localStorage.getItem('kart-selection-v1'));
      if (sys.localStorage.getItem('kart-driving-coach-v1') === 'done')
        this.hud.coach.enabled = false;
    } catch {}
    const invitation = readInvitation(
      sys.isBrowser
        ? Object.fromEntries(new URLSearchParams(location.search))
        : platformSharing()?.query || {},
    );
    if (invitation) this.selection = invitation.selection;
    this.controller = new KartController(
      () => this.race,
      () => this.restart(),
      () => {
        this.muted = !this.muted;
        this.audio.activate(this.muted);
      },
      () => this.audio.activate(this.muted),
      this.choose,
      () => {
        if (this.multiplayer?.room && this.roomPanel) this.roomPanel.root.active = true;
        else this.loadSelection();
      },
      () =>
        !!this.roomPanel?.root.active || (!!this.multiplayer?.room && !this.multiplayer.connected),
      () => this.loadSelection(true),
      () => {
        if (this.race.networked) {
          this.hud.rulesVisible = !this.hud.rulesVisible;
          return;
        }
        const coach = this.hud.coach;
        coach.enabled = !coach.enabled;
        if (coach.enabled) coach.step = 0;
      },
    );
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
          selection: { ...this.selection },
          loading: !this.race.loaded,
          requestedArt: Array.from(requestedArt),
          loadError: this.race.loadError,
          itemsCollected: this.race.itemsCollected,
          seed: this.seed,
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
  };
  restart() {
    if (this.multiplayer?.room && this.roomPanel) {
      this.roomPanel.root.active = true;
      this.roomPanel.refresh();
      return;
    }
    this.loadSelection(true);
  }
  markPrepared() {
    const client = this.multiplayer,
      room = client?.room;
    if (!room || room.phase !== 'lobby' || !this.race.loaded || this.race.loadError) return;
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
        () => this.selection,
        () => {
          this.controller.clear();
          this.audio.activate(this.muted);
          if (!client.room) this.race.pause();
        },
        () => {
          client.leave();
          this.networkRaceId = 0;
          this.roomPanel!.root.active = false;
          this.loadSelection();
        },
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
          return;
        }
        if (room.raceId === this.networkRaceId) {
          if (this.race.loaded) client.send({ type: 'loaded', raceId: room.raceId });
          return;
        }
        this.networkRaceId = room.raceId;
        this.networkTick = -1;
        const self = room.roster.findIndex((r) => r.id === client.selfId);
        if (self < 0) return;
        this.networkIndexes = [self, ...room.roster.map((_, i) => i).filter((i) => i !== self)];
        this.selection = readSelection(JSON.stringify(room));
        this.roomPanel!.root.active = false;
        this.loadSelection(false, false, room);
      };
      const invite = readInvitation(
        query ? Object.fromEntries(query) : platformSharing()?.query || {},
      );
      if (invite) this.roomPanel.showInvite(invite);
      const platform = platformSharing();
      if (platform)
        platform.onInvite = (query) => {
          const invitation = readInvitation(query);
          if (!invitation || client.room?.code === invitation.code) return;
          this.controller.clear();
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
        this.race.loaded &&
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
      if (this.inputTime >= 0.05 && online.phase === 'racing') {
        this.inputTime = 0;
        this.multiplayer!.send({
          type: 'input',
          raceId: online.raceId,
          seq: ++this.multiplayer!.seq,
          input,
        });
      }
    } else {
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
    if (!online && before !== 'finished' && this.race.phase === 'finished') {
      this.records = addRecord(this.records, {
        time: this.race.time,
        bestLap: this.race.bestLapTime,
        place: this.race.order.indexOf(0) + 1,
      });
      this.hud.records = this.records;
      try {
        sys.localStorage.setItem(this.recordKey, JSON.stringify(this.records));
      } catch {}
    }
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
      v.update({ ...kart, ...pose }, this.race.time);
    });
    this.itemsView?.update(this.race.items, this.race.time);
    this.camera.update({ ...this.race.drivers[0].kart, ...this.renderPoses[0] }, Math.min(dt, 0.1));
    this.audio.update(this.race, this.muted);
    this.uiTime += dt;
    if (this.uiTime > 0.08) {
      this.hud.update(this.race, input, this.muted);
      if (online) {
        this.syncRankedResult(online);
        this.hud.panel.active = this.race.phase === 'finished' && !this.roomPanel?.root.active;
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
    this.multiplayer?.leave();
    this.loadVersion++;
    game.off(Game.EVENT_HIDE, this.hide, this);
    this.controller?.destroy();
    if (sys.isBrowser) window.removeEventListener('blur', this.hide);
  }
}
