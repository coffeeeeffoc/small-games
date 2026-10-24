import {
  _decorator,
  AudioClip,
  AudioSource,
  Component,
  EventMouse,
  EventKeyboard,
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
import { GardenView, GOLD, CREAM, GREEN } from './GardenView';
import type { Control } from './GardenView';
import {
  GardenSession,
  SAVE_KEY,
  LEVELS,
  LEVEL_ORDER,
  BOONS,
  WEAPONS,
  SKILLS,
  UPGRADES,
  PERMANENT_UPGRADES,
  ENEMIES,
  levelFromXp,
  isLevelUnlocked,
  upgradeCost,
  purchaseUpgrade,
  dash,
  castSkill,
  createPlatformAdProvider,
} from './generated/core.js';
import channel from './generated/channel';
const { ccclass } = _decorator;
type Point = { x: number; y: number };
type Press = { id: number; control: string; x: number; y: number; moved: boolean };
type Dev = {
  isEnabled(): boolean;
  registerSnapshot(fn: () => unknown): () => void;
  registerActions(actions: { id: string; label: string; run(): void }[]): () => void;
  openPanel?(): void;
};
const host = globalThis as typeof globalThis & {
  SmallGamesDev?: Dev;
  BulletGardenLoading?: { progress(n: number): void; ready(): void; fail(s: string): void };
  __bulletGarden?: { snapshot(): unknown };
  tap?: { createRewardedVideoAd?: unknown };
  SmallGamesRewardAds?: {
    available: boolean;
    show(request: unknown): Promise<{ status: string }>;
    cancel?(): void;
    dispose?(): void;
  };
};

@ccclass('BulletGarden')
export class BulletGarden extends Component {
  ui!: GardenView;
  session!: GardenSession;
  page = 0;
  selected = 'ruins';
  practice = false;
  returnScreen = 'home';
  catalog = 'plants';
  presses = new Map<number, Press>();
  joystick: number | null = null;
  skillTouch: number | null = null;
  move = { x: 0, y: 0 };
  keys = new Set<number>();
  aim: (Point & { index: number }) | null = null;
  lastTouch = -1000;
  clock = 0;
  dirty = true;
  disposed = false;
  unregister: (() => void)[] = [];
  accessibility?: HTMLDivElement;
  pointerCanvas?: HTMLCanvasElement;
  a11yKey = '';
  announcedScreen = '';
  settings = { sound: true, vibration: true };
  audio?: AudioSource;
  soundClip?: AudioClip;
  message = '';
  messageUntil = 0;
  start() {
    view.enableAutoFullScreen(false);
    view.resizeWithBrowserSize(true);
    const adAvailable = () =>
      (sys.isBrowser && host.SmallGamesRewardAds
        ? host.SmallGamesRewardAds.available
        : channel.adsEnabled &&
          (sys.isBrowser ? channel.platform === 'taptap-h5' : channel.platform === 'taptap')) &&
      typeof host.tap?.createRewardedVideoAd === 'function';
    const provider = sys.isBrowser && host.SmallGamesRewardAds
      ? host.SmallGamesRewardAds
      : channel.adsEnabled
        ? createPlatformAdProvider({ platform: channel.platform, adUnitId: channel.adUnitId })
        : null;
    this.session = new GardenSession({
      profile: this.read(SAVE_KEY),
      provider,
      adAvailable,
      save: (profile: unknown) => this.write(SAVE_KEY, profile),
    });
    this.selected = this.session.profile.selectedLevelId;
    const oldSound = this.read('bullet-garden.sound');
    if (typeof oldSound === 'boolean') this.settings.sound = oldSound;
    const settings = this.read('bullet-garden.settings.v1');
    if (settings)
      for (const key of ['sound', 'vibration'] as const)
        if (typeof settings[key] === 'boolean') this.settings[key] = settings[key];
    this.ui = new GardenView(this.node, () => {
      this.dirty = true;
      host.BulletGardenLoading?.progress(this.ui.loaded.size / this.ui.artCount);
      if (this.ui.ready) host.BulletGardenLoading?.ready();
      if (this.ui.failed) host.BulletGardenLoading?.fail('花园素材加载失败，请重试');
    });
    resources.load('audio/confirm', AudioClip, (err, clip) => {
      if (!err && !this.disposed) {
        clip.addRef();
        this.soundClip = clip;
        if (this.settings.sound && !this.session.hidden) this.feedbackSource().clip = clip;
      }
    });
    if (sys.isBrowser && typeof PointerEvent !== 'undefined') {
      this.pointerCanvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
      this.pointerCanvas.style.touchAction = 'none';
      this.pointerCanvas.addEventListener('pointerdown', this.pointerDown);
      this.pointerCanvas.addEventListener('pointermove', this.pointerMove);
      this.pointerCanvas.addEventListener('pointerup', this.pointerUp);
      this.pointerCanvas.addEventListener('pointercancel', this.pointerCancel);
      this.pointerCanvas.addEventListener('lostpointercapture', this.pointerCancel);
    } else {
    input.on(Input.EventType.TOUCH_START, this.touchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
    input.on(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
    input.on(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
    input.on(Input.EventType.MOUSE_UP, this.mouseUp, this);
    }
    input.on(Input.EventType.KEY_DOWN, this.keyDown, this);
    input.on(Input.EventType.KEY_UP, this.keyUp, this);
    game.on(Game.EVENT_HIDE, this.suspend, this);
    game.on(Game.EVENT_SHOW, this.show, this);
    view.on('canvas-resize', this.resize, this);
    if (sys.isBrowser) {
      window.addEventListener('blur', this.suspend);
      window.addEventListener('focus', this.show);
      window.addEventListener('pagehide', this.leave);
      document.addEventListener('visibilitychange', this.visibility);
      this.accessibility = document.createElement('div');
      this.accessibility.id = 'bullet-garden-accessibility';
      this.accessibility.style.cssText = 'position:fixed;left:-10000px;top:0';
      this.accessibility.setAttribute('aria-label', '子弹花园');
      document.body.appendChild(this.accessibility);
    }
    host.__bulletGarden = { snapshot: () => this.snapshot() };
    if (host.SmallGamesDev) {
      this.unregister.push(host.SmallGamesDev.registerSnapshot(() => this.snapshot()));
      this.unregister.push(
        host.SmallGamesDev.registerActions([
          {
            id: 'trial-levels',
            label: '全关试玩（不计正式奖励）',
            run: () => {
              if (this.dev()) {
                this.session.home();
                this.clearInput();
                this.practice = true;
                this.session.screen = 'levels';
                this.page = 0;
                this.dirty = true;
              }
            },
          },
        ]),
      );
    }
    this.render();
  }
  dev() {
    return !!host.SmallGamesDev?.isEnabled();
  }
  read(key: string) {
    try {
      return JSON.parse(sys.localStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  }
  write(key: string, value: unknown) {
    try {
      sys.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      this.notify('存储不可用，本次仍可继续游玩');
    }
  }
  notify(message: string) {
    this.message = message;
    this.messageUntil = this.clock + 3;
    this.dirty = true;
  }
  feedback() {
    if (this.disposed || this.session.hidden || (sys.isBrowser && document.hidden)) return;
    if (this.settings.sound && this.soundClip) {
      const audio = this.feedbackSource();
      audio.clip = this.soundClip;
      audio.volume = 0.25;
      audio.play();
    }
    if (this.settings.vibration && sys.isBrowser) navigator.vibrate?.(12);
  }
  feedbackSource() {
    if (!this.audio) {
      this.audio = this.node.addComponent(AudioSource);
      this.audio.playOnAwake = false;
      this.audio.volume = 0.25;
    }
    return this.audio;
  }
  stopFeedback() {
    const audio = this.audio;
    if (!audio) return;
    this.audio = undefined;
    // A detached one-shot cannot be stopped. Clear the controllable clip as well
    // so a pending load/context unlock cannot replay an old gesture on return.
    audio.volume = 0;
    audio.stop();
    audio.clip = null;
    // Creator matches async loads by clip identity. A fresh source after cancel
    // prevents clip A -> null -> A from accepting the previous load's callback.
    audio.destroy();
  }
  clearInput() {
    const pointers = [...this.presses.keys()];
    this.keys.clear();
    this.presses.clear();
    this.joystick = null;
    this.skillTouch = null;
    this.move = { x: 0, y: 0 };
    this.aim = null;
    for (const id of pointers)
      if (this.pointerCanvas?.hasPointerCapture(id)) this.pointerCanvas.releasePointerCapture(id);
  }
  suspend = () => {
    this.stopFeedback();
    if (!this.session) return;
    this.clearInput();
    this.session.suspend();
    this.dirty = true;
  };
  show = () => {
    if (!this.session) return;
    if (sys.isBrowser && document.hidden) return;
    this.session.show();
    // Suspend clears stale input; focus can arrive after a fresh pointerdown.
    this.dirty = true;
  };
  leave = () => {
    this.session.cancelAd();
    this.suspend();
  };
  visibility = () => {
    if (document.hidden) this.suspend();
    else this.show();
  };
  resize = () => {
    if (!this.ui) return;
    this.clearInput();
    this.ui.resize();
    this.dirty = true;
  };
  update(dt: number) {
    if (!this.session || !this.ui) return;
    this.clock += Math.min(dt, 0.1);
    const before = this.session.screen;
    if (this.joystick === null) this.keyboardMove();
    this.session.tick(Math.min(dt, 0.1), {
      moveX: this.move.x,
      moveY: this.move.y,
      autoFire: true,
    });
    if (before !== this.session.screen) {
      this.clearInput();
      this.dirty = true;
    }
    if (this.message && this.clock > this.messageUntil) {
      this.message = '';
      this.dirty = true;
    }
    if (this.dirty || this.session.screen === 'playing') this.render();
  }
  navigate(screen: string) {
    this.clearInput();
    this.session.screen = screen;
    this.dirty = true;
  }
  begin(id = this.selected) {
    if (this.session.begin(id, { dev: this.practice && this.dev() })) {
      this.selected = id;
      this.clearInput();
      this.dirty = true;
    }
  }
  title(label: string) {
    const u = this.ui;
    u.panel(10, u.top - 2, u.w - 20, 64);
    u.badge('back', '返回', 'back', u.left + 31, u.top + 29, 23, !!this.session.pending);
    u.heading(label, u.w / 2 + 19, u.top + 28, 25, u.w - 128);
  }
  render() {
    this.dirty = false;
    this.announceHost();
    const s = this.session,
      u = this.ui,
      w = u.w,
      h = u.h;
    const battle = s.screen === 'playing';
    u.begin(battle, s.screen);
    if (!u.ready) {
      u.actor('icon', w / 2, h / 2 - 135, 84);
      u.panel(20, h / 2 - 75, w - 40, 150);
      u.text(u.failed ? '素材加载失败' : `正在唤醒花园… ${u.loaded.size}/${u.artCount}`, w / 2, h / 2 - 20);
      if (u.failed) u.button('retry-art', '重试', w / 2, h / 2 + 35, 180);
      u.end();
      return;
    }
    if (battle) this.drawGame();
    else if (s.screen === 'home') {
      const cx = u.landscape ? w * 0.73 : w / 2,
        bw = Math.min(310, u.landscape ? w * 0.43 : w - 42),
        base = u.landscape ? h * 0.34 : Math.min(h * 0.72, h - u.bottom - 182);
      u.panel(14, u.top, w * 0.4, 39);
      u.icon('coin', 35, u.top + 19, 18);
      u.text(`${s.profile.coins}`, 24 + w * 0.2, u.top + 19, 15, CREAM, w * 0.3, 24);
      u.panel(w * 0.51, u.top, w * 0.49 - 14, 39);
      u.text(`守园人 Lv.${levelFromXp(s.profile.xp).level}`, w * 0.74, u.top + 19, 14);
      if (u.landscape) u.panel(w * 0.49, 76, w * 0.49, h - 88);
      const tx = u.landscape ? w * 0.25 : w / 2, ty = u.landscape ? 105 : h * 0.15;
      u.heading('子弹花园', tx + 2, ty + 3, Math.min(49, w * 0.13), u.landscape ? w * 0.47 : w - 20, '#183624');
      u.heading(
        '子弹花园',
        tx, ty,
        Math.min(49, w * 0.13),
        u.landscape ? w * 0.47 : w - 24,
        '#fff0bd',
      );
      u.sprig(tx - 8, ty + 39, -1, 1.2);
      u.sprig(tx + 8, ty + 39, 1, 1.2);
      u.button('start', '继续冒险', cx, base, bw, 64, true);
      u.button('levels', '花园旅程', cx, base + 65, bw - 38, 48);
      const navY = Math.min(h - u.bottom - 45, base + 132);
      for (const [i, label] of ['营地', '手册', '设置'].entries()) {
        const x = cx + (i - 1) * bw / 3;
        u.badge(['camp', 'help', 'settings'][i], label, ['camp', 'book', 'gear'][i], x, navY, 24);
        u.text(label, x, navY + 35, 13, CREAM, 65, 22);
      }
      if (this.dev()) u.button('developer', '开发试玩', w - 64, u.top + 78, 104, 46);
    } else if (s.screen === 'levels') this.drawLevels();
    else if (s.screen === 'upgrade') {
      this.title('花园的馈赠');
      u.text('选择一项，继续守护花园', w / 2, u.top + 90, 15, GOLD);
      const choices = s.state.upgradeChoices,
        count = u.landscape ? Math.ceil(choices.length / 2) : choices.length,
        available = h - u.top - 145 - u.bottom;
      choices.forEach((id: string, i: number) => {
        const entry = UPGRADES.find((x) => x.id === id),
          hh = Math.min(136, available / count - 12),
          y = u.top + 119 + (u.landscape ? Math.floor(i / 2) : i) * (hh + 12),
          cw = u.landscape ? (w - 42) / 2 : w - 30;
        u.card(`upgrade:${id}`, entry.name, entry.description,
          entry.category === 'terrain' ? 'leaf' : id === 'wild-heart' ? 'bloom' : 'bolt', 15 + (u.landscape ? i % 2 * (cw + 12) : 0), y, cw, hh);
      });
    } else if (s.screen === 'paused' || s.screen === 'failed') {
      this.title(s.screen === 'failed' ? '花园需要你' : '暂歇片刻');
      const center = u.landscape ? w * 0.64 : w / 2;
      if (u.landscape) u.actor('hero', w * 0.25, h * 0.54, 140);
      else u.actor('hero', w / 2, h * 0.3, 110);
      const y = u.landscape ? u.top + 112 : h * 0.44;
      u.panel(
        center - Math.min(170, w / 2 - 14),
        y - 35,
        Math.min(340, w - 28),
        Math.min(h - y - u.bottom - 10, 300),
      );
      u.text(
        s.screen === 'failed'
          ? '守园人倒下了'
          : `生命 ${Math.ceil(s.state.player.hp)} / ${s.state.player.maxHp}`,
        center,
        y,
        21,
      );
      const pending = !!s.pending;
      u.button(
        s.screen === 'failed' ? 'finish' : 'resume',
        s.screen === 'failed' ? '结束本次冒险' : '继续冒险',
        center,
        y + 58,
        Math.min(290, w - 50),
        54,
        true,
        pending,
      );
      const kind = s.screen === 'failed' ? 'revive' : 'supply';
      let next = y + 122;
      if (s.eligible(kind) || s.pending) {
        u.button(
          `ad:${kind}`,
          s.pending ? '补给准备中…' : kind === 'revive' ? '复苏补给 · 视频' : '花露补给 · 视频',
          center,
          next,
          Math.min(290, w - 50),
          50,
          false,
          pending,
        );
        next += 57;
      }
      if (s.screen === 'paused') {
        u.button('abandon', '返回首页', center, next, Math.min(290, w - 50), 48);
        next += 50;
      }
      u.text(s.adStatus, center, Math.min(h - u.bottom - 18, next + 12), 14, GOLD, w - 38, 32);
    } else if (s.screen === 'result') {
      this.title(s.state.phase === 'won' ? '花园重焕生机' : '再来一次冒险');
      const y = u.landscape ? 110 : h * 0.35,
        cx = u.landscape ? w * 0.65 : w / 2;
      u.actor(
        'hero',
        u.landscape ? w * 0.25 : w / 2,
        u.landscape ? h * 0.55 : h * 0.25,
        u.landscape ? 150 : 110,
      );
      u.panel(cx - Math.min(170, w / 2 - 14), y, Math.min(340, w - 28), Math.min(238, h - y - u.bottom - 12));
      u.text(
        s.state.dev
          ? '试玩完成 · 不计正式成长'
          : `金币 +${s.result?.reward?.coins || 0}    经验 +${s.result?.reward?.xp || 0}`,
        cx,
        y + 35,
        19,
      );
      u.text(`${LEVELS[s.state.levelId].name} · 击退 ${s.state.kills}`, cx, y + 71, 16);
      u.button(
        'next',
        s.result?.unlockedLevelId ? '下一关' : '再次冒险',
        cx,
        y + 126,
        Math.min(290, w - 50),
        56,
        true,
      );
      u.button('home', '返回首页', cx, y + 190, Math.min(290, w - 50), 50);
    } else if (s.screen === 'camp') this.drawCamp();
    else if (s.screen === 'catalog') this.drawCatalog();
    else if (s.screen === 'settings') {
      this.title('设置');
      const x = w / 2,
        y = u.top + 135;
      u.panel(16, u.top + 88, w - 32, Math.min(222, h - u.top - 110));
      u.button(
        'setting:sound',
        `音效：${this.settings.sound ? '开启' : '关闭'}`,
        x,
        y,
        Math.min(300, w - 50),
      );
      u.button(
        'setting:vibration',
        `震动：${this.settings.vibration ? '开启' : '关闭'}`,
        x,
        y + 72,
        Math.min(300, w - 50),
      );
      u.text('进度自动保存在本机', x, y + 142, 16);
    } else if (s.screen === 'help') {
      this.title('守园手册');
      u.panel(16, u.top + 88, w - 32, h - u.top - 108);
      u.text('移动即战斗', w / 2, u.top + 126, 24, GOLD);
      u.text(
        '按住摇杆方向或拖动即可移动。\n武器自动瞄准，冲刺避开危险。\n电脑：WASD / 方向键移动，空格冲刺。\n击退敌人积累经验，再选择成长。\n技能拖入战场瞄准，松手施放；\n拖回操作带或取消均不耗能。\n每个技能最多储存三次。\n倒计时结束后，清空余敌即可过关。',
        w / 2,
        u.top + 164 + (h - u.top - 188 - u.bottom) / 2,
        15,
        CREAM,
        w - 62,
        h - u.top - 188 - u.bottom,
      );
    }
    if (this.message) {
      u.box(u.ui, 12, h - u.bottom - 42, w - 24, 32, GREEN, 10);
      u.text(this.message, w / 2, h - u.bottom - 26, 14, GOLD, w - 38, 28);
    }
    u.end();
    this.syncAccessibility();
  }
  drawLevels() {
    const u = this.ui,
      s = this.session,
      w = u.w,
      h = u.h;
    this.title(this.practice ? '开发者试玩' : '花园旅程');
    const ids = LEVEL_ORDER.slice(this.page * 5, this.page * 5 + 5),
      mapBottom = h - u.bottom - 162;
    const points = ids.map((id, i) => ({
      id,
      x: u.landscape ? w * 0.13 + i * w * 0.14 : w * (0.3 + (i % 2) * 0.35),
      y: u.landscape ? u.top + 112 : u.top + 110 + (i * (mapBottom - u.top - 147)) / 4,
    }));
    points.forEach((p, i) => {
      if (i) {
        const prev = points[i - 1];
        const length = Math.hypot(p.x - prev.x, p.y - prev.y);
        for (let d = 32; d < length - 28; d += 13) {
          const t = d / length;
          u.circle(u.ui, prev.x + (p.x - prev.x) * t, prev.y + (p.y - prev.y) * t, 3, '#72562d');
          u.circle(u.ui, prev.x + (p.x - prev.x) * t, prev.y + (p.y - prev.y) * t - 1, 2, '#f1d996');
        }
      }
    });
    points.forEach((p) =>
      u.levelNode(
        p.id,
        LEVELS[p.id].order,
        p.x,
        p.y,
        p.id === this.selected,
        !(this.practice || isLevelUnlocked(s.profile, p.id)),
        s.profile.completed.includes(p.id),
      ),
    );
    const panelY = h - u.bottom - 105,
      detail = LEVELS[this.selected];
    u.panel(u.left, panelY, w - u.left - u.right, 105, true);
    u.heading(
      detail.name,
      u.landscape ? w * 0.24 : w * 0.34,
      panelY + 31,
      22,
      u.landscape ? w * 0.35 : w * 0.59,
      GREEN,
    );
    u.text(
      detail.duration + '秒 · 清理余敌',
      u.landscape ? w * 0.24 : w * 0.34,
      panelY + 62,
      14,
      '#5f654a',
      u.landscape ? w * 0.35 : w * 0.59,
      25,
    );
    u.button(
      'depart',
      '出发',
      u.landscape ? w * 0.64 : w * 0.78,
      panelY + 51,
      u.landscape ? 160 : w * 0.31,
      55,
      true,
    );
    u.button('prev', '上页', u.left + 33, panelY - 30, 62, 46, false, this.page === 0);
    u.button(
      'more',
      '下页',
      w - u.right - 33,
      panelY - 30,
      62,
      46,
      false,
      (this.page + 1) * 5 >= LEVEL_ORDER.length,
    );
    u.text(
      this.page + 1 + ' / ' + Math.ceil(LEVEL_ORDER.length / 5),
      w / 2,
      panelY - 22,
      14,
      CREAM,
      70,
      26,
    );
  }
  drawCamp() {
    const u = this.ui,
      s = this.session,
      w = u.w,
      h = u.h;
    this.title(`营地 · ${s.profile.coins} 金币`);
    const available = h - u.bottom - u.top - 195,
      per = Math.max(1, Math.min(u.landscape ? 2 : 4, Math.floor((available + 8) / 84))),
      items = PERMANENT_UPGRADES.slice(this.page * per, this.page * per + per),
      level = levelFromXp(s.profile.xp).level;
    items.forEach((item, i) => {
      const cost = upgradeCost(s.profile, item.id),
        locked = level < item.unlockLevel,
        y = u.top + 112 + i * 84;
      u.card(`buy:${item.id}`, `${item.name} · ${s.profile.upgrades[item.id]}级`,
        `${item.description}\n${locked ? `Lv.${item.unlockLevel}解锁` : cost === null ? '已满级' : cost + ' 金币'}`,
        locked ? 'lock' : 'leaf', 14, y - 34, w - 28, 76,
        locked || cost === null || s.profile.coins < cost);
    });
    u.button('prev', '上页', 47, h - u.bottom - 86, 70, 46, false, this.page === 0);
    u.button(
      'more',
      '下页',
      w - 47,
      h - u.bottom - 86,
      70,
      46,
      false,
      (this.page + 1) * per >= PERMANENT_UPGRADES.length,
    );
    u.button('plants', '植物图鉴', w * 0.27, h - u.bottom - 28, w * 0.43, 48);
    u.button('weapons', '武器技能', w * 0.73, h - u.bottom - 28, w * 0.43, 48);
  }
  drawCatalog() {
    const u = this.ui,
      w = u.w,
      h = u.h;
    this.title(this.catalog === 'plants' ? '植物图鉴' : '武器与技能');
    const list =
        this.catalog === 'plants' ? Object.values(BOONS) : [...Object.values(SKILLS), ...WEAPONS],
      per = u.landscape ? 2 : 3,
      level = levelFromXp(this.session.profile.xp).level;
    list.slice(this.page * per, this.page * per + per).forEach((item: any, i: number) => {
      const hh = Math.min(150, (h - u.top - 166) / per),
        y = u.top + 88 + i * hh;
      u.panel(15, y, w - 30, hh - 10);
      u.text(
        `${item.name}${level < item.unlockPlayerLevel ? ` · Lv.${item.unlockPlayerLevel}解锁` : ''}`,
        w / 2,
        y + 28,
        20,
        GOLD,
        w - 48,
        38,
      );
      u.text(item.description, w / 2, y + hh * 0.61, 15, CREAM, w - 56, hh * 0.55);
    });
    u.button('prev', '上页', 65, h - u.bottom - 29, 100, 48, false, this.page === 0);
    u.button(
      'more',
      '下页',
      w - 65,
      h - u.bottom - 29,
      100,
      48,
      false,
      (this.page + 1) * per >= list.length,
    );
  }
  drawGame() {
    const u = this.ui,
      s = this.session.state,
      w = u.w,
      h = u.h;
    u.drawBattle(s, this.aim);
    u.box(u.ui, 0, 0, w, u.battle.y, '#112b20', 0);
    u.line(u.ui, 0, u.battle.y - 2, w, u.battle.y - 2, '#b89a56', 1.5);
    u.box(u.ui, 12, u.top, Math.min(145, w * 0.4), 25, '#572f34', 9);
    u.box(
      u.ui,
      13,
      u.top + 1,
      (Math.min(143, w * 0.4 - 2) * s.player.hp) / s.player.maxHp,
      23,
      '#cc6153',
      8,
    );
    u.box(u.ui, 11, u.top - 1, Math.min(147, w * 0.4 + 2), 27, '#b89a56', 10, 255, 1);
    u.text(
      `${Math.ceil(s.player.hp)} / ${s.player.maxHp}`,
      12 + Math.min(145, w * 0.4) / 2,
      u.top + 12,
      16,
      CREAM,
      Math.min(145, w * 0.4),
      25,
    );
    const remain = Math.max(0, Math.ceil(s.duration - s.time));
    u.text(
      remain
        ? `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, '0')}`
        : `清理余敌 ${s.enemies.filter((e: any) => e.hp > 0).length}`,
      w * 0.65,
      u.top + 13,
      18,
      CREAM,
      w * 0.36,
      30,
    );
    u.button('pause', '暂停', w - u.right - 26, u.top + 24, 48, 48);
    u.text(`Lv.${s.progression.level}`, 32, u.top + 48, 14, CREAM, 56, 24);
    u.box(u.ui, 60, u.top + 43, w - 132, 10, '#101e16', 5);
    u.box(u.ui, 59, u.top + 42, w - 130, 12, '#758052', 6, 255, 1);
    u.box(
      u.ui,
      61,
      u.top + 44,
      (w - 134) * (s.progression.pending ? 1 : Math.min(1, s.progression.xp / s.progression.nextXp)),
      8,
      '#a5cf65',
      4,
    );
    const edge = u.battle.y + u.battle.h;
    if (u.landscape) {
      for (const x of [8, w - 148]) u.panel(x, u.battle.y + 12, 140, u.battle.h - 20);
    } else {
    u.box(u.ui, 0, edge, w, h - edge, '#142f23', 0);
    u.box(u.ui, 7, edge + 7, w - 14, h - edge - u.bottom - 4, '#29452e', 17, 140);
    u.box(u.ui, 7, edge + 7, w - 14, h - edge - u.bottom - 4, '#607448', 17, 150, 1);
    u.line(u.ui, 0, edge, w, edge, GOLD, 2);
    u.sprig(8, edge + 13, 1, 0.8);
    u.sprig(w - 8, edge + 13, -1, 0.8);
    }
    const jy = u.landscape ? h - u.bottom - 72 : edge + (h - edge - u.bottom) / 2,
      jx = u.landscape ? 80 : Math.max(68, w * 0.22),
      jr = u.landscape ? 43 : 49;
    u.controls.push({
      id: 'move',
      label: '移动摇杆',
      disabled: false,
      rect: { x: jx - jr - 6, y: jy - jr - 6, w: (jr + 6) * 2, h: (jr + 6) * 2 },
    });
    u.circle(u.ui, jx, jy, jr + 7, '#0f261c');
    u.circle(u.ui, jx, jy, jr + 7, GOLD, 150, 2);
    u.circle(u.ui, jx, jy, jr - 5, '#34523a');
    u.circle(u.ui, jx, jy, jr - 8, '#7c8a55', 170, 1);
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const x = jx + dx * (jr - 12), y = jy + dy * (jr - 12);
      u.polygon([[x + dx * 5, y + dy * 5], [x - dy * 4 - dx * 3, y + dx * 4 - dy * 3], [x + dy * 4 - dx * 3, y - dx * 4 - dy * 3]], '#b9c189');
    }
    u.circle(u.ui, jx + this.move.x * 25, jy + this.move.y * 25 + 3, 25, '#14291d');
    u.circle(u.ui, jx + this.move.x * 25, jy + this.move.y * 25, 24, '#e5d098');
    u.circle(u.ui, jx + this.move.x * 25, jy + this.move.y * 25 - 1, 20, CREAM, 220, 1);
    u.text('移动', jx, jy + jr + 16, 12, '#c7d0a9', 75, 20);
    const compact = h - edge - u.bottom < 170,
      dashX = w - u.right - (u.landscape ? 60 : compact ? 29 : 47),
      dashY = compact ? jy : Math.min(edge + (h - edge) * 0.72, h - u.bottom - 43);
    u.badge(
      'dash',
      '冲刺',
      'bolt',
      dashX,
      dashY,
      29,
      s.player.dashCooldown > 0,
      true,
    );
    u.text(s.player.dashCooldown > 0 ? `${s.player.dashCooldown.toFixed(1)}s` : '冲刺', dashX, dashY + 34, 12, GOLD, 60, 18);
    if (s.skillSlots.length) {
      s.skillSlots.forEach((slot: any, i: number) => {
        const x = u.landscape ? dashX : compact ? w - u.right - 151 + i * 61 : w - 143 + i * 86,
          y = u.landscape ? jy - 150 + i * 68 : compact ? jy : edge + 34;
        u.badge(`skill:${i}`, SKILLS[slot.kind].name, slot.kind === 'blast' ? 'bloom' : 'leaf', x, y, 22, slot.energy < 100);
        u.text(SKILLS[slot.kind].name, x, y + 35, 11, '#cfdbb1', compact ? 60 : 78, 18);
        for (let k = 0; k < 3; k++)
          u.circle(
            u.ui,
            x + (k - 1) * 12,
            y + 24,
            3,
            slot.energy >= (k + 1) * 100 ? GOLD : '#566b4a',
          );
      });
    } else {
      const infoX = u.landscape ? w - 78 : w * 0.61, infoY = u.landscape ? u.battle.y + 45 : edge + 42;
      u.icon('leaf', infoX, infoY, 25);
      u.text('遇敌自动射击', infoX, infoY + 32, 13, '#c1cba6', 100, 23);
      u.text('守园人 Lv.2 解锁技能', u.landscape ? infoX : w * 0.66, infoY + 56, 10, '#a4b68c', u.landscape ? 130 : 150, 20);
    }
    if (this.aim) u.button('cancel-skill', '拖到此处取消', w / 2, edge - 29, 166, 48);
    if (s.time < 7) {
      u.box(u.ui, w / 2 - 112, edge - 47, 224, 30, '#183526', 12, 220);
      u.text('拖动摇杆移动 · 遇敌自动攻击', w / 2, edge - 32, 13, CREAM, 220, 30);
    }
  }
  activate(id: string) {
    const s = this.session;
    this.clearInput();
    if (id !== 'setting:sound') this.feedback();
    if (id === 'retry-art') this.ui.loadArt();
    else if (id === 'start') {
      this.practice = false;
      this.begin(s.profile.selectedLevelId);
    } else if (id === 'depart') this.begin();
    else if (id.startsWith('level:')) {
      this.selected = id.slice(6);
      if (!this.practice) {
        s.profile.selectedLevelId = this.selected;
        this.write(SAVE_KEY, s.profile);
      }
    } else if (id === 'levels' || id === 'developer') {
      this.practice = id === 'developer' && this.dev();
      this.page = 0;
      this.navigate('levels');
    } else if (id === 'camp') {
      this.page = 0;
      this.navigate('camp');
    } else if (id === 'help' || id === 'settings') {
      this.returnScreen = s.screen;
      this.navigate(id);
    } else if (id === 'plants' || id === 'weapons') {
      this.catalog = id;
      this.page = 0;
      this.navigate('catalog');
    } else if (id === 'prev') this.page = Math.max(0, this.page - 1);
    else if (id === 'more') this.page++;
    else if (id === 'back') {
      if (s.screen === 'catalog') {
        this.page = 0;
        this.navigate('camp');
      } else if (['help', 'settings'].includes(s.screen)) this.navigate(this.returnScreen);
      else {
        s.home();
        this.practice = false;
      }
    } else if (id === 'pause') s.pause();
    else if (id === 'resume') s.resume();
    else if (id === 'finish') s.finish();
    else if (id === 'home' || id === 'abandon') {
      s.home();
      this.practice = false;
    } else if (id === 'next') this.begin(s.result?.unlockedLevelId || s.state.levelId);
    else if (id.startsWith('upgrade:')) s.upgrade(id.slice(8));
    else if (id.startsWith('buy:')) {
      if (purchaseUpgrade(s.profile, id.slice(4)).ok) this.write(SAVE_KEY, s.profile);
    } else if (id.startsWith('setting:')) {
      const key = id.slice(8) as keyof typeof this.settings;
      this.settings[key] = !this.settings[key];
      if (key === 'sound') {
        if (!this.settings.sound) this.stopFeedback();
        this.feedback();
      }
      this.write('bullet-garden.settings.v1', this.settings);
    } else if (id.startsWith('ad:')) {
      void s.reward(id.slice(3)).then(() => {
        if (!this.disposed) this.dirty = true;
      });
    }
    this.dirty = true;
  }
  down(id: number, p: Point) {
    const button = this.ui.hit(p.x, p.y);
    if (!button) return;
    const press = { id, control: button.id, x: p.x, y: p.y, moved: false };
    this.presses.set(id, press);
    if (button.id === 'move') {
      if (this.joystick !== null) {
        this.presses.delete(id);
        return;
      }
      this.joystick = id;
      // A fixed stick is measured from its visible center, including the initial press.
      press.x = button.rect.x + button.rect.w / 2;
      press.y = button.rect.y + button.rect.h / 2;
      this.drag(id, p);
    }
    if (button.id.startsWith('skill:')) {
      if (this.skillTouch !== null) {
        this.presses.delete(id);
        return;
      }
      this.skillTouch = id;
    }
    if (button.id === 'dash') {
      dash(this.session.state, this.move);
      this.presses.delete(id);
      this.feedback();
    }
  }
  drag(id: number, p: Point) {
    const press = this.presses.get(id);
    if (!press) return;
    const dx = p.x - press.x,
      dy = p.y - press.y;
    press.moved ||= Math.hypot(dx, dy) > 10;
    if (id === this.joystick) {
      const length = Math.max(35, Math.hypot(dx, dy));
      this.move = { x: dx / length, y: dy / length };
    }
    if (id === this.skillTouch && press.moved) {
      this.aim = { ...p, index: Number(press.control.slice(6)) };
    }
  }
  up(id: number, p: Point, cancel = false) {
    const press = this.presses.get(id);
    if (!press) return;
    this.presses.delete(id);
    if (id === this.joystick) {
      this.joystick = null;
      this.move = { x: 0, y: 0 };
      return;
    }
    if (id === this.skillTouch) {
      const area = this.ui.battle,
        button = this.ui.hit(p.x, p.y);
      if (
        !cancel &&
        this.aim &&
        p.x >= area.x &&
        p.x <= area.x + area.w &&
        p.y > area.y &&
        p.y < area.y + area.h &&
        button?.id !== 'cancel-skill'
      ) {
        castSkill(this.session.state, this.ui.unworld(p.x, p.y), this.aim.index);
        this.feedback();
      }
      this.skillTouch = null;
      this.aim = null;
      return;
    }
    if (!cancel && !press.moved && this.ui.hit(p.x, p.y)?.id === press.control)
      this.activate(press.control);
  }
  touchStart(e: EventTouch) {
    this.lastTouch = this.clock;
    const p = e.getUILocation();
    this.down(e.getID() ?? 0, { x: p.x, y: this.ui.h - p.y });
  }
  pointerPoint(e: PointerEvent) {
    const rect = this.pointerCanvas!.getBoundingClientRect();
    const scale = Math.min(rect.width / this.ui.w, rect.height / this.ui.h);
    return {
      x: (e.clientX - rect.left - (rect.width - this.ui.w * scale) / 2) / scale,
      y: (e.clientY - rect.top - (rect.height - this.ui.h * scale) / 2) / scale,
    };
  }
  pointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    this.down(e.pointerId, this.pointerPoint(e));
    if (this.presses.has(e.pointerId)) this.pointerCanvas!.setPointerCapture(e.pointerId);
  };
  pointerMove = (e: PointerEvent) => {
    if (!this.presses.has(e.pointerId)) return;
    e.preventDefault();
    this.drag(e.pointerId, this.pointerPoint(e));
  };
  pointerUp = (e: PointerEvent) => {
    this.up(e.pointerId, this.pointerPoint(e));
    if (this.pointerCanvas!.hasPointerCapture(e.pointerId)) this.pointerCanvas!.releasePointerCapture(e.pointerId);
  };
  pointerCancel = (e: PointerEvent) => this.up(e.pointerId, this.pointerPoint(e), true);
  touchMove(e: EventTouch) {
    const p = e.getUILocation();
    this.drag(e.getID() ?? 0, { x: p.x, y: this.ui.h - p.y });
  }
  touchEnd(e: EventTouch) {
    const p = e.getUILocation();
    this.up(e.getID() ?? 0, { x: p.x, y: this.ui.h - p.y });
  }
  touchCancel(e: EventTouch) {
    const p = e.getUILocation();
    this.up(e.getID() ?? 0, { x: p.x, y: this.ui.h - p.y }, true);
  }
  mouseDown(e: EventMouse) {
    if (this.clock - this.lastTouch < 0.6) return;
    const p = e.getUILocation();
    this.down(-1, { x: p.x, y: this.ui.h - p.y });
  }
  mouseMove(e: EventMouse) {
    const p = e.getUILocation();
    this.drag(-1, { x: p.x, y: this.ui.h - p.y });
  }
  mouseUp(e: EventMouse) {
    const p = e.getUILocation();
    this.up(-1, { x: p.x, y: this.ui.h - p.y });
  }
  keyboardMove() {
    const has = (...codes: number[]) => codes.some((code) => this.keys.has(code));
    this.move = {
      x: Number(has(KeyCode.KEY_D, KeyCode.ARROW_RIGHT)) - Number(has(KeyCode.KEY_A, KeyCode.ARROW_LEFT)),
      y: Number(has(KeyCode.KEY_S, KeyCode.ARROW_DOWN)) - Number(has(KeyCode.KEY_W, KeyCode.ARROW_UP)),
    };
  }
  keyDown(e: EventKeyboard) {
    if (this.session.screen !== 'playing' || this.session.hidden) return;
    const first = !this.keys.has(e.keyCode);
    this.keys.add(e.keyCode);
    if (this.joystick === null) this.keyboardMove();
    if (first && e.keyCode === KeyCode.SPACE) dash(this.session.state, this.move);
  }
  keyUp(e: EventKeyboard) {
    this.keys.delete(e.keyCode);
    if (this.joystick === null) this.keyboardMove();
  }
  syncAccessibility() {
    if (!this.accessibility) return;
    const key = JSON.stringify(this.ui.controls.map((b) => [b.id, b.label, b.disabled]));
    if (key === this.a11yKey) return;
    this.a11yKey = key;
    this.accessibility.replaceChildren();
    for (const c of this.ui.controls) {
      const b = document.createElement('button');
      b.textContent = c.label;
      b.setAttribute('aria-label', c.label);
      b.disabled = c.disabled;
      b.onclick = () => {
        if (!['move', 'dash'].includes(c.id) && !c.id.startsWith('skill:')) this.activate(c.id);
      };
      this.accessibility.appendChild(b);
    }
  }
  announceHost() {
    if (!sys.isBrowser || window.parent === window) return;
    const screen = ['playing', 'paused', 'upgrade', 'failed', 'result'].includes(
      this.session.screen,
    )
      ? 'playing'
      : 'home';
    if (screen === this.announcedScreen) return;
    try {
      const origin = window.location.origin;
      if (origin === 'null' || window.parent.location.origin !== origin) return;
      window.parent.postMessage(
        { type: 'small-games:display-state', gameId: 'bullet-garden', screen },
        origin,
      );
      this.announcedScreen = screen;
    } catch {
      // Cross-origin embeds cannot control the Shell's display state.
    }
  }
  snapshot() {
    const s = this.session,
      state = s.state;
    return {
      engine: `Cocos Creator ${VERSION}`,
      screen: s.screen,
      phase: state?.phase || null,
      art: { ready: this.ui.ready, loaded: Array.from(this.ui.loaded) },
      controls: {
        developerMode: this.dev(),
        practice: this.practice,
        joystickActive: this.joystick !== null,
        skillAiming: this.skillTouch !== null,
        move: { ...this.move },
        pointerInput: !!this.pointerCanvas,
      },
      viewport: {
        width: this.ui.w,
        height: this.ui.h,
        safeTop: this.ui.top,
        safeBottom: this.ui.bottom,
        battle: { ...this.ui.battle },
        camera: { x: this.ui.cameraX, y: this.ui.cameraY, zoom: this.ui.zoom },
        hero: this.ui.heroPose ? JSON.parse(JSON.stringify(this.ui.heroPose)) : null,
      },
      buttons: this.ui.controls.map((b) => ({
        ...b,
        rect: { ...b.rect },
        clientRect: this.ui.clientRect(b.rect),
      })),
      profile: JSON.parse(JSON.stringify(s.profile)),
      ads: {
        configured: channel.adsEnabled,
        platform: channel.platform,
        pending: !!s.pending,
        used: { ...s.used },
        status: s.adStatus,
      },
      state: state
        ? {
            levelId: state.levelId,
            mapId: state.mapId,
            phase: state.phase,
            time: state.time,
            duration: state.duration,
            kills: state.kills,
            coins: state.coins,
            player: JSON.parse(JSON.stringify(state.player)),
            enemies: state.enemies
              .filter((e: any) => e.hp > 0)
              .map((e: any) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, hp: e.hp })),
            skills: state.skillSlots.map((x: any) => ({ ...x })),
            stats: { ...state.stats },
            upgrades: [...state.upgrades],
            boons: [...state.boons],
          }
        : null,
    };
  }
  onDestroy() {
    this.disposed = true;
    this.stopFeedback();
    this.clearInput();
    this.session?.dispose();
    this.pointerCanvas?.removeEventListener('pointerdown', this.pointerDown);
    this.pointerCanvas?.removeEventListener('pointermove', this.pointerMove);
    this.pointerCanvas?.removeEventListener('pointerup', this.pointerUp);
    this.pointerCanvas?.removeEventListener('pointercancel', this.pointerCancel);
    this.pointerCanvas?.removeEventListener('lostpointercapture', this.pointerCancel);
    input.off(Input.EventType.TOUCH_START, this.touchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
    input.off(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
    input.off(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
    input.off(Input.EventType.MOUSE_UP, this.mouseUp, this);
    input.off(Input.EventType.KEY_DOWN, this.keyDown, this);
    input.off(Input.EventType.KEY_UP, this.keyUp, this);
    game.off(Game.EVENT_HIDE, this.suspend, this);
    game.off(Game.EVENT_SHOW, this.show, this);
    view.off('canvas-resize', this.resize, this);
    if (sys.isBrowser) {
      window.removeEventListener('blur', this.suspend);
      window.removeEventListener('focus', this.show);
      window.removeEventListener('pagehide', this.leave);
      document.removeEventListener('visibilitychange', this.visibility);
    }
    this.accessibility?.remove();
    for (const unregister of this.unregister) unregister();
    delete host.__bulletGarden;
    this.ui?.dispose();
    this.soundClip?.decRef();
  }
}
