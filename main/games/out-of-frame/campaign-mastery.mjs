const floor = (x, y, w, h = 540 - y) => ({ x, y, w, h });
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
const plate = (id, center, groundY, w) => ({ id, x: center - w / 2, y: groundY - 7, w, h: 7 });
const names = [
  '三盏待机灯',
  '隔层观察',
  '高处的守门人',
  '船尾的盲区',
  '窄框调度',
  '层间接力',
  '停留的余地',
  '缓行与疾行',
  '悬空的片刻',
  '三重合奏',
  '第四位守望者',
  '空中开关',
  '四层静物',
  '目光绕行',
  '留下所有灯',
  '最后的候场',
  '精确的边界',
  '无人下船',
  '静止的全景',
  '框外谢幕',
];
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
function reflectedX(start, end, distance) {
  const length = end - start;
  const travel = mod(distance, 2 * length);
  return start + (travel <= length ? travel : 2 * length - travel);
}

/** The final chapter combines three elevations and, later, a fourth overhead
 * keeper. Geometry changes alter the ferry's slopes, timing, boarding width,
 * and switch windows while keeping safe human reaction margins. */
export const ADVANCED = Array.from({ length: 20 }, (_, i) => {
  const number = 81 + i;
  const four = i >= 10;
  const lowerSpeed = 64 + i * 0.6;
  const lowerX = 128 + (i % 3) * 4;
  const lowerStop = 240 + (i % 4) * 2;
  const ferryX = 294 + (i % 4) * 2;
  const ferryW = 124 - Math.floor(i / 4) * 5;
  const ferrySpeed = 82 + i * 0.8;
  const first = { x: 335 + (i % 4) * 5, y: 350 + (i % 3) * 3 };
  const second = { x: 580 + (i % 5) * 6, y: 309 + (i % 4) * 4 };
  const last = { x: 710 + (i % 4) * 3, y: 282 + (i % 5) * 3 };
  const ferryStop = 699 + (i % 4) * 2;
  const midStop = 375 + (i % 4) * 2;
  const midX = 433 + (i % 4) * 3;
  const midEnd = 553 + (i % 4) * 3;
  const midSpeed = 67 + i * 0.5;
  const firstDistance = Math.hypot(first.x - ferryX, first.y - 435);
  const secondDistance = Math.hypot(second.x - first.x, second.y - first.y);
  const stopDistance =
    firstDistance + ((midStop - first.x) / (second.x - first.x)) * secondDistance;
  const midTicks = Math.ceil((stopDistance / ferrySpeed) * 60);
  const midPositions = Array.from({ length: 7 }, (_, n) =>
    reflectedX(midX, midEnd, (midSpeed * (midTicks + n)) / 60),
  );
  const midCenter = (Math.min(...midPositions) + Math.max(...midPositions)) / 2 + 21;
  const topX = 776 + (i % 4) * 3;
  const topStop = 839 + (i % 4) * 6;
  const topSpeed = 69 + i * 0.7;
  const lowerWidth = 32 - Math.floor(i / 4);
  const middleWidth = 34 - Math.floor(i / 4);
  const topWidth = 32 - Math.floor(i / 4);
  const objects = [
    robot('lower-keeper', lowerX, 414, 270 + (i % 3) * 3, lowerSpeed),
    robot('middle-keeper', midX, 354, midEnd, midSpeed),
    robot('exit-keeper', topX, 254, 883 + (i % 3) * 3, topSpeed),
    {
      id: 'stair-ferry',
      kind: 'platform',
      x: ferryX,
      y: 435,
      w: ferryW,
      h: 18,
      speed: ferrySpeed,
      path: [{ x: ferryX, y: 435 }, first, second, last],
    },
  ];
  const switches = [
    plate('a', lowerStop + 21 + (lowerSpeed * 3.5) / 60, 460, lowerWidth),
    plate('b', midCenter, 400, middleWidth),
    plate('c', topStop + 21 + (topSpeed * 3.5) / 60, 300, topWidth),
  ];
  const solids = [
    floor(0, 460, 303 + (i % 4) * 4),
    floor(423 + (i % 3) * 3, 400, 178 + (i % 3) * 4),
    floor(770 + (i % 3) * 4, 300, 190 - (i % 3) * 4),
  ];
  const actions = [{ kind: 'watch', object: 'lower-keeper', axis: 'x', atLeast: lowerStop }];
  if (four) {
    const upperGround = 94 + (i % 4) * 4;
    const upperX = 641 + (i % 3) * 4;
    const upperStop = 679 + (i % 4) * 5;
    const upperSpeed = 64 + (i - 10) * 0.8;
    objects.push(robot('overhead-keeper', upperX, upperGround - 46, 730, upperSpeed));
    switches.push(
      plate('d', upperStop + 21 + (upperSpeed * 3.5) / 60, upperGround, 42 - ((i - 10) * 4) / 9),
    );
    solids.push(floor(upperX - 7, upperGround, 145, 18));
    actions.push(
      { kind: 'frame', x: 620, y: 0 },
      { kind: 'watch', object: 'overhead-keeper', axis: 'x', atLeast: upperStop },
    );
  }
  actions.push(
    { kind: 'frame', x: 620, y: 100 },
    { kind: 'watch', object: 'exit-keeper', axis: 'x', atLeast: topStop },
    { kind: 'frame', x: 0, y: 0 },
    { kind: 'walk', x: 175 },
    { kind: 'jump', frames: 45 },
    { kind: 'frame', x: 300, y: 270 },
    { kind: 'watch', object: 'stair-ferry', axis: 'x', atLeast: midStop },
    { kind: 'ride', object: 'stair-ferry', untilX: ferryStop, offsetX: ferryW / 2 - 336, y: 96 },
    { kind: 'frame', x: 0, y: 0 },
    { kind: 'walk', x: 800 },
    { kind: 'jump', frames: 33 },
    { kind: 'walk', x: 934 },
    { kind: 'wait', frames: 20 },
  );
  return {
    level: {
      id: `mastery-${number}`,
      number,
      kicker: `${number} / ${four ? '四层调度' : '三层调度'}`,
      title: names[i],
      goal: `冻结${four ? '四' : '三'}位守门人，保住全部开关，乘折线平台抵达出口。`,
      hint: [
        '先让左下机器人停在开关上，再调度右侧的守门人。',
        four
          ? '最高层的核心与出口守门人上下分离：先把亮框移到画面顶部调度最高层，再向下移一点调度出口层。'
          : '右上机器人需要先停好；利用亮框的位置，让左下机器人一直留在框外。',
        '登船后先让中层机器人压住开关。把框向上移，让下边界越过中层核心；跟船时用亮框右边界贴近船的核心，保住出口层的定格。',
      ],
      spawn: { x: 56, y: 422 },
      frame: { x: 0, y: 250 },
      solids,
      objects,
      switches,
      gates: [{ id: 'door', x: 908, y: 184, w: 24, h: 116, requires: switches.map((p) => p.id) }],
      exit: { x: 912, y: 238, w: 48, h: 62 },
    },
    solution: actions,
  };
});
