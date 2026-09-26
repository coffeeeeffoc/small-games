import { Simulation } from './simulation';
export class Input {
  pointer: number | null = null;
  origin = { x: 0, y: 0 };
  keys = new Set<string>();
  constructor(public s: Simulation, public unlock: () => void, public onPause: (forced?: boolean) => void, public onDebug: () => void, public onReset: () => void) {
    window.addEventListener('keydown', e => this.down(e));
    window.addEventListener('keyup', e => this.up(e));
    window.addEventListener('blur', () => { this.clear(); this.onPause(true); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clear(); this.onPause(true); } });
    const power = document.querySelector<HTMLButtonElement>('#power')!;
    power.addEventListener('pointerdown', e => {
      if (e.button !== 0 || this.pointer !== null) return;
      e.preventDefault(); this.unlock(); this.pointer = e.pointerId; this.origin = { x: e.clientX, y: e.clientY };
      power.setPointerCapture(e.pointerId); this.s.begin(`pointer-${e.pointerId}`);
    });
    power.addEventListener('pointermove', e => {
      if (e.pointerId !== this.pointer) return;
      const d = { x: e.clientX - this.origin.x, y: e.clientY - this.origin.y };
      // Camera has uniform positive zoom, so inverse screen-vector is the same direction.
      if (Math.hypot(d.x, d.y) > 12) this.s.setAim(d);
    });
    power.addEventListener('pointerup', e => {
      if (e.pointerId !== this.pointer) return;
      this.pointer = null; this.s.releaseCharge(`pointer-${e.pointerId}`);
      if (power.hasPointerCapture(e.pointerId)) power.releasePointerCapture(e.pointerId);
    });
    for (const event of ['pointercancel', 'lostpointercapture']) power.addEventListener(event, e => {
      if ((e as PointerEvent).pointerId === this.pointer) { this.pointer = null; this.s.cancel('操作已取消'); }
    });
    for (const direction of [-1, 1]) {
      const button = document.querySelector<HTMLButtonElement>(direction < 0 ? '#left' : '#right')!;
      button.addEventListener('pointerdown', e => { e.preventDefault(); this.unlock(); button.setPointerCapture(e.pointerId); this.s.movement(direction, `walk-${e.pointerId}`); });
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, e => this.s.movement(0, `walk-${(e as PointerEvent).pointerId}`));
    }
  }
  clear() { this.pointer = null; this.keys.clear(); this.s.cancel(); this.s.move = null; }
  down(e: KeyboardEvent) {
    const code = e.code;
    if (!this.s.paused && ['Space', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(code)) e.preventDefault();
    if (e.repeat || this.keys.has(code)) return;
    this.keys.add(code); this.unlock();
    if (code === 'Escape' || code === 'KeyP') { this.clear(); this.onPause(); return; }
    if (code === 'F2' && import.meta.env.DEV) { e.preventDefault(); this.onDebug(); return; }
    if (code === 'KeyR' && (!this.s.paused || this.s.status !== 'playing')) { this.clear(); this.onReset(); return; }
    if (this.s.paused) return;
    if (code.startsWith('Digit') && +code.slice(-1) >= 1 && +code.slice(-1) <= 3) this.s.select(+code.slice(-1) - 1);
    if (code === 'Tab') this.s.select((this.s.selected + (e.shiftKey ? 2 : 1)) % 3);
    if (code === 'KeyQ') this.s.releaseHand(0);
    if (code === 'KeyE') this.s.releaseHand(1);
    if (['KeyA', 'ArrowLeft'].includes(code)) this.s.movement(-1, code);
    if (['KeyD', 'ArrowRight'].includes(code)) this.s.movement(1, code);
    if (code === 'Space') this.s.begin('keyboard');
  }
  up(e: KeyboardEvent) {
    this.keys.delete(e.code);
    if (e.code === 'Space') { if (!this.s.paused) e.preventDefault(); this.s.releaseCharge('keyboard'); }
    this.s.movement(0, e.code);
  }
}
