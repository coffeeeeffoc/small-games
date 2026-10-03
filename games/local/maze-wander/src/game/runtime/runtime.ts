import type { Level, Run, Settings } from '../core/model.ts';
import { geometry, focus } from '../core/geometry.ts';
import { step, interact } from '../core/rules.ts';
import { Input } from '../../platform/input.ts';
import { World } from '../render/world.ts';

export class Runtime {
  world: World;
  input: Input;
  active = false;
  data: ReturnType<typeof geometry>;
  private raf = 0;
  private last = 0;
  private hudAt = 0;
  private saveAt = 0;
  private samples: number[] = [];
  private abort = new AbortController();
  private audio?: AudioContext;
  constructor(
    public canvas: HTMLCanvasElement,
    public level: Level,
    public run: Run,
    public settings: Settings,
    private callbacks: {
      hud: () => void;
      save: () => void;
      pause: () => void;
      command: (code: string) => void;
      error: (message: string) => void;
    },
  ) {
    this.data = geometry(level);
    this.world = new World(canvas, level, this.data.boxes, this.data.targets, settings);
    this.input = new Input(
      canvas,
      () => this.active,
      (x, y) => {
        run.yaw = (run.yaw - x * 0.0024 * settings.sensitivity) % (Math.PI * 2);
        run.pitch = Math.max(-1.1, Math.min(1.1, run.pitch - y * 0.0024 * settings.sensitivity));
      },
      callbacks.command,
      callbacks.pause,
    );
    canvas.addEventListener(
      'webglcontextlost',
      (e) => {
        e.preventDefault();
        this.pause();
        callbacks.save();
        callbacks.error('图形上下文暂时丢失，进度已尝试保存。请重新载入。');
      },
      { signal: this.abort.signal },
    );
    const tick = (now: number) => {
      const dt = this.last ? (now - this.last) / 1000 : 0;
      this.last = now;
      if (!document.hidden) {
        step(level, run, this.input.axes(), dt, this.data.boxes, this.data.targets, this.active);
        try {
          this.world.render(run);
        } catch {
          this.pause();
          callbacks.error('场景绘制失败。可尝试低画质或重新载入页面。');
          return;
        }
        if (this.active && dt > 0) {
          this.samples.push(dt * 1000);
          if (this.samples.length > 240) this.samples.shift();
        }
        if (now - this.hudAt > 120) {
          this.hudAt = now;
          callbacks.hud();
        }
        if (this.active && now - this.saveAt > 3000) {
          this.saveAt = now;
          callbacks.save();
        }
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  resume() {
    this.input.clear();
    this.last = 0;
    this.active = true;
  }
  pause() {
    this.active = false;
    this.input.clear();
  }
  target(anchor = false) {
    return focus(this.run, this.data.targets, this.data.boxes, anchor);
  }
  interact() {
    const message = interact(this.level, this.run, this.data.targets, this.data.boxes);
    this.chime(this.run.finished ? 660 : 440);
    return message;
  }
  chime(frequency = 440) {
    if (!this.settings.sound) return;
    try {
      this.audio ??= new AudioContext();
      void this.audio.resume().catch(() => {});
      const osc = this.audio.createOscillator(),
        gain = this.audio.createGain(),
        now = this.audio.currentTime;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.045, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      osc.connect(gain);
      gain.connect(this.audio.destination);
      osc.start();
      osc.stop(now + 0.26);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch {
      /* Sound is optional; movement and progress never depend on the audio device. */
    }
  }
  metrics() {
    const ordered = [...this.samples].sort((a, b) => a - b);
    return {
      ...this.world.metrics(),
      frames: ordered.length,
      medianMs: ordered[Math.floor(ordered.length / 2)] ?? 0,
      p95Ms: ordered[Math.floor(ordered.length * 0.95)] ?? 0,
    };
  }
  dispose() {
    this.pause();
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.input.dispose();
    this.world.dispose();
    void this.audio?.close().catch(() => {});
  }
}
