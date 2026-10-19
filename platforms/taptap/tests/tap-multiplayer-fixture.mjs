/* global TextEncoder */
/** Test-only OnlineBattle server. No production/offline fallback imports this fixture. */
export function createBattleHub({ profile = 'modern', callbackOnly = false } = {}) {
  const peers = new Map(),
    rooms = new Map(),
    messages = [];
  let nextRoom = 0;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const names = {
    enter: ['onPlayerEntered', 'playerEnterRoom'],
    left: ['onPlayerLeft', 'playerLeaveRoom'],
    properties: ['onPlayerCustomPropertiesChanged', 'onPlayerCustomPropertiesChange'],
    message: ['onCustomMessageReceived', 'onCustomMessage'],
  };
  const info = (room) => ({
    id: room.id,
    ownerId: room.ownerId,
    maxPlayerCount: 2,
    customProperties: room.customProperties,
    players: room.players.map((who) => ({
      id: who,
      status: 1,
      customProperties: peers.get(who).properties || '{}',
    })),
  });
  const emit = async (peer, kind, data) => {
    if (hub.drop?.(peer.id, kind, data)) return;
    const event = names[kind][profile === 'legacy' ? 1 : 0];
    if (kind === 'message')
      data =
        profile === 'legacy'
          ? { fromPlayerId: data.playerId, msg: data.msg }
          : profile === 'page'
            ? { playerId: data.playerId, message: data.msg }
            : data;
    await peer.deliver(event, clone(data));
  };
  const hub = {
    rooms,
    messages,
    peers,
    drop: null,
    delaySend: null,
    add(id, deliver) {
      if (!peers.has(id)) peers.set(id, { id, deliver, room: null, properties: '{}' });
    },
    async call(id, method, input = {}) {
      const peer = peers.get(id);
      if (method === 'connect') return { playerId: id, errMsg: 'connect:ok' };
      if (method === 'disconnect') return {};
      if (method === 'createRoom') {
        const cfg = input.data.roomCfg;
        if (cfg.roomId || cfg.maxPlayerCount !== 2 || !cfg.name || !cfg.type || !cfg.matchParams)
          throw new Error('bad create options');
        const room = {
          id: `Tap-room-${++nextRoom}/+=`,
          ownerId: id,
          players: [id],
          customProperties: cfg.customProperties,
        };
        rooms.set(room.id, room);
        peer.room = room.id;
        peer.properties = input.data.playerCfg?.customProperties || '{}';
        return { roomInfo: info(room) };
      }
      if (method === 'joinRoom') {
        const room = rooms.get(input.data.roomId);
        if (!room || room.players.length !== 1) throw new Error('room unavailable');
        peer.room = room.id;
        peer.properties = input.data.playerCfg?.customProperties || '{}';
        room.players.push(id);
        for (const who of room.players.filter((who) => who !== id))
          await emit(peers.get(who), 'enter', {
            roomId: room.id,
            playerInfo: { id, status: 1, customProperties: peer.properties },
          });
        return { roomInfo: info(room) };
      }
      const room = rooms.get(peer.room);
      if (method === 'leaveRoom') {
        if (!room) return {};
        room.players = room.players.filter((who) => who !== id);
        peer.room = null;
        for (const who of room.players)
          await emit(peers.get(who), 'left', { roomId: room.id, playerId: id });
        if (!room.players.length) rooms.delete(room.id);
        return {};
      }
      if (!room) throw new Error('not in room');
      if (method === 'updatePlayerCustomProperties') {
        if (typeof input.properties !== 'string' || input.data)
          throw new Error('bad property options');
        peer.properties = input.properties;
        for (const who of room.players)
          await emit(peers.get(who), 'properties', { playerId: id, properties: peer.properties });
        return {};
      }
      if (method === 'sendCustomMessage') {
        if (input.data.type !== 0 || typeof input.data.msg !== 'string')
          throw new Error('bad send options');
        messages.push({
          sender: id,
          value: JSON.parse(input.data.msg),
          bytes: new TextEncoder().encode(input.data.msg).length,
        });
        for (const who of room.players.filter((who) => who !== id))
          await emit(peers.get(who), 'message', { playerId: id, msg: input.data.msg });
        if (hub.delaySend) await hub.delaySend(id, JSON.parse(input.data.msg));
        return {};
      }
      throw new Error(`unsupported ${method}`);
    },
    sdk(id) {
      const listeners = new Set();
      hub.add(id, (name, data) => {
        for (const listener of listeners) listener[name]?.(data);
      });
      const manager = {
        registerListener: (listener) => listeners.add(listener),
        unregisterListener: (listener) => listeners.delete(listener),
      };
      for (const method of [
        'connect',
        'disconnect',
        'createRoom',
        'joinRoom',
        'leaveRoom',
        'sendCustomMessage',
        'updatePlayerCustomProperties',
      ])
        manager[method] = (input) => {
          const result = hub.call(id, method, input);
          if (!callbackOnly) return result;
          result.then(input?.success, input?.fail);
          return undefined;
        };
      return { sdk: { getOnlineBattleManager: () => manager }, manager, listeners };
    },
  };
  return hub;
}
