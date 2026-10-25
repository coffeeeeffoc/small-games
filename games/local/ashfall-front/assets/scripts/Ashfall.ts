import {
  _decorator,
  Component,
  AudioSource,
  AudioClip,
  resources,
  input,
  Input,
  EventTouch,
  EventMouse,
  EventKeyboard,
  KeyCode,
  Game,
  game,
  view,
} from 'cc';
import {
  createRun,
  stepRun,
  chooseUpgrade,
  continueRun,
  retryRoom,
  LEVELS,
  UPGRADES,
} from './core/core.js';
import { readProgress, recordProgress, unlockedCount } from './core/progress.js';
import { createLocalHost } from './core/host.js';
import { createRewards, rewardEligible } from './core/rewards.js';
import { FrontView } from './FrontView';
const web = globalThis as any;
const { ccclass } = _decorator;
const clock = (t: number) =>
  `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
@ccclass('Ashfall')
export class Ashfall extends Component {
  ui!: FrontView;
  run: any;
  progress: any;
  host: any;
  rewards: any;
  screen = 'home';
  helpReturn = 'home';
  confirmAction = 'home';
  rewardKind = 'supply';
  rewardReturn = 'paused';
  page = 0;
  ready = false;
  trial = false;
  adLocked = false;
  visualTime = 0;
  accumulator = 0;
  message = '';
  messageLeft = 0;
  pointers = new Map<number, { id: string; x: number; y: number; dx: number; dy: number }>();
  keys = new Set<number>();
  jump = false;
  dash = false;
  fireTap = false;
  tapDirection: { x: number; y: number } | undefined;
  touched = -100;
  audio!: AudioSource;
  clips = new Map<string, AudioClip>();
  cleanups: (() => void)[] = [];
  mouseAim: { x: number; y: number } | null = null;
  saveQueue = Promise.resolve();
  savedRooms = 0;
  effects: { x: number; y: number; life: number; type: string }[] = [];
  async onLoad() {
    this.ui = new FrontView(this.node);
    this.run = createRun();
    this.host = createLocalHost();
    this.progress = readProgress(null);
    this.audio = this.node.addComponent(AudioSource);
    for (const name of ['shoot', 'hit', 'explode', 'jump', 'checkpoint', 'lose', 'win'])
      resources.load(name, AudioClip, (err, clip) => {
        if (!err && this.isValid) this.clips.set(name, clip);
      });
    this.rewards = createRewards({
      current: () => this.run,
      port: () => web.SmallGamesRewardAds,
      locked: (v: boolean) => {
        this.adLocked = v;
        this.clearInput();
        if (v) this.audio.stop();
      },
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
    game.on(Game.EVENT_HIDE, this.hide, this);
    view.on('canvas-resize', this.resize, this);
    web.addEventListener?.('blur', this.hide);
    web.addEventListener?.('touchstart', this.markTouch, { capture: true, passive: true });
    web.addEventListener?.('pagehide', this.pagehide);
    web.document?.addEventListener('visibilitychange', this.visibility);
    const api: any = { snapshot: () => this.snapshot() };
    if (web.SmallGamesDev?.isEnabled()) {
      api.dev = (action: string, value = 0) => {
        this.trial = true;
        this.rewards.cancel();
        if (action === 'level') this.begin(Math.max(0, Math.min(22, value)), true, true);
        if (action === 'damage') this.run.player.hp = Math.max(1, this.run.player.hp - 60);
        if (action === 'lose') {
          this.run.player.hp = 0;
          this.run.phase = 'lost';
          this.setScreen('result');
        }
        if (action === 'clear') {
          this.run.enemies = [];
          this.run.encounters.forEach((e: any) => {
            e.guards = true;
            e.boss = true;
          });
          this.run.capture = this.run.level.waves[this.run.waveIndex].captureSeconds;
          this.run.checkpointComplete = true;
          this.run.waveIndex = this.run.wavesTotal - 1;
          this.run.player.x = this.run.level.exitX;
          stepRun(this.run, {}, 1 / 60);
          this.setScreen(this.run.phase === 'upgrade' ? 'upgrade' : 'result');
        }
        if (action === 'heal') this.run.player.hp = this.run.player.maxHp;
        this.draw();
        return this.snapshot();
      };
      const stop = web.SmallGamesDev.registerActions([
        {
          id: 'ashfall-next',
          label: '试玩下一战区',
          run: () => api.dev('level', (this.run.levelIndex + 1) % 23),
        },
        { id: 'ashfall-hurt', label: '试玩半血补给', run: () => api.dev('damage') },
        { id: 'ashfall-result', label: '试玩结算', run: () => api.dev('clear') },
      ]);
      if (stop) this.cleanups.push(stop);
    }
    web.Ashfall = Object.freeze(api);
    const stop = web.SmallGamesDev?.registerSnapshot(() => this.snapshot());
    if (stop) this.cleanups.push(stop);
    try {
      this.progress = readProgress((await this.host.storage.read('progress'))?.value);
    } catch {
      this.message = '存档暂不可读，本次进度保留在内存';
    }
    if (!this.isValid) return;
    this.ready = true;
    this.draw();
  }
  resize = () => {
    this.clearInput();
    this.ui.resize();
    this.draw();
  };
  hide = () => {
    this.clearInput();
    this.audio?.stop();
    if (this.screen === 'playing') this.setScreen('paused');
  };
  visibility = () => {
    if (web.document?.hidden) this.hide();
  };
  pagehide = () => {
    this.rewards.cancel();
    this.hide();
  };
  clearInput() {
    this.pointers.clear();
    this.keys.clear();
    this.mouseAim = null;
    this.jump = false;
    this.dash = false;
    this.fireTap = false;
    this.tapDirection = undefined;
    this.accumulator = 0;
  }
  setScreen(screen: string) {
    this.clearInput();
    this.screen = screen;
    if (screen !== 'playing') this.audio?.stop();
    try {
      web.parent?.postMessage(
        {
          type: 'small-games:display-state',
          gameId: 'ashfall-front',
          screen:
            ['playing', 'paused', 'upgrade', 'reward', 'result', 'confirm'].includes(screen) ||
            (['help', 'settings'].includes(screen) && this.helpReturn === 'paused')
              ? 'playing'
              : 'home',
        },
        web.document.referrer ? new URL(web.document.referrer).origin : web.location.origin,
      );
    } catch {}
    this.draw();
  }
  begin(index: number, singleLevel = false, trial = false) {
    this.rewards.cancel();
    this.run = createRun(index, { singleLevel });
    this.savedRooms = 0;
    this.trial = trial;
    this.effects = [];
    this.setScreen('playing');
  }
  save() {
    const value = structuredClone(this.progress);
    this.saveQueue = this.saveQueue
      .catch(() => {})
      .then(() => this.host.storage.write('progress', value))
      .then(() => {})
      .catch(() => {
        this.message = '本机存储不可用，进度保留至关闭页面';
        this.messageLeft = 5;
      });
  }
  action(id: string) {
    if (this.adLocked) return;
    if (id === 'start') this.begin(Math.min(this.progress.completed.length, 22));
    else if (id === 'campaign') this.begin(0);
    else if (id === 'levels') {
      this.rewards.cancel();
      this.page = Math.floor(Math.min(this.progress.completed.length, 22) / 6);
      this.setScreen('levels');
    } else if (id.startsWith('level-')) {
      const n = Number(id.slice(6));
      if (n < unlockedCount(this.progress) || web.SmallGamesDev?.isEnabled())
        this.begin(n, true, n >= unlockedCount(this.progress));
    } else if (id === 'prev' || id === 'next') {
      this.page = Math.max(0, Math.min(3, this.page + (id === 'next' ? 1 : -1)));
      this.draw();
    } else if (id === 'pause') this.setScreen('paused');
    else if (id === 'resume') this.setScreen('playing');
    else if (id === 'home') {
      this.rewards.cancel();
      this.setScreen('home');
    } else if (id === 'retry') {
      this.rewards.cancel();
      retryRoom(this.run);
      this.savedRooms = this.run.roomsCleared.length;
      this.effects = [];
      this.setScreen('playing');
    } else if (id === 'leave' || id === 'restart') {
      this.confirmAction = id === 'leave' ? 'home' : 'retry';
      this.setScreen('confirm');
    } else if (id === 'confirm') this.action(this.confirmAction);
    else if (id === 'help' || id === 'settings') {
      this.helpReturn = this.screen;
      this.setScreen(id);
    } else if (id === 'back') this.setScreen(this.helpReturn);
    else if (id === 'sound') {
      this.progress.sound = !this.progress.sound;
      if (!this.progress.sound) this.audio.stop();
      this.save();
      this.draw();
    } else if (id === 'motion') {
      this.progress.reducedMotion = !this.reduced();
      this.save();
      this.draw();
    } else if (id.startsWith('upgrade-')) {
      if (chooseUpgrade(this.run, id.slice(8))) this.setScreen('playing');
    } else if (id === 'continue') {
      if (continueRun(this.run)) this.setScreen('playing');
    } else if (id === 'supply' || id === 'revive') {
      this.rewardKind = id;
      this.rewardReturn = this.screen;
      this.setScreen('reward');
    } else if (id === 'cancel') this.setScreen(this.rewardReturn);
    else if (id === 'claim') void this.claim();
  }
  async claim() {
    const current = this.run;
    const result = await this.rewards.offer(this.rewardKind);
    if (!this.isValid || current !== this.run || result === 'expired') return;
    this.message =
      result === 'completed'
        ? '补给已到账 · 本次为辅助行动'
        : result === 'unavailable'
          ? '补给暂不可用，可直接继续行动'
          : '未完成观看，未领取补给';
    this.messageLeft = 5;
    this.setScreen(
      result === 'completed' && this.rewardKind === 'revive' ? 'paused' : this.rewardReturn,
    );
  }
  point(e: EventTouch | EventMouse) {
    const p = e.getUILocation();
    return { x: p.x, y: this.ui.H - p.y };
  }
  down(id: number, p: { x: number; y: number }) {
    if (!this.ready || this.adLocked || this.pointers.has(id)) return;
    const b = this.ui.hit(p.x, p.y);
    if (!b) return;
    this.pointers.set(id, { id: b.id, ...p, dx: 0, dy: 0 });
    if (b.id === 'jump') this.jump = true;
    if (b.id === 'dash') this.dash = true;
    if (b.id === 'fire') {
      this.fireTap = true;
      this.tapDirection = undefined;
    }
  }
  move(id: number, p: { x: number; y: number }) {
    const a = this.pointers.get(id);
    if (a) {
      a.dx = p.x - a.x;
      a.dy = p.y - a.y;
      if (a.id === 'fire' && this.fireTap)
        this.tapDirection = Math.hypot(a.dx, a.dy) > 12 ? { x: a.dx, y: a.dy } : undefined;
      if (['left', 'right', 'jump', 'dash'].includes(a.id) && this.ui.hit(p.x, p.y)?.id !== a.id)
        this.pointers.delete(id);
    }
  }
  up(id: number, p: { x: number; y: number }) {
    const a = this.pointers.get(id);
    this.pointers.delete(id);
    if (
      a &&
      this.ui.hit(p.x, p.y)?.id === a.id &&
      !['left', 'right', 'fire', 'jump', 'dash'].includes(a.id)
    )
      this.action(a.id);
  }
  touchStart(e: EventTouch) {
    for (const t of e.getTouches()) this.down(t.getID(), this.pointForTouch(t));
  }
  // Creator 3.8.8 also emits unmarked touch events for a mouse press.
  markTouch = () => {
    this.touched = this.visualTime;
  };
  touchMove(e: EventTouch) {
    for (const t of e.getTouches()) this.move(t.getID(), this.pointForTouch(t));
  }
  touchEnd(e: EventTouch) {
    for (const t of e.getTouches()) this.up(t.getID(), this.pointForTouch(t));
  }
  touchCancel() {
    this.clearInput();
  }
  pointForTouch(t: any) {
    const p = t.getUILocation();
    return { x: p.x, y: this.ui.H - p.y };
  }
  mouseDown(e: EventMouse) {
    if (e.getButton() !== 0 || this.visualTime - this.touched <= 0.5 || this.adLocked) return;
    const p = this.point(e);
    if (this.screen === 'playing' && !this.ui.hit(p.x, p.y)) {
      this.pointers.set(-1, { id: 'scene-fire', ...p, dx: 0, dy: 0 });
      this.fireTap = true;
      this.aimMouse(p);
    } else this.down(-1, p);
  }
  aimMouse(p: { x: number; y: number }) {
    this.mouseAim = { x: p.x / this.ui.worldScale + this.ui.cameraX, y: p.y / this.ui.worldScale };
  }
  mouseMove(e: EventMouse) {
    const p = this.point(e);
    this.move(-1, p);
    if (this.pointers.get(-1)?.id === 'scene-fire') this.aimMouse(p);
  }
  mouseUp(e: EventMouse) {
    if (e.getButton() !== 0) return;
    this.up(-1, this.point(e));
    if (!this.fireTap) this.mouseAim = null;
  }
  keyDown(e: EventKeyboard) {
    const k = e.keyCode;
    if (k === KeyCode.ESCAPE) {
      if (this.screen === 'playing') this.action('pause');
      else if (this.screen === 'paused') this.action('resume');
      else if (['help', 'settings'].includes(this.screen)) this.action('back');
      else if (this.screen === 'confirm') this.setScreen('paused');
      return;
    }
    if (k === KeyCode.ENTER && this.screen === 'home') {
      this.action('start');
      return;
    }
    if (this.screen !== 'playing' || this.adLocked) return;
    if (!this.keys.has(k)) {
      if ([KeyCode.SPACE, KeyCode.KEY_W, KeyCode.ARROW_UP].includes(k)) this.jump = true;
      if ([KeyCode.SHIFT_LEFT, KeyCode.SHIFT_RIGHT].includes(k)) this.dash = true;
      if ([KeyCode.KEY_J, KeyCode.KEY_I, KeyCode.KEY_K].includes(k)) {
        this.fireTap = true;
        this.tapDirection =
          k === KeyCode.KEY_J
            ? undefined
            : { x: this.run.player.facing, y: k === KeyCode.KEY_I ? -1 : 1 };
      }
    }
    this.keys.add(k);
  }
  keyUp(e: EventKeyboard) {
    this.keys.delete(e.keyCode);
  }
  held(id: string, codes: number[] = []) {
    return (
      Array.from(this.pointers.values()).some((p) => p.id === id) ||
      codes.some((k) => this.keys.has(k))
    );
  }
  update(dt: number) {
    this.visualTime += Math.min(dt, 0.05);
    this.messageLeft = Math.max(0, this.messageLeft - dt);
    this.effects = this.effects.filter((e) => (e.life -= dt) > 0);
    if (this.ready && this.screen === 'playing' && !this.adLocked && !web.document?.hidden) {
      this.accumulator = Math.min(0.1, this.accumulator + dt);
      while (this.accumulator >= 1 / 60 && this.run.phase === 'playing') {
        const fire = Array.from(this.pointers.values()).find((p) => p.id === 'fire');
        let direction = this.tapDirection;
        if (fire && Math.hypot(fire.dx, fire.dy) > 12) direction = { x: fire.dx, y: fire.dy };
        if (this.keys.has(KeyCode.KEY_I)) direction = { x: this.run.player.facing, y: -1 };
        if (this.keys.has(KeyCode.KEY_K)) direction = { x: this.run.player.facing, y: 1 };
        const shots = this.run.shots;
        stepRun(
          this.run,
          {
            viewWidth: this.ui.W / this.ui.worldScale,
            move:
              Number(this.held('right', [KeyCode.KEY_D, KeyCode.ARROW_RIGHT])) -
              Number(this.held('left', [KeyCode.KEY_A, KeyCode.ARROW_LEFT])),
            fire:
              this.fireTap ||
              this.held('fire', [KeyCode.KEY_J, KeyCode.KEY_I, KeyCode.KEY_K]) ||
              this.held('scene-fire'),
            aim: this.mouseAim,
            aimDirection: direction,
            jump: this.jump,
            dash: this.dash,
          },
          1 / 60,
        );
        if (this.run.shots > shots) {
          this.fireTap = false;
          this.tapDirection = undefined;
          if (!this.held('scene-fire')) this.mouseAim = null;
        }
        this.jump = false;
        this.dash = false;
        this.accumulator -= 1 / 60;
        const played = new Set<string>();
        for (const e of this.run.events) {
          if (['hit', 'explode', 'kill', 'checkpoint'].includes(e.type))
            this.effects.push({
              x: e.x,
              y: e.y,
              life: e.type === 'explode' ? 0.45 : 0.18,
              type: e.type,
            });
          if (this.progress.sound && this.clips.has(e.type) && !played.has(e.type)) {
            this.audio.stop();
            this.audio.clip = this.clips.get(e.type)!;
            this.audio.volume = e.type === 'shoot' ? 0.15 : 0.4;
            this.audio.play();
            played.add(e.type);
          }
        }
      }
      if (this.run.roomsCleared.length !== this.savedRooms) {
        this.savedRooms = this.run.roomsCleared.length;
        if (recordProgress(this.progress, this.run, this.trial)) this.save();
      }
      if (this.run.phase === 'upgrade') this.setScreen('upgrade');
      if (['won', 'lost'].includes(this.run.phase)) this.setScreen('result');
    }
    this.draw();
  }
  reduced() {
    return (
      this.progress.reducedMotion ??
      web.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
      false
    );
  }
  draw() {
    if (!this.ui || !this.progress) return;
    const u = this.ui,
      H = u.H,
      h = Math.max(54, 44 / u.scale),
      pitch = h + 8;
    const menu =
      ['home', 'levels'].includes(this.screen) ||
      (['help', 'settings'].includes(this.screen) && this.helpReturn === 'home');
    u.pressed = new Set(Array.from(this.pointers.values()).map((p) => p.id));
    u.begin();
    u.world(this.run, menu, this.visualTime, this.reduced());
    for (const e of this.effects) {
      u.circle(
        (e.x - u.cameraX) * u.worldScale,
        e.y * u.worldScale,
        this.reduced() ? 5 : ((e.type === 'explode' ? 35 : 7) * e.life) / 0.3,
        e.type === 'explode' ? '#edb46b88' : '#fff0bccc',
      );
    }
    const heading = (title: string, note: string, top: number, left = 198, width = 448) => {
      u.line(left, top, left + 38, top, '#d5a36b', 3);
      u.text('heading', title, left, top + 12, width, 29, '#f2ead5', 42, true);
      u.text('note', note, left, top + 58, width, 18, '#aab9a5', 28, true);
    };
    if (this.screen === 'home') {
      const left = Math.max(32, u.safe.left + 12),
        panelH = 190 + pitch * 2 + h,
        top = (H - panelH) / 2;
      u.panel(left, top, 360, panelH, '#10221eec');
      heading('灰 烬 防 线', 'ASHFALL FRONT  /  23 SECTORS', top + 26, left + 24, 312);
      const current = Math.min(this.progress.completed.length, LEVELS.length - 1);
      u.text(
        'home-sector',
        `${String(current + 1).padStart(2, '0')}  ${LEVELS[current].name}`,
        left + 24,
        top + 126,
        312,
        20,
        '#d3bd94',
        32,
        true,
      );
      u.button(
        'start',
        this.progress.completed.length ? '继续行动  →' : '开始行动  →',
        left + 24,
        top + 164,
        312,
        h,
        true,
      );
      u.button('levels', '战区选择', left + 24, top + 164 + pitch, 150, h);
      u.button('help', '操作指引', left + 186, top + 164 + pitch, 150, h, false, false, true);
      u.button(
        'settings',
        '设置 · 声音与动态',
        left + 24,
        top + 164 + pitch * 2,
        312,
        h,
        false,
        false,
        true,
      );
    } else if (this.screen === 'levels') {
      u.panel(22, 20, 800, H - 40, '#10221fee');
      heading(
        '战区选择',
        `已突破 ${this.progress.completed.length} / 23  ·  ${web.SmallGamesDev?.isEnabled() ? '开发试玩' : '通关解锁后续战区'}`,
        43,
        44,
        610,
      );
      u.button('home', '返回', 704, 30, 94, h, false, false, true);
      const cardLeft = Math.max(40, u.safe.left + 12),
        cardPitch = (Math.min(804, u.safe.right - 12) - cardLeft) / 6;
      for (let i = 0; i < 6; i++) {
        const index = this.page * 6 + i;
        if (index >= LEVELS.length) break;
        const level = LEVELS[index],
          done = this.progress.completed.includes(level.id),
          open = index < unlockedCount(this.progress) || web.SmallGamesDev?.isEnabled();
        u.button(
          'level-' + index,
          `${String(index + 1).padStart(2, '0')}\n${level.name}\n${done ? '已完成' : open ? '进入 →' : '未解锁'}`,
          cardLeft + i * cardPitch,
          146,
          cardPitch - 10,
          Math.min(160, H - 248),
          open && !done,
          !open,
        );
      }
      u.button('campaign', '从首关开始战役', 44, H - h - 32, 240, h, false, false, true);
      u.button('prev', '‹', 494, H - h - 32, 70, h, false, this.page === 0);
      u.text('page', `${this.page + 1} / 4`, 568, H - h - 19, 110, 21);
      u.button('next', '›', 690, H - h - 32, 70, h, false, this.page === 3);
    } else if (this.screen === 'help' || this.screen === 'settings') {
      const settings = this.screen === 'settings',
        panelH = settings ? pitch * 3 + 114 : 370,
        top = (H - panelH) / 2;
      u.box(0, 0, u.W, H, '#06130e88', '#06130e88');
      u.panel(140, top, 564, panelH);
      heading(
        settings ? '行动设置' : '操作指引',
        settings ? '调整立即生效，并保存在本机' : '点射、连射与机动推进',
        top + 20,
        166,
        512,
      );
      if (settings) {
        for (const [i, id, label, on] of [
          [0, 'sound', '游戏声音', this.progress.sound],
          [1, 'motion', '减弱动态', this.reduced()],
        ] as [number, string, string, boolean][]) {
          const y = top + 102 + i * pitch;
          u.text(id + '-label', label, 174, y + 12, 290, 22, '#e5e8d7', 30, true);
          u.button(id, on ? '开启  ●' : '关闭  ○', 514, y, 154, h, on);
        }
      } else
        [
          '左右移动 · 跳跃越障 · 冲刺快速脱离包围',
          '点按开火射击；长按连射，自动瞄准近处敌人',
          '按住开火并拖动，可自由控制射击方向',
          '前往金色中继，清除附近敌人并守住接通进度',
          'A/D移动 · 空格跳跃 · Shift冲刺 · J/I/K射击',
        ].forEach((s, i) =>
          u.text('help-' + i, s, 166, top + 104 + i * 35, 512, 20, '#d4ddcb', 30, true),
        );
      u.button(
        'back',
        this.helpReturn === 'paused' ? '返回暂停菜单' : '返回主页',
        286,
        top + panelH - h - 16,
        272,
        h,
        true,
      );
    } else {
      const p = this.run.player,
        wave = this.run.level.waves[this.run.waveIndex];
      if (this.screen === 'playing') {
        u.panel(24, 18, 184, 44, '#10221ed9');
        u.line(36, 45, 146, 45, '#405747', 6);
        if (p.hp > 0) u.line(36, 45, 36 + (110 * p.hp) / p.maxHp, 45, '#d3a15b', 6);
        u.text('hp', `${Math.ceil(p.hp)}`, 152, 27, 46, 20);
        u.text(
          'mission',
          `${String(this.run.levelIndex + 1).padStart(2, '0')}  ${this.run.level.name}  ·  ${clock(this.run.roomTime)}`,
          224,
          14,
          452,
          19,
        );
        const delta = wave.checkpointX - p.x;
        const target = this.run.checkpointComplete
          ? this.run.waveIndex + 1 < this.run.wavesTotal
            ? '接通完成 · 向下一阵地推进 →'
            : '全线接通 · 前往出口 →'
          : Math.abs(delta) > wave.radius
            ? `${delta > 0 ? '前往中继 →' : '← 返回中继'} · 阵地 ${this.run.waveIndex + 1}/${this.run.wavesTotal}`
            : `阵地 ${this.run.waveIndex + 1}/${this.run.wavesTotal} · ${Math.floor((100 * this.run.capture) / wave.captureSeconds)}% ${this.run.contested ? '清除阵地内敌人' : '守住接通'}`;
        u.text('target', target, 214, 43, 472, 19, '#e3bd7e');
        u.button('pause', '暂停', 744, 10, 72, 62);
        const y = H - h - 18;
        u.button('left', '向左移动', 26, y, 76, h);
        u.button('right', '向右移动', 112, y, 76, h);
        u.button('jump', '跳跃', 534, y, 76, h);
        u.button('dash', '冲刺', 620, y, 76, h, false, p.dashCooldown > 0);
        u.button('fire', '开火', 714, H - 106, 102, 92, true);
        u.text('jump-caption', '跳跃', 534, y - 24, 76, 16, '#c5cfbb');
        u.text(
          'dash-caption',
          p.dashCooldown > 0 ? `${p.dashCooldown.toFixed(1)}s` : '冲刺',
          620,
          y - 24,
          76,
          16,
          '#c5cfbb',
        );
        u.text('fire-caption', '开火', 724, H - 126, 82, 16, '#edc991');
      } else {
        u.box(0, 0, u.W, H, '#06130e99', '#06130e99');
        const panelH = Math.max(320, pitch * 3 + 116),
          top = (H - panelH) / 2,
          row = top + 112;
        u.panel(170, top, 504, panelH);
        const sector = `${this.run.level.name} · 阵地 ${this.run.waveIndex + 1}/${this.run.wavesTotal}`;
        if (this.screen === 'paused') {
          heading('行动暂停', sector, top + 22);
          const supply = !!web.SmallGamesRewardAds?.available && rewardEligible(this.run, 'supply');
          u.button('resume', '继续战斗  →', 198, row, supply ? 218 : 448, h, true);
          if (supply) u.button('supply', '补给 · 观看广告', 428, row, 218, h);
          u.button('restart', '重试本关', 198, row + pitch, 218, h);
          u.button('leave', '返回主页', 428, row + pitch, 218, h);
          u.button('help', '操作指引', 198, row + pitch * 2, 218, h, false, false, true);
          u.button('settings', '设置', 428, row + pitch * 2, 218, h, false, false, true);
        } else if (this.screen === 'confirm') {
          heading(
            this.confirmAction === 'retry' ? '重新开始本关？' : '返回主页？',
            '本关战斗将重置，已解锁战区保留',
            top + 22,
          );
          u.text(
            'confirm-copy',
            this.confirmAction === 'retry'
              ? '保留已获得改装，重新部署到本关起点'
              : '下次可从已解锁的当前战区重新行动',
            198,
            row,
            448,
            20,
            '#d1d9c7',
          );
          u.button('resume', '继续战斗', 198, row + pitch, 218, h, true);
          u.button(
            'confirm',
            this.confirmAction === 'retry' ? '确认重试' : '确认返回',
            428,
            row + pitch,
            218,
            h,
          );
        } else if (this.screen === 'reward') {
          heading(
            this.rewardKind === 'supply' ? '战地补给' : '续战支援',
            '自愿观看 · 每关一次',
            top + 22,
          );
          u.text(
            'reward-copy',
            `完整观看后恢复${this.rewardKind === 'supply' ? '40%' : '50%'}生命`,
            198,
            row,
            448,
            24,
          );
          u.text(
            'reward-note',
            '辅助行动可解锁关卡，不计最佳时间',
            198,
            row + 38,
            448,
            18,
            '#b9c6ad',
          );
          u.button(
            'claim',
            this.adLocked ? '等待广告关闭…' : '观看并领取',
            198,
            row + pitch,
            448,
            h,
            true,
            this.adLocked || !web.SmallGamesRewardAds?.available,
          );
          u.button(
            'cancel',
            '取消 · 返回',
            284,
            row + pitch * 2,
            276,
            h,
            false,
            this.adLocked,
            true,
          );
        } else if (this.screen === 'upgrade') {
          heading(
            this.run.choices.length ? '选择战地改装' : '改装已齐备',
            '战区已突破 · 继续推进下一战区',
            top + 22,
          );
          if (!this.run.choices.length)
            u.button('continue', '免费继续  →', 198, row + 32, 448, h, true);
          else
            this.run.choices.forEach((id: string, i: number) => {
              const item = UPGRADES.find((x: any) => x.id === id)!;
              u.button(
                'upgrade-' + id,
                `${item.name}\n${item.short}`,
                190 + i * 158,
                row + 8,
                148,
                126,
              );
            });
        } else if (this.screen === 'result') {
          const won = this.run.phase === 'won';
          heading(
            won ? (this.run.singleLevel ? '战区已突破' : '战役任务完成') : '行动失败',
            (won ? '' : '生命耗尽 · ') + sector,
            top + 22,
          );
          u.text(
            'result-time',
            `${clock(this.run.roomTime)}  /  ${this.run.kills} 击破${this.trial ? ' · 试玩' : this.run.assisted ? ' · 辅助行动' : ''}`,
            198,
            row - 3,
            448,
            23,
            '#e4d5b2',
          );
          u.button('retry', won ? '再战本关  →' : '重试本关  →', 198, row + pitch, 448, h, true);
          const revive =
            !won && !!web.SmallGamesRewardAds?.available && rewardEligible(this.run, 'revive');
          u.button(
            'home',
            '返回主页',
            198,
            row + pitch * 2,
            revive ? 218 : 448,
            h,
            false,
            false,
            true,
          );
          if (revive)
            u.button('revive', '续战 · 观看广告', 428, row + pitch * 2, 218, h, false, false, true);
        }
      }
    }
    if (this.messageLeft > 0) u.text('toast', this.message, 160, 6, 524, 19, '#ffdea0');
    if (this.ui.error) u.text('error', this.ui.error, 100, H / 2, 644, 26);
    u.end();
    if (this.ready && u.ready) web.document?.getElementById('ashfall-loading')?.remove();
  }
  snapshot() {
    const rotated =
        web.document?.getElementById('GameDiv')?.style.transform.includes('90deg') === true,
      scale = Math.min(
        rotated ? web.innerHeight / this.ui.W : web.innerWidth / this.ui.W,
        rotated ? web.innerWidth / this.ui.H : web.innerHeight / this.ui.H,
      );
    const offsetX = (web.innerWidth - (rotated ? this.ui.H : this.ui.W) * scale) / 2,
      offsetY = (web.innerHeight - (rotated ? this.ui.W : this.ui.H) * scale) / 2;
    const controls = this.ui.controls.map((b) => {
      const x = offsetX + (rotated ? (this.ui.H - b.y - b.h) * scale : b.x * scale),
        y = offsetY + (rotated ? b.x * scale : b.y * scale);
      return { ...b, x, y, w: (rotated ? b.h : b.w) * scale, h: (rotated ? b.w : b.h) * scale };
    });
    return {
      ready: this.ready && this.ui.ready,
      creator: '3.8.8',
      screen: this.screen,
      width: web.innerWidth,
      height: web.innerHeight,
      rotated,
      logicalWidth: this.ui.W,
      logicalHeight: this.ui.H,
      controls,
      trial: this.trial,
      adLocked: this.adLocked,
      rewardAvailable: !!web.SmallGamesRewardAds?.available,
      progress: structuredClone(this.progress),
      run: {
        phase: this.run.phase,
        levelIndex: this.run.levelIndex,
        player: structuredClone(this.run.player),
        roomTime: this.run.roomTime,
        time: this.run.time,
        waveIndex: this.run.waveIndex,
        capture: this.run.capture,
        checkpointComplete: this.run.checkpointComplete,
        enemies: this.run.enemies.map((e: any) => ({
          id: e.id,
          type: e.type,
          waveIndex: e.waveIndex,
          x: e.x,
          y: e.y,
          hp: e.hp,
          state: e.state,
        })),
        shots: this.run.shots,
        kills: this.run.kills,
        assisted: this.run.assisted,
        rewardUsed: { ...this.run.rewardUsed },
      },
    };
  }
  onDestroy() {
    this.rewards?.cancel();
    this.clearInput();
    this.audio?.stop();
    this.ui?.dispose();
    this.cleanups.forEach((f) => f());
    input.off(Input.EventType.TOUCH_START, this.touchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
    input.off(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
    input.off(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
    input.off(Input.EventType.MOUSE_UP, this.mouseUp, this);
    web.removeEventListener?.('touchstart', this.markTouch, true);
    input.off(Input.EventType.KEY_DOWN, this.keyDown, this);
    input.off(Input.EventType.KEY_UP, this.keyUp, this);
    game.off(Game.EVENT_HIDE, this.hide, this);
    view.off('canvas-resize', this.resize, this);
    web.removeEventListener?.('blur', this.hide);
    web.removeEventListener?.('pagehide', this.pagehide);
    web.document?.removeEventListener('visibilitychange', this.visibility);
    delete web.Ashfall;
  }
}
