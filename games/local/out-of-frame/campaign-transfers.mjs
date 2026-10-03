const floor = (x, y, w, h = 540 - y) => ({ x, y, w, h });
const platform = (id, x, y, path, speed, w) => ({
  id,
  kind: 'platform',
  x,
  y,
  w,
  h: 18,
  speed,
  path: [{ x, y }, ...path],
});
const robot = (id, x, y, toX, speed) => ({
  id,
  kind: 'robot',
  x,
  y,
  w: 42,
  h: 46,
  speed,
  path: [
    { x, y },
    { x: toX, y },
  ],
});
const plate = (id, x, groundY, w) => ({ id, x, y: groundY - 7, w, h: 7 });
const gate = (id, x, groundY, requires) => ({ id, x, y: groundY - 116, w: 24, h: 116, requires });
const exit = (x, groundY) => ({ x, y: groundY - 62, w: 48, h: 62 });
const C = [
  ['双舟接力', 146, 142, 70, 72, 390, 390, 375, 112, 840, 420, 'flat'],
  ['换乘的小岛', 142, 138, 73, 75, 398, 402, 365, 108, 834, 412, 'rise'],
  ['斜线交班', 138, 134, 75, 78, 405, 387, 360, 104, 831, 400, 'zig'],
  ['先升后渡', 136, 130, 78, 79, 394, 397, 355, 102, 825, 390, 'lift'],
  ['两段逆坡', 132, 128, 80, 82, 400, 385, 350, 98, 820, 375, 'dip'],
  ['折返之间', 128, 126, 82, 84, 412, 395, 345, 96, 818, 370, 'zig'],
  ['窄岛接班', 124, 122, 85, 87, 410, 388, 340, 92, 812, 355, 'rise'],
  ['逐级抬升', 120, 118, 88, 90, 406, 395, 335, 90, 807, 340, 'lift'],
  ['弯道双渡', 116, 114, 91, 94, 418, 400, 330, 88, 803, 325, 'dip'],
  ['双舟终练', 112, 110, 94, 97, 425, 397, 325, 86, 800, 315, 'zig'],
];
function makeTransfer(c, i) {
  const [title, w1, w2, s1, s2, end1, _midY, _startY2, midW, rightX, _rightY, shape] = c;
  const midY = 310 - i * 3;
  const startY2 = midY - 10;
  const rightY = midY - 125;
  const startX = 232;
  const startY = 435;
  const midX = end1 + w1 - 48;
  const startX2 = midX + midW + 8;
  const end2 = rightX - w2 + 45;
  const endY1 = midY - 25;
  const path1 =
    shape === 'flat'
      ? [{ x: end1 + 4, y: endY1 }]
      : shape === 'rise'
        ? [
            { x: 298, y: midY - 24 },
            { x: end1 + 4, y: endY1 },
          ]
        : shape === 'lift'
          ? [
              { x: startX, y: midY - 18 },
              { x: end1 + 4, y: endY1 },
            ]
          : shape === 'dip'
            ? [
                { x: 294, y: 455 },
                { x: 338, y: midY - 14 },
                { x: end1 + 4, y: endY1 },
              ]
            : [
                { x: 296, y: 410 },
                { x: 348, y: midY - 25 },
                { x: end1 + 4, y: endY1 },
              ];
  const path2 =
    shape === 'lift'
      ? [
          { x: startX2, y: rightY - 25 },
          { x: end2 + 14, y: rightY - 25 },
        ]
      : shape === 'dip'
        ? [
            { x: startX2 + 54, y: startY2 + 32 },
            { x: end2 + 14, y: rightY - 25 },
          ]
        : shape === 'zig'
          ? [
              { x: startX2 + 50, y: startY2 - 26 },
              { x: end2 + 14, y: rightY - 25 },
            ]
          : [{ x: end2 + 14, y: rightY - 25 }];
  const level = {
    id: `relay-${i + 41}`,
    title,
    goal: '调度两艘平台分别抬升，经过中间小岛换乘后抵达高处出口。',
    hint: [
      '两段高差都超过单次跳跃的高度。先登上第一艘，再让平台带你抬升。',
      '中间小岛是安全的换乘点。把第一艘停住，确认第二艘的位置再起跳。',
      '第一艘升到岛边就移开框；从岛上跳到第二艘，再向上拖框，保持核心被观察，乘它升到高处出口。',
    ],
    spawn: { x: 68, y: 422 },
    frame: { x: 0, y: 0 },
    solids: [floor(0, 460, 250), floor(midX, midY, midW), floor(rightX, rightY, 960 - rightX)],
    objects: [
      platform('first-ferry', startX, startY, path1, s1, w1),
      platform('second-ferry', startX2, startY2, path2, s2, w2),
    ],
    switches: [],
    gates: [],
    exit: exit(895, rightY),
  };
  const solution = [
    { kind: 'walk', x: startX + w1 / 2 - 165 },
    { kind: 'jump', frames: 48 },
    { kind: 'ride', object: 'first-ferry', untilX: end1, offsetX: -145, y: 250 },
    { kind: 'frame', x: 620, y: 0 },
    { kind: 'walk', x: midX + midW - 70 },
    { kind: 'jump', frames: 48 },
    { kind: 'ride', object: 'second-ferry', untilX: end2, offsetX: -100, y: 100 },
    { kind: 'frame', x: 0, y: 0 },
    { kind: 'walk', x: 920 },
  ];
  return { level, solution };
}
export const TRANSFERS = C.map(makeTransfer);
const D = [
  ['上下两盏灯', 132, 132, 75, 78, 456, 365, 106, 830, 345, 260, 48, 62, 64, 'rise', false],
  ['隔层调度', 128, 128, 77, 81, 454, 360, 102, 826, 338, 255, 46, 65, 66, 'zig', false],
  ['错层守望', 126, 124, 79, 84, 452, 355, 98, 822, 330, 250, 44, 67, 69, 'rise', false],
  ['窗沿的选择', 124, 122, 82, 86, 450, 350, 96, 818, 320, 245, 42, 70, 72, 'zig', false],
  ['双锁换乘', 120, 120, 84, 89, 450, 345, 94, 814, 310, 240, 40, 73, 74, 'rise', false],
  ['第三位守门人', 124, 122, 86, 91, 450, 345, 98, 817, 310, 255, 40, 74, 76, 'zig', true],
  ['冻结换乘厅', 120, 118, 88, 93, 451, 340, 94, 810, 305, 250, 38, 76, 78, 'rise', true],
  ['三灯同亮', 118, 116, 91, 95, 449, 335, 92, 806, 300, 245, 36, 78, 81, 'zig', true],
  ['视线分层', 114, 112, 94, 98, 448, 328, 88, 802, 292, 240, 34, 81, 84, 'rise', true],
  ['交班总排练', 112, 110, 97, 101, 450, 320, 86, 800, 285, 235, 32, 84, 87, 'zig', true],
];
function makeControlTransfer(c, i) {
  const [
    title,
    w1,
    w2,
    s1,
    s2,
    end1,
    _midY,
    midW,
    rightX,
    _rightY,
    upperY,
    plateW,
    robotS1,
    robotS2,
    shape,
    third,
  ] = c;
  const midY = 310 - i * 3;
  const rightY = midY - 125;
  const midX = end1 + w1 - 48;
  const midEnd = midX + midW;
  const start2 = midEnd + 8;
  const end2 = rightX - w2 + 45;
  const lowerPlateX = 182 + (i % 3) * 4;
  const upperPlateX = 251 + (i % 4) * 6;
  const path1 =
    shape === 'rise'
      ? [
          { x: 387, y: 393 },
          { x: end1 + 4, y: midY - 10 },
        ]
      : [
          { x: 366, y: 410 },
          { x: 405, y: midY - 26 },
          { x: end1 + 4, y: midY - 10 },
        ];
  const path2 =
    shape === 'rise'
      ? [
          { x: start2 + 28, y: midY - 34 },
          { x: end2 + 14, y: rightY - 25 },
        ]
      : [
          { x: start2 + 38, y: midY + 10 },
          { x: start2 + 75, y: rightY - 25 },
          { x: end2 + 14, y: rightY - 25 },
        ];
  const objects = [
    robot('lower-keeper', 118 + (i % 3) * 4, 414, 246, robotS1),
    robot('upper-keeper', 122 + (i % 4) * 4, upperY - 46, 312, robotS2),
    platform('first-ferry', 330, 435, path1, s1, w1),
    platform('second-ferry', start2, midY - 10, path2, s2, w2),
  ];
  const switches = [
    plate('lower', lowerPlateX, 460, plateW),
    plate('upper', upperPlateX, upperY, plateW),
  ];
  if (third) {
    objects.push(robot('island-keeper', midX + 4, midY - 46, midEnd - 42, 60 + i * 2));
    switches.push(plate('island', midEnd - 44, midY, Math.max(32, plateW)));
  }
  const level = {
    id: `layered-relay-${i + 51}`,
    title,
    goal: third
      ? '点亮三枚开关，分层冻结机器，完成两次平台换乘。'
      : '分别留住上下两位守门人，再接力乘船穿过双锁门。',
    hint: [
      '上下两层的机器人都有开关。先照亮下层，停好后把框移到上方处理另一位。',
      third
        ? '换乘岛上的机器人需要单独定格。把框的下边界放在机器人核心与平台核心之间，船会停住，机器人仍能走。'
        : '调度第一艘船时，把框向右、向下移动：避开下层机器人，也让上层机器人核心留在框外。',
      third
        ? '先停好上下两位；乘第一艘到岛边，用框的下边界只观察岛上机器人，停在第三枚开关后跳上第二艘。第二次把框放在岛的右侧。'
        : '上下机器人都压住开关以后，跳过下层机器人，再跳上第一艘；框左边界越过下层核心、上边界越过上层核心，然后在岛边换乘。',
    ],
    spawn: { x: 62, y: 422 },
    frame: { x: 0, y: 270 },
    solids: [
      floor(0, 460, 350),
      floor(96, upperY, 252, 18),
      floor(midX, midY, midW),
      floor(rightX, rightY, 960 - rightX),
    ],
    objects,
    switches,
    gates: [
      gate(
        'exit-gate',
        858,
        rightY,
        switches.map((p) => p.id),
      ),
    ],
    exit: exit(906, rightY),
  };
  const solution = [
    { kind: 'watch', object: 'lower-keeper', axis: 'x', atLeast: lowerPlateX - 8 },
    { kind: 'frame', x: 0, y: 0 },
    { kind: 'watch', object: 'upper-keeper', axis: 'x', atLeast: upperPlateX - 8 },
    { kind: 'frame', x: 620, y: 0 },
    { kind: 'walk', x: 125 },
    { kind: 'jump', frames: 48 },
    { kind: 'jump', frames: 38 },
    { kind: 'ride', object: 'first-ferry', untilX: end1, offsetX: -145, minX: 230, y: 250 },
  ];
  if (third) {
    solution.push(
      { kind: 'frame', x: midX - 20, y: midY - 279 },
      { kind: 'watch', object: 'island-keeper', axis: 'x', atLeast: midEnd - 52 },
    );
  }
  solution.push(
    { kind: 'frame', x: 620, y: 0 },
    { kind: 'walk', x: midEnd - (third ? 88 : 70) },
    { kind: 'jump', frames: 48 },
    {
      kind: 'ride',
      object: 'second-ferry',
      untilX: end2,
      offsetX: -100,
      minX: third ? 620 : 0,
      y: 100,
    },
    { kind: 'frame', x: 620, y: 270 },
    { kind: 'walk', x: 938 },
  );
  return { level, solution };
}
TRANSFERS.push(...D.map(makeControlTransfer));
