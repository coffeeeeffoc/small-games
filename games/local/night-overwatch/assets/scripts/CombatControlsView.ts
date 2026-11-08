import { Label, UITransform, sys } from 'cc';
import type { ButtonRect, HUD } from './HUD';
import { C, col } from './HudTheme';
const FIRE_BASE_SIZE = 128;
const movableControls = [
  'weapon0',
  'weapon1',
  'weapon2',
  'weapon3',
  'homing',
  'weapon4',
  'skillUse',
  'weapon5',
];
type ControlPosition = { x: number; y: number };
type CombatControlsHost = Pick<
  HUD,
  | 'button'
  | 'buttons'
  | 'capsuleRect'
  | 'compact'
  | 'controlBounds'
  | 'controlPositions'
  | 'controlScale'
  | 'fireScale'
  | 'footer'
  | 'globalControls'
  | 'h'
  | 'hit'
  | 'labels'
  | 'live'
  | 'minimapLayout'
  | 'mouseDesktop'
  | 'nativeCapsule'
  | 'safe'
  | 'screenControl'
  | 't'
  | 'topRight'
  | 'touch'
  | 'w'
>;

// 归一化拖动位置只保留在本局；尺寸或安全区变化后重新计算像素热区。
export class CombatControlsView {
  controlTop = 0;
  private readonly hud: CombatControlsHost;
  constructor(hud: CombatControlsHost) {
    this.hud = hud;
  }
  controlBounds(id: string) {
    const button = this.hud.buttons.find((button) => button.id === id)!;
    return {
      x: this.hud.safe.left,
      y: this.hud.safe.top,
      w: Math.max(0, this.hud.w - this.hud.safe.left - this.hud.safe.right - button.w),
      h: Math.max(0, this.hud.h - this.hud.safe.top - this.hud.safe.bottom - button.h),
    };
  }
  private positionControl(button: ButtonRect, x: number, y: number, width = button.w) {
    button.x = x;
    button.y = y;
    button.w = width;
    button.visual = { x: x + 2, y: y + 2, w: width - 4, h: button.h - 4 };
    button.label.node.setPosition(
      x + width / 2 - this.hud.w / 2,
      this.hud.h / 2 - y - button.h / 2,
    );
    button.label.node.getComponent(UITransform)!.setContentSize(width - 8, button.h - 2);
    button.label.overflow = Label.Overflow.SHRINK;
  }
  placeControl(id: string, position?: ControlPosition) {
    if (position)
      this.hud.controlPositions[id] = {
        x: Math.max(0, Math.min(1, position.x)),
        y: Math.max(0, Math.min(1, position.y)),
      };
    else delete this.hud.controlPositions[id];
    this.layoutCombatControls();
  }
  controlAt(x: number, y: number) {
    const button = this.hud.hit(x, y, true);
    return button && (movableControls.includes(button.id) || button.id === 'fire')
      ? button
      : undefined;
  }
  private avoidFixedControls(id: string) {
    const button = this.hud.buttons.find((button) => button.id === id)!;
    const bounds = this.hud.controlBounds(id);
    if (!button.label.node.activeInHierarchy) return;
    const fixedControls = this.hud.buttons
      .filter(
        (button) =>
          button.id !== id &&
          !movableControls.includes(button.id) &&
          !button.disabled &&
          button.label.node.activeInHierarchy,
      )
      .map(({ x, y, w: width, h: height }) => ({ x, y, w: width, h: height }));
    if (this.hud.capsuleRect) {
      const capsule = this.hud.capsuleRect;
      fixedControls.push({
        x: capsule.left - 4,
        y: capsule.top - 4,
        w: capsule.right - capsule.left + 8,
        h: capsule.bottom - capsule.top + 8,
      });
    }
    for (const fixed of fixedControls.sort((a, button) => button.x - a.x)) {
      if (
        button.x >= fixed.x + fixed.w ||
        button.x + button.w <= fixed.x ||
        button.y >= fixed.y + fixed.h ||
        button.y + button.h <= fixed.y
      )
        continue;
      const above = fixed.y > this.hud.h / 2 && fixed.y - button.h - 4 >= bounds.y;
      const x = !above && fixed.x - button.w - 4 >= bounds.x ? fixed.x - button.w - 4 : button.x;
      const y = above
        ? fixed.y - button.h - 4
        : x !== button.x
          ? button.y
          : Math.min(bounds.y + bounds.h, fixed.y + fixed.h + 4);
      this.positionControl(button, x, y);
      this.hud.controlPositions[id] = {
        x: (x - bounds.x) / Math.max(1, bounds.w),
        y: (y - bounds.y) / Math.max(1, bounds.h),
      };
    }
  }
  layoutCombatControls() {
    const left = 12 + this.hud.safe.left;
    const right = this.hud.w - 12 - this.hud.safe.right;
    const footerTop = this.hud.h - this.hud.footer - this.hud.safe.bottom;
    const normal = this.hud.buttons.filter((button) =>
      movableControls.slice(0, 5).includes(button.id),
    );
    const support = ['weapon4', 'skillUse', 'weapon5']
      .map((id) => this.hud.buttons.find((button) => button.id === id)!)
      .filter((button) => button.label.node.activeInHierarchy);
    const visible = normal.filter((button) => button.label.node.activeInHierarchy);
    const fire = this.hud.buttons.find((button) => button.id === 'fire')!;
    fire.h = FIRE_BASE_SIZE * this.hud.fireScale;
    this.positionControl(
      fire,
      right - fire.h,
      this.hud.h - this.hud.safe.bottom - fire.h - 10,
      fire.h,
    );
    const cardWidth = Math.min(this.hud.compact ? 64 : 78, (right - left - 146) / 5 - 6);
    let regularWidth = cardWidth;
    let supportWidth = 100;
    if (support.length) {
      const room = fire.x - left - 12;
      const gaps = Math.max(0, visible.length - 1) * 6 + 8 + (support.length - 1) * 6;
      supportWidth = Math.min(
        100,
        Math.max(72, (room - visible.length * cardWidth - gaps) / support.length),
      );
      regularWidth = Math.max(
        44,
        Math.min(
          cardWidth,
          (room - support.length * supportWidth - gaps) / Math.max(1, visible.length),
        ),
      );
    }
    normal.forEach((button, index) =>
      this.positionControl(button, left + index * (cardWidth + 6), footerTop + 8, cardWidth),
    );
    if (support.length)
      visible.forEach((button, index) =>
        this.positionControl(
          button,
          left + index * (regularWidth + 6),
          footerTop + 8,
          regularWidth,
        ),
      );
    const dockX = left + visible.length * (regularWidth + 6) + 2;
    support.forEach((button, index) =>
      this.positionControl(button, dockX + index * (supportWidth + 6), footerTop + 8, supportWidth),
    );
    const controls = [...visible, ...support];
    const controlHeight = Math.max(44, 44 * this.hud.controlScale);
    let nextX = left;
    let rowY = this.hud.h - this.hud.safe.bottom - 8 - controlHeight;
    for (const button of controls) {
      const width = Math.max(44, button.w * this.hud.controlScale);
      if (nextX > left && nextX + width > fire.x - 12) {
        nextX = left;
        rowY -= controlHeight + 6;
      }
      button.h = controlHeight;
      this.positionControl(button, nextX, rowY, width);
      nextX += width + (button.id === 'homing' ? 8 : 6);
    }
    this.controlTop = rowY;
    const state = this.hud.labels.get('weaponState')!;
    const stateWidth = Math.max(60, Math.min(132, right - 68 - (left + 5 * (cardWidth + 6)) - 12));
    const crowded =
      support.length > 0 &&
      dockX + support.length * (supportWidth + 6) - 6 > fire.x - stateWidth - 16;
    state.node.setPosition(
      (crowded ? right - stateWidth / 2 : fire.x - 8 - stateWidth / 2) - this.hud.w / 2,
      this.hud.h / 2 - (crowded ? fire.y - 8 - (this.hud.footer - 14) / 2 : fire.y + fire.h / 2),
    );
    state.node.getComponent(UITransform)!.setContentSize(stateWidth, this.hud.footer - 14);
    for (const id of [...movableControls, 'fire']) {
      const position = this.hud.controlPositions[id];
      if (!position) continue;
      const bounds = this.hud.controlBounds(id);
      const button = this.hud.buttons.find((button) => button.id === id)!;
      this.positionControl(
        button,
        bounds.x + bounds.w * position.x,
        bounds.y + bounds.h * position.y,
      );
      this.avoidFixedControls(id);
    }
    {
      const stateHeight = this.hud.footer - 14;
      const stateCenterY = Math.max(
        this.hud.safe.top,
        Math.min(
          this.hud.h - this.hud.safe.bottom - stateHeight,
          fire.y + (fire.h - stateHeight) / 2,
        ),
      );
      const stateCenterX = Math.max(
        left,
        Math.min(right - stateWidth, fire.x + (fire.w - stateWidth) / 2),
      );
      const candidates = [
        { x: fire.x - 8 - stateWidth, y: stateCenterY },
        { x: fire.x + fire.w + 8, y: stateCenterY },
        { x: stateCenterX, y: fire.y - stateHeight - 8 },
        { x: stateCenterX, y: fire.y + fire.h + 8 },
      ].filter(
        (candidate) =>
          candidate.x >= left &&
          candidate.x + stateWidth <= right &&
          candidate.y >= this.hud.safe.top &&
          candidate.y + stateHeight <= this.hud.h - this.hud.safe.bottom,
      );
      const candidate =
        candidates.find((candidate) =>
          controls.every(
            (button) =>
              candidate.x >= button.x + button.w ||
              candidate.x + stateWidth <= button.x ||
              candidate.y >= button.y + button.h ||
              candidate.y + stateHeight <= button.y,
          ),
        ) || candidates[0];
      if (candidate)
        state.node.setPosition(
          candidate.x + stateWidth / 2 - this.hud.w / 2,
          this.hud.h / 2 - candidate.y - stateHeight / 2,
        );
    }
  }
  buildControls() {
    const width = this.hud.w;
    const height = this.hud.h;
    const left = 12 + this.hud.safe.left;
    const right = width - 12 - this.hud.safe.right;
    const top = this.hud.safe.top;
    const small = this.hud.mouseDesktop;
    const settingsX =
      this.hud.topRight(top + 2, 44) -
      44 -
      (!sys.isBrowser && this.hud.touch && !this.hud.nativeCapsule ? 88 : 0) -
      (this.hud.screenControl ? 52 : 0);
    const sensorX = settingsX - 56;
    const statusX = sensorX - 86;
    const statsX = left + 64;
    this.hud.live(
      'health',
      (statsX + statusX - 6) / 2,
      top + 24,
      this.hud.compact ? 11 : 13,
      Math.max(80, statusX - statsX - 6),
      28,
    );
    this.hud.labels.get('health')!.enableWrapText = false;
    this.hud.labels.get('health')!.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.hud.labels.get('health')!.overflow = Label.Overflow.SHRINK;
    for (const side of [0, 1])
      this.hud.live('spectator:' + side, left + 100 + side * 198, top + 64, 14, 182, 36, C.white);
    this.hud.live('progress', left + 120, top + 58, 11, 240, 20, C.dim);
    this.hud.live('status', statusX + 40, top + 24, 11, 80, 28, C.white);
    this.hud.button('sensor', '', sensorX, top + 2, 50, 44).fontSize = 11;
    this.hud.button('settings', '', settingsX, top + 2, 44, 44, this.hud.globalControls);
    this.hud.button('layoutDone', this.hud.t('完成布局', 'DONE'), width / 2 - 70, top + 2, 140, 44);
    if (this.hud.screenControl)
      this.hud.button('screen', '', settingsX + 52, top + 2, 44, 44, this.hud.globalControls);
    this.hud.live(
      'connectionNotice',
      left + 150,
      top + 68,
      12,
      Math.min(300, right - left - 140),
      28,
      C.red,
    ).node.parent = this.hud.globalControls;
    this.hud.live(
      'buff',
      width / 2,
      top + 61,
      11,
      Math.min(180, width - 200),
      24,
      C.mint,
    ).node.parent = this.hud.globalControls;
    const toastWidth = Math.min(420, settingsX - left - 12);
    this.hud.live(
      'globalToast',
      left + toastWidth / 2,
      top + 26,
      12,
      toastWidth,
      36,
      C.amber,
    ).node.parent = this.hud.globalControls;
    const footerTop = height - this.hud.footer - this.hud.safe.bottom;
    const cardWidth = Math.min(this.hud.compact ? 64 : 78, (right - left - 146) / 5 - 6);
    const fireWidth = FIRE_BASE_SIZE;
    const cardsLeft = left;
    for (let i = 0; i < 4; i++) {
      const label = this.hud.button(
        'weapon' + i,
        '',
        cardsLeft + i * (cardWidth + 6),
        footerTop + 8,
        cardWidth,
        44,
      );
      if (small) {
        label.fontSize = 12;
        label.lineHeight = 17;
      }
    }
    this.hud.button('homing', '', cardsLeft + 4 * (cardWidth + 6), footerTop + 8, cardWidth, 44);
    for (const id of ['weapon4', 'skillUse', 'weapon5'])
      this.hud.button(id, '', left, footerTop + 8, 100, 44);
    this.hud.button(
      'fire',
      '',
      right - fireWidth,
      height - this.hud.safe.bottom - fireWidth - 10,
      fireWidth,
      fireWidth,
    );
    const stateWidth = Math.min(132, right - fireWidth - (left + 5 * (cardWidth + 6)) - 12);
    this.hud.live(
      'weaponState',
      right - fireWidth - 8 - stateWidth / 2,
      height - this.hud.safe.bottom - fireWidth / 2 - 10,
      small ? 12 : this.hud.compact ? 12 : 14,
      Math.max(60, stateWidth),
      this.hud.footer - 14,
      C.dim,
    );
    this.hud.live(
      'notice',
      width / 2,
      footerTop - 17,
      this.hud.compact ? 12 : 15,
      this.hud.compact ? width - 40 : Math.min(width - 260, 560),
      this.hud.compact ? 28 : 36,
      C.amber,
    );
    this.hud.live(
      'friendWarning',
      width / 2,
      footerTop - 17,
      this.hud.compact ? 13 : 16,
      this.hud.compact ? width - 40 : Math.min(width - 260, 560),
      28,
      C.red,
    ).isBold = true;
    this.hud.live(
      'tutorial',
      width / 2,
      footerTop - 17,
      this.hud.compact ? 11 : 13,
      width - 40,
      28,
      C.mint,
    );
    this.hud.live('target', width / 2, footerTop - 45, 12, 156, 24, C.amber);
    this.hud.live('flight', width / 2, height / 2, 12, 130, 24, C.white);
    const priority = this.hud.button('priority', '', 0, 0, 96, 68);
    priority.fontSize = 12;
    priority.color = col(C.red);
    priority.isBold = true;
    this.hud.labels.set('priorityMarker', priority);
    const map = this.hud.minimapLayout;
    this.hud.button('battleReport', this.hud.t('战况', 'REPORT'), left, top + 2, 56, 44).fontSize =
      11;
    this.hud.live('mapLegend', map.x + map.w / 2, map.y + 11, 10, map.w - 4, 20, C.dim);
  }
}
