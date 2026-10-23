import { createMatch, shoot, step, skipTurn, chooseBot, seeded, physics } from './core.mjs';
import { layouts } from './layouts.mjs';
import { levels, chapters, getLevel, evaluateChallenges } from './levels.mjs';
import {
  readSave,
  settle,
  settleCampaign,
  isLevelUnlocked,
  nextLevel,
  totalStars,
} from './progress.mjs';
import {
  createTournament,
  createTournamentMatch,
  recordTournamentRound,
  nextTournamentRound,
  tournamentStandings,
} from './tournament.mjs';
import { draw, W, H, arena, names } from './render.mjs';

export const themes = [
  { id: 'wood', name: '初入江湖', threshold: 0, color: '#fbd58a' },
  { id: 'jade', name: '青玉少侠', threshold: 12, color: '#93e5c3' },
  { id: 'moon', name: '踏月高手', threshold: 30, color: '#bed0ff' },
  { id: 'gold', name: '金印擂主', threshold: 50, color: '#ffe68e' },
];
const copy = (value) => JSON.parse(JSON.stringify(value));
export function createGame(target, options = {}) {
  const ctx = target.renderer ? null : target.canvas.getContext('2d');
  if (!ctx && !target.renderer) throw new Error('当前设备不支持 Canvas 2D');
  const catalog = options.layouts ?? layouts;
  const app = {
    layouts: catalog,
    levels,
    chapters,
    themes,
    screen: 'home',
    state: null,
    time: 0,
    drag: null,
    save: readSave(options.save),
    buttons: [],
    fields: [],
    particles: [],
    trails: [],
    toast: '',
    reason: '',
    canShare: typeof options.share === 'function',
    invited: options.challenge ?? null,
    shareNotice: '',
    playerKnockouts: 0,
    targetShots: null,
    error: '',
    mode: 'practice',
    chapter: 0,
    chosenLevel: null,
    challengeResult: null,
    series: null,
    standings: [],
    roundResult: null,
    room: null,
    roomCode: '',
    roomSize: 2,
    turnSeconds: 10,
    remainingSeconds: null,
    onlineAvailable: Boolean(options.online?.available),
    onlineBusy: false,
    development: Boolean(options.development),
    playerNames: names,
    localDisc: 0,
    canAim: false,
    theme: 'wood',
    rewardHintUsed: false,
    rewardPending: false,
    rewardMessage: '',
    aimHint: null,
  };
  let pointer = null,
    pressed = null,
    accumulator = 0,
    botTime = 0,
    matchTime = 0,
    toastTime = 0,
    disposed = false,
    suspended = false,
    random = seeded(Date.now()),
    frames = [],
    replayFrames = [],
    replayIndex = 0,
    resultState = null,
    practice = null,
    pendingSeed = null,
    settledState = null,
    turnToken = '',
    turnElapsed = 0,
    pollTime = 0,
    polling = false,
    onlineAnimation = false,
    authoritative = null,
    displayedRevision = -1,
    serverOffset = 0,
    renderedWidth = target.canvas.width,
    renderedHeight = target.canvas.height;
  const now = options.now ?? Date.now;
  let rewardToken = 0, rewardPort = null;
  function cancelReward() {
    ++rewardToken;
    const port = rewardPort;
    rewardPort = null;
    app.rewardPending = false;
    port?.cancel?.();
  }
  function hintEligible() {
    return app.mode === 'practice' && !app.invited && app.targetShots === null &&
      !app.room && !app.series && app.state?.phase === 'aim' && app.state.active === 0;
  }
  async function requestHint() {
    if (disposed || app.rewardPending || app.screen !== 'paused' || app.rewardHintUsed || !hintEligible()) return;
    const port = globalThis.SmallGamesRewardAds, state = app.state;
    if (!port?.available) {
      app.rewardMessage = '提示暂不可用 · 拖拽预览仍免费';
      render();
      return;
    }
    const token = ++rewardToken;
    rewardPort = port;
    app.rewardPending = true;
    app.rewardMessage = '正在准备提示 · 可取消';
    render();
    let status = 'failed';
    try { status = (await port.offer({ id: 'flick-arena:practice-aim' }))?.status; } catch {}
    if (disposed || token !== rewardToken || app.state !== state || app.screen !== 'paused' || !hintEligible()) return;
    app.rewardPending = false;
    rewardPort = null;
    const move = status === 'completed' ? chooseBot(state) : null;
    if (move) {
      app.rewardHintUsed = true;
      app.aimHint = { dx: -move.x * move.power * 115, dy: -move.y * move.power * 115, shots: state.shots };
      app.rewardMessage = `提示就绪 · 力度 ${Math.round(move.power * 100)}%，继续查看虚线`;
    } else app.rewardMessage = status === 'dismissed' ? '已取消 · 未获得提示' : '未获得提示 · 拖拽预览仍免费';
    render();
  }
  const sounds = {};
  for (const cue of ['shot', 'hit', 'out', 'win']) {
    try {
      sounds[cue] = target.createSound?.(`audio/${cue}.wav`, { volume: 0.4 });
    } catch {
      /* Optional audio. */
    }
  }
  function sound(cue) {
    if (app.save.sound && !suspended) {
      try {
        sounds[cue]?.play();
      } catch {
        /* Audio cannot block play. */
      }
    }
  }
  function cancel() {
    app.drag = null;
    pointer = null;
    pressed = null;
  }
  function screen(value) {
    cancelReward();
    if (['home', 'paused'].includes(value)) for (const s of Object.values(sounds)) s?.stop();
    cancel();
    app.screen = value;
    botTime = 0;
    accumulator = 0;
    app.toast = '';
    render();
  }
  function persist() {
    if (options.development) return;
    try {
      Promise.resolve(options.saveProgress?.(copy(app.save))).catch(() => {});
    } catch {
      /* Temporary play. */
    }
  }
  function presentation() {
    const s = app.state;
    app.rewardHintEligible = hintEligible();
    if (!app.rewardHintEligible || app.aimHint?.shots !== s?.shots) app.aimHint = null;
    app.hasReplay = replayFrames.length > 0;
    if (app.mode === 'local' && s?.phase === 'aim') {
      const token = `${s.turn}:${s.shots}:${s.active}`;
      if (turnToken !== token) {
        turnToken = token;
        turnElapsed = 0;
        cancel();
      }
    }
    app.theme =
      themes.find((item) => item.id === app.save.theme && item.threshold <= totalStars(app.save))
        ?.id ?? 'wood';
    app.localDisc =
      app.mode === 'local'
        ? (s?.active ?? 0)
        : app.mode === 'online'
          ? (s?.seats?.indexOf(`player-${(app.room?.you ?? 0) + 1}`) ?? -1)
          : 0;
    app.playerNames = s?.seats
      ? s.seats.map((id) => {
          const index = Number(id.replace('player-', '')) - 1;
          return app.mode === 'online'
            ? `${index + 1}号·${app.room?.players[index]?.name ?? '好友'}`
            : `${index + 1}号玩家`;
        })
      : names;
    app.standings = app.series ? tournamentStandings(app.series) : [];
    app.canAim =
      app.screen === 'playing' &&
      s?.phase === 'aim' &&
      s.active === app.localDisc &&
      !app.onlineBusy &&
      !onlineAnimation;
    if (app.mode === 'online' && app.room?.state) {
      const time = now() + serverOffset - app.room.startedAt;
      app.remainingSeconds = Math.max(0, Math.ceil((app.room.state.turnDeadlineMs - time) / 1000));
      app.nextRoundSeconds = Math.max(0, Math.ceil((app.room.state.nextRoundAtMs - time) / 1000));
      if (time < app.room.state.turnStartsAtMs || app.remainingSeconds <= 0) app.canAim = false;
    } else if (app.mode === 'local')
      app.remainingSeconds = Math.max(0, Math.ceil(app.turnSeconds - turnElapsed));
    else app.remainingSeconds = null;
  }
  function prepareState(state) {
    cancelReward();
    app.rewardHintUsed = false;
    app.aimHint = null;
    app.rewardMessage = '';
    app.state = state;
    app.playerKnockouts = 0;
    app.shareNotice = '';
    random = seeded(state.seed);
    app.reason = '';
    app.trails = [];
    app.particles = [];
    frames = [];
    replayFrames = [];
    resultState = null;
    settledState = null;
    turnToken = '';
    turnElapsed = 0;
    screen('playing');
  }
  function start(index = null, seed = null, targetShots = null) {
    app.targetShots = targetShots;
    pendingSeed = seed;
    app.mode = 'practice';
    app.series = null;
    app.chosenLevel = null;
    practice = index;
    matchTime = 0;
    screen('matching');
  }
  function begin() {
    prepareState(
      createMatch(
        catalog[practice ?? Math.floor(Math.random() * catalog.length)],
        pendingSeed ?? Date.now(),
      ),
    );
  }
  function selectLevel(level, development = false) {
    if (!level || (!development && !isLevelUnlocked(app.save, level.id))) return;
    app.chosenLevel = level;
    app.chapter = chapters.findIndex((chapter) => chapter.id === level.chapter);
    app.targetShots = null;
    app.mode = 'campaign';
    app.series = null;
    app.challengeResult = null;
    screen('briefing');
  }
  function beginLevel() {
    if (app.chosenLevel) prepareState(createMatch(app.chosenLevel));
  }
  function beginLocal() {
    app.targetShots = null;
    app.mode = 'local';
    app.chosenLevel = null;
    app.series = createTournament({ players: 2, turnSeconds: app.turnSeconds, seed: now() >>> 0 });
    app.roundResult = null;
    prepareState(createTournamentMatch(app.series));
  }
  function snapshot() {
    return copy(app.state);
  }
  function fire(x, y, power) {
    if (app.mode === 'online') {
      if (!app.canAim) return false;
      const revision = app.room.state.revision;
      void onlineOperation(() => options.online.shoot({ x, y, power, revision }));
      return true;
    }
    frames = [snapshot()];
    return shoot(app.state, x, y, power);
  }
  async function onlineOperation(operation) {
    if (disposed || app.onlineBusy) return;
    app.onlineBusy = true;
    app.error = '';
    cancel();
    render();
    try {
      return await operation();
    } catch (error) {
      if (!disposed) app.error = error.message || '连接暂时中断，请重试。';
    } finally {
      if (!disposed) {
        app.onlineBusy = false;
        render();
      }
    }
  }
  function onlineScreen() {
    if (!app.state || app.screen === 'paused') return;
    const next =
      app.state.phase === 'over' || app.series?.phase === 'finished' ? 'result' : 'playing';
    if (app.screen !== next) screen(next);
  }
  function authorityState() {
    const next = copy(authoritative);
    const sameRound = app.state?.tournamentRoundId === next.tournamentRoundId;
    for (const disc of next.discs) {
      if (!disc.alive) {
        const previous = sameRound ? app.state.discs[disc.id] : null;
        disc.fall = previous && !previous.alive ? (previous.fall ?? 1) : 1;
      }
    }
    return next;
  }
  function receiveRoom(room) {
    if (disposed) return;
    if (!room) {
      app.room = null;
      authoritative = null;
      onlineAnimation = false;
      displayedRevision = -1;
      if (app.mode === 'online') {
        app.mode = 'practice';
        screen('friends');
      }
      return;
    }
    const changedRoom = app.room?.code !== room.code;
    if (changedRoom || app.room?.state?.revision !== room.state?.revision) cancel();
    app.targetShots = null;
    app.mode = 'online';
    app.room = room;
    app.roomCode = room.code;
    app.error = '';
    app.roomSize = room.capacity;
    serverOffset = room.serverNow - now();
    if (changedRoom) {
      displayedRevision = -1;
      authoritative = null;
      onlineAnimation = false;
    }
    if (!room.state?.match || ['waiting', 'abandoned', 'expired'].includes(room.status)) {
      app.state = null;
      app.series = null;
      onlineAnimation = false;
      screen('lobby');
      return;
    }
    const remote = room.state;
    app.series = copy(remote.series);
    authoritative = copy(remote.match);
    app.roundResult = remote.series.history?.at(-1) ?? null;
    const newRound = app.state?.tournamentRoundId !== remote.match.tournamentRoundId;
    if (newRound) {
      cancel();
      onlineAnimation = false;
      frames = [];
      replayFrames = [];
      settledState = null;
      if (app.screen === 'replay') {
        app.state = copy(authoritative);
        resultState = null;
        screen(app.state.phase === 'over' ? 'result' : 'playing');
      }
    }
    if (
      remote.lastShot &&
      remote.lastShot.revision > displayedRevision &&
      !suspended &&
      !['replay', 'paused'].includes(app.screen)
    ) {
      app.state = copy(remote.lastShot.before);
      for (const disc of app.state.discs) if (!disc.alive) disc.fall = 1;
      app.state.events = [];
      frames = [snapshot()];
      shoot(app.state, remote.lastShot.x, remote.lastShot.y, remote.lastShot.power);
      // A late poll/reconnect starts at the server's current animation time, not at its old start.
      const age = Number.isFinite(remote.lastShot.at)
        ? Math.max(0, room.serverNow - room.startedAt - remote.lastShot.at) / 1000
        : 0;
      for (
        let i = 0;
        i < Math.min(3000, Math.floor(age / physics.step)) &&
        ['moving', 'shrinking'].includes(app.state.phase);
        i++
      ) {
        step(app.state);
        frames.push(snapshot());
      }
      onlineAnimation = ['moving', 'shrinking'].includes(app.state.phase);
      if (onlineAnimation) screen('playing');
      else {
        replayFrames = frames;
        app.state = authorityState();
        onlineScreen();
      }
    } else if (!onlineAnimation && app.screen !== 'replay') {
      app.state = authorityState();
      onlineScreen();
    }
    displayedRevision = remote.revision;
    if (app.drag && (!app.state || app.state.active !== app.localDisc || app.state.phase !== 'aim'))
      cancel();
    render();
  }
  function refreshRoom() {
    if (polling || !app.room || disposed || !options.online) return;
    polling = true;
    options.online
      .refresh()
      .catch((error) => {
        if (!disposed) app.error = error.message || '连接中断，正在重连';
      })
      .finally(() => {
        polling = false;
        if (!disposed) render();
      });
  }
  function action(id) {
    if (disposed || suspended || app.buttons.find((b) => b.id === id)?.disabled) return;
    if (id === 'reward-hint') { void requestHint(); return; }
    if (id === 'reward-cancel') {
      cancelReward();
      app.rewardMessage = '已取消 · 未获得提示';
      render();
      return;
    }
    app.error = '';
    if (id === 'start') {
      const invite = app.invited;
      if (invite)
        start(
          catalog.findIndex((layout) => layout.id === invite.layout),
          invite.seed,
          invite.targetShots,
        );
      else selectLevel(nextLevel(app.save));
    } else if (id === 'levels') {
      app.chapter = chapters.findIndex((chapter) => chapter.id === nextLevel(app.save).chapter);
      screen('levels');
    } else if (id === 'chapter-prev' || id === 'chapter-next') {
      app.chapter = Math.max(
        0,
        Math.min(chapters.length - 1, app.chapter + (id === 'chapter-next' ? 1 : -1)),
      );
      render();
    } else if (id.startsWith('level-')) selectLevel(getLevel(id.slice(6)));
    else if (id === 'play-level') beginLevel();
    else if (id === 'next-level') selectLevel(getLevel(app.chosenLevel.index));
    else if (id === 'retry' || id === 'again') {
      if (app.mode === 'campaign') beginLevel();
      else if (app.mode === 'local') beginLocal();
      else if (app.mode === 'online') void onlineOperation(() => options.online.rematch());
      else start(practice);
    } else if (['layouts', 'help', 'friends', 'wardrobe'].includes(id)) screen(id);
    else if (id === 'home') {
      if (app.mode === 'online' && app.room)
        void onlineOperation(async () => {
          await options.online.leave();
          screen('home');
        });
      else screen('home');
    } else if (id.startsWith('layout-')) start(Number(id.slice(7)));
    else if (id.startsWith('theme-')) {
      const theme = themes.find((item) => item.id === id.slice(6));
      if (theme && theme.threshold <= totalStars(app.save)) {
        app.save.theme = theme.id;
        persist();
        render();
      }
    } else if (id === 'local2') beginLocal();
    else if (id === 'online-create' || id === 'online-join')
      screen(id === 'online-create' ? 'room-create' : 'room-join');
    else if (id.startsWith('room-size-')) {
      app.roomSize = Number(id.slice(10));
      render();
    } else if (id.startsWith('timer-')) {
      app.turnSeconds = Number(id.slice(6));
      render();
    } else if (id === 'create-room')
      void onlineOperation(() =>
        options.online.create({ players: app.roomSize, turnSeconds: app.turnSeconds }),
      );
    else if (id === 'join-room') void onlineOperation(() => options.online.join(app.roomCode));
    else if (id === 'restore-room') void onlineOperation(() => options.online.restore());
    else if (id === 'ready') void onlineOperation(() => options.online.ready());
    else if (id === 'leave-room') void onlineOperation(() => options.online.leave());
    else if (id === 'share-room')
      void onlineOperation(async () => {
        await options.shareRoom?.(
          app.room.code,
          options.online.invitationUrl(options.shareBase?.() ?? ''),
        );
        app.toast = '房间邀请已准备好';
      });
    else if (id === 'next-round') {
      if (app.mode === 'online') void onlineOperation(() => options.online.next());
      else if (app.series && nextTournamentRound(app.series))
        prepareState(createTournamentMatch(app.series));
    } else if (
      id === 'share' &&
      app.mode === 'practice' &&
      app.screen === 'result' &&
      options.share
    ) {
      const result = snapshot();
      Promise.resolve(options.share(result))
        .then((message) => {
          if (
            !disposed &&
            app.mode === 'practice' &&
            app.screen === 'result' &&
            app.state.seed === result.seed
          ) {
            app.shareNotice = message || '';
            render();
          }
        })
        .catch(() => {
          if (
            !disposed &&
            app.mode === 'practice' &&
            app.screen === 'result' &&
            app.state.seed === result.seed
          ) {
            app.shareNotice = '分享暂不可用，可以继续切磋';
            render();
          }
        });
    } else if (id === 'rematch') {
      if (app.mode === 'practice' && app.screen === 'result')
        start(
          catalog.findIndex((layout) => layout.id === app.state.layout),
          app.state.seed,
          app.targetShots,
        );
      else if (app.mode === 'campaign') beginLevel();
      else if (app.mode === 'online') void onlineOperation(() => options.online.rematch());
      else beginLocal();
    } else if (id === 'pause' && app.screen === 'playing') {
      if (app.mode === 'online') {
        onlineAnimation = false;
        if (authoritative) app.state = copy(authoritative);
      }
      screen('paused');
    } else if (id === 'resume') screen(app.state?.phase === 'over' ? 'result' : 'playing');
    else if (id === 'sound') {
      app.save.sound = !app.save.sound;
      if (!app.save.sound) for (const s of Object.values(sounds)) s?.stop();
      persist();
      render();
    } else if (id === 'replay' && replayFrames.length) {
      resultState = app.state;
      replayIndex = 0;
      app.state = copy(replayFrames[0]);
      screen('replay');
    } else if (id === 'result') {
      app.state = app.mode === 'online' && authoritative ? copy(authoritative) : resultState;
      screen(app.state?.phase === 'over' ? 'result' : 'playing');
    }
  }
  function render() {
    if (disposed) return;
    if (renderedWidth !== target.canvas.width || renderedHeight !== target.canvas.height) {
      // The old touch origin belongs to another viewport; preserve the match, cancel the gesture.
      cancel();
      renderedWidth = target.canvas.width;
      renderedHeight = target.canvas.height;
    }
    presentation();
    const width = target.canvas.width,
      height = target.canvas.height,
      s = Math.min(width / W, height / H),
      ox = (width - W * s) / 2,
      oy = (height - H * s) / 2;
    if (target.renderer) app.buttons = target.renderer.draw(app);
    else {
      ctx.fillStyle = '#0d2026';
      ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(s, s);
      app.buttons = draw(ctx, app);
      ctx.restore();
    }
    options.onRender?.(app, { scale: s, ox, oy });
  }
  function coords(e) {
    const s = Math.min(target.canvas.width / W, target.canvas.height / H);
    return {
      x: (e.x - (target.canvas.width - W * s) / 2) / s,
      y: (e.y - (target.canvas.height - H * s) / 2) / s,
    };
  }
  function input(e) {
    if (disposed || suspended) return;
    if (renderedWidth !== target.canvas.width || renderedHeight !== target.canvas.height) render();
    presentation();
    const p = coords(e);
    if (e.phase === 'cancel') {
      if (pointer === e.pointerId) cancel();
      render();
      return;
    }
    if (e.phase === 'down') {
      if (pointer !== null) return;
      pointer = e.pointerId;
      pressed = app.buttons.find(
        (b) => !b.disabled && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h,
      )?.id;
      if (!pressed && app.canAim) {
        const d = app.state.discs[app.localDisc],
          x = arena.x + d.x * arena.scale,
          y = arena.y + d.y * arena.scale;
        const displayScale = Math.min(target.canvas.width / W, target.canvas.height / H);
        const backingPerCssPixel = options.backingPerCssPixel?.() ?? 1;
        const touchRadius = Math.max(32, (22 * backingPerCssPixel) / displayScale);
        if (Math.hypot(p.x - x, p.y - y) <= touchRadius)
          app.drag = { startX: p.x, startY: p.y, dx: 0, dy: 0, actor: app.state.active };
      }
    } else if (e.pointerId === pointer) {
      if (app.drag) {
        app.drag.dx = p.x - app.drag.startX;
        app.drag.dy = p.y - app.drag.startY;
      }
      if (e.phase === 'up') {
        const drag = app.drag,
          id = pressed;
        cancel();
        if (
          drag &&
          app.canAim &&
          drag.actor === app.state.active &&
          Math.hypot(drag.dx, drag.dy) >= 9
        )
          fire(-drag.dx, -drag.dy, Math.min(1, Math.hypot(drag.dx, drag.dy) / 115));
        else if (id) {
          const b = app.buttons.find((button) => button.id === id);
          if (b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) action(id);
        }
      }
    }
    render();
  }
  const stop = target.onPointer(input);
  function finish(s) {
    if (settledState === s) return;
    settledState = s;
    replayFrames = frames;
    if (app.mode === 'campaign') {
      app.challengeResult = evaluateChallenges(app.chosenLevel, s);
      app.save = settleCampaign(app.save, app.chosenLevel, s);
      persist();
    } else if (app.mode === 'practice') {
      app.save = settle(app.save, s.winner);
      persist();
    } else if (app.mode === 'local') app.roundResult = recordTournamentRound(app.series, s);
    sound(s.winner === app.localDisc ? 'win' : 'out');
    botTime = -0.85;
  }
  function consumeEvents(s) {
    for (const e of s.events.splice(0)) {
      if (e.type === 'shot') sound('shot');
      if (e.type === 'hit' || e.type === 'pillar') {
        app.particles.push({ ...e, age: 0 });
        sound('hit');
      }
      if (e.type === 'out') {
        sound('out');
        const knockout =
          e.id !== app.localDisc && s.lastShot?.actor === app.localDisc && e.reason !== 'ring';
        if (knockout) app.playerKnockouts++;
        app.toast = knockout
          ? `漂亮！${s.knocked > 1 ? '连续击落' : '击落'}${app.playerNames[e.id] ?? names[e.id]}`
          : `${app.playerNames[e.id] ?? names[e.id]}，出界！`;
        toastTime = 1.6;
        if (e.id === app.localDisc)
          app.reason =
            e.reason === 'ring'
              ? '收圈时留在了外侧，下次提前向内走位'
              : s.lastShot?.actor === e.id
                ? '这一弹用力过猛，自己滑出了擂台'
                : '被对手撞到台外，下次给落点留些余地';
      }
    }
  }
  function tick(dt) {
    if (disposed || suspended) return;
    const wallDt = Math.min(5, Math.max(0, dt));
    dt = Math.min(0.05, Math.max(0, dt));
    app.time += dt;
    if (app.room) {
      pollTime += wallDt;
      if (pollTime >= Math.max(0.8, (app.room.pollMs ?? 1000) / 1000)) {
        pollTime = 0;
        refreshRoom();
      }
    }
    if (app.screen === 'matching') {
      matchTime += dt;
      if (matchTime >= 1.15) begin();
    }
    if (app.screen === 'replay') {
      replayIndex += dt / physics.step;
      app.state = copy(replayFrames[Math.min(replayFrames.length - 1, Math.floor(replayIndex))]);
      if (replayIndex >= replayFrames.length + 1 / physics.step) action('result');
    }
    if (app.screen === 'playing' && app.state) {
      const s = app.state;
      for (const d of s.discs) if (!d.alive) d.fall = Math.min(1, d.fall + dt * 2.2);
      app.particles = app.particles.filter((p) => (p.age += dt) < 0.45);
      toastTime -= dt;
      if (toastTime <= 0) app.toast = '';
      if (s.phase === 'aim' && ['campaign', 'practice'].includes(app.mode) && s.active !== 0) {
        botTime += dt;
        if (botTime >= (s.discs[0].alive ? 1.25 : 0.3)) {
          const move = chooseBot(s, random);
          if (move) fire(move.x, move.y, move.power);
          botTime = 0;
        }
      }
      if (s.phase === 'aim' && app.mode === 'local') {
        turnElapsed += wallDt;
        if (turnElapsed >= app.turnSeconds) {
          cancel();
          frames = [snapshot()];
          skipTurn(s);
          turnElapsed = 0;
        }
      }
      if (s.phase === 'moving' || s.phase === 'shrinking') {
        accumulator += app.mode === 'online' ? Math.min(0.25, wallDt) : dt;
        while (accumulator >= physics.step) {
          step(s);
          accumulator -= physics.step;
          frames.push(snapshot());
          if (s.phase !== 'moving' && s.phase !== 'shrinking') {
            accumulator = 0;
            break;
          }
        }
        app.trails =
          s.phase === 'moving'
            ? s.discs
                .filter((d) => d.alive && Math.hypot(d.vx, d.vy) > 40)
                .map((d) => ({ id: d.id, x: d.x - d.vx * 0.045, y: d.y - d.vy * 0.045 }))
            : [];
      } else {
        accumulator = 0;
        app.trails = [];
      }
      consumeEvents(s);
      if (app.mode === 'online') {
        if (onlineAnimation && !['moving', 'shrinking'].includes(s.phase)) {
          replayFrames = frames;
          onlineAnimation = false;
          app.state = authorityState();
          onlineScreen();
        }
      } else if (s.phase === 'over') {
        finish(s);
        botTime += dt;
        if (botTime >= 0) screen('result');
      }
    }
    render();
  }
  render();
  return {
    app,
    tick,
    render,
    cancelInput: cancel,
    cancelReward,
    action,
    cancel,
    isSuspended: () => suspended,
    receiveRoom,
    setField(id, value) {
      if (id === 'room-code')
        app.roomCode = String(value)
          .toUpperCase()
          .replace(/[^A-F0-9]/g, '')
          .slice(0, 12);
    },
    joinInvitation(code) {
      app.roomCode = code;
      screen('room-join');
    },
    restoreRoom() {
      return onlineOperation(() => options.online.restore());
    },
    pause() {
      suspended = true;
      cancel();
      if (app.mode !== 'online' && app.screen === 'playing') screen('paused');
      for (const s of Object.values(sounds)) s?.stop();
    },
    resume() {
      suspended = false;
      accumulator = 0;
      if (app.room) refreshRoom();
      render();
    },
    dispose() {
      cancelReward();
      disposed = true;
      cancel();
      stop?.();
      options.online?.dispose();
      for (const s of Object.values(sounds)) s?.dispose();
      if (target.renderer) target.renderer.dispose();
      else ctx.clearRect(0, 0, target.canvas.width, target.canvas.height);
    },
    debug() {
      return {
        screen: app.screen,
        mode: app.mode,
        state: app.state ? copy(app.state) : null,
        series: app.series ? copy(app.series) : null,
        drag: app.drag,
        buttons: app.buttons,
      };
    },
    debugStart(index = 0) {
      app.mode = 'practice';
      app.series = null;
      app.chosenLevel = null;
      practice = index;
      begin();
    },
    debugLevel(index = 0) {
      if (!options.development) return;
      selectLevel(levels[index], true);
      beginLevel();
    },
  };
}
