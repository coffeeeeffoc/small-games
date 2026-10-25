import { WIDTH, HEIGHT, random } from './content.mjs';
export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return c;
}
export async function imageFrom(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}
export async function vesselCanvas(vessel) {
  const image = await imageFrom(`./assets/vessels/${vessel.id}.webp`);
  const c = canvas(480, 600);
  c.getContext('2d').drawImage(image, 0, 0);
  return c;
}
export function shardCanvas(source, piece, silhouette) {
  const c = canvas(WIDTH * 2, HEIGHT * 2),
    ctx = c.getContext('2d');
  ctx.scale(2, 2);
  const trace = (poly) => {
    ctx.beginPath();
    poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
  };
  trace(silhouette);
  ctx.clip();
  trace(piece.polygon);
  ctx.clip();
  ctx.drawImage(source, 0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = '#ab885b';
  ctx.lineWidth = 2.6;
  trace(piece.polygon);
  ctx.stroke();
  ctx.strokeStyle = '#fff7df';
  ctx.lineWidth = 1;
  ctx.stroke();
  const b = piece.bounds,
    minX = Math.max(0, Math.floor(b.minX) - 2),
    minY = Math.max(0, Math.floor(b.minY) - 2),
    w = Math.min(WIDTH - minX, Math.ceil(b.maxX) - minX + 2),
    h = Math.min(HEIGHT - minY, Math.ceil(b.maxY) - minY + 2);
  const cropped = canvas(w * 2, h * 2);
  cropped.getContext('2d').drawImage(c, minX * 2, minY * 2, w * 2, h * 2, 0, 0, w * 2, h * 2);
  return { image: cropped, x: minX + w / 2, y: minY + h / 2, w, h };
}
export function tableCanvas(height) {
  const c = canvas(780, height * 2),
    ctx = c.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#f7f0e0';
  ctx.fillRect(0, 0, 390, height);
  const gradient = ctx.createRadialGradient(195, height * 0.45, 30, 195, height * 0.45, 430);
  gradient.addColorStop(0, '#fffdf4');
  gradient.addColorStop(1, '#e4d8bd');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 390, height);
  const rng = random(773);
  for (let i = 0; i < 10000; i++) {
    ctx.fillStyle = i % 2 ? '#b6a68b0a' : '#ffffff30';
    ctx.fillRect(rng() * 390, rng() * height, 0.8, 1.8);
  }
  ctx.strokeStyle = '#cbb991';
  ctx.lineWidth = 1;
  ctx.strokeRect(9, 12, 372, height - 24);
  ctx.strokeStyle = '#e4d3b4';
  ctx.strokeRect(13, 16, 364, height - 32);
  for (const [x, y, angle] of [
    [30, 34, 20],
    [360, 34, -160],
    [30, height - 30, -20],
    [360, height - 30, 160],
  ]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.strokeStyle = '#50738b30';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(45, 30, 20, 90);
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = '#78928d20';
      ctx.beginPath();
      ctx.ellipse(13 + i * 3, 10 + i * 15, 5, 15, -0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  return c;
}
