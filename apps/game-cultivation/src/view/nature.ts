import { ellipse, line, polygon } from './paint.js';
export function bamboo(c: CanvasRenderingContext2D, x: number, y: number, size: number, t: number) {
  c.save();
  c.translate(x, y);
  c.scale(size, size);
  const sway = Math.sin(t * 0.5 + x) * 3;
  ellipse(c, 0, 8, 23, 7, '#122d2830');
  for (let k = 0; k < 3; k++) {
    const dx = k * 12 - 10;
    line(
      c,
      [
        [dx, 0],
        [dx + sway, -92 - k * 12],
      ],
      '#386852',
      4,
    );
    for (let j = 0; j < 4; j++) {
      const py = -25 - j * 20;
      line(
        c,
        [
          [dx - 3, py],
          [dx + 4, py],
        ],
        '#afd5a477',
        1.5,
      );
      polygon(
        c,
        [
          [dx, py],
          [dx - 35, py - 15],
          [dx - 18, py + 2],
        ],
        '#305e48',
      );
      polygon(
        c,
        [
          [dx, py - 8],
          [dx + 32, py - 26],
          [dx + 15, py - 4],
        ],
        '#4f8060',
      );
    }
  }
  c.restore();
}
export function mountain(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  polygon(
    c,
    [
      [x - size, y + 110],
      [x - size * 0.5, y - 5],
      [x - size * 0.25, y + 10],
      [x, y - 130],
      [x + size * 0.18, y - 70],
      [x + size * 0.34, y - 92],
      [x + size, y + 110],
    ],
    color,
  );
}
export function path(c: CanvasRenderingContext2D, points: number[][]) {
  c.lineCap = 'round';
  c.lineJoin = 'round';
  line(c, points, '#718779', 55);
  line(c, points, '#a3aa8c', 44);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let n = 0; n < len; n += 27) {
      const t = n / len,
        x = a[0] + (b[0] - a[0]) * t,
        y = a[1] + (b[1] - a[1]) * t;
      ellipse(c, x, y, 17, 9, '#b9bda043');
      line(
        c,
        [
          [x - 12, y + 3],
          [x + 12, y - 2],
        ],
        '#485c4c45',
        1,
      );
    }
  }
}
