import { Graphics, Label, UITransform } from 'cc';
import { TUTORIAL, tutorialText } from './core/Actions';
import { WEAPONS, text } from './core/Data';
import { MISSIONS } from './core/MissionCatalog';
import { SKILLS } from './core/Progression';
import { fitName } from './core/SafeArea';
import type { Simulation } from './core/Simulation';
import { drawEffects } from './Effects';
import { C, col } from './HudTheme';
import { playerLabel } from './Online';
import type { World } from './World';

import type { ButtonRect, HUD } from './HUD';
type BattleStatusViewHost = Pick<
  HUD,
  | 'advert'
  | 'buttonFeedback'
  | 'buttons'
  | 'compact'
  | 'controlScale'
  | 'controlsOpen'
  | 'drawMinimap'
  | 'drawWorld'
  | 'editing'
  | 'effects'
  | 'equipmentOpen'
  | 'exitConfirm'
  | 'fireScale'
  | 'footer'
  | 'g'
  | 'globalControls'
  | 'globalGraphics'
  | 'h'
  | 'helpGroup'
  | 'helpTouch'
  | 'homeArtwork'
  | 'homeBackground'
  | 'isGlobalAction'
  | 'labels'
  | 'label'
  | 'lang'
  | 'layoutEditing'
  | 'lockedTargets'
  | 'marks'
  | 'minimapLayout'
  | 'missionsOpen'
  | 'modalKey'
  | 'online'
  | 'pendingSupply'
  | 'plate'
  | 'progressionArt'
  | 'quartermaster'
  | 'radioText'
  | 'rect'
  | 'reducedEffects'
  | 'renderModal'
  | 'reportOpen'
  | 'rewardsAvailable'
  | 'root'
  | 'safe'
  | 'screenActive'
  | 'set'
  | 'storageError'
  | 'styleButton'
  | 'supplyOpen'
  | 't'
  | 'toast'
  | 'toastUntil'
  | 'toolsOpen'
  | 'touch'
  | 'tutorial'
  | 'unitLabels'
  | 'w'
  | 'zoomOpen'
>;

// 先确定当前面板，再更新控件与战场叠层，保留原来的每帧呈现顺序。
export class BattleStatusView {
  private progressionRevision = '';
  private readonly nameFits = new Map<string, string>();
  private readonly hud: BattleStatusViewHost;
  private readonly layoutCombatControls: () => void;
  private readonly controlTop: () => number;
  constructor(
    hud: BattleStatusViewHost,
    layoutCombatControls: () => void,
    controlTop: () => number,
  ) {
    this.hud = hud;
    this.layoutCombatControls = layoutCombatControls;
    this.controlTop = controlTop;
  }
  update(simulation: Simulation, world: World) {
    if (this.hud.quartermaster && this.hud.progressionArt.homeReady) this.hud.progressionArt.warm();
    this.hud.quartermaster?.tickPresentation();
    if (this.hud.quartermaster) {
      this.hud.quartermaster.syncIdentity();
      const revision = `${this.hud.quartermaster.revision}:${this.hud.online?.revision}:${this.hud.lang}`;
      if (revision !== this.progressionRevision && !this.hud.editing) {
        this.progressionRevision = revision;
        this.hud.modalKey = 'rebuild';
      }
      const page = this.hud.quartermaster.page;
      const frame = this.hud.progressionArt.get(
        page === 'loadout' || page === 'warehouse' || page === 'checkin' || page === 'tasks'
          ? 'hangar'
          : page
            ? 'base'
            : 'home',
      );
      if (frame) this.hud.homeArtwork.spriteFrame = frame;
    } else if (!this.hud.homeArtwork.spriteFrame)
      this.hud.homeArtwork.spriteFrame = this.hud.progressionArt.get('home') || null;
    this.hud.lockedTargets = [];
    this.hud.effects = { impacts: [], projectiles: [] };
    const width = this.hud.w;
    const height = this.hud.h;
    const graphics = this.hud.g;
    const top = this.hud.safe.top;
    const left = 12 + this.hud.safe.left;
    const right = width - this.hud.safe.right - 12;
    const footerTop = height - this.hud.footer - this.hud.safe.bottom;
    this.hud.homeBackground.active =
      simulation.phase === 'briefing' || !!this.hud.quartermaster?.page;
    if (this.hud.homeBackground.active) {
      const background = this.hud.homeBackground.getComponent(Graphics)!;
      background.clear();
      this.hud.rect(background, 0, 0, width, height, '#071522');
      const frame = this.hud.homeArtwork.spriteFrame;
      if (frame) {
        const size = frame.originalSize;
        const scale = Math.max(width / size.width, height / size.height);
        this.hud.homeArtwork.node
          .getComponent(UITransform)!
          .setContentSize(size.width * scale, size.height * scale);
      }
    }
    let key =
      simulation.phase === 'briefing'
        ? this.hud.missionsOpen
          ? 'missions'
          : 'home'
        : simulation.phase === 'playing'
          ? ''
          : simulation.phase;
    if (this.hud.quartermaster?.page) key = 'progression:' + this.hud.quartermaster.page;
    if (this.hud.online?.panel)
      key = `online:${this.hud.online.panel}:${this.hud.online.revision}:${this.hud.lang}`;
    else if (
      simulation.duelMode &&
      this.hud.online?.view?.finished &&
      !this.hud.quartermaster?.page
    )
      key = 'duelResult';
    else if (this.hud.online?.entering) key = 'entering';
    if (this.hud.advert)
      key = `advert:${this.hud.advert.kind}:${this.hud.advert.mock}:${this.hud.lang}`;
    else if (this.hud.exitConfirm) key = 'exit';
    else if (simulation.pauses.has('help'))
      key = 'help:' + this.hud.helpGroup + this.hud.helpTouch + this.hud.lang;
    else if (simulation.pauses.has('mission')) key = 'mission';
    else if (simulation.pauses.has('settings'))
      key = this.hud.toolsOpen
        ? 'settings:flight'
        : this.hud.zoomOpen
          ? 'settings:zoom'
          : this.hud.controlsOpen
            ? 'settings:controls'
            : 'settings';
    else if (simulation.pauses.has('orientation')) key = 'orientation';
    else if (this.hud.supplyOpen) key = this.hud.pendingSupply ? 'supply:choice' : 'supply:offer';
    else if (this.hud.reportOpen && (simulation.phase === 'playing' || key === 'duelResult'))
      key = `report:${this.hud.equipmentOpen ? 'equipment' : 'overview'}:${Math.floor(simulation.time * 2)}`;
    else if (simulation.resumeCountdown > 0)
      key = `countdown:${Math.ceil(simulation.resumeCountdown)}`;
    else if (simulation.paused && simulation.phase !== 'briefing') key = 'pause';
    const editingLayout =
      this.hud.layoutEditing &&
      simulation.phase === 'playing' &&
      Array.from(simulation.pauses).every((reason) => reason === 'settings' || reason === 'manual');
    if (editingLayout) key = '';
    if (this.hud.storageError) key = 'storageError:' + this.hud.storageError;
    this.hud.renderModal(key, simulation, world);
    graphics.clear();
    this.hud.marks.clear();
    this.hud.globalGraphics.clear();
    this.hud.globalControls.setSiblingIndex(this.hud.root.children.length - 1);
    const tracking = simulation.buff?.kind === 'tracking' && simulation.buff.remaining > 0;
    for (const l of this.hud.labels.values()) l.node.active = !key;
    for (const l of this.hud.unitLabels.values()) l.node.active = false;
    for (const button of this.hud.buttons) {
      if (
        this.hud.online?.spectator &&
        (button.id === 'fire' ||
          button.id.startsWith('weapon') ||
          button.id === 'homing' ||
          button.id === 'skillUse')
      ) {
        button.label.node.active = false;
        continue;
      }
      if (
        (button.id.startsWith('weapon') && !simulation.hasWeapon(Number(button.id.slice(6)))) ||
        (button.id === 'skillUse' && !simulation.skillKind)
      ) {
        button.label.node.active = false;
        continue;
      }
      if (simulation.duelMode && ['homing', 'convoy', 'supply', 'mission'].includes(button.id)) {
        button.label.node.active = false;
        continue;
      }
      if (
        button.id === 'homing' &&
        !tracking &&
        !simulation.homingAmmo &&
        !this.hud.rewardsAvailable &&
        !this.hud.pendingSupply
      ) {
        button.label.node.active = false;
        continue;
      }
      if (
        ['supply', 'homingReward', 'supplyWatch', 'zoomUpgrade'].includes(button.id) &&
        !this.hud.rewardsAvailable &&
        !(this.hud.pendingSupply && ['supply', 'supplyWatch'].includes(button.id))
      ) {
        button.label.node.active = false;
        continue;
      }
      if (button.label.node.parent === this.hud.root)
        button.label.node.active =
          !key &&
          button.id !== 'priority' &&
          (button.id !== 'fire' || this.hud.touch || simulation.homingSelected || editingLayout);
      if (editingLayout && ['battleReport', 'sensor'].includes(button.id))
        button.label.node.active = false;
      if (button.id === 'layoutDone') {
        button.label.node.active = editingLayout;
        if (editingLayout) this.hud.styleButton(graphics, button, 'secondary');
        continue;
      }
      if (this.hud.isGlobalAction(button.id)) {
        if(button.id.startsWith('social:'))continue;
        button.label.node.active = !key || key === 'home';
        if (!button.label.node.active) continue;
        const controlCenterX = button.x + button.w / 2 - width / 2;
        const controlCenterY = height / 2 - button.y - button.h / 2;
        const controlGraphics = this.hud.globalGraphics;
        controlGraphics.strokeColor = col(
          !key && world.viewMode === 'enhanced' ? '#123844' : C.white,
        );
        controlGraphics.lineWidth = 2;
        if (button.id === 'screen') {
          for (const dx of [-1, 1])
            for (const dy of [-1, 1]) {
              const r = this.hud.screenActive ? 5 : 12;
              const direction = this.hud.screenActive ? 1 : -1;
              controlGraphics.moveTo(
                controlCenterX + dx * (r + direction * 7),
                controlCenterY + dy * r,
              );
              controlGraphics.lineTo(controlCenterX + dx * r, controlCenterY + dy * r);
              controlGraphics.lineTo(
                controlCenterX + dx * r,
                controlCenterY + dy * (r + direction * 7),
              );
            }
          controlGraphics.stroke();
          continue;
        }
        for (let weaponIndex = 0; weaponIndex < 32; weaponIndex++) {
          const angle = ((weaponIndex + 0.5) * Math.PI) / 16;
          const radius = weaponIndex % 4 === 1 || weaponIndex % 4 === 2 ? 14 : 10.5;
          const x = controlCenterX + Math.cos(angle) * radius;
          const y = controlCenterY + Math.sin(angle) * radius;
          if (weaponIndex) controlGraphics.lineTo(x, y);
          else controlGraphics.moveTo(x, y);
        }
        controlGraphics.close();
        controlGraphics.fillColor = controlGraphics.strokeColor;
        controlGraphics.fill();
        controlGraphics.fillColor = col(
          !key && world.viewMode === 'enhanced' ? '#b9d7dd' : '#122433',
        );
        controlGraphics.circle(controlCenterX, controlCenterY, 5.5);
        controlGraphics.fill();
      }
    }
    if (!key) this.layoutCombatControls();
    this.hud.buttonFeedback();
    const connection = this.hud.labels.get('connectionNotice')!;
    const reconnecting = !!this.hud.online?.reconnecting;
    const peerOnline = !reconnecting && !!this.hud.online?.peerBackOnline;
    connection.string = reconnecting
      ? this.hud.t('网络异常 · 正在重连', 'NETWORK LOST · RECONNECTING')
      : this.hud.online?.offlineNotice || '';
    connection.color = col(peerOnline ? C.mint : C.red);
    // 只在对战进行中提示；结算界面不残留上下线横幅。
    connection.node.active =
      simulation.duelMode && simulation.phase === 'playing' && !!connection.string;
    if (connection.node.active)
      this.hud.plate(
        this.hud.globalGraphics,
        left,
        top + 54,
        Math.min(300, right - left - 140),
        28,
        peerOnline ? '#0f2a24ee' : '#2f1118ee',
        peerOnline ? C.mint : C.red,
        4,
      );
    const toast = this.hud.labels.get('globalToast')!;
    toast.node.active =
      ['missions', 'settings:zoom'].includes(key) &&
      !!this.hud.toast &&
      Date.now() < this.hud.toastUntil;
    toast.string = this.hud.toast;
    if (toast.node.active) {
      const toastWidth = toast.node.getComponent(UITransform)!.contentSize.width;
      this.hud.rect(
        this.hud.globalGraphics,
        toast.node.position.x + width / 2 - toastWidth / 2,
        top + 8,
        toastWidth,
        36,
        C.ink,
      );
    }
    const buff = this.hud.labels.get('buff')!;
    buff.node.active = !key && simulation.phase === 'playing' && simulation.buff?.kind === 'rate';
    if (simulation.buff && buff.node.active) {
      const size = buff.node.getComponent(UITransform)!.contentSize;
      const labelPosition = buff.node.position;
      const name =
        simulation.buff.kind === 'tracking'
          ? this.hud.t('追踪模式', 'TRACKING')
          : this.hud.t('射速提升', 'RATE ×1.3');
      const remaining = Math.ceil(simulation.buff.remaining);
      const tint = simulation.buff.remaining <= 5 ? C.amber : C.mint;
      buff.string =
        name + (size.width < 170 ? '\n' : ' · ') + this.hud.t(`${remaining}秒`, `${remaining}s`);
      buff.color = col(tint);
    }
    if (key) {
      if (['playing', 'success', 'failure'].includes(simulation.phase))
        this.hud.effects = drawEffects(
          this.hud.marks,
          simulation,
          world,
          this.hud.w,
          this.hud.h,
          this.hud.reducedEffects,
        );
      return;
    }
    const gun = simulation.guns[simulation.selected];
    const weapon = WEAPONS[simulation.selected];
    const reason = simulation.reason();
    const danger = simulation.friendlyRisk || simulation.time - simulation.friendHitAt < 2;
    const plane = simulation.aircraft;
    const flightTime = simulation.flightTime();
    const flightText = Number.isFinite(flightTime) ? flightTime.toFixed(1) + 's' : '—';
    const allies = simulation.units.filter((u) => u.friendly).length;
    const bright = world.viewMode === 'enhanced';
    const counts = simulation.duelMode
      ? this.hud.t(
          `友军 ${allies - simulation.friendlyLosses} · 敌军 ${simulation.units.filter((u) => !u.friendly && u.hp > 0).length}`,
          `ALLY ${allies - simulation.friendlyLosses} · HOST ${simulation.units.filter((u) => !u.friendly && u.hp > 0).length}`,
        )
      : this.hud.t(
          `友军 ${allies - simulation.friendlyLosses}/${allies} · 撤离 ${Math.floor(simulation.ratio * 100)}% · 威胁 ${simulation.threatsRemaining}`,
          `ALLY ${allies - simulation.friendlyLosses}/${allies} · EXIT ${Math.floor(simulation.ratio * 100)}% · HOST ${simulation.threatsRemaining}`,
        );
    this.hud.set('health', counts);
    this.hud.labels.get('health')!.color = col(
      !simulation.duelMode && simulation.rescue.hp / simulation.rescue.maxHp < 0.3
        ? bright
          ? '#982536'
          : C.red
        : bright
          ? '#123844'
          : C.white,
    );
    this.hud.labels.get('progress')!.color = col(bright ? '#243c42' : C.dim);
    this.hud.labels.get('status')!.color = col(bright ? '#123844' : C.white);
    this.hud.set(
      'progress',
      simulation.mission.mode === 'training'
        ? this.hud.t(
            `热身清靶 ${simulation.kills}/3 · 友伤 ${Math.round(simulation.friendlyDamage)}`,
            `WARMUP ${simulation.kills}/3 · FRIENDLY ${Math.round(simulation.friendlyDamage)}`,
          )
        : '',
    );
    for (const side of [0, 1]) {
      const label = this.hud.labels.get('spectator:' + side)!;
      label.node.active = simulation.duelMode && !!this.hud.online;
      if (label.node.active) {
        const nameWidth = Math.min(220, (right - left - this.hud.minimapLayout.w - 24) / 2);
        const x = left + side * (nameWidth + 8);
        const tint = side ? '#efb366' : '#7cd4f1';
        const name = playerLabel(this.hud.online!.combatants[side]).split(' #')[0];
        this.hud.rect(graphics, x, top + 49, nameWidth, 28, '#07182788', tint, 4);
        label.node.setPosition(x + nameWidth / 2 - width / 2, height / 2 - top - 63);
        label.node.getComponent(UITransform)!.setContentSize(nameWidth - 14, 24);
        label.fontSize = this.hud.w < 900 ? 12 : 14;
        label.lineHeight = 18;
        label.enableWrapText = false;
        label.overflow = Label.Overflow.CLAMP;
        label.isBold = true;
        label.color = col(tint);
        label.string = this.fitBattleName(label, name, nameWidth - 20);
        label.node.getComponent(UITransform)!.setContentSize(nameWidth - 14, 24);
      }
    }
    if (this.hud.online?.spectator) this.hud.labels.get('progress')!.node.active = false;
    const clock = Math.floor(simulation.time);
    const level =
      simulation.duelMode || simulation.mission.mode === 'training'
        ? 0
        : MISSIONS.findIndex((m) => m.id === simulation.mission.id) + 1;
    this.hud.set(
      'status',
      `${level ? this.hud.t(`${level}关`, `L${level}`) + ' · ' : ''}${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')}`,
    );
    this.hud.set(
      'weaponState',
      this.hud.t(
        `${flightText} 弹着\n${gun.overheated ? '过热 · 冷却至40' : '热量 ' + Math.round(gun.heat) + '%'}`,
        `${flightText} IMPACT\n${gun.overheated ? 'OVERHEATED' : 'HEAT ' + Math.round(gun.heat) + '%'}`,
      ),
    );
    if (simulation.homingSelected)
      this.hud.set(
        'weaponState',
        simulation.homingAmmo <= 0
          ? this.hud.t('点战斗补给', 'OPEN SUPPLY')
          : simulation.homingTarget
            ? this.hud.t('已锁定', 'LOCKED')
            : this.hud.t('点选敌人', 'TAP AN ENEMY'),
      );
    const reasons: Record<string, string[]> = {
      extracting: [
        simulation.extractionRemaining
          ? `停止开火 · 快速撤离 ${Math.ceil(simulation.extractionRemaining)}秒`
          : simulation.shots.length
            ? '车队已抵达 · 正在确认炮弹落点'
            : '车队已抵达 · 等待电台播报结束',
        simulation.extractionRemaining
          ? `CEASE FIRE · EXTRACTING ${Math.ceil(simulation.extractionRemaining)}s`
          : simulation.shots.length
            ? 'CONVOY ARRIVED · RESOLVING SHOTS'
            : 'CONVOY ARRIVED · RADIO REPORT',
      ],
      target: ['点选敌人，再按发射', 'TAP AN ENEMY, THEN LAUNCH'],
      protected: ['保护区 · 禁止开火', 'PROTECTED · FIRE BLOCKED'],
      overheated: ['武器过热 · 等待降温或切枪', 'OVERHEATED · COOL OR SWITCH'],
      empty: ['弹药耗尽 · 切换武器', 'EMPTY · SWITCH WEAPON'],
      outside: ['准星超出关卡区域', 'OUTSIDE LEVEL AREA'],
    };
    let notice = reasons[reason]
      ? text(reasons[reason], this.hud.lang)
      : simulation.rescue.hp / simulation.rescue.maxHp < 0.3
        ? this.hud.t('救援车危急 · 清除附近威胁', 'RESCUE CRITICAL · CLEAR THREATS')
        : simulation.time - simulation.waveAt < 4
          ? text(
              simulation.mission.events[simulation.lastWave]?.direction || ['', ''],
              this.hud.lang,
            )
          : simulation.convoy === 'holding'
            ? this.hud.t('清路后，点击「车队继续」', 'CLEAR THE ROAD, THEN GO')
            : simulation.warning === 'armor'
              ? this.hud.t('重甲抗速射 · 切换重炮', 'ARMOR · SWITCH TO HEAVY')
              : simulation.warning === 'lead'
                ? this.hud.t('预留弹着提前量', 'LEAD THE TARGET')
                : '';
    if (simulation.duelMode)
      notice =
        this.hud.online?.message ||
        this.hud.t(
          '消灭对方全部地面单位 · 菜单不暂停对战',
          'ELIMINATE ALL GROUND UNITS · MENUS DO NOT PAUSE',
        );
    if (simulation.extractionRemaining === undefined && Date.now() < this.hud.toastUntil)
      notice = this.hud.toast;
    this.hud.set('notice', notice || this.hud.radioText);
    if (editingLayout) {
      this.hud.set(
        'notice',
        this.hud.t('拖动按钮调整位置 · 仅本局生效', 'DRAG BUTTONS · THIS MATCH ONLY'),
      );
      this.hud.labels.get('health')!.node.active = this.hud.labels.get('status')!.node.active =
        false;
    }
    this.hud.set(
      'friendWarning',
      danger && simulation.extractionRemaining === undefined
        ? simulation.time - simulation.friendHitAt < 2
          ? this.hud.t('！正在误伤友方 · 停止射击', '! FRIENDLY HIT · CEASE FIRE')
          : this.hud.t('！范围内有友方 · 当心误伤', '! FRIENDLY IN BLAST RADIUS')
        : '',
    );
    const step = TUTORIAL.find((e) => !simulation.completed.has(e));
    this.hud.set(
      'tutorial',
      simulation.duelMode || simulation.extractionRemaining !== undefined
        ? ''
        : simulation.mission.mode === 'training'
          ? this.hud.t('清除 3 个目标', 'CLEAR 3 TARGETS')
          : this.hud.tutorial && step && simulation.time < 12
            ? `${TUTORIAL.indexOf(step) + 1}/${TUTORIAL.length}  ${tutorialText(step, this.hud.lang, this.hud.touch)}`
            : '',
    );
    {
      const messages = ['friendWarning', 'notice', 'tutorial'];
      const active = messages.find((id) => this.hud.labels.get(id)!.string);
      for (const id of messages) this.hud.labels.get(id)!.node.active = id === active;
    }
    for (const id of ['notice', 'friendWarning', 'tutorial']) {
      const label = this.hud.labels.get(id)!;
      const state = this.hud.labels.get('weaponState')!;
      const stateSize = state.node.getComponent(UITransform)!.contentSize;
      const stateCenterY = height / 2 - state.node.position.y;
      const messageCenterY = Math.min(footerTop - 24, this.controlTop() - 22);
      const messageRight =
        Math.abs(stateCenterY - messageCenterY) < stateSize.height / 2 + 14
          ? Math.min(right - 76, state.node.position.x + width / 2 - stateSize.width / 2 - 8)
          : right - 76;
      label.node.setPosition((left + messageRight) / 2 - width / 2, height / 2 - messageCenterY);
      label.node
        .getComponent(UITransform)!
        .setContentSize(
          Math.min(messageRight - left, Math.max(180, label.string.length * label.fontSize + 24)),
          28,
        );
      label.overflow = Label.Overflow.SHRINK;
      if (!label.node.active || !label.string) continue;
      const size = label.node.getComponent(UITransform)!.contentSize;
      const labelPosition = label.node.position;
      this.hud.rect(
        graphics,
        labelPosition.x + width / 2 - size.width / 2,
        height / 2 - labelPosition.y - size.height / 2,
        size.width,
        size.height,
        id === 'friendWarning' ? '#381c26dd' : '#0c171da0',
      );
    }
    for (const button of this.hud.buttons.filter(
      (button) => button.label.node.parent === this.hud.root && button.label.node.active,
    )) {
      if (button.id === 'priority' || button.id === 'layoutDone') continue;
      if (button.id === 'battleReport' || button.id === 'sensor') {
        if (button.id === 'sensor')
          button.label.string = this.hud.t(
            { night: '夜景', enhanced: '增强', thermal: '热像' }[world.viewMode || 'night'],
            { night: 'NIGHT', enhanced: 'ENH', thermal: 'IR' }[world.viewMode || 'night'],
          );
        button.visual = { x: button.x + 2, y: button.y + 8, w: button.w - 4, h: 28 };
        this.hud.rect(
          graphics,
          button.visual.x,
          button.visual.y,
          button.visual.w,
          button.visual.h,
          '#0b192950',
          '#b4e5dd99',
          4,
        );
        button.label.color = col(C.white);
        continue;
      }
      if (button.id === 'homing')
        button.label.string =
          this.hud.t('追踪', 'LOCK') +
          (tracking?'\n':' ') +
          (tracking
            ? this.hud.t(
                `${Math.ceil(simulation.buff!.remaining)}秒`,
                `${Math.ceil(simulation.buff!.remaining)}s`,
              )
            : simulation.homingAmmo || '+');
      const selected =
        (!simulation.homingSelected && button.id === 'weapon' + simulation.selected) ||
        ((simulation.homingSelected || tracking) && button.id === 'homing') ||
        button.id === (plane.direction < 0 ? 'orbitLeft' : 'orbitRight');
      if (button.id.startsWith('weapon')) {
        const weaponIndex = Number(button.id.slice(-1));
        const gunState = simulation.guns[weaponIndex];
        const ready = simulation.weaponReadiness(weaponIndex);
        const compactNames = [
          ['速射', 'AUTO'],
          ['榴弹', 'HE'],
          ['重炮', 'HVY'],
          ['燃烧', 'FIRE'],
        ];
        const name =
          button.w < 100 && weaponIndex < 4
            ? this.hud.t(...(compactNames[weaponIndex] as [string, string]))
            : text(WEAPONS[weaponIndex].name, this.hud.lang);
        const ammo = gunState.ammo === Infinity ? '∞' : String(gunState.ammo);
        const status = ready.empty
          ? this.hud.t('弹尽', 'EMPTY')
          : ready.remaining > 0
            ? ready.displaySeconds.toFixed(1) + 's'
            : '';
        button.label.string = name + ' ' + ammo + (status ? '\n' + status : '');
      }
      if (button.id === 'skillUse') {
        button.label.string =
          (simulation.skillKind === 'tracking'
            ? this.hud.t('追踪', 'TRACK')
            : this.hud.t('电磁干扰', 'EMP')) +
          '\n' +
          (simulation.skillRemaining > 0
            ? this.hud.t('生效 ', 'ACTIVE ') + Math.ceil(simulation.skillRemaining) + 's'
            : simulation.skillCooldown > 0
              ? this.hud.t('冷却 ', 'COOLDOWN ') + Math.ceil(simulation.skillCooldown) + 's'
              : this.hud.t('就绪', 'READY'));
        button.disabled =
          simulation.skillCooldown > 0 ||
          simulation.paused ||
          simulation.extractionRemaining !== undefined;
      }
      if (button.id === 'fire')
        button.label.string =
          reason === 'extracting'
            ? this.hud.t('停火', 'CEASE FIRE')
            : simulation.homingSelected
              ? simulation.homingAmmo <= 0
                ? this.hud.t('无弹药', 'EMPTY')
                : simulation.homingTarget
                  ? this.hud.t('发射', 'LAUNCH')
                  : this.hud.t('待锁定', 'LOCK')
              : simulation.weaponReadiness().empty
                ? this.hud.t('弹尽', 'EMPTY')
                : reason === 'protected'
                  ? this.hud.t('禁射', 'BLOCKED')
                  : reason === 'overheated'
                    ? this.hud.t('冷却', 'COOL')
                    : reason === 'empty'
                      ? this.hud.t('无弹药', 'EMPTY')
                      : this.hud.t('开火', 'FIRE');
      const fire = button.id === 'fire';
      if (
        fire &&
        !simulation.homingSelected &&
        !simulation.weaponReadiness().empty &&
        simulation.weaponReadiness().remaining > 0
      )
        button.label.string += '\n' + simulation.weaponReadiness().displaySeconds.toFixed(1) + 's';
      button.visual = { x: button.x + 2, y: button.y + 5, w: button.w - 4, h: button.h - 10 };
      if (fire) {
        const radius = button.w / 2 - 5;
        const x = button.x + button.w / 2 - width / 2;
        const y = height / 2 - button.y - button.h / 2;
        button.visual = {
          x: button.x + button.w / 2 - radius,
          y: button.y + button.h / 2 - radius,
          w: radius * 2,
          h: radius * 2,
        };
        graphics.fillColor = col(danger ? '#48283266' : '#0b192944');
        graphics.strokeColor = col(danger ? C.red : C.mint);
        graphics.lineWidth = 2;
        graphics.circle(x, y, radius);
        graphics.fill();
        graphics.stroke();
        graphics.lineWidth = 1;
      } else {
        const visualBounds = button.visual;
        this.hud.rect(
          graphics,
          visualBounds.x,
          visualBounds.y,
          visualBounds.w,
          visualBounds.h,
          selected ? '#173b3b70' : '#0b192950',
          selected ? C.mint : '#b4c9cd77',
          4,
        );
        if (selected)
          this.hud.rect(
            graphics,
            visualBounds.x + 8,
            visualBounds.y + visualBounds.h - 2,
            visualBounds.w - 16,
            2,
            C.mint,
          );
      }
      if (button.id.startsWith('weapon'))
        this.cooldownBorder(
          graphics,
          button,
          simulation.weaponReadiness(Number(button.id.slice(-1))).ratio,
        );
      if (fire && !simulation.homingSelected)
        this.cooldownBorder(graphics, button, simulation.weaponReadiness().ratio, true);
      if (button.id === 'skillUse' && simulation.skillKind)
        this.cooldownBorder(
          graphics,
          button,
          Math.min(
            1,
            simulation.skillRemaining > 0
              ? simulation.skillRemaining / SKILLS[simulation.skillKind].duration
              : simulation.skillCooldown / SKILLS[simulation.skillKind].cooldown,
          ),
          false,
          simulation.skillRemaining > 0 ? C.mint : C.amber,
        );
      button.label.color = col(fire && danger ? C.red : selected ? C.mint : C.white);
      button.label.fontSize = fire
        ? 14 * this.hud.fireScale
        : (button.id === 'skillUse' || button.w < 60 ? 11 : this.hud.compact ? 12 : 13) *
          this.hud.controlScale;
      button.label.lineHeight = 15 * (fire ? this.hud.fireScale : this.hud.controlScale);
      button.label.isBold = selected || fire;
      const [title,...statusLines]=button.label.string.split('\n'),detail=statusLines.join('\n');
      if(detail&&!button.detail)button.detail=this.hud.label(button.label.node,'',width/2,height/2,11,button.w-8,18,C.amber);
      button.label.string=title;
      const line=button.label.lineHeight,hasDetail=!!detail;
      button.label.node.setPosition(button.x+button.w/2-width/2,height/2-button.y-button.h/2+(hasDetail?line*.45:0));
      button.label.node.getComponent(UITransform)!.setContentSize(button.w-8,hasDetail?line:button.h-2);
      if(button.detail){
        button.detail.node.active=hasDetail;button.detail.string=detail;
        button.detail.node.setPosition(0,-line*.95);
        button.detail.fontSize=(fire?12:10)*Math.min(1.3,fire?this.hud.fireScale:this.hud.controlScale);
        button.detail.lineHeight=line;button.detail.overflow=Label.Overflow.SHRINK;
        button.detail.node.getComponent(UITransform)!.setContentSize(button.w-8,line);
        const empty=button.id.startsWith('weapon')&&simulation.weaponReadiness(Number(button.id.slice(-1))).empty;
        const tone=button.id==='skillUse'?(simulation.skillRemaining>0?'#83f5a8':simulation.skillCooldown>0?C.amber:'#78ddff')
          :button.id==='homing'&&tracking?(simulation.buff!.remaining<=5?C.amber:C.mint):empty?C.red:C.amber;
        button.detail.color=col(tone);button.detail.isBold=true;
      }
      if (button.id.startsWith('weapon')) {
        const gunState = simulation.guns[Number(button.id.slice(-1))];
        this.hud.rect(
          graphics,
          button.x + 5,
          button.y + button.h - 5,
          ((button.w - 10) * gunState.heat) / 100,
          2,
          gunState.overheated ? C.red : C.amber,
        );
      }
    }
    this.hud.labels.get('priorityMarker')!.node.active = false;
    this.hud.drawWorld(simulation, world);
    this.hud.drawMinimap(simulation);
  }
  private fitBattleName(label: Label, name: string, width: number) {
    // 昵称测量会触发布局更新；相同内容、宽度和字号复用测量结果。
    const key = `${name}:${width}:${label.fontSize}`;
    let fitted = this.nameFits.get(key);
    if (fitted !== undefined) return fitted;
    const measure =
      typeof label.updateRenderData === 'function'
        ? (value: string) => {
            label.overflow = Label.Overflow.NONE;
            label.string = value;
            label.updateRenderData(true);
            return label.node.getComponent(UITransform)!.contentSize.width;
          }
        : undefined;
    fitted = fitName(name, width, label.fontSize, measure);
    label.overflow = Label.Overflow.CLAMP;
    this.nameFits.set(key, fitted);
    return fitted;
  }
  private cooldownBorder(
    graphics: Graphics,
    button: ButtonRect,
    ratio: number,
    circle = false,
    tint = C.amber,
  ) {
    if (ratio <= 0) return;
    const visualBounds = button.visual || button;
    const steps = 48;
    graphics.strokeColor = col(tint);
    graphics.lineWidth = 2.5;
    for (let i = 0; i <= Math.ceil(steps * ratio); i++) {
      const progress = Math.min(ratio, i / steps);
      let x: number;
      let y: number;
      if (circle) {
        const angle = -Math.PI / 2 + progress * Math.PI * 2;
        x = visualBounds.x + visualBounds.w / 2 + (Math.cos(angle) * visualBounds.w) / 2;
        y = visualBounds.y + visualBounds.h / 2 + (Math.sin(angle) * visualBounds.h) / 2;
      } else {
        const distance = progress * (visualBounds.w + visualBounds.h) * 2;
        if (distance <= visualBounds.w) {
          x = visualBounds.x + distance;
          y = visualBounds.y;
        } else if (distance <= visualBounds.w + visualBounds.h) {
          x = visualBounds.x + visualBounds.w;
          y = visualBounds.y + distance - visualBounds.w;
        } else if (distance <= visualBounds.w * 2 + visualBounds.h) {
          x = visualBounds.x + visualBounds.w - (distance - visualBounds.w - visualBounds.h);
          y = visualBounds.y + visualBounds.h;
        } else {
          x = visualBounds.x;
          y = visualBounds.y + visualBounds.h - (distance - visualBounds.w * 2 - visualBounds.h);
        }
      }
      if (i) graphics.lineTo(x - this.hud.w / 2, this.hud.h / 2 - y);
      else graphics.moveTo(x - this.hud.w / 2, this.hud.h / 2 - y);
    }
    graphics.stroke();
    graphics.lineWidth = 1;
  }
}
