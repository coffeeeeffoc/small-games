import { EventKeyboard, EventMouse, EventTouch, Input, KeyCode, input } from 'cc';
import { neutral, clamp } from './core/rules';
import type { Controls } from './core/rules';
import type { UI, Control } from './UI';
type Pointer = { control: Control; active: boolean; x: number; y: number };
export class FlightInput {
  pointers = new Map<number, Pointer>();
  keys = new Set<number>();
  private pending = { missile: false, scan: false };
  private touchedAt = 0;
  constructor(
    private ui: UI,
    private action: (id: string) => void,
    private playing: () => boolean,
  ) {
    input.on(Input.EventType.TOUCH_START, this.touchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
    input.on(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
    input.on(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
    input.on(Input.EventType.MOUSE_UP, this.mouseUp, this);
    input.on(Input.EventType.KEY_DOWN, this.keyDown, this);
    input.on(Input.EventType.KEY_UP, this.keyUp, this);
  }
  private begin(id: number | null, x: number, y: number) {
    if (id === null) return;
    const control = this.ui.hit(x, y);
    if (!control || Array.from(this.pointers.values()).some((p) => p.control.id === control.id))
      return;
    this.pointers.set(id, { control, active: true, x, y });
    this.ui.pressed.add(control.id);
    if (control.id === 'stick') this.move(id, x, y);
  }
  private move(id: number | null, x: number, y: number) {
    if (id === null) return;
    const p = this.pointers.get(id);
    if (!p) return;
    p.x = x;
    p.y = y;
    if (p.control.id === 'stick') {
      const dx = (x - p.control.x - p.control.w / 2) / 45,
        dy = -(y - p.control.y - p.control.h / 2) / 45,
        n = Math.max(1, Math.hypot(dx, dy));
      this.ui.stick = { x: dx / n, y: dy / n };
      return;
    }
    if (this.ui.hit(x, y)?.id !== p.control.id) {
      p.active = false;
      this.ui.pressed.delete(p.control.id);
    }
  }
  private end(id: number | null, cancel = false) {
    if (id === null) return;
    const p = this.pointers.get(id);
    if (!p) return;
    this.pointers.delete(id);
    this.ui.pressed.delete(p.control.id);
    if (p.control.id === 'stick') {
      this.ui.stick = { x: 0, y: 0 };
      return;
    }
    if (cancel || !p.active || ['fire', 'boost'].includes(p.control.id)) return;
    if (p.control.id === 'missile' || p.control.id === 'scan') this.pending[p.control.id] = true;
    else this.action(p.control.id);
  }
  touchStart(e: EventTouch) {
    this.touchedAt = Date.now();
    const p = e.getUILocation();
    this.begin(e.getID(), p.x, this.ui.height - p.y);
  }
  touchMove(e: EventTouch) {
    const p = e.getUILocation();
    this.move(e.getID(), p.x, this.ui.height - p.y);
  }
  touchEnd(e: EventTouch) {
    this.touchedAt = Date.now();
    const p = e.getUILocation();
    this.move(e.getID(), p.x, this.ui.height - p.y);
    this.end(e.getID());
  }
  touchCancel(e: EventTouch) {
    this.touchedAt = Date.now();
    this.end(e.getID(), true);
  }
  mouseDown(e: EventMouse) {
    if (e.getButton() !== 0 || Date.now() - this.touchedAt < 800) return;
    const p = e.getUILocation();
    this.begin(-1, p.x, this.ui.height - p.y);
  }
  mouseMove(e: EventMouse) {
    const p = e.getUILocation();
    this.move(-1, p.x, this.ui.height - p.y);
  }
  mouseUp(e: EventMouse) {
    const p = e.getUILocation();
    this.move(-1, p.x, this.ui.height - p.y);
    this.end(-1);
  }
  keyDown(e: EventKeyboard) {
    if (this.keys.has(e.keyCode)) return;
    this.keys.add(e.keyCode);
    if (e.keyCode === KeyCode.ESCAPE || e.keyCode === KeyCode.KEY_P) {
      this.action('pause');
      return;
    }
    if (!this.playing()) return;
    if (e.keyCode === KeyCode.KEY_E) this.pending.missile = true;
    if (e.keyCode === KeyCode.KEY_Q) this.pending.scan = true;
  }
  keyUp(e: EventKeyboard) {
    this.keys.delete(e.keyCode);
  }
  read(sensitivity: number): Controls {
    if (!this.playing()) return neutral();
    const has = (...codes: number[]) => codes.some((c) => this.keys.has(c));
    const held = (id: string) =>
      Array.from(this.pointers.values()).some((p) => p.control.id === id && p.active);
    const value = {
      x: clamp(
        (this.ui.stick.x +
          Number(has(KeyCode.KEY_D, KeyCode.ARROW_RIGHT)) -
          Number(has(KeyCode.KEY_A, KeyCode.ARROW_LEFT))) *
          sensitivity,
        -1,
        1,
      ),
      y: clamp(
        (this.ui.stick.y +
          Number(has(KeyCode.KEY_W, KeyCode.ARROW_UP)) -
          Number(has(KeyCode.KEY_S, KeyCode.ARROW_DOWN))) *
          sensitivity,
        -1,
        1,
      ),
      fire: held('fire') || has(KeyCode.SPACE),
      boost: held('boost') || has(KeyCode.SHIFT_LEFT, KeyCode.SHIFT_RIGHT),
      ...this.pending,
    };
    this.pending = { missile: false, scan: false };
    return value;
  }
  clear() {
    this.pointers.clear();
    this.keys.clear();
    this.pending = { missile: false, scan: false };
    this.ui.pressed.clear();
    this.ui.stick = { x: 0, y: 0 };
  }
  dispose() {
    this.clear();
    input.off(Input.EventType.TOUCH_START, this.touchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.touchCancel, this);
    input.off(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
    input.off(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
    input.off(Input.EventType.MOUSE_UP, this.mouseUp, this);
    input.off(Input.EventType.KEY_DOWN, this.keyDown, this);
    input.off(Input.EventType.KEY_UP, this.keyUp, this);
  }
}
