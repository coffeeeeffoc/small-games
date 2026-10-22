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
  POPULATION_CAP,
  ROUND_SECONDS,
  type Card,
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
  RUN = 'merge-front:match:v3';
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
  handPage = 0;
  confirmRetry = false;
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
      if (!saved && this.read('merge-front:match:v2'))
        this.notify('已升级回合玩法，旧对局备份和关卡进度已保留');
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
                const card = this.match.sides[0].formation[0] || this.match.sides[0].hand[0];
                if (card) card.level = 100;
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
    this.provider()?.cancel?.();
  };
  goto(screen: Screen) {
    this.clear();
    this.screen = screen;
    this.confirmRetry = false;
    this.feedbackUntil = 0;
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
    this.provider()?.cancel?.();
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
      this.sound(['merge'].includes(action.type) ? 'merge' : 'click');
      if (['merge'].includes(action.type)) this.vibrate();
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
        reward: { coins: 30, matchId: match.id },
      }),
    );
    this.render();
    const result = await this.rewards.request();
    if (this.disposed || this.match !== match) return;
    this.rewardPending = false;
    this.notify(
      result.status === 'completed'
        ? '已领取 30 灵石，可额外求字一次'
        : result.status === 'dismissed'
          ? '未完成观看，未领取助力'
          : '暂时无法领取助力，可直接继续战斗',
    );
    this.save();
    this.render();
  }

  action(id: string) {
    if (this.rewardPending && id !== 'reward-close') return;
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
    else if (id === 'start-round') this.act({ type: 'startRound' });
    else if (id === 'hand-prev') this.handPage = Math.max(0, this.handPage - 1);
    else if (id === 'hand-next') this.handPage++;
    else if (id === 'cancel-retry') this.confirmRetry = false;
    else if (id === 'confirm-retry') this.begin(false);
    else if (id === 'pause') {
      this.goto('paused');
      this.save();
    } else if (id === 'resume') this.goto('playing');
    else if (id === 'retry') {
      if (this.screen === 'paused') this.confirmRetry = true;
      else this.begin(false);
    } else if (id === 'next') {
      const n = LEVELS.find((l) => l.id === this.match?.levelId)!.number;
      this.practice = false;
      if (n === 30) this.goto('levels');
      else this.prepare(LEVELS[n].id);
    } else if (id.startsWith('draw:')) this.act({ type: 'draw', kind: id.slice(5) as Kind });
    else if (id.startsWith('card:') || id.startsWith('unit:')) {
      const card = this.heldCard(id);
      if (card)
        this.notify(
          getSpec(card.key).name + ' · Lv.' + card.level + ' · 拖入空地上阵，同名合并升级',
        );
    } else if (id.startsWith('part:')) this.notify('残字不能上阵，凑齐姓名后自动合体');
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
      if (m.roundStage !== 'planning') {
        this.accumulator += Math.min(dt, 0.25);
        while (this.accumulator >= 1 / TICK_RATE && m.phase === 'running') {
          step(m);
          this.accumulator -= 1 / TICK_RATE;
        }
      } else this.accumulator = 0;
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
    const planning = battle && this.match!.roundStage === 'planning';
    u.image(
      'background',
      battle ? 'arena' : 'home',
      W / 2,
      battle && planning ? 204 : H / 2,
      W,
      battle && planning ? 408 : H,
      0,
    );
    if (battle) this.battlefield();
    u.offsetX = battle && this.screen !== 'result' ? 0 : (W - 960) / 2;
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
    u.offsetX = 0;
    const held = this.press?.moved ? this.heldCard(this.press.control) : null;
    if (held) {
      const spec = getSpec(held.key);
      u.image(
        'drag',
        'unit' + spec.atlas,
        this.pointer.x,
        this.pointer.y - 48,
        104,
        96,
        7,
        false,
        '#ffffffbb',
      );
      u.circle(this.pointer.x, this.pointer.y, 25, '#6fe3c544', C.mint, 6);
      u.text(
        'drag-rank',
        'Lv.' + held.level,
        this.pointer.x,
        this.pointer.y - 103,
        22,
        110,
        C.gold,
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
  board() {
    const planning = this.match?.roundStage === 'planning';
    return { x: 66, y: planning ? 102 : 144, w: W - 132, h: planning ? 252 : 312 };
  }
  fieldPoint(x: number, y: number) {
    const b = this.board();
    return { x: b.x + (x / 1000) * b.w, y: b.y + (y / 360) * b.h };
  }
  heldCard(control: string): Card | undefined {
    if (!this.match || !/^(card|unit):/.test(control)) return;
    return [...this.match.sides[0].hand, ...this.match.sides[0].formation].find(
      (c) => c.id === Number(control.split(':')[1]),
    );
  }
  battlefield() {
    const u = this.ui,
      m = this.match!,
      planning = m.roundStage === 'planning',
      b = this.board();
    u.panel(0, 0, W, 66, '#123d37e8', '', 0);
    for (const side of [0, 1] as const) {
      const s = m.sides[side],
        x = side ? W - 352 : 30;
      u.progress(x, 22, 235, s.crystalHp / s.maxCrystalHp, side ? C.red : C.mint, 18);
      u.text(
        'core:' + side,
        (side ? '敌晶 ' : '我方 ') + s.crystalHp + '/' + s.maxCrystalHp,
        x + 117,
        32,
        19,
        230,
      );
      const pos = this.fieldPoint(side ? 950 : 50, 180);
      u.crystal(pos.x, pos.y, !!side, this.time * 3);
    }
    u.text('round', '第 ' + m.roundNumber + ' 回合', W / 2, 22, 24, 240, C.gold);
    u.text(
      'phase',
      planning
        ? '整备'
        : m.roundStage === 'battle'
          ? '战斗  ·  ' + Math.max(0, ROUND_SECONDS - Math.floor(m.roundTicks / TICK_RATE))
          : '回合结算',
      W / 2,
      49,
      18,
      280,
      C.paper,
    );
    if (this.screen === 'playing') u.pause(W - 86, 3);
    if (planning) {
      const dragging = !!this.press?.moved && !!this.heldCard(this.press.control);
      if (dragging) {
        const tl = this.fieldPoint(120, 30),
          br = this.fieldPoint(440, 330);
        u.panel(
          tl.x - 20,
          tl.y - 15,
          br.x - tl.x + 40,
          br.y - tl.y + 30,
          '#72dfbd22',
          '#a5e9ca99',
          30,
          0,
        );
      }
      for (const side of [0, 1] as const)
        for (const card of [...m.sides[side].formation].sort((a, b) => a.y - b.y)) {
          const p = this.fieldPoint(card.x, card.y),
            spec = getSpec(card.key),
            held = this.press?.moved ? this.heldCard(this.press.control) : null;
          const merge =
            held &&
            held.id !== card.id &&
            held.key === card.key &&
            side === 0 &&
            Math.hypot(this.pointer.x - p.x, this.pointer.y - p.y) < 48;
          u.circle(
            p.x,
            p.y,
            24,
            side ? '#b6345455' : '#1d9f8555',
            merge ? C.gold : side ? '#e1a79c88' : '#8bdbba99',
            1,
          );
          u.image(
            'plan:' + card.id,
            'unit' + spec.atlas,
            p.x,
            p.y - 27,
            84,
            78,
            1,
            !!side,
            this.press?.moved && held?.id === card.id ? '#ffffff55' : '#ffffff',
          );
          u.text(
            'plan-level:' + card.id,
            merge
              ? card.level + '+' + held.level + ' → ' + (card.level + held.level)
              : 'Lv.' + card.level,
            p.x,
            p.y + 24,
            19,
            merge ? 200 : 100,
            C.gold,
            2,
          );
          if (side === 0 && this.screen === 'playing')
            u.hit(
              'unit:' + card.id,
              spec.name + ' ' + card.level + '级，拖动调整',
              p.x - 40,
              p.y - 70,
              80,
              100,
            );
        }
    } else {
      for (const unit of [...m.units].sort((a, b) => a.y - b.y || a.id - b.id)) {
        const spec = getSpec(unit.key),
          p = this.fieldPoint(unit.x, unit.y);
        const attacking = unit.anim === 'attack' || unit.anim === 'skill';
        const bob =
          Math.sin(this.time * (unit.anim === 'move' ? 12 : 3) + unit.id) *
          (unit.anim === 'move' ? 3 : 1);
        u.circle(p.x, p.y, 22, unit.side ? '#a2335355' : '#189e8755', '', 1);
        u.image(
          'troop:' + unit.id,
          'unit' + spec.atlas,
          p.x + (attacking ? Math.sin(this.time * 26) * 3 : 0),
          p.y - 34 + bob,
          96,
          88,
          1,
          !!unit.side,
          '#ffffff',
          attacking ? Math.sin(this.time * 20) * 5 : 0,
        );
        u.progress(p.x - 26, p.y - 79, 52, unit.hp / unit.maxHp, unit.side ? C.red : C.mint, 5, 2);
        u.text('rank:' + unit.id, 'Lv.' + unit.level, p.x, p.y - 93, 16, 100, C.gold, 2, 24);
        if (attacking && unit.range > 80) {
          const target = m.units.find((t) => t.id === unit.targetId);
          if (target) {
            const end = this.fieldPoint(target.x, target.y);
            u.line(
              p.x,
              p.y - 30,
              end.x,
              end.y - 30,
              spec.special === 'slow' ? '#a9e9ff' : C.gold,
              3,
              2,
            );
          }
        }
      }
      for (const e of m.events.filter(
        (e) => m.tick - e.tick < 8 && ['hit', 'death', 'skill'].includes(e.type),
      )) {
        const p = this.fieldPoint(e.x, e.y),
          age = (m.tick - e.tick) / 8;
        u.circle(
          p.x,
          p.y - 15,
          8 + age * 20,
          e.type === 'skill' ? '#6eeec755' : '#ffdc8555',
          '',
          2,
        );
      }
      if (m.roundStage === 'resolution') {
        u.panel(W / 2 - 180, 76, 360, 58, '#123d37ed', C.gold, 20, 3);
        u.text(
          'round-result',
          m.roundWinner === null
            ? '势均力敌 · 下回合再战'
            : m.roundWinner === 0
              ? '本回合胜利  ·  敌晶 −' + m.roundDamage
              : '本回合失利  ·  我方 −' + m.roundDamage,
          W / 2,
          105,
          23,
          350,
          C.gold,
        );
        if (m.roundWinner !== null) {
          const end = this.fieldPoint(m.roundWinner === 0 ? 950 : 50, 180),
            t = m.roundTicks / (2 * TICK_RATE);
          for (const unit of m.units.filter((c) => c.side === m.roundWinner)) {
            const p = this.fieldPoint(unit.x, unit.y);
            u.circle(p.x + (end.x - p.x) * t, p.y + (end.y - p.y) * t, 5, C.gold, '', 2);
          }
        }
      }
    }
  }
  workshop() {
    const u = this.ui,
      m = this.match!,
      side = m.sides[0];
    if (m.roundStage !== 'planning') {
      return;
    }
    u.panel(0, 400, W, 140, '#103b34f5', '#a9a06b', 0);
    u.text('coins', '◆ ' + side.coins, 90, 423, 25, 160, C.gold);
    for (const [i, kind] of (['hero', 'weapon'] as const).entries()) {
      const x = 18 + i * 80;
      u.button('draw:' + kind, '', x, 447, 72, 76, true, side.coins < 30);
      u.image('draw-icon:' + kind, 'unit' + (kind === 'hero' ? 0 : 8), x + 36, 472, 48, 43, 4);
      u.text('draw-cost:' + kind, '◆30', x + 36, 507, 19, 66, C.ink);
      u.controls[u.controls.length - 1].label = (kind === 'hero' ? '求将' : '铸器') + '，30灵石';
    }
    const groups: Array<{ id: string; card?: Card; part?: string; count: number }> = [];
    for (const c of side.hand) {
      const same = groups.find((g) => g.card?.key === c.key && g.card.level === c.level);
      if (same) same.count++;
      else groups.push({ id: 'card:' + c.id, card: c, count: 1 });
    }
    for (const [part, count] of Object.entries(side.bag))
      if (count > 0) groups.push({ id: 'part:' + part, part, count });
    const pageSize = 7,
      pages = Math.ceil(groups.length / pageSize);
    this.handPage = Math.max(0, Math.min(this.handPage, pages - 1));
    groups.slice(this.handPage * pageSize, (this.handPage + 1) * pageSize).forEach((g, i) => {
      const x = 222 + i * 102,
        y = 417;
      if (g.card) {
        const spec = getSpec(g.card.key);
        u.panel(x, y, 94, 108, '#216353', C.gold, 12);
        u.image('hand:' + g.id, 'unit' + spec.atlas, x + 47, y + 39, 75, 68, 4);
        u.text('hand-name:' + g.id, spec.name, x + 47, y + 81, 19, 92);
        u.text('hand-level:' + g.id, 'Lv.' + g.card.level, x + 47, y + 102, 16, 90, C.gold);
        if (g.count > 1)
          u.text('hand-count:' + g.id, '×' + g.count, x + 72, y + 14, 18, 60, C.paper);
        u.hit(g.id, spec.name + '完整卡，' + g.count + '张，拖动上阵', x, y, 94, 108);
      } else {
        const [key, index] = g.part!.split(':'),
          spec = getSpec(key);
        u.panel(x + 7, y + 11, 80, 92, '#d8c59b', '#9c976a', 10);
        u.text('fragment:' + g.id, spec.parts[Number(index)], x + 47, y + 45, 38, 76, C.ink);
        u.text('fragment-count:' + g.id, '×' + g.count, x + 47, y + 84, 18, 74, C.ink);
        u.hit(
          g.id,
          spec.name + '残字' + spec.parts[Number(index)] + '，凑齐自动合体',
          x + 7,
          y + 11,
          80,
          92,
        );
      }
    });
    if (pages > 1) {
      u.button('hand-prev', '‹', 176, 451, 40, 70, false, this.handPage === 0);
      u.button('hand-next', '›', 940, 451, 40, 70, false, this.handPage === pages - 1);
    }
    u.text(
      'population',
      side.formation.length + ' / ' + POPULATION_CAP,
      1060,
      424,
      25,
      160,
      C.gold,
    );
    u.button('start-round', '开战', 992, 453, 140, 72, true, !side.formation.length);
    const dragging = this.press?.moved && this.press.control.startsWith('unit:');
    if (dragging) {
      u.panel(360, 405, 435, 125, '#123d37e8', C.mint, 18, 6);
      u.text('recall', '↓', W / 2, 466, 55, 220, C.mint, 7);
    }
    const tip =
      m.tutorial && m.tutorialStep < 6
        ? m.tutorialStep === 0
          ? '拖一张完整卡到我方场地'
          : '同名拖到一起升级，拖到空地分兵'
        : '残字凑齐自动合体';
    u.text('planning-tip', tip, W / 2, 382, 20, 740, C.paper);
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
            ' · 射程 ' +
            spec.range
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
    const u = this.ui,
      x = W / 2;
    u.controls = [];
    u.panel(0, 0, W, H, '#0a272caa', '', 0, 6);
    u.panel(x - 218, 108, 436, 327, '#123d37f5', C.gold, 28, 6);
    u.text('paused', this.confirmRetry ? '重新开始本关？' : '已暂停', x, 155, 32, 400, C.gold, 7);
    if (this.confirmRetry) {
      u.text('retry-tip', '本局阵容会重置，关卡进度保留', x, 226, 22, 400, C.paper, 7);
      u.button('cancel-retry', '取消', x - 180, 319, 168, 76, false, false, 6);
      u.button('confirm-retry', '重新开始', x + 12, 319, 168, 76, true, false, 6);
      return;
    }
    u.button('resume', '继续', x - 169, 202, 338, 80, true, false, 6);
    u.text(
      'pause-tip',
      this.match?.roundStage === 'planning' ? '阵容已保存' : '战斗已冻结',
      x,
      303,
      18,
      370,
      C.muted,
      7,
    );
    u.icon('settings', '设置', 'settings', x - 157, 337, 76, 6);
    u.icon('retry', '重新开始', 'retry', x - 38, 337, 76, 6);
    u.icon('home', '保存并返回首页', 'home', x + 81, 337, 76, 6);
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
      won ? '★'.repeat(this.settlement.medals || 1) : '调整站位，试试分兵或集中升级',
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
        won ? '布阵与取舍，成就这一场合阵' : '同名卡可合并升级，也可分成多个单位',
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
      ['合体', '残字不能上阵，凑齐后自动合为完整卡'],
      ['布阵', '完整卡拖到空地出战，同名合并升级'],
      ['回合', '上阵最多6个，开战后锁定，胜方攻晶'],
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
    if (
      this.returnScreen === 'paused' &&
      this.provider()?.available !== false &&
      this.provider() &&
      !this.match?.sides[0].boostUsed
    )
      u.button('reward', '视频补给 +30灵石', 750, 190, 200, 100);
    if (this.rewardPending) {
      u.panel(0, 0, W, H, '#0c242bed', '', 0, 6);
      u.text('ad-wait', '完整观看领取30灵石', 480, 230, 30, 650, C.paper, 7);
      u.button('reward-close', '取消领取', 320, 320, 320, 82, false, false, 6);
    }
    u.text('settings-tip', '拖动卡牌布阵 · 第12回合后比较水晶', 480, 455, 22, 480, C.muted);
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
      board: this.board(),
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
    const card = this.heldCard(p.control);
    this.press = null;
    this.ui.pressed = '';
    const target = this.ui.at(x, y);
    if (p.moved && card && this.screen === 'playing' && this.match?.roundStage === 'planning') {
      const b = this.board();
      const world = { x: ((x - b.x) / b.w) * 1000, y: ((y - b.y) / b.h) * 360 };
      const merge = this.match.sides[0].formation.find(
        (c) =>
          c.id !== card.id &&
          c.key === card.key &&
          Math.hypot(this.fieldPoint(c.x, c.y).x - x, this.fieldPoint(c.x, c.y).y - y) < 48,
      );
      if (merge) this.act({ type: 'merge', from: card.id, to: merge.id });
      else if (p.control.startsWith('unit:') && y >= 400)
        this.act({ type: 'recall', card: card.id });
      else if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
        this.act({
          type: p.control.startsWith('card:') ? 'deploy' : 'move',
          card: card.id,
          ...world,
        });
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
