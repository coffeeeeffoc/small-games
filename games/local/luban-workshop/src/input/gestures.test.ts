import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type { Axis } from '../core/types.ts';
import { bindGestures } from './gestures.ts';

class Stage extends EventTarget {
  handle: { dataset: { axis: Axis; axisStep: string } } | null = null;
  captures = new Set<number>();
  closest() {
    return this.handle;
  }
  setPointerCapture(id: number) {
    this.captures.add(id);
  }
  hasPointerCapture(id: number) {
    return this.captures.has(id);
  }
  releasePointerCapture(id: number) {
    this.captures.delete(id);
    this.pointer('lostpointercapture', 0, 0, { pointerId: id });
  }
  pointer(type: string, x: number, y: number, extra: Record<string, unknown> = {}) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      shiftKey: false,
      ...extra,
    });
    this.dispatchEvent(event);
  }
}

function fixture(t: TestContext) {
  const previous = new Map(
    ['window', 'document', 'Element'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const canvas = new Stage();
  const windowTarget = new EventTarget();
  const documentTarget = Object.assign(new EventTarget(), { hidden: false });
  Object.defineProperties(globalThis, {
    window: { value: windowTarget, configurable: true },
    document: { value: documentTarget, configurable: true },
    Element: { value: Stage, configurable: true },
  });
  const axes = {
    x: { x: -1, y: 0, pixelsPerUnit: 24 },
    y: { x: 0, y: -1, pixelsPerUnit: 24 },
    z: { x: Math.SQRT1_2, y: Math.SQRT1_2, pixelsPerUnit: 24 },
  };
  const calls = {
    selected: [] as unknown[][],
    tapped: [] as (string | null)[],
    begun: [] as unknown[][],
    moved: [] as number[],
    nudged: [] as unknown[][],
    ended: 0,
    cancelled: 0,
    edgeOn: 0,
    orbit: 0,
    zoom: 0,
    orbitDeltas: [] as number[][],
  };
  let picked: string | null = 'a';
  let result: { actualOffset: number; blocked: boolean } | undefined;
  const dispose = bindGestures(
    {
      canvas: canvas as unknown as HTMLElement,
      pick: () => picked,
      axisScreen: (_id, axis = 'x') => axes[axis],
      orbit: (dx, dy) => {
        calls.orbit++;
        calls.orbitDeltas.push([dx, dy]);
      },
      zoom: () => {
        calls.zoom++;
      },
    },
    {
      select: (...args) => {
        calls.selected.push(args);
      },
      tap: (id) => {
        calls.tapped.push(id);
      },
      begin: (...args) => {
        calls.begun.push(args);
        return 2;
      },
      move: (target) => {
        calls.moved.push(target);
        return result ?? { actualOffset: target, blocked: false };
      },
      end: () => {
        calls.ended++;
      },
      cancel: () => {
        calls.cancelled++;
      },
      cameraChanged: () => {},
      edgeOn: () => {
        calls.edgeOn++;
      },
      nudge: (...args) => {
        calls.nudged.push(args);
      },
    },
  );
  t.after(() => {
    dispose();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  return {
    canvas,
    calls,
    axes,
    windowTarget,
    documentTarget,
    dispose,
    setPicked: (id: string | null) => {
      picked = id;
    },
    setResult: (value: typeof result) => {
      result = value;
    },
  };
}

test('a piece tap changes selection only on release without opening a movement transaction', (t) => {
  const { canvas, calls } = fixture(t);
  canvas.pointer('pointerdown', 0, 0, { shiftKey: true });
  canvas.pointer('pointermove', 3, 2);
  assert.deepEqual(calls.selected, []);
  assert.deepEqual(calls.tapped, []);
  canvas.pointer('pointerup', 3, 2);
  assert.deepEqual(calls.selected, []);
  assert.deepEqual(calls.tapped, ['a']);
  assert.equal(calls.begun.length, 0);
  assert.equal(calls.moved.length, 0);
  assert.equal(calls.ended, 0);
  assert.equal(canvas.captures.size, 0);
});

test('each repeated tap is delivered so the same piece can be deselected', (t) => {
  const { canvas, calls } = fixture(t);
  for (let i = 0; i < 2; i++) {
    canvas.pointer('pointerdown', 0, 0);
    canvas.pointer('pointerup', 0, 0);
  }
  assert.deepEqual(calls.tapped, ['a', 'a']);
  assert.deepEqual(calls.selected, []);
});

test('a background tap clears selection without orbiting on finger jitter', (t) => {
  const { canvas, calls, setPicked } = fixture(t);
  setPicked(null);
  canvas.pointer('pointerdown', 0, 0);
  canvas.pointer('pointermove', 3, 2);
  assert.equal(calls.orbit, 0);
  canvas.pointer('pointerup', 3, 2);
  assert.deepEqual(calls.tapped, [null]);
  assert.equal(calls.orbit, 0);
});

test('background movement crosses the drag threshold before orbiting and never taps', (t) => {
  const { canvas, calls, setPicked } = fixture(t);
  setPicked(null);
  canvas.pointer('pointerdown', 10, 10);
  canvas.pointer('pointermove', 13, 12);
  assert.equal(calls.orbit, 0);
  canvas.pointer('pointermove', 18, 10);
  canvas.pointer('pointermove', 10, 10);
  canvas.pointer('pointerup', 10, 10);
  assert.deepEqual(calls.orbitDeltas, [
    [8, 0],
    [-8, 0],
  ]);
  assert.deepEqual(calls.tapped, []);
  assert.deepEqual(calls.selected, []);
});

for (const picked of ['a', null]) {
  test(`a release beyond the threshold without pointermove does not tap ${picked ?? 'background'}`, (t) => {
    const { canvas, calls, setPicked } = fixture(t);
    setPicked(picked);
    canvas.pointer('pointerdown', 0, 0);
    canvas.pointer('pointerup', 7, 0);
    assert.deepEqual(calls.tapped, []);
    assert.deepEqual(calls.selected, []);
    assert.deepEqual(calls.begun, []);
    assert.equal(calls.orbit, 0);
  });
}

test('body drag follows the signed screen direction and locks its chosen axis', (t) => {
  const { canvas, calls } = fixture(t);
  canvas.pointer('pointerdown', 10, 10, { shiftKey: true });
  assert.deepEqual(calls.selected, []);
  canvas.pointer('pointermove', -14, 10);
  canvas.pointer('pointermove', -38, -200);
  canvas.pointer('pointerup', -38, -200);
  assert.deepEqual(calls.begun, [['a', 'x']]);
  assert.deepEqual(calls.selected, [['a', true]]);
  assert.deepEqual(calls.tapped, []);
  assert.deepEqual(calls.moved, [3, 4]);
  assert.equal(calls.ended, 1);
});

test('body drags can select vertical and lateral axes', (t) => {
  const { canvas, calls } = fixture(t);
  canvas.pointer('pointerdown', 0, 0);
  canvas.pointer('pointermove', 0, -24);
  canvas.pointer('pointerup', 0, -24);
  canvas.pointer('pointerdown', 0, 0);
  canvas.pointer('pointermove', 24, 24);
  canvas.pointer('pointerup', 24, 24);
  assert.deepEqual(calls.begun, [
    ['a', 'y'],
    ['a', 'z'],
  ]);
  assert.equal(calls.moved[0], 3);
  assert.ok(Math.abs(calls.moved[1] - (2 + Math.SQRT2)) < 1e-8);
});

test('an end-on projection is excluded from automatic axis choice', (t) => {
  const { canvas, calls, axes } = fixture(t);
  axes.x.pixelsPerUnit = 2;
  canvas.pointer('pointerdown', 0, 0);
  canvas.pointer('pointermove', -24, 0);
  canvas.pointer('pointerup', -24, 0);
  assert.deepEqual(calls.begun, [['a', 'z']]);
});

test('a handle tap nudges its axis, while a handle drag keeps the explicit axis', (t) => {
  const { canvas, calls } = fixture(t);
  canvas.handle = { dataset: { axis: 'y', axisStep: '-1' } };
  canvas.pointer('pointerdown', 0, 0);
  canvas.pointer('pointerup', 0, 0);
  assert.deepEqual(calls.nudged, [[-1, 'y']]);
  assert.equal(calls.begun.length, 0);
  canvas.pointer('pointerdown', 0, 0);
  canvas.pointer('pointermove', 24, -12);
  canvas.pointer('pointerup', 24, -12);
  assert.deepEqual(calls.begun, [['a', 'y']]);
  assert.deepEqual(calls.moved, [2.5]);
  assert.equal(calls.nudged.length, 1);
  assert.deepEqual(calls.tapped, []);
  assert.deepEqual(calls.selected, [['a', false]]);
});

test('a handle release beyond the threshold without pointermove cannot nudge or tap', (t) => {
  const { canvas, calls } = fixture(t);
  canvas.handle = { dataset: { axis: 'x', axisStep: '1' } };
  canvas.pointer('pointerdown', 0, 0);
  canvas.pointer('pointerup', 7, 0);
  assert.deepEqual(calls.nudged, []);
  assert.deepEqual(calls.tapped, []);
  assert.deepEqual(calls.selected, []);
});

test('an end-on handle drag explains the angle without nudging or starting a transaction', (t) => {
  const { canvas, calls, axes } = fixture(t);
  axes.x.pixelsPerUnit = 2;
  canvas.handle = { dataset: { axis: 'x', axisStep: '1' } };
  canvas.pointer('pointerdown', 0, 0);
  canvas.pointer('pointermove', 24, 0);
  canvas.pointer('pointermove', 48, 0);
  canvas.pointer('pointerup', 48, 0);
  assert.equal(calls.edgeOn, 1);
  assert.equal(calls.begun.length, 0);
  assert.equal(calls.nudged.length, 0);
  assert.deepEqual(calls.tapped, []);
  assert.deepEqual(calls.selected, []);
});

test('reversing after collision immediately moves away from the blocked position', (t) => {
  const { canvas, calls, setResult } = fixture(t);
  canvas.pointer('pointerdown', 0, 0);
  setResult({ actualOffset: 2.5, blocked: true });
  canvas.pointer('pointermove', -48, 0);
  setResult(undefined);
  canvas.pointer('pointermove', -42, 0);
  canvas.pointer('pointerup', -42, 0);
  assert.deepEqual(calls.moved, [4, 2.25]);
});

test('a second touch cancels part movement and owns the camera until all touches end', (t) => {
  const { canvas, calls } = fixture(t);
  canvas.pointer('pointerdown', 0, 0, { pointerType: 'touch' });
  canvas.pointer('pointermove', -24, 0, { pointerType: 'touch' });
  canvas.pointer('pointerdown', 24, 0, { pointerId: 2, pointerType: 'touch' });
  canvas.pointer('pointermove', 48, 0, { pointerId: 2, pointerType: 'touch' });
  canvas.pointer('pointerup', 48, 0, { pointerId: 2, pointerType: 'touch' });
  canvas.pointer('pointermove', -48, 0, { pointerType: 'touch' });
  canvas.pointer('pointerup', -48, 0, { pointerType: 'touch' });
  assert.equal(calls.cancelled, 1);
  assert.equal(calls.ended, 0);
  assert.equal(calls.moved.length, 1);
  assert.equal(calls.orbit, 1);
  assert.equal(calls.zoom, 1);
  assert.deepEqual(calls.tapped, []);
  assert.equal(canvas.captures.size, 0);
});

test('two fingers cannot select a piece or clear selection even if neither finger moves', (t) => {
  const { canvas, calls } = fixture(t);
  canvas.pointer('pointerdown', 0, 0, { pointerType: 'touch' });
  canvas.pointer('pointerdown', 24, 0, { pointerId: 2, pointerType: 'touch' });
  canvas.pointer('pointerup', 24, 0, { pointerId: 2, pointerType: 'touch' });
  canvas.pointer('pointerup', 0, 0, { pointerType: 'touch' });
  assert.deepEqual(calls.selected, []);
  assert.deepEqual(calls.tapped, []);
  assert.deepEqual(calls.begun, []);
  assert.equal(calls.cancelled, 0);
});

test('returning to the press position after a piece drag does not toggle selection', (t) => {
  const { canvas, calls } = fixture(t);
  canvas.pointer('pointerdown', 0, 0);
  canvas.pointer('pointermove', -24, 0);
  canvas.pointer('pointermove', 0, 0);
  canvas.pointer('pointerup', 0, 0);
  assert.deepEqual(calls.tapped, []);
  assert.equal(calls.ended, 1);
  assert.equal(calls.cancelled, 0);
  assert.equal(canvas.captures.size, 0);
});

for (const reason of ['pointercancel', 'lostpointercapture', 'wheel', 'blur', 'hidden']) {
  test(`${reason} cancels movement without committing it`, (t) => {
    const { canvas, calls, windowTarget, documentTarget } = fixture(t);
    canvas.pointer('pointerdown', 0, 0);
    canvas.pointer('pointermove', -24, 0);
    if (reason === 'blur') windowTarget.dispatchEvent(new Event('blur'));
    else if (reason === 'hidden') {
      documentTarget.hidden = true;
      documentTarget.dispatchEvent(new Event('visibilitychange'));
    } else if (reason === 'wheel')
      canvas.dispatchEvent(Object.assign(new Event('wheel', { cancelable: true }), { deltaY: 20 }));
    else canvas.pointer(reason, -24, 0);
    canvas.pointer('pointerup', -24, 0);
    assert.equal(calls.cancelled, 1);
    assert.equal(calls.ended, 0);
    assert.deepEqual(calls.tapped, []);
    assert.equal(canvas.captures.size, 0);
  });
}

for (const reason of [
  'pointercancel',
  'lostpointercapture',
  'wheel',
  'blur',
  'hidden',
  'dispose',
]) {
  for (const picked of ['a', null]) {
    test(`${reason} prevents a pending ${picked ?? 'background'} tap`, (t) => {
      const { canvas, calls, windowTarget, documentTarget, setPicked, dispose } = fixture(t);
      setPicked(picked);
      canvas.pointer('pointerdown', 0, 0);
      if (reason === 'blur') windowTarget.dispatchEvent(new Event('blur'));
      else if (reason === 'hidden') {
        documentTarget.hidden = true;
        documentTarget.dispatchEvent(new Event('visibilitychange'));
      } else if (reason === 'wheel')
        canvas.dispatchEvent(
          Object.assign(new Event('wheel', { cancelable: true }), { deltaY: 20 }),
        );
      else if (reason === 'dispose') dispose();
      else canvas.pointer(reason, 0, 0);
      canvas.pointer('pointerup', 0, 0);
      assert.deepEqual(calls.tapped, []);
      assert.deepEqual(calls.selected, []);
      assert.equal(calls.cancelled, 0);
      assert.equal(calls.ended, 0);
      assert.equal(canvas.captures.size, 0);
    });
  }
}
