import { levels } from '../../local/cops-robbers/src/levels.js';
import { initialState, legalTargets, stateKey, step } from '../../local/cops-robbers/src/engine.js';
import {
  relayLevels,
  relayTargets,
  movedOfficer,
  lastOfficer,
} from '../../local/cops-robbers/src/relay.js';
import {
  quickTrials,
  quickOutcome,
  quickSolutions,
} from '../../local/cops-robbers/src/quick-trials.js';
import {
  optimalSolutions,
  optimalRelaySolutions,
} from '../../local/cops-robbers/src/optimal-solutions.js';
import { duelLevels, getDuelLevel } from '../../local/cops-robbers/src/duel-levels.js';
import {
  initialDuel,
  legalDuelTargets,
  stepDuel,
  chooseDuelAction,
} from '../../local/cops-robbers/src/duel.js';
import { levelUnlocked } from '../../local/cops-robbers/src/progress.js';
import { createRenderer } from '../../local/cops-robbers/src/competition-renderer.js';

const copy = (value) => JSON.parse(JSON.stringify(value));
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const modes = {
  standard: { label: '围堵挑战', list: levels, records: 'completed' },
  relay: { label: '换防接力', list: relayLevels, records: 'relayCompleted' },
  quick: { label: '短场试炼', list: quickTrials, records: 'quickCompleted' },
  escape: { label: '出口竞速', list: duelLevels.filter((level) => level.mode === 'escape') },
  survival: { label: '限步周旋', list: duelLevels.filter((level) => level.mode === 'survival') },
};
const inside = (point, hit) =>
  point.x >= hit.x && point.y >= hit.y && point.x <= hit.x + hit.w && point.y <= hit.y + hit.h;
const opposite = (role) => (role === 'pursuer' ? 'runner' : 'pursuer');
const roleLabel = (role) => (role === 'pursuer' ? '警察' : '小偷');

/** Cocos owns the screen; the supplied SDK owns this independent 2D surface. */
export function startCocosCopsGame(sdk, config = {}, startNativeCompetition) {
  for (const name of [
    'createCanvas',
    'getSystemInfoSync',
    'onTouchStart',
    'offTouchStart',
    'onTouchEnd',
    'offTouchEnd',
    'onTouchCancel',
    'offTouchCancel',
    'onHide',
    'offHide',
    'onShow',
    'offShow',
  ]) {
    if (typeof sdk?.[name] !== 'function') throw new Error(`围捕小队宿主缺少 ${name}`);
  }
  const canvas = sdk.createCanvas(),
    ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('围捕小队需要独立的 2D 画布');
  const developer = config.developer === true;
  const campaignKey = developer ? 'cops-robbers-practice-v3' : 'cops-robbers-v3';
  const duelKey = developer ? 'cops-robbers-duel-practice-v1' : 'cops-robbers-duel-v1';
  const scheduler = config.scheduler || {};
  const later = scheduler.setTimeout?.bind(scheduler) || globalThis.setTimeout.bind(globalThis);
  const clearLater =
    scheduler.clearTimeout?.bind(scheduler) || globalThis.clearTimeout.bind(globalThis);
  const now = scheduler.now?.bind(scheduler) || Date.now;
  const random = scheduler.random?.bind(scheduler) || Math.random;
  let storageOK = true;
  const read = (key) => {
    try {
      const value = sdk.getStorageSync(key);
      const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : value;
      return object(parsed) ? parsed : {};
    } catch {
      storageOK = false;
      return {};
    }
  };
  const save = read(campaignKey),
    duelSave = read(duelKey);
  for (const info of Object.values(modes).filter((info) => info.records)) {
    const records = save[info.records];
    save[info.records] = Object.fromEntries(
      info.list
        .filter(
          (map) =>
            Number.isInteger(records?.[map.id]?.turns) &&
            records[map.id].turns > 0 &&
            records[map.id].turns < 100000 &&
            (!map.turnLimit || records[map.id].turns <= map.turnLimit) &&
            [1, 2, 3].includes(records[map.id].stars),
        )
        .map((map) => [map.id, records[map.id]]),
    );
  }
  save.settings = object(save.settings) ? save.settings : {};
  save.patrols = object(save.patrols) ? save.patrols : {};
  if (object(save.current)) {
    const key = `${save.current.mode === 'quick' ? 'quick' : 'challenge'}:${save.current.rule === 'relay' ? 'relay' : 'standard'}`;
    save.patrols[key] ||= save.current;
  }
  duelSave.wins = Object.fromEntries(
    Object.entries(object(duelSave.wins) ? duelSave.wins : {}).filter(([key, won]) => {
      const [mode, role, id, extra] = key.split(':');
      return (
        !extra && ['pursuer', 'runner'].includes(role) && getDuelLevel(mode, id) && won === true
      );
    }),
  );
  duelSave.sessions = object(duelSave.sessions) ? duelSave.sessions : {};
  const rememberedMode = duelSave['solo-mode'] === 'challenge' ? 'standard' : duelSave['solo-mode'];
  let mode = Object.hasOwn(modes, rememberedMode) ? rememberedMode : 'standard';
  let role = ['pursuer', 'runner'].includes(duelSave['solo-role'])
    ? duelSave['solo-role']
    : 'pursuer';
  let initiative = ['first', 'second', 'random'].includes(duelSave['solo-initiative'])
    ? duelSave['solo-initiative']
    : 'first';
  let firstSide = role,
    level = modes[mode].list[0],
    board = initialState(level),
    history = [],
    selected = 0;
  let page = 'home',
    helpReturn = 'home',
    pageIndex = 0,
    hits = [],
    note = '',
    hintNode = -1;
  let active = false,
    stopped = false,
    disposed = false,
    visible = true,
    pressed = null,
    lastTap = -Infinity;
  let width = 390,
    height = 844,
    top = 20,
    bottom = 20,
    leftInset = 24,
    rightInset = 24;
  let aiTimer = null,
    generation = 0,
    child;
  const subscriptions = [],
    channel = sdk.channelEntry;
  let channelMessage = '';
  const isDuel = () => mode === 'escape' || mode === 'survival';
  const list = () => modes[mode].list;
  const patrolKey = () =>
    `${mode === 'quick' ? 'quick' : 'challenge'}:${mode === 'relay' ? 'relay' : 'standard'}`;
  const duelSessionKey = () => `${mode}:${role}`;
  const records = () => save[modes[mode].records];
  const wonDuel = (id) => duelSave.wins[`${mode}:${role}:${id}`] === true;
  const validBoard = (state, map, duel = false) =>
    object(state) &&
    Array.isArray(state.cops) &&
    state.cops.length === map.cops.length &&
    new Set(state.cops).size === state.cops.length &&
    state.cops.every((n) => Number.isInteger(n) && n >= 0 && n < map.nodes.length) &&
    Array.isArray(state.robbers) &&
    state.robbers.length === map.robbers.length &&
    state.robbers.every(
      (n) =>
        Number.isInteger(n) &&
        n >= (duel ? -1 : -2) &&
        n < map.nodes.length &&
        (n < 0 || !state.cops.includes(n)),
    ) &&
    Number.isInteger(state.turn) &&
    state.turn >= 0 &&
    state.turn < 100000 &&
    (!duel ||
      (['pursuer', 'runner'].includes(state.side) &&
        [null, 'pursuer', 'runner'].includes(state.winner)));
  function snapshot() {
    const current = isDuel() ? duelSave.sessions[duelSessionKey()] : save.patrols[patrolKey()];
    const map = list().find((item) => item.id === current?.levelId);
    if (!map || !validBoard(current.state, map, isDuel())) return null;
    if (isDuel())
      return current.role === role &&
        current.mode === mode &&
        ['pursuer', 'runner'].includes(current.firstSide) &&
        !current.state.winner &&
        current.state.turn < map.roundLimit * 2 &&
        current.state.robbers.some((n) => n >= 0) &&
        !current.state.robbers.some((n) => map.exits.includes(n))
        ? current
        : null;
    return current.state.robbers.some((n) => n >= 0) &&
      !current.state.robbers.includes(-2) &&
      (!map.turnLimit || current.state.turn < map.turnLimit)
      ? current
      : null;
  }
  const unlocked = (id) =>
    isDuel()
      ? developer || id === 1 || wonDuel(id) || wonDuel(id - 1)
      : levelUnlocked(list(), records(), id, developer || snapshot()?.levelId === id);
  const outcome = () =>
    isDuel()
      ? board.winner
        ? board.winner === role
          ? 'won'
          : 'lost'
        : 'planning'
      : mode === 'quick'
        ? quickOutcome(level, board)
        : board.robbers.includes(-2)
          ? 'lost'
          : board.robbers.every((n) => n === -1)
            ? 'won'
            : 'planning';
  function persist() {
    if (active) {
      if (isDuel())
        duelSave.sessions[duelSessionKey()] = {
          mode,
          role,
          firstSide,
          levelId: level.id,
          state: copy(board),
        };
      else {
        const current = {
          mode: mode === 'quick' ? 'quick' : 'challenge',
          rule: mode === 'relay' ? 'relay' : 'standard',
          levelId: level.id,
          state: copy(board),
          history: copy(history.slice(-100)),
        };
        save.current = current;
        save.patrols[patrolKey()] = current;
      }
    }
    save.version = 3;
    Object.assign(duelSave, {
      'solo-mode': mode === 'standard' ? 'challenge' : mode,
      'solo-role': role,
      'solo-initiative': initiative,
      level: level.id,
    });
    let success = true;
    for (const [key, value] of [
      [campaignKey, save],
      [duelKey, duelSave],
    ]) {
      try {
        sdk.setStorageSync(key, JSON.stringify(value));
      } catch {
        success = false;
      }
    }
    storageOK = success;
  }
  function cancelAI() {
    generation++;
    if (aiTimer !== null) clearLater(aiTimer);
    aiTimer = null;
  }
  function changePage(next) {
    cancelAI();
    pressed = null;
    hintNode = -1;
    page = next;
    if (next === 'play') scheduleAI();
  }
  function scheduleAI() {
    if (
      aiTimer !== null ||
      !isDuel() ||
      !active ||
      stopped ||
      disposed ||
      !visible ||
      page !== 'play' ||
      board.winner ||
      board.side === role
    )
      return;
    const token = generation;
    aiTimer = later(() => {
      // A cancelled callback must not clear the handle of a newer scheduled turn.
      if (token !== generation) return;
      aiTimer = null;
      if (stopped || disposed || !visible || page !== 'play' || board.winner || board.side === role)
        return;
      const action = chooseDuelAction(level, board);
      if (action) {
        board = stepDuel(level, board, action);
        finishMove();
      }
    }, 320);
  }
  function chooseMode(next) {
    persist();
    cancelAI();
    active = false;
    mode = next;
    level = list()[0];
    board = initialState(level);
    history = [];
    selected = 0;
    note = '';
    pageIndex = 0;
    changePage(isDuel() ? 'setup' : 'home');
    persist();
  }
  function chooseRole(next) {
    persist();
    cancelAI();
    active = false;
    role = next;
    level = list()[0];
    selected = 0;
    persist();
  }
  function load(id, resume = null, retry = false) {
    const map = list().find((item) => item.id === id);
    if (!map || !unlocked(id)) return;
    cancelAI();
    level = map;
    hintNode = -1;
    if (isDuel()) {
      const restored =
        resume &&
        validBoard(resume.state, level, true) &&
        resume.role === role &&
        ['pursuer', 'runner'].includes(resume.firstSide);
      if (restored) firstSide = resume.firstSide;
      else if (!retry)
        firstSide =
          initiative === 'random'
            ? random() < 0.5
              ? 'pursuer'
              : 'runner'
            : initiative === 'first'
              ? role
              : opposite(role);
      board = restored ? copy(resume.state) : initialDuel(level, firstSide);
      history = [];
    } else {
      board = resume && validBoard(resume.state, level) ? copy(resume.state) : initialState(level);
      history = Array.isArray(resume?.history)
        ? resume.history
            .filter((state) => validBoard(state, level))
            .slice(-100)
            .map(copy)
        : [];
      if (mode === 'relay') board.relayLast = lastOfficer(board, history);
    }
    active = true;
    selected = 0;
    note = '';
    pressed = null;
    page = 'play';
    persist();
    draw();
    scheduleAI();
  }
  function start() {
    const current = snapshot();
    const next =
      list().find((map) => unlocked(map.id) && !(isDuel() ? wonDuel(map.id) : records()[map.id])) ||
      list()[0];
    load(current?.levelId || next.id, current);
  }
  const myPositions = () => (isDuel() && role === 'runner' ? board.robbers : board.cops);
  const canAct = () =>
    page === 'play' &&
    active &&
    visible &&
    !stopped &&
    outcome() === 'planning' &&
    (!isDuel() || board.side === role);
  const targets = () =>
    !canAct()
      ? []
      : isDuel()
        ? legalDuelTargets(level, board, selected)
        : mode === 'relay'
          ? relayTargets(level, board, selected, lastOfficer(board, history))
          : legalTargets(level, board, selected);
  function finishMove() {
    const result = outcome();
    if (result === 'won') {
      if (isDuel()) duelSave.wins[`${mode}:${role}:${level.id}`] = true;
      else {
        const par = mode === 'relay' ? optimalRelaySolutions[level.id].length : level.par;
        const stars = board.turn <= par ? 3 : board.turn <= par + 3 ? 2 : 1;
        if (!records()[level.id] || board.turn < records()[level.id].turns)
          records()[level.id] = { turns: board.turn, stars };
      }
    }
    if (result !== 'planning') changePage('result');
    if (myPositions()[selected] < 0)
      selected = Math.max(
        0,
        myPositions().findIndex((node) => node >= 0),
      );
    persist();
    draw();
    scheduleAI();
  }
  function move(target) {
    if (!canAct()) return;
    if (!targets().includes(target)) {
      note = mode === 'relay' ? '接力需换人，请点相邻空路口' : '只能走到亮起的相邻路口';
      return;
    }
    hintNode = -1;
    note = '';
    if (isDuel())
      board = stepDuel(level, board, { type: 'move', side: role, actor: selected, target });
    else {
      const before = copy(board),
        plan = [...board.cops];
      plan[selected] = target;
      board = step(level, board, plan).state;
      if (mode === 'relay') {
        const actor = movedOfficer(before, plan);
        board.relayLast = actor < 0 ? lastOfficer(before, history) : actor;
      }
      history.push(before);
      history = history.slice(-100);
    }
    if (save.settings.nativeHaptics !== false) {
      try {
        sdk.vibrateShort?.({ type: 'light' });
      } catch {
        /* optional feedback */
      }
    }
    finishMove();
  }
  function showHint() {
    if (!canAct() || isDuel()) return;
    const reference = (
      mode === 'quick'
        ? quickSolutions
        : mode === 'relay'
          ? optimalRelaySolutions
          : optimalSolutions
    )[level.id];
    let cursor = initialState(level),
      last = -1;
    for (let index = 0; index < reference.length; index++) {
      if (
        stateKey(cursor) === stateKey(board) &&
        (mode !== 'relay' || last === lastOfficer(board, history)) &&
        (mode !== 'quick' || reference.length - index <= level.turnLimit - board.turn)
      ) {
        selected = Math.max(0, movedOfficer(board, reference[index]));
        hintNode = reference[index][selected];
        note = `已核验路线：${selected + 1} 号${hintNode === board.cops[selected] ? '留守一步' : `到 ${hintNode + 1} 号路口`}`;
        return;
      }
      const actor = movedOfficer(cursor, reference[index]);
      if (actor >= 0) last = actor;
      cursor = step(level, cursor, reference[index]).state;
    }
    hintNode = -1;
    note = '当前局面暂无已核验提示，可撤销或重试';
  }
  const subscribe = (on, off, listener) => {
    if (typeof sdk[on] === 'function' && typeof sdk[off] === 'function') {
      sdk[on](listener);
      subscriptions.push(() => sdk[off](listener));
    }
  };
  function stopLocal() {
    persist();
    cancelAI();
    stopped = true;
    pressed = null;
    for (const unsubscribe of subscriptions.splice(0)) {
      try {
        unsubscribe();
      } catch {
        /* cleanup must continue */
      }
    }
  }
  function launchCompetition() {
    if (
      config.competitionEnabled !== true ||
      !/^https:\/\//.test(config.apiUrl || '') ||
      !startNativeCompetition ||
      stopped
    )
      return;
    stopLocal();
    const leave = () => {
      if (disposed) return;
      (child?.stop || child?.dispose)?.call(child);
      const overlay = new Proxy(sdk, {
        get(target, key) {
          if (key === 'createCanvas') return () => canvas;
          const value = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      child = startCocosCopsGame(overlay, config, startNativeCompetition);
    };
    child = startNativeCompetition(sdk, { ...config, canvas, onExit: leave }, createRenderer);
  }
  function resize() {
    pressed = null;
    const info = sdk.getSystemInfoSync(),
      ratio = Math.max(1, Math.min(3, info.pixelRatio || 1));
    width = info.windowWidth || info.screenWidth || 390;
    height = info.windowHeight || info.screenHeight || 844;
    top = Math.max(12, info.safeArea?.top || 0);
    bottom = Math.max(12, height - (info.safeArea?.bottom || height));
    leftInset = Math.max(24, info.safeArea?.left || 0);
    rightInset = Math.max(24, width - (info.safeArea?.right || width));
    try {
      const capsule = sdk.getMenuButtonBoundingClientRect?.();
      if (capsule?.bottom) top = Math.max(top, capsule.bottom + 8);
    } catch {
      /* optional capsule */
    }
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }
  function draw() {
    if (stopped || disposed) return;
    hits = [];
    ctx.fillStyle = '#f5f0e5';
    ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const span = width - leftInset - rightInset,
      center = leftInset + span / 2;
    const text = (label, x, y, size = 16, color = '#263e43', maxWidth = span) => {
      ctx.fillStyle = color;
      ctx.font = `${size}px sans-serif`;
      ctx.fillText(String(label), x, y, maxWidth);
    };
    const button = (id, label, y, action, enabled = true, x = leftInset, w = span) => {
      ctx.fillStyle = enabled ? '#1258c2' : '#aab8b2';
      ctx.fillRect(x, y, w, 46);
      text(label, x + w / 2, y + 23, 16, '#fff', w - 12);
      if (enabled) hits.push({ id, label, x, y, w, h: 46, action });
    };
    const title = (label) => text(label, center, top + 28, 24);
    const home = () => {
      persist();
      changePage('home');
    };
    const backY = height - bottom - 56;
    if (page === 'home') {
      title('围捕小队');
      text(`${modes[mode].label}${isDuel() ? ` · ${roleLabel(role)}` : ''}`, center, top + 70);
      const base = top + 100;
      button('start', snapshot() ? '继续游戏' : '开始游戏', base, start);
      button('levels', '选择关卡', base + 56, () => {
        pageIndex = 0;
        changePage('levels');
      });
      button('modes', '选择玩法', base + 112, () => changePage('modes'));
      button('help', '学习 / 帮助 / 设置', base + 168, () => {
        helpReturn = 'home';
        changePage('help');
      });
      if (isDuel())
        button(
          'setup',
          '角色与先手',
          base + 224,
          () => changePage('setup'),
          true,
          leftInset,
          config.competitionEnabled === true &&
            /^https:\/\//.test(config.apiUrl || '') &&
            startNativeCompetition
            ? (span - 10) / 2
            : span,
        );
      if (
        config.competitionEnabled === true &&
        /^https:\/\//.test(config.apiUrl || '') &&
        startNativeCompetition
      )
        button(
          'competition',
          '好友挑战',
          base + 224,
          launchCompetition,
          true,
          isDuel() ? center + 5 : leftInset,
          isDuel() ? (span - 10) / 2 : span,
        );
      const count = isDuel()
        ? list().filter((map) => wonDuel(map.id)).length
        : Object.keys(records()).length;
      text(
        storageOK ? `已完成 ${count} / ${list().length} 关` : '暂时无法保存，本次仍可游玩',
        center,
        height - bottom - 20,
        13,
      );
    } else if (page === 'modes') {
      title('选择玩法');
      Object.entries(modes).forEach(([id, info], index) =>
        button(`mode:${id}`, `${info.label} · 120 关`, top + 70 + index * 54, () => chooseMode(id)),
      );
      button('back', '返回主页', backY, home);
    } else if (page === 'setup') {
      title(modes[mode].label);
      text('我的角色', center, top + 72);
      ['pursuer', 'runner'].forEach((value, index) =>
        button(
          `role:${value}`,
          `${role === value ? '✓ ' : ''}${roleLabel(value)}`,
          top + 94,
          () => chooseRole(value),
          true,
          leftInset + (index * (span + 10)) / 2,
          (span - 10) / 2,
        ),
      );
      text('出手顺序', center, top + 164);
      ['first', 'second', 'random'].forEach((value, index) =>
        button(
          `initiative:${value}`,
          `${initiative === value ? '✓ ' : ''}${['我先手', '我后手', '随机'][index]}`,
          top + 186,
          () => {
            persist();
            cancelAI();
            active = false;
            initiative = value;
            delete duelSave.sessions[duelSessionKey()];
            persist();
          },
          true,
          leftInset + (index * (span + 8)) / 3,
          (span - 16) / 3,
        ),
      );
      button('start', snapshot() ? '继续对抗' : '开始对抗', top + 252, start);
      button('levels', '选择关卡', top + 308, () => {
        pageIndex = 0;
        changePage('levels');
      });
      button('back', '返回主页', backY, home);
    } else if (page === 'levels') {
      title(`${modes[mode].label} · 选关`);
      const rows = Math.max(1, Math.min(6, Math.floor((height - top - bottom - 204) / 54))),
        startIndex = pageIndex * rows;
      list()
        .slice(startIndex, startIndex + rows)
        .forEach((map, index) => {
          const record = isDuel() ? wonDuel(map.id) : records()[map.id];
          button(
            `level:${map.id}`,
            `${map.id} ${map.name}${record ? (isDuel() ? ' ✓' : ` ${'★'.repeat(record.stars)}`) : unlocked(map.id) ? '' : ' · 未解锁'}`,
            top + 65 + index * 54,
            () => load(map.id),
            unlocked(map.id),
          );
        });
      button(
        'previous',
        '上一页',
        backY - 56,
        () => pageIndex--,
        pageIndex > 0,
        leftInset,
        (span - 10) / 2,
      );
      button(
        'next',
        '下一页',
        backY - 56,
        () => pageIndex++,
        startIndex + rows < list().length,
        center + 5,
        (span - 10) / 2,
      );
      button('back', '返回主页', backY, home);
    } else if (page === 'help') {
      title('学习与设置');
      const lines = isDuel()
        ? [
            '点自己的队员，再点亮起的路口。',
            '双方轮流移动一人，也可以留守。',
            '警察走到小偷的位置即可抓捕。',
            mode === 'escape' ? '小偷到出口即胜，警察要全部抓获。' : `小偷坚持规定回合即胜。`,
            '双方角色分别保存通关进度。',
          ]
        : [
            '点蓝色队员，再点相邻空路口。',
            '每步移动一人，电脑随后行动。',
            '堵住全部退路完成拦截。',
            '橙色出口必须优先守住。',
            '接力：连续移动必须换人。',
            '快练：在限制步数内收网。',
          ];
      lines.forEach((line, index) => text(line, center, top + 76 + index * 28, 15));
      button(
        'haptics',
        `触感反馈：${save.settings.nativeHaptics === false ? '关' : '开'}`,
        backY - 112,
        () => {
          save.settings.nativeHaptics = save.settings.nativeHaptics === false;
          persist();
        },
        true,
        leftInset,
        channel ? (span - 10) / 2 : span,
      );
      if (channel)
        button(
          'channel',
          'B站入口',
          backY - 112,
          () => changePage('channel'),
          true,
          center + 5,
          (span - 10) / 2,
        );
      text('本入口无音频素材', center, backY - 28, 12);
      button('back', '返回', backY, () => changePage(helpReturn));
    } else if (page === 'channel' && channel) {
      title('B站入口');
      const status = channel.getSnapshot();
      text(`收藏签 ${status.count || 0} 枚`, center, top + 76);
      channel.menuActions.forEach((action, index) =>
        button(`channel:${index}`, action.label, top + 108 + index * 54, () => {
          if (action.available === false) {
            channelMessage = '宿主暂不支持此入口';
            return;
          }
          Promise.resolve()
            .then(() => action.run())
            .catch((error) => {
              channelMessage = error.message;
            })
            .finally(draw);
        }),
      );
      text(channelMessage || status.message || '', center, backY - 24, 13);
      button('back', '返回帮助', backY, () => changePage('help'));
    } else if (page === 'pause' || page === 'result') {
      const won = outcome() === 'won';
      title(
        page === 'pause'
          ? '游戏已暂停'
          : isDuel()
            ? won
              ? '挑战成功'
              : '本局落败'
            : won
              ? '拦截成功'
              : '突围成功',
      );
      text(`${level.name} · ${board.turn} 步`, center, top + 74);
      const y = top + 108,
        next = list()[list().indexOf(level) + 1];
      if (page === 'pause') button('resume', '继续', y, () => changePage('play'));
      else
        button('continue', won && next ? '下一关' : '重试', y, () =>
          load(won && next ? next.id : level.id, null, !(won && next)),
        );
      button('retry', '重试本关', y + 56, () => load(level.id, null, true));
      button('help', '学习 / 帮助', y + 112, () => {
        helpReturn = page;
        changePage('help');
      });
      button('home', '返回主页', y + 168, home);
    } else if (page === 'play') {
      title(level.name);
      text(
        isDuel()
          ? `我是${roleLabel(role)} · ${roleLabel(firstSide)}先手 · ${Math.floor(board.turn / 2)}/${level.roundLimit} 回合`
          : `${board.turn} 步${mode === 'quick' ? ` / ${level.turnLimit}` : ''}`,
        center,
        top + 63,
        14,
      );
      const size = Math.max(96, Math.min(span + 16, height - top - bottom - 240)),
        left = center - size / 2,
        boardTop = top + 86;
      const point = (n) => ({
        x: left + (level.nodes[n].x / 600) * size,
        y: boardTop + (level.nodes[n].y / 600) * size,
      });
      ctx.fillStyle = '#e3e8d2';
      ctx.fillRect(left, boardTop, size, size);
      ctx.lineWidth = Math.max(8, size * 0.03);
      ctx.strokeStyle = '#fff8eb';
      for (const [a, b] of level.edges) {
        const p = point(a),
          q = point(b);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
      const legal = targets(),
        circle = (p, radius, color) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          ctx.fill();
        };
      level.nodes.forEach((_, n) => {
        const p = point(n);
        if (hintNode === n) circle(p, 20, '#ffd35b');
        circle(
          p,
          legal.includes(n) ? 12 : 9,
          level.exits.includes(n) ? '#ec9a43' : legal.includes(n) ? '#8dbded' : '#fff',
        );
        text(n + 1, p.x, p.y, 11);
        if (canAct())
          hits.push({
            id: `node${n}`,
            x: p.x - 22,
            y: p.y - 22,
            w: 44,
            h: 44,
            action: () => move(n),
          });
      });
      for (const [side, positions] of [
        ['runner', board.robbers],
        ['pursuer', board.cops],
      ])
        positions.forEach((n, index) => {
          if (n < 0) return;
          const p = point(n),
            mine = side === (isDuel() ? role : 'pursuer');
          if (mine && index === selected) circle(p, 23, '#fff');
          circle(p, 17, side === 'pursuer' ? '#1258c2' : '#d65b19');
          text(`${side === 'runner' ? '突' : ''}${index + 1}`, p.x, p.y, 12, '#fff');
          if (mine && canAct())
            hits.push({
              id: `${side === 'pursuer' ? 'cop' : 'robber'}${index}`,
              actor: true,
              x: p.x - 22,
              y: p.y - 22,
              w: 44,
              h: 44,
              action: () => {
                selected = index;
                note = '';
                hintNode = -1;
              },
            });
        });
      const y = backY - 56;
      text(
        note ||
          (isDuel() && board.side !== role
            ? '电脑思考中…'
            : `已选 ${selected + 1} 号 · 点相邻路口`),
        center,
        y - 22,
        13,
      );
      if (isDuel()) button('wait', '留守一步', y, () => move(myPositions()[selected]), canAct());
      else {
        const third = (span - 16) / 3;
        button('wait', '留守', y, () => move(board.cops[selected]), canAct(), leftInset, third);
        button(
          'undo',
          '撤销',
          y,
          () => {
            board = history.pop();
            hintNode = -1;
            note = '';
            persist();
          },
          history.length > 0,
          leftInset + third + 8,
          third,
        );
        button('hint', '提示', y, showHint, canAct(), leftInset + (third + 8) * 2, third);
      }
      button('pause', '暂停', backY, () => {
        persist();
        changePage('pause');
      });
      ctx.fillStyle = '#fff';
      ctx.fillRect(leftInset + 16, backY + 13, 5, 20);
      ctx.fillRect(leftInset + 25, backY + 13, 5, 20);
    }
    config.onFrame?.(canvas);
  }
  const point = (touch) => ({ x: touch.clientX ?? touch.x, y: touch.clientY ?? touch.y });
  const find = (position) =>
    hits
      .filter((hit) => inside(position, hit))
      .sort(
        (a, b) =>
          Math.hypot(position.x - a.x - a.w / 2, position.y - a.y - a.h / 2) -
            Math.hypot(position.x - b.x - b.w / 2, position.y - b.y - b.h / 2) ||
          Number(Boolean(b.actor)) - Number(Boolean(a.actor)),
      )[0];
  const cancel = () => {
    pressed = null;
  };
  subscribe('onTouchStart', 'offTouchStart', (event) => {
    const touches = event.touches || [];
    if (!visible || stopped || touches.length !== 1 || pressed) {
      cancel();
      return;
    }
    const touch = touches[0],
      hit = find(point(touch));
    pressed = hit ? { hit, identifier: touch.identifier, page } : null;
  });
  subscribe('onTouchMove', 'offTouchMove', (event) => {
    const touches = event.touches || [];
    if (
      !pressed ||
      touches.length !== 1 ||
      touches[0].identifier !== pressed.identifier ||
      !inside(point(touches[0]), pressed.hit)
    )
      cancel();
  });
  subscribe('onTouchCancel', 'offTouchCancel', cancel);
  subscribe('onTouchEnd', 'offTouchEnd', (event) => {
    const prior = pressed;
    cancel();
    const touches = event.changedTouches || [];
    if (
      !visible ||
      stopped ||
      !prior ||
      touches.length !== 1 ||
      event.touches?.length ||
      touches[0].identifier !== prior.identifier ||
      prior.page !== page
    )
      return;
    const hit = find(point(touches[0]));
    if (
      !hit ||
      hit.id !== prior.hit.id ||
      !inside(point(touches[0]), prior.hit) ||
      now() - lastTap < 120
    )
      return;
    lastTap = now();
    prior.hit.action();
    draw();
  });
  subscribe('onHide', 'offHide', () => {
    visible = false;
    cancel();
    cancelAI();
    if (page === 'play') page = 'pause';
    persist();
    draw();
  });
  subscribe('onShow', 'offShow', () => {
    visible = true;
    cancel();
    resize();
  });
  subscribe('onWindowResize', 'offWindowResize', resize);
  if (channel?.subscribe)
    subscriptions.push(
      channel.subscribe(() => {
        if (page === 'channel') draw();
      }),
    );
  function dispose() {
    if (disposed) return;
    disposed = true;
    if (!stopped) stopLocal();
    (child?.dispose || child?.stop)?.call(child);
    child = null;
  }
  resize();
  return {
    canvas,
    dispose,
    getState: () =>
      child?.getState?.() || {
        page,
        mode,
        role,
        initiative,
        firstSide,
        levelId: level.id,
        board: copy(board),
        selected,
        active,
        storageOK,
        aiPending: aiTimer !== null,
        outcome: active ? outcome() : null,
        note,
        hintNode,
        hits: hits.map(({ action, ...hit }) => hit),
      },
  };
}
