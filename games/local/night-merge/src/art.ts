import type { Impact, Kind, Shot, State } from './game.ts';

const COLORS: Record<Kind, { light: string; dark: string; accent: string }> = {
  archer: { light: '#82b793', dark: '#285c49', accent: '#d8ce95' },
  shield: { light: '#96b8c7', dark: '#3b6377', accent: '#f0d18d' },
  mage: { light: '#dfa879', dark: '#864c43', accent: '#ffd481' },
  frost: { light: '#a3e0df', dark: '#426b86', accent: '#e1ffff' },
};

/** Original vector portraits; the same visual language is used on board and wall. */
export function guardIcon(kind: Kind, level = 1): string {
  const c = COLORS[kind];
  const tier = Math.max(1, Math.min(3, Math.floor(level)));
  const hood =
    kind === 'archer'
      ? `<path d="M18 44Q16 24 35 14L48 17 59 39 51 50 27 52Z" fill="${c.dark}"/><path d="M23 37 36 19 48 24 53 37 44 32 33 33Z" fill="${c.light}"/><path d="M29 19Q28 10 43 8L38 21" fill="#a9c992"/><path d="M36 11 35 23" stroke="#e3d7a9"/>`
      : kind === 'shield'
        ? `<path d="M21 36Q20 17 39 16 57 16 57 37L51 44 27 44Z" fill="${c.light}"/><path d="M38 16V37M22 33H57" stroke="#d2e2df" stroke-width="3"/><path d="M34 14 38 5 44 14" fill="${c.accent}"/><path d="M22 33 18 24 15 32 23 40M56 33 62 24 64 32 56 40" fill="${c.dark}"/><path d="M23 35H55V45H23Z" fill="#284c61"/>`
        : kind === 'mage'
          ? `<path d="M16 33 26 29 33 6 45 13 50 31 60 35Q36 43 16 33Z" fill="${c.dark}"/><path d="M29 23 34 10 40 17 43 27" fill="${c.light}"/><path d="M26 29 50 31" stroke="${c.accent}" stroke-width="3"/><path d="M35 14 36 19 40 20 36 21 35 25 34 21 31 20 34 19Z" fill="${c.accent}"/>`
          : `<path d="M20 43Q15 20 38 15 59 17 58 43L50 52 27 49Z" fill="${c.light}"/><path d="M22 34 25 19 32 24 39 8 47 24 54 18 56 35" fill="${c.dark}"/><path d="M28 25 39 14 50 25 46 31H32Z" fill="#b8e7e5"/><path d="M37 20 40 17 43 22 39 27Z" fill="#f2ffff"/>`;
  const weapon =
    kind === 'archer'
      ? `<path d="M61 22Q78 44 60 64" fill="none" stroke="#e4bc7f" stroke-width="3"/><path d="M61 22 64 45 60 64" fill="none" stroke="#f4dec0" stroke-width="1"/><path d="M46 46H75M70 42 75 46 70 50" fill="none" stroke="#f3e5bc" stroke-width="2"/><path d="M49 48 59 46" stroke="#eac5a2" stroke-width="6" stroke-linecap="round"/>`
      : kind === 'shield'
        ? `<path d="M42 43 60 39 72 45 68 61 56 71 43 61Z" fill="${c.dark}" stroke="${c.accent}" stroke-width="2.5"/><path d="M56 45 56 64M47 51H66" stroke="#b5ccd0" stroke-width="2"/><path d="M56 47 61 54 56 61 51 54Z" fill="${c.accent}"/><path d="M15 39V61M11 41H19" stroke="#dce4d8" stroke-width="3"/>`
        : kind === 'mage'
          ? `<path d="M62 29 60 69" stroke="#c7a275" stroke-width="3"/><path d="M54 25Q49 16 60 7 60 18 66 16 77 31 62 35 51 32 54 25Z" fill="#eea765"/><path d="M59 28Q56 23 62 18 62 24 66 25 69 32 62 32Z" fill="#ffe8ad"/><path d="M46 48 59 46" stroke="#edc7a2" stroke-width="6" stroke-linecap="round"/>`
          : `<path d="M61 30 61 68" stroke="#b9dadd" stroke-width="3"/><path d="M61 11 70 22 61 34 52 22Z" fill="#95d4e2" stroke="#e5ffff" stroke-width="1.5"/><path d="M61 12V33L56 22Z" fill="#e0ffff"/><path d="M47 48 59 46" stroke="#e7d4bf" stroke-width="6" stroke-linecap="round"/><path d="M72 9V16M69 12H75" stroke="#d4f6f2" stroke-width="1.5"/>`;
  const decoration =
    tier > 1
      ? `<path d="M24 53 35 61 46 53" fill="none" stroke="${c.accent}" stroke-width="2"/><path d="M25 54 26 69M46 53 45 68" stroke="${c.accent}" stroke-width="1.4"/>${tier === 3 ? `<path d="M17 47 22 43 29 48 24 54ZM44 47 49 43 55 48 50 54Z" fill="${c.accent}"/><path d="M29 25 31 19 37 22 43 17 47 24" fill="none" stroke="#ffe4a2" stroke-width="2"/>` : ''}`
      : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" class="unit-portrait" aria-hidden="true"><ellipse cx="39" cy="71" rx="27" ry="5" fill="#081c23" opacity=".3"/><g class="guard-body"><path d="M20 67 22 49 33 43H44L54 51 57 69Q37 77 20 67Z" fill="${c.dark}"/><path d="M28 50 35 47 40 50 44 69H26Z" fill="${c.light}"/><path d="M19 51 14 62 22 66 30 50M48 49 57 53 60 61 53 66 43 53" fill="${c.dark}"/>${hood}<path d="M28 34Q37 29 49 35L47 46Q38 55 30 46Z" fill="#ecc9a2"/><path d="M27 34 32 32 33 42 28 40M46 34 50 36 48 43 45 42" fill="#c19e82"/><path d="M33 39H35M42 39H44" stroke="#283b3c" stroke-width="2.8" stroke-linecap="round"/><path d="M36 46Q39 48 42 45" fill="none" stroke="#ab7566" stroke-width="1.4"/>${kind === 'mage' ? '<path d="M29 44 39 50 48 43 44 54 36 57Z" fill="#eee0bc"/>' : ''}${kind === 'frost' ? '<path d="M23 31 29 33 28 49 23 58 21 46M48 32 54 29 57 46 52 57 49 47" fill="#d3ece4"/>' : ''}${decoration}<g class="guard-weapon">${weapon}</g><path d="M29 69V73M44 69V73" stroke="#243e42" stroke-width="5" stroke-linecap="round"/></g></svg>`;
}

const backgrounds = new WeakMap<
  CanvasRenderingContext2D,
  { width: number; height: number; canvas: HTMLCanvasElement }
>();
const TAU = Math.PI * 2;
const random = (n: number) => Math.abs(Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1;

function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string | CanvasGradient,
) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
}

function polygon(ctx: CanvasRenderingContext2D, points: number[], fill: string, stroke?: string) {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function pine(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  highlight: string,
) {
  ctx.fillStyle = '#183238';
  ctx.fillRect(x - size * 0.035, y - size * 0.45, size * 0.07, size * 0.51);
  polygon(
    ctx,
    [
      x,
      y - size,
      x + size * 0.21,
      y - size * 0.55,
      x + size * 0.12,
      y - size * 0.58,
      x + size * 0.32,
      y - size * 0.19,
      x + size * 0.2,
      y - size * 0.24,
      x + size * 0.38,
      y,
      x - size * 0.39,
      y,
      x - size * 0.24,
      y - size * 0.24,
      x - size * 0.3,
      y - size * 0.2,
      x - size * 0.13,
      y - size * 0.57,
      x - size * 0.2,
      y - size * 0.54,
    ],
    color,
  );
  polygon(
    ctx,
    [
      x,
      y - size * 0.96,
      x + size * 0.03,
      y - size * 0.59,
      x - size * 0.11,
      y - size * 0.45,
      x - size * 0.05,
      y - size * 0.46,
      x - size * 0.19,
      y - size * 0.17,
      x - size * 0.07,
      y - size * 0.22,
      x - size * 0.2,
      y - size * 0.03,
      x - size * 0.34,
      y - size * 0.03,
      x - size * 0.2,
      y - size * 0.28,
      x - size * 0.25,
      y - size * 0.24,
      x - size * 0.09,
      y - size * 0.6,
      x - size * 0.14,
      y - size * 0.57,
    ],
    highlight,
  );
}

function lantern(ctx: CanvasRenderingContext2D, x: number, y: number, size = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 23);
  glow.addColorStop(0, '#f4ca7955');
  glow.addColorStop(1, '#f4ca7900');
  ellipse(ctx, 0, 0, 23, 23, glow);
  ctx.fillStyle = '#1b373b';
  ctx.fillRect(-1.2, -21, 2.4, 44);
  ctx.strokeStyle = '#617267';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(8, -20);
  ctx.lineTo(8, -10);
  ctx.stroke();
  polygon(ctx, [3, -10, 13, -10, 11, 4, 5, 4], '#f6cf82', '#966b42');
  ctx.fillStyle = '#a8875b';
  ctx.fillRect(3, -12, 10, 3);
  ctx.fillRect(5, 4, 6, 2);
  ctx.strokeStyle = '#fbe9b2';
  ctx.beginPath();
  ctx.moveTo(8, -8);
  ctx.lineTo(8, 2);
  ctx.stroke();
  ctx.restore();
}

function paintBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save();
  ctx.scale(width / 460, height / 340);
  const sky = ctx.createLinearGradient(0, 0, 0, 340);
  sky.addColorStop(0, '#142d3a');
  sky.addColorStop(0.47, '#28535a');
  sky.addColorStop(1, '#142e30');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 460, 340);
  const halo = ctx.createRadialGradient(350, 46, 10, 350, 46, 105);
  halo.addColorStop(0, '#f6e3af23');
  halo.addColorStop(1, '#f6e3af00');
  ctx.fillStyle = halo;
  ctx.fillRect(240, 0, 220, 160);
  ellipse(ctx, 350, 45, 30, 30, '#eee4bd');
  ellipse(ctx, 340, 38, 5, 6, '#daceaa');
  ellipse(ctx, 359, 53, 8, 7, '#e0d4af');
  ellipse(ctx, 359, 28, 3, 3, '#dfd2ad');
  ellipse(ctx, 337, 57, 3, 2, '#dfd2ad');
  for (let i = 0; i < 40; i++) {
    const x = random(i + 7) * 460,
      y = random(i + 80) * 95;
    ellipse(ctx, x, y, i % 7 ? 0.7 : 1.2, i % 7 ? 0.7 : 1.2, i % 3 ? '#b9c9bc88' : '#f4d89ab0');
  }
  polygon(
    ctx,
    [
      0, 116, 0, 68, 30, 84, 74, 52, 117, 83, 163, 41, 209, 82, 244, 61, 298, 93, 333, 69, 380, 90,
      426, 54, 460, 74, 460, 135,
    ],
    '#345460',
  );
  polygon(
    ctx,
    [
      0, 143, 0, 103, 66, 83, 119, 112, 187, 77, 251, 115, 300, 92, 353, 116, 417, 89, 460, 109,
      460, 158,
    ],
    '#294d52',
  );
  for (let i = 0; i < 34; i++)
    pine(
      ctx,
      i * 15 - 16,
      144 + random(i + 20) * 16,
      22 + random(i + 80) * 35,
      '#254b4d',
      '#31585a',
    );
  ctx.fillStyle = '#294a42';
  ctx.beginPath();
  ctx.moveTo(0, 153);
  ctx.quadraticCurveTo(93, 135, 187, 159);
  ctx.quadraticCurveTo(320, 130, 460, 152);
  ctx.lineTo(460, 300);
  ctx.lineTo(0, 300);
  ctx.fill();
  // An old paved road leads the eye to the wall and keeps incoming silhouettes readable.
  ctx.beginPath();
  ctx.moveTo(218, 118);
  ctx.bezierCurveTo(139, 159, 286, 191, 182, 224);
  ctx.quadraticCurveTo(134, 248, 112, 292);
  ctx.lineTo(355, 292);
  ctx.bezierCurveTo(289, 233, 337, 211, 269, 177);
  ctx.quadraticCurveTo(199, 143, 232, 118);
  ctx.closePath();
  ctx.fillStyle = '#51605b';
  ctx.fill();
  ctx.strokeStyle = '#75817355';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(226, 122);
  ctx.bezierCurveTo(174, 157, 307, 192, 226, 235);
  ctx.quadraticCurveTo(189, 263, 187, 290);
  ctx.strokeStyle = '#8b8c6a22';
  ctx.lineWidth = 13;
  ctx.stroke();
  for (let i = 0; i < 27; i++) {
    const y = 130 + i * 5.8;
    const middle =
      y < 177
        ? 217 + Math.sin((y - 140) * 0.065) * 23
        : y < 230
          ? 250 + Math.sin((y - 177) * 0.05) * 14
          : 215;
    const x = middle + (random(i + 220) - 0.5) * (y - 104) * 0.68;
    const s = 3 + (y - 120) * 0.025;
    polygon(
      ctx,
      [x - s, y, x + s, y - 1, x + s + 2, y + 2.5, x - s - 2, y + 3],
      i % 2 ? '#7d86714d' : '#293f3d4d',
    );
  }
  for (let i = 0; i < 43; i++) {
    const left = i % 2 === 0;
    const y = 151 + random(i + 110) * 138;
    const x = left ? random(i + 35) * 111 : 350 + random(i + 35) * 110;
    ellipse(ctx, x, y, 12 + random(i) * 9, 3 + random(i + 1) * 4, '#365744');
    if (i % 3 === 0) {
      ctx.strokeStyle = '#77907966';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 3, y);
      ctx.lineTo(x - 6, y - 6);
      ctx.moveTo(x, y);
      ctx.lineTo(x + 1, y - 8);
      ctx.moveTo(x + 2, y);
      ctx.lineTo(x + 5, y - 4);
      ctx.stroke();
    }
  }
  // Crooked stone watchtower, half swallowed by the forest.
  polygon(ctx, [68, 133, 70, 92, 93, 89, 97, 136], '#384e50');
  polygon(
    ctx,
    [65, 94, 68, 77, 75, 77, 75, 84, 82, 82, 82, 74, 91, 75, 91, 83, 98, 81, 100, 94],
    '#47605d',
  );
  ctx.fillStyle = '#18383d';
  ctx.fillRect(77, 104, 8, 16);
  ctx.fillStyle = '#bba96b';
  ctx.fillRect(80, 108, 2, 6);
  for (let i = 0; i < 20; i++) {
    const side = i % 2 === 0;
    const x = side ? random(i + 80) * 127 - 19 : 367 + random(i + 70) * 120;
    const y = 171 + random(i + 32) * 110;
    pine(
      ctx,
      x,
      y,
      51 + random(i + 51) * 54,
      i % 3 ? '#1a4140' : '#204944',
      i % 3 ? '#2c5950' : '#38604e',
    );
  }
  pine(ctx, 3, 269, 177, '#153838', '#234b42');
  pine(ctx, 458, 253, 174, '#123737', '#245049');
  pine(ctx, -22, 326, 128, '#102d2f', '#1f4641');
  pine(ctx, 489, 325, 125, '#102d2f', '#1f4641');
  lantern(ctx, 137, 242, 0.72);
  lantern(ctx, 306, 203, 0.55);
  ctx.fillStyle = '#102b2daa';
  ctx.fillRect(0, 278, 460, 62);
  polygon(ctx, [0, 295, 0, 288, 460, 288, 460, 295], '#b5b096');
  ctx.fillStyle = '#626c61';
  ctx.fillRect(0, 295, 460, 45);
  ctx.strokeStyle = '#334b46';
  ctx.lineWidth = 2;
  for (let row = 0; row < 3; row++) {
    const y = 296 + row * 17;
    ctx.beginPath();
    ctx.moveTo(0, y + 16);
    ctx.lineTo(460, y + 16);
    for (let x = (row % 2) * 26; x < 460; x += 52) {
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 16);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const x = i * 57 - 10;
    ctx.fillStyle = '#7b8370';
    ctx.fillRect(x, 277, 25, 19);
    ctx.fillStyle = '#bbb99b';
    ctx.fillRect(x, 277, 25, 3);
    ctx.fillStyle = '#455c52';
    ctx.fillRect(x + 21, 280, 4, 16);
  }
  lantern(ctx, 20, 295, 1.05);
  lantern(ctx, 425, 295, 1.05);
  ctx.restore();
}

function enemySprite(
  ctx: CanvasRenderingContext2D,
  kind: string,
  boss: boolean,
  time: number,
  id: number,
) {
  const bob = Math.sin(time * 5 + id * 1.8) * 1.4;
  ctx.translate(0, bob);
  const heavy = boss || /brute|armor|golem|tank|ogre|knight/.test(kind);
  const flying = /bat|wisp|ghost|spirit/.test(kind);
  const frost = /frost|ice|wisp|ghost|spirit|nightlord/.test(kind);
  const fast = /runner|wolf|hound/.test(kind);
  const color = boss
    ? frost
      ? '#81b2b3'
      : '#b7857c'
    : frost
      ? '#79aeb2'
      : heavy
        ? '#898f87'
        : fast
          ? '#ae936b'
          : '#9d91a1';
  const dark = boss
    ? '#694755'
    : frost
      ? '#37636d'
      : heavy
        ? '#4c5c59'
        : fast
          ? '#695c49'
          : '#665b76';
  if (kind === 'nightlord')
    polygon(
      ctx,
      [-10, -22, 11, -23, 21, 14, 9, 10, 0, 17, -10, 10, -22, 14],
      '#304f66',
      '#91b8b077',
    );
  if (flying) {
    const lift = Math.sin(time * 8 + id) * 5;
    polygon(ctx, [-4, -9, -23, -19 + lift, -19, -3, -10, -5, -5, 4], dark);
    polygon(ctx, [4, -9, 23, -19 + lift, 19, -3, 10, -5, 5, 4], dark);
  } else {
    ctx.strokeStyle = dark;
    ctx.lineWidth = heavy ? 6 : 4;
    ctx.lineCap = 'round';
    const stride = Math.sin(time * (fast ? 11 : 6) + id) * 3;
    ctx.beginPath();
    ctx.moveTo(-5, 4);
    ctx.lineTo(-6 + stride, 12);
    ctx.moveTo(5, 4);
    ctx.lineTo(6 - stride, 12);
    ctx.stroke();
  }
  if (heavy) {
    polygon(ctx, [-11, -15, 9, -16, 16, -5, 12, 7, -10, 8, -16, -4], dark);
    polygon(ctx, [-9, -13, 8, -13, 11, 1, 0, 6, -11, 1], color, '#bdc1a455');
    ctx.strokeStyle = '#cad0b555';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-6, -9);
    ctx.lineTo(4, 2);
    ctx.moveTo(6, -9);
    ctx.lineTo(-3, 2);
    ctx.stroke();
    polygon(ctx, [-14, -11, -22, -7, -17, 3, -11, 0], color);
    polygon(ctx, [13, -10, 20, -6, 18, 4, 12, 0], color);
  } else {
    polygon(ctx, [-7, -12, 7, -12, 11, 6, -11, 6], dark);
    polygon(ctx, [-5, -10, 5, -10, 7, 3, -6, 4], color);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-6, -7);
    ctx.lineTo(-13, 1);
    ctx.moveTo(6, -7);
    ctx.lineTo(12, 0);
    ctx.stroke();
  }
  ellipse(ctx, 0, -16, heavy ? 10 : 9, heavy ? 9 : 8, color);
  polygon(ctx, [-8, -20, -10, -30, -2, -23], dark);
  polygon(ctx, [7, -20, 11, -28, 2, -23], dark);
  if (boss) {
    polygon(ctx, [-11, -20, -17, -34, -9, -29, -3, -21], '#d7c3a0');
    polygon(ctx, [9, -20, 16, -34, 8, -29, 2, -21], '#d7c3a0');
    polygon(ctx, [-7, -26, -6, -34, 0, -29, 6, -34, 7, -26], '#a69065');
  }
  if (kind === 'armored') {
    polygon(
      ctx,
      [-10, -20, -7, -27, 6, -27, 10, -20, 9, -11, 4, -8, 4, -20, -4, -20, -4, -8, -10, -12],
      '#a6aba0',
      '#526761',
    );
    ctx.strokeStyle = '#d4cfac';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -27);
    ctx.lineTo(0, -20);
    ctx.stroke();
  }
  if (kind === 'shaman') {
    polygon(ctx, [-11, -20, -9, -27, -3, -24, 0, -33, 4, -24, 11, -27, 10, -19], '#799f90');
    ctx.strokeStyle = '#aaa184';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(17, 12);
    ctx.lineTo(19, -24);
    ctx.stroke();
    ellipse(ctx, 19, -26, 4, 5, '#b5c995');
    ellipse(ctx, 19, -26, 2, 3, '#f0e4ba');
  }
  if (fast) {
    polygon(ctx, [-8, -20, -11, -31, -3, -23], color);
    polygon(ctx, [8, -20, 11, -31, 3, -23], color);
    polygon(ctx, [-5, -15, 5, -15, 4, -8, -4, -8], '#c4b08b');
    ellipse(ctx, 0, -11, 2, 1.5, '#3a4140');
  }
  ctx.strokeStyle = boss ? '#ffca82' : '#e5d8bb';
  ctx.lineWidth = boss ? 2.6 : 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-5, -17);
  ctx.lineTo(-2, -16);
  ctx.moveTo(2, -16);
  ctx.lineTo(5, -17);
  ctx.stroke();
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-3, -11);
  ctx.lineTo(3, -11);
  ctx.stroke();
  if (heavy) {
    polygon(ctx, [17, -9, 22, -13, 26, -4, 20, 1], '#73817a', '#a9ac94');
    ctx.fillStyle = '#655c4b';
    ctx.fillRect(19, -1, 2, 12);
  }
}

const EFFECT_COLORS: Record<Kind | 'bell', string> = {
  archer: '#ffe1a0',
  shield: '#c6eff6',
  mage: '#ffab54',
  frost: '#a0efff',
  bell: '#ffe6a4',
};

function drawShot(
  ctx: CanvasRenderingContext2D,
  shot: Shot,
  width: number,
  height: number,
  scale: number,
  reducedMotion: boolean,
  targetBoss: boolean,
) {
  const age = shot.duration - shot.life;
  const color = EFFECT_COLORS[shot.kind];
  const magic = shot.kind === 'mage' || shot.kind === 'frost';
  const sx = shot.x * (width - 23) + 11.5 + 15 * scale;
  const sy =
    Math.min(shot.y * height - 4 * scale, height - 44 * Math.min(1, scale)) -
    (magic ? 19 * scale : 0);
  const tx = shot.tx * width,
    ty = shot.ty * height - 9 * scale * (targetBoss ? 1.85 : 1);
  const power = scale * (1 + (shot.level - 1) * 0.18);
  ctx.save();
  ctx.lineCap = 'round';
  if (age < shot.windup) {
    const p = age / shot.windup;
    ctx.translate(sx, sy);
    ctx.globalAlpha = 0.2 + p * 0.6;
    const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 20 * power);
    glow.addColorStop(0, color + 'bb');
    glow.addColorStop(1, color + '00');
    ellipse(ctx, 0, 0, 20 * power, 20 * power, glow);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4 * scale;
    if (shot.kind === 'mage' || shot.kind === 'frost') {
      ctx.rotate(reducedMotion ? 0 : p * 1.1);
      ctx.beginPath();
      ctx.arc(0, 0, (15 - p * 5) * power, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        polygon(
          ctx,
          [0, -18 * power, 3 * power, -13 * power, 0, -10 * power, -3 * power, -13 * power],
          color,
        );
      }
      ellipse(ctx, 0, 0, (2 + p * 4) * power, (2 + p * 4) * power, '#fff5d4');
    } else {
      ctx.rotate(Math.atan2(ty - sy, tx - sx));
      ctx.beginPath();
      ctx.moveTo(-10 * power, -7 * power);
      ctx.lineTo(-3 * power, 0);
      ctx.lineTo(-10 * power, 7 * power);
      ctx.stroke();
      ellipse(ctx, 2 * power, 0, (1 + p * 2) * power, (1 + p * 2) * power, '#fff7dd');
    }
    ctx.restore();
    return;
  }
  const p = Math.min(1, (age - shot.windup) / (shot.duration - shot.windup));
  if (shot.kind === 'shield') {
    // A shield strike stays at melee contact; it never becomes a ranged beam.
    ctx.translate(tx, ty + 7 * scale);
    const sweep = reducedMotion ? 0.7 : p;
    ctx.rotate(-0.9 + sweep * 1.8);
    ctx.scale(power, power);
    ctx.globalAlpha = Math.sin(Math.PI * Math.min(0.95, p)) * 0.95;
    ctx.beginPath();
    ctx.arc(0, 0, 29, -2.8, -0.4);
    ctx.arc(0, 3, 20, -0.4, -2.8, true);
    ctx.closePath();
    ctx.fillStyle = '#c6eff6';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 31, -2.65, -0.6);
    ctx.strokeStyle = '#fff1be';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    return;
  }
  const point = (progress: number) => {
    const arc = shot.kind === 'mage' ? -Math.sin(progress * Math.PI) * 33 * scale : 0;
    return { x: sx + (tx - sx) * progress, y: sy + (ty - sy) * progress + arc };
  };
  const head = point(p);
  const previous = point(Math.max(0, p - 0.025));
  const angle = Math.atan2(head.y - previous.y, head.x - previous.x);
  const tail = shot.kind === 'archer' ? 0.15 : 0.24;
  if (!reducedMotion) {
    if (shot.kind === 'mage') {
      for (let i = 7; i >= 1; i--) {
        const at = p - i * 0.026;
        if (at < 0) continue;
        const pt = point(at);
        ctx.globalAlpha = (1 - i / 8) * 0.38;
        ellipse(
          ctx,
          pt.x + Math.sin(shot.id + i) * 2,
          pt.y,
          (3 + i * 0.65) * power,
          (2 + i * 0.5) * power,
          '#8c6961',
        );
      }
    }
    for (let layer = 0; layer < 2; layer++) {
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const pt = point(Math.max(0, p - tail + (tail * i) / 8));
        if (!i) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      const behind = point(Math.max(0, p - tail));
      const trail = ctx.createLinearGradient(behind.x, behind.y, head.x + 0.01, head.y);
      trail.addColorStop(0, color + '00');
      trail.addColorStop(1, layer ? '#fff9df' : color);
      ctx.globalAlpha = layer ? 0.85 : 0.4;
      ctx.strokeStyle = trail;
      ctx.lineWidth = (shot.kind === 'archer' ? (layer ? 1 : 4) : layer ? 2 : 7) * power;
      ctx.stroke();
    }
    if (shot.kind === 'frost') {
      for (let i = 1; i < 5; i++) {
        const at = p - i * 0.042;
        if (at < 0) continue;
        const pt = point(at);
        ctx.save();
        ctx.translate(pt.x, pt.y + Math.sin(i * 2 + shot.id) * 4 * scale);
        ctx.rotate(age * 6 + i);
        ctx.globalAlpha = (1 - i / 5) * 0.75;
        polygon(ctx, [0, -4 * power, 2 * power, 0, 0, 4 * power, -2 * power, 0], '#b9f7ff');
        ctx.restore();
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.translate(head.x, head.y);
  ctx.rotate(angle);
  ctx.scale(power, power);
  if (shot.kind === 'archer') {
    ctx.strokeStyle = '#5c4431';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(4, 0);
    ctx.stroke();
    ctx.strokeStyle = '#ffe3a8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-18, -0.6);
    ctx.lineTo(3, -0.6);
    ctx.stroke();
    polygon(ctx, [8, 0, -1, -3, 1, 0, -1, 3], '#fff9d7', '#c5d8c5');
    polygon(ctx, [-13, 0, -20, -4, -18, 0, -20, 4], '#c8e2c3');
  } else if (shot.kind === 'mage') {
    polygon(
      ctx,
      [9, 0, 4, -6, -4, -7, -19, -4, -11, -1, -26, 1, -12, 4, -16, 7, -2, 7, 5, 5],
      '#e96b3e',
    );
    polygon(ctx, [8, 0, 2, -5, -6, -3, -14, -2, -8, 1, -18, 3, -4, 5, 3, 4], '#ffc066');
    ellipse(ctx, 1, 0, 6, 3.5, '#fff0b5');
    ellipse(ctx, 4, -1, 2.5, 2, '#fffce5');
  } else {
    ctx.scale(1, reducedMotion ? 1 : 0.78 + Math.abs(Math.cos(age * 14)) * 0.3);
    polygon(ctx, [14, 0, -3, -5, -13, 0, -3, 5], '#65c8e5', '#d4ffff');
    polygon(ctx, [14, 0, -3, -5, -5, 0], '#e8ffff');
    polygon(ctx, [14, 0, -5, 0, -3, 5], '#a4edf9');
    ctx.strokeStyle = '#f0ffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(14, 0);
    ctx.stroke();
  }
  ctx.restore();
}

function drawImpact(
  ctx: CanvasRenderingContext2D,
  hit: Impact,
  scale: number,
  reducedMotion: boolean,
) {
  const age = hit.duration - hit.life;
  const p = Math.min(1, age / hit.duration);
  const color = EFFECT_COLORS[hit.kind];
  const power = scale * (1 + (hit.level - 1) * 0.15) * (hit.boss ? 1.3 : 1);
  if (hit.damage <= 0) return;
  ctx.save();
  ctx.scale(power, power);
  if (!reducedMotion) {
    const burst = Math.min(1, age / 0.32);
    if (burst < 1) {
      ctx.globalAlpha = (1 - burst) * 0.85;
      ctx.strokeStyle = color;
      ctx.lineWidth = (1 - burst) * 3 + 0.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 4 + burst * (hit.kind === 'mage' ? 35 : 21), 3 + burst * 18, -0.25, 0, TAU);
      ctx.stroke();
      if (age < 0.12) {
        ctx.globalAlpha = (1 - age / 0.12) * 0.95;
        ctx.rotate(0.35);
        polygon(
          ctx,
          [0, -18, 4, -5, 17, -2, 5, 3, 3, 13, -2, 5, -12, 7, -5, -1, -10, -10, -2, -5],
          '#fff5d6',
        );
        ctx.rotate(-0.35);
      }
    }
    const count = hit.killed || hit.kind === 'mage' ? 10 : 6;
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI + (i / count) * TAU + random(hit.id + i) * 0.35;
      const distance = (13 + random(hit.id * 3 + i) * 25) * Math.min(1, age / 0.45);
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance + age * age * 28;
      ctx.globalAlpha = Math.max(0, 1 - age / (hit.killed ? 0.75 : 0.5));
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(angle + (hit.kind === 'frost' ? age * 4 : 0));
      if (hit.kind === 'frost') {
        polygon(ctx, [5, 0, -1, -2.6, -4, 0, -1, 2.6], i % 2 ? '#e8ffff' : '#82d4ec');
      } else if (hit.kind === 'mage') {
        ellipse(ctx, 0, 0, 1.8 + (1 - p) * 2, 1 + (1 - p), i % 2 ? '#ffd88b' : '#ef8752');
      } else {
        ctx.strokeStyle = i % 2 ? color : '#fff8dc';
        ctx.lineWidth = i % 2 ? 1 : 1.8;
        ctx.beginPath();
        ctx.moveTo(-3, 0);
        ctx.lineTo(3 + 3 * (1 - p), 0);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  // Numbers outlive the brief hit flash so damage remains readable amid several attacks.
  ctx.globalAlpha = Math.min(1, hit.life / 0.2);
  const rise = reducedMotion ? 17 : 10 + Math.min(1, age / 0.5) * 26;
  const pop = reducedMotion ? 1 : 1 + Math.max(0, 1 - age / 0.15) * 0.28;
  ctx.translate(((hit.id % 3) - 1) * 7, -rise);
  ctx.scale(pop, pop);
  ctx.font = `800 ${hit.killed ? 15 : 13}px "Trebuchet MS", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#14252e';
  ctx.strokeText(String(Math.ceil(hit.damage)), 0, 0);
  ctx.fillStyle = hit.killed ? '#fff0b3' : color;
  ctx.fillText(String(Math.ceil(hit.damage)), 0, 0);
  ctx.restore();
}

export function drawBattle(
  ctx: CanvasRenderingContext2D,
  state: State,
  time: number,
  width: number,
  height: number,
  reducedMotion = false,
): void {
  if (width <= 0 || height <= 0) return;
  let cached = backgrounds.get(ctx);
  if (!cached || cached.width !== width || cached.height !== height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * 2);
    canvas.height = Math.ceil(height * 2);
    const offscreen = canvas.getContext('2d');
    if (!offscreen) return;
    offscreen.scale(2, 2);
    paintBackground(offscreen, width, height);
    cached = { width, height, canvas };
    backgrounds.set(ctx, cached);
  }
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(cached.canvas, 0, 0, width, height);
  const scale = Math.max(0.7, Math.min(1.3, width / 420));
  for (let i = 0; i < (reducedMotion ? 0 : 15); i++) {
    const x = (random(i + 73) * 0.9 + 0.05) * width + Math.sin(time * 0.35 + i * 2) * 5;
    const y = (random(i + 41) * 0.5 + 0.23) * height + Math.cos(time * 0.5 + i) * 4;
    const alpha = 0.18 + (Math.sin(time * 1.3 + i) + 1) * 0.24;
    ctx.globalAlpha = alpha;
    ellipse(ctx, x, y, 1.4, 1.4, '#e9d88f');
  }
  ctx.globalAlpha = 1;
  const hits = new Map<number, Impact>();
  let bell: Impact | undefined;
  for (const hit of state.impacts) {
    hits.set(hit.enemyId, hit);
    if (hit.kind === 'bell' && (!bell || hit.life > bell.life)) bell = hit;
    if (!hit.killed || hit.life < 0.24) continue;
    const progress = (hit.duration - hit.life) / (hit.duration - 0.24);
    const size = scale * (hit.boss ? 1.85 : 1);
    ctx.save();
    ctx.translate(hit.x * width, hit.y * height);
    ctx.globalAlpha = (1 - progress) * 0.8;
    if (!reducedMotion) {
      ctx.translate(((hit.id % 2) * 2 - 1) * progress * 10 * size, progress * 7 * size);
      ctx.rotate(((hit.id % 2) * 2 - 1) * progress * 0.9);
      ctx.scale(size * (1 + progress * 0.12), size * (1 - progress * 0.65));
    } else ctx.scale(size, size);
    enemySprite(ctx, hit.enemyKind, hit.boss, 0, hit.enemyId);
    ctx.restore();
  }
  if (bell && !reducedMotion) {
    const p = Math.min(1, (bell.duration - bell.life) / 0.65);
    if (p < 1) {
      ctx.save();
      ctx.globalAlpha = (1 - p) * 0.85;
      const radius = 20 + p * width * 1.05;
      ctx.strokeStyle = '#ffe6a4';
      ctx.lineWidth = (1 - p) * 4 * scale + 1;
      ctx.beginPath();
      ctx.ellipse(width * 0.5, height * 0.87, radius, radius * 0.73, 0, Math.PI, TAU);
      ctx.stroke();
      ctx.globalAlpha *= 0.45;
      ctx.lineWidth = 10 * scale;
      ctx.beginPath();
      ctx.ellipse(width * 0.5, height * 0.87, radius * 0.89, radius * 0.65, 0, Math.PI, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }
  for (const enemy of [...state.enemies].sort((a, b) => a.y - b.y)) {
    const x = enemy.x * width,
      y = enemy.y * height;
    const size = scale * (enemy.boss ? 1.85 : 1);
    ellipse(ctx, x, y + 10 * size, 13 * size, 4 * size, '#0a232666');
    if (enemy.slow > 0) {
      const frostTime = reducedMotion ? 0 : time;
      ctx.strokeStyle = '#a6e8e7aa';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(x, y + 8 * size, 16 * size, 5 * size, 0, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 3; i++)
        ellipse(
          ctx,
          x + Math.sin(frostTime * 2 + i * 2) * 11 * size,
          y - 10 * size + Math.cos(frostTime * 2 + i * 2) * 8,
          1.5,
          1.5,
          '#d4ffff',
        );
    }
    const hit = hits.get(enemy.id);
    const hitAge = hit ? hit.duration - hit.life : 1;
    const recoil = reducedMotion ? 0 : Math.max(0, 1 - hitAge / 0.24);
    ctx.save();
    ctx.translate(x, y);
    ctx.translate(0, -Math.sin(recoil * Math.PI) * 6 * size);
    ctx.rotate(Math.sin(recoil * Math.PI * 1.5) * 0.1 * ((enemy.id % 2) * 2 - 1));
    ctx.scale(size, size);
    ctx.scale(1 + recoil * 0.16, 1 - recoil * 0.13);
    ctx.save();
    enemySprite(ctx, enemy.kind, enemy.boss, reducedMotion ? 0 : time, enemy.id);
    ctx.restore();
    if (!reducedMotion && hitAge < 0.09) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = (1 - hitAge / 0.09) * 0.85;
      enemySprite(ctx, enemy.kind, enemy.boss, time, enemy.id);
    }
    ctx.restore();
    const barWidth = enemy.boss ? 54 * scale : 24 * scale;
    const barY = y - (enemy.boss ? 67 : 35) * scale;
    ctx.fillStyle = '#122e30';
    ctx.fillRect(x - barWidth / 2 - 1, barY - 1, barWidth + 2, enemy.boss ? 6 : 4);
    ctx.fillStyle = enemy.boss ? '#df9c74' : '#c5c093';
    ctx.fillRect(
      x - barWidth / 2,
      barY,
      barWidth * Math.max(0, enemy.hp / enemy.maxHp),
      enemy.boss ? 4 : 2,
    );
  }
  for (const shot of state.shots)
    drawShot(
      ctx,
      shot,
      width,
      height,
      scale,
      reducedMotion,
      state.enemies.some((enemy) => enemy.id === shot.targetId && enemy.boss),
    );
  for (const hit of state.impacts) {
    ctx.save();
    ctx.translate(hit.x * width, hit.y * height - 9 * scale * (hit.boss ? 1.85 : 1));
    drawImpact(ctx, hit, scale, reducedMotion);
    ctx.restore();
  }
  if (state.hp / state.maxHp < 0.3) {
    ctx.globalAlpha = reducedMotion ? 0.07 : 0.07 + Math.sin(time * 3) * 0.035;
    ctx.fillStyle = '#c95441';
    ctx.fillRect(0, height * 0.76, width, height * 0.24);
    ctx.globalAlpha = 1;
  }
}
