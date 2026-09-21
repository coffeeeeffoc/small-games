import { BlockInputEvents, EditBox, Graphics, Label, Layers, Node, sys, UITransform } from 'cc';
import { HUD } from './HUD';
import { MultiplayerClient } from './MultiplayerClient';
import { multiplayerVersion } from './MultiplayerProtocol';
import { cycleSelection, drivers, vehicles, type Selection } from './Selection';
import { themes } from './ThemeCatalog';
import { routes } from './RouteCatalog';
import { invitationQuery, platformSharing, type Invitation } from './Invitation';

export class MultiplayerPanel {
  root: Node;
  client: MultiplayerClient;
  name: EditBox;
  code: EditBox;
  status: Label;
  info: Label;
  members: Label;
  private entry: Node;
  private invitation: Node;
  private invitationText: Label;
  pendingInvite?: Invitation;
  private choices: Label[] = [];
  private arrows: Node[] = [];
  private lobby: Node;
  private ready: Label;
  private start: Label;
  private bots: Label;
  private controls: Node;
  private card: Graphics;
  private heading: Label;
  private close: Node;
  openButton: Label;
  constructor(
    hud: HUD,
    client: MultiplayerClient,
    selection: () => Selection,
    clearInput: () => void,
    leave: () => void,
  ) {
    this.client = client;
    this.root = new Node('MultiplayerRoom');
    this.root.layer = Layers.Enum.UI_2D;
    hud.root.addChild(this.root);
    this.root.addComponent(UITransform).setContentSize(960, 540);
    this.root.addComponent(BlockInputEvents);
    hud.box(this.root, 0, 0, 1920, 1080, '#081c3080');
    this.card = hud.box(this.root, 0, 0, 620, 390, '#173b53');
    this.card.node.getComponent(UITransform)!.setContentSize(620, 390);
    this.heading = hud.label(this.root, '好友一起开跑', -35, 150, 26, '#fff6dc', 420, 40);
    const button = (
      parent: Node,
      text: string,
      x: number,
      y: number,
      width: number,
      action: () => void,
    ) => {
      const node = new Node(text);
      node.layer = Layers.Enum.UI_2D;
      parent.addChild(node);
      node.setPosition(x, y);
      node.addComponent(UITransform).setContentSize(width, 42);
      hud.box(node, 0, 0, width, 42, '#ffd15a');
      const label = hud.label(node, text, 0, 0, 19, '#173b53', width, 42);
      node.on(Node.EventType.TOUCH_END, action);
      return label;
    };
    const edit = (
      parent: Node,
      placeholder: string,
      x: number,
      y: number,
      width: number,
      max: number,
    ) => {
      const node = new Node(placeholder);
      node.active = false;
      node.layer = Layers.Enum.UI_2D;
      parent.addChild(node);
      node.setPosition(x, y);
      node.addComponent(UITransform).setContentSize(width, 46);
      hud.box(node, 0, 0, width, 46, '#295870');
      const box = node.addComponent(EditBox);
      const text = hud.label(node, '', 0, 0, 21, '#fff6dc', width - 20, 46);
      const hint = hud.label(node, placeholder, 0, 0, 19, '#a9cdd0', width - 20, 46);
      // EditBox positions its labels from the field's top-left corner.
      for (const label of [text, hint]) {
        label.node.getComponent(UITransform)!.setAnchorPoint(0, 1);
        label.verticalAlign = Label.VerticalAlign.CENTER;
      }
      box.textLabel = text;
      box.placeholderLabel = hint;
      box.placeholder = placeholder;
      box.maxLength = max;
      box.inputMode = EditBox.InputMode.SINGLE_LINE;
      text.verticalAlign = hint.verticalAlign = Label.VerticalAlign.CENTER;
      node.active = true;
      return box;
    };
    this.close = button(this.root, '关闭', 256, 150, 70, () => {
      this.cancelInvite();
      clearInput();
    }).node.parent!;
    this.status = hud.label(this.root, '', 0, -162, 17, '#ffd15a', 560, 44);
    this.entry = new Node('JoinRoom');
    this.entry.layer = Layers.Enum.UI_2D;
    this.root.addChild(this.entry);
    hud.label(this.entry, '选好赛车和车手，邀请好友一起跑', 0, 103, 17, '#d1e9e4', 550, 30);
    this.name = edit(this.entry, '你的昵称', 0, 52, 420, 16);
    this.name.string = '车手';
    try {
      this.name.string = sys.localStorage.getItem('kart-player-name') || '车手';
    } catch {}
    this.code = edit(this.entry, '输入 8 位房间码', 0, -10, 420, 8);
    const join = (create: boolean) => {
      clearInput();
      const selected = selection(),
        name = this.name.string.trim() || '车手';
      try {
        sys.localStorage.setItem('kart-player-name', name);
      } catch {}
      const appearance = {
        name,
        vehicle: selected.vehicle,
        driver: selected.driver,
        version: multiplayerVersion,
      };
      client.connect(
        create
          ? { type: 'create', ...appearance, theme: selected.theme, route: selected.route, bots: 3 }
          : { type: 'join', ...appearance, code: this.code.string.trim().toUpperCase() },
      );
    };
    button(this.entry, '创建房间', -115, -78, 210, () => join(true));
    button(this.entry, '加入好友', 115, -78, 210, () => join(false));
    hud.label(
      this.entry,
      '房间最多 8 辆车 · 机器人数量由房主选择',
      0,
      -124,
      16,
      '#a9cdd0',
      560,
      28,
    );
    this.invitation = new Node('InvitationConfirmation');
    this.invitation.layer = Layers.Enum.UI_2D;
    this.root.addChild(this.invitation);
    this.invitationText = hud.label(this.invitation, '', 0, 40, 22, '#fff6dc', 540, 140);
    this.invitationText.lineHeight = 34;
    button(this.invitation, '暂不加入', -130, -65, 220, () => this.cancelInvite());
    button(this.invitation, '确认加入', 130, -65, 220, () => {
      if (!this.pendingInvite || client.connecting) return;
      if (client.room) client.leave();
      this.code.string = this.pendingInvite.code;
      join(false);
    });
    this.lobby = new Node('RoomLobby');
    this.lobby.layer = Layers.Enum.UI_2D;
    this.root.addChild(this.lobby);
    this.info = hud.label(this.lobby, '', 0, 150, 24, '#69dfc0', 850, 40);
    this.members = hud.label(this.lobby, '', 226, 19, 16, '#fff6dc', 400, 190);
    this.members.lineHeight = 23;
    for (const [i, field] of (['theme', 'route', 'vehicle', 'driver'] as const).entries()) {
      const y = 98 - i * 40;
      this.choices.push(hud.label(this.lobby, '', -205, y, 18, '#fff6dc', 290, 36));
      for (const delta of [-1, 1]) {
        const arrow = button(this.lobby, delta < 0 ? '‹' : '›', -205 + delta * 174, y, 38, () => {
          if (!client.room || client.room.hostId !== client.selfId || client.room.phase !== 'lobby')
            return;
          const { theme, route, vehicle, driver } = cycleSelection(client.room, field, delta);
          client.send({ type: 'selection', theme, route, vehicle, driver });
        });
        this.arrows.push(arrow.node.parent!);
      }
    }
    this.controls = new Node('RoomControls');
    this.controls.layer = Layers.Enum.UI_2D;
    this.lobby.addChild(this.controls);
    this.bots = hud.label(this.controls, '', 0, -99, 20, '#fff6dc', 380, 38);
    button(this.controls, '−', -165, -99, 48, () =>
      client.send({ type: 'bots', count: Math.max(0, (client.room?.bots ?? 0) - 1) }),
    );
    button(this.controls, '+', 165, -99, 48, () =>
      client.send({ type: 'bots', count: Math.min(7, (client.room?.bots ?? 0) + 1) }),
    );
    this.ready = button(this.lobby, '准备', -125, -160, 170, () => {
      const self = client.room?.members.find((m) => m.id === client.selfId);
      if (self?.loadedRevision !== client.room?.revision) {
        client.status = '请等待素材加载完成';
        client.changed();
        return;
      }
      client.send({ type: 'ready', ready: !self?.ready });
    });
    this.start = button(this.lobby, '开始比赛', 70, -160, 170, () =>
      client.send({ type: client.room?.phase === 'finished' ? 'rematch' : 'start' }),
    );
    button(this.lobby, '退出房间', 270, -160, 170, leave);
    button(this.lobby, '邀请好友', -325, -160, 170, () => {
      if (!client.room) return;
      const query = invitationQuery(client.room.code, client.room);
      const platform = platformSharing();
      if (platform) {
        try {
          client.status = platform.share(query)
            ? '请选择好友发送小游戏邀请'
            : '当前平台暂不支持分享，请发送房间码';
        } catch {
          client.status = '分享未打开，请重试';
        }
        client.changed();
        return;
      }
      client.status = `把房间码 ${client.room.code} 发给好友`;
      client.changed();
      if (sys.isBrowser && navigator.clipboard) {
        const url = new URL(location.href);
        url.search = query;
        url.searchParams.set('kartServer', client.endpoint);
        void navigator.clipboard
          .writeText(url.href)
          .then(() => {
            client.status = '邀请链接已复制，发给好友即可';
            client.changed();
          })
          .catch(() => {});
      }
    });
    // Keep the full-screen input shield above the entry button while the dialog is open.
    this.openButton = button(hud.root, '好友联机', -354, 153, 195, () => {
      this.root.active = !this.root.active;
      clearInput();
      this.refresh();
    });
    this.root.setSiblingIndex(hud.root.children.length - 1);
    this.root.active = false;
    client.changed = () => this.refresh();
    this.refresh();
  }
  showInvite(invite: Invitation) {
    if (this.client.room?.code === invite.code) return;
    this.pendingInvite = invite;
    this.root.active = true;
    this.refresh();
  }
  cancelInvite() {
    if (this.pendingInvite && !this.client.room) this.client.leave();
    this.pendingInvite = undefined;
    this.clearInviteUrl();
    this.root.active = false;
    this.refresh();
  }
  clearInviteUrl() {
    if (!sys.isBrowser) return;
    const url = new URL(location.href);
    for (const key of ['room', 'theme', 'route', 'vehicle', 'driver']) url.searchParams.delete(key);
    history.replaceState(null, '', url.href);
  }
  refresh() {
    const client = this.client,
      room = client.room;
    if (room?.code === this.pendingInvite?.code) {
      this.pendingInvite = undefined;
      this.clearInviteUrl();
    }
    this.invitation.active = !!client.endpoint && !!this.pendingInvite;
    this.entry.active = !!client.endpoint && !room && !this.pendingInvite;
    this.lobby.active = !!room && !this.pendingInvite;
    const width = this.lobby.active ? 880 : 620;
    const height = this.lobby.active ? 470 : 390;
    const transform = this.card.node.getComponent(UITransform)!;
    if (transform.width !== width) {
      transform.setContentSize(width, height);
      this.card.clear();
      this.card.roundRect(-width / 2, -height / 2, width, height, 18);
      this.card.fill();
    }
    this.heading.node.setPosition(-35, height / 2 - 45);
    this.close.setPosition(width / 2 - 54, height / 2 - 45);
    if (this.pendingInvite) {
      const invite = this.pendingInvite;
      this.invitationText.string = `${room ? '退出当前房间，加入好友？' : '好友邀请你一起赛车，是否加入？'}\n房间 ${invite.code}\n${themes.find((t) => t.id === invite.selection.theme)?.name} · ${routes.find((r) => r.id === invite.selection.route)?.name}`;
    }
    platformSharing()?.setQuery(room ? invitationQuery(room.code, room) : '');
    this.status.string = client.endpoint
      ? client.status
      : '好友赛暂未开放\n关闭此页即可进行单机竞速';
    this.status.node.setPosition(0, client.endpoint ? -height / 2 + 33 : 0);
    this.openButton.string = room
      ? client.connected
        ? `房间 ${room.code}`
        : '联机已断开'
      : client.endpoint
        ? '好友联机'
        : '好友赛待开放';
    if (!room) return;
    const owner = room.hostId === client.selfId;
    const names = [
      themes.find((t) => t.id === room.theme)?.name,
      routes.find((r) => r.id === room.route)?.name,
      vehicles.find((v) => v[0] === room.vehicle)?.[1],
      drivers.find((d) => d[0] === room.driver)?.[1],
    ];
    this.choices.forEach(
      (label, i) => (label.string = `${['主题', '路线', '赛车', '车手'][i]}  ${names[i]}`),
    );
    this.arrows.forEach((node) => (node.active = owner && room.phase === 'lobby'));
    this.info.string = `房间 ${room.code}  ·  ${room.members.length} 位好友 + ${room.bots} 个机器人`;
    this.members.string = room.members
      .map(
        (m) =>
          `${m.id === room.hostId ? '房主' : '车手'}  ${m.name}${m.id === client.selfId ? '（你）' : ''}  ·  ${!m.connected ? '断线，等待重连' : room.phase !== 'lobby' ? { loading: '装配比赛中', racing: '比赛中', finished: '已结束' }[room.phase] : m.loadedRevision !== room.revision ? '素材加载中' : m.ready ? '已准备' : '未准备'}`,
      )
      .join('\n');
    this.controls.active = owner && room.phase === 'lobby';
    this.bots.string = `${room.bots} 个机器人`;
    this.ready.node.parent!.active = room.phase === 'lobby';
    this.ready.string = room.members.find((m) => m.id === client.selfId)?.ready
      ? '取消准备'
      : '准备';
    this.start.node.parent!.active = owner && (room.phase === 'lobby' || room.phase === 'finished');
    this.start.string = room.phase === 'finished' ? '再开一场' : '开始比赛';
  }
}
