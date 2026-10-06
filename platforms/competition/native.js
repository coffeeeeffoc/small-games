import './client.js';
import { scoreText, gapText, playerName } from './format.js';
const competitionGames = new Set([
  'cops-robbers',
  'cops-robbers-realtime',
  'letters-words2',
  'vibeJam-myself-history-guess',
  'xiangqi-five',
]);
const roomCode = (value) => typeof value === 'string' && /^[A-F0-9]{12}$/.test(value);
const closedRoom = (room) => ['finished', 'abandoned', 'expired'].includes(room?.status);

/** Only public routing fields enter SDK shares; never spread rooms, profiles or session data. */
export function nativeInvitation(config, code) {
  if (!competitionGames.has(config.game) || !roomCode(code))
    throw new Error('邀请信息无效，请重新创建挑战。');
  return {
    title: `${config.title} · 好友挑战`,
    query: `game=${encodeURIComponent(config.game)}&matchId=${code}&entry=challenge`,
  };
}

export function readNativeInvitation(query, game) {
  if (!query || typeof query !== 'object') return { code: '' };
  if (query.game !== undefined && query.game !== game)
    return { code: '', message: '这是另一款游戏的邀请，请打开对应小游戏。' };
  if (query.entry !== undefined && query.entry !== 'challenge')
    return { code: '', message: '邀请入口无效，请让好友重新分享。' };
  if (query.matchId !== undefined && (query.game !== game || query.entry !== 'challenge'))
    return { code: '', message: '邀请信息不完整，请让好友重新分享。' };
  const raw = query.matchId ?? query.pk;
  if (raw !== undefined && typeof raw !== 'string')
    return { code: '', message: '房间码无效，请核对好友的邀请。' };
  const code =
    typeof (query.matchId ?? query.pk) === 'string'
      ? (query.matchId ?? query.pk).trim().toUpperCase()
      : '';
  if (code && !roomCode(code)) return { code: '', message: '房间码无效，请核对好友的邀请。' };
  return { code };
}

/** Existing member permissions are enforced by the server; repeated taps reuse one rematch. */
export function createRematchResolver(request, game) {
  const requests = new Map();
  return (room) => {
    if (!closedRoom(room) || room.game !== game || !roomCode(room.code))
      return Promise.reject(new Error('本局尚未结束，请先完成比赛。'));
    if (requests.has(room.code)) return requests.get(room.code);
    const pending = Promise.resolve()
      .then(async () => {
        const result = await request(`/rooms/${room.code}/rematch`, { body: '{}' });
        if (result.game !== game || !roomCode(result.rematch) || result.rematch === room.code)
          throw new Error('再战邀请暂不可用，请重试。');
        return result.rematch;
      })
      .catch((error) => {
        requests.delete(room.code);
        throw error;
      });
    requests.set(room.code, pending);
    return pending;
  };
}

/** Clipboard feedback is based on a real callback/Promise; absence and faults are normal. */
export function copyNativeInvitation(sdk, data, timeoutMs = 4000, registerCancellation) {
  if (typeof sdk.setClipboardData !== 'function') return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    let unregister;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unregister?.();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    unregister = registerCancellation?.(() => finish(false));
    try {
      const result = sdk.setClipboardData({
        data,
        success: () => finish(true),
        fail: () => finish(false),
      });
      if (result && typeof result.then === 'function')
        result.then(
          () => finish(true),
          () => finish(false),
        );
    } catch {
      finish(false);
    }
  });
}

// Reviewed Canvas gameplay; no DOM, webview or HTML emulation in mini-games.
export function startNativeCompetition(sdk, config, createRenderer) {
  const street = config.game === 'cops-robbers-realtime';
  if (street) globalThis.__CLASSIC_CHASE_ROLES__ = true;
  const roleNames = street
    ? { pursuer: '警察', runner: '小偷', random: '系统分配' }
    : { pursuer: '追逐队', runner: '突围队', random: '系统分配' };
  if (!['wechat', 'bilibili', 'douyin', 'kuaishou', 'alipay'].includes(config?.platform))
    throw new Error('原生好友挑战需要明确的平台配置。');
  if (!sdk) throw new Error(`缺少 ${config.platform} 原生 SDK，无法启动游戏。`);
  for (const name of [
    'createCanvas',
    'getSystemInfoSync',
    'onTouchEnd',
    'offTouchEnd',
    'onHide',
    'offHide',
    'onShow',
    'offShow',
    'getStorageSync',
    'setStorageSync',
  ]) {
    if (typeof sdk[name] !== 'function') throw new Error(`原生 SDK 缺少 ${name}，无法启动游戏。`);
  }
  let stopped = false;
  const copyCancellations = new Set();
  const subscriptions = [];
  function subscribe(on, off, listener, required = false) {
    if (typeof sdk[on] !== 'function' || typeof sdk[off] !== 'function') {
      if (required) throw new Error(`原生 SDK 缺少 ${on}/${off}，无法安全启动游戏。`);
      return;
    }
    sdk[on](listener);
    subscriptions.push(() => sdk[off](listener));
  }
  function safely(run) {
    try {
      run();
    } catch {
      /* Optional audio and cleanup cannot block gameplay. */
    }
  }
  globalThis.__installCompetition(config, sdk);
  const client = globalThis.__competition,
    canvas = config.canvas || sdk.createCanvas(),
    ctx = canvas.getContext('2d'),
    renderer = createRenderer({ createImage: () => sdk.createImage(), assetBase: '' });
  const info = sdk.getSystemInfoSync();
  let width = info.windowWidth,
    height = info.windowHeight,
    ratio = Math.max(1, Number(info.pixelRatio) || 1);
  let room = null,
    board = null,
    message = '创建好友挑战或输入房间码',
    code = '',
    busy = false,
    visible = true,
    pending = null,
    hits = [],
    boardPage = 0,
    rulesOpen = false,
    invitationPanel = null,
    lastPoll = 0;
  let top = Math.max(info.safeArea?.top || 0, 26) + 36,
    bottom = Math.max(0, height - (info.safeArea?.bottom || height));
  const namespace = `${config.platform}:${config.game}`;
  const roomKey = `${namespace}:competition-room`;
  const muteKey = `${namespace}:competition-muted`;
  const resolveRematch = createRematchResolver((...args) => client.request(...args), config.game);
  const preparedRematches = new Map();
  async function invitationCode() {
    if (!room || !roomCode(room.code)) throw new Error('请先创建或加入好友挑战。');
    if (!closedRoom(room)) return room.code;
    const source = room.code;
    const next = await resolveRematch(room);
    preparedRematches.set(source, next);
    return next;
  }
  function invitationText(code) {
    return `${config.title} 好友挑战\n房间码 ${code}\n打开同一小游戏，输入房间码后点击加入。`;
  }
  async function copyInvitation(code) {
    const copied = await copyNativeInvitation(sdk, invitationText(code), 4000, (cancel) => {
      copyCancellations.add(cancel);
      return () => copyCancellations.delete(cancel);
    });
    if (stopped) return;
    message = copied
      ? '邀请已复制，发给好友后请双方准备。'
      : `未能复制，请手动发送房间码 ${code}。`;
    if (invitationPanel) invitationPanel.notice = message;
    draw();
  }
  async function shareInvitation(copyOnly = false) {
    const rematch = closedRoom(room);
    const source = room?.code;
    const target = await invitationCode();
    if (stopped || !visible || room?.code !== source) return;
    invitationPanel = {
      code: target,
      rematch,
      notice: rematch
        ? '这是新一局的再战邀请，双方准备后才开赛。'
        : '好友输入房间码加入，双方准备后开赛。',
    };
    message = `房间码 ${target}，可分享或手动发送。`;
    if (copyOnly) {
      await copyInvitation(target);
      return;
    }
    if (typeof sdk.shareAppMessage !== 'function') {
      invitationPanel.notice = '当前分享不可用，可复制邀请或手动发送房间码。';
      return;
    }
    const failed = () => {
      if (stopped || invitationPanel?.code !== target) return;
      invitationPanel.notice = '分享未完成，可复制邀请或手动发送房间码。';
      draw();
    };
    try {
      const result = sdk.shareAppMessage({ ...nativeInvitation(config, target), fail: failed });
      if (result && typeof result.catch === 'function') result.catch(failed);
    } catch {
      failed();
    }
  }
  async function enterRematch() {
    const source = room?.code;
    const target = await invitationCode();
    if (stopped || !visible || room?.code !== source) return;
    const joined = await client.request('/rooms/join', {
      body: JSON.stringify({ code: target, game: config.game }),
    });
    if (stopped) return;
    room = joined;
    pending = null;
    rulesOpen = false;
    invitationPanel = null;
    message = '已进入再战房间，邀请好友后请双方准备。';
  }
  let profile = null,
    keyboardTarget = 'code',
    modes = [],
    modeIndex = 0,
    preferredRole = 'pursuer',
    initiative = 'random';
  function editName() {
    if (!sdk.showKeyboard) {
      message = '当前平台暂不支持修改昵称';
      return;
    }
    keyboardTarget = 'name';
    sdk.showKeyboard({
      defaultValue: profile?.name || '',
      maxLength: 16,
      multiple: false,
      confirmHold: false,
      confirmType: 'done',
    });
  }
  let muted = false;
  try {
    muted = sdk.getStorageSync(muteKey) === true;
  } catch {}
  let sound = null;
  try {
    sound = sdk.createInnerAudioContext?.() || null;
    if (sound) {
      sound.src = 'competition-action.wav';
      sound.volume = 0.18;
      sound.obeyMuteSwitch = true;
      const onSoundError = () => {
        if (stopped) return;
        message = '音效暂不可用，可关闭声音继续';
      };
      sound.onError?.(onSoundError);
      subscriptions.push(() => sound?.offError?.(onSoundError));
    }
  } catch {
    safely(() => sound?.destroy());
    sound = null;
    message = '音效暂不可用，可继续好友挑战';
  }
  const sharePayload = () => {
    const code = closedRoom(room) ? preparedRematches.get(room?.code) : room?.code;
    return roomCode(code)
      ? nativeInvitation(config, code)
      : {
          title: config.title + ' · 好友挑战',
          query: `game=${encodeURIComponent(config.game)}&entry=challenge`,
        };
  };
  safely(() => sdk.showShareMenu?.({ menus: ['shareAppMessage'] }));
  subscribe('onShareAppMessage', 'offShareAppMessage', sharePayload);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  let query = {};
  try {
    query = sdk.getLaunchOptionsSync?.()?.query || {};
  } catch {
    /* Manual room-code entry remains available if launch metadata fails. */
  }
  const incoming = readNativeInvitation(query, config.game);
  code = incoming.code;
  if (incoming.message) message = incoming.message;
  function button(label, x, y, w, action) {
    ctx.fillStyle = '#246969';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, 44, 12);
    else ctx.rect(x, y, w, 44);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.fillText(label, x + 10, y + 28, w - 20);
    hits.push({ x, y, w, h: 44, action });
  }
  function draw() {
    if (!visible || stopped) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#102a32';
    ctx.fillRect(0, 0, width, height);
    hits = [];
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#fff';
    if (street && !invitationPanel && !rulesOpen) {
      if (room?.status === 'playing') {
        renderer.draw(ctx, width, height - 54, room.state);
        button(
          '退出',
          12,
          height - 50,
          76,
          () =>
            void act(async () => {
              const prior = room;
              room = null;
              try {
                await client.request('/rooms/' + prior.code + '/leave', { body: '{}' });
                sdk.removeStorageSync?.(roomKey);
              } catch {
                message = '服务器尚未确认退出';
              }
              config.onExit?.();
            }),
        );
        return;
      }
      ctx.fillText('街区追捕 · 好友 PK', 20, 30);
      button('首页', width - 96, 10, 78, () => {
        if (room)
          void act(async () => {
            await client.request('/rooms/' + room.code + '/leave', { body: '{}' });
            room = null;
            config.onExit?.();
          });
        else config.onExit?.();
      });
      ctx.fillText(message, 20, 70, width - 40);
      if (board && !room) {
        board.top
          .slice(boardPage * 5, boardPage * 5 + 5)
          .forEach((row, i) =>
            ctx.fillText(
              row.rank +
                '. ' +
                playerName(row, board.top) +
                ' ' +
                scoreText(config.game, row.score, row.secondary),
              24,
              108 + i * 32,
              width - 48,
            ),
          );
        button('上一页', 20, height - 58, 100, () => {
          boardPage = Math.max(0, boardPage - 1);
        });
        button('下一页', 132, height - 58, 100, () => {
          boardPage = Math.min(Math.max(0, Math.ceil(board.top.length / 5) - 1), boardPage + 1);
        });
        button('返回房间', 244, height - 58, 120, () => {
          board = null;
        });
        return;
      }
      if (!room) {
        button('创建好友挑战', 20, 98, 220, () =>
          act(async () => {
            room = await client.request('/rooms', {
              body: JSON.stringify({
                game: config.game,
                mode: modes[modeIndex]?.id,
                role: preferredRole,
                initiative,
              }),
            });
          }),
        );
        button(code ? '加入 ' + code : '输入房间码', 20, 152, 220, () =>
          act(async () => {
            if (!code) {
              keyboardTarget = 'code';
              sdk.showKeyboard?.({ defaultValue: '', maxLength: 12, confirmType: 'done' });
              return;
            }
            room = await client.request('/rooms/join', {
              body: JSON.stringify({ code, game: config.game }),
            });
          }),
        );
        button('好友积分榜', 20, 206, 220, () =>
          act(async () => {
            board = await client.request('/boards/' + config.game);
            boardPage = 0;
          }),
        );
        const x = width / 2 + 12,
          w = width / 2 - 32;
        button('模式：' + (modes[modeIndex]?.title || '正在加载'), x, 98, w, () => {
          if (modes.length) modeIndex = (modeIndex + 1) % modes.length;
        });
        button('角色：' + roleNames[preferredRole], x, 152, w, () => {
          preferredRole = preferredRole === 'pursuer' ? 'runner' : 'pursuer';
        });
        button('先手：' + roleNames[initiative], x, 206, w, () => {
          initiative = { random: 'pursuer', pursuer: 'runner', runner: 'random' }[initiative];
        });
        button('昵称：' + (profile?.name || '新玩家'), 20, height - 58, 220, editName);
        return;
      }
      room.players.forEach((player, i) =>
        ctx.fillText(
          playerName(player, room.players) +
            ' · ' +
            roleNames[player.role] +
            ' · ' +
            (player.ready ? '已准备' : '等待准备'),
          24,
          110 + i * 38,
          width - 48,
        ),
      );
      if (room.status === 'waiting') {
        button('准备', 20, height - 58, 100, () =>
          act(async () => {
            room = await client.request('/rooms/' + room.code + '/ready', { body: '{}' });
          }),
        );
        button('邀请好友', 132, height - 58, 120, () => void act(() => shareInvitation()));
        button('交换角色', 264, height - 58, 120, () =>
          act(async () => {
            room = await client.request('/rooms/' + room.code + '/role', {
              body: JSON.stringify({
                role: room.players[room.you].role === 'pursuer' ? 'runner' : 'pursuer',
              }),
            });
          }),
        );
        if (room.you === 0)
          button('先手：' + roleNames[room.initiative], width / 2, 198, width / 2 - 24, () =>
            act(async () => {
              room = await client.request('/rooms/' + room.code + '/initiative', {
                body: JSON.stringify({
                  initiative: { random: 'pursuer', pursuer: 'runner', runner: 'random' }[
                    room.initiative
                  ],
                }),
              });
            }),
          );
      } else {
        const own = room.results?.find((entry) => entry.playerId === room.players[room.you].id);
        ctx.fillText(
          own ? (own.result.score > 0 ? '本局获胜' : '本局落败') : '本局中断',
          24,
          196,
          width - 48,
        );
        ctx.fillText(
          own?.reason || (own ? '结果已由服务器确认' : '本局不计成绩'),
          24,
          226,
          width - 48,
        );
        button(
          '再来一局',
          20,
          height - 58,
          120,
          () =>
            void act(async () => {
              const next = await resolveRematch(room);
              room = await client.request('/rooms/' + next);
            }),
        );
      }
      return;
    }
    if (config.onExit && !room) {
      button(config.homeLabel || '返回游戏', 12, top - 36, 88, () => config.onExit());
      ctx.font = '12px sans-serif';
      ctx.fillText(config.title, 108, top - 12, Math.max(40, width - 208));
    } else ctx.fillText(config.title, 12, top - 12);
    button(muted ? '声音：关' : '声音：开', width - 90, top - 36, 78, () => {
      muted = !muted;
      try {
        sdk.setStorageSync(muteKey, muted);
      } catch {
        message = '声音设置本次有效，本机暂不能保存';
      }
      if (muted) safely(() => sound?.stop());
      else if (sound) {
        safely(() => {
          sound.stop();
          sound.play();
        });
      } else message = '当前平台音频不可用';
    });
    const text = String(message);
    const messageWidth = Math.max(14, Math.floor((width - 24) / 14));
    for (let n = 0; n < Math.min(3, Math.ceil(text.length / messageWidth)); n++)
      ctx.fillText(text.slice(n * messageWidth, (n + 1) * messageWidth), 12, top + 18 + n * 18);
    if (!room) {
      button('创建好友挑战', 12, top + 76, width / 2 - 18, () =>
        act(async () => {
          room = await client.request('/rooms', {
            body: JSON.stringify({
              game: config.game,
              ...(modes.length
                ? { mode: modes[modeIndex].id, role: preferredRole, initiative }
                : {}),
            }),
          });
          message = '房间 ' + room.code + '，邀请朋友后双方准备';
        }),
      );
      button('加入 ' + code, width / 2 + 4, top + 76, width / 2 - 18, () =>
        act(async () => {
          if (!code) {
            keyboardTarget = 'code';
            sdk.showKeyboard?.({
              defaultValue: '',
              maxLength: 12,
              multiple: false,
              confirmHold: false,
              confirmType: 'done',
            });
            message = '请输入邀请中的 12 位房间码';
            return;
          }
          room = await client.request('/rooms/join', {
            body: JSON.stringify({ code, game: config.game }),
          });
        }),
      );
      button('全站 Top 100', 12, top + 130, width / 2 - 18, () =>
        act(async () => {
          board = await client.request('/boards/' + config.game);
          boardPage = 0;
          message =
            '参赛 ' + board.eligiblePlayers + ' 人；我的排名 ' + (board.me?.rank || '尚无有效成绩');
        }),
      );
      button('输入房间码', width / 2 + 4, top + 130, width / 2 - 18, () => {
        if (!sdk.showKeyboard) {
          message = '平台输入不可用，请通过好友原生邀请加入';
          return;
        }
        keyboardTarget = 'code';
        sdk.showKeyboard({
          defaultValue: code,
          maxLength: 12,
          multiple: false,
          confirmHold: false,
          confirmType: 'done',
        });
      });
      button(
        '昵称：' + (profile?.name || '新玩家') + ' · 修改',
        12,
        top + 184,
        width - 24,
        editName,
      );
      if (modes.length && !board) {
        button('模式：' + modes[modeIndex].title, 12, top + 238, width - 24, () => {
          modeIndex = (modeIndex + 1) % modes.length;
        });
        button('角色：' + roleNames[preferredRole], 12, top + 292, width / 2 - 18, () => {
          preferredRole = preferredRole === 'pursuer' ? 'runner' : 'pursuer';
        });
        button('先手：' + roleNames[initiative], width / 2 + 4, top + 292, width / 2 - 18, () => {
          initiative = { random: 'pursuer', pursuer: 'runner', runner: 'random' }[initiative];
        });
      }
      if (board) {
        const pageSize = Math.max(1, Math.min(8, Math.floor((height - top - 315 - bottom) / 48)));
        ctx.font = '12px sans-serif';
        board.top.slice(boardPage * pageSize, (boardPage + 1) * pageSize).forEach((row, i) => {
          ctx.fillStyle = '#fff';
          ctx.fillText(
            `${row.rank}. ${playerName(row, board.top)}${row.playerId === profile?.playerId ? '（你）' : ''}`,
            14,
            top + 252 + i * 48,
            width - 28,
          );
          ctx.fillStyle = '#a9d1c5';
          ctx.fillText(
            scoreText(config.game, row.score, row.secondary),
            28,
            top + 270 + i * 48,
            width - 42,
          );
        });
        if (!board.top.length)
          ctx.fillText('全站榜暂为空，完成有效挑战后参与', 14, top + 252, width - 28);
        button('上一页', 12, height - bottom - 50, width / 2 - 18, () => {
          boardPage = Math.max(0, boardPage - 1);
        });
        button('下一页', width / 2 + 4, height - bottom - 50, width / 2 - 18, () => {
          boardPage = Math.min(
            Math.max(0, Math.ceil(board.top.length / pageSize) - 1),
            boardPage + 1,
          );
        });
      }
    } else {
      button('退出', 12, top + 64, 65, () => {
        const previous = room;
        room = null;
        rulesOpen = false;
        message = '已退出';
        draw();
        void act(async () => {
          try {
            await client.request(`/rooms/${previous.code}/leave`, { body: '{}' });
            sdk.removeStorageSync?.(roomKey);
          } catch {
            message = '已退出页面，网络不可用，服务端未确认；房间将按时限结束';
          }
        });
      });
      button(
        closedRoom(room) ? '再战邀请' : '邀请',
        85,
        top + 64,
        closedRoom(room) ? 90 : 65,
        () => void act(() => shareInvitation()),
      );
      button('规则', width - 74, top + 64, 62, () =>
        act(async () => {
          rulesOpen = !rulesOpen;
          if (rulesOpen) {
            board = await client.request('/boards/' + config.game);
            message = '查看规则时比赛计时继续';
          }
        }),
      );
      if (room.status === 'waiting')
        button('准备', 158, top + 64, 70, () =>
          act(async () => {
            room = await client.request(`/rooms/${room.code}/ready`, { body: '{}' });
          }),
        );
      if (room.status === 'waiting' && !rulesOpen) {
        button(
          '复制邀请 · ' + room.code,
          12,
          top + 120,
          width - 24,
          () => void act(() => shareInvitation(true)),
        );
        ctx.fillStyle = '#fff';
        ctx.font = '16px sans-serif';
        room.players.forEach((player, i) =>
          ctx.fillText(
            `${playerName(player, room.players)}${i === room.you ? '（你）' : ''} · ${roleNames[player.role] || ''} ${player.ready ? '已准备' : '等待准备'}`,
            16,
            top + 190 + i * 40,
            width - 32,
          ),
        );
        if (room.players.length < 2) ctx.fillText('等一位好友加入…', 16, top + 230, width - 32);
        if (room.roles) {
          button(
            '换到' + roleNames[room.players[room.you].role === 'pursuer' ? 'runner' : 'pursuer'],
            12,
            top + 260,
            width - 24,
            () =>
              act(async () => {
                room = await client.request(`/rooms/${room.code}/role`, {
                  body: JSON.stringify({
                    role: room.players[room.you].role === 'pursuer' ? 'runner' : 'pursuer',
                  }),
                });
                message = '角色已交换，请双方重新准备';
              }),
          );
          button(
            '先手：' + roleNames[room.initiative] + (room.you === 0 ? ' · 切换' : ''),
            12,
            top + 314,
            width - 24,
            () => {
              if (room.you !== 0) {
                message = '开局顺序由房主设置';
                return;
              }
              void act(async () => {
                room = await client.request(`/rooms/${room.code}/initiative`, {
                  body: JSON.stringify({
                    initiative: { random: 'pursuer', pursuer: 'runner', runner: 'random' }[
                      room.initiative
                    ],
                  }),
                });
                message = '顺序已更改，请双方重新准备';
              });
            },
          );
          ctx.fillStyle = '#fff';
          ctx.font = '12px sans-serif';
          ctx.fillText(
            config.game === 'cops-robbers-realtime'
              ? '先手先行动 2 秒，随后双方同时行动'
              : '先手先走一步，随后双方交替行动',
            12,
            top + 385,
            width - 24,
          );
        }
      }
      if (rulesOpen) {
        ctx.fillStyle = '#fff';
        ctx.font = '14px sans-serif';
        const text = board?.description || '同规则双人比赛，由服务器验证操作与时间。';
        const length = Math.max(14, Math.floor((width - 24) / 14));
        for (let i = 0; i < text.length; i += length)
          ctx.fillText(text.slice(i, i + length), 12, top + 150 + (i / length) * 24);
      } else if (room.status === 'playing' && room.state) {
        ctx.save();
        ctx.translate(0, top + 118);
        renderer.draw(ctx, width, height - top - 118 - bottom, room.state);
        ctx.restore();
      }
      if (['finished', 'abandoned', 'expired'].includes(room.status)) {
        if (!rulesOpen) {
          const own = room.results?.find((r) => r.playerId === room.players[room.you].id);
          ctx.fillStyle = '#fff';
          ctx.font = '14px sans-serif';
          const lines = own
            ? [
                `本局 ${own.result.eligible ? scoreText(config.game, own.result.score, own.result.secondary) : '无有效成绩'}`,
                `${config.game === 'xiangqi-five' || room.roles ? '总积分' : '个人最佳'} ${own.after.me ? scoreText(config.game, own.after.me.score, own.after.me.secondary) : '暂无'}`,
                `排名 ${own.after.me?.rank ?? '无有效成绩'} / ${own.after.eligiblePlayers} 人`,
                own.before && own.after.me
                  ? `排名变化 ${own.before.rank - own.after.me.rank}`
                  : '首次有效纪录',
                gapText(config.game, own.after),
                own.reason || '',
              ]
            : ['本局中断，无新成绩'];
          lines.forEach((line, i) => ctx.fillText(line, 12, top + 160 + i * 28));
          button(
            '分享再战邀请',
            12,
            top + 340,
            width - 24,
            () => void act(() => shareInvitation()),
          );
          button(
            '复制再战邀请',
            12,
            top + 394,
            width / 2 - 18,
            () => void act(() => shareInvitation(true)),
          );
          button(
            '再来一局',
            width / 2 + 4,
            top + 394,
            width / 2 - 18,
            () => void act(enterRematch),
          );
        }
      }
    }
    if (invitationPanel) {
      hits = [];
      ctx.fillStyle = '#102a32f5';
      ctx.fillRect(0, top + 64, width, height - top - 64);
      ctx.fillStyle = '#fff';
      ctx.font = '18px sans-serif';
      ctx.fillText(
        invitationPanel.rematch ? '邀请好友，再战一局' : '邀请好友加入本局',
        16,
        top + 112,
      );
      ctx.font = 'bold 25px monospace';
      ctx.fillText(invitationPanel.code, 16, top + 155);
      ctx.font = '14px sans-serif';
      const lines = [
        invitationPanel.notice,
        '同一小游戏 → 输入房间码 → 加入',
        room?.status === 'playing' ? '分享时比赛仍在继续，请及时返回。' : '双方点击准备后才开赛。',
      ];
      let row = 0;
      const length = Math.max(14, Math.floor((width - 32) / 14));
      for (const line of lines)
        for (let i = 0; i < line.length; i += length)
          ctx.fillText(line.slice(i, i + length), 16, top + 196 + row++ * 24);
      const y = top + 210 + row * 24;
      button(
        '复制邀请',
        12,
        y,
        width / 2 - 18,
        () => void act(() => copyInvitation(invitationPanel.code)),
      );
      button(
        invitationPanel.rematch ? '进入再战房间' : '返回比赛',
        width / 2 + 4,
        y,
        width / 2 - 18,
        () => {
          if (invitationPanel.rematch) void act(enterRematch);
          else invitationPanel = null;
        },
      );
      if (invitationPanel.rematch)
        button('返回本局结果', 12, y + 54, width - 24, () => {
          invitationPanel = null;
        });
    }
  }
  async function act(task) {
    if (busy || stopped || !visible) return;
    busy = true;
    const seq = room?.seq ?? 0;
    try {
      await task();
      if (stopped) return;
      if (room) {
        try {
          sdk.setStorageSync(roomKey, room.code);
        } catch {
          message += '；本机暂不能保存房间，请保留房间码。';
        }
      }
      if (visible && !muted && sound && room?.seq > seq) {
        safely(() => {
          sound.stop();
          sound.play();
        });
      }
    } catch (error) {
      message = error.message || '服务不可用，请重试';
      if (error.code && error.code !== 'SERVICE_UNAVAILABLE') pending = null;
    } finally {
      busy = false;
      draw();
    }
  }
  subscribe('onKeyboardConfirm', 'offKeyboardConfirm', (result) => {
    if (stopped || !visible) return;
    safely(() => sdk.hideKeyboard?.({}));
    if (keyboardTarget === 'name') {
      void act(async () => {
        profile = await client.request('/me', {
          body: JSON.stringify({ name: String(result.value || '') }),
        });
        if (board) board = await client.request('/boards/' + config.game);
        message = '昵称已保存，成绩和身份不变';
      });
      return;
    }
    code = String(result.value || '')
      .trim()
      .toUpperCase();
    message = '房间码已输入，点击加入';
    draw();
  });
  subscribe(
    'onTouchEnd',
    'offTouchEnd',
    (event) => {
      if (stopped || !visible) return;
      const point = event.changedTouches?.[0];
      if (!point) return;
      const x = point.clientX ?? point.x,
        y = point.clientY ?? point.y;
      const hit = hits.find(
        (item) => x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h,
      );
      if (hit) {
        hit.action();
        draw();
        return;
      }
      if (
        !invitationPanel &&
        !rulesOpen &&
        room?.status === 'playing' &&
        (street ? y < height - 54 : y > top + 118)
      ) {
        const action = renderer.tap(x, street ? y : y - top - 118, room.state);
        if (action)
          void act(async () => {
            pending ??= { seq: room.seq + 1, action };
            room = await client.request(`/rooms/${room.code}/actions`, {
              body: JSON.stringify(pending),
            });
            pending = null;
          });
        draw();
      }
    },
    true,
  );
  const interval = setInterval(() => {
    if (visible && room && !busy && Date.now() - lastPoll >= (room.pollMs || 1200)) {
      lastPoll = Date.now();
      void act(async () => {
        room = await client.request('/rooms/' + room.code);
        message =
          room.status === 'waiting'
            ? '房间 ' + room.code + '，等待双方准备'
            : room.status === 'playing'
              ? `比赛中，剩余 ${Math.max(0, Math.ceil((room.deadline - room.serverNow) / 1000))} 秒`
              : room.status === 'finished'
                ? '比赛结束，服务端已结算'
                : room.status === 'expired'
                  ? '邀请过期'
                  : '对方退出，比赛中断';
      });
    }
  }, 250);
  subscribe(
    'onHide',
    'offHide',
    () => {
      visible = false;
      safely(() => sound?.stop());
    },
    true,
  );
  subscribe('onAudioInterruptionBegin', 'offAudioInterruptionBegin', () =>
    safely(() => sound?.stop()),
  );
  subscribe(
    'onShow',
    'offShow',
    (event) => {
      if (stopped) return;
      visible = true;
      const incoming = readNativeInvitation(event?.query, config.game);
      if (incoming.message) {
        message = incoming.message;
        if (invitationPanel) invitationPanel.notice = incoming.message;
      } else if (incoming.code && incoming.code !== room?.code) {
        code = incoming.code;
        message = room
          ? '收到新的邀请；请先完成或退出当前比赛，再加入。'
          : '已收到好友邀请，点击加入。';
      }
      draw();
    },
    true,
  );
  subscribe('onWindowResize', 'offWindowResize', (event) => {
    if (stopped) return;
    width = event.windowWidth;
    height = event.windowHeight;
    const latest = sdk.getSystemInfoSync();
    ratio = Math.max(1, Number(latest.pixelRatio) || 1);
    top = Math.max(latest.safeArea?.top || 0, 26) + 36;
    bottom = Math.max(0, height - (latest.safeArea?.bottom || height));
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    draw();
  });
  void act(async () => {
    profile = await client.request('/me');
    modes = (await client.request('/boards/' + config.game)).modes || [];
    const saved = sdk.getStorageSync(roomKey);
    if (saved && !code) room = await client.request('/rooms/' + saved);
  });
  draw();
  return {
    canvas,
    stop() {
      if (stopped) return;
      stopped = true;
      visible = false;
      clearInterval(interval);
      for (const cancel of copyCancellations) cancel();
      for (const unsubscribe of subscriptions.splice(0)) safely(unsubscribe);
      safely(() => sound?.destroy());
    },
  };
}
