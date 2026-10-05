import { ORIGIN } from './rules.js';
export const W = 960,
  H = 480;
export const C = {
  ink: '#263d42',
  cream: '#fff0ce',
  stone: '#ead9ac',
  shadow: '#b99c76',
  coral: '#e77959',
  blue: '#2a779e',
  grass: '#a9c993',
  orange: '#f8ad4d',
};
export function box(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  r = 12,
) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
  c.fillStyle = color;
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = C.ink;
  c.stroke();
}
export function text(
  c: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size = 22,
  color = C.ink,
  align: CanvasTextAlign = 'left',
) {
  c.fillStyle = color;
  c.font = `bold ${size}px sans-serif`;
  c.textAlign = align;
  c.fillText(s, x, y);
}
export function ellipse(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
}
export function scenery(c: CanvasRenderingContext2D) {
  c.fillStyle = '#b7deeb';
  c.fillRect(0, 0, W, H);
  for (const [x, y, s] of [
    [120, 97, 1],
    [385, 84, 0.8],
    [843, 105, 1.2],
  ]) {
    ellipse(c, x, y, 62 * s, 17 * s, '#fff9e9');
    ellipse(c, x - 21 * s, y - 10 * s, 30 * s, 23 * s, '#fff9e9');
    ellipse(c, x + 17 * s, y - 15 * s, 26 * s, 26 * s, '#fff9e9');
  }
  c.beginPath();
  c.moveTo(0, 255);
  for (let x = 0; x <= 1000; x += 80) c.lineTo(x, 200 + Math.sin(x * 0.014) * 37);
  c.lineTo(W, H);
  c.lineTo(0, H);
  c.fillStyle = '#85b8ba';
  c.fill();
  c.beginPath();
  c.moveTo(0, 320);
  c.quadraticCurveTo(380, 238, 960, 305);
  c.lineTo(W, H);
  c.lineTo(0, H);
  c.fillStyle = C.grass;
  c.fill();
  c.beginPath();
  c.moveTo(0, 385);
  c.quadraticCurveTo(500, 316, 960, 356);
  c.lineTo(960, 408);
  c.quadraticCurveTo(420, 363, 0, 425);
  c.fillStyle = '#ddcf9f';
  c.fill();
  for (let i = 0; i < 20; i++) {
    const x = (i * 137) % 960,
      y = 390 + ((i * 23) % 80);
    ellipse(c, x, y, 15, 4, '#8db27c');
    if (i % 3 === 0) {
      ellipse(c, x + 7, y - 3, 3, 3, C.cream);
      ellipse(c, x + 16, y + 2, 3, 3, C.cream);
    }
  }
  for (const x of [25, 55, 876, 910, 936]) {
    box(c, x, 260, 9, 66, '#8a9d75', 3);
    ellipse(c, x + 4, 254, 24, 43, '#70996e');
    ellipse(c, x - 5, 236, 18, 30, '#8caf78');
  }
}
export function flag(c: CanvasRenderingContext2D, x: number, y: number, color: string) {
  c.strokeStyle = C.ink;
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(x, y + 57);
  c.lineTo(x, y);
  c.stroke();
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x + 2, y + 2);
  c.lineTo(x + 42, y + 8);
  c.lineTo(x + 31, y + 22);
  c.lineTo(x + 2, y + 24);
  c.fill();
  text(c, '✦', x + 16, y + 19, 14, C.cream);
}
export function soldier(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  phase: number,
  skin: number,
) {
  ellipse(c, x, y + 14, 12, 4, '#6f8f76');
  c.strokeStyle = C.ink;
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(x - 4, y + 3);
  c.lineTo(x - 7 - Math.sin(phase) * 4, y + 12);
  c.moveTo(x + 3, y + 3);
  c.lineTo(x + 7 + Math.sin(phase) * 4, y + 12);
  c.stroke();
  box(c, x - 9, y - 16, 18, 22, C.blue, 7);
  ellipse(c, x + 2, y - 23, 9, 10, '#f2bc87');
  c.beginPath();
  c.arc(x, y - 28, 12, Math.PI, 0);
  c.lineTo(x + 14, y - 24);
  c.lineTo(x - 13, y - 24);
  c.closePath();
  c.fillStyle = ['#cad8d9', '#f8cb67', '#de8b7a'][skin];
  c.fill();
  c.stroke();
  ellipse(c, x + 6, y - 25, 1.8, 2.2, C.ink);
  c.strokeStyle = '#fff4dc';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(x + 12, y - 7);
  c.lineTo(x + 19, y - 30);
  c.stroke();
}
export function cannon(
  c: CanvasRenderingContext2D,
  aim: { x: number; y: number } | null,
  shot: boolean,
  skin: number,
) {
  ellipse(c, 112, 394, 62, 10, '#78976d');
  box(c, 65, 354, 105, 26, '#bb8962', 8);
  c.save();
  c.translate(ORIGIN.x - (shot ? 5 : 0), ORIGIN.y);
  c.rotate(aim ? Math.atan2(aim.y - ORIGIN.y, aim.x - ORIGIN.x) : -0.35);
  box(c, -48, -18, 100, 32, '#465960', 7);
  box(c, 32, -21, 16, 38, '#34464b', 4);
  c.restore();
  for (const x of [80, 150]) {
    ellipse(c, x, 381, 23, 23, C.ink);
    ellipse(c, x, 381, 17, 17, '#bb8962');
    ellipse(c, x, 381, 6, 6, C.ink);
    c.strokeStyle = C.ink;
    c.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      c.moveTo(x, 381);
      c.lineTo(x + 17 * Math.cos((i * Math.PI) / 3), 381 + 17 * Math.sin((i * Math.PI) / 3));
      c.stroke();
    }
  }
  flag(c, 52, 306, [C.blue, '#d5a435', '#cb756c'][skin]);
}
