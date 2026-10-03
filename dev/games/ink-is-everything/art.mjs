/** Original pen-and-paper artwork. No remote images or drawing dependencies. */
const INK = '#20221d';
const PAPER = '#ddd1b4';
const RED = '#9b4537';
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const scenePoint = (room) => ({ x: 100 + room.x * 9, y: 90 + room.y * 5 });

function random(seed) {
  let n = 2166136261;
  for (const c of String(seed)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return () => {
    n += 0x6d2b79f5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const defs = `
  <filter id="ie-paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".58" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".12"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/></filter>
  <filter id="ie-rough" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence baseFrequency=".06" numOctaves="2" seed="11" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G"/></filter>
  <pattern id="ie-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><path d="M0 0V8 M3 0V8" stroke="${INK}" stroke-width=".65" opacity=".35"/></pattern>
  <pattern id="ie-grid" width="44" height="30" patternUnits="userSpaceOnUse"><path d="M0 0H44V30H0Z M22 0v30" fill="none" stroke="#6b6652" stroke-width=".65" opacity=".26"/><path d="M3 2h17m4 2h16M2 27h16" fill="none" stroke="#fbf0d3" opacity=".32"/></pattern>
  <radialGradient id="ie-shade"><stop offset="0" stop-color="#f1e5c9"/><stop offset=".73" stop-color="#e0d1ae"/><stop offset="1" stop-color="#c8b797"/></radialGradient>
  <radialGradient id="ie-warm"><stop stop-color="#e1af62" stop-opacity=".6"/><stop offset="1" stop-color="#e1af62" stop-opacity="0"/></radialGradient>
  <symbol id="ie-stone" viewBox="-20 -15 40 30"><path d="M-17-3-7-10 13-7 18 0 9 9-12 7Z" fill="#99947e"/><path d="m-17-3 8 5 27-2M-9 2l-3 5M13-7l-2 5" fill="none" stroke="${INK}" stroke-width="1.6"/><path d="m-17-3 10-7 20 3 5 7-9 9-21-2Z" fill="url(#ie-hatch)" stroke="${INK}" stroke-width="1.5"/></symbol>
  <symbol id="ie-skull" viewBox="-20 -20 40 40"><path d="M-12 5C-24-12 17-23 15-1l-5 8-1 7-17 1-2-8Z" fill="#e4d7b7" stroke="${INK}" stroke-width="2"/><path d="m-9 9 1 7m5-7 1 8m6-9v8M-7-5q-8 0-6 6 6 5 9-1M5-6q8-2 8 5-4 6-8 1m-6 4-3 5h7Z" fill="${INK}"/><path d="m-9-12 4-4 3 5" fill="none" stroke="${INK}"/></symbol>
  <symbol id="ie-torch" viewBox="-20 -80 40 90"><ellipse cy="-50" rx="25" ry="34" fill="url(#ie-warm)"/><path d="m-5-44 4 50h6l4-49Z" fill="#766d54" stroke="${INK}" stroke-width="2"/><path d="m-7-45 14-1 3 13-16 2Zm3 14 10-2m-8 7 8-2m-6 9 5-2" fill="#403f32" stroke="${INK}" stroke-width="2"/><path d="M0-46C-16-54 1-62 0-74c13 15 15 27 0 28Z" fill="#dbad66" stroke="${INK}" stroke-width="2"/><path d="M1-49q-7-3 2-14 6 11-2 14" fill="#f6df9d"/></symbol>
  <symbol id="ie-bottle" viewBox="-25 -38 50 60"><path d="m-8-32 16-1 1 9 9 8 3 31q-20 9-40 0l2-29 9-10Z" fill="#25271f" stroke="${INK}" stroke-width="2.4"/><path d="m-10-24 20-1M-16-12Q0-6 16-12M-18 12q19 8 36-1" fill="none" stroke="#dcd0b1" stroke-width="1.5"/><path d="m-9-33 16-1 2 7-20 1Z" fill="#a69a7b" stroke="${INK}" stroke-width="2"/><path d="M-11-7v14m1-18 4 1" fill="none" stroke="#eee1bd" stroke-linecap="round" stroke-width="3"/><path d="m-5-5 13 1 1 12-14 1Z" fill="#d8caa7"/><path d="m0-3-3 7q4 5 7-1Z" fill="${INK}"/></symbol>
  <symbol id="ie-hero" viewBox="-45 -76 95 94">
    <ellipse cy="11" rx="29" ry="8" fill="${INK}" opacity=".23"/>
    <path d="M-12-37C-25-31-24-13-40-7l17-3-13 10 21-9 5 14L10-2 22 3l-6-20-8-23Z" fill="#32372c" stroke="${INK}" stroke-width="2.6"/>
    <path d="m-17-27-7 15m10-19 2 19-5 12M6-26 13-9" fill="none" stroke="#aea88d" stroke-width="1.5"/>
    <path d="m-10-4-3 15-9 2-1 5h18l7-20M7-3l1 14 10 2 3 4-17 2-4-19" fill="#424135" stroke="${INK}" stroke-width="2.2"/>
    <path d="M-11-53q22-11 26 9l-2 9q-15 15-25-1Z" fill="#e7dab9" stroke="${INK}" stroke-width="2.4"/>
    <path d="m-8-46-5 15-8-11 6-10m25 10 8 7-7 3" fill="#35352a" stroke="${INK}" stroke-width="1.6"/>
    <path d="M-29-47c-3-6 14-10 14-10l7-16q20-7 29 9l-2 14c23 0 25 7 12 10-14 3-52 2-60-7Z" fill="#aaa58a" stroke="${INK}" stroke-width="2.8"/>
    <path d="M-15-57q17 6 34 7l2-7q-19 0-33-6Z" fill="#30332a"/><path d="M-24-46q28 7 52 1M-5-69q8-2 15 4" fill="none" stroke="#f1e3c2" stroke-width="1.6"/>
    <path d="m1-35 7 2-4 8-15-2-3-5Z" fill="#786c4e" stroke="${INK}" stroke-width="1.6"/>
    <path d="m8-29 11 10 11-5 4 6-15 9L5-17" fill="#89876e" stroke="${INK}" stroke-width="2.3"/>
    <path d="m28-18 14-39 4 1-13 41Z" fill="#a79568" stroke="${INK}" stroke-width="1.5"/>
    <path d="m41-57 1-9 9-10q-1 13-6 22Z" fill="${INK}"/><path d="m28-22 7 2-1 6-7-2" fill="#e4d4af" stroke="${INK}" stroke-width="1.6"/>
    <circle cx="5" cy="-40" r="2" fill="${INK}"/>
  </symbol>
  <symbol id="ie-slime" viewBox="-45 -56 90 75"><ellipse cy="10" rx="37" ry="10" fill="${INK}" opacity=".23"/><path d="M-34 5c-13 4-11-8-2-12 1-14 0-25 12-26l4-13 8 11c16-12 22 0 25 5 14-1 12 15 15 18 21 13 7 25-5 18-5 12-20 1-27 5-15 8-24-4-30-6Z" fill="#242720" stroke="#141810" stroke-width="2.5"/><path d="M-27-19q-2-13 9-11M6-29q10 1 12 12M-30 3l5 3m43-2 5 3" fill="none" stroke="#6c7058" stroke-width="2"/><ellipse cx="-11" cy="-15" rx="5" ry="7" fill="#e5d8b5"/><ellipse cx="8" cy="-16" rx="5" ry="6" fill="#e5d8b5"/><path d="m-9-1 12 1-5 5Z" fill="${RED}"/><circle cx="-10" cy="-16" r="2"/><circle cx="7" cy="-16" r="2"/><path d="m-44 9-7 3m84-4 8 4m-61 7-4 2" stroke="${INK}" stroke-width="3" stroke-linecap="round"/></symbol>
  <symbol id="ie-chest" viewBox="-50 -60 100 85"><ellipse cy="13" rx="43" ry="10" fill="${INK}" opacity=".17"/><path d="m-35-19 50-12 27 15-7 37-48 5-24-15Z" fill="#807c63" stroke="${INK}" stroke-width="2.5"/><path d="m-36-19 49 6 29-3-3-21-25-17-42 12Z" fill="#b0a68a" stroke="${INK}" stroke-width="2.6"/><path d="m-28-30 40-12 20 12-24 8Z" fill="#4e5040" stroke="${INK}" stroke-width="1.7"/><path d="m-35-19 47 8 30-5M12-11 8 24M-31-11-28 8l31 7M20-12l-4 25m13-28-5 26M-31-29l41 8m-20-21 23 14m-40 3-3 13m9-17-2 19m35-8 3 15" fill="none" stroke="${INK}" stroke-width="2.1"/><path d="m-13-14 13 3-1 15-12-3Z" fill="#d8c995" stroke="${INK}" stroke-width="1.8"/><circle cx="-6" cy="-6" r="2.5" fill="${INK}"/><path d="M-6-4v3" stroke="${INK}" stroke-width="2"/><path d="m-27 0 8 2m0 4 6 1m35-40 8 5" stroke="#e2d3af" stroke-width="1.5"/></symbol>
  <symbol id="ie-shrine" viewBox="-65 -100 130 125"><ellipse cy="17" rx="55" ry="10" fill="${INK}" opacity=".18"/><path d="m-45 6 40-17 49 11 9 12-49 12-51-8Z" fill="#aaa58b" stroke="${INK}" stroke-width="2.5"/><path d="m-28-13 49-4 17 12-38 12-42-12Z" fill="#cbc0a3" stroke="${INK}" stroke-width="2.5"/><path d="M-31-37q33 15 66-5l-9 30Q0 5-25-11Z" fill="#aaa58b" stroke="${INK}" stroke-width="2.5"/><ellipse cy="-38" rx="34" ry="14" fill="#ddd2b5" stroke="${INK}" stroke-width="2.5"/><ellipse cy="-38" rx="26" ry="9" fill="#333d30"/><path d="m-23-35 9-3m8 6 14-1m6-7 8 1" stroke="#88977b" stroke-width="2"/><path d="M-3-42C-30-59 6-66 2-89c24 21 14 38-5 47Z" fill="#69785d" stroke="${INK}" stroke-width="2.5"/><path d="M0-46q-3-17 4-30" fill="none" stroke="#c4ceae" stroke-width="2"/><path d="m-24-21 3 8m42-12-3 9m-5 26 18-5M-40 8l20 5" stroke="${INK}" stroke-width="1.5"/><path d="M-43-64v7m-3-3h7m58-25v8m-4-4h8m18 30v6m-3-3h6" stroke="#68725c" stroke-width="1.3"/></symbol>
  <symbol id="ie-merchant" viewBox="-80 -100 160 140"><ellipse cy="29" rx="68" ry="10" fill="${INK}" opacity=".19"/><path d="m-59-60-4 84 5 2 4-84m104-5 5 86 5-1-5-85" fill="#69674f" stroke="${INK}" stroke-width="2.5"/><path d="M-69-60-45-89l82-6 31 30-14 8-14-4-14 7-15-5-13 7-17-5-16 6-15-4Z" fill="#b8aa87" stroke="${INK}" stroke-width="2.8"/><path d="m-45-88-12 25m29-26-8 28m24-30-1 29m21-30 8 28m10-30 17 27" stroke="${INK}" stroke-width="9" opacity=".72"/><path d="M-20-13q-10-39 9-47 8-8 23 2 14 19 8 45Z" fill="#3c4133" stroke="${INK}" stroke-width="2.5"/><path d="M-10-47q16-8 18 12l-5 11-18-9Z" fill="#20261e"/><path d="m-10-39 6-1m6-1 5 1" stroke="#e3d3ad" stroke-width="2"/><path d="m-24-23-14 6 6 9 18-10m28-5 14 7-1 9-19-10" fill="#aaa07d" stroke="${INK}" stroke-width="2"/><path d="m-52-9 102-3 12 16-116 2Z" fill="#c2b18a" stroke="${INK}" stroke-width="2.5"/><path d="m-54 6 5 27 36-5 16 9 40-7 12 4L56 3Z" fill="#9a9071" stroke="${INK}" stroke-width="2.7"/><path d="m-39 7 2 20m17-20-1 18m46-20 3 22m-24-2 3 8" stroke="${INK}" stroke-width="1.5"/><path d="m-12 5 18 1 6 15-17 2Z" fill="#d6c89f" stroke="${INK}"/><path d="m-5 8 7 10m-9-6 11 1" stroke="${INK}"/><use href="#ie-bottle" x="-47" y="-37" width="24" height="34"/><path d="m24-19 20 3-2 15-23-2Z" fill="#e6d8b5" stroke="${INK}" stroke-width="1.5"/><path d="m25-14 12 2m-13 2 14 2m-12 1 8 2" stroke="#767154"/><path d="m-61-62 3 11-5 3" stroke="${INK}" fill="none"/></symbol>
  <symbol id="ie-gate" viewBox="-100 -170 200 205"><ellipse cy="22" rx="83" ry="15" fill="${INK}" opacity=".25"/><path d="m-81 17 5-86c0-100 140-119 151-5l8 89Z" fill="#8c8972" stroke="${INK}" stroke-width="3"/><path d="m-57 14 3-88c2-70 103-76 106 3l8 87Z" fill="#171d17" stroke="${INK}" stroke-width="3"/><path d="m-81 4 26-5m-25-18 26-4m-24-23 25-2m-23-23 25 3m-17-26 25 10m-12-37 19 16m4-34 11 24m10-29 5 26m19-23-6 24m26-15-14 20m29 2-23 12m30 9-26 6m30 17-28 3m30 22-28 3" fill="none" stroke="${INK}" stroke-width="3"/><path d="M-40 13q-2-71 7-90l-8-9 10-15 12 14q-9 44 0 91m30 10q-10-52 2-98l11-16 9 12-6 12q-3 58 8 91M-11-100l14-11 12 9-10 14Z" fill="none" stroke="#626653" stroke-width="3"/><path d="M-47-21q12-6 18-29L-8-61 3-44 23-58 39-26l-8 34H-36Z" fill="#27251e" stroke="#4f5141" stroke-width="2.5"/><path d="m-33-26 24 6-9 8-13-5m42-4 23-8-3 15-16 4" fill="${RED}" stroke="#b25943" stroke-width="1.5"/><path d="m0-16-5 17h12ZM-38 3l9-8m52 8 8-10" fill="${INK}" stroke="#626653" stroke-width="2"/><path d="m-84 12 12 8 130-3 28-6-7 14-141 9-26-13Z" fill="#a8a086" stroke="${INK}" stroke-width="2.5"/><path d="m-72-115-10-14 4-17 10 5 12-14 11 7m103 36 12-8-1-16-10 1-13-8" fill="none" stroke="${INK}" stroke-width="2.5"/><use href="#ie-skull" x="-17" y="-135" width="34" height="34"/><path d="m-63-47 8-16m111 4 12 8m-40-69 9-6M-76 6l13-4" stroke="#d4c9ab" stroke-width="2"/>
  </symbol>`;

function scatter(seed, x, y, count = 16, radius = 83) {
  const rand = random(seed);
  let result = '';
  for (let i = 0; i < count; i++) {
    const px = x + (rand() - 0.5) * radius * 2,
      py = y + (rand() - 0.5) * radius;
    const size = 1 + rand() * 2.4;
    result += `<path d="m${px.toFixed(1)} ${py.toFixed(1)} ${size.toFixed(1)} -${(size / 2).toFixed(1)} ${size.toFixed(1)} 1" fill="none" stroke="${INK}" stroke-width="${(0.5 + rand()).toFixed(1)}" opacity=".4"/>`;
  }
  return result;
}

function floor(room) {
  const { x, y } = scenePoint(room),
    rand = random(`floor-${room.id}`);
  let marks = '';
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 5; col++) {
      const px = -78 + col * 31 + (row % 2) * 13,
        py = -35 + row * 20;
      if ((row === 0 || row === 3) && (col === 0 || col === 4)) continue;
      marks += `<path d="m${px} ${py} ${24 + rand() * 5} -2 4 17-29 3Z" fill="${rand() > 0.75 ? '#bdb79d' : '#dcd1b3'}" fill-opacity=".5" stroke="#787762" stroke-width=".8" opacity=".54"/>`;
      if (rand() > 0.5)
        marks += `<path d="m${px + 8} ${py + 4} 7 3-3 5m2-4 5 1" fill="none" stroke="#77705a" stroke-width=".65" opacity=".55"/>`;
    }
  return `<g transform="translate(${x} ${y})"><path d="M-86-20-50-45 38-48 88-22 84 31 45 50-51 44-90 15Z" fill="#746f58" opacity=".11"/><path d="M-80-29-44-45 39-41 80-19 80 18 48 39-49 35-81 11Z" fill="#e5d9bb" fill-opacity=".73" stroke="#77725d" stroke-width="1" stroke-dasharray="21 5 4 2"/>${marks}</g>${scatter(room.id, x, y + 12, 20, 109)}`;
}

function wall(x, y, side = 1, length = 3) {
  let stones = '';
  for (let col = 0; col < length; col++) {
    const h = col === 0 ? 24 : col === length - 1 ? 16 : 32;
    const px = col * 25;
    stones += `<path d="M${px} ${-h}l23-4 6 9-25 6Z" fill="#b3ad91" stroke="${INK}" stroke-width="1.8"/><path d="M${px} ${-h}l4 11V10l-4-8Z" fill="#565b48" stroke="${INK}" stroke-width="1.5"/><path d="M${px + 4} ${-h + 11}l25-6V5l-25 5Z" fill="#929079" stroke="${INK}" stroke-width="1.8"/><path d="M${px + 4} ${-h + 11}l25-6V5l-25 5Z" fill="url(#ie-hatch)"/><path d="m${px + 5} ${-h + 19} 24-5m-23 14 23-4m-13-18 1 10m-11 2 1 8m13-25 3 4-2 3" fill="none" stroke="${INK}" stroke-width="1.2"/><path d="m${px + 6} ${-h + 13} 7-1m3-1 10-2m-18-13 4 1 3-3m-7 7 8-2" fill="none" stroke="#e0d1ac" stroke-width=".9"/>`;
  }
  return `<g transform="translate(${x} ${y}) scale(${side} 1)">${stones}<use href="#ie-stone" x="-16" y="8" width="26" height="20"/><use href="#ie-stone" x="${length * 25 - 1}" y="10" width="22" height="17"/></g>`;
}

function fog(room) {
  const { x, y } = scenePoint(room),
    rand = random(room.id);
  let dots = '',
    contour = '';
  for (let i = 0; i <= 12; i++)
    contour += `${i === 0 ? 'M' : 'L'}${-87 + i * 14} ${-10 - rand() * 19 + Math.abs(i - 6) * 2.4}`;
  for (let i = 12; i >= 0; i--)
    contour += `L${-86 + i * 14} ${12 + rand() * 18 - Math.abs(i - 6) * 1.6}`;
  for (let i = 0; i < 17; i++) {
    const angle = rand() * Math.PI * 2,
      rx = 55 + rand() * 42,
      ry = 14 + rand() * 9;
    dots += `<ellipse cx="${Math.cos(angle) * rx}" cy="${Math.sin(angle) * ry}" rx="${0.6 + rand() * 3.6}" ry="${0.4 + rand() * 2}" fill="${INK}" opacity="${0.2 + rand() * 0.5}"/>`;
  }
  return `<g transform="translate(${x} ${y + 17}) rotate(${rand() * 8 - 4})"><path d="${contour}Z" fill="${INK}" opacity=".77" filter="url(#ie-rough)"/><path d="M-82 3 63-11M-63 18 77 1M-78-4 43-15" stroke="${INK}" stroke-width="5" opacity=".5"/>${dots}<path d="M-63-2-31-6m12-1 16-2m15-2 33-4M-71 10l20-3m61 9 29-5m15-3 23-4" fill="none" stroke="#dac9a7" stroke-width=".8" opacity=".26"/></g>`;
}

function corridor(a, b, discovered) {
  const start = scenePoint(a),
    end = scenePoint(b),
    dx = end.x - start.x,
    dy = end.y - start.y;
  const distance = Math.hypot(dx, dy),
    nx = (-dy / distance) * 20,
    ny = (dx / distance) * 20;
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const points = `${start.x + nx},${start.y + ny} ${end.x + nx},${end.y + ny} ${end.x - nx},${end.y - ny} ${start.x - nx},${start.y - ny}`;
  let stones = '';
  const segments = Math.floor(distance / 28);
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const x = start.x + dx * t,
      y = start.y + dy * t;
    stones += `<path d="m${x - nx * 0.8} ${y - ny * 0.8} ${nx * 1.6} ${ny * 1.6}" stroke="#8b8168" stroke-width=".8" opacity=".42"/>`;
  }
  return `<g opacity="${discovered ? 0.9 : 0.27}"><polygon points="${points}" fill="#ddd1b1"/><path d="M${start.x + nx} ${start.y + ny} ${end.x + nx} ${end.y + ny}M${start.x - nx} ${start.y - ny} ${end.x - nx} ${end.y - ny}" stroke="#7c7660" fill="none" stroke-width="1" stroke-dasharray="12 8 5 3"/>${stones}<path d="M${start.x} ${start.y}L${end.x} ${end.y}" fill="none" stroke="${INK}" opacity="${discovered ? '.46' : '.3'}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="2 11"/></g>${scatter(`${a.id}-${b.id}`, midpoint.x, midpoint.y, 7, 45)}`;
}

function archive() {
  return `<g transform="translate(-9 -4)"><path d="m-39 9 72 3 16-22-78-13Z" fill="#b0a181" stroke="${INK}" stroke-width="2"/><path d="m-34 9 1 15m58-10-3 13m17-31 1 18" stroke="${INK}" stroke-width="5"/><path d="m-22-30 36 2 12 17-40 4-15-17Z" fill="#ede1c1" stroke="${INK}" stroke-width="2"/><path d="m-18-25 12 1m-10 4 14 2m-11 4 10 1m7-10 12 2m-10 3 13 2m-9 3 13 1M1-27l7 18" stroke="#807456" stroke-width="1.2"/><path d="m22-30 12-6 12 15-13 8Z" fill="#78765d" stroke="${INK}" stroke-width="2"/><path d="m26-27 9-5m-6 10 10-6" stroke="#c7bb97"/><path d="m-44 6-14-3-5 12 12 3Z" fill="#c8b994" stroke="${INK}" stroke-width="1.6"/><path d="m-60 5-3 16m8-4-4 5" stroke="${INK}" stroke-width="1.5"/></g>`;
}

function reeds(x, y) {
  return `<g transform="translate(${x} ${y})" fill="none" stroke="${INK}" stroke-width="1.5"><path d="M0 0q-2-23-13-29M4 1q8-25 16-27M2 0q0-25 3-40m-6 39q-12-8-17-7m24 7 16-11"/><path d="m-12-23-6-9m21 1 2-10m12 23 7-7" stroke-width="4" stroke-linecap="round"/></g>`;
}

function asset(room, cleared) {
  let kind = room.kind;
  if (kind === 'combat') kind = room.id === 'warden' ? 'elite' : 'battle';
  if (kind === 'spring') kind = 'shrine';
  if (kind === 'boss') kind = 'gate';
  const { x, y } = scenePoint(room);
  let content = '';
  switch (kind) {
    case 'start':
      content = `<path d="M-48 19-26 7 12 13 0 23ZM-47 12-27 0 11 6 0 16ZM-43 3-23-8 10-2-1 8Z" fill="#b2aa8c" stroke="${INK}" stroke-width="2"/><use href="#ie-bottle" x="23" y="-24" width="28" height="35"/>${wall(-61, -21, 1, 2)}<path d="m-76 8-9 16 16-4" fill="none" stroke="${INK}" stroke-width="2"/>`;
      break;
    case 'battle':
      content = `${wall(-57, -32, 1, 2)}<use href="#ie-skull" x="39" y="-7" width="24" height="24"/>${cleared ? `<path d="M-29 3q20-15 41-1 13-7 21 5-28 13-64 3Z" fill="${INK}" opacity=".66"/><path d="m-13-6 9 7m9-8-9 8" stroke="#9c997d" stroke-width="1.5"/>` : `<use href="#ie-slime" x="-45" y="-47" width="90" height="75"/>`}`;
      break;
    case 'elite':
      content = `${wall(60, -23, -1, 2)}<use href="#ie-skull" x="-61" y="4" width="28" height="25"/>${cleared ? `<path d="M-32 6q18-17 42-3l19 8-57 4Z" fill="${INK}" opacity=".6"/><path d="m-21 1 8-19 27 1 10 20Z" fill="#77745c" stroke="${INK}" stroke-width="2"/>` : `<g transform="translate(0 -5)"><ellipse cy="25" rx="36" ry="9" fill="${INK}" opacity=".2"/><path d="M-25 17-27-22-17-40 13-45 27-17 23 17 6 24-10 17-26 26Z" fill="#343a2d" stroke="${INK}" stroke-width="2.5"/><path d="m-20-30 4-25 9 6 7-11 9 12 11-6 5 22Z" fill="#74715a" stroke="${INK}" stroke-width="2.5"/><path d="m-13-32 7 9 6-10 7 10 8-11m-29 17 5 11m16-14-3 13" stroke="#ada281" stroke-width="1.5"/><path d="m-12-17 9 2m8-1 9-3" stroke="${RED}" stroke-width="3"/><path d="m-19-2-17 11m53-12 22 8m-75-40-6 55" stroke="${INK}" stroke-width="7"/><path d="m-42-49 14 13-20 3Z" fill="#929078" stroke="${INK}" stroke-width="2"/><path d="m-21 8-1 12M15 4l3 12m-27-20 3 20" stroke="#9a9980" stroke-width="1.3"/></g>`}`;
      break;
    case 'cache':
      if (room.id === 'archive') content = `${wall(-66, -30, 1, 3)}${archive()}`;
      else if (room.id === 'garden')
        content = `${reeds(-43, 15)}${reeds(45, 8)}<use href="#ie-chest" x="-43" y="-48" width="86" height="73"/>`;
      else
        content = `<use href="#ie-chest" x="-45" y="-51" width="90" height="77"/>${wall(66, -24, -1, 2)}<use href="#ie-stone" x="-61" y="1" width="28" height="22"/>`;
      if (room.enemy?.hp > 0)
        content += `<use href="#ie-slime" x="-63" y="-25" width="45" height="38"/>`;
      if (room.claimed ?? cleared)
        content += `<path d="m-11-5 7 6 15-17" fill="none" stroke="#56664f" stroke-width="3.5" stroke-linecap="round"/>`;
      break;
    case 'shrine':
      content = `<use href="#ie-shrine" x="-58" y="-81" width="116" height="112"/>${reeds(-59, 12)}`;
      break;
    case 'merchant':
      content = `<use href="#ie-merchant" x="-72" y="-86" width="144" height="126"/>`;
      break;
    case 'gate':
      content = `<use href="#ie-gate" x="-91" y="-145" width="182" height="187"/><use href="#ie-torch" x="-104" y="-57" width="34" height="76"/><use href="#ie-torch" x="74" y="-51" width="34" height="76"/>`;
      break;
    case 'lore':
      content = archive();
      break;
    default: {
      content = `${wall(-62, -26, 1, 2)}<use href="#ie-stone" x="37" y="2" width="33" height="25"/><path d="m-16-2 29-4 8 12-30 5Z" fill="#c7b99b" stroke="#79745b" stroke-width="1.4"/><path d="m-5-2 6 4-3 6" fill="none" stroke="#79745b" stroke-width="1.2"/>`;
      if (room.id === 'crossing')
        content += `<path d="m24-34 1 42" stroke="${INK}" stroke-width="4"/><path d="m7-35 36-4 9 7-43 7Z" fill="#b7a67c" stroke="${INK}" stroke-width="2"/><path d="m13-32 21-2m-10 13 24-3-1 10-23 1Z" fill="#8e8363" stroke="${INK}" stroke-width="1.5"/>`;
      if (room.id === 'threshold')
        content += `<use href="#ie-torch" x="29" y="-63" width="29" height="66"/>`;
    }
  }
  return `<g transform="translate(${x} ${y})" stroke-linejoin="round" stroke-linecap="round" filter="url(#ie-rough)">${content}</g>`;
}

/** Coordinates shared with accessible room buttons in the HTML layer. */
export function renderScene({
  rooms = [],
  links = [],
  currentRoomId,
  revealed = [],
  cleared = [],
  selectedRoomId,
  combat,
  time = 0,
} = {}) {
  const known = new Set(revealed),
    done = new Set(cleared);
  for (const room of rooms) {
    if (room.revealed) known.add(room.id);
    if (room.cleared || room.claimed) done.add(room.id);
  }
  if (currentRoomId) known.add(currentRoomId);
  const byId = new Map(rooms.map((room) => [room.id, room]));
  const paths = links
    .map((link) => {
      const a = byId.get(Array.isArray(link) ? link[0] : link.from),
        b = byId.get(Array.isArray(link) ? link[1] : link.to);
      return a && b ? corridor(a, b, known.has(a.id) && known.has(b.id)) : '';
    })
    .join('');
  const floors = rooms
    .map((room) => (known.has(room.id) ? floor(room) : `<g opacity=".3">${floor(room)}</g>`))
    .join('');
  const selected = byId.get(selectedRoomId);
  let selectedMark = '';
  if (selected) {
    const p = scenePoint(selected);
    selectedMark = `<g transform="translate(${p.x} ${p.y + 7})"><ellipse rx="64" ry="31" fill="none" stroke="${RED}" stroke-width="1.3" stroke-dasharray="48 4 6 4" opacity=".72"/><path d="M-73 0h12m-6-6v12M61 0h12m-6-6v12" stroke="${RED}" stroke-width="1.4" opacity=".8"/></g>`;
  }
  const heroRoom = byId.get(currentRoomId);
  const objects = [...rooms]
    .sort((a, b) => a.y - b.y)
    .map((room) => {
      const isKnown = known.has(room.id);
      // Architecture is foreshadowed above dry ink; revealing restores its detail.
      const landmark = room.kind === 'boss' || room.kind === 'gate';
      const adjacent = heroRoom?.exits?.includes(room.id);
      let result = isKnown
        ? asset(room, done.has(room.id))
        : `<g opacity="${landmark ? '.96' : adjacent ? '.72' : '.49'}">${asset(room, false)}</g>${fog(room)}`;
      if (heroRoom?.id === room.id) {
        const p = scenePoint(room),
          side = [
            'merchant',
            'spring',
            'shrine',
            'boss',
            'gate',
            'combat',
            'battle',
            'elite',
          ].includes(room.kind)
            ? -44
            : -19;
        result += `<g class="scene-player" transform="translate(${p.x + side} ${p.y + 13})"><ellipse cy="20" rx="28" ry="10" fill="none" stroke="${RED}" stroke-width="1.5" stroke-dasharray="27 5" opacity=".6"/><use href="#ie-hero" x="-39" y="-60" width="78" height="78"/></g>`;
        if (combat)
          result += `<path d="m${p.x + 10} ${p.y - 53} 6-14 6 14m-6-6v8" fill="none" stroke="${RED}" stroke-width="2.5" stroke-linecap="round"/>`;
      }
      return result;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 660" role="img" aria-label="手绘墨迹地牢地图" class="dungeon-svg"><defs>${defs}</defs><rect width="1100" height="660" fill="url(#ie-shade)"/><rect width="1100" height="660" fill="${PAPER}" opacity=".23" filter="url(#ie-paper)"/>
    <g fill="none" stroke="#706c56" opacity=".13"><path d="M17 45 324 24 586 41 801 16 1087 30 1070 600 1091 643 862 628 685 643 328 630 31 646Z" stroke-width="1.4"/><path d="M29 58 299 36 578 51 799 29 1074 41 1057 596 1072 630 854 616 689 632 327 619 44 633Z" stroke-width=".6"/></g>
    <g opacity=".1" fill="${INK}" filter="url(#ie-rough)"><path d="M0 0h260L223 19 144 21 163 31 74 25 103 44 0 65ZM1100 660H796l93-27-17-16 88-7-19-11 65-4 94-47ZM0 480l19 48-5 22 22 11-14 59 66 40H0Z"/></g>
    <g opacity=".29" stroke="${INK}" stroke-linejoin="round"><path d="m61 349 5-150 8-4 4-61 9 30 13-68 11 71 12-15 6 78 12 4 5 125Z" fill="#7d7c66"/><path d="m48 357 9-83 11-6m72 64 12-80 12 97M71 304l3-83m21 108 3-143m-17 27 8-2m13 26 8-1m-24 33 9-2" fill="none" stroke-width="2"/><path d="m60 349-28 50 37-14 21 6 34-17 43 14-17-28" fill="#8e866c" stroke-width="2"/><path d="m39 397 16 5 14-4m49-2 23-4 17 5" fill="none"/></g>
    ${scatter('page-dust', 550, 330, 130, 570)}${paths}${floors}${selectedMark}${objects}
    <g transform="translate(1004 532)" stroke="${INK}" opacity=".43" fill="none"><circle r="30" stroke-width=".8"/><circle r="24" stroke-width=".65" stroke-dasharray="1 4"/><path d="M0-39 6-6 39 0 6 5 0 40-5 5-39 0-6-5Z" stroke-width="1.2"/><path d="M0-39 0 0 6-6ZM0 0 0 40-5 5ZM0 0 39 0 6 5ZM0 0-39 0-6-5Z" fill="${INK}"/><path d="m-3-47 0-8 6 8v-8" stroke-width="1.2"/><path d="m-44 49 21-3 11 2 23-5 37 2" stroke-width=".8"/></g>
    <g transform="translate(110 586) rotate(-6)" fill="none" stroke="${INK}" opacity=".26"><path d="M0 0h96m-94 4h52m-53 3h90m-86 6h64m-58 6h70" stroke-width="1.4"/><path d="m-6-8-3 35m107-31 2 32" stroke-width=".9"/></g>
  </svg>`;
}

const iconPaths = {
  ink: '<path d="M9 3h6v4l4 4v10H5V11l4-4Z"/><path d="M8 3h8M5 13h14"/><path d="m12 11-3 5a3 3 0 0 0 6 0Z" fill="currentColor" stroke="none"/>',
  heart:
    '<path d="M20.4 5.6a5.1 5.1 0 0 0-7.3 0L12 6.7l-1.1-1.1a5.1 5.1 0 0 0-7.3 7.2L12 21l8.4-8.2a5.1 5.1 0 0 0 0-7.2Z"/>',
  key: '<circle cx="8" cy="8" r="5"/><path d="m11.5 11.5 9 9m-4-4 3-3m-6 0 3-3"/><circle cx="7" cy="7" r="1" fill="currentColor" stroke="none"/>',
  map: '<path d="m3 5 6-2 6 3 6-2v15l-6 2-6-3-6 2Z"/><path d="M9 3v15m6-12v15M6 9l1 1m5 1 1 1m5-1 1 1"/>',
  attack:
    '<path d="m5 20 9-12 7-5-3 8-11 11ZM5 14l6 5M4 20l-2 2"/><path d="m15 2 1 2M5 6l3 2m12 9 2 1M3 11h3"/>',
  heal: '<path d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5Z"/><path d="M12 8v8m-4-4h8"/>',
  trade:
    '<path d="m6 3 11 1 2 17-14-1ZM9 7l6 1M8 11l8 1M8 15l4 1"/><path d="m2 10 3 3-3 3m20-7-3 3 3 3"/>',
  brush:
    '<path d="m7 14 9-12 4 3-9 12Z"/><path d="M7 14c-6 0-1 7-6 8 9 1 13-3 10-6Z" fill="currentColor"/><path d="m15 5 3 3"/>',
  dodge: '<path d="M5 17c-5-7 7-13 13-6m-3-5 5 6-8 1"/><path d="m9 18 5-3 5 3-5 3Z"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  sound:
    '<path d="m3 9 5-1 5-5v18l-5-5-5-1Z"/><path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="m3 9 5-1 5-5v18l-5-5-5-1Z"/><path d="m17 9 5 6m0-6-5 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 0c0 3-3 2-3 5m0 3v.5"/>',
  restart: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
  close: '<path d="m5 5 14 14M5 19 19 5"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  shield: '<path d="m12 2 9 4-2 10-7 6-7-6L3 6Z"/><path d="m8 12 3 3 6-7"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  pause: '<path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor" stroke="none"/>',
};

export function icon(name, className = '') {
  return `<svg class="icon ${escape(className)}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.ink}</svg>`;
}

let vignetteSerial = 0;
/** Small chapter-card illustrations, all sharing the same original character. */
export function renderVignette(name) {
  let art;
  if (name === 'map')
    art = `<path d="m20 78 12-56 68-8 79 10-5 65-75-13Z" fill="#c7bc9c" stroke="${INK}" stroke-width="2"/><path d="M37 36h117M34 54h124M31 72h129M57 21l-4 57m27-60-1 59m24-58 4 60m21-58 4 58" stroke="#81785f" opacity=".6"/><path d="m46 65 28-7 18-20 27 13 24-8" fill="none" stroke="${INK}" stroke-width="3" stroke-dasharray="3 5"/><path d="m62 20 40 35 8-7-39-35Z" fill="#c0ad80" stroke="${INK}" stroke-width="2"/><path d="m102 55 19 13-4-19-7-1Z" fill="${INK}"/><circle cx="143" cy="44" r="8" fill="none" stroke="${RED}" stroke-width="2"/>`;
  else if (name === 'attack')
    art = `<use href="#ie-hero" x="15" y="14" width="70" height="81"/><use href="#ie-slime" x="139" y="42" width="65" height="56"/><path d="M88 61q25-9 42 0l-10 8-27-4Z" fill="${INK}"/><path d="m96 50 20-2M94 73l11-1m25-20 5-2" stroke="${INK}" stroke-width="1.5"/><path d="m191 33 4-7m7 15 8-2m-5 16h9" stroke="${RED}" stroke-width="2"/>`;
  else if (name === 'heal')
    art = `<use href="#ie-hero" x="29" y="16" width="80" height="84"/><use href="#ie-bottle" x="114" y="50" width="35" height="42"/><path d="M145 33c-19-20-32 4-19 15l19 16 19-19c13-16-4-29-19-12Z" fill="${RED}" stroke="${INK}" stroke-width="2"/><path d="M183 39v16m-8-8h16m-87-30v12m-6-6h12" stroke="#607057" stroke-width="2.5"/>`;
  else
    art = `<use href="#ie-merchant" x="43" y="0" width="130" height="114"/><use href="#ie-bottle" x="15" y="58" width="32" height="37"/><path d="m190 37 18 3-2 27-24-4Z" fill="#e4d7b6" stroke="${INK}" stroke-width="1.5"/><path d="m188 45 13 2m-14 3 11 2m-12 3 12 2m-14 3 6 1" stroke="#76674a"/>`;
  // IDs receive a unique prefix so multiple SVG illustrations never share filters.
  const prefix = `ie-card-${String(name).replace(/[^a-z]/gi, '')}-${++vignetteSerial}-`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 114" aria-hidden="true" class="vignette"><defs>${defs.replaceAll('id="ie-', `id="${prefix}`).replaceAll('#ie-', `#${prefix}`)}</defs><path d="M4 99q100-15 211 1" stroke="${INK}" fill="none" opacity=".3"/>${art.replaceAll('#ie-', `#${prefix}`)}</svg>`;
}
