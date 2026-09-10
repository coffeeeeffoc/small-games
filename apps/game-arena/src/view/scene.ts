import type { Duel } from '../domain/duel.js';

/** Procedural scenery is shared with the native Canvas entry; no remote assets. */
export function drawArena(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  duel: Duel | null,
  time: number,
) {
  ctx.save();
  ctx.scale(width / 900, height / 620);
  const ellipse = (x: number, y: number, rx: number, ry: number, color: string) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };
  const line = (points: number[], color: string, thickness = 2) => {
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.lineCap = 'round';
    ctx.stroke();
  };
  const light = ctx.createRadialGradient(210, 50, 10, 400, 310, 660);
  light.addColorStop(0, '#735337');
  light.addColorStop(0.42, '#34291d');
  light.addColorStop(1, '#100f0c');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, 900, 620);
  // Onlookers stay just outside the lamplight.
  for (let i = 0; i < 7; i++) {
    const x = 80 + i * 132;
    ellipse(x, 0, 33, 43, '#100f0dd9');
    ellipse(x, 60, 56, 51, i % 2 ? '#20211ad9' : '#191714e0');
    ellipse(x + 35, 100, 22, 9, '#80634655');
  }
  ctx.fillStyle = '#36271b';
  ctx.fillRect(0, 124, 900, 496);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#4b342127' : '#15110e35';
    ctx.fillRect(i * 127, 124, 124, 496);
    line([i * 127, 124, i * 127 - 22, 620], '#120e0b', 3);
  }
  for (let i = 0; i < 120; i++) {
    const x = (i * 167.3) % 900;
    const y = 130 + ((i * 67.1) % 490);
    line([x, y, x + 5 * Math.sin(i), y + 30 + (i % 32)], '#ae805317', 1);
  }
  // Warm paper lantern and its pool of light.
  const glow = ctx.createRadialGradient(95, 110, 4, 95, 110, 250);
  glow.addColorStop(0, '#ffca6d65');
  glow.addColorStop(1, '#e6a64c00');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 370, 400);
  line([86, 0, 86, 32], '#100e0b', 5);
  ellipse(86, 80, 36, 58, '#c39553');
  ellipse(86, 78, 29, 53, '#efd199');
  for (let i = 0; i < 6; i++) line([54, 44 + i * 14, 118, 44 + i * 14], '#83623766', 1);
  ctx.fillStyle = '#342c1e';
  ctx.fillRect(65, 23, 42, 9);
  ctx.fillRect(65, 132, 42, 8);
  // Tea, scattered seed, and a bamboo cricket cage.
  ellipse(797, 140, 49, 16, '#0b0b0980');
  ellipse(795, 122, 35, 29, '#535c49');
  ellipse(795, 110, 36, 15, '#a1a489');
  ellipse(795, 110, 28, 10, '#342719');
  line([783, 92, 790, 73, 784, 51], '#d5cbb230', 2);
  ctx.save();
  ctx.translate(790, 531);
  ctx.rotate(-0.25);
  ellipse(0, 9, 60, 38, '#07080770');
  ctx.fillStyle = '#73633d';
  ctx.fillRect(-48, -32, 96, 66);
  for (let i = -44; i < 48; i += 8) line([i, -32, i, 33], '#bc9d61', 3);
  line([-49, -32, 49, -32], '#c2a66b', 6);
  line([-49, 33, 49, 33], '#a48a52', 6);
  ctx.restore();
  for (let i = 0; i < 18; i++)
    ellipse(65 + ((i * 19) % 100), 472 + ((i * 13) % 79), 2.5, 1.7, '#bc9c5c');
  // Heavy fired-clay bowl: outer wall, polished lip, concave sand floor.
  ellipse(456, 381, 377, 224, '#080806a0');
  const clay = ctx.createLinearGradient(0, 125, 0, 578);
  clay.addColorStop(0, '#8b7454');
  clay.addColorStop(0.5, '#5b4e39');
  clay.addColorStop(1, '#2b291e');
  ctx.beginPath();
  ctx.ellipse(450, 347, 368, 222, 0, 0, Math.PI * 2);
  ctx.fillStyle = clay;
  ctx.fill();
  ellipse(450, 328, 365, 212, '#b29a70');
  ellipse(450, 325, 354, 202, '#665b43');
  const sand = ctx.createRadialGradient(395, 321, 40, 450, 325, 350);
  sand.addColorStop(0, '#ae9b70');
  sand.addColorStop(0.65, '#8a7c58');
  sand.addColorStop(1, '#3c3a2a');
  ctx.beginPath();
  ctx.ellipse(450, 321, 334, 185, 0, 0, Math.PI * 2);
  ctx.fillStyle = sand;
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let i = 0; i < 1250; i++) {
    const x = 115 + ((i * 139.71) % 670);
    const y = 137 + ((i * 61.13) % 370);
    ctx.fillStyle = i % 3 ? '#352f231e' : '#e7d5a533';
    ctx.fillRect(x, y, i % 4 === 0 ? 2 : 1, 1);
  }
  for (let i = 0; i < 12; i++) {
    const x = 220 + i * 43;
    const y = 255 + Math.sin(i * 3) * 90;
    line([x, y, x + 31, y + 9, x + 39, y + 15], '#4e48332c', 1);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(450, 326, 352, 200, 0, 0.12, Math.PI - 0.12);
  ctx.strokeStyle = '#d3bb8480';
  ctx.lineWidth = 3;
  ctx.stroke();

  function cricket(x: number, y: number, facing: number, enemy: boolean) {
    const hit = enemy ? (duel?.enemyImpact ?? 0) : (duel?.impact ?? 0);
    const hurt = enemy ? (duel?.impact ?? 0) : (duel?.enemyImpact ?? 0);
    const charge = enemy ? (duel?.windup ?? 0) : (duel?.charge ?? 0);
    const dead = duel?.winner != null && (enemy ? duel.winner : !duel.winner);
    const step = Math.sin(time * (charge ? 28 : 10));
    ctx.save();
    ctx.translate(
      x + facing * hit * 58 - facing * hurt * 18,
      y - (enemy ? 0 : (duel?.dodge ?? 0) * 55),
    );
    ctx.scale(facing, 1);
    ctx.rotate(dead ? -0.25 : Math.sin(time * 2.3) * 0.025);
    ellipse(-12, 23, 65, 15, '#17170dad');
    // Six jointed legs, enlarged folded hind femurs and fine tibial spines.
    for (const side of [-1, 1]) {
      const z = step * side * (dead ? 0 : 4);
      line([-25, side * 9, -50, side * 43 + z, -81, side * 19, -90, side * 30], '#282a19', 4);
      line([-24, side * 9, -50, side * 43 + z], enemy ? '#554124' : '#596037', 10);
      line([-26, side * 9, -48, side * 40 + z], '#b09a5566', 2);
      line([-3, side * 12, 6, side * 33 - z, -17, side * 46], '#34351d', 3);
      line([17, side * 10, 36, side * 25 + z, 53, side * 31], '#34351d', 3);
      for (let i = 0; i < 4; i++)
        line(
          [-59 - i * 6, side * (37 - i * 4) + z, -64 - i * 6, side * (39 - i * 4) + z],
          '#262a17',
          1,
        );
      line([-55, side * 7, -78, side * 16], '#65653b', 2);
    }
    const body = ctx.createLinearGradient(0, -17, 0, 19);
    body.addColorStop(0, enemy ? '#867046' : '#808452');
    body.addColorStop(0.45, enemy ? '#534528' : '#4b542d');
    body.addColorStop(1, '#202415');
    ctx.beginPath();
    ctx.ellipse(-25, 0, 38, 17, 0, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
    for (let i = 0; i < 6; i++) line([-48 + i * 7, -12, -43 + i * 7, 13], '#191f1760', 1);
    ctx.beginPath();
    ctx.moveTo(10, -13);
    ctx.quadraticCurveTo(-20, -25, -57, -3);
    ctx.quadraticCurveTo(-24, 7, 10, 6);
    ctx.fillStyle = enemy ? '#756442' : '#687548';
    ctx.fill();
    for (let i = 0; i < 5; i++) line([5, -10 + i * 3, -47, -2], '#c9b67445', 1);
    ellipse(9, 0, 16, 17, '#3a4024');
    ellipse(10, -5, 14, 10, enemy ? '#8a7143' : '#778455');
    ellipse(30, 0, 16, 16, enemy ? '#443724' : '#3d4327');
    ellipse(34, -9, 4, 5, '#11170e');
    ellipse(35, 8, 4, 5, '#11170e');
    ellipse(35, -11, 1.3, 1.5, '#eadcad');
    line([42, -6, 52, -8 - charge * 3, 48, 0], '#b19a60', 3);
    line([42, 6, 52, 8 + charge * 3, 48, 0], '#b19a60', 3);
    // Antennae react to both breathing and the grass stem.
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(37, side * 7);
      ctx.quadraticCurveTo(
        69,
        side * 28 + step * 3,
        112,
        side * (37 + charge * 10) + Math.sin(time * 4) * 10,
      );
      ctx.strokeStyle = '#d1ba7a';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
  }
  const px = duel?.x ?? 33;
  const ex = duel?.enemyX ?? 67;
  cricket(120 + px * 6.6, 331 + Math.sin(time * 2) * 2, 1, false);
  cricket(120 + ex * 6.6, 343 + Math.cos(time * 2) * 2, -1, true);
  if (duel?.impact || duel?.enemyImpact) {
    for (let i = 0; i < 15; i++) {
      const progress = 1 - Math.max(duel.impact, duel.enemyImpact) / 0.35;
      ellipse(
        450 + Math.sin(i * 13) * progress * 100,
        340 + Math.cos(i * 7) * progress * 45,
        2 * (1 - progress),
        2 * (1 - progress),
        '#dec79799',
      );
    }
  }
  // The player's grass stem physically reaches the cricket's antennae.
  const tease = duel?.holding ? Math.sin(time * 35) * 8 : 0;
  ctx.beginPath();
  ctx.moveTo(140, 660);
  ctx.quadraticCurveTo(205, 490, 170 + px * 6.6, 315 + tease);
  ctx.strokeStyle = '#9a9c52';
  ctx.lineWidth = 4;
  ctx.stroke();
  for (let i = 0; i < 5; i++)
    line([170 + px * 6.6, 315 + tease, 185 + px * 6.6 + i * 3, 292 + i * 7 + tease], '#c8be75', 1);
  // Subtle floating motes under the lantern.
  for (let i = 0; i < 16; i++)
    ellipse((i * 73 + time * 4) % 900, (i * 59 + time * 7) % 620, 1, 1, '#ecda9e38');
  const vignette = ctx.createRadialGradient(450, 305, 180, 450, 305, 530);
  vignette.addColorStop(0, '#070a0700');
  vignette.addColorStop(1, '#070a0780');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, 900, 620);
  ctx.restore();
}
