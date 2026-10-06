import { W, H, ellipse } from './art-primitives.js';
import { project } from './projection.js';
type P = { x: number; y: number };
export function poly(
  c: CanvasRenderingContext2D,
  p: P[],
  color: string | CanvasGradient,
  line = '',
) {
  c.beginPath();
  p.forEach((v, i) => (i ? c.lineTo(v.x, v.y) : c.moveTo(v.x, v.y)));
  c.closePath();
  c.fillStyle = color;
  c.fill();
  if (line) {
    c.strokeStyle = line;
    c.lineWidth = 0.8;
    c.stroke();
  }
}
export function prism(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  d: number,
  h: number,
  z = 0,
  colors = ['#e8d5b0', '#b99e77', '#fff0cd'],
) {
  const p = (a: number, b: number, v: number) => project(x + a, y + b, z + v);
  const front = c.createLinearGradient(p(0, d, h).x, p(0, d, h).y, p(w, d, 0).x, p(w, d, 0).y);
  front.addColorStop(0, colors[2]);
  front.addColorStop(0.3, colors[0]);
  front.addColorStop(1, colors[1]);
  poly(c, [p(0, d, 0), p(w, d, 0), p(w, d, h), p(0, d, h)], front, '#a38a6840');
  poly(c, [p(w, 0, 0), p(w, d, 0), p(w, d, h), p(w, 0, h)], colors[1], '#92765c60');
  poly(c, [p(0, 0, h), p(w, 0, h), p(w, d, h), p(0, d, h)], colors[2], '#fff2da80');
}
export function shadow(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const p = project(x, y);
  poly(
    c,
    [
      { x: p.x - w * 0.6, y: p.y },
      { x: p.x + w * 0.6, y: p.y },
      { x: p.x + w * 0.9 + 18, y: p.y + h + 14 },
      { x: p.x - w * 0.25 + 18, y: p.y + h + 14 },
    ],
    '#263b3825',
  );
  ellipse(c, p.x + w * 0.2, p.y + 5, w, h, '#263b3822');
}
export function wall(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  shadow(c, x + w / 2, y + 32, w * 0.6, 15);
  prism(c, x, y, w, 30, h);
  for (let row = 0; row < h / 18; row++)
    for (let col = 0; col < w / 25; col++)
      prism(c, x + col * 25, y + 29, Math.min(24, w - col * 25), 1, 16, row * 18, [
        (row + col) % 3 ? '#dfcda8' : '#efdcbc',
        '#aa906c',
        '#fff0ce',
      ]);
  for (let i = 0; i < w; i += 31) prism(c, x + i, y, Math.min(19, w - i), 30, 15, h);
}
export function roof(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  d: number,
  h: number,
) {
  const a = project(x + w / 2, y, h + 30),
    b = project(x + w / 2, y + d, h + 30);
  poly(c, [project(x - 8, y + d + 7, h), b, a, project(x - 8, y - 7, h)], '#98654a', '#754b3a');
  poly(
    c,
    [a, b, project(x + w + 8, y + d + 7, h), project(x + w + 8, y - 7, h)],
    '#714d40',
    '#604437',
  );
  poly(c, [project(x - 8, y + d + 7, h), b, project(x + w + 8, y + d + 7, h)], '#b98154');
  for (let i = 1; i < 5; i++) {
    const q = project(x - 8 + (i * (w + 16)) / 5, y + d + 7, h);
    c.strokeStyle = '#ffe0a34a';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(q.x, q.y);
    c.lineTo(b.x, b.y);
    c.stroke();
  }
}
function tree(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  shadow(c, x, y, 19 * s, 6 * s);
  const p = project(x, y);
  c.fillStyle = '#75634b';
  c.fillRect(p.x - 3 * s, p.y - 30 * s, 6 * s, 30 * s);
  for (let i = 0; i < 3; i++) {
    const y = p.y - (22 + i * 13) * s;
    poly(
      c,
      [
        { x: p.x - 22 * s, y },
        { x: p.x, y: y - 30 * s },
        { x: p.x + 20 * s, y },
      ],
      ['#607957', '#708c60', '#88a274'][i],
    );
    poly(
      c,
      [
        { x: p.x, y: y - 30 * s },
        { x: p.x + 20 * s, y },
        { x: p.x + 2 * s, y },
      ],
      '#425f4b55',
    );
  }
}
export function scenery(c: CanvasRenderingContext2D) {
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#7aaabd');
  sky.addColorStop(0.34, '#e4ddbf');
  sky.addColorStop(1, '#74895e');
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);
  const sun = c.createRadialGradient(95, 58, 1, 95, 58, 290);
  sun.addColorStop(0, '#fff6d4b0');
  sun.addColorStop(1, '#fff6d400');
  c.fillStyle = sun;
  c.fillRect(0, 0, W, H);
  for (let l = 0; l < 3; l++) {
    const p: P[] = [{ x: 0, y: 240 }];
    for (let i = 0; i <= 14; i++)
      p.push({ x: i * 75, y: 86 + l * 30 + Math.sin(i * 2.3 + l) * 20 + Math.cos(i * 0.8) * 18 });
    p.push({ x: W, y: H }, { x: 0, y: H });
    poly(c, p, ['#a8b9b4', '#91a59a', '#7c927b'][l]);
  }
  poly(
    c,
    [project(-200, 160), project(1150, 160), project(1150, 630), project(-200, 630)],
    '#9ca476',
  );
  // River canyon and terraces sit behind the traversable siege road.
  poly(
    c,
    [project(-120, 215), project(600, 230), project(475, 280), project(-120, 315)],
    '#799fa0',
  );
  poly(
    c,
    [project(-120, 245), project(525, 240), project(450, 263), project(-120, 286)],
    '#aac6ba',
  );
  for (let i = 0; i < 14; i++) {
    const x = i * 39;
    prism(c, x, 290, 31, 23, 14 + (i % 3) * 7, 0, ['#aaa080', '#77775f', '#cfc5a0']);
  }
  for (let i = 0; i < 9; i++) {
    const p = project(i * 55, 253);
    c.strokeStyle = '#dbe5d07a';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(p.x, p.y);
    c.lineTo(p.x + 23, p.y - 3);
    c.stroke();
  }
  for (let i = 0; i < 70; i++) {
    const p = project((i * 157) % 1100, 245 + ((i * 43) % 300));
    ellipse(c, p.x, p.y, 6 + (i % 4), 2, '#657e5240');
  }
  poly(
    c,
    [project(-150, 318), project(910, 325), project(910, 385), project(-150, 470)],
    '#817c5960',
  );
  poly(
    c,
    [project(-150, 330), project(910, 333), project(910, 377), project(-150, 450)],
    '#caba91',
  );
  for (let i = 0; i < 42; i++) {
    const p = project((i * 79) % 930, 345 + ((i * 11) % 47));
    ellipse(c, p.x, p.y, 3 + (i % 3), 1.4, '#957f6250');
  }
  for (let i = 0; i < 18; i++) tree(c, 250 + i * 39, 210 + (i % 4) * 9, 0.3 + (i % 3) * 0.08);
  for (const [x, y, s] of [
    [60, 235, 0.65],
    [175, 235, 0.7],
    [920, 225, 0.65],
    [965, 355, 0.9],
    [20, 470, 1.4],
    [970, 485, 1.6],
  ])
    tree(c, x, y, s);
  for (let i = 0; i < 10; i++)
    prism(c, -80 + i * 22, 458 + (i % 2) * 15, 30, 28, 13 + (i % 3) * 6, 0, [
      '#c5b08d',
      '#907e64',
      '#dfcfac',
    ]);
}
