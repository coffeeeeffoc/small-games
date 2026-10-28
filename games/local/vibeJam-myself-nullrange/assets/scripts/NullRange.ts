import {
  _decorator,
  AudioClip,
  AudioSource,
  Component,
  Game,
  Material,
  game,
  resources,
  sys,
  view,
} from 'cc';
import { DT, createRun, step, targetInCone } from './core/rules';
import { readProgress, saveProgress } from './core/progress';
import type { Progress, StoragePort } from './core/progress';
import { RULE_VERSION } from './core/content';
import { FlightInput } from './FlightInput';
import { UI } from './UI';
import type { Screen } from './UI';
import { World } from './World';
const { ccclass, property } = _decorator;
const web = globalThis as typeof globalThis & {
  SmallGamesDev?: { isEnabled(): boolean; registerSnapshot(fn: () => unknown): () => void };
  NullRangeHost?: { ready(): void; display(immersive: boolean): void };
  __nullrange?: { snapshot: () => unknown };
};
@ccclass('NullRange')
export class NullRange extends Component {
  @property(Material) surface: Material | null = null;
  state = createRun();
  screen: Screen = 'home';
  returnScreen: Screen = 'home';
  ui!: UI;
  world!: World;
  controls!: FlightInput;
  progress!: Progress;
  storage?: StoragePort;
  audio!: AudioSource;
  engine!: AudioSource;
  clips = new Map<string, AudioClip>();
  accumulator = 0;
  uiClock = 0;
  practice = false;
  cleanupDev?: () => void;
  worldShown = false;
  onLoad() {
    try {
      this.storage = sys.localStorage;
    } catch {}
    this.progress = readProgress(this.storage);
    this.ui = new UI(this.node);
    this.world = new World(this.node, this.surface!);
    this.audio = this.node.addComponent(AudioSource);
    this.engine = this.node.addComponent(AudioSource);
    this.engine.loop = true;
    this.engine.volume = 0.2;
    for (const name of [
      'shoot',
      'hit',
      'kill',
      'damage',
      'pickup',
      'missile',
      'scan',
      'won',
      'lost',
      'wind',
    ])
      resources.load('audio/' + name, AudioClip, (err, clip) => {
        if (err || !this.isValid) return;
        this.clips.set(name, clip);
        if (name === 'wind') this.engine.clip = clip;
      });
    this.controls = new FlightInput(
      this.ui,
      (id) => this.action(id),
      () => this.screen === 'playing',
    );
    game.on(Game.EVENT_HIDE, this.hide, this);
    view.on('canvas-resize', this.resize, this);
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this.hide);
      window.addEventListener('pagehide', this.hide);
      document.addEventListener('visibilitychange', this.visibility);
    }
    this.cleanupDev = web.SmallGamesDev?.registerSnapshot(() => this.snapshot());
    if (web.SmallGamesDev?.isEnabled())
      web.__nullrange = Object.freeze({ snapshot: () => this.snapshot() });
    this.draw();
    this.world.update(this.state, true, this.progress.reduced);
  }
  snapshot() {
    return JSON.parse(
      JSON.stringify({
        version: RULE_VERSION,
        screen: this.screen,
        practice: this.practice,
        width: this.ui.width,
        height: this.ui.height,
        scale: this.ui.scale,
        controls: this.ui.controls,
        input: {
          pointers: this.controls.pointers.size,
          keys: this.controls.keys.size,
          stick: this.ui.stick,
        },
        state: this.state,
        lock: targetInCone(this.state, 25, 900)?.id,
        progress: this.progress,
        engine: 'Cocos Creator 3.8.8',
        world: this.world.snapshot(),
      }),
    );
  }
  resize = () => {
    if (!this.ui) return;
    this.controls?.clear();
    this.accumulator = 0;
    this.ui.resize();
    this.draw();
  };
  visibility = () => {
    if (document.hidden) this.hide();
  };
  hide = () => {
    this.controls?.clear();
    this.accumulator = 0;
    if (this.screen === 'playing') this.change('paused');
    this.audio?.stop();
    this.engine?.stop();
  };
  draw() {
    this.ui.draw(this.screen, this.state, this.progress, this.practice);
  }
  change(screen: Screen) {
    this.controls.clear();
    this.accumulator = 0;
    this.screen = screen;
    this.engine.stop();
    web.NullRangeHost?.display(
      ['playing', 'paused', 'result'].includes(screen) ||
        (screen === 'settings' && this.returnScreen === 'paused'),
    );
    this.draw();
  }
  action(id: string) {
    if (id === 'start' || id === 'restart') {
      if (!this.world.ready) return;
      this.state = createRun();
      this.practice = !!web.SmallGamesDev?.isEnabled();
      this.change('playing');
      return;
    }
    if (id === 'pause') {
      if (this.screen === 'playing') this.change('paused');
      else if (this.screen === 'paused') this.change('playing');
      return;
    }
    if (id === 'resume' && this.screen === 'paused') {
      this.change('playing');
      return;
    }
    if (id === 'home') {
      this.change('home');
      return;
    }
    if (['settings', 'help', 'online'].includes(id)) {
      this.returnScreen = this.screen;
      this.change(id as Screen);
      return;
    }
    if (id === 'back') {
      this.change(this.returnScreen);
      return;
    }
    if (id === 'missions') {
      this.change('missions');
      return;
    }
    if (this.screen !== 'settings') return;
    let changed: 'muted' | 'reduced' | 'sensitivity';
    if (id === 'sound') {
      changed = 'muted';
      this.progress.muted = !this.progress.muted;
      this.audio.stop();
      this.engine.stop();
    } else if (id === 'reduced') {
      changed = 'reduced';
      this.progress.reduced = !this.progress.reduced;
    } else if (id === 'sensitivity') {
      changed = 'sensitivity';
      const options = [0.7, 1, 1.3];
      this.progress.sensitivity = options[(options.indexOf(this.progress.sensitivity) + 1) % 3];
    } else return;
    saveProgress(this.storage, this.progress, changed);
    this.draw();
  }
  sound(name: string) {
    const clip = this.clips.get(name);
    if (clip && !this.progress.muted) this.audio.playOneShot(clip, name === 'shoot' ? 0.12 : 0.45);
  }
  update(dt: number) {
    if (!this.world) return;
    if (this.world.ready && !this.worldShown) {
      this.worldShown = true;
      web.NullRangeHost?.ready();
    }
    if (this.screen === 'playing') {
      this.accumulator += Math.min(0.1, Math.max(0, dt));
      while (this.accumulator >= DT && this.screen === 'playing') {
        step(this.state, this.controls.read(this.progress.sensitivity));
        this.accumulator -= DT;
        for (const event of this.state.events) this.sound(event);
        if (this.state.status !== 'running') {
          if (!this.practice) {
            this.progress.best = Math.max(this.progress.best, this.state.score);
            saveProgress(this.storage, this.progress, 'best');
          }
          this.change('result');
        }
      }
      if (
        !this.progress.muted &&
        this.engine.clip &&
        !this.engine.playing &&
        this.screen === 'playing'
      )
        this.engine.play();
    }
    this.world.update(
      this.state,
      ['home', 'missions', 'online'].includes(this.screen),
      this.progress.reduced,
    );
    this.uiClock += dt;
    if (this.uiClock > 0.08) {
      this.uiClock = 0;
      this.draw();
    }
  }
  onDestroy() {
    game.off(Game.EVENT_HIDE, this.hide, this);
    view.off('canvas-resize', this.resize, this);
    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', this.hide);
      window.removeEventListener('pagehide', this.hide);
      document.removeEventListener('visibilitychange', this.visibility);
    }
    this.cleanupDev?.();
    delete web.__nullrange;
    this.controls?.dispose();
    this.audio?.stop();
    this.engine?.stop();
    this.ui?.dispose();
    this.world?.dispose();
    web.NullRangeHost?.display(false);
  }
}
