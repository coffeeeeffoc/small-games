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
import { createRun, stepRun, chooseUpgrade, continueRun, LEVELS, UPGRADES } from './core/core.js';
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
          screen: ['playing', 'paused', 'upgrade', 'reward', 'result'].includes(screen)
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
    } else if (id === 'retry') this.begin(this.run.startIndex, this.run.singleLevel, this.trial);
    else if (id === 'help') {
      this.helpReturn = this.screen;
      this.setScreen('help');
    } else if (id === 'back') this.setScreen(this.helpReturn);
    else if (id === 'sound') {
      this.progress.sound = !this.progress.sound;
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
    if (!this.ready || this.adLocked) return;
    const b = this.ui.hit(p.x, p.y);
    if (!b) return;
    this.pointers.set(id, { id: b.id, ...p, dx: 0, dy: 0 });
    if (b.id === 'jump') this.jump = true;
    if (b.id === 'dash') this.dash = true;
  }
  move(id: number, p: { x: number; y: number }) {
    const a = this.pointers.get(id);
    if (a) {
      a.dx = p.x - a.x;
      a.dy = p.y - a.y;
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
    this.mouseAim = null;
  }
  keyDown(e: EventKeyboard) {
    const k = e.keyCode;
    if (k === KeyCode.ESCAPE) {
      if (this.screen === 'playing') this.action('pause');
      else if (this.screen === 'paused') this.action('resume');
      return;
    }
    if (k === KeyCode.ENTER && this.screen === 'home') {
      this.action('start');
      return;
    }
    if (!this.keys.has(k)) {
      if ([KeyCode.SPACE, KeyCode.KEY_W, KeyCode.ARROW_UP].includes(k)) this.jump = true;
      if ([KeyCode.SHIFT_LEFT, KeyCode.SHIFT_RIGHT].includes(k)) this.dash = true;
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
        let direction: { x: number; y: number } | undefined;
        if (fire && Math.hypot(fire.dx, fire.dy) > 12) direction = { x: fire.dx, y: fire.dy };
        if (this.keys.has(KeyCode.KEY_I)) direction = { x: this.run.player.facing, y: -1 };
        if (this.keys.has(KeyCode.KEY_K)) direction = { x: this.run.player.facing, y: 1 };
        stepRun(
          this.run,
          {
            move:
              Number(this.held('right', [KeyCode.KEY_D, KeyCode.ARROW_RIGHT])) -
              Number(this.held('left', [KeyCode.KEY_A, KeyCode.ARROW_LEFT])),
            fire:
              this.held('fire', [KeyCode.KEY_J, KeyCode.KEY_I, KeyCode.KEY_K]) ||
              this.held('scene-fire'),
            aim: this.mouseAim,
            aimDirection: direction,
            jump: this.jump,
            dash: this.dash,
          },
          1 / 60,
        );
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
      middle = H / 2;
    u.begin();
    u.world(
      this.run,
      ['home', 'levels', 'help'].includes(this.screen),
      this.visualTime,
      this.reduced(),
    );
    for (const e of this.effects) {
      const x = (e.x - u.cameraX) * u.worldScale,
        y = e.y * u.worldScale;
      u.circle(
        x,
        y,
        ((e.type === 'explode' ? 35 : 7) * e.life) / 0.3,
        e.type === 'explode' ? '#edb46b88' : '#fff0bccc',
      );
    }
    if (this.screen === 'home') {
      u.box(24, 30, 428, H - 60, '#101e18d9');
      u.text('title', '灰 烬 防 线', 42, 43, 390, 46);
      u.text('sub', 'A S H F A L L  F R O N T', 42, 101, 390, 18, '#c4b487');
      const bottom = H - 82,
        second = Math.min(middle + 35, bottom - 80),
        first = Math.min(middle - 39, second - 82);
      u.button(
        'start',
        this.progress.completed.length ? '继续行动  ›' : '开始行动  ›',
        50,
        first,
        360,
        68,
        true,
      );
      u.button('levels', '战区选择 · 23关', 50, second, 230);
      u.button('help', '操作', 292, second, 118);
      u.button('campaign', '从头战役', 50, bottom, 174, 60);
      u.button('sound', this.progress.sound ? '声音：开' : '声音：关', 236, bottom, 174, 60);
    } else if (this.screen === 'levels') {
      u.box(20, 18, 804, H - 36, '#102019ed');
      u.text('levels-title', '战 区 选 择  /  23关', 40, 29, 590, 29);
      u.button('home', '返回', 708, 23, 94, 60);
      const cardH = Math.min(170, H - 190),
        cardLeft = Math.max(37, u.safe.left + 8),
        cardPitch = (Math.min(807, u.safe.right - 8) - cardLeft) / 6,
        cardW = cardPitch - 9;
      for (let i = 0; i < 6; i++) {
        const index = this.page * 6 + i;
        if (index >= 23) break;
        const level = LEVELS[index],
          done = this.progress.completed.includes(level.id),
          open = index < unlockedCount(this.progress) || web.SmallGamesDev?.isEnabled();
        u.button(
          'level-' + index,
          `${String(index + 1).padStart(2, '0')}\n${level.name}\n${done ? '已完成 ✓' : open ? '可进入 ›' : '未解锁'}`,
          cardLeft + i * cardPitch,
          102,
          cardW,
          cardH,
          open && !done,
          !open,
        );
      }
      u.button('prev', '‹', 244, H - 84, 78, 60, false, this.page === 0);
      u.text('page', `${this.page + 1} / 4`, 336, H - 74, 170, 26);
      u.button('next', '›', 520, H - 84, 78, 60, false, this.page === 3);
    } else if (this.screen === 'help') {
      u.box(50, 25, 744, H - 50, '#102019ee');
      u.text('help-title', '行动指引', 90, 40, 660, 30);
      [
        '左侧方向移动；右侧跳跃、冲刺、长按开火',
        '按住射击拖向目标，自由瞄准；松手立即停止',
        '靠近金色中继，守住阵地；敌人贴近会阻断接通',
        '每处接通回复18生命；清关回复30，爆炸击杀可回收',
        '键盘 A/D 移动 · 空格跳跃 · Shift冲刺 · J/I/K射击',
      ].forEach((s, i) => u.text('help-' + i, s, 75, 92 + i * 37, 694, 22));
      u.button('back', '返回', 322, H - 95, 200, 64, true);
    } else {
      const p = this.run.player,
        wave = this.run.level.waves[this.run.waveIndex];
      u.box(20, 15, 218, 46, '#102019de');
      u.box(33, 29, (120 * p.hp) / p.maxHp, 15, '#cc9850');
      u.text('hp', `${Math.ceil(p.hp)} / ${p.maxHp}`, 158, 25, 78, 19);
      const target = this.run.checkpointComplete
        ? this.run.waveIndex + 1 < this.run.wavesTotal
          ? `向下一阵地推进  →`
          : '前往出口  →'
        : `阵地 ${this.run.waveIndex + 1}/${this.run.wavesTotal} · ${Math.floor((100 * this.run.capture) / wave.captureSeconds)}% ${this.run.contested ? '争夺中' : '接通中'}`;
      u.text(
        'mission',
        `${this.run.levelIndex + 1} / 23  ${this.run.level.name}   ${clock(this.run.roomTime)}`,
        246,
        15,
        468,
        20,
      );
      u.text('target', target, 240, 44, 475, 22, '#ffd18a');
      u.button('pause', '', 742, 15, 72, 64);
      const pause = u.controls[u.controls.length - 1];
      u.box(pause.x + 24, pause.y + 18, 6, 27, '#f1e6c6', '#f1e6c6');
      u.box(pause.x + 39, pause.y + 18, 6, 27, '#f1e6c6', '#f1e6c6');
      pause.label = '暂停';
      if (this.screen === 'playing') {
        u.button('left', '◀', 26, H - 98, 84, 78);
        u.button('right', '▶', 124, H - 98, 84, 78);
        u.button('jump', '跳跃', 524, H - 94, 82, 74);
        u.button('dash', '冲刺', 622, H - 94, 82, 74);
        u.button('fire', '开火', 720, H - 108, 96, 92, true);
      } else {
        u.box(146, 76, 552, H - 100, '#0e1e17ed');
        if (this.screen === 'paused') {
          const h = Math.min(66, (H - 186) / 3),
            rows = [136, 136 + h + 8, 136 + (h + 8) * 2];
          u.text('paused', '行动暂停', 184, 87, 476, 28);
          u.button('resume', '继续战斗', 180, rows[0], 230, h, true);
          u.button(
            'supply',
            '战地补给',
            430,
            rows[0],
            230,
            h,
            false,
            !rewardEligible(this.run, 'supply'),
          );
          u.button('retry', '重新行动', 180, rows[1], 230, h);
          u.button('home', '返回主页', 430, rows[1], 230, h);
          u.button('help', '操作', 180, rows[2], 146, h);
          u.button('sound', this.progress.sound ? '声音 开' : '声音 关', 346, rows[2], 148, h);
          u.button('motion', this.reduced() ? '动态 弱' : '动态 正常', 514, rows[2], 146, h);
        }
        if (this.screen === 'reward') {
          u.text(
            'reward-title',
            this.rewardKind === 'supply' ? '战地补给' : '续战支援',
            180,
            91,
            480,
            32,
          );
          u.text(
            'reward-copy',
            `完整观看后恢复${this.rewardKind === 'supply' ? '40%' : '50%'}生命，每关一次`,
            173,
            151,
            498,
            25,
          );
          u.text('reward-note', '辅助行动可解锁关卡，不计最佳时间', 174, 194, 496, 21, '#c8b98c');
          u.button(
            'claim',
            this.adLocked
              ? '等待广告关闭…'
              : web.SmallGamesRewardAds?.available
                ? '观看并领取'
                : '补给暂不可用',
            229,
            238,
            386,
            66,
            true,
            this.adLocked || !web.SmallGamesRewardAds?.available,
          );
          u.button('cancel', '取消 · 返回行动', 266, H - 84, 312, 60, false, this.adLocked);
        }
        if (this.screen === 'upgrade') {
          u.text(
            'upgrade',
            this.run.choices.length ? '选择改装 · 下一战区' : '改装已齐备 · 免费继续',
            170,
            91,
            504,
            27,
          );
          if (!this.run.choices.length) u.button('continue', '继续推进', 265, 183, 314, 76, true);
          else
            this.run.choices.forEach((id: string, i: number) => {
              const item = UPGRADES.find((x: any) => x.id === id)!;
              u.button(
                'upgrade-' + id,
                `${item.name}\n${item.short}`,
                170 + i * 168,
                160,
                156,
                130,
                true,
              );
            });
        }
        if (this.screen === 'result') {
          u.text(
            'result',
            this.run.phase === 'won'
              ? this.run.singleLevel
                ? '战区已突破'
                : '战役任务完成'
              : '行动中断',
            180,
            91,
            480,
            32,
          );
          u.text(
            'result-time',
            `${clock(this.run.time)} · ${this.run.kills}击破 ${this.trial ? '· 试玩' : this.run.assisted ? '· 辅助行动' : ''}`,
            180,
            146,
            480,
            24,
          );
          u.button('retry', '再次行动', 180, 208, 230, 67, true);
          u.button('levels', '战区选择', 430, 208, 230, 67);
          u.button(
            this.run.phase === 'lost' ? 'revive' : 'home',
            this.run.phase === 'lost' ? '续战支援' : '返回主页',
            265,
            H - 84,
            314,
            60,
            false,
            this.run.phase === 'lost' && !rewardEligible(this.run, 'revive'),
          );
        }
      }
    }
    if (this.messageLeft > 0) u.text('toast', this.message, 140, H - 146, 564, 22, '#ffdea0');
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
