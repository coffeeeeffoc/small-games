import { WEAPONS, MISSION, text, type Language } from './Data.ts';
type Group = 'basic' | 'advanced' | 'rules';
export const ACTIONS = [
  {
    id: 'aim',
    group: 'basic',
    name: ['瞄准', 'Aim'],
    keys: [],
    binding: 'Mouse',
    touch: ['战场内相对拖动', 'Drag battlefield'],
    description: ['移动准星，提前瞄准移动目标前方。', 'Aim ahead of moving targets.'],
    event: 'aim',
  },
  {
    id: 'fire',
    group: 'basic',
    name: ['开火', 'Fire'],
    keys: [32],
    binding: 'LMB / Space',
    hold: ['按住左键开火', 'Hold left mouse to fire'],
    tap: ['单击左键开火', 'Click left mouse to fire'],
    touchHold: ['按住开火', 'Hold to fire'],
    touchTap: ['点按开火', 'Tap to fire'],
    touch: ['按住开火键', 'Hold FIRE'],
    description: [
      '速射与爆破按住连射；重型炮每次按下只发一发。',
      'Hold rapid/burst fire. Heavy fires once per press.',
    ],
    event: 'fire',
  },
  {
    id: 'weapon0',
    group: 'basic',
    name: ['速射炮', 'Rapid'],
    keys: [49],
    binding: '1',
    touch: ['点击速射炮', 'Tap Rapid'],
    description: [
      '快速轻车：小范围、短延迟；持续开火会积热。',
      'Light rovers: small radius, short flight, builds heat.',
    ],
    event: 'weapon',
  },
  {
    id: 'weapon1',
    group: 'basic',
    name: ['爆破炮', 'Burst'],
    keys: [50],
    binding: '2',
    touch: ['点击爆破炮', 'Tap Burst'],
    description: [
      '固定威胁与集群：范围攻击，每关 40 发。',
      'Emplacements and groups: area damage, 40 rounds.',
    ],
    event: 'weapon',
  },
  {
    id: 'weapon2',
    group: 'basic',
    name: ['重型炮', 'Heavy'],
    keys: [51],
    binding: '3',
    touch: ['点按重型炮，再点开火', 'Tap Heavy, then FIRE'],
    description: [
      `重甲：${WEAPONS[2].ammo} 发弹药，${WEAPONS[2].interval} 秒装填；弹着时间随斜距与高度变化。`,
      `Armor: ${WEAPONS[2].ammo} rounds, ${WEAPONS[2].interval}s reload. Flight varies with range and altitude.`,
    ],
    event: 'weapon',
  },
  {
    id: 'previous',
    group: 'advanced',
    name: ['上一武器', 'Previous'],
    keys: [81],
    binding: 'Q / Wheel ↑',
    touch: ['直接点击武器', 'Tap a weapon'],
    description: [
      '切换保留各武器热量；重新按下开火。',
      'Switching preserves heat; press FIRE again.',
    ],
    event: 'weapon',
  },
  {
    id: 'next',
    group: 'advanced',
    name: ['下一武器', 'Next'],
    keys: [69],
    binding: 'E / Wheel ↓',
    touch: ['直接点击武器', 'Tap a weapon'],
    description: ['滚轮只切枪。', 'Mouse wheel only switches weapons.'],
    event: 'weapon',
  },
  {
    "id": "rotateLeft",
    "group": "advanced",
    "name": [
      "视角左转",
      "View left"
    ],
    "keys": [
      37
    ],
    "binding": "←",
    "touch": [
      "点击视角左转（小屏先展开飞行面板）",
      "Tap View left (open FLIGHT on small screens)"
    ],
    "description": [
      "向左旋转查看方位，不改变飞机盘旋方向。",
      "Rotate the view left without changing orbit direction."
    ]
  },
  {
    "id": "rotateRight",
    "group": "advanced",
    "name": [
      "视角右转",
      "View right"
    ],
    "keys": [
      39
    ],
    "binding": "→",
    "touch": [
      "点击视角右转（小屏先展开飞行面板）",
      "Tap View right (open FLIGHT on small screens)"
    ],
    "description": [
      "向右旋转查看方位，小地图保持北向固定。",
      "Rotate the view right. The minimap stays north-up."
    ]
  },
  {
    "id": "orbitLeft",
    "group": "advanced",
    "name": [
      "逆时针",
      "Counterclockwise"
    ],
    "keys": [
      219
    ],
    "binding": "[",
    "touch": [
      "点击逆时针（小屏先展开飞行面板）",
      "Tap Counterclockwise (open FLIGHT on small screens)"
    ],
    "description": [
      "飞机逆时针盘旋；发射位置持续随飞机移动。",
      "Orbit counterclockwise; the firing position moves with the aircraft."
    ]
  },
  {
    "id": "orbitRight",
    "group": "advanced",
    "name": [
      "顺时针",
      "Clockwise"
    ],
    "keys": [
      221
    ],
    "binding": "]",
    "touch": [
      "点击顺时针（小屏先展开飞行面板）",
      "Tap Clockwise (open FLIGHT on small screens)"
    ],
    "description": [
      "飞机顺时针盘旋；已发射炮弹保持原有弹道。",
      "Orbit clockwise; airborne rounds keep their trajectories."
    ]
  },
  {
    "id": "altitudeUp",
    "group": "advanced",
    "name": [
      "升高 +",
      "Climb +"
    ],
    "keys": [
      33
    ],
    "binding": "PageUp",
    "touch": [
      "点击升高 +（小屏先展开飞行面板）",
      "Tap Climb + (open FLIGHT on small screens)"
    ],
    "description": [
      "升高飞机，视野、斜距与弹着时间随之变化。",
      "Climb, changing the view, slant range and flight time."
    ]
  },
  {
    "id": "altitudeDown",
    "group": "advanced",
    "name": [
      "降低 −",
      "Descend −"
    ],
    "keys": [
      34
    ],
    "binding": "PageDown",
    "touch": [
      "点击降低 −（小屏先展开飞行面板）",
      "Tap Descend − (open FLIGHT on small screens)"
    ],
    "description": [
      "降低飞机，重新检查目标与友军的位置。",
      "Descend and check target and friendly positions again."
    ]
  },
  {
    "id": "radiusIn",
    "group": "advanced",
    "name": [
      "靠近 −",
      "Closer −"
    ],
    "keys": [
      188
    ],
    "binding": ",",
    "touch": [
      "点击靠近 −（小屏先展开飞行面板）",
      "Tap Closer − (open FLIGHT on small screens)"
    ],
    "description": [
      "缩小盘旋半径，改变实际距离；与镜头放大不同。",
      "Reduce orbit radius and physical range, independently of optical zoom."
    ]
  },
  {
    "id": "radiusOut",
    "group": "advanced",
    "name": [
      "远离 +",
      "Farther +"
    ],
    "keys": [
      190
    ],
    "binding": ".",
    "touch": [
      "点击远离 +（小屏先展开飞行面板）",
      "Tap Farther + (open FLIGHT on small screens)"
    ],
    "description": [
      "扩大盘旋半径，结合实时弹着时间预留提前量。",
      "Increase orbit radius; use live flight time to judge your lead."
    ]
  },
  {
    id: 'zoomOut',
    group: 'advanced',
    name: ['缩小', 'Zoom −'],
    keys: [90],
    binding: 'Z',
    touch: ['点击 −', 'Tap −'],
    description: [
      '缩小观察整条路线；已经发射的炮弹不随镜头移动。',
      'Zoom out for the route. Airborne shells keep their aim.',
    ],
    event: 'zoom',
  },
  {
    id: 'zoomIn',
    group: 'advanced',
    name: ['放大', 'Zoom +'],
    keys: [88],
    binding: 'X',
    touch: ['点击 +', 'Tap +'],
    description: [
      '放大精确瞄准；拖到边缘可巡视，定位回到车队。',
      'Zoom in; drag at the edge to pan, LOCATE returns to convoy.',
    ],
    event: 'zoom',
  },
  {
    id: 'focus',
    group: 'advanced',
    name: ['临时放大', 'Focus'],
    keys: [],
    binding: 'RMB hold',
    touch: ['使用 + / −', 'Use + / −'],
    description: ['右键松开恢复原倍率。', 'Release RMB to restore zoom.'],
    event: 'zoom',
  },
  {
    id: 'sensor',
    group: 'advanced',
    name: ['传感器', 'Sensor'],
    keys: [86],
    binding: 'V',
    touch: ['点击传感器', 'Tap SENSOR'],
    description: [
      '热成像 / 日光切换。亮度表示热量；菱形敌人、方框友军。',
      'Thermal/daylight. Heat is brightness; diamonds hostile, squares friendly.',
    ],
    event: 'sensor',
  },
  {
    id: 'convoy',
    group: 'advanced',
    name: ['车队指令', 'Convoy'],
    keys: [84],
    binding: 'T',
    touch: ['点击等待 / 继续', 'Tap HOLD / GO'],
    description: [
      '只在下一个待命点停车；等待期间敌人、弹药冷却和倒计时继续。',
      'Stop at the next hold point. Enemies and mission clock keep running.',
    ],
    event: 'hold',
  },
  {
    id: 'locate',
    group: 'advanced',
    name: ['定位车队', 'Locate'],
    keys: [82],
    binding: 'R',
    touch: ['点击定位', 'Tap LOCATE'],
    description: [
      '把视野与准星移回救援车附近，不会重开任务。',
      'Center the view near the rescue vehicle. Does not restart.',
    ],
    event: 'locate',
  },
  {
    id: 'mission',
    group: 'basic',
    name: ['任务', 'Mission'],
    keys: [77],
    binding: 'M',
    touch: ['点击任务', 'Tap MISSION'],
    description: [
      `护送并清除全部威胁：12 辆友军分守车队与 3 处据点，装甲可抵御 80% 敌方地面火力，护卫会弱火力反击。每处至少一辆存活；救援车被毁、任一据点全灭或 ${MISSION.duration} 秒超时则失败。`,
      `Escort and clear every threat. 12 allies guard the convoy and 3 outposts; armor resists 80% of ground fire and escorts return light fire. Keep a survivor at each post. Losing rescue or a post, or ${MISSION.duration}s timeout, fails.`,
    ],
  },
  {
    id: 'help',
    group: 'basic',
    name: ['帮助', 'Help'],
    keys: [72, 191],
    binding: 'H / ?',
    touch: ['点击帮助', 'Tap HELP'],
    description: [
      '打开指南暂停任务，正文可滚动，关闭后继续。',
      'Guide pauses the mission. Scroll the body and close to resume.',
    ],
  },
  {
    id: 'pause',
    group: 'basic',
    name: ['暂停', 'Pause'],
    keys: [80, 27],
    binding: 'P / Esc',
    touch: ['点击暂停', 'Tap PAUSE'],
    description: [
      '暂停冻结世界、炮弹、热量和时间。回来必须重新按下开火。',
      'Pauses world, shells, heat and clock. Press FIRE again on return.',
    ],
  },
  {
    id: 'fullscreen',
    group: 'advanced',
    name: ['全屏', 'Full screen'],
    keys: [],
    binding: '',
    touch: ['点击全屏 / 退出全屏', 'Tap full screen / exit'],
    description: [
      '右上角全屏可直接点击，退出后保留进度；暂停面板底部也可使用。不支持时仍可窗口游玩。',
      'Use the top-right Full screen button or the pause card. Progress is preserved on exit; windowed play stays available.',
    ],
  },
  {
    id: 'protection',
    group: 'rules',
    name: ['保护区', 'Protected zone'],
    keys: [],
    binding: '',
    touch: ['斜线区域禁止开火', 'Hatched zone: no fire'],
    description: [
      '爆炸范围触及保护区就禁止开火；普通友军只警告，标准模式仍会造成友伤。',
      'Any blast overlap with shelter blocks fire. Other friendlies only warn and can take damage.',
    ],
  },
  {
    id: 'heat',
    group: 'rules',
    name: ['积热与冷却', 'Heat & reload'],
    keys: [],
    binding: '',
    touch: ['看温度条和装填数字', 'Watch heat/reload'],
    description: [
      '热量到 100 过热，冷却到 40 恢复。切枪不会清空热量。',
      'Overheat at 100; resume at 40. Switching does not reset heat.',
    ],
  },
  {
    id: 'flight',
    group: 'rules',
    name: ['弹着提前量', 'Flight time'],
    keys: [],
    binding: '',
    touch: ['瞄准运动方向前方', 'Lead the target'],
    description: [
      '从飞机实际位置发射，斜距与高度影响弹道和时间。瞄准目标未来位置；重炮友伤半径最大。',
      'Rounds launch from the aircraft. Range and altitude affect trajectory and time. Lead moving targets; Heavy has the largest friendly-fire radius.',
    ],
  },
  {
    id: 'rating',
    group: 'rules',
    name: ['撤离评价', 'Debrief'],
    keys: [],
    binding: '',
    touch: ['保护救援车', 'Protect rescue'],
    description: [
      'S：成功、救援车生命至少 70%、无友伤且无友军损失。A：至少 40%、友伤小于 60、友军损失不超过 2 辆。其余成功为 B。',
      'S: success, ≥70% health, no friendly damage or losses. A: ≥40%, friendly damage <60 and ≤2 friendly losses. Other successes: B.',
    ],
  },
] as const;
export type ActionId = (typeof ACTIONS)[number]['id'];
export function action(id: string) {
  return ACTIONS.find((a) => a.id === id)!;
}
export function bindingLabel(id: string, lang: Language) {
  const binding = action(id).binding;
  return lang === 'en'
    ? binding.replace('LMB', 'Left mouse').replace('RMB hold', 'Hold right mouse')
    : binding
        .replace('LMB', '鼠标左键')
        .replace('Space', '空格')
        .replace('RMB hold', '按住鼠标右键')
        .replace('Mouse', '移动鼠标')
        .replace('Wheel', '滚轮');
}
export function actionLabel(id: string, lang: Language, touch = false, automatic = true) {
  const a = action(id);
  if (a.id === 'fire')
    return text(touch ? (automatic ? a.touchHold : a.touchTap) : automatic ? a.hold : a.tap, lang);
  return `${!touch && a.binding ? bindingLabel(id, lang).split(' / ')[0] + ' · ' : ''}${text(a.name, lang)}`;
}
export const TUTORIAL = ['aim', 'fire', 'hit', 'weapon'] as const;
export function tutorialText(event: string, lang: Language, touch: boolean) {
  if (event === 'weapon')
    return text(
      touch
        ? [
            '点「爆破炮」对付炮台；重甲出现时用重型炮。',
            'Tap Burst for turrets. Use Heavy when armor arrives.',
          ]
        : [
            '按 2 切爆破炮对付炮台；重甲出现时按 3。',
            'Press 2 for turrets. Press 3 when armor arrives.',
          ],
      lang,
    );
  if (event === 'aim')
    return text(
      touch
        ? [
            '左手拖动战场，把准星移到菱形敌人前方。',
            'Drag the battlefield. Aim ahead of a diamond.',
          ]
        : ['移动鼠标，把准星移到菱形敌人前方。', 'Move the mouse. Aim ahead of a diamond.'],
      lang,
    );
  if (event === 'fire')
    return text(
      touch
        ? ['右手按住开火；左手可以继续瞄准。', 'Hold FIRE with your other thumb. Keep aiming.']
        : ['按住左键开火，松开即停。', 'Hold the left mouse button. Release to stop.'],
      lang,
    );
  if (event === 'hit')
    return text(
      [
        '瞄准目标前方，命中一次。菱形是敌人，方框是友军。',
        'Lead a diamond target and land a hit. Squares are friendly.',
      ],
      lang,
    );
  if (event === 'continue')
    return text(
      [
        '到待命点停稳后，清理前路，再点击车队继续。',
        'Clear the road at the hold point, then tell the convoy to GO.',
      ],
      lang,
    );
  const id =
    event === 'weapon'
      ? 'weapon2'
      : event === 'zoom'
        ? 'zoomIn'
        : event === 'hold'
          ? 'convoy'
          : event;
  const a = action(id);
  return `${text(a.name, lang)} · ${touch ? text(a.touch, lang) : bindingLabel(a.id, lang)} — ${text(a.description, lang)}`;
}
