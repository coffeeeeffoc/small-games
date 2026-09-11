import type { CanvasPointerEvent } from '@coffeeeeffoc/canvas-game-adapter';
import { action, cancelTrialInput, interact, playing, type Trial } from '../domain/trial.js';
import { camera, getButtons, type TrialUi } from '../view/ui.js';
import { direction, distance, type Point } from '../domain/world.js';
export function createTrialInput(state: () => Trial, ui: TrialUi, command: (id: string) => void) {
  const pointers = new Map<number, { role: string; start: Point; world: boolean }>();
  const keys = new Set<string>();
  let destination: Point | null = null;
  function cancel() {
    pointers.clear();
    keys.clear();
    destination = null;
    cancelTrialInput(state());
  }
  function aim(x: number, y: number) {
    const offset = camera(state());
    state().aim = { x: x + offset.x, y: y - 110 + offset.y };
  }
  function pointer(p: CanvasPointerEvent) {
    if (![p.x, p.y, p.pointerId].every(Number.isFinite)) return;
    const s = state();
    if (p.phase === 'down') {
      const button = getButtons(s, ui).find(
        (b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h,
      );
      if (button?.disabled) return;
      if (button && button.id !== 'sword' && button.id !== 'interact') {
        pointers.set(p.pointerId, { role: button.id, start: p, world: false });
        return;
      }
      if (!playing(s) || ui.paused || ui.hostPaused) return;
      const role =
        button?.id ?? (p.x < 154 && p.y > 646 ? 'move' : p.y > 110 && p.y < 617 ? 'sword' : 'none');
      if (role === 'none' || [...pointers.values()].some((v) => v.role === role)) return;
      pointers.set(p.pointerId, { role, start: p, world: !button && role === 'sword' });
      if (role === 'sword') {
        s.aim = null;
        if (!button) aim(p.x, p.y);
        action(s, 'charge');
      }
      if (role === 'interact') interact(s, true);
      if (role === 'move') {
        destination = null;
        movePointer(p.x, p.y);
      }
    } else {
      const held = pointers.get(p.pointerId);
      if (!held) return;
      if (p.phase === 'move') {
        if (held.role === 'move') movePointer(p.x, p.y);
        if (held.role === 'sword') {
          if (held.world) aim(p.x, p.y);
          else if (distance(held.start, p) > 9)
            s.aim = {
              x: s.player.x + (p.x - held.start.x) * 8,
              y: s.player.y + (p.y - held.start.y) * 8,
            };
        }
        return;
      }
      pointers.delete(p.pointerId);
      if (held.role === 'move') s.move = { x: 0, y: 0 };
      else if (held.role === 'sword') {
        if (p.phase === 'up') action(s, 'release');
        else s.charge = null;
      } else if (held.role === 'interact') {
        if (p.phase === 'up') interact(s, false);
        else s.breathing = null;
      } else if (p.phase === 'up') {
        const button = getButtons(s, ui).find(
          (b) =>
            b.id === held.role && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h,
        );
        if (button && !button.disabled) command(held.role);
      }
    }
  }
  function movePointer(x: number, y: number) {
    const dx = (x - 84) / 42,
      dy = (y - 719) / 42,
      len = Math.max(1, Math.hypot(dx, dy));
    state().move = { x: dx / len, y: dy / len };
  }
  function keyboard(code: string, down: boolean) {
    const controls = [
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'ArrowUp',
      'ArrowLeft',
      'ArrowDown',
      'ArrowRight',
      'Space',
      'KeyE',
      'ShiftLeft',
      'ShiftRight',
      'KeyQ',
      'KeyR',
      'Escape',
    ];
    if (!controls.includes(code)) return false;
    if (!down) {
      keys.delete(code);
      if (code === 'Space') action(state(), 'release');
      if (code === 'KeyE') interact(state(), false);
    } else {
      if (keys.has(code)) return true;
      keys.add(code);
      if (code === 'Escape') {
        command('pause');
        return true;
      }
      if (ui.paused || ui.hostPaused || !playing(state())) return true;
      if (code === 'Space') {
        state().aim = null;
        action(state(), 'charge');
      }
      if (code === 'KeyE') interact(state(), true);
      if (code.startsWith('Shift')) action(state(), 'dodge');
      if (code === 'KeyQ') action(state(), 'shield');
      if (code === 'KeyR') action(state(), 'wood');
    }
    if (!ui.paused && !ui.hostPaused) {
      state().move = {
        x:
          Number(keys.has('KeyD') || keys.has('ArrowRight')) -
          Number(keys.has('KeyA') || keys.has('ArrowLeft')),
        y:
          Number(keys.has('KeyS') || keys.has('ArrowDown')) -
          Number(keys.has('KeyW') || keys.has('ArrowUp')),
      };
    }
    return true;
  }
  return {
    pointer,
    keyboard,
    cancel,
    tap(x: number, y: number) {
      const button = getButtons(state(), ui).find(
        (b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h,
      );
      if (button && !button.disabled) {
        if (button.id === 'sword') {
          action(state(), 'charge');
          action(state(), 'release');
        } else if (button.id === 'interact') interact(state(), state().breathing === null);
        else command(button.id);
      } else if (playing(state()) && !ui.paused && y > 110 && y < 615) {
        const offset = camera(state());
        destination = { x: x + offset.x, y: y - 110 + offset.y };
      }
    },
    update() {
      if (destination) {
        const s = state();
        s.move =
          distance(s.player, destination) < 8 ? { x: 0, y: 0 } : direction(s.player, destination);
        if (distance(s.player, destination) < 8) destination = null;
      }
    },
  };
}
