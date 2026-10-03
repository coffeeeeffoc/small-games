import { INK, RED } from './palette.mjs';

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

const liveSpriteDefs = `
<symbol id="ie-guard" viewBox="-58 -73 116 117">
<ellipse cy="29" rx="38" ry="10" fill="#20221d" opacity=".2"/>
<path d="M-25 17-27-22-17-40 13-45 27-17 23 17 6 24-10 17-26 26Z" fill="#343a2d" stroke="#20221d" stroke-width="2.5"/>
<path d="m-20-30 4-25 9 6 7-11 9 12 11-6 5 22Z" fill="#74715a" stroke="#20221d" stroke-width="2.5"/>
<path d="m-13-32 7 9 6-10 7 10 8-11m-29 17 5 11m16-14-3 13" stroke="#ada281" fill="none" stroke-width="1.5"/>
<path d="m-12-17 9 2m8-1 9-3" stroke="#bc694d" stroke-width="3"/>
<path d="m-19-2-17 11m53-12 22 8m-75-40-6 55" stroke="#20221d" stroke-width="7"/>
<path d="m-42-58 14 13-20 3Z" fill="#929078" stroke="#20221d" stroke-width="2"/>
<path d="m-21 8-1 12M15 4l3 12m-27-20 3 20m-9-6-2 8M12 10l2 9" stroke="#9a9980" fill="none" stroke-width="1.3"/>
<path d="m-18 23-6 9 16 1 7-8m12-1 4 9 14 1-9-10" fill="#20221d"/>
</symbol>
<symbol id="ie-boss" viewBox="-85 -117 170 155">
<ellipse cy="20" rx="67" ry="14" fill="#20221d" opacity=".28"/>
<path d="M-60 18q-19-8-3-25l9-32-7-23 20 6 14-27 55-4 26 31 3 29 15 19-13 24-27-3-18 8-26-6-28 6Z" fill="#242c21" stroke="#121910" stroke-width="3"/>
<path d="m-44-52 4-36 11 11 14-29 14 26 18-25 8 26 16-14 4 37Z" fill="#74745a" stroke="#182116" stroke-width="3"/>
<path d="m-41-56 82 1m-65-22 3 15m25-19 1 18m23-14-3 15" fill="none" stroke="#c0b68e" stroke-width="2"/>
<path d="m-32-35 21 4-10 9-12-7m43-1 21-9-1 12-18 6" fill="#b5563f" stroke="#d28a5d" stroke-width="1.5"/>
<path d="m-3-29-8 20 15-1Zm-32 24 18 8 18-5 12 5 20-10" stroke="#6a7155" fill="none" stroke-width="2.5"/>
<path d="m-49-14 5 18m82-19-1 15m-70-41 6-7m41-11 8 8m-36 41 1 8m-15-64 10-6" stroke="#738061" stroke-width="1.5" fill="none"/>
<path d="m-70 12-8 5m133 0 16 4m-22 8 6 3m-110 1-9 2" stroke="#20221d" stroke-width="4" stroke-linecap="round"/>
</symbol>`;
export const SPRITES = {
  hero: { symbol: 'hero', w: 84, h: 84, foot: 15 },
  slime: { symbol: 'slime', w: 71, h: 59, foot: 15 },
  guard: { symbol: 'guard', w: 98, h: 99, foot: 25 },
  boss: { symbol: 'boss', w: 155, h: 141, foot: 28 },
  chest: { symbol: 'chest', w: 92, h: 78, foot: 22 },
  spring: { symbol: 'shrine', w: 108, h: 104, foot: 21 },
  merchant: { symbol: 'merchant', w: 147, h: 129, foot: 36 },
  gate: { symbol: 'gate', w: 148, h: 152, foot: 28 },
  bottle: { symbol: 'bottle', w: 31, h: 37, foot: 12 },
  skull: { symbol: 'skull', w: 29, h: 29, foot: 11 },
  stone: { symbol: 'stone', w: 36, h: 27, foot: 13 },
  torch: { symbol: 'torch', w: 34, h: 77, foot: 7 },
};

export function makeSprite(spec) {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${spec.w * 3}" height="${spec.h * 3}" viewBox="0 0 ${spec.w} ${spec.h}"><defs>${defs}${liveSpriteDefs}</defs><use href="#ie-${spec.symbol}" width="${spec.w}" height="${spec.h}"/></svg>`)}`;
  return { ...spec, img };
}
