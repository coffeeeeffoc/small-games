import type { PointerEvent } from 'react';
import type { Runtime } from '../game/runtime/runtime.ts';

export function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx=".6" fill="currentColor" />
      <rect x="14" y="4" width="4" height="16" rx=".6" fill="currentColor" />
    </svg>
  );
}
export function TouchControls({
  runtime,
  dragOnly = false,
}: {
  runtime: Runtime;
  dragOnly?: boolean;
}) {
  const input = runtime.input;
  function down(e: PointerEvent<HTMLDivElement>, type: 'move' | 'look') {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    input.pointerDown(e.pointerId, e.clientX, e.clientY, type);
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    input.pointerMove(e.pointerId, e.clientX, e.clientY);
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    input.pointerEnd(e.pointerId);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return (
    <div className="touch-layer">
      <div
        className="look-zone"
        data-testid="look-zone"
        aria-label="拖动转向区域"
        onPointerDown={(e) => down(e, 'look')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
      >
        <span>拖动转向</span>
      </div>
      {!dragOnly && (
        <div
          className="joystick"
          data-testid="joystick"
          aria-label="移动摇杆"
          onPointerDown={(e) => down(e, 'move')}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onLostPointerCapture={end}
        >
          <div
            className="stick"
            style={{
              transform: `translate(${input.stick.right * 30}px,${-input.stick.forward * 30}px)`,
            }}
          />
          <span>移动</span>
        </div>
      )}
    </div>
  );
}
