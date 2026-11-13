import { Graphics, Label, Node, UITransform } from 'cc';
import type { HUD } from './HUD';
import { C, col } from './HudTheme';

type Host = Pick<HUD, 'w' | 'h' | 'safe' | 'capsuleRect' | 'rect' | 'label' | 'button' | 'buttons' | 'controlIcon'>;
export type DialogOptions = {
  width: number;
  height: number;
  title?: string;
  position?: 'center' | 'right';
  anchor?: { x: number; y: number; w: number; h: number };
  close?: string;
  dim?: string;
  background?: string;
};

export function dialog(h: Host, n: Node, g: Graphics, options: DialogOptions) {
  const w = Math.min(options.width, h.w - h.safe.left - h.safe.right - 32);
  const x = options.anchor ? Math.max(h.safe.left + 16, Math.min(options.anchor.x, h.w - h.safe.right - w - 16))
    : options.position === 'right' ? h.w - h.safe.right - w - 16
    : h.safe.left + (h.w - h.safe.left - h.safe.right - w) / 2;
  const top = Math.max(h.safe.top, h.capsuleRect && x + w > h.capsuleRect.left ? h.capsuleRect.bottom : 0);
  const anchorY = options.anchor ? Math.max(top + 6, options.anchor.y + options.anchor.h + 6) : undefined;
  const height = Math.min(options.height, h.h - (anchorY ?? top + 12) - h.safe.bottom - 12);
  const y = anchorY ?? top + (h.h - top - h.safe.bottom - height) / 2;
  h.rect(g, 0, 0, h.w, h.h, options.dim ?? '#03091266');
  h.rect(g, x - 3, y + 5, w + 6, height + 3, '#02080e66', undefined, 16);
  h.rect(g, x, y, w, height, options.background ?? '#101f2ffb', '#425a6e', 12);
  h.rect(g, x + 16, y + 50, w - 32, 1, '#31495d');
  if (options.title) {
    h.rect(g, x + 20, y + 19, 3, 18, C.mint, undefined, 1);
    const title = h.label(n, options.title, x + 34 + (w - 94) / 2, y + 28, 18, w - 94, 30);
    title.horizontalAlign = Label.HorizontalAlign.LEFT;
    title.isBold = true;
  }
  if (options.close) dialogButton(h, n, g, options.close, '', x + w - 52, y + 4, 44, 'quiet', 'close');
  return { x, y, w, h: height };
}

export function dialogButton(h: Host, n: Node, g: Graphics, id: string, caption: string,
  x: number, y: number, w: number, kind: 'primary' | 'secondary' | 'quiet' | 'ghost' = 'secondary',
  icon = '', height = 44, disabled = false) {
  const label = h.button(id, caption, x, y, w, height, n), button = h.buttons.at(-1)!;
  button.disabled = disabled;
  button.visual = { x: x + 2, y: y + 3, w: w - 4, h: height - 6, radius: 7 };
  if (kind !== 'quiet') h.rect(g, x + 2, y + 3, w - 4, height - 6,
    disabled ? '#182838' : kind === 'primary' ? '#a98649' : '#1c3245',
    disabled ? '#2a4051' : kind === 'primary' ? '#d2b377' : '#3d596e', 7);
  label.color = col(disabled ? C.dim : kind === 'primary' ? '#fff5df' : C.white);
  label.fontSize = 13;
  label.isBold = kind === 'primary';
  label.enableWrapText = false;
  label.overflow = Label.Overflow.SHRINK;
  if (icon) h.controlIcon(g, icon, x + (caption ? 20 : w / 2), y + height / 2, 18, disabled ? '#536b7e' : C.mint);
  if (icon && caption) {
    label.node.setPosition(x + 32 + (w - 40) / 2 - h.w / 2, h.h / 2 - y - height / 2);
    label.node.getComponent(UITransform)!.setContentSize(w - 40, height - 4);
  }
  return label;
}
