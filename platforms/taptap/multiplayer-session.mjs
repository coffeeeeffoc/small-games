import { tapCall } from './calls.mjs';

const leases = new WeakMap();
const copy = (value) => JSON.parse(JSON.stringify(value));
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const id = (value) => typeof value === 'string' && value.length > 0 && value.length <= 160;
export const utf8Bytes = (value) => encodeURIComponent(value).replace(/%[A-F\d]{2}/g, 'x').length;
const parse = (value) => (typeof value === 'string' ? JSON.parse(value) : value);
function alias(value, a, b) {
  if (
    value?.[a] !== undefined &&
    value?.[b] !== undefined &&
    JSON.stringify(value[a]) !== JSON.stringify(value[b])
  )
    throw new Error('事件字段冲突');
  return value?.[a] ?? value?.[b];
}
const memberId = (info) =>
  alias({ playerId: info?.playerId, nested: info?.playerInfo?.id }, 'playerId', 'nested');

/** OnlineBattle transport only. Game code and renderers are injected by one game's build entry. */
export function createTapMultiplayerSession({
  sdk,
  descriptor,
  authenticate = async () => {},
  onChange = () => {},
  now = Date.now,
  random = Math.random,
  autoPump = true,
}) {
  let manager,
    listener,
    phase = 'idle',
    message = '',
    playerId = '',
    roomId = '',
    ownerId = '',
    settings;
  let members = new Map(),
    roster = [],
    ready = new Set(),
    state = null,
    seq = 0,
    inputSeq = 0,
    peerInput = 0;
  let pending = null,
    queued = [],
    sending = false,
    timer,
    startAt = 0,
    lastReceived = 0,
    stopped = false;
  const committed = [0, 0];
  let opening = Promise.resolve(),
    closing,
    outgoing = [],
    startRequested = false;
  let lastPeerReceived = 0,
    lastBeat = -Infinity,
    inFlightTerminal = false;
  const token = {};
  const notify = () => onChange();
  const active = () => !stopped && !['ended', 'finished'].includes(phase);
  const check = () => {
    if (!active()) throw new Error('已离开好友房间');
  };
  const seat = () => roster.indexOf(playerId);
  const host = () => ownerId === playerId;
  const packet = (kind, fields = {}) => ({
    v: 1,
    g: descriptor.id,
    r: roomId,
    e: settings.epoch,
    k: kind,
    ...fields,
  });
  const allowedRate = () => {
    outgoing = outgoing.filter((time) => now() - time < 1000);
    return outgoing.length < 15;
  };
  async function send(value) {
    check();
    const msg = JSON.stringify(value);
    if (utf8Bytes(msg) > 2048) throw new Error('联机消息过大');
    if (!allowedRate()) throw new Error('操作过快，请稍候');
    outgoing.push(now());
    await tapCall(manager, 'sendCustomMessage', { data: { msg, type: 0 } });
    check();
  }
  function detach() {
    clearInterval(timer);
    timer = null;
    const previous = listener;
    listener = null;
    try {
      if (manager && previous) manager.unregisterListener?.(previous);
    } catch {
      /* Local callbacks are already invalidated; release the connection even if SDK cleanup throws. */
    }
  }
  function cleanup() {
    if (closing) return closing;
    detach();
    closing = opening
      .catch(() => {})
      .then(async () => {
        if (!manager || leases.get(manager) !== token) return;
        try {
          if (roomId) await tapCall(manager, 'leaveRoom', {}, { timeoutMs: 2000 });
        } catch {
          /* Disconnect also releases the room when leave failed. */
        }
        try {
          await tapCall(manager, 'disconnect', {}, { timeoutMs: 2000 });
        } catch {
          /* Listener and local authority are already revoked. */
        }
        if (leases.get(manager) === token) leases.delete(manager);
      });
    return closing;
  }
  function end(reason, finished = false) {
    if (!active()) return;
    phase = finished ? 'finished' : 'ended';
    message = reason;
    pending = null;
    queued = [];
    // Keep a completed room until explicit exit: a peer's leave must not race the final send callback.
    if (finished) detach();
    else void cleanup();
    notify();
  }
  const protectedEvent = (fn) => (info) => {
    if (!active()) return;
    try {
      fn(info);
    } catch {
      end('联机数据不一致，请重新开局。');
    }
  };
  function properties(value) {
    const result = parse(value);
    if (!object(result)) throw new Error('无效属性');
    return result;
  }
  function readyFrom(who, value) {
    if (!members.has(who) || !value) return;
    const data = properties(value);
    if (data.ready === true && data.epoch === settings?.epoch) ready.add(who);
    else ready.delete(who);
    notify();
    maybeStart();
  }
  function enter(info) {
    if (!roomId || info.roomId !== roomId) return;
    const who = info.playerInfo?.id;
    if (!id(who)) throw new Error('无效成员');
    if (phase !== 'waiting' && !members.has(who)) return end('房间成员已变化，请重新开局。');
    members.set(who, info.playerInfo);
    if (members.size > 2) throw new Error('房间人数错误');
    readyFrom(who, info.playerInfo.customProperties);
    notify();
  }
  function left(info) {
    const who = memberId(info);
    if (info.roomId && info.roomId !== roomId) return;
    // A peer may explicitly leave immediately after receiving the winning batch, before our send callback.
    if (members.has(who) && !(host() && phase === 'playing' && inFlightTerminal))
      end('好友已离开或掉线，本局已结束。');
  }
  function playerProperties(info) {
    const who = memberId(info);
    readyFrom(who, info.properties ?? info.playerInfo?.customProperties);
  }
  function roomProperties(info) {
    if (!roomId || (info.id && info.id !== roomId)) return;
    if (
      info.customProperties &&
      JSON.stringify(properties(info.customProperties)) !== JSON.stringify(settings)
    )
      end('房间配置已改变，请重新开局。');
  }
  function activate(players) {
    if (
      players.length !== 2 ||
      players[0] !== ownerId ||
      new Set(players).size !== 2 ||
      !players.every((who) => id(who) && members.has(who)) ||
      !players.includes(playerId)
    )
      throw new Error('无效席位');
    roster = players.slice();
    state = descriptor.initial(settings);
    phase = 'playing';
    seq = 0;
    startAt = lastReceived = lastPeerReceived = now();
    message = '';
    notify();
  }
  async function maybeStart() {
    if (
      phase !== 'waiting' ||
      !host() ||
      startRequested ||
      members.size !== 2 ||
      ![...members.keys()].every((who) => ready.has(who))
    )
      return;
    startRequested = true;
    sending = true;
    const players = [ownerId, [...members.keys()].find((who) => who !== ownerId)];
    try {
      // Accept an early peer intent even when the host's send callback follows delivery.
      activate(players);
      await send(packet('start', { players }));
      startAt = now();
    } catch (error) {
      end(error.message);
    } finally {
      sending = false;
    }
  }
  function applyCommit(data) {
    if (!Number.isSafeInteger(data.n) || data.n < 1) throw new Error('无效序号');
    if (data.n <= seq) return;
    if (
      data.n !== seq + 1 ||
      !Number.isSafeInteger(data.t) ||
      data.t < state.tick ||
      data.t > descriptor.durationTicks ||
      data.t - state.tick > 1200 ||
      !Array.isArray(data.a) ||
      !Array.isArray(data.no) ||
      data.a.length + data.no.length > 2
    )
      throw new Error('消息缺失');
    const next = copy(state),
      resolved = new Set();
    descriptor.advance(next, data.t);
    for (const entry of [...data.a, ...data.no]) {
      if (
        !object(entry) ||
        ![0, 1].includes(entry.s) ||
        !Number.isSafeInteger(entry.i) ||
        entry.i !== committed[entry.s] + 1 ||
        resolved.has(entry.s)
      )
        throw new Error('无效行动');
      resolved.add(entry.s);
      if (
        entry.s === seat() &&
        (!pending ||
          entry.i !== pending.i ||
          (entry.a && JSON.stringify(entry.a) !== JSON.stringify(pending.a)))
      )
        throw new Error('行动确认不匹配');
    }
    for (const entry of data.a) descriptor.apply(next, entry.a, entry.s);
    for (const entry of [...data.a, ...data.no]) committed[entry.s] = entry.i;
    state = next;
    seq = data.n;
    lastReceived = now();
    if (resolved.has(seat())) {
      message = data.no.some((entry) => entry.s === seat()) ? '这一步暂不可执行，请重新选择。' : '';
      pending = null;
    }
    const outcome = descriptor.outcome(state);
    if (outcome) end(outcome, true);
    else notify();
  }
  function received(info) {
    const who = alias(info, 'playerId', 'fromPlayerId'),
      raw = alias(info, 'msg', 'message');
    if (!id(who) || who === playerId || !members.has(who)) return;
    const encoded = typeof raw === 'string' ? raw : JSON.stringify(raw);
    if (typeof encoded !== 'string' || utf8Bytes(encoded) > 2048) throw new Error('消息过大');
    const data = parse(raw);
    if (
      !object(data) ||
      data.v !== 1 ||
      data.g !== descriptor.id ||
      data.r !== roomId ||
      data.e !== settings.epoch
    )
      return;
    if (data.k === 'start') {
      if (who !== ownerId || host() || phase !== 'waiting') return;
      if (!ready.has(playerId)) throw new Error('尚未准备');
      activate(data.players);
      return;
    }
    if (phase !== 'playing') return;
    if (data.k === 'beat' && host() && who === roster[1]) {
      if (!Number.isSafeInteger(data.n) || data.n < 0 || data.n > seq + (sending ? 1 : 0))
        throw new Error('无效同步确认');
      lastPeerReceived = now();
      return;
    }
    if (data.k === 'intent' && host()) {
      if (who !== roster[1] || !Number.isSafeInteger(data.i) || data.i < 1)
        throw new Error('无效请求');
      if (data.i <= peerInput) return;
      if (data.i !== peerInput + 1 || queued.some((entry) => entry.s === 1))
        throw new Error('请求缺失');
      peerInput = data.i;
      lastPeerReceived = now();
      queued.push({ s: 1, i: data.i, a: data.a });
      return;
    }
    if (data.k === 'commit' && !host() && who === ownerId) {
      applyCommit(data);
      return;
    }
    throw new Error('无效消息类型');
  }
  function install() {
    listener = {
      onDisconnected: () => end('连接已断开，请重新开局。'),
      onBattleServiceError: () => end('联机服务暂不可用。'),
      onPlayerKicked: protectedEvent(left),
    };
    for (const [names, fn] of [
      [['onPlayerEntered', 'playerEnterRoom'], enter],
      [['onPlayerLeft', 'playerLeaveRoom'], left],
      [['onPlayerOffline', 'playerOffline'], left],
      [['onCustomMessageReceived', 'onCustomMessage'], received],
      [['onPlayerCustomPropertiesChanged', 'onPlayerCustomPropertiesChange'], playerProperties],
      [['onRoomPropertiesChanged', 'onRoomPropertiesChange'], roomProperties],
    ])
      for (const name of names) listener[name] = protectedEvent(fn);
    manager.registerListener(listener);
  }
  function adopt(result) {
    const room = result?.roomInfo;
    roomId = alias(room, 'id', 'roomId');
    ownerId = room?.ownerId;
    if (
      !id(roomId) ||
      !id(ownerId) ||
      room.maxPlayerCount !== 2 ||
      !Array.isArray(room.players) ||
      room.players.length < 1 ||
      room.players.length > 2 ||
      !room.players.every((p) => id(p.id))
    )
      throw new Error('无效双人房间');
    members = new Map(room.players.map((p) => [p.id, p]));
    if (members.size !== room.players.length || !members.has(playerId) || !members.has(ownerId))
      throw new Error('无效成员');
    settings = properties(room.customProperties);
    if (
      settings.v !== 1 ||
      settings.game !== descriptor.id ||
      settings.rule !== descriptor.version ||
      !id(settings.epoch) ||
      !Number.isSafeInteger(settings.seed) ||
      settings.seed < 0 ||
      settings.seed > 0xffffffff ||
      !descriptor.modes.some((mode) => mode.id === settings.mode)
    )
      throw new Error('请使用同一游戏和版本入口');
    phase = 'waiting';
    for (const [who, player] of members) readyFrom(who, player.customProperties);
    notify();
  }
  async function open(room, mode) {
    if (phase !== 'idle') throw new Error('已有房间请求');
    phase = 'connecting';
    notify();
    opening = (async () => {
      await authenticate();
      check();
      if (typeof sdk.getOnlineBattleManager !== 'function')
        throw new Error('当前 TapTap 不支持好友联机');
      manager = sdk.getOnlineBattleManager();
      if (!manager || leases.has(manager)) throw new Error('上一房间正在退出，请稍后重试');
      leases.set(manager, token);
      install();
      const connected = await tapCall(manager, 'connect');
      if (!id(connected?.playerId)) throw new Error('联机身份无效');
      playerId = connected.playerId;
      check();
      const data = room
        ? { roomId: room, playerCfg: { customProperties: '{}' } }
        : {
            roomCfg: {
              maxPlayerCount: 2,
              type: `sg-${descriptor.id}-v${descriptor.version}`,
              name: descriptor.title,
              matchParams: { level: '0', score: '0' },
              customProperties: JSON.stringify({
                v: 1,
                game: descriptor.id,
                rule: descriptor.version,
                mode,
                seed: Math.floor(random() * 0x100000000) >>> 0,
                epoch: `${now().toString(36)}-${Math.floor(random() * 0x100000000).toString(36)}`,
              }),
            },
            playerCfg: { customProperties: '{}' },
          };
      const result = await tapCall(manager, room ? 'joinRoom' : 'createRoom', { data });
      // Remember a late successful join for cleanup, without reviving the UI.
      if (!active()) {
        roomId = alias(result?.roomInfo, 'id', 'roomId') || '';
        return;
      }
      adopt(result);
      if (autoPump)
        timer = setInterval(() => {
          void api.pump();
        }, 125);
    })();
    try {
      await opening;
    } catch (error) {
      end(error.message);
      throw error;
    }
  }
  const api = {
    create: (mode) => open(null, mode),
    join: (room) => {
      if (!id(room?.trim())) return Promise.reject(new Error('请输入完整房间号'));
      return open(room.trim());
    },
    async ready() {
      if (phase !== 'waiting' || ready.has(playerId)) return;
      // Record the user's intent before a fast peer start can precede the SDK callback.
      ready.add(playerId);
      notify();
      try {
        await tapCall(manager, 'updatePlayerCustomProperties', {
          properties: JSON.stringify({ ready: true, epoch: settings.epoch }),
        });
      } catch (error) {
        ready.delete(playerId);
        end('准备失败，请重新开局。');
        throw error;
      }
      check();
      notify();
      void maybeStart();
    },
    async action(action) {
      if (phase !== 'playing' || pending) return false;
      if (!allowedRate()) {
        message = '操作过快，请稍候';
        notify();
        return false;
      }
      // Validate against the visible state first; the host validates again at commit time.
      try {
        descriptor.apply(copy(state), action, seat());
      } catch (error) {
        message = error.message;
        notify();
        return false;
      }
      pending = { i: ++inputSeq, a: copy(action), at: now() };
      notify();
      if (host()) queued.push({ s: 0, i: pending.i, a: pending.a });
      else
        try {
          await send(packet('intent', { i: pending.i, a: pending.a }));
        } catch (error) {
          end(error.message);
          return false;
        }
      return true;
    },
    async pump() {
      if (phase !== 'playing' || sending) return;
      if (!host()) {
        if (now() - lastReceived > 5000 || (pending && now() - pending.at > 5000))
          end('同步已中断，请重新开局。');
        if (phase === 'playing' && now() - lastBeat >= 500) {
          lastBeat = now();
          try {
            await send(packet('beat', { n: seq }));
          } catch (error) {
            end(error.message);
          }
        }
        return;
      }
      if (now() - lastPeerReceived > 5000) return end('好友同步已中断，请重新开局。');
      const tick = Math.min(descriptor.durationTicks, Math.floor(((now() - startAt) * 120) / 1000));
      if (tick < state.tick || tick - state.tick > 1200) return end('游戏已离开前台，请重新开局。');
      if (tick === state.tick && !queued.length) return;
      sending = true;
      const candidates = queued;
      queued = [];
      try {
        let next = copy(state);
        descriptor.advance(next, tick);
        const accepted = [],
          rejected = [];
        for (const entry of candidates) {
          const candidate = copy(next);
          try {
            descriptor.apply(candidate, entry.a, entry.s);
            next = candidate;
            accepted.push(entry);
          } catch {
            rejected.push({ s: entry.s, i: entry.i });
          }
        }
        const value = packet('commit', { n: seq + 1, t: tick, a: accepted, no: rejected });
        inFlightTerminal = Boolean(descriptor.outcome(next));
        await send(value);
        applyCommit(value);
      } catch (error) {
        end(error.message || '同步失败');
      } finally {
        sending = false;
        inFlightTerminal = false;
      }
    },
    hide: () => end('已切到后台，本局结束。'),
    stop() {
      if (!stopped) {
        stopped = true;
        phase = 'ended';
        pending = null;
        queued = [];
      }
      return cleanup();
    },
    getSnapshot: () => ({
      phase,
      message,
      playerId,
      roomId,
      ownerId,
      members: [...members.keys()],
      ready: [...ready],
      settings: settings && copy(settings),
      seat: seat(),
      pending: Boolean(pending),
      seq,
      state: state && copy(state),
      view: state && copy(descriptor.view(state, seat())),
    }),
    preview: (actor, point) => state && descriptor.preview?.(state, seat(), actor, point),
  };
  return api;
}
