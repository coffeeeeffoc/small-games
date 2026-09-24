import './client.js';
import { scoreText, gapText, playerName } from './format.js';
const roleNames = { pursuer: '追逐队', runner: '突围队', random: '系统分配' };

// Reviewed Canvas gameplay; no DOM, webview or HTML emulation in mini-games.
export function startNativeCompetition(sdk, config, createRenderer) {
  globalThis.__installCompetition(config);
  const client = globalThis.__competition,
    canvas = sdk.createCanvas(),
    ctx = canvas.getContext('2d'),
    renderer = createRenderer({ createImage: () => sdk.createImage(), assetBase: '' });
  const info = sdk.getSystemInfoSync();
  let width = info.windowWidth,
    height = info.windowHeight,
    ratio = info.pixelRatio || 1;
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
    lastPoll = 0;
  let top = Math.max(info.safeArea?.top || 0, 26) + 36,
    bottom = Math.max(0, height - (info.safeArea?.bottom || height));
  const roomKey = `competition-room:${config.game}`;
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
    muted = sdk.getStorageSync('competition-muted') === true;
  } catch {}
  const sound = sdk.createInnerAudioContext?.();
  if (sound) {
    sound.src = 'competition-action.wav';
    sound.volume = 0.18;
    sound.obeyMuteSwitch = true;
    sound.onError?.(() => {
      message = '音效暂不可用，可关闭声音继续';
    });
  }
  const sharePayload = () => ({
    title: config.title + ' 好友挑战',
    query: room ? `pk=${room.code}` : '',
  });
  sdk.showShareMenu?.({ menus: ['shareAppMessage'] });
  sdk.onShareAppMessage?.(sharePayload);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const query = sdk.getLaunchOptionsSync?.().query || {};
  if (query.pk) code = String(query.pk).toUpperCase();
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
    if (!visible) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#102a32';
    ctx.fillRect(0, 0, width, height);
    hits = [];
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(config.title, 12, top - 12);
    button(muted ? '声音：关' : '声音：开', width - 90, top - 38, 78, () => {
      muted = !muted;
      sdk.setStorageSync('competition-muted', muted);
      if (muted) sound?.stop();
      else if (sound) {
        sound.stop();
        sound.play();
      } else message = '当前平台音频不可用';
    });
    const text = String(message);
    for (let n = 0; n < Math.min(3, Math.ceil(text.length / 24)); n++)
      ctx.fillText(text.slice(n * 24, n * 24 + 24), 12, top + 18 + n * 18);
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
      button('邀请', 85, top + 64, 65, () => {
        sdk.shareAppMessage?.(sharePayload());
        message = '房间 ' + room.code + '，可分享或发送房间码';
      });
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
        ctx.fillStyle = '#fff';
        ctx.font = '16px sans-serif';
        room.players.forEach((player, i) =>
          ctx.fillText(
            `${playerName(player, room.players)}${i === room.you ? '（你）' : ''} · ${roleNames[player.role] || ''} ${player.ready ? '已准备' : '等待准备'}`,
            16,
            top + 155 + i * 40,
            width - 32,
          ),
        );
        if (room.players.length < 2) ctx.fillText('等一位好友加入…', 16, top + 195, width - 32);
        if (room.roles) {
          button(
            '换到' + roleNames[room.players[room.you].role === 'pursuer' ? 'runner' : 'pursuer'],
            12,
            top + 225,
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
            top + 279,
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
            top + 350,
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
        button('再来一局', 158, top + 64, 100, () =>
          act(async () => {
            const old = await client.request(`/rooms/${room.code}/rematch`, { body: '{}' });
            room = await client.request('/rooms/join', {
              body: JSON.stringify({ code: old.rematch }),
            });
          }),
        );
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
        }
      }
    }
  }
  async function act(task) {
    if (busy) return;
    busy = true;
    const seq = room?.seq ?? 0;
    try {
      await task();
      if (room) sdk.setStorageSync(roomKey, room.code);
      if (visible && !muted && sound && room?.seq > seq) {
        sound.stop();
        sound.play();
      }
    } catch (error) {
      message = error.message || '服务不可用，请重试';
      if (error.code && error.code !== 'SERVICE_UNAVAILABLE') pending = null;
    } finally {
      busy = false;
      draw();
    }
  }
  sdk.onKeyboardConfirm?.((result) => {
    sdk.hideKeyboard?.({});
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
  sdk.onTouchEnd((event) => {
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
    if (!rulesOpen && room?.status === 'playing' && y > top + 118) {
      const action = renderer.tap(x, y - top - 118, room.state);
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
  });
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
  sdk.onHide(() => {
    visible = false;
    sound?.stop();
  });
  sdk.onAudioInterruptionBegin?.(() => sound?.stop());
  sdk.onShow((event) => {
    visible = true;
    if (event.query?.pk) code = String(event.query.pk).toUpperCase();
    draw();
  });
  sdk.onWindowResize?.((event) => {
    width = event.windowWidth;
    height = event.windowHeight;
    const latest = sdk.getSystemInfoSync();
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
      visible = false;
      clearInterval(interval);
      sound?.destroy();
    },
  };
}
