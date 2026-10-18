/** One touch-first Canvas page shared by browser and Creator. Child room owns its listeners. */
export function startTapServiceScreen({
  sdk,
  canvas,
  services,
  savePort,
  config,
  onExit,
  multiplayer,
}) {
  const ctx = canvas.getContext('2d');
  let stopped = false,
    pending = false,
    child = null,
    hits = [],
    pressed = null,
    message = '',
    records = [],
    preview = null,
    confirmingScore = false,
    page = 0;
  let width = 1,
    height = 1,
    ratio = 1,
    left = 0,
    top = 0;
  const run = async (action) => {
    if (stopped || pending) return;
    pending = true;
    message = '正在连接…';
    draw();
    try {
      await action();
    } catch (error) {
      message = error?.message || '暂时没有连接成功，请稍后重试。';
    } finally {
      pending = false;
      if (!stopped && !child) draw();
    }
  };
  function draw() {
    if (stopped || child) return;
    const info = sdk.getSystemInfoSync();
    ratio = Math.min(info.pixelRatio || 1, 2);
    const physicalWidth = info.windowWidth || info.screenWidth,
      physicalHeight = info.windowHeight || info.screenHeight;
    left = info.safeArea?.left || 0;
    top = Math.max(info.safeArea?.top || 0, sdk.getMenuButtonBoundingClientRect?.()?.bottom || 0);
    width = (info.safeArea?.right || physicalWidth) - left;
    height = (info.safeArea?.bottom || physicalHeight) - top;
    if (canvas.width !== physicalWidth * ratio) canvas.width = physicalWidth * ratio;
    if (canvas.height !== physicalHeight * ratio) canvas.height = physicalHeight * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#f4efdf';
    ctx.fillRect(0, 0, physicalWidth, physicalHeight);
    ctx.translate(left, top);
    hits = [];
    const landscape = width > height * 1.35,
      gap = 12,
      margin = 20,
      column = landscape ? (width - margin * 2 - gap) / 2 : width - margin * 2;
    const text = (value, x, y, size = 16, color = '#343b31', max = column - 24) => {
      ctx.fillStyle = color;
      ctx.font = `${size}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(value, x, y, max);
    };
    const button = (id, label, x, y, w, action, enabled = true) => {
      const hit = {
        id,
        label,
        x,
        y,
        w,
        h: 46,
        action,
        enabled: enabled && (!pending || id === 'exit'),
      };
      hits.push(hit);
      ctx.fillStyle = !hit.enabled ? '#ddd9cb' : pressed?.hit.id === id ? '#d2dfc6' : '#fffdf4';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, 46, 13);
      else ctx.rect(x, y, w, 46);
      ctx.fill();
      text(label, x + 14, y + 23, 15, '#343b31', w - 28);
    };
    text('TapTap 小站', margin, 30, 26);
    button('exit', '返回', width - 98, 8, 78, () => {
      api.stop();
      onExit?.();
    });
    text(
      `${config.title || { 'cops-robbers': '围捕小队', 'cops-robbers-realtime': '街区围捕', 'xiangqi-five': '象五子棋' }[config.game] || '游戏进度'} · ${services.connected ? '已连接 TapTap' : '尚未连接'}`,
      margin,
      70,
      14,
      '#65705b',
      width - 40,
    );
    text(
      savePort.summary(savePort.export()),
      margin,
      98,
      15,
      '#456449',
      landscape ? column : width - 40,
    );
    const compact = landscape && height < 360;
    const x = landscape ? margin + column + gap : margin,
      y = landscape ? (compact ? 72 : 120) : 182;
    button(
      'connect',
      services.connected ? '已连接 TapTap' : '连接 TapTap',
      margin,
      122,
      column,
      () =>
        run(async () => {
          await services.connect();
          message = '已连接。进度由你选择上传或恢复。';
        }),
    );
    if (preview) {
      text('恢复前会备份本机进度', x, y, 17);
      text(savePort.summary(preview), x, y + 28, 14);
      button('restore', '确认恢复这份云档', x, y + 50, column, () =>
        run(async () => {
          services.restore(preview);
          preview = null;
          message = '进度已恢复，本机备份已保留。';
        }),
      );
      button('cancel', '取消', x, y + 106, column, () => {
        preview = null;
        draw();
      });
    } else if (confirmingScore) {
      text(`将本机 ${savePort.score()} 项进度提交到当前账号`, x, y, 16);
      text('仅提交符合规则的正常游玩成绩', x, y + 28, 14);
      button('submit', '确认提交并查看排行榜', x, y + 50, column, () =>
        run(async () => {
          await services.submit();
          confirmingScore = false;
          await services.openLeaderboard();
          message = '已提交当前进度。';
        }),
      );
      button('cancel', '取消', x, y + 106, column, () => {
        confirmingScore = false;
        draw();
      });
    } else if (records.length) {
      const count = Math.max(1, Math.floor((height - y - 130) / 56));
      records.slice(page * count, (page + 1) * count).forEach((item, index) =>
        button(`save-${index}`, item.summary || '云端进度', x, y + index * 56, column, () =>
          run(async () => {
            preview = await services.download(item);
            records = [];
            message = '';
          }),
        ),
      );
      const nav = Math.min(height - 112, y + count * 56);
      button('cloud-back', '返回小站', x, nav, (column - 10) / 2, () => {
        records = [];
        draw();
      });
      button(
        'cloud-next',
        '下一页',
        x + (column + 10) / 2,
        nav,
        (column - 10) / 2,
        () => {
          page = (page + 1) % Math.ceil(records.length / count);
          draw();
        },
        records.length > count,
      );
    } else {
      button('upload', '上传本机进度', x, y, column, () =>
        run(async () => {
          await services.upload();
          message = '已保存到当前 TapTap 应用。';
        }),
      );
      button('cloud', '查看云端进度', x, y + 56, column, () =>
        run(async () => {
          records = await services.list();
          page = 0;
          message = records.length
            ? '选择一份进度，确认后恢复。'
            : '还没有云档，先上传本机进度吧。';
        }),
      );
      button('board', '查看排行榜', x, y + 112, (column - 10) / 2, () =>
        run(async () => {
          await services.openLeaderboard();
          message = '';
        }),
      );
      button(
        'score',
        '提交进度',
        x + (column + 10) / 2,
        y + 112,
        (column - 10) / 2,
        () => {
          confirmingScore = true;
          draw();
        },
        !savePort.developer?.(),
      );
      if (multiplayer)
        button(
          'multiplayer',
          '好友联机',
          landscape ? margin : x,
          landscape ? 178 : y + 168,
          column,
          () => {
            detach();
            try {
              child = multiplayer({
                sdk,
                canvas,
                services,
                config,
                onExit: () => {
                  child = null;
                  if (!stopped) {
                    attach();
                    draw();
                  }
                },
              });
            } catch {
              child = null;
              message = '联机暂时无法启动，请重试。';
              attach();
              draw();
            }
          },
        );
    }
    if (compact) {
      if (!multiplayer)
        text(message || '云档与榜单属于当前应用', margin, height - 18, 12, '#65705b', column);
    } else {
      text(message || '云档和榜单仅属于当前应用。', margin, height - 38, 13, '#65705b', width - 40);
      text(
        pending ? '请稍候…' : 'H5 与原生应用的云端进度各自保存',
        margin,
        height - 18,
        12,
        '#7b806e',
        width - 40,
      );
    }
  }
  const point = (touch) => ({
    x: (touch.clientX ?? touch.x) - left,
    y: (touch.clientY ?? touch.y) - top,
  });
  const hit = (p) =>
    hits.find(
      (item) =>
        item.enabled &&
        p.x >= item.x &&
        p.x <= item.x + item.w &&
        p.y >= item.y &&
        p.y <= item.y + item.h,
    );
  const start = (event) => {
    if (event.touches?.length !== 1 || stopped || child) {
      pressed = null;
      draw();
      return;
    }
    const touch = event.touches[0],
      p = point(touch),
      target = hit(p);
    pressed = target ? { hit: target, identifier: touch.identifier, origin: p } : null;
    draw();
  };
  const move = (event) => {
    const touch = event.touches?.[0];
    if (
      pressed &&
      (event.touches.length !== 1 ||
        touch.identifier !== pressed.identifier ||
        Math.hypot(point(touch).x - pressed.origin.x, point(touch).y - pressed.origin.y) > 8)
    ) {
      pressed = null;
      draw();
    }
  };
  const end = (event) => {
    const before = pressed,
      touch = event.changedTouches?.[0];
    pressed = null;
    if (
      !stopped &&
      !child &&
      before &&
      event.changedTouches?.length === 1 &&
      !event.touches?.length &&
      touch.identifier === before.identifier &&
      hit(point(touch))?.id === before.hit.id
    )
      before.hit.action();
    draw();
  };
  const cancel = () => {
    pressed = null;
    draw();
  };
  const attach = () => {
    sdk.onTouchStart(start);
    sdk.onTouchMove?.(move);
    sdk.onTouchEnd(end);
    sdk.onTouchCancel(cancel);
    sdk.onHide?.(cancel);
    sdk.onShow?.(draw);
    sdk.onWindowResize?.(cancel);
  };
  const detach = () => {
    sdk.offTouchStart(start);
    sdk.offTouchMove?.(move);
    sdk.offTouchEnd(end);
    sdk.offTouchCancel(cancel);
    sdk.offHide?.(cancel);
    sdk.offShow?.(draw);
    sdk.offWindowResize?.(cancel);
  };
  const api = {
    stop() {
      if (stopped) return;
      stopped = true;
      detach();
      child?.stop();
      child = null;
      services.stop();
    },
    getSnapshot: () => ({
      pending,
      message,
      connected: services.connected,
      preview: Boolean(preview),
      multiplayer: child?.getSnapshot?.(),
      hits: hits.map(({ id, label, x, y, w, h, enabled }) => ({ id, label, x, y, w, h, enabled })),
    }),
  };
  attach();
  draw();
  return api;
}
