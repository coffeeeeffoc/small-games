const GAME = 'carrom-club';
const ACTIVE_KEY = 'carrom-friend-room-v2';
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
export function createFriendsClient({
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
    if (next.game !== GAME || !CODE.test(next.code) || ![0, 1, 2, 3].includes(next.you))
      throw new Error('房间信息不匹配，请重新加入');
    room = next;
    recovery = null;
    if (
      pending &&
      (next.seq >= pending.seq ||
        next.round !== pending.round ||
        next.state?.turnNumber !== pending.expectedTurnNumber ||
        next.status !== 'playing')
    )
      pending = null;
    save();
    onRoom(room);
    return room;
  };
  const errors = {
    ROOM_CHANGED: '房间设置或准备状态已更新，请同步后重试。',
    MATCH_STARTED: '本局已开始，请下一局加入。',
    HOST_ONLY: '此操作由房主进行。',
    NOT_READY: '请等待所有玩家准备并保持在线。',
    PLAYER_COUNT: '经典单打需要 2 人，经典双打需要 4 人，彩色个人战需要 2–4 人。',
    TOO_MANY_PLAYERS: '当前人数超过所选玩法容量。',
    INVALID_LEVEL: '此棋盘不支持当前人数。',
    CLASSIC_BOARD_ONLY: '经典玩法使用标准棋盘。',
    NOT_YOUR_TURN: '尚未轮到你出杆。',
    SHOT_MOVING: '请等待棋子停稳。',
    MATCH_NOT_FINISHED: '本局尚未结束。',
  };
  const request = async (path, body) => {
    try {
      return await (
        await api()
      ).request(path, body === undefined ? undefined : { body: JSON.stringify(body) });
    } catch (error) {
      if (errors[error.code]) error.message = errors[error.code];
      throw error;
    }
  };
  const schedule = () => {
    clearTimer(timer);
    if (destroyed || !room || room.status === 'expired') return;
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
      return receive(await request(`/carrom/rooms/${active.code}`));
    });
  const action = (payload) =>
    run(async (receive) => {
      const active = requireRoom();
      if (pending) throw new Error('上一杆尚未确认，请先重试同步');
      if (active.status !== 'playing') throw new Error('请等待房主开始对局');
      pending = {
        seq: active.seq + 1,
        round: active.round,
        expectedTurnNumber: active.state.turnNumber,
        shot: payload(active),
      };
      save();
      try {
        return receive(await request(`/carrom/rooms/${active.code}/shoot`, pending));
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
    create(settings = {}) {
      return run(async (receive) => {
        if (room) throw new Error('请先退出当前房间');
        return receive(await request('/carrom/rooms', settings));
      });
    },
    join(value) {
      return run(async (receive) => {
        const code = readInvitation(value);
        if (!code) throw new Error('请输入 12 位房间码或完整邀请链接');
        if (room && room.code !== code) throw new Error('请先退出当前房间');
        return receive(await request('/carrom/rooms/join', { code }));
      });
    },
    resume() {
      return run(async (receive) => {
        if (!recovery) return null;
        const previous = recovery;
        const next = await request(`/carrom/rooms/${previous.code}`);
        pending = previous.pending ?? null;
        recovery = null;
        return receive(next);
      });
    },
    ready(ready = true) {
      return run(async (receive) => {
        const active = requireRoom();
        return receive(
          await request(`/carrom/rooms/${active.code}/ready`, { ready, revision: active.revision }),
        );
      });
    },
    shoot({ position, dx, dy, power }) {
      return action(() => ({ position, dx, dy, power }));
    },
    settings(settings) {
      return run(async (receive) => {
        const active = requireRoom();
        return receive(
          await request(`/carrom/rooms/${active.code}/settings`, {
            settings,
            revision: active.revision,
          }),
        );
      });
    },
    start() {
      return run(async (receive) => {
        const active = requireRoom();
        return receive(
          await request(`/carrom/rooms/${active.code}/start`, { revision: active.revision }),
        );
      });
    },
    refresh,
    get: refresh,
    restore() {
      return this.resume();
    },
    savedRoom() {
      return room?.code ?? recovery?.code ?? '';
    },
    async session() {
      return (await api()).session();
    },
    async profile(name) {
      return request('/me', name === undefined ? undefined : { name });
    },
    shareUrl(href) {
      return invitationURL(requireRoom().code, href);
    },
    retry() {
      return run(async (receive) => {
        const active = requireRoom();
        try {
          return receive(
            await request(
              `/carrom/rooms/${active.code}${pending ? '/shoot' : ''}`,
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
        if (!['finished', 'abandoned'].includes(active.status)) throw new Error('本局尚未结束');
        const next = await request(`/carrom/rooms/${active.code}/rematch`, {
          revision: active.revision,
        });
        pending = null;
        return receive(next);
      });
    },
    leave() {
      return run(async () => {
        const active = requireRoom();
        await request(`/carrom/rooms/${active.code}/leave`, {});
        room = null;
        pending = null;
        recovery = null;
        save();
        onRoom(null);
      });
    },
    disconnect() {
      this.destroy();
    },
    destroy() {
      destroyed = true;
      epoch++;
      clearTimer(timer);
    },
  };
}
