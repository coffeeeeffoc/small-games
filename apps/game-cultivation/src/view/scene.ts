import { opponents, type CricketMatch } from '../domain/cricket.js';

/** The same procedural scene runs offline in Web and native Canvas, with no asset downloads. */
export type CricketArt = { background?: CanvasImageSource; cricket?: CanvasImageSource };
export function drawCricketScene(
  ctx: CanvasRenderingContext2D,
  s: CricketMatch,
  clock: number,
  pointer = { x: 320, y: 380 },
  width = ctx.canvas.width,
  height = ctx.canvas.height,
  art: CricketArt = {},
) {
  const w = 1000,
    h = 720;
  ctx.save();
  ctx.scale(width / w, height / h);
  const ellipse = (x: number, y: number, rx: number, ry: number, color: string) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };
  const line = (points: number[], color: string, width = 1) => {
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  if (art.background) ctx.drawImage(art.background, 0, 0, w, h);
  else {
    ctx.fillStyle = '#30261c';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = i % 2 ? '#382b20' : '#3f3023';
      ctx.fillRect(i * 125, 0, 122, h);
      for (let j = 0; j < 10; j++)
        line([i * 125 + j * 12, 0, i * 125 + j * 12 + Math.sin(j) * 6, h], '#bd875b09', 2);
    }
    const glow = ctx.createRadialGradient(150, 20, 10, 350, 230, 800);
    glow.addColorStop(0, '#f4b85438');
    glow.addColorStop(1, '#00000065');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    // Tea cup and bamboo cricket cage sit outside the fighting basin.
    ellipse(915, 117, 85, 71, '#00000055');
    ellipse(905, 97, 75, 64, '#858172');
    ellipse(905, 94, 63, 53, '#ccc3a5');
    ellipse(905, 94, 52, 43, '#433427');
    ellipse(905, 95, 45, 36, '#5c4027');
    line([878, 78, 890, 74, 912, 74], '#f4dda666', 3);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(890 + i * 15, 68);
      ctx.bezierCurveTo(875 + Math.sin(clock + i) * 15, 30, 930, 20, 900 + i * 10, -20);
      ctx.strokeStyle = '#ecdec017';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(56, 580);
    ctx.rotate(-0.22);
    ctx.fillStyle = '#503e26';
    ctx.fillRect(-100, -90, 175, 155);
    for (let i = -90; i < 80; i += 13) line([i, -88, i, 62], '#a0824d', 5);
    for (let i = -85; i < 70; i += 24) line([-100, i, 75, i], '#6b502e', 5);
    ctx.restore();
    ellipse(502, 416, 425, 260, '#00000065');
    const rim = ctx.createLinearGradient(0, 140, 0, 650);
    rim.addColorStop(0, '#8e8170');
    rim.addColorStop(0.35, '#4e4b40');
    rim.addColorStop(0.7, '#302f28');
    rim.addColorStop(1, '#706651');
    ctx.beginPath();
    ctx.ellipse(500, 380, 418, 270, 0, 0, Math.PI * 2);
    ctx.fillStyle = rim;
    ctx.fill();
    ctx.strokeStyle = '#bbae8555';
    ctx.lineWidth = 3;
    ctx.stroke();
    ellipse(500, 370, 390, 242, '#272b23');
    const sand = ctx.createRadialGradient(450, 370, 40, 500, 370, 395);
    sand.addColorStop(0, '#998869');
    sand.addColorStop(0.65, '#857858');
    sand.addColorStop(1, '#414434');
    ctx.beginPath();
    ctx.ellipse(500, 384, 373, 222, 0, 0, Math.PI * 2);
    ctx.fillStyle = sand;
    ctx.fill();
    ctx.save();
    ctx.clip();
    for (let i = 0; i < 650; i++) {
      const x = ((((Math.sin(i * 127.1) * 43758.5) % 1) + 1) % 1) * 1000;
      const y = ((((Math.sin(i * 311.7) * 9643.3) % 1) + 1) % 1) * 720;
      ellipse(x, y, 0.6 + (i % 3) * 0.5, 0.5, i % 2 ? '#231f1933' : '#eee0ad33');
    }
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(500, 380, 320, 183, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#443f2f25';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  const attacking = s.impact > 0;
  const lunge = attacking ? Math.sin((s.impact / 0.3) * Math.PI) * 130 : 0;
  const shuffle = s.phase === 'fighting' ? Math.sin(clock * 4) * 5 : Math.sin(clock) * 2;

  function cricket(x: number, y: number, facing: number, player: boolean) {
    const hurt = attacking && (s.event === 'hurt' ? player : !player);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);
    ctx.rotate((player ? -0.13 : 0.16) + (hurt ? Math.sin(clock * 75) * 0.08 : 0));
    const alive = (player ? s.health : s.enemyHealth) > 0;
    const movement = alive ? clock * (s.holding && player ? 24 : 9) : 0;
    ellipse(-12, 15, 92, 28, '#17191065');
    // Each leg has a moving knee and a hooked foot; the hind femur carries the spring.
    for (const side of [-1, 1]) {
      for (let n = 0; n < 3; n++) {
        const base = 20 - n * 27;
        const step = Math.sin(movement + n * 2 + side) * (alive ? 3 : 0);
        const kneeX = base + (n === 0 ? 25 : -23),
          kneeY = side * (28 + n * 10);
        const footX = base + (n === 2 ? -57 : 29) + step,
          footY = side * (n === 2 ? 34 : 53 + n * 7);
        ctx.lineCap = 'round';
        line(
          [
            base,
            side * 12,
            kneeX,
            kneeY,
            footX,
            footY,
            footX + (n === 2 ? -8 : 6),
            footY + side * 5,
          ],
          '#332718',
          n === 2 ? 3.2 : 2,
        );
        if (n === 2) {
          line([base, side * 13, kneeX, kneeY], '#48341e', 8);
          line([base - 1, side * 14, kneeX, kneeY - side * 3], '#96804b', 2.5);
        }
        for (let k = 0; k < 4; k++) {
          const x = kneeX + ((footX - kneeX) * k) / 4,
            y = kneeY + ((footY - kneeY) * k) / 4;
          line([x, y, x - 3, y + side * 3], '#282519');
        }
      }
    }
    if (art.cricket) {
      ctx.save();
      // Texture only the three body segments; articulated legs remain live geometry.
      ctx.beginPath();
      for (const [x, rx, ry] of [
        [-30, 57, 25],
        [14, 24, 25],
        [37, 23, 22],
      ]) {
        ctx.moveTo(x + rx, 0);
        ctx.ellipse(x, 0, rx, ry, 0, 0, Math.PI * 2);
      }
      ctx.clip();
      ctx.drawImage(art.cricket, -137, -83, 268, 175);
      if (!player) {
        ctx.fillStyle = '#26241430';
        ctx.fillRect(-100, -35, 170, 70);
      }
      ctx.restore();
    } else {
      const body = ctx.createLinearGradient(0, -26, 0, 27);
      body.addColorStop(0, player ? '#a99454' : '#8c7154');
      body.addColorStop(0.32, player ? '#665c33' : '#50412f');
      body.addColorStop(1, '#201f14');
      ctx.beginPath();
      ctx.ellipse(-30, 0, 57, 25, 0, 0, Math.PI * 2);
      ctx.fillStyle = body;
      ctx.fill();
      ctx.strokeStyle = '#171c12';
      ctx.lineWidth = 2;
      ctx.stroke();
      for (let i = 0; i < 7; i++) line([-74 + i * 12, -14, -61 + i * 10, 17], '#b3a36640');
      line([-79, 0, 17, 0], '#c7b77870');
      ellipse(14, 0, 24, 25, player ? '#5b542e' : '#443a2b');
      ellipse(37, 0, 23, 22, '#282819');
      ellipse(40, -12, 6, 5, '#0d110a');
      ellipse(40, 12, 6, 5, '#0d110a');
      ellipse(41, -14, 1.8, 1.2, '#d4b77a');
    }
    const jaw = !player && s.enemyPhase === 'tell' ? 14 : 5 + Math.sin(movement) * 2;
    line([52, -9, 67, -jaw, 63, -2], '#b2a579', 3);
    line([52, 9, 67, jaw, 63, 2], '#b2a579', 3);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(48, side * 11);
      ctx.quadraticCurveTo(
        90,
        side * (24 + Math.sin(clock * 4 + side) * 10),
        142 + Math.cos(clock * 2) * 10,
        side * 48,
      );
      ctx.strokeStyle = '#222519';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      line([-78, side * 8, -106, side * 21], '#34351e', 2);
    }
    ctx.restore();
  }
  cricket(
    390 + shuffle + (s.event === 'hurt' ? -lunge * 0.35 : lunge),
    386 + (s.dodge > 0 ? 75 * Math.sin((s.dodge / 0.46) * Math.PI) : 0),
    1,
    true,
  );
  cricket(610 - shuffle + (s.event === 'hurt' ? -lunge : lunge * 0.35), 385, -1, false);
  if (s.impact > 0) {
    for (let i = 0; i < 20; i++) {
      const distance = (0.3 - s.impact) * 260;
      ellipse(
        500 + Math.cos(i * 2.4) * distance,
        385 + Math.sin(i * 2.4) * distance * 0.6,
        2.5,
        1.5,
        '#d7c79a77',
      );
    }
  }
  if (s.holding) {
    const tipX = Math.max(285, Math.min(420, pointer.x)),
      tipY = Math.max(330, Math.min(460, pointer.y));
    ctx.beginPath();
    ctx.moveTo(10, 740);
    ctx.quadraticCurveTo(120, 530, tipX, tipY);
    ctx.strokeStyle = '#b4a571';
    ctx.lineWidth = 5;
    ctx.stroke();
    for (let i = 0; i < 7; i++)
      line([tipX, tipY, tipX + 23 + i * 2, tipY - 15 + i * 5], '#d1c795', 1.2);
  }
  ctx.font = '18px serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#d2c197';
  ctx.fillText('青背 · 你的蛐蛐', 325, 563);
  ctx.fillStyle = '#baae91';
  ctx.fillText(opponents[s.round].name, 670, 563);
  ctx.restore();
}
