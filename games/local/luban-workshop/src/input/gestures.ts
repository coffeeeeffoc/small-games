import type { Axis } from '../core/types.ts';

export interface GestureView {
  canvas: HTMLElement;
  pick(x: number, y: number): string | null;
  axisScreen(id: string, axis?: Axis): { x: number; y: number; pixelsPerUnit: number };
  orbit(dx: number, dy: number): void;
  zoom(factor: number): void;
}
export interface GestureActions {
  select(id: string, additive?: boolean): void;
  begin(id: string, axis?: Axis): number;
  move(target: number): { actualOffset: number; blocked: boolean } | undefined;
  end(): void;
  cancel(): void;
  cameraChanged(): void;
  edgeOn(): void;
  nudge(direction: number, axis?: Axis): void;
}

const AXES: readonly Axis[] = ['x', 'y', 'z'];
const MIN_AXIS_PROJECTION = 12;
const DRAG_THRESHOLD = 7;

/** One owner per gesture: part drag, background orbit, or two-finger camera. */
export function bindGestures(view: GestureView, actions: GestureActions): () => void {
  const canvas = view.canvas;
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: {
    id: string;
    x: number;
    y: number;
    offset: number;
    axis: ReturnType<GestureView['axisScreen']> | null;
    explicitAxis?: Axis;
    started: boolean;
    moved: boolean;
    edgeOnShown: boolean;
    handleDirection: number;
  } | null = null;
  let pinching = false;
  let pinchDistance = 0;
  let pinchCenter = { x: 0, y: 0 };
  const releasePointers = () => {
    const ids = [...pointers.keys()];
    // Clear first: releasing capture can synchronously emit lostpointercapture.
    pointers.clear();
    for (const id of ids) {
      try {
        if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      } catch {
        // The pointer may already have ended or the stage may have detached.
      }
    }
  };
  const pinch = () => {
    const [a, b] = [...pointers.values()];
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0 && event.pointerType !== 'touch') return;
      event.preventDefault();
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Some touch environments lose capture during a DOM update.
      }
      if (pointers.size > 1) {
        if (drag?.started) actions.cancel();
        drag = null;
        pinching = true;
        const p = pinch();
        pinchDistance = p.distance;
        pinchCenter = p.center;
        return;
      }
      const id = view.pick(event.clientX, event.clientY);
      if (id) {
        const handle =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>('[data-axis-step]')
            : null;
        const handleAxis = handle?.dataset.axis;
        actions.select(id, event.shiftKey);
        drag = {
          id,
          x: event.clientX,
          y: event.clientY,
          offset: 0,
          axis: null,
          explicitAxis: AXES.includes(handleAxis as Axis) ? (handleAxis as Axis) : undefined,
          started: false,
          moved: false,
          edgeOnShown: false,
          handleDirection: Number(handle?.dataset.axisStep ?? 0),
        };
      }
    },
    options,
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      event.preventDefault();
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinching) {
        if (pointers.size >= 2) {
          const p = pinch();
          if (p.distance > 5 && pinchDistance > 5) view.zoom(pinchDistance / p.distance);
          view.orbit(p.center.x - pinchCenter.x, p.center.y - pinchCenter.y);
          pinchDistance = p.distance;
          pinchCenter = p.center;
          actions.cameraChanged();
        }
        return;
      }
      if (drag) {
        const dx = event.clientX - drag.x,
          dy = event.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        drag.moved = true;
        if (!drag.axis) {
          // Keep the projection's current sign so the piece follows the pointer
          // even when orbiting has reversed an axis on screen.
          const candidates = (drag.explicitAxis ? [drag.explicitAxis] : AXES)
            .map((axis) => ({ axis, screen: view.axisScreen(drag!.id, axis) }))
            .filter(({ screen }) => screen.pixelsPerUnit >= MIN_AXIS_PROJECTION)
            .sort(
              (a, b) =>
                Math.abs(dx * b.screen.x + dy * b.screen.y) -
                Math.abs(dx * a.screen.x + dy * a.screen.y),
            );
          const choice = candidates[0];
          if (!choice) {
            if (!drag.edgeOnShown) actions.edgeOn();
            drag.edgeOnShown = true;
            return;
          }
          drag.axis = choice.screen;
          drag.offset = actions.begin(drag.id, choice.axis);
          drag.started = true;
        }
        const result = actions.move(
          drag.offset + (dx * drag.axis.x + dy * drag.axis.y) / drag.axis.pixelsPerUnit,
        );
        // Consume blocked overshoot so reversing the finger moves immediately.
        if (result?.blocked) {
          drag.x = event.clientX;
          drag.y = event.clientY;
          drag.offset = result.actualOffset;
        }
      } else {
        view.orbit(event.clientX - previous.x, event.clientY - previous.y);
        actions.cameraChanged();
      }
    },
    options,
  );
  const finish = (event: PointerEvent, cancelled: boolean) => {
    if (!pointers.has(event.pointerId)) return;
    if (drag) {
      const tapDirection = drag.moved ? 0 : drag.handleDirection;
      if (cancelled) {
        if (drag.started) actions.cancel();
      } else {
        if (drag.started) actions.end();
        if (tapDirection) actions.nudge(tapDirection, drag.explicitAxis);
      }
      drag = null;
    }
    pointers.delete(event.pointerId);
    if (pointers.size === 0) pinching = false;
  };
  canvas.addEventListener('pointerup', (e) => finish(e, false), options);
  canvas.addEventListener('pointercancel', (e) => finish(e, true), options);
  canvas.addEventListener('lostpointercapture', (e) => finish(e, true), options);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (drag) {
        if (drag.started) actions.cancel();
        drag = null;
        releasePointers();
        pinching = false;
      }
      view.zoom(Math.exp(Math.max(-100, Math.min(100, e.deltaY)) * 0.002));
      actions.cameraChanged();
    },
    { ...options, passive: false },
  );
  canvas.addEventListener('contextmenu', (e) => e.preventDefault(), options);
  const cancel = () => {
    if (drag?.started) actions.cancel();
    drag = null;
    releasePointers();
    pinching = false;
  };
  window.addEventListener('blur', cancel, options);
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) cancel();
    },
    options,
  );
  return () => {
    cancel();
    controller.abort();
  };
}
