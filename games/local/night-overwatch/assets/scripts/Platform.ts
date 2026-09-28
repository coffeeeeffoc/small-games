import { AudioClip, AudioSource, Node, resources, sys, screen } from 'cc';
import type { PauseReason } from './core/Simulation';
export class Platform {
  touchInput = sys.isMobile;
  muted = false;
  activated = false;
  voices = new Map<string, AudioSource>();
  engine: AudioSource;
  clips = new Map<string, AudioClip>();
  audioStatus = 'loading';
  cleanup: (() => void)[] = [];
  constructor(parent: Node, pause: (reason: PauseReason, on: boolean) => void, clear: () => void) {
    const engineNode = new Node('AircraftEngine');
    parent.addChild(engineNode);
    this.engine = engineNode.addComponent(AudioSource);
    this.engine.playOnAwake = false;
    this.engine.loop = true;
    this.engine.volume = 0.13;
    const names = ['rapid', 'blast', 'heavy', 'hit', 'alert', 'impact1', 'impact2', 'engine'];
    let pending = names.length;
    for (const name of names) {
      let source = this.engine;
      if (name !== 'engine') {
        const n = new Node('Audio:' + name);
        parent.addChild(n);
        source = n.addComponent(AudioSource);
      }
      source.playOnAwake = false;
      if (name !== 'engine') source.volume = 0.3;
      this.voices.set(name, source);
      resources.load('audio/' + name, AudioClip, (error, clip) => {
        if (error) this.audioStatus = 'unavailable';
        else {
          this.clips.set(name, clip);
          source.clip = clip;
        }
        if (--pending === 0 && this.clips.size === names.length) this.audioStatus = 'ready';
      });
    }
    if (sys.isBrowser) {
      const listen = (target: EventTarget, type: string, fn: EventListener) => {
        target.addEventListener(type, fn);
        this.cleanup.push(() => target.removeEventListener(type, fn));
      };
      listen(window, 'blur', () => {
        clear();
        pause('focus', true);
        this.stop();
      });
      listen(window, 'focus', () => pause('focus', false));
      listen(document, 'visibilitychange', () => {
        clear();
        pause('background', document.hidden);
        if (document.hidden) this.stop();
      });
      const canvas = document.querySelector('canvas');
      if (canvas) {
        canvas.tabIndex = 0;
        canvas.setAttribute('aria-label', '夜航守望：点击进入，H 查看操作帮助');
        listen(canvas, 'pointerdown', (e) => {
          this.touchInput = (e as PointerEvent).pointerType !== 'mouse';
          canvas.focus({ preventScroll: true });
          this.activate();
        });
        listen(canvas, 'pointermove', (e) => {
          this.touchInput = (e as PointerEvent).pointerType !== 'mouse';
        });
        listen(canvas, 'pointerleave', (e) => {
          if ((e as PointerEvent).pointerType === 'mouse') clear();
        });
        listen(canvas, 'pointercancel', () => clear());
        listen(canvas, 'contextmenu', (e) => e.preventDefault());
      }
    }
  }
  get focused() {
    return (
      !sys.isBrowser ||
      (!document.hidden &&
        document.hasFocus() &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || ''))
    );
  }
  activate() {
    this.activated = true;
  }
  play(id: string) {
    const source = this.voices.get(id);
    if (source?.clip && this.activated && !this.muted) {
      source.stop();
      source.play();
    }
  }
  stop() {
    for (const source of Array.from(this.voices.values())) source.stop();
  }
  ambience(playing: boolean) {
    const clip = this.clips.get('engine');
    if (clip && playing && this.activated && !this.muted) {
      if (!this.engine.playing) {
        this.engine.play();
      }
    } else if (this.engine.playing) this.engine.stop();
  }
  get isFullscreen() {
    return screen.fullScreen();
  }
  async fullscreen() {
    try {
      const target = !screen.fullScreen();
      if (!target) await screen.exitFullScreen();
      else await screen.requestFullScreen();
      return screen.fullScreen() === target;
    } catch {
      return false;
    }
  }
  readCoach() {
    try {
      return sys.localStorage.getItem('night-overwatch-coach-v1') !== 'done';
    } catch {
      return true;
    }
  }
  saveCoach() {
    try {
      sys.localStorage.setItem('night-overwatch-coach-v1', 'done');
    } catch {
      /* Optional preference; storage denial never blocks play. */
    }
  }
  dispose() {
    for (const fn of this.cleanup) fn();
    this.stop();
  }
}
