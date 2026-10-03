import type { Level, Theme } from '../core/model.ts';

// Each letter is a ROOM / courtyard, not a floor tile. Only explicitly listed edges open walls.
function level(
  id: number,
  name: string,
  theme: Theme,
  rows: string[],
  links: string,
  extra: Partial<Level> = {},
): Level {
  const rooms = rows.flatMap((row, z) =>
    [...row].flatMap((c, x) =>
      c === '.'
        ? []
        : [
            {
              id: c,
              x,
              z,
              theme,
              landmark: '',
              variant: (x + z * 2) % 3,
            },
          ],
    ),
  );
  return {
    id,
    name,
    theme,
    version: 1,
    seed: 4100 + id,
    rooms,
    edges: links
      .split(' ')
      .filter(Boolean)
      .map((pair) => ({ id: pair, a: pair[0], b: pair[1] })),
    entry: 'A',
    exit: { room: rooms.at(-1)!.id, dir: 2 },
    mirrors: [],
    switches: [],
    required: [],
    minLoops: 0,
    tutorial: '',
    design: '',
    ...extra,
  };
}
export const levels: Level[] = [
  level(1, '初识走廊', 'home', ['.D.', 'ABC', '..E', '..F'], 'AB BC BD CE EF', {
    exit: { room: 'F', dir: 2 },
    tutorial: 'move',
    design:
      '训练移动、回头与出口检查。B 是明显岔路，D 为短死路；入口的蓝色窗与尽头书柜帮助纠正走向。',
  }),
  level(5, '喷泉入口', 'garden', ['ABCD', 'EFGH', 'IJKL'], 'AB BC BF AE EF CG GH DH EI IJ JK KL', {
    minLoops: 1,
    design:
      '喷泉庭院 B 从入口与内庭两个方向可回访；A-B-F-E 是首个庭院环。误把雕像翼 D 当出口时，回望喷泉和石路纹样纠正。',
  }),
  level(
    9,
    '三色灯区',
    'light',
    ['ABCD', 'EFGH', 'IJKL', 'MNOP'],
    'AB BC CD AE EF FG BF DH HL LK KJ JI IM MN NO OP GK EI',
    {
      minLoops: 3,
      design:
        '按列分为单条青灯、双圆琥珀灯、三条淡紫灯区域。A-B-F-E 和 F-G-K-J-I-E 的局部回环训练分区；颜色近似时由灯数、形状和门位纠正。',
    },
  ),
  level(
    13,
    '第一面镜',
    'mirror',
    ['ABCD', 'EFGH', 'IJKL'],
    'AB BC CD AE EF FG GH DH EI IJ JK KL CG',
    {
      minLoops: 2,
      tutorial: 'mirror',
      mirrors: [
        { room: 'A', dir: 0 },
        { room: 'A', dir: 3 },
        { room: 'F', dir: 0 },
        { room: 'H', dir: 2 },
      ],
      design:
        '缩回 12 房教学。入口北镜映出南门，西镜映出东门；可近距检查而无需撞墙。C-D-H-G 回环与真实门框、地面金线帮助区分亲历和倒影。',
    },
  ),
  level(
    17,
    '星海边界',
    'cosmos',
    ['ABCDEF', 'GHIJKL', 'MNOPQR'],
    'AB BC CD DE EF AG GH HI CI DJ JK KL FL GM MN NO OP PQ QR KQ IO',
    {
      minLoops: 4,
      design:
        '星窗深远但不通行；地板边线和门框可靠。A-B-C-I-H-G 回环与 D-E-F-L-K-J 回环隔着中庭连接，行星雕塑和稳定窗景纠正误认。',
    },
  ),
];
// Room details are authored separately so a repeated landmark remains a useful, imperfect clue.
export function landmark(l: Level, room: string, name: string, variant?: number) {
  const r = l.rooms.find((r) => r.id === room)!;
  r.landmark = name;
  if (variant !== undefined) r.variant = variant;
}
landmark(levels[0], 'A', '蓝窗');
landmark(levels[0], 'B', '落地钟');
landmark(levels[0], 'D', '书柜');
landmark(levels[1], 'B', '喷泉');
landmark(levels[1], 'D', '雕像');
landmark(levels[1], 'F', '白花庭');
for (const r of levels[2].rooms) {
  r.variant = Math.min(2, Math.floor(r.x / 1.5));
  r.landmark = ['条灯', '圆灯', '三线灯'][r.variant];
}
landmark(levels[3], 'A', '斜纹基座', 0);
landmark(levels[3], 'G', '方形基座', 1);
for (const r of levels[4].rooms) {
  r.variant = Math.floor(r.x / 2);
  r.landmark = ['环星', '海蓝', '赤砂'][r.variant];
}
levels.push(
  level(2, '三门客厅', 'home', ['.D.', 'ABC', 'EFG', '.H.'], 'AB BD BC BF FE FG FH', {
    exit: { room: 'G', dir: 1 },
    tutorial: 'marks',
    design:
      '客厅 B 除来路外连接 D、C、F 三条支路；前两条是短尽头，第三条再分岔。练习给具体门口贴已排查，而非把来过客厅误当完成排查；落地钟和书柜帮助回头。',
  }),
  level(
    3,
    '回到钟表厅',
    'home',
    ['.AB.', '.CD.', 'EFGH', '..IJ'],
    'AB BD DC CA CF FE FG GH GI IJ',
    {
      minLoops: 1,
      tutorial: 'loop',
      design:
        'A-B-D-C-A 是首次关键回环；钟表厅 C 从北门或东门可回来。误把重复到访当成新房时，钟摆、蓝窗和主动标记纠正；南侧 F 再引出出口支路。',
    },
  ),
  level(
    4,
    '三翼宅邸',
    'home',
    ['..A..', '.BCD.', 'EFGHI', '.JKL.'],
    'AC CB CD CG BF FE FJ DH HI HL GK',
    {
      exit: { room: 'K', dir: 2 },
      design:
        '中央 C 连接西书房翼 B-F、东画室翼 D-H、南窗廊翼 G-K；三翼无跨越通道，需回大厅逐步排查。相似边厅通过门位和书柜/画作纠正，训练分支管理而非堆回环。',
    },
  ),
  level(
    6,
    '双生庭院',
    'garden',
    ['ABCD', 'EFGH', 'IJKL', '.MN.'],
    'AB BC CD AE EF BF CG GH HL LK KJ JI JM MN NK DH',
    {
      minLoops: 3,
      exit: { room: 'N', dir: 2 },
      design:
        'F 和 G 为相似庭院但不直接相连；F 的横座椅和单纹底座、G 的纵座椅和双纹底座稳定可辨。左侧 A-B-F-E、右侧 C-D-H-G 及 J-K-N-M 三个环让错误归类可被返回门位纠正。',
    },
  ),
  level(
    7,
    '内外花环',
    'garden',
    ['ABCD', 'EFGH', 'IJKL', 'MNOP'],
    'AB BC CD DH HL LP PO ON NM MI IE EA FG GK KJ JF BF KO',
    {
      minLoops: 3,
      exit: { room: 'P', dir: 1 },
      design:
        '外围十二庭院围成花环，F-G-K-J 为内环，仅 B-F 与 K-O 两处连接。外环石雕与内环白花重复成组；认错环路时用植物分区、门位及连接处参考点纠正。',
    },
  ),
  level(
    8,
    '花园侧门',
    'garden',
    ['ABCDEF', 'GHIJKL', 'MNOPQR'],
    'AB BC CD DE EF FL LR RQ QP PO ON NM MG GA GH HI IJ JK KL CI JP',
    {
      minLoops: 4,
      switches: [{ id: 'side', room: 'H', dir: 2, label: '花园侧门' }],
      design:
        'G 是入口旁中心庭，G-H 的侧门初始关闭；从 A-B-C-I-H 绕访后在 H 永久开启。H 返回 G 从五段缩至一段。外围环与 J-P 连接支持回访；喷泉和门口标记纠正未开的旧印象。',
    },
  ),
  level(
    10,
    '相似灯廊',
    'light',
    ['ABCDE', 'FGHIJ', 'KLMNO', '.PQR.'],
    'AB BC CD DE AF FG GH CH DI EJ JI IN NM MH ML LK KF LP PQ QR RN NO',
    {
      minLoops: 5,
      exit: { room: 'R', dir: 2 },
      design:
        '全关灯色统一为琥珀，F-G-H 与 L-M-N 是相似平行走廊；以单条、双圆、三线灯及门位区分。H-C-B-A-F 和 H-M-N-I 的回环验证判断；出口分支须经下方 P-Q-R。',
    },
  ),
  level(
    11,
    '交错光廊',
    'light',
    ['ABCDE', 'FGHIJ', 'KLMNO', 'PQRST'],
    'AB BC CD DE AF FG GH HC HI IJ EJ FK KL LM MH IN NO OJ KP PQ QR RM RS ST TO',
    {
      minLoops: 6,
      design:
        'H 光庭有北西东南四门：A-B-C-H-G-F 环、C-D-E-J-I-H 环和 H-M-L-K-F 环从不同入口回到同一三线灯柱。误把已到大厅等于查完全部方向时，用各门标记和稳定灯柱纠正。',
    },
  ),
  level(
    12,
    '双灯回访',
    'light',
    ['ABCDE', 'FGHIJ', 'KLMNO', 'PQRST', '..UV.'],
    'AB BC CD DE AF FG GH HI IJ EJ FK KL LM MN NO JO KP PQ QR RS ST OT MR RU UV VS CH',
    {
      minLoops: 6,
      exit: { room: 'B', dir: 0 },
      required: ['dawn', 'dusk'],
      switches: [
        { id: 'dawn', room: 'P', dir: 3, label: '晨灯控制点' },
        { id: 'dusk', room: 'T', dir: 1, label: '暮灯控制点' },
      ],
      design:
        '入口旁 B 先提供出口及双灯条件。P 与 T 分处两翼；两次启动永久保持，需沿已知回环返回 B。R-U-V-S 支环容易误认新主线，灯形和待回访标记帮助规划，无限时。',
    },
  ),
  level(
    14,
    '对称镜厅',
    'mirror',
    ['ABCD', 'EFGH', 'IJKL', 'MNOP'],
    'AB BC CD AE BF CG DH EF EI IJ JF GK KL LH IM MN NO OP LP JK',
    {
      minLoops: 5,
      mirrors: [
        { room: 'A', dir: 0 },
        { room: 'F', dir: 1 },
        { room: 'G', dir: 3 },
        { room: 'J', dir: 2 },
        { room: 'K', dir: 2 },
      ],
      design:
        'F/G 双镜厅相似却不直通，各自镜面映出对侧门。F 的青绿方雕与单纹地线、G 的金色斜雕与双纹门框可辨；左环 A-B-F-E 与右环 C-D-H-L-K-G 允许检验记忆。',
    },
  ),
  level(
    15,
    '倒影回环',
    'mirror',
    ['ABCDEF', 'GHIJKL', 'MNOPQR'],
    'AB BC CD DE EF AG BH CI DJ EK FL GH HI IJ JK KL GM MN NO OP PQ QR IO KQ',
    {
      minLoops: 7,
      mirrors: [
        { room: 'A', dir: 0 },
        { room: 'A', dir: 3 },
        { room: 'C', dir: 0 },
        { room: 'H', dir: 2 },
        { room: 'J', dir: 2 },
        { room: 'P', dir: 0 },
        { room: 'R', dir: 1 },
      ],
      design:
        'A-B-H-G 回环和 I-O-P-Q-K-J 回环叠加反射；H 南镜与 P 北镜会让人以为已亲访另一翼。镜面的固定脚线和近距核实、地图只记实走连接共同纠正；标记倒影无额外实体。',
    },
  ),
  level(
    16,
    '镜宫出口',
    'mirror',
    ['ABCDE', 'FGHIJ', 'KLMNO', 'PQRST'],
    'AB BC CD DE EJ JO OT TS SR RQ QP PK KF FA FG GH HI IN NM ML LG CH MR',
    {
      minLoops: 4,
      mirrors: [
        { room: 'A', dir: 0 },
        { room: 'A', dir: 3 },
        { room: 'H', dir: 2 },
        { room: 'J', dir: 3 },
        { room: 'N', dir: 1 },
        { room: 'Q', dir: 0 },
        { room: 'P', dir: 3 },
      ],
      design:
        '外围大环与 G-H-I-N-M-L 小环，通过 F-G、C-H、M-R 相连；七个真假候选位置组合检查、标记和回访。H 南镜映出北门，N 东镜模拟出口侧廊；实体门框纹和核实关系纠正。',
    },
  ),
  level(
    18,
    '行星分区',
    'cosmos',
    ['ABCDE', 'FGHIJ', 'KLMNO', 'PQRST'],
    'AB BC CD DE AF BG CH DI EJ FG GH IJ FK GL HM JO KL LM MN NO KP LQ MR NS OT PQ QR ST IN RS',
    {
      minLoops: 10,
      design:
        '西侧环星、中部海蓝、东侧赤砂固定窗景和门框符号构成分区。上下相似房间不能只靠行星，需要结合门位；F-G-L-K 与 I-J-O-N 的侧环及下方长环用于回访校正。',
    },
  ),
  level(
    19,
    '星门回访',
    'cosmos',
    ['ABCDEF', 'GHIJKL', 'MNOPQR', 'STUVWX'],
    'AB BC CD DE EF AG BH CI DJ EK FL GH HI IJ KL GM HN IO JP LR MN NO OP PQ QR MS NT OU PV QW RX ST TU UV VW WX',
    {
      minLoops: 12,
      exit: { room: 'B', dir: 0 },
      required: ['orbit', 'tide'],
      switches: [
        { id: 'orbit', room: 'S', dir: 3, label: '环星信标' },
        { id: 'tide', room: 'R', dir: 1, label: '海潮信标' },
      ],
      design:
        'B 星门在入口附近，先获知两个信标条件。S 与 R 分属两翼，永久启动后沿熟悉路线返回，不提示出口方向。多条横向回环与不同门位区分相似星窗，待回访标记保留计划。',
    },
  ),
  level(
    20,
    '五境归途',
    'home',
    ['ABCDEF', 'GHIJKL', 'MNOPQR', 'STUVWX', 'YZabcd'],
    'AB BC CD DE EF GH HI IJ JK KL MN NO OP PQ QR ST TU UV VW WX YZ Za ab bc cd AG FL GM LR MS RX SY Xd CI IO OU Ua BH PV',
    {
      minLoops: 9,
      required: ['garden-way', 'mirror-way'],
      switches: [
        { id: 'garden-way', room: 'H', dir: 2, label: '花园归途侧门' },
        { id: 'mirror-way', room: 'V', dir: 2, label: '镜厅归途侧门' },
      ],
      mirrors: [
        { room: 'S', dir: 3 },
        { room: 'T', dir: 0 },
        { room: 'W', dir: 0 },
      ],
      design:
        '30 房分五条主题带，左右跨区通路与 C-I-O-U-a 中轴组成多环。H 开 B-H、V 开 P-V，两条永久捷径分别缩短跨区回访，最终星门沿用双控制点规则。主题仅表示区域，局部门位、地标和标记解决相似房误认。',
    },
  ),
);
levels.sort((a, b) => a.id - b.id);
// Persistent gates are explicit graph edges, not visual-only doors.
getLevel(8).edges.find((e) => e.id === 'GH')!.gate = 'side';
getLevel(20).edges.find((e) => e.id === 'BH')!.gate = 'garden-way';
getLevel(20).edges.find((e) => e.id === 'PV')!.gate = 'mirror-way';
for (const l of levels)
  for (const r of l.rooms) {
    if (l.id === 20) r.theme = (['home', 'garden', 'light', 'mirror', 'cosmos'] as Theme[])[r.z];
    if (l.id === 7) {
      r.variant = 'FGJK'.includes(r.id) ? 1 : 0;
      r.landmark = 'FGJK'.includes(r.id) ? '白花内庭' : '石雕外庭';
    }
    if (l.id === 18 || l.id === 19) {
      r.variant = Math.min(2, Math.floor(r.x / 2));
      r.landmark = ['环星', '海蓝', '赤砂'][r.variant];
    }
    if (!r.landmark)
      r.landmark = {
        home: ['蓝窗', '静物画', '书柜'],
        garden: ['花圃', '白花庭', '雕像'],
        light: ['条灯', '圆灯', '三线灯'],
        mirror: ['方形基座', '斜纹基座', '枝叶纹'],
        cosmos: ['环星', '海蓝', '赤砂'],
      }[r.theme][r.variant];
  }
for (const [id, room, name, variant] of [
  [2, 'B', '落地钟', 0],
  [3, 'C', '落地钟', 0],
  [4, 'C', '落地钟', 0],
  [4, 'F', '书柜', 1],
  [4, 'H', '远山画', 2],
  [6, 'F', '雕像', 0],
  [6, 'G', '雕像', 1],
  [8, 'G', '喷泉', 0],
  [11, 'H', '三线灯', 2],
  [14, 'F', '方形基座', 0],
  [14, 'G', '斜纹基座', 1],
  [20, 'H', '喷泉', 0],
] as const)
  landmark(getLevel(id), room, name, variant);
export function getLevel(id: number) {
  return levels.find((l) => l.id === id) ?? levels[0];
}
