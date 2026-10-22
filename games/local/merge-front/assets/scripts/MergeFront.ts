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
import {
  CATALOG,
  CHAPTERS,
  LEVELS,
  getSpec,
  getTrait,
  TRAITS,
  SPELLS,
  starterChoices,
  type Kind,
} from './core/content.ts';
import {
  command,
  createMatch,
  restore,
  snapshot,
  step,
  TICK_RATE,
  POPULATION_CAP,
  ROUND_SECONDS,
  incomeForRound,
  inventoryCount,
  traitCounts,
  crystalStyle,
  legalPosition,
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
import { attackEffects, troopPose, crystalImpact } from './BattleEffects';

const { ccclass } = _decorator;
const SAVE = 'merge-front:progress:v2',
  RUN = 'merge-front:match:v4';
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
  supplyChoices = starterChoices(1);
  supplyIndex = 0;
  reducedMotion = false;
  cardInfo: { title: string; body: string } | null = null;
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
  lastAttackSound = -10;
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
      if (!saved && (this.read('merge-front:match:v2') || this.read('merge-front:match:v3')))
        this.notify('商店玩法已更新，旧对局备份和关卡进度已保留');
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
    this.reducedMotion =
      this.read('merge-front:reduced-motion') === '1' ||
      (sys.isBrowser && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.chapter = Math.ceil(this.progress.unlockedLevel / 5);
    this.ui = new MergeView(this.node);
    this.audio = this.node.addComponent(AudioSource);
    for (const key of ['click', 'merge', 'win', 'strike', 'shot', 'magic', 'impact'])
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
      window.addEventListener('resize', this.clear);
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
    this.cardInfo = null;
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
    this.supplyChoices = starterChoices(Date.now() >>> 0);
    this.supplyIndex = 0;
    this.deck = [...this.supplyChoices[0].keys];
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
      if (result.message !== '操作成功') this.notify(result.message);
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
        reward: { coins: 2, matchId: match.id },
      }),
    );
    this.render();
    const result = await this.rewards.request();
    if (this.disposed || this.match !== match) return;
    this.rewardPending = false;
    this.notify(
      result.status === 'completed'
        ? '已领取 2 金币'
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
    else if (id.startsWith('supply:')) {
      const index = Number(id.slice(7));
      if (!this.supplyChoices[index]) return;
      this.supplyIndex = index;
      this.deck = [...this.supplyChoices[index].keys];
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
    } else if (id === 'refresh') this.act({ type: 'refresh' });
    else if (id === 'info-close') this.cardInfo = null;
    else if (id === 'motion') {
      this.reducedMotion = !this.reducedMotion;
      try {
        sys.localStorage.setItem('merge-front:reduced-motion', this.reducedMotion ? '1' : '0');
      } catch {}
    } else if (id.startsWith('trait:')) {
      const t = getTrait(id.slice(6));
      this.cardInfo = {
        title: t.name,
        body: t.description + '\n只计算不同名字，合并不减少已激活的名字。',
      };
    } else if (id.startsWith('offer:')) {
      const offer = this.match?.sides[0].shop.find((o) => o.id === Number(id.slice(6)));
      if (offer)
        this.showItem(
          offer.kind === 'part'
            ? 'part:' + offer.part
            : offer.kind === 'spell'
              ? 'spellkey:' + offer.key
              : 'key:' + offer.key,
          '◆ ' + offer.cost + ' · 拖到手牌区购买',
        );
    } else if (id.startsWith('spell:')) {
      const spell = this.match?.sides[0].spells.find((c) => c.id === Number(id.slice(6)));
      if (spell) this.showItem('spellkey:' + spell.key);
    } else if (id.startsWith('card:') || id.startsWith('unit:')) {
      const card = this.heldCard(id);
      if (card)
        this.showItem(
          'key:' + card.key,
          'Lv.' +
            card.level +
            ' · 永久攻击 +' +
            card.bonusDamage +
            ' / 生命 +' +
            card.bonusHp +
            (card.entered ? ' · 已出战' : ' · 未出战'),
        );
    } else if (id.startsWith('part:')) this.showItem(id);
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
      const audible = m.events.filter((e) => e.id > this.lastEvent && m.tick - e.tick <= 3);
      const impact = audible.find((e) => e.type === 'crystal-hit');
      const attack = audible.find((e) => e.type === 'attack');
      if (impact) this.sound('impact');
      else if (attack?.key && this.time - this.lastAttackSound > 0.14) {
        const spec = getSpec(attack.key);
        this.sound(spec.range < 100 ? 'strike' : spec.kind === 'weapon' ? 'shot' : 'magic');
        this.lastAttackSound = this.time;
      }
      this.lastEvent = Math.max(this.lastEvent, ...m.events.map((e) => e.id));
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
      battle && planning ? 188 : H / 2,
      W,
      battle && planning ? 376 : H,
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
    if (this.press?.moved && !held) {
      const id = this.press.control,
        side = this.match?.sides[0];
      if (side && /^(offer|spell|part):/.test(id)) {
        let name = '',
          atlas = -1;
        if (id.startsWith('offer:')) {
          const o = side.shop.find((o) => o.id === Number(id.slice(6)));
          if (o) {
            if (o.kind === 'unit') atlas = getSpec(o.key).atlas;
            else
              name =
                o.kind === 'part'
                  ? o.part === 'nezha:0'
                    ? '哪'
                    : '吒'
                  : SPELLS.find((s) => s.id === o.key)!.name;
          }
        } else if (id.startsWith('part:')) name = id.endsWith(':0') ? '哪' : '吒';
        else {
          const c = side.spells.find((c) => c.id === Number(id.slice(6)));
          name = SPELLS.find((s) => s.id === c?.key)?.name || '';
        }
        u.panel(this.pointer.x - 46, this.pointer.y - 90, 92, 92, '#164d45dd', C.gold, 12, 6);
        if (atlas >= 0)
          u.image('drag-offer', 'unit' + atlas, this.pointer.x, this.pointer.y - 47, 80, 80, 7);
        else u.text('drag-spell', name, this.pointer.x, this.pointer.y - 45, 28, 88, C.gold, 7);
      }
    }
    if (this.cardInfo) {
      u.controls = [];
      u.panel(0, 0, W, H, '#092b2abd', '', 0, 6);
      u.panel(W / 2 - 335, 130, 670, 300, C.ink, C.gold, 24, 6);
      u.text('info-title', this.cardInfo.title, W / 2, 172, 32, 620, C.gold, 7);
      u.text('info-body', this.cardInfo.body, W / 2, 265, 23, 618, C.paper, 7, 142);
      u.button('info-close', '知道了', W / 2 - 115, 341, 230, 70, true, false, 6);
    }
    u.end();
    this.syncAccessibility();
  }
  showItem(id: string, extra = '') {
    if (id.startsWith('part:')) {
      this.cardInfo = {
        title: id.endsWith(':0') ? '哪' : '吒',
        body:
          '残字不能出战。哪 + 吒自动合为完整哪吒。\n持有一字后，下一次刷新保证出现另一字。\n' +
          extra,
      };
      return;
    }
    if (id.startsWith('spellkey:')) {
      const spell = SPELLS.find((s) => s.id === id.slice(9))!;
      this.cardInfo = {
        title: spell.name,
        body:
          spell.description +
          '\n' +
          (spell.id === 'inspire' ? '拖到己方场地施放。' : '拖到己方场上单位施放。') +
          '\n' +
          extra,
      };
      return;
    }
    const spec = getSpec(id.slice(4)),
      trait = getTrait(spec.id);
    const trigger: Record<string, string> = {
      juling: '首次出战：最近另一友军永久+20生命。',
      leizhen: '首次出战：最近另一雷霆永久+4攻击。',
      xuannv: '首次出战：其他灵泽永久+6生命。',
      fire: '售出：获得磨刃，不返金币。',
      lantern: '售出：获得护符，不返金币。',
      drone: '售出：+1金币，并存一次免费刷新。',
      ram: '胜局存活：额外攻晶1点，不叠加。',
    };
    this.cardInfo = {
      title: spec.name + ' · ' + trait.name,
      body:
        spec.role +
        ' · ' +
        spec.skill +
        '\n' +
        (trigger[spec.id] || '同名合并等级相加，或分兵独立出战。') +
        '\n' +
        extra,
    };
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
    u.text('chapter-rewards', '五场挑战 · 全部16种神将机关可在商店获取', 480, 482, 24, 730);
  }
  prepareView() {
    const u = this.ui,
      level = LEVELS.find((l) => l.id === this.levelId)!;
    this.header('开局补给 · 第' + level.number + '关', 'levels');
    u.text('supply-tip', '三选一 · 商店全部开放', 480, 102, 25, 700, C.gold);
    this.supplyChoices.forEach((pack, i) => {
      const x = 24 + i * 312,
        chosen = i === this.supplyIndex;
      u.panel(x, 142, 288, 262, chosen ? '#27695b' : '#103e39', chosen ? C.gold : '#6e9486', 22);
      pack.keys.forEach((key, j) => {
        const spec = getSpec(key);
        u.image('starter:' + i + ':' + j, 'unit' + spec.atlas, x + 80 + j * 127, 252, 143, 143, 4);
        u.text('starter-name:' + i + ':' + j, spec.name, x + 78 + j * 130, 327, 20, 140);
      });
      u.text('starter-title:' + i, pack.name, x + 144, 178, 27, 270, C.gold);
      u.text(
        'starter-trait:' + i,
        pack.keys.map((k) => getTrait(k).name).join(' · '),
        x + 144,
        371,
        20,
        270,
        C.mint,
      );
      u.hit('supply:' + i, pack.name + '，选择开局两张卡', x, 142, 288, 262);
    });
    u.button('begin', '出阵', 570, 433, 330, 83, true);
    u.text('supply-choice', this.supplyChoices[this.supplyIndex].name, 255, 473, 26, 430, C.paper);
  }
  board() {
    const planning = this.match?.roundStage === 'planning';
    return { x: 66, y: planning ? 120 : 144, w: W - 132, h: planning ? 216 : 312 };
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
  mergeTarget(card: Card, x: number, y: number) {
    return this.match?.sides[0].formation
      .filter((c) => c.id !== card.id && c.key === card.key)
      .sort((a, b) => b.y - a.y || b.id - a.id)
      .find((c) => {
        const p = this.fieldPoint(c.x, c.y);
        return Math.hypot(p.x - x, p.y - y) < 48;
      });
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
      u.crystal(pos.x, pos.y, !!side, (m.tick / TICK_RATE) * 3);
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
      const counts = traitCounts(m.sides[0].formation);
      TRAITS.forEach((t, i) => {
        const x = 310 + i * 135;
        u.panel(x, 70, 128, 38, '#163e35dd', counts[t.id] >= 2 ? t.color : '#638d78', 10, 3);
        u.text(
          'trait:' + t.id,
          t.name + ' ' + counts[t.id] + '/4',
          x + 64,
          89,
          18,
          124,
          counts[t.id] >= 2 ? t.color : C.muted,
        );
      });
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
          if (side === 0 && held?.id === card.id) continue;
          const merge =
            held &&
            side === 0 &&
            this.mergeTarget(held, this.pointer.x, this.pointer.y)?.id === card.id;
          u.ellipse(p.x + 4, p.y + 4, 29, 10, '#15382c77', '', 1);
          u.ellipse(
            p.x,
            p.y,
            25,
            9,
            side ? '#e6615c33' : '#73e7c833',
            merge ? C.gold : side ? C.red : C.mint,
            1,
          );
          u.image(
            'plan:' + card.id,
            'unit' + spec.atlas,
            p.x,
            p.y - 27,
            86 * (0.87 + card.y / 1600),
            86 * (0.87 + card.y / 1600),
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
      TRAITS.forEach((t, i) =>
        u.hit('trait:' + t.id, t.name + '流派详情', 310 + i * 135, 67, 128, 44),
      );
    } else {
      for (const unit of [...m.units].sort((a, b) => a.y - b.y || a.id - b.id)) {
        const spec = getSpec(unit.key),
          p = this.fieldPoint(unit.x, unit.y),
          pose = troopPose(m, unit, this.reducedMotion),
          size = 94 * (0.85 + unit.y / 1600);
        u.ellipse(p.x + 5, p.y + 4, size * 0.3, size * 0.1, '#12362a88', '', 1);
        u.ellipse(
          p.x,
          p.y,
          size * 0.26,
          size * 0.085,
          unit.side ? '#d74b4b33' : '#4ed8bd33',
          unit.side ? '#ed969b99' : '#98e6cd99',
          1,
        );
        u.image(
          'troop:' + unit.id,
          'unit' + spec.atlas,
          p.x + pose.dx,
          p.y - size * 0.42 + pose.dy,
          size,
          size,
          1,
          !!unit.side,
          '#ffffff',
          pose.angle,
        );
        u.progress(
          p.x - 28,
          p.y - size * 0.91,
          56,
          unit.hp / unit.maxHp,
          unit.side ? C.red : C.mint,
          5,
          2,
        );
        if (unit.shield > 0)
          u.progress(
            p.x - 28,
            p.y - size * 0.91 - 6,
            56,
            unit.shield / unit.maxHp,
            '#b5e8fc',
            3,
            2,
          );
        u.text(
          'rank:' + unit.id,
          'Lv.' + unit.level,
          p.x,
          p.y - size * 0.91 - 18,
          16,
          90,
          C.gold,
          2,
          24,
        );
      }
      attackEffects(u, m, (x, y) => this.fieldPoint(x, y), this.reducedMotion);
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
          const end = this.fieldPoint(m.roundWinner === 0 ? 950 : 50, 180);
          crystalImpact(u, m, end, this.reducedMotion);
        }
      }
    }
  }
  workshop() {
    const u = this.ui,
      m = this.match!,
      side = m.sides[0];
    if (m.roundStage !== 'planning') return;
    u.panel(0, 370, W, 170, '#103b34f5', '#a9a06b', 0);
    u.line(488, 382, 488, 527, '#8a9c70', 2, 3);
    u.text('coins', '◆ ' + side.coins, 58, 397, 27, 110, C.gold);
    u.text('income', '下轮 +' + incomeForRound(m.roundNumber + 1), 58, 424, 16, 110, C.muted);
    u.button('refresh', '↻', 12, 445, 88, 78, false, !side.freeRefresh && side.coins < 1);
    u.text('refresh-cost', side.freeRefresh ? '免费' : '◆ 1', 56, 511, 17, 80, C.gold);
    u.controls[u.controls.length - 1].label = '刷新商店，' + (side.freeRefresh ? '免费' : '1金币');
    u.text('shop-title', '商店', 291, 389, 19, 300, C.gold);
    side.shop.forEach((o, i) => {
      const x = 112 + i * 120,
        y = 410;
      const trait = o.kind === 'spell' ? null : getTrait(o.key),
        name =
          o.kind === 'spell'
            ? SPELLS.find((s) => s.id === o.key)!.name
            : o.kind === 'part'
              ? o.part === 'nezha:0'
                ? '哪'
                : '吒'
              : getSpec(o.key).name;
      if (this.press?.moved && this.press.control === 'offer:' + o.id) return;
      u.panel(
        x,
        y,
        108,
        118,
        o.kind === 'spell' ? '#294c60' : '#215f52',
        trait?.color || '#a6b4f0',
        12,
      );
      if (o.kind === 'unit')
        u.image('shop:' + o.id, 'unit' + getSpec(o.key).atlas, x + 54, y + 47, 78, 78, 4);
      else
        u.text(
          'shop-glyph:' + o.id,
          o.kind === 'part'
            ? name
            : { sharpen: '刃', fortify: '体', ward: '盾', inspire: '鼓' }[o.key] || '符',
          x + 54,
          y + 46,
          38,
          94,
          C.gold,
        );
      u.text('shop-price:' + o.id, '◆' + o.cost, x + 85, y + 12, 17, 44, C.gold);
      u.text('shop-name:' + o.id, name, x + 54, y + 96, 19, 104);
      u.hit('offer:' + o.id, name + '，' + o.cost + '金币，拖到手牌购买', x, y, 108, 118);
    });
    const items = [
      ...side.hand.map((c) => ({ id: 'card:' + c.id, card: c, part: '', spell: '' })),
      ...Object.keys(side.bag).flatMap((part) =>
        Array.from({ length: side.bag[part] }, (_, i) => ({
          id: 'part:' + part + ':' + i,
          part,
          spell: '',
          card: undefined,
        })),
      ),
      ...side.spells.map((c) => ({ id: 'spell:' + c.id, part: '', spell: c.key, card: undefined })),
    ];
    const pages = Math.max(1, Math.ceil(items.length / 4));
    this.handPage = Math.max(0, Math.min(this.handPage, pages - 1));
    u.text('hand-title', '手牌 ' + inventoryCount(side) + '/12', 615, 389, 20, 240, C.gold);
    if (pages > 1) {
      u.button('hand-prev', '‹', 760, 341, 90, 62, false, this.handPage === 0);
      u.button('hand-next', '›', 861, 341, 90, 62, false, this.handPage === pages - 1);
      u.text('hand-page', this.handPage + 1 + '/' + pages, 977, 390, 17, 60, C.muted);
    }
    items.slice(this.handPage * 4, this.handPage * 4 + 4).forEach((item, i) => {
      const x = 506 + i * 119,
        y = 410;
      const control = item.part ? 'part:' + item.part : item.id;
      if (this.press?.moved && this.press.control === control) return;
      const name = item.card
        ? getSpec(item.card.key).name
        : item.part
          ? item.part.endsWith(':0')
            ? '哪'
            : '吒'
          : SPELLS.find((s) => s.id === item.spell)!.name;
      u.panel(
        x,
        y,
        108,
        118,
        item.part ? '#d8c59b' : item.spell ? '#294c60' : '#1c5b4e',
        item.card ? getTrait(item.card.key).color : C.gold,
        12,
      );
      if (item.card)
        u.image(
          'hand:' + item.id,
          'unit' + getSpec(item.card.key).atlas,
          x + 54,
          y + 44,
          80,
          80,
          4,
        );
      else
        u.text(
          'hand-glyph:' + item.id,
          item.part
            ? name
            : { sharpen: '刃', fortify: '体', ward: '盾', inspire: '鼓' }[item.spell] || '符',
          x + 54,
          y + 44,
          38,
          100,
          item.part ? C.ink : C.gold,
        );
      u.text('hand-name:' + item.id, name, x + 54, y + 94, 19, 104, item.part ? C.ink : C.paper);
      if (item.card) {
        u.text('hand-lv:' + item.id, 'Lv.' + item.card.level, x + 79, y + 12, 16, 58, C.gold);
        if (item.card.ward) u.text('ward:' + item.id, '盾', x + 15, y + 15, 17, 28, '#a4e9ff');
      }
      u.hit(
        control,
        name +
          (item.card
            ? '完整卡，拖动上阵'
            : item.part
              ? '残字，凑齐自动合体'
              : '法术，拖到己方目标'),
        x,
        y,
        108,
        118,
      );
    });
    u.text('population', side.formation.length + '/' + POPULATION_CAP, 1072, 397, 26, 140, C.gold);
    u.button('start-round', '开战', 1008, 445, 132, 78, true, !side.formation.length);
    if (this.press?.moved) {
      const id = this.press.control,
        held = this.heldCard(id);
      if (id.startsWith('offer:') || id.startsWith('unit:')) {
        u.panel(498, 405, 484, 126, '#73d9bb22', C.mint, 14, 6);
        u.text(
          'drop-hint',
          id.startsWith('offer:') ? '↓ 购买到手牌' : '↓ 回收',
          740,
          471,
          26,
          400,
          C.mint,
          7,
        );
      }
      if (held || id.startsWith('part:')) {
        const reward = id.startsWith('part:')
          ? '弃置'
          : held?.key === 'fire'
            ? '换磨刃'
            : held?.key === 'lantern'
              ? '换护符'
              : held?.key === 'drone'
                ? '+1 · 免费刷'
                : '+1金币';
        u.panel(1000, 278, 144, 92, '#753a36ec', C.red, 14, 6);
        u.text('sell-hint', reward, 1072, 325, 22, 138, C.paper, 7);
      }
    }
    if (m.tutorial && m.tutorialStep < 6)
      u.text(
        'planning-tip',
        m.tutorialStep === 0 ? '拖手牌上阵 · 商店拖入手牌购买' : '同名拖一起升级 · 空地分兵',
        W / 2,
        350,
        18,
        720,
        C.paper,
      );
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
        open = true;
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
      open = true;
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
    u.text(
      'recipe-title',
      spec.id === 'nezha' ? '哪 + 吒自动合体' : getTrait(spec.id).name + ' · ◆' + spec.cost,
      685,
      214,
      22,
      400,
    );
    (spec.id === 'nezha' ? spec.parts : [getTrait(spec.id).name]).forEach((part, i, parts) => {
      const x = 685 - parts.length * 42 + i * 84;
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
      ['商店', '三张商品 · 拖入手牌购买 · 1金刷新'],
      ['合体', '哪+吒自动合体；同名拖叠等级相加'],
      ['流派', '不同名字凑2/4件；法术拖己方单位'],
      ['经营', '6人口 · 首次出战触发 · 拖出售出'],
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
    u.button('motion', '减弱动态  ' + (this.reducedMotion ? '开启' : '关闭'), 270, 332, 420, 70);
    if (sys.isBrowser) u.button('fullscreen', '全屏', 25, 350, 160, 78);
    if (
      this.returnScreen === 'paused' &&
      this.provider()?.available !== false &&
      this.provider() &&
      !this.match?.sides[0].boostUsed
    )
      u.button('reward', '视频补给 +2金币', 750, 190, 200, 100);
    if (this.rewardPending) {
      u.panel(0, 0, W, H, '#0c242bed', '', 0, 6);
      u.text('ad-wait', '完整观看领取2金币', 480, 230, 30, 650, C.paper, 7);
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
      supplyChoices: this.supplyChoices,
      detailTitle: this.cardInfo?.title || null,
      reducedMotion: this.reducedMotion,
      crystalStyle: this.match ? crystalStyle(this.match.seed, this.match.roundNumber) : null,
      visibleTroops: Array.from(this.ui?.nodes.keys() || []).filter(
        (k) => k.startsWith('image:plan:') || k.startsWith('image:troop:'),
      ),
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
    if (p.moved && this.screen === 'playing' && this.match?.roundStage === 'planning') {
      const b = this.board(),
        side = this.match.sides[0],
        world = { x: ((x - b.x) / b.w) * 1000, y: ((y - b.y) / b.h) * 360 };
      const own = legalPosition(0, world.x, world.y),
        inHand = x >= 498 && x <= 992 && y >= 405 && y <= 540,
        inSell = x >= 1000 && x <= 1144 && y >= 278 && y <= 370;
      const merge = card ? this.mergeTarget(card, x, y) : undefined;
      const near = side.formation
        .filter((c) => c.id !== card?.id)
        .sort((a, b) => b.y - a.y)
        .find((c) => {
          const q = this.fieldPoint(c.x, c.y);
          return Math.hypot(q.x - x, q.y - y) < 48;
        });
      if (p.control.startsWith('offer:')) {
        if (inHand) this.act({ type: 'buy', offer: Number(p.control.slice(6)) });
      } else if (p.control.startsWith('spell:')) {
        const spell = side.spells.find((c) => c.id === Number(p.control.slice(6)));
        if (spell) {
          if (spell.key === 'inspire' && own) this.act({ type: 'cast', spell: spell.id });
          else if (spell.key !== 'inspire' && near)
            this.act({ type: 'cast', spell: spell.id, target: near.id });
        }
      } else if (p.control.startsWith('part:')) {
        if (inSell) this.act({ type: 'discard', part: p.control.slice(5) });
      } else if (card) {
        if (inSell) this.act({ type: 'sell', card: card.id });
        else if (merge) this.act({ type: 'merge', from: card.id, to: merge.id });
        else if (p.control.startsWith('unit:') && inHand)
          this.act({ type: 'recall', card: card.id });
        else if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
          this.act({
            type: p.control.startsWith('card:') ? 'deploy' : 'move',
            card: card.id,
            ...world,
          });
      }
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
      window.removeEventListener('resize', this.clear);
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
