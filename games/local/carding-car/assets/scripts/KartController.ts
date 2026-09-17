import { EventKeyboard, EventTouch, input, Input, KeyCode, view } from 'cc';
import { clamp, type KartInput } from './KartConfig';
import type { RaceManager } from './RaceManager';
export class KartController {
  keys = new Set<number>();
  touches = new Map<number, { role: string; steer: number }>();
  constructor(
    private race: () => RaceManager,
    private restart: () => void,
    private sound: () => void,
  ) {
    input.on(Input.EventType.KEY_DOWN, this.keyDown, this);
    input.on(Input.EventType.KEY_UP, this.keyUp, this);
    input.on(Input.EventType.TOUCH_START, this.touchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.touchEnd, this);
  }
  clear() {
    this.keys.clear();
    this.touches.clear();
  }
  keyDown(e: EventKeyboard) {
    if (this.keys.has(e.keyCode)) return;
    this.keys.add(e.keyCode);
    const r = this.race();
    if (e.keyCode === KeyCode.ENTER) {
      if (r.phase === 'ready') r.start();
      else if (r.phase === 'paused') r.resume();
      else if (r.phase === 'finished') this.restart();
    }
    if (e.keyCode === KeyCode.KEY_P || e.keyCode === KeyCode.ESCAPE) {
      r.phase === 'paused' ? r.resume() : r.pause();
      this.clear();
    }
    if (e.keyCode === KeyCode.KEY_R && (r.phase === 'finished' || r.phase === 'paused'))
      this.restart();
    if (e.keyCode === KeyCode.KEY_M) this.sound();
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
    const p = this.location(e),
      r = this.race(),
      id = e.getID();
    if (id === null) return;
    if (p.y > 0.82 && p.x > 0.77 && p.x < 0.88) {
      this.sound();
      return;
    }
    if (p.y > 0.82 && p.x > 0.88) {
      r.phase === 'paused' ? r.resume() : r.pause();
      this.clear();
      return;
    }
    if (r.phase === 'ready' || r.phase === 'finished' || r.phase === 'paused') {
      if (p.x > 0.28 && p.x < 0.72 && p.y > 0.22 && p.y < 0.45) {
        if (r.phase === 'ready') r.start();
        else if (r.phase === 'paused') r.resume();
        else this.restart();
      }
      return;
    }
    if (p.y < 0.42) {
      const role = p.x < 0.36 ? 'steer' : p.x > 0.78 ? 'drift' : p.x > 0.62 ? 'brake' : '';
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
    const key = (...keys: number[]) => keys.some((k) => this.keys.has(k));
    let steer =
      Number(key(KeyCode.ARROW_RIGHT, KeyCode.KEY_D)) -
      Number(key(KeyCode.ARROW_LEFT, KeyCode.KEY_A));
    let drift = key(KeyCode.SPACE, KeyCode.SHIFT_LEFT),
      brake = key(KeyCode.ARROW_DOWN, KeyCode.KEY_S);
    for (const t of this.touches.values()) {
      if (t.role === 'steer') steer = t.steer;
      if (t.role === 'drift') drift = true;
      if (t.role === 'brake') brake = true;
    }
    return { steer, drift, brake, throttle: brake ? 0 : 1 };
  }
  destroy() {
    input.off(Input.EventType.KEY_DOWN, this.keyDown, this);
    input.off(Input.EventType.KEY_UP, this.keyUp, this);
    input.off(Input.EventType.TOUCH_START, this.touchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.touchEnd, this);
    this.clear();
  }
}
