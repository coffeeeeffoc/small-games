import {
  _decorator,
  AudioClip,
  AudioSource,
  Component,
  EventKeyboard,
  EventMouse,
  EventTouch,
  Game,
  Input,
  KeyCode,
  game,
  input,
  resources,
  sys,
  view,
  VERSION,
} from 'cc';
import { AtelierView, GOLD, MINT, type Flight } from './AtelierView';
import {
  CATALOG,
  CHAPTERS,
  NOVA_LEVELS,
  LEGACY_SAVE_KEY,
  SAVE_KEY,
  canRelease,
  clearsOpening,
  createState,
  findHint,
  getBlockers,
  getCampaignLevels,
  isComplete,
  isLocked,
  normalizeAngle,
  parseProgress,
  restoreUndo,
  alignReward,
  rotateRing,
  settle,
  snapAngle,
  tryRelease,
  unlockedIndex,
  type Campaign,
  type Hint,
  type Progress,
  type Run,
} from './core/index';
const { ccclass } = _decorator;
type Screen = 'home' | 'levels' | 'playing' | 'paused' | 'result' | 'settings' | 'help';
type Drag = {
  id: number;
  ringId: string;
  angle: number;
  rawAngle: number;
  x: number;
  y: number;
  moved: boolean;
  before: Run;
};
type Publishing = {
  share(options: {
    params: Record<string, string>;
    text: string;
  }): Promise<{ status: string; url: string }>;
  interstitial(options: { placement: string; naturalBreak: boolean }): Promise<unknown>;
};
type Dev = {
  isEnabled(): boolean;
  registerSnapshot(read: () => unknown): () => void;
  registerActions(actions: { id: string; label: string; run(): unknown }[]): () => void;
};
const platform = globalThis as typeof globalThis & {
  SmallGamesDev?: Dev;
  SmallGamesRewardAds?: { available: boolean; offer(request: { id: string }): Promise<{ status: string }>; cancel?(): void };
  OrbitPublishing?: Publishing;
  __orbit?: { snapshot(): unknown };
  __orbitTrustedInput?: { count: number; type: string };
};

@ccclass('OrbitAtelier')
export class OrbitAtelier extends Component {
  ui!: AtelierView;
  progress!: Progress;
  run: Run | null = null;
  screen: Screen = 'home';
  campaign: Campaign = 'nova';
  mapPage = 0;
  selected: string | null = null;
  hint: Hint | null = null;
  drag: Drag | null = null;
  history: Run[] = [];
  practice = false;
  challenge = false;
  flights: Flight[] = [];
  completionAge = -1;
  medal = 0;
  time = 0;
  lastTouch = -1000;
  press: { id: number; control: string; x: number; y: number } | null = null;
  frameKey = '';
  returnScreen: Screen = 'home';
  feedback = '';
  feedbackUntil = 0;
  unregister: (() => void)[] = [];
  audioSource!: AudioSource;
  clips: Record<string, AudioClip> = {};
  sharePending = false;
  shareStatus = '';
  accessibility?: HTMLDivElement;
  pointerCanvas?: HTMLCanvasElement;
  disposed = false;
  rewardToken = 0;
  rewardPending = false;
  rewardPort: typeof platform.SmallGamesRewardAds;
  start() {
    view.enableAutoFullScreen(false);
    view.resizeWithBrowserSize(true);
    this.progress = parseProgress(this.read(SAVE_KEY), this.read(LEGACY_SAVE_KEY));
    this.run = this.progress.run ? structuredClone(this.progress.run) : null;
    this.ui = new AtelierView(this.node, () => {
      if (!this.disposed) this.render();
    });
    this.audioSource = this.node.addComponent(AudioSource);
    for (const key of ['turn', 'release', 'complete'])
      resources.load(`audio/${key}`, AudioClip, (error, clip) => {
        if (!error && !this.disposed) this.clips[key] = clip;
      });
    input.on(Input.EventType.TOUCH_START, this.touchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
    input.on(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
    input.on(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
    input.on(Input.EventType.MOUSE_UP, this.mouseUp, this);
    input.on(Input.EventType.KEY_DOWN, this.keyDown, this);
    game.on(Game.EVENT_HIDE, this.suspend, this);
    if (sys.isBrowser) {
      window.addEventListener('blur', this.suspend);
      window.addEventListener('pagehide', this.pageHide);
      document.addEventListener('visibilitychange', this.visibility);
      this.accessibility = document.createElement('div');
      this.accessibility.id = 'orbit-app';
      this.accessibility.setAttribute('aria-label', '星扣工坊');
      document.body.appendChild(this.accessibility);
      platform.__orbit = { snapshot: () => this.snapshot() };
      const invitation = new URLSearchParams(location.search);
      const invited =
        invitation.getAll('challenge').length === 1
          ? CATALOG.find((l) => l.id === invitation.get('challenge'))
          : null;
      if (invited) this.begin(invited.id, false, true);
    }
    if (platform.SmallGamesDev) {
      this.unregister.push(platform.SmallGamesDev.registerSnapshot(() => this.snapshot()));
      this.unregister.push(
        platform.SmallGamesDev.registerActions([
          {
            id: 'next-puzzle',
            label: '试玩下一关（不存进度）',
            run: () => {
              if (platform.SmallGamesDev?.isEnabled())
                this.begin(
                  NOVA_LEVELS[
                    ((this.run
                      ? NOVA_LEVELS.findIndex((l) => l.id === this.run!.state.levelId)
                      : -1) +
                      1) %
                      NOVA_LEVELS.length
                  ]!.id,
                  true,
                );
            },
          },
          {
            id: 'last-puzzle',
            label: '试玩最终星盘（不存进度）',
            run: () => {
              if (platform.SmallGamesDev?.isEnabled())
                this.begin(NOVA_LEVELS[NOVA_LEVELS.length - 1]!.id, true);
            },
          },
          {
            id: 'trial-map',
            label: '试玩全部星盘（不存进度）',
            run: () => {
              if (platform.SmallGamesDev?.isEnabled()) {
                this.practice = true;
                this.screen = 'levels';
                this.render();
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
    if (!this.progress || this.practice || this.challenge) return;
    this.progress.run = this.run && !isComplete(this.run.state) ? structuredClone(this.run) : null;
    try {
      sys.localStorage.setItem(SAVE_KEY, JSON.stringify(this.progress));
    } catch {
      /* Memory play remains available. */
    }
  }
  sound(name: string) {
    if (this.progress.settings.sound && this.clips[name])
      this.audioSource.playOneShot(this.clips[name], name === 'turn' ? 0.15 : 0.35);
    if (name === 'release' && this.progress.settings.vibration && sys.isBrowser)
      navigator.vibrate?.(12);
  }
  level() {
    return CATALOG.find((l) => l.id === this.run?.state.levelId);
  }
  begin(id: string, practice = false, challenge = false) {
    this.cancelReward();
    const level = CATALOG.find((l) => l.id === id);
    if (!level) return;
    const campaign = level.campaign || 'classic';
    if (
      !practice &&
      !challenge &&
      getCampaignLevels(campaign).indexOf(level) > unlockedIndex(this.progress, campaign)
    )
      return;
    this.cancel();
    this.practice = practice;
    this.challenge = challenge;
    this.campaign = campaign;
    this.run = { state: createState(level), moves: 0, hints: 0, rewardAlignUsed: false };
    this.history = [];
    this.selected = null;
    this.hint = null;
    this.flights = [];
    this.ui.pulses = [];
    this.completionAge = -1;
    this.feedback = '';
    this.shareStatus = '';
    this.screen = 'playing';
    this.save();
    this.render();
  }
  cancel() {
    if (this.drag) this.run = structuredClone(this.drag.before);
    this.drag = null;
    this.press = null;
    if (this.ui) this.ui.pressed = null;
  }
  navigate(screen: Screen) {
    this.cancelReward();
    this.cancel();
    this.flights = [];
    this.ui.pulses = [];
    this.completionAge = -1;
    if ((screen === 'home' || screen === 'levels') && (this.practice || this.challenge)) {
      this.run = this.progress.run ? structuredClone(this.progress.run) : null;
      this.practice = false;
      this.challenge = false;
      this.history = [];
      this.hint = null;
      this.selected = null;
    }
    if ((screen === 'playing' || screen === 'paused') && this.run && isComplete(this.run.state))
      screen = 'result';
    this.screen = screen;
    this.feedback = '';
    this.save();
    this.render();
  }
  suspend = () => {
    if (this.screen === 'playing') this.navigate('paused');
    else {
      this.cancel();
      this.save();
    }
    this.audioSource?.stop();
  };
  visibility = () => {
    if (document.hidden) this.suspend();
  };
  pageHide = () => {
    this.cancelReward();
    this.suspend();
    this.render();
    this.cancel();
    this.save();
    this.audioSource?.stop();
  };
  notify(message: string) {
    this.feedback = message;
    this.feedbackUntil = this.time + 2.6;
    this.draw();
  }
  cancelReward() {
    ++this.rewardToken;
    const port = this.rewardPort;
    this.rewardPort = undefined;
    this.rewardPending = false;
    port?.cancel?.();
  }
  async requestAlignment() {
    const run = this.run, port = platform.SmallGamesRewardAds;
    if (this.disposed || this.rewardPending || this.screen !== 'paused' || !run ||
        run.rewardAlignUsed || isComplete(run.state)) return;
    if (!port?.available) {
      this.feedback = '辅助暂不可用 · 普通提示仍免费';
      this.render();
      return;
    }
    const token = ++this.rewardToken;
    this.rewardPending = true;
    this.rewardPort = port;
    this.feedback = '正在准备辅助 · 可取消';
    this.render();
    let status = 'failed';
    try { status = (await port.offer({ id: 'orbit-atelier:align' }))?.status; } catch {}
    if (this.disposed || token !== this.rewardToken || this.run !== run || this.screen !== 'paused') return;
    this.rewardPending = false;
    this.rewardPort = undefined;
    const before = structuredClone(run);
    const hint = status === 'completed' ? alignReward(run) : null;
    if (hint) {
      this.history.push(before);
      if (this.history.length > 80) this.history.shift();
      this.hint = hint;
      this.selected = hint.ringId;
      this.feedback = '已对齐一环 · 继续后轻触释放';
      this.save();
    } else this.feedback = status === 'dismissed' ? '已取消 · 未获得辅助' : '未获得辅助 · 普通提示仍免费';
    this.render();
  }
  render() {
    if (!this.ui || !this.progress) return;
    const u = this.ui,
      w = u.w,
      h = u.h,
      landscape = u.landscape;
    const cx = landscape ? w * 0.18 : w / 2;
    u.begin();
    if (this.screen === 'home') {
      const completed = NOVA_LEVELS.filter((l) => this.progress.medals[l.id]).length;
      u.star(u.ui, cx, landscape ? 30 : h * 0.083, 12, GOLD);
      u.text(
        '星扣工坊',
        cx,
        landscape ? 76 : h * 0.16,
        landscape ? 33 : 42,
        GOLD,
        320,
        u.labels,
        true,
      );
      u.text('O R B I T   A T E L I E R', cx, landscape ? 111 : h * 0.215, 10, '#d9b981');
      u.text('以星为扣，修复失落的秩序', cx, landscape ? 146 : h * 0.26, 12, '#9db9bd');
      u.showHero(
        landscape ? w * 0.69 : w / 2,
        landscape ? h * 0.52 : h * 0.505,
        landscape ? 325 : Math.min(400, h * 0.46),
      );
      u.button(
        'start',
        this.run ? '继续修复' : '唤醒第一颗星',
        cx,
        landscape ? 225 : h - 155,
        landscape ? 235 : 280,
        true,
      );
      const y = landscape ? 309 : h - 82;
      u.roundButton('levels', '星图选关', cx - 62, y, 'levels');
      u.roundButton('settings', '设置', cx + 62, y, 'settings');
      u.text('星图', cx - 62, y + 36, 11);
      u.text('设置', cx + 62, y + 36, 11);
      u.text(
        completed ? `已唤醒 ${completed} / 24 颗星核` : '指尖轻旋，让星光重归天穹',
        landscape ? w * 0.69 : cx,
        landscape ? h - 18 : h - 25,
        11,
        '#8ea6ad',
      );
    } else if (this.screen === 'levels') this.drawMap();
    else if (this.screen === 'playing' && this.run) {
      const level = this.level()!,
        index = getCampaignLevels(this.campaign).indexOf(level);
      if (landscape) {
        u.roundButton('pause', '暂停', 35, 36, 'pause');
        u.text(
          `${String(index + 1).padStart(2, '0')}  ${level.name}`,
          cx,
          82,
          20,
          GOLD,
          w * 0.3,
          u.labels,
          true,
        );
      } else
        u.header(
          `${String(index + 1).padStart(2, '0')}  ${level.name}`,
          this.challenge
            ? '好友同盘 · 不改变主线进度'
            : this.practice
              ? '开发试玩 · 不记录进度'
              : this.campaign === 'nova'
                ? CHAPTERS[level.chapter - 1]!.name
                : '经典星盘',
          'pause',
          true,
        );
      const statusX = landscape ? cx : w / 2,
        statusY = landscape ? 122 : 139 + u.safeTop;
      u.star(u.ui, statusX - 78, statusY, 6, MINT);
      u.text(
        this.campaign === 'nova' ? '释放星核' : '解开全部星环',
        statusX - 12,
        statusY,
        14,
        '#cfe9dc',
        140,
      );
      u.text(
        this.campaign === 'nova'
          ? '0 / 1'
          : `${this.run.state.releasedCount} / ${this.run.state.rings.length}`,
        statusX + 91,
        statusY,
        13,
        GOLD,
        70,
      );
      const toolsY = landscape ? 294 : h - 80;
      u.roundButton(
        'undo',
        '撤回',
        statusX - 66,
        toolsY,
        'undo',
        !this.history.length || isComplete(this.run.state),
      );
      u.roundButton('hint', '提示', statusX + 66, toolsY, 'hint', isComplete(this.run.state));
      u.text('撤回', statusX - 66, toolsY + 35, 11);
      u.text('提示', statusX + 66, toolsY + 35, 11);
      u.text(
        this.campaign === 'nova'
          ? `最优 ${level.parMoves} 环 · 已释放 ${this.run.state.releasedCount}`
          : `已转动 ${this.run.moves} 次`,
        statusX,
        landscape ? 192 : h - 25,
        10,
        '#8daeb4',
      );
      this.draw();
    } else if (this.screen === 'paused') {
      u.header('让星光歇一会儿', 'A MOMENT OF STILLNESS', 'resume');
      u.showHero(landscape ? w * 0.7 : w / 2, landscape ? 215 : h * 0.30, landscape ? 250 : 180);
      const x = landscape ? w * 0.26 : w / 2,
        y = landscape ? 146 : h * 0.56;
      u.button('resume', '继续修复', x, y, 260, true);
      u.button(this.rewardPending ? 'reward-cancel' : 'reward-align',
        this.rewardPending ? '取消辅助' : this.run?.rewardAlignUsed ? '本局辅助已使用' : '观看后对齐一环 · 一次',
        x, y + 62, 280, false, !this.rewardPending && !!this.run?.rewardAlignUsed);
      u.button('retry', '重新开始', x, y + 124, 260);
      u.button('home', '返回工坊', x, y + 186, 260);
      u.text(this.feedback || '完整观看才对齐 · 计入提示星级',
        landscape ? w * 0.7 : x, landscape ? h - 40 : y - 48, 12, '#b9ced0', 320);
    } else if (this.screen === 'result' && this.run) {
      const level = this.level()!,
        chapter = CHAPTERS[Math.min(3, level.chapter - 1)]!;
      u.header(this.practice ? '试玩完成' : '星核已归位', 'CONSTELLATION RESTORED');
      const artX = landscape ? w * 0.72 : w / 2,
        artY = landscape ? 200 : h * 0.35;
      u.artifact(
        Math.min(4, level.chapter),
        artX,
        artY,
        landscape ? 210 : Math.min(240, h * 0.29),
        this.campaign === 'nova'
          ? NOVA_LEVELS.filter((l) => l.chapter === level.chapter && this.progress.medals[l.id])
              .length
          : 6,
      );
      for (let i = 0; i < 3; i++)
        u.star(u.ui, artX + (i - 1) * 45, landscape ? 335 : h * 0.53, i === 1 ? 17 : 12, '#41535b');
      u.resultStars = {
        x: artX,
        y: landscape ? 335 : h * 0.53,
        medal: this.medal,
        start: this.time,
      };
      const x = landscape ? w * 0.26 : w / 2,
        y = landscape ? 150 : h * 0.61;
      u.text(
        this.campaign === 'nova' ? chapter.artifact : '一张星盘，重新点亮',
        x,
        y,
        24,
        GOLD,
        300,
        u.labels,
        true,
      );
      u.text(
        `${this.run.state.releasedCount} 环解开${this.run.hints ? ` · ${this.run.hints} 次提示` : ' · 独立完成'}`,
        x,
        y + 34,
        12,
        '#a8bfc0',
      );
      u.button(
        this.challenge ? 'home' : 'next',
        this.challenge
          ? '返回我的工坊'
          : this.level() === getCampaignLevels(this.campaign).at(-1)
            ? '查看星图'
            : '下一颗星核',
        x,
        y + 87,
        272,
        true,
      );
      u.button('retry', '再解一次', x - (landscape ? 0 : 72), y + 152, landscape ? 240 : 132);
      if (!landscape && !this.practice) u.button('share', '邀请同盘', x + 72, y + 152, 132);
      if (this.shareStatus)
        u.text(this.shareStatus, x, landscape ? h - 20 : h - 22, 11, '#a8bfc0', 310);
    } else if (this.screen === 'settings') {
      u.header('工坊设置', 'MAKE YOURSELF AT HOME');
      const x = w / 2,
        start = landscape ? 150 : Math.max(185, h * 0.25);
      for (const [i, [key, label]] of [
        ['sound', '声音'],
        ['vibration', '触感'],
        ['reducedMotion', '减少动态'],
      ].entries()) {
        const enabled = this.progress.settings[key as keyof Progress['settings']];
        const bx = landscape ? x + (i - 1) * 220 : x;
        u.button(
          `setting:${key}`,
          `${label}  ${enabled ? '开启' : '关闭'}`,
          bx,
          landscape ? start : start + i * 72,
          landscape ? 205 : 280,
        );
      }
      u.button('help', '解扣指南', landscape ? x - 120 : x, landscape ? 250 : start + 235, 220);
      u.button('classic', '经典星盘 · 原有 74 关', x, landscape ? 328 : start + 371, 280);
    } else if (this.screen === 'help') {
      u.header('指尖的一点星光', 'HOW TO RESTORE A STAR', 'back');
      const x = w / 2,
        y = landscape ? 150 : h * 0.23;
      u.text('转动缺口，释放星核', x, y, 25, GOLD, 340, u.labels, true);
      const lines = [
        '按住环缘，沿圆周拖动。',
        '缺口让开两个接点后，松手抽离。',
        '带星核的目标环解开，即可过关。',
        '锁住的环会点亮它需要的钥环。',
        '撤回不扣星；提示会计入星级。',
      ];
      u.text(lines.join('\n'), x, landscape ? 230 : h * 0.43, 15, '#b9ced0', landscape ? 560 : 325);
      u.button('back', '开始修复', x, landscape ? 336 : h * 0.72, 270, true);
    }
    if (u.assetError) u.button('retry-art', '画面载入失败 · 点击重试', w / 2, h / 2, 295);
    this.syncAccessibility();
    this.announceHost();
  }
  drawMap() {
    const u = this.ui,
      w = u.w,
      h = u.h,
      levels = getCampaignLevels(this.campaign);
    const classic = this.campaign === 'classic',
      per = classic ? 12 : 6;
    this.mapPage = Math.max(0, Math.min(Math.ceil(levels.length / per) - 1, this.mapPage));
    const chapter = CHAPTERS[this.mapPage % 4]!;
    u.header(
      classic ? '经典星盘' : chapter.name,
      classic
        ? '原有进度完整保留'
        : `${chapter.artifact}  ·  ${levels.slice(this.mapPage * per, (this.mapPage + 1) * per).filter((l) => this.progress.medals[l.id]).length} / 6`,
    );
    const unlocked = unlockedIndex(this.progress, this.campaign),
      entries = levels.slice(this.mapPage * per, (this.mapPage + 1) * per);
    const positions = entries.map((_, i) =>
      classic
        ? {
            x: w / 2 + ((i % 4) - 1.5) * 76,
            y: (u.landscape ? 160 : 240) + Math.floor(i / 4) * (u.landscape ? 62 : 105),
          }
        : u.landscape
          ? { x: 80 + (i * (w - 160)) / 5, y: 190 + Math.sin(i * 1.5) * 37 }
          : { x: w / 2 + Math.sin(i * 1.7) * 76, y: 170 + i * Math.min(86, (h - 350) / 5) },
    );
    if (!classic)
      u.line(
        u.ui,
        positions.map((p) => [p.x, p.y]),
        '#bdac7d',
        1.2,
        100,
      );
    entries.forEach((level, i) => {
      const index = this.mapPage * per + i,
        p = positions[i]!,
        score = this.progress.medals[level.id] || 0,
        active = index <= unlocked || this.practice;
      const current = index === unlocked;
      if (current) {
        for (let j = 3; j > 0; j--) u.circle(u.ui, p.x, p.y, 26 + j * 5, MINT, 8 + j * 3);
        u.circle(u.ui, p.x, p.y, 31, MINT, 180, 1);
      }
      u.circle(u.ui, p.x, p.y + 3, 26, '#000a11', 200);
      u.circle(u.ui, p.x, p.y, 26, score ? '#9e733b' : current ? '#14524f' : '#142932');
      u.circle(u.ui, p.x, p.y, 25, active ? GOLD : '#58696c', active ? 240 : 140, 1.2);
      u.circle(u.ui, p.x, p.y, 21, GOLD, active ? 90 : 25, 0.7);
      if (active)
        u.text(String(index + 1).padStart(2, '0'), p.x, p.y, 20, GOLD, 50, u.labels, true);
      else u.icon(u.ui, 'lock', p.x, p.y, '#6c8588');
      for (let star = 0; star < 3; star++)
        u.star(u.ui, p.x + (star - 1) * 11, p.y + 35, 3.6, star < score ? GOLD : '#425962');
      u.controls.push({
        id: `level:${level.id}`,
        label: `第${index + 1}关 ${level.name}${active ? '' : '，未解锁'}`,
        x: p.x - 29,
        y: p.y - 29,
        w: 58,
        h: 58,
        disabled: !active,
      });
    });
    const tabY = u.landscape ? h - 55 : h - 90;
    if (!classic)
      for (let i = 0; i < 4; i++) {
        const x = w / 2 + (i - 1.5) * 77;
        u.roundButton(`chapter:${i}`, CHAPTERS[i]!.name, x, tabY, 'levels');
        u.text(
          String(i + 1).padStart(2, '0'),
          x,
          tabY + 37,
          11,
          i === this.mapPage ? MINT : '#8ca1a8',
        );
        if (i === this.mapPage) u.circle(u.ui, x, tabY, 27, MINT, 180, 1);
      }
    else {
      u.button('map-prev', '上一页', w / 2 - 85, tabY, 140, false, this.mapPage === 0);
      u.button(
        'map-next',
        '下一页',
        w / 2 + 85,
        tabY,
        140,
        false,
        (this.mapPage + 1) * per >= levels.length,
      );
    }
    if (!u.landscape)
      u.text(
        classic
          ? `${this.mapPage + 1} / ${Math.ceil(levels.length / per)}`
          : '每六颗星核，修复一件星仪',
        w / 2,
        h - 22,
        10,
        '#8ca3a9',
      );
  }
  draw() {
    if (!this.run || this.screen !== 'playing') return;
    const u = this.ui;
    u.drawBoard(this.run.state, this.selected, this.hint, this.feedback ? this.selected : null);
    const focused = this.run.state.rings.find((r) => r.id === this.selected && !r.removed);
    const note =
      this.feedback ||
      (focused
        ? isLocked(this.run.state, focused.id)
          ? '先释放亮起的钥环'
          : canRelease(this.run.state, focused.id)
            ? '出口已打开 · 松手释放'
            : getBlockers(this.run.state, focused.id).length > 1
              ? '连接仍在 · 先观察外围'
              : '转动缺口，让开两个接点'
        : this.hint
          ? '让缺口朝向发光的星标'
          : '转动缺口，释放星核');
    u.text(
      note,
      u.landscape ? u.w * 0.18 : u.w / 2,
      u.landscape ? 235 : u.h - 153,
      13,
      focused && canRelease(this.run.state, focused.id) ? MINT : '#b9c9c4',
      u.landscape ? u.w * 0.3 : 340,
      u.boardLabels,
    );
  }
  activate(id: string) {
    if (id === 'reward-align') { void this.requestAlignment(); return; }
    if (id === 'reward-cancel') {
      this.cancelReward();
      this.feedback = '已取消 · 未获得辅助';
      this.render();
      return;
    }
    this.cancelReward();
    if (id === 'retry-art') {
      this.ui.loadArt();
      this.render();
      return;
    }
    if (id.startsWith('level:')) {
      this.begin(id.slice(6), this.practice && !!platform.SmallGamesDev?.isEnabled());
      return;
    }
    if (id.startsWith('chapter:')) {
      this.mapPage = Number(id.slice(8));
      this.render();
      return;
    }
    if (id.startsWith('setting:')) {
      const key = id.slice(8) as keyof Progress['settings'];
      this.progress.settings[key] = !this.progress.settings[key];
      this.save();
      this.render();
      return;
    }
    if (id === 'start') {
      if (this.run && !isComplete(this.run.state)) {
        this.campaign = this.level()?.campaign || 'classic';
        this.navigate('playing');
      } else this.begin(NOVA_LEVELS[unlockedIndex(this.progress)]!.id);
    }
    if (id === 'levels' || id === 'classic') {
      this.campaign = id === 'classic' ? 'classic' : 'nova';
      this.mapPage = Math.floor(
        unlockedIndex(this.progress, this.campaign) / (this.campaign === 'nova' ? 6 : 12),
      );
      this.navigate('levels');
    }
    if (id === 'home') this.navigate('home');
    if (id === 'settings') this.navigate('settings');
    if (id === 'pause' && this.screen === 'playing') this.navigate('paused');
    if (id === 'resume') this.navigate('playing');
    if (id === 'retry' && this.run)
      this.begin(this.run.state.levelId, this.practice, this.challenge);
    if (id === 'next' && this.run) {
      const levels = getCampaignLevels(this.campaign),
        next = levels[levels.findIndex((l) => l.id === this.run!.state.levelId) + 1];
      if (next) this.begin(next.id, this.practice);
      else this.navigate('levels');
    }
    if (id === 'help') {
      this.returnScreen = this.screen;
      this.navigate('help');
    }
    if (id === 'back') this.navigate(this.returnScreen);
    if (id === 'map-prev' || id === 'map-next') {
      this.mapPage += id === 'map-prev' ? -1 : 1;
      this.render();
    }
    if (id === 'undo' && this.run && this.history.length && !isComplete(this.run.state)) {
      this.cancel();
      this.run = restoreUndo(this.run!, this.history.pop()!);
      this.flights = [];
      this.hint = null;
      this.selected = null;
      this.feedback = '';
      this.save();
      this.render();
    }
    if (id === 'hint' && this.run && !isComplete(this.run.state)) {
      this.cancel();
      this.hint = findHint(this.run!.state);
      if (this.hint) {
        this.selected = this.hint.ringId;
        this.run!.hints++;
        this.save();
        this.feedback = '';
        this.draw();
      }
    }
    if (id === 'share') void this.share();
  }
  async share() {
    if (!this.run || this.sharePending || !platform.OrbitPublishing) return;
    this.sharePending = true;
    const requested = this.run;
    try {
      const result = await platform.OrbitPublishing.share({
        params: { challenge: this.run.state.levelId },
        text: `我用 ${this.run.state.releasedCount} 个星环唤醒了星核，来试试这张星盘。`,
      });
      if (this.run !== requested || this.screen !== 'result') return;
      this.shareStatus =
        result.status === 'shared'
          ? '已打开系统分享'
          : result.status === 'copied'
            ? '挑战链接已复制'
            : result.status === 'cancelled'
              ? '已取消分享'
              : '可复制下方链接邀请好友';
      this.render();
      if (
        sys.isBrowser &&
        !['shared', 'copied', 'cancelled'].includes(result.status) &&
        result.url
      ) {
        const field = document.createElement('input');
        field.value = result.url;
        field.readOnly = true;
        field.setAttribute('aria-label', '同盘挑战链接');
        field.style.cssText =
          'position:fixed;left:10%;bottom:8px;width:80%;height:44px;color:#efd39b;background:#10232b;border:1px solid #bda172;z-index:8';
        this.accessibility?.appendChild(field);
      }
    } catch {
      if (!this.disposed && this.run === requested && this.screen === 'result') {
        this.shareStatus = '分享暂时不可用，请稍后重试';
        this.render();
      }
    } finally {
      this.sharePending = false;
    }
  }
  down(id: number, x: number, y: number) {
    if (this.press || this.drag) return;
    const control = this.ui.hit(x, y);
    if (control) {
      this.press = { id, control: control.id, x, y };
      this.ui.pressed = control.id;
      this.sound('turn');
      return;
    }
    if (this.screen !== 'playing' || !this.run || isComplete(this.run.state)) return;
    const p = this.ui.unproject(x, y),
      scale = this.ui.fit.scale;
    const candidates = this.run.state.rings
      .filter((r) => !r.removed)
      .map((r) => ({
        ring: r,
        distance: Math.abs(Math.hypot(p.x - r.x, p.y - r.y) - r.r) * scale,
        angle: Math.atan2(p.y - r.y, p.x - r.x),
      }))
      .filter(
        (c) =>
          c.distance < 25 &&
          Math.abs(normalizeAngle(c.angle - c.ring.angle)) > c.ring.gap / 2 - 0.12,
      )
      .sort(
        (a, b) =>
          (isLocked(this.run!.state, a.ring.id) ? 15 : 0) -
          (isLocked(this.run!.state, b.ring.id) ? 15 : 0) +
          a.distance -
          b.distance -
          (a.ring.id === this.selected ? 5 : 0) +
          (b.ring.id === this.selected ? 5 : 0),
      );
    const picked = candidates[0];
    if (!picked) return;
    this.selected = picked.ring.id;
    this.feedback = '';
    if (isLocked(this.run.state, picked.ring.id)) {
      this.notify(
        picked.ring.requires?.length
          ? '先释放亮起的钥环'
          : `再释放 ${Math.max(0, (picked.ring.unlockAfter || 0) - this.run.state.releasedCount)} 环`,
      );
      return;
    }
    this.drag = {
      id,
      ringId: picked.ring.id,
      angle: picked.angle,
      rawAngle: picked.ring.angle,
      x,
      y,
      moved: false,
      before: structuredClone(this.run),
    };
    this.draw();
  }
  move(id: number, x: number, y: number) {
    if (this.press?.id === id && Math.hypot(x - this.press.x, y - this.press.y) > 12)
      this.press = null;
    if (!this.drag || this.drag.id !== id || !this.run) return;
    const d = this.drag,
      p = this.ui.unproject(x, y),
      ring = this.run.state.rings.find((r) => r.id === d.ringId)!;
    if (!d.moved && Math.hypot(x - d.x, y - d.y) < 6) return;
    if (Math.hypot(p.x - ring.x, p.y - ring.y) < ring.r * 0.27) return;
    const angle = Math.atan2(p.y - ring.y, p.x - ring.x),
      wasReady = canRelease(this.run.state, ring.id);
    d.rawAngle += normalizeAngle(angle - d.angle);
    rotateRing(this.run.state, ring.id, snapAngle(this.run.state, ring.id, d.rawAngle));
    d.angle = angle;
    d.moved = true;
    if (!wasReady && canRelease(this.run.state, ring.id)) this.sound('turn');
    this.draw();
  }
  up(id: number, x: number, y: number) {
    if (this.press?.id === id) {
      const press = this.press;
      this.press = null;
      this.ui.pressed = null;
      if (this.ui.hit(x, y)?.id === press.control && Math.hypot(x - press.x, y - press.y) < 12)
        this.activate(press.control);
      return;
    }
    if (!this.drag || this.drag.id !== id || !this.run) return;
    const d = this.drag;
    this.drag = null;
    const ring = this.run.state.rings.find((r) => r.id === d.ringId)!;
    const locked = this.run.state.rings.filter((r) => isLocked(this.run!.state, r.id));
    const released = tryRelease(this.run.state, d.ringId);
    if (d.moved || released) {
      this.history.push(d.before);
      if (this.history.length > 80) this.history.shift();
      this.run.moves++;
    }
    if (released) {
      for (const r of locked.filter((r) => !isLocked(this.run!.state, r.id)))
        this.ui.pulses.push({ x: r.x, y: r.y, start: this.time, unlocked: true });
      this.flights.push({
        ring: { ...ring },
        age: 0,
        goal: !!this.run.state.goalRingIds?.includes(ring.id),
      });
      this.hint = null;
      this.selected = null;
      this.sound('release');
      if (isComplete(this.run.state)) {
        this.medal = this.practice
          ? 0
          : this.challenge
            ? this.run.hints
              ? 1
              : this.run.state.releasedCount <=
                  (this.level()?.parMoves || this.run.state.rings.length)
                ? 3
                : 2
            : settle(this.progress, this.run);
        this.completionAge = 0;
        this.sound('complete');
      }
      this.save();
      this.render();
    } else {
      for (const blocker of getBlockers(this.run.state, ring.id))
        blocker.points.forEach((p, index) => {
          if (!clearsOpening(ring, blocker.angles[index]!))
            this.ui.pulses.push({ x: p.x, y: p.y, start: this.time, unlocked: false });
        });
      this.save();
      this.render();
      this.notify(d.moved ? '接点仍被挡住，再转一转' : '沿着环缘拖动');
    }
  }
  touchStart(e: EventTouch) {
    this.lastTouch = this.time;
    const p = e.getUILocation();
    this.trusted('touch');
    this.down(e.getID() ?? 0, p.x, this.ui.h - p.y);
  }
  touchMove(e: EventTouch) {
    const p = e.getUILocation();
    this.move(e.getID() ?? 0, p.x, this.ui.h - p.y);
  }
  touchEnd(e: EventTouch) {
    const p = e.getUILocation();
    this.up(e.getID() ?? 0, p.x, this.ui.h - p.y);
  }
  touchCancel(e: EventTouch) {
    if (this.drag?.id === (e.getID() ?? 0) || this.press?.id === (e.getID() ?? 0)) {
      this.cancel();
      this.save();
      this.draw();
    }
  }
  mouseDown(e: EventMouse) {
    if (this.time - this.lastTouch < 0.7 || e.getButton() !== EventMouse.BUTTON_LEFT) return;
    const p = e.getUILocation();
    this.trusted('mouse');
    this.down(-1, p.x, this.ui.h - p.y);
  }
  mouseMove(e: EventMouse) {
    if (this.time - this.lastTouch < 0.7) return;
    const p = e.getUILocation();
    this.move(-1, p.x, this.ui.h - p.y);
  }
  mouseUp(e: EventMouse) {
    if (this.time - this.lastTouch < 0.7) return;
    const p = e.getUILocation();
    this.up(-1, p.x, this.ui.h - p.y);
  }
  keyDown(e: EventKeyboard) {
    if (e.keyCode === KeyCode.ESCAPE) {
      if (this.screen === 'playing') this.navigate('paused');
      else if (this.screen === 'paused') this.navigate('playing');
      return;
    }
    if (this.screen !== 'playing' || !this.run || this.drag || isComplete(this.run.state)) return;
    const live = this.run.state.rings.filter((r) => !r.removed);
    if (e.keyCode === KeyCode.ARROW_UP || e.keyCode === KeyCode.ARROW_DOWN) {
      const at = live.findIndex((r) => r.id === this.selected);
      this.selected =
        live[
          (at + (e.keyCode === KeyCode.ARROW_DOWN ? 1 : live.length - 1) + live.length) %
            live.length
        ]?.id || null;
      this.draw();
      return;
    }
    const ring = live.find((r) => r.id === this.selected) || live[0];
    if (!ring || isLocked(this.run.state, ring.id)) return;
    if (
      ![KeyCode.ARROW_LEFT, KeyCode.ARROW_RIGHT, KeyCode.SPACE, KeyCode.ENTER].includes(e.keyCode)
    )
      return;
    const before = structuredClone(this.run);
    this.selected = ring.id;
    const moved = e.keyCode === KeyCode.ARROW_LEFT || e.keyCode === KeyCode.ARROW_RIGHT;
    if (moved)
      rotateRing(
        this.run.state,
        ring.id,
        ring.angle + ((e.keyCode === KeyCode.ARROW_LEFT ? -1 : 1) * Math.PI) / 36,
      );
    this.drag = {
      id: -2,
      ringId: ring.id,
      angle: ring.angle,
      rawAngle: ring.angle,
      x: 0,
      y: 0,
      moved,
      before,
    };
    this.up(-2, 0, 0);
  }
  trusted(type: string) {
    platform.__orbitTrustedInput = { count: (platform.__orbitTrustedInput?.count || 0) + 1, type };
  }
  update(dt: number) {
    if (!this.ui) return;
    const frame = view.getFrameSize(),
      key = `${frame.width}:${frame.height}`;
    if (key !== this.frameKey) {
      this.frameKey = key;
      this.cancel();
      this.ui.resize();
      this.render();
    }
    if (this.screen === 'paused') {
      this.ui.animate(this.time, [], true, false);
      return;
    }
    this.time += Math.min(dt, 0.05);
    for (const f of this.flights) f.age += Math.min(dt, 0.05);
    this.flights = this.flights.filter((f) => f.age < (f.goal ? 0.7 : 0.4));
    if (this.feedback && this.time > this.feedbackUntil) {
      this.feedback = '';
      this.draw();
    }
    if (this.completionAge >= 0 && this.screen === 'playing') {
      this.completionAge += Math.min(dt, 0.05);
      if (this.completionAge > (this.progress.settings.reducedMotion ? 0.05 : 0.65)) {
        this.completionAge = -1;
        this.screen = 'result';
        this.render();
        if (!this.practice && !this.challenge)
          void platform.OrbitPublishing?.interstitial({
            placement: 'puzzle-complete',
            naturalBreak: true,
          });
      }
    }
    if (!this.press) this.ui.pressed = null;
    this.ui.animate(
      this.time,
      this.flights,
      this.progress.settings.reducedMotion,
      this.screen === 'playing',
    );
  }
  snapshot() {
    return {
      engine: `Cocos Creator ${VERSION}`,
      screen: this.screen,
      state: this.run ? structuredClone(this.run.state) : null,
      progress: structuredClone(this.progress),
      moves: this.run?.moves,
      hints: this.run?.hints,
      rewardAlignUsed: this.run?.rewardAlignUsed === true,
      rewardPending: this.rewardPending,
      practice: this.practice,
      challenge: this.challenge,
      selectedRingId: this.selected,
      drag: this.drag ? { ringId: this.drag.ringId } : null,
      flights: this.flights.length,
      medal: this.medal,
      width: this.ui.w,
      height: this.ui.h,
      fit: { ...this.ui.fit },
      controls: this.ui.controls.map((c) => ({ ...c })),
      assetReady: this.ui.assetReady,
      shareStatus: this.shareStatus,
      campaign: this.campaign,
      level: this.level() ? { id: this.level()!.id, parMoves: this.level()!.parMoves } : null,
    };
  }
  syncAccessibility() {
    if (!this.accessibility) return;
    this.accessibility.dataset.screen = this.screen;
    this.accessibility.dataset.ready = String(this.ui.assetReady);
    this.accessibility.replaceChildren();
    const canvas = document.querySelector('canvas'),
      rect = canvas?.getBoundingClientRect();
    if (!rect) return;
    canvas?.setAttribute('aria-label', '拖动圆环转动缺口，松手释放星核');
    canvas?.setAttribute('tabindex', '0');
    for (const control of this.ui.controls) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', control.label);
      button.dataset.action = control.id;
      button.disabled = !!control.disabled;
      button.style.cssText = `position:fixed;left:${rect.left + (control.x / this.ui.w) * rect.width}px;top:${rect.top + (control.y / this.ui.h) * rect.height}px;width:${(control.w / this.ui.w) * rect.width}px;height:${(control.h / this.ui.h) * rect.height}px;opacity:0;pointer-events:none;`;
      button.addEventListener('click', () => this.activate(control.id));
      this.accessibility.appendChild(button);
    }
  }
  announceHost() {
    if (!sys.isBrowser || window.parent === window) return;
    try {
      window.parent.postMessage(
        {
          type: 'small-games:display-state',
          gameId: 'orbit-atelier',
          screen: ['playing', 'paused', 'result'].includes(this.screen) ? 'playing' : 'home',
        },
        new URL(document.referrer).origin,
      );
    } catch {
      /* Unrelated embeds have no Shell host. */
    }
  }
  onDestroy() {
    this.disposed = true;
    this.cancelReward();
    this.cancel();
    this.save();
    this.unregister.forEach((fn) => fn());
    input.off(Input.EventType.TOUCH_START, this.touchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
    input.off(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
    input.off(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
    input.off(Input.EventType.MOUSE_UP, this.mouseUp, this);
    input.off(Input.EventType.KEY_DOWN, this.keyDown, this);
    game.off(Game.EVENT_HIDE, this.suspend, this);
    if (sys.isBrowser) {
      window.removeEventListener('blur', this.suspend);
      window.removeEventListener('pagehide', this.pageHide);
      document.removeEventListener('visibilitychange', this.visibility);
      delete platform.__orbit;
    }
    this.accessibility?.remove();
    this.ui?.destroy();
  }
}
