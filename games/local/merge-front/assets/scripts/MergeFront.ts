import {
  _decorator,
  AudioClip,
  AudioSource,
  Component,
  EventMouse,
  EventTouch,
  Game,
  Input,
  game,
  input,
  resources,
  sys,
  view,
  VERSION,
} from 'cc';
import { CATALOG, CHAPTERS, LEVELS, getSpec, type Kind } from './core/content.ts';
import {
  command,
  createMatch,
  restore,
  snapshot,
  step,
  TICK_RATE,
  type Action,
  type Match,
} from './core/engine.ts';
import {
  createProgress,
  isUnlocked,
  readProgress,
  settleProgress,
  type Progress,
  type Settlement,
} from './core/progress.ts';
import {
  createRewardController,
  type RewardController,
  type RewardResult,
} from './core/rewards.ts';
import { C, H, W, MergeView } from './MergeView';

const { ccclass } = _decorator;
const SAVE = 'merge-front:progress:v2',
  RUN = 'merge-front:match:v2';
type Screen =
  | 'home'
  | 'levels'
  | 'prepare'
  | 'playing'
  | 'paused'
  | 'result'
  | 'codex'
  | 'detail'
  | 'help'
  | 'settings';
type Dev = {
  isEnabled(): boolean;
  registerSnapshot(fn: () => unknown): () => void;
  registerActions(actions: { id: string; label: string; run(): void }[]): () => void;
};
type RewardPort = {
  available?: boolean;
  offer(request: { id: string; reward: Record<string, string | number> }): Promise<RewardResult>;
  cancel?(): void;
};
const platform = globalThis as typeof globalThis & {
  SmallGamesDev?: Dev;
  SmallGamesRewardAds?: RewardPort;
  __mergeFront?: { snapshot(): unknown };
  MergeFrontHost?: { ads?: RewardPort };
};
type Press = { id: number; control: string; x: number; y: number; moved: boolean };

@ccclass('MergeFront')
export class MergeFront extends Component {
  ui!: MergeView;
  progress: Progress = createProgress();
  match: Match | null = null;
  screen: Screen = 'home';
  returnScreen: Screen = 'home';
  chapter = 1;
  levelId = LEVELS[0].id;
  deck: string[] = ['nezha', 'fire'];
  selected = 0;
  selectedPart = '';
  recipes = false;
  codexKind: Kind = 'hero';
  detail = 'nezha';
  demo = false;
  practice = false;
  press: Press | null = null;
  pointer = { x: 0, y: 0 };
  time = 0;
  accumulator = 0;
  lastTouch = -10;
  lastSave = 0;
  lastEvent = 0;
  feedback = '';
  feedbackUntil = 0;
  settlement: Settlement = { settled: false, unlocks: [], medals: 0 };
  rewards?: RewardController;
  rewardPending = false;
  disposed = false;
  audio!: AudioSource;
  clips: Record<string, AudioClip> = {};
  unregister: (() => void)[] = [];
  accessibility?: HTMLDivElement;
  fullscreen?: HTMLButtonElement;
  accessibilityKey = '';
  inputCount = 0;
  start() {
    view.enableAutoFullScreen(false);
    view.resizeWithBrowserSize(true);
    this.progress = readProgress(this.read(SAVE) || this.read('merge-front:preferences:v1'));
    try {
      const saved = this.read(RUN);
      if (saved) {
        const restored = restore(saved);
        if (
          restored.phase === 'running' &&
          !restored.practice &&
          isUnlocked(this.progress, restored.levelId)
        ) {
          this.match = restored;
          this.match.paused = true;
          this.levelId = restored.levelId;
          this.deck = [...restored.sides[0].deck];
        }
      }
    } catch {
      this.notify('上次对局无法恢复，关卡进度已保留');
    }
    this.chapter = Math.ceil(this.progress.unlockedLevel / 5);
    this.ui = new MergeView(this.node);
    this.audio = this.node.addComponent(AudioSource);
    for (const key of ['click', 'merge', 'win'])
      resources.load('audio/' + key, AudioClip, (error, clip) => {
        if (!error && !this.disposed) this.clips[key] = clip;
      });
    input.on(Input.EventType.TOUCH_START, this.touchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.clear, this);
    input.on(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
    input.on(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
    input.on(Input.EventType.MOUSE_UP, this.mouseUp, this);
    game.on(Game.EVENT_HIDE, this.suspend, this);
    if (sys.isBrowser) {
      window.addEventListener('blur', this.suspend);
      window.addEventListener('pagehide', this.pageHide);
      document.addEventListener('visibilitychange', this.visibility);
      this.accessibility = document.createElement('div');
      this.accessibility.id = 'merge-front-app';
      this.accessibility.setAttribute('aria-label', '神机合阵');
      this.accessibility.style.cssText =
        'position:fixed;left:-10000px;width:1px;height:1px;overflow:hidden';
      document.body.append(this.accessibility);
      this.fullscreen = document.createElement('button');
      this.fullscreen.dataset.gameFullscreen = '';
      this.fullscreen.tabIndex = -1;
      this.fullscreen.style.cssText = 'position:fixed;left:-10000px';
      document.body.append(this.fullscreen);
      platform.__mergeFront = { snapshot: () => this.inspect() };
    }
    if (platform.SmallGamesDev) {
      this.unregister.push(platform.SmallGamesDev.registerSnapshot(() => this.inspect()));
      this.unregister.push(
        platform.SmallGamesDev.registerActions([
          {
            id: 'merge-levels',
            label: '试玩全部关卡（不存进度）',
            run: () => {
              if (platform.SmallGamesDev?.isEnabled()) {
                this.practice = true;
                this.goto('levels');
              }
            },
          },
          {
            id: 'merge-final',
            label: '试玩最终关（不存进度）',
            run: () => {
              if (platform.SmallGamesDev?.isEnabled()) {
                this.practice = true;
                this.prepare(LEVELS[29].id);
              }
            },
          },
          {
            id: 'merge-test-rank',
            label: '当前兵符升至100级（不存进度）',
            run: () => {
              if (platform.SmallGamesDev?.isEnabled() && this.match) {
                this.practice = true;
                this.match.practice = true;
                this.match.sides[0].slots[this.selected].level = 100;
                this.notify('试玩等级 100');
              }
            },
          },
        ]),
      );
    }
    this.render();
  }
  read(key: string) {
    try {
      return sys.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  save() {
    try {
      sys.localStorage.setItem(SAVE, JSON.stringify(this.progress));
      if (this.match?.phase === 'running' && !this.match.practice)
        sys.localStorage.setItem(RUN, JSON.stringify(snapshot(this.match)));
      else sys.localStorage.removeItem(RUN);
    } catch {
      /* Storage is optional; the current local match stays playable. */
    }
  }
  notify(text: string) {
    this.feedback = text;
    this.feedbackUntil = this.time + 3;
  }
  sound(key = 'click') {
    if (this.progress.sound && this.clips[key]) this.audio.playOneShot(this.clips[key], 0.4);
  }
  vibrate() {
    if (!this.progress.vibration) return;
    const host = globalThis as typeof globalThis & {
      wx?: { vibrateShort(options: { type: string }): void };
      tt?: { vibrateShort(options: { type: string }): void };
    };
    try {
      const sdk = host.wx || host.tt;
      if (sdk) sdk.vibrateShort({ type: 'light' });
      else if (sys.isBrowser) navigator.vibrate?.(12);
    } catch {}
  }
  clear = () => {
    this.press = null;
    this.selectedPart = '';
    if (this.ui) this.ui.pressed = '';
  };
  suspend = () => {
    this.clear();
    this.accumulator = 0;
    this.audio?.stop();
    if (this.match?.phase === 'running') {
      this.match.paused = true;
      if (this.screen === 'playing') this.goto('paused');
    }
    this.save();
  };
  visibility = () => {
    if (document.hidden) this.suspend();
  };
  pageHide = () => {
    this.suspend();
    this.rewards?.cancel();
    platform.SmallGamesRewardAds?.cancel?.();
  };
  goto(screen: Screen) {
    this.clear();
    this.screen = screen;
    this.recipes = false;
    if (this.match) this.match.paused = screen !== 'playing';
    if (sys.isBrowser) {
      document.body.dataset.screen = screen;
      window.parent.postMessage(
        {
          type: 'small-games:display-state',
          gameId: 'merge-front',
          screen: ['playing', 'paused'].includes(screen) ? 'playing' : 'home',
        },
        '*',
      );
    }
    this.render();
  }
  prepare(id: string) {
    if (!this.practice && !isUnlocked(this.progress, id)) return;
    this.levelId = id;
    const allowed = LEVELS.find((l) => l.id === id)!.allowed;
    this.deck = this.deck.filter((key) => allowed.includes(key));
    for (const kind of ['hero', 'weapon'] as const)
      if (!this.deck.some((key) => getSpec(key).kind === kind))
        this.deck.push(allowed.find((key) => getSpec(key).kind === kind)!);
    this.goto('prepare');
  }
  begin(tutorial = this.progress.tutorialStep < 6 && this.levelId === LEVELS[0].id) {
    this.rewards?.dispose();
    platform.SmallGamesRewardAds?.cancel?.();
    this.match = createMatch(this.levelId, Date.now() >>> 0, this.deck, {
      tutorial,
      practice: this.practice,
    });
    this.rewardPending = false;
    this.selected = 0;
    this.lastEvent = 0;
    this.accumulator = 0;
    this.settlement = { settled: false, unlocks: [], medals: 0 };
    this.goto('playing');
    this.save();
  }
  act(action: Action) {
    if (!this.match || this.rewardPending) return;
    const result = command(this.match, 0, action);
    if (!result.ok) this.notify(result.message);
    else {
      this.sound(['fill', 'fillAll', 'merge'].includes(action.type) ? 'merge' : 'click');
      if (['fill', 'fillAll', 'merge'].includes(action.type)) this.vibrate();
      if (action.type === 'draw')
        this.notify(action.kind === 'hero' ? '神将残字已入库' : '武器残字已入库');
      if (!this.match.practice)
        this.progress.tutorialStep = Math.max(this.progress.tutorialStep, this.match.tutorialStep);
      this.save();
    }
    this.render();
  }
  provider() {
    return platform.MergeFrontHost?.ads || platform.SmallGamesRewardAds;
  }
  async reward() {
    const match = this.match,
      provider = this.provider();
    if (
      !match ||
      !provider ||
      provider.available === false ||
      this.rewardPending ||
      match.sides[0].boostUsed
    )
      return;
    this.rewardPending = true;
    this.clear();
    match.paused = true;
    this.rewards?.dispose();
    this.rewards = createRewardController(match, () =>
      provider.offer({
        id: 'merge-front:income-boost',
        reward: { incomePercent: 20, durationSeconds: 30, matchId: match.id },
      }),
    );
    this.render();
    const result = await this.rewards.request();
    if (this.disposed || this.match !== match) return;
    this.rewardPending = false;
    this.notify(
      result.status === 'completed'
        ? '助力已就绪：灵石产出 +20%，持续30秒'
        : result.status === 'dismissed'
          ? '未完成观看，未领取助力'
          : '暂时无法领取助力，可直接继续战斗',
    );
    this.save();
    this.render();
  }
  allowedTutorial(id: string) {
    const m = this.match;
    if (!m?.tutorial || m.tutorialStep >= 5 || ['pause', 'skip'].includes(id)) return true;
    if (m.tutorialStep === 0) return id === 'draw:hero';
    if (m.tutorialStep === 2) return false;
    const slot = m.tutorialStep === 3 ? 3 : 0;
    return (
      id === 'slot:' + slot ||
      id === 'fill' ||
      id.startsWith('part:' + m.sides[0].slots[slot].key + ':')
    );
  }
  action(id: string) {
    if (this.rewardPending && id !== 'reward-close') return;
    if (this.screen === 'playing' && !this.allowedTutorial(id)) return;
    if (id === 'load-retry') {
      this.ui.load();
      return;
    }
    if (id === 'start') {
      if (this.match?.phase === 'running') {
        this.levelId = this.match.levelId;
        this.deck = [...this.match.sides[0].deck];
        this.goto('playing');
        return;
      }
      this.prepare(LEVELS[this.progress.unlockedLevel - 1].id);
    } else if (id === 'levels') {
      this.practice = false;
      this.chapter = Math.ceil(this.progress.unlockedLevel / 5);
      this.goto('levels');
    } else if (id === 'home') {
      if (this.match?.practice) {
        this.rewards?.dispose();
        this.match = null;
      }
      this.practice = false;
      this.save();
      this.goto('home');
    } else if (id === 'back') this.goto(this.returnScreen);
    else if (id.startsWith('chapter:')) this.chapter = Number(id.split(':')[1]);
    else if (id.startsWith('level:')) this.prepare(id.slice(6));
    else if (id.startsWith('deck:')) {
      const key = id.slice(5),
        spec = getSpec(key);
      if (!LEVELS.find((l) => l.id === this.levelId)!.allowed.includes(key)) return;
      if (this.deck.includes(key)) {
        if (this.deck.filter((k) => getSpec(k).kind === spec.kind).length > 1)
          this.deck = this.deck.filter((k) => k !== key);
      } else if (
        this.deck.filter((k) => getSpec(k).kind === spec.kind).length <
        (spec.kind === 'hero' ? 3 : 2)
      )
        this.deck.push(key);
      else
        this.notify(
          spec.kind === 'hero' ? '最多选择3位神将，可先取消一位' : '最多选择2种武器，可先取消一种',
        );
    } else if (id === 'begin') this.begin();
    else if (id === 'pause') {
      this.goto('paused');
      this.save();
    } else if (id === 'resume') this.goto('playing');
    else if (id === 'retry') {
      if (this.match) this.levelId = this.match.levelId;
      this.begin(false);
    } else if (id === 'next') {
      const n = LEVELS.find((l) => l.id === this.match?.levelId)!.number;
      this.practice = false;
      if (n === 30) this.goto('levels');
      else this.prepare(LEVELS[n].id);
    } else if (id.startsWith('draw:')) this.act({ type: 'draw', kind: id.slice(5) as Kind });
    else if (id.startsWith('slot:')) {
      const slot = Number(id.slice(5));
      if (this.selectedPart) {
        this.act({ type: 'fill', slot, part: this.selectedPart });
        this.selectedPart = '';
      }
      this.selected = slot;
      this.recipes = false;
    } else if (id.startsWith('part:') && this.match) {
      const part = id.slice(5),
        [key, index] = part.split(':');
      if (this.match.sides[0].bag[part]) this.selectedPart = this.selectedPart === part ? '' : part;
      else this.act({ type: 'exchange', key, index: Number(index) });
    } else if (id === 'fill') this.act({ type: 'fillAll', slot: this.selected });
    else if (id === 'recipes') this.recipes = !this.recipes;
    else if (id.startsWith('recipe:')) {
      this.act({ type: 'recipe', slot: this.selected, key: id.slice(7) });
      this.recipes = false;
    } else if (id === 'withdraw') this.act({ type: 'withdraw', slot: this.selected });
    else if (id === 'skip') {
      this.act({ type: 'skipTutorial' });
      if (!this.match?.practice) this.progress.tutorialStep = 6;
      this.save();
    } else if (id === 'codex' || id === 'help' || id === 'settings') {
      this.returnScreen =
        this.screen === 'paused' ? 'paused' : this.screen === 'prepare' ? 'prepare' : 'home';
      this.goto(id);
    } else if (id.startsWith('kind:')) this.codexKind = id.slice(5) as Kind;
    else if (id.startsWith('detail:')) {
      this.detail = id.slice(7);
      this.demo = false;
      this.goto('detail');
    } else if (id === 'codex-back') this.goto('codex');
    else if (id === 'demo') {
      this.demo = !this.demo;
      this.sound('merge');
    } else if (id === 'unlock') {
      this.chapter = Math.ceil(Math.max(1, getSpec(this.detail).unlock) / 5);
      this.goto('levels');
    } else if (id === 'tutorial') {
      this.practice = true;
      this.levelId = LEVELS[0].id;
      this.deck = ['nezha', 'fire'];
      this.begin(true);
    } else if (id === 'sound') {
      this.progress.sound = !this.progress.sound;
      this.save();
    } else if (id === 'vibration') {
      this.progress.vibration = !this.progress.vibration;
      this.save();
    } else if (id === 'fullscreen') this.fullscreen?.click();
    else if (id === 'reward') void this.reward();
    else if (id === 'reward-close') {
      this.rewards?.cancel();
      this.provider()?.cancel?.();
    }
    this.render();
  }
  update(dt: number) {
    this.time += Math.min(dt, 0.1);
    const m = this.match;
    if (m && this.screen === 'playing' && !this.rewardPending && !m.paused) {
      const lessonPause = m.tutorial && [0, 1, 3, 4].includes(m.tutorialStep);
      if (!lessonPause) {
        this.accumulator += Math.min(dt, 0.25);
        while (this.accumulator >= 1 / TICK_RATE && m.phase === 'running') {
          step(m);
          this.accumulator -= 1 / TICK_RATE;
        }
      } else {
        this.accumulator = 0;
        if (m.tutorialStep === 3) this.selected = 3;
        else if (m.tutorialStep === 1 || m.tutorialStep === 4) this.selected = 0;
      }
      if (!m.practice)
        this.progress.tutorialStep = Math.max(this.progress.tutorialStep, m.tutorialStep);
      if (m.phase !== 'running') {
        this.settlement = settleProgress(this.progress, m);
        this.sound(m.phase === 'won' ? 'win' : 'click');
        this.goto('result');
        this.save();
      } else if (this.time - this.lastSave > 3) {
        this.lastSave = this.time;
        this.save();
      }
    }
    if (this.ui) this.render();
  }
  header(title: string, back = 'back') {
    this.ui.panel(0, 0, W, 82, '#123d37ed', '', 0);
    this.ui.button(back, '返回', 20, 8, 116, 72);
    this.ui.text('title', title, 480, 40, 32, 640, C.gold);
  }
  render() {
    if (!this.ui || this.disposed) return;
    const u = this.ui;
    u.begin();
    if (!u.ready) {
      u.panel(0, 0, W, H, C.deep, '', 0);
      u.text('loading', u.error || '正在唤醒云上工坊…', 480, 245, 34, 800);
      if (u.error) u.button('load-retry', '重新加载', 340, 320, 280, 84, true);
      u.end();
      this.syncAccessibility();
      return;
    }
    const battle = ['playing', 'paused', 'result'].includes(this.screen) && this.match;
    u.image(
      'background',
      battle ? 'field' : 'home',
      480,
      battle ? 188 : 270,
      960,
      battle ? 380 : 540,
      0,
    );
    if (battle) this.battlefield();
    if (this.screen === 'home') this.homeView();
    else if (this.screen === 'levels') this.levelView();
    else if (this.screen === 'prepare') this.prepareView();
    else if (this.screen === 'playing') this.workshop();
    else if (this.screen === 'codex') this.codexView();
    else if (this.screen === 'detail') this.detailView();
    else if (this.screen === 'paused') this.pauseView();
    else if (this.screen === 'result') this.resultView();
    else if (this.screen === 'help') this.helpView();
    else if (this.screen === 'settings') this.settingsView();
    if (this.feedbackUntil > this.time) {
      u.panel(210, 84, 540, 52, '#102f2beb', C.gold, 16, 6);
      u.text('toast', this.feedback, 480, 110, 22, 520, C.paper, 7, 48);
    }
    if (this.press?.moved && this.press.control.startsWith('part:')) {
      const [key, index] = this.press.control.slice(5).split(':');
      u.panel(this.pointer.x - 40, this.pointer.y - 55, 80, 80, C.paper, C.gold, 15, 6);
      u.text(
        'drag',
        getSpec(key).parts[Number(index)],
        this.pointer.x,
        this.pointer.y - 15,
        44,
        80,
        C.ink,
        7,
      );
    }
    u.end();
    this.syncAccessibility();
  }
  homeView() {
    const u = this.ui;
    u.image('hero-home', 'unit0', 250, 293 + Math.sin(this.time * 2) * 4, 390, 340, 1);
    u.panel(483, 58, 420, 325, '#123d37e8', C.gold, 30);
    u.text('home-title', '神机合阵', 694, 132, 66, 400, C.gold, 5, 100);
    u.text('home-sub', '残字唤神将 · 合阵破天关', 694, 206, 25, 400);
    u.text(
      'home-progress',
      '第 ' + this.progress.unlockedLevel + ' 关  /  30',
      694,
      258,
      24,
      360,
      C.mint,
    );
    u.button(
      'start',
      this.match?.phase === 'running' ? '继续战斗' : '继续征战',
      526,
      295,
      338,
      80,
      true,
    );
    [
      ['levels', '选关'],
      ['codex', '图鉴'],
      ['help', '玩法'],
      ['settings', '设置'],
    ].forEach(([id, label], i) => u.button(id, label, 45 + i * 225, 438, 195, 78));
  }
  levelView() {
    const u = this.ui;
    this.header('云海征途', 'home');
    CHAPTERS.forEach((chapter, i) =>
      u.button(
        'chapter:' + chapter.id,
        chapter.title,
        18 + i * 157,
        94,
        145,
        76,
        this.chapter === chapter.id,
      ),
    );
    const levels = LEVELS.filter((l) => l.chapter === this.chapter);
    levels.forEach((level, i) => {
      const x = 110 + i * 185,
        y = 274 + [22, -14, 20, -10, 18][i],
        open = this.practice || isUnlocked(this.progress, level.id);
      if (i) u.line(x - 137, y, x - 50, y, C.paper, 5, 2);
      u.circle(x, y + 13, 55, '#123d37aa');
      u.circle(x, y, 49, open ? C.ink : '#576761', open ? C.gold : '#a5afa0');
      u.text(
        'level:' + i,
        open ? String(level.number) : '锁',
        x,
        y,
        38,
        90,
        open ? C.gold : C.muted,
      );
      u.text('level-name:' + i, level.title, x, y + 78, 23, 175);
      u.text(
        'medal:' + i,
        this.progress.medals[level.id]
          ? '★'.repeat(this.progress.medals[level.id])
          : open
            ? '可挑战'
            : '通关前关解锁',
        x,
        y + 111,
        20,
        175,
        C.gold,
      );
      u.hit(
        'level:' + level.id,
        '第' + level.number + '关 ' + level.title,
        x - 65,
        y - 60,
        130,
        155,
        !open,
      );
    });
    const rewards = levels
      .flatMap((l) => l.unlocks)
      .map((k) => getSpec(k).name)
      .join(' · ');
    u.panel(100, 452, 760, 60, C.ink, C.gold, 18);
    u.text('chapter-rewards', '本章解锁  ' + rewards, 480, 482, 24, 730);
  }
  prepareView() {
    const u = this.ui,
      level = LEVELS.find((l) => l.id === this.levelId)!;
    this.header('第' + level.number + '关 · ' + level.title, 'levels');
    u.button('codex', '图鉴', 800, 8, 140, 72);
    u.text(
      'hero-group',
      '神将 ' + this.deck.filter((k) => getSpec(k).kind === 'hero').length + '/3',
      250,
      108,
      26,
      400,
      C.gold,
    );
    u.text(
      'weapon-group',
      '武器 ' + this.deck.filter((k) => getSpec(k).kind === 'weapon').length + '/2',
      710,
      108,
      26,
      400,
      C.gold,
    );
    CATALOG.forEach((spec, n) => {
      const i = n % 8,
        x = (n < 8 ? 30 : 500) + (i % 4) * 108,
        y = 137 + Math.floor(i / 4) * 130;
      const open = level.allowed.includes(spec.id),
        selected = this.deck.includes(spec.id);
      u.panel(x, y, 99, 120, selected ? '#3a7866' : C.ink, selected ? C.gold : '#789b82', 14);
      u.image(
        'deck:' + spec.id,
        'unit' + spec.atlas,
        x + 50,
        y + 47,
        85,
        73,
        4,
        false,
        open ? '#ffffff' : '#233e36',
      );
      u.text(
        'deck-name:' + spec.id,
        open ? spec.name : '第' + spec.unlock + '关解锁',
        x + 50,
        y + 96,
        open ? 21 : 17,
        97,
        open ? C.paper : C.muted,
      );
      if (selected) u.text('chosen:' + spec.id, '✓', x + 83, y + 18, 25, 30, C.gold);
      u.hit('deck:' + spec.id, spec.name, x, y, 99, 120, !open);
    });
    u.text(
      'opponent',
      '对手：' +
        { expand: '扩军推进', focus: '集中升级', balanced: '稳扎稳打', counter: '灵活应变' }[
          level.ai.style
        ],
      250,
      450,
      24,
      430,
    );
    u.button('begin', '出阵', 570, 433, 330, 83, true);
  }
  battlefield() {
    const u = this.ui,
      m = this.match!;
    u.panel(0, 0, 960, 68, '#123d37ef', '', 0);
    for (const side of [0, 1]) {
      const s = m.sides[side],
        x = side === 0 ? 22 : 570;
      u.progress(x, 28, 280, s.crystalHp / s.maxCrystalHp, side ? C.red : C.mint, 22);
      u.text(
        'core:' + side,
        (side ? '敌晶 ' : '我方 ') + Math.ceil(s.crystalHp) + '/' + s.maxCrystalHp,
        x + 140,
        39,
        20,
        270,
      );
      u.crystal(side ? 880 : 80, 211, !!side, this.time * 3);
    }
    u.text(
      'clock',
      Math.floor(m.tick / 1200)
        .toString()
        .padStart(2, '0') +
        ':' +
        (Math.floor(m.tick / 20) % 60).toString().padStart(2, '0'),
      436,
      31,
      26,
      160,
      C.gold,
    );
    if (m.tick >= 4800) u.text('exposure', '晶核暴露', 436, 61, 18, 160, C.red);
    for (const unit of [...m.units].sort((a, b) => a.y - b.y || a.id - b.id)) {
      const spec = getSpec(unit.key),
        x = 46 + unit.x * 0.868,
        y = 85 + unit.y * 0.65;
      const bob =
        unit.anim === 'move'
          ? Math.sin(this.time * 12 + unit.id) * 3
          : Math.sin(this.time * 3 + unit.id) * 1;
      const attacking = unit.anim === 'attack' || unit.anim === 'skill';
      const size = spec.kind === 'hero' ? 61 : 54;
      u.circle(x, y + 13, 15, unit.side ? '#ad364fbb' : '#1b9c8bbb', '', 2);
      u.image(
        'troop:' + unit.id,
        'unit' + spec.atlas,
        x + (attacking ? Math.sin(this.time * 26) * 3 : 0),
        y - 13 + bob,
        size * 1.15,
        size,
        1,
        unit.side === 1,
        unit.anim === 'hit' ? '#ffd0b0' : '#ffffff',
        attacking ? Math.sin(this.time * 20) * 6 : 0,
      );
      u.progress(x - 22, y - 47, 44, unit.hp / unit.maxHp, unit.side ? C.red : C.mint, 4, 2);
      if (unit.level > 1)
        u.text('rank:' + unit.id, String(unit.level), x, y - 57, 14, 50, C.gold, 2, 20);
      if (attacking && unit.targetId) {
        const t = m.units.find((v) => v.id === unit.targetId);
        if (t && unit.range > 80)
          u.line(
            x,
            y - 13,
            46 + t.x * 0.868,
            72 + t.y * 0.65,
            spec.special === 'slow' ? '#a9e9ff' : C.gold,
            2,
            2,
          );
      }
    }
    for (const e of m.events.filter(
      (e) => m.tick - e.tick < 8 && ['hit', 'death', 'spawn'].includes(e.type),
    )) {
      const age = (m.tick - e.tick) / 8,
        x = 46 + e.x * 0.868,
        y = 85 + e.y * 0.65;
      if (e.type === 'hit') u.circle(x, y - 12, 4 + age * 8, '#fff1b888', '', 2);
      else u.circle(x, y + 12, 15 + age * 14, '#63d6b54c', age < 0.5 ? C.gold : '', 2);
    }
  }
  workshop() {
    const u = this.ui,
      m = this.match!,
      side = m.sides[0];
    u.pause(872, 4);
    u.panel(0, 332, 960, 208, C.deep, C.gold, 0);
    u.text('coins', '◆ ' + Math.floor(side.coins), 79, 354, 29, 150, C.gold);
    u.button('draw:hero', '求将 30', 10, 378, 138, 72, true, side.coins < 30);
    u.button('draw:weapon', '铸器 30', 10, 457, 138, 72, true, side.coins < 30);
    side.slots.forEach((slot, i) => {
      const spec = getSpec(slot.key),
        x = 163 + i * 158;
      u.panel(
        x,
        344,
        149,
        86,
        i === this.selected ? '#347562' : C.ink,
        i === this.selected ? C.gold : '#618679',
        13,
      );
      u.image(
        'slot:' + i,
        'unit' + spec.atlas,
        x + 34,
        380,
        58,
        57,
        4,
        false,
        slot.level ? '#ffffff' : '#819b88',
      );
      u.text('slot-name:' + i, spec.name, x + 102, 362, 20, 92);
      u.text(
        'slot-rank:' + i,
        slot.level ? 'Lv.' + slot.level : '待拼装',
        x + 103,
        386,
        22,
        94,
        C.gold,
      );
      u.text(
        'slot-parts:' + i,
        spec.parts.map((p, j) => (slot.parts[j] ? p : '□')).join(''),
        x + 75,
        414,
        21,
        140,
        C.paper,
      );
      if (slot.level) u.progress(x + 6, 432, 137, slot.progress / spec.production, C.mint, 5);
      u.hit('slot:' + i, spec.name + '兵符 ' + slot.level + '级', x, 344, 149, 94);
    });
    const slot = side.slots[this.selected],
      spec = getSpec(slot.key);
    if (this.recipes) {
      side.deck
        .filter((k) => getSpec(k).kind === spec.kind)
        .forEach((key, i) =>
          u.button(
            'recipe:' + key,
            getSpec(key).name,
            175 + i * 160,
            450,
            150,
            78,
            false,
            slot.level > 0,
          ),
        );
      u.button('withdraw', '取回残字', 666, 450, 140, 78);
      u.button('recipes', '返回', 816, 450, 130, 78);
    } else {
      spec.parts.forEach((part, i) => {
        const key = spec.id + ':' + i,
          count = side.bag[key] || 0,
          x = 177 + i * 112;
        u.panel(x, 451, 100, 77, this.selectedPart === key ? '#f3cb79' : '#fff2cf', C.gold, 12);
        u.text('glyph:' + i, part, x + 50, 476, 35, 90, C.ink);
        u.text('amount:' + i, count ? '×' + count : '3换1', x + 50, 510, 18, 90, C.ink);
        u.hit('part:' + key, part + '残字，' + count + '枚', x, 451, 100, 77);
      });
      u.button('fill', '填入残字', 638, 451, 148, 77, true);
      u.button('recipes', slot.level ? '调整残字' : '换配方', 800, 451, 146, 77);
    }
    if (side.buffTicks)
      u.text(
        'boost',
        '灵石 +20% · ' + Math.ceil(side.buffTicks / 20) + '秒',
        700,
        315,
        20,
        360,
        C.gold,
      );
    if (m.tutorial && m.tutorialStep < 6) {
      const tips = [
        '点击「求将」，获得新的姓名残字',
        '把残字拖到第一个兵符，唤醒哪吒',
        '看！哪吒正在从水晶出阵',
        '点选武器兵符，填入离火铳的残字',
        '再填一套哪吒残字，等级直接 +1',
        '击破敌方水晶，赢得胜利',
      ];
      u.panel(170, 78, 610, 56, '#123d37ee', C.gold, 16, 6);
      u.text('tutorial', tips[m.tutorialStep], 475, 106, 24, 590, C.paper, 7, 54);
      u.button('skip', '跳过', 804, 84, 136, 76, false, false, 6);
    }
  }
  codexView() {
    const u = this.ui;
    this.header('神机图鉴');
    u.text('title', '神机图鉴', 360, 40, 32, 360, C.gold);
    u.button('kind:hero', '神将', 598, 8, 156, 70, this.codexKind === 'hero');
    u.button('kind:weapon', '武器', 770, 8, 166, 70, this.codexKind === 'weapon');
    CATALOG.filter((s) => s.kind === this.codexKind).forEach((spec, i) => {
      const x = 42 + (i % 4) * 225,
        y = 100 + Math.floor(i / 4) * 208,
        open = this.progress.unlockedIds.includes(spec.id);
      u.panel(x, y, 201, 190, C.ink, open ? C.gold : '#789181', 20);
      u.image(
        'codex:' + spec.id,
        'unit' + spec.atlas,
        x + 100,
        y + 78,
        127,
        115,
        4,
        false,
        open ? '#ffffff' : '#243e35',
      );
      u.text('codex-name:' + i, spec.name, x + 100, y + 145, 26, 190, open ? C.gold : C.muted);
      u.text(
        'codex-role:' + i,
        open ? spec.role : '第' + spec.unlock + '关通关解锁',
        x + 100,
        y + 173,
        18,
        190,
      );
      u.hit('detail:' + spec.id, spec.name + '图鉴', x, y, 201, 190);
    });
  }
  detailView() {
    const u = this.ui,
      spec = getSpec(this.detail),
      open = this.progress.unlockedIds.includes(spec.id);
    this.header(spec.name, 'codex-back');
    u.panel(450, 108, 470, 408, '#123d37ee', C.gold, 24);
    u.circle(225, 423, 110, '#214d3caa', C.gold, 2);
    u.image(
      'detail-hero',
      'unit' + spec.atlas,
      225,
      280 + (this.demo ? Math.sin(this.time * 8) * 8 : Math.sin(this.time * 2) * 3),
      370,
      320,
      1,
      false,
      open ? '#ffffff' : '#314e41',
      this.demo ? Math.sin(this.time * 12) * 5 : 0,
    );
    if (this.demo)
      for (let i = 0; i < 8; i++)
        u.circle(
          230 + Math.cos(this.time * 3 + i) * 120,
          350 + Math.sin(this.time * 3 + i) * 45,
          6,
          C.gold,
          '',
          2,
        );
    u.text('role', spec.role + ' · ' + spec.skill, 685, 150, 25, 440, C.gold);
    u.text(
      'usage',
      '出阵 ' +
        (this.progress.uses[spec.id] || 0) +
        ' 局 · 最高 Lv.' +
        (this.progress.maxLevels[spec.id] || 0),
      685,
      186,
      19,
      430,
      C.muted,
    );
    u.text('recipe-title', '残字配方', 685, 214, 22, 400);
    spec.parts.forEach((part, i) => {
      const x = 685 - spec.parts.length * 42 + i * 84;
      u.panel(x, 246, 70, 72, C.paper, C.gold, 12);
      u.text('recipe-part:' + i, part, x + 35, 282, 38, 68, C.ink);
    });
    u.text(
      'detail-info',
      open
        ? (spec.range >= 140
            ? '远程输出，搭配巨灵神或护阵车承伤'
            : spec.hp >= 390
              ? '前排推进，搭配杨戬或震雷炮输出'
              : '清理近处敌群，搭配远程机关推进') +
            '\n生命 ' +
            spec.hp +
            ' · 攻击 ' +
            spec.damage +
            ' · 出兵 ' +
            spec.production +
            '秒'
        : '通关第' + spec.unlock + '关后解锁\n解锁后可加入你的出阵残字池',
      685,
      362,
      23,
      430,
      C.paper,
      5,
      80,
    );
    u.button(
      open ? 'demo' : 'unlock',
      open ? (this.demo ? '结束演示' : '动作预览') : '查看解锁章节',
      510,
      427,
      350,
      76,
      true,
    );
  }
  pauseView() {
    const u = this.ui;
    u.panel(0, 0, W, H, '#0c242bd9', '', 0, 6);
    u.panel(220, 40, 520, 470, C.ink, C.gold, 28, 6);
    u.text('paused', '暂停', 480, 94, 44, 440, C.gold, 7);
    if (!this.rewardPending) {
      u.button('codex', '图鉴', 50, 178, 140, 78, false, false, 6);
      u.button('help', '玩法', 770, 178, 140, 78, false, false, 6);
    }
    if (this.rewardPending) {
      u.text(
        'ad-wait',
        '正在播放激励视频\n完整观看后领取30秒临时助力',
        480,
        244,
        28,
        480,
        C.paper,
        7,
        120,
      );
      u.button('reward-close', '取消领取', 330, 390, 300, 78, false, false, 6);
      return;
    }
    u.button('resume', '继续战斗', 280, 148, 400, 80, true, false, 6);
    const available =
      this.provider() && this.provider()?.available !== false && !this.match?.sides[0].boostUsed;
    if (available) {
      u.button('reward', '▶ 临时助力', 280, 242, 400, 76, false, false, 6);
      u.text(
        'reward-explain',
        '观看视频 · 灵石产出 +20%，30秒 · 每局一次',
        480,
        336,
        20,
        480,
        C.muted,
        7,
      );
    } else
      u.text(
        'pause-tip',
        this.match?.sides[0].boostUsed ? '本局助力已领取，继续后生效' : '调整阵容，准备下一次推进',
        480,
        280,
        25,
        460,
        C.paper,
        7,
      );
    u.button('retry', '重试', 250, 385, 140, 78, false, false, 6);
    u.button('settings', '设置', 410, 385, 140, 78, false, false, 6);
    u.button('home', '首页', 570, 385, 140, 78, false, false, 6);
  }
  resultView() {
    const u = this.ui,
      m = this.match!,
      won = m.phase === 'won';
    u.panel(0, 0, W, H, '#0c242bd9', '', 0, 6);
    u.panel(190, 35, 580, 475, C.ink, C.gold, 30, 6);
    u.text(
      'result',
      won ? '胜利' : m.phase === 'draw' ? '势均力敌' : '再整旗鼓',
      480,
      105,
      56,
      540,
      C.gold,
      7,
      85,
    );
    u.text(
      'result-medals',
      won ? '★'.repeat(this.settlement.medals || 1) : '水晶失守，试试先扩充生产阵容',
      480,
      182,
      27,
      540,
      C.paper,
      7,
    );
    const unlocked = this.settlement.unlocks;
    if (unlocked.length) {
      const spec = getSpec(unlocked[0]);
      u.image('unlock-unit', 'unit' + spec.atlas, 360, 283, 130, 110, 7);
      u.text('unlock-name', '新解锁 · ' + spec.name, 555, 262, 30, 310, C.gold, 7);
      u.text('unlock-role', spec.role, 555, 307, 23, 310, C.paper, 7);
    } else {
      u.text(
        'result-info',
        won ? '配方与时机，成就这一场合阵' : '相同残字可升级，也可保留多条生产线',
        480,
        276,
        27,
        540,
        C.paper,
        7,
        100,
      );
    }
    u.text(
      'record-type',
      m.practice
        ? '试玩对局 · 不保存进度'
        : m.assisted
          ? '已使用临时助力 · 辅助记录'
          : '正常闯关记录',
      480,
      358,
      20,
      520,
      C.muted,
      7,
    );
    u.button(
      won ? 'next' : 'retry',
      won ? (m.levelId === LEVELS[29].id ? '返回选关' : '下一关') : '再战一次',
      270,
      396,
      420,
      80,
      true,
      false,
      6,
    );
    u.button('levels', '选关', 20, 442, 140, 78, false, false, 6);
    u.button('home', '首页', 800, 442, 140, 78, false, false, 6);
  }
  helpView() {
    const u = this.ui;
    this.header('玩法说明');
    const items = [
      ['求字', '花灵石抽取神将或武器残字'],
      ['拼装', '拖字到兵符，拼齐后持续出兵'],
      ['成长', '同类等级相加，扩军或升级由你选择'],
      ['攻晶', '自由行军、就近攻击，击破敌晶获胜'],
    ];
    items.forEach(([title, body], i) => {
      const x = 35 + (i % 2) * 470,
        y = 104 + Math.floor(i / 2) * 147;
      u.panel(x, y, 450, 130, C.ink, C.gold, 22);
      u.text('help-title:' + i, title, x + 225, y + 35, 30, 420, C.gold);
      u.text('help-body:' + i, body, x + 225, y + 88, 23, 420, C.paper, 5, 65);
    });
    u.button('tutorial', '重播新手引导', 300, 426, 360, 82, true);
  }
  settingsView() {
    const u = this.ui;
    this.header('设置');
    u.panel(220, 110, 520, 390, C.ink, C.gold, 28);
    u.button('sound', '音效  ' + (this.progress.sound ? '开启' : '关闭'), 270, 142, 420, 78);
    u.button(
      'vibration',
      '震动  ' + (this.progress.vibration ? '开启' : '关闭'),
      270,
      237,
      420,
      78,
    );
    if (sys.isBrowser) u.button('fullscreen', '全屏', 270, 332, 420, 78);
    u.text('settings-tip', '进度自动保存 · 触屏拖动或点选都可操作', 480, 455, 22, 480, C.muted);
  }
  syncAccessibility() {
    if (!this.accessibility) return;
    const key =
      this.screen +
      '|' +
      this.ui.ready +
      '|' +
      this.ui.controls.map((c) => c.id + ':' + c.disabled + ':' + c.label).join(',');
    if (key === this.accessibilityKey) return;
    this.accessibilityKey = key;
    this.accessibility.dataset.ready = String(this.ui.ready);
    this.accessibility.dataset.screen = this.screen;
    this.accessibility.replaceChildren();
    for (const c of this.ui.controls) {
      const b = document.createElement('button');
      b.textContent = c.label;
      b.setAttribute('aria-label', c.label);
      b.dataset.action = c.id;
      b.disabled = c.disabled;
      b.onclick = () => this.action(c.id);
      this.accessibility.append(b);
    }
  }
  inspect() {
    return {
      engine: 'Cocos Creator ' + VERSION,
      ready: this.ui?.ready || false,
      screen: this.screen,
      chapter: this.chapter,
      levelId: this.levelId,
      deck: [...this.deck],
      selected: this.selected,
      inputCount: this.inputCount,
      drag: !!this.press?.moved,
      rewardPending: this.rewardPending,
      progress: JSON.parse(JSON.stringify(this.progress)),
      match: this.match ? snapshot(this.match) : null,
      controls: this.ui?.controls.map((c) => ({ ...c })) || [],
      viewport: { width: W, height: H },
      assets: this.ui?.frames.size || 0,
    };
  }
  down(id: number, x: number, y: number) {
    if (this.press) return;
    const c = this.ui.at(x, y);
    if (!c) return;
    this.inputCount++;
    this.press = { id, control: c.id, x, y, moved: false };
    this.pointer = { x, y };
    this.ui.pressed = c.id;
  }
  move(id: number, x: number, y: number) {
    if (this.press?.id !== id) return;
    this.pointer = { x, y };
    if (Math.hypot(x - this.press.x, y - this.press.y) > 10) this.press.moved = true;
  }
  up(id: number, x: number, y: number) {
    const p = this.press;
    if (!p || p.id !== id) return;
    this.press = null;
    this.ui.pressed = '';
    const target = this.ui.at(x, y);
    if (
      p.moved &&
      target?.id.startsWith('slot:') &&
      this.allowedTutorial(p.control) &&
      this.allowedTutorial(target.id)
    ) {
      const slot = Number(target.id.slice(5));
      if (p.control.startsWith('part:')) this.act({ type: 'fill', slot, part: p.control.slice(5) });
      else if (p.control.startsWith('slot:'))
        this.act({ type: 'merge', from: Number(p.control.slice(5)), to: slot });
      this.selected = slot;
      this.selectedPart = '';
    } else if (!p.moved && target?.id === p.control) this.action(p.control);
    this.render();
  }
  touchStart(e: EventTouch) {
    this.lastTouch = this.time;
    const p = e.getUILocation();
    this.down(e.getID() ?? -2, p.x, H - p.y);
  }
  touchMove(e: EventTouch) {
    const p = e.getUILocation();
    this.move(e.getID() ?? -2, p.x, H - p.y);
  }
  touchEnd(e: EventTouch) {
    const p = e.getUILocation();
    this.up(e.getID() ?? -2, p.x, H - p.y);
  }
  mouseDown(e: EventMouse) {
    if (this.time - this.lastTouch < 0.5 || e.getButton() !== 0) return;
    const p = e.getUILocation();
    this.down(-1, p.x, H - p.y);
  }
  mouseMove(e: EventMouse) {
    const p = e.getUILocation();
    this.move(-1, p.x, H - p.y);
  }
  mouseUp(e: EventMouse) {
    const p = e.getUILocation();
    this.up(-1, p.x, H - p.y);
  }
  onDestroy() {
    this.disposed = true;
    this.rewards?.dispose();
    this.provider()?.cancel?.();
    this.clear();
    this.save();
    this.unregister.forEach((f) => f());
    input.off(Input.EventType.TOUCH_START, this.touchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.clear, this);
    input.off(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
    input.off(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
    input.off(Input.EventType.MOUSE_UP, this.mouseUp, this);
    game.off(Game.EVENT_HIDE, this.suspend, this);
    if (sys.isBrowser) {
      window.removeEventListener('blur', this.suspend);
      window.removeEventListener('pagehide', this.pageHide);
      document.removeEventListener('visibilitychange', this.visibility);
      delete platform.__mergeFront;
    }
    for (const key of Object.keys(this.clips)) resources.release('audio/' + key, AudioClip);
    this.accessibility?.remove();
    this.fullscreen?.remove();
    this.ui?.dispose();
  }
}
