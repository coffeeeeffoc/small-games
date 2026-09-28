import {
  _decorator,
  Component,
  input,
  Input,
  EventMouse,
  EventTouch,
  EventKeyboard,
  game,
  Game,
  view,
  sys,
  macro,
  director,
} from 'cc';
import { Simulation, type PauseReason } from './core/Simulation';
import { ACTIONS, TUTORIAL } from './core/Actions';
import { World } from './World';
import { HUD } from './HUD';
import { Platform } from './Platform';
import { MAP, WEAPONS, type Point } from './core/Data';
const { ccclass } = _decorator;
type TouchRole = { role: string; x: number; y: number; button?: string };
@ccclass('Overwatch')
export class Overwatch extends Component {
  sim = new Simulation();
  world!: World;
  hud!: HUD;
  platform!: Platform;
  touches = new Map<number, TouchRole>();
  keys = new Set<number>();
  mouseButton = '';
  accumulator = 0;
  lastEvent = 0;
  frameCount = 0;
  frameSeconds = 0;
  measuredFps = 0;
  resizeKey = '';
  start() {
    view.enableAutoFullScreen(false);
    view.resizeWithBrowserSize(true);
    view.setOrientation(macro.ORIENTATION_AUTO);
    this.world = new World(this.node);
    this.hud = new HUD(this.node);
    this.world.camera.visibility = 1 << 30;
    this.platform = new Platform(this.node, this.pause, this.clear);
    this.hud.tutorial = this.platform.readCoach();
    input.on(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
    input.on(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
    input.on(Input.EventType.MOUSE_UP, this.mouseUp, this);
    input.on(Input.EventType.MOUSE_WHEEL, this.wheel, this);
    input.on(Input.EventType.TOUCH_START, this.touchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
    input.on(Input.EventType.KEY_DOWN, this.keyDown, this);
    input.on(Input.EventType.KEY_UP, this.keyUp, this);
    game.on(Game.EVENT_HIDE, this.hide, this);
    game.on(Game.EVENT_SHOW, this.show, this);
    if (sys.isBrowser && (location.hostname === 'localhost' || location.hostname === '127.0.0.1'))
      (globalThis as any).__night = {
        snapshot: () => this.snapshot(),
        // Read-only observability. Tests send real keyboard/mouse/touch inputs.
        screenPoint: (p: Point) => {
          const q = this.world.project(p);
          return { x: q.x / view.getScaleX(), y: this.hud.h - q.y / view.getScaleY() };
        },
      };
  }
  pause = (reason: PauseReason, on: boolean) => {
    if (on) this.clear();
    this.sim.pause(reason, on);
    this.accumulator = 0;
    if (on) this.platform?.stop();
  };
  clear = () => {
    this.sim.clearInput();
    this.touches.clear();
    this.keys.clear();
    this.mouseButton = '';
    if (this.world) {
      this.world.temporary = false;
      this.world.updateCamera();
    }
  };
  hide() {
    this.pause('background', true);
  }
  show() {
    this.pause('background', false);
  }
  retry() {
    const pauses = new Set(this.sim.pauses);
    this.clear();
    this.sim = new Simulation();
    for (const r of Array.from(pauses))
      if (['background', 'orientation', 'focus'].includes(r)) this.sim.pauses.add(r);
    this.sim.start();
    this.accumulator = 0;
    this.lastEvent = 0;
    this.world.reset();
    this.hud.modalKey = 'rebuild';
  }
  action(id: string) {
    this.platform.activate();
    if (id === 'close' || id === 'resume') {
      if (this.sim.pauses.has('help')) this.pause('help', false);
      else if (this.sim.pauses.has('mission')) this.pause('mission', false);
      else this.pause('manual', false);
      return;
    }
    if (id === 'help') {
      this.hud.helpTouch = this.hud.touch;
      this.pause('help', !this.sim.pauses.has('help'));
      return;
    }
    if (id === 'pause') {
      this.pause('manual', !this.sim.pauses.has('manual'));
      return;
    }
    if (id === 'mission') {
      this.pause('mission', !this.sim.pauses.has('mission'));
      return;
    }
    if (id === 'language') {
      this.hud.lang = this.hud.lang === 'zh' ? 'en' : 'zh';
      this.hud.resize();
      return;
    }
    if (id === 'input') {
      this.hud.helpTouch = !this.hud.helpTouch;
      return;
    }
    if (id.startsWith('tab:')) {
      this.hud.helpGroup = id.slice(4) as HUD['helpGroup'];
      return;
    }
    if (id === 'tutorial') {
      this.hud.tutorial = true;
      this.sim.completed.clear();
      this.pause('help', false);
      return;
    }
    if (id === 'sound') {
      this.platform.muted = !this.platform.muted;
      this.hud.muted = this.platform.muted;
      this.hud.modalKey = 'rebuild';
      if (this.platform.muted) this.platform.stop();
      return;
    }
    if (id === 'fullscreen') {
      this.clear();
      void this.platform.fullscreen().then((ok) => {
        this.hud.toast = ok
          ? ''
          : this.hud.t(
              '浏览器未开放全屏，可继续窗口游玩',
              'FULL SCREEN UNAVAILABLE — CONTINUE WINDOWED',
            );
        this.hud.toastUntil = Date.now() + 5000;
      });
      return;
    }
    if (id === 'retry') {
      this.retry();
      return;
    }
    if (id === 'start') {
      this.sim.start();
      return;
    }
    if (this.sim.paused || this.sim.phase !== 'playing') return;
    if (id.startsWith('weapon')) this.sim.choose(Number(id.slice(-1)));
    if (id === 'previous') this.sim.choose((this.sim.selected + 2) % 3);
    if (id === 'next') this.sim.choose((this.sim.selected + 1) % 3);
    if (id === 'sensor') {
      this.world.sensor();
      this.sim.completed.add('sensor');
    }
    if (id === 'convoy') this.sim.command();
    if (id === 'locate') {
      this.world.locate(this.sim.rescue);
      this.sim.setAim({ x: this.sim.rescue.x + 8, z: this.sim.rescue.z - 6 });
      this.sim.completed.add('locate');
    }
    if (id === 'zoomIn' || id === 'zoomOut') {
      this.world.zoom = Math.max(
        0.8,
        Math.min(3.2, this.world.zoom + (id === 'zoomIn' ? 0.2 : -0.2)),
      );
      this.world.updateCamera();
      this.sim.completed.add('zoom');
    }
  }
  mousePosition(e: EventMouse) {
    const p = e.getUILocation();
    return { x: p.x, y: this.hud.h - p.y };
  }
  mouseMove(e: EventMouse) {
    if (this.platform.touchInput) return;
    this.hud.touch = false;
    const p = this.mousePosition(e);
    if (!this.hud.modal && !this.hud.blocksBattlefield(p.x, p.y)) {
      const q = e.getLocation();
      this.sim.setAim(this.world.aimAt(q.x, q.y));
    }
  }
  mouseDown(e: EventMouse) {
    if (this.platform.touchInput) return;
    this.hud.touch = false;
    this.platform.activate();
    const p = this.mousePosition(e),
      b = this.hud.hit(p.x, p.y);
    if (b) {
      if (this.hud.modal && b.label.node.parent !== this.hud.modal) return;
      this.mouseButton = b.id;
      if (b.id === 'fire' && e.getButton() === 0) this.sim.setFire('mouse', true);
      return;
    }
    if (this.hud.modal || this.hud.blocksBattlefield(p.x, p.y)) return;
    if (e.getButton() === 2) {
      this.world.temporary = true;
      this.world.updateCamera();
      this.sim.completed.add('zoom');
      return;
    }
    if (e.getButton() === 0) {
      const q = e.getLocation();
      this.sim.setAim(this.world.aimAt(q.x, q.y));
      this.sim.setFire('mouse', true);
    }
  }
  mouseUp(e: EventMouse) {
    if (this.platform.touchInput) return;
    this.sim.setFire('mouse', false);
    if (e.getButton() === 2) {
      this.world.temporary = false;
      this.world.updateCamera();
    }
    const p = this.mousePosition(e),
      b = this.hud.hit(p.x, p.y);
    const id = this.mouseButton;
    this.mouseButton = '';
    if (id && id !== 'fire' && b?.id === id) this.action(id);
  }
  wheel(e: EventMouse) {
    if (this.hud.modal) {
      if (this.sim.pauses.has('help')) this.hud.scrollBy(-e.getScrollY() * 0.2);
      return;
    }
    this.action(e.getScrollY() > 0 ? 'previous' : 'next');
  }
  touchStart(e: EventTouch) {
    if (e.simulate || !this.platform.touchInput) return;
    this.hud.touch = true;
    this.platform.activate();
    for (const t of e.getTouches()) {
      const p = t.getUILocation(),
        x = p.x,
        y = this.hud.h - p.y,
        b = this.hud.hit(x, y),
        id = t.getID();
      if (b && (!this.hud.modal || b.label.node.parent === this.hud.modal)) {
        this.touches.set(id, { role: b.id === 'fire' ? 'fire' : 'button', x, y, button: b.id });
        if (b.id === 'fire') this.sim.setFire('touch:' + id, true);
      } else if (this.hud.modal) {
        if (this.sim.pauses.has('help')) this.touches.set(id, { role: 'scroll', x, y });
      } else if (
        !this.hud.blocksBattlefield(x, y) &&
        !Array.from(this.touches.values()).some((t) => t.role === 'aim')
      )
        this.touches.set(id, { role: 'aim', x, y });
    }
  }
  touchMove(e: EventTouch) {
    if (e.simulate || !this.platform.touchInput) return;
    for (const t of e.getTouches()) {
      const role = this.touches.get(t.getID());
      if (!role) continue;
      const p = t.getUILocation(),
        x = p.x,
        y = this.hud.h - p.y;
      if (role.role === 'scroll') this.hud.scrollBy(role.y - y);
      if (role.role === 'aim' && !this.sim.paused) {
        const q = t.getLocation(),
          old = this.world.aimAt(
            q.x - (x - role.x) * view.getScaleX(),
            q.y + (y - role.y) * view.getScaleY(),
          ),
          now = this.world.aimAt(q.x, q.y);
        this.sim.setAim({
          x: Math.max(-MAP.halfWidth, Math.min(MAP.halfWidth, this.sim.aim.x + now.x - old.x)),
          z: Math.max(-MAP.halfDepth, Math.min(MAP.halfDepth, this.sim.aim.z + now.z - old.z)),
        });
      }
      role.x = x;
      role.y = y;
    }
  }
  touchEnd(e: EventTouch) {
    if (e.simulate || !this.platform.touchInput) return;
    for (const t of e.getTouches()) {
      const id = t.getID(),
        role = this.touches.get(id);
      this.touches.delete(id);
      this.sim.setFire('touch:' + id, false);
      if (role?.role === 'button') {
        const p = t.getUILocation(),
          b = this.hud.hit(p.x, this.hud.h - p.y);
        if (b && b.id === role.button) this.action(b.id);
      }
    }
  }
  touchCancel(e: EventTouch) {
    if (e.simulate || !this.platform.touchInput) return;
    this.clear();
  }
  keyDown(e: EventKeyboard) {
    if (!this.platform.focused || this.keys.has(e.keyCode)) return;
    this.keys.add(e.keyCode);
    this.hud.touch = false;
    this.platform.activate();
    if (e.keyCode === 13 && this.sim.phase === 'briefing') {
      this.action('start');
      return;
    }
    const a = ACTIONS.find((a) => (a.keys as readonly number[]).includes(e.keyCode));
    if (!a) return;
    if (a.id === 'fire') this.sim.setFire('space', true);
    else this.action(a.id);
  }
  keyUp(e: EventKeyboard) {
    this.keys.delete(e.keyCode);
    if (e.keyCode === 32) this.sim.setFire('space', false);
  }
  update(dt: number) {
    if (!this.hud) return;
    const frame = view.getFrameSize(),
      key = frame.width + 'x' + frame.height;
    if (key !== this.resizeKey) {
      this.resizeKey = key;
      this.hud.resize();
      this.world.updateCamera();
      this.pause('orientation', frame.width < frame.height);
    }
    if (this.sim.phase === 'playing' && !this.sim.paused) {
      this.accumulator += Math.min(dt, 0.1);
      let steps = 0;
      while (this.accumulator >= 1 / 60 && steps++ < 6) {
        this.sim.step(1 / 60);
        this.accumulator -= 1 / 60;
      }
    } else this.accumulator = 0;
    // At zoom, approaching an edge pans only the camera. North remains fixed.
    if (
      !this.sim.paused &&
      !this.hud.modal &&
      this.sim.phase === 'playing' &&
      this.world.zoom > 1.05
    ) {
      const p = this.world.project(this.sim.aim),
        x = p.x / view.getScaleX(),
        y = this.hud.h - p.y / view.getScaleY();
      let moved = false;
      if (x < 55 || x > this.hud.w - 68) {
        this.world.center.x = Math.max(
          -MAP.halfWidth + 15,
          Math.min(MAP.halfWidth - 15, this.world.center.x + (x < 55 ? -1 : 1) * dt * 30),
        );
        moved = true;
      }
      if (y < 78 || y > this.hud.h - 105) {
        this.world.center.z = Math.max(
          -MAP.halfDepth + 12,
          Math.min(MAP.halfDepth - 12, this.world.center.z + (y < 78 ? -1 : 1) * dt * 30),
        );
        moved = true;
      }
      if (moved) this.world.updateCamera();
    }
    for (const e of this.sim.events)
      if (e.id > this.lastEvent) {
        if (e.type === 'shot') this.platform.play(WEAPONS[e.weapon].id);
        else if (e.type === 'impact')
          this.platform.play(e.weapon === 0 ? 'hit' : 'impact' + e.weapon);
        else if (e.type === 'attack' || e.type === 'wave') this.platform.play('alert');
        this.lastEvent = e.id;
      }
    this.world.update(this.sim);
    this.hud.fullscreen = this.platform.isFullscreen;
    this.hud.update(this.sim, this.world);
    this.platform.ambience(this.sim.phase === 'playing' && !this.sim.paused);
    if (TUTORIAL.every((e) => this.sim.completed.has(e)) && this.hud.tutorial) {
      this.hud.tutorial = false;
      this.platform.saveCoach();
    }
    this.frameCount++;
    this.frameSeconds += dt;
    if (this.frameSeconds >= 2) {
      this.measuredFps = this.frameCount / this.frameSeconds;
      this.frameCount = 0;
      this.frameSeconds = 0;
    }
  }
  snapshot() {
    return {
      phase: this.sim.phase,
      time: this.sim.time,
      remaining: this.sim.remaining,
      pauses: Array.from(this.sim.pauses),
      convoy: this.sim.convoy,
      progress: this.sim.ratio,
      aim: this.sim.aim,
      selected: this.sim.selected,
      guns: this.sim.guns.map((g) => ({ ...g, ammo: g.ammo === Infinity ? 'infinite' : g.ammo })),
      shots: this.sim.shots,
      units: this.sim.units.map((u) => ({ ...u })),
      kills: this.sim.kills,
      fired: this.sim.fired,
      hits: this.sim.hits,
      friendlyDamage: this.sim.friendlyDamage,
      rating: this.sim.rating,
      failure: this.sim.failure,
      reason: this.sim.reason(),
      friendlyRisk: this.sim.friendlyRisk,
      aimedUnit: this.sim.aimedUnit?.id,
      ui: {
        notice: this.hud.labels.get('notice')?.string,
        warning: this.hud.labels.get('friendWarning')?.string,
        warningColor: this.hud.labels.get('friendWarning')?.color.toHEX(),
        fire: this.hud.buttons.find((b) => b.id === 'fire')?.label.string,
        fullscreen: this.platform.isFullscreen,
      },
      held: Array.from(this.sim.held),
      completed: Array.from(this.sim.completed),
      modal: this.hud.modalKey,
      scroll: this.hud.scroll,
      scrollMax: this.hud.scrollMax,
      lastHelpLine: this.hud.lastHelpLine,
      buttons: this.hud.buttons
        .filter(
          (b) =>
            b.label.node.activeInHierarchy &&
            (!this.hud.modal || b.label.node.parent === this.hud.modal),
        )
        .map(({ id, x, y, w, h }) => ({ id, x, y, w, h })),
      zoom: this.world.zoom,
      temporary: this.world.temporary,
      thermal: this.world.thermal,
      modelImport: this.world.modelImport,
      audio: this.platform.audioStatus,
      enginePlaying: this.platform.engine.playing,
      assets: Array.from(this.world.assets),
      renderNodes: this.world.views.size,
      markerLabels: this.hud.unitLabels.size,
      frameRate: this.measuredFps,
      drawCalls: (director.root as any)?.device?.numDrawCalls,
      triangles: (director.root as any)?.device?.numTris,
      visibleEffects: this.sim.events.filter((e) => this.sim.time - e.time < 0.7).length,
    };
  }
  onDestroy() {
    input.off(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
    input.off(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
    input.off(Input.EventType.MOUSE_UP, this.mouseUp, this);
    input.off(Input.EventType.MOUSE_WHEEL, this.wheel, this);
    input.off(Input.EventType.TOUCH_START, this.touchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
    input.off(Input.EventType.KEY_DOWN, this.keyDown, this);
    input.off(Input.EventType.KEY_UP, this.keyUp, this);
    game.targetOff(this);
    this.platform?.dispose();
  }
}
