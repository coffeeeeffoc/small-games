export const ink = {
  dark: '#102c2d',
  jade: '#78c7ac',
  gold: '#ecd397',
  paper: '#eae8d0',
  danger: '#f09377',
};
export function ellipse(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string | CanvasGradient,
) {
  c.fillStyle = fill;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
}
export function line(c: CanvasRenderingContext2D, points: number[][], color: string, width = 1) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
}
export function polygon(c: CanvasRenderingContext2D, points: number[][], color: string) {
  c.fillStyle = color;
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
}
export function ring(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  width = 1,
  end = Math.PI * 2,
) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.arc(x, y, r, -Math.PI / 2, end - Math.PI / 2);
  c.stroke();
}
export function label(
  c: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size = 15,
  color = ink.paper,
  align: CanvasTextAlign = 'center',
) {
  c.font = `${size >= 24 ? 'bold ' : ''}${size}px "STKaiti", "KaiTi", "Noto Serif CJK SC", serif`;
  c.textAlign = align;
  c.fillStyle = color;
  c.fillText(text, x, y);
}
export function glow(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const gradient = c.createRadialGradient(x, y, 0, x, y, r);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'transparent');
  ellipse(c, x, y, r, r, gradient);
}
export function sword(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  scale = 1,
  color = '#f1f4d8',
) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.scale(scale, scale);
  polygon(
    c,
    [
      [26, 0],
      [5, -4],
      [-12, -3],
      [-12, 3],
      [5, 4],
    ],
    color,
  );
  line(
    c,
    [
      [-12, -7],
      [-12, 7],
    ],
    ink.gold,
    3,
  );
  line(
    c,
    [
      [-13, 0],
      [-24, 0],
    ],
    '#ac7652',
    4,
  );
  line(
    c,
    [
      [22, 0],
      [-10, 0],
    ],
    '#8caeaa',
    1,
  );
  c.restore();
}
