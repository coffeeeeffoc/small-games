export class Input {
  keys = new Set<string>();
  stick = { forward: 0, right: 0 };
  movePointer: number | null = null;
  lookPointer: number | null = null;
  private origin = { x: 0, y: 0 };
  private previous = { x: 0, y: 0 };
  private abort = new AbortController();
  private active: () => boolean;
  private look: (x: number, y: number) => void;
  constructor(
    canvas: HTMLCanvasElement,
    active: () => boolean,
    look: (x: number, y: number) => void,
    command: (key: string) => void,
    pause: () => void,
  ) {
    this.active = active;
    this.look = look;
    const options = { signal: this.abort.signal };
    window.addEventListener(
      'keydown',
      (e) => {
        if (
          [
            'KeyW',
            'KeyA',
            'KeyS',
            'KeyD',
            'ArrowUp',
            'ArrowDown',
            'ArrowLeft',
            'ArrowRight',
            'KeyQ',
            'KeyH',
            'KeyM',
            'KeyE',
            'Escape',
          ].includes(e.code)
        ) {
          if ((e.target as HTMLElement)?.matches('input,select,textarea')) return;
          e.preventDefault();
          if (!e.repeat) command(e.code);
          if (this.active()) this.keys.add(e.code);
        }
      },
      options,
    );
    window.addEventListener('keyup', (e) => this.keys.delete(e.code), options);
    window.addEventListener(
      'blur',
      () => {
        this.clear();
        pause();
      },
      options,
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) {
          this.clear();
          pause();
        }
      },
      options,
    );
    document.addEventListener(
      'pointerlockchange',
      () => {
        if (document.pointerLockElement !== canvas) {
          this.clear();
          pause();
        }
      },
      options,
    );
    document.addEventListener(
      'mousemove',
      (e) => {
        if (this.active() && document.pointerLockElement === canvas)
          this.look(e.movementX, e.movementY);
      },
      options,
    );
  }
  axes() {
    return {
      forward:
        this.stick.forward +
        Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) -
        Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')),
      right:
        this.stick.right +
        Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) -
        Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft')),
    };
  }
  pointerDown(id: number, x: number, y: number, type: 'move' | 'look') {
    if (!this.active()) return;
    if (type === 'move' && this.movePointer === null) {
      this.movePointer = id;
      this.origin = { x, y };
    }
    if (type === 'look' && this.lookPointer === null) {
      this.lookPointer = id;
      this.previous = { x, y };
    }
  }
  pointerMove(id: number, x: number, y: number) {
    if (!this.active()) return;
    if (id === this.movePointer) {
      const dx = x - this.origin.x,
        dy = y - this.origin.y,
        scale = Math.max(42, Math.hypot(dx, dy));
      this.stick = { right: dx / scale, forward: -dy / scale };
    }
    if (id === this.lookPointer) {
      this.look(x - this.previous.x, y - this.previous.y);
      this.previous = { x, y };
    }
  }
  pointerEnd(id: number) {
    if (id === this.movePointer) {
      this.movePointer = null;
      this.stick = { forward: 0, right: 0 };
    }
    if (id === this.lookPointer) this.lookPointer = null;
  }
  clear() {
    this.keys.clear();
    this.movePointer = this.lookPointer = null;
    this.stick = { forward: 0, right: 0 };
  }
  dispose() {
    this.clear();
    this.abort.abort();
  }
}
