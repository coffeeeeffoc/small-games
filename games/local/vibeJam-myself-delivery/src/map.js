import { target, MARKET, ORDERS, GOODS } from './game.js';
import { SHORE_RADIUS, DOCK, ROADS, COAST_ROAD, MARKET_PLAZA, ROAD_ISLANDS } from './map-data.js';

export function drawMap(map, s, colliders, large = false) {
  const ctx = map.getContext('2d'), w = map.width, h = map.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#aad3ca'; ctx.fillRect(0, 0, w, h);
  const size = Math.min(w, h) * .86, scale = size / 160, ox = w / 2, oy = h / 2 - 4 * size / 160;
  const at = (x, z) => [ox + x * scale, oy + z * scale];
  ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale);
  ctx.fillStyle = '#e9dfb7'; ctx.beginPath(); ctx.arc(0, 0, SHORE_RADIUS, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#bed1a2'; ctx.beginPath(); ctx.arc(0, 0, SHORE_RADIUS - 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#f3ecd9'; ctx.lineWidth = COAST_ROAD.width;
  ctx.beginPath(); ctx.arc(0, 0, COAST_ROAD.radius, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#f3ecd9';
  for (const r of ROADS) ctx.fillRect(r.x - r.w / 2, r.z - r.d / 2, r.w, r.d);
  ctx.fillStyle = '#e1bb80';
  for (const r of [MARKET_PLAZA, DOCK]) ctx.fillRect(r.x - r.w / 2, r.z - r.d / 2, r.w, r.d);
  ctx.fillStyle = '#c29976';
  for (const c of colliders) ctx.fillRect(c.x - c.w / 2, c.z - c.d / 2, c.w, c.d);
  ctx.fillStyle = '#76986a';
  for (const r of ROAD_ISLANDS) ctx.fillRect(r.x - r.w / 2, r.z - r.d / 2, r.w, r.d);
  ctx.restore();
  if (s.phase !== 'ready') {
    const t = target(s), [px, py] = at(s.x, s.z), [tx, ty] = at(t.x, t.z);
    ctx.beginPath(); ctx.setLineDash([3 * (large ? 1.5 : 1), 4 * (large ? 1.5 : 1)]); ctx.moveTo(px, py); ctx.lineTo(tx, ty); ctx.strokeStyle = '#d87847'; ctx.lineWidth = large ? 2 : 1; ctx.stroke(); ctx.setLineDash([]);
  }
  for (const [i, p] of [MARKET, ...ORDERS].entries()) {
    const [x, y] = at(p.x, p.z), current = target(s) === p || (p === MARKET && s.phase !== 'deliver');
    ctx.fillStyle = current ? '#de743e' : '#74937c'; ctx.strokeStyle = '#fff8e9'; ctx.lineWidth = large ? 3 : 1.5;
    ctx.beginPath(); ctx.arc(x, y, large ? 7 : 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (large) { ctx.fillStyle = '#344a42'; ctx.font = 'bold 13px "Microsoft YaHei"'; ctx.textAlign = 'center'; ctx.fillText(i === 0 ? '橘风集市' : p.name, x, y - 14); }
  }
  if (s.phase === 'collect') GOODS.forEach((p, i) => {
    if (s.items[i]) return;
    const [x, y] = at(p.x, p.z); ctx.fillStyle = '#e8783b'; ctx.beginPath(); ctx.arc(x, y, large ? 5 : 2.5, 0, 7); ctx.fill();
  });
  const [px, py] = at(s.x, s.z);
  ctx.save(); ctx.translate(px, py); ctx.rotate(s.angle);
  const r = large ? 9 : 5;
  ctx.fillStyle = '#344a42'; ctx.strokeStyle = '#fff8e9'; ctx.lineWidth = large ? 2.5 : 1.5;
  ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * .7, r * .8); ctx.lineTo(0, r * .4); ctx.lineTo(-r * .7, r * .8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  ctx.fillStyle = '#466f65'; ctx.font = `${large ? 13 : 9}px Georgia`; ctx.textAlign = 'left'; ctx.fillText('N ↑', 9, 15);
  if (large) {
    ctx.font = '11px "Microsoft YaHei"'; ctx.fillStyle = '#466f65'; ctx.textAlign = 'center';
    for (const p of ROAD_ISLANDS.filter(p => p.name)) { const [x, y] = at(p.x, p.z); ctx.fillText(p.name, x, y + 17); }
    ctx.textAlign = 'left'; ctx.fillText('环岛海岸路', 18, h - 36);
  }
  if (large) { ctx.font = 'italic 14px Georgia'; ctx.fillStyle = '#5c978e'; ctx.fillText('The Tangerine Sea', 18, h - 16); }
}
