import { readSelection } from './Selection.ts';
import {
  multiplayerVersion,
  type ClientMessage,
  type RoomState,
  type RaceSnapshot,
  type ServerMessage,
} from './MultiplayerProtocol.ts';

/** Cocos' native/mini-game WebSocket adapter and browser WebSocket share this API. */
export class MultiplayerClient {
  endpoint: string;
  socket?: WebSocket;
  room?: RoomState;
  snapshot?: RaceSnapshot;
  selfId = '';
  session?: { code: string; token: string };
  status = '';
  connected = false;
  connecting = false;
  changed: () => void = () => {};
  onRoom: (room: RoomState) => void = () => {};
  onSession: () => void = () => {};
  private retry?: ReturnType<typeof setTimeout>;
  private deadline?: ReturnType<typeof setTimeout>;
  private retryUntil = 0;
  private stopped = false;
  seq = 0;
  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }
  connect(command: ClientMessage) {
    if (!/^wss?:\/\/[^\s/#?]+(?:\/[^\s#]*)?$/.test(this.endpoint)) {
      this.status = '联机服务尚未配置';
      this.changed();
      return;
    }
    if (this.connecting || this.connected) return;
    this.stopped = false;
    this.connecting = true;
    this.status = this.session ? '正在重新连接…' : '正在连接…';
    this.changed();
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.endpoint);
    } catch {
      this.connecting = false;
      this.status = '无法连接联机服务';
      this.changed();
      return;
    }
    this.socket = socket;
    this.deadline = setTimeout(() => socket.close(), 8000);
    socket.onopen = () => {
      if (socket !== this.socket) return;
      this.connected = true;
      this.connecting = false;
      socket.send(JSON.stringify(command));
    };
    socket.onmessage = (event) => {
      if (socket !== this.socket) return;
      try {
        if (typeof event.data !== 'string' || event.data.length > 256 * 1024) throw new Error();
        const message = JSON.parse(event.data) as ServerMessage;
        if (!message || typeof message !== 'object') throw new Error();
        if (message.type === 'joined' || message.type === 'room') {
          const room = message.room;
          if (
            !room ||
            !Number.isInteger(room.revision) ||
            room.revision < 1 ||
            Object.entries(readSelection(JSON.stringify(room))).some(
              ([key, value]) => room[key as 'theme' | 'route' | 'vehicle' | 'driver'] !== value,
            ) ||
            !/^[A-F0-9]{8}$/.test(room.code) ||
            !Array.isArray(room.members) ||
            room.members.length > 8 ||
            !Array.isArray(room.roster) ||
            room.roster.length > 8 ||
            !['lobby', 'loading', 'racing', 'finished'].includes(room.phase)
          )
            throw new Error();
          if (message.type === 'joined') {
            if (typeof message.selfId !== 'string' || !/^[a-f0-9]{64}$/.test(message.token))
              throw new Error();
            clearTimeout(this.deadline);
            this.selfId = message.selfId;
            this.session = { code: room.code, token: message.token };
            this.retryUntil = 0;
            this.onSession();
          }
          if (room.raceId !== this.room?.raceId) {
            this.snapshot = undefined;
            this.seq = 0;
          }
          this.room = room;
          this.status = '';
          this.onRoom(room);
          this.changed();
        } else if (message.type === 'state') {
          const state = message.state;
          if (
            !state ||
            !Array.isArray(state.drivers) ||
            state.drivers.length < 1 ||
            state.drivers.length > 8 ||
            !Array.isArray(state.order) ||
            state.order.length !== state.drivers.length ||
            new Set(state.order).size !== state.drivers.length ||
            !state.order.every((i) => Number.isInteger(i) && i >= 0 && i < state.drivers.length) ||
            !Array.isArray(state.itemAvailableAt) ||
            state.itemAvailableAt.length !== 24 ||
            !state.itemAvailableAt.every(Number.isFinite) ||
            !['ready', 'countdown', 'racing', 'finished'].includes(state.phase) ||
            !Number.isFinite(state.time) ||
            !Number.isFinite(state.tick) ||
            !Number.isFinite(state.countdown) ||
            !state.drivers.every(
              (d) =>
                d.kart &&
                d.progress &&
                [
                  d.kart.x,
                  d.kart.y,
                  d.kart.z,
                  d.kart.heading,
                  d.kart.speed,
                  d.progress.distance,
                  d.progress.finishedAt,
                ].every(Number.isFinite),
            )
          )
            throw new Error();
          if (
            state.raceId === this.room?.raceId &&
            state.drivers.length === this.room.roster.length &&
            (!this.snapshot || state.tick >= this.snapshot.tick)
          )
            this.snapshot = state;
        } else if (message.type === 'error' && typeof message.message === 'string') {
          this.status = message.message.slice(0, 100);
          if (message.fatal) {
            this.session = undefined;
            this.stopped = true;
            this.onSession();
            socket.close();
          } else if (!this.room) {
            this.stopped = true;
            socket.close();
          }
          this.changed();
        } else throw new Error();
      } catch {
        this.status = '服务返回了无效数据';
        this.stopped = true;
        socket.close();
        this.changed();
      }
    };
    socket.onerror = () => {
      if (socket === this.socket) {
        this.status = '连接中断，请检查网络';
        this.changed();
      }
    };
    socket.onclose = (event) => {
      if (socket !== this.socket) return;
      clearTimeout(this.deadline);
      this.connected = this.connecting = false;
      if (event.code === 4001 || event.code === 4000) {
        this.session = undefined;
        this.stopped = true;
        this.onSession();
        this.status =
          event.code === 4001 ? '已在其他窗口连接，请退出此房间' : '房间已过期，请重新加入';
      }
      if (!this.stopped && this.session) {
        this.retryUntil ||= Date.now() + 30000;
        if (Date.now() < this.retryUntil) {
          this.status = '网络中断，正在重连…';
          this.retry = setTimeout(
            () => this.connect({ type: 'resume', version: multiplayerVersion, ...this.session! }),
            1000,
          );
        } else {
          this.status = '重连超时，请退出后重新加入';
          this.session = undefined;
          this.onSession();
        }
      } else if (!this.stopped) this.status = '连接失败，请稍后重试';
      this.changed();
    };
  }
  send(message: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
  leave() {
    this.stopped = true;
    clearTimeout(this.retry);
    clearTimeout(this.deadline);
    this.send({ type: 'leave' });
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
    this.connected = this.connecting = false;
    this.room = undefined;
    this.snapshot = undefined;
    this.session = undefined;
    this.status = '';
    this.onSession();
    this.changed();
  }
}
