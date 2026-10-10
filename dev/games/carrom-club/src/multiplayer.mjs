const GAME = 'carrom-club';
const ACTIVE_KEY = 'carrom-friend-room-v1';
const CODE = /^[A-F0-9]{12}$/;

export function readInvitation(value = globalThis.location?.href ?? '') {
  const raw = String(value).trim();
  if (CODE.test(raw.toUpperCase())) return raw.toUpperCase();
  try {
    const url = new URL(raw);
    if (url.searchParams.has('game') && url.searchParams.get('game') !== GAME) return '';
    const code = (url.searchParams.get('pk') ?? '').toUpperCase();
    return CODE.test(code) ? code : '';
  } catch {
    return '';
  }
}

export function invitationURL(code, href = globalThis.location?.href) {
  if (!CODE.test(code)) throw new Error('房间码无效');
  const url = new URL(href);
  // Share only the public room code: never identities, development flags or API overrides.
  url.search = new URLSearchParams({ pk: code }).toString();
  url.hash = '';
  return url.href;
}

/** HTTP room protocol shared with other games; no browser-to-browser local transport. */
export function createMultiplayer({
  client,
  loadClient,
  storage,
  onRoom = () => {},
  onError = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let room = null;
  let pending = null;
  let timer;
  let queue = Promise.resolve();
  let operations = 0;
  let destroyed = false;
  let epoch = 0;
  let recovery;
  try {
    recovery = JSON.parse(storage?.getItem(ACTIVE_KEY) || 'null');
    if (!CODE.test(recovery?.code ?? '')) recovery = null;
  } catch {
    recovery = null;
  }
  const api = async () => (client ??= await loadClient());
  const save = () => {
    try {
      if (room) storage?.setItem(ACTIVE_KEY, JSON.stringify({ code: room.code, pending }));
      else storage?.removeItem(ACTIVE_KEY);
    } catch {
      // A denied storage permission does not prevent the current online match.
    }
  };
  const accept = (next) => {
    if (next.game !== GAME || !CODE.test(next.code) || ![0, 1].includes(next.you))
      throw new Error('房间信息不匹配，请重新加入');
    room = next;
    recovery = null;
    if (pending && next.seq >= pending.seq) pending = null;
    save();
    onRoom(room);
    return room;
  };
  const request = async (path, body) =>
    (await api()).request(path, body === undefined ? undefined : { body: JSON.stringify(body) });
  const schedule = () => {
    clearTimer(timer);
    if (destroyed || !room || !['waiting', 'playing'].includes(room.status)) return;
    timer = setTimer(
      () => {
        void refresh().catch(() => {});
      },
      Math.max(600, room.pollMs || 800),
    );
    timer?.unref?.();
  };
  // Serialize polls and mutations so a slow poll cannot overwrite a newer shot/ready response.
  const run = (operation) => {
    if (destroyed) return Promise.reject(new Error('房间已关闭'));
    const generation = epoch;
    operations++;
    clearTimer(timer);
    const result = queue.then(async () => {
      if (destroyed || generation !== epoch) throw new Error('房间已关闭');
      return operation((next) => {
        if (destroyed || generation !== epoch) return null;
        return accept(next);
      });
    });
    queue = result.catch(() => {});
    return result
      .catch((error) => {
        if (!destroyed && generation === epoch) onError(error);
        throw error;
      })
      .finally(() => {
        operations--;
        if (!operations && generation === epoch) schedule();
      });
  };
  const requireRoom = () => {
    if (!room) throw new Error('请先创建或加入房间');
    return room;
  };
  const refresh = () =>
    run(async (receive) => {
      const active = requireRoom();
      return receive(await request(`/rooms/${active.code}`));
    });
  const action = (payload) =>
    run(async (receive) => {
      const active = requireRoom();
      if (pending) throw new Error('上一杆尚未确认，请先重试同步');
      if (active.status !== 'playing') throw new Error('请等待双方准备后开局');
      pending = { seq: active.seq + 1, action: payload(active) };
      save();
      try {
        return receive(await request(`/rooms/${active.code}/actions`, pending));
      } catch (error) {
        if (error.code && error.code !== 'SERVICE_UNAVAILABLE') {
          pending = null;
          save();
        }
        throw error;
      }
    });
  return {
    get room() {
      return room;
    },
    get busy() {
      return operations > 0;
    },
    get pending() {
      return !!pending;
    },
    get recoverable() {
      return !!recovery;
    },
    get recoveryCode() {
      return recovery?.code ?? '';
    },
    create() {
      return run(async (receive) => {
        if (room) throw new Error('请先退出当前房间');
        return receive(await request('/rooms', { game: GAME }));
      });
    },
    join(value) {
      return run(async (receive) => {
        const code = readInvitation(value);
        if (!code) throw new Error('请输入 12 位房间码或完整邀请链接');
        if (room && room.code !== code) throw new Error('请先退出当前房间');
        return receive(await request('/rooms/join', { code, game: GAME }));
      });
    },
    resume() {
      return run(async (receive) => {
        if (!recovery) return null;
        const previous = recovery;
        const next = await request(`/rooms/${previous.code}`);
        pending = previous.pending ?? null;
        recovery = null;
        return receive(next);
      });
    },
    ready() {
      return run(async (receive) => {
        const active = requireRoom();
        return receive(await request(`/rooms/${active.code}/ready`, {}));
      });
    },
    shoot({ x, dx, dy, power }) {
      return action((active) => ({
        type: 'shoot',
        x,
        dx,
        dy,
        power,
        expectedShot: active.state.game.shots,
      }));
    },
    resign() {
      return action(() => ({ type: 'resign' }));
    },
    refresh,
    retry() {
      return run(async (receive) => {
        const active = requireRoom();
        try {
          return receive(
            await request(
              `/rooms/${active.code}${pending ? '/actions' : ''}`,
              pending ?? undefined,
            ),
          );
        } catch (error) {
          if (error.code && error.code !== 'SERVICE_UNAVAILABLE') {
            pending = null;
            save();
          }
          throw error;
        }
      });
    },
    rematch() {
      return run(async (receive) => {
        const active = requireRoom();
        if (!['finished', 'abandoned', 'expired'].includes(active.status))
          throw new Error('本局尚未结束');
        const next = await request(`/rooms/${active.code}/rematch`, {});
        if (!CODE.test(next.rematch ?? '') || next.rematch === active.code)
          throw new Error('新房间暂不可用，请重试');
        pending = null;
        return receive(await request('/rooms/join', { code: next.rematch, game: GAME }));
      });
    },
    leave() {
      return run(async (receive) => {
        const active = requireRoom();
        receive(await request(`/rooms/${active.code}/leave`, {}));
        room = null;
        pending = null;
        recovery = null;
        save();
        onRoom(null);
      });
    },
    destroy() {
      destroyed = true;
      epoch++;
      clearTimer(timer);
    },
  };
}
