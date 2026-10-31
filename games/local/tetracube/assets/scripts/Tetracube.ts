import {
  _decorator,
  AudioClip,
  AudioSource,
  Component,
  EventKeyboard,
  EventMouse,
  EventTouch,
  Game as CocosGame,
  Input,
  KeyCode,
  game,
  input,
  resources,
  sys,
  view,
  VERSION,
} from 'cc';
import { Game, type Cell, type MotionEvent, type Vec } from './core/engine.js';
import { adPolicy, createRewardController, REVIVE_LIMIT } from './core/rewards.js';
import { createSaveStore } from './core/storage.js';
import { C, TetracubeView, type Rect } from './TetracubeView';
import { piecePose, type Turn } from './core/projection.js';
import { LEVELS, CHAPTERS } from './core/campaign.js';
import {
  createRun,
  applyInput,
  advanceTicks,
  checkRun,
  runResult,
  RANKED_RULE_VERSION,
} from './core/session.js';
import { createProgressStore } from './core/progress.js';
const { ccclass } = _decorator;
type Screen =
  | 'home'
  | 'levels'
  | 'playing'
  | 'paused'
  | 'result'
  | 'help'
  | 'reward'
  | 'tools'
  | 'layer'
  | 'settings'
  | 'ranking'
  | 'connecting';
type Recorder = {
  start(value: {
    mode: string;
    levelId?: string;
    practice?: boolean;
  }): Promise<{ seed: number } | null>;
  record(input: Record<string, unknown>, ticks?: number): void;
  finish(): Promise<{ accepted?: boolean } | null>;
  invalidate(reason?: string): void;
};
type RankingRow = {
  rank: number;
  name?: string;
  nickname?: string;
  score: number;
  secondary: number;
  playerId?: string;
};
type RewardKind = 'invert' | 'revive';
type RewardResult = { status: 'completed' | 'dismissed' | 'unavailable' | 'failed' };
type RewardPort = {
  available?: boolean;
  offer(request: { id: string; reward: Record<string, string | number> }): Promise<RewardResult>;
  cancel?(): void;
};
type Dev = {
  isEnabled(): boolean;
  registerSnapshot(fn: () => unknown): () => void;
  registerActions(actions: { id: string; label: string; run(): void }[]): () => void;
};
const platform = globalThis as typeof globalThis & {
  SmallGamesDev?: Dev;
  SmallGamesRewardAds?: RewardPort;
  TetracubeHost?: { ads?: RewardPort };
  SmallGamesServices?: {
    createRecorder(version: string, options: { onStatus(status: string): void }): Recorder;
    refresh(): Promise<unknown>;
    status?: string;
    metadata?: { capabilities?: { leaderboards?: boolean } };
    services: {
      leaderboard(input: { boardId: string }): Promise<{ top: RankingRow[]; me?: RankingRow }>;
    };
  };
  __tetracube?: { snapshot(): unknown };
};
type Press = {
  id: number;
  control: string;
  x: number;
  y: number;
  originX: number;
  originY: number;
  anchor: Vec;
  dx: number;
  dy: number;
  moved: boolean;
  movedAt: number;
};
type Animation = {
  event: MotionEvent;
  dims: Vec;
  board: Cell[];
  elapsed: number;
  duration: number;
};
type Motion = { event: MotionEvent; elapsed: number; duration: number };

@ccclass('Tetracube')
export class Tetracube extends Component {
  ui!: TetracubeView;
  run = createRun('endless', 1);
  state = this.run.game;
  progress!: ReturnType<typeof createProgressStore>;
  chapter = 0;
  reverse = false;
  selectedLayer = -1;
  layerSlice = false;
  recorder: Recorder | null = null;
  runToken = 0;
  rankToken = 0;
  rankBoard = 'campaign';
  rankState = 'idle';
  rankRows: RankingRow[] = [];
  rankMe: RankingRow | undefined;
  recordStatus = 'local';
  settled = false;
  touchPoints = new Map<number, { x: number; y: number }>();
  gesture: { x: number; y: number; distance: number } | null = null;
  multiBlocked = false;
  screen: Screen = 'home';
  returnScreen: Screen = 'home';
  rewardOrigin: Screen = 'playing';
  rewardKind: RewardKind = 'invert';
  store!: ReturnType<typeof createSaveStore>;
  rewards!: ReturnType<typeof createRewardController>;
  runStarted = false;
  practice = false;
  pauseAfterConnect = false;
  tutorialStep = 0;
  best = 0;
  soundEnabled = true;
  reducedMotion = false;
  hidden = false;
  disposed = false;
  time = 0;
  fall = 0;
  lastTouch = -10;
  toast = '';
  toastUntil = 0;
  shift = false;
  rewardWasHidden = false;
  mode = 'move';
  viewName = 'iso';
  press: Press | null = null;
  touches = new Set<number>();
  animations: Animation[] = [];
  motions: Motion[] = [];
  audio!: AudioSource;
  clips: Record<string, AudioClip> = {};
  unregister: (() => void)[] = [];
  waitVisible: ((result: RewardResult) => void) | null = null;
  ready = false;
  accessibility?: HTMLDivElement;
  accessibilityKey = '';
  rewardAttempt = 0;
  safe = { top: 0, right: 0, bottom: 0, left: 0 };
  start() {
    view.enableAutoFullScreen(false);
    view.resizeWithBrowserSize(true);
    this.ui = new TetracubeView(this.node);
    this.audio = this.node.addComponent(AudioSource);
    this.store = createSaveStore({
      getItem: (key: string) => sys.localStorage.getItem(key),
      setItem: (key: string, value: string) => sys.localStorage.setItem(key, value),
    });
    this.progress = createProgressStore({
      getItem: (key: string) => sys.localStorage.getItem(key),
      setItem: (key: string, value: string) => sys.localStorage.setItem(key, value),
    });
    const saved = this.store.read();
    if (saved) {
      this.run = saved.run;
      this.state = saved.game;
      this.runStarted = true;
      this.tutorialStep = saved.tutorialStep;
    }
    this.setupRewards(saved?.revivesUsed || 0);
    try {
      this.best = Math.max(
        0,
        Number(JSON.parse(sys.localStorage.getItem('tetracube.best.v1') || '0')) || 0,
      );
      const s = JSON.parse(sys.localStorage.getItem('tetracube.settings.v1') || '{}');
      this.soundEnabled = s?.sound !== false;
      this.reducedMotion = s?.reducedMotion === true;
    } catch {}
    if (sys.isBrowser) {
      this.reducedMotion ||= window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.addEventListener('blur', this.blur);
      window.addEventListener('pagehide', this.exit);
      document.addEventListener('visibilitychange', this.visibility);
      this.accessibility = document.createElement('div');
      this.accessibility.id = 'tetracube-accessibility';
      this.accessibility.setAttribute('aria-label', '空间俄罗斯方块');
      this.accessibility.style.cssText =
        'position:fixed;left:-10000px;width:1px;height:1px;overflow:hidden';
      document.body.append(this.accessibility);
      platform.__tetracube = { snapshot: () => this.snapshot() };
    }
    for (const name of ['click', 'merge', 'win'])
      resources.load('audio/' + name, AudioClip, (err, clip) => {
        if (!err && !this.disposed) this.clips[name] = clip;
      });
    input.on(Input.EventType.TOUCH_START, this.touchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
    input.on(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
    input.on(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
    input.on(Input.EventType.MOUSE_UP, this.mouseUp, this);
    input.on(Input.EventType.MOUSE_WHEEL, this.mouseWheel, this);
    input.on(Input.EventType.KEY_DOWN, this.keyDown, this);
    input.on(Input.EventType.KEY_UP, this.keyUp, this);
    game.on(CocosGame.EVENT_HIDE, this.suspend, this);
    game.on(CocosGame.EVENT_SHOW, this.resumeVisibility, this);
    view.on('canvas-resize', this.resize, this);
    if (platform.SmallGamesDev) {
      this.unregister.push(platform.SmallGamesDev.registerSnapshot(() => this.snapshot()));
      this.unregister.push(
        platform.SmallGamesDev.registerActions([
          {
            id: 'tetracube-danger',
            label: '试玩：出生区堵塞（不存档）',
            run: () => this.fixture('danger'),
          },
          {
            id: 'tetracube-chain',
            label: '试玩：两层连锁（不存档）',
            run: () => this.fixture('chain'),
          },
        ]),
      );
    }
    this.resize();
    this.display();
    if (!this.store.writable) this.notify('存档读取失败，原存档已保留；本次仍可游玩');
  }
  provider() {
    return platform.TetracubeHost?.ads || platform.SmallGamesRewardAds;
  }
  setupRewards(used = 0) {
    this.rewards?.dispose();
    this.rewards = createRewardController(
      this.state,
      async (kind: RewardKind) => {
        const attempt = this.rewardAttempt,
          port = this.provider();
        if (!adPolicy(port).invertNeedsAd || !port) return { status: 'unavailable' };
        let result: RewardResult;
        try {
          result = await port.offer({
            id: 'tetracube:' + kind,
            reward: kind === 'revive' ? { clearTopLayers: 4 } : { rotateDegrees: 180 },
          });
        } catch {
          return { status: 'failed' };
        }
        if (this.disposed || attempt !== this.rewardAttempt) return { status: 'dismissed' };
        if (result.status === 'completed' && this.hidden)
          result = await new Promise<RewardResult>((resolve) => {
            this.waitVisible = resolve;
          });
        return result;
      },
      used,
    );
  }
  resize = () => {
    if (!this.ui) return;
    this.clearInput();
    this.ui.resize();
    if (sys.isBrowser) {
      const style = getComputedStyle(document.documentElement);
      for (const edge of ['top', 'right', 'bottom', 'left'] as const)
        this.safe[edge] = parseFloat(style.getPropertyValue('--safe-' + edge)) || 0;
    }
    this.render();
  };
  clearInput = () => {
    this.press = null;
    this.ui.pressed = '';
    this.touches.clear();
    this.touchPoints.clear();
    this.gesture = null;
    this.multiBlocked = false;
    this.shift = false;
    this.ui.projection.stopOrbit();
  };
  suspend = () => {
    this.hidden = true;
    if (this.screen === 'reward') this.rewardWasHidden = true;
    this.clearInput();
    this.audio?.stop();
    this.fall = 0;
    if (this.screen === 'playing') this.goto('paused');
    this.persist();
  };
  blur = () => {
    this.clearInput();
    this.fall = 0;
    if (this.screen === 'connecting') this.pauseAfterConnect = true;
    if (this.screen === 'playing') this.goto('paused');
    this.audio?.stop();
    this.persist();
  };
  visibility = () => {
    if (document.hidden) this.suspend();
    else this.resumeVisibility();
  };
  resumeVisibility = () => {
    this.hidden = false;
    this.fall = 0;
    this.waitVisible?.({ status: 'completed' });
    this.waitVisible = null;
  };
  cancelReward() {
    this.rewardAttempt++;
    this.rewards.cancel();
    this.waitVisible?.({ status: 'dismissed' });
    this.waitVisible = null;
    this.provider()?.cancel?.();
  }
  exit = () => {
    this.suspend();
    this.cancelReward();
  };
  goto(screen: Screen) {
    this.clearInput();
    this.screen = screen;
    this.fall = 0;
    this.display();
    this.render();
  }
  display() {
    if (sys.isBrowser && window.parent !== window) {
      try {
        window.parent.postMessage(
          {
            type: 'small-games:display-state',
            gameId: 'tetracube',
            screen:
              ['home', 'levels', 'ranking', 'settings'].includes(this.screen) ||
              (this.screen === 'help' && this.returnScreen === 'home')
                ? 'home'
                : 'playing',
          },
          window.location.origin,
        );
      } catch {}
    }
  }
  persist() {
    if (this.practice || !this.runStarted) return;
    this.store.write(this.state, this.rewards.used, this.tutorialStep, this.run);
  }
  notify(text: string) {
    this.toast = text;
    this.toastUntil = this.time + 3.5;
  }
  sound(name = 'click') {
    if (this.soundEnabled && !this.hidden && this.clips[name])
      this.audio.playOneShot(this.clips[name], 0.35);
  }
  get level() {
    return LEVELS.find((item) => item.id === this.run.levelId);
  }
  async begin(practice = false, mode = 'endless', levelId?: string) {
    if (mode === 'campaign') {
      const level = LEVELS.find((item) => item.id === levelId);
      if (!level || (!practice && !this.progress.unlocked(level.index))) return;
    }
    const token = ++this.runToken;
    this.cancelReward();
    this.recorder?.invalidate();
    this.recorder = null;
    this.pauseAfterConnect = false;
    this.recordStatus = practice ? 'practice' : 'local';
    let seed = Math.floor(Math.random() * 0x100000000);
    const bridge = platform.SmallGamesServices;
    if (!practice && bridge) {
      const recorder = bridge.createRecorder(RANKED_RULE_VERSION, {
        onStatus: (status) => {
          if (token === this.runToken) this.recordStatus = status;
        },
      });
      this.recorder = recorder;
      this.goto('connecting');
      const online = await recorder.start({ mode, levelId });
      if (token !== this.runToken || this.disposed || this.screen !== 'connecting') {
        recorder.invalidate();
        return;
      }
      if (online) seed = online.seed;
    }
    this.practice = practice;
    this.run = createRun(mode, seed, levelId);
    this.state = this.run.game;
    this.setupRewards();
    this.runStarted = true;
    this.settled = false;
    this.animations = [];
    this.motions = [];
    this.mode = 'move';
    this.tutorialStep = 0;
    this.selectedLayer = -1;
    this.toast = '';
    this.layerSlice = false;
    this.reverse = false;
    this.ui.projection.setView('iso');
    this.viewName = 'iso';
    this.goto(this.hidden || this.pauseAfterConnect ? 'paused' : 'playing');
    this.persist();
  }
  async loadRanking() {
    const token = ++this.rankToken,
      board = this.rankBoard;
    this.rankState = 'loading';
    this.rankRows = [];
    this.rankMe = undefined;
    const bridge = platform.SmallGamesServices;
    if (!bridge) {
      this.rankState = 'offline';
      return;
    }
    try {
      await bridge.refresh();
      if (bridge.status === 'offline') {
        if (token === this.rankToken) this.rankState = 'offline';
        return;
      }
      if (!bridge.metadata?.capabilities?.leaderboards) {
        if (token === this.rankToken) this.rankState = 'unavailable';
        return;
      }
      const result = await bridge.services.leaderboard({ boardId: board });
      if (this.disposed || token !== this.rankToken || this.screen !== 'ranking') return;
      this.rankRows = result.top;
      this.rankMe = result.me;
      this.rankState = 'ready';
    } catch {
      if (token === this.rankToken) this.rankState = 'error';
    }
  }
  get animating() {
    return this.animations.length > 0;
  }
  command(action: string, arg?: string | number, direction = 1) {
    if (this.screen !== 'playing' || this.hidden || this.animating || this.rewards.pending) return;
    const dims = [...this.state.dims],
      before = this.state.board.map((c) => ({ ...c }));
    if (this.run.status !== 'playing') return;
    const payload: Record<string, unknown> =
      action === 'move'
        ? { action, axis: Number(arg), direction }
        : action === 'rotate'
          ? { action, plane: String(arg), direction }
          : action === 'flip'
            ? { action, turn: String(arg) }
            : { action };
    const ok = applyInput(this.run, payload);
    if (ok) this.recorder?.record(payload, 0);
    if (ok && this.run.assisted) this.recorder?.invalidate('assisted');
    if (!ok) {
      if (action === 'rotate') this.notify('这个方向被挡住，试试反转或移开');
      return;
    }
    this.consume(dims, before);
    if (action !== 'tick') this.sound(action === 'drop' || action === 'flip' ? 'merge' : 'click');
    if (['move', 'rotate', 'drop', 'flip'][this.tutorialStep] === action) this.tutorialStep++;
    if (action === 'drop' || action === 'flip') this.fall = 0;
    this.persist();
    this.settle();
  }
  consume(dims = [...this.state.dims], board = this.state.board.map((c) => ({ ...c }))) {
    for (const event of this.state.drainEvents()) {
      if (['move', 'rotate', 'fall'].includes(event.type) && !this.reducedMotion)
        this.motions.push({
          event,
          elapsed: 0,
          duration: event.type === 'rotate' ? 0.16 : 0.1,
        });
      else this.motions = [];
      if (['drop', 'flip', 'compact', 'clear', 'revive'].includes(event.type)) {
        if (event.type === 'flip') dims = [...event.beforeDims];
        this.animations.push({
          event,
          dims: [...dims],
          board,
          elapsed: 0,
          duration: this.reducedMotion
            ? 0.06
            : event.type === 'flip'
              ? 0.48
              : event.type === 'drop'
                ? 0.2
                : 0.24,
        });
        if (event.type === 'flip') dims = [...event.afterDims];
      }
      if (['lock', 'flip', 'compact', 'clear', 'revive'].includes(event.type)) board = event.after;
      if (event.type === 'clear') {
        this.notify(
          event.combo > 1
            ? '连锁 ×' + event.combo + '   +' + event.points
            : '整层消除  +' + event.points,
        );
        this.sound('win');
      }
    }
  }
  settle() {
    if (this.animating) return;
    checkRun(this.run);
    if (this.run.status !== 'playing' && this.screen === 'playing') {
      const result = runResult(this.run);
      if (!this.practice && !this.settled) {
        this.settled = true;
        if (this.level && this.run.status === 'won')
          this.progress.complete(this.level.id, {
            stars: result.stars,
            secondary: result.elapsedMs,
          });
        if (this.store.writable && this.state.score > this.best && this.run.mode === 'endless') {
          this.best = this.state.score;
          try {
            sys.localStorage.setItem('tetracube.best.v1', JSON.stringify(this.best));
          } catch {}
        }
        const token = this.runToken;
        void this.recorder?.finish().then((receipt) => {
          if (token !== this.runToken || this.disposed) return;
          if (receipt?.accepted) this.notify('成绩已通过验证，已更新排行榜');
        });
      }
      this.goto('result');
      this.persist();
    }
  }
  askReward(kind: RewardKind) {
    if (this.animating || this.rewards.pending) return;
    if (kind === 'invert' && this.level && this.state.flipCount >= this.level.maxFlips) {
      this.notify('本关的整舱重排次数已用完');
      return;
    }
    if (kind === 'invert' && !adPolicy(this.provider()).invertNeedsAd) {
      this.command('flip', 'invert');
      this.notify('已使用空间重排：本局仅保存本地成绩');
      return;
    }
    if (
      kind === 'revive' &&
      (!adPolicy(this.provider()).showRevive || this.rewards.used >= REVIVE_LIMIT)
    )
      return;
    this.rewardAttempt++;
    this.rewardWasHidden = false;
    this.rewardKind = kind;
    this.rewardOrigin = this.screen;
    this.goto('reward');
  }
  async watch() {
    if (this.screen !== 'reward' || this.rewards.pending) return;
    const controller = this.rewards,
      kind = this.rewardKind,
      attempt = this.rewardAttempt;
    this.notify('准备广告…');
    this.render();
    const result = await controller.request(kind);
    if (
      this.disposed ||
      controller !== this.rewards ||
      this.screen !== 'reward' ||
      attempt !== this.rewardAttempt
    )
      return;
    if (result.applied) {
      this.run.assisted = true;
      this.run.status = 'playing';
      this.recorder?.invalidate('assisted');
      this.settled = false;
      checkRun(this.run);
      this.consume();
      this.persist();
      this.goto('paused');
      this.notify(kind === 'revive' ? '顶部四层已清理，原方块已返回' : '方舱已颠倒，点击继续游戏');
    } else {
      this.goto(
        this.rewardWasHidden && this.rewardOrigin === 'playing' ? 'paused' : this.rewardOrigin,
      );
      this.notify(
        result.status === 'dismissed'
          ? '未完整观看，本次未获得奖励'
          : result.status === 'unavailable'
            ? '暂时没有可用广告，请稍后再试'
            : '广告未完成，本次未获得奖励',
      );
    }
  }
  activate(id: string) {
    if (this.hidden) return;
    this.sound();
    if (id === 'start') return this.begin();
    if (id === 'restart') return this.begin(this.practice, this.run.mode, this.run.levelId);
    if (id === 'levels') {
      this.goto('levels');
      return;
    }
    if (id === 'next-level' && this.level) {
      const next = LEVELS[this.level.index + 1];
      if (next) return this.begin(false, 'campaign', next.id);
      this.goto('levels');
      return;
    }
    if (id.startsWith('level-')) return this.begin(false, 'campaign', id.slice(6));
    if (id === 'chapter-prev' || id === 'chapter-next') {
      this.chapter = Math.max(
        0,
        Math.min(CHAPTERS.length - 1, this.chapter + (id === 'chapter-next' ? 1 : -1)),
      );
      return;
    }
    if (id === 'ranking') {
      this.goto('ranking');
      void this.loadRanking();
      return;
    }
    if (id === 'rank-campaign' || id === 'rank-endless') {
      this.rankBoard = id.slice(5);
      void this.loadRanking();
      return;
    }
    if (id === 'rank-refresh') {
      void this.loadRanking();
      return;
    }
    if (id === 'settings') {
      this.returnScreen = this.screen;
      this.goto('settings');
      return;
    }
    if (id === 'tools') {
      this.goto('tools');
      return;
    }
    if (id === 'layer-open') {
      this.goto('layer');
      return;
    }
    if (id === 'tool-back') {
      this.goto('playing');
      return;
    }
    if (id === 'reverse') {
      this.reverse = !this.reverse;
      return;
    }
    if (id === 'zoom-in' || id === 'zoom-out') {
      this.ui.projection.magnify(id === 'zoom-in' ? 1.2 : 1 / 1.2);
      return;
    }
    if (id === 'fit') {
      this.ui.projection.resetZoom();
      return;
    }
    if (id === 'layer-down' || id === 'layer-up') {
      const current =
        this.selectedLayer < 0
          ? Math.min(...this.state.ghost().map((c) => c[2]), this.state.dims[2] - 1)
          : this.selectedLayer;
      this.selectedLayer = Math.max(
        0,
        Math.min(this.state.dims[2] - 1, current + (id === 'layer-up' ? 1 : -1)),
      );
      return;
    }
    if (id === 'layer-slice') {
      this.layerSlice = !this.layerSlice;
      return;
    }
    if (id === 'layer-auto') {
      this.selectedLayer = -1;
      this.layerSlice = false;
      return;
    }
    if (id === 'finish-run') {
      this.goto('playing');
      this.command('end');
      return;
    }
    if (id === 'continue') {
      this.goto(this.run.status === 'playing' ? 'playing' : 'result');
      return;
    }
    if (id === 'pause') {
      this.persist();
      this.goto('paused');
      return;
    }
    if (id === 'resume') {
      this.goto(this.run.status === 'playing' ? 'playing' : 'result');
      return;
    }
    if (id === 'home') {
      if (this.screen === 'connecting') {
        this.runToken++;
        this.recorder?.invalidate();
      }
      this.rankToken++;
      this.cancelReward();
      this.persist();
      this.goto('home');
      return;
    }
    if (id === 'help') {
      this.returnScreen = this.screen;
      this.goto('help');
      return;
    }
    if (id === 'back') {
      this.goto(this.returnScreen);
      return;
    }
    if (id === 'sound' || id === 'motion') {
      if (id === 'sound') this.soundEnabled = !this.soundEnabled;
      else this.reducedMotion = !this.reducedMotion;
      if (this.reducedMotion) {
        this.motions = [];
        this.ui.projection.stopOrbit();
      }
      try {
        sys.localStorage.setItem(
          'tetracube.settings.v1',
          JSON.stringify({ sound: this.soundEnabled, reducedMotion: this.reducedMotion }),
        );
      } catch {}
      return;
    }
    if (id === 'cancel') {
      this.cancelReward();
      this.goto(this.rewardOrigin);
      return;
    }
    if (id === 'watch') {
      void this.watch();
      return;
    }
    if (id === 'invert') {
      if (this.screen === 'tools') this.goto('playing');
      this.askReward('invert');
      return;
    }
    if (id === 'revive') {
      this.askReward('revive');
      return;
    }
    if (id === 'retry-assets') {
      this.ui.load();
      return;
    }
    if (id.startsWith('view-')) {
      this.viewName = id.slice(5);
      this.ui.projection.setView(this.viewName);
      return;
    }
    if (id === 'move' || id === 'observe' || id === 'pan') {
      this.mode = id;
      this.ui.projection.stopOrbit();
      if (this.screen === 'tools') this.goto('playing');
      return;
    }
    if (id.startsWith('rotate-')) {
      const [, plane, sign] = id.split('-');
      this.command('rotate', plane, sign === 'minus' ? -1 : 1);
      return;
    }
    if (id === 'left' || id === 'right') {
      if (this.screen === 'tools') this.goto('playing');
      this.command('flip', id);
      return;
    }
    if (id === 'drop' || id === 'hold') this.command(id);
  }
  point(event: EventTouch | EventMouse) {
    const p = event.getUILocation();
    return { x: p.x, y: this.ui.h - p.y };
  }
  pressStart(id: number, x: number, y: number) {
    if (this.press || this.hidden) return;
    this.ui.projection.stopOrbit();
    const hit = this.ui.at(x, y);
    const r = this.layout().scene;
    if (!hit && (this.screen !== 'playing' || x < r.x || y < r.y || x > r.x + r.w || y > r.y + r.h))
      return;
    this.press = {
      id,
      control: hit?.id || '',
      x,
      y,
      originX: x,
      originY: y,
      anchor: this.state.active?.pos.slice() || [0, 0, 0],
      dx: 0,
      dy: 0,
      moved: false,
      movedAt: this.time,
    };
    this.ui.pressed = hit?.id || '';
  }
  pressMove(id: number, x: number, y: number) {
    const p = this.press;
    if (!p || id !== p.id) return;
    const dx = x - p.x,
      dy = y - p.y;
    p.x = x;
    p.y = y;
    p.moved ||= Math.hypot(x - p.originX, y - p.originY) > 8;
    if (p.control) {
      if (this.ui.at(x, y)?.id !== p.control) this.ui.pressed = '';
      return;
    }
    if (this.screen !== 'playing' || this.hidden) return;
    if (this.mode === 'observe') {
      this.ui.projection.orbit(dx, dy, this.time - p.movedAt);
      p.movedAt = this.time;
      if (this.reducedMotion) this.ui.projection.stopOrbit();
      this.viewName = 'free';
      return;
    }
    if (this.mode === 'pan') {
      this.ui.projection.shiftView(dx, dy);
      return;
    }
    if (this.animating) return;
    const delta = this.ui.projection.planeDelta(dx, dy, p.anchor);
    p.dx += delta.x;
    p.dy += delta.y;
    for (const [axis, field] of [
      [0, 'dx'],
      [1, 'dy'],
    ] as const) {
      let limit = 8;
      while (Math.abs(p[field]) >= 0.7 && limit-- > 0) {
        const sign = Math.sign(p[field]);
        this.command('move', axis, sign);
        p[field] -= sign;
      }
    }
  }
  pressEnd(id: number, x: number, y: number) {
    const p = this.press;
    if (!p || p.id !== id) return;
    this.press = null;
    this.ui.pressed = '';
    if (p.control || this.time - p.movedAt > 0.08) this.ui.projection.stopOrbit();
    if (p.control && !p.moved && this.ui.at(x, y)?.id === p.control) this.activate(p.control);
  }
  gestureState() {
    const points = Array.from(this.touchPoints.values());
    if (points.length !== 2) return null;
    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
      distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
    };
  }
  touchStart(e: EventTouch) {
    const id = e.getID();
    if (id === null) return;
    this.lastTouch = this.time;
    const p = this.point(e);
    const wasBlocked = this.multiBlocked;
    this.touches.add(id);
    this.touchPoints.set(id, p);
    if (this.touches.size > 1) {
      this.press = null;
      this.ui.pressed = '';
      this.ui.projection.stopOrbit();
      this.multiBlocked = true;
      const r = this.layout().scene;
      this.gesture =
        !wasBlocked &&
        this.touches.size === 2 &&
        this.screen === 'playing' &&
        Array.from(this.touchPoints.values()).every(
          (v) => v.x >= r.x && v.x <= r.x + r.w && v.y >= r.y && v.y <= r.y + r.h,
        )
          ? this.gestureState()
          : null;
      return;
    }
    if (!this.multiBlocked) this.pressStart(id, p.x, p.y);
  }
  touchMove(e: EventTouch) {
    const id = e.getID();
    if (id === null || !this.touches.has(id)) return;
    const p = this.point(e);
    this.touchPoints.set(id, p);
    if (this.gesture && this.touches.size === 2 && this.screen === 'playing') {
      const next = this.gestureState()!,
        r = this.layout().scene;
      if (this.gesture.distance > 4 && next.distance > 4)
        this.ui.projection.magnify(
          next.distance / this.gesture.distance,
          { x: this.gesture.x - r.x, y: this.gesture.y - r.y },
          { x: next.x - r.x, y: next.y - r.y },
        );
      this.gesture = next;
      return;
    }
    if (this.touches.size === 1 && !this.multiBlocked) this.pressMove(id, p.x, p.y);
  }
  touchEnd(e: EventTouch) {
    const id = e.getID();
    if (id === null) return;
    const p = this.point(e);
    if (!this.multiBlocked) this.pressEnd(id, p.x, p.y);
    this.touches.delete(id);
    this.touchPoints.delete(id);
    this.gesture = null;
    if (!this.touches.size) this.multiBlocked = false;
  }
  touchCancel(e: EventTouch) {
    const id = e.getID();
    if (id !== null) {
      this.touches.delete(id);
      this.touchPoints.delete(id);
    }
    this.press = null;
    this.gesture = null;
    this.multiBlocked = this.touches.size > 0;
    this.ui.pressed = '';
    this.ui.projection.stopOrbit();
  }
  mouseWheel(e: EventMouse) {
    if (this.screen !== 'playing' || this.hidden) return;
    const q = this.point(e),
      r = this.layout().scene;
    if (q.x < r.x || q.x > r.x + r.w || q.y < r.y || q.y > r.y + r.h) return;
    this.ui.projection.magnify(Math.exp(Math.max(-0.25, Math.min(0.25, e.getScrollY() * 0.001))), {
      x: q.x - r.x,
      y: q.y - r.y,
    });
  }
  mouseDown(e: EventMouse) {
    if (this.time - this.lastTouch < 0.6 || e.getButton() !== 0) return;
    const p = this.point(e);
    this.pressStart(-1, p.x, p.y);
  }
  mouseMove(e: EventMouse) {
    const p = this.point(e);
    this.pressMove(-1, p.x, p.y);
  }
  mouseUp(e: EventMouse) {
    const p = this.point(e);
    this.pressEnd(-1, p.x, p.y);
  }
  keyDown(e: EventKeyboard) {
    if (e.keyCode === KeyCode.SHIFT_LEFT || e.keyCode === KeyCode.SHIFT_RIGHT) {
      this.shift = true;
      return;
    }
    if (e.keyCode === KeyCode.ESCAPE || e.keyCode === KeyCode.KEY_P) {
      if (this.screen === 'playing') this.activate('pause');
      else if (this.screen === 'paused') this.activate('resume');
      return;
    }
    if (this.screen !== 'playing') return;
    if (e.keyCode === KeyCode.SPACE) {
      this.command('drop');
      return;
    }
    if (e.keyCode === KeyCode.KEY_C) {
      this.command('hold');
      return;
    }
    if (e.keyCode === KeyCode.KEY_G) {
      this.askReward('invert');
      return;
    }
    const plane = (
      { [KeyCode.KEY_Q]: 'XY', [KeyCode.KEY_E]: 'XZ', [KeyCode.KEY_R]: 'YZ' } as Record<
        number,
        string
      >
    )[e.keyCode];
    if (plane) {
      this.command('rotate', plane, this.shift ? -1 : 1);
      return;
    }
    const move = (
      {
        [KeyCode.ARROW_LEFT]: [-1, 0],
        [KeyCode.ARROW_RIGHT]: [1, 0],
        [KeyCode.ARROW_UP]: [0, -1],
        [KeyCode.ARROW_DOWN]: [0, 1],
        [KeyCode.KEY_A]: [-1, 0],
        [KeyCode.KEY_D]: [1, 0],
        [KeyCode.KEY_W]: [0, -1],
        [KeyCode.KEY_S]: [0, 1],
      } as Record<number, number[]>
    )[e.keyCode];
    if (move) {
      const delta = this.ui.projection.planeDelta(
        move[0] * 24,
        move[1] * 24,
        this.state.active?.pos,
      );
      const axis = Math.abs(delta.x) > Math.abs(delta.y) ? 0 : 1;
      const direction = Math.sign(axis === 0 ? delta.x : delta.y);
      if (direction) this.command('move', axis, direction);
    }
  }
  keyUp(e: EventKeyboard) {
    if (e.keyCode === KeyCode.SHIFT_LEFT || e.keyCode === KeyCode.SHIFT_RIGHT) this.shift = false;
  }
  layout() {
    const u = this.ui,
      s = this.safe,
      land = u.w > u.h * 1.15,
      m = 10;
    const x = s.left + m,
      y = s.top + m,
      w = u.w - s.left - s.right - m * 2,
      h = u.h - s.top - s.bottom - m * 2;
    const cw = land ? Math.min(310, w * 0.39) : Math.min(540, w),
      cx = land ? x + w - cw : x + (w - cw) / 2;
    const controls: Rect = { x: cx, y: land ? y + 94 : y + h - 155, w: cw, h: 155 };
    const scene: Rect = land
      ? { x, y: y + 68, w: w - cw - 12, h: h - 72 }
      : { x, y: y + 116, w, h: Math.max(120, controls.y - y - 170) };
    return { land, x, y, w, h, scene, controls };
  }
  render() {
    if (!this.ui || this.disposed) return;
    const u = this.ui,
      l = this.layout();
    u.begin();
    u.background(
      this.screen === 'home' || (this.screen === 'help' && this.returnScreen === 'home'),
    );
    if (!u.ready) {
      u.text('loading', u.error || '正在连接空间俄罗斯方块…', u.w / 2, u.h / 2, 20, u.w - 30);
      if (u.error) u.button('retry-assets', '重新加载', u.w / 2 - 80, u.h / 2 + 35, 160);
      u.end();
      return;
    }
    if (!this.ready) {
      this.ready = true;
      if (sys.isBrowser) {
        document.body.dataset.tetracubeReady = 'true';
        document.getElementById('tetracube-loading')?.remove();
      }
    }
    if (this.screen === 'home') this.home(l);
    else if (this.screen === 'levels') this.levels(l);
    else if (this.screen === 'ranking') this.ranking(l);
    else if (this.screen === 'settings') this.settings(l);
    else if (this.screen === 'help' && this.returnScreen === 'home') {
      this.home(l);
      this.overlay();
    } else if (this.screen === 'connecting') {
      u.text('connect-title', '准备挑战', u.w / 2, u.h / 2 - 25, 28, l.w);
      u.text(
        'connect-copy',
        '正在连接排行榜，稍后即可开始',
        u.w / 2,
        u.h / 2 + 15,
        14,
        l.w,
        C.muted,
      );
      u.button('home', '返回首页', u.w / 2 - 100, u.h / 2 + 65, 200);
    } else {
      this.playfield(l);
      if (this.screen !== 'playing') this.overlay();
    }
    if (this.toast && this.time < this.toastUntil && this.screen === 'playing') {
      const w = Math.min(u.w - 20, 460);
      u.panel((u.w - w) / 2, this.safe.top + 65, w, 44, '#0e1e38ee', '#789dbb', 10, 5);
      u.text('toast', this.toast, u.w / 2, this.safe.top + 87, 13, w - 12, C.text, 6, 38);
    }
    if (this.practice)
      u.text(
        'practice',
        '开发试玩 · 不保存',
        u.w / 2,
        u.h - this.safe.bottom - 8,
        10,
        180,
        C.amber,
        6,
      );
    u.end();
    this.accessible();
  }
  pageTitle(title: string, l: ReturnType<Tetracube['layout']>, back = 'home') {
    const u = this.ui;
    u.button(back, '‹', l.x, l.y, 44, 44);
    u.text('page-title', title, l.x + l.w / 2, l.y + 22, 25, l.w - 110);
    u.line({ x: l.x, y: l.y + 56 }, { x: l.x + l.w, y: l.y + 56 }, '#24415a', 1, 3);
  }
  home(l: ReturnType<Tetracube['layout']>) {
    const u = this.ui,
      menuW = l.land ? Math.min(350, l.w * 0.46) : Math.min(370, l.w),
      x = l.land ? l.x + l.w - menuW : l.x + (l.w - menuW) / 2;
    const center = x + menuW / 2;
    const titleX = l.land ? l.x + (l.w - menuW) / 2 : u.w / 2;
    u.text(
      'title',
      '空间俄罗斯方块',
      titleX,
      l.y + (l.land ? 40 : 45),
      Math.min(33, l.w / 10),
      l.land ? l.w - menuW : l.w,
      C.text,
    );
    u.text(
      'subtitle',
      '立体堆叠 · 旋转消层',
      titleX,
      l.y + (l.land ? 74 : 80),
      13,
      l.land ? l.w - menuW : l.w,
      C.mint,
    );
    const footer = l.y + l.h - 48;
    const cardsY = l.land ? l.y + 24 : footer - (this.runStarted ? 258 : 206);
    const hero = l.land
      ? { x: l.x, y: l.y + 94, w: l.w - menuW - 14, h: l.h - 108 }
      : { x: l.x, y: l.y + 100, w: l.w, h: Math.max(90, cardsY - l.y - 108) };
    u.hero(hero);
    let row = cardsY;
    if (this.runStarted) {
      u.button(
        'continue',
        this.run.status === 'playing' ? '继续上次对局' : '查看上次成绩',
        x,
        row,
        menuW,
        44,
        'mint',
      );
      row += 52;
    }
    const card = (
      id: string,
      title: string,
      caption: string,
      metric: string,
      tone: string,
      yy: number,
    ) => {
      u.button(id, '', x, yy, menuW, 88, tone);
      u.mini(
        id,
        id === 'levels'
          ? [
              [0, 0, 0],
              [1, 0, 0],
              [1, 0, 1],
              [1, 1, 0],
            ]
          : [
              [0, 0, 0],
              [1, 0, 0],
              [2, 0, 0],
              [2, 0, 1],
            ],
        id === 'levels' ? C.amber : '#75cde8',
        x + 38,
        yy + 43,
        13,
      );
      u.text(
        id + '-title',
        title,
        x + menuW * 0.57,
        yy + 23,
        21,
        menuW - 80,
        id === 'levels' ? C.ink : C.text,
      );
      u.text(
        id + '-caption',
        caption,
        x + menuW * 0.57,
        yy + 47,
        11,
        menuW - 70,
        id === 'levels' ? '#56391c' : C.muted,
      );
      u.text(
        id + '-metric',
        metric,
        x + menuW * 0.57,
        yy + 68,
        12,
        menuW - 70,
        id === 'levels' ? '#56391c' : C.mint,
      );
      u.controls[u.controls.length - 1].label = title;
    };
    card(
      'levels',
      '关卡挑战',
      '观察空间，完成消层挑战',
      Object.keys(this.progress.levels).length + ' / ' + LEVELS.length + ' 关',
      'amber',
      row,
    );
    card('start', '经典积分', '自由堆叠，挑战更高得分', '最高得分  ' + this.best, 'blue', row + 98);
    const bw = (menuW - 16) / 3;
    for (const [i, [id, label]] of [
      ['ranking', '排行榜'],
      ['help', '玩法'],
      ['settings', '设置'],
    ].entries())
      u.button(id, label, x + i * (bw + 8), l.land ? Math.min(footer, row + 202) : footer, bw, 44);
  }
  levels(l: ReturnType<Tetracube['layout']>) {
    const u = this.ui;
    this.pageTitle('关卡挑战', l);
    u.text('chapter', CHAPTERS[this.chapter], u.w / 2, l.y + 80, 20, l.w, C.mint);
    const cols = l.land ? 3 : 2,
      rows = l.land ? 2 : 3,
      gap = 10,
      cw = (l.w - gap * (cols - 1)) / cols;
    const top = l.y + (l.land ? 102 : 110),
      footer = l.y + l.h - 44,
      ch = (footer - top - 20 - gap * (rows - 1)) / rows;
    for (const level of LEVELS.slice(this.chapter * 6, this.chapter * 6 + 6)) {
      const i = level.index % 6,
        x = l.x + (i % cols) * (cw + gap),
        y = top + Math.floor(i / cols) * (ch + gap),
        entry = this.progress.levels[level.id];
      const unlocked = this.progress.unlocked(level.index);
      u.button('level-' + level.id, '', x, y, cw, ch, unlocked ? 'blue' : 'blue', !unlocked);
      u.text(
        'level-number-' + i,
        String(level.index + 1).padStart(2, '0'),
        x + 24,
        y + 20,
        20,
        40,
        unlocked ? C.text : C.muted,
      );
      u.text(
        'level-stars-' + i,
        entry
          ? '★'.repeat(entry.stars) + '☆'.repeat(3 - entry.stars)
          : unlocked
            ? '新挑战'
            : '未解锁',
        x + cw - 47,
        y + 20,
        12,
        84,
        entry ? C.amber : C.muted,
      );
      u.mini(
        'level-mini-' + i,
        level.target,
        unlocked ? ['#62cbe4', '#e8bd7e', '#aa97e2'][this.chapter] : '#46566d',
        x + cw / 2,
        y + ch * 0.49,
        Math.min(18, ch * 0.15),
      );
      u.text(
        'level-name-' + i,
        level.name,
        x + cw / 2,
        y + ch - 35,
        Math.min(15, cw / 9),
        cw - 12,
        unlocked ? C.text : C.muted,
      );
      u.text(
        'level-goal-' + i,
        level.targetLines +
          ' 层 · ' +
          level.dims[0] +
          '×' +
          level.dims[1] +
          ' · ' +
          level.pieceLimit +
          ' 块',
        x + cw / 2,
        y + ch - 17,
        11,
        cw - 10,
        C.muted,
      );
      u.controls[u.controls.length - 1].label = '第' + (level.index + 1) + '关 ' + level.name;
    }
    u.button('chapter-prev', '‹ 上一章', l.x, footer, 110, 44, 'blue', this.chapter === 0);
    u.text(
      'chapter-index',
      '第 ' + (this.chapter + 1) + ' / ' + CHAPTERS.length + ' 章',
      u.w / 2,
      footer + 22,
      13,
      105,
      C.muted,
    );
    u.button(
      'chapter-next',
      '下一章 ›',
      l.x + l.w - 110,
      footer,
      110,
      44,
      'blue',
      this.chapter === CHAPTERS.length - 1,
    );
  }
  ranking(l: ReturnType<Tetracube['layout']>) {
    const u = this.ui;
    this.pageTitle('排行榜', l);
    const w = Math.min(600, l.w),
      x = l.x + (l.w - w) / 2,
      bw = (w - 8) / 2;
    u.button(
      'rank-campaign',
      '关卡榜',
      x,
      l.y + 70,
      bw,
      44,
      this.rankBoard === 'campaign' ? 'amber' : 'blue',
    );
    u.button(
      'rank-endless',
      '积分榜',
      x + bw + 8,
      l.y + 70,
      bw,
      44,
      this.rankBoard === 'endless' ? 'amber' : 'blue',
    );
    u.text(
      'rank-rule',
      this.rankBoard === 'campaign'
        ? '最高验证通关优先，同关步数更少优先'
        : '单局积分优先，同分步数更少优先',
      u.w / 2,
      l.y + 137,
      13,
      w,
      C.muted,
    );
    const top = l.y + 158,
      footer = l.y + l.h - 48;
    const compact = footer - top < 220;
    if (this.rankState === 'ready' && this.rankRows.length) {
      const count = Math.max(1, Math.min(8, Math.floor((footer - top - 64) / 46)));
      this.rankRows.slice(0, count).forEach((row, i) => {
        const yy = top + i * 46;
        u.panel(x, yy, w, 40, i % 2 ? '#0b2135' : '#102a40', '', 6);
        u.text(
          'rank-no-' + i,
          String(row.rank),
          x + 24,
          yy + 20,
          18,
          40,
          i < 3 ? C.amber : C.muted,
        );
        u.text(
          'rank-name-' + i,
          (row.name || row.nickname || '玩家').slice(0, 12),
          x + w * 0.38,
          yy + 20,
          14,
          w * 0.43,
        );
        u.text(
          'rank-score-' + i,
          row.score +
            (this.rankBoard === 'campaign' ? ' 关' : ' 分') +
            ' · ' +
            row.secondary +
            ' 步',
          x + w * 0.8,
          yy + 20,
          12,
          w * 0.37,
          C.mint,
        );
      });
    } else {
      const title =
        this.rankState === 'loading'
          ? '正在读取排行榜…'
          : this.rankState === 'ready'
            ? '还没有上榜成绩'
            : this.rankState === 'offline'
              ? '当前为离线模式'
              : this.rankState === 'unavailable'
                ? '排行榜暂未启用'
                : '暂时无法连接排行榜';
      u.mini(
        'rank-empty',
        [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        C.amber,
        u.w / 2,
        top + (compact ? 30 : 60),
        compact ? 18 : 24,
      );
      u.text('rank-empty-title', title, u.w / 2, top + (compact ? 77 : 126), compact ? 17 : 19, w);
      u.text(
        'rank-empty-copy',
        this.rankState === 'ready'
          ? '完成一次公平挑战，留下你的成绩'
          : '本地挑战和存档仍可正常使用',
        u.w / 2,
        top + (compact ? 103 : 162),
        13,
        w,
        C.muted,
      );
    }
    u.text(
      'my-rank',
      this.rankMe
        ? '我的名次 ' +
            this.rankMe.rank +
            ' · ' +
            this.rankMe.score +
            (this.rankBoard === 'campaign' ? ' 关' : ' 分')
        : '我的成绩：尚未入榜',
      u.w / 2,
      footer - 30,
      13,
      w,
      C.amber,
    );
    u.button('rank-refresh', '刷新排行榜', x, footer, w, 44, 'blue', this.rankState === 'loading');
  }
  settings(l: ReturnType<Tetracube['layout']>) {
    const u = this.ui;
    this.pageTitle('设置', l, 'back');
    const w = Math.min(360, l.w),
      x = (u.w - w) / 2,
      y = l.y + 100;
    u.button('sound', this.soundEnabled ? '音效：开' : '音效：关', x, y, w, 52, 'blue');
    u.button(
      'motion',
      this.reducedMotion ? '动态效果：简化' : '动态效果：完整',
      x,
      y + 66,
      w,
      52,
      'blue',
    );
    u.text(
      'settings-copy',
      '音效与动态设置保存在当前设备。\n缩放与观察不会改变方块的位置。',
      u.w / 2,
      y + 164,
      14,
      w,
      C.muted,
      4,
      54,
    );
  }
  playfield(l: ReturnType<Tetracube['layout']>) {
    const u = this.ui,
      { x, y, scene, controls: r } = l,
      fieldW = l.land ? scene.w : l.w;
    u.text(
      'run-title',
      this.level
        ? '第 ' + String(this.level.index + 1).padStart(2, '0') + ' 关 · ' + this.level.name
        : '经典积分',
      x + fieldW / 2 - 15,
      y + 15,
      17,
      fieldW - 62,
    );
    u.pause(x + fieldW - 44, y);
    u.text('score', '得分 ' + this.state.score, x + 70, y + 48, 17, 140, C.amber);
    u.text(
      'lines',
      this.level
        ? this.state.lines +
            '/' +
            this.level.targetLines +
            '层 · 余' +
            Math.max(0, this.level.pieceLimit - this.state.placed) +
            '块'
        : '已消除 ' + this.state.lines + ' 层',
      x + fieldW - 80,
      y + 48,
      15,
      145,
      C.mint,
    );
    const previewX = l.land ? r.x : x,
      previewY = l.land ? y : y + 70,
      previewW = l.land ? r.w : fieldW;
    const pw = (previewW - 16) / 3;
    this.state.next.slice(0, 3).forEach((next, i) => {
      const px = previewX + i * (pw + 8);
      u.panel(px, previewY, pw, 40, '#0d273d', '#284b65', 7);
      u.text(
        'next-label-' + i,
        i === 0 ? '下一块' : String(i + 1),
        px + 19,
        previewY + 20,
        10,
        36,
        C.muted,
      );
      u.mini('next-' + i, next.cells, next.color, px + pw * 0.65, previewY + 20, 9);
    });
    let dims = this.state.dims,
      board = this.state.board,
      active = this.state.cells(),
      ghost = this.state.ghost(),
      flip = null;
    let activeTurn: Turn | null = null;
    const a = this.animations[0];
    if (a) {
      const e = a.event,
        t = Math.min(1, a.elapsed / a.duration),
        ease = t * t * (3 - 2 * t);
      active = [];
      ghost = [];
      dims = a.dims;
      if (e.type === 'flip') {
        board = e.before;
        flip = { axis: e.axis, angle: e.angle * ease };
      } else if (e.type === 'drop') {
        board = a.board;
        active = e.from.map((v, i) => v.map((n, k) => n + (e.to[i][k] - n) * ease));
      } else if (e.type === 'compact') {
        const start = new Map(e.before.map((c) => [c.id, c]));
        board = e.after.map((c) => {
          const b = start.get(c.id) || c;
          return {
            ...c,
            x: b.x + (c.x - b.x) * ease,
            y: b.y + (c.y - b.y) * ease,
            z: b.z + (c.z - b.z) * t * t,
          };
        });
      } else {
        const removed = new Set(e.removed.map((c) => c.id));
        board = e.before.map((c) =>
          removed.has(c.id) ? { ...c, scale: 1 - t, color: t < 0.3 ? '#e6fff5' : c.color } : c,
        );
      }
    } else if (this.motions.length) {
      const motion = this.motions[0];
      const pose = piecePose(motion.event, motion.elapsed / motion.duration);
      active = pose.cells;
      activeTurn = pose.rotation;
    }
    u.world(
      scene,
      dims,
      board,
      active,
      this.state.active?.color || C.amber,
      ghost,
      flip,
      activeTurn,
      this.selectedLayer < 0
        ? Math.max(0, Math.min(...ghost.map((c) => c[2]), dims[2] - 1))
        : Math.min(this.selectedLayer, dims[2] - 1),
      this.layerSlice,
    );
    const disabled = this.animating || this.screen !== 'playing';
    const layer =
      this.selectedLayer < 0
        ? Math.max(0, Math.min(...this.state.ghost().map((c) => c[2]), this.state.dims[2] - 1))
        : Math.min(this.selectedLayer, this.state.dims[2] - 1);
    const ly = l.land ? Math.min(l.y + l.h - 50, r.y + r.h + 12) : r.y - 49;
    u.panel(r.x, ly, r.w, 44, '#0c263c', '#284b65', 7);
    u.button('layer-down', '−', r.x, ly, 44, 44, 'blue', this.screen !== 'playing');
    u.button('layer-up', '＋', r.x + r.w - 44, ly, 44, 44, 'blue', this.screen !== 'playing');
    u.button('layer-open', '', r.x + 50, ly, r.w - 100, 44, 'blue', this.screen !== 'playing');
    const occupied = this.state.board.filter((c) => c.z === layer),
      area = this.state.dims[0] * this.state.dims[1];
    u.text(
      'layer-info',
      '第 ' + (layer + 1) + ' 层 · ' + occupied.length + '/' + area + ' ›',
      r.x + r.w * 0.48,
      ly + 13,
      12,
      r.w - 140,
      C.amber,
    );
    const mw = Math.min(50, (r.w - 110) * 0.27),
      cell = Math.min(5, mw / this.state.dims[0]),
      gx = r.x + r.w / 2 - (this.state.dims[0] * cell) / 2,
      gy = ly + 23;
    const cells = new Map(occupied.map((c) => [c.x + ',' + c.y, c.color]));
    for (let yy = 0; yy < this.state.dims[1]; yy++)
      for (let xx = 0; xx < this.state.dims[0]; xx++)
        u.panel(
          gx + xx * cell,
          gy + yy * cell * 0.45,
          cell - 0.5,
          cell * 0.45 - 0.3,
          cells.get(xx + ',' + yy) || '#1b3c52',
          '',
          0,
        );
    const gap = 6,
      bw = (r.w - gap * 3) / 4;
    for (const [i, plane] of ['XY', 'XZ', 'YZ'].entries())
      u.button(
        'rotate-' + plane + (this.reverse ? '-minus' : '-plus'),
        ['↻ 平转', '↻ 前后', '↻ 左右'][i],
        r.x + i * (bw + gap),
        r.y,
        bw,
        48,
        'blue',
        disabled,
      );
    u.button(
      'reverse',
      this.reverse ? '反向 ✓' : '反向',
      r.x + 3 * (bw + gap),
      r.y,
      bw,
      48,
      this.reverse ? 'mint' : 'blue',
      disabled,
    );
    const small = (r.w - 12) * 0.24;
    u.button(
      'hold',
      this.state.held ? '换入' : '暂存',
      r.x,
      r.y + 56,
      small,
      48,
      'blue',
      disabled || this.state.holdUsed,
    );
    if (this.state.held)
      u.mini('held', this.state.held.cells, this.state.held.color, r.x + small - 14, r.y + 65, 4);
    u.button('tools', '工具', r.x + small + 6, r.y + 56, small, 48, 'blue', disabled);
    u.button(
      'drop',
      '↓ 直接落下',
      r.x + 2 * (small + 6),
      r.y + 56,
      r.w - 2 * (small + 6),
      48,
      'amber',
      disabled,
    );
    const modeLabel = this.mode === 'observe' ? '观察' : this.mode === 'pan' ? '平移' : '移动';
    u.button(
      this.mode === 'move' ? 'observe' : 'move',
      modeLabel,
      r.x,
      r.y + 111,
      62,
      44,
      this.mode === 'move' ? 'blue' : 'mint',
      this.screen !== 'playing',
    );
    u.button('zoom-out', '−', r.x + 68, r.y + 111, 44, 44, 'blue', this.screen !== 'playing');
    u.button(
      'fit',
      Math.round(u.projection.zoom * 100) + '%',
      r.x + 118,
      r.y + 111,
      62,
      44,
      'blue',
      this.screen !== 'playing',
    );
    u.button('zoom-in', '＋', r.x + 186, r.y + 111, 44, 44, 'blue', this.screen !== 'playing');
    if (r.w > 290)
      u.text(
        'gesture-guide',
        this.mode === 'move' ? '拖动方块' : '跟手观察',
        r.x + (230 + r.w) / 2,
        r.y + 132,
        10,
        r.w - 236,
        C.muted,
      );
    if (l.land)
      u.text(
        'game-hint',
        this.level ? this.level.hint : '填满水平层，消层获得连锁',
        r.x + r.w / 2,
        l.y + 65,
        11,
        r.w,
        C.muted,
        4,
        30,
      );
  }
  overlay() {
    const u = this.ui;
    u.controls = [];
    u.panel(0, 0, u.w, u.h, '#05091bba', '', 0, 5);
    const wide = u.w > u.h * 1.15;
    const w = Math.min(
        this.screen === 'help' && wide ? 660 : 370,
        u.w - this.safe.left - this.safe.right - 24,
      ),
      h = Math.min(this.screen === 'help' ? 520 : 420, u.h - this.safe.top - this.safe.bottom - 24),
      x = (u.w - w) / 2,
      y = this.safe.top + (u.h - this.safe.top - this.safe.bottom - h) / 2;
    u.panel(x, y, w, h, '#101c35f8', '#6a92bc', 18, 5);
    const title =
      this.screen === 'paused'
        ? '暂停'
        : this.screen === 'result'
          ? this.run.status === 'won'
            ? '挑战完成'
            : this.level
              ? '挑战结束'
              : '本局结束'
          : this.screen === 'reward'
            ? this.rewardKind === 'revive'
              ? '救援续局'
              : '空间重排'
            : this.screen === 'tools'
              ? '观察与工具'
              : this.screen === 'layer'
                ? '层面检查'
                : '玩法说明';
    u.text('modal-title', title, u.w / 2, y + 38, 29, w - 20, C.text, 6);
    const button = (id: string, label: string, row: number, tone = 'blue', disabled = false) =>
      u.button(id, label, x + 18, y + row, w - 36, 46, tone, disabled, 5);
    if (this.screen === 'paused') {
      u.text(
        'paused-score',
        '得分 ' + this.state.score + '  ·  已消除 ' + this.state.lines + ' 层',
        u.w / 2,
        y + 78,
        14,
        w - 20,
        C.mint,
        6,
      );
      if (h < 400) {
        button('resume', '继续游戏', 106, 'amber');
        const bw = (w - 44) / 2;
        u.button(
          'sound',
          this.soundEnabled ? '音效：开' : '音效：关',
          x + 18,
          y + 162,
          bw,
          46,
          'blue',
          false,
          5,
        );
        u.button(
          'motion',
          this.reducedMotion ? '动态：简化' : '动态：完整',
          x + 26 + bw,
          y + 162,
          bw,
          46,
          'blue',
          false,
          5,
        );
        u.button(
          this.level ? 'help' : 'finish-run',
          this.level ? '玩法说明' : '结算本局',
          x + 18,
          y + 218,
          bw,
          46,
          'blue',
          false,
          5,
        );
        u.button('home', '返回首页', x + 26 + bw, y + 218, bw, 46, 'blue', false, 5);
      } else {
        const start = h - 270;
        button('resume', '继续游戏', start, 'amber');
        button('sound', this.soundEnabled ? '音效：开' : '音效：关', start + 52);
        button('motion', this.reducedMotion ? '动态效果：简化' : '动态效果：完整', start + 104);
        button(
          this.level ? 'help' : 'finish-run',
          this.level ? '玩法说明' : '结算本局',
          start + 156,
        );
        button('home', '返回首页', start + 208);
      }
    } else if (this.screen === 'layer') {
      const layer =
        this.selectedLayer < 0
          ? Math.max(0, Math.min(...this.state.ghost().map((c) => c[2]), this.state.dims[2] - 1))
          : Math.min(this.selectedLayer, this.state.dims[2] - 1);
      const [columns, rows] = this.state.dims,
        occupied = this.state.board.filter((c) => c.z === layer);
      const cells = new Map(occupied.map((c) => [c.x + ',' + c.y, c.color]));
      const ghosts = new Set(
        this.state
          .ghost()
          .filter((c) => c[2] === layer)
          .map((c) => c[0] + ',' + c[1]),
      );
      const cell = Math.min(28, (w - 56) / columns, (h - 225) / rows),
        gx = u.w / 2 - (columns * cell) / 2,
        gy = y + 92;
      u.text(
        'inspect-info',
        '第 ' + (layer + 1) + ' 层 · 已占 ' + occupied.length + ' / ' + columns * rows + ' 格',
        u.w / 2,
        y + 69,
        14,
        w - 30,
        C.amber,
        6,
      );
      for (let yy = 0; yy < rows; yy++)
        for (let xx = 0; xx < columns; xx++) {
          const key = xx + ',' + yy,
            fill = cells.get(key);
          u.panel(
            gx + xx * cell,
            gy + yy * cell,
            cell,
            cell,
            fill || '#173149',
            ghosts.has(key) ? '#81edce' : '#6b879d',
            0,
            5,
          );
        }
      u.text(
        'inspect-tip',
        '正上方俯视 · 绿色轮廓为当前落点',
        u.w / 2,
        y + h - 110,
        11,
        w - 30,
        C.muted,
        6,
      );
      u.button(
        'layer-down',
        '− 上一层',
        x + 18,
        y + h - 92,
        (w - 42) / 2,
        44,
        'blue',
        layer === 0,
        5,
      );
      u.button(
        'layer-up',
        '＋ 下一层',
        x + 24 + (w - 42) / 2,
        y + h - 92,
        (w - 42) / 2,
        44,
        'blue',
        layer === this.state.dims[2] - 1,
        5,
      );
      // Keep the return action beside the title so the inspection grid owns the height.
      u.button('tool-back', '×', x + w - 60, y + 14, 44, 44, 'blue', false, 5);
    } else if (this.screen === 'tools') {
      const gap = 6,
        bw = (w - 36 - gap * 2) / 3;
      for (const [i, [id, label]] of [
        ['move', '移动方块'],
        ['observe', '观察旋转'],
        ['pan', '平移画面'],
      ].entries())
        u.button(
          id,
          label,
          x + 18 + i * (bw + gap),
          y + 74,
          bw,
          44,
          this.mode === id ? 'mint' : 'blue',
          false,
          5,
        );
      const vw = (w - 36 - 18) / 4;
      for (const [i, name] of ['iso', 'top', 'front', 'side'].entries())
        u.button(
          'view-' + name,
          ['立体', '俯视', '正面', '侧面'][i],
          x + 18 + i * (vw + 6),
          y + 124,
          vw,
          44,
          this.viewName === name ? 'mint' : 'blue',
          false,
          5,
        );
      u.button(
        'layer-slice',
        this.layerSlice ? '完整棋盘' : '隐藏上方层',
        x + 18,
        y + 174,
        (w - 42) / 2,
        44,
        this.layerSlice ? 'mint' : 'blue',
        false,
        5,
      );
      u.button(
        'layer-auto',
        '自动跟随落点',
        x + 24 + (w - 42) / 2,
        y + 174,
        (w - 42) / 2,
        44,
        'blue',
        false,
        5,
      );
      const limit = !!this.level && this.state.flipCount >= this.level.maxFlips;
      for (const [i, [id, label]] of [
        ['left', '左翻90°'],
        ['right', '右翻90°'],
        ['invert', '辅助180°'],
      ].entries())
        u.button(id, label, x + 18 + i * (bw + gap), y + 224, bw, 44, 'violet', limit, 5);
      u.text(
        'tools-tip',
        '180°辅助后不计排行榜' +
          (this.level ? ' · 重排 ' + this.state.flipCount + '/' + this.level.maxFlips + ' 次' : ''),
        u.w / 2,
        y + 282,
        11,
        w - 30,
        C.muted,
        6,
      );
      button('tool-back', '返回游戏', h - 62, 'amber');
    } else if (this.screen === 'result') {
      const result = runResult(this.run),
        won = this.run.status === 'won',
        compact = h < 400;
      u.text(
        'reason',
        won
          ? '消层目标已达成'
          : this.level && this.state.placed >= this.level.pieceLimit
            ? '可用方块已用完'
            : this.state.pending
              ? '出生区没有空间容纳下一块'
              : '本次空间挑战已结束',
        u.w / 2,
        y + (compact ? 66 : 78),
        13,
        w - 20,
        C.muted,
        6,
      );
      u.text(
        'result-score',
        won ? '★'.repeat(result.stars) + '☆'.repeat(3 - result.stars) : String(this.state.score),
        u.w / 2,
        y + (compact ? 98 : 120),
        32,
        w - 20,
        C.amber,
        6,
      );
      u.text(
        'result-detail',
        '得分 ' +
          this.state.score +
          ' · 消层 ' +
          this.state.lines +
          ' · ' +
          this.run.steps +
          ' 步\n最高连锁 ' +
          this.state.bestCombo +
          ' · 用时 ' +
          Math.floor(result.elapsedMs / 1000) +
          ' 秒',
        u.w / 2,
        y + (compact ? 138 : 172),
        12,
        w - 24,
        C.text,
        6,
        40,
      );
      u.text(
        'result-ranked',
        this.run.assisted
          ? '使用过辅助：仅保存本地成绩'
          : this.recordStatus === 'recording' || this.recordStatus === 'syncing'
            ? '正在验证排行榜成绩…'
            : this.recordStatus === 'finished'
              ? '成绩已入榜'
              : '本地成绩已保存',
        u.w / 2,
        y + (compact ? 171 : 213),
        11,
        w - 24,
        C.muted,
        6,
      );
      if (won && this.level && this.level.index < LEVELS.length - 1)
        button('next-level', '下一关', h - 166, 'amber');
      else if (
        !won &&
        adPolicy(this.provider()).showRevive &&
        this.rewards.used < REVIVE_LIMIT &&
        !!this.state.pending
      )
        button('revive', '救援续局 · 观看视频', h - 166, 'violet');
      button('restart', won ? '再挑战一次' : '重新开始', h - 112, won ? 'blue' : 'amber');
      button('home', '返回首页', h - 58);
    } else if (this.screen === 'reward') {
      u.text(
        'reward-copy',
        this.rewardKind === 'revive'
          ? '完整观看后清理顶部四层，\n让原方块重新进入。每局最多两次。\n使用后保留本地进度，不计排行榜。'
          : '完整观看后，方舱颠倒180°，\n所有方块重新落定。\n使用后保留本地进度，不计排行榜。',
        u.w / 2,
        y + 140,
        16,
        w - 30,
        C.text,
        6,
        120,
      );
      button(
        'watch',
        this.rewards.pending ? '准备广告／观看中…' : '观看视频并获得效果',
        h - 126,
        'violet',
        this.rewards.pending,
      );
      button('cancel', '取消，返回游戏', h - 70);
    } else {
      const touch =
        '目标：填满水平层，消除获得连锁。\n关卡需在方块数限制内达到消层目标。\n\n移动模式：拖动当前方块。\n观察模式：抓住方舱，随手旋转。\n双指缩放和平移；百分比一键适配。\n加减选层，层面图显示真实占用。';
      const keys =
        '暂存每块一次，落地后恢复。\n工具中可选视角、切层和整舱重排。\n免费旋转的次数随关卡变化。\n\n方向键/WASD移动，空格落下；\nQ/E/R旋转，Shift反转，C暂存；\nG颠倒，P/Esc暂停。';
      const contentH = h - 148,
        cy = y + 72 + contentH / 2;
      if (wide) {
        u.text('help-touch', touch, x + w / 4, cy, 13, w / 2 - 22, C.text, 6, contentH);
        u.text('help-keys', keys, x + (w * 3) / 4, cy, 13, w / 2 - 22, C.text, 6, contentH);
      } else
        u.text('help-copy', touch + '\n\n' + keys, u.w / 2, cy, 13, w - 24, C.text, 6, contentH);
      button('back', '返回', h - 66, 'amber');
    }
  }
  accessible() {
    if (!this.accessibility) return;
    const key = JSON.stringify(this.ui.controls.map((c) => [c.id, c.label, c.disabled]));
    if (key === this.accessibilityKey) return;
    this.accessibilityKey = key;
    this.accessibility.replaceChildren();
    for (const control of this.ui.controls) {
      const b = document.createElement('button');
      b.textContent = control.label;
      b.setAttribute('aria-label', control.label);
      b.disabled = control.disabled;
      b.addEventListener('click', () => this.activate(control.id));
      this.accessibility.append(b);
    }
  }
  snapshot() {
    return {
      engine: VERSION,
      ready: this.ready,
      screen: this.screen,
      game: this.state.getSnapshot(),
      controls: this.ui?.controls.map((c) => ({ ...c })) || [],
      viewport: { width: this.ui?.w, height: this.ui?.h, coordinateSpace: 'css-px' },
      scene: this.ui ? this.layout().scene : null,
      gesture: {
        fingers: Array.from(this.touches),
        points: Array.from(this.touchPoints.values()),
        blocked: this.multiBlocked,
        pinch: this.gesture && { ...this.gesture },
      },
      animating: this.animating,
      motions: this.motions.length,
      visualPiece: this.motions.length
        ? piecePose(this.motions[0].event, this.motions[0].elapsed / this.motions[0].duration)
        : { cells: this.state.cells(), rotation: null },
      orbitVelocity: this.ui ? { ...this.ui.projection.velocity } : null,
      revivesUsed: this.rewards?.used || 0,
      adsAvailable: adPolicy(this.provider()).invertNeedsAd,
      rewardPending: this.rewards?.pending || false,
      inputMode: this.mode,
      view: this.viewName,
      camera: this.ui ? { ...this.ui.projection.camera } : null,
      zoom: this.ui?.projection.zoom,
      pan: this.ui ? { ...this.ui.projection.pan } : null,
      mode: this.run.mode,
      levelId: this.run.levelId,
      runStatus: this.run.status,
      steps: this.run.steps,
      elapsedMs: runResult(this.run).elapsedMs,
      selectedLayer: this.selectedLayer,
      layerSlice: this.layerSlice,
      recordStatus: this.recordStatus,
      assisted: this.run.assisted,
      rankState: this.rankState,
      progress: this.progress?.levels,
      containerCorners: this.ui?.projection._corners() || [],
      hidden: this.hidden,
      practice: this.practice,
      tutorialStep: this.tutorialStep,
      saveWritable: this.store?.writable,
    };
  }
  fixture(kind: string) {
    if (!platform.SmallGamesDev?.isEnabled()) return;
    this.begin(true);
    const snapshot = this.state.getSnapshot();
    snapshot.active = null;
    snapshot.pending = this.state.next[0];
    snapshot.status = 'danger';
    snapshot.board = [];
    const z = kind === 'danger' ? 17 : 0;
    for (let layer = z; layer < (kind === 'danger' ? 18 : 2); layer++)
      for (let x = 0; x < 8; x++)
        for (let y = 0; y < 8; y++)
          snapshot.board.push({ id: snapshot.board.length + 1, x, y, z: layer, color: '#92b5ff' });
    snapshot.serial = snapshot.board.length;
    this.state.restore(snapshot);
    this.run.status = kind === 'danger' ? 'lost' : 'playing';
    this.setupRewards();
    this.animations = [];
    this.goto(kind === 'danger' ? 'result' : 'playing');
    if (kind === 'chain') {
      this.state.flipContainer('invert');
      this.consume();
    }
  }
  update(dt: number) {
    this.time += Math.min(dt, 0.1);
    if (!this.ui) return;
    if (!this.hidden && this.screen === 'playing') {
      if (this.mode === 'observe' && !this.press && !this.reducedMotion)
        this.ui.projection.coast(Math.min(dt, 0.05));
      if (this.animations.length) {
        const a = this.animations[0];
        a.elapsed += Math.min(dt, 0.05);
        if (a.elapsed >= a.duration) {
          this.animations.shift();
          this.settle();
        }
      } else {
        // Catch up rapid taps in order, so successive quarter-turns never reverse direction.
        let remaining = Math.min(dt, 0.05) * Math.max(1, this.motions.length);
        while (this.motions.length && remaining > 0) {
          const motion = this.motions[0];
          const step = Math.min(remaining, motion.duration - motion.elapsed);
          motion.elapsed += step;
          remaining -= step;
          if (motion.elapsed >= motion.duration) this.motions.shift();
        }
        this.fall += Math.min(dt, 0.05) * 120;
        const ticks = Math.floor(this.fall);
        this.fall -= ticks;
        const falling =
          this.run.fallTicks + ticks >= Math.ceil((this.state.fallInterval * 120) / 1000);
        const before = falling ? this.state.board.map((c) => ({ ...c })) : null,
          dims = [...this.state.dims];
        let applied = 0;
        for (let i = 0; i < ticks && this.run.status === 'playing'; i++) {
          advanceTicks(this.run, 1);
          applied++;
        }
        if (applied) this.recorder?.record({}, applied);
        if (before) {
          this.consume(dims, before);
          this.persist();
        }
        this.settle();
      }
    }
    this.render();
  }
  onDestroy() {
    this.disposed = true;
    this.runToken++;
    this.rankToken++;
    this.recorder?.invalidate();
    this.persist();
    this.cancelReward();
    this.rewards?.dispose();
    this.clearInput();
    this.audio?.stop();
    input.off(Input.EventType.TOUCH_START, this.touchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
    input.off(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
    input.off(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
    input.off(Input.EventType.MOUSE_UP, this.mouseUp, this);
    input.off(Input.EventType.MOUSE_WHEEL, this.mouseWheel, this);
    input.off(Input.EventType.KEY_DOWN, this.keyDown, this);
    input.off(Input.EventType.KEY_UP, this.keyUp, this);
    game.off(CocosGame.EVENT_HIDE, this.suspend, this);
    game.off(CocosGame.EVENT_SHOW, this.resumeVisibility, this);
    view.off('canvas-resize', this.resize, this);
    if (sys.isBrowser) {
      window.removeEventListener('blur', this.blur);
      window.removeEventListener('pagehide', this.exit);
      document.removeEventListener('visibilitychange', this.visibility);
      delete platform.__tetracube;
      delete document.body.dataset.tetracubeReady;
      this.accessibility?.remove();
    }
    this.unregister.forEach((fn) => fn());
    this.ui.dispose();
    for (const name of Object.keys(this.clips)) resources.release('audio/' + name, AudioClip);
  }
}
