import { Graphics, Mask, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { C, col } from './HudTheme';

import type { ButtonRect, HUD } from './HUD';
type HudDrawingHost = Pick<
  HUD,
  | 'artwork'
  | 'button'
  | 'buttons'
  | 'controlIcon'
  | 'gradient'
  | 'h'
  | 'mix'
  | 'modal'
  | 'node'
  | 'plate'
  | 'rect'
  | 'styleButton'
  | 'w'
>;

// 布局使用左上角坐标；在绘制边界统一转换为 Cocos 的中心原点、向上 Y 轴。
export class HudDrawing {
  private readonly hud: HudDrawingHost;
  constructor(hud: HudDrawingHost) {
    this.hud = hud;
  }
  controlIcon(graphics: Graphics, kind: string, x: number, y: number, size = 18, color = C.dim) {
    const centerX = x - this.hud.w / 2;
    const centerY = this.hud.h / 2 - y;
    const iconScale = size / 20;
    const line = (points: number[][], close = false) => {
      points.forEach(([pointX, pointY], pointIndex) =>
        pointIndex
          ? graphics.lineTo(centerX + pointX * iconScale, centerY - pointY * iconScale)
          : graphics.moveTo(centerX + pointX * iconScale, centerY - pointY * iconScale),
      );
      if (close) graphics.close();
      graphics.stroke();
    };
    graphics.strokeColor = col(color);
    graphics.lineWidth = 1.5;
    if (kind === 'close') {
      line([
        [-5, -5],
        [5, 5],
      ]);
      line([
        [5, -5],
        [-5, 5],
      ]);
    } else if (kind === 'back' || kind === 'next')
      line(
        kind === 'back'
          ? [
              [3, -6],
              [-3, 0],
              [3, 6],
            ]
          : [
              [-3, -6],
              [3, 0],
              [-3, 6],
            ],
      );
    else if (kind === 'check') line([[-7, 0], [-2, 5], [8, -6]]);
    else if (kind === 'minus') line([[-7, 0], [7, 0]]);
    else if (kind === 'plus') {
      line([
        [-7, 0],
        [7, 0],
      ]);
      line([
        [0, -7],
        [0, 7],
      ]);
    } else if (kind === 'message') {
      line([[-8, -6], [8, -6], [8, 4], [-2, 4], [-7, 8], [-7, 4], [-8, 4]], true);
    } else if (kind === 'send') {
      line([[-9, -1], [8, -7], [3, 8], [-1, 2]], true);
      line([[-1, 2], [8, -7]]);
    } else if (kind === 'time' || kind === 'history') {
      graphics.circle(centerX, centerY, 8 * iconScale);
      graphics.stroke();
      line([
        [0, -5],
        [0, 0],
        [4, 2],
      ]);
      if (kind === 'time')
        line([
          [-3, -11],
          [3, -11],
        ]);
    } else if (kind === 'star') {
      const points = Array.from({ length: 10 }, (_, pointIndex) => {
        const angle = -Math.PI / 2 + (pointIndex * Math.PI) / 5;
        const radius = pointIndex % 2 ? 4 : 9;
        return [Math.cos(angle) * radius, Math.sin(angle) * radius];
      });
      line(points, true);
    } else if (kind === 'guide') {
      line([
        [0, 7],
        [0, -7],
        [-8, -9],
        [-8, 5],
        [0, 7],
        [8, 5],
        [8, -9],
        [0, -7],
      ]);
    } else if (kind === 'profile') {
      graphics.circle(centerX, centerY + 4 * iconScale, 4 * iconScale);
      graphics.stroke();
      line([
        [-8, 8],
        [-7, 3],
        [-3, 0],
        [3, 0],
        [7, 3],
        [8, 8],
      ]);
    } else if (kind === 'ranking') {
      line([
        [-7, 8],
        [-7, 0],
        [-3, 0],
        [-3, 8],
      ]);
      line([
        [-2, 8],
        [-2, -7],
        [2, -7],
        [2, 8],
      ]);
      line([
        [3, 8],
        [3, -3],
        [7, -3],
        [7, 8],
      ]);
    } else if (kind === 'mission')
      line([
        [-9, -6],
        [-3, -9],
        [3, -6],
        [9, -9],
        [9, 6],
        [3, 9],
        [-3, 6],
        [-9, 9],
        [-9, -6],
        [-3, -9],
        [-3, 6],
        [3, 9],
        [3, -6],
      ]);
    else if (kind === 'lobby') {
      line([
        [-7, 8],
        [6, -8],
        [8, -3],
        [3, -2],
      ]);
      line([
        [7, 8],
        [-6, -8],
        [-8, -3],
        [-3, -2],
      ]);
    } else if (kind === 'sound' || kind === 'muted') {
      line(
        [
          [-8, -3],
          [-4, -3],
          [1, -7],
          [1, 7],
          [-4, 3],
          [-8, 3],
        ],
        true,
      );
      if (kind === 'sound')
        line([
          [5, -5],
          [8, 0],
          [5, 5],
        ]);
      else {
        line([
          [4, -4],
          [10, 4],
        ]);
        line([
          [10, -4],
          [4, 4],
        ]);
      }
    } else if (kind === 'language') {
      graphics.circle(centerX, centerY, 8 * iconScale);
      graphics.stroke();
      line([
        [-8, 0],
        [8, 0],
      ]);
      line([
        [0, -8],
        [-3, -3],
        [-3, 3],
        [0, 8],
        [3, 3],
        [3, -3],
        [0, -8],
      ]);
    } else if (kind === 'effects') {
      line(
        [
          [-9, -7],
          [9, -7],
          [9, 5],
          [-9, 5],
        ],
        true,
      );
      line([
        [0, 5],
        [0, 9],
        [-5, 9],
        [5, 9],
      ]);
    } else if (kind === 'info') {
      graphics.circle(centerX, centerY, 8 * iconScale);graphics.stroke();
      line([[0, -1], [0, 5]]);
      graphics.circle(centerX, centerY + 4 * iconScale, .7 * iconScale);graphics.stroke();
    } else if (kind === 'refresh') {
      line([
        [-7, 1],
        [-7, -4],
        [-3, -7],
        [3, -7],
        [7, -3],
        [7, 0],
      ]);
      line([
        [3, -2],
        [7, 0],
        [9, -4],
      ]);
      line([
        [7, 3],
        [4, 7],
        [-3, 7],
        [-7, 4],
      ]);
    } else if (kind === 'join') {
      line([
        [-2, -8],
        [8, -8],
        [8, 8],
        [-2, 8],
      ]);
      line([
        [-9, 0],
        [3, 0],
        [-1, -4],
      ]);
      line([
        [3, 0],
        [-1, 4],
      ]);
    } else if (kind === 'bot') {
      line(
        [
          [-8, -5],
          [8, -5],
          [8, 7],
          [-8, 7],
        ],
        true,
      );
      line([
        [0, -5],
        [0, -9],
      ]);
      graphics.circle(centerX - 3 * iconScale, centerY, 1.5 * iconScale);
      graphics.circle(centerX + 3 * iconScale, centerY, 1.5 * iconScale);
      graphics.stroke();
    } else if (kind === 'match') {
      line([
        [-8, -5],
        [-4, -5],
        [5, 5],
        [9, 5],
        [6, 2],
      ]);
      line([
        [-8, 5],
        [-4, 5],
        [5, -5],
        [9, -5],
        [6, -8],
      ]);
    }
  }
  styleButton(
    graphics: Graphics,
    button: ButtonRect,
    kind: 'primary' | 'secondary' | 'quiet' | 'ghost' = 'secondary',
    icon = '',
  ) {
    const visualBounds = (button.visual = {
      x: button.x + 2,
      y: button.y + 4,
      w: button.w - 4,
      h: button.h - 8,
    });
    if (kind === 'primary') {
      if (
        !this.hud.artwork(
          'button',
          visualBounds.x,
          visualBounds.y,
          visualBounds.w,
          visualBounds.h,
          button.disabled ? '#75808c99' : undefined,
        )
      )
        this.hud.rect(
          graphics,
          visualBounds.x,
          visualBounds.y,
          visualBounds.w,
          visualBounds.h,
          button.disabled ? '#242d35' : '#4a3d24',
          C.amber,
          3,
        );
    } else if (kind === 'secondary')
      this.hud.rect(
        graphics,
        visualBounds.x,
        visualBounds.y,
        visualBounds.w,
        visualBounds.h,
        button.disabled ? '#14233188' : '#263e50ed',
        button.disabled ? '#72899655' : '#8ba9ba',
        3,
      );
    // Ghost: the low-emphasis footer action still reads as a button beside gold/blue ones.
    else if (kind === 'ghost')
      this.hud.rect(
        graphics,
        visualBounds.x,
        visualBounds.y,
        visualBounds.w,
        visualBounds.h,
        '#14263399',
        button.disabled ? '#7d97a855' : '#7d97a8',
        3,
      );
    button.label.color = col(
      button.disabled ? '#72818a' : kind === 'primary' ? '#fff0d0' : C.white,
    );
    button.label.isBold = kind === 'primary';
    if (icon) {
      this.hud.controlIcon(
        graphics,
        icon,
        button.x + (button.w <= 54 ? button.w / 2 : 20),
        button.y + button.h / 2,
        18,
        button.disabled ? '#72818a' : kind === 'primary' ? C.action : C.dim,
      );
      if (button.w > 54) {
        button.label.node.setPosition(
          button.x + 32 + (button.w - 38) / 2 - this.hud.w / 2,
          this.hud.h / 2 - button.y - button.h / 2,
        );
        button.label.node.getComponent(UITransform)!.setContentSize(button.w - 40, button.h - 4);
      }
    }
  }
  menuButton(
    parentNode: Node,
    graphics: Graphics,
    id: string,
    caption: string,
    x: number,
    y: number,
    width: number,
    kind: 'primary' | 'secondary' | 'quiet' | 'ghost' = 'secondary',
    icon = '',
    height = 44,
    disabled = false,
  ) {
    const label = this.hud.button(id, caption, x, y, width, height, parentNode);
    this.hud.buttons[this.hud.buttons.length - 1].disabled = disabled;
    this.hud.styleButton(graphics, this.hud.buttons[this.hud.buttons.length - 1], kind, icon);
    return label;
  }
  rect(
    graphics: Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    stroke?: string,
    radius = 0,
  ) {
    if (width <= 0 || height <= 0) return;
    const path = () =>
      radius > 0
        ? graphics.roundRect(
            x - this.hud.w / 2,
            this.hud.h / 2 - y - height,
            width,
            height,
            Math.min(radius, width / 2, height / 2),
          )
        : graphics.rect(x - this.hud.w / 2, this.hud.h / 2 - y - height, width, height);
    graphics.fillColor = col(fill);
    path();
    graphics.fill();
    if (stroke) {
      graphics.lineWidth = 1;
      graphics.strokeColor = col(stroke);
      path();
      graphics.stroke();
    }
  }
  image(
    parent: Node,
    name: string,
    frame: SpriteFrame | undefined,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    if (!frame || width <= 0 || height <= 0) return;
    const node = this.hud.node(name, parent);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    node.getComponent(UITransform)!.setContentSize(width, height);
    node.setPosition(x + width / 2 - this.hud.w / 2, this.hud.h / 2 - y - height / 2);
    return sprite;
  }
  coverImage(
    parent: Node,
    name: string,
    frame: SpriteFrame,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    const crop = this.hud.node(name, parent);
    crop.setPosition(x + width / 2 - this.hud.w / 2, this.hud.h / 2 - y - height / 2);
    crop.getComponent(UITransform)!.setContentSize(width, height);
    crop.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    const picture = this.hud.node(name + '-Art', crop);
    const sprite = picture.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    const rect = frame.rect;
    const frameWidth = rect?.width || frame.originalSize.width;
    const frameHeight = rect?.height || frame.originalSize.height;
    const scale = Math.max(width / frameWidth, height / frameHeight);
    picture.getComponent(UITransform)!.setContentSize(frameWidth * scale, frameHeight * scale);
    return crop;
  }
  artOverlay(parent: Node, name: string) {
    return this.hud.node(name, parent).addComponent(Graphics);
  }
  mix(startColor: string, endColor: string, amount: number) {
    const channels = (value: string) =>
      [1, 3, 5, 7].map((offset) => parseInt(value.slice(offset, offset + 2) || 'ff', 16));
    return (
      '#' +
      channels(startColor)
        .map((value, index) =>
          Math.round(value + (channels(endColor)[index] - value) * amount)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    );
  }
  gradient(
    graphics: Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    top: string,
    bottom: string,
    cut = 0,
    steps = 12,
  ) {
    for (let i = 0; i < steps; i++) {
      const stripTop = (height * i) / steps;
      const stripBottom = (height * (i + 1)) / steps;
      const inset = (v: number) => Math.max(0, cut - v, cut - (height - v));
      graphics.fillColor = col(this.hud.mix(top, bottom, (i + 0.5) / steps));
      graphics.moveTo(x + inset(stripTop) - this.hud.w / 2, this.hud.h / 2 - y - stripTop);
      graphics.lineTo(x + width - inset(stripTop) - this.hud.w / 2, this.hud.h / 2 - y - stripTop);
      graphics.lineTo(
        x + width - inset(stripBottom) - this.hud.w / 2,
        this.hud.h / 2 - y - stripBottom,
      );
      graphics.lineTo(x + inset(stripBottom) - this.hud.w / 2, this.hud.h / 2 - y - stripBottom);
      graphics.close();
      graphics.fill();
    }
  }
  chamferPath(graphics: Graphics, x: number, y: number, width: number, height: number, cut: number) {
    const left = x - this.hud.w / 2, right = left + width;
    const top = this.hud.h / 2 - y, bottom = top - height;
    graphics.moveTo(left + cut, top);
    graphics.lineTo(right - cut, top);
    graphics.lineTo(right, top - cut);
    graphics.lineTo(right, bottom + cut);
    graphics.lineTo(right - cut, bottom);
    graphics.lineTo(left + cut, bottom);
    graphics.lineTo(left, bottom + cut);
    graphics.lineTo(left, top - cut);
    graphics.close();
  }
  plate(
    graphics: Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    stroke = C.line,
    cut = 7,
  ) {
    if (width <= 0 || height <= 0) return;
    const gold = fill === C.amber;
    const active = fill === C.mint || stroke === C.mint;
    const emphasis = gold || fill === C.mint;
    if (emphasis) stroke = gold ? C.amber : C.mint;
    cut = Math.min(cut, width / 5, height / 4);
    const path = (inset = 0, dy = 0) =>
      this.chamferPath(graphics, x + inset, y + inset - dy, width - 2 * inset, height - 2 * inset, Math.max(2, cut - inset));
    const skinned =
      gold &&
      graphics.node.parent === this.hud.modal &&
      this.hud.artwork('button', x + 2, y + 2, width - 4, height - 4);
    if (!skinned) {
      graphics.fillColor = col('#01070cb0');
      path(0, -3);
      graphics.fill();
    }
    if (!skinned)
      this.hud.gradient(
        graphics,
        x,
        y,
        width,
        height,
        gold ? '#b88c3cf2' : fill === '#382730' ? '#492c37' : active ? '#244b65ed' : '#20384aed',
        gold ? '#443018fa' : fill === '#382730' ? '#21111d' : '#07121ff2',
        cut,
        height > 90 ? 16 : 8,
      );
    if (gold) {
      graphics.lineWidth = 5;
      graphics.strokeColor = col('#f3c36624');
      path();
      graphics.stroke();
      graphics.lineWidth = 3;
      graphics.strokeColor = col('#ffe2a04d');
      path();
      graphics.stroke();
    }
    graphics.lineWidth = gold ? 1.5 : 1;
    graphics.strokeColor = col(stroke);
    path();
    graphics.stroke();
    graphics.strokeColor = col(gold ? '#ffe8ada0' : '#a5cbe229');
    path(2);
    graphics.stroke();
    this.hud.rect(
      graphics,
      x + cut + 3,
      y + 3,
      width - cut * 2 - 6,
      1,
      gold ? '#ffe2a0a0' : '#d3e9f34d',
    );
    this.hud.rect(graphics, x + cut + 3, y + height - 3, width - cut * 2 - 6, 1, '#010812a0');
    if (gold) {
      for (const side of [-1, 1]) {
        const centerX = x + (side < 0 ? 9 : width - 9) - this.hud.w / 2;
        const centerY = this.hud.h / 2 - y - height / 2;
        graphics.strokeColor = col('#efd39388');
        graphics.lineWidth = 1;
        graphics.moveTo(centerX - side * 2, centerY + 3);
        graphics.lineTo(centerX, centerY);
        graphics.lineTo(centerX - side * 2, centerY - 3);
        graphics.stroke();
      }
    }
  }
  inset(graphics: Graphics, x: number, y: number, width: number, height: number, accent = C.line) {
    this.hud.gradient(graphics, x, y, width, height, '#030c17f2', '#1a3041ed', 3, 12);
    graphics.strokeColor = col('#02070de6');
    graphics.lineWidth = 2;
    graphics.rect(x - this.hud.w / 2, this.hud.h / 2 - y - height, width, height);
    graphics.stroke();
    graphics.strokeColor = col(accent);
    graphics.lineWidth = 1;
    graphics.rect(x + 2 - this.hud.w / 2, this.hud.h / 2 - y - height + 2, width - 4, height - 4);
    graphics.stroke();
    this.hud.rect(graphics, x + 7, y + height - 1, width - 14, 1, '#aec8d047');
    this.hud.rect(graphics, x + 8, y + 6, 18, 2, accent);
  }
  emblem(graphics: Graphics, x: number, y: number, radius: number, color = C.amber) {
    const centerX = x - this.hud.w / 2;
    const centerY = this.hud.h / 2 - y;
    graphics.strokeColor = col(color);
    graphics.lineWidth = 1.5;
    graphics.circle(centerX, centerY, radius * 0.8);
    graphics.stroke();
    for (const side of [-1, 1])
      for (let i = 0; i < 3; i++) {
        graphics.fillColor = col(this.hud.mix(color, '#142231', 0.15 + i * 0.16));
        graphics.moveTo(centerX + side * radius * 0.7, centerY + radius * 0.15 - i * 5);
        graphics.lineTo(centerX + side * (radius * 1.6 - i * 5), centerY + radius * 0.15 - i * 5);
        graphics.lineTo(centerX + side * (radius * 1.4 - i * 5), centerY - radius * 0.02 - i * 5);
        graphics.lineTo(centerX + side * radius * 0.65, centerY - radius * 0.02 - i * 5);
        graphics.close();
        graphics.fill();
      }
    graphics.fillColor = col(color);
    for (let i = 0; i < 8; i++) {
      const angle = Math.PI / 2 + (i * Math.PI) / 4;
      const r = i % 2 ? radius * 0.25 : radius;
      const panelLeft = centerX + Math.cos(angle) * r;
      const panelTop = centerY + Math.sin(angle) * r;
      if (i) graphics.lineTo(panelLeft, panelTop);
      else graphics.moveTo(panelLeft, panelTop);
    }
    graphics.close();
    graphics.fill();
    graphics.fillColor = col('#fff1ca');
    graphics.moveTo(centerX, centerY + radius);
    graphics.lineTo(centerX, centerY);
    graphics.lineTo(centerX - radius * 0.25, centerY + radius * 0.25);
    graphics.close();
    graphics.fill();
  }
  icon(graphics: Graphics, kind: string, x: number, y: number, size = 16, color = C.mint) {
    const centerX = x - this.hud.w / 2;
    const centerY = this.hud.h / 2 - y;
    const r = size / 2;
    graphics.strokeColor = col(color);
    graphics.fillColor = col(color);
    graphics.lineWidth = 1.8;
    if (kind === 'mountain') {
      graphics.moveTo(centerX - r, centerY - r * 0.65);
      graphics.lineTo(centerX - r * 0.1, centerY + r);
      graphics.lineTo(centerX + r * 0.35, centerY + r * 0.1);
      graphics.lineTo(centerX + r * 0.7, centerY + r * 0.65);
      graphics.lineTo(centerX + r * 1.3, centerY - r * 0.65);
      graphics.close();
      graphics.fill();
    } else if (kind === 'ranking') {
      for (const [i, height] of [r, r * 1.7, r * 1.3].entries()) {
        graphics.rect(centerX - r + i * r * 0.7, centerY - r, r * 0.45, height);
        graphics.fill();
      }
    } else if (kind === 'book') {
      for (const side of [-1, 1]) {
        graphics.moveTo(centerX + side * 1.5, centerY - r * 0.8);
        graphics.lineTo(centerX + side * r, centerY - r * 0.5);
        graphics.lineTo(centerX + side * r, centerY + r);
        graphics.lineTo(centerX + side * 1.5, centerY + r * 0.7);
        graphics.close();
        graphics.fill();
        graphics.strokeColor = col('#173147');
        graphics.lineWidth = 1;
        for (const row of [0, 0.4]) {
          graphics.moveTo(centerX + side * 3, centerY + r * row);
          graphics.lineTo(centerX + side * (r - 2), centerY + r * (row + 0.15));
          graphics.stroke();
        }
      }
    } else if (kind === 'battle') {
      for (const side of [-1, 1]) {
        graphics.moveTo(centerX - side * r * 0.5, centerY - r * 0.7);
        graphics.lineTo(centerX + side * r * 0.8, centerY + r * 0.65);
        graphics.lineTo(centerX + side * r, centerY + r);
        graphics.lineTo(centerX + side * r * 0.6, centerY + r * 0.8);
        graphics.lineTo(centerX - side * r * 0.7, centerY - r * 0.5);
        graphics.close();
        graphics.fill();
        graphics.lineWidth = 2.6;
        graphics.strokeColor = col(color);
        graphics.moveTo(centerX - side * r * 0.9, centerY - r * 0.25);
        graphics.lineTo(centerX - side * r * 0.25, centerY - r * 0.9);
        graphics.moveTo(centerX - side * r * 0.6, centerY - r * 0.6);
        graphics.lineTo(centerX - side * r, centerY - r);
        graphics.stroke();
      }
    } else if (kind === 'clock') {
      graphics.circle(centerX, centerY, r);
      graphics.stroke();
      graphics.moveTo(centerX, centerY + r * 0.65);
      graphics.lineTo(centerX, centerY);
      graphics.lineTo(centerX + r * 0.45, centerY - r * 0.2);
      graphics.stroke();
    } else {
      graphics.circle(centerX, centerY, r);
      graphics.stroke();
      graphics.moveTo(centerX - r * 1.35, centerY);
      graphics.lineTo(centerX + r * 1.35, centerY);
      graphics.moveTo(centerX, centerY - r * 1.35);
      graphics.lineTo(centerX, centerY + r * 1.35);
      graphics.stroke();
    }
  }
  supplyIcon(graphics: Graphics, kind: string, x: number, y: number) {
    x -= this.hud.w / 2;
    y = this.hud.h / 2 - y;
    graphics.strokeColor = col(kind === 'rate' ? C.amber : C.mint);
    graphics.lineWidth = 2;
    if (kind === 'tracking') {
      graphics.circle(x, y, 9);
      graphics.stroke();
      for (const sign of [-1, 1]) {
        graphics.moveTo(x + sign * 5, y);
        graphics.lineTo(x + sign * 14, y);
        graphics.moveTo(x, y + sign * 5);
        graphics.lineTo(x, y + sign * 14);
      }
    } else if (kind === 'ammo') {
      graphics.moveTo(x - 12, y - 7);
      graphics.lineTo(x + 13, y + 9);
      graphics.lineTo(x + 4, y - 5);
      graphics.lineTo(x - 10, y - 10);
      graphics.close();
      graphics.moveTo(x - 4, y - 4);
      graphics.lineTo(x - 10, y + 4);
    } else {
      for (const dy of [-5, 5]) {
        graphics.moveTo(x - 13, y + dy - 3);
        graphics.lineTo(x + 7, y + dy - 3);
        graphics.lineTo(x + 13, y + dy);
        graphics.lineTo(x + 7, y + dy + 3);
        graphics.lineTo(x - 13, y + dy + 3);
        graphics.close();
      }
    }
    graphics.stroke();
  }
  /** Four bracket corners: cheap hardware detail that keeps flat dialogs from reading as plain boxes. */
  corners(graphics: Graphics, x: number, y: number, width: number, height: number, tone: string, arm = 14) {
    graphics.strokeColor = col(tone);
    graphics.lineWidth = 2;
    const left = x - this.hud.w / 2,
      top = this.hud.h / 2 - y;
    for (const [cx, cy, dx, dy] of [
      [left, top, 1, -1],
      [left + width, top, -1, -1],
      [left, top - height, 1, 1],
      [left + width, top - height, -1, 1],
    ]) {
      graphics.moveTo(cx + dx * arm, cy);
      graphics.lineTo(cx, cy);
      graphics.lineTo(cx, cy + dy * arm);
      graphics.stroke();
    }
  }
  panelFrame(
    graphics: Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    accent = C.mint,
    dim = '#050f1d55',
    header = true,
  ) {
    const backdrop = this.hud.modal?.getChildByName('Backdrop')?.getComponent(Graphics) || graphics;
    this.hud.rect(backdrop, 0, 0, this.hud.w, this.hud.h, dim);
    this.hud.rect(graphics, x - 3, y + 5, width + 6, height + 3, '#02080e66', undefined, 16);
    this.hud.rect(graphics, x, y, width, height, '#101f2ff5', '#425a6e', 12);
    if (header) {
      this.hud.rect(graphics, x + 16, y + 48, width - 32, 1, '#31495d');
      this.hud.rect(graphics, x + 16, y + 47, 36, 2, accent);
    }
    this.hud.rect(graphics, x + 16, y + height - 60, width - 32, 1, '#253e51');

  }
}
