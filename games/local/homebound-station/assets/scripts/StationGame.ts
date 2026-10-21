import {
  _decorator,
  Component,
  EventKeyboard,
  EventMouse,
  EventTouch,
  Game,
  Input,
  game,
  input,
  sys,
  view,
} from 'cc';
import { LEVELS } from './core/levels';
import {
  advance,
  canDispatch,
  createSimulation,
  dispatch,
  snapshot,
  stars,
  type Simulation,
} from './core/simulation';
import { complete, continueIndex, SPEEDS, SpeedGate, unlocked, type Speed } from './core/session';
import { StationWorld } from './StationWorld';
import { StationHUD, type Page } from './StationHUD';
import { StationPlatform } from './StationPlatform';
const { ccclass } = _decorator;
type Press = { x: number; y: number; target: string; page: Page };
@ccclass('StationGame')
export class StationGame extends Component {
  state!: Simulation;
  world!: StationWorld;
  hud!: StationHUD;
  platform!: StationPlatform;
  page: Page = 'home';
  chapter = 0;
  invitedLevel?: number;
  practice = false;
  gate = new SpeedGate();
  elapsed = 0;
  resultStars = 0;
  private presses = new Map<number, Press>();
  private cleanup: (() => void)[] = [];
  private touchInput = false;
  private toast = '';
  private toastRemaining = 0;
  private disposed = false;
  private run = 0;
  private hidden = false;
  private adInterrupted = false;
  private returnPage: Page = 'home';
  private previousDelivered = 0;
  private resizeKey = '';
  start() {
    view.enableAutoFullScreen(false);
    view.resizeWithBrowserSize(true);
    this.platform = new StationPlatform(this.node, LEVELS.length);
    this.world = new StationWorld(this.node);
    this.hud = new StationHUD(this.node);
    this.state = createSimulation(LEVELS[0]!);
    this.state.paused = true;
    this.world.reset(this.state);
    this.touchInput = sys.isMobile;
    this.cleanup.push(this.platform.registerLevels(() => this.changePage('levels')));
    input.on(Input.EventType.TOUCH_START, this.touchStart, this);
    input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.clear, this);
    input.on(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
    input.on(Input.EventType.MOUSE_UP, this.mouseUp, this);
    input.on(Input.EventType.KEY_DOWN, this.keyDown, this);
    game.on(Game.EVENT_HIDE, this.hide, this);
    game.on(Game.EVENT_SHOW, this.show, this);
    if (sys.isBrowser) {
      const listen = (target: EventTarget, type: string, fn: EventListener) => {
        target.addEventListener(type, fn);
        this.cleanup.push(() => target.removeEventListener(type, fn));
      };
      listen(window, 'pointerdown', (e) => {
        this.touchInput = (e as PointerEvent).pointerType !== 'mouse';
      });
      listen(window, 'blur', () => this.hide());
      listen(window, 'focus', () => this.show());
      listen(window, 'pagehide', () => {
        this.gate.cancel(this.platform.ads);
        this.hide();
      });
      listen(document, 'visibilitychange', () => (document.hidden ? this.hide() : this.show()));
      const control = document.createElement('button');
      control.setAttribute('aria-label', '暂停');
      control.style.cssText =
        'position:absolute;width:1px;height:1px;clip-path:inset(50%);overflow:hidden';
      control.onclick = () => this.action('pause');
      document.body.appendChild(control);
      this.cleanup.push(() => control.remove());
      Object.assign(window, {
        homeboundSnapshot: () => structuredClone(snapshot(this.state)),
        homeboundView: () => this.viewSnapshot(),
      });
      this.cleanup.push(() => {
        delete (window as any).homeboundSnapshot;
        delete (window as any).homeboundView;
      });
      const query = new URLSearchParams(location.search),
        invited = Number(query.get('station'));
      if (Number.isInteger(invited) && invited >= 1 && invited <= LEVELS.length)
        this.invitedLevel = invited;
      const level = Number(query.get('level'));
      if (
        this.platform.developer &&
        Number.isInteger(level) &&
        level >= 1 &&
        level <= LEVELS.length
      )
        this.startLevel(level - 1);
      document.body.dataset.homeboundReady = 'true';
      window.dispatchEvent(new Event('homebound-ready'));
    }
    this.render();
  }
  private startLevel(index: number, invitation = false) {
    if (
      !LEVELS[index] ||
      (!this.platform.developer &&
        !(invitation && this.invitedLevel === index + 1) &&
        !unlocked(this.platform.progress, index))
    )
      return;
    this.gate.cancel(this.platform.ads);
    this.gate = new SpeedGate();
    this.run++;
    this.practice = this.platform.developer || invitation;
    this.state = createSimulation(LEVELS[index]!);
    this.elapsed = 0;
    this.resultStars = 0;
    this.previousDelivered = 0;
    this.toast = '';
    this.chapter = Math.floor(index / 10);
    this.world.reset(this.state);
    this.changePage('playing');
  }
  private changePage(page: Page) {
    if (this.page === 'ad' && page !== 'ad') this.gate.cancel(this.platform.ads);
    this.page = page;
    this.state.paused = page !== 'playing' || this.hidden;
    this.clear();
    this.hud.invalidate();
    if (page !== 'playing') this.platform.stop();
  }
  private message(text: string, ok = false) {
    this.toast = text;
    this.toastRemaining = 3.5;
    if (!this.hidden) this.platform.play(ok ? 'depart' : 'blocked');
  }
  private async speed(value: Speed) {
    if (this.page !== 'playing' || this.gate.pending) return;
    if (!this.gate.unlocked.has(value)) {
      this.adInterrupted = false;
      this.changePage('ad');
      this.platform.stop();
    }
    const gate = this.gate,
      run = this.run,
      result = await gate.choose(value, this.platform.ads);
    if (this.disposed || run !== this.run || gate !== this.gate || result === 'stale') return;
    if ((this.page as Page) === 'ad')
      this.changePage(this.hidden || this.adInterrupted ? 'pause' : 'playing');
    if (result === 'completed' || result === 'selected')
      this.message(`已切换 ${value}×${value > 1 ? ' · 本局可用' : ''}`, true);
    else
      this.message(
        result === 'dismissed'
          ? '未看完视频，倍速保持不变'
          : result === 'unavailable'
            ? '暂时没有可用广告，请稍后再试'
            : '广告未完成，请稍后重试',
      );
  }
  action(id: string) {
    this.platform.activate();
    this.platform.play('tap');
    if (id.startsWith('car:')) {
      if (this.page !== 'playing' || this.hidden || this.state.paused) return;
      const result = dispatch(this.state, id.slice(4));
      this.message(result.reason, result.ok);
      return;
    }
    if (id.startsWith('level:')) {
      this.startLevel(Number(id.slice(6)));
      return;
    }
    if (id.startsWith('chapter:')) {
      this.chapter = Number(id.slice(8));
      this.hud.invalidate();
      return;
    }
    if (id.startsWith('speed:')) {
      const speed = Number(id.slice(6)) as Speed;
      if (SPEEDS.includes(speed)) void this.speed(speed);
      return;
    }
    switch (id) {
      case 'continue':
        this.startLevel(
          this.invitedLevel ? this.invitedLevel - 1 : continueIndex(this.platform.progress),
          !!this.invitedLevel,
        );
        break;
      case 'levels':
        this.changePage('levels');
        break;
      case 'home':
        this.gate.cancel(this.platform.ads);
        this.run++;
        this.changePage('home');
        break;
      case 'pause':
        if (this.page === 'playing') this.changePage('pause');
        break;
      case 'resume':
        if (!this.hidden) this.changePage('playing');
        break;
      case 'retry':
        this.startLevel(
          this.state.config.id - 1,
          this.practice && this.invitedLevel === this.state.config.id,
        );
        break;
      case 'next':
        this.startLevel(this.state.config.id);
        break;
      case 'share':
        void this.platform.share(this.state.config.id).then((text) => {
          if (!this.disposed) this.message(text, true);
        });
        break;
      case 'settings':
        this.changePage('settings');
        break;
      case 'help':
        this.returnPage = this.page;
        this.changePage('help');
        break;
      case 'back':
        this.changePage(this.returnPage);
        break;
      case 'sound':
        this.platform.progress.sound = !this.platform.progress.sound;
        this.platform.save();
        this.platform.stop();
        this.hud.invalidate();
        break;
      case 'fullscreen':
        void this.platform.fullscreen().then((ok) => {
          if (!ok) this.message('当前浏览器不支持全屏，可继续游玩');
        });
        break;
      case 'cancel-ad':
        this.gate.cancel(this.platform.ads);
        this.changePage(this.hidden ? 'pause' : 'playing');
        break;
    }
  }
  private target(x: number, y: number) {
    const button = this.hud.hit(x, y);
    if (button) return button.id;
    if (this.page !== 'playing' || this.hidden) return '';
    const nearest = this.state.vehicles
      .filter((v) => v.state === 'holding')
      .map((v) => {
        const roof = this.world.arrow(v),
          body = this.world.project(v.position, 0.7);
        return {
          id: v.id,
          d: Math.min(Math.hypot(x - roof.x, y - roof.y), Math.hypot(x - body.x, y - body.y)),
        };
      })
      .sort((a, b) => a.d - b.d)[0];
    return nearest && nearest.d <= 24 ? `car:${nearest.id}` : '';
  }
  private press(id: number, x: number, y: number) {
    if (this.presses.size) return;
    this.platform.activate();
    const target = this.target(x, y);
    if (target) this.presses.set(id, { x, y, target, page: this.page });
  }
  private release(id: number, x: number, y: number) {
    const p = this.presses.get(id);
    this.presses.delete(id);
    if (!p || p.page !== this.page || this.hidden) return;
    if (p.target.startsWith('car:')) {
      if (Math.hypot(x - p.x, y - p.y) < 65) this.action(p.target);
    } else if (this.target(x, y) === p.target && Math.hypot(x - p.x, y - p.y) < 18)
      this.action(p.target);
  }
  touchStart(e: EventTouch) {
    if (e.simulate || (sys.isBrowser && !this.touchInput)) return;
    const p = e.getUILocation();
    this.press(e.getID() ?? 0, p.x, this.hud.h - p.y);
  }
  touchEnd(e: EventTouch) {
    if (e.simulate || (sys.isBrowser && !this.touchInput)) return;
    const p = e.getUILocation();
    this.release(e.getID() ?? 0, p.x, this.hud.h - p.y);
  }
  mouseDown(e: EventMouse) {
    if (this.touchInput || e.getButton() !== 0) return;
    const p = e.getUILocation();
    this.press(-1, p.x, this.hud.h - p.y);
  }
  mouseUp(e: EventMouse) {
    if (this.touchInput || e.getButton() !== 0) return;
    const p = e.getUILocation();
    this.release(-1, p.x, this.hud.h - p.y);
  }
  keyDown(e: EventKeyboard) {
    if (e.keyCode === 27) {
      if (this.page === 'playing') this.changePage('pause');
      else if (this.page === 'pause') this.action('resume');
    }
    if (e.keyCode === 13 && this.page === 'home') this.action('continue');
  }
  clear() {
    this.presses.clear();
  }
  hide() {
    if (this.page === 'ad') this.adInterrupted = true;
    this.hidden = true;
    this.clear();
    this.state.paused = true;
    this.platform.stop();
    if (this.page === 'playing') this.changePage('pause');
  }
  show() {
    this.hidden = false;
    this.clear(); /* Explicit resume prevents a background/advert callback overriding pause. */
  }
  update(dt: number) {
    if (!this.hud) return;
    const f = view.getFrameSize(),
      key = `${f.width}:${f.height}:${this.page === 'home'}`;
    if (key !== this.resizeKey) {
      this.resizeKey = key;
      this.clear();
      this.hud.resize();
      this.world.resize(f.width, f.height, this.page === 'home');
    }
    if (this.page === 'playing' && !this.hidden && !this.state.paused) {
      const delta = Math.min(0.1, Math.max(0, dt));
      this.elapsed += delta;
      advance(this.state, delta * this.gate.speed);
      if (this.state.delivered.size > this.previousDelivered) {
        this.previousDelivered = this.state.delivered.size;
        this.platform.play('board');
      }
      if (this.state.won) {
        this.resultStars = stars(this.state);
        if (
          complete(
            this.platform.progress,
            this.state.config.id - 1,
            this.resultStars,
            this.practice,
          )
        )
          this.platform.save();
        this.changePage('result');
        this.platform.play('win');
      }
    }
    if (!this.hidden) {
      this.toastRemaining -= dt;
      if (this.toastRemaining <= 0) this.toast = '';
    }
    this.render();
  }
  private render() {
    this.world.sync(this.state);
    this.hud.render(
      this.state,
      {
        page: this.page,
        chapter: this.chapter,
        practice: this.practice,
        developer: this.platform.developer,
        progress: this.platform.progress,
        gate: this.gate,
        toast: this.toast,
        resultStars: this.resultStars,
        elapsed: this.elapsed,
        invitedLevel: this.invitedLevel,
      },
      this.world,
    );
  }
  private viewSnapshot() {
    return {
      engine: 'Cocos Creator 3.8.8',
      page: this.page,
      practice: this.practice,
      chapter: this.chapter,
      speed: this.gate.speed,
      unlockedSpeeds: [...this.gate.unlocked],
      adPending: this.gate.pending,
      buttons: structuredClone(this.hud.buttons),
      cars: this.state.vehicles
        .filter((v) => v.state === 'holding')
        .map((v) => ({
          id: v.id,
          available: canDispatch(this.state, v.id).ok,
          ...this.world.arrow(v),
        })),
      progress: structuredClone(this.platform.progress),
      toast: this.toast,
    };
  }
  onDestroy() {
    this.disposed = true;
    this.gate.cancel(this.platform?.ads);
    this.clear();
    this.cleanup.forEach((fn) => fn());
    this.platform?.stop();
    input.off(Input.EventType.TOUCH_START, this.touchStart, this);
    input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.clear, this);
    input.off(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
    input.off(Input.EventType.MOUSE_UP, this.mouseUp, this);
    input.off(Input.EventType.KEY_DOWN, this.keyDown, this);
    game.off(Game.EVENT_HIDE, this.hide, this);
    game.off(Game.EVENT_SHOW, this.show, this);
    this.hud?.dispose();
    this.world?.dispose();
  }
}
