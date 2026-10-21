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
  aim: (Point & { index: number }) | null = null;
  lastTouch = -1000;
  clock = 0;
  dirty = true;
  disposed = false;
  unregister: (() => void)[] = [];
  accessibility?: HTMLDivElement;
  a11yKey = '';
  announcedScreen = '';
  settings = { sound: true, vibration: true };
  audio!: AudioSource;
  soundClip?: AudioClip;
  message = '';
  messageUntil = 0;
  start() {
    view.enableAutoFullScreen(false);
    view.resizeWithBrowserSize(true);
    const adAvailable = () =>
      channel.adsEnabled &&
      (sys.isBrowser ? channel.platform === 'taptap-h5' : channel.platform === 'taptap') &&
      typeof host.tap?.createRewardedVideoAd === 'function';
    const provider = channel.adsEnabled
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
      host.BulletGardenLoading?.progress(this.ui.loaded.size / 5);
      if (this.ui.ready) host.BulletGardenLoading?.ready();
      if (this.ui.failed) host.BulletGardenLoading?.fail('花园素材加载失败，请重试');
    });
    this.audio = this.node.addComponent(AudioSource);
    resources.load('audio/confirm', AudioClip, (err, clip) => {
      if (!err && !this.disposed) {
        clip.addRef();
        this.soundClip = clip;
      }
    });
    input.on(Input.EventType.TOUCH_START, this.touchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
    input.on(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
    input.on(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
    input.on(Input.EventType.MOUSE_UP, this.mouseUp, this);
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
    if (this.settings.sound && this.soundClip) this.audio.playOneShot(this.soundClip, 0.25);
    if (this.settings.vibration && sys.isBrowser) navigator.vibrate?.(12);
  }
  clearInput() {
    this.presses.clear();
    this.joystick = null;
    this.skillTouch = null;
    this.move = { x: 0, y: 0 };
    this.aim = null;
  }
  suspend = () => {
    if (!this.session) return;
    this.clearInput();
    this.session.suspend({ nativeAdTransition: !sys.isBrowser });
    this.dirty = true;
  };
  show = () => {
    if (!this.session) return;
    if (sys.isBrowser && document.hidden) return;
    this.session.show();
    this.clearInput();
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
    u.button('back', '返回', u.left + 33, u.top + 30, 58, 48, false, !!this.session.pending);
    u.text(label, u.w / 2 + 20, u.top + 30, 26, CREAM, u.w - 160);
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
      u.text(u.failed ? '素材加载失败' : `正在唤醒花园… ${u.loaded.size}/5`, w / 2, h / 2 - 20);
      if (u.failed) u.button('retry-art', '重试', w / 2, h / 2 + 35, 180);
      u.end();
      return;
    }
    if (battle) this.drawGame();
    else if (s.screen === 'home') {
      const cx = u.landscape ? w * 0.73 : w / 2,
        bw = Math.min(300, u.landscape ? w * 0.43 : w - 40),
        base = u.landscape ? h * 0.34 : h * 0.72;
      u.panel(14, u.top, w - 28, 42);
      u.text(`金币 ${s.profile.coins}`, w * 0.25, u.top + 21, 16);
      u.text(`守园人 Lv.${levelFromXp(s.profile.xp).level}`, w * 0.74, u.top + 21, 16);
      if (u.landscape) u.panel(w * 0.49, 76, w * 0.49, h - 88);
      else u.box(u.ui, 42, h * 0.145 - 36, w - 84, 72, '#203c2c', 24, 160);
      u.text(
        '子弹花园',
        u.landscape ? w * 0.25 : w / 2,
        u.landscape ? 105 : h * 0.145,
        Math.min(52, w * 0.135),
        GOLD,
        u.landscape ? w * 0.47 : w - 24,
        85,
      );
      u.button('start', '继续冒险', cx, base, bw, 60, true);
      u.button('levels', '选择关卡', cx, base + 67, bw, 52);
      const navY = Math.min(h - u.bottom - 31, base + 131);
      for (const [i, label] of ['营地', '帮助', '设置'].entries())
        u.button(
          ['camp', 'help', 'settings'][i],
          label,
          cx + (i - 1) * (bw / 3 + 2),
          navY,
          bw / 3 - 8,
          48,
        );
      if (this.dev()) u.button('developer', '开发试玩', w - 64, u.top + 78, 104, 46);
    } else if (s.screen === 'levels') this.drawLevels();
    else if (s.screen === 'upgrade') {
      this.title('花园的馈赠');
      const choices = s.state.upgradeChoices,
        count = choices.length,
        available = h - u.top - 130;
      choices.forEach((id: string, i: number) => {
        const entry = UPGRADES.find((x) => x.id === id),
          hh = Math.min(114, available / count - 10),
          y = u.top + 96 + i * (hh + 10);
        u.button(`upgrade:${id}`, entry.name, w / 2, y + hh / 2, w - 30, hh, false);
        u.text(entry.description, w / 2, y + hh * 0.75, 13, '#d7dbb3', w - 70, hh * 0.35);
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
      u.panel(cx - Math.min(170, w / 2 - 14), y, Math.min(340, w - 28), h - y - u.bottom - 12);
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
      u.panel(16, u.top + 88, w - 32, h - u.top - 110);
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
        '左侧摇杆移动，武器自动瞄准。\n右侧冲刺避开危险。\n升级时选择植物祝福或武器成长。\n技能拖入战场瞄准，松手施放；\n拖回按钮或取消区不消耗蓄力。\n每个技能最多储存三次。\n倒计时结束后，清空余敌即可过关。\n永久等级解锁新植物和技能。',
        w / 2,
        u.top + 240,
        u.landscape ? 15 : 17,
        CREAM,
        w - 62,
        Math.min(285, h - u.top - 190),
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
      mapBottom = h * 0.76;
    const points = ids.map((id, i) => ({
      id,
      x: u.landscape ? w * 0.13 + i * w * 0.14 : w * (0.3 + (i % 2) * 0.35),
      y: u.landscape ? h * 0.48 : u.top + 110 + (i * (mapBottom - u.top - 147)) / 4,
    }));
    points.forEach((p, i) => {
      if (i) {
        const prev = points[i - 1];
        u.line(u.ui, prev.x, prev.y, p.x, p.y, '#59683b', 7);
        u.line(u.ui, prev.x, prev.y, p.x, p.y, '#e2ca88', 2);
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
    const panelY = u.landscape ? h * 0.73 : h * 0.78,
      detail = LEVELS[this.selected];
    u.panel(u.left, panelY, w - u.left - u.right, h - panelY - u.bottom);
    u.text(
      detail.name,
      u.landscape ? w * 0.24 : w * 0.34,
      panelY + 27,
      23,
      GOLD,
      u.landscape ? w * 0.35 : w * 0.59,
      34,
    );
    u.text(
      detail.duration + '秒 · 清理余敌',
      u.landscape ? w * 0.24 : w * 0.34,
      panelY + 54,
      14,
      CREAM,
      u.landscape ? w * 0.35 : w * 0.59,
      25,
    );
    u.button(
      'depart',
      '出发',
      u.landscape ? w * 0.64 : w * 0.78,
      panelY + 44,
      u.landscape ? 160 : w * 0.3,
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
    const per = u.landscape ? 2 : 4,
      items = PERMANENT_UPGRADES.slice(this.page * per, this.page * per + per),
      level = levelFromXp(s.profile.xp).level;
    items.forEach((item, i) => {
      const cost = upgradeCost(s.profile, item.id),
        locked = level < item.unlockLevel,
        y = u.top + 112 + i * Math.min(84, (h - u.top - 205) / per);
      u.button(
        `buy:${item.id}`,
        `${item.name} ${s.profile.upgrades[item.id]}级 · ${locked ? `Lv.${item.unlockLevel}解锁` : cost === null ? '已满级' : cost + '金币'}`,
        w / 2,
        y,
        w - 28,
        64,
        false,
        locked || cost === null || s.profile.coins < cost,
      );
      u.text(item.description, w / 2, y + 17, 12, '#bfcbae', w - 50, 23);
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
    u.box(u.ui, 0, 0, w, u.battle.y, GREEN, 0);
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
    u.text(
      `${Math.ceil(s.player.hp)} / ${s.player.maxHp}`,
      w * 0.2,
      u.top + 12,
      16,
      CREAM,
      w * 0.39,
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
    u.box(
      u.ui,
      61,
      u.top + 44,
      (w - 134) * Math.min(1, s.progression.xp / s.progression.nextXp),
      8,
      '#a5cf65',
      4,
    );
    const edge = u.battle.y + u.battle.h;
    u.box(u.ui, 0, edge, w, h - edge, GREEN, 0);
    u.line(u.ui, 0, edge, w, edge, GOLD, 2);
    const jy = edge + (h - edge - u.bottom) / 2,
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
    u.circle(u.ui, jx + this.move.x * 25, jy + this.move.y * 25, 24, '#e5d098');
    u.circle(u.ui, jx + this.move.x * 25, jy + this.move.y * 25, 24, CREAM, 220, 2);
    u.button(
      'dash',
      s.player.dashCooldown > 0 ? `${s.player.dashCooldown.toFixed(1)}s` : '冲刺',
      w - u.right - 47,
      edge + (h - edge) * 0.69,
      82,
      60,
      true,
      s.player.dashCooldown > 0,
    );
    if (s.skillSlots.length) {
      s.skillSlots.forEach((slot: any, i: number) => {
        const x = u.landscape ? w - u.right - 250 + i * 91 : w - 143 + i * 86,
          y = edge + 37;
        u.button(`skill:${i}`, SKILLS[slot.kind].name, x, y, 78, 49, false, slot.energy < 100);
        for (let k = 0; k < 3; k++)
          u.circle(
            u.ui,
            x + (k - 1) * 12,
            y + 32,
            4,
            slot.energy >= (k + 1) * 100 ? GOLD : '#566b4a',
          );
      });
    } else u.text('自动射击\n升级解锁技能', w * 0.58, jy, 14, '#c1cba6', 110, 50);
    if (this.aim) u.button('cancel-skill', '拖到此处取消', w / 2, edge - 29, 166, 48);
    if (s.time < 7) u.text('推动摇杆 · 自动攻击', w / 2, edge - 30, 17, GREEN, w - 25, 40);
  }
  activate(id: string) {
    const s = this.session;
    this.clearInput();
    this.feedback();
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
      },
      viewport: {
        width: this.ui.w,
        height: this.ui.h,
        safeTop: this.ui.top,
        safeBottom: this.ui.bottom,
        battle: { ...this.ui.battle },
        camera: { x: this.ui.cameraX, y: this.ui.cameraY, zoom: this.ui.zoom },
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
    this.clearInput();
    this.session?.dispose();
    input.off(Input.EventType.TOUCH_START, this.touchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
    input.off(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
    input.off(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
    input.off(Input.EventType.MOUSE_UP, this.mouseUp, this);
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
