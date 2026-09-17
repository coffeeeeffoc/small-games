import { _decorator, Component, game, Game, Layers, profiler, sys } from 'cc';
import { RaceManager } from './RaceManager';
import { buildTrack } from './Track';
import { KartView } from './KartView';
import { ChaseCamera } from './ChaseCamera';
import { HUD } from './HUD';
import { KartController } from './KartController';
import { aiInput } from './KartAI';
import { palette } from './SceneArt';
import { AudioFeedback } from './AudioFeedback';
const { ccclass } = _decorator;

@ccclass('KartGame')
export class KartGame extends Component {
  race = new RaceManager();
  views: KartView[] = [];
  camera!: ChaseCamera;
  hud!: HUD;
  controller!: KartController;
  audio!: AudioFeedback;
  accumulator = 0;
  uiTime = 0;
  frames = 0;
  frameTime = 0;
  fps = 60;
  muted = false;
  best = 0;
  start() {
    profiler.hideStats();
    this.node.layer = Layers.Enum.DEFAULT;
    buildTrack(this.node, this.race.track);
    this.views = [palette.red, palette.blue, palette.yellow, palette.mint].map(
      (c) => new KartView(this.node, c),
    );
    this.camera = new ChaseCamera(this.node);
    this.camera.camera.visibility = Layers.Enum.DEFAULT;
    this.hud = new HUD(this.node);
    this.audio = new AudioFeedback(this.node);
    try {
      this.best = Number(sys.localStorage.getItem('coastline-best')) || 0;
    } catch {}
    this.hud.best = this.best;
    this.controller = new KartController(
      () => this.race,
      () => this.restart(),
      () => {
        this.muted = !this.muted;
      },
    );
    game.on(Game.EVENT_HIDE, this.hide, this);
    // Read-only diagnostics for real-input checks: no teleport or forced finish hooks.
    if (sys.isBrowser) {
      const browser = globalThis as typeof globalThis & { __kart?: unknown };
      browser.__kart = {
        snapshot: () => ({
          phase: this.race.phase,
          time: this.race.time,
          fps: this.fps,
          boosts: this.race.boosts,
          collisions: this.race.collisions,
          resets: this.race.resets,
          order: this.race.order,
          modelsLoaded: this.views.every((v) => v.modelLoaded),
          audioClips: this.audio.clips.size,
          muted: this.muted,
          player: { ...this.race.drivers[0].kart },
          progress: { ...this.race.drivers[0].progress },
          input: this.controller.read(),
          suggestedInput: aiInput(
            this.race.drivers[0].kart,
            this.race.track,
            false,
            this.race.drivers[0].progress.s,
          ),
          drivers: this.race.drivers.map((d) => ({
            lap: d.progress.laps,
            distance: d.progress.distance,
            speed: d.kart.speed,
          })),
        }),
      };
      document.body.dataset.kartReady = 'true';
      document.getElementById('GameCanvas')?.focus();
      window.addEventListener('blur', this.hide);
    }
    this.hud.update(this.race, this.controller.read(), this.muted);
    console.log('[carding-car] ready: native Cocos scene, 4 karts, 3 laps');
  }
  hide = () => {
    this.controller?.clear();
    this.race.pause();
  };
  restart() {
    this.controller.clear();
    this.race = new RaceManager();
    this.race.start();
    this.camera.initialized = false;
  }
  update(dt: number) {
    if (!this.controller) return;
    this.frames++;
    this.frameTime += dt;
    if (this.frameTime >= 1) {
      this.fps = Math.round(this.frames / this.frameTime);
      this.frames = 0;
      this.frameTime = 0;
    }
    this.accumulator += Math.min(dt, 0.1);
    const input = this.controller.read(),
      before = this.race.phase;
    while (this.accumulator >= 1 / 60) {
      this.race.step(input, 1 / 60);
      this.accumulator -= 1 / 60;
    }
    if (
      before !== 'finished' &&
      this.race.phase === 'finished' &&
      (!this.best || this.race.time < this.best)
    ) {
      this.best = this.race.time;
      this.hud.best = this.best;
      try {
        sys.localStorage.setItem('coastline-best', String(this.best));
      } catch {}
    }
    this.views.forEach((v, i) => v.update(this.race.drivers[i].kart, this.race.time));
    this.camera.update(this.race.drivers[0].kart, Math.min(dt, 0.1));
    this.audio.update(this.race, this.muted);
    this.uiTime += dt;
    if (this.uiTime > 0.08) {
      this.hud.update(this.race, input, this.muted);
      this.uiTime = 0;
    }
  }
  onDestroy() {
    game.off(Game.EVENT_HIDE, this.hide, this);
    this.controller?.destroy();
    if (sys.isBrowser) window.removeEventListener('blur', this.hide);
  }
}
