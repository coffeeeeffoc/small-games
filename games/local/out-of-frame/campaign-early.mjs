const floor = (x, y, w, h = 540 - y) => ({ x, y, w, h });
const robot = (id, x, groundY, toX, speed) => ({
  id,
  kind: 'robot',
  x,
  y: groundY - 46,
  w: 42,
  h: 46,
  speed,
  path: [
    { x, y: groundY - 46 },
    { x: toX, y: groundY - 46 },
  ],
});
const plate = (id, center, groundY, w) => ({ id, x: center - w / 2, y: groundY - 7, w, h: 7 });
const door = (id, x, groundY, requires) => ({ id, x, y: groundY - 116, w: 24, h: 116, requires });
const exit = (x, groundY) => ({ x, y: groundY - 62, w: 48, h: 62 });
const frame = (x, y) => ({ kind: 'frame', x, y });
const walk = (x) => ({ kind: 'walk', x });
const jump = (frames = 47) => ({ kind: 'jump', frames });
const watch = (object, axis, atLeast) => ({ kind: 'watch', object, axis, atLeast });

export function corridor(number, variant, count = 2, stepped = false) {
  const ground = 460 - (variant % 3) * 8;
  const targets =
    count === 1 ? [285 + variant * 9] : [265 + (variant % 4) * 11, 635 + (variant % 3) * 15];
  const split = 426 + (variant % 3) * 15;
  const grounds =
    count === 1 ? [ground] : [ground, ground - (stepped ? 38 + (variant % 3) * 4 : 0)];
  const speed = 60 + variant * 1.1;
  const width = count === 1 ? 80 - variant * 4 : 74 - variant * 2;
  const reverse = count > 1 && variant % 3 === 0;
  const objects = targets.map((target, i) =>
    robot(
      `keeper-${i + 1}`,
      reverse ? target + 60 : target - 120 - i * 9,
      grounds[i],
      reverse ? target - 75 : target + 62,
      speed + i * 9,
    ),
  );
  const switches = targets.map((target, i) =>
    plate(
      `s${i + 1}`,
      target + 21 + ((reverse ? -1 : 1) * (speed + i * 9) * 3.5) / 60,
      grounds[i],
      width,
    ),
  );
  const solids = stepped
    ? [floor(0, ground, split), floor(split, grounds.at(-1), 960 - split)]
    : [floor(0, ground, 960)];
  const actions = [];
  for (const [i, object] of objects.entries()) {
    if (i) actions.push(frame(targets[i] - (reverse ? 60 : 240), 250));
    actions.push(
      reverse
        ? { kind: 'watch', object: object.id, axis: 'x', atMost: targets[i] }
        : watch(object.id, 'x', targets[i]),
    );
  }
  actions.push(frame(0, 0));
  const events = targets.map((x) => ({ x: x - 74, kind: 'robot' }));
  if (stepped) events.push({ x: split - 68, kind: 'step' });
  if (!stepped && variant > 0) {
    const blockX = count === 1 ? 585 + (variant % 3) * 19 : 451 + (variant % 3) * 14;
    solids.push(
      floor(
        blockX,
        ground - 36 - (variant % 4) * 8,
        42 + (variant % 3) * 8,
        36 + (variant % 4) * 8,
      ),
    );
    events.push({ x: blockX - 72, kind: 'step' });
  }
  for (const event of events.sort((a, b) => a.x - b.x))
    actions.push(walk(event.x), jump(), { kind: 'wait', frames: 3 });
  actions.push(walk(925));
  return {
    level: {
      id: `still-${number}`,
      number,
      title:
        count === 1
          ? ['越过静物', '暂停的距离', '脚下的余量'][variant % 3]
          : [
              '先后有序',
              '留下两盏灯',
              '框边的选择',
              '门前的静物',
              '跨过下一层',
              '分层定格',
              '阶上的守候',
              '分别留住',
              '两岸时差',
            ][variant % 9],
      goal: `让${count === 1 ? '机器人' : '两位机器人'}停在开关上，${stepped ? '逐级登上台阶' : '跳过静止的身体与台阶'}抵达出口。`,
      hint: [
        '机器人的核心停在开关范围内，灯就会一直亮着。',
        count === 1
          ? '地面的矮台阶可以用跳跃越过。先冻结机器人，再移动自己。'
          : '先定格左边，再让观察框左边界越过它的核心，单独调度右边。',
        stepped
          ? '每段台阶前先站稳，再向右跳。亮框留在画面左上角，两个机器人都会保持定格。'
          : '移开观察框后，从机器人或矮台阶左侧一段距离起跳，给自己留出落脚点。',
      ],
      spawn: { x: 62, y: ground - 38 },
      frame: { x: reverse ? 50 : 0, y: 250 },
      solids,
      objects,
      switches,
      gates: [
        door(
          'door',
          835 + (variant % 3) * 9,
          grounds.at(-1),
          switches.map((p) => p.id),
        ),
      ],
      exit: exit(887, grounds.at(-1)),
    },
    solution: actions,
  };
}

export function liftRoom(number, variant, robotCount = 2) {
  const leftY = 460 - (variant % 3) * 4;
  const leftEdge = 304 + (variant % 4) * 7;
  const liftX = leftEdge + 28;
  const liftW = 146 - Math.floor(variant / 3) * 5;
  const liftStop = leftY - 75 - (variant % 3) * 3;
  const rightY = liftStop - 71;
  const rightEdge = liftX + liftW + 39 + (variant % 3) * 7;
  const leftStop = 192 + (variant % 3) * 7;
  const rightStop = 712 + (variant % 4) * 6;
  const speed = 58 + variant * 1.1;
  const objects = [
    {
      id: 'lift',
      kind: 'platform',
      x: liftX,
      y: leftY - 10,
      w: liftW,
      h: 18,
      speed: 54 + variant * 1.2,
      path: [
        { x: liftX, y: leftY - 10 },
        { x: liftX + (variant % 3) * 9, y: leftY - 170 - (variant % 4) * 7 },
      ],
    },
  ];
  const switches = [];
  const actions = [];
  if (robotCount) {
    objects.unshift(robot('left-keeper', 112, leftY, leftStop + 55, speed));
    switches.push(plate('a', leftStop + 21 + (speed * 3.5) / 60, leftY, 72 - variant * 2));
    actions.push(watch('left-keeper', 'x', leftStop));
  }
  if (robotCount > 1) {
    objects.push(robot('right-keeper', 625 + (variant % 3) * 8, rightY, rightStop + 52, speed + 9));
    switches.push(plate('b', rightStop + 21 + ((speed + 9) * 3.5) / 60, rightY, 72 - variant * 2));
    actions.push(frame(620, 150), watch('right-keeper', 'x', rightStop));
  }
  actions.push(frame(0, 0));
  if (robotCount) actions.push(walk(leftStop - 74), jump(), { kind: 'wait', frames: 3 });
  actions.push(
    frame(leftEdge + 10, 250),
    { kind: 'watch', object: 'lift', axis: 'y', atMost: liftStop },
    frame(0, 0),
    walk(leftEdge - 45),
    jump(39),
    walk(liftX + liftW - 42),
    jump(43),
  );
  if (robotCount > 1) actions.push(walk(rightStop - 74), jump(), { kind: 'wait', frames: 3 });
  actions.push(walk(925));
  return {
    level: {
      id: `lift-${number}`,
      number,
      title: [
        '倾斜的台阶',
        '高处留一盏灯',
        '升降之间',
        '偏移的落点',
        '双岸定格',
        '向上借力',
        '窄台停靠',
        '出口的守候',
        '斜线阶梯',
        '留住高度',
      ][variant % 10],
      goal: `${robotCount > 1 ? '先停好两岸守门人，' : robotCount ? '先停好守门人，' : ''}冻结升降台，借它登上高处出口。`,
      hint: [
        '平台核心也服从亮框规则：框内升降，框外可以安心站立。',
        robotCount > 1
          ? '两岸机器人先分别压住开关，再只观察中间的升降台。'
          : '先把平台升到两岸之间的高度，再把亮框移开。',
        '平台顶面与两岸的高度差都应小于一次跳跃。第一跳落在平台中间，再走到平台右端起跳。',
      ],
      spawn: { x: 64, y: leftY - 38 },
      frame: { x: 0, y: 250 },
      solids: [floor(0, leftY, leftEdge), floor(rightEdge, rightY, 960 - rightEdge)],
      objects,
      switches,
      gates: robotCount
        ? [
            door(
              'door',
              851 + (variant % 3) * 6,
              rightY,
              switches.map((p) => p.id),
            ),
          ]
        : [],
      exit: exit(884, rightY),
    },
    solution: actions,
  };
}

export function ferryRoom(number, variant, robotCount = 2) {
  const leftY = 460 - (variant % 3) * 6;
  const leftEdge = 314 + (variant % 4) * 6;
  const ferryX = leftEdge + 14;
  const ferryW = 150 - Math.floor(variant / 3) * 6;
  const rightEdge = 745 + (variant % 4) * 8;
  const rightY = leftY - 70 - (variant % 3) * 10;
  const lastX = rightEdge - ferryW + 105;
  const leftStop = 190 + (variant % 4) * 6;
  const rightStop = 804 + (variant % 3) * 4;
  const speed = 62 + variant;
  const objects = [
    {
      id: 'ferry',
      kind: 'platform',
      x: ferryX,
      y: leftY - 15,
      w: ferryW,
      h: 18,
      speed: 72 + variant * 1.4,
      path: [
        { x: ferryX, y: leftY - 15 },
        { x: 438 + (variant % 3) * 12, y: leftY - 25 - (variant % 4) * 6 },
        { x: lastX - 100, y: rightY - 18 },
        { x: lastX, y: rightY - 18 },
      ],
    },
  ];
  const switches = [];
  const actions = [];
  if (robotCount) {
    objects.unshift(robot('left-keeper', 109 + (variant % 3) * 4, leftY, leftStop + 60, speed));
    switches.push(plate('a', leftStop + 21 + (speed * 3.5) / 60, leftY, 68 - variant * 1.5));
    actions.push(watch('left-keeper', 'x', leftStop));
  }
  if (robotCount > 1) {
    objects.push(robot('right-keeper', rightEdge + 12, rightY, 858, speed + 12));
    switches.push(
      plate('b', rightStop + 21 + ((speed + 12) * 3.5) / 60, rightY, 68 - variant * 1.5),
    );
    actions.push(frame(620, 150), watch('right-keeper', 'x', rightStop));
  }
  actions.push(frame(0, 0));
  if (robotCount) actions.push(walk(leftStop - 74), jump(), { kind: 'wait', frames: 3 });
  actions.push(
    walk(leftEdge - 55),
    jump(47),
    {
      kind: 'ride',
      object: 'ferry',
      untilX: lastX - 9,
      offsetX: ferryW / 2 - 336,
      minX: 300,
      y: 250,
    },
    frame(0, 0),
  );
  if (robotCount > 1) actions.push(walk(rightStop - 74), jump(), { kind: 'wait', frames: 3 });
  actions.push(walk(925));
  return {
    level: {
      id: `ferry-${number}`,
      number,
      title: [
        '轻轻离岸',
        '两岸的灯',
        '沿折线同行',
        '向上渡河',
        '船上的静物',
        '坡道视线',
        '停在门前',
        '航线转折',
        '凝固的对岸',
        '远处的候场',
      ][variant % 10],
      goal: `${robotCount > 1 ? '先冻结两岸机器人，' : robotCount ? '冻结守门人后，' : ''}跟随渡船跨过缺口，到高处出口。`,
      hint: [
        '先留出能上船的静止平台，再跳到平台中间。',
        robotCount > 1
          ? '守门人可以先分别停好。跟船时让亮框左边界越过左岸机器人，右岸暂时留在框外。'
          : '站稳后向右移动亮框，让船的核心一直留在框内。',
        '平台沿折线向上移动。别急着下船，等平台顶面高于右岸并靠近地面，移开亮框再离开。',
      ],
      spawn: { x: 62, y: leftY - 38 },
      frame: { x: 0, y: 250 },
      solids: [floor(0, leftY, leftEdge), floor(rightEdge, rightY, 960 - rightEdge)],
      objects,
      switches,
      gates: robotCount
        ? [
            door(
              'door',
              881,
              rightY,
              switches.map((p) => p.id),
            ),
          ]
        : [],
      exit: exit(912, rightY),
    },
    solution: actions,
  };
}
