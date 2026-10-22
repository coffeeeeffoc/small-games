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
const { ccclass } = _decorator;
type Screen = 'home' | 'playing' | 'paused' | 'result' | 'help' | 'reward';
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
};
type Animation = {
  event: MotionEvent;
  dims: Vec;
  board: Cell[];
  elapsed: number;
  duration: number;
};
type Motion = { from: Vec[]; to: Vec[]; elapsed: number; duration: number };

@ccclass('Tetracube')
export class Tetracube extends Component {
  ui!: TetracubeView;
  state = new Game();
  screen: Screen = 'home';
  returnScreen: Screen = 'home';
  rewardOrigin: Screen = 'playing';
  rewardKind: RewardKind = 'invert';
  store!: ReturnType<typeof createSaveStore>;
  rewards!: ReturnType<typeof createRewardController>;
  runStarted = false;
  practice = false;
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
  motion: Motion | null = null;
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
    const saved = this.store.read();
    if (saved) {
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
      this.accessibility.setAttribute('aria-label', '重力方舱');
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
    this.shift = false;
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
            screen: this.screen === 'home' ? 'home' : 'playing',
          },
          window.location.origin,
        );
      } catch {}
    }
  }
  persist() {
    if (this.practice || !this.runStarted) return;
    this.store.write(this.state, this.rewards.used, this.tutorialStep);
  }
  notify(text: string) {
    this.toast = text;
    this.toastUntil = this.time + 3.5;
  }
  sound(name = 'click') {
    if (this.soundEnabled && !this.hidden && this.clips[name])
      this.audio.playOneShot(this.clips[name], 0.35);
  }
  begin(practice = false) {
    this.cancelReward();
    this.state = new Game();
    this.state.drainEvents();
    this.setupRewards();
    this.runStarted = true;
    this.practice = practice;
    this.animations = [];
    this.motion = null;
    this.mode = 'move';
    this.tutorialStep = 0;
    this.ui.projection.setView('iso');
    this.viewName = 'iso';
    this.goto('playing');
    this.persist();
  }
  get animating() {
    return this.animations.length > 0;
  }
  command(action: string, arg?: string | number, direction = 1) {
    if (this.screen !== 'playing' || this.hidden || this.animating || this.rewards.pending) return;
    const dims = [...this.state.dims],
      before = this.state.board.map((c) => ({ ...c }));
    const ok =
      action === 'move'
        ? this.state.move(Number(arg), direction)
        : action === 'rotate'
          ? this.state.rotate(String(arg), direction)
          : action === 'drop'
            ? this.state.hardDrop()
            : action === 'hold'
              ? this.state.hold()
              : action === 'flip'
                ? this.state.flipContainer(String(arg))
                : this.state.tick();
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
      if (['move', 'rotate', 'fall'].includes(event.type))
        this.motion = {
          from: event.from,
          to: event.to,
          elapsed: 0,
          duration: this.reducedMotion ? 0.04 : event.type === 'fall' ? 0.16 : 0.1,
        };
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
    if (this.state.status !== 'playing' && this.screen === 'playing') {
      if (!this.practice && this.store.writable && this.state.score > this.best) {
        this.best = this.state.score;
        try {
          sys.localStorage.setItem('tetracube.best.v1', JSON.stringify(this.best));
        } catch {}
      }
      this.goto('result');
      this.persist();
    }
  }
  askReward(kind: RewardKind) {
    if (this.animating || this.rewards.pending) return;
    if (kind === 'invert' && !adPolicy(this.provider()).invertNeedsAd) {
      this.command('flip', 'invert');
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
    if (id === 'start' || id === 'restart') return this.begin();
    if (id === 'continue') {
      this.goto(this.state.status === 'playing' ? 'playing' : 'result');
      return;
    }
    if (id === 'pause') {
      this.persist();
      this.goto('paused');
      return;
    }
    if (id === 'resume') {
      this.goto('playing');
      return;
    }
    if (id === 'home') {
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
    if (id === 'move' || id === 'observe') {
      this.mode = id;
      return;
    }
    if (id.startsWith('rotate-')) {
      const [, plane, sign] = id.split('-');
      this.command('rotate', plane, sign === 'minus' ? -1 : 1);
      return;
    }
    if (id === 'left' || id === 'right') {
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
    if (this.screen !== 'playing' || this.animating) return;
    if (this.mode === 'observe') {
      this.ui.projection.orbit(dx, dy);
      this.viewName = 'free';
      return;
    }
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
    if (p.control && !p.moved && this.ui.at(x, y)?.id === p.control) this.activate(p.control);
  }
  touchStart(e: EventTouch) {
    const id = e.getID();
    if (id === null) return;
    this.lastTouch = this.time;
    this.touches.add(id);
    if (this.touches.size > 1) {
      this.press = null;
      this.ui.pressed = '';
      return;
    }
    const p = this.point(e);
    this.pressStart(id, p.x, p.y);
  }
  touchMove(e: EventTouch) {
    const id = e.getID();
    if (id === null || this.touches.size !== 1) return;
    const p = this.point(e);
    this.pressMove(id, p.x, p.y);
  }
  touchEnd(e: EventTouch) {
    const id = e.getID();
    if (id === null) return;
    const p = this.point(e);
    this.pressEnd(id, p.x, p.y);
    this.touches.delete(id);
  }
  touchCancel(e: EventTouch) {
    const id = e.getID();
    if (id !== null) this.touches.delete(id);
    this.press = null;
    this.ui.pressed = '';
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
      this.command('move', axis, Math.sign(axis === 0 ? delta.x : delta.y));
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
    const cw = land ? Math.min(352, Math.max(300, w * 0.39)) : Math.min(540, w),
      cx = land ? x + w - cw : x + (w - cw) / 2;
    const controls: Rect = {
      x: cx,
      y: land ? y + (h - 252) / 2 : y + h - 214,
      w: cw,
      h: land ? 252 : 214,
    };
    const scene: Rect = land
      ? { x, y: y + 72, w: w - cw - 12, h: h - 88 }
      : { x, y: y + 90, w, h: controls.y - y - 105 };
    return { land, x, y, w, h, scene, controls };
  }
  render() {
    if (!this.ui || this.disposed) return;
    const u = this.ui,
      l = this.layout();
    u.begin();
    u.background();
    if (!u.ready) {
      u.text('loading', u.error || '正在连接重力方舱…', u.w / 2, u.h / 2, 20, u.w - 30);
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
    else {
      this.playfield(l);
      if (this.screen !== 'playing') this.overlay();
    }
    if (this.toast && this.time < this.toastUntil) {
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
  home(l: ReturnType<Tetracube['layout']>) {
    const u = this.ui,
      w = Math.min(360, l.w - 16),
      x = (u.w - w) / 2;
    if (l.land) {
      const mw = Math.min(340, l.w * 0.42),
        mx = l.x + l.w - mw;
      const demo: Cell[] = [
        { id: 1, x: 3, y: 3, z: 0, color: C.mint },
        { id: 2, x: 4, y: 3, z: 0, color: C.violet },
        { id: 3, x: 4, y: 4, z: 0, color: C.amber },
      ];
      u.world(
        { x: l.x, y: l.y, w: l.w - mw - 20, h: l.h },
        [8, 8, 18],
        demo,
        [
          [3, 3, 10],
          [4, 3, 10],
          [4, 4, 10],
          [4, 4, 11],
        ],
        C.amber,
        [],
      );
      u.text('title', '重力方舱', mx + mw / 2, l.y + 30, 34, mw);
      u.text('best', '经典无尽 · 最佳 ' + this.best, mx + mw / 2, l.y + 68, 14, mw, C.amber);
      let row = l.y + 96;
      if (this.runStarted) {
        u.button('continue', '继续上次对局', mx, row, mw, 44, 'mint');
        row += 52;
      }
      u.button('start', '开始游戏', mx, row, mw, 48, 'amber');
      row += 56;
      u.button('help', '玩法说明', mx, row, (mw - 8) / 2);
      u.button(
        'sound',
        this.soundEnabled ? '音效：开' : '音效：关',
        mx + (mw + 8) / 2,
        row,
        (mw - 8) / 2,
      );
      return;
    }
    u.text('title', '重力方舱', u.w / 2, l.y + 40, Math.min(42, l.w / 8), l.w, C.text);
    u.text('subtitle', 'T E T R A C U B E', u.w / 2, l.y + 76, 14, l.w, C.mint);
    const demo: Cell[] = [];
    for (let z = 0; z < 3; z++)
      for (let x = 2; x < 6; x++)
        for (let y = 2; y < 6; y++)
          if ((x * 2 + y + z) % 4 !== 0)
            demo.push({
              id: demo.length,
              x,
              y,
              z,
              color: ['#76d6ed', '#a58aee', '#f2c16f', '#86ddbe'][(x + y + z) % 4],
            });
    const bottom = l.y + l.h - (this.runStarted ? 224 : 170);
    u.world(
      { x: l.x, y: l.y + 98, w: l.w, h: Math.max(100, bottom - l.y - 115) },
      [8, 8, 18],
      demo,
      [
        [3, 3, 12],
        [4, 3, 12],
        [4, 4, 12],
        [4, 4, 13],
      ],
      C.amber,
      [],
    );
    u.text('best', '最佳成绩  ' + this.best, u.w / 2, bottom - 5, 17, w, C.amber);
    let y = bottom + 20;
    if (this.runStarted) {
      u.button('continue', '继续上次对局', x, y, w, 48, 'mint');
      y += 56;
    }
    u.button('start', '开始游戏', x, y, w, 52, 'amber');
    y += 62;
    u.button('help', '玩法说明', x, y, (w - 8) / 2, 44);
    u.button(
      'sound',
      this.soundEnabled ? '音效：开' : '音效：关',
      x + (w + 8) / 2,
      y,
      (w - 8) / 2,
      44,
    );
    u.text('mode', '经典无尽 · 8 × 8 × 18', u.w / 2, y + 64, 12, w, C.muted);
  }
  playfield(l: ReturnType<Tetracube['layout']>) {
    const u = this.ui,
      { x, y, scene, controls: r } = l,
      fieldW = l.land ? scene.w : l.w;
    u.text('scorelabel', '得分', x + 42, y + 9, 12, 80, C.muted);
    u.text('score', String(this.state.score).padStart(6, '0'), x + 56, y + 34, 25, 112);
    u.text('lineslabel', '消除层数', x + 155, y + 9, 12, 85, C.muted);
    u.text('lines', String(this.state.lines).padStart(2, '0'), x + 155, y + 34, 23, 80, C.mint);
    u.pause(x + fieldW - 44, y);
    u.text('dimensions', this.state.dims.join(' × '), x + 53, y + 68, 12, 106, C.mint);
    u.text('next', '下一块', x + fieldW - 94, y + 64, 11, 48, C.muted);
    const next = this.state.next[0];
    if (next) u.mini('next', next.cells, next.color, x + fieldW - 30, y + 67, 8);
    let dims = this.state.dims,
      board = this.state.board,
      active = this.state.cells(),
      ghost = this.state.ghost(),
      flip = null;
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
    } else if (this.motion && active.length === this.motion.from.length) {
      const t = Math.min(1, this.motion.elapsed / this.motion.duration),
        ease = 1 - (1 - t) ** 3;
      active = this.motion.from.map((v, i) =>
        v.map((n, k) => n + (this.motion!.to[i][k] - n) * ease),
      );
    }
    u.world(scene, dims, board, active, this.state.active?.color || C.amber, ghost, flip);
    const disabled = this.animating || this.screen !== 'playing';
    if (this.mode === 'observe' && this.screen === 'playing') {
      const labels = ['立体', '俯视', '正面', '侧面'];
      for (const [i, name] of ['iso', 'top', 'front', 'side'].entries())
        u.button(
          'view-' + name,
          labels[i],
          scene.x + 8 + i * 52,
          scene.y + 5,
          48,
          44,
          this.viewName === name ? 'mint' : 'blue',
        );
    }
    u.panel(r.x - 4, r.y - 8, r.w + 8, r.h + 14, '#0b142be8', '#32486b', 14);
    const gap = 6,
      small = (r.w - 12) * 0.22;
    u.button('move', '移动', r.x, r.y, small, 44, this.mode === 'move' ? 'mint' : 'blue', disabled);
    u.button(
      'observe',
      '观察',
      r.x + small + gap,
      r.y,
      small,
      44,
      this.mode === 'observe' ? 'mint' : 'blue',
      disabled,
    );
    u.button(
      'drop',
      '↓  直接落下',
      r.x + 2 * (small + gap),
      r.y,
      r.w - 2 * (small + gap),
      44,
      'amber',
      disabled,
    );
    u.text('rot-label', '旋转方块 · 每次90°', r.x + r.w / 2, r.y + 59, 12, r.w, C.mint);
    const bw = (r.w - 5 * gap) / 6;
    for (const [i, plane] of ['XY', 'XZ', 'YZ'].entries())
      for (const [j, sign] of ['plus', 'minus'].entries())
        u.button(
          'rotate-' + plane + '-' + sign,
          plane + (j ? '−' : '+'),
          r.x + (i * 2 + j) * (bw + gap),
          r.y + 73,
          bw,
          44,
          'mint',
          disabled,
        );
    u.text('ship-label', '转动容器 · 整舱重排', r.x + r.w / 2, r.y + 132, 12, r.w, C.violet);
    const hold = 54,
      fw = (r.w - hold - 3 * gap) / 3;
    u.button('left', '左90°', r.x, r.y + 146, fw, 44, 'violet', disabled);
    u.button('right', '右90°', r.x + fw + gap, r.y + 146, fw, 44, 'violet', disabled);
    u.button(
      'invert',
      adPolicy(this.provider()).invertNeedsAd ? '180° · 视频' : '颠倒180°',
      r.x + 2 * (fw + gap),
      r.y + 146,
      fw,
      44,
      'violet',
      disabled,
    );
    u.button(
      'hold',
      this.state.held ? '换入' : '暂存',
      r.x + r.w - hold,
      r.y + 146,
      hold,
      44,
      'blue',
      disabled || this.state.holdUsed,
    );
    u.text(
      'held-name',
      this.state.held?.name || '空槽',
      r.x + r.w - hold / 2,
      r.y + 201,
      10,
      hold,
      C.muted,
    );
    const guide = [
      '拖动方块，虚线是落点',
      '点击 XY / XZ / YZ 改变姿态',
      '点击落下，填满平面即可消层',
      '左右侧翻，整舱向下重排',
    ][this.tutorialStep];
    u.text(
      'guide',
      guide || (this.mode === 'observe' ? '拖动观察 · 四个预设视角' : '拖动移动 · 暂存每块一次'),
      r.x + (r.w - hold) / 2,
      r.y + 201,
      10,
      r.w - hold - 4,
      C.muted,
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
          ? '方舱已满'
          : this.screen === 'reward'
            ? this.rewardKind === 'revive'
              ? '复活一次'
              : '颠倒方舱'
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
        u.button('help', '玩法说明', x + 18, y + 218, bw, 46, 'blue', false, 5);
        u.button('home', '返回首页', x + 26 + bw, y + 218, bw, 46, 'blue', false, 5);
      } else {
        const start = h - 270;
        button('resume', '继续游戏', start, 'amber');
        button('sound', this.soundEnabled ? '音效：开' : '音效：关', start + 52);
        button('motion', this.reducedMotion ? '动态效果：简化' : '动态效果：完整', start + 104);
        button('help', '玩法说明', start + 156);
        button('home', '返回首页', start + 208);
      }
    } else if (this.screen === 'result') {
      u.text('reason', '出生区没有空间容纳下一块', u.w / 2, y + 83, 14, w - 20, C.muted, 6);
      u.text('result-score', String(this.state.score), u.w / 2, y + 125, 38, w - 20, C.amber, 6);
      if (adPolicy(this.provider()).showRevive && this.rewards.used < REVIVE_LIMIT) {
        u.text(
          'revive-copy',
          '完整观看后清理顶部四层\n继续本局 · 剩余 ' + (REVIVE_LIMIT - this.rewards.used) + ' 次',
          u.w / 2,
          y + 167,
          13,
          w - 24,
          C.muted,
          6,
          44,
        );
        button('revive', '复活一次 · 观看视频', h - 166, 'violet');
      } else
        u.text(
          'no-revive',
          this.rewards.used >= REVIVE_LIMIT ? '本局复活次数已用完' : '调整姿态与暂存，挑战更高分',
          u.w / 2,
          y + 194,
          14,
          w - 20,
          C.muted,
          6,
        );
      button('restart', '重新开始', h - 112, 'amber');
      button('home', '返回首页', h - 58);
    } else if (this.screen === 'reward') {
      u.text(
        'reward-copy',
        this.rewardKind === 'revive'
          ? '完整观看视频后，清理当前世界\n顶部四层，并让原方块重新进入。\n每局最多成功复活两次。'
          : '完整观看视频后，方舱颠倒180°。\n当前方块也会参与重排，\n所有方块向世界下方落定。',
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
        '目标：填满整层，消除获得连锁。\n\n在场景中拖动方块。\n观察模式：拖动镜头或选择4种视角。\nXY、XZ、YZ 各有正反90°。\n虚线是落点，数字是离底部的层数。';
      const keys =
        '暂存：每块一次，落地后恢复。\n左右侧翻免费，重力始终向下。\n\n方向键/WASD移动，空格落下；\nQ/E/R旋转，Shift反转，C暂存；\nG颠倒，P/Esc暂停。';
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
      animating: this.animating,
      revivesUsed: this.rewards?.used || 0,
      adsAvailable: adPolicy(this.provider()).invertNeedsAd,
      rewardPending: this.rewards?.pending || false,
      inputMode: this.mode,
      view: this.viewName,
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
      if (this.animations.length) {
        const a = this.animations[0];
        a.elapsed += Math.min(dt, 0.05);
        if (a.elapsed >= a.duration) {
          this.animations.shift();
          this.settle();
        }
      } else {
        if (this.motion) {
          this.motion.elapsed += Math.min(dt, 0.05);
          if (this.motion.elapsed >= this.motion.duration) this.motion = null;
        }
        this.fall += Math.min(dt, 0.05) * 1000;
        if (this.fall >= this.state.fallInterval) {
          this.fall = 0;
          this.command('tick');
        }
      }
    }
    this.render();
  }
  onDestroy() {
    this.disposed = true;
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
