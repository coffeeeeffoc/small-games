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
import {
  readProgress,
  saveProgress,
  recordVictory,
  missionUnlocked,
  craftUnlocked,
} from './core/progress';
import type { Progress, StoragePort } from './core/progress';
import { RULE_VERSION, MISSIONS, MISSILE_RANGE, craftById } from './core/content';
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
  engine!: AudioSource;
  sounds = new Map<string, AudioSource>();
  accumulator = 0;
  uiClock = 0;
  practice = false;
  cleanupDev?: () => void;
  worldShown = false;
  crashTime = 0;
  onLoad() {
    try {
      this.storage = sys.localStorage;
    } catch {}
    this.progress = readProgress(this.storage);
    this.state = createRun(
      MISSIONS.find(
        (m) => !this.progress.completed[m.id] && missionUnlocked(this.progress, m.id),
      ) || MISSIONS[0],
      craftById(this.progress.selectedCraft),
    );
    this.ui = new UI(this.node);
    this.world = new World(this.node, this.surface!);
    this.ui.project = (point) => this.world.project(point);
    this.engine = this.node.addComponent(AudioSource);
    this.engine.loop = true;
    this.engine.volume = 0.16;
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
        if (name === 'wind') this.engine.clip = clip;
        else {
          const source = this.node.addComponent(AudioSource);
          source.clip = clip;
          source.volume = name === 'shoot' ? 0.19 : name === 'hit' ? 0.24 : 0.34;
          this.sounds.set(name, source);
        }
      });
    this.controls = new FlightInput(
      this.ui,
      (id) => this.action(id),
      () => this.screen === 'playing' && this.state.status === 'running',
    );
    game.on(Game.EVENT_HIDE, this.hide, this);
    view.on('canvas-resize', this.resize, this);
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this.hide);
      window.addEventListener('pagehide', this.hide);
      // A 90-degree rotation may leave the logical Cocos canvas size unchanged.
      window.addEventListener('resize', this.resize);
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
        crashTime: this.crashTime,
        practice: this.practice,
        width: this.ui.width,
        height: this.ui.height,
        scale: this.ui.scale,
        safe: this.ui.safe,
        controls: this.ui.controls,
        atlasReady: this.ui.atlasReady,
        audio: {
          muted: this.progress.muted,
          engine: this.engine.playing,
          effects: Array.from(this.sounds.values()).filter((s) => s.playing).length,
          loaded: this.sounds.size,
        },
        input: {
          pointers: this.controls.pointers.size,
          keys: this.controls.keys.size,
          stick: this.ui.stick,
        },
        state: this.state,
        lock: targetInCone(this.state, 25, MISSILE_RANGE)?.id,
        targetMarker: this.ui.targetMarker,
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
    this.stopSounds();
    this.engine?.stop();
  };
  draw() {
    this.ui.draw(
      this.screen,
      this.state,
      this.progress,
      this.practice || !!web.SmallGamesDev?.isEnabled(),
    );
  }
  change(screen: Screen) {
    this.controls.clear();
    this.accumulator = 0;
    this.screen = screen;
    this.engine.stop();
    if (screen !== 'result') this.stopSounds();
    web.NullRangeHost?.display(
      ['playing', 'paused', 'result'].includes(screen) ||
        (screen === 'settings' && this.returnScreen === 'paused'),
    );
    this.draw();
  }
  action(id: string) {
    const dev = !!web.SmallGamesDev?.isEnabled();
    if (id.startsWith('mission:') && this.screen === 'missions') {
      const m = MISSIONS.find((m) => m.id === id.slice(8));
      if (m) this.state = createRun(m, this.state.craft);
      this.draw();
      return;
    }
    if (id === 'mission-page') {
      const i = MISSIONS.indexOf(this.state.mission);
      this.state = createRun(MISSIONS[i < 3 ? 3 : 0], this.state.craft);
      this.draw();
      return;
    }
    if (id.startsWith('craft:') && this.screen === 'prepare') {
      const c = craftById(id.slice(6));
      if (c && (dev || craftUnlocked(this.progress, c.id))) {
        this.state = createRun(this.state.mission, c);
        if (!dev) {
          this.progress.selectedCraft = c.id;
          this.persistField('selectedCraft');
        }
        this.draw();
      }
      return;
    }
    if (id === 'next') {
      const i = MISSIONS.indexOf(this.state.mission);
      this.state = createRun(MISSIONS[Math.min(i + 1, MISSIONS.length - 1)], this.state.craft);
      this.change('missions');
      return;
    }

    if (id === 'prepare' || id === 'prepare-detail') {
      this.returnScreen = 'missions';
      this.change('prepare');
      return;
    }
    if (id === 'start' || id === 'restart') {
      if (
        !this.world.ready ||
        (!dev &&
          (!missionUnlocked(this.progress, this.state.mission.id) ||
            !craftUnlocked(this.progress, this.state.craft.id)))
      )
        return;
      this.state = createRun(this.state.mission, this.state.craft);
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
      this.stopSounds();
      this.engine.stop();
    } else if (id === 'reduced') {
      changed = 'reduced';
      this.progress.reduced = !this.progress.reduced;
    } else if (id === 'sensitivity') {
      changed = 'sensitivity';
      const options = [0.7, 1, 1.3];
      this.progress.sensitivity = options[(options.indexOf(this.progress.sensitivity) + 1) % 3];
    } else return;
    this.persistField(changed);
    this.draw();
  }
  persistField(field: 'muted' | 'reduced' | 'sensitivity' | 'selectedCraft') {
    const value = this.progress[field];
    this.persist(() => {
      const next = { ...this.progress, [field]: value };
      saveProgress(this.storage, next, field);
      Object.assign(this.progress, next);
    });
  }
  persist(write: () => unknown) {
    const run = () => {
      write();
      if (this.isValid) this.draw();
    };
    // Web Locks serializes same-origin tabs; native JS storage executes synchronously.
    if (typeof navigator !== 'undefined' && navigator.locks)
      void navigator.locks.request('nullrange-progress-v2', run).catch(() => {});
    else run();
  }
  sound(name: string) {
    const source = this.sounds.get(
      (
        {
          shield: 'hit',
          phase: 'scan',
          wave: 'scan',
          'escort-hit': 'damage',
          danger: 'damage',
          crash: 'kill',
        } as Record<string, string>
      )[name] || name,
    );
    if (source && !this.progress.muted) {
      source.stop();
      source.play();
    }
  }
  stopSounds() {
    for (const source of this.sounds.values()) source.stop();
  }
  update(dt: number) {
    if (!this.world) return;
    if (this.world.ready && !this.worldShown) {
      this.worldShown = true;
      web.NullRangeHost?.ready();
    }
    if (this.screen === 'playing' && this.state.status !== 'running') {
      this.crashTime += Math.max(0, Math.min(dt, 0.1));
      if (this.crashTime >= 1.4) this.change('result');
    } else if (this.screen === 'playing') {
      this.crashTime = 0;
      this.accumulator += Math.min(0.1, Math.max(0, dt));
      while (this.accumulator >= DT && this.screen === 'playing') {
        step(this.state, this.controls.read(this.progress.sensitivity));
        this.accumulator -= DT;
        for (const event of this.state.events) this.sound(event);
        if (this.state.status !== 'running') {
          const terminal = this.state,
            practice = this.practice;
          this.persist(() => recordVictory(this.storage, this.progress, terminal, practice));
          if (this.state.impacts.some((e) => e.kind === 'crash')) {
            this.controls.clear();
            this.engine.stop();
            this.accumulator = 0;
            break;
          }
          this.change('result');
        }
      }
      if (
        !this.progress.muted &&
        this.engine.clip &&
        !this.engine.playing &&
        this.screen === 'playing' &&
        this.state.status === 'running'
      )
        this.engine.play();
    }
    this.world.update(
      this.state,
      ['home', 'missions', 'prepare', 'online', 'result'].includes(this.screen) ||
        (['settings', 'help'].includes(this.screen) && this.returnScreen !== 'paused'),
      this.progress.reduced,
      this.screen,
      this.crashTime,
    );
    this.uiClock += dt;
    if (this.uiClock > (this.screen === 'playing' ? 1 / 30 : 0.08)) {
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
      window.removeEventListener('resize', this.resize);
      document.removeEventListener('visibilitychange', this.visibility);
    }
    this.cleanupDev?.();
    delete web.__nullrange;
    this.controls?.dispose();
    this.stopSounds();
    this.engine?.stop();
    this.ui?.dispose();
    this.world?.dispose();
    web.NullRangeHost?.display(false);
  }
}
