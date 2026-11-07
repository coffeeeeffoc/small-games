import type { Simulation } from './core/Simulation';
import { text } from './core/Data';
import { formatTime } from './core/BattleRecords';
import { MISSIONS, CAMPAIGN_BOARD_VERSION } from './core/MissionCatalog';
import type { HUD } from './HUD';
import { C, col } from './HudTheme';
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
import { playerId, playerLabel, type Online } from './Online';
type OnlineHost = Pick<
  HUD,
  | 'artwork'
  | 'button'
  | 'buttons'
  | 'controlIcon'
  | 'coverImage'
  | 'h'
  | 'inset'
  | 'label'
  | 'lang'
  | 'listAreas'
  | 'listScroll'
  | 'listViewport'
  | 'menuButton'
  | 'node'
  | 'online'
  | 'panelFrame'
  | 'plate'
  | 'progressionArt'
  | 'rect'
  | 'safe'
  | 'scrollArea'
  | 'scrollMax'
  | 'scrollNode'
  | 't'
  | 'w'
>;

export class OnlineLobbyView {
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
  private renderLobby(n: Node, initial = false) {
    const o = this.h.online!,
      roomy = this.h.w >= 1000,
      l = this.h.safe.left + 12,
      r = this.h.w - this.h.safe.right - 12,
      top = this.h.safe.top + 56,
      b = this.h.h - this.h.safe.bottom - 12,
      gap = 14,
      lw = (r - l - gap) * 0.44,
      rx = l + lw + gap,
      rw = r - rx,
      inputY = b - 48;
    if (initial) {
      this.lobbySkin(n, 'panel', l, top, lw, b - top);
      this.lobbySkin(n, 'panel', rx, top, rw, b - top);
      this.h.button('online:back', '‹', l, this.h.safe.top + 5, 44, 44, n).fontSize = 31;
      this.h.label(
        n,
        this.h.t('全局大厅', 'GLOBAL LOBBY'),
        l + 145,
        this.h.safe.top + 27,
        25,
        190,
        40,
        C.white,
      ).isBold = true;
      this.h.label(
        n,
        this.h.t('大厅交流', 'LOBBY CHAT'),
        rx + rw * 0.32,
        top + 21,
        19,
        rw * 0.61,
        32,
        C.white,
      ).isBold = true;
      const field = this.h.node('LobbyComposer', n),
        fw = Math.max(90, rw - 142);
      field.active = false;
      field.setPosition(rx + 10 + fw / 2 - this.h.w / 2, this.h.h / 2 - inputY - 22);
      field.getComponent(UITransform)!.setContentSize(fw, 44);
      this.lobbySkin(n, 'panel', rx + 8, inputY, fw + 4, 44);
      field.setSiblingIndex(n.children.length - 1);
      const edit = (this.lobbyComposer = field.addComponent(EditBox));
      edit.textLabel = this.h.label(
        field,
        '',
        this.h.w / 2,
        this.h.h / 2,
        roomy ? 18 : 13,
        fw - 12,
        40,
        C.white,
      );
      edit.placeholderLabel = this.h.label(
        field,
        this.h.t('说点什么…', 'Say something…'),
        this.h.w / 2,
        this.h.h / 2,
        roomy ? 17 : 12,
        fw - 12,
        40,
        C.dim,
      );
      edit.inputMode = EditBox.InputMode.SINGLE_LINE;
      edit.inputFlag = EditBox.InputFlag.DEFAULT;
      edit.maxLength = 240;
      edit.string = o.chatDraft;
      for (const label of [edit.textLabel, edit.placeholderLabel]) {
        label.node.getComponent(UITransform)!.setAnchorPoint(0, 1);
        label.horizontalAlign = Label.HorizontalAlign.LEFT;
        label.verticalAlign = Label.VerticalAlign.CENTER;
      }
      field.on(EditBox.EventType.TEXT_CHANGED, () => {
        o.chatDraft = edit.string;
      });
      field.active = true;
      this.lobbySkin(n, 'blue', r - 122, inputY, 54, 44);
      this.h.button(
        'online:chatInvite',
        this.h.t('邀请', 'INVITE'),
        r - 122,
        inputY,
        54,
        44,
        n,
      ).fontSize = 12;
      this.lobbySkin(n, 'gold', r - 64, inputY, 56, 44);
      this.h.button(
        'online:chatSend',
        this.h.t('发送', 'SEND'),
        r - 64,
        inputY,
        56,
        44,
        n,
      ).fontSize = 14;
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
    this.h.listAreas = this.h.listAreas.filter((a) => !['rooms', 'chat'].includes(a.key));
    const body = (this.lobbyBody = this.h.node('LobbyLiveContent', n)),
      g = this.h.node('Ink', body).addComponent(Graphics);
    this.h.rect(g, r - 200, this.h.safe.top + 13, 200, 28, '#07121cdd');
    this.h.label(body, o.onlineLabel(this.h.lang), r - 100, this.h.safe.top + 27, 14, 200, 28, C.white);
    const btn = (
      id: string,
      caption: string,
      x: number,
      y: number,
      w: number,
      kind = 'blue',
      disabled = false,
      parent = body,
    ) => {
      this.lobbySkin(parent, kind, x, y, w, 44);
      const label = this.h.button('online:' + id, caption, x, y, w, 44, parent);
      label.fontSize = Math.min(14, Math.max(11, w / 6));
      label.isBold = true;
      this.h.buttons.at(-1)!.disabled = disabled;
    };
    const roomTop = top + 8,
      roomBottom = b - 98,
      rowH = this.h.h < 420 ? 112 : 136,
      rooms = o.rooms;
    const roomList = this.h.listViewport(
      body,
      'rooms',
      { x: l + 7, y: roomTop, w: lw - 14, h: Math.max(44, roomBottom - roomTop) },
      rooms.length * (rowH + 8),
    );
    rooms.forEach((room, i) => {
      const y = roomTop + i * (rowH + 8) - roomList.offset;
      if (y + rowH < roomTop || y > roomBottom) return;
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
      btn(
        (room.canJoin ? 'joinCode:' : 'watchCode:') + room.code,
        this.h.t(room.canJoin ? '加入' : '观战', room.canJoin ? 'JOIN' : 'WATCH'),
        l + lw - bw - 18,
        y + (roomy ? (rowH - 44) / 2 : rowH - 45),
        bw,
        room.canJoin ? 'gold' : 'blue',
        !room.canJoin && !room.canSpectate,
        roomList.n,
      );
    });
    roomList.finish();
    if (!rooms.length)
      this.h.label(
        body,
        o.message || this.h.t('暂无公开房间', 'No public rooms'),
        l + lw / 2,
        roomTop + 42,
        14,
        lw - 25,
        70,
        C.dim,
      );
    const ww = (lw - 24) / 2;
    btn(
      o.room ? 'roomReturn' : 'friend',
      this.h.t(o.room ? '返回房间' : '创建房间', o.room ? 'MY ROOM' : 'CREATE'),
      l + 8,
      b - 92,
      ww,
      'gold',
      o.busy,
    );
    btn('join', this.h.t('房号加入', 'JOIN CODE'), l + 16 + ww, b - 92, ww, 'blue', o.busy);
    btn('match', this.h.t('快速匹配', 'MATCH'), l + 8, b - 46, ww, 'blue', o.busy);
    btn('bot', this.h.t('人机练习', 'PRACTICE'), l + 16 + ww, b - 46, ww, 'panel', o.busy);
    const area = { x: rx + 8, y: top + 43, w: rw - 16, h: Math.max(44, inputY - top - 68) },
      messages = o.visibleChat;
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
        (own ? this.h.t('你 · ', 'YOU · ') : '') + m.nickname + '  ' + stamp,
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
      this.h.button('online:chatMenu:' + m.id, '⋮', r - 46, y + 20, 44, 44, chat.n).fontSize = 24;
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
          !m.room.canJoin,
          chat.n,
        );
      }
      if (o.chatMenu === m.id) {
        const menuY = y + 24;
        this.lobbySkin(chat.n, 'panel', r - 146, menuY, 100, 92);
        btn(
          'chatBlock:' + m.playerId,
          this.h.t('屏蔽', 'BLOCK'),
          r - 144,
          menuY,
          96,
          'panel',
          own,
          chat.n,
        );
        btn(
          'chatReport:' + m.id,
          this.h.t('举报', 'REPORT'),
          r - 144,
          menuY + 46,
          96,
          'panel',
          own,
          chat.n,
        );
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
      btn('chatLatest', this.h.t('新消息 ↓', 'NEW ↓'), r - 108, top + 1, 98, 'blue');
    this.h.label(
      body,
      o.chatStatus || this.h.t('文字交流 · 120字 · 发言间隔3秒', 'TEXT · 120 CHARS · 3s INTERVAL'),
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
        this.h.t(`屏蔽(${o.blockedPlayers.size})`, `BLOCKS (${o.blockedPlayers.size})`),
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
    if (this.lobbyComposer && this.lobbyComposer.string !== o.chatDraft)
      this.lobbyComposer.string = o.chatDraft;
    const send = this.h.buttons.find((b) => b.id === 'online:chatSend');
    if (send) {
      send.disabled = !o.chatAvailable || o.chatSending;
      send.label.string = o.chatSending ? this.h.t('发送中', 'SENDING') : this.h.t('发送', 'SEND');
    }
    this.lobbyStamp = `${o.revision}:${o.chatRevision}`;
  }
  renderOnline(n: Node, g: Graphics, s: Simulation, result: boolean) {
    const online = this.h.online!;
    if (online.panel === 'menu' && !result) {
      this.renderLobby(n, true);
      return;
    }
    const pw = Math.min(result ? 560 : 760, this.h.w - this.h.safe.left - this.h.safe.right - 32),
      ph = Math.min(
        result ? 360 : online.panel === 'ranking' ? 620 : 440,
        this.h.h - this.h.safe.top - this.h.safe.bottom - 28,
      ),
      px = (this.h.w - pw) / 2,
      py = (this.h.h - ph) / 2;
    this.h.panelFrame(
      g,
      px,
      py,
      pw,
      ph,
      result ? C.amber : C.mint,
      result ? '#050f1d66' : '#050f1d55',
      !result && !(online.panel === 'ranking' && ph < 280),
    );
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
      const text = this.h.menuButton(
        n,
        g,
        'online:' + id,
        caption,
        px + x,
        py + y,
        width,
        primary && !selected ? 'primary' : quiet ? 'quiet' : 'secondary',
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
      ranking: ['排行榜', 'RANKINGS'],
      room: ['作战准备室', 'READY ROOM'],
      profile: ['玩家昵称', 'PLAYER NAME'],
      create: ['创建房间', 'CREATE ROOM'],
      join: ['加入房间', 'JOIN ROOM'],
      history: ['对战记录', 'BATTLE RECORDS'],
      '': ['', ''],
    };
    if (!result) {
      const headingW = online.panel === 'ranking' ? pw - 294 : pw - 130;
      const heading = this.h.label(
        n,
        text(titles[online.panel], this.h.lang),
        px + 54 + headingW / 2,
        py + 26,
        21,
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
              : 'profile',
        px + 31,
        py + 25,
        22,
        C.amber,
      );
    }
    if (result || !['ranking', 'menu', 'history'].includes(online.panel))
      button('dismiss', '', pw - 58, 4, 44, false, true, 'close');
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
          i ? (settlement ? '+' + settlement.points : '—') : formatTime(s.time * 1000),
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
      this.h.rect(g, px + 32, py + bottom - 7, pw - 64, 1, '#8ba0ab44');
      const bw = Math.min(210, pw - 64);
      button(
        'backLobby',
        this.h.t('返回大厅', 'BACK TO LOBBY'),
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
      label(
        online.message ||
          (online.busy
            ? this.h.t('正在处理…', 'PLEASE WAIT…')
            : online.panel === 'create' && online.privateRoom
              ? this.h.t('设置4–64位密码，分享时另行告知好友', 'SET A 4–64 CHARACTER PASSWORD')
              : ''),
        bottom - 24,
        11,
        C.amber,
      );
      button('back', this.h.t('返回', 'BACK'), 18, bottom, 100, false, true, 'back');
      button(
        online.panel === 'profile'
          ? 'saveName'
          : online.panel === 'create'
            ? 'createConfirm'
            : 'joinConfirm',
        online.busy ? this.h.t('请稍候', 'PLEASE WAIT') : this.h.t('确定', 'CONFIRM'),
        pw - 198,
        bottom,
        180,
        online.panel !== 'profile',
      );
      return;
    }
    if (online.panel === 'ranking') {
      const solo = online.board === 'clears' || online.board === 'level',
        level = online.board === 'level';
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
        'win-rate': this.h.t('真人对战胜率', 'HUMAN WIN RATE'),
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
          : online.board === 'win-rate'
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
              : this.h.t('胜率 ', 'WIN RATE ')) + value(row);
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
          this.h.label(
            content,
            captionText,
            originX + x + width / 2,
            y,
            12,
            width,
            30,
            own ? C.mint : C.white,
          ).horizontalAlign = Label.HorizontalAlign.LEFT;
        }
      });
      this.h.scrollMax = Math.max(0, rows.length * rowH - vh);
      if (!rows.length)
        label(
          online.message ||
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
          online.message ||
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
          room.canJoin ? this.h.t('加入', 'JOIN') : this.h.t('观战', 'WATCH'),
          pw - 102,
          y + 2,
          82,
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
    label(
      room
        ? this.h.t('房间号 ', 'ROOM ') +
            room.code +
            (room.visibility === 'private' ? this.h.t(' · 私密', ' · PRIVATE') : '')
        : online.busy
          ? this.h.t('正在连接…', 'CONNECTING…')
          : '',
      78,
      20,
      C.amber,
    );
    for (let i = 0; i < 2; i++) {
      const player = room?.players[i],
        own = player && playerId(player) === playerId(online.identity),
        y = 117 + i * 34;
      if (own) this.h.plate(g, px + 18, py + y - 14, pw - 36, 30, '#29423c', C.mint, 5);
      label(
        player
          ? playerLabel(player) +
              (own ? this.h.t(' · 你', ' · YOU') : '') +
              ' · ' +
              (player.ready ? this.h.t('已准备', 'READY') : this.h.t('未准备', 'NOT READY'))
          : this.h.t('等待另一位飞行员', 'WAITING FOR ANOTHER PILOT'),
        y,
        13,
        own ? C.mint : C.white,
      );
    }
    label(
      online.message ||
        this.h.t(
          '把房间号告诉好友，双方准备后开始',
          'TELL YOUR FRIEND THE ROOM NUMBER · BOTH READY TO START',
        ),
      bottom - 25,
      11,
      C.dim,
    );
    const cw = Math.min(180, (pw - 52) / 3);
    button('backLobby', this.h.t('离开房间', 'LEAVE'), 18, bottom, cw, false, false, 'back');
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
      );
    }
  }
}
