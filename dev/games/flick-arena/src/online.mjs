// The shared competition transport owns guest/platform credentials and HTTP policy.
// This adapter only handles flick-arena room recovery and serializes room operations.
export const onlineVersion = 'flick-series-v1';
export const onlineRoomKey = 'flick-arena-online-room-v1';

export function normalizeRoomCode(value) {
  const code = String(value || '').trim().toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-F0-9]{12}$/.test(code)) throw new Error('请输入完整的 12 位房间码。');
  return code;
}

export function invitationCode(url) {
  try {
    const value = new URL(url).searchParams.get('flickRoom');
    return value ? normalizeRoomCode(value) : null;
  } catch {
    return null;
  }
}

export function createOnlineClient(options = {}) {
  const transport = options.transport || globalThis.__competition;
  let storage;
  try { storage = options.storage || globalThis.localStorage; } catch { /* Private browsing. */ }
  let room = null, saved = null, queue = Promise.resolve(), disposed = false, pending = null;
  try { saved = JSON.parse(storage?.getItem(onlineRoomKey) || 'null'); } catch { /* Optional storage. */ }
  const persist = () => {
    try {
      if (saved) storage?.setItem(onlineRoomKey, JSON.stringify(saved));
      else storage?.removeItem(onlineRoomKey);
    } catch { /* A failed save never prevents playing this session. */ }
  };
  function accept(next) {
    if (disposed) return next;
    if (next.game !== 'flick-arena') throw Object.assign(new Error('这个房间属于另一款游戏。'), { code: 'WRONG_GAME' });
    if (next.version !== onlineVersion)
      throw Object.assign(new Error('好友服务正在更新，请稍后重新创建房间。'), { code: 'RULE_VERSION_CHANGED' });
    room = next;
    if (pending && next.seq >= pending.seq) pending = null;
    saved = { code: next.code };
    persist();
    options.onChange?.(next);
    return next;
  }
  function run(operation) {
    const result = queue.catch(() => {}).then(() => {
      if (disposed) throw new Error('房间已关闭。');
      if (!transport?.request) throw new Error('此平台暂未配置好友服务，同机双人仍可玩。');
      return operation();
    });
    queue = result;
    return result;
  }
  async function request(path, body) {
    return transport.request(path, body === undefined ? undefined : { body: JSON.stringify(body) });
  }
  const roomPath = () => {
    if (!room?.code) throw new Error('请先创建或加入房间。');
    return `/rooms/${room.code}`;
  };
  async function sendAction(action) {
    const path = roomPath() + '/actions';
    // A lost response can be retried with the exact same sequence and payload.
    pending ||= { seq: room.seq + 1, action };
    try { return accept(await request(path, pending)); }
    catch (error) {
      if (error.code !== 'SERVICE_UNAVAILABLE') pending = null;
      throw error;
    }
  }
  return {
    available: Boolean(transport?.request),
    snapshot: () => room,
    savedCode: () => saved?.code || null,
    create({ players = 2, turnSeconds = 10 } = {}) {
      return run(async () => {
        if (![2, 3, 4].includes(players) || ![10, 15].includes(turnSeconds))
          throw new Error('请选择 2–4 人及 10 秒或 15 秒计时。');
        const mode = (players === 2 ? 'duel' : `party${players}`) + (turnSeconds === 15 ? '-relaxed' : '');
        pending = null;
        return accept(await request('/rooms', { game: 'flick-arena', mode }));
      });
    },
    join(code) {
      return run(async () => {
        pending = null;
        return accept(await request('/rooms/join', { game: 'flick-arena', code: normalizeRoomCode(code) }));
      });
    },
    restore() {
      return run(async () => {
        if (!saved?.code) return null;
        try { return accept(await request(`/rooms/${normalizeRoomCode(saved.code)}`)); }
        catch (error) {
          if (['INVITATION_NOT_FOUND', 'RULE_VERSION_CHANGED', 'NOT_A_MEMBER'].includes(error.code)) {
            saved = null;
            persist();
          }
          throw error;
        }
      });
    },
    refresh: () => run(async () => accept(await request(roomPath()))),
    ready: () => run(async () => accept(await request(roomPath() + '/ready', {}))),
    shoot({ x, y, power, revision = room?.state?.revision }) {
      // The gesture belongs to the visible turn, even if an earlier refresh is in flight.
      const action = { type: 'shoot', revision, x, y, power };
      return run(() => sendAction(action));
    },
    next() {
      const action = { type: 'next', revision: room?.state?.revision, roundId: room?.state?.match?.tournamentRoundId };
      return run(() => sendAction(action));
    },
    rematch: () => run(async () => {
      const previous = await request(roomPath() + '/rematch', {});
      pending = null;
      return accept(await request('/rooms/join', { game: 'flick-arena', code: previous.rematch }));
    }),
    leave: () => run(async () => {
      const result = room ? await request(roomPath() + '/leave', {}) : null;
      room = null;
      saved = null;
      pending = null;
      persist();
      options.onChange?.(null);
      return result;
    }),
    invitationUrl(base) {
      if (!room?.code) return null;
      try {
        const url = new URL(base);
        url.search = '';
        url.hash = '';
        url.searchParams.set('flickRoom', room.code);
        return url.href;
      } catch { return null; }
    },
    dispose() { disposed = true; },
  };
}
