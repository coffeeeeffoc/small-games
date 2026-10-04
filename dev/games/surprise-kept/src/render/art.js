/** Original vector artwork, intentionally independent of game state and input. */
let artworkSequence = 0;
const INK = '#65432e';
const nextId = (name) => `surprise-${name}-${++artworkSequence}`;
const svg = (viewBox, contents) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" aria-hidden="true" focusable="false" fill="none">${contents}</svg>`;
const color = (value, fallback) =>
  typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
const escapeText = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );

function roomArt(theme = {}) {
  const id = nextId('room');
  const palette = theme.palette || {};
  const wall = color(palette.wall, '#f8d1ac');
  const floor = color(palette.floor, '#d8996a');
  const curtain = color(palette.curtain, '#ee9c9f');
  const accent = color(palette.accent, '#d77860');
  const banner = theme.banner || 'HAPPY BIRTHDAY';
  const boards = [223, 254, 294, 342, 399, 464, 538]
    .map(
      (y, i) =>
        `<path d="M0 ${y} Q202 ${y - 8} 420 ${y}" stroke="#a66f4f" stroke-width="1.25" opacity=".47"/>
       <path d="M0 ${y + 3} Q202 ${y - 5} 420 ${y + 3}" stroke="#ffd1a5" stroke-width="1.25" opacity=".52"/>
       <path d="M${(i % 2) * 46 + 12} ${y + 7} q24 -4 40 0 m${90 + i * 4} 8 q34 -4 51 -1 m80 -8 q22 -2 36 0" stroke="#b37a53" stroke-width=".8" opacity=".22"/>`,
    )
    .join('');
  const seams = [
    [28, 205, -95, 580],
    [119, 205, 56, 580],
    [205, 205, 208, 580],
    [293, 205, 359, 580],
    [389, 205, 510, 580],
  ]
    .map(
      ([x1, y1, x2, y2]) =>
        `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="#9e6949" stroke-width="1" opacity=".36"/>`,
    )
    .join('');
  const flags = [
    [91, 8, '#e89b82', 18],
    [122, 18, '#f0c274', 18],
    [152, 23, '#79b6bd', 16],
    [182, 28, '#e7988f', 18],
    [214, 31, '#eebc66', 20],
    [249, 28, '#92b7a1', 17],
    [281, 23, '#f0a58e', 19],
    [311, 14, '#b7a1be', 17],
  ]
    .map(
      ([x, y, fill, h]) =>
        `<path d="M${x} ${y} l22 3 -11 ${h}z" fill="${fill}" stroke="#a3795d" stroke-width="1.1"/>`,
    )
    .join('');
  const leaves = [
    [395, 117, -34],
    [417, 102, 36],
    [399, 90, -25],
    [418, 74, 22],
    [402, 62, -35],
  ]
    .map(
      ([x, y, r]) =>
        `<ellipse cx="${x}" cy="${y}" rx="6" ry="13" transform="rotate(${r} ${x} ${y})" fill="#89a875" stroke="#637d51" stroke-width="1.4"/>`,
    )
    .join('');
  return svg(
    '0 0 420 580',
    `
      <defs>
        <linearGradient id="${id}-wall" x2=".7" y2="1"><stop stop-color="#ffe5c9"/><stop offset="1" stop-color="${wall}"/></linearGradient>
        <linearGradient id="${id}-floor" x2="0" y2="1"><stop stop-color="#e2b189"/><stop offset="1" stop-color="${floor}"/></linearGradient>
        <linearGradient id="${id}-curtain" x2="1"><stop stop-color="#f8c1b8"/><stop offset=".45" stop-color="${curtain}"/><stop offset=".72" stop-color="#e38d8c"/><stop offset="1" stop-color="#f3b0a7"/></linearGradient>
        <linearGradient id="${id}-wood" x2="1" y2=".3"><stop stop-color="#cf9d65"/><stop offset=".5" stop-color="#e4b47c"/><stop offset="1" stop-color="#bf8852"/></linearGradient>
        <linearGradient id="${id}-sofa" x2=".4" y2="1"><stop stop-color="#f6bcb3"/><stop offset="1" stop-color="#da8d91"/></linearGradient>
        <linearGradient id="${id}-sky" x2="0" y2="1"><stop stop-color="#b9dfde"/><stop offset="1" stop-color="#f0ead2"/></linearGradient>
        <radialGradient id="${id}-light"><stop stop-color="#fff4d3" stop-opacity=".75"/><stop offset="1" stop-color="#fff4d3" stop-opacity="0"/></radialGradient>
        <pattern id="${id}-paper" width="17" height="19" patternUnits="userSpaceOnUse"><path d="M3 4h1m8 9h1M8 18h.4" stroke="#9b6a41" stroke-width=".6" opacity=".12"/></pattern>
        <pattern id="${id}-rug" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 1h4M1 0v4" stroke="#b79662" stroke-width=".4" opacity=".2"/></pattern>
        <clipPath id="${id}-window"><path d="M-7 25h87v132H-7z"/></clipPath>
        <path id="${id}-banner-path" d="M119 126 Q213 143 309 125"/>
      </defs>
      <path d="M0 0H420V207H0z" fill="url(#${id}-wall)"/>
      <path d="M0 196 Q208 190 420 195V580H0z" fill="url(#${id}-floor)"/>
      <path d="M0 196 Q209 190 420 195" stroke="#9c6e50" stroke-width="13"/>
      <path d="M0 192 Q211 186 420 191" stroke="#dcac7b" stroke-width="5"/>
      <path d="M0 202 Q206 196 420 201" stroke="#b58260" stroke-width="2"/>
      ${boards}${seams}
      <ellipse cx="184" cy="287" rx="215" ry="147" fill="url(#${id}-light)" opacity=".8"/>
      <path d="M-9 15h96v148H-9z" fill="#a77c56" stroke="${INK}" stroke-width="3"/>
      <g clip-path="url(#${id}-window)">
        <path d="M-3 22h79v135H-3z" fill="url(#${id}-sky)"/>
        <path d="M-8 119q15 -35 35 -13 23 -40 40 -11 17 -13 29 2v74H-8z" fill="#aac294"/>
        <path d="M-4 142q18 -23 43 -8 21 -26 40 -7v31H-4z" fill="#7eab83"/>
        <path d="M-3 83q16 -8 23 -2m15 -33q16 -10 27 -3" stroke="#fff9e9" stroke-width="6" stroke-linecap="round" opacity=".9"/>
      </g>
      <path d="M-3 21h81v138H-3zM39 22v133M-3 90h80" stroke="#f4ce9d" stroke-width="5"/>
      <path d="M39 23v132M-2 90h80" stroke="#ad805b" stroke-width="1.2"/>
      <path d="M-8 155h96v9H-8z" fill="#d8a875" stroke="${INK}" stroke-width="2"/>
      <path d="M16 0Q7 40 21 83Q20 103 12 157Q23 163 35 155Q29 121 29 91Q48 53 39 0Z" fill="url(#${id}-curtain)" stroke="#92634c" stroke-width="2"/>
      <path d="M21 4q-3 57 5 84M34 4q3 45 -8 86M23 101q-1 30 -5 48M28 105q2 25 2 43" stroke="#b57567" stroke-width="1.5" fill="none"/>
      <path d="M20 89q9 5 14 -1l-2 9q-7 4 -13 -1z" fill="#e7bc73" stroke="#9f7152" stroke-width="1.3"/>
      <path d="M80 0q-10 31 -2 74q7 13 7 46l14 -2q-6 -32 -4 -56L100 0z" fill="url(#${id}-curtain)" stroke="#a3735a" stroke-width="1.6"/>
      <path d="M84 3q-5 38 2 64" stroke="#c78275" stroke-width="1.5"/>
      <path d="M0 2h107" stroke="#896349" stroke-width="6" stroke-linecap="round"/>
      <path d="M78 4 Q212 61 336 3" stroke="#a78264" stroke-width="1.4"/>
      ${flags}
      <path d="M112 103Q213 118 316 100L311 137Q212 156 117 137z" fill="#f9e5bc" stroke="#c39372" stroke-width="1.7"/>
      <path d="M113 107q102 16 202 -4" stroke="#fff1d3" stroke-width="2"/>
      <text fill="${accent}" font-family="'Trebuchet MS', sans-serif" font-size="15.5" font-weight="900" letter-spacing="1.3"><textPath href="#${id}-banner-path" startOffset="50%" text-anchor="middle">${escapeText(banner)}</textPath></text>
      <path d="M315 120q3 -6 6 -2 4 -5 6 0 1 4 -6 8z" fill="#d97e70"/>
      <g stroke="${INK}" stroke-linecap="round" stroke-linejoin="round">
        <path d="M346 43l49 -1 2 147 -53 3z" fill="#bd8c5c" stroke-width="2.5"/>
        <path d="M352 49h38v119h-39z" fill="#a07951" stroke-width="1.5"/>
        <path d="M346 45l7 6M390 49l5 -6" stroke="#e7b98c" stroke-width="1.5"/>
        <path d="M351 83h40v6h-40zM350 125h42v6h-42z" fill="#d7a672" stroke-width="1.5"/>
        <path d="M355 54h7v27h-7z" fill="#b6a3b8" stroke-width="1.2"/>
        <path d="M365 53h8v28h-8z" fill="#809aa3" stroke-width="1.2"/>
        <path d="M376 56l7 -1 4 25 -8 1z" fill="#e1b18e" stroke-width="1.2"/>
        <path d="M357 58v18M368 56v20M380 59l3 18" stroke="#edd8bc" stroke-width=".9" opacity=".8"/>
        <path d="M354 93h15v26h-15z" fill="#d9b27f" stroke-width="1.4"/>
        <path d="M357 96h9v19h-9z" fill="#f4dbad" stroke-width="1"/>
        <path d="M359 110l3 -10 3 10z" fill="#ba8860" stroke-width=".8"/>
        <path d="M375 99h11v23h-11z" fill="#bd7970" stroke-width="1.1"/>
        <path d="M376 102h8m-8 16h8" stroke="#e5b8a1" stroke-width=".9"/>
        <path d="M351 137h37v42h-37z" fill="url(#${id}-wood)" stroke-width="1.5"/>
        <path d="M370 140v36" stroke="#ac794d" stroke-width="1"/>
        <circle cx="366" cy="158" r="1.7" fill="#885c3c" stroke="none"/>
        <circle cx="375" cy="158" r="1.7" fill="#885c3c" stroke="none"/>
        <path d="M350 189v8m40 -10v8" stroke-width="4"/>
        <path d="M367 41l-2 -15h21l-3 15z" fill="#d7b28a" stroke-width="1.6"/>
        <path d="M375 27V9m0 13 -9 -8m10 3 8 -8" stroke="#6f8053" stroke-width="2"/>
        <path d="M375 11q-14 2 -11 -8 9 -3 11 8M376 18q10 2 12 -7 -10 -4 -12 7M374 23q-14 3 -14 -6 9 -4 14 6" fill="#87a471" stroke="#667b53" stroke-width="1.2"/>
        <path d="M409 143l-3 -70m3 43 -11 -9m10 -11 9 -6" stroke="#728650" stroke-width="2.2"/>
        ${leaves}
        <path d="M396 137h23l-3 24h-17z" fill="#d6ac71" stroke-width="1.8"/>
        <path d="M401 140l1 17m8 -18v18" stroke="#a97d50" stroke-width=".9"/>
        <path d="M0 198q16 -17 14 -40" stroke="#6f8053" stroke-width="3"/>
        <path d="M10 170q-21 -12 -22 0 7 13 22 0M11 175q25 -23 26 -8 -2 15 -26 8M8 183q-21 -3 -17 9 10 9 17 -9M12 160q19 -9 15 -19 -14 -3 -15 19" fill="#8daa76" stroke="#697b52" stroke-width="1.6"/>
        <path d="M-4 196h22l-3 24H0z" fill="#b9baa1" stroke-width="1.6"/>
        <path d="M84 169l-3 -15h24l-4 15z" fill="#ba9c83" stroke-width="1.6"/>
        <path d="M92 155l-1 -19m1 13 -8 -8m8 4 7 -10" stroke="#728955" stroke-width="1.4"/>
        <path d="M90 143q-15 0 -10 -9 8 -1 10 9M91 150q16 2 13 -8 -9 -2 -13 8" fill="#93ad7c" stroke="#748a5b" stroke-width="1.2"/>
        <ellipse cx="55" cy="205" rx="26" ry="6" fill="#85562f" opacity=".17" stroke="none"/>
        <ellipse cx="52" cy="183" rx="16" ry="20" fill="#c9945f" stroke-width="1.9"/>
        <circle cx="40" cy="157" r="8" fill="#c9945f" stroke-width="1.7"/>
        <circle cx="66" cy="157" r="8" fill="#c9945f" stroke-width="1.7"/>
        <circle cx="40" cy="157" r="4" fill="#e3b57d" stroke="none"/>
        <circle cx="66" cy="157" r="4" fill="#e3b57d" stroke="none"/>
        <path d="M36 166q1 -15 17 -15 17 0 19 15 1 15 -18 17 -18 -1 -18 -17z" fill="#d4a06a" stroke-width="1.8"/>
        <ellipse cx="54" cy="172" rx="9" ry="7" fill="#edc58e" stroke="none"/>
        <circle cx="45" cy="164" r="1.9" fill="#513b2a" stroke="none"/>
        <circle cx="63" cy="164" r="1.9" fill="#513b2a" stroke="none"/>
        <path d="M51 169q3 -2 6 0l-3 4z" fill="#6c4d34" stroke-width=".5"/>
        <path d="M54 173v3m-4 0q4 3 8 -1" stroke-width="1" fill="none"/>
        <ellipse cx="38" cy="186" rx="6" ry="10" transform="rotate(20 38 186)" fill="#d6a16b" stroke-width="1.6"/>
        <ellipse cx="70" cy="186" rx="6" ry="10" transform="rotate(-17 70 186)" fill="#d6a16b" stroke-width="1.6"/>
        <ellipse cx="43" cy="202" rx="8" ry="7" fill="#dbad75" stroke-width="1.6"/>
        <ellipse cx="64" cy="202" rx="8" ry="7" fill="#dbad75" stroke-width="1.6"/>
        <ellipse cx="54" cy="190" rx="8" ry="9" fill="#e4b97f" stroke="none"/>
        <path d="M52 182l-6 -5 -2 8 8 -1 9 1 -2 -8z" fill="#c9776c" stroke-width="1"/>
        <circle cx="53" cy="182" r="2" fill="#d98b7b" stroke-width=".8"/>
        <path d="M372 159l53 -4v15l-51 7z" fill="#b78b66" stroke-width="2"/>
        <path d="M377 174l-4 42m43 -50 6 35" stroke="#8e6345" stroke-width="4"/>
        <path d="M367 155q26 -8 59 -2l5 35q-8 6 -15 -2 -8 9 -16 2 -7 11 -15 1 -8 7 -18 -1z" fill="#ffebda" stroke="#ba8a72" stroke-width="1.7"/>
        <path d="M378 164q-4 10 -2 18m23 -20 -3 20m22 -22 4 18" stroke="#edc2ae" stroke-width="1.6"/>
        <ellipse cx="398" cy="151" rx="26" ry="7" fill="#e5c7ae" stroke="#b58870" stroke-width="1.2"/>
        <path d="M377 143v9q22 9 43 -1v-13z" fill="#e8988c" stroke="#a8795d" stroke-width="1.5"/>
        <ellipse cx="398" cy="140" rx="21" ry="7" fill="#fff5dc" stroke="#be987b" stroke-width="1.4"/>
        <path d="M378 141v6q5 6 7 -1 5 6 8 0 4 7 8 -1 5 7 9 -1 5 4 8 -2v-2" fill="#fff5dc" stroke="#ceac92" stroke-width="1"/>
        <path d="M383 135v-7m12 5v-10m12 12v-9m8 12v-7" stroke="#ee9f86" stroke-width="3"/>
        <path d="M383 127q-4 -5 1 -8 4 6 -1 8m11 -6q-4 -5 1 -8 4 5 -1 8m13 4q-4 -5 1 -8 4 5 -1 8m7 5q-4 -5 1 -8 4 5 -1 8" fill="#f9c95a" stroke="#dd9a43" stroke-width=".8"/>
      </g>
      <ellipse cx="211" cy="265" rx="177" ry="57" fill="#93663c" opacity=".13"/>
      <ellipse cx="210" cy="260" rx="177" ry="56" fill="#f3dc9c" stroke="#d3ae73" stroke-width="1.5"/>
      <ellipse cx="210" cy="260" rx="168" ry="49" fill="#f8e3ad" stroke="#e5c48e" stroke-width="3"/>
      <ellipse cx="210" cy="260" rx="167" ry="48" fill="url(#${id}-rug)"/>
      <ellipse cx="210" cy="260" rx="158" ry="42" stroke="#e7c890" stroke-width="1" stroke-dasharray="3 4"/>
      <g stroke="${INK}" stroke-linecap="round" stroke-linejoin="round">
        <ellipse cx="27" cy="388" rx="52" ry="12" fill="#92613e" opacity=".2" stroke="none"/>
        <path d="M-12 349l-2 53m69 -50 4 48" stroke="#795235" stroke-width="7"/>
        <path d="M-11 350l-2 51m68 -47 3 42" stroke="#bc8b59" stroke-width="3"/>
        <path d="M-23 337q54 -24 95 1v25q-37 18 -94 -2z" fill="#b88356" stroke-width="2.1"/>
        <ellipse cx="25" cy="338" rx="50" ry="17" fill="url(#${id}-wood)" stroke-width="2.3"/>
        <path d="M-10 332q35 -11 65 1m-57 5q28 -10 54 -2" stroke="#b78150" stroke-width="1" opacity=".55"/>
        <path d="M-15 345q40 13 79 -1" stroke="#e7b585" stroke-width="2"/>
        <ellipse cx="20" cy="326" rx="25" ry="7" fill="#e0c49d" stroke="#a77e59" stroke-width="1"/>
        <path d="M18 315q-4 -9 4 -13 7 -2 10 5l3 9q-2 10 -13 10 -10 -1 -9 -9z" fill="#faf2dc" stroke-width="1.4"/>
        <path d="M32 309q14 -6 9 7 -3 6 -8 2" stroke="#f8eed6" stroke-width="4"/>
        <path d="M32 309q14 -6 9 7 -3 6 -8 2" stroke="#95724f" stroke-width="1.2"/>
        <path d="M17 314l-8 -6 -2 2 7 10" fill="#f8eed6" stroke-width="1.3"/>
        <ellipse cx="24" cy="305" rx="8" ry="2.4" fill="#eadcc0" stroke-width="1"/>
        <circle cx="25" cy="301" r="2.3" fill="#f7efda" stroke-width="1"/>
        <path d="M1 321v7q7 5 13 -1v-7" fill="#fff4df" stroke-width="1"/>
        <ellipse cx="7" cy="320" rx="7" ry="2.4" fill="#be9870" stroke-width="1"/>
        <path d="M14 322q6 -1 4 4 -1 2 -4 1" stroke="#a5835f" stroke-width="1.3"/>
        <path d="M22 295q-4 -4 0 -8m8 9q-3 -4 0 -7" stroke="#fff6dd" stroke-width="1.6" opacity=".8"/>
        <ellipse cx="5" cy="511" rx="74" ry="19" fill="#88563c" opacity=".19" stroke="none"/>
        <path d="M-27 424q11 -13 25 -10l62 19q11 4 13 24l-4 48 -98 9z" fill="url(#${id}-sofa)" stroke-width="2.7"/>
        <path d="M-20 431q5 -10 16 -8l60 18q10 1 10 17l-3 22 -83 8z" fill="#edaaa4" stroke="#b77c70" stroke-width="1.5"/>
        <path d="M-17 457q20 -14 43 -4l36 14q10 9 5 25l-79 13z" fill="#f9d4c5" stroke="#b48071" stroke-width="1.8"/>
        <path d="M-19 468q26 -10 39 -4m5 1q25 6 30 12" stroke="#e9b5a8" stroke-width="2"/>
        <path d="M-21 493l85 -10 -1 27 -84 14z" fill="#dfa39a" stroke-width="2"/>
        <path d="M60 451q16 1 15 16l-4 43q-2 9 -12 9l-5 -4 3 -52q0 -10 3 -12z" fill="#e0a196" stroke-width="2.2"/>
        <path d="M-10 510v16m72 -12v10" stroke="#805638" stroke-width="5"/>
        <path d="M7 435l9 -8 7 11 13 -1 -1 13 7 10 -13 5 -6 10 -10 -7 -12 1 -1 -13 -6 -11z" fill="#f8d88a" stroke="#d7ac6e" stroke-width="1.5"/>
        <path d="M8 446q12 -9 23 2" stroke="#ffe8ad" stroke-width="2"/>
      </g>
      <path d="M0 0H420V580H0z" fill="url(#${id}-paper)" pointer-events="none"/>
    `,
  );
}

function boxArt(boxColor, { active = false, ghost = false } = {}) {
  const id = nextId('box');
  const palettes = {
    red: ['#ed624b', '#b83429', '#fa9470', '#f4c766', '#d59b3b'],
    blue: ['#558ce5', '#345cb4', '#91b8fa', '#c7defa', '#7caaed'],
    green: ['#8bbb62', '#548d45', '#b6d594', '#d8e6ab', '#96b775'],
  };
  const [front, side, top, ribbon, ribbonShade] = palettes[boxColor] || palettes.red;
  return svg(
    '0 0 104 106',
    `
      <defs><linearGradient id="${id}" x2=".4" y2="1"><stop stop-color="${top}"/><stop offset=".4" stop-color="${front}"/><stop offset="1" stop-color="${front}"/></linearGradient></defs>
      ${active ? '<ellipse cx="52" cy="96" rx="48" ry="9" fill="#f9d76a" opacity=".75"/>' : ''}
      <ellipse cx="53" cy="96" rx="44" ry="8" fill="#765033" opacity=".19"/>
      <g stroke="${INK}" stroke-linejoin="round" stroke-linecap="round" stroke-width="1.65" opacity="${ghost ? '.45' : '1'}">
        <path d="M9 39L85 40V95L10 94Z" fill="url(#${id})"/>
        <path d="M85 40L98 27V82L85 95Z" fill="${side}"/>
        <path d="M9 39L22 24 98 27 85 41Z" fill="${top}"/>
        <path d="M8 36L21 22 98 25 85 39Z" fill="${top}"/>
        <path d="M8 36L85 39V48L9 46Z" fill="${front}"/>
        <path d="M85 39L98 25V35L85 48Z" fill="${side}"/>
        <path d="M43 47L55 47V94L43 94Z" fill="${ribbon}" stroke-width="1.1"/>
        <path d="M43 37L54 38 67 24 55 23Z" fill="${ribbon}" stroke-width="1"/>
        <path d="M43 38v9h12v-9" fill="${ribbon}" stroke-width="1"/>
        <path d="M88 41l7 -7v48l-7 7Z" fill="${ribbonShade}" stroke="none" opacity=".3"/>
        <path d="M49 25C37 5 23 8 28 20C31 27 43 30 50 28Z" fill="${ribbon}" stroke-width="1.5"/>
        <path d="M49 25C62 3 76 10 70 20C66 28 56 29 50 28Z" fill="${ribbon}" stroke-width="1.5"/>
        <path d="M45 24Q38 13 31 16Q33 21 44 25M54 24Q62 13 67 15Q65 21 55 26" fill="${ribbonShade}" stroke-width=".7" opacity=".85"/>
        <path d="M45 27L33 36 42 34 47 39 53 28Z" fill="${ribbon}" stroke-width="1"/>
        <path d="M51 27L61 38 61 32 70 34 55 25Z" fill="${ribbon}" stroke-width="1"/>
        <path d="M45 23q6 -4 11 0l1 6q-6 4 -12 0z" fill="${ribbon}" stroke-width="1.2"/>
        <path d="M14 51v36M18 52v24" stroke="#fff3cd" stroke-width="1.1" opacity=".2"/>
        <path d="M13 92h66" stroke="${side}" stroke-width="1" opacity=".35"/>
      </g>
      ${active ? `<path d="M5 35L20 19 101 23V84L87 100 6 98Z" stroke="#fff9d7" stroke-width="2" stroke-dasharray="5 3"/>` : ''}
    `,
  );
}

function characterArt(character, expression = 'thinking') {
  const id = nextId('character');
  const isOrange = character === 'orange' || character === 'xiaocheng';
  const shirt = isOrange ? '#f4a441' : '#5799d5';
  const shade = isOrange ? '#df8328' : '#3478b6';
  const hair = isOrange ? '#a16639' : '#554232';
  const hairShade = isOrange ? '#784728' : '#3e332b';
  const happy = expression === 'happy';
  const walking = expression === 'walking';
  const faceEyes = happy
    ? '<path d="M43 60q5 -7 9 0m10 0q5 -7 9 0" stroke="#493124" stroke-width="2.4" fill="none"/>'
    : '<ellipse cx="49" cy="59" rx="3" ry="5" fill="#493124"/><ellipse cx="68" cy="59" rx="3" ry="5" fill="#493124"/><circle cx="50" cy="57.5" r=".9" fill="#fff9e8"/><circle cx="69" cy="57.5" r=".9" fill="#fff9e8"/>';
  return svg(
    '0 0 110 150',
    `
      <defs>
        <linearGradient id="${id}-shirt" x2=".2" y2="1"><stop stop-color="${shirt}"/><stop offset="1" stop-color="${shade}"/></linearGradient>
        <linearGradient id="${id}-hair" x2=".8" y2="1"><stop stop-color="${hair}"/><stop offset="1" stop-color="${hairShade}"/></linearGradient>
        <linearGradient id="${id}-skin" x2=".5" y2="1"><stop stop-color="#ffebcd"/><stop offset="1" stop-color="#f4c99e"/></linearGradient>
      </defs>
      <ellipse cx="56" cy="143" rx="30" ry="5" fill="#735035" opacity=".18"/>
      <g stroke="#5c3d2b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        ${isOrange ? `<circle cx="77" cy="25" r="13" fill="${hair}"/><path d="M69 18q13 -4 14 8m-12 -11q12 0 13 8" stroke="#bf8953" stroke-width="1.2"/><path d="M65 28q10 -9 18 -1" stroke="#ecac4a" stroke-width="4"/><path d="M30 48q-7 28 3 36l9 -6 31 1 11 5q10 -19 -1 -38z" fill="url(#${id}-hair)"/>` : ''}
        <path d="${walking ? 'M41 113l4 18 -11 5 7 6 17 -8 -2 -20Z' : 'M40 111l-3 24 12 1 7 -23Z'}" fill="#58504a"/>
        <path d="${walking ? 'M59 112l6 17 12 8 4 -7 -10 -13Z' : 'M59 112l1 24 12 -1 -1 -26Z'}" fill="#514841"/>
        <path d="${walking ? 'M33 136q-6 0 -5 7 11 4 17 -1l-5 -7z' : 'M38 132l11 1 -2 8 -14 1q-6 -5 5 -10z'}" fill="#faf0dc"/>
        <path d="${walking ? 'M74 130l8 5q3 10 -5 8l-8 -8z' : 'M60 132l11 -1 8 7q1 5 -18 4z'}" fill="#faf0dc"/>
        <path d="${walking ? 'M31 143h11m34 -1 4 -2' : 'M33 138h13m17 1h13'}" stroke="#a59b85" stroke-width="1.2"/>
        <path d="M45 129v5m21 -6v5" stroke="#ded7c7" stroke-width="2"/>
        <path d="M39 84q17 -7 31 0l7 31q-17 9 -40 0z" fill="url(#${id}-shirt)"/>
        <path d="M41 111q14 4 29 0" stroke="${shade}" stroke-width="1.1"/>
        <path d="M49 82v5q8 7 14 -1v-6" fill="url(#${id}-skin)"/>
        <path d="M48 86q8 7 17 -1" stroke="${isOrange ? '#ffd17b' : '#aed6f1'}" stroke-width="2.2"/>
        ${walking ? `<path d="M40 86q-9 5 -14 15l7 6 14 -16" fill="${shirt}"/><path d="M27 100q-7 1 -7 8 5 6 12 -3" fill="url(#${id}-skin)"/><path d="M69 87l12 12 6 -5 -12 -13" fill="${shirt}"/><path d="M82 93q8 -5 12 1 1 7 -8 7" fill="url(#${id}-skin)"/>` : happy ? `<path d="M41 87L25 75 20 82 37 99" fill="${shirt}"/><path d="M26 76q1 -10 -5 -12 -7 1 -3 14l4 5" fill="url(#${id}-skin)"/><path d="M71 87l15 -15 6 7 -18 21" fill="${shirt}"/><path d="M85 75q-1 -13 6 -13 7 3 2 16" fill="url(#${id}-skin)"/>` : `<path d="M41 88q-11 5 -11 17l10 5 8 -17" fill="${shirt}"/><path d="M31 101q-6 6 -1 11 6 4 11 -3l-2 -6" fill="url(#${id}-skin)"/><path d="M69 87q11 3 15 12l-9 8 -9 -15" fill="${shirt}"/><path d="M78 100q8 -6 4 -15l-7 -6 -5 4 7 8 -4 7" fill="url(#${id}-skin)"/>`}
        <path d="M52 97q5 -6 9 0v8q-5 5 -9 0z" fill="${isOrange ? '#ffca6b' : '#b9dceb'}" stroke="${isOrange ? '#e48e30' : '#327aad'}" stroke-width="1"/>
        <path d="M56 95q-2 -4 2 -5" stroke="${isOrange ? '#e49336' : '#b9dceb'}" stroke-width="1.5"/>
        <path d="M28 49q-8 -2 -9 7 0 10 12 10m53 -17q10 -2 9 8 -1 10 -11 10" fill="url(#${id}-skin)"/>
        <path d="M25 55q-3 4 3 6m60 -6q3 3 -2 6" stroke="#d4a47e" stroke-width="1.2"/>
        <path d="M28 45q1 -22 29 -22 29 0 29 27v13q-1 21 -28 22 -26 -1 -29 -21z" fill="url(#${id}-skin)"/>
        ${isOrange ? `<path d="M27 54q-8 -29 15 -34 26 -7 39 15 8 13 3 21 -10 -5 -13 -21 0 13 -8 19l-4 -15q-8 13 -18 15l5 -16q-9 17 -19 16z" fill="url(#${id}-hair)"/><path d="M36 30q6 -8 13 -6m1 3q-9 3 -12 13m21 -15q12 4 17 19" stroke="#bf8b55" stroke-width="1.2" opacity=".8"/>` : `<path d="M25 53l-4 -8 -7 0 6 -8 -7 -3 11 -7 -3 -6 14 -1 -2 -7 13 3 6 -9 7 8 14 -4 -1 8 13 2 -3 7 10 6 -8 3 4 10 -7 -2 2 12 -8 -8 -5 -17 -5 14 -7 -10 -6 14 -7 -8 -5 14 -6 -6 -4 13z" fill="url(#${id}-hair)"/><path d="M27 31l10 -4m4 -2 10 -5m10 4 7 -1M24 40l10 -5" stroke="#806348" stroke-width="1.2" opacity=".7"/>`}
        <path d="M44 50q5 -3 9 -1m10 -1q5 -1 9 3" stroke="#67472f" stroke-width="1.6"/>
        ${faceEyes}
        <ellipse cx="38" cy="69" rx="6" ry="3.2" fill="#e79a84" opacity=".43" stroke="none"/>
        <ellipse cx="77" cy="69" rx="6" ry="3.2" fill="#e79a84" opacity=".43" stroke="none"/>
        <path d="M59 61l-2 6h4" stroke="#d3a17d" stroke-width="1.2"/>
        ${happy ? '<path d="M49 70q8 6 17 0 -2 12 -9 11 -6 0 -8 -11z" fill="#a9634c" stroke-width="1.5"/><path d="M53 78q4 -3 9 0" stroke="#e99d88" stroke-width="2"/>' : '<path d="M52 74q6 4 11 -1" stroke="#7a4e38" stroke-width="1.6" fill="none"/>'}
        ${!happy && !walking ? '<path d="M76 81q-5 -5 -8 -2 -1 4 4 7" fill="#f6d0a7" stroke-width="1.4"/>' : ''}
      </g>
    `,
  );
}

function giftArt() {
  const id = nextId('gift');
  return svg(
    '0 0 48 48',
    `
      <defs><linearGradient id="${id}" x2="0" y2="1"><stop stop-color="#f58461"/><stop offset="1" stop-color="#d84738"/></linearGradient></defs>
      <ellipse cx="25" cy="44" rx="20" ry="3" fill="#664129" opacity=".15"/>
      <g stroke="#754729" stroke-linejoin="round" stroke-width="1.5">
        <path d="M7 20h30v24H7z" fill="url(#${id})"/><path d="M37 20l7 -5v23l-7 6z" fill="#ad392c"/>
        <path d="M6 17l7 -5h31l-7 7z" fill="#ffb16f"/><path d="M6 17h31v8H6z" fill="#f48155"/><path d="M37 19l7 -7v8l-7 5z" fill="#c34a32"/>
        <path d="M18 18h7v26h-7z" fill="#ffda78"/><path d="M18 17l7 -5h7l-7 7z" fill="#ffe7a1"/>
        <path d="M23 14Q9 12 12 5q6 -5 12 8Q24 0 33 4q8 8 -10 10z" fill="#fbc956"/>
        <path d="M16 6l6 7m4 -1 5 -6" stroke="#b98432" stroke-width="1"/><path d="M21 11h6v6h-6z" fill="#ffe4a0"/>
        <path d="M11 28v11" stroke="#ffc69a" stroke-width="1" opacity=".5"/>
      </g>`,
  );
}

function keyArt() {
  return svg(
    '0 0 48 48',
    `
      <ellipse cx="25" cy="43" rx="18" ry="3" fill="#725334" opacity=".15"/>
      <g transform="rotate(-36 24 24)" stroke="#936026" stroke-linejoin="round">
        <path d="M18 22h11v18h7v-6h-7v-5h6v-6H28" fill="#e4a438" stroke-width="2.1"/>
        <path d="M17 5q11 -4 17 6 5 10 -7 16 -12 4 -17 -5Q5 10 17 5z" fill="#f4c760" stroke-width="2.2"/>
        <circle cx="21" cy="15" r="5.4" fill="#f6e4b5" stroke-width="2"/>
        <path d="M23 29v9m-9 -29q6 -4 12 0" stroke="#ffe6a4" stroke-width="2" fill="none" stroke-linecap="round"/>
      </g>`,
  );
}

function screenArt({ active = false } = {}) {
  const id = nextId('screen');
  return svg(
    '0 0 100 170',
    `
      <defs>
        <pattern id="${id}-flowers" width="23" height="34" patternUnits="userSpaceOnUse">
          <path d="M11 34q-3 -17 0 -31M10 18Q0 12 2 7q8 -1 8 11M10 26q10 -10 10 -15 -10 -2 -10 15" stroke="#a3b194" stroke-width="1" fill="#a9b89a" opacity=".6"/>
          <path d="M9 7q-8 1 -6 -5 7 -3 8 4 2 -9 7 -6 4 6 -9 7" fill="#c9a17b" opacity=".45"/>
        </pattern>
        <linearGradient id="${id}-wood" x2="1"><stop stop-color="#d6a26b"/><stop offset=".5" stop-color="#bf874f"/><stop offset="1" stop-color="#9d6a3f"/></linearGradient>
      </defs>
      <ellipse cx="52" cy="160" rx="48" ry="8" fill="#73502e" opacity=".22"/>
      ${active ? '<path d="M1 11L33 21 64 6 98 17V151L65 166 34 160 2 151z" fill="#ffdc77" opacity=".26" stroke="#fff0b1" stroke-width="4"/>' : ''}
      <g stroke="#725033" stroke-linejoin="round" stroke-linecap="round">
        <path d="M6 12l26 10v133L6 145z" fill="#ead7ae" stroke-width="3"/>
        <path d="M34 23L65 8v143l-31 13z" fill="#f4e3be" stroke-width="3"/>
        <path d="M67 8l27 10v130l-27 -8z" fill="#e6cca3" stroke-width="3"/>
        <path d="M10 19l19 7v118l-19 -6z" fill="url(#${id}-flowers)" stroke="#b18b5c" stroke-width="1"/>
        <path d="M39 28l21 -11v128l-21 10z" fill="url(#${id}-flowers)" stroke="#b18b5c" stroke-width="1"/>
        <path d="M71 17l18 6v116l-18 -6z" fill="url(#${id}-flowers)" stroke="#b18b5c" stroke-width="1"/>
        <path d="M4 8h5v141H4zM30 19h6v143h-6zM63 5h6v149h-6zM91 14h6v137h-6z" fill="url(#${id}-wood)" stroke-width="1.7"/>
        <path d="M4 143l29 10 33 -14 31 9v7l-31 -9 -32 17 -30 -11z" fill="#b37b49" stroke-width="1.8"/>
        <path d="M0 149l10 2 7 8 -6 3 -10 -10zM27 158l9 1 10 7 -7 2 -12 -7zM64 149l8 -1 11 6 -9 3z" fill="#bc8754" stroke-width="1.6"/>
        <path d="M6 16v125m27 -112v116M66 14v124m28 -116v117" stroke="#e6b888" stroke-width="1"/>
        <path d="M35 47h3m-3 64h3m22 -77h3m-3 68h3" stroke="#967441" stroke-width="3"/>
      </g>`,
  );
}

function teaArt() {
  return svg(
    '0 0 64 64',
    `
      <ellipse cx="32" cy="52" rx="29" ry="7" fill="#785636" opacity=".16"/>
      <ellipse cx="32" cy="47" rx="29" ry="10" fill="#e6be80" stroke="#8d6341" stroke-width="1.8"/>
      <ellipse cx="32" cy="46" rx="25" ry="7" fill="#f2d5a0" stroke="#c49b63" stroke-width="1"/>
      <g stroke="#846447" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6">
        <path d="M32 26q-7 1 -7 12 0 11 14 11 11 0 11 -12 -2 -12 -10 -12" fill="#fff7e2"/>
        <path d="M47 29q15 -8 11 6 -3 9 -9 5" fill="none" stroke-width="4" stroke="#fff6df"/>
        <path d="M47 29q15 -8 11 6 -3 9 -9 5" fill="none" stroke-width="1.5"/>
        <path d="M27 32l-10 -9 -3 3 10 16" fill="#fff7e2"/>
        <ellipse cx="37" cy="26" rx="10" ry="3.3" fill="#f5e8cb"/>
        <path d="M28 25q8 -8 17 0" fill="#fff7e2"/>
        <circle cx="37" cy="20" r="2.8" fill="#f6ecd3"/>
        <path d="M9 38v9q7 7 16 0v-9" fill="#fff8e5"/>
        <path d="M25 40q8 -1 6 5 -2 4 -6 2" fill="none"/>
        <ellipse cx="17" cy="38" rx="8" ry="3" fill="#bb9264"/>
        <path d="M10 48q6 4 14 0" stroke="#ddd0b4" stroke-width="1"/>
        <path d="M35 40q6 3 10 -1" stroke="#e9dabb" stroke-width="1.2"/>
        <path d="M19 31q-4 -6 0 -11m16 -7q-4 -5 0 -10m8 12q-3 -4 1 -8" fill="none" stroke="#b5a088" stroke-width="1.4" opacity=".65"/>
      </g>`,
  );
}

function icon(name) {
  const shapes = {
    undo: '<path d="M9 5L4 10l5 5M5 10h8a7 7 0 0 1 6 10"/>',
    replay: '<path d="M18 7a8 8 0 1 0 2 10M18 3v5h-5"/>',
    flag: '<path d="M5 22V3m0 1c6 -4 10 5 16 0v11c-6 5 -10 -4 -16 0"/>',
    pause:
      '<rect x="6" y="4" width="4" height="16" rx=".7" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx=".7" fill="currentColor" stroke="none"/>',
    sound: '<path d="M4 9h4l5 -5v16l-5 -5H4z"/><path d="M17 8q4 4 0 8m3 -11q7 7 0 14"/>',
    muted: '<path d="M4 9h4l5 -5v16l-5 -5H4zM17 9l6 6m0 -6 -6 6"/>',
    home: '<path d="M3 11l9 -8 9 8M6 9v12h12V9M10 21v-7h4v7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    arrow: '<path d="M4 12h16m-6 -6 6 6 -6 6"/>',
  };
  return svg(
    '0 0 24 24',
    `<g stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shapes[name] || shapes.arrow}</g>`,
  );
}

export { roomArt, characterArt, boxArt, giftArt, keyArt, screenArt, teaArt, icon };
