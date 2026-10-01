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
import { nextMission, readMissionSearch, type MissionId } from './core/MissionCatalog';
import { bestTrainingRecord } from './core/TrainingRecords';
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
  lastAimInput = 0;
  selectedMission: MissionId = 'corridor-01';
  private startupSignalled = false;
  start() {
    view.enableAutoFullScreen(false);
    view.resizeWithBrowserSize(true);
    view.setOrientation(macro.ORIENTATION_AUTO);
    this.world = new World(this.node);
    this.hud = new HUD(this.node);
    this.world.camera.visibility = 1 << 30;
    this.platform = new Platform(this.node, this.pause, this.clear);
    this.prepareMission(sys.isBrowser ? location.search : '');
    this.hud.tutorial = this.platform.readCoach();
    this.hud.muted = this.platform.muted;
    this.hud.reducedEffects = this.platform.reducedEffects;
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
        flightTime: (p: Point, weapon: number) => this.sim.flightTime(weapon, p),
      };
  }
  pause = (reason: PauseReason, on: boolean) => {
    if (on) this.clear();
    this.sim.pause(reason, on);
    this.accumulator = 0;
    if (on) this.platform?.stop();
  };
  prepareMission(search: string) {
    this.selectedMission = this.platform.readMission();
    const launch = readMissionSearch(search);
    if (launch && launch !== 'training-60') this.selectedMission = launch;
    this.sim = new Simulation(launch || this.selectedMission);
    this.hud.trainingBest = this.platform.readWarmupRecord();
  }
  clear = () => {
    if (this.hud) this.hud.mousePointer = undefined;
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
    this.sim = new Simulation(this.sim.mission.id);
    for (const r of Array.from(pauses))
      if (['background', 'orientation', 'focus'].includes(r)) this.sim.pauses.add(r);
    this.sim.start();
    this.accumulator = 0;
    this.lastEvent = 0;
    this.world.reset();
    this.hud.modalKey = 'rebuild';
  }
  selectMission(id: MissionId, persist = false) {
    if (this.sim.phase === 'playing') return;
    const pauses = new Set(this.sim.pauses);
    this.clear();
    this.sim = new Simulation(id);
    if (this.sim.mission.mode === 'escort') {
      this.selectedMission = this.sim.mission.id;
      if (persist) this.platform.saveMission(this.selectedMission);
    }
    this.syncMissionAddress();
    for (const reason of pauses)
      if (['background', 'orientation', 'focus'].includes(reason)) this.sim.pauses.add(reason);
    this.hud.trainingBest = this.platform.readWarmupRecord();
    this.world.reset();
    this.lastEvent = this.accumulator = 0;
    this.hud.modalKey = 'rebuild';
  }
  syncMissionAddress() {
    if (!sys.isBrowser) return;
    try {
      const url = new URL(location.href);
      if (!url.searchParams.has('mission')) return;
      url.search = new URLSearchParams({ mission: this.sim.mission.id }).toString();
      url.hash = url.username = url.password = '';
      history.replaceState(null, '', url.href);
    } catch { /* A public shortcut stays optional when browser history is unavailable. */ }
  }
  saveTrainingResult() {
    if (this.sim.mission.mode !== 'training') return;
    const previous = this.platform.readWarmupRecord();
    const best = bestTrainingRecord(previous, this.sim);
    this.hud.trainingBest = best;
    if (best && best !== previous) this.platform.saveWarmupRecord(best);
  }
  action(id: string) {
    this.platform.activate();
    if (id === 'training' || id === 'missionReturn') {
      this.selectMission(id === 'training' ? 'training-60' : this.selectedMission);
      return;
    }
    if (id === 'missionNext') {
      this.selectMission(nextMission(this.sim.mission.mode === 'training' ? this.selectedMission : this.sim.mission.id), true);
      return;
    }
    if (id === 'tools' || id === 'flightControls') {
      this.clear();
      this.hud.toolsOpen = !this.hud.toolsOpen;
      return;
    }
    const flightActions = ['rotateLeft', 'rotateRight', 'orbitLeft', 'orbitRight',
      'altitudeUp', 'altitudeDown', 'radiusIn', 'radiusOut'];
    if (!['zoomIn', 'zoomOut', 'sound', ...flightActions].includes(id)) this.hud.toolsOpen = false;
    if (id === 'close' || id === 'resume') {
      if (this.sim.pauses.has('help')) this.pause('help', false);
      else if (this.sim.pauses.has('settings')) this.pause('settings', false);
      else if (this.sim.pauses.has('mission')) this.pause('mission', false);
      else this.pause('manual', false);
      return;
    }
    if (id === 'settings') {
      const wasHelp = this.sim.pauses.has('help');
      if (wasHelp) this.pause('help', false);
      this.pause('settings', wasHelp || !this.sim.pauses.has('settings'));
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
      this.platform.savePreferences();
      this.hud.modalKey = 'rebuild';
      if (this.platform.muted) this.platform.stop();
      return;
    }
    if (id === 'effects') {
      this.platform.reducedEffects = !this.platform.reducedEffects;
      this.hud.reducedEffects = this.platform.reducedEffects;
      this.platform.savePreferences();
      this.hud.modalKey = 'rebuild';
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
      this.world.reset();
      this.sim.start();
      return;
    }
    if (this.sim.paused || this.sim.phase !== 'playing') return;
    if (flightActions.includes(id)) {
      this.sim.clearInput();
      if (id === 'rotateLeft' || id === 'rotateRight')
        this.world.rotate(id === 'rotateLeft' ? -12 : 12);
      if (id === 'orbitLeft' || id === 'orbitRight')
        this.sim.setOrbitDirection(id === 'orbitLeft' ? -1 : 1);
      if (id === 'altitudeUp' || id === 'altitudeDown')
        this.sim.adjustAltitude(id === 'altitudeUp' ? 20 : -20);
      if (id === 'radiusIn' || id === 'radiusOut')
        this.sim.adjustRadius(id === 'radiusOut' ? 20 : -20);
      return;
    }
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
      this.world.adjustZoom(id === 'zoomIn' ? 1.2 : 1 / 1.2);
      this.sim.completed.add('zoom');
    }
  }
  mousePosition(e: EventMouse) {
    const p = e.getUILocation();
    return { x: p.x, y: this.hud.h - p.y };
  }
  locateMap(p: Point) {
    if (this.sim.paused || this.sim.phase !== 'playing') return;
    this.clear();
    this.world.center = { ...p };
    this.world.follow = false;
    this.world.updateCamera();
    this.sim.setAim(p);
  }
  mouseMove(e: EventMouse) {
    if (this.platform.touchInput) return;
    this.hud.touch = false;
    const p = this.mousePosition(e);
    this.hud.mousePointer = p;
    if (this.mouseButton === 'fire' && this.hud.hit(p.x, p.y)?.id !== 'fire') {
      this.sim.setFire('mouse', false);
      this.mouseButton = '';
    }
    if (this.hud.blocksBattlefield(p.x, p.y) && this.mouseButton !== 'fire')
      this.sim.setFire('mouse', false);
    if (!this.hud.modal && !this.hud.blocksBattlefield(p.x, p.y)) {
      const q = e.getLocation();
      const aim = this.world.aimAt(q.x, q.y);
      if (aim) this.sim.setAim(aim);
      else this.sim.setFire('mouse', false);
      this.lastAimInput = Date.now();
    }
  }
  mouseDown(e: EventMouse) {
    if (this.platform.touchInput) return;
    this.hud.touch = false;
    this.platform.activate();
    const p = this.mousePosition(e),
      b = this.hud.hit(p.x, p.y);
    this.hud.mousePointer = p;
    if (b) {
      if (e.getButton() !== 0) return;
      if (this.hud.modal && b.label.node.parent !== this.hud.modal && !this.hud.isGlobalAction(b.id)) return;
      this.mouseButton = b.id;
      if (b.id === 'fire' && e.getButton() === 0) this.sim.setFire('mouse', true);
      return;
    }
    const mapPoint = this.hud.minimapPoint(p.x, p.y);
    if (mapPoint && e.getButton() === 0) {
      this.locateMap(mapPoint);
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
      const aim = this.world.aimAt(q.x, q.y);
      if (!aim) return;
      this.sim.setAim(aim);
      this.sim.setFire('mouse', true);
    }
  }
  mouseUp(e: EventMouse) {
    if (this.platform.touchInput) return;
    if (e.getButton() === 2) {
      this.world.temporary = false;
      this.world.updateCamera();
    }
    if (e.getButton() !== 0) return;
    this.sim.setFire('mouse', false);
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
    const p = this.mousePosition(e);
    if (this.sim.phase !== 'playing' || this.sim.paused || this.hud.blocksBattlefield(p.x, p.y)) return;
    const q = e.getLocation();
    this.world.adjustZoom(Math.exp(Math.max(-0.35, Math.min(0.35, e.getScrollY() * 0.0015))), q.x, q.y);
    this.sim.completed.add('zoom');
  }
  touchStart(e: EventTouch) {
    // Creator 3.8.8 leaves simulate=false on mouse-generated touches; browser pointer type is authoritative.
    if (e.simulate || (sys.isBrowser && !this.platform.touchInput)) return;
    this.platform.useTouchInput(true);
    this.hud.mousePointer = undefined;
    this.hud.touch = true;
    this.platform.activate();
    for (const t of e.getTouches()) {
      const p = t.getUILocation(),
        x = p.x,
        y = this.hud.h - p.y,
        b = this.hud.hit(x, y),
        id = t.getID();
      if (this.touches.has(id)) continue;
      const mapPoint = this.hud.minimapPoint(x, y);
      if (!b && mapPoint) {
        this.locateMap(mapPoint);
        this.touches.set(id, { role: 'map', x, y });
        continue;
      }
      if (b && (!this.hud.modal || b.label.node.parent === this.hud.modal || this.hud.isGlobalAction(b.id))) {
        if (b.id === 'fire' && Array.from(this.touches.values()).some((t) => t.role === 'pinch')) {
          this.touches.set(id, { role: 'cancelled', x, y });
          continue;
        }
        this.touches.set(id, { role: b.id === 'fire' ? 'fire' : 'button', x, y, button: b.id });
        if (b.id === 'fire') this.sim.setFire('touch:' + id, true);
      } else if (this.hud.modal) {
        if (this.sim.pauses.has('help')) this.touches.set(id, { role: 'scroll', x, y });
      } else if (
        !this.hud.blocksBattlefield(x, y) && this.sim.phase === 'playing' && !this.sim.paused
      )
        this.touches.set(id, { role: 'aim', x, y });
    }
    const fingers = Array.from(this.touches.values()).filter((t) => t.role === 'aim' || t.role === 'pinch');
    if (fingers.length >= 2) {
      this.sim.clearInput();
      fingers.forEach((t, i) => { t.role = i < 2 ? 'pinch' : 'cancelled'; });
      for (const t of this.touches.values()) if (t.role === 'fire') t.role = 'cancelled';
    }
  }
  touchMove(e: EventTouch) {
    if (e.simulate || (sys.isBrowser && !this.platform.touchInput)) return;
    const fingers = Array.from(this.touches.values()).filter((t) => t.role === 'pinch');
    if (fingers.length === 2) {
      const before = Math.hypot(fingers[0].x - fingers[1].x, fingers[0].y - fingers[1].y);
      for (const t of e.getTouches()) {
        const role = this.touches.get(t.getID());
        if (role?.role !== 'pinch') continue;
        const p = t.getUILocation();
        role.x = p.x;
        role.y = this.hud.h - p.y;
      }
      const after = Math.hypot(fingers[0].x - fingers[1].x, fingers[0].y - fingers[1].y);
      if (before > 8 && after > 8 && !this.sim.paused) {
        this.world.adjustZoom(after / before,
          (fingers[0].x + fingers[1].x) / 2 * view.getScaleX(),
          (this.hud.h - (fingers[0].y + fingers[1].y) / 2) * view.getScaleY());
        this.sim.completed.add('zoom');
      }
      return;
    }
    for (const t of e.getTouches()) {
      const role = this.touches.get(t.getID());
      if (!role) continue;
      const p = t.getUILocation(),
        x = p.x,
        y = this.hud.h - p.y;
      if (role.role === 'scroll') this.hud.scrollBy(role.y - y);
      if (role.role === 'fire' && this.hud.hit(x, y)?.id !== 'fire') {
        this.sim.setFire('touch:' + t.getID(), false);
        role.role = 'cancelled';
      }
      if (role.role === 'aim' && !this.sim.paused) {
        const q = t.getLocation(),
          old = this.world.aimAt(
            q.x - (x - role.x) * view.getScaleX(),
            q.y + (y - role.y) * view.getScaleY(),
          ),
          now = this.world.aimAt(q.x, q.y);
        if (old && now) this.sim.setAim({
          x: Math.max(-MAP.halfWidth, Math.min(MAP.halfWidth, this.sim.aim.x + now.x - old.x)),
          z: Math.max(-MAP.halfDepth, Math.min(MAP.halfDepth, this.sim.aim.z + now.z - old.z)),
        });
      }
      role.x = x;
      role.y = y;
    }
  }
  touchEnd(e: EventTouch) {
    if (e.simulate || (sys.isBrowser && !this.platform.touchInput)) return;
    for (const t of e.getTouches()) {
      const id = t.getID(),
        role = this.touches.get(id);
      this.touches.delete(id);
      this.sim.setFire('touch:' + id, false);
      if (role?.role === 'pinch')
        for (const finger of this.touches.values()) if (finger.role === 'pinch') finger.role = 'cancelled';
      if (role?.role === 'button') {
        const p = t.getUILocation(),
          b = this.hud.hit(p.x, this.hud.h - p.y);
        if (b && b.id === role.button) this.action(b.id);
      }
    }
  }
  touchCancel(e: EventTouch) {
    if (e.simulate || (sys.isBrowser && !this.platform.touchInput)) return;
    this.clear();
  }
  keyDown(e: EventKeyboard) {
    if (!this.platform.focused || this.keys.has(e.keyCode)) return;
    this.keys.add(e.keyCode);
    this.hud.touch = false;
    this.platform.activate();
    if (e.keyCode === 27 && ['help', 'settings', 'mission'].some((reason) => this.sim.pauses.has(reason as PauseReason))) {
      this.action('close');
      return;
    }
    if (e.keyCode === 13 && this.sim.phase !== 'playing') {
      this.action(this.sim.phase === 'briefing' ? 'start' : 'retry');
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
    const before = this.sim.phase;
    if (this.sim.phase === 'playing' && !this.sim.paused) {
      this.accumulator += Math.min(dt, 0.1);
      let steps = 0;
      while (this.accumulator >= 1 / 60 && steps++ < 6) {
        this.sim.step(1 / 60);
        this.accumulator -= 1 / 60;
      }
    } else this.accumulator = 0;
    if (before === 'playing' && this.sim.phase !== 'playing') this.saveTrainingResult();
    // Pan in screen space: the ground axes rotate with the aircraft and sensor.
    if (
      !this.sim.paused &&
      !this.hud.modal &&
      this.sim.phase === 'playing' &&
      this.world.zoom > 1.05 &&
      (Array.from(this.touches.values()).some((t) => t.role === 'aim') ||
        (!this.platform.touchInput && Date.now() - this.lastAimInput < 500))
    ) {
      const p = this.world.project(this.sim.aim),
        x = p.x / view.getScaleX(),
        y = this.hud.h - p.y / view.getScaleY();
      const dx = x < 55 ? -1 : x > this.hud.w - 68 ? 1 : 0;
      const dy = y < 78 ? 1 : y > this.hud.h - 105 ? -1 : 0;
      if (dx || dy) {
        const a = this.world.aimAt(this.hud.w * view.getScaleX() / 2, this.hud.h * view.getScaleY() / 2);
        const b = this.world.aimAt(
          (this.hud.w / 2 + dx * dt * 70) * view.getScaleX(),
          (this.hud.h / 2 + dy * dt * 70) * view.getScaleY(),
        );
        if (a && b && Number.isFinite(a.x) && Number.isFinite(a.z) && Number.isFinite(b.x) && Number.isFinite(b.z)) {
          this.world.center.x = Math.max(-MAP.halfWidth, Math.min(MAP.halfWidth, this.world.center.x + b.x - a.x));
          this.world.center.z = Math.max(-MAP.halfDepth, Math.min(MAP.halfDepth, this.world.center.z + b.z - a.z));
        }
        this.world.follow = false;
        this.world.updateCamera();
      }
    }
    for (const e of this.sim.events)
      if (e.id > this.lastEvent) {
        if (e.type === 'shot') this.platform.play(WEAPONS[e.weapon].id);
        else if (e.type === 'impact') {
          if (e.weapon > 0) this.platform.play('impact' + e.weapon);
          if (e.outcome === 'hit' || e.outcome === 'destroyed') this.platform.play('hit');
        } else if (e.type === 'attack') this.platform.play(e.friendly ? 'rapid' : 'alert');
        else if (e.type === 'wave') this.platform.play('alert');
        this.lastEvent = e.id;
      }
    this.world.update(this.sim);
    this.hud.fullscreen = this.platform.isFullscreen;
    this.hud.update(this.sim, this.world);
    if (sys.isBrowser && !this.startupSignalled && this.world.aircraftModel.status !== 'loading' && this.world.modelImport !== 'loading') {
      this.startupSignalled = true;
      if (this.world.aircraftModel.status === 'error')
        window.dispatchEvent(new CustomEvent('night-overwatch:error', { detail: new Error('机舱资源加载失败，请重试。') }));
      else window.dispatchEvent(new Event('night-overwatch:ready'));
    }
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
      mission: { id: this.sim.mission.id, mode: this.sim.mission.mode, name: this.sim.mission.name, spawned: this.sim.spawned.size, total: this.sim.mission.events.length },
      trainingBest: this.hud.trainingBest,
      time: this.sim.time,
      remaining: this.sim.remaining,
      pauses: Array.from(this.sim.pauses),
      convoy: this.sim.convoy,
      progress: this.sim.ratio,
      aim: this.sim.aim,
      aircraft: { ...this.sim.aircraft },
      aircraftModel: {
        status: this.world.aircraftModel.status,
        error: this.world.aircraftModel.error,
        triangles: this.world.aircraftModel.triangleCount,
        muzzle: this.world.aircraftModel.worldMuzzle,
      },
      flightTime: this.sim.flightTime(),
      threatsRemaining: this.sim.threatsRemaining,
      camera: {
        position: { x: this.world.cameraNode.position.x, y: this.world.cameraNode.position.y, z: this.world.cameraNode.position.z },
        rotation: { x: this.world.cameraNode.eulerAngles.x, y: this.world.cameraNode.eulerAngles.y, z: this.world.cameraNode.eulerAngles.z },
        center: { ...this.world.center },
        fov: this.world.camera.fov,
        projection: this.world.camera.projection,
      },
      shotPositions: this.sim.shots.map((shot) => ({ id: shot.id, ...this.sim.shotPosition(shot) })),
      unitLabels: Array.from(this.hud.unitLabels, ([id, label]) => ({
        id, text: label.string, active: label.node.activeInHierarchy,
        x: label.node.position.x, y: label.node.position.y,
      })),
      effects: this.hud.effects,
      mousePointer: this.hud.mousePointer,
      selected: this.sim.selected,
      guns: this.sim.guns.map((g) => ({ ...g, ammo: g.ammo === Infinity ? 'infinite' : g.ammo })),
      shots: this.sim.shots,
      units: this.sim.units.map((u) => ({ ...u })),
      kills: this.sim.kills,
      friendlyKills: this.sim.friendlyKills,
      groundAttacks: this.sim.events.filter((e) => e.type === 'attack').slice(-12),
      fired: this.sim.fired,
      hits: this.sim.hits,
      friendlyDamage: this.sim.friendlyDamage,
      rescueDamage: this.sim.rescueDamage,
      damageByThreat: this.sim.damageByThreat,
      failureCause: this.sim.failureCause,
      impacts: this.sim.events.filter((e) => e.type === 'impact').slice(-5),
      rating: this.sim.rating,
      failure: this.sim.failure,
      failedGroup: this.sim.failedGroup,
      reason: this.sim.reason(),
      friendlyRisk: this.sim.friendlyRisk,
      aimedUnit: this.sim.aimedUnit?.id,
      ui: {
        minimap: this.hud.minimapLayout,
        notice: this.hud.labels.get('notice')?.string,
        warning: this.hud.labels.get('friendWarning')?.string,
        warningColor: this.hud.labels.get('friendWarning')?.color.toHEX(),
        fire: this.hud.buttons.find((b) => b.id === 'fire')?.label.string,
        fullscreen: this.platform.isFullscreen,
        tutorial: this.hud.labels.get('tutorial')?.string,
        feedback: this.hud.labels.get('target')?.string,
        muted: this.platform.muted,
        reducedEffects: this.platform.reducedEffects,
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
            (!this.hud.modal || b.label.node.parent === this.hud.modal || this.hud.isGlobalAction(b.id)),
        )
        .map(({ id, x, y, w, h }) => ({ id, x, y, w, h })),
      zoom: this.world.zoom,
      follow: this.world.follow,
      safe: this.hud.safe,
      temporary: this.world.temporary,
      thermal: this.world.thermal,
      modelImport: this.world.modelImport,
      audio: this.platform.audioStatus,
      enginePlaying: this.platform.engine.playing,
      assets: Array.from(this.world.assets),
      renderNodes: this.world.views.size,
      wrecks: Array.from(this.world.views, ([id, v]) => ({ id, wreck: v.wreck, scale: v.node.scale.x })),
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
