type PlayChoice = { label: string; search: string };
type FeaturedPlay = { hook: string; choices: readonly PlayChoice[] };

/** Small, concrete invitations into real Game modes. */
export const featuredPlay: Readonly<Record<string, FeaturedPlay>> = {
  'carding-car': {
    hook: '漂移攒加速，冲过终点，再邀朋友挑战同一条赛道。',
    choices: [
      { label: '一圈冲刺', search: 'mode=sprint' },
      { label: '三圈夺冠', search: 'mode=standard' },
    ],
  },
  'cops-robbers': {
    hook: '小地图先练配合：封路、夹击，几步拿下。',
    choices: [
      { label: '两侧夹击', search: 'mode=quick&level=1&role=pursuer&rule=standard' },
      { label: '先封后追', search: 'mode=quick&level=2&role=pursuer&rule=standard' },
      { label: '双巷分工', search: 'mode=quick&level=3&role=pursuer&rule=standard' },
    ],
  },
  'cops-robbers-realtime': {
    hook: '点选队员、截住去路，挑战更快的包围。',
    choices: [
      { label: '桥口夹击', search: 'mode=quick&level=1&role=cop&first=none&rule=standard' },
      { label: '三岔收口', search: 'mode=quick&level=2&role=cop&first=none&rule=standard' },
      { label: '双街协作', search: 'mode=quick&level=3&role=cop&first=none&rule=standard' },
    ],
  },
  'letters-words2': {
    hook: '先收获三个单词，揭开层叠字母，再逛更大的词岛。',
    choices: [
      { label: '早餐小岛', search: 'mini=dawn&v=1' },
      { label: '海岸小岛', search: 'mini=shore&v=1' },
      { label: '星空小岛', search: 'mini=orbit&v=1' },
    ],
  },
  'vibeJam-myself-history-guess': {
    hook: '看三幕历史风景，找线索、猜时空，揭晓背后的故事。',
    choices: [
      { label: '街市三幕', search: 'route=market&v=1' },
      { label: '江港三幕', search: 'route=harbor&v=1' },
      { label: '匠作三幕', search: 'route=craft&v=1' },
    ],
  },
  'xiangqi-five': {
    hook: '棋子照象棋走，五子连线赢。从一手妙招到两步连招。',
    choices: [
      { label: '车桥入门', search: 'challenge=rook-bridge' },
      { label: '双线连招', search: 'challenge=crossroads' },
      { label: '炮阵连招', search: 'challenge=cannon-cross' },
    ],
  },
  'travel-bund': {
    hook: '沿着三站路线找地标，收集足迹，留下旅行明信片。',
    choices: [
      { label: '建筑寻迹', search: 'route=architecture' },
      { label: '桥畔寻迹', search: 'route=bridges' },
      { label: '天际寻迹', search: 'route=skyline' },
    ],
  },
  'night-overwatch': {
    hook: '先练三档火力，再护送车队穿过伏击与巡逻火线。',
    choices: [
      { label: '60秒热身', search: 'mission=training-60' },
      { label: '伏击护送', search: 'mission=ambush-02' },
      { label: '巡逻护送', search: 'mission=patrol-03' },
    ],
  },
  'wulong-city': {
    hook: '称重时头顶也有重量？遥控竟然要站远？试试喜剧机关。',
    choices: [
      { label: '乌龙称重', search: 'challenge=25' },
      { label: '远程遥控', search: 'challenge=26' },
    ],
  },
};
