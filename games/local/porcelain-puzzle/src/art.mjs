import { WIDTH, HEIGHT, outline, random } from './content.mjs';
const pathOf = (points) =>
  `M${points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('L')}Z`;
function flower(x, y, r, ink, accent, rotation = 0) {
  let out = `<g transform="translate(${x} ${y}) rotate(${rotation})">`;
  for (let i = 0; i < 10; i++)
    out += `<ellipse rx="${r * 0.35}" ry="${r * 0.7}" cy="${-r * 0.54}" transform="rotate(${i * 36})" fill="${ink}" fill-opacity="${0.45 + (i % 3) * 0.16}" stroke="${ink}" stroke-width=".6"/>`;
  for (let i = 0; i < 7; i++)
    out += `<ellipse rx="${r * 0.23}" ry="${r * 0.42}" cy="${-r * 0.26}" transform="rotate(${(i * 360) / 7})" fill="#f5f0dc" fill-opacity=".72" stroke="${ink}" stroke-width=".8"/>`;
  return (
    out + `<circle r="${r * 0.2}" fill="${accent}"/><circle r="${r * 0.1}" fill="${ink}"/></g>`
  );
}
export function vesselSVG(vessel) {
  const { ink, base, accent, motif } = vessel,
    shape = pathOf(outline(vessel));
  const rng = random(771 + vessel.shape * 71 + vessel.theme * 113);
  let decor = '';
  if (motif === 'flower' || motif === 'bamboo') {
    for (let i = 0; i < 6; i++) {
      const x = 30 + rng() * 180,
        y = 50 + rng() * 230;
      decor += `<path d="M${x - 25},${y + 45} Q${x + 40},${y + 15} ${x},${y - 45}" fill="none" stroke="${ink}" stroke-width="1.7"/>`;
      for (let j = 0; j < 5; j++)
        decor += `<ellipse cx="${x + (j % 2 ? 12 : -9)}" cy="${y - 30 + j * 15}" rx="5" ry="15" transform="rotate(${j % 2 ? 50 : -45} ${x + (j % 2 ? 12 : -9)} ${y - 30 + j * 15})" fill="${ink}" opacity=".75"/>`;
      if (motif === 'flower') decor += flower(x, y, 14 + rng() * 15, ink, accent, rng() * 90);
    }
    if (motif === 'flower') decor += flower(124, 174, 40, ink, accent, 11);
  } else if (motif === 'mountain') {
    for (let i = 0; i < 5; i++) {
      const y = 120 + i * 32;
      decor += `<path d="M-10 ${y + 30} Q30 ${y - 70 - rng() * 50} 65 ${y} Q105 ${y - 105} 143 ${y - 10} Q180 ${y - 95} 250 ${y + 30}V310H-10Z" fill="${ink}" opacity="${0.14 + i * 0.1}"/>`;
    }
    decor += `<circle cx="163" cy="82" r="19" fill="${accent}" opacity=".8"/>`;
    for (let i = 0; i < 5; i++)
      decor += `<path d="M${30 + i * 38} ${231 + (i % 2) * 16}q8 -7 16 0" fill="none" stroke="${ink}"/>`;
  } else if (motif === 'fish') {
    for (let i = 0; i < 7; i++) {
      const x = 28 + rng() * 180,
        y = 60 + rng() * 210;
      decor += `<g transform="translate(${x} ${y}) rotate(${rng() * 170 - 85})"><ellipse rx="18" ry="8" fill="${ink}"/><path d="M-14 0L-32 -13V13Z" fill="${ink}"/><circle cx="10" cy="-2" r="2" fill="${base}"/><path d="M-6 -7Q2 0 -6 7" fill="none" stroke="${accent}"/></g>`;
    }
    for (let y = 70; y < 300; y += 35)
      decor += `<path d="M0 ${y}q20 -15 40 0t40 0t40 0t40 0t40 0t40 0" fill="none" stroke="${ink}" opacity=".24"/>`;
  } else if (motif === 'window' || motif === 'crystal') {
    for (let y = 0; y < 330; y += 46)
      for (let x = -20; x < 280; x += 48) {
        const color = [ink, accent, base][Math.floor(rng() * 3)];
        decor += `<path d="M${x} ${y}l24 -23 24 23 -24 23Z" fill="${color}" fill-opacity="${0.25 + rng() * 0.5}" stroke="${ink}" stroke-width="${motif === 'window' ? 2 : 1}"/>`;
      }
  } else {
    if (motif === 'moon')
      decor += `<circle cx="138" cy="129" r="68" fill="#faffff" opacity=".85"/><circle cx="161" cy="107" r="62" fill="${base}"/><path d="M0 236Q60 170 125 232T260 209V310H0Z" fill="${ink}" opacity=".3"/>`;
    for (let i = 0; i < 40; i++) {
      const x = rng() * 240,
        y = rng() * 300,
        r = 1 + rng() * 3;
      decor += `<path d="M${x - r} ${y}h${r * 2}M${x} ${y - r}v${r * 2}" stroke="${i % 2 ? accent : '#fff8e6'}" stroke-width="1.3"/>`;
    }
  }
  const bands = [20, 35, 268, 280]
    .map((y) => `<path d="M0 ${y}H240" stroke="${ink}" stroke-width="${y % 2 ? 2 : 5}"/>`)
    .join('');
  const waves = Array.from(
    { length: 17 },
    (_, i) => `<path d="M${i * 15} 42v9h9v-5h-5" fill="none" stroke="${ink}" stroke-width="1.6"/>`,
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="600" viewBox="0 0 240 300"><defs><clipPath id="v"><path d="${shape}"/></clipPath><linearGradient id="shade"><stop stop-color="#0b2748" stop-opacity=".35"/><stop offset=".22" stop-color="white" stop-opacity=".04"/><stop offset=".42" stop-color="white" stop-opacity=".3"/><stop offset=".7" stop-color="white" stop-opacity="0"/><stop offset="1" stop-color="#132d48" stop-opacity=".43"/></linearGradient><linearGradient id="shine" x1="0" y1="0" x2="1" y2="1"><stop stop-color="white" stop-opacity=".8"/><stop offset=".32" stop-color="white" stop-opacity="0"/><stop offset=".52" stop-color="white" stop-opacity=".35"/><stop offset=".63" stop-color="white" stop-opacity="0"/></linearGradient></defs><g clip-path="url(#v)"><path d="${shape}" fill="${base}"/>${decor}${bands}${waves}<path d="${shape}" fill="url(#shade)"/>${vessel.material === 'glass' || vessel.material === 'mirror' ? `<path d="${shape}" fill="url(#shine)"/><path d="M67 45Q38 140 58 237" fill="none" stroke="white" stroke-opacity=".65" stroke-width="5"/>` : ''}<path d="${shape}" fill="none" stroke="${accent}" stroke-width="4"/></g></svg>`;
}
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
  const image = await imageFrom(
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(vesselSVG(vessel)),
  );
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
