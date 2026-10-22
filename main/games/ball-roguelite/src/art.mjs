// Static texture baking only. Every visible instance is a Cocos Sprite/Node;
// there is no Canvas rendering loop or DOM game renderer.
let sceneArt;
export async function prepareArt() {
  const image = new Image();
  image.src = new URL('../assets/nebula.png', import.meta.url).href;
  await image.decode();
  sceneArt = image;
}
const TAU = Math.PI * 2;
const surface = (w, h = w) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};
const rgb = (hex) => hex.match(/[a-f\d]{2}/gi).map((v) => parseInt(v, 16));
const rgba = (hex, a) => `rgba(${rgb(hex).join(',')},${a})`;
export function glassTexture({
  color = '#98f5dd',
  material = 'glass',
  shape = 'circle',
  opacity = 0.75,
  rotation = Math.PI / 6,
} = {}) {
  const canvas = surface(192),
    ctx = canvas.getContext('2d'),
    x = 96,
    y = 96,
    r = 84;
  const contour = (radius = r) => {
    ctx.beginPath();
    if (shape === 'hexagon')
      for (let i = 0; i < 6; i++) {
        const a = rotation + (i * TAU) / 6;
        const px = x + Math.cos(a) * radius,
          py = y + Math.sin(a) * radius;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
    else ctx.arc(x, y, radius, 0, TAU);
    ctx.closePath();
  };
  const glow = ctx.createRadialGradient(x, y, r * 0.78, x, y, r * 1.14);
  glow.addColorStop(0, rgba(color, 0));
  glow.addColorStop(0.53, rgba(color, 0.14));
  glow.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 192, 192);
  contour();
  ctx.save();
  ctx.clip();
  const body = ctx.createRadialGradient(
    x - r * 0.35,
    y - r * 0.38,
    1,
    x + r * 0.1,
    y + r * 0.05,
    r * 1.2,
  );
  body.addColorStop(0, rgba('#ecfff9', 0.46));
  body.addColorStop(0.21, rgba(color, 0.3));
  body.addColorStop(0.48, rgba('#17225a', material === 'pearl' ? 0.78 : 0.25));
  body.addColorStop(0.7, rgba(color, 0.12));
  body.addColorStop(0.88, rgba(color, opacity));
  body.addColorStop(1, rgba('#e6fffa', 0.9));
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, 192, 192);
  const caustic = ctx.createRadialGradient(
    x + r * 0.22,
    y + r * 0.55,
    0,
    x + r * 0.22,
    y + r * 0.55,
    r * 0.65,
  );
  caustic.addColorStop(0, rgba(color, 0.88));
  caustic.addColorStop(0.4, rgba(color, 0.2));
  caustic.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = caustic;
  ctx.fillRect(0, 0, 192, 192);
  if (shape === 'hexagon') {
    for (let i = 0; i < 6; i++) {
      const a = rotation + (i * TAU) / 6,
        b = a + TAU / 6;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r);
      ctx.lineTo(x + Math.cos(b) * r * 0.52, y + Math.sin(b) * r * 0.52);
      ctx.lineTo(x + Math.cos(a) * r * 0.52, y + Math.sin(a) * r * 0.52);
      ctx.closePath();
      ctx.fillStyle = rgba(i < 3 ? color : '#ffffff', [0.25, 0.1, 0.18, 0.35, 0.15, 0.55][i]);
      ctx.fill();
      ctx.strokeStyle = rgba('#e5ddff', 0.4);
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = rgba('#c8fff4', 0.42);
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 4, r * 0.83, r * 0.75, -0.4, 0.1, 2.35);
    ctx.stroke();
    ctx.strokeStyle = rgba(color, 0.34);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(x - 3, y, r * 0.61, r * 0.84, 0.5, 0.1, 2.4);
    ctx.stroke();
  }
  if (material === 'absorber') {
    const hole = ctx.createRadialGradient(x, y, 3, x, y, r * 0.78);
    hole.addColorStop(0, '#0d0624');
    hole.addColorStop(0.4, '#311071');
    hole.addColorStop(0.72, '#a542ff');
    hole.addColorStop(1, '#dd9aff00');
    ctx.fillStyle = hole;
    ctx.fillRect(0, 0, 192, 192);
    for (let j = 0; j < 3; j++) {
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const t = i / 60,
          a = t * 4.2 + (j * TAU) / 3,
          rr = 12 + t * 55;
        const px = x + Math.cos(a) * rr,
          py = y + Math.sin(a) * rr;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.strokeStyle = j === 1 ? '#f7c7ff' : '#c876ff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
  // Soft crescent reflection, never a flat square shine.
  const shine = ctx.createRadialGradient(x - 29, y - 45, 1, x - 29, y - 45, 40);
  shine.addColorStop(0, '#ffffff');
  shine.addColorStop(0.22, '#edfff8e8');
  shine.addColorStop(0.52, '#e8ffff70');
  shine.addColorStop(1, '#ffffff00');
  ctx.fillStyle = shine;
  ctx.save();
  ctx.translate(x - 28, y - 44);
  ctx.rotate(-0.48);
  ctx.scale(1.4, 0.57);
  ctx.translate(-x + 28, -y + 44);
  ctx.beginPath();
  ctx.arc(x - 28, y - 44, 40, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#ffffffb0';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.6, y + r * 0.45, 3, 7, -0.7, 0, TAU);
  ctx.fill();
  ctx.restore();
  contour();
  ctx.strokeStyle = rgba(color, 0.85);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  return canvas;
}
export function backgroundTexture(width, height) {
  if (sceneArt) return sceneArt;
  const c = surface(width, height),
    ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, '#081725');
  g.addColorStop(0.55, '#091526');
  g.addColorStop(1, '#101f32');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  for (const [x, y, color] of [
    [0.15, 0.35, '#2d7a88'],
    [0.9, 0.7, '#50548a'],
  ]) {
    const glow = ctx.createRadialGradient(
      width * x,
      height * y,
      0,
      width * x,
      height * y,
      width * 0.75,
    );
    glow.addColorStop(0, rgba(color, 0.16));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }
  for (let i = 0; i < 100; i++) {
    const x = (i * 131.71 + 17) % width,
      y = (i * 89.13 + 37) % height;
    ctx.fillStyle = i % 7 ? '#add5e82b' : '#c0fff460';
    ctx.beginPath();
    ctx.arc(x, y, i % 7 ? 0.6 : 1, 0, TAU);
    ctx.fill();
  }
  return c;
}
export function panelTexture(fill, border, radius = 22) {
  const c = surface(128),
    ctx = c.getContext('2d');
  ctx.beginPath();
  ctx.roundRect(2, 2, 124, 124, radius);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, fill);
  g.addColorStop(1, fill);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  return c;
}

export function shardTexture(variant = 0) {
  const c = surface(48),
    ctx = c.getContext('2d');
  const points =
    variant % 2
      ? [
          [6, 5],
          [42, 12],
          [27, 43],
          [15, 27],
        ]
      : [
          [8, 5],
          [43, 35],
          [17, 43],
        ];
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  const g = ctx.createLinearGradient(8, 4, 40, 43);
  g.addColorStop(0, '#ffffffff');
  g.addColorStop(0.42, '#c5eaff55');
  g.addColorStop(0.65, '#ffffffbb');
  g.addColorStop(1, '#bfd6ff33');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#ffffffd0';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  return c;
}
