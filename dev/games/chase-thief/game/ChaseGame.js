import * as cc from '../vendor/cocos/cc.js';
import { World } from './World.js';
import { Hud } from './Hud.js';
import {
  createRun,
  act,
  updateRun,
  pauseRun,
  resumeRun,
  drainEvents,
  markPractice,
} from './core/simulation.js';
import { loadProgress, recordRun, SAVE_KEY, LEGACY_KEY } from './core/progress.js';
import { sampleRoute, DISTRICTS, DISTRICT_NAMES } from './core/route.js';
                                                

const host = globalThis       ;
                          
              
                        
                                      
  
export async function loadAssets(web = false)                      {
  function load(name        , type     , extension        )               {
    return new Promise((resolve, reject) => {
      const done = (e, a) => (e ? reject(e) : resolve(a));
      if (web) cc.assetManager.loadRemote('art/' + name + extension, { ext: extension }, done);
      else cc.resources.load('art/' + name, type, done);
    });
  }
  const [models, image, ...sounds] = await Promise.all([
    load('city-models', cc.JsonAsset, '.json'),
    load('facades', web ? cc.ImageAsset : cc.Texture2D, '.png'),
    ...['step', 'jump', 'slide', 'coin', 'hit', 'click'].map((n) => load(n, cc.AudioClip, '.wav')),
  ]);
  const texture = web ? new cc.Texture2D() : image;
  if (web) texture.image = image;
  texture.setFilters(cc.Texture2D.Filter.LINEAR, cc.Texture2D.Filter.LINEAR);
  const audio = {};
  ['step', 'jump', 'slide', 'coin', 'hit', 'click'].forEach((n, i) => (audio[n] = sounds[i]));
  return { models: models.json || models, facades: texture, audio };
}
export class ChaseGame {
  scene          ;
  world       ;
  hud     ;
  assets            ;
  run     ;
  progress     ;
  screen = 'home';
  backTo = 'home';
  ready = false;
  manual = false;
  disposed = false;
  activeTouch                = null;
  startPoint      = null;
  pressed      = null;
  inputCount = 0;
  resultNewRecord = false;
  toast = '';
  toastTime = 0;
  lastFoot = 0;
  lastDistrict = '';
  ambient = 0;
  sound                ;
  removers                    = [];
  width = 390;
  height = 844;
  legacyLink = false;
  buildKind = 'official-engine-source-web';
  constructor(scene          , assets            ) {
    this.scene = scene;
    this.assets = assets;
    let raw = null,
      legacy = null;
    try {
      raw = cc.sys.localStorage.getItem(SAVE_KEY);
      legacy = cc.sys.localStorage.getItem(LEGACY_KEY);
    } catch {}
    this.progress = loadProgress(raw, legacy);
    if (raw === null && host.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
      this.progress.reducedMotion = true;
    this.run = createRun({ seed: 4729, departure: this.progress.selected });
    pauseRun(this.run);
    this.world = new World(scene, assets.models, assets.facades);
    this.hud = new Hud(scene);
    const sound = new cc.Node('Sound feedback');
    scene.addChild(sound);
    this.sound = sound.addComponent(cc.AudioSource);
    try {
      this.legacyLink = new URL(host.location.href).searchParams.has('chaseChallenge');
    } catch {}
    this.installInput();
    this.resize();
    this.ready = true;
    this.syncHost();
    // Read-only semantic diagnostics describe visible controls; mutation is dev-gated separately.
    host.__chase = { snapshot: () => this.snapshot() };
    if (host.SmallGamesDev?.isEnabled()) {
      host.__chaseDev = {
        snapshot: () => this.snapshot(true),
        setManual: (v         ) => {
          this.manual = !!v;
          markPractice(this.run);
        },
        advance: (seconds        ) => {
          markPractice(this.run);
          if (this.screen === 'running') {
            updateRun(this.run, Math.max(0, Math.min(120, seconds)));
            this.afterStep();
          }
        },
        invincible: (v         ) => {
          markPractice(this.run);
          this.run.invincible = !!v;
        },
        jumpTo: (metres        ) => {
          if (!Number.isFinite(metres) || metres < 0) return;
          markPractice(this.run);
          this.run.invincible = true;
          updateRun(this.run, Math.max(0, Math.min(120, (metres - this.run.s) / this.run.speed)));
          this.afterStep();
        },
      };
      const actions = [
        {
          id: 'invincible',
          label: '切换无敌试玩',
          run: () => {
            markPractice(this.run);
            this.run.invincible = !this.run.invincible;
          },
        },
        ...DISTRICTS.map((id) => ({
          id: 'district-' + id,
          label: '试玩 · ' + DISTRICT_NAMES[id],
          run: () => {
            this.progress.selected = id;
            this.start(true);
          },
        })),
      ];
      const a = host.SmallGamesDev.registerActions(actions),
        b = host.SmallGamesDev.registerSnapshot(() => this.snapshot(true));
      if (typeof a === 'function') this.removers.push(a);
      if (typeof b === 'function') this.removers.push(b);
    }
  }
  persist() {
    if (!this.progress.writable) return;
    try {
      cc.sys.localStorage.setItem(SAVE_KEY, JSON.stringify(this.progress));
    } catch {}
  }
  play(name        , volume = 0.45) {
    if (this.progress.sound && this.assets.audio[name])
      this.sound.playOneShot(this.assets.audio[name], volume);
  }
  resize() {
    const canvas = host.document?.getElementById('GameCanvas');
    const ratio = canvas
      ? canvas.clientHeight / Math.max(1, canvas.clientWidth)
      : cc.view.getVisibleSize().height / Math.max(1, cc.view.getVisibleSize().width);
    this.height = Math.max(660, Math.min(950, 390 * ratio));
    this.width = 390;
    cc.view.setDesignResolutionSize(this.width, this.height, cc.ResolutionPolicy.SHOW_ALL);
    this.hud.resize(this.width, this.height);
    this.activeTouch = null;
    this.startPoint = null;
    this.pressed = null;
  }
  syncHost() {
    if (host.document) {
      host.document.body.dataset.phase = this.screen;
      host.document.body.dataset.ready = String(this.ready);
    }
    if (host.parent && host.parent !== host) {
      try {
        host.parent.postMessage(
          {
            type: 'small-games:display-state',
            gameId: 'chase-thief',
            screen:
              ['running', 'paused', 'result'].includes(this.screen) ||
              (this.screen === 'settings' && this.backTo === 'paused')
                ? 'playing'
                : 'home',
          },
          new URL(host.document.referrer).origin,
        );
      } catch {}
    }
  }
  show(screen        ) {
    this.screen = screen;
    this.activeTouch = null;
    this.startPoint = null;
    this.pressed = null;
    this.hud.key = '';
    this.syncHost();
  }
  start(practice = false) {
    this.run = createRun({
      seed: ((Date.now() >>> 0) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0,
      departure: this.progress.selected,
      practice,
    });
    this.manual = false;
    this.lastFoot = 0;
    this.lastDistrict = '';
    this.toast = '';
    this.toastTime = 0;
    this.resultNewRecord = false;
    this.world.reset(this.run);
    this.show('running');
    this.play('click');
  }
  command(id        ) {
    if (this.disposed) return;
    this.inputCount++;
    this.play('click', 0.2);
    if (id === 'start' || id === 'retry') this.start();
    else if (id === 'home') {
      pauseRun(this.run);
      this.run = createRun({ seed: 4729, departure: this.progress.selected });
      pauseRun(this.run);
      this.world.reset(this.run);
      this.show('home');
    } else if (id === 'pause') this.pause();
    else if (id === 'resume') {
      resumeRun(this.run);
      this.show('running');
    } else if (id === 'districts') this.show('districts');
    else if (id === 'settings' || id === 'help') {
      this.backTo = this.screen;
      this.show(id);
    } else if (id === 'back') this.show(this.backTo);
    else if (id.startsWith('choose:')) {
      this.progress.selected = id.slice(7);
      this.persist();
      this.hud.key = '';
    } else if (id.startsWith('toggle:')) {
      const k = id.slice(7);
      this.progress[k] = !this.progress[k];
      this.persist();
      this.hud.key = '';
    } else if (id === 'fullscreen') this.fullscreen();
    else if (['left', 'right', 'jump', 'slide'].includes(id)) this.action(id);
  }
  action(action        ) {
    if (this.screen === 'running' && act(this.run, action       )) {
      this.inputCount++;
      if (action === 'jump' || action === 'slide') this.play(action);
    }
  }
  pause() {
    if (this.screen !== 'running') return;
    pauseRun(this.run);
    this.sound.stop();
    this.show('paused');
  }
  fullscreen() {
    const d = host.document;
    if (!d) return;
    d.querySelector('[data-game-fullscreen]')?.click();
  }
  installInput() {
    const bind = (type     , fn     ) => {
      cc.input.on(type, fn, this);
      this.removers.push(() => cc.input.off(type, fn, this));
    };
    const point = (e     ) => {
      const p = e.getUILocation();
      return { x: p.x, y: this.height - p.y };
    };
    bind(cc.Input.EventType.TOUCH_START, (e               ) => {
      if (this.activeTouch !== null) return;
      this.activeTouch = e.getID();
      this.startPoint = point(e);
      this.pressed = this.hud.at(this.startPoint.x, this.startPoint.y);
    });
    bind(cc.Input.EventType.TOUCH_END, (e               ) => {
      if (e.getID() !== this.activeTouch) return;
      const p = point(e),
        a = this.startPoint,
        pressed = this.pressed;
      this.activeTouch = null;
      this.startPoint = null;
      this.pressed = null;
      if (!a) return;
      if (pressed) {
        if (this.hud.at(p.x, p.y)?.id === pressed.id) this.command(pressed.id);
        return;
      }
      const dx = p.x - a.x,
        dy = p.y - a.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
      this.action(
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'slide' : 'jump',
      );
    });
    bind(cc.Input.EventType.TOUCH_CANCEL, (e               ) => {
      if (e.getID() === this.activeTouch) {
        this.activeTouch = null;
        this.startPoint = null;
        this.pressed = null;
      }
    });
    // Cocos maps mouse down/up to touch events; a second mouse handler would activate controls twice.
    bind(cc.Input.EventType.KEY_DOWN, (e                  ) => {
      const map = {
        37: 'left',
        65: 'left',
        39: 'right',
        68: 'right',
        38: 'jump',
        87: 'jump',
        32: 'jump',
        40: 'slide',
        83: 'slide',
      };
      if (map[e.keyCode]) this.action(map[e.keyCode]);
      else if (e.keyCode === 27) {
        if (this.screen === 'running') this.pause();
        else if (this.screen === 'paused') this.command('resume');
      } else if (e.keyCode === 13 && ['home', 'result'].includes(this.screen)) this.start();
    });
    const hide = () => this.pause();
    cc.game.on(cc.Game.EVENT_HIDE, hide, this);
    this.removers.push(() => cc.game.off(cc.Game.EVENT_HIDE, hide, this));
    if (host.addEventListener) {
      const resize = () => this.resize(),
        blur = () => {
          this.activeTouch = null;
          this.startPoint = null;
          this.pause();
        };
      const visibility = () => {
        if (host.document.hidden) blur();
      };
      host.addEventListener('resize', resize);
      host.addEventListener('blur', blur);
      host.document.addEventListener('visibilitychange', visibility);
      host.document.addEventListener('game-displaychange', resize);
      this.removers.push(
        () => host.document.removeEventListener('game-displaychange', resize),
        () => host.removeEventListener('resize', resize),
        () => host.removeEventListener('blur', blur),
        () => host.document.removeEventListener('visibilitychange', visibility),
      );
    }
  }
  afterStep() {
    for (const e of drainEvents(this.run)) {
      if (e.type === 'pickup') this.play('coin', 0.25);
      if (e.type === 'collision') {
        this.play('hit', 0.6);
        if (this.progress.haptics) host.navigator?.vibrate?.(35);
      }
      if (e.type === 'clear' && this.run.combo > 1) {
        this.toast = '漂亮！连续动作 ×' + this.run.combo;
        this.toastTime = 1.1;
      }
      if (e.type === 'fork-clear') {
        this.toast = '穿过街口 · 追回掉落物';
        this.toastTime = 1.7;
      }
    }
    if (this.run.phase === 'lost' && this.screen === 'running') {
      this.resultNewRecord =
        !this.run.practice && this.run.s > (this.progress.best[this.run.departure]?.distance || 0);
      this.progress = recordRun(this.progress, this.run);
      this.persist();
      this.play('hit', 0.7);
      this.show('result');
    }
  }
  update(dt        ) {
    if (!this.ready || this.disposed) return;
    dt = Math.min(0.1, Math.max(0, dt));
    if (this.screen === 'running') {
      if (!this.manual) updateRun(this.run, dt);
      this.afterStep();
      this.toastTime = Math.max(0, this.toastTime - dt);
      if (!this.toastTime) this.toast = '';
      if (this.run.s - this.lastFoot > 3.0 && this.run.action === 'run') {
        this.lastFoot = this.run.s;
        this.play('step', 0.12);
      }
    }
    this.ambient += dt;
    const district = sampleRoute(this.run.s, this.run.seed, this.run.departure).district;
    this.world.update(this.run, dt, this.screen === 'home', this.progress.reducedMotion);
    this.hud.draw({
      screen: this.screen,
      progress: this.progress,
      run: this.run,
      district,
      toast: this.toast,
      resultNewRecord: this.resultNewRecord,
      legacyLink: this.legacyLink,
      fullscreen: !!host.document?.fullscreenElement,
      canFullscreen: !!host.document?.documentElement?.requestFullscreen,
    });
    if (host.document) {
      const b = host.document.body;
      b.dataset.lane = String(this.run.lane);
      b.dataset.action = this.run.action;
    }
  }
  snapshot(deep = false) {
    const r = this.run;
    return {
      ready: this.ready,
      engine: 'Cocos Engine 3.8.8',
      buildKind: this.buildKind,
      screen: this.screen,
      width: this.width,
      height: this.height,
      inputCount: this.inputCount,
      controls: this.hud.controls.map((c) => ({ ...c })),
      phase: r.phase,
      distance: r.s,
      lane: r.lane,
      laneVisual: r.laneVisual,
      action: r.action,
      health: r.health,
      coins: r.coins,
      combo: r.combo,
      practice: r.practice,
      seed: r.seed,
      departure: r.departure,
      district: sampleRoute(r.s, r.seed, r.departure).district,
      world: this.world.stats(),
      best: this.progress.best,
      legacyBest: this.progress.legacyBest,
      ...(deep ? { run: JSON.parse(JSON.stringify(r)) } : {}),
    };
  }
  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    for (const fn of this.removers) fn();
    this.sound.stop();
    this.sound.node.destroy();
    this.world.destroy();
    this.hud.destroy();
    delete host.__chase;
    delete host.__chaseDev;
  }
}
