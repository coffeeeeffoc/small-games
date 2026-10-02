import { AudioClip, AudioSource, Node, resources, sys, screen } from 'cc';
import type { PauseReason } from './core/Simulation';
import { missionDefinition, type MissionId } from './core/MissionCatalog';
import { readTrainingRecord as parseTrainingRecord, type TrainingRecord } from './core/TrainingRecords';
export class Platform {
  touchInput = sys.isMobile || (sys.isBrowser && window.matchMedia('(pointer: coarse)').matches);
  muted = false;
  reducedEffects = false;
  activated = false;
  voices = new Map<string, AudioSource>();
  engine: AudioSource;
  clips = new Map<string, AudioClip>();
  audioStatus = 'loading';
  cleanup: (() => void)[] = [];
  private clear: () => void;
  constructor(parent: Node, pause: (reason: PauseReason, on: boolean) => void, clear: () => void) {
    this.clear = clear;
    try {
      this.muted = sys.localStorage.getItem('night-overwatch-muted') === 'true';
      const preference = sys.localStorage.getItem('night-overwatch-reduced-effects');
      this.reducedEffects =
        preference === 'true' ||
        (preference === null &&
          sys.isBrowser &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch {
      /* Preferences never block the mission. */
    }
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
          this.useTouchInput((e as PointerEvent).pointerType !== 'mouse');
          canvas.focus({ preventScroll: true });
          this.activate();
        });
        listen(canvas, 'pointermove', (e) => {
          this.useTouchInput((e as PointerEvent).pointerType !== 'mouse');
        });
        listen(canvas, 'pointerleave', (e) => {
          if ((e as PointerEvent).pointerType === 'mouse') clear();
        });
        listen(canvas, 'pointercancel', () => clear());
        listen(canvas, 'contextmenu', (e) => e.preventDefault());
      }
    }
  }
  useTouchInput(touch: boolean) {
    if (touch === this.touchInput) return;
    this.clear();
    this.touchInput = touch;
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
  savePreferences() {
    try {
      sys.localStorage.setItem('night-overwatch-muted', String(this.muted));
      sys.localStorage.setItem('night-overwatch-reduced-effects', String(this.reducedEffects));
    } catch {
      /* Optional local preferences. */
    }
  }
  lastSound = '';
  play(id: string, gain = 1) {
    const source = this.voices.get(id);
    if (source?.clip && this.activated && !this.muted) {
      source.volume = (id === 'heavy' ? .7 : id === 'blast' ? .5 : id === 'rapid' ? .32 : .3) * gain;
      this.lastSound = id;
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
      return sys.localStorage.getItem('night-overwatch-coach-v2') !== 'done';
    } catch {
      return true;
    }
  }
  saveCoach() {
    try {
      sys.localStorage.setItem('night-overwatch-coach-v2', 'done');
    } catch {
      /* Optional preference; storage denial never blocks play. */
    }
  }
  readMission(): MissionId {
    try {
      const mission = missionDefinition(sys.localStorage.getItem('night-overwatch-mission-v1'));
      return mission.mode === 'escort' ? mission.id : 'corridor-01';
    }
    catch { return 'corridor-01'; }
  }
  saveMission(id: MissionId) {
    if (missionDefinition(id).mode !== 'escort') return;
    try { sys.localStorage.setItem('night-overwatch-mission-v1', id); }
    catch { /* Choosing a mission works even when storage is denied. */ }
  }
  readWarmupRecord(): TrainingRecord | undefined {
    try { return parseTrainingRecord(sys.localStorage.getItem('night-overwatch-training-v1')); }
    catch { return; }
  }
  saveWarmupRecord(record: TrainingRecord) {
    try { sys.localStorage.setItem('night-overwatch-training-v1', JSON.stringify(record)); }
    catch { /* A denied optional record never blocks another attempt. */ }
  }
  dispose() {
    for (const fn of this.cleanup) fn();
    this.stop();
  }
}
