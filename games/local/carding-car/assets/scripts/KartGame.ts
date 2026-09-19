import { _decorator, Camera, Color, Component, game, Game, Layers, Node, profiler, sys } from 'cc';
import { RaceManager } from './RaceManager';
import { buildWorld } from './WorldTrack';
import { worlds } from './WorldCatalog';
import { cycleSelection, defaultSelection, readSelection, type Selection } from './Selection';
import { ItemsView } from './ItemsView';
import { KartView } from './KartView';
import { ChaseCamera } from './ChaseCamera';
import { HUD } from './HUD';
import { KartController } from './KartController';
import { aiInput } from './KartAI';
import { palette } from './SceneArt';
import { AudioFeedback } from './AudioFeedback';
import { addRecord, readRecords, type RaceRecord } from './RankingSystem';
import { setGlacierLighting } from './GlacierSample';
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
  sceneryLoaded = false;
  records: RaceRecord[] = [];
  selection: Selection = { ...defaultSelection };
  worldRoot?: Node;
  itemsView?: ItemsView;
  loadVersion = 0;
  seed = Date.now() >>> 0;
  get recordKey() {
    return this.selection.world === 'seaside'
      ? 'coastline-records-v1'
      : `kart-records-v1-${this.selection.world}`;
  }
  readWorldRecords() {
    try {
      this.records = readRecords(
        sys.localStorage.getItem(this.recordKey),
        this.selection.world === 'seaside' ? sys.localStorage.getItem('coastline-best') : null,
      );
    } catch {
      this.records = [];
    }
    this.hud.records = this.records;
  }
  choose = (field: keyof Selection, delta: number) => {
    if (this.race.phase !== 'ready') return;
    this.selection = cycleSelection(this.selection, field, delta);
    try {
      sys.localStorage.setItem('kart-selection-v1', JSON.stringify(this.selection));
    } catch {}
    this.loadSelection();
  };
  loadSelection() {
    const version = ++this.loadVersion;
    this.controller?.clear();
    if (this.worldRoot) {
      this.worldRoot.active = false;
      this.worldRoot.destroy();
    }
    this.worldRoot = new Node('SelectedWorld');
    this.node.addChild(this.worldRoot);
    const world = worlds.find((w) => w.id === this.selection.world)!;
    setGlacierLighting(this.worldRoot, world.id === 'glacier');
    this.race = new RaceManager(world.track, ++this.seed);
    this.race.loaded = false;
    this.sceneryLoaded = false;
    this.accumulator = 0;
    this.camera.initialized = false;
    this.camera.camera.clearColor = new Color().fromHEX(world.colors.sky);
    this.camera.camera.clearFlags = world.id === 'glacier' ? Camera.ClearFlag.SKYBOX : Camera.ClearFlag.SOLID_COLOR;
    this.camera.height = world.id === 'glacier' ? 3.2 : 4.4;
    this.camera.lookHeight = world.id === 'glacier' ? 2 : 1.1;
    this.hud.selection = { ...this.selection };
    this.hud.lastPhase = '';
    this.readWorldRecords();
    this.views = [palette.red, palette.blue, palette.yellow, palette.mint].map(
      (c) => new KartView(this.worldRoot!, c, this.selection),
    );
    this.itemsView = new ItemsView(this.worldRoot, this.race.items);
    Promise.all([
      buildWorld(this.worldRoot, this.race.track, world),
      ...this.views.map((v) => v.ready),
      this.itemsView.ready,
    ])
      .then(() => {
        if (version !== this.loadVersion) return;
        this.race.loaded = true;
        this.sceneryLoaded = true;
      })
      .catch((error: Error) => {
        if (version !== this.loadVersion) return;
        this.race.loadError = String(error.message || error).slice(0, 100);
        console.error('[carding-car] selected assets failed', error);
      });
  }
  start() {
    profiler.hideStats();
    this.node.layer = Layers.Enum.DEFAULT;
    this.camera = new ChaseCamera(this.node);
    this.camera.camera.visibility = Layers.Enum.DEFAULT;
    this.hud = new HUD(this.node);
    this.audio = new AudioFeedback(this.node);
    try {
      this.selection = readSelection(sys.localStorage.getItem('kart-selection-v1'));
    } catch {}
    this.controller = new KartController(
      () => this.race,
      () => this.restart(),
      () => {
        this.muted = !this.muted;
        this.audio.activate(this.muted);
      },
      () => this.audio.activate(this.muted),
      this.choose,
      () => this.loadSelection(),
    );
    this.loadSelection();
    game.on(Game.EVENT_HIDE, this.hide, this);
    // Read-only diagnostics for real-input checks: no teleport or forced finish hooks.
    if (sys.isBrowser) {
      const browser = globalThis as typeof globalThis & { __kart?: unknown };
      browser.__kart = {
        snapshot: () => ({
          phase: this.race.phase,
          selection: { ...this.selection },
          loading: !this.race.loaded,
          loadError: this.race.loadError,
          itemsCollected: this.race.itemsCollected,
          seed: this.seed,
          world: {
            id: this.selection.world,
            width: this.race.track.width,
            length: this.race.track.length,
          },
          items: this.race.items.map((item) => ({
            ...item,
            active: item.availableAt <= this.race.time,
          })),
          renderedVehicles: this.views.map((v) => v.body.children[0]?.name),
          renderedDrivers: this.views.map((v) => v.driver?.name),
          renderedItems: this.itemsView?.nodes.map((n) => n.name),
          time: this.race.time,
          fps: this.fps,
          boosts: this.race.boosts,
          collisions: this.race.collisions,
          resets: this.race.resets,
          order: this.race.order,
          modelsLoaded: this.views.every((v) => v.modelLoaded),
          sceneryLoaded: this.sceneryLoaded,
          audioClips: this.audio.clips.size,
          audioPlaying: this.audio.source.playing,
          muted: this.muted,
          currentLapTime: this.race.currentLapTime,
          bestLapTime: this.race.bestLapTime,
          records: this.records.map((record) => ({ ...record })),
          hud: {
            title: this.hud.title.string,
            detail: this.hud.detail.string,
            timer: this.hud.timer.string,
            standings: this.hud.standings.string,
            leaderboard: this.hud.leaderboard.string,
            nitro: this.hud.nitro.string,
          },
          player: { ...this.race.drivers[0].kart },
          camera: {
            heading: this.camera.heading,
            x: this.camera.node.position.x,
            z: this.camera.node.position.z,
          },
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
    if (this.audio) this.audio.activated = false;
    this.race.pause();
    this.accumulator = 0;
  };
  restart() {
    this.controller.clear();
    const world = worlds.find((w) => w.id === this.selection.world)!;
    this.race = new RaceManager(world.track, ++this.seed);
    this.race.start();
    this.accumulator = 0;
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
    if (before !== 'finished' && this.race.phase === 'finished') {
      this.records = addRecord(this.records, {
        time: this.race.time,
        bestLap: this.race.bestLapTime,
        place: this.race.order.indexOf(0) + 1,
      });
      this.hud.records = this.records;
      try {
        sys.localStorage.setItem(this.recordKey, JSON.stringify(this.records));
      } catch {}
    }
    this.views.forEach((v, i) => v.update(this.race.drivers[i].kart, this.race.time));
    this.itemsView?.update(this.race.items, this.race.time);
    this.camera.update(this.race.drivers[0].kart, Math.min(dt, 0.1));
    this.audio.update(this.race, this.muted);
    this.uiTime += dt;
    if (this.uiTime > 0.08) {
      this.hud.update(this.race, input, this.muted);
      this.uiTime = 0;
    }
  }
  onDestroy() {
    this.loadVersion++;
    game.off(Game.EVENT_HIDE, this.hide, this);
    this.controller?.destroy();
    if (sys.isBrowser) window.removeEventListener('blur', this.hide);
  }
}
