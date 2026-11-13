import type { Simulation } from './core/Simulation';
import { text } from './core/Data';
import { formatTime } from './core/BattleRecords';
import { MISSIONS, CAMPAIGN_BOARD_VERSION } from './core/MissionCatalog';
import type { ButtonRect, HUD } from './HUD';
import { C, col } from './HudTheme';
import { fitName } from './core/SafeArea';
import { homeHeaderLayout } from './ProgressionView';
import {
  EditBox,
  Graphics,
  Label,
  Mask,
  Node,
  Sprite,
  SpriteFrame,
  UITransform,
  isValid,
} from 'cc';
import { playerId, playerLabel, playerTag, duelEndNotice, type Online, type Player } from './Online';
type OnlineHost = Pick<
  HUD,
  | 'artwork'
  | 'button'
  | 'buttons'
  | 'controlIcon'
  | 'dialog'
  | 'dialogButton'
  | 'coverImage'
  | 'h'
  | 'inset'
  | 'label'
  | 'lang'
  | 'listAreas'
  | 'listScroll'
  | 'listViewport'
  | 'menuButton'
  | 'missionsOpen'
  | 'node'
  | 'online'
  | 'panelFrame'
  | 'plate'
  | 'progressionArt'
  | 'quartermaster'
  | 'rect'
  | 'safe'
  | 'scrollArea'
  | 'scrollMax'
  | 'scrollNode'
  | 't'
  | 'topRight'
  | 'toast'
  | 'toastUntil'
  | 'w'
>;

export class OnlineLobbyView {
  private roomNotice='';
  private readonly h: OnlineHost;
  private readonly missionArtwork: () => readonly SpriteFrame[];
  constructor(h: OnlineHost, missionArtwork: () => readonly SpriteFrame[]) {
    this.h = h;
    this.missionArtwork = missionArtwork;
  }
  refreshLobby(modal: Node, keyChanged: boolean): boolean {
    if (!this.lobbyComposer || !isValid(this.lobbyComposer.node)) return false;
    if (
      keyChanged ||
      this.lobbyStamp !== `${this.h.online!.revision}:${this.h.online!.chatRevision}`
    )
      this.renderLobby(modal);
    return true;
  }
  inputField(
    n: Node,
    g: Graphics,
    key: 'draftName' | 'draftCode' | 'draftPassword',
    caption: string,
    x: number,
    y: number,
    width: number,
  ) {
    this.h.label(n, caption, x + 46, y + 22, 12, 92, 40, C.dim);
    this.h.inset(g, x + 102, y, width - 102, 44);
    const field = this.h.node(key, n);
    // Configure before preload creates the native input and default labels.
    field.active = false;
    field.setPosition(x + 102 + (width - 102) / 2 - this.h.w / 2, this.h.h / 2 - y - 22);
    field.getComponent(UITransform)!.setContentSize(width - 122, 44);
    const edit = field.addComponent(EditBox);
    edit.textLabel = this.h.label(field, '', this.h.w / 2, this.h.h / 2, 14, width - 122, 42);
    const placeholder =
      key === 'draftCode'
        ? this.h.t('6位房间号', 'ROOM NUMBER')
        : key === 'draftPassword'
          ? this.h.t('公开房无需密码', 'OPTIONAL FOR PUBLIC ROOM')
          : '';
    edit.placeholderLabel = this.h.label(
      field,
      placeholder,
      this.h.w / 2,
      this.h.h / 2,
      12,
      width - 122,
      42,
      C.dim,
    );
    edit.inputMode = EditBox.InputMode.SINGLE_LINE;
    for (const label of [edit.textLabel, edit.placeholderLabel]) {
      label.node.getComponent(UITransform)!.setAnchorPoint(0, 1);
      label.horizontalAlign = Label.HorizontalAlign.LEFT;
      // Label setters use the initial multiline mode; restore single-line alignment.
      label.verticalAlign = Label.VerticalAlign.CENTER;
    }
    edit.maxLength = key === 'draftName' ? 16 : key === 'draftCode' ? 12 : 64;
    edit.inputFlag =
      key === 'draftPassword' ? EditBox.InputFlag.PASSWORD : EditBox.InputFlag.DEFAULT;
    edit.string = this.h.online![key];
    field.on(EditBox.EventType.TEXT_CHANGED, () => {
      this.h.online![key] = edit.string;
    });
    field.active = true;
  }
  private lobbyBody?: Node;
  private lobbyComposer?: EditBox;
  private lobbySend?: ButtonRect;
  private lobbyStamp = '';
  private chatLayout: Array<{ id: string; y: number; h: number }> = [];
  private chatUnread = false;
  private lobbyOwner = '';
  private lobbySkin(parent: Node, key: string, x: number, y: number, w: number, h: number) {
    const frame = this.h.progressionArt.get(key);
    if (!frame) return;
    const n = this.h.node('LobbySkin', parent),
      sp = n.addComponent(Sprite);
    n.setPosition(x + w / 2 - this.h.w / 2, this.h.h / 2 - y - h / 2);
    n.setScale(0.24, 0.24, 1);
    n.getComponent(UITransform)!.setContentSize(w / 0.24, h / 0.24);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.type = Sprite.Type.SLICED;
    sp.spriteFrame = frame;
  }
  private lobbyButtonIcon({ label, x, y, w, disabled }: ButtonRect, icon: string) {
    const ink = this.h.node('ButtonIcon', label.node.parent!).addComponent(Graphics);
    this.h.controlIcon(ink, icon, x + 13, y + 22, 14, disabled ? C.dim : C.white);
    label.node.setPosition(x + (w + 13) / 2 - this.h.w / 2, this.h.h / 2 - y - 22);
    label.node.getComponent(UITransform)!.setContentSize(w - 24, 40);
    label.enableWrapText = false;
    label.overflow = Label.Overflow.SHRINK;
  }
  private updateLobbySend() {
    const o = this.h.online!, send = this.lobbySend;
    if (!send) return;
    const chat = o.publicChat;
    send.label.node.parent!.active = chat.draft.trim().length > 0 || !!chat.intent;
    send.disabled = !o.chatAvailable || o.chatSending;
    send.label.string = chat.intent && !chat.sending ? this.h.t('重试', 'RETRY') : this.h.t('发送', 'SEND');
    send.label.color = col(send.disabled ? C.dim : C.white);
  }
  private releaseFailure(request: RegExp) {
    const online = this.h.online!, issue = online.releaseIssue;
    if (online.checkingRelease || online.releaseCheckFailed || !issue || !request.test(`${issue.method} ${issue.path}`)) return '';
    return this.h.t('当前版本无法完成此操作，请退出并重新进入游戏后重试', 'UPDATE REQUIRED · REOPEN THE GAME AND RETRY');
  }
  private renderPlayers(n: Node, bounds: { x: number; y: number; w: number; h: number }, friends: boolean) {
    const h = this.h, o = h.online!;
    const entries = friends ? [...o.social.requests.filter(p => !o.blockedPlayers.has(playerId(p))), ...o.social.friends] : o.onlinePlayers;
    const paging = !friends && (o.playersPrevious.length > 0 || !!o.playersNext);
    const status = o.message || o.socialStatus || o.publicChat.status;
    const area = { ...bounds, h: Math.max(44, bounds.h - (paging ? 44 : 0) - (status ? 30 : 0)) };
    const stacked = area.w < 280, rowHeight = stacked ? 94 : 52;
    const list = h.listViewport(n, 'players', area, entries.length * rowHeight);
    entries.forEach((p, i) => {
      const id = playerId(p), own = id === o.authenticatedId, y = area.y + i * rowHeight - list.offset;
      if (y + rowHeight <= area.y || y >= area.y + area.h) return;
      const actionX = area.x + area.w - 140, textX = area.x + 20;
      const textW = (own || stacked ? area.x + area.w - 12 : actionX - 6) - textX;
      const tone = p.status === 'playing' ? C.amber : p.status === 'offline' ? C.dim : '#8fdbb0';
      list.g.fillColor = col(tone);
      list.g.circle(area.x + 8 - h.w / 2, h.h / 2 - y - 16, 3);
      list.g.fill();
      const name = h.label(list.n, fitName((own ? h.t('你 · ', 'YOU · ') : '') + (p.nickname || p.name || h.t('飞行员', 'PILOT')), textW, 13), textX + textW / 2, y + 15, 13, textW, 22);
      name.horizontalAlign = Label.HorizontalAlign.LEFT;
      name.enableWrapText = false;
      name.isBold = true;
      const added = o.social.friends.some(f => playerId(f) === id);
      const request = o.social.requests.find(f => playerId(f) === id);
      const detail = request ? h.t(request.direction === 'incoming' ? ' · 好友申请' : ' · 已申请', request.direction === 'incoming' ? ' · REQUEST' : ' · SENT')
        : p.status === 'playing' ? h.t(' · 游戏中', ' · PLAYING') : p.status === 'offline' ? h.t(' · 离线', ' · OFFLINE') : '';
      const meta = h.label(list.n, playerTag(id) + detail, textX + textW / 2, y + 35, 10, textW, 18, C.dim);
      meta.horizontalAlign = Label.HorizontalAlign.LEFT;
      meta.enableWrapText = false;
      meta.overflow = Label.Overflow.SHRINK;
      h.rect(list.g, area.x + 4, y + rowHeight - 2, area.w - 14, 1, '#23394c');
      const action = (slot: number, key: string, caption: string, icon: string, disabled = false) => {
        const label = h.dialogButton(list.n, list.g, 'online:' + key, '', actionX + slot * 44, y + (stacked ? 45 : 3), 44, 'quiet', icon, 44, disabled);
        label.node.name = caption;
      };
      if (own) return;
      const blocked = o.blockedPlayers.has(id);
      action(0, 'whisper:' + id, h.t('私信', 'MESSAGE'), 'message', blocked || !o.socialAvailable);
      if (request?.direction === 'incoming') {
        action(1, 'friendAction:accept:' + id, h.t('同意好友', 'ACCEPT'), 'check', o.socialBusy);
        action(2, 'friendAction:decline:' + id, h.t('拒绝申请', 'DECLINE'), 'close', o.socialBusy);
      } else {
        action(1, 'invitePlayer:' + id, h.t('邀请对战', 'INVITE'), 'lobby', !o.canInvite(p));
        if (added && friends) action(2, 'friendAction:remove:' + id, h.t('移除好友', 'REMOVE FRIEND'), 'minus', o.socialBusy);
        else if (request) action(2, 'friendAction:cancel:' + id, h.t('取消申请', 'CANCEL REQUEST'), 'close', o.socialBusy);
        else if (added) h.controlIcon(list.g, 'check', actionX + 110, y + (stacked ? 67 : 25), 18, C.mint);
        else action(2, 'friendAction:request:' + id, h.t('添加好友', 'ADD FRIEND'), 'plus', blocked || o.socialBusy || !o.socialAvailable);
      }
    });
    list.finish();
    if (!entries.length) h.label(n, o.socialStatus || h.t(friends ? '还没有好友，去在线玩家认识一下吧' : '正在读取在线玩家…', friends ? 'ADD FRIENDS FROM ONLINE PLAYERS' : 'LOADING PLAYERS…'), area.x + area.w / 2, area.y + 35, 12, area.w - 24, 60, C.dim);
    if (status) h.label(n, status, area.x + area.w / 2, area.y + area.h + 15, 11, area.w - 12, 28, C.amber);
    if (paging) {
      const y = bounds.y + bounds.h - 44;
      h.dialogButton(n, n.getComponent(Graphics) || n.addComponent(Graphics), 'online:playersPrev', '‹', area.x, y, 44, 'quiet', '', 44, !o.playersPrevious.length);
      h.label(n, String(o.playersPrevious.length + 1), area.x + area.w / 2, y + 22, 12, 60, 24, C.dim);
      h.dialogButton(n, n.getComponent(Graphics)!, 'online:playersNext', '›', area.x + area.w - 48, y, 44, 'quiet', '', 44, !o.playersNext);
    }
  }
  private renderLobby(n: Node, initial = false) {
    const o = this.h.online!,
      publicOnly = o.panel === 'chat',
      roomy = this.h.w >= 1000,
      l = this.h.safe.left + 12,
      r = this.h.w - this.h.safe.right - 12,
      top = this.h.safe.top + 56,
      b = this.h.h - this.h.safe.bottom - 12,
      gap = 14,
      lw = (r - l - gap) * 0.44,
      rx = publicOnly ? l : l + lw + gap,
      rw = r - rx,
      inputY = b - 48;
    if (initial) {
      if (!publicOnly) this.lobbySkin(n, 'panel', l, top, lw, b - top);
      this.lobbySkin(n, 'panel', rx, top, rw, b - top);
      this.h.button('online:back', '‹', l, this.h.safe.top + 5, 44, 44, n).fontSize = 31;
      this.h.label(
        n,
        this.h.t(publicOnly ? '大厅交流' : '全局大厅', publicOnly ? 'PUBLIC LOBBY' : 'GLOBAL LOBBY'),
        l + 145,
        this.h.safe.top + 27,
        25,
        190,
        40,
        C.white,
      ).isBold = true;
      const field = this.h.node('LobbyComposer', n),
        fieldX = rx + 8, inviteWidth = 66, inviteX = r - 8 - inviteWidth,
        frameRight = inviteX - 8, sendWidth = 52, sendX = frameRight - 4 - sendWidth,
        editorLeft = fieldX + 12, editorWidth = sendX - 4 - editorLeft;
      field.active = false;
      field.setPosition(editorLeft + editorWidth / 2 - this.h.w / 2, this.h.h / 2 - inputY - 22);
      field.getComponent(UITransform)!.setContentSize(editorWidth, 44);
      this.lobbySkin(n, 'panel', fieldX, inputY, frameRight - fieldX, 44);
      field.setSiblingIndex(n.children.length - 1);
      const edit = (this.lobbyComposer = field.addComponent(EditBox));
      edit.textLabel = this.h.label(
        field,
        '',
        this.h.w / 2,
        this.h.h / 2,
        roomy ? 18 : 13,
        editorWidth,
        40,
        C.white,
      );
      edit.placeholderLabel = this.h.label(
        field,
        this.h.t('说点什么…', 'Say something…'),
        this.h.w / 2,
        this.h.h / 2,
        roomy ? 17 : 12,
        editorWidth,
        40,
        C.dim,
      );
      edit.inputMode = EditBox.InputMode.SINGLE_LINE;
      edit.inputFlag = EditBox.InputFlag.DEFAULT;
      edit.maxLength = 240;
      edit.string = o.publicChat.draft;
      for (const label of [edit.textLabel, edit.placeholderLabel]) {
        label.node.getComponent(UITransform)!.setAnchorPoint(0, 1);
        label.horizontalAlign = Label.HorizontalAlign.LEFT;
        label.verticalAlign = Label.VerticalAlign.CENTER;
      }
      field.on(EditBox.EventType.TEXT_CHANGED, () => {
        o.publicChat.draft = edit.string;
        this.updateLobbySend();
      });
      field.active = true;
      this.lobbySkin(n, 'blue', inviteX, inputY, inviteWidth, 44);
      this.h.button('online:chatInvite', this.h.t('邀请', 'INVITE'), inviteX, inputY, inviteWidth, 44, n).fontSize = 12;
      const invite = this.h.buttons.at(-1)!;
      invite.visual = { x: inviteX, y: inputY, w: inviteWidth, h: 44, cut: 8 };
      this.lobbyButtonIcon(invite, 'lobby');
      const send = this.h.node('LobbySend', n);
      const sendFace = { x: sendX, y: inputY + 5, w: sendWidth, h: 34, radius: 4 };
      this.h.rect(send.addComponent(Graphics), sendFace.x, sendFace.y, sendFace.w, sendFace.h, '#263e50ed', C.line, sendFace.radius);
      this.h.button('online:chatSend', this.h.t('发送', 'SEND'), sendX, inputY, sendWidth, 44, send).fontSize = 12;
      this.lobbySend = this.h.buttons.at(-1)!;
      this.lobbySend.visual = sendFace;
      this.lobbyButtonIcon(this.lobbySend, 'send');
      if (this.lobbyOwner !== o.authenticatedId) {
        this.lobbyOwner = o.authenticatedId;
        this.chatLayout = [];
        this.chatUnread = false;
        this.h.listScroll.chat = 0;
      }
    }
    if (this.lobbyBody && isValid(this.lobbyBody)) {
      const old = this.lobbyBody;
      this.h.buttons = this.h.buttons.filter((b) => {
        let node: Node | null = b.label.node;
        while (node) {
          if (node === old) return false;
          node = node.parent;
        }
        return true;
      });
      old.destroy();
    }
    this.h.listAreas = this.h.listAreas.filter((a) => !['rooms', 'players', 'chat'].includes(a.key));
    const body = (this.lobbyBody = this.h.node('LobbyLiveContent', n)),
      g = this.h.node('Ink', body).addComponent(Graphics);
    const onlineRight = this.h.topRight(this.h.safe.top + 13, 28);
    if (!publicOnly) this.h.rect(g, onlineRight - 200, this.h.safe.top + 13, 200, 28, '#07121cdd');
    if (!publicOnly) this.h.label(body, o.onlineLabel(this.h.lang), onlineRight - 100, this.h.safe.top + 27, 14, 200, 28, C.white);
    const btn = (
      id: string,
      caption: string,
      x: number,
      y: number,
      w: number,
      kind = 'blue',
      disabled = false,
      parent = body,
      icon = '',
    ) => {
      this.lobbySkin(parent, kind, x, y, w, 44);
      const label = this.h.button('online:' + id, caption, x, y, w, 44, parent);
      label.fontSize = Math.min(14, Math.max(11, w / 6));
      label.isBold = true;
      const button = this.h.buttons.at(-1)!;
      button.disabled = disabled;
      button.visual = { x, y, w, h: 44, cut: 8 };
      if (icon) this.lobbyButtonIcon(button, icon);
    };
    if (!publicOnly) {
      const tabW = (lw - 32) / 3;
      btn('lobbyRooms', this.h.t('房间', 'ROOMS'), l + 8, top + 4, tabW, o.lobbyTab === 'rooms' ? 'gold' : 'panel');
      btn('players', this.h.t('在线玩家', 'PLAYERS'), l + 16 + tabW, top + 4, tabW, o.lobbyTab === 'players' ? 'gold' : 'panel');
      btn('friends', this.h.t('好友', 'FRIENDS'), l + 24 + tabW * 2, top + 4, tabW, o.lobbyTab === 'friends' ? 'gold' : 'panel');
      this.h.label(body, this.h.t('大厅交流', 'PUBLIC CHAT'), rx + rw / 2, top + 26, 16, rw - 24, 36, C.white);
    }
    if (this.lobbyComposer && this.lobbyComposer.string !== o.publicChat.draft) this.lobbyComposer.string = o.publicChat.draft;
    this.updateLobbySend();
    const roomTop = top + 56,
      roomBottom = b - (o.lobbyTab !== 'rooms' && !o.room ? o.resumeCode ? 50 : 0 : 98),
      rowH = this.h.h < 420 ? 112 : 136,
      rooms = o.rooms;
    if (!publicOnly) {
    if (o.lobbyTab !== 'rooms') {
      this.renderPlayers(body, { x: l + 8, y: roomTop, w: lw - 16, h: roomBottom - roomTop }, o.lobbyTab === 'friends');
    } else {
    const roomNotice = !o.busy && (this.releaseFailure(/^POST .*\/(?:rooms|match)(?:\/[^?]*)?(?:\?|$)/) ||
      (o.message && this.releaseFailure(/^GET .*\/rooms(?:\?|$)/)) || o.message);
    const listBottom = roomBottom - (roomNotice && rooms.length ? 30 : 0);
    const roomList = this.h.listViewport(
      body,
      'rooms',
      { x: l + 7, y: roomTop, w: lw - 14, h: Math.max(44, listBottom - roomTop) },
      rooms.length * (rowH + 8),
    );
    rooms.forEach((room, i) => {
      const y = roomTop + i * (rowH + 8) - roomList.offset;
      if (y + rowH < roomTop || y > listBottom) return;
      this.lobbySkin(roomList.n, 'panel', l + 9, y, lw - 24, rowH);
      const frame = this.h.progressionArt.get('duel'),
        iw = roomy ? Math.min(154, lw * 0.29) : Math.min(92, lw * 0.34),
        ih = roomy ? 96 : 70;
      if (frame) this.h.coverImage(roomList.n, 'RoomArt', frame, l + 16, y + 10, iw, ih);
      const tx = l + iw + 26,
        tw = lw - iw - (roomy ? 148 : 44);
      const title = this.h.label(
        roomList.n,
        this.h.t('房间 ', 'ROOM ') + room.code,
        tx + tw / 2,
        y + (roomy ? 29 : 20),
        roomy ? 24 : 13,
        tw,
        32,
        C.white,
      );
      title.isBold = true;
      title.horizontalAlign = Label.HorizontalAlign.LEFT;
      this.h.label(
        roomList.n,
        room.players.map((p) => p.nickname || p.name || '飞行员').join(' / '),
        tx + tw / 2,
        y + (roomy ? 64 : 42),
        roomy ? 17 : 12,
        tw,
        26,
        C.dim,
      ).horizontalAlign = Label.HorizontalAlign.LEFT;
      this.h.label(
        roomList.n,
        `${room.playerCount}/2 · ` +
          this.h.t(
            room.status === 'waiting' ? (room.canJoin ? '等待加入' : '等待开战') : '进行中',
            room.status === 'waiting' ? 'WAITING' : 'PLAYING',
          ),
        tx + tw / 2,
        y + (roomy ? 97 : 63),
        roomy ? 18 : 12,
        tw,
        26,
        room.canJoin ? C.mint : C.amber,
      ).horizontalAlign = Label.HorizontalAlign.LEFT;
      const bw = roomy ? 94 : Math.min(82, lw * 0.37);
      const rejoin = room.status === 'playing' && room.code === o.resumeCode;
      btn(
        (rejoin ? 'resumeRoom:' : room.canJoin ? 'joinCode:' : 'watchCode:') + room.code,
        o.opening === room.code
          ? this.h.t('进入中…', 'ENTERING…')
          : o.room?.code === room.code
            ? this.h.t('我的房间', 'MINE')
            : rejoin ? this.h.t('返回对战', 'REJOIN')
              : this.h.t(room.canJoin ? '加入' : '观战', room.canJoin ? 'JOIN' : 'WATCH'),
        l + lw - bw - 18,
        y + (roomy ? (rowH - 44) / 2 : rowH - 45),
        bw,
        rejoin || room.canJoin ? 'gold' : 'blue',
        o.busy || !!o.room || (!rejoin && !room.canJoin && !room.canSpectate),
        roomList.n,
      );
    });
    roomList.finish();
    if (!rooms.length || roomNotice)
      this.h.label(
        body,
        roomNotice || this.h.t('暂无公开房间', 'No public rooms'),
        l + lw / 2,
        rooms.length ? roomBottom - 14 : roomTop + 42,
        rooms.length ? 11 : 14,
        lw - 25,
        rooms.length ? 28 : 70,
        C.dim,
      );
    }
    const ww = (lw - 24) / 2,
      mine = o.room;
    if (mine) {
      // 收起的房间：保留房号、双方准备状态，一键展开回完整房间。
      const dw = lw - 16,
        ew = Math.min(120, dw * 0.42),
        tw = dw - ew - 22,
        size = roomy ? 15 : 11,
        line = (str: string, y: number, color: string, bold = false) => {
          const label = this.h.label(body, str, l + 18 + tw / 2, y, size, tw, 22, color);
          label.horizontalAlign = Label.HorizontalAlign.LEFT;
          label.isBold = bold;
        };
      this.lobbySkin(body, 'panel', l + 8, b - 92, dw, 90);
      line(
        (roomy ? this.h.t('我的房间 #', 'MY ROOM #') : '#') + mine.code + ` · ${mine.players.length}/2`,
        b - 74,
        C.amber,
        true,
      );
      for (let i = 0; i < 2; i++) {
        const p = mine.players[i];
        line(
          p
            ? (p.ready ? this.h.t('已准备 ', 'READY ') : this.h.t('未准备 ', 'NOT READY ')) +
                (i === mine.you ? this.h.t('你', 'YOU') : p.nickname || p.name || '飞行员')
            : this.h.t('等待加入…', 'WAITING…'),
          b - 50 + i * 22,
          p?.ready ? C.mint : C.dim,
        );
      }
      btn('roomReturn', this.h.t('展开房间', 'EXPAND'), l + 8 + dw - ew - 6, b - 69, ew, 'gold');
    } else if(o.lobbyTab === 'rooms') {
      btn('friend', this.h.t('创建房间', 'CREATE'), l + 8, b - 92, ww, 'gold', o.busy);
      btn('join', this.h.t('房号加入', 'JOIN CODE'), l + 16 + ww, b - 92, ww, 'blue', o.busy);
      btn(o.resumeCode ? 'resumeRoom' : 'match', this.h.t(o.resumeCode ? '返回对战' : '快速匹配', o.resumeCode ? 'REJOIN BATTLE' : 'MATCH'), l + 8, b - 46, ww, o.resumeCode ? 'gold' : 'blue', o.busy);
      btn('bot', this.h.t('人机练习', 'PRACTICE'), l + 16 + ww, b - 46, ww, 'panel', o.busy);
    } else if (o.resumeCode) {
      btn('resumeRoom', this.h.t('返回对战', 'REJOIN BATTLE'), l + 8, b - 46, lw - 16, 'gold', o.busy);
    }
    }
    const chatTop = top + (publicOnly ? 12 : 54);
    const area = { x: rx + 8, y: chatTop, w: rw - 16, h: Math.max(44, inputY - chatTop - 25) },
      messages = o.publicMessages;
    const old = this.chatLayout,
      oldOffset = this.h.listScroll.chat || 0,
      oldTotal = old.length ? old.at(-1)!.y + old.at(-1)!.h + 8 : 0,
      atBottom = old.length === 0 || oldOffset >= oldTotal - area.h - 3;
    const anchor = old.find((row) => row.y + row.h > oldOffset),
      relative = anchor ? oldOffset - anchor.y : 0;
    const messageFont = roomy ? 18 : 13,
      avatar = roomy ? 38 : 28,
      textX = rx + avatar + 20,
      maxBubble = rw - avatar - 66;
    let total = 0;
    this.chatLayout = messages.map((m) => {
      const lines = Math.max(
          1,
          Math.ceil(
            Array.from(m.text).length / Math.max(6, Math.floor((maxBubble - 20) / messageFont)),
          ),
        ),
        h = (m.room ? (roomy ? 170 : 174) : roomy ? 80 : 68) + (lines - 1) * messageFont * 1.4;
      const row = { id: m.id, y: total, h };
      total += h + 8;
      return row;
    });
    const changed = old.map((r) => r.id).join() !== this.chatLayout.map((r) => r.id).join();
    if (changed && atBottom) this.h.listScroll.chat = Math.max(0, total - area.h);
    else if (changed) {
      const row = this.chatLayout.find((r) => r.id === anchor?.id);
      if (row) this.h.listScroll.chat = row.y + relative;
      this.chatUnread = true;
    }
    if (this.h.listScroll.chat >= total - area.h - 3) this.chatUnread = false;
    const chat = this.h.listViewport(body, 'chat', area, total);
    messages.forEach((m, i) => {
      const row = this.chatLayout[i],
        y = area.y + row.y - chat.offset;
      if (y + row.h < area.y || y > area.y + area.h) return;
      const own = m.playerId === o.authenticatedId,
        date = new Date(m.at),
        stamp = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      this.h.rect(
        chat.g,
        rx + 10,
        y + 4,
        avatar,
        avatar,
        own ? '#1c4559' : '#203347',
        '#8a7959',
        6,
      );
      this.h.label(
        chat.n,
        Array.from(m.nickname)[0] || '航',
        rx + 10 + avatar / 2,
        y + 4 + avatar / 2,
        roomy ? 22 : 17,
        avatar,
        avatar,
        own ? C.mint : C.amber,
      ).isBold = true;
      this.h.label(
        chat.n,
        (own ? this.h.t('你', 'YOU') : m.nickname) + (m.recipientId ? ' → ' + (m.recipientId === o.authenticatedId ? this.h.t('你', 'YOU') : m.recipientNickname || '') : '') + '  ' + stamp,
        textX + maxBubble / 2,
        y + 14,
        roomy ? 15 : 11,
        maxBubble,
        25,
        own ? C.mint : C.white,
      ).horizontalAlign = Label.HorizontalAlign.LEFT;
      const bubbleW = m.room
          ? maxBubble
          : Math.min(maxBubble, Math.max(82, Array.from(m.text).length * messageFont + 24)),
        bubbleY = y + 32,
        textH = row.h - (m.room ? (roomy ? 133 : 142) : 38);
      this.h.rect(
        chat.g,
        textX,
        bubbleY,
        bubbleW,
        row.h - 36,
        own ? '#174358ee' : '#142b3bee',
        '#456477',
        7,
      );
      const label = this.h.label(
        chat.n,
        m.text,
        textX + bubbleW / 2,
        bubbleY + textH / 2 + 3,
        messageFont,
        bubbleW - 20,
        textH,
        C.white,
      );
      label.horizontalAlign = Label.HorizontalAlign.LEFT;
      this.h.button('online:chatMenu:' + m.id, '⋮', r - 52, y + 20, 44, 44, chat.n).fontSize = 24;
      if (m.room) {
        const cardY = bubbleY + textH + 8,
          iw = roomy ? 90 : 44,
          ih = roomy ? 62 : 42,
          scene = this.h.progressionArt.get('duel');
        if (scene) this.h.coverImage(chat.n, 'ChatInvitationArt', scene, textX + 8, cardY, iw, ih);
        const tx = textX + iw + 17,
          tw = Math.max(50, bubbleW - iw - 28);
        this.h.label(
          chat.n,
          this.h.t('房间 ', 'ROOM ') + m.room.code,
          tx + tw / 2,
          cardY + 12,
          roomy ? 20 : 12,
          tw,
          24,
          m.room.canJoin ? C.mint : C.dim,
        ).horizontalAlign = Label.HorizontalAlign.LEFT;
        this.h.label(
          chat.n,
          this.h.t(
            m.room.canJoin ? '公开房间 · 等待加入' : '已满或已关闭',
            m.room.canJoin ? 'PUBLIC · OPEN' : 'FULL OR CLOSED',
          ),
          tx + tw / 2,
          cardY + 35,
          roomy ? 14 : 10,
          tw,
          22,
          C.dim,
        ).horizontalAlign = Label.HorizontalAlign.LEFT;
        btn(
          'chatJoin:' + m.id,
          this.h.t(m.room.canJoin ? '加入' : '已失效', m.room.canJoin ? 'JOIN' : 'CLOSED'),
          textX + bubbleW - (roomy ? 104 : 72),
          y + row.h - 48,
          roomy ? 96 : 68,
          'blue',
          !m.room.canJoin || !!o.room,
          chat.n,
        );
      }
      if (o.chatMenu === m.id) {
        const menuY = y + 24;
        this.lobbySkin(chat.n, 'panel', r - 146, menuY, 100, 44);
        btn('chatReply:'+m.id,this.h.t('私信回复','REPLY'),r-144,menuY,96,'blue',!o.socialAvailable||own&&!m.recipientId,chat.n);
      }
    });
    chat.finish();
    if (!o.chatAvailable || !messages.length)
      this.h.label(
        body,
        !o.chatAvailable
          ? this.h.t('大厅交流暂不可用', 'CHAT UNAVAILABLE')
          : this.h.t('和大厅飞行员打个招呼', 'Say hello to other pilots'),
        rx + rw / 2,
        area.y + 42,
        13,
        rw - 30,
        70,
        C.dim,
      );
    if (this.chatUnread)
      btn('chatLatest', this.h.t('新消息 ↓', 'NEW ↓'), r - 108, area.y + area.h - 44, 98, 'blue');
    this.h.label(
      body,
      (!publicOnly && o.message) || (o.publicChat.status && this.releaseFailure(/^[A-Z]+ .*\/chat(?:\?|$)/)) ||
        o.publicChat.status || this.h.t('文字交流 · 120字 · 发言间隔3秒', 'TEXT · 120 CHARS · 3s INTERVAL'),
      rx + rw / 2,
      inputY - 12,
      10,
      rw - 18,
      21,
      C.dim,
    );
    if (o.blockedPlayers.size)
      btn(
        'chatBlocks',
        this.h.t(`恢复联系(${o.blockedPlayers.size})`, `RESTORE (${o.blockedPlayers.size})`),
        rx + rw - 105,
        area.y + area.h - 45,
        96,
        'panel',
      );
    if (o.chatMenu === 'blocks') {
      this.lobbySkin(
        body,
        'panel',
        rx + 8,
        area.y,
        rw - 16,
        Math.min(area.h, 52 * o.blockedPlayers.size + 12),
      );
      Array.from(o.blockedPlayers)
        .slice(0, 5)
        .forEach((id, i) =>
          btn(
            'chatBlock:' + id,
            this.h.t('恢复 ', 'UNBLOCK ') + id.slice(-6),
            rx + 14,
            area.y + 6 + i * 50,
            rw - 28,
            'blue',
          ),
        );
    }
    this.lobbyStamp = `${o.revision}:${o.chatRevision}`;
  }
  renderOnline(n: Node, g: Graphics, s: Simulation, result: boolean) {
    const online = this.h.online!;
    if ((online.panel === 'menu' || online.panel === 'chat') && !result) {
      this.renderLobby(n, true);
      return;
    }
    if (online.panel === 'players' || online.panel === 'friends') {
      const friends = online.panel === 'friends';
      const q=this.h.quartermaster;
      const anchor=q&&!q.page&&s.phase==='briefing'&&!this.h.missionsOpen
        ? homeHeaderLayout(this.h,!!q.assets?.announcements?.length).entries.find(b=>b.panel===online.panel) : undefined;
      const count=friends?online.social.friends.length+online.social.requests.length:online.onlinePlayers.length;
      const height=anchor?this.h.h:Math.min(360,Math.max(220,72+count*52)+(online.message||online.socialStatus||online.publicChat.status?30:0)+(!friends&&(online.playersNext||online.playersPrevious.length)?44:0));
      const box = this.h.dialog(n, g, { width: 420, height, position: 'right', anchor,
        title: friends ? this.h.t('好友', 'FRIENDS') : this.h.t('在线玩家', 'ONLINE PLAYERS') + (online.onlineCount === null ? '' : ' · ' + online.onlineCount), close: 'online:back' });
      this.renderPlayers(n, { x: box.x + 12, y: box.y + 60, w: box.w - 24, h: box.h - 72 }, friends);
      return;
    }
    const form = ['profile', 'create', 'join'].includes(online.panel), readyRoom=online.panel==='room'&&!result;
    let pw = Math.min(result ? 560 : form ? 420 : readyRoom ? 640 : 760, this.h.w - this.h.safe.left - this.h.safe.right - 32),
      ph = Math.min(
        result ? 360 : form ? (online.panel === 'profile' ? 246 : 284) : readyRoom ? 340 : online.panel === 'ranking' ? 620 : online.panel === 'version' ? 300 : 440,
        this.h.h - this.h.safe.top - this.h.safe.bottom - 28,
      ),
      px = this.h.safe.left + (this.h.w - this.h.safe.left - this.h.safe.right - pw) / 2,
      py = this.h.safe.top + (this.h.h - this.h.safe.top - this.h.safe.bottom - ph) / 2;
    if (form||readyRoom) { const box=this.h.dialog(n, g, { width: pw, height: ph, ...(form?{close:'online:close'}:{}) });px=box.x;py=box.y;pw=box.w;ph=box.h; }
    else this.h.panelFrame(g, px, py, pw, ph, result ? C.amber : C.mint, result ? '#050f1d66' : '#050f1d55', !result && !(online.panel === 'ranking' && ph < 280));
    const label = (str: string, y: number, size = 14, color = C.white) =>
      this.h.label(n, str, px + pw / 2, py + y, size, pw - 40, 26, color);
    const button = (
      id: string,
      caption: string,
      x: number,
      y: number,
      width: number,
      primary = false,
      quiet = false,
      glyph = '',
      disabled = false,
    ) => {
      disabled ||=
        online.busy &&
        ['saveName', 'createConfirm', 'joinConfirm', 'match', 'friend', 'ready'].includes(id);
      const selected =
        primary &&
        (id === 'public' ||
          id === 'private' ||
          id.startsWith('board:') ||
          id.startsWith('category:'));
      const text = this.h.dialogButton(
        n,
        g,
        'online:' + id,
        caption,
        px + x,
        py + y,
        width,
        primary && !selected ? 'primary' : quiet ? (caption ? 'ghost' : 'quiet') : 'secondary',
        glyph,
        44,
        disabled,
      );
      if (selected) {
        text.color = col(C.mint);
        text.isBold = true;
        this.h.rect(g, px + x + 12, py + y + 39, width - 24, 2, C.mint);
      }
      text.fontSize = pw < 600 ? 11 : 13;
      return this.h.buttons[this.h.buttons.length - 1];
    };
    const bottom = ph - 54,
      half = (pw - 44) / 2,
      count =
        online.panel === 'menu'
          ? Math.max(1, Math.min(4, Math.floor((bottom - 141) / 52)))
          : ph < 340
            ? 2
            : 3;
    online.pageSize = count;
    if (online.panel === 'menu')
      online.roomPage = Math.min(
        online.roomPage,
        Math.max(0, Math.ceil(online.rooms.length / count) - 1),
      );
    if (online.panel === 'history')
      online.historyPage = Math.min(
        online.historyPage,
        Math.max(0, Math.ceil((online.history?.matches.length || 0) / count) - 1),
      );
    const titles = {
      menu: ['对战大厅', 'BATTLE LOBBY'],
      chat: ['大厅交流', 'PUBLIC CHAT'],
      players: ['在线玩家', 'ONLINE PLAYERS'],
      friends: ['好友', 'FRIENDS'],
      ranking: ['排行榜', 'RANKINGS'],
      room: ['作战准备室', 'READY ROOM'],
      profile: ['玩家昵称', 'PLAYER NAME'],
      create: ['创建房间', 'CREATE ROOM'],
      join: ['加入房间', 'JOIN ROOM'],
      history: ['对战记录', 'BATTLE RECORDS'],
      version: ['游戏更新', 'GAME UPDATES'],
      '': ['', ''],
    };
    if (!result) {
      const headingW = readyRoom ? pw - 300 : online.panel === 'ranking' ? pw - 294 : pw - 130;
      const heading = this.h.label(
        n,
        text(titles[online.panel], this.h.lang),
        px + 54 + headingW / 2,
        py + 26,
        readyRoom ? 18 : 21,
        headingW,
        32,
      );
      heading.horizontalAlign = Label.HorizontalAlign.LEFT;
      heading.isBold = true;
      this.h.controlIcon(
        g,
        online.panel === 'menu'
          ? 'lobby'
          : online.panel === 'ranking'
            ? 'ranking'
            : online.panel === 'history'
              ? 'history'
              : online.panel === 'version' ? 'refresh' : 'profile',
        px + 31,
        py + 25,
        22,
        C.amber,
      );
    }
    if (!result && online.panel === 'version') {
      const release = online.release;
      const status = online.checkingRelease ? this.h.t('正在检查版本…', 'Checking version…')
        : online.releaseCheckFailed ? this.h.t('检查失败，可稍后重试', 'Check failed. Try again later.')
        : !release ? this.h.t('服务暂未提供版本信息', 'Version information is unavailable.')
        : online.updateNotice ? this.h.t('发现新版本', 'Update available')
        : release.latestBuildId ? this.h.t('已是最新版本', 'You are up to date')
        : this.h.t('当前版本可继续使用', 'This version remains supported.');
      label(status, 64, 16, C.amber);
      const local = (globalThis as any).__COMPETITION_CONFIG__?.release;
      const version = local?.version || this.h.t('版本未知', 'Unknown version');
      const channel = local?.channel || 'H5';
      label(this.h.t('当前版本：', 'Current version: ') + `${version} · ${channel}`, 94, 16, C.white);
      const current = local?.buildId;
      label(this.h.t('构建标识：', 'Build: ') + (current ? current.slice(0, 22) : '—'), 116, 10, C.dim);
      const latest = release?.latestVersion || (release?.latestBuildId && release.latestBuildId === current ? local?.version : undefined);
      label(this.h.t('最新版本：', 'Latest version: ') + (latest ? `${latest} · ${channel}` : this.h.t('暂未获取', 'Unavailable')), 144, 16, latest ? C.white : C.dim);
      label(this.h.t('构建标识：', 'Build: ') + (release?.latestBuildId ? release.latestBuildId.slice(0, 22) : '—'), 166, 10, C.dim);
      if (online.updateNotice && online.releaseIssue) {
        const issue = this.h.t('本次操作需要更新版本，请重新进入游戏后重试。', 'This action needs an update. Reopen the game, then retry.');
        const saved = online.recordSaveStatus === 'failed' ? this.h.t('自动保存失败，请暂勿退出，将自动重试。', 'Auto-save failed. Stay here; saving will retry.')
          : online.recordSaveStatus === 'saved' ? this.h.t('记录已自动保存，待同步内容将在联网后补传。', 'Records saved automatically; pending results will sync online.')
          : this.h.t('正在自动保存记录…', 'Saving records automatically…');
        this.h.controlIcon(g, 'info', px + 32, py + 196, 18, online.recordSaveStatus === 'failed' ? C.red : C.amber);
        this.h.label(n, issue + '\n' + saved, px + pw / 2 + 12, py + 204, pw < 600 ? 11 : 13, pw - 90, 40, online.recordSaveStatus === 'failed' ? C.red : C.dim);
      }
      button('back', this.h.t('返回', 'BACK'), 16, bottom, half, false, true);
      button('releaseCheck', this.h.t('检查版本', 'CHECK FOR UPDATES'), 28 + half, bottom, half, false, false, 'refresh', online.checkingRelease);
      return;
    }
    if (result) {
      const short = ph < 320,
        cramped = ph < 280,
        mid = Math.min(short ? 165 : 205, bottom - 66);
      const ownSeat = online.spectator ? -1 : (online.room?.you ?? 0);
      const outcome = (seat: number) =>
        online.room?.players[seat]?.settlement?.outcome ||
        (seat === ownSeat ? online.room?.settlement?.outcome : undefined) ||
        (online.view?.winner === null
          ? 'draw'
          : online.view?.winner === seat
            ? 'win'
            : online.view?.winner !== undefined
              ? 'loss'
              : '');
      const outcomeText = (value: string) =>
        value === 'win'
          ? this.h.t('胜利', 'WIN')
          : value === 'loss'
            ? this.h.t('失败', 'LOSS')
            : value === 'draw'
              ? this.h.t('平局', 'DRAW')
              : this.h.t('结算中', 'PENDING');
      const outcomeColor = (value: string) =>
        value === 'win' ? '#75db9e' : value === 'loss' ? C.red : C.amber;
      const ownOutcome = outcome(ownSeat);
      if (!cramped)
        this.h.artwork(
          'insignia',
          px + pw / 2 - (short ? 50 : 65),
          py + 12,
          short ? 100 : 130,
          short ? 37 : 48,
        );
      label(
        online.spectator
          ? this.h.t('观战结束', 'MATCH ENDED')
          : this.h.t('战斗', 'BATTLE ') + outcomeText(ownOutcome),
        cramped ? 44 : short ? 70 : 88,
        short ? 28 : 34,
        online.spectator ? C.amber : outcomeColor(ownOutcome),
      ).isBold = true;
      for (let seat = 0; seat < 2; seat++) {
        const player =
            online.room?.players[seat] || (seat === 0 ? online.identity : online.opponent),
          result = outcome(seat);
        label(
          (seat === 0 ? this.h.t('A方', 'SIDE A') : this.h.t('B方', 'SIDE B')) +
            (seat === ownSeat ? this.h.t(' · 你', ' · YOU') : '') +
            ' · ' +
            playerLabel(player) +
            ' · ' +
            outcomeText(result),
          (cramped ? 70 : short ? 99 : 120) + seat * (cramped ? 22 : 23),
          11,
          outcomeColor(result),
        );
      }
      const settlement = online.room?.settlement;
      const cw = (pw - 56) / 2;
      for (let i = 0; i < 2; i++)
        this.h.inset(
          g,
          px + 20 + i * (pw / 2 - 10),
          py + mid - 28,
          pw / 2 - 30,
          86,
          i ? '#ac8e4d99' : '#5b859d99',
        );
      for (let i = 0; i < 2; i++) {
        const cx = px + 28 + cw * (i + 0.5);
        this.h.controlIcon(
          g,
          i ? 'star' : 'time',
          cx - cw * 0.32,
          py + mid + 8,
          26,
          i ? C.amber : C.dim,
        );
        this.h.label(
          n,
          i ? this.h.t('本局积分', 'POINTS EARNED') : this.h.t('作战用时', 'OPERATION TIME'),
          cx + 14,
          py + mid - 14,
          11,
          cw - 40,
          22,
          C.dim,
        );
        this.h.label(
          n,
          i ? (settlement ? '+' + settlement.points : '—') : formatTime(settlement?.durationMs ?? s.time * 1000),
          cx + 14,
          py + mid + 13,
          short ? 24 : 30,
          cw - 40,
          40,
          i ? C.action : C.white,
        ).isBold = true;
        if (i)
          this.h.label(
            n,
            settlement?.totalPoints !== undefined
              ? this.h.t('总积分 ', 'TOTAL ') + settlement.totalPoints
              : online.spectator
                ? this.h.t('观战不计分', 'SPECTATING · NO POINTS')
                : online.room
                  ? this.h.t('积分暂不可用', 'POINTS UNAVAILABLE')
                  : this.h.t('本地练习', 'LOCAL PRACTICE'),
            cx + 14,
            py + mid + 43,
            11,
            cw - 20,
            22,
            C.dim,
          );
      }
      const endNotice=duelEndNotice(settlement);
      if(endNotice)label(this.h.t(...endNotice),bottom-22,11,C.amber);
      this.h.rect(g, px + 32, py + bottom - 7, pw - 64, 1, '#8ba0ab44');
      const bw = Math.min(210, pw - 64);
      button(
        'roomReturn',
        this.h.t('留在房间', 'STAY IN ROOM'),
        (pw - bw) / 2,
        bottom,
        bw,
        true,
        false,
        'back',
      );
      return;
    }
    if (['profile', 'create', 'join'].includes(online.panel)) {
      if (online.panel === 'profile') {
        this.inputField(
          n,
          g,
          'draftName',
          this.h.t('玩家昵称', 'PLAYER NAME'),
          px + 18,
          py + 83,
          pw - 36,
        );
        label(
          this.h.t(
            '2–16个字符，昵称会显示在房间和战绩中',
            '2–16 CHARACTERS · SHOWN IN ROOMS AND RECORDS',
          ),
          151,
          11,
          C.dim,
        );
      } else if (online.panel === 'create') {
        button('public', this.h.t('公开房间', 'PUBLIC'), 18, 65, half, !online.privateRoom);
        button(
          'private',
          this.h.t('好友私密房', 'PRIVATE'),
          26 + half,
          65,
          half,
          online.privateRoom,
        );
        if (online.privateRoom)
          this.inputField(
            n,
            g,
            'draftPassword',
            this.h.t('房间密码', 'PASSWORD'),
            px + 18,
            py + 127,
            pw - 36,
          );
        else
          label(
            this.h.t(
              '房间将显示在大厅，其他玩家可加入',
              'OTHER PILOTS CAN FIND AND JOIN THIS ROOM',
            ),
            151,
            13,
            C.dim,
          );
      } else {
        this.inputField(n, g, 'draftCode', this.h.t('房间号', 'ROOM'), px + 18, py + 73, pw - 36);
        this.inputField(
          n,
          g,
          'draftPassword',
          this.h.t('房间密码', 'PASSWORD'),
          px + 18,
          py + 129,
          pw - 36,
        );
      }
      const failedRequest = online.panel === 'profile' ? /^POST \/me$/
        : online.panel === 'create' ? /^POST .*\/rooms$/ : /^POST .*\/rooms\/join$/;
      const updateHint = online.message && this.releaseFailure(failedRequest);
      label(
        updateHint || online.message ||
          (online.busy
            ? this.h.t('正在处理…', 'PLEASE WAIT…')
            : online.panel === 'create' && online.privateRoom
              ? this.h.t('设置4–64位密码，分享时另行告知好友', 'SET A 4–64 CHARACTER PASSWORD')
              : ''),
        bottom - 24,
        11,
        C.amber,
      );
      button('back', this.h.t('取消', 'CANCEL'), 18, bottom, 100, false, true);
      const versionWidth = Math.min(112, pw - 332);
      if (updateHint && versionWidth >= 44)
        button('version', this.h.t('版本详情', 'VERSION'), (pw - 80 - versionWidth) / 2, bottom, versionWidth);
      button(
        online.panel === 'profile'
          ? 'saveName'
          : online.panel === 'create'
            ? 'createConfirm'
            : 'joinConfirm',
        online.busy ? this.h.t('请稍候…', 'PLEASE WAIT…') : online.panel === 'profile' ? this.h.t('保存昵称', 'SAVE NAME') : online.panel === 'create' ? this.h.t('创建房间', 'CREATE ROOM') : this.h.t('加入房间', 'JOIN ROOM'),
        pw - 198,
        bottom,
        180,
        true,
      );
      return;
    }
    if (online.panel === 'ranking') {
      const solo = online.board === 'clears' || online.board === 'level',
        level = online.board === 'level',
        winRate = online.board === 'win-rate';
      button('category:solo', this.h.t('单人模式', 'SOLO'), pw - 234, 4, 104, solo);
      button('category:duel', this.h.t('对战模式', 'VERSUS'), pw - 122, 4, 104, !solo);
      const tabW = Math.min(140, (pw - 64) / 4);
      const boards = solo
        ? [
            ['clears', this.h.t('通关榜', 'CLEARS')],
            ['level', this.h.t('关卡榜', 'LEVEL')],
          ]
        : [
            ['points', this.h.t('积分榜', 'POINTS')],
            ['win-rate', this.h.t('胜率榜', 'WIN RATE')],
          ];
      boards.forEach(([id, name], i) =>
        button('board:' + id, name, 18 + i * (tabW + 8), 52, tabW, online.board === id),
      );
      const detailX = 34 + 2 * tabW,
        detailW = pw - detailX - 18;
      if (level) {
        button('previous', '', detailX, 52, 44, false, true, 'back', online.level === 0);
        button(
          'next',
          '',
          pw - 62,
          52,
          44,
          false,
          true,
          'next',
          online.level === MISSIONS.length - 1,
        );
      }
      const descriptions = {
        clears: this.h.t('最高通关', 'HIGHEST CLEAR'),
        level: this.h.t(`第 ${online.level + 1} 关`, `LEVEL ${online.level + 1}`),
        points: this.h.t('累计积分', 'TOTAL POINTS'),
        'win-rate': this.h.t('真人对战胜率 · 胜场/总场次', 'HUMAN WIN RATE · WINS/TOTAL'),
      };
      this.h.label(
        n,
        descriptions[online.board],
        px + detailX + detailW / 2,
        py + 74,
        11,
        detailW - (level ? 88 : 0),
        26,
        C.dim,
      );
      const value = (row: NonNullable<Online['ranking']>['top'][number]) =>
        level
          ? formatTime(row.secondary)
          : winRate
            ? Math.round((row.games ? (row.wins || 0) / row.games : row.score) * 1000) / 10 + '%'
            : online.board === 'clears'
              ? this.h.t('第', '') + row.score + this.h.t('关', '')
              : row.score + this.h.t('分', '');
      const metric = (row: NonNullable<Online['ranking']>['top'][number]) =>
        (level
          ? this.h.t('最快 ', 'BEST ')
          : online.board === 'clears'
            ? this.h.t('最高通关 ', 'LEVEL ')
            : online.board === 'points'
              ? this.h.t('积分 ', 'POINTS ')
              : this.h.t('胜率 ', 'WIN RATE ')) + value(row) +
        (winRate && row.wins !== undefined && row.games !== undefined ? ` · ${row.wins}/${row.games}` : '');
      const rows = online.ranking?.top || [],
        rowH = 36,
        vw = pw - 36,
        vh = bottom - 144;
      const mask = this.h.node('RankingViewport', n);
      mask.setPosition(px + pw / 2 - this.h.w / 2, this.h.h / 2 - (py + 104 + vh / 2));
      mask.getComponent(UITransform)!.setContentSize(vw, vh);
      mask.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
      this.h.scrollArea = { x: px + 18, y: py + 104, w: vw, h: vh };
      const content = this.h.node('RankingRows', mask);
      this.h.scrollNode = content;
      const ink = content.addComponent(Graphics),
        originX = this.h.w / 2 - vw / 2,
        originY = this.h.h / 2 - vh / 2;
      rows.forEach((row, i) => {
        const own = playerId(row) === playerId(online.identity),
          y = originY + rowH * (i + 0.5);
        if (own) this.h.plate(ink, originX, y - 16, vw, 32, '#29423c', C.mint, 4);
        else this.h.rect(ink, originX, y + 17, vw, 1, '#8ba0ab22');
        if (row.rank >= 1 && row.rank <= 3) {
          const medal = this.h.node('RankMedal:' + row.rank, content),
            medalInk = medal.addComponent(Graphics);
          medal.setPosition(-vw / 2 + 12, vh / 2 - rowH * (i + 0.5));
          medalInk.strokeColor = col('#6b8499');
          medalInk.lineWidth = 5;
          for (const x of [-4, 4]) {
            medalInk.moveTo(x, -3);
            medalInk.lineTo(x * 1.5, -13);
            medalInk.stroke();
          }
          medalInk.fillColor = col(['#e5b65c', '#c4d5e2', '#ca926c'][row.rank - 1]);
          medalInk.circle(0, 1, 9);
          medalInk.fill();
          medalInk.strokeColor = col('#fff0cf');
          medalInk.lineWidth = 1;
          medalInk.circle(0, 1, 6);
          medalInk.stroke();
        }
        const nameW = vw - 244,
          maxName = Math.max(2, Math.floor((nameW - 95) / 12)),
          name = Array.from(row.nickname || row.name || '飞行员');
        const caption = playerLabel({
          ...row,
          nickname: name.length > maxName ? name.slice(0, maxName).join('') + '…' : name.join(''),
        });
        for (const [captionText, x, width] of [
          [this.h.t('第', 'RANK ') + row.rank + this.h.t('名', ''), 26, 60],
          [caption, 92, nameW],
          [metric(row), vw - 146, 142],
        ] as const) {
          const entryLabel = this.h.label(
            content,
            captionText,
            originX + x + width / 2,
            y,
            12,
            width,
            30,
            own ? C.mint : C.white,
          );
          entryLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
          if (winRate && x === vw - 146) {
            entryLabel.enableWrapText = false;
            entryLabel.overflow = Label.Overflow.SHRINK;
          }
        }
      });
      this.h.scrollMax = Math.max(0, rows.length * rowH - vh);
      if (!rows.length)
        label(
          (online.message && this.releaseFailure(/^GET .*\/leaderboards\//)) || online.message ||
            (online.ranking
              ? this.h.t('暂无成绩，等你创造纪录', 'SET THE FIRST RECORD')
              : this.h.t('正在读取…', 'LOADING…')),
          104 + vh / 2,
          12,
          C.dim,
        );
      const me = online.ranking?.me;
      label(
        me
          ? this.h.t('我的排名 第', 'MY RANK ') + me.rank + this.h.t('名 · ', ' · ') + metric(me)
          : this.h.t('你 · 尚无上榜成绩', 'YOU · NOT YET RANKED'),
        bottom - 24,
        11,
        C.mint,
      );
      button('back', this.h.t('返回', 'BACK'), 18, bottom, 90, false, true, 'back');
      button('refresh', this.h.t('刷新', 'REFRESH'), 114, bottom, 94, false, true, 'refresh');
      if (level)
        button(
          'ruleVersion',
          online.rankingVersion === CAMPAIGN_BOARD_VERSION
            ? this.h.t('当前战区版 ▾', 'CURRENT ▾')
            : online.rankingVersion === 'night-campaign-v3'
              ? this.h.t('旧驻守版 ▾', 'OLD GARRISON ▾')
            : online.rankingVersion === 'night-campaign-v2'
              ? this.h.t('旧梯度版 ▾', 'OLD CAMPAIGN ▾')
            : online.rankingVersion === 'night-growth-v1'
              ? this.h.t('旧成长版 ▾', 'OLD GROWTH ▾')
              : this.h.t('原始历史版 ▾', 'ORIGINAL ▾'),
          pw - 160,
          bottom,
          142,
        );
      else
        this.h.label(
          n,
          this.h.t(`已加载 ${rows.length} 名 · 上下滑动`, `${rows.length} LOADED · SCROLL`),
          px + 216 + (pw - 234) / 2,
          py + bottom + 22,
          11,
          pw - 234,
          26,
          C.dim,
        );
      return;
    }
    if (online.panel === 'history') {
      const summary = online.history?.summary;
      label(
        summary
          ? this.h.t('真人对战 ', 'MATCHES ') +
              summary.games +
              this.h.t(' · 胜 ', ' · W ') +
              summary.wins +
              this.h.t('  负 ', '  L ') +
              summary.losses +
              this.h.t('  平 ', '  D ') +
              summary.draws +
              ' · ' +
              Math.round(summary.winRate * 1000) / 10 +
              '%'
          : this.h.t('仅记录开局双方都是真人的对局', 'HUMAN MATCHES ONLY'),
        63,
        12,
        C.mint,
      );
      const rows = online.history?.matches || [],
        parent = n,
        oldG = g,
        list = this.h.listViewport(
          n,
          'history',
          { x: px + 18, y: py + 85, w: pw - 36, h: bottom - 91 },
          rows.length * 66,
        );
      n = list.n;
      g = list.g;
      rows.forEach((match, i) => {
        const y = 86 + i * 66 - list.offset,
          outcome =
            match.outcome === 'win'
              ? this.h.t('胜利', 'WIN')
              : match.outcome === 'loss'
                ? this.h.t('失败', 'LOSS')
                : this.h.t('平局', 'DRAW');
        this.h.plate(g, px + 18, py + y, pw - 36, 52, '#1c2a2e', C.line, 5);
        this.h.label(
          n,
          outcome +
            ' · ' +
            (match.opponent.nickname || match.opponent.name || '飞行员') +
            '  +' +
            match.points,
          px + pw / 2,
          py + y + 15,
          13,
          pw - 60,
          26,
          match.outcome === 'win' ? '#75db9e' : match.outcome === 'loss' ? C.red : C.amber,
        );
        const date = new Date(match.finishedAt).toLocaleString(
          this.h.lang === 'zh' ? 'zh-CN' : 'en-GB',
          { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' },
        );
        this.h.label(
          n,
          date +
            ' · ' +
            formatTime(match.durationMs) +
            (match.reason === 'disconnect'
              ? this.h.t(' · 掉线结算', ' · DISCONNECT')
              : match.reason === 'abandoned'
                ? this.h.t(' · 双方离开', ' · ABANDONED')
                : ''),
          px + pw / 2,
          py + y + 36,
          10,
          pw - 60,
          22,
          C.dim,
        );
      });
      list.finish();
      n = parent;
      g = oldG;
      if (!rows.length)
        label(
          (online.message && this.releaseFailure(/^GET .*\/history(?:\?|$)/)) || online.message ||
            (online.busy
              ? this.h.t('正在读取…', 'LOADING…')
              : this.h.t('暂无真人对战记录', 'NO HUMAN MATCHES YET')),
          144,
          13,
          C.dim,
        );
      button('back', this.h.t('返回', 'BACK'), 18, bottom, 90, false, true, 'back');
      button('history', this.h.t('刷新', 'REFRESH'), 114, bottom, 94, false, true, 'refresh');
      if (online.history?.nextCursor)
        button(
          'historyMore',
          this.h.t('加载更多', 'LOAD MORE'),
          pw - 150,
          bottom,
          132,
          false,
          true,
          'next',
        );
      return;
    }
    if (online.panel === 'menu') {
      const waiting = online.rooms.filter((room) => room.status === 'waiting').length;
      label(
        online.message ||
          this.h.t('等待中 ', 'WAITING ') +
            waiting +
            this.h.t(' · 对战中 ', ' · PLAYING ') +
            (online.rooms.length - waiting),
        61,
        12,
        C.amber,
      );
      const rows = online.rooms.slice(online.roomPage * count, (online.roomPage + 1) * count);
      rows.forEach((room, i) => {
        const y = 81 + i * 52;
        this.h.rect(g, px + 20, py + y, pw - 40, 48, '#1a2d3944');
        if (this.missionArtwork()[0])
          this.h.coverImage(
            n,
            'RoomTerrain-' + room.code,
            this.missionArtwork()[0],
            px + 24,
            py + y + 5,
            38,
            38,
          );
        else
          this.h.controlIcon(
            g,
            room.canJoin ? 'lobby' : 'mission',
            px + 43,
            py + y + 23,
            22,
            room.canJoin ? C.amber : C.mint,
          );
        const names = room.players
            .map((player) => player.nickname || player.name || '飞行员')
            .join(' / '),
          textW = pw - 176;
        const name = this.h.label(
          n,
          names,
          px + 70 + textW / 2,
          py + y + 14,
          13,
          textW,
          24,
          C.white,
        );
        name.horizontalAlign = Label.HorizontalAlign.LEFT;
        const detail = this.h.label(
          n,
          '#' +
            room.code +
            '  ·  ' +
            room.playerCount +
            '/2  ·  ' +
            (room.status === 'waiting'
              ? room.canJoin
                ? this.h.t('等待加入', 'WAITING')
                : this.h.t('等待开战', 'READY ROOM')
              : this.h.t('对战中', 'IN BATTLE')),
          px + 70 + textW / 2,
          py + y + 35,
          10,
          textW,
          20,
          C.dim,
        );
        detail.horizontalAlign = Label.HorizontalAlign.LEFT;
        button(
          (room.canJoin ? 'joinCode:' : 'watchCode:') + room.code,
          online.opening === room.code
            ? this.h.t('进入中…', 'ENTERING…')
            : room.canJoin
              ? this.h.t('加入', 'JOIN')
              : this.h.t('观战', 'WATCH'),
          pw - 102,
          y + 2,
          82,
          false,
          false,
          '',
          online.busy,
        );
      });
      if (!rows.length) {
        const yy = ph < 280 ? 78 : ph < 340 ? 108 : 144;
        if (ph >= 280) this.h.controlIcon(g, 'lobby', px + pw / 2, py + yy, 34, C.line);
        label(this.h.t('空域待命，等你出发', 'THE SKIES ARE QUIET'), yy + 32, 16, C.white);
        if (ph >= 340)
          label(
            this.h.t(
              '创建房间邀请好友，或先进行人机练习',
              'CREATE A ROOM FOR FRIENDS OR PRACTICE WITH A BOT',
            ),
            yy + 58,
            11,
            C.dim,
          );
      }
      const cw = (pw - 60) / 4;
      for (const [i, [id, name]] of [
        ['friend', this.h.t('创建房间', 'CREATE')],
        ['join', this.h.t('加入房间', 'JOIN ROOM')],
        ['match', this.h.t('随机匹配', 'RANDOM')],
        ['bot', this.h.t('人机对战', 'BOT')],
      ].entries())
        button(
          id,
          name,
          18 + i * (cw + 8),
          bottom - 52,
          cw,
          true,
          false,
          pw >= 660 ? ['plus', 'join', 'match', 'bot'][i] : '',
        );
      this.h.rect(g, px + 20, py + bottom - 4, pw - 40, 1, '#8ba0ab33');
      button('back', this.h.t('返回', 'BACK'), 18, bottom, 82, false, true, 'back');
      button('history', this.h.t('对战记录', 'RECORDS'), 106, bottom, 108, false, true, 'history');
      button(
        online.resumeCode ? 'resumeRoom' : 'roomsRefresh',
        online.resumeCode
          ? this.h.t('重连', 'REJOIN')
          : pw < 500
            ? ''
            : this.h.t('刷新', 'REFRESH'),
        224,
        bottom,
        Math.min(online.resumeCode ? 110 : 80, pw - 382),
        false,
        true,
        online.resumeCode ? '' : 'refresh',
      );
      button('roomPrev', '', pw - 150, bottom, 44, false, false, 'back', online.roomPage === 0);
      button(
        'roomNext',
        '',
        pw - 62,
        bottom,
        44,
        false,
        false,
        'next',
        online.rooms.length <= (online.roomPage + 1) * count,
      );
      this.h.label(
        n,
        `${online.roomPage + 1}/${Math.max(1, Math.ceil(online.rooms.length / count))}`,
        px + pw - 84,
        py + bottom + 22,
        11,
        44,
        24,
        C.dim,
      );
      return;
    }
    const room = online.room;
    this.h.label(n,room?this.h.t('房间 ', 'ROOM ')+room.code:this.h.t('正在连接…','CONNECTING…'),px+pw-155,py+27,15,160,28,C.amber).isBold=true;
    const compact=ph<280,hideTip=ph<230,cardW=(pw-48)/2,cardY=py+(hideTip?58:66),cardH=ph-(hideTip?122:158),single=cardH<68;
    for (let i = 0; i < 2; i++) {
      const player = room?.players[i],
        own = player && playerId(player) === playerId(online.identity),
        cx=px+18+i*(cardW+12),present=!!player&&!player.left;
      this.h.rect(g,cx,cardY,cardW,cardH,present?'#1c3448':'#142638',own?'#6d9aab':'#38546a',9);
      if(!compact){const seat=this.h.label(n,this.h.t(i?'飞行员 B':'飞行员 A',i?'PILOT B':'PILOT A')+(own?this.h.t(' · 你',' · YOU'):''),cx+cardW/2,cardY+19,11,cardW-24,22,C.dim);seat.horizontalAlign=Label.HorizontalAlign.LEFT;}
      if(!single)this.h.controlIcon(g,'profile',cx+27,cardY+(compact?23:54),24,present?C.mint:C.dim);
      const name=this.h.label(n,present?(player!.nickname||player!.name||this.h.t('飞行员','PILOT'))+(compact&&own?this.h.t(' · 你',' · YOU'):''):this.h.t('等待玩家加入','WAITING FOR A PILOT'),single?cx+12+(cardW-78)/2:cx+49+(cardW-62)/2,cardY+(single?cardH/2:compact?22:52),compact?14:16,single?cardW-78:cardW-62,24,present?C.white:C.dim);
      name.horizontalAlign=Label.HorizontalAlign.LEFT;name.enableWrapText=false;name.overflow=Label.Overflow.SHRINK;name.isBold=present;
      if(cardH>=130)this.h.label(n,present?playerTag(playerId(player!)):this.h.t('邀请好友，共同出战','INVITE A FRIEND'),cx+cardW/2,cardY+81,11,cardW-24,22,C.dim);
      const ready=present&&player!.ready&&room?.status==='waiting';
      this.h.label(n,!present?this.h.t('空闲席位','OPEN SEAT'):room?.status==='finished'?this.h.t('本局结束','FINISHED'):ready?this.h.t('✓ 已准备','✓ READY'):this.h.t('等待准备','NOT READY'),single?cx+cardW-33:cx+cardW/2,cardY+(single?cardH/2:cardH-21),single?10:13,single?56:cardW-24,24,ready?C.mint:present?C.amber:C.dim);
    }
    // 收起后回到大厅，房间仍在后台保持；大厅底部的房间条可一键展开。
    if (room?.status === 'waiting') button('roomCollapse', this.h.t('收起', 'HIDE'), pw - 70, 4, 56,false,true);
    const notice=online.message||online.publicChat.status;
    if(hideTip&&notice&&notice!==this.roomNotice){this.h.toast=notice;this.h.toastUntil=Date.now()+6000;}
    this.roomNotice=hideTip?notice:'';
    if(!hideTip)label(
      (online.message && this.releaseFailure(/^POST .*\/rooms\//)) || online.message ||
        (online.publicChat.sending ? this.h.t('正在发送大厅邀请…', 'SENDING INVITE…') : online.publicChat.status) ||
        this.h.t(
          '把房间号告诉好友，双方准备后开始',
          'TELL YOUR FRIEND THE ROOM NUMBER · BOTH READY TO START',
        ),
      bottom - 19,
      11,
      C.dim,
    );
    const cw = Math.min(180, (pw - 52) / 3);
    button('backLobby', this.h.t('离开房间', 'LEAVE'), 18, bottom, cw, false, false, 'back');
    if(room?.status==='finished'&&!online.spectator){button('rematch',this.h.t('再战准备','REMATCH'),pw-18-cw,bottom,cw,true,false,'',online.busy);button('whisper:'+playerId(online.opponent||{}),this.h.t('私信队友','MESSAGE'),26+cw,bottom,cw,false,false,'',!online.socialAvailable);}
    if (room?.status === 'waiting' && !online.spectator) {
      button('chatInvite', this.h.t('大厅邀请', 'INVITE'), 26 + cw, bottom, cw);
      button(
        'ready',
        room.players[room.you]?.ready
          ? this.h.t('取消准备', 'CANCEL READY')
          : this.h.t('准备', 'READY UP'),
        pw - 18 - cw,
        bottom,
        cw,
        !room.players[room.you]?.ready,
      );
    }
  }
}
