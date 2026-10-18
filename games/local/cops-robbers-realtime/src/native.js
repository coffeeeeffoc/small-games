import { getLevels, MODES } from './levels.js';
import {
  createGame,
  startGame,
  stepGame,
  commandCop,
  commandRobber,
  holdCop,
  holdRobber,
  isExitBlocked,
  captureStatus,
} from './engine.js';
import { createRenderer } from './competition-renderer.js';
import { drawRoleAvatar } from './role-appearance.js';
import { onlineEnabled, runConfig, formatRecord, readRecords,startRun, submitRun } from './records.js';
import { startSupport, starterRuns, sprintRemaining, canRefill, grantSupport, useSprint, useRewind } from './support.js';
import { createTapTapAdProvider } from './taptap-h5-ads.js';

// Native Canvas shell: the same engine, replay protocol and field-only orders as H5.
export function startNativeStreetGame(sdk, config, startNativeCompetition) {
  if (!sdk) throw new Error('缺少小游戏 SDK');
  globalThis.__COMPETITION_CONFIG__ = config;
  const ONLINE_ENABLED = onlineEnabled(config);
  globalThis.__CLASSIC_CHASE_ROLES__ = true;
  globalThis.__chaseRoleStorage = {
    getItem: (key) => sdk.getStorageSync(key),
    setItem: (key, value) => sdk.setStorageSync(key, value),
  };
  globalThis.__chaseRoleImage = () => sdk.createImage();
  if (ONLINE_ENABLED) globalThis.__installCompetition(config, config.platform === 'web-preview' ? undefined : sdk);
  const canvas = sdk.createCanvas(),
    ctx = canvas.getContext('2d'),
    renderer = createRenderer();
  let saved = {};
  try {
    saved = JSON.parse(sdk.getStorageSync('street-native-v1') || '{}');
  } catch {}
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  const progress = saved.best && typeof saved.best === 'object' ? saved.best : {};
  let startedRuns = starterRuns(saved.startedRuns), supportBusy = false, supportRequest = null;
  const ads = config.rewardProvider || createTapTapAdProvider(sdk, config.rewardedAdUnitId);
  let mode = MODES.some((item) => item.id === saved.mode) ? saved.mode : 'challenge';
  let role = saved.role === 'robber' ? 'robber' : 'cop',
    rule = saved.rule === 'relay' ? 'relay' : 'standard';
  let first = ['cop', 'robber', 'random'].includes(saved.first) ? saved.first : 'random';
  let level = 1,
    page = 'home',
    chapter = 0,
    game,
    ticks = 0,
    orders = [],
    hits = [],
    width,
    height,
    ratio,
    originX = 0,
    originY = 0,
    physicalWidth,
    physicalHeight;
  let stopped = false,
    hidden = false,
    pk = null,
    last = Date.now(),
    accumulated = 0,
    message = '',
    serverRecord = null,
    serial = 0;
  let submitting = null,runAdmission=null,admissionPending=false;
  let gesture = null;
  const channel = sdk.channelEntry; let channelMessage = '';
  const runChannel = action => { if (action.available === false) { channelMessage = '宿主暂不支持此入口'; draw(); return; } channelMessage = ''; Promise.resolve().then(() => action.run()).catch(error => { channelMessage = error.message; }).finally(draw); };
  const hasTouchStart = typeof sdk.onTouchStart === 'function';
  const art = sdk.createImage?.();
  if (art) art.src = 'home-city.png';
  function resize() {
    gesture = null;
    const info = sdk.getSystemInfoSync();
    physicalWidth = info.windowWidth;
    physicalHeight = info.windowHeight;
    let capsule;
    try { capsule = sdk.getMenuButtonBoundingClientRect?.(); } catch {}
    originX = Math.max(0, info.safeArea?.left || 0);
    originY = Math.max(0, info.safeArea?.top || 0, capsule?.bottom || 0);
    width = Math.max(1, (info.safeArea?.right ?? physicalWidth) - originX);
    height = Math.max(1, (info.safeArea?.bottom ?? physicalHeight) - originY);
    ratio = Math.min(info.pixelRatio || 1, 2);
    canvas.width = physicalWidth * ratio;
    canvas.height = physicalHeight * ratio;
  }
  resize();
  function persist() {
    try {
      sdk.setStorageSync(
        'street-native-v1',
        JSON.stringify({ best: progress, mode, role, rule, first, startedRuns }),
      );
    } catch {
      message = '本机存储不可用，本次仍可继续';
    }
  }
  const key = () => JSON.stringify(runConfig(game));
  const localBest = () => progress[key()];
  function prepare() {
    if (mode === 'quick') {
      role = 'cop';
      rule = 'standard';
      level = Math.min(level, 3);
    }
    game = createGame(getLevels(mode)[level - 1], {
      playerRole: role,
      orderRule: rule,
      firstRole: ['quick', 'challenge'].includes(mode)
        ? null
        : first === 'random'
          ? Math.random() < 0.5
            ? 'cop'
            : 'robber'
          : first,
    });
    ticks = 0;
    orders = [];
    submitting = null;
    runAdmission=null;
    persist();
    void refresh();
  }
  async function refresh() {
    if (!ONLINE_ENABLED) return;
    const request = ++serial;
    serverRecord = null;
    message = '读取服务器纪录…';
    try {
      const result = await readRecords(runConfig(game));
      if (request !== serial || stopped) return;
      serverRecord = result;
      message = result.top.length ? '同配置通关纪录' : '服务器暂无纪录';
    } catch {
      if (request === serial) message = '服务器暂未连接，个人纪录仍保存在本机';
    }
  }
  function text(value, x, y, size = 16, color = '#203c36') {
    ctx.fillStyle = color;
    ctx.font = size + 'px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), x, y);
  }
  function button(label, x, y, w, action, active = false) {
    ctx.fillStyle = active ? '#234d3e' : '#fffcf0';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, 44, 12);
    else ctx.rect(x, y, w, 44);
    ctx.fill();
    text(label, x + 12, y + 22, 14, active ? '#fff9e6' : '#203c36');
    hits.push({ label, x, y, w, h: 44, action });
  }
  function home() {
    page = 'home';
    message = '';
  }
  async function start() {
    if(admissionPending || game.phase!=='ready') return;
    const starting=game;
    let admission=null;
    if(ONLINE_ENABLED && starting.level.id>0) {
      admissionPending=true;
      try {admission=await startRun(runConfig(starting));}
      catch {message='开局服务暂不可用，本局继续本地挑战，无法提交排行榜。';}
      finally {admissionPending=false;}
    }
    if(stopped || game!==starting || hidden) return;
    if (!startGame(game)) return;
    runAdmission=admission;
    startedRuns = startSupport(game, startedRuns);
    persist();
    page = 'game';
    last = Date.now();
    accumulated = 0;
  }
  async function upload() {
    if (!ONLINE_ENABLED || game.support?.assisted) return;
    if (!submitting) return;
    const attempt = submitting;
    message = '正在验证通关纪录…';
    try {
      const data = await submitRun(attempt.config, attempt.ticks, attempt.orders,attempt.admission);
      if (attempt !== submitting || stopped) return;
      serverRecord = data;
      message = '服务器已验证并保存';
      submitting = null;
    } catch {
      if (attempt === submitting) message = '个人最佳已保存，服务器尚未确认';
    }
  }
  function openPK() {
    if (!ONLINE_ENABLED) return;
    page = 'pk';
    pk = startNativeCompetition(
      sdk,
      {
        ...config,
        canvas,
        onExit: () => {
          pk?.stop();
          pk = null;
          home();
        },
      },
      createRenderer,
    );
  }
  function view() {
    return {
      map: { nodes: game.level.nodes, edges: game.level.edges },
      name: game.level.name,
      role: role === 'cop' ? 'pursuer' : 'runner',
      firstRole: game.firstRole === 'cop' ? 'pursuer' : 'runner',
      openingRemainingMs: Math.max(0, game.openingSeconds * 1000 - game.time * 1000),
      cops: game.cops.map(actor => ({ ...actor, sprinting: actor.sprintUntil > game.time })),
      robbers: game.robbers.map((actor) => ({ ...actor, sprinting: actor.sprintUntil > game.time, ...captureStatus(game, actor) })),
      exits: game.exits.map((exit, i) => ({
        ...exit,
        label: String.fromCharCode(65 + i),
        blocked: isExitBlocked(game, exit),
      })),
      elapsedMs: game.time * 1000,
      caught: game.robbers.filter((actor) => actor.caught).length,
      total: game.robbers.length,
      phase: game.phase,
      finished: game.phase !== 'playing',
    };
  }
  function activateSupport(kind, actor = renderer.getSelected()) {
    if (!(kind === 'sprint' ? useSprint(game, actor) : useRewind(game))) return false;
    if (kind === 'rewind') {
      ticks = Math.round(game.time * 60);
      orders = orders.filter(order => order.tick <= ticks);
    }
    page = 'game';
    accumulated = 0;
    last = Date.now();
    message = kind === 'sprint' ? '选中队员冲刺 4 秒' : '已回到失守前';
    return true;
  }
  async function requestSupport(kind) {
    if (supportRequest || stopped || hidden) return;
    if (game.support?.[kind]) { activateSupport(kind); return; }
    if (!canRefill(game, kind)) return;
    const request = { game, kind, page };
    supportRequest = request;
    supportBusy = true;
    gesture = null;
    if (game.phase === 'playing') game.phase = 'paused';
    message = '正在打开广告，进度已暂停';
    draw();
    let outcome;
    try { outcome = await ads.show({ opportunityId: 'cops-robbers-realtime.' + kind }); }
    catch { outcome = { status: 'failed' }; }
    gesture = null;
    supportBusy = false;
    if (stopped || supportRequest !== request || game !== request.game) return;
    const completed = grantSupport(game, kind, outcome);
    message = completed ? (kind === 'sprint' ? '冲刺次数 +1，点击冲刺使用' : '回溯次数 +1，点击回溯使用') : '本次未领取，补领次数保留';
    finishSupport();
    draw();
  }
  function finishSupport() {
    if (supportBusy || hidden || stopped || !supportRequest) return;
    const request = supportRequest;
    supportRequest = null;
    gesture = null;
    if (game !== request.game) return;
    if (request.kind === 'sprint' && page === request.page && game.phase === 'paused') game.phase = 'playing';
    last = Date.now();
    accumulated = 0;
  }
  function chooseAvatar(side, style) {
    let data = {};
    try {
      data = JSON.parse(sdk.getStorageSync('chase-role-appearance-v1') || '{}');
    } catch {}
    data[side] = { style };
    try {
      sdk.setStorageSync('chase-role-appearance-v1', JSON.stringify(data));
      message = '头像已保存，所有关卡生效';
    } catch {
      message = '无法保存头像';
    }
  }
  function draw() {
    if (stopped || hidden || page === 'pk') return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#f6f1df';
    ctx.fillRect(0, 0, physicalWidth, physicalHeight);
    ctx.translate(originX, originY);
    hits = [];
    if (page === 'home') {
      if (art?.width) ctx.drawImage(art, width * 0.34, 0, width * 0.66, height - 52);
      text('保安 × 小偷', 28, 32, 17);
      text('街区追捕', 28, height * 0.32, Math.min(54, width * 0.065));
      text('封住路口，合作抓住小偷。', 28, height * 0.49, 16);
      button(
        '开始游戏 →',
        28,
        height * 0.61,
        Math.min(240, width * 0.32),
        () => {
          page = 'levels';
          prepare();
        },
        true,
      );
      ['角色头像', '玩法说明'].forEach((label, i) =>
        button(label, 20 + (i * (width - 40)) / 2, height - 58, (width - 52) / 2, () => {
          page = ['avatars', 'help'][i];
        }),
      );
      return;
    }
    if (page === 'game') {
      const data = view();
      renderer.draw(ctx, width, height - 54, data);
      button('首页', 12, height - 50, 76, () => {
        game.phase = 'paused';
        home();
      });
      button('', width - 62, height - 50, 50, () => {
        game.phase = 'paused';
        page = 'pause';
      });
      ctx.fillStyle = '#234d3e';
      ctx.fillRect(width - 47, height - 39, 5, 22);
      ctx.fillRect(width - 36, height - 39, 5, 22);
      const remaining = sprintRemaining(game);
      if (remaining || game.support?.sprint || canRefill(game, 'sprint'))
        button(remaining ? '冲刺 ' + remaining.toFixed(1) + '秒' : game.support.sprint ? '冲刺 · ' + game.support.sprint : '广告冲刺',
          width / 2 - 80, height - 50, 160, () => { if (!remaining) void requestSupport('sprint'); });
      return;
    }
    button('首页', 16, 12, 76, home);
    text(
      {
        levels: '选择街区',
        records: '全站通关纪录',
        avatars: '保安与小偷 · 全局头像',
        help: '玩法说明',
        pause: '暂停',
        result: '本局结束',
        channel: 'B站入口',
        support: '战术支援',
      }[page],
      112,
      34,
      22,
    );
    if (page === 'levels') {
      const panel = width - 256,
        available = getLevels(mode),
        startIndex = chapter * 8;
      available.slice(startIndex, startIndex + 8).forEach((item, i) => {
        const x = 16 + ((i % 4) * (panel - 28)) / 4,
          y = 74 + Math.floor(i / 4) * 70;
        button(
          String(item.id).padStart(2, '0') + ' ' + item.name.slice(0, 4),
          x,
          y,
          (panel - 44) / 4,
          () => {
            level = item.id;
            prepare();
          },
          level === item.id,
        );
      });
      button('上一页', 16, height - 58, 100, () => {
        chapter = Math.max(0, chapter - 1);
      });
      button('下一页', 130, height - 58, 100, () => {
        chapter = Math.min(Math.ceil(available.length / 8) - 1, chapter + 1);
      });
      const x = width - 238,
        w = 222;
      button(MODES.find((item) => item.id === mode).name, x, 65, w, () => {
        mode = MODES[(MODES.findIndex((item) => item.id === mode) + 1) % MODES.length].id;
        level = 1;
        chapter = 0;
        prepare();
      });
      if (mode !== 'quick') {
        button('角色：' + (role === 'cop' ? '保安' : '小偷'), x, 115, w / 2 - 4, () => {
          role = role === 'cop' ? 'robber' : 'cop';
          prepare();
        });
        button(rule === 'relay' ? '轮换指挥' : '自由调动', x + w / 2 + 4, 115, w / 2 - 4, () => {
          rule = rule === 'relay' ? 'standard' : 'relay';
          prepare();
        });
        button(
          mode === 'challenge'
            ? '同时开始'
            : '先手：' + (first === 'random' ? '系统分配' : first === 'cop' ? '保安' : '小偷'),
          x,
          165,
          w,
          () => {
            if (mode === 'challenge') return;
            first = ['random', 'cop', 'robber'][
              (['random', 'cop', 'robber'].indexOf(first) + 1) % 3
            ];
            prepare();
          },
        );
      }
      text('我的最佳 ' + formatRecord(localBest()), x, mode === 'quick' ? 137 : Math.min(232, height - 93), 13);
      text(
        startedRuns < 5 ? '本局赠回溯、冲刺各 1 次' : '可看广告领取战术支援',
        x,
        mode === 'quick' ? 166 : Math.min(256, height - 73),
        13,
      );
      button('开始行动 →', x, height - 58, w, start, true);
      return;
    }
    if (page === 'pause') {
      button(
        '继续行动',
        width / 2 - 110,
        88,
        220,
        () => {
          game.phase = 'playing';
          page = 'game';
          last = Date.now();
        },
        true,
      );
      button('重新挑战', width / 2 - 110, 143, 220, () => {
        prepare();
        start();
      });
      button('返回选关', width / 2 - 110, 198, 220, () => {
        page = 'levels';
        prepare();
      });
      return;
    }
    if (page === 'result') {
      const won = game.phase === (role === 'cop' ? 'won' : 'lost');
      text(won ? '挑战成功' : '挑战结束', width / 2 - 110, 93, 24);
      text(
        '本次 ' + formatRecord(game.time) + '   最佳 ' + formatRecord(localBest()),
        width / 2 - 150,
        134,
        16,
      );
      text(
        game.support?.assisted ? '辅助通关 · 最佳单独保存' : '个人纪录保存在本机',
        width / 2 - 150,
        166,
        16,
      );
      text(message, 30, height - 78, 13);
      button(
        '再来一次',
        28,
        height - 58,
        130,
        () => {
          prepare();
          start();
        },
        true,
      );
      button('选关', 170, height - 58, 90, () => {
        page = 'levels';
        prepare();
      });
      if (submitting) button('重试上传', 274, height - 58, 120, () => void upload());
      if (!won && game.support && (game.support.rewind || canRefill(game, 'rewind')))
        button(game.support.rewind ? '回溯 5 秒 · ' + game.support.rewind : '广告回溯 5 秒',
          width - 200, height - 58, 172, () => void requestSupport('rewind'));
      return;
    }
    if (page === 'records') {
      text(
        MODES.find((item) => item.id === mode).name +
          ' · ' +
          (role === 'cop' ? '保安' : '小偷') +
          ' · 第 ' +
          level +
          ' 关',
        24,
        86,
        16,
      );
      text('我的最佳 ' + formatRecord(localBest()), 24, 119, 18);
      text(
        '服务器最快 ' + (serverRecord ? formatRecord(serverRecord.fastestMs / 1000) : '暂未连接'),
        24,
        150,
        18,
      );
      (serverRecord?.top || [])
        .slice(0, 3)
        .forEach((row, i) =>
          text(
            i + 1 + '. ' + row.name + '  ' + formatRecord(row.elapsedMs / 1000),
            width * 0.52,
            90 + i * 32,
            15,
          ),
        );
      text(message, 24, height - 79, 13);
      button('刷新', 24, height - 58, 90, () => void refresh());
      button('去选关', 126, height - 58, 120, () => {
        page = 'levels';
      });
      button('好友积分榜', 260, height - 58, 145, openPK);
      return;
    }
    if (page === 'avatars') {
      for (const [i, side] of ['cop', 'robber'].entries()) {
        const x = width * 0.12 + i * width * 0.45;
        drawRoleAvatar(ctx, side, x, 74, 80);
        text(side === 'cop' ? '保安' : '小偷', x + 92, 114, 22);
        ['经典头像', '猫狐头像', '星际头像'].forEach((label, j) =>
          button(label, x, 168 + j * 49, Math.min(240, width * 0.35), () =>
            chooseAvatar(side, ['team', 'animals', 'cosmic'][j]),
          ),
        );
      }
      return;
    }
    if (page === 'help') {
      [
        '点场内角色选中，再点道路设置目的地。',
        '点已选中且移动中的角色可停下。',
        '保安封住退路，至少两人持续合围 0.8 秒。',
        '小偷到达出口或撑到时间结束即可获胜。',
        '模式、角色、先手和轮换规则在选关页设置。',
        '冲刺提速 20% 持续 4 秒；失败可回溯约 5 秒。',
        '前 5 局各赠 1 次，每局每种可看广告补 1 次。',
      ].forEach((line, i) => text(line, 24, 84 + i * 32, 15));
      if (channel) button('B站入口', width - 190, height - 58, 166, () => { page = 'channel'; });
    }
    if (page === 'channel' && channel) {
      const snapshot = channel.getSnapshot(); text(`收藏签 ${snapshot.count || 0} 枚`, 24, 86);
      channel.menuActions.forEach((action, i) => button(action.label, 24, 116 + i * 54, Math.min(320, width - 48), () => runChannel(action)));
      text(channelMessage || snapshot.message || '', 24, 244, 14);
      button('返回帮助', width - 190, height - 58, 166, () => { page = 'help'; });
    }
  }
  function touch(event) {
    if (stopped || hidden || supportBusy || page === 'pk') return;
    const point = event.changedTouches?.[0] || event.touches?.[0];
    if (!point) return;
    const x = (point.clientX ?? point.x) - originX,
      y = (point.clientY ?? point.y) - originY;
    const start = gesture;
    gesture = null;
    if (event.touches?.length || event.changedTouches?.length > 1) return;
    if (hasTouchStart && (!start || start.page !== page || start.id !== (point.identifier ?? 0) || start.moved || Math.hypot(x - start.x, y - start.y) > 12)) return;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > width || y > height) return;
    const hit = hits.find(
      (item) => x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h,
    );
    if (hit) {
      hit.action();
      draw();
      return;
    }
    if (page !== 'game' || y >= height - 54) return;
    const action = renderer.tap(x, y, view());
    if (!action) return;
    const command =
      action.type === 'hold'
        ? role === 'cop'
          ? holdCop
          : holdRobber
        : role === 'cop'
          ? commandCop
          : commandRobber;
    if (command(game, action.actor, action)) orders.push({ tick: ticks, ...action });
    draw();
  }
  function frame() {
    if (stopped) return;
    const now = Date.now(),
      dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!hidden && page === 'game' && game.phase === 'playing') {
      accumulated += dt;
      while (accumulated >= 1 / 60 && game.phase === 'playing') {
        stepGame(game, 1 / 60);
        ticks++;
        accumulated -= 1 / 60;
        game.events.length = 0;
      }
      if (game.phase !== 'playing') {
        page = 'result';
        if (game.phase === (role === 'cop' ? 'won' : 'lost')) {
          const scoreKey = (game.support?.assisted ? 'assisted:' : '') + key();
          progress[scoreKey] = Math.min(progress[scoreKey] || Infinity, game.time);
          persist();
          submitting = { config: runConfig(game), ticks, orders: orders.slice(),admission:runAdmission };
          if (ONLINE_ENABLED && !game.support?.assisted) void upload();
        }
      }
    } else accumulated = 0;
    draw();
  }
  const hide = () => {
    gesture = null;
    hidden = true;
    if (page === 'game' && !supportRequest) {
      game.phase = 'paused';
      page = 'pause';
    }
  };
  const show = () => {
    gesture = null;
    hidden = false;
    finishSupport();
    last = Date.now();
    draw();
  };
  const touchStart = (event) => {
    gesture = null;
    if (stopped || hidden || supportBusy || page === 'pk' || event.touches?.length > 1 || event.changedTouches?.length > 1) return;
    const point = event.changedTouches?.[0] || event.touches?.[0];
    if (!point) return;
    gesture = { x: (point.clientX ?? point.x) - originX, y: (point.clientY ?? point.y) - originY, id: point.identifier ?? 0, page, moved: false };
  };
  const touchMove = (event) => {
    if (!gesture) return;
    if (event.touches?.length > 1 || stopped || hidden || page !== gesture.page) { gesture = null; return; }
    const point = event.changedTouches?.find((item) => (item.identifier ?? 0) === gesture.id);
    if (point && Math.hypot((point.clientX ?? point.x) - originX - gesture.x, (point.clientY ?? point.y) - originY - gesture.y) > 12) gesture.moved = true;
  };
  const touchCancel = () => { gesture = null; };
  sdk.onTouchStart?.(touchStart);
  sdk.onTouchMove?.(touchMove);
  sdk.onTouchCancel?.(touchCancel);
  sdk.onTouchEnd(touch);
  sdk.onHide(hide);
  sdk.onShow(show);
  sdk.onWindowResize?.(resize);
  const channelOff = channel?.subscribe?.(() => { if (page === 'channel') draw(); });
  const interval = setInterval(frame, 1000 / 60);
  draw();
  const query = sdk.getLaunchOptionsSync?.()?.query;
  if (ONLINE_ENABLED && (query?.matchId || query?.pk)) openPK();
  return {
    canvas,
    getState: () => ({ page, phase: game?.phase, ticks, time: game?.time, startedRuns,
      support: game?.support && { sprint: game.support.sprint, rewind: game.support.rewind,
        assisted: game.support.assisted, remaining: sprintRemaining(game), busy: supportBusy } }),
    getLayout: () => ({ width, height, originX, originY, hits: hits.map(({ action, ...hit }) => hit) }),
    stop() {
      stopped = true;
      ads.dispose?.();
      clearInterval(interval);
      pk?.stop();
      channelOff?.();
      gesture = null;
      sdk.offTouchStart?.(touchStart);
      sdk.offTouchMove?.(touchMove);
      sdk.offTouchCancel?.(touchCancel);
      sdk.offTouchEnd(touch);
      sdk.offHide(hide);
      sdk.offShow(show);
      sdk.offWindowResize?.(resize);
    },
  };
}
