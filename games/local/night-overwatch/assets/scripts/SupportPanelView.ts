import { Graphics, Label, Mask, Node, UITransform } from 'cc';
import { nextZoomLimit } from './core/Rewards';
import type { Simulation } from './core/Simulation';
import { C, col } from './HudTheme';

import type { HUD } from './HUD';
type SupportPanelViewHost = Pick<
  HUD,
  | 'advert'
  | 'button'
  | 'dialog'
  | 'dialogButton'
  | 'online'
  | 'h'
  | 'label'
  | 'modal'
  | 'node'
  | 'panelFrame'
  | 'pendingSupply'
  | 'plate'
  | 'rect'
  | 'safe'
  | 'scrollArea'
  | 'scrollMax'
  | 'scrollNode'
  | 'storageError'
  | 'supplyIcon'
  | 'supplyMessage'
  | 'supplySelection'
  | 't'
  | 'w'
  | 'zoomLimit'
>;

// 这些面板只产生既有按钮 ID；领取、退出和重试仍走控制器的原流程。
export class SupportPanelView {
  private readonly hud: SupportPanelViewHost;
  constructor(hud: SupportPanelViewHost) {
    this.hud = hud;
  }
  renderStorageError(parentNode: Node, graphics: Graphics, simulation: Simulation, key: string) {
    const panelWidth = Math.min(720, this.hud.w - this.hud.safe.left - this.hud.safe.right - 24);
    const panelHeight = Math.min(420, this.hud.h - this.hud.safe.top - this.hud.safe.bottom - 24);
    const panelLeft =
      this.hud.safe.left + (this.hud.w - this.hud.safe.left - this.hud.safe.right - panelWidth) / 2;
    const panelTop =
      this.hud.safe.top + (this.hud.h - this.hud.safe.top - this.hud.safe.bottom - panelHeight) / 2;
    this.hud.panelFrame(
      graphics,
      panelLeft,
      panelTop,
      panelWidth,
      panelHeight,
      C.amber,
      '#071724fa',
    );
    this.hud.label(
      parentNode,
      this.hud.t('行动记录保存失败 · 错误详情', 'RUN STORAGE FAILED · DETAILS'),
      panelLeft + panelWidth / 2,
      panelTop + 23,
      17,
      panelWidth - 28,
      32,
      C.amber,
    ).isBold = true;
    const viewportWidth = panelWidth - 32;
    const viewportHeight = panelHeight - 112;
    const mask = this.hud.node('StorageErrorViewport', parentNode);
    mask.setPosition(
      panelLeft + panelWidth / 2 - this.hud.w / 2,
      this.hud.h / 2 - (panelTop + 48 + viewportHeight / 2),
    );
    mask.getComponent(UITransform)!.setContentSize(viewportWidth, viewportHeight);
    mask.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    const content = this.hud.node('StorageErrorDetails', mask);
    this.hud.scrollNode = content;
    this.hud.scrollArea = {
      x: panelLeft + 16,
      y: panelTop + 48,
      w: viewportWidth,
      h: viewportHeight,
    };
    const rows: string[] = [];
    for (const line of this.hud.storageError.split('\n')) {
      let row = '';
      let units = 0;
      for (const character of line) {
        const unit = character.charCodeAt(0) > 255 ? 2 : 1;
        if (units + unit > Math.floor(viewportWidth / 8.5)) {
          rows.push(row);
          row = '';
          units = 0;
        }
        row += character;
        units += unit;
      }
      rows.push(row);
    }
    rows.forEach((line, i) => {
      const l = this.hud.label(
        content,
        line,
        this.hud.w / 2,
        this.hud.h / 2,
        14,
        viewportWidth,
        22,
        C.white,
      );
      l.horizontalAlign = Label.HorizontalAlign.LEFT;
      l.enableWrapText = false;
      l.node.setPosition(0, viewportHeight / 2 - 11 - i * 22);
    });
    this.hud.scrollMax = Math.max(0, rows.length * 22 - viewportHeight);
    this.hud.button(
      'close',
      this.hud.t('关闭 · 返回重试', 'CLOSE · RETRY'),
      panelLeft + panelWidth / 2 - 92,
      panelTop + panelHeight - 54,
      184,
      44,
      parentNode,
    );
    return;
  }
  renderEntering(parentNode: Node, graphics: Graphics, simulation: Simulation, key: string) {
    const panelWidth = Math.min(480, this.hud.w - 48);
    const panelLeft = (this.hud.w - panelWidth) / 2;
    const panelTop = this.hud.h / 2 - 75;
    this.hud.panelFrame(graphics, panelLeft, panelTop, panelWidth, 150, C.amber, '#050f1d38');
    this.hud.label(
      parentNode,
      this.hud.t('正在进入战区', 'ENTERING THE BATTLEFIELD'),
      this.hud.w / 2,
      panelTop + 54,
      25,
      panelWidth - 30,
      46,
      C.amber,
    ).isBold = true;
    this.hud.label(
      parentNode,
      this.hud.t('火控系统就绪 · 祝行动顺利', 'FIRE CONTROL READY · GOOD HUNTING'),
      this.hud.w / 2,
      panelTop + 105,
      13,
      panelWidth - 30,
      32,
      C.mint,
    );
    return;
  }
  renderCountdown(parentNode: Node, graphics: Graphics, simulation: Simulation, key: string) {
    const x = this.hud.safe.left + (this.hud.w - this.hud.safe.left - this.hud.safe.right) / 2;
    const y = this.hud.safe.top + (this.hud.h - this.hud.safe.top - this.hud.safe.bottom) / 2;
    const r = Math.min(88, (this.hud.h - this.hud.safe.top - this.hud.safe.bottom - 100) / 2);
    this.hud.rect(
      this.hud.modal?.getChildByName('Backdrop')?.getComponent(Graphics) || graphics,
      0,
      0,
      this.hud.w,
      this.hud.h,
      '#05090c55',
    );
    graphics.strokeColor = col('#91e6cb66');
    graphics.lineWidth = 2;
    graphics.circle(x - this.hud.w / 2, this.hud.h / 2 - y, r);
    graphics.stroke();
    this.hud.label(parentNode, key.slice(10), x, y - 14, 72, r * 2, 104, C.mint).isBold = true;
    this.hud.label(
      parentNode,
      this.hud.t('准备继续', 'GET READY'),
      x,
      y + 45,
      18,
      r * 2,
      32,
      C.mint,
    );
    return;
  }
  renderSupply(parentNode: Node, graphics: Graphics, simulation: Simulation, key: string) {
    const choice = this.hud.pendingSupply;
    const panelWidth = Math.min(760, this.hud.w - this.hud.safe.left - this.hud.safe.right - 32);
    const panelHeight = Math.min(320, this.hud.h - this.hud.safe.top - this.hud.safe.bottom - 74);
    const panelLeft =
      this.hud.safe.left + (this.hud.w - this.hud.safe.left - this.hud.safe.right - panelWidth) / 2;
    const panelTop =
      this.hud.safe.top +
      58 +
      (this.hud.h - this.hud.safe.top - this.hud.safe.bottom - 58 - panelHeight) / 2;
    this.hud.panelFrame(graphics, panelLeft, panelTop, panelWidth, panelHeight, C.amber);
    const offers = [
      [
        'tracking',
        this.hud.t('自动追踪', 'AUTO TRACKING'),
        this.hud.t('普通炮弹自动追踪敌人\n持续 60 秒', 'Regular rounds track foes\n60 seconds'),
      ],
      [
        'ammo',
        this.hud.t('追踪弹 +2', 'HOMING +2'),
        this.hud.t('点选敌人，再按开火\n立即补充 2 发', 'Tap an enemy, then FIRE\nAdds 2 rounds'),
      ],
      [
        'rate',
        this.hud.t('射速提升', 'FIRE RATE'),
        this.hud.t('普通炮射速提升 30%\n持续 60 秒', 'Fire rate +30%\n60 seconds'),
      ],
      [
        'restock',
        this.hud.t('弹药补给', 'RESTOCK'),
        this.hud.t('榴弹 +60 · 重炮 +24\n燃烧弹 +6', 'HE +60 · HEAVY +24\nFIRE +6'),
      ],
    ];
    const selected = offers.find(([id]) => id === this.hud.supplySelection)!;
    this.hud.label(
      parentNode,
      this.hud.t('选择战斗支援', 'CHOOSE COMBAT SUPPORT'),
      panelLeft + panelWidth / 2,
      panelTop + 19,
      20,
      panelWidth - 32,
      28,
      C.white,
    ).isBold = true;
    this.hud.label(
      parentNode,
      simulation.buff
        ? this.hud.t('支援已生效，结束后可再次领取', 'SUPPORT ACTIVE · WAIT UNTIL IT ENDS')
        : choice
          ? this.hud.t('支援已获得 · 选择后直接启用', 'SUPPORT EARNED · SELECT AND ACTIVATE')
          : this.hud.t('可选支援 · 完整观看广告后生效', 'OPTIONAL · WATCH A FULL AD TO ACTIVATE'),
      panelLeft + panelWidth / 2,
      panelTop + 43,
      11,
      panelWidth - 32,
      18,
      choice ? C.mint : C.dim,
    );
    const cardWidth = (panelWidth - 56) / 4;
    const cardsTop = panelTop + 58;
    const cardHeight = panelHeight - 138;
    const showIcons = cardHeight >= 136;
    for (const [i, [id, title, detail]] of offers.entries()) {
      const x = panelLeft + 16 + i * (cardWidth + 8);
      const active = id === this.hud.supplySelection;
      this.hud.plate(
        graphics,
        x,
        cardsTop,
        cardWidth,
        cardHeight,
        active ? '#393528' : '#1c2a2e',
        active ? C.amber : C.line,
        3,
      );
      if (showIcons) this.hud.supplyIcon(graphics, id, x + cardWidth / 2, cardsTop + 22);
      const label = this.hud.button(
        'reward:' + id,
        (active ? '✓ ' : '') + title,
        x,
        cardsTop,
        cardWidth,
        cardHeight,
        parentNode,
      );
      label.node.setPosition(
        x + cardWidth / 2 - this.hud.w / 2,
        this.hud.h / 2 - cardsTop - (showIcons ? 50 : 15),
      );
      label.node.getComponent(UITransform)!.setContentSize(cardWidth - 8, 22);
      label.fontSize = panelWidth < 600 ? 12 : 15;
      label.color = col(active ? C.amber : C.white);
      label.isBold = true;
      this.hud.label(
        parentNode,
        detail,
        x + cardWidth / 2,
        cardsTop + (showIcons ? 84 : 43),
        showIcons ? 14 : 11,
        cardWidth - 10,
        showIcons ? 42 : 32,
        C.white,
      );
      if (showIcons)
        this.hud.label(
          parentNode,
          active ? this.hud.t('已选择', 'SELECTED') : this.hud.t('点击选择', 'TAP TO SELECT'),
          x + cardWidth / 2,
          cardsTop + cardHeight - 15,
          11,
          cardWidth - 12,
          20,
          active ? C.amber : C.dim,
        );
    }
    this.hud.label(
      parentNode,
      this.hud.supplyMessage ||
        this.hud.t(
          `已选：${selected[1]} · 启用后立即返回战斗`,
          `${selected[1]} · RESUME IMMEDIATELY`,
        ),
      panelLeft + panelWidth / 2,
      panelTop + panelHeight - 66,
      11,
      panelWidth - 32,
      18,
      this.hud.supplyMessage ? C.red : C.dim,
    );
    const buttonWidth = (panelWidth - 40) * 0.42;
    const y = panelTop + panelHeight - 52;
    this.hud.plate(graphics, panelLeft + 16, y, buttonWidth, 44, '#1c2a2e', C.line, 3);
    const skip = this.hud.button(
      'supplyLater',
      choice
        ? this.hud.t('留到下次，继续战斗', 'SAVE FOR LATER · RESUME')
        : this.hud.t('不使用，继续战斗', 'SKIP · RESUME BATTLE'),
      panelLeft + 16,
      y,
      buttonWidth,
      44,
      parentNode,
    );
    skip.fontSize = panelWidth < 600 ? 11 : 13;
    const actionLeft = panelLeft + 24 + buttonWidth;
    const actionWidth = panelWidth - 40 - buttonWidth;
    this.hud.plate(
      graphics,
      actionLeft,
      y,
      actionWidth,
      44,
      simulation.buff ? '#1c2a2e' : C.amber,
      simulation.buff ? C.line : undefined,
      3,
    );
    const watch = this.hud.button(
      'supplyWatch',
      simulation.buff
        ? this.hud.t('支援生效中', 'SUPPORT ACTIVE')
        : choice
          ? this.hud.t('启用并返回战斗', 'ACTIVATE & RESUME')
          : this.hud.t('看广告并启用', 'WATCH AD & ACTIVATE'),
      actionLeft,
      y,
      actionWidth,
      44,
      parentNode,
    );
    watch.fontSize = panelWidth < 600 ? 13 : 16;
    watch.color = col(simulation.buff ? C.dim : C.action);
    watch.isBold = !simulation.buff;
    return;
  }
  renderPeerOffline(parentNode: Node, graphics: Graphics) {
    const { x, y, w, h } = this.hud.dialog(parentNode, graphics, {
      width: 440, height: 216, title: this.hud.t('对方暂时离线', 'OPPONENT OFFLINE'),
    });
    this.hud.label(parentNode, this.hud.t(
      `还可等待 ${this.hud.online?.peerReconnectSeconds ?? 0} 秒\n期间返回可恢复本人控制，超时由机器人接管。\n战斗继续进行；退出未回归不获收益。`,
      `${this.hud.online?.peerReconnectSeconds ?? 0}s TO RECONNECT\nReturn before the timer ends; otherwise a bot takes over.\nBattle continues. Leaving without returning earns nothing.`,
    ), x + w / 2, y + 96, 13, w - 32, 76, C.dim);
    const bw = (w - 40) / 2;
    this.hud.dialogButton(parentNode, graphics, 'online:peerLeave', this.hud.t('退出房间', 'LEAVE ROOM'), x + 16, y + h - 56, bw);
    this.hud.dialogButton(parentNode, graphics, 'online:peerContinue', this.hud.t('继续对战', 'KEEP PLAYING'), x + 24 + bw, y + h - 56, bw, 'primary');
  }
  renderExit(parentNode: Node, graphics: Graphics, simulation: Simulation, key: string) {
    const panelWidth = Math.min(440, this.hud.w - this.hud.safe.left - this.hud.safe.right - 32);
    const panelHeight = 178;
    const panelLeft =
      this.hud.safe.left + (this.hud.w - this.hud.safe.left - this.hud.safe.right - panelWidth) / 2;
    const panelTop =
      this.hud.safe.top +
      58 +
      (this.hud.h - this.hud.safe.top - this.hud.safe.bottom - 58 - panelHeight) / 2;
    this.hud.panelFrame(graphics, panelLeft, panelTop, panelWidth, panelHeight, C.red);
    this.hud.label(
      parentNode,
      this.hud.t('返回基地？', 'RETURN TO BASE?'),
      panelLeft + panelWidth / 2,
      panelTop + 30,
      22,
      panelWidth - 32,
      34,
    ).isBold = true;
    this.hud.label(
      parentNode,
      simulation.duelMode
        ? this.hud.t(
            '30秒内可返回；超时机器人接管，未回归不获收益。',
            'REJOIN WITHIN 30s. THEN A BOT TAKES OVER; NO REWARD IF YOU DO NOT RETURN.',
          )
        : this.hud.t('将会中断本次游戏并退出。', 'This will end the current battle and exit.'),
      panelLeft + panelWidth / 2,
      panelTop + 76,
      14,
      panelWidth - 32,
      40,
      C.dim,
    );
    const buttonWidth = (panelWidth - 40) / 2;
    for (const [i, id] of ['exitCancel', 'exitConfirm'].entries()) {
      const x = panelLeft + 16 + i * (buttonWidth + 8);
      const y = panelTop + panelHeight - 56;
      this.hud.plate(
        graphics,
        x,
        y,
        buttonWidth,
        44,
        i ? '#382730' : C.amber,
        i ? '#8f4853' : undefined,
        6,
      );
      this.hud.button(
        id,
        i ? this.hud.t('确认退出', 'CONFIRM EXIT') : this.hud.t('继续战斗', 'CONTINUE'),
        x,
        y,
        buttonWidth,
        44,
        parentNode,
      ).color = col(i ? '#ff9b9f' : C.action);
    }
    return;
  }
  renderAdvert(parentNode: Node, graphics: Graphics, simulation: Simulation, key: string) {
    const panelWidth = Math.min(420, this.hud.w - this.hud.safe.left - this.hud.safe.right - 32);
    const panelHeight = Math.min(244, this.hud.h - this.hud.safe.top - this.hud.safe.bottom - 74);
    const panelLeft =
      this.hud.safe.left + (this.hud.w - this.hud.safe.left - this.hud.safe.right - panelWidth) / 2;
    const panelTop =
      this.hud.safe.top +
      58 +
      (this.hud.h - this.hud.safe.top - this.hud.safe.bottom - 58 - panelHeight) / 2;
    this.hud.rect(
      this.hud.modal?.getChildByName('Backdrop')?.getComponent(Graphics) || graphics,
      0,
      0,
      this.hud.w,
      this.hud.h,
      '#05090cb8',
    );
    this.hud.plate(graphics, panelLeft, panelTop, panelWidth, panelHeight, C.ink, C.mint, 10);
    this.hud.label(
      parentNode,
      this.hud.advert?.mock
        ? this.hud.t('模拟广告', 'SIMULATED AD')
        : this.hud.t('广告加载中', 'LOADING AD'),
      panelLeft + panelWidth / 2,
      panelTop + 34,
      24,
      panelWidth - 32,
      42,
      C.white,
    ).isBold = true;
    this.hud.label(
      parentNode,
      this.hud.advert?.kind === 'supply'
        ? this.hud.t(
            '完整观看后启用所选支援，并返回战斗',
            'COMPLETE TO ACTIVATE SUPPORT AND RESUME',
          )
        : this.hud.t(
            `完成后解锁 ${nextZoomLimit(this.hud.zoomLimit)}× 放大上限`,
            `COMPLETE TO UNLOCK ${nextZoomLimit(this.hud.zoomLimit)}× ZOOM`,
          ),
      panelLeft + panelWidth / 2,
      panelTop + 80,
      14,
      panelWidth - 32,
      36,
      C.mint,
    );
    if (this.hud.advert?.mock) {
      const buttonWidth = (panelWidth - 56) / 2;
      const y = panelTop + panelHeight - 76;
      const button = this.hud.button(
        'adClose',
        this.hud.t('完成模拟广告', 'COMPLETE MOCK AD'),
        panelLeft + 24,
        y,
        buttonWidth,
        44,
        parentNode,
      );
      this.hud.plate(graphics, panelLeft + 24, y, buttonWidth, 44, C.mint, undefined, 5);
      button.color = col(C.action);
      button.isBold = true;
      this.hud.plate(
        graphics,
        panelLeft + 32 + buttonWidth,
        y,
        buttonWidth,
        44,
        '#1b3038',
        C.line,
        5,
      );
      this.hud.button(
        'adCancel',
        this.hud.t('取消 · 返回选择', 'CANCEL · GO BACK'),
        panelLeft + 32 + buttonWidth,
        y,
        buttonWidth,
        44,
        parentNode,
      );
    } else
      this.hud.button(
        'adCancel',
        this.hud.t('取消领取', 'CANCEL'),
        panelLeft + 24,
        panelTop + panelHeight - 76,
        panelWidth - 48,
        44,
        parentNode,
      );
    this.hud.label(
      parentNode,
      this.hud.advert?.mock
        ? this.hud.t('本次为网页模拟 · 无需等待', 'WEB SIMULATION · NO WAIT')
        : this.hud.t('完成广告后领取奖励', 'COMPLETE THE AD TO CLAIM'),
      panelLeft + panelWidth / 2,
      panelTop + panelHeight - 17,
      11,
      panelWidth - 32,
      22,
      C.dim,
    );
    return;
  }
}
