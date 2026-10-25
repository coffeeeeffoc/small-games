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
import { GardenView, C } from './GardenView';
import { createSession, platform } from './GameSession';
import { LEVELS, CHAPTERS, getLevel } from './generated/levels.js';
import { SHAPE_BY_ID } from './generated/shapes.js';
import { hasPlacement, previewPlacement } from './generated/engine.js';
import { canResetOptions } from './generated/rewards.js';
import { totalStars, resumeState } from './generated/progress.js';
const { ccclass } = _decorator;
const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (n: number) => Number(n || 0).toLocaleString('zh-CN');
const name = (s: any) => (s?.variant === 'refill' ? '立即补位' : '三选二');
const palette = ['#ed806b', '#73bf94', '#f2cb58', '#91a9c0', '#acbc73'];
type Press = {
  id: number;
  control: string;
  x: number;
  y: number;
  lastY: number;
  moved: boolean;
  touch: boolean;
};

@ccclass('PlaceAndClear')
export class PlaceAndClear extends Component {
  ui!: GardenView;
  session!: ReturnType<typeof createSession>;
  dirty = true;
  disposed = false;
  time = 0;
  lastTouch = -10;
  touchPointer = sys.isMobile;
  trackPointer = (event: PointerEvent) => {
    this.touchPointer = event.pointerType !== 'mouse';
  };
  inputCount = 0;
  observedState: any = null;
  feedback: { event: any; until: number } | null = null;
  scroll = 0;
  contentHeight = 0;
  screenKey = '';
  press: Press | null = null;
  ghost: any = null;
  layout = {
    board: { x: 0, y: 0, w: 0, h: 0, inset: 0, pitch: 0 },
    candidates: [] as { x: number; y: number; w: number; h: number; slot: number }[],
  };
  audio!: AudioSource;
  music!: AudioSource;
  clips: Record<string, AudioClip> = {};
  musicRequested = false;
  userInteracted = false;
  accessibility?: HTMLDivElement;
  accessibilityKey = '';
  waitingVisible: ((result: any) => void) | null = null;
  start() {
    view.enableAutoFullScreen(false);
    view.resizeWithBrowserSize(true);
    this.ui = new GardenView(this.node, () => (this.dirty = true));
    this.audio = this.node.addComponent(AudioSource);
    this.music = this.node.addComponent(AudioSource);
    this.music.loop = true;
    this.music.volume = 0.16;
    const storage = {
      getItem: (key: string) => {
        try {
          return sys.localStorage.getItem(key);
        } catch {
          return null;
        }
      },
      setItem: (key: string, value: string) => {
        sys.localStorage.setItem(key, value);
      },
    } as Storage;
    this.session = createSession({
      storage,
      audio: {
        unlock: () => {},
        play: (key: string) => this.play(key),
        vibrate: (key: string) => this.vibrate(key),
        stop: () => {
          this.musicRequested = false;
          this.music.stop();
        },
        syncMusic: (active: boolean) => this.syncMusic(active),
      },
      changed: () => {
        this.dirty = true;
      },
      hidden: () => sys.isBrowser && document.hidden,
      port: () => this.rewardPort(),
      inspect: () => this.inspect(),
    });
    for (const key of ['tap', 'place', 'clear', 'win', 'invalid', 'undo', 'music'])
      resources.load('audio/' + key, AudioClip, (error, clip) => {
        if (!error && !this.disposed) {
          this.clips[key] = clip;
          if (key === 'music') {
            this.music.clip = clip;
            this.syncMusic(this.musicRequested);
          }
        }
      });
    input.on(Input.EventType.TOUCH_START, this.touchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.clear, this);
    input.on(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
    input.on(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
    input.on(Input.EventType.MOUSE_UP, this.mouseUp, this);
    input.on(Input.EventType.MOUSE_WHEEL, this.wheel, this);
    game.on(Game.EVENT_HIDE, this.suspend, this);
    game.on(Game.EVENT_SHOW, this.visible, this);
    if (sys.isBrowser) {
      // Creator 3.8.8 leaves simulate unset on mouse-derived touch events.
      window.addEventListener('pointerdown', this.trackPointer, true);
      window.addEventListener('resize', this.resize);
      window.addEventListener('blur', this.suspend);
      window.addEventListener('pagehide', this.exit);
      document.addEventListener('visibilitychange', this.visibility);
      this.accessibility = document.createElement('div');
      this.accessibility.id = 'game';
      this.accessibility.setAttribute('aria-label', '摆消乐');
      this.accessibility.style.cssText =
        'position:fixed;left:-10000px;width:1px;height:1px;overflow:hidden';
      document.body.append(this.accessibility);
      platform.getPlaceAndClearSnapshot = () => this.inspect();
    }
    this.render();
  }
  rewardPort() {
    const host = (platform.PlaceAndClearHost ?? platform.ThreeChooseTwoHost)?.ads;
    const port = host || platform.SmallGamesRewardAds;
    // Test providers require the same explicit developer permission as other mutation APIs.
    const test = platform.SmallGamesDev?.isEnabled()
      ? (globalThis as any).PlaceAndClearTestAds
      : undefined;
    const provider = test || port;
    if (!provider) return undefined;
    return {
      available: provider.available,
      offer: async (request: any) => {
        const result = await provider.offer(request);
        if (result?.status === 'completed' && sys.isBrowser && document.hidden) {
          return new Promise((resolve) => {
            this.waitingVisible = (r) => {
              this.waitingVisible = null;
              resolve(r);
            };
          });
        }
        return result;
      },
      cancel: () => {
        this.waitingVisible?.({ status: 'dismissed' });
        provider.cancel?.();
      },
    };
  }
  play(key: string) {
    if (this.session?.data.progress.settings.sound && this.clips[key] && !this.disposed)
      this.audio.playOneShot(this.clips[key], 0.3);
  }
  syncMusic(active: boolean) {
    this.musicRequested = active;
    const enabled =
      active &&
      this.userInteracted &&
      this.session?.data.progress.settings.music &&
      this.music.clip &&
      !this.disposed;
    if (enabled && !this.music.playing) this.music.play();
    else if (!enabled) this.music.stop();
  }
  vibrate(key: string) {
    if (this.session?.data.progress.settings.vibration && sys.isBrowser)
      try {
        navigator.vibrate?.(key === 'clear' ? [15, 30, 20] : 8);
      } catch {}
  }
  suspend = () => {
    this.clear();
    this.session?.suspend();
  };
  visible = () => {
    if (!sys.isBrowser || !document.hidden) {
      this.waitingVisible?.({ status: 'completed' });
      this.dirty = true;
    }
  };
  visibility = () => {
    if (document.hidden) this.suspend();
    else this.visible();
  };
  exit = () => {
    this.session?.suspend();
    this.music.stop();
    this.clear();
  };
  resize = () => {
    this.clear();
    this.ui.resize();
    this.scroll = 0;
    this.dirty = true;
  };
  update(dt: number) {
    this.time += dt;
    if (this.feedback) {
      this.dirty = true;
      if (this.time >= this.feedback.until) this.feedback = null;
    }
    if (this.dirty) this.render();
  }
  action(id: string) {
    this.userInteracted = true;
    this.play('tap');
    this.press = null;
    this.ghost = null;
    if (id.startsWith('slot:')) this.session.select(Number(id.slice(5)));
    else if (id.startsWith('level:')) this.session.level(Number(id.slice(6)));
    else if (id.startsWith('setting:')) this.session.setting(id.slice(8));
    else if (id === 'board') {
      /* Board taps use their exact cell in up(). */
    } else {
      if (['levels-prev', 'levels-next'].includes(id)) this.scroll = 0;
      void this.session.dispatch(id);
    }
    this.dirty = true;
  }
  inspect() {
    const d = this.session?.data;
    return JSON.parse(
      JSON.stringify({
        engine: 'Cocos Creator ' + VERSION,
        creator: VERSION,
        ready: this.ui?.ready || false,
        ...d,
        online: d?.onlineSession
          ? {
              id: d.onlineSession.id,
              seq: d.onlineSession.seq,
              status: d.onlineSession.status,
              eligible: d.onlineSession.eligible,
            }
          : null,
        controls: this.ui?.controls || [],
        viewport: { width: this.ui?.W, height: this.ui?.H },
        layout: this.layout,
        board: this.layout.board,
        scroll: this.scroll,
        contentHeight: this.contentHeight,
        inputCount: this.inputCount,
        drag: !!this.press?.moved,
        assets: this.ui?.frames.size || 0,
      }),
    );
  }
  header(title: string, back = 'home', pause = false) {
    const u = this.ui;
    u.iconButton(
      back,
      back === 'home' ? '返回首页' : back === 'resume' ? '继续游戏' : '返回',
      'back',
      18,
      22,
    );
    u.text('header', title, u.W / 2, 45, 24, u.W - 140);
    if (pause) u.iconButton('pause', '暂停', 'pause', u.W - 62, 22);
  }
  para(id: string, text: string, y: number, size = 15, height = 60, fill = C.muted) {
    this.ui.text(id, text, this.ui.W / 2, y, size, this.ui.W - 48, fill, 5, height, false);
  }
  button(id: string, label: string, y: number, primary = false, disabled = false) {
    this.ui.button(id, label, 24, y, this.ui.W - 48, 54, primary, disabled);
  }
  mini(id: string, candidate: any, x: number, y: number, cell: number, layer = 3) {
    const shape = SHAPE_BY_ID[candidate?.shapeId];
    if (!shape) return;
    const p = cell + 3;
    for (const [dx, dy] of shape.cells) {
      const xx = x - (shape.width * p) / 2 + dx * p,
        yy = y - (shape.height * p) / 2 + dy * p;
      this.ui.block(xx, yy, cell, this.pieceColor(candidate.color), layer);
      if (candidate.stars?.some(([sx, sy]: number[]) => sx === dx && sy === dy))
        this.ui.icon('star', xx + cell / 2, yy + cell / 2, cell * 0.55, '#fff6c3', layer);
    }
  }
  pieceColor(value: number) {
    return (
      this.session.data.progress.settings.highContrast
        ? ['#d86d41', '#0e8b7d', '#b98b14', '#768bc5', '#728f45']
        : palette
    )[Math.abs((value || 1) - 1) % 5];
  }
  stars(id: string, count: number, x: number, y: number, size = 24) {
    for (let i = 0; i < 3; i++)
      this.ui.icon('star', x + (i - 1) * (size + 6), y, size, i < count ? C.gold : '#b7bca3');
  }
  render() {
    if (!this.session || !this.ui || this.disposed) return;
    this.dirty = false;
    const d = this.session.data,
      u = this.ui;
    const key = d.screen + ':' + d.levelPage;
    if (this.screenKey !== key) {
      this.screenKey = key;
      this.scroll = 0;
      this.press = null;
      this.ghost = null;
    }
    const current = d.state;
    if (current !== this.observedState) {
      if (
        d.screen === 'playing' &&
        current?.lastEvent?.type === 'place' &&
        this.observedState?.stats.placements + 1 === current.stats.placements
      )
        this.feedback = { event: current.lastEvent, until: this.time + 0.28 };
      this.observedState = current;
    }
    if (d.screen !== 'playing') this.feedback = null;
    u.begin(this.scroll);
    u.background(d.screen, d.progress.settings.highContrast);
    this.contentHeight = u.H;
    this.layout.candidates = [];
    if (!u.ready) {
      u.text('loading', u.error || '积木准备中…', u.W / 2, u.H / 2, 22);
      if (u.error) platform.PlaceAndClearLoading?.fail(u.error);
      u.end();
      return;
    }
    platform.PlaceAndClearLoading?.ready();
    switch (d.screen) {
      case 'home':
        this.home();
        break;
      case 'levels':
        this.levels();
        break;
      case 'brief':
        this.brief();
        break;
      case 'playing':
        this.playing();
        break;
      case 'pause':
      case 'settings':
        this.settings();
        break;
      case 'help':
        this.help();
        break;
      case 'endless':
        this.endless();
        break;
      case 'result':
        this.result();
        break;
      case 'leaderboard':
        this.leaderboard();
        break;
      case 'dev-tools':
        this.developer();
        break;
    }
    if (d.modal) {
      const old = u.scroll;
      u.scroll = 0;
      u.controls = [];
      u.panel(0, 0, u.W, u.H, '#203b36a8', '', 0, 6);
      const y = Math.max(20, (u.H - 290) / 2);
      u.panel(20, y, u.W - 40, 290, '#fff6df', '#fff9e8', 25, 6);
      u.text('reset-title', '重置选项', u.W / 2, y + 40, 25, u.W - 60, C.ink, 7);
      u.text(
        'reset-copy',
        d.rewardPending
          ? '正在准备广告…\n完整观看后才会更换选项。'
          : '完整观看视频后，更换尚未放置的积木。\n棋盘和当前进度保留。',
        u.W / 2,
        y + 109,
        16,
        u.W - 72,
        C.ink,
        7,
        85,
        false,
      );
      u.button(
        'reward-confirm',
        '看广告并重置',
        40,
        y + 168,
        u.W - 80,
        52,
        true,
        d.rewardPending,
        6,
      );
      u.button('reward-cancel', '取消', 40, y + 232, u.W - 80, 44, false, false, 6, 16);
      u.scroll = old;
    }
    if (d.message) {
      const old = u.scroll;
      u.scroll = 0;
      u.panel(16, u.H - 103, u.W - 32, 66, '#183c34ed', '', 14, 6);
      u.text('toast', d.message, u.W / 2, u.H - 70, 15, u.W - 50, '#fff9e6', 7, 58, false);
      u.scroll = old;
    }
    u.end();
    this.syncAccessibility();
    if (sys.isBrowser)
      try {
        if (window.parent !== window)
          window.parent.postMessage(
            {
              type: 'small-games:display-state',
              gameId: 'place-and-clear',
              screen: d.screen === 'home' ? 'home' : 'playing',
            },
            location.origin,
          );
      } catch {}
  }
  home() {
    const u = this.ui,
      d = this.session.data,
      p = d.progress,
      saved = resumeState(p),
      id = saved?.levelId || Math.min(p.unlocked, LEVELS.length),
      short = u.H < 740,
      tiny = u.H < 600;
    u.button('stars', '', 24, 22, 70, 44);
    u.controls.pop();
    u.icon('star', 35, 43, 31, C.gold);
    u.text('star-count', String(totalStars(p)), 70, 44, 20, 35);
    u.iconButton('settings', '设置', 'settings', u.W - 68, 22);
    if (d.developer) u.button('dev-tools', '开发', u.W - 129, 22, 55, 44, false, false, 2, 13);
    const logoH = tiny ? 119 : short ? 143 : 185,
      heroH = tiny ? 142 : short ? 177 : 235;
    let y = 66;
    u.image('logo', 'logo', u.W / 2, y + logoH / 2, logoH * 1.5, logoH);
    y += logoH;
    const heroW = u.W - 48 + (tiny ? 4 : short ? 22 : 64);
    u.image('hero', 'hero', u.W / 2, y + heroH / 2, heroW, heroW * 0.75);
    y += heroH;
    const text = d.canResumeOnline
      ? '三选二在线 · 已保存的对局'
      : saved?.mode === 'endless'
        ? name(saved) + ' · ' + fmt(saved.score) + ' 分'
        : '第 ' + pad(id) + ' 关 · ' + getLevel(id).title;
    u.button(
      'progress',
      text,
      Math.max(24, u.W / 2 - 118),
      y,
      Math.min(236, u.W - 48),
      36,
      false,
      false,
      2,
      14,
    );
    u.controls.pop();
    y += short ? 46 : 50;
    const h = tiny ? 49 : short ? 55 : 70;
    u.button(
      'start',
      d.canResumeOnline
        ? '继续在线对局'
        : saved
          ? '继续游戏'
          : p.unlocked > 1
            ? '▶ 继续闯关'
            : '▶ 开始闯关',
      24,
      y,
      u.W - 48,
      h,
      true,
      false,
      2,
      short ? 22 : 25,
    );
    y += h + (short ? 18 : 22);
    const w = (u.W - 62) / 2;
    u.button('levels', '选关', 24, y, w, short ? 52 : 66);
    u.icon('levels', 24 + w / 2 - 38, y + (short ? 26 : 33), 23);
    u.button('endless', '无尽挑战', 38 + w, y, w, short ? 52 : 66, false, false, 2, 18);
    u.icon('endless', 38 + w + w / 2 - 55, y + (short ? 26 : 33), 23);
    y += short ? 64 : 84;
    if (d.invitedSeed !== null) {
      this.button('challenge-invite', '接受好友的同局挑战', y);
      y += 70;
    }
    const navY = Math.max(y, u.H - 92);
    for (const [index, id, label, icon] of [
      [0, 'leaderboard', '排行榜', 'trophy'],
      [1, 'help', '玩法帮助', 'help'],
    ] as const) {
      const x = u.W / 2 + (index === 0 ? -67 : 67);
      u.iconButton(id, label, icon, x - 22, navY);
      u.text('nav:' + id, label, x, navY + 60, 13, 100, '#fff9e1');
    }
    this.contentHeight = Math.max(u.H, navY + 86);
  }
  levels() {
    const u = this.ui,
      d = this.session.data,
      p = d.progress;
    this.header('选关');
    this.para(
      'progress',
      `已通关 ${Object.keys(p.records).length} / ${LEVELS.length} · 已收集 ${totalStars(p)} 颗星`,
      91,
      13,
      30,
    );
    let y = 113;
    if (d.developer) {
      u.panel(24, y, u.W - 48, 54, '#fff4dbd9');
      u.text('dev-banner', '开发模式 · 全关可试玩', u.W / 2, y + 17, 15);
      u.text('dev-note', '独立试玩，不计入真实进度与纪录', u.W / 2, y + 38, 12);
      y += 66;
    }
    u.button('levels-prev', '上一页', 24, y, 80, 44, false, d.levelPage === 0, 2, 14);
    u.text(
      'page',
      `${d.levelPage * 30 + 1}–${Math.min((d.levelPage + 1) * 30, LEVELS.length)} / ${LEVELS.length}`,
      u.W / 2,
      y + 22,
      14,
      150,
    );
    u.button('levels-next', '下一页', u.W - 104, y, 80, 44, false, d.levelPage >= 3, 2, 14);
    y += 83;
    for (let group = 0; group < 3; group++) {
      const chapter = CHAPTERS[d.levelPage * 3 + group];
      u.panel(u.W / 2 - 108, y + 4, 216, 54, '#886d44');
      u.gradient(u.W / 2 - 108, y, 216, 54, '#edcf9f', '#d4ac75', 12);
      u.text('chapter:' + group, chapter.title, u.W / 2, y + 27, 23, 206, '#5b3b20');
      u.circle(u.W / 2 - 97, y + 12, 2.5, '#8a724b');
      u.circle(u.W / 2 + 97, y + 12, 2.5, '#8a724b');
      y += 84;
      const gap = 9,
        w = (u.W - 48 - 4 * gap) / 5;
      for (let i = 0; i < 10; i++) {
        const id = d.levelPage * 30 + group * 10 + i + 1,
          record = p.records[id],
          unlocked = d.developer || id <= p.unlocked,
          x = 24 + (i % 5) * (w + gap),
          yy = y + Math.floor(i / 5) * 100;
        u.button('level:' + id, '', x, yy, w, 72, id === p.unlocked, !unlocked);
        u.controls.at(-1)!.label =
          `第${id}关 ${getLevel(id).title}${!unlocked ? ' 尚未解锁' : d.developer ? ' 开发试玩' : ''}`;
        u.text(
          'level-num:' + id,
          pad(id),
          x + w / 2,
          yy + 24,
          23,
          w,
          unlocked ? C.ink : '#766f5a',
        );
        if (d.developer) u.text('trial:' + id, '试玩', x + w / 2, yy + 53, 11, w);
        else if (record) this.stars('stars:' + id, record.stars, x + w / 2, yy + 53, 10);
        else if (!unlocked) u.icon('lock', x + w / 2, yy + 51, 16, '#817962');
        else u.text('challenge:' + id, '挑战', x + w / 2, yy + 53, 11, w);
      }
      y += 238;
    }
    this.para('endnote', '每次好选择，都会成为下一步的余地。', y, 12, 40);
    this.contentHeight = y + 50;
  }
  goals(config: any) {
    const g = config.goal;
    return [
      `清除 ${g.lines} 条线`,
      g.multi ? `完成 ${g.multi} 次多线消除` : '',
      g.cross ? `完成 ${g.cross} 次交叉消除` : '',
      g.stars ? `收集 ${g.stars} 颗星标` : '',
    ].filter(Boolean);
  }
  brief() {
    const u = this.ui,
      d = this.session.data,
      c = getLevel(d.briefLevel);
    this.header('第 ' + pad(c.id) + ' 关', 'levels');
    this.mini('brief', c.candidates[0][0], u.W / 2, 151, 35);
    this.para(
      'chapter',
      CHAPTERS.find((x) => x.id === c.chapter)?.title || '初识积木',
      220,
      14,
      30,
    );
    u.text('title', c.title, u.W / 2, 258, 31);
    u.panel(24, 301, u.W - 48, 137, '#fff7e4ed', '#fff9e8', 22);
    u.text('goal', this.goals(c)[0], u.W / 2, 332, 25);
    u.text(
      'limits',
      [
        ...this.goals(c).slice(1),
        `最多 ${c.maxGroups} 组积木`,
        c.discardBudget !== undefined ? `舍弃积木不超过 ${c.discardBudget} 格` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      u.W / 2,
      390,
      15,
      u.W - 70,
      C.muted,
      5,
      75,
      false,
    );
    this.para(
      'rules',
      '三块里放下两块，剩下的一块自动丢弃。\n填满一整行或一整列，就能消除。',
      482,
      14,
      65,
    );
    let y = 540;
    if (d.briefPractice) {
      this.para('trial', '开发试玩 · 本局不计入成长', y, 13, 30);
      y += 35;
    }
    this.button('begin', '开始这一关  →', y, true);
    this.button('help', '查看玩法', y + 70);
    this.contentHeight = y + 140;
  }
  playing() {
    const u = this.ui,
      d = this.session.data,
      s = d.state;
    if (!s) return;
    const level = s.mode === 'level',
      goal = s.config?.goal || {},
      limit = level
        ? s.config.maxGroups + (s.continued ? (s.config.continuationGroups ?? 2) : 0)
        : 0;
    this.header(
      d.devPractice && level
        ? '试玩 · 第 ' + pad(s.levelId) + ' 关'
        : level
          ? '第 ' + pad(s.levelId) + ' 关'
          : d.onlineSession
            ? d.onlineSession.eligible
              ? '无尽排位'
              : '在线试用 · 不入榜'
            : name(s),
      'home',
      true,
    );
    const short = u.H < 740,
      w = (u.W - 61) / 2,
      my = short ? 82 : 90,
      mh = short ? 62 : 74;
    for (let i = 0; i < 2; i++) {
      const x = 24 + i * (w + 13);
      u.gradient(x, my, w, mh, '#fff9e7', '#eddbb9', 12);
      u.text(
        'metric-label:' + i,
        i === 0
          ? level
            ? '清线'
            : '当前积分'
          : s.variant === 'refill'
            ? '已放积木'
            : '当前组数',
        x + w / 2,
        my + 17,
        12,
        w,
      );
      u.text(
        'metric:' + i,
        i === 0
          ? level
            ? `${s.stats.lines} / ${goal.lines}`
            : fmt(s.score)
          : s.variant === 'refill'
            ? String(s.stats.placements)
            : `${s.group}${level ? ' / ' + limit : ''}`,
        x + w / 2,
        my + 44,
        24,
        w,
      );
      if (level && i === 0) {
        u.panel(x + 12, my + mh - 10, w - 24, 4, '#dce5cf', '', 2);
        u.panel(
          x + 12,
          my + mh - 10,
          (w - 24) * Math.min(1, s.stats.lines / goal.lines),
          4,
          '#7cbb8a',
          '',
          2,
        );
      }
    }
    const extra = [
      goal.multi ? `多线 ${s.stats.multiClears}/${goal.multi}` : '',
      goal.cross ? `交叉 ${s.stats.crossClears}/${goal.cross}` : '',
      goal.stars ? `星标 ${s.stats.stars}/${goal.stars}` : '',
      s.config?.discardBudget !== undefined
        ? `已弃 ${s.stats.discardedCells}/${s.config.discardBudget} 格`
        : '',
    ].filter(Boolean);
    let y = my + mh + (short ? 14 : 18);
    if (extra.length) {
      u.text('extra', extra.join(' · '), u.W / 2, y + 10, 12, u.W - 36, C.ink, 5, 32);
      y += 34;
    }
    const size = Math.min(u.W - 36, Math.max(208, u.H - y - (short ? 242 : 286))),
      x = (u.W - size) / 2,
      pitch = (size * 40) / 360,
      inset = (size * 20) / 360;
    this.layout.board = { x, y: y - this.scroll, w: size, h: size, inset, pitch };
    u.panel(x, y + 5, size, size, '#a58c68', '', 20);
    u.gradient(x, y, size, size, '#fff1d4', '#c8ad84', 20);
    u.panel(x + 6, y + 6, size - 12, size - 12, '#e6cfaa', '#fff8df', 16);
    u.panel(
      x + (17 * size) / 360,
      y + (17 * size) / 360,
      (size * 328) / 360,
      (size * 328) / 360,
      '#f3eee5',
      '#aa916f',
      9,
    );
    for (let i = 0; i < 64; i++) {
      const xx = x + inset + (i % 8) * pitch,
        yy = y + inset + Math.floor(i / 8) * pitch;
      if (s.board[i]) u.block(xx + 1, yy + 1, pitch - 2, this.pieceColor(s.board[i]));
      else {
        u.panel(xx, yy, pitch, pitch, '#f3eee5', '#ddd5c8', 0);
      }
      if (s.starBoard[i])
        u.icon('star', xx + pitch / 2, yy + pitch / 2, pitch * 0.5, '#fff5b5');
    }
    if (this.feedback) {
      const e = this.feedback.event,
        t = Math.max(0, Math.min(1, (this.feedback.until - this.time) / 0.28)),
        a = Math.round(t * 180)
          .toString(16)
          .padStart(2, '0');
      if (!d.progress.settings.reducedFlash)
        for (const cell of e.clearedCells)
          u.panel(
            x + inset + (cell % 8) * pitch + 1,
            y + inset + Math.floor(cell / 8) * pitch + 1,
            pitch - 2,
            pitch - 2,
            '#fff7c5' + a,
            '',
            4,
            4,
          );
      if (e.lines)
        u.text(
          'clear-score',
          `${e.lines} 连线 +${e.scoreDelta}`,
          u.W / 2,
          y + size / 2 - (1 - t) * 20,
          24,
          u.W - 40,
          '#385b36',
          5,
          45,
        );
    }
    if (this.ghost) {
      const p = previewPlacement(s, this.ghost.slot, this.ghost.x, this.ghost.y);
      for (const cell of p.cells)
        u.panel(
          x + inset + (cell % 8) * pitch + 1,
          y + inset + Math.floor(cell / 8) * pitch + 1,
          pitch - 2,
          pitch - 2,
          p.valid ? '#e8f2b5bb' : '#bd5d5088',
          p.valid ? '#315935' : '#bd5d50',
          5,
          4,
        );
      if (!p.valid)
        u.text(
          'invalid',
          '×',
          x + inset + (this.ghost.x + 0.5) * pitch,
          y + inset + (this.ghost.y + 0.5) * pitch,
          26,
          35,
          '#a24d43',
        );
    }
    u.hit(
      'board',
      '8行8列积木棋盘',
      x + inset,
      y + inset,
      pitch * 8,
      pitch * 8,
      this.session.locked(),
    );
    y += size;
    let note =
      s.variant === 'refill'
        ? '放一块，原位补一块'
        : s.placedInGroup === 1
          ? '再放 1 块，剩下的自动丢弃'
          : '放下两块，剩下的自动丢弃';
    if (s.levelId <= 3 && s.stats.placements === 0)
      note = [
        '',
        '拖动积木，填满一行或一列',
        '每组三块，放完两块后自动舍弃一块',
        '先用小块清线，给大块留出位置',
      ][s.levelId];
    if (s.waitingNextGroup) note = '已完成本组，联网确认后获取下一组';
    if (d.onlineBusy) note = '正在确认落子…';
    u.text('group-note', note, u.W / 2, y + 23, 11, u.W - 24);
    y += 46;
    const cw = (u.W - 56) / 3,
      ch = short ? 86 : 128;
    for (let slot = 0; slot < 3; slot++) {
      const xx = 18 + slot * (cw + 10),
        used = s.used.includes(slot),
        candidate = s.candidates[slot],
        available = !used && hasPlacement(s, slot);
      u.button('slot:' + slot, '', xx, y, cw, ch, false, used || this.session.locked());
      u.controls.at(-1)!.label =
        `候选${slot + 1} ${SHAPE_BY_ID[candidate.shapeId].name} ${used ? '已放下' : available ? '按住拖动，或点击选中' : '当前不可放'}`;
      if (d.selectedSlot === slot)
        u.panel(xx + 2, y + 2, cw - 4, ch - 4, '#ffffff00', '#598159', 17);
      if (!used)
        this.mini(
          'candidate:' + slot,
          candidate,
          xx + cw / 2,
          y + ch / 2 - 8,
          Math.min(short ? 20 : 28, (cw - 18) / SHAPE_BY_ID[candidate.shapeId].width - 3),
        );
      u.text(
        'candidate-note:' + slot,
        used
          ? '已放下'
          : !available
            ? '当前不可放'
            : d.selectedSlot === slot
              ? '点棋盘选择落点'
              : '',
        xx + cw / 2,
        y + ch - 15,
        10,
        cw - 8,
      );
      this.layout.candidates.push({ slot, x: xx, y: y - this.scroll, w: cw, h: ch });
    }
    y += ch + 20;
    if (level)
      u.button(
        'undo',
        '↶ 撤销 ' + s.undoRemaining,
        18,
        y,
        Math.min(100, u.W / 2 - 86),
        44,
        false,
        !s.canUndo || s.undoRemaining <= 0 || this.session.locked(),
        2,
        13,
      );
    if (canResetOptions(s, !!d.onlineSession))
      u.button(
        'reset-options',
        '重置选项',
        u.W / 2 - 52,
        y,
        104,
        44,
        false,
        this.session.locked(),
        2,
        14,
      );
    u.iconButton('help', '玩法提示', 'help', u.W - 62, y);
    if (d.onlineError) {
      y += 62;
      this.para('network', d.onlineError, y + 30, 13, 55);
      u.button('online-retry', '重新连接', 24, y + 66, u.W - 48, 44, false, false, 2, 15);
      y += 116;
    }
    if (this.feedback?.event.discarded) {
      const slot = this.feedback.event.discarded.slot,
        c = this.layout.candidates[slot];
      u.text(
        'discarded',
        '舍弃 →',
        c.x + c.w / 2,
        c.y + this.scroll + 15,
        13,
        c.w,
        C.muted,
        5,
        25,
      );
    }
    this.contentHeight = y + 72;
  }
  settings() {
    const u = this.ui,
      d = this.session.data,
      pause = d.screen === 'pause';
    this.header(pause ? '暂停' : '设置', pause ? 'resume' : 'home');
    u.text('settings-title', pause ? '慢慢想，不着急。' : '找到舒服的节奏。', u.W / 2, 115, 27);
    this.para(
      'settings-copy',
      pause
        ? `${d.state?.mode === 'level' ? '第 ' + pad(d.state.levelId) + ' 关' : name(d.state)} · ${d.devPractice ? '独立试玩，不计入成长' : d.state?.challenge ? '好友同局挑战' : '当前棋盘已保存'}`
        : '声音与振动分别控制，随时可调整。',
      155,
      13,
      40,
    );
    let y = 194;
    for (const [key, label] of [
      ['sound', '音效'],
      ['music', '音乐'],
      ['vibration', '振动'],
      ['highContrast', '高对比色'],
      ['reducedFlash', '消除闪光'],
    ]) {
      const enabled =
        key === 'reducedFlash' ? !d.progress.settings[key] : d.progress.settings[key];
      u.panel(24, y, u.W - 48, 55, '#fff7e4ed');
      u.text('setting:' + key, label, 80, y + 25, 17, 100);
      u.text('on:' + key, enabled ? '开' : '关', u.W - 101, y + 27, 13, 40);
      u.panel(u.W - 76, y + 17, 34, 20, enabled ? '#3e8b71' : '#b3b6a3', '', 10);
      u.circle(u.W - (enabled ? 50 : 68), y + 27, 8, '#fff9e6');
      u.hit('setting:' + key, label, 24, y, u.W - 48, 55);
      y += 60;
    }
    y += 15;
    this.button(pause ? 'resume' : 'home', pause ? '继续游戏' : '返回首页', y, true);
    y += 69;
    if (pause) {
      this.button(
        d.state.mode === 'level' ? 'retry' : 'end-run',
        d.state.mode === 'level' ? '重新开始' : '结束本局',
        y,
      );
      y += 69;
      this.button('home', '返回首页 · 保留本局', y);
      y += 69;
      if (!d.onlineSession) {
        this.button('exit-level', d.devPractice ? '退出试玩' : '退出关卡 · 放弃本局', y);
        y += 69;
      }
    } else {
      this.button('help', '玩法与计分', y);
      y += 69;
    }
    if (d.developer) {
      this.button('dev-tools', '开发调试工具', y);
      y += 69;
    }
    this.contentHeight = y + 20;
  }
  help() {
    this.header('玩法提示', 'back');
    this.ui.text('help-title', '小积木，大有余地。', this.ui.W / 2, 116, 28);
    let y = 178;
    for (const [title, text] of [
      [
        '先放，再舍弃',
        '每组有三块。放下一块后先消除，再放第二块。剩下一块自动丢弃，三个槽位固定，积木不能旋转。',
      ],
      [
        '立即补位 · 随放随补',
        '放一块并消除后，原槽补入一块，另外两块保留。三块都无处可放时结束，两种无尽分别保存纪录。',
      ],
      [
        '填满，就能消除',
        '一整行或一整列填满即可消除。行列同时判定，交叉处只清一次，但算两条线。积木不会下落。',
      ],
      [
        '给下一块留出余地',
        '弱化的积木标着“当前不可放”。先清线，它也许就有了位置。触屏可拖动，或先点选积木再点落点。',
      ],
      [
        '无尽，争取多消',
        '只消除才得分：单线 100 分，两线同消 300 分。连续消除有连击奖励，最多计五步。',
      ],
      [
        '关卡与全站榜',
        '少用组数可得更多星。关卡可撤销，续局完成只获一星。无尽不支持撤销。离线及 H5 匿名试用不入榜。',
      ],
      [
        '重置选项',
        '完整观看视频可更换未用候选，不改棋盘与进度。无广告位时不可用；在线和同种子挑战不能重置。重置后不能撤销到奖励前。',
      ],
    ]) {
      this.ui.text('help-heading:' + y, title, this.ui.W / 2, y, 20);
      this.para('help-copy:' + y, text, y + 62, 15, 95);
      y += 142;
    }
    this.button('back', '明白了', y, true);
    this.contentHeight = y + 85;
  }
  endless() {
    const u = this.ui,
      d = this.session.data;
    this.header('无尽挑战');
    let y = 102;
    const short = u.H < 740;
    for (let i = 0; i < 2; i++) {
      const h = short ? 270 : 305;
      u.panel(24, y + 5, u.W - 48, h, i ? '#b79a65' : '#719264', '', 28);
      u.gradient(24, y, u.W - 48, h, i ? '#fff0c8' : '#d4e6be', i ? '#e8ce96' : '#b5d09f', 28);
      u.text('mode:' + i, i ? '立即补位' : '三选二', u.W / 2, y + 35, 29);
      this.para('mode-copy:' + i, i ? '放一块，补一块' : '放下两块，舍弃一块', y + 68, 14, 30);
      u.panel(44, y + 91, u.W - 88, short ? 65 : 85, '#fff8dc99', '#fff9e1', 23);
      this.mini(
        'sample:' + i,
        { shapeId: 'l3-nw', color: 1 },
        u.W * 0.3,
        y + (short ? 124 : 134),
        22,
      );
      this.mini(
        'sample-b:' + i,
        { shapeId: 'square2', color: i ? 3 : 2 },
        u.W * 0.67,
        y + (short ? 124 : 134),
        22,
      );
      if (i) u.icon('refill', u.W / 2, y + (short ? 124 : 134), 27);
      u.text(
        'best:' + i,
        '本地最高 ' + fmt(i ? d.progress.refillBest : d.progress.practiceBest),
        u.W / 2,
        y + h - 98,
        12,
      );
      u.button(
        i ? 'refill' : 'practice',
        i ? '▶ 开始挑战' : '▶ 开始练习',
        44,
        y + h - 78,
        u.W - 88,
        50,
        true,
        false,
        2,
        20,
      );
      if (!i) {
        u.text(
          'online',
          d.onlineBusy ? '正在连接…' : d.canResumeOnline ? '恢复在线对局  ›' : '在线挑战  ›',
          u.W / 2,
          y + h - 4,
          14,
        );
        u.hit('online-start', '在线挑战', 44, y + h - 25, u.W - 88, 44, d.onlineBusy);
      }
      y += h + 35;
    }
    if (d.onlineError) {
      this.para('online-error', d.onlineError, y + 25, 13, 65, '#a24d43');
      y += 75;
    }
    this.para('separate', '两种玩法分别记录本地最高分', y, 12, 30);
    this.contentHeight = y + 45;
  }
  result() {
    const u = this.ui,
      d = this.session.data,
      s = d.state;
    if (!s) return;
    const level = s.mode === 'level',
      won = s.status === 'won';
    this.para(
      'eyebrow',
      d.devPractice
        ? '开发试玩'
        : level
          ? won
            ? '关卡完成'
            : '再试一种选择'
          : name(s) + ' · 挑战结束',
      43,
      14,
      40,
    );
    let y = 80;
    if (!level) {
      u.text('score', fmt(s.score), u.W / 2, 104, 58);
      u.text(
        'result-title',
        d.recordedResult?.isPersonalBest ? '你的新纪录！' : '每一步，都算数。',
        u.W / 2,
        166,
        27,
      );
      y = 190;
    }
    this.mini(
      'result-art',
      { shapeId: 'l3-ne', color: won || !level ? 1 : 5 },
      u.W / 2,
      y + 73,
      47,
    );
    u.icon('star', u.W / 2 - 90, y + 60, 28, C.gold);
    u.icon('star', u.W / 2 + 86, y + 105, 23, '#57b7a4');
    y += 170;
    if (level) {
      u.text(
        'result-title',
        won
          ? '好选择，漂亮！'
          : s.reason === 'no-placement'
            ? '给下一步，多留一点。'
            : '还差一点点。',
        u.W / 2,
        y,
        27,
      );
      y += 47;
      const fail =
        {
          'no-placement': '剩下的积木都没有合适的位置了。',
          'groups-exhausted': '组数用完了，距离目标还差一点。',
          'discard-budget': '舍弃的格数超出了本关预算。',
        }[s.reason] || '';
      this.para(
        'result-subtitle',
        `第 ${pad(s.levelId)} 关 · ${s.config.title}` + (won ? '' : '\n' + fail),
        y,
        14,
        65,
      );
      y += 52;
      if (won) {
        this.stars('win', s.stars || 1, u.W / 2, y, 35);
        y += 49;
      }
    }
    u.panel(24, y, u.W - 48, level ? 90 : 140, '#fff5dfdb');
    const stats = level
      ? [
          ['使用组数', `${s.group} / ${s.config.maxGroups + (s.continued ? 2 : 0)}`],
          ['消除线数', `${s.stats.lines} / ${s.config.goal.lines}`],
        ]
      : [
          ['总清线数', s.stats.lines],
          ['最高单步消线', s.stats.maxLines],
          ['最大连续消除', s.stats.maxCombo],
          [
            s.variant === 'refill' ? '已放积木' : '已完成组数',
            s.variant === 'refill' ? s.stats.placements : s.completedGroups,
          ],
        ];
    stats.forEach(([label, value], i) => {
      const xx = u.W * (i % 2 ? 0.72 : 0.28),
        yy = y + 23 + Math.floor(i / 2) * 67;
      u.text('stat-label:' + i, String(label), xx, yy, 12, 135);
      u.text('stat:' + i, String(value), xx, yy + 29, 25, 135);
    });
    y += level ? 111 : 163;
    if (level) {
      if (!won && s.reason === 'groups-exhausted' && !s.continued) {
        this.para(
          'continue-note',
          d.devPractice
            ? '开发试玩可通过调试参数增加组数。'
            : '可自愿观看视频增加 2 组；暂不可用时可免费重开。',
          y + 23,
          13,
          58,
        );
        y += 65;
      }
      this.button(
        won && s.levelId < LEVELS.length ? 'next' : won ? 'levels' : 'retry',
        won && s.levelId < LEVELS.length ? '下一关  →' : won ? '返回选关' : '再玩一次',
        y,
        true,
      );
      y += 69;
      if (!won && s.canUndo && s.undoRemaining > 0) {
        this.button('undo', '撤销上一步 · ' + s.undoRemaining, y);
        y += 69;
      } else if (won) {
        this.button('retry', '再玩一次', y);
        y += 69;
      }
      if (!won && s.reason === 'groups-exhausted' && !s.continued && !d.devPractice) {
        this.button('continue', '看广告 · 增加 2 组', y, false, d.rewardPending);
        y += 69;
      }
    } else {
      let status = d.onlineSession
        ? d.onlineBusy
          ? '成绩校验中…'
          : d.pendingAction?.length || d.pendingFinish
            ? '等待联网确认 · 当前成绩尚未结算'
            : d.onlineSession.settlement?.status === 'verified'
              ? '成绩已校验 · 全站第 ' + d.onlineSession.settlement.rank + ' 名'
              : d.onlineSession.settlement?.reason ||
                d.onlineSession.rankingReason ||
                '匿名在线试用 · 不参与全站排名'
        : name(s) + ' · 本地纪录，不参与全站排名';
      if (d.devPractice) status = '开发试玩 · 不计入纪录';
      if (s.challenge && Number.isInteger(s.challengeTarget))
        status = `好友自报目标 ${fmt(s.challengeTarget)} 分 · ${s.score >= s.challengeTarget ? '已追平或超越' : '还差 ' + fmt(s.challengeTarget - s.score) + ' 分'}`;
      this.para('status', d.onlineError || status, y + 22, 13, 62);
      y += 67;
      if (d.onlineError) {
        this.button('online-retry', '重新连接并校验', y);
        y += 69;
      }
      this.button(
        'again',
        '再来一局',
        y,
        true,
        !!d.onlineSession && (d.onlineBusy || !!d.pendingAction?.length || d.pendingFinish),
      );
      y += 69;
      this.button(
        s.variant === 'refill' ? 'endless' : 'leaderboard',
        s.variant === 'refill' ? '切换玩法' : '查看排行榜',
        y,
      );
      y += 69;
      if (!d.onlineSession && !s.resetRewardIds?.length && Number.isInteger(s.initialSeed)) {
        u.button('same-seed', '挑战相同积木', 24, y, (u.W - 60) / 2, 48, false, false, 2, 14);
        u.button(
          'share',
          d.devPractice ? '分享成绩' : '分享同局挑战',
          u.W / 2 + 6,
          y,
          (u.W - 60) / 2,
          48,
          false,
          false,
          2,
          14,
        );
      } else this.button('share', '分享成绩', y);
      y += 65;
    }
    this.button('home', '返回首页', y);
    this.contentHeight = y + 85;
  }
  leaderboard() {
    const u = this.ui,
      d = this.session.data;
    this.header('全站排行榜');
    u.text('ranking-title', '好选择，值得记住。', u.W / 2, 121, 28);
    this.para('ranking-copy', '每人保留经校验的最高单局 · 同分并列', 164, 13, 40);
    let y = 214;
    if (!d.ranking?.top?.length) {
      u.icon('trophy', u.W / 2, y + 35, 54, C.muted);
      this.para(
        'ranking-status',
        d.rankingBusy
          ? '正在连接排行榜…'
          : d.rankingError
            ? '排行榜暂时没连上'
            : '第一份好成绩，等你留下。',
        y + 105,
        20,
        60,
      );
      this.para(
        'ranking-reason',
        d.rankingError || d.ranking?.reason || '只显示经校验的真实玩家成绩。',
        y + 170,
        14,
        90,
      );
      y += 245;
      this.button(
        d.rankingError ? 'board-retry' : 'endless',
        d.rankingError ? '重试连接' : '开始无尽挑战',
        y,
        true,
      );
      y += 75;
    } else {
      for (const [i, e] of d.ranking.top.entries()) {
        u.panel(24, y, u.W - 48, 60, '#fff7e4dd');
        u.text(
          'rank:' + i,
          `${e.rank}   ${e.name || '玩家'}`,
          u.W * 0.35,
          y + 20,
          15,
          u.W * 0.5,
        );
        u.text(
          'rank-platform:' + i,
          { wechat: '微信', bilibili: 'B站', h5: 'H5' }[e.platform] || e.platform,
          u.W * 0.35,
          y + 43,
          11,
          u.W * 0.5,
        );
        u.text('rank-score:' + i, fmt(e.score), u.W * 0.78, y + 30, 22, 110);
        y += 68;
      }
      if (d.ranking.me) {
        this.para(
          'my-rank',
          `我的名次 ${d.ranking.me.rank} · 最高 ${fmt(d.ranking.me.score)} 分`,
          y + 30,
          15,
          65,
        );
        y += 85;
        if (d.ranking.around?.length) {
          this.para('nearby', '我附近的玩家', y + 20, 18, 40);
          y += 55;
          for (const [i, e] of d.ranking.around.entries()) {
            u.panel(24, y, u.W - 48, 60, '#fff7e4dd');
            u.text(
              'nearby-name:' + i,
              `${e.rank}  ${e.name || '玩家'}`,
              u.W * 0.35,
              y + 30,
              15,
              u.W * 0.5,
            );
            u.text('nearby-score:' + i, fmt(e.score), u.W * 0.78, y + 30, 22, 110);
            y += 68;
          }
        }
      }
    }
    this.button('home', '返回首页', y);
    this.contentHeight = y + 85;
  }
  developer() {
    const u = this.ui,
      d = this.session.data;
    this.header('开发试玩', 'dev-back');
    u.text('dev-title', '关卡与调试工具', u.W / 2, 117, 27);
    this.para('dev-copy', '独立试玩，不改真实进度、纪录或排行榜。', 164, 13, 45);
    let y = 209;
    for (const [id, label] of [
      ['dev-levels', '选择任意关卡'],
      ['dev-solution', '查看参考落点'],
      ['dev-refill-undo', '补充撤销 · 9 次'],
      ['dev-restart', '重置当前试玩'],
      ['dev-clear-board', '清空试玩棋盘'],
    ]) {
      this.button(
        id,
        label,
        y,
        id === 'dev-levels',
        id !== 'dev-levels' && d.state?.mode !== 'level',
      );
      y += 69;
    }
    if (d.devShowSolution && d.state?.mode === 'level') {
      this.para('solution-heading', '从初始棋盘开始的参考解', y + 20, 18, 45);
      y += 60;
      for (const [i, move] of (d.state.config.solution || []).entries()) {
        this.para(
          'move:' + i,
          `${i + 1}. 候选 ${move.slot + 1} → 第 ${move.y + 1} 行，第 ${move.x + 1} 列`,
          y + 14,
          14,
          30,
        );
        y += 33;
      }
      this.para(
        'solution-tip',
        '落点为积木左上角。中途改变布局后，可重置再对照。',
        y + 25,
        12,
        55,
      );
      y += 70;
    }
    this.button('dev-back', '返回', y);
    this.contentHeight = y + 85;
  }
  syncAccessibility() {
    if (!this.accessibility) return;
    const d = this.session.data,
      controls = this.ui.controls;
    const key =
      d.screen +
      '|' +
      d.modal +
      '|' +
      controls.map((c) => c.id + ':' + c.disabled + ':' + c.label).join(',');
    this.accessibility.dataset.ready = String(this.ui.ready);
    this.accessibility.dataset.screen = d.screen;
    this.accessibility.dataset.mode = d.onlineSession ? 'online' : d.state?.mode || '';
    this.accessibility.dataset.variant = d.state?.variant || 'classic';
    if (key === this.accessibilityKey) return;
    this.accessibilityKey = key;
    this.accessibility.replaceChildren();
    for (const c of controls) {
      const b = document.createElement('button');
      b.textContent = c.label;
      b.setAttribute('aria-label', c.label);
      b.dataset.action = c.id;
      b.disabled = c.disabled;
      b.onclick = () => this.action(c.id);
      this.accessibility.append(b);
    }
  }
  down(id: number, x: number, y: number, touch: boolean) {
    if (this.press || !this.ui.ready) return;
    this.userInteracted = true;
    this.inputCount++;
    const c = this.ui.at(x, y);
    this.press = { id, control: c?.id || '', x, y, lastY: y, moved: false, touch };
    this.ui.pressed = c?.id || '';
    if (c?.id.startsWith('slot:')) this.session.select(Number(c.id.slice(5)));
    this.dirty = true;
  }
  move(id: number, x: number, y: number) {
    const p = this.press;
    if (!p || p.id !== id) return;
    p.moved ||= Math.hypot(x - p.x, y - p.y) > 6;
    if (p.control.startsWith('slot:') && p.moved && !this.session.locked()) {
      this.ghost = this.dragPosition(Number(p.control.slice(5)), x, y, p.touch);
    } else if (p.moved && !this.session.data.modal) {
      this.scroll = Math.max(
        0,
        Math.min(this.contentHeight - this.ui.H, this.scroll + p.lastY - y),
      );
    }
    p.lastY = y;
    this.dirty = true;
  }
  dragPosition(slot: number, x: number, y: number, touch: boolean) {
    const b = this.layout.board,
      s = SHAPE_BY_ID[this.session.data.state.candidates[slot].shapeId];
    return {
      slot,
      x: Math.round((x - (s.width * b.pitch) / 2 - b.x - b.inset) / b.pitch),
      y: Math.round(
        (y - (touch ? s.height * b.pitch + 46 : (s.height * b.pitch) / 2) - b.y - b.inset) /
          b.pitch,
      ),
    };
  }
  up(id: number, x: number, y: number) {
    const p = this.press;
    if (!p || p.id !== id) return;
    const target = this.ui.at(x, y);
    this.press = null;
    this.ui.pressed = '';
    this.ghost = null;
    if (p.moved && p.control.startsWith('slot:')) {
      const pos = this.dragPosition(Number(p.control.slice(5)), x, y, p.touch);
      this.session.place(pos.slot, pos.x, pos.y);
    } else if (!p.moved && target?.id === p.control) {
      if (p.control === 'board' && this.session.data.selectedSlot !== null) {
        const b = this.layout.board;
        this.session.place(
          this.session.data.selectedSlot,
          Math.floor((x - b.x - b.inset) / b.pitch),
          Math.floor((y - b.y - b.inset) / b.pitch),
        );
      } else this.action(p.control);
    }
    this.dirty = true;
  }
  clear = () => {
    this.press = null;
    this.ghost = null;
    if (this.ui) this.ui.pressed = '';
    this.session?.cancelInput();
    this.dirty = true;
  };
  touchStart(e: EventTouch) {
    if (e.simulate || (sys.isBrowser && !this.touchPointer)) return;
    this.lastTouch = this.time;
    const p = e.getUILocation();
    this.down(e.getID() ?? -2, p.x, this.ui.H - p.y, true);
  }
  touchMove(e: EventTouch) {
    if (e.simulate || !this.press?.touch) return;
    const p = e.getUILocation();
    this.move(e.getID() ?? -2, p.x, this.ui.H - p.y);
  }
  touchEnd(e: EventTouch) {
    if (e.simulate || !this.press?.touch) return;
    const p = e.getUILocation();
    this.up(e.getID() ?? -2, p.x, this.ui.H - p.y);
  }
  mouseDown(e: EventMouse) {
    if (this.time - this.lastTouch < 0.7 || e.getButton() !== 0) return;
    const p = e.getUILocation();
    this.down(-1, p.x, this.ui.H - p.y, false);
  }
  mouseMove(e: EventMouse) {
    const p = e.getUILocation();
    this.move(-1, p.x, this.ui.H - p.y);
  }
  mouseUp(e: EventMouse) {
    const p = e.getUILocation();
    this.up(-1, p.x, this.ui.H - p.y);
  }
  wheel(e: EventMouse) {
    if (this.session.data.modal) return;
    this.scroll = Math.max(
      0,
      Math.min(this.contentHeight - this.ui.H, this.scroll - e.getScrollY() * 0.3),
    );
    this.dirty = true;
  }
  onDestroy() {
    this.disposed = true;
    this.session?.dispose();
    this.waitingVisible?.({ status: 'dismissed' });
    this.music?.stop();
    for (const [kind, fn] of [
      [Input.EventType.TOUCH_START, this.touchStart],
      [Input.EventType.TOUCH_MOVE, this.touchMove],
      [Input.EventType.TOUCH_END, this.touchEnd],
      [Input.EventType.TOUCH_CANCEL, this.clear],
      [Input.EventType.MOUSE_DOWN, this.mouseDown],
      [Input.EventType.MOUSE_MOVE, this.mouseMove],
      [Input.EventType.MOUSE_UP, this.mouseUp],
      [Input.EventType.MOUSE_WHEEL, this.wheel],
    ] as const)
      input.off(kind, fn, this);
    game.off(Game.EVENT_HIDE, this.suspend, this);
    game.off(Game.EVENT_SHOW, this.visible, this);
    if (sys.isBrowser) {
      window.removeEventListener('pointerdown', this.trackPointer, true);
      window.removeEventListener('resize', this.resize);
      window.removeEventListener('blur', this.suspend);
      window.removeEventListener('pagehide', this.exit);
      document.removeEventListener('visibilitychange', this.visibility);
      delete platform.getPlaceAndClearSnapshot;
    }
    this.accessibility?.remove();
    this.ui?.dispose();
    for (const key of Object.keys(this.clips)) resources.release('audio/' + key, AudioClip);
  }
}
