import {
  _decorator,
  Component,
  input,
  Input,
  EventTouch,
  EventMouse,
  EventKeyboard,
  KeyCode,
  game,
  Game,
  view,
  AudioSource,
  AudioClip,
  resources,
  Material,
  Label,
} from 'cc';
import {
  createGame,
  createEndlessGame,
  step,
  rotate,
  brake,
  refillBrake,
  resumeCheckpoint,
  getLanding,
  RANKED_RULE_VERSION,
} from './core/engine.js';
import { LEVELS, CHAPTERS, environmentAt, createEndlessLayer } from './core/levels.js';
import { readProgress, saveProgress, recordWin } from './core/progress.js';
import { TowerUI, W, C } from './TowerUI';
import { TowerWorld } from './TowerWorld';
const { ccclass, property } = _decorator;
const web = globalThis as any;
const STEP = 1 / 120;
@ccclass('TowerBrake')
export class TowerBrake extends Component {
  @property(Material) surface: Material | null = null;
  ui!: TowerUI;
  world!: TowerWorld;
  state: any;
  progress: any;
  storage: any;
  screen = 'home';
  selected = 0;
  chapter = 0;
  practice = false;
  challenge = false;
  challengeIndex = -1;
  targetScore = 0;
  clock = 0;
  accumulator = 0;
  toast = '';
  toastLeft = 0;
  pressed = '';
  pointer = -1;
  lastX = 0;
  touched = -10;
  generation = 0;
  rewardToken = 0;
  rewardPending = false;
  rewardPort: any = null;
  pauseOnStart = false;
  previewSegment = 0;
  environmentName = '';
  rankStatus = 'local';
  boardText = '';
  clips = new Map<string, AudioClip>();
  audio!: AudioSource;
  windAudio!: AudioSource;
  unlockAudio = false;
  onLoad() {
    try {
      this.storage = web.localStorage;
    } catch {}
    this.progress = readProgress(this.storage, LEVELS);
    this.selected = this.progress.selected;
    this.ui = new TowerUI(this.node);
    this.world = new TowerWorld(this.node, this.surface!);
    this.state = createGame(LEVELS[this.selected]);
    this.audio = this.node.addComponent(AudioSource);
    this.windAudio = this.node.addComponent(AudioSource);
    for (const name of ['pass', 'brake', 'bounce', 'lost', 'won', 'wind'])
      resources.load(name, AudioClip, (err, clip) => {
        if (err || !this.isValid) return;
        this.clips.set(name, clip);
        if (name === 'wind') {
          this.windAudio.clip = clip;
          this.windAudio.loop = true;
        }
      });
    const params = new URLSearchParams(web.location?.search || '');
    if (params.get('challenge') === 'tower-v1') {
      this.challengeIndex = LEVELS.findIndex((l: any) => l.id === params.get('level'));
      this.targetScore = Math.max(0, Math.min(100000, Number(params.get('targetScore')) || 0));
    }
    input.on(Input.EventType.TOUCH_START, this.touchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.touchMove, this);
    input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.cancel, this);
    input.on(Input.EventType.MOUSE_DOWN, this.mouseDown, this);
    input.on(Input.EventType.MOUSE_MOVE, this.mouseMove, this);
    input.on(Input.EventType.MOUSE_UP, this.mouseUp, this);
    input.on(Input.EventType.KEY_DOWN, this.keyDown, this);
    game.on(Game.EVENT_HIDE, this.hide, this);
    view.on('canvas-resize', this.resize, this);
    web.addEventListener?.('blur', this.hide);
    web.addEventListener?.('pagehide', this.pageHide);
    web.document?.addEventListener('visibilitychange', this.visibility);
    web.__tower = Object.freeze({ snapshot: () => this.snapshot() });
    web.__towerHost?.connect({
      action: (id: string) => this.action(id),
      snapshot: () => this.snapshot(),
      version: RANKED_RULE_VERSION,
      status: (s: string) => {
        this.rankStatus = s;
      },
    });
    web.SmallGamesDev?.registerSnapshot(() => this.snapshot());
    if (web.SmallGamesDev?.isEnabled())
      web.SmallGamesDev.registerActions([
        {
          id: 'tower-next',
          label: '试玩下一关',
          run: () => this.beginRun((this.selected + 1) % LEVELS.length, false, true),
        },
        {
          id: 'tower-clouds',
          label: '试玩云海 · 第23关',
          run: () => this.beginRun(22, false, true),
        },
        {
          id: 'tower-atmosphere',
          label: '无尽大气过渡 · 试玩',
          run: async () => {
            await this.beginRun(0, true, true);
            this.fixtureDepth(60 + (this.previewSegment++ % 6) * 72);
          },
        },
      ]);
    this.draw();
    web.document?.getElementById('tower-loading')?.remove();
  }
  resize = () => {
    this.cancel();
    this.ui.resize();
    this.draw();
  };
  visibility = () => {
    if (web.document?.hidden) this.hide();
  };
  hide = () => {
    if (this.screen === 'connecting') this.pauseOnStart = true;
    if (this.screen === 'playing') this.pause();
    this.cancel();
    this.audio?.stop();
    this.windAudio?.stop();
  };
  pageHide = () => {
    this.cancelReward();
    this.hide();
  };
  cancelReward() {
    ++this.rewardToken;
    const port = this.rewardPort;
    this.rewardPort = null;
    this.rewardPending = false;
    port?.cancel?.();
  }
  async requestRefill() {
    const state = this.state, port = web.SmallGamesRewardAds;
    if (this.rewardPending || this.screen !== 'paused' || state.status !== 'playing' ||
        state.charge !== 0 || state.rewardRefillUsed) return;
    if (!port?.available) {
      this.say('补给暂不可用 · 可继续免费游玩');
      this.draw();
      return;
    }
    const token = ++this.rewardToken;
    this.rewardPending = true;
    this.rewardPort = port;
    this.say('正在准备补给 · 可取消');
    this.draw();
    let status = 'failed';
    try { status = (await port.offer({ id: 'tower-brake:refill' }))?.status; } catch {}
    if (token !== this.rewardToken || this.state !== state || this.screen !== 'paused') return;
    this.rewardPending = false;
    this.rewardPort = null;
    if (status === 'completed' && refillBrake(state)) {
      web.__towerHost?.invalidate('practice');
      this.say('刹车已补满 · 本局不计纪录，点击继续');
    } else this.say(status === 'dismissed' ? '已取消 · 未获得补给' : '未获得补给 · 可继续游玩');
    this.draw();
  }
  save() {
    if (!this.practice && !this.challenge && !web.SmallGamesDev?.isEnabled())
      saveProgress(this.storage, this.progress);
  }
  say(message: string, seconds = 2.6) {
    this.toast = message;
    this.toastLeft = seconds;
  }
  sound(name: string) {
    const clip = this.clips.get(name);
    if (clip && this.progress.sound && this.unlockAudio)
      this.audio.playOneShot(clip, name === 'bounce' ? 0.22 : 0.45);
  }
  async beginRun(index: number, endless = false, practice = false, challenge = false) {
    this.cancelReward();
    if (this.screen === 'connecting') return;
    const token = ++this.generation;
    this.cancel();
    this.practice = practice || !!web.SmallGamesDev?.isEnabled();
    this.challenge = challenge;
    this.selected = Math.max(
      0,
      Math.min(this.practice || challenge ? 29 : this.progress.unlocked - 1, index),
    );
    this.pauseOnStart = false;
    this.screen = 'connecting';
    this.draw();
    const run = await web.__towerHost?.start({
      mode: endless ? 'endless' : 'campaign',
      levelId: endless ? undefined : LEVELS[this.selected].id,
      practice: this.practice || challenge,
    });
    if (token !== this.generation) return;
    this.state = endless ? createEndlessGame(run?.seed ?? 0) : createGame(LEVELS[this.selected]);
    this.world.level = null;
    this.state.paused = this.pauseOnStart || !!web.document?.hidden;
    this.screen = this.state.paused ? 'paused' : 'playing';
    this.accumulator = 0;
    this.environmentName = this.state.environment.name;
    if (!endless && !this.practice && !this.challenge) {
      this.progress.selected = this.selected;
      this.save();
    }
    this.say(
      `${this.environmentName} · 球体 ${Math.round((this.state.ballRadius / 12) * 100)}% · 速度 ${Math.round(this.state.speedScale * 100)}%`,
      3.5,
    );
    this.draw();
  }
  // Development-only visual fixture never records progress or ranked input.
  fixtureDepth(floor: number) {
    if (!web.SmallGamesDev?.isEnabled() || !this.practice || this.state.mode !== 'endless') return;
    const s = this.state;
    s.level.layers = Array.from({ length: 24 }, (_, i) => createEndlessLayer(floor + i, s.seed));
    s.layerOffset = floor;
    s.nextLayer = 0;
    s.totalFloors = floor;
    s.rewardedThrough = floor - 1;
    s.y = s.level.layers[0].y - 12;
    s.environment = environmentAt(s.level, s.y);
    s.ballRadius = s.environment.radius;
    s.y = s.level.layers[0].y - s.ballRadius;
    s.speedScale = s.environment.speed;
    s.lastCheckpoint = null;
    this.world.level = null;
  }
  action(id: string) {
    this.unlockAudio = true;
    if (id === 'reward-refill') { void this.requestRefill(); return; }
    if (id === 'reward-cancel') {
      this.cancelReward();
      this.say('已取消 · 未获得补给');
      this.draw();
      return;
    }
    this.cancelReward();
    if (id === 'retry-assets') {
      this.ui.load();
      return;
    }
    if (id === 'start') {
      void this.beginRun(this.selected);
      return;
    }
    if (id === 'endless') {
      void this.beginRun(0, true);
      return;
    }
    if (id === 'challenge') {
      void this.beginRun(this.challengeIndex, false, false, true);
      return;
    }
    if (id.startsWith('level-')) {
      const i = Number(id.slice(6));
      if (Number.isInteger(i) && i >= 0 && i < this.progress.unlocked) void this.beginRun(i);
      return;
    }
    if (id.startsWith('chapter-')) {
      this.chapter = Number(id.slice(8));
      this.draw();
      return;
    }
    if (id === 'pause') {
      this.pause();
      return;
    }
    if (id === 'resume') {
      this.state.paused = false;
      this.screen = 'playing';
      this.accumulator = 0;
      this.cancel();
    } else if (id === 'home') {
      ++this.generation;
      web.__towerHost?.invalidate();
      this.screen = 'home';
      this.practice = this.challenge = false;
      this.selected = Math.min(this.progress.selected, this.progress.unlocked - 1);
      this.state = createGame(LEVELS[this.selected]);
      this.world.level = null;
      this.cancel();
    } else if (['levels', 'help', 'settings'].includes(id)) {
      this.screen = id;
      this.chapter = Math.max(
        0,
        CHAPTERS.findIndex((c: any) => this.selected + 1 <= c.to),
      );
    } else if (id === 'retry') {
      void this.beginRun(
        this.selected,
        this.state.mode === 'endless',
        this.practice,
        this.challenge,
      );
    } else if (id === 'next') {
      void this.beginRun(this.selected + 1);
    } else if (id === 'continue' && resumeCheckpoint(this.state)) {
      web.__towerHost?.invalidate('practice');
      this.screen = 'playing';
      this.accumulator = 0;
      this.world.level = null;
      this.say('免费续关 · 本局不计排行榜');
    } else if (id === 'brake' && brake(this.state)) {
      web.__towerHost?.record({ brake: true }, 0);
      this.sound('brake');
      this.say('刹车 0.8秒 · 现在转动轨道', 1.2);
    } else if (id === 'sound') {
      this.progress.sound = !this.progress.sound;
      if (!this.progress.sound) {
        this.audio.stop();
        this.windAudio.stop();
      }
      this.save();
    } else if (id === 'motion') {
      this.progress.reducedMotion = !this.progress.reducedMotion;
      this.save();
    } else if (id.startsWith('skin-')) {
      const skin = id.slice(5);
      if (['mint', 'amber', 'ice'].includes(skin)) {
        this.progress.skin = skin;
        this.save();
      }
    } else if (id === 'share') {
      void web.__towerHost
        ?.share(LEVELS[this.selected].id, this.state.score)
        .then((message: string) => this.say(message));
    } else if (id === 'boards' || id === 'board-campaign' || id === 'board-endless') {
      this.screen = 'boards';
      this.boardText = '正在读取成绩…';
      const board = id === 'board-campaign' ? 'campaign' : 'endless';
      void web.__towerHost?.leaderboard(board).then((text: string) => {
        this.boardText = text;
      });
    }
    this.draw();
  }
  pause() {
    if (this.screen !== 'playing') return;
    this.state.paused = true;
    this.screen = 'paused';
    this.accumulator = 0;
    this.cancel();
    this.windAudio.stop();
    this.draw();
  }
  turn(delta: number) {
    if (this.screen === 'playing' && rotate(this.state, delta))
      web.__towerHost?.record({ rotation: delta }, 0);
  }
  down(x: number, y: number, id: number) {
    this.unlockAudio = true;
    const control = this.ui.at(x, y);
    if (control) {
      this.pressed = control.id;
      this.ui.pressed = control.id;
      this.action(control.id);
      return;
    }
    if (this.screen === 'playing' && this.pointer === -1) {
      this.pointer = id;
      this.lastX = x;
    }
  }
  move(x: number, id: number) {
    if (this.pointer !== id) return;
    this.turn((-(x - this.lastX) * Math.PI * 1.7) / W);
    this.lastX = x;
  }
  cancel = () => {
    this.pointer = -1;
    this.pressed = '';
    if (this.ui) this.ui.pressed = '';
  };
  touchStart(e: EventTouch) {
    this.touched = this.clock;
    const p = e.getUILocation();
    this.down(p.x, this.ui.H - p.y, e.getID() ?? 0);
  }
  touchMove(e: EventTouch) {
    this.move(e.getUILocation().x, e.getID() ?? 0);
  }
  touchEnd(e: EventTouch) {
    if ((e.getID() ?? 0) === this.pointer) this.cancel();
    this.ui.pressed = '';
  }
  mouseDown(e: EventMouse) {
    if (this.clock - this.touched < 0.7 || e.getButton() !== 0) return;
    const p = e.getUILocation();
    this.down(p.x, this.ui.H - p.y, -2);
  }
  mouseMove(e: EventMouse) {
    this.move(e.getUILocation().x, -2);
  }
  mouseUp() {
    this.cancel();
  }
  keyDown(e: EventKeyboard) {
    if (e.keyCode === KeyCode.ESCAPE) {
      if (this.screen === 'playing') this.pause();
      else if (this.screen === 'paused') this.action('resume');
    }
    if (this.screen !== 'playing') return;
    if (e.keyCode === KeyCode.SPACE) this.action('brake');
    if ([KeyCode.ARROW_LEFT, KeyCode.KEY_A].includes(e.keyCode)) this.turn(0.18);
    if ([KeyCode.ARROW_RIGHT, KeyCode.KEY_D].includes(e.keyCode)) this.turn(-0.18);
  }
  update(dt: number) {
    this.clock += dt;
    this.toastLeft = Math.max(0, this.toastLeft - dt);
    if (this.screen === 'playing') {
      this.accumulator += Math.min(dt, 0.1);
      while (this.accumulator >= STEP && this.state.status === 'playing') {
        step(this.state, STEP);
        web.__towerHost?.record({}, 1);
        this.accumulator -= STEP;
      }
      for (const event of this.state.events.splice(0)) {
        if (['pass', 'bounce', 'lost', 'won'].includes(event.type)) {
          this.sound(event.type);
          this.world.bump(event.type);
        }
        if (event.type === 'pass' && event.streak > 1)
          this.say(`连穿 ${event.streak} 层 · +${event.points}`, 1);
        if (event.type === 'charge') this.say('连穿成功 · 刹车已补充', 1.7);
        if (event.type === 'pickup')
          this.say(
            event.kind === 'shield'
              ? '护盾就绪 · 抵挡一次危险碰撞'
              : event.kind === 'slow'
                ? '缓降 4秒 · 从容找准缺口'
                : '拾取补给 · 刹车就绪',
            2.3,
          );
        if (event.type === 'shield-hit') this.say('护盾挡住了撞击', 1.5);
      }
      if (this.environmentName !== this.state.environment.name) {
        this.environmentName = this.state.environment.name;
        this.say(`进入${this.environmentName} · 球体与速度正在变化`, 4);
      }
      if (this.state.status !== 'playing') this.finish();
    }
    const paused = this.screen === 'paused';
    if (!paused) {
      this.world.update(
        this.state,
        dt,
        this.progress.reducedMotion,
        this.progress.skin,
        this.screen !== 'playing',
      );
      this.ui.background(
        this.state.environment,
        this.world.time,
        this.progress.reducedMotion,
        this.world.distance,
      );
    }
    const environment = this.state.environment;
    const wind = Math.min(
      1,
      environment.from + (environment.to - environment.from) * environment.blend,
    );
    this.windAudio.volume = this.screen === 'playing' && this.progress.sound ? wind * 0.14 : 0;
    if (
      this.unlockAudio &&
      this.windAudio.volume > 0 &&
      this.windAudio.clip &&
      !this.windAudio.playing
    )
      this.windAudio.play();
    this.draw();
  }
  finish() {
    this.screen = 'result';
    this.cancel();
    void web.__towerHost?.finish();
    if (this.state.status === 'won')
      recordWin(this.progress, this.selected, LEVELS[this.selected].id, this.state, {
        practice: this.practice || this.challenge,
      });
    if (this.state.mode === 'endless' && !this.practice && !this.challenge && !this.state.rewardRefillUsed)
      this.progress.endlessBest = Math.max(this.progress.endlessBest, this.state.totalFloors);
    this.save();
  }
  title(text: string, subtitle: string) {
    this.ui.text('title', text, W / 2, 64, 31);
    this.ui.text('subtitle', subtitle, W / 2, 105, 14);
  }
  draw() {
    if (!this.ui) return;
    const u = this.ui,
      h = u.H,
      s = this.state;
    u.begin();
    if (!u.ready) {
      this.title('穿云落星', '正在打开天空');
      if (u.error) u.button('retry-assets', u.error, 26, h / 2, 308);
      u.end();
      return;
    }
    if (this.screen === 'home') {
      this.title('穿云落星', '转动轨道，穿云而下');
      const primaryH = Math.max(60, u.hitSize),
        row = u.hitSize + 12;
      const startY = h - 50 - 2 * row - primaryH - 12;
      u.text(
        'home-chapter',
        `${CHAPTERS.find((c: any) => this.selected + 1 <= c.to)?.name}  /  第 ${this.selected + 1} 关`,
        180,
        145,
        15,
      );
      u.text(
        'home-best',
        `已抵达 ${this.progress.unlocked} / 30 关 · 无尽纪录 ${this.progress.endlessBest} 层`,
        180,
        startY - 24,
        13,
      );
      u.button('start', '开始旅程', 42, startY, 276, primaryH, true);
      u.button('endless', '无尽下落', 42, startY + primaryH + 12, 276);
      for (const [i, item] of [
        ['levels', '航线'],
        ['help', '指南'],
        ['settings', '设置'],
      ].entries())
        u.button(item[0], item[1], 24 + i * 108, h - 50 - u.hitSize, 96);
      if (this.challengeIndex >= 0) u.button('challenge', '好友航线挑战', 66, 183, 228);
      else if (web.__towerHost?.available) u.button('boards', '航行榜', 244, 185, 98);
      u.text('home-foot', '滑动转塔 · 避开红色 · 连穿三层补刹车', 180, h - 28, 12);
    } else if (this.screen === 'levels') {
      this.title('选择航线', '30段短旅程，每关停留在一种天空');
      CHAPTERS.forEach((c: any, i: number) =>
        u.button(
          'chapter-' + i,
          ['星际', '稀薄', '中层', '表层'][i],
          12 + i * 87,
          137,
          81,
          52,
          this.chapter === i,
        ),
      );
      const chapter = CHAPTERS[this.chapter];
      u.text('chapter-name', chapter.name, 180, 137 + u.hitSize + 20, 16);
      for (let i = chapter.from - 1; i < chapter.to; i++) {
        const n = i - chapter.from + 1;
        u.button(
          'level-' + i,
          `${i + 1}${this.progress.best[LEVELS[i].id] ? ' ★' : ''}`,
          33 + (n % 3) * 102,
          137 + u.hitSize + 40 + Math.floor(n / 3) * (Math.max(58, u.hitSize) + 12),
          90,
          58,
          i === this.selected,
          i >= this.progress.unlocked,
        );
      }
      u.text(
        'chapter-info',
        this.chapter === 0
          ? '第5关解锁护盾'
          : this.chapter === 1
            ? '第9关侧风 · 第13关刹车补给'
            : this.chapter === 2
              ? '第17关缓降 · 第19关薄雾'
              : '雨雪与云海 · 大球低速下落',
        180,
        h - 123,
        15,
      );
      u.button('home', '返回启程', 66, h - 99, 228);
    } else if (this.screen === 'playing' || this.screen === 'paused' || this.screen === 'result') {
      if (this.screen !== 'result') {
        u.panel(14, 20, 258, 64, '#10273bbd');
        u.text(
          'score',
          s.mode === 'endless'
            ? `${s.totalFloors} 层 · ${s.score} 分`
            : `第${this.selected + 1}关 · ${s.score} 分`,
          139,
          42,
          22,
          238,
        );
        u.text(
          'progress',
          `${s.environment.name}  ·  ${s.mode === 'endless' ? '持续下行' : Math.min(12, s.nextLayer + 1) + ' / 12层'}`,
          139,
          68,
          13,
          238,
        );
      }
      if (this.screen === 'playing') {
        u.pause(290, 24);
        u.radar(getLanding(s), 308, 139);
        u.text(
          'physics',
          `球体 ${Math.round((s.ballRadius / 12) * 100)}%  ·  速度 ${Math.round(s.speedScale * 100)}%`,
          122,
          108,
          13,
          210,
        );
        u.text(
          'wind',
          Math.abs(s.wind) < 0.003
            ? '气流平静'
            : `${s.wind > 0 ? '←' : '→'} 侧风 · ${Math.abs(s.wind) > 0.03 ? '渐强' : '轻柔'}`,
          111,
          133,
          13,
          190,
        );
        u.text(
          'buffs',
          `${s.shield ? '◈ 护盾就绪' : ''}${s.slowLeft > 0 ? '  缓降 ' + s.slowLeft.toFixed(1) + '秒' : ''}`,
          180,
          h - 184,
          16,
        );
        u.brake(h - 108, s.charge, s.brakeLeft);
        u.text(
          'gesture',
          this.practice
            ? '开发试玩 · 不保存、不计榜'
            : this.challenge
              ? `好友挑战 · 目标 ${this.targetScore}分`
              : '左右滑动转塔  ·  红色区域不可碰',
          180,
          h - 28,
          12,
        );
      }
      if (this.screen !== 'playing') {
        const paused = this.screen === 'paused',
          won = s.status === 'won';
        const next = won && !this.practice && !this.challenge && this.selected < 29;
        const actions = [
          {
            id: paused ? 'resume' : next ? 'next' : 'retry',
            label: paused ? '继续下落' : next ? '下一段航线' : '再试一次',
          },
        ];
        if (paused) {
          if (this.rewardPending) actions.push({ id: 'reward-cancel', label: '取消补给' });
          else if (s.charge === 0 && !s.rewardRefillUsed)
            actions.push({ id: 'reward-refill', label: '观看后补满刹车 · 本局一次' });
          actions.push({ id: 'retry', label: '重新开始' });
        }
        else if (!won && s.mode !== 'endless' && !s.continued)
          actions.push({ id: 'continue', label: '免费续关 · 本局一次' });
        else if (s.mode !== 'endless' && !this.practice)
          actions.push({ id: 'share', label: '分享这段航线' });
        actions.push({ id: 'home', label: '返回航程' });
        const buttonH = Math.max(56, u.hitSize),
          panelH = 148 + actions.length * (buttonH + 12) + 12;
        const top = (h - panelH) / 2 + 18;
        u.panel(0, 0, W, h, '#07122470', '', 0);
        u.panel(26, top, 308, panelH, '#142239f5', C.border, 20);
        u.text(
          'overlay-title',
          paused ? '旅程暂停' : won ? '穿云成功' : '旅程结束',
          180,
          top + 38,
          26,
        );
        u.text(
          'overlay-info',
          paused ? '准备好，再继续启程' : `${s.score} 分`,
          180,
          top + 84,
          paused ? 16 : 32,
          280,
          paused ? C.white : C.jade,
        );
        u.text(
          'overlay-detail',
          paused
            ? this.rewardPending ? '准备补给中 · 完成观看才领取' : s.rewardRefillUsed ? '补给已使用 · 本局不计纪录' : '天空会等你 · 补给局不计纪录'
            : `${s.mode === 'endless' ? s.totalFloors + '层' : '第' + (this.selected + 1) + '关'}  ·  连穿最高 ${s.maxStreak} 层`,
          180,
          top + 120,
          14,
          280,
          C.muted,
        );
        actions.forEach((action, i) =>
          u.button(
            action.id,
            action.label,
            50,
            top + 148 + i * (buttonH + 12),
            260,
            buttonH,
            i === 0,
          ),
        );
      }
    } else if (this.screen === 'settings') {
      this.title('航行设置', '让手感与节奏适合你');
      u.panel(20, 154, 320, 360, '#11283be8', C.border);
      u.button('sound', `声音：${this.progress.sound ? '开' : '关'}`, 42, 180, 276);
      u.button(
        'motion',
        `减少动态：${this.progress.reducedMotion ? '开' : '关'}`,
        42,
        196 + u.hitSize,
        276,
      );
      const skinY = 260 + 2 * u.hitSize;
      u.text('skin-label', '球体外观 · 全部免费', 180, skinY - 30, 18);
      ['mint', 'amber', 'ice'].forEach((v, i) =>
        u.button(
          'skin-' + v,
          ['星光', '琥珀', '冰晶'][i],
          34 + i * 100,
          skinY,
          92,
          58,
          this.progress.skin === v,
        ),
      );
      u.text(
        'save-note',
        '进度保存在本机，清理浏览器数据会丢失',
        180,
        Math.max(473, skinY + u.hitSize + 24),
        12,
        300,
      );
      u.button('home', '返回启程', 66, h - 99, 228);
    } else if (this.screen === 'help') {
      this.title('下落指南', '找到缺口，让星光一路向下');
      u.panel(18, 145, 324, h - 270, '#10263eea', C.border);
      const lines = [
        '左右滑动 / 方向键：旋转轨道',
        '轻点刹车 / 空格：定格球体0.8秒',
        '连穿3层补刹车；红色斜纹是危险',
        '护盾挡一次撞击；缓降持续4秒',
        '雷达显示下一落点，球体边缘也参与碰撞',
        '闯关同景巡游，无尽沿相邻天空循环',
        '空气改变球体与速度；风会轻推轨道',
      ];
      lines.forEach((v, i) => u.text('help-' + i, v, 180, 180 + i * 39, 14, 300));
      u.text(
        'help-scenery',
        '沿途：空间站与星链 → 飞机 → 鸟群和云海',
        180,
        Math.min(488, h - 154),
        12,
        300,
      );
      u.button('home', '返回启程', 66, h - 99, 228);
    } else if (this.screen === 'boards') {
      this.title('航行榜', '只记录服务端验证的完整挑战');
      u.button('board-campaign', '闯关榜', 30, 145, 145);
      u.button('board-endless', '无尽榜', 185, 145, 145);
      u.panel(20, 217, 320, h - 345, '#10263eee', C.border);
      u.text('board-list', this.boardText, 180, (h - 128 + 217) / 2, 16, 292, C.white, h - 365);
      u.button('home', '返回启程', 66, h - 99, 228);
    } else this.title('准备启程', '正在检查航线，离线也能继续');
    if (this.toastLeft > 0 && this.screen === 'playing') {
      u.panel(30, 177, 300, 42, '#10263ee8');
      u.text('toast', this.toast, 180, 198, 13, 286, C.white, 34);
    }
    u.end();
    web.__towerHost?.sync(this.snapshot());
  }
  snapshot() {
    const s = this.state,
      landing = getLanding(s);
    return {
      engine: 'Cocos Creator 3.8.8',
      screen: this.screen,
      assetReady: this.ui.ready,
      width: W,
      height: this.ui.H,
      controls: this.ui.controls.map((c) => ({ ...c })),
      practice: this.practice,
      challenge: this.challenge,
      selected: this.selected,
      unlocked: this.progress.unlocked,
      pointerActive: this.pointer !== -1,
      reducedMotion: this.progress.reducedMotion,
      sound: this.progress.sound,
      skin: this.progress.skin,
      rankStatus: this.rankStatus,
      toast: this.toastLeft > 0 ? this.toast : '',
      sightings: [...this.world.visibleNames],
      cameraReference: this.world.reference,
      sceneryDistance: this.world.distance,
      ringMeshes: Array.from(this.world.rings.values()).map((r) => r.meshes.length),
      sky: this.ui.skies.map((s) => ({
        x: s.node.position.x,
        y: s.node.position.y,
        alpha: s.color.a,
        frame: this.ui.frames.indexOf(s.spriteFrame!),
      })),
      labels: Array.from(this.ui.nodes.entries())
        .filter(([, n]) => n.active)
        .map(([id, n]) => ({
          id,
          text: n.getComponent(Label)?.string,
          x: n.position.x + W / 2,
          y: this.ui.H / 2 - n.position.y,
        })),
      environment: { ...s.environment },
      state: {
        status: s.status,
        mode: s.mode,
        y: s.y,
        v: s.v,
        rotation: s.rotation,
        elapsed: s.elapsed,
        nextLayer: s.nextLayer,
        totalFloors: s.totalFloors,
        score: s.score,
        streak: s.streak,
        maxStreak: s.maxStreak,
        charge: s.charge,
        rewardRefillUsed: s.rewardRefillUsed,
        brakeLeft: s.brakeLeft,
        ballRadius: s.ballRadius,
        speedScale: s.speedScale,
        shield: s.shield,
        slowLeft: s.slowLeft,
        continued: s.continued,
        paused: s.paused,
        wind: s.wind,
      },
      landing: landing
        ? {
            number: landing.number,
            y: landing.y,
            type: landing.type,
            rotationToGap: landing.rotationToGap,
          }
        : null,
    };
  }
  onDestroy() {
    this.cancelReward();
    ++this.generation;
    for (const [event, handler] of [
      [Input.EventType.TOUCH_START, this.touchStart],
      [Input.EventType.TOUCH_MOVE, this.touchMove],
      [Input.EventType.TOUCH_END, this.touchEnd],
      [Input.EventType.TOUCH_CANCEL, this.cancel],
      [Input.EventType.MOUSE_DOWN, this.mouseDown],
      [Input.EventType.MOUSE_MOVE, this.mouseMove],
      [Input.EventType.MOUSE_UP, this.mouseUp],
      [Input.EventType.KEY_DOWN, this.keyDown],
    ] as const)
      input.off(event, handler as any, this);
    game.off(Game.EVENT_HIDE, this.hide, this);
    view.off('canvas-resize', this.resize, this);
    web.removeEventListener?.('blur', this.hide);
    web.removeEventListener?.('pagehide', this.pageHide);
    web.document?.removeEventListener('visibilitychange', this.visibility);
    web.__towerHost?.invalidate();
    delete web.__tower;
    this.ui?.dispose();
    this.world?.dispose();
  }
}
