import { EventKeyboard, EventTouch, input, Input, KeyCode, sys, view } from 'cc';
import { clamp, type KartInput } from './KartConfig';
import { selectionRows, type Selection } from './Selection';
import type { RaceManager } from './RaceManager';
export class KartController {
  keys = new Set<number>();
  touches = new Map<number, { role: string; steer: number }>();
  constructor(
    private race: () => RaceManager,
    private restart: () => void,
    private sound: () => void,
    private activateAudio: () => void,
    private choose: (field: keyof Selection, delta: number) => void = () => {},
    private garage: () => void = () => {},
    private blocked: () => boolean = () => false,
    private start: () => void = () => this.race().start(),
  ) {
    input.on(Input.EventType.KEY_DOWN, this.keyDown, this);
    input.on(Input.EventType.KEY_UP, this.keyUp, this);
    input.on(Input.EventType.TOUCH_START, this.touchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.clear, this);
  }
  clear() {
    this.keys.clear();
    this.touches.clear();
    const kart = this.race().drivers[0].kart;
    kart.drifting = false;
    kart.nitroHeld = false;
    kart.charge = kart.tier = kart.driftSide = 0;
  }
  keyDown(e: EventKeyboard) {
    if (this.blocked()) return;
    if (this.keys.has(e.keyCode)) return;
    this.activateAudio();
    this.keys.add(e.keyCode);
    const r = this.race();
    if (r.phase === 'ready') {
      const field =
        e.keyCode === KeyCode.DIGIT_1
          ? 'theme'
          : e.keyCode === KeyCode.DIGIT_2
            ? 'route'
            : e.keyCode === KeyCode.DIGIT_3
              ? 'vehicle'
              : e.keyCode === KeyCode.DIGIT_4
                ? 'driver'
                : null;
      if (field) {
        const shifts = [KeyCode.SHIFT_LEFT, KeyCode.SHIFT_RIGHT].filter((key) =>
          this.keys.has(key),
        );
        this.choose(field, shifts.length ? -1 : 1);
        for (const key of shifts) this.keys.add(key);
        this.keys.add(e.keyCode);
        return;
      }
    }
    if (e.keyCode === KeyCode.KEY_G && (r.phase === 'paused' || r.phase === 'finished')) {
      this.clear();
      this.garage();
      return;
    }
    if (
      e.keyCode === KeyCode.ENTER &&
      (r.phase === 'ready' || r.phase === 'paused' || r.phase === 'finished')
    ) {
      this.clear();
      if (r.phase === 'ready' && r.loadError) this.garage();
      else if (r.phase === 'ready' && r.loaded) this.start();
      else if (r.phase === 'paused') r.resume();
      else if (r.phase === 'finished') this.restart();
      this.keys.add(e.keyCode);
      return;
    }
    if (e.keyCode === KeyCode.KEY_P || e.keyCode === KeyCode.ESCAPE) {
      r.phase === 'paused' ? r.resume() : r.pause();
      this.clear();
      this.keys.add(e.keyCode);
      return;
    }
    if (e.keyCode === KeyCode.KEY_R && (r.phase === 'finished' || r.phase === 'paused')) {
      this.restart();
      this.keys.add(e.keyCode);
      return;
    }
    if (e.keyCode === KeyCode.KEY_M) this.sound();
    if (
      r.phase !== 'racing' &&
      r.phase !== 'countdown' &&
      ![KeyCode.KEY_M, KeyCode.SHIFT_LEFT, KeyCode.SHIFT_RIGHT].includes(e.keyCode)
    )
      this.keys.delete(e.keyCode);
  }
  keyUp(e: EventKeyboard) {
    this.keys.delete(e.keyCode);
  }
  location(e: EventTouch) {
    const p = e.getUILocation(),
      s = view.getVisibleSize();
    return { x: p.x / s.width, y: p.y / s.height };
  }
  touchStart(e: EventTouch) {
    if (this.blocked()) return;
    this.activateAudio();
    const p = this.location(e),
      r = this.race(),
      id = e.getID();
    if (id === null) return;
    if (Math.abs(p.x * 960 - 70) <= 48 && Math.abs(p.y * 540 - 360) <= 24) {
      this.sound();
      return;
    }
    if (Math.abs(p.x * 960 - 70) <= 36 && Math.abs(p.y * 540 - 300) <= 24) {
      r.phase === 'paused' ? r.resume() : r.pause();
      this.clear();
      return;
    }
    if (r.phase === 'ready' || r.phase === 'finished' || r.phase === 'paused') {
      if (r.phase === 'ready' && p.x > 0.17 && p.x < 0.83) {
        const row = selectionRows.find(({ y }) => Math.abs(p.y * 540 - 270 - y) <= 19)?.field;
        if (row) {
          this.clear();
          this.choose(row, p.x < 0.5 ? -1 : 1);
          return;
        }
      }
      if (r.phase !== 'ready' && p.x > 0.135 && p.x < 0.315 && p.y > 0.22 && p.y < 0.32) {
        this.clear();
        this.garage();
        return;
      }
      if (r.phase === 'paused' && p.x > 0.685 && p.x < 0.865 && p.y > 0.22 && p.y < 0.32) {
        this.clear();
        this.restart();
        return;
      }
      if (p.x > 0.35 && p.x < 0.65 && p.y > 0.22 && p.y < 0.32) {
        this.clear();
        if (r.phase === 'ready' && r.loadError) this.garage();
        else if (r.phase === 'ready' && r.loaded) this.start();
        else if (r.phase === 'paused') r.resume();
        else this.restart();
      }
      return;
    }
    if (p.y < 0.58) {
      const role =
        p.x > 0.78 && p.y > 0.37
          ? 'nitro'
          : p.y >= 0.42
            ? ''
            : p.x < 0.36
              ? 'steer'
              : p.x > 0.78
                ? 'drift'
                : p.x > 0.62
                  ? 'brake'
                  : '';
      if (role) this.touches.set(id, { role, steer: clamp((p.x - 0.16) / 0.095, -1, 1) });
    }
  }
  touchMove(e: EventTouch) {
    const id = e.getID();
    if (id === null) return;
    const t = this.touches.get(id);
    if (t?.role === 'steer') t.steer = clamp((this.location(e).x - 0.16) / 0.095, -1, 1);
  }
  touchEnd(e: EventTouch) {
    const id = e.getID();
    if (id !== null) this.touches.delete(id);
  }
  read(): KartInput {
    if (this.blocked())
      return { steer: 0, throttle: 0, brake: true, drift: false, reverse: false, nitro: false };
    const phase = this.race().phase;
    if (phase !== 'racing' && phase !== 'countdown')
      return { steer: 0, drift: false, brake: false, throttle: 0, nitro: false };
    const key = (...keys: number[]) => keys.some((k) => this.keys.has(k));
    let steer =
      Number(key(KeyCode.ARROW_RIGHT, KeyCode.KEY_D)) -
      Number(key(KeyCode.ARROW_LEFT, KeyCode.KEY_A));
    let drift = key(KeyCode.SPACE),
      nitro = key(KeyCode.SHIFT_LEFT, KeyCode.SHIFT_RIGHT),
      brake = key(KeyCode.ARROW_DOWN, KeyCode.KEY_S);
    for (const t of this.touches.values()) {
      if (t.role === 'steer') steer = t.steer;
      if (t.role === 'drift') drift = true;
      if (t.role === 'brake') brake = true;
      if (t.role === 'nitro') nitro = true;
    }
    const forward = sys.isMobile || key(KeyCode.ARROW_UP, KeyCode.KEY_W);
    return { steer, drift, brake, reverse: brake, nitro, throttle: !brake && forward ? 1 : 0 };
  }
  destroy() {
    input.off(Input.EventType.KEY_DOWN, this.keyDown, this);
    input.off(Input.EventType.KEY_UP, this.keyUp, this);
    input.off(Input.EventType.TOUCH_START, this.touchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.clear, this);
    this.clear();
  }
}
