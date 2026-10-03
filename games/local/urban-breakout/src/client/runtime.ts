import { OLD_STREET } from '../content/levels.ts';
import { advanceClock, createGame, snapshot, step } from '../core/simulation.ts';
import { type GameState, type Input } from '../core/types.ts';
import { storage, type RecordEntry } from './platform.ts';
import { Sound } from './audio.ts';
import { StreetScene } from './scene.ts';
export class Runtime {
  state = createGame(OLD_STREET);
  scene: StreetScene;
  sound = new Sound();
  started = false;
  paused = false;
  disposed = false;
  shake = storage.read('shake', !matchMedia('(prefers-reduced-motion: reduce)').matches);
  input: Input = {};
  clock = { accumulator: 0 };
  frameId = 0;
  last = 0;
  lastHud = 0;
  abort = new AbortController();
  keys = new Set<string>();
  frames: number[] = [];
  peakEnemies = 0;
  pointer: { id: number; startX: number; squadX: number } | null = null;
  constructor(
    container: HTMLElement,
    zone: HTMLElement,
    public notify: () => void,
  ) {
    this.scene = new StreetScene(container);
    const options = { signal: this.abort.signal };
    window.addEventListener(
      'keydown',
      (e) => {
        const editing =
          e.target instanceof HTMLElement &&
          (e.target.matches('input, textarea, select') || e.target.isContentEditable);
        if (editing && e.code !== 'Escape') return;
        if (e.target instanceof HTMLButtonElement && e.code === 'Space') return;
        if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyF', 'Escape'].includes(e.code))
          e.preventDefault();
        if (e.code === 'Escape' && !e.repeat && this.started && this.state.phase === 'playing')
          this.pause(!this.paused);
        if (this.paused || !this.started) return;
        this.keys.add(e.code);
        this.input.targetX = undefined;
        if (e.code === 'Space' && !e.repeat) this.input.skill = true;
        if (e.code === 'KeyF' && !e.repeat) this.input.formation = true;
      },
      options,
    );
    window.addEventListener('keyup', (e) => this.keys.delete(e.code), options);
    const release = () => {
      this.pointer = null;
      this.input.targetX = undefined;
      this.input.moveX = 0;
      this.keys.clear();
      zone.dataset.dragging = 'false';
    };
    zone.addEventListener(
      'pointerdown',
      (e) => {
        if (this.paused || !this.started || this.state.phase !== 'playing' || this.pointer) return;
        e.preventDefault();
        this.sound.unlock();
        zone.setPointerCapture(e.pointerId);
        this.pointer = { id: e.pointerId, startX: e.clientX, squadX: this.state.x };
        zone.dataset.dragging = 'true';
      },
      options,
    );
    zone.addEventListener(
      'pointermove',
      (e) => {
        if (!this.pointer || e.pointerId !== this.pointer.id) return;
        this.input.targetX =
          this.pointer.squadX + ((e.clientX - this.pointer.startX) / zone.clientWidth) * 13.6;
      },
      options,
    );
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
      zone.addEventListener(event, release, options);
    window.addEventListener(
      'blur',
      () => {
        release();
        if (this.started) this.pause(true);
      },
      options,
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) {
          release();
          if (this.started) this.pause(true);
        }
        this.last = 0;
      },
      options,
    );
    window.addEventListener('pagehide', () => this.dispose(), options);
    this.frameId = requestAnimationFrame((now) => this.frame(now));
  }
  start() {
    this.state = createGame(OLD_STREET);
    this.sound.unlock();
    this.sound.setPlaying(true, true);
    this.sound.ui('start');
    this.started = true;
    this.paused = false;
    this.input = {};
    this.keys.clear();
    this.pointer = null;
    this.clock.accumulator = 0;
    this.last = 0;
    this.frames = [];
    this.peakEnemies = 0;
    this.notify();
  }
  pause(value: boolean) {
    this.paused = value;
    if (!value) this.sound.unlock();
    this.sound.setPlaying(!value && this.started && this.state.phase === 'playing');
    this.keys.clear();
    this.pointer = null;
    this.input = {};
    this.last = 0;
    this.notify();
  }
  menu() {
    this.sound.setPlaying(false);
    this.started = false;
    this.paused = false;
    this.keys.clear();
    this.input = {};
    this.state = createGame(OLD_STREET);
    this.notify();
  }
  frame(now: number) {
    if (this.disposed) return;
    const delta = this.last ? Math.max(0, (now - this.last) / 1000) : 0;
    this.last = now;
    if (this.started && !this.paused && this.state.phase === 'playing') {
      if (delta > 0 && this.frames.length < 12000) this.frames.push(delta * 1000);
      this.input.moveX =
        Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) -
        Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
      advanceClock(this.clock, delta, () => {
        const before = this.state.phase,
          focus = this.state.focus,
          formation = this.state.formation;
        step(this.state, this.input);
        if (focus !== this.state.focus) this.sound.ui('focus');
        if (formation !== this.state.formation) this.sound.ui('formation');
        this.input.skill = false;
        this.input.formation = false;
        this.sound.consume(this.state.effects);
        this.peakEnemies = Math.max(this.peakEnemies, this.state.enemies.length);
        if (before === 'playing' && this.state.phase !== 'playing') {
          this.sound.result(this.state.phase === 'won');
          const records = storage.read<RecordEntry[]>('records', []);
          if (Array.isArray(records))
            storage.write(
              'records',
              [
                {
                  score: this.state.stats.score,
                  survivors: this.state.members.filter((m) => m.hp > 0).length,
                  won: this.state.phase === 'won',
                  at: new Date().toISOString(),
                },
                ...records,
              ].slice(0, 20),
            );
        }
      });
      if (this.state.phase === 'playing') this.sound.update(this.state);
    }
    this.scene.render(
      this.state,
      this.paused ? 1 : Math.max(0, this.clock.accumulator * 30),
      this.shake,
    );
    if (now - this.lastHud >= 80) {
      this.lastHud = now;
      this.notify();
    }
    this.frameId = requestAnimationFrame((next) => this.frame(next));
  }
  inspect() {
    const sorted = [...this.frames].sort((a, b) => a - b),
      sum = this.frames.reduce((a, b) => a + b, 0);
    return {
      ...snapshot(this.state),
      started: this.started,
      paused: this.paused,
      activeLoops: this.disposed ? 0 : 1,
      audio: this.sound.inspect(),
      feedbackEvents: structuredClone(this.state.effects.slice(-32)),
      render: {
        frames: sorted.length,
        averageFps: sum ? (1000 * sorted.length) / sum : 0,
        p1Fps: sorted.length ? 1000 / sorted[Math.floor(sorted.length * 0.99)] : 0,
        peakEnemies: this.peakEnemies,
        width: this.scene.width,
        height: this.scene.height,
        drawCalls: this.scene.renderer.info.render.calls,
        effectParts: this.scene.effectParts,
        triangles: this.scene.renderer.info.render.triangles,
      },
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.abort.abort();
    this.sound.dispose();
    this.scene.dispose();
  }
}
