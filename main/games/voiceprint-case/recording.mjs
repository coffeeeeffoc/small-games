import { seededRandom, shuffle } from './levels.mjs';

const WIDTH = 720;
const HEIGHT = 450;
const TAU = Math.PI * 2;

// Appearance is re-cast each round, independently of candidate position. The
// anonymous scene receives only the performer's movement, never their design.
const PERFORMERS = Object.freeze([
  Object.freeze({
    id: 'reader',
    coat: '#647e70',
    light: '#91a28d',
    dark: '#3a534c',
    skin: '#d2a582',
    shade: '#a16c53',
    hair: '#282c2c',
    room: '#38443c',
    accent: '#b4ba91',
  }),
  Object.freeze({
    id: 'reflective',
    coat: '#ae735a',
    light: '#cb9477',
    dark: '#794f44',
    skin: '#dfb69a',
    shade: '#b17b64',
    hair: '#614033',
    room: '#4c4140',
    accent: '#c19975',
  }),
  Object.freeze({
    id: 'conversational',
    coat: '#526879',
    light: '#8b9ea4',
    dark: '#334653',
    skin: '#bf9476',
    shade: '#8e6552',
    hair: '#5d6260',
    room: '#34434b',
    accent: '#9bada4',
  }),
]);

export function createRecordingProfiles(round) {
  const random = seededRandom((round.noiseSeed ^ Math.imul(round.id, 2246822519)) >>> 0);
  const cast = shuffle(PERFORMERS, random);
  const voiceIds = [...new Set(round.candidates.map((clip) => clip.voiceId))].sort();
  const byVoice = new Map(voiceIds.map((voiceId, index) => [voiceId, cast[index % cast.length]]));
  return {
    candidates: round.candidates.map((clip) => byVoice.get(clip.voiceId)),
    scene: byVoice.get(round.target.voiceId),
  };
}

const pulse = (time, center, width) => Math.exp(-(((time - center) / width) ** 2));

// The same clock and movement recipe are used in the scene and its answer.
// Every performer starts in the same resting pose: a paused frame is no clue.
export function recordingPose(performerId, time = 0, speech = 0, playing = false) {
  const pose = {
    lean: 0,
    tilt: 0,
    nod: 0,
    brow: 0,
    gaze: 0,
    blink: 1,
    breath: 0,
    leftX: -58,
    leftY: 118,
    rightX: 53,
    rightY: 120,
    palm: 0,
    mouth: 0,
  };
  if (!playing) return pose;
  const entrance = Math.min(1, time * 4);
  const first = pulse(time, 0.64, 0.3);
  const second = pulse(time, 1.48, 0.43);
  pose.breath = Math.sin(time * 2.1) * 1.1 * entrance;
  pose.mouth = Math.min(1, speech);
  pose.blink = 1 - pulse(time, 0.92, 0.052) * 0.94 - pulse(time, 2.05, 0.06) * 0.94;
  if (performerId === 'reader') {
    pose.nod = first * 5.7 - pulse(time, 0.92, 0.17) * 1.8 + second * 2.8;
    pose.tilt = Math.sin(time * 3.2) * 0.014 * entrance;
    pose.leftX -= second * 7;
    pose.leftY -= second * 15;
    pose.rightX -= first * 9;
    pose.rightY -= first * 13;
    pose.brow = first * 1.7;
    pose.gaze = 1.6 * first - 1.5 * second;
  } else if (performerId === 'reflective') {
    pose.tilt = -0.07 * first + 0.035 * second;
    pose.lean = first * 3;
    pose.leftX += second * 12;
    pose.leftY -= second * 11;
    pose.rightX -= first * 10;
    pose.rightY -= first * 77;
    pose.brow = second * 2;
    pose.gaze = -first * 2.2;
  } else {
    pose.lean = first * -3 + second * 2;
    pose.tilt = 0.025 * first - second * 0.04;
    pose.nod = second * 2;
    pose.leftX -= first * 12;
    pose.leftY -= first * 30;
    pose.rightX += second * 19;
    pose.rightY -= second * 37;
    pose.palm = Math.max(first, second);
    pose.brow = first * 3;
    pose.gaze = first * 1.2;
  }
  return pose;
}

function path(ctx, points, fill, stroke, width = 1) {
  ctx.beginPath();
  for (const [command, ...args] of points) ctx[command](...args);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function rect(ctx, x, y, width, height, fill, radius = 0) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
}

function ellipse(ctx, x, y, rx, ry, fill, rotation = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rotation, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}

function line(ctx, points, color, width = 1) {
  ctx.beginPath();
  points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function linear(ctx, x0, y0, x1, y1, colors) {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  colors.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  return gradient;
}

function glow(ctx, x, y, radius, color) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawWindow(ctx, round, time, anonymous) {
  rect(ctx, 35, 48, 216, 243, '#101d20', 3);
  rect(
    ctx,
    43,
    55,
    200,
    226,
    linear(ctx, 0, 55, 0, 281, [
      [0, '#142b37'],
      [0.58, '#354c50'],
      [1, '#78918a'],
    ]),
  );
  ctx.save();
  ctx.beginPath();
  ctx.rect(45, 57, 196, 221);
  ctx.clip();
  glow(ctx, 176, 188, 120, '#b6c6a127');
  const buildings = [
    [45, 175, 25, 116],
    [73, 153, 42, 140],
    [119, 194, 19, 98],
    [144, 166, 48, 125],
    [199, 189, 50, 100],
  ];
  buildings.forEach(([x, y, w, h], index) => {
    rect(ctx, x, y, w, h, index % 2 ? '#263f43' : '#20393e');
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 3; col++) {
        if ((row * 3 + col + index) % 4 === 0)
          rect(ctx, x + 5 + col * 11, y + 13 + row * 19, 4, 6, '#d2b7847a');
      }
  });
  if (round.texture === 'rain') {
    ctx.strokeStyle = '#b5d2ce45';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 34; i++) {
      const x = 48 + ((i * 47) % 190);
      const y = 56 + ((i * 37 + time * (16 + (i % 4))) % 220);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y + 15 + (i % 10));
      ctx.stroke();
    }
    [63, 127, 216].forEach((x, i) =>
      line(
        ctx,
        [
          [x, 68 + i * 38],
          [x - 2, 97 + i * 38],
          [x + 1, 142 + i * 38],
        ],
        '#bfd4cf27',
      ),
    );
  }
  if (round.texture === 'traffic') {
    const travel = (time * 21) % 180;
    line(
      ctx,
      [
        [44, 263],
        [248, 232],
      ],
      '#adbdac39',
      6,
    );
    line(
      ctx,
      [
        [68 + travel, 260 - travel * 0.15],
        [81 + travel, 258 - travel * 0.15],
      ],
      '#e6c88b7a',
      2,
    );
    line(
      ctx,
      [
        [209 - travel, 251 + travel * 0.15],
        [218 - travel, 250 + travel * 0.15],
      ],
      '#b96d567a',
      2,
    );
  }
  ctx.fillStyle = linear(ctx, 43, 60, 227, 274, [
    [0, '#fff4d814'],
    [0.3, '#ffffff00'],
    [0.75, '#cfe9d215'],
    [1, '#ffffff00'],
  ]);
  ctx.fillRect(44, 57, 197, 223);
  ctx.restore();
  rect(ctx, 139, 54, 7, 229, '#182b2b');
  rect(ctx, 42, 159, 202, 7, '#182b2b');
  line(
    ctx,
    [
      [44, 55],
      [241, 55],
      [241, 280],
    ],
    '#9caf9a38',
    2,
  );
  rect(ctx, 30, 283, 227, 9, '#405149', 1);
  rect(ctx, 27, 293, 229, 6, '#1d302c');
  // Heavy linen at the sides softens the rigid room geometry.
  path(
    ctx,
    [
      ['moveTo', 14, 41],
      ['lineTo', 55, 42],
      ['bezierCurveTo', 38, 124, 47, 226, 32, 305],
      ['lineTo', 12, 312],
      ['closePath'],
    ],
    anonymous ? '#303b38' : '#5e6658',
  );
  line(
    ctx,
    [
      [26, 49],
      [22, 143],
      [26, 218],
      [20, 302],
    ],
    '#cad0ae13',
    3,
  );
  path(
    ctx,
    [
      ['moveTo', 240, 40],
      ['lineTo', 274, 43],
      ['lineTo', 283, 302],
      ['lineTo', 258, 293],
      ['bezierCurveTo', 250, 236, 254, 138, 240, 40],
    ],
    '#333e37',
  );
  line(
    ctx,
    [
      [258, 47],
      [265, 173],
      [269, 288],
    ],
    '#a0ab9020',
    2,
  );
}

function drawBookshelf(ctx, accent) {
  rect(ctx, 572, 70, 120, 247, '#192623', 3);
  rect(ctx, 580, 79, 105, 232, '#26332b');
  [155, 230, 306].forEach((y) => {
    rect(ctx, 576, y, 115, 7, '#52604a');
    rect(ctx, 576, y + 7, 114, 4, '#111e1c');
  });
  const colors = ['#86745b', '#626f5c', '#946d54', '#53666a', '#b3aa88', '#455849'];
  for (let row = 0; row < 3; row++) {
    for (let b = 0; b < 6; b++) {
      const h = 37 + ((b * 13 + row * 11) % 29);
      const x = 585 + b * 14;
      const bottom = 155 + row * 75;
      ctx.save();
      ctx.translate(x, bottom);
      if (b === 5) ctx.rotate(-0.11);
      rect(ctx, 0, -h, 10 + (b % 3), h, colors[(b + row) % colors.length], 1);
      rect(ctx, 2, -h + 5, 1, h - 8, '#ece2ba1e');
      rect(ctx, 2, -12, 7, 1, '#d9c59a55');
      ctx.restore();
    }
  }
  rect(ctx, 591, 41, 49, 28, '#93794d', 2);
  rect(ctx, 595, 45, 41, 21, '#b9ae8a', 1);
  path(
    ctx,
    [
      ['moveTo', 599, 62],
      ['lineTo', 612, 47],
      ['lineTo', 621, 60],
      ['lineTo', 629, 53],
      ['lineTo', 635, 62],
      ['closePath'],
    ],
    accent,
  );
  ellipse(ctx, 668, 58, 13, 12, '#918f73');
  rect(ctx, 657, 48, 22, 5, '#95967a', 2);
  line(
    ctx,
    [
      [668, 46],
      [664, 24],
      [675, 11],
    ],
    '#707f60',
    2,
  );
  ellipse(ctx, 663, 30, 8, 3, '#8b9674', 0.5);
  ellipse(ctx, 673, 22, 8, 3, '#6d8269', -0.5);
}

function drawPlant(ctx) {
  ellipse(ctx, 98, 356, 47, 9, '#09181670');
  path(
    ctx,
    [
      ['moveTo', 77, 311],
      ['lineTo', 116, 311],
      ['lineTo', 111, 350],
      ['quadraticCurveTo', 97, 360, 83, 349],
      ['closePath'],
    ],
    '#8b7860',
  );
  ellipse(ctx, 97, 312, 20, 5, '#5c5947');
  for (let i = 0; i < 7; i++) {
    const angle = -1.5 + (i - 3) * 0.29;
    const x = 97 + Math.cos(angle) * (42 + (i % 3) * 13);
    const y = 313 + Math.sin(angle) * (47 + (i % 4) * 13);
    line(
      ctx,
      [
        [97, 321],
        [(97 + x) / 2, y + 20],
        [x, y],
      ],
      '#617760',
      1.4,
    );
    ellipse(ctx, x, y, 9, 24, i % 2 ? '#66785b' : '#3e614e', angle + Math.PI / 2);
    line(
      ctx,
      [
        [x - Math.cos(angle) * 10, y - Math.sin(angle) * 10],
        [x + Math.cos(angle) * 12, y + Math.sin(angle) * 12],
      ],
      '#a9b08b24',
    );
  }
}

function drawRoom(ctx, round, performer, anonymous, time) {
  const wall = anonymous ? '#33413e' : performer.room;
  rect(
    ctx,
    0,
    0,
    WIDTH,
    HEIGHT,
    linear(ctx, 0, 0, WIDTH, HEIGHT, [
      [0, '#263a38'],
      [0.6, wall],
      [1, '#252e29'],
    ]),
  );
  path(
    ctx,
    [
      ['moveTo', 536, 0],
      ['lineTo', 720, 0],
      ['lineTo', 720, 336],
      ['lineTo', 536, 314],
      ['closePath'],
    ],
    '#17282245',
  );
  line(
    ctx,
    [
      [536, 0],
      [536, 315],
    ],
    '#d3c49d0c',
  );
  line(
    ctx,
    [
      [0, 320],
      [537, 313],
      [720, 337],
    ],
    '#121f1b',
    7,
  );
  line(
    ctx,
    [
      [0, 316],
      [536, 309],
      [720, 333],
    ],
    '#95a18730',
    2,
  );
  rect(ctx, 0, 322, WIDTH, 128, '#26342c');
  for (let i = 0; i < 8; i++)
    line(
      ctx,
      [
        [90 + i * 95, 320],
        [-160 + i * 162, 450],
      ],
      '#a3a38212',
    );
  drawWindow(ctx, round, time, anonymous);
  drawBookshelf(ctx, anonymous ? '#737f70' : performer.accent);
  // Small wall print, with no writing or identity-specific room markers.
  rect(ctx, 299, 42, 99, 67, '#26312a', 2);
  rect(ctx, 303, 46, 91, 59, '#b4b099');
  rect(ctx, 308, 51, 81, 48, '#71857c');
  path(
    ctx,
    [
      ['moveTo', 308, 88],
      ['quadraticCurveTo', 331, 62, 349, 82],
      ['quadraticCurveTo', 367, 60, 389, 76],
      ['lineTo', 389, 99],
      ['lineTo', 308, 99],
      ['closePath'],
    ],
    '#475f56',
  );
  ellipse(ctx, 367, 62, 8, 8, '#d5caae');
  if (round.texture === 'vent') {
    rect(ctx, 433, 37, 83, 25, '#303c34', 2);
    for (let i = 0; i < 5; i++)
      line(
        ctx,
        [
          [440, 42 + i * 4],
          [508, 42 + i * 4],
        ],
        '#87947b45',
      );
  }
  // Warm practical lighting balances the cool window fill.
  glow(ctx, 530, 196, 184, anonymous ? '#d0b07715' : '#e9bd7240');
  ellipse(ctx, 527, 338, 34, 7, '#16231e');
  rect(ctx, 524, 190, 5, 146, '#aaa27e');
  ellipse(ctx, 527, 336, 26, 4, '#76785e');
  path(
    ctx,
    [
      ['moveTo', 502, 149],
      ['lineTo', 547, 149],
      ['lineTo', 564, 202],
      ['quadraticCurveTo', 530, 214, 487, 203],
      ['closePath'],
    ],
    linear(ctx, 490, 160, 558, 207, [
      [0, '#ae9c70'],
      [0.4, '#e0c58a'],
      [1, '#9a895f'],
    ]),
  );
  ellipse(ctx, 525, 203, 38, 5, '#f4d990');
  line(
    ctx,
    [
      [505, 156],
      [496, 200],
    ],
    '#f3deac42',
  );
  drawPlant(ctx);
  // Chair visible behind the shoulders.
  path(
    ctx,
    [
      ['moveTo', 304, 336],
      ['lineTo', 300, 243],
      ['quadraticCurveTo', 300, 222, 322, 218],
      ['quadraticCurveTo', 403, 203, 476, 230],
      ['lineTo', 489, 345],
      ['closePath'],
    ],
    '#162421',
  );
  path(
    ctx,
    [
      ['moveTo', 311, 320],
      ['lineTo', 309, 245],
      ['quadraticCurveTo', 382, 219, 469, 241],
      ['lineTo', 479, 329],
    ],
    null,
    '#546051',
    3,
  );
  glow(ctx, 138, 198, 246, '#a8cfbd0d');
}

function drawTorso(ctx, profile, anonymous, pose) {
  const coat = anonymous ? '#091314' : profile.coat;
  const shade = anonymous ? '#060e10' : profile.dark;
  const light = anonymous ? '#152123' : profile.light;
  ctx.save();
  ctx.translate(397 + pose.lean, 231 + pose.breath);
  path(
    ctx,
    [
      ['moveTo', -33, -11],
      ['quadraticCurveTo', -49, 1, -68, 10],
      ['quadraticCurveTo', -98, 15, -100, 43],
      ['lineTo', -110, 151],
      ['quadraticCurveTo', 0, 170, 105, 151],
      ['lineTo', 99, 49],
      ['quadraticCurveTo', 98, 18, 71, 12],
      ['lineTo', 33, -9],
      ['closePath'],
    ],
    linear(ctx, -90, 30, 99, 95, [
      [0, light],
      [0.3, coat],
      [1, shade],
    ]),
  );
  path(
    ctx,
    [
      ['moveTo', -69, 23],
      ['quadraticCurveTo', -63, 70, -73, 114],
    ],
    null,
    anonymous ? '#24333238' : '#d8d7b333',
    2,
  );
  path(
    ctx,
    [
      ['moveTo', 71, 23],
      ['quadraticCurveTo', 58, 75, 67, 123],
    ],
    null,
    '#09171345',
    3,
  );
  if (!anonymous) {
    // Clothing layers distinguish the witnesses, never the anonymous source.
    if (profile.id === 'reflective') {
      path(
        ctx,
        [
          ['moveTo', -20, 0],
          ['lineTo', 18, 0],
          ['lineTo', 33, 146],
          ['lineTo', -32, 146],
          ['closePath'],
        ],
        '#c6b8a0',
      );
      path(
        ctx,
        [
          ['moveTo', -28, -4],
          ['lineTo', -45, 42],
          ['lineTo', -26, 65],
          ['lineTo', -37, 148],
        ],
        null,
        '#ddae8a88',
        3,
      );
      path(
        ctx,
        [
          ['moveTo', 30, -4],
          ['lineTo', 46, 44],
          ['lineTo', 28, 63],
          ['lineTo', 40, 148],
        ],
        null,
        '#704a3b99',
        3,
      );
    } else if (profile.id === 'conversational') {
      path(
        ctx,
        [
          ['moveTo', -22, -4],
          ['lineTo', -42, 18],
          ['lineTo', -18, 40],
          ['lineTo', -1, 17],
          ['lineTo', 19, 40],
          ['lineTo', 40, 17],
          ['lineTo', 23, -4],
        ],
        '#a9b2ab',
      );
      line(
        ctx,
        [
          [0, 20],
          [3, 151],
        ],
        '#a5b2aa44',
        2,
      );
      for (let i = 0; i < 3; i++) ellipse(ctx, 3, 57 + i * 33, 2, 2, '#d0ccb0');
      path(
        ctx,
        [
          ['moveTo', 32, 55],
          ['lineTo', 61, 55],
          ['lineTo', 57, 88],
          ['quadraticCurveTo', 46, 96, 34, 86],
          ['closePath'],
        ],
        null,
        '#a2b4ac45',
      );
    } else {
      path(
        ctx,
        [
          ['moveTo', -36, 2],
          ['quadraticCurveTo', 0, 37, 37, 3],
        ],
        null,
        '#c0c0a66b',
        6,
      );
      path(
        ctx,
        [
          ['moveTo', -35, 4],
          ['quadraticCurveTo', 0, 36, 35, 5],
        ],
        null,
        '#3d564b',
        2,
      );
      for (let i = 0; i < 10; i++)
        path(
          ctx,
          [
            ['moveTo', -65, 52 + i * 8],
            ['quadraticCurveTo', -5, 64 + i * 8, 65, 53 + i * 8],
          ],
          null,
          '#d7dcc30b',
        );
    }
    path(
      ctx,
      [
        ['moveTo', -58, 93],
        ['quadraticCurveTo', -33, 102, -43, 123],
      ],
      null,
      '#102b2740',
      2,
    );
    path(
      ctx,
      [
        ['moveTo', 43, 103],
        ['lineTo', 58, 90],
      ],
      null,
      '#d9d2ae20',
      2,
    );
  }
  ctx.restore();
}

function faceOutline(ctx, fill) {
  path(
    ctx,
    [
      ['moveTo', -40, -126],
      ['bezierCurveTo', -54, -109, -51, -72, -43, -55],
      ['bezierCurveTo', -34, -29, -11, -14, 3, -16],
      ['bezierCurveTo', 22, -17, 43, -40, 47, -63],
      ['bezierCurveTo', 53, -90, 48, -121, 35, -133],
      ['bezierCurveTo', 17, -152, -25, -150, -40, -126],
      ['closePath'],
    ],
    fill,
  );
}

function drawHead(ctx, profile, anonymous, pose, time) {
  ctx.save();
  ctx.translate(397 + pose.lean, 231 + pose.breath + pose.nod);
  ctx.rotate(pose.tilt);
  const skin = anonymous ? '#081113' : profile.skin;
  const shade = anonymous ? '#070e10' : profile.shade;
  path(
    ctx,
    [
      ['moveTo', -20, -44],
      ['lineTo', -23, 0],
      ['quadraticCurveTo', 0, 20, 25, 0],
      ['lineTo', 20, -43],
      ['closePath'],
    ],
    linear(ctx, -20, 0, 15, -35, [
      [0, skin],
      [1, shade],
    ]),
  );
  if (anonymous) {
    // Deliberately uniform, featureless head: not even hairstyle, face contour,
    // glasses, age, skin, or a mouth shape can identify the hidden character.
    ellipse(ctx, 0, -83, 48, 65, '#081113');
    path(
      ctx,
      [
        ['moveTo', -43, -110],
        ['quadraticCurveTo', -55, -78, -34, -44],
      ],
      null,
      '#81928715',
      2,
    );
    ctx.restore();
    return;
  }
  if (profile.id === 'reflective') {
    ellipse(ctx, 38, -117, 25, 33, profile.hair, -0.1);
    ellipse(ctx, 52, -109, 16, 25, '#4a302a', 0.2);
  }
  ellipse(ctx, -48, -78, 9, 16, skin, -0.08);
  ellipse(ctx, 47, -77, 9, 16, shade, 0.08);
  faceOutline(
    ctx,
    linear(ctx, -44, -86, 48, -63, [
      [0, '#e7c5a5'],
      [0.22, skin],
      [0.69, skin],
      [1, shade],
    ]),
  );
  path(
    ctx,
    [
      ['moveTo', 33, -125],
      ['bezierCurveTo', 47, -86, 46, -47, 14, -22],
      ['quadraticCurveTo', 33, -24, 44, -59],
      ['quadraticCurveTo', 59, -107, 33, -125],
    ],
    '#754e3b20',
  );
  ellipse(ctx, -27, -63, 16, 10, '#c2756121', -0.1);
  ellipse(ctx, 29, -62, 14, 10, '#ad6d5521', 0.1);
  line(
    ctx,
    [
      [-49, -82],
      [-44, -77],
      [-46, -68],
    ],
    '#985f4e8c',
  );
  // A softly offset nose, separate eye whites, and eyelids read at phone size.
  path(
    ctx,
    [
      ['moveTo', 3, -94],
      ['quadraticCurveTo', 3, -77, 8, -66],
      ['quadraticCurveTo', 4, -62, -3, -66],
    ],
    null,
    '#875d4880',
    1.5,
  );
  line(
    ctx,
    [
      [-1, -67],
      [-4, -65],
    ],
    '#704c3d6b',
    1.2,
  );
  const eyeY = -87;
  for (const side of [-1, 1]) {
    const x = side * 22;
    const h = Math.max(0.6, pose.blink * 4.2);
    ellipse(ctx, x, eyeY, 11, h, '#eee0c8');
    if (pose.blink > 0.25) {
      ellipse(ctx, x + pose.gaze, eyeY + 0.1, 3.4, h, '#414139');
      ellipse(ctx, x + pose.gaze + 0.3, eyeY, 1.6, Math.min(h, 3.1), '#1e2b2a');
      ellipse(ctx, x + pose.gaze - 0.8, eyeY - 1.1, 0.8, 0.8, '#e2e1c9');
    }
    path(
      ctx,
      [
        ['moveTo', x - 11, eyeY - 0.7],
        ['quadraticCurveTo', x, eyeY - h - 3, x + 11, eyeY - 0.5],
      ],
      null,
      '#493d33',
      1.6,
    );
    path(
      ctx,
      [
        ['moveTo', x - 10, -100 - pose.brow],
        ['quadraticCurveTo', x, -104 - pose.brow, x + 10, -100 - pose.brow * 0.7],
      ],
      null,
      profile.hair,
      profile.id === 'conversational' ? 3.7 : 3,
    );
    line(
      ctx,
      [
        [x - 7, -77],
        [x + 5, -76],
      ],
      '#946d5540',
    );
  }
  if (pose.mouth > 0.035) {
    const openness = 1.3 + pose.mouth * 6.7;
    ellipse(ctx, 2, -43, 10.5 - pose.mouth * 2, openness, '#674034');
    ellipse(ctx, 2, -40 + openness * 0.2, 5.8, Math.max(1, openness * 0.28), '#bb8070');
    if (pose.mouth > 0.28) rect(ctx, -3.4, -47, 10.8, 1.8, '#dbcbb3', 0.7);
    path(
      ctx,
      [
        ['moveTo', -8, -44 - openness * 0.32],
        ['quadraticCurveTo', 1, -47 - openness * 0.3, 11, -44 - openness * 0.32],
      ],
      null,
      '#9a6555',
      1.4,
    );
  } else {
    path(
      ctx,
      [
        ['moveTo', -9, -43],
        ['quadraticCurveTo', 2, -39.7, 12, -43],
      ],
      null,
      '#895646',
      1.5,
    );
    path(
      ctx,
      [
        ['moveTo', -4, -38.5],
        ['quadraticCurveTo', 2, -37, 8, -39],
      ],
      null,
      '#d8a890',
      1.2,
    );
  }
  if (profile.id === 'reader') {
    path(
      ctx,
      [
        ['moveTo', -49, -87],
        ['lineTo', -46, -120],
        ['quadraticCurveTo', -41, -149, -10, -154],
        ['quadraticCurveTo', 30, -163, 47, -130],
        ['lineTo', 49, -96],
        ['lineTo', 39, -104],
        ['lineTo', 34, -128],
        ['quadraticCurveTo', 8, -107, -32, -118],
        ['lineTo', -38, -94],
        ['closePath'],
      ],
      profile.hair,
    );
    path(
      ctx,
      [
        ['moveTo', -33, -134],
        ['quadraticCurveTo', -1, -153, 33, -137],
      ],
      null,
      '#6b6d594a',
      3,
    );
    path(
      ctx,
      [
        ['moveTo', -30, -129],
        ['quadraticCurveTo', -3, -140, 17, -131],
      ],
      null,
      '#71725b27',
      2,
    );
    // Thin rounded spectacles; lenses remain transparent enough for expression.
    ctx.strokeStyle = '#39473f';
    ctx.lineWidth = 2.3;
    for (const x of [-39, 6]) {
      ctx.beginPath();
      ctx.roundRect(x, -99, 33, 25, 8);
      ctx.stroke();
    }
    path(
      ctx,
      [
        ['moveTo', -6, -88],
        ['quadraticCurveTo', 0, -92, 6, -88],
      ],
      null,
      '#39473f',
      2,
    );
    line(
      ctx,
      [
        [-40, -89],
        [-48, -91],
      ],
      '#39473f',
      2,
    );
    line(
      ctx,
      [
        [39, -89],
        [48, -91],
      ],
      '#39473f',
      2,
    );
    line(
      ctx,
      [
        [-34, -94],
        [-24, -96],
      ],
      '#fbecd633',
      1.3,
    );
  } else if (profile.id === 'reflective') {
    path(
      ctx,
      [
        ['moveTo', -47, -69],
        ['quadraticCurveTo', -58, -97, -48, -128],
        ['quadraticCurveTo', -40, -154, -9, -153],
        ['quadraticCurveTo', 21, -162, 44, -134],
        ['quadraticCurveTo', 57, -115, 44, -81],
        ['lineTo', 37, -114],
        ['quadraticCurveTo', 5, -127, -6, -139],
        ['quadraticCurveTo', -10, -116, -36, -103],
        ['lineTo', -42, -69],
        ['closePath'],
      ],
      profile.hair,
    );
    path(
      ctx,
      [
        ['moveTo', -40, -110],
        ['quadraticCurveTo', -13, -132, -9, -145],
      ],
      null,
      '#ad78604d',
      3,
    );
    path(
      ctx,
      [
        ['moveTo', -1, -147],
        ['quadraticCurveTo', 28, -141, 42, -121],
      ],
      null,
      '#b580602d',
      2,
    );
    ellipse(ctx, -48, -66, 2.6, 4.4, '#ddbd7e');
    ellipse(ctx, 48, -65, 2.6, 4.4, '#c39e67');
    path(
      ctx,
      [
        ['moveTo', -14, -16],
        ['quadraticCurveTo', -1, -6, 14, -15],
      ],
      null,
      '#d2b58f',
      1.2,
    );
  } else {
    path(
      ctx,
      [
        ['moveTo', -46, -87],
        ['lineTo', -51, -113],
        ['quadraticCurveTo', -62, -124, -46, -137],
        ['quadraticCurveTo', -41, -155, -25, -150],
        ['quadraticCurveTo', -6, -169, 8, -153],
        ['quadraticCurveTo', 27, -160, 36, -143],
        ['quadraticCurveTo', 60, -139, 49, -112],
        ['lineTo', 44, -88],
        ['lineTo', 36, -119],
        ['quadraticCurveTo', 9, -125, -12, -125],
        ['quadraticCurveTo', -33, -116, -37, -113],
        ['lineTo', -39, -89],
        ['closePath'],
      ],
      profile.hair,
    );
    path(
      ctx,
      [
        ['moveTo', -43, -128],
        ['quadraticCurveTo', -27, -147, -13, -137],
      ],
      null,
      '#aab1a080',
      3,
    );
    path(
      ctx,
      [
        ['moveTo', -14, -147],
        ['quadraticCurveTo', 1, -157, 10, -142],
      ],
      null,
      '#b9bca36b',
      2.7,
    );
    path(
      ctx,
      [
        ['moveTo', 11, -146],
        ['quadraticCurveTo', 29, -147, 36, -128],
      ],
      null,
      '#aab5a775',
      2.6,
    );
    line(
      ctx,
      [
        [-43, -110],
        [-41, -91],
      ],
      '#a0ab9b9c',
      3.2,
    );
    line(
      ctx,
      [
        [41, -113],
        [44, -91],
      ],
      '#afb7a375',
      3,
    );
    path(
      ctx,
      [
        ['moveTo', -29, -50],
        ['quadraticCurveTo', -27, -38, -17, -33],
      ],
      null,
      '#895f4838',
    );
    path(
      ctx,
      [
        ['moveTo', 28, -53],
        ['quadraticCurveTo', 25, -42, 19, -37],
      ],
      null,
      '#754e3c40',
    );
    line(
      ctx,
      [
        [-28, -113],
        [19, -114],
      ],
      '#946e5440',
    );
    line(
      ctx,
      [
        [-24, -108],
        [15, -109],
      ],
      '#946e5425',
    );
  }
  ctx.restore();
}

function drawDesk(ctx) {
  path(
    ctx,
    [
      ['moveTo', 118, 345],
      ['lineTo', 615, 343],
      ['lineTo', 720, 450],
      ['lineTo', 0, 450],
      ['closePath'],
    ],
    linear(ctx, 0, 345, 0, 450, [
      [0, '#82745a'],
      [0.18, '#75664e'],
      [1, '#4c4938'],
    ]),
  );
  line(
    ctx,
    [
      [117, 346],
      [615, 344],
    ],
    '#d0be8c6b',
    2,
  );
  for (let i = 0; i < 6; i++)
    path(
      ctx,
      [
        ['moveTo', 70 - i * 20, 369 + i * 15],
        ['bezierCurveTo', 220, 353 + i * 16, 466, 378 + i * 12, 657 + i * 18, 364 + i * 16],
      ],
      null,
      '#332e2617',
    );
  ellipse(ctx, 394, 374, 111, 18, '#1720193b');
  // The same everyday objects are present in every view. Objects cannot reveal
  // which witness is hidden; only timing and posture offer a supporting clue.
  path(
    ctx,
    [
      ['moveTo', 253, 355],
      ['lineTo', 356, 352],
      ['lineTo', 373, 392],
      ['lineTo', 257, 399],
      ['closePath'],
    ],
    '#283f38',
  );
  path(
    ctx,
    [
      ['moveTo', 260, 354],
      ['lineTo', 312, 355],
      ['lineTo', 315, 389],
      ['lineTo', 263, 394],
      ['closePath'],
    ],
    '#c4bda0',
  );
  path(
    ctx,
    [
      ['moveTo', 314, 355],
      ['lineTo', 351, 352],
      ['lineTo', 366, 388],
      ['lineTo', 315, 390],
      ['closePath'],
    ],
    '#d0c8aa',
  );
  line(
    ctx,
    [
      [313, 355],
      [315, 390],
    ],
    '#776e5680',
  );
  for (let i = 0; i < 5; i++) {
    line(
      ctx,
      [
        [271, 363 + i * 5],
        [301, 364 + i * 4.4],
      ],
      '#646d6155',
    );
    line(
      ctx,
      [
        [322, 361 + i * 5],
        [347, 359 + i * 5],
      ],
      '#646d6144',
    );
  }
  line(
    ctx,
    [
      [355, 382],
      [380, 361],
    ],
    '#253b34',
    3,
  );
  line(
    ctx,
    [
      [355, 382],
      [351, 386],
    ],
    '#b7ad84',
    2,
  );
  ellipse(ctx, 491, 385, 36, 9, '#1c292033');
  ellipse(ctx, 491, 381, 31, 7, '#aaa78a');
  path(
    ctx,
    [
      ['moveTo', 514, 353],
      ['bezierCurveTo', 540, 344, 540, 373, 515, 370],
    ],
    null,
    '#b3b193',
    7,
  );
  path(
    ctx,
    [
      ['moveTo', 467, 348],
      ['lineTo', 471, 375],
      ['quadraticCurveTo', 493, 387, 513, 374],
      ['lineTo', 516, 347],
      ['closePath'],
    ],
    linear(ctx, 467, 352, 515, 372, [
      [0, '#d0c8a7'],
      [0.55, '#b2b297'],
      [1, '#848e79'],
    ]),
  );
  ellipse(ctx, 492, 347, 24, 6, '#d7ccb0');
  ellipse(ctx, 492, 347, 19, 4, '#5c5340');
  line(
    ctx,
    [
      [474, 354],
      [477, 369],
    ],
    '#efe2bb5c',
    2,
  );
  // A small lamp-lit paper stack and a brass clip at the frame edge.
  path(
    ctx,
    [
      ['moveTo', 129, 391],
      ['lineTo', 224, 386],
      ['lineTo', 241, 424],
      ['lineTo', 139, 433],
      ['closePath'],
    ],
    '#aca68a',
  );
  line(
    ctx,
    [
      [140, 431],
      [240, 422],
    ],
    '#d6ccaa',
    2,
  );
  line(
    ctx,
    [
      [141, 427],
      [237, 419],
    ],
    '#7a7b62',
  );
  line(
    ctx,
    [
      [161, 393],
      [164, 411],
      [169, 411],
      [166, 393],
    ],
    '#b9a270',
    2,
  );
}

function drawArms(ctx, profile, anonymous, pose) {
  ctx.save();
  ctx.translate(397 + pose.lean, 231 + pose.breath);
  const sleeve = anonymous ? '#0a1516' : profile.coat;
  const sleeveDark = anonymous ? '#071112' : profile.dark;
  const skin = anonymous ? '#081214' : profile.skin;
  for (const side of [-1, 1]) {
    const handX = side < 0 ? pose.leftX : pose.rightX;
    const handY = side < 0 ? pose.leftY : pose.rightY;
    const shoulderX = side * 74;
    const elbowX = side * (94 + (side > 0 ? pose.palm * 6 : 0));
    const elbowY = 101 - Math.max(0, 117 - handY) * 0.18;
    // Organic sleeve outlines taper into wrists; elbows remain anchored.
    path(
      ctx,
      [
        ['moveTo', shoulderX - side * 13, 23],
        ['quadraticCurveTo', shoulderX + side * 21, 25, elbowX + side * 12, elbowY],
        ['quadraticCurveTo', elbowX + side * 13, elbowY + 13, elbowX - side * 1, elbowY + 17],
        ['lineTo', handX + side * 5, handY + 13],
        ['lineTo', handX - side * 12, handY - 4],
        ['lineTo', elbowX - side * 14, elbowY - 8],
        ['quadraticCurveTo', shoulderX - side * 25, 58, shoulderX - side * 13, 23],
        ['closePath'],
      ],
      linear(ctx, shoulderX, 30, handX, handY + 15, [
        [0, sleeve],
        [1, sleeveDark],
      ]),
    );
    path(
      ctx,
      [
        ['moveTo', shoulderX + side * 1, 37],
        ['quadraticCurveTo', elbowX, 71, elbowX + side * 1, elbowY],
        ['lineTo', handX, handY + 5],
      ],
      null,
      anonymous ? '#697d7021' : '#d3c7a22f',
      1.5,
    );
    line(
      ctx,
      [
        [handX - side * 12, handY - 4],
        [handX + side * 5, handY + 13],
      ],
      anonymous ? '#152627' : profile.light,
      5,
    );
    ctx.save();
    ctx.translate(handX - side * 6, handY + 1);
    ctx.rotate(side * (0.16 + pose.palm * 0.35));
    // A relaxed hand, with separated fingertips and a thumb, rather than a
    // floating oval. Raised open palms are readable through the silhouette.
    path(
      ctx,
      [
        ['moveTo', -10, 4],
        ['quadraticCurveTo', -13, -4, -7, -10],
        ['lineTo', -4, -16],
        ['quadraticCurveTo', -2, -18, 0, -13],
        ['lineTo', 3, -18],
        ['quadraticCurveTo', 6, -20, 7, -14],
        ['lineTo', 10, -16],
        ['quadraticCurveTo', 14, -18, 13, -11],
        ['lineTo', 15, -9],
        ['quadraticCurveTo', 19, -10, 17, -4],
        ['lineTo', 12, 11],
        ['quadraticCurveTo', 5, 16, -4, 10],
        ['lineTo', -13, 13],
        ['quadraticCurveTo', -21, 11, -19, 7],
        ['lineTo', -10, 4],
        ['closePath'],
      ],
      skin,
    );
    if (!anonymous) {
      line(
        ctx,
        [
          [-3, -11],
          [-3, -5],
        ],
        '#986c4e70',
      );
      line(
        ctx,
        [
          [4, -13],
          [3, -6],
        ],
        '#986c4e70',
      );
      line(
        ctx,
        [
          [10, -11],
          [8, -4],
        ],
        '#986c4e70',
      );
      path(
        ctx,
        [
          ['moveTo', -9, 5],
          ['quadraticCurveTo', 0, 2, 5, 6],
        ],
        null,
        '#996a4b75',
      );
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawCamera(ctx, anonymous, elapsed, duration, playing) {
  const vignette = ctx.createRadialGradient(360, 217, 95, 360, 217, 422);
  vignette.addColorStop(0, '#00000000');
  vignette.addColorStop(0.6, '#07151500');
  vignette.addColorStop(1, '#081312b8');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // Fine horizontal texture gives a photographed/archive feel without flicker.
  ctx.fillStyle = '#081d1310';
  for (let y = 0; y < HEIGHT; y += 4) ctx.fillRect(0, y, WIDTH, 1);
  rect(ctx, 18, 17, anonymous ? 158 : 133, 25, '#0b161b91', 4);
  ellipse(ctx, 31, 29.5, 3, 3, playing ? '#dd9779' : '#a8ada0');
  ctx.fillStyle = '#e6e1cd';
  ctx.font = '10px ui-monospace, SFMono-Regular, Consolas, monospace';
  ctx.letterSpacing = '1.3px';
  ctx.fillText(anonymous ? 'IDENTITY OBSCURED' : 'ROOM · RECORDING', 42, 33);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = '#e9e4d0ba';
  ctx.font = '11px ui-monospace, SFMono-Regular, Consolas, monospace';
  const seconds = Math.floor(Math.max(0, elapsed));
  const frames = Math.floor((Math.max(0, elapsed) % 1) * 25);
  const timecode = `00:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  ctx.fillText(timecode, WIDTH - 91, 33);
  ctx.strokeStyle = '#dedec24c';
  ctx.lineWidth = 1;
  [
    [18, 55, 1, 1],
    [702, 55, -1, 1],
    [18, 426, 1, -1],
    [702, 426, -1, -1],
  ].forEach(([x, y, dx, dy]) =>
    line(
      ctx,
      [
        [x, y + dy * 12],
        [x, y],
        [x + dx * 12, y],
      ],
      '#dedec24c',
    ),
  );
  if (duration > 0 && playing) {
    rect(ctx, 32, 426, 656, 2, '#e3dfc530', 1);
    rect(ctx, 32, 426, Math.max(2, 656 * Math.min(1, elapsed / duration)), 2, '#d3c9a7ba', 1);
  }
}

function render(
  ctx,
  round,
  profile,
  anonymous,
  elapsed = 0,
  amplitude = 0,
  playing = false,
  duration = 0,
) {
  const pose = recordingPose(profile.id, elapsed, amplitude, playing);
  ctx.save();
  ctx.setTransform(ctx.canvas.width / WIDTH, 0, 0, ctx.canvas.height / HEIGHT, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawRoom(ctx, round, profile, anonymous, playing ? elapsed : 0);
  drawTorso(ctx, profile, anonymous, pose);
  drawHead(ctx, profile, anonymous, pose, elapsed);
  drawDesk(ctx);
  drawArms(ctx, profile, anonymous, pose);
  if (anonymous) {
    // An obscuring pane hides facial detail completely while preserving gesture.
    // Its geometry and lighting are independent of the answer.
    rect(ctx, 284, 64, 223, 281, '#122a2617', 2);
    line(
      ctx,
      [
        [285, 65],
        [285, 344],
      ],
      '#bec6a61c',
    );
    line(
      ctx,
      [
        [506, 65],
        [506, 344],
      ],
      '#bec6a612',
    );
  }
  drawCamera(ctx, anonymous, elapsed, duration, playing);
  ctx.restore();
}

function speechEnvelope(buffer) {
  const samples = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(buffer.sampleRate / 60));
  const envelope = new Float32Array(Math.ceil(samples.length / step));
  let peak = 0;
  for (let i = 0; i < envelope.length; i++) {
    let sum = 0;
    const from = i * step;
    const end = Math.min(samples.length, from + step);
    for (let s = from; s < end; s++) sum += samples[s] * samples[s];
    envelope[i] = Math.sqrt(sum / Math.max(1, end - from));
    peak = Math.max(peak, envelope[i]);
  }
  return { envelope, stepSeconds: step / buffer.sampleRate, peak: peak || 1 };
}

export function createRecordingViews({ scene, candidates }) {
  const canvases = [scene, ...candidates];
  const contexts = canvases.map((canvas) => {
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.dataset.playing = 'false';
    return canvas.getContext('2d', { alpha: false });
  });
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const envelopes = new WeakMap();
  let round;
  let profiles;
  let active = null;
  let frame = 0;
  let lastDraw = -Infinity;
  let disposed = false;

  function draw(viewIndex, elapsed = 0, amplitude = 0, playing = false, duration = 0) {
    if (!round || !contexts[viewIndex]) return;
    const profile = viewIndex === 0 ? profiles.scene : profiles.candidates[viewIndex - 1];
    render(
      contexts[viewIndex],
      round,
      profile,
      viewIndex === 0,
      elapsed,
      amplitude,
      playing,
      duration,
    );
  }

  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (active) {
      canvases[active.viewIndex].dataset.playing = 'false';
      draw(active.viewIndex);
    }
    active = null;
  }

  function tick(timestamp) {
    frame = 0;
    if (!active || disposed) return;
    const { playback, viewIndex, speech } = active;
    const elapsed = Math.max(0, playback.context.currentTime - playback.startAt);
    if (elapsed >= playback.buffer.duration || document.hidden) {
      stop();
      return;
    }
    if (timestamp - lastDraw >= 1000 / 30) {
      const sample =
        speech.envelope[
          Math.min(speech.envelope.length - 1, Math.floor(elapsed / speech.stepSeconds))
        ] || 0;
      const amplitude = Math.max(0, Math.min(1, (sample / speech.peak - 0.035) * 1.65));
      draw(viewIndex, elapsed, amplitude, true, playback.buffer.duration);
      lastDraw = timestamp;
    }
    frame = requestAnimationFrame(tick);
  }

  function onMotionPreference() {
    if (!active) return;
    const { viewIndex, playback } = active;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (reducedMotion.matches) draw(viewIndex, 0, 0, false, playback.buffer.duration);
    else {
      lastDraw = -Infinity;
      frame = requestAnimationFrame(tick);
    }
  }
  const onVisibility = () => {
    if (document.hidden) stop();
  };
  reducedMotion?.addEventListener?.('change', onMotionPreference);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    setRound(nextRound) {
      if (disposed) return;
      stop();
      round = nextRound;
      profiles = createRecordingProfiles(round);
      canvases.forEach((canvas, index) => {
        canvas.dataset.playing = 'false';
        draw(index);
      });
    },
    play(viewKey, playback) {
      if (disposed || !round || !playback?.buffer || !playback?.context) return;
      stop();
      const viewIndex = viewKey === 'scene' ? 0 : Number(viewKey) + 1;
      if (!Number.isInteger(viewIndex) || viewIndex < 0 || viewIndex >= canvases.length) return;
      let speech = envelopes.get(playback.buffer);
      if (!speech) {
        speech = speechEnvelope(playback.buffer);
        envelopes.set(playback.buffer, speech);
      }
      active = { viewIndex, playback, speech };
      canvases[viewIndex].dataset.playing = 'true';
      lastDraw = -Infinity;
      if (reducedMotion?.matches) draw(viewIndex);
      else frame = requestAnimationFrame(tick);
    },
    stop,
    dispose() {
      stop();
      disposed = true;
      round = null;
      profiles = null;
      reducedMotion?.removeEventListener?.('change', onMotionPreference);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
