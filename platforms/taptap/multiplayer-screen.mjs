import { createTapMultiplayerSession } from './multiplayer-session.mjs';

/** Shared native Canvas page; only the H5 SDK bridge knows about DOM input. */
export function startTapMultiplayerScreen({ sdk, canvas, services, descriptor, onExit }) {
  const ctx = canvas.getContext('2d');
  let session = null,
    renderer = null,
    stopped = false,
    busy = false,
    roomInput = '',
    mode = descriptor.modes[0].id;
  let message = '',
    hits = [],
    press = null,
    keyboardOpen = false,
    timer;
  let boardHits = [];
  let width = 1,
    height = 1,
    left = 0,
    top = 0,
    playTop = 56,
    drawnView,
    rotated = false,
    rotation = 0,
    physicalSafeWidth = 1,
    physicalSafeHeight = 1;
  const snapshot = () => session?.getSnapshot() || { phase: 'idle' };
  function draw() {
    if (stopped) return;
    const info = sdk.getSystemInfoSync(),
      pw = info.windowWidth || info.screenWidth,
      ph = info.windowHeight || info.screenHeight;
    const ratio = Math.min(info.pixelRatio || 1, 2);
    left = info.safeArea?.left || 0;
    top = Math.max(info.safeArea?.top || 0, sdk.getMenuButtonBoundingClientRect?.()?.bottom || 0);
    physicalSafeWidth = (info.safeArea?.right || pw) - left;
    physicalSafeHeight = (info.safeArea?.bottom || ph) - top;
    rotation = descriptor.realtime
      ? physicalSafeHeight > physicalSafeWidth
        ? 1
        : 0
      : physicalSafeWidth > physicalSafeHeight
        ? -1
        : 0;
    rotated = rotation !== 0;
    width = rotated ? physicalSafeHeight : physicalSafeWidth;
    height = rotated ? physicalSafeWidth : physicalSafeHeight;
    if (canvas.width !== Math.round(pw * ratio)) canvas.width = Math.round(pw * ratio);
    if (canvas.height !== Math.round(ph * ratio)) canvas.height = Math.round(ph * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#f4efdf';
    ctx.fillRect(0, 0, pw, ph);
    ctx.translate(left, top);
    if (rotated) {
      ctx.translate(rotation > 0 ? physicalSafeWidth : 0, rotation < 0 ? physicalSafeHeight : 0);
      ctx.rotate((rotation * Math.PI) / 2);
    }
    hits = [];
    const state = snapshot(),
      wide = width > height * 1.35;
    const text = (value, x, y, size = 16, color = '#343b31', max = width - 40) => {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `${size}px sans-serif`;
      ctx.fillStyle = color;
      ctx.fillText(value, x, y, max);
    };
    const button = (id, label, x, y, w, action, enabled = true, primary = false) => {
      const hit = {
        id,
        label,
        x,
        y,
        w,
        h: 46,
        action,
        enabled: enabled && (!busy || id === 'exit'),
      };
      hits.push(hit);
      ctx.fillStyle = !hit.enabled
        ? '#ddd9cb'
        : primary
          ? '#456449'
          : press?.hit?.id === id
            ? '#d2dfc6'
            : '#fffdf4';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, 46, 13);
      else ctx.rect(x, y, w, 46);
      ctx.fill();
      text(label, x + 13, y + 23, 15, primary && hit.enabled ? '#fffdf4' : '#343b31', w - 26);
    };
    button('exit', state.phase === 'idle' ? '返回' : '离开', width - 94, 4, 78, () => {
      api.stop();
      onExit?.();
    });
    text(
      state.phase === 'playing' ? descriptor.title : '好友联机',
      20,
      27,
      23,
      '#343b31',
      width - 126,
    );
    if (state.phase === 'playing') {
      renderer ||= descriptor.createRenderer();
      drawnView = state.view;
      ctx.save();
      ctx.translate(0, playTop);
      boardHits = renderer.draw(ctx, width, height - playTop - 24, drawnView);
      ctx.restore();
      text(state.pending ? '正在确认行动…' : state.message || '', 16, height - 12, 12, '#65705b');
      return;
    }
    drawnView = null;
    boardHits = [];
    const column = wide ? (width - 52) / 2 : width - 40,
      x = wide ? 32 + column : 20;
    if (['ended', 'finished'].includes(state.phase)) {
      text(state.message, 20, 104, 21);
      text('休闲对局，不计排行榜', 20, 144, 14, '#65705b');
      button(
        'again',
        '重新开一局',
        20,
        190,
        Math.min(column, 360),
        () =>
          run(async () => {
            await session.stop();
            session = null;
            renderer = null;
            message = '';
          }),
        true,
        true,
      );
      return;
    }
    if (state.phase === 'waiting') {
      text('房间号', 20, 82, 14, '#65705b');
      const chunks = state.roomId.match(/.{1,26}/g) || [];
      const lines = wide ? 2 : 6;
      chunks
        .slice(0, lines)
        .forEach((line, index) =>
          text(
            line + (index === lines - 1 && chunks.length > lines ? '…' : ''),
            20,
            110 + index * 20,
            14,
            '#343b31',
            column,
          ),
        );
      const idEnd = 110 + Math.min(chunks.length, lines) * 20;
      button('copy', '查看 / 复制完整房间号', 20, idEnd + 4, column, () => {
        if (!sdk.setClipboardData) return input(state.roomId);
        try {
          sdk.setClipboardData({ data: state.roomId, fail: () => input(state.roomId) });
        } catch {
          input(state.roomId);
        }
      });
      const rowTop = wide ? 82 : Math.max(212, idEnd + 62);
      text(
        `${descriptor.modes.find((item) => item.id === state.settings.mode)?.title}`,
        x,
        rowTop,
        16,
      );
      const ownSeat = state.playerId === state.ownerId ? 0 : 1;
      text(
        `我 · ${descriptor.seats[ownSeat]} · ${state.ready.includes(state.playerId) ? '已准备' : '未准备'}`,
        x,
        rowTop + 42,
        16,
      );
      const other = state.members.find((who) => who !== state.playerId);
      text(
        other
          ? `好友 · ${descriptor.seats[1 - ownSeat]} · ${state.ready.includes(other) ? '已准备' : '未准备'}`
          : '等待好友加入',
        x,
        rowTop + 82,
        16,
      );
      button(
        'ready',
        state.ready.includes(state.playerId) ? '已准备，等待好友' : '准备',
        x,
        rowTop + 112,
        column,
        () => run(() => session.ready()),
        !state.ready.includes(state.playerId),
        true,
      );
      if (height >= 340)
        text(message || '双方准备后自动开始，席位与地图本局固定。', 20, height - 40, 12, '#65705b');
      text(message || '仅同一 Tap 应用和版本入口可加入', 20, height - 18, 12, '#65705b');
      return;
    }
    text(`${descriptor.title} · 和朋友玩一局`, 20, 82, 15, '#65705b', column);
    button(
      'mode',
      descriptor.modes.find((item) => item.id === mode).title +
        (descriptor.modes.length > 1 ? '　›' : ''),
      20,
      112,
      column,
      () => {
        mode =
          descriptor.modes[
            (descriptor.modes.findIndex((item) => item.id === mode) + 1) % descriptor.modes.length
          ].id;
        draw();
      },
    );
    button('create', '创建双人房间', 20, 170, column, () => open(false), true, true);
    const inputTop = wide ? 112 : 286;
    if (!wide) text('已收到好友的房间号？', x, inputTop - 24, 15, '#65705b');
    button('room-input', roomInput || '点此输入房间号', x, inputTop, column, input);
    button('join', '加入房间', x, inputTop + 58, column, () => open(true), Boolean(roomInput));
    text(message || (busy ? '正在连接…' : '休闲对局，不计排行榜'), 20, height - 44, 13, '#65705b');
    text('同一应用加入；离开或切到后台结束本局', 20, height - 20, 12, '#65705b');
  }
  async function run(action) {
    if (busy || stopped) return;
    busy = true;
    message = '';
    draw();
    try {
      await action();
    } catch (error) {
      message = error.message || '连接失败，请重试';
    } finally {
      busy = false;
      draw();
    }
  }
  function open(join) {
    closeKeyboard();
    void run(async () => {
      session = createTapMultiplayerSession({
        sdk,
        descriptor,
        authenticate: () => services.connect(),
        onChange: draw,
      });
      if (join) await session.join(roomInput);
      else await session.create(mode);
    });
  }
  const keyboardValue = (result) => {
    if (!keyboardOpen || typeof result.value !== 'string') return;
    roomInput = result.value.slice(0, 160);
    draw();
  };
  const keyboardDone = (result) => {
    keyboardValue(result);
    closeKeyboard();
    draw();
  };
  function closeKeyboard() {
    if (!keyboardOpen) return;
    keyboardOpen = false;
    for (const [name, value] of [
      ['offKeyboardInput', keyboardValue],
      ['offKeyboardConfirm', keyboardDone],
      ['offKeyboardComplete', keyboardDone],
      ['hideKeyboard', {}],
    ]) {
      try {
        sdk[name]?.(value)?.catch?.(() => {});
      } catch {
        /* A destroyed keyboard must never strand the room page. */
      }
    }
  }
  function input(defaultValue = roomInput) {
    if (!sdk.showKeyboard || !sdk.onKeyboardConfirm || !sdk.offKeyboardConfirm) {
      message = '当前客户端不支持输入房间号';
      draw();
      return;
    }
    closeKeyboard();
    keyboardOpen = true;
    const failed = () => {
      closeKeyboard();
      message = '键盘未能打开，请重试';
      draw();
    };
    try {
      sdk.onKeyboardInput?.(keyboardValue);
      sdk.onKeyboardConfirm(keyboardDone);
      sdk.onKeyboardComplete?.(keyboardDone);
      const result = sdk.showKeyboard({
        defaultValue,
        maxLength: 160,
        multiple: false,
        confirmHold: false,
        confirmType: 'done',
        fail: failed,
      });
      result?.catch?.(failed);
    } catch {
      failed();
    }
  }
  const point = (touch) => {
    const x = (touch.clientX ?? touch.x) - left,
      y = (touch.clientY ?? touch.y) - top;
    return rotation > 0
      ? { x: y, y: physicalSafeWidth - x }
      : rotation < 0
        ? { x: physicalSafeHeight - y, y: x }
        : { x, y };
  };
  const hit = (p) =>
    hits.find(
      (item) =>
        item.enabled &&
        p.x >= item.x &&
        p.x <= item.x + item.w &&
        p.y >= item.y &&
        p.y <= item.y + item.h,
    );
  const cancel = () => {
    press = null;
    renderer?.setPreview?.(null);
    draw();
  };
  const start = (event) => {
    if (event.touches?.length !== 1 || stopped || keyboardOpen) return cancel();
    const touch = event.touches[0],
      p = point(touch),
      state = snapshot();
    press = { id: touch.identifier, origin: p, hit: hit(p), moved: false };
    press.last = p;
    press.pan = !press.hit && renderer?.canPanAt?.(p.x, p.y - playTop);
    if (!press.hit && state.phase === 'playing' && !state.pending && p.y >= playTop) {
      const actor = renderer.hitActor?.(p.x, p.y - playTop);
      if (Number.isInteger(actor)) {
        press.actor = actor;
        press.wasSelected = actor === renderer.getSelected();
        renderer.select(actor, drawnView);
      }
    }
    draw();
  };
  const move = (event) => {
    if (!press) return;
    const touch = event.touches?.[0];
    if (event.touches?.length !== 1 || touch.identifier !== press.id) return cancel();
    const p = point(touch);
    if (p.x < 0 || p.x > width || p.y < 0 || p.y > height) return cancel();
    press.moved ||= Math.hypot(p.x - press.origin.x, p.y - press.origin.y) > 8;
    if (press.moved && press.pan) {
      renderer.pan(p.x - press.last.x, p.y - press.last.y);
      press.last = p;
      draw();
      return;
    }
    if (press.moved && Number.isInteger(press.actor)) {
      const target = renderer.toWorld(p.x, p.y - playTop);
      renderer.setPreview(target ? session.preview(press.actor, target) : null);
      draw();
    }
  };
  const end = (event) => {
    const before = press,
      touch = event.changedTouches?.[0];
    press = null;
    renderer?.setPreview?.(null);
    if (
      !before ||
      stopped ||
      event.changedTouches?.length !== 1 ||
      event.touches?.length ||
      touch.identifier !== before.id
    )
      return draw();
    const p = point(touch),
      state = snapshot();
    if (before.hit) {
      if (!before.moved && hit(p)?.id === before.hit.id) before.hit.action();
      return draw();
    }
    if (
      state.phase !== 'playing' ||
      state.pending ||
      !drawnView ||
      p.y < playTop ||
      p.y > height - 24
    )
      return draw();
    let action;
    if (before.moved) {
      if (Number.isInteger(before.actor)) {
        const target = renderer.toWorld(p.x, p.y - playTop);
        if (target) action = { type: 'move', actor: before.actor, ...target };
      }
    } else if (!(Number.isInteger(before.actor) && !before.wasSelected))
      action = renderer.tap(p.x, p.y - playTop, drawnView);
    if (action) void session.action(action);
    draw();
  };
  const hide = () => {
    closeKeyboard();
    cancel();
    session?.hide();
  };
  const subscriptions = [
    ['TouchStart', start],
    ['TouchMove', move],
    ['TouchEnd', end],
    ['TouchCancel', cancel],
    ['Hide', hide],
    ['Show', cancel],
    ['WindowResize', cancel],
  ];
  for (const [name, fn] of subscriptions) sdk[`on${name}`]?.(fn);
  // Rendering can animate at 30 Hz; authority advances only through ordered host commits.
  timer = setInterval(() => {
    if (snapshot().phase === 'playing') draw();
  }, 1000 / 30);
  const api = {
    stop() {
      if (stopped) return;
      stopped = true;
      closeKeyboard();
      clearInterval(timer);
      for (const [name, fn] of subscriptions) sdk[`off${name}`]?.(fn);
      void session?.stop();
    },
    getSnapshot: () => ({
      ...snapshot(),
      message: snapshot().message || message,
      busy,
      roomInput,
      playTop,
      left,
      top,
      width,
      height,
      rotated,
      rotation,
      physicalSafeWidth,
      physicalSafeHeight,
      boardHits,
      boardLayout: renderer?.getLayout?.(),
      hits: hits.map(({ action, ...value }) => value),
    }),
  };
  draw();
  return api;
}
