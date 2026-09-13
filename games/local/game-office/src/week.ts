/** Narrative slots keep the workday in chronological order. */
export type ScenePeriod = 'arrival' | 'morning' | 'lunch' | 'afternoon' | 'evening';

/** A scene is advertised as playable only after its own interaction is implemented. */
export type SceneDefinition = {
  id: string;
  title: string;
  location: string;
  period: ScenePeriod;
  interaction: string;
  fun: string;
  status: 'playable' | 'planned';
};

export const SCENES = [
  {
    id: 'late-arrival',
    title: '迟到的最后一分钟',
    location: '门厅 → 办公区',
    period: 'arrival',
    interaction: '蹲下绕屏风，拿文件伪装或用打印机引开老板，到电脑前打卡。',
    fun: '自己选择路线与穿越时机，成功坐下才松一口气。',
    status: 'playable',
  },
  {
    id: 'elevator',
    title: '电梯门开了，老板也在',
    location: '电梯厅',
    period: 'arrival',
    interaction: '挪步选站位、扶住电梯门、等搬运车经过再出门。',
    fun: '人群移动改变遮挡，抓住只有几秒的离开机会。',
    status: 'planned',
  },
  {
    id: 'desk-setup',
    title: '人到工位，魂还没到',
    location: '自己的工位',
    period: 'arrival',
    interaction: '放包、挂外套、开电脑，在同事来问话前整理现场。',
    fun: '记住物品位置，用最顺手的动作顺序偷出空闲。',
    status: 'planned',
  },
  {
    id: 'coffee',
    title: '第一杯咖啡续命',
    location: '茶水间',
    period: 'morning',
    interaction: '对准杯子接咖啡，等萃取时回复消息，满杯及时停下。',
    fun: '在机器节奏和队伍催促之间多争取一条消息。',
    status: 'planned',
  },
  {
    id: 'desk-phone',
    title: '桌沿下面再刷一条',
    location: '自己的工位',
    period: 'morning',
    interaction: '拿手机、低头看、环顾来路；收手机与关娱乐窗口分别操作。',
    fun: '想再看一条的贪心，与自己观察到的危险窗口较量。',
    status: 'planned',
  },
  {
    id: 'group-chat',
    title: '小群的最后一张表情包',
    location: '同事工位',
    period: 'morning',
    interaction: '走到邻座压低声音接梗，辨认群名再发送游戏内表情。',
    fun: '看懂同事眼色，打出恰到好处的一次配合。',
    status: 'planned',
  },
  {
    id: 'printer-snack',
    title: '打印机掩护下的零食',
    location: '打印区',
    period: 'morning',
    interaction: '打印开始才拆包装，停机时停手，接住纸张并清理碎屑。',
    fun: '听看机器节奏，在突然安静之前把小动作收好。',
    status: 'planned',
  },
  {
    id: 'headphones',
    title: '耳机里根本不是培训',
    location: '自己的工位',
    period: 'morning',
    interaction: '拿耳机、切换模拟培训与娱乐，看到同事靠近后摘一侧回应。',
    fun: '娱乐占用注意力，适时抬头观察才能把休息接回正常工作。',
    status: 'planned',
  },
  {
    id: 'bathroom',
    title: '带薪厕所的私人宇宙',
    location: '卫生间隔间',
    period: 'lunch',
    interaction: '锁门、调低手机音量、设置返回提醒，收好手机后洗手离开。',
    fun: '安排一段属于自己的安静时间，门影与提醒改变收尾时机。',
    status: 'planned',
  },
  {
    id: 'microwave',
    title: '微波炉前的两分钟',
    location: '茶水间',
    period: 'lunch',
    interaction: '放饭盒、设加热时间、等餐玩短游戏，铃响取餐让位。',
    fun: '等待是自己的奖励窗口，贪玩会打乱排队节奏。',
    status: 'planned',
  },
  {
    id: 'sofa-nap',
    title: '沙发闭眼一会儿',
    location: '休息区',
    period: 'lunch',
    interaction: '走到沙发放靠垫、设闹钟，选择何时闭眼与起身。',
    fun: '低压力的恢复段；睡得深更舒服，也需要留出更长起身时间。',
    status: 'planned',
  },
  {
    id: 'rooftop',
    title: '楼梯尽头的一小片天',
    location: '楼梯间休息平台',
    period: 'lunch',
    interaction: '走到窗边找舒适站位、给窗外拍照，提醒后收手机回去。',
    fun: '探索午间安静角落，镜头构图和准时返回形成自己的小目标。',
    status: 'planned',
  },
  {
    id: 'meeting-ppt',
    title: '老板 PPT 的第 38 页',
    location: '会议室',
    period: 'afternoon',
    interaction: '选座位、记下已展示的关键词，桌下偷玩后抬头回答。',
    fun: '分配观察与娱乐的注意力，用真记住的信息顺利过关。',
    status: 'planned',
  },
  {
    id: 'online-meeting',
    title: '线上会议悄悄切窗口',
    location: '电话间',
    period: 'afternoon',
    interaction: '走入电话间，管理游戏内窗口共享、麦克风和娱乐页。',
    fun: '不同证据要分别收尾；看懂共享边框才能放心切换。',
    status: 'planned',
  },
  {
    id: 'chair-chat',
    title: '挪椅子的请教术',
    location: '同事工位',
    period: 'afternoon',
    interaction: '蹬地滑椅、转向刹车，到同事桌边指向准备好的文档。',
    fun: '把路线控制和一本正经的闲聊结合，平稳停靠有额外评价。',
    status: 'planned',
  },
  {
    id: 'tea-chat',
    title: '茶水间的第二场会议',
    location: '茶水间',
    period: 'afternoon',
    interaction: '添水、递杯、侧身让路，跟着不同同事接话与结束聊天。',
    fun: '用有限的话题和配合动作把休息自然延长。',
    status: 'planned',
  },
  {
    id: 'stretch',
    title: '公司的超长拉伸',
    location: '活动室',
    period: 'afternoon',
    interaction: '选垫子、跟随倒数调整姿态，在合法休息段放松。',
    fun: '镜中队伍与自己的节奏错位带来轻喜剧，接上下一拍可补救。',
    status: 'planned',
  },
  {
    id: 'pack-up',
    title: '下班前的最后一圈',
    location: '办公区 → 门厅',
    period: 'evening',
    interaction: '规划取杯、收线、拿包的步行路线，按时走到出口。',
    fun: '把一日熟悉的空间变成收尾路线题。',
    status: 'planned',
  },
  {
    id: 'last-request',
    title: '关机前的一句顺便',
    location: '自己的工位',
    period: 'evening',
    interaction: '收桌时接到明确的小请求，选择帮忙顺序后保存、关机离开。',
    fun: '衡量多帮一把和早点离开的取舍，两个选择都能结束一天。',
    status: 'planned',
  },
  {
    id: 'leave-together',
    title: '跟同事一起撤退',
    location: '走廊 → 电梯厅',
    period: 'evening',
    interaction: '看同事手势会合、扶门、选择电梯或楼梯完成离场。',
    fun: '用一天培养的默契完成轻松的合作收尾。',
    status: 'planned',
  },
] as const satisfies readonly SceneDefinition[];

export type SceneId = (typeof SCENES)[number]['id'];
export type ScheduledScene = { sceneId: SceneId; startMinute: number; endMinute: number };
export type WeekDay = { index: number; label: string; scenes: ScheduledScene[] };
export type WeekPlan = { seed: number; days: WeekDay[] };

export const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五'] as const;

const PERIODS: ScenePeriod[] = ['arrival', 'morning', 'lunch', 'afternoon', 'evening'];
// ponytail: five narrative slots; add per-scene windows when another playable scene needs them.
const START_MINUTES = [9 * 60 + 8, 10 * 60, 12 * 60, 14 * 60, 17 * 60 + 40];

/** Reproducible schedules; planned scenes remain plans and never award completion. */
export function createWeek(seed: number): WeekPlan {
  const normalizedSeed = seed >>> 0;
  let randomState = normalizedSeed;
  const random = () => {
    randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const pools = PERIODS.map((period) => {
    const scenes = SCENES.filter((scene) => scene.period === period);
    for (let index = scenes.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [scenes[index], scenes[other]] = [scenes[other], scenes[index]];
    }
    return scenes;
  });

  return {
    seed: normalizedSeed,
    days: WEEKDAYS.map((label, index) => ({
      index,
      label,
      scenes: pools.map((pool, slot) => {
        const scene = index === 0 && slot === 0 ? SCENES[0] : pool[index % pool.length];
        const offset = Math.floor(random() * 25);
        const startMinute = START_MINUTES[slot] + (scene.id === 'late-arrival' ? 0 : offset);
        return { sceneId: scene.id, startMinute, endMinute: startMinute + 10 };
      }),
    })),
  };
}

/** Formats narrative clock minutes, independently from a scene's real play duration. */
export function formatTime(minute: number): string {
  return `${Math.floor(minute / 60)
    .toString()
    .padStart(2, '0')}:${(minute % 60).toString().padStart(2, '0')}`;
}
