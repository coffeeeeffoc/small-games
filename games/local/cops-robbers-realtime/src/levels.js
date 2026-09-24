import { FINAL_CHALLENGES } from "./challenge-finals.js";
export const CHAPTERS = [
  {
    id: 0,
    name: "街角见习",
    subtitle: "读懂岔路，再下第一道命令",
    color: "#78b9a3",
  },
  {
    id: 1,
    name: "绕圈高手",
    subtitle: "他会绕圈，你会抄近路",
    color: "#e8ad64",
  },
  {
    id: 2,
    name: "路口封锁",
    subtitle: "守住一个路口，改变整场追逐",
    color: "#86acc8",
  },
  {
    id: 3,
    name: "换防街区",
    subtitle: "一处收网，另一处及时补位",
    color: "#b19bc6",
  },
  {
    id: 4,
    name: "分头追捕",
    subtitle: "眼观两路，队员随时补位",
    color: "#d98c77",
  },
  {
    id: 5,
    name: "收网接力",
    subtitle: "抓住一个，马上支援下一组",
    color: "#72b5b2",
  },
  {
    id: 6,
    name: "紧缺队员",
    subtitle: "每一位追逐队员都要站对地方",
    color: "#b7b36c",
  },
  { id: 7, name: "全城围捕", subtitle: "整个街区，听你指挥", color: "#d093a5" },
];

// A separate drill uses the real movement, body blocking, exits and capture rules.
// It does not unlock campaign levels or write challenge records.
export const PRACTICE = {
  id: 0, name: "双人夹击练习", chapter: 0, par: 0,
  nodes: [{ x: 220, y: 300 }, { x: 500, y: 300 }, { x: 780, y: 300 }],
  edges: [[0, 1], [1, 2]], cops: [0, 2], robbers: [1], exits: [0, 2],
  hint: "两人已守住两侧出口。分别向中央推进，突围队员不能穿过追逐队员。",
};

// Each path is authored on a 7 × 5 street grid. Shared labels are junctions;
// a bend and each escape alley are explicit, so routing and art share the same roads.
function street(
  id,
  name,
  roads,
  cops,
  robbers,
  hint,
  guardLabels = "",
  par = 80,
  exitLabels = "",
  redeploy = [],
) {
  const paths = roads.split(" ").map((path) => path.split("-"));
  const labels = [...new Set(paths.flat())].sort(
    (a, b) => Number(a[1]) - Number(b[1]) || a.localeCompare(b),
  );
  const index = (label) => labels.indexOf(label);
  const split = (value) => (value ? value.split(" ") : []);
  const guards = split(guardLabels).map((label, cop) => ({
    cop,
    node: index(label),
  }));
  const chapter = Math.floor((id - 1) / 6);
  return {
    id,
    name,
    chapter,
    hint,
    briefing: hint,
    par,
    nodes: labels.map((label) => ({
      x: 80 + (label.charCodeAt(0) - 65) * 140,
      y: 80 + (Number(label[1]) - 1) * 110,
      label,
    })),
    edges: paths.flatMap((path) =>
      path.slice(1).map((label, i) => [index(path[i]), index(label)]),
    ),
    cops: split(cops).map(index),
    robbers: split(robbers).map(index),
    exits: split(exitLabels).map(index),
    // Initial blockade and any later redeployment are test strategies only.
    // They never issue commands or reveal exact standing positions in the game.
    solution: guards,
    hunter: guards.length,
    redeploy: redeploy.map(({ label, ...order }) => ({
      ...order,
      node: index(label),
    })),
  };
}

// Every entry owns its road graph. No mirroring or per-chapter template expansion.
const AUTHORED_LEVELS = [
  street(
    1,
    "岔路初见",
    "C4-D4 E3-E4 E1-E2 G3-G4 B4-C4 E2-F2 F3-G3 C4-C5 B3-B4 D5-E5 B2-C2 F2-F3 C5-D5 C2-D2 B2-B3 D1-E1 E3-F3 F4-G4 E4-E5 D1-D2 D4-E4 E4-F4 G4-G5 C4-C3",
    "F4 C5 D4",
    "E1",
    "先看清出口前的岔路，再从另一侧逼近；追着脚印跑，会被突围队员带进回环。",
    "G4 C4",
    30,
    "G5 C3",
  ),
  street(
    2,
    "背街绕行",
    "E2-F2 F1-G1 E1-E2 F4-F5 E1-F1 D1-D2 D1-E1 E3-E4 F5-G5 E3-F3 G1-G2 D2-D3 F4-G4 G3-G4 G2-G3 F2-F3 D3-D4 G4-G5 D4-E4 D4-D5 F5-E5",
    "D3 F4 E4",
    "F2 F1",
    "两段看着相邻的路可能要绕远。先比较沿街距离，再决定由谁截住前方。",
    "D4 F5",
    45,
    "D5 E5",
  ),
  street(
    3,
    "借道而行",
    "E2-E3 A3-B3 B1-C1 E1-F1 D3-E3 G1-G2 F1-G1 E3-F3 C2-D2 D1-E1 C1-D1 D2-D3 E1-E2 C2-C3 A1-B1 B3-C3 A2-A3 G2-G3 A1-A2 C1-C2 F3-G3 E3-E4 B3-B2",
    "E2 A3 D2",
    "C1 G3",
    "突围队员会在堵口后改选出口。分开指挥，别让全队挤在同一条路上。",
    "E3 B3",
    40,
    "E4 B2",
  ),
  street(
    4,
    "错位街口",
    "D2-E2 E3-F3 G2-G3 C2-D2 F3-G3 B2-B3 E1-E2 B3-C3 C1-D1 F2-G2 E2-F2 B1-C1 C3-D3 D2-D3 B1-B2 C1-C2 D3-E3 D1-E1 E1-F1 D3-D4",
    "D1 D2 F3",
    "B2 B3",
    "直奔最近的突围队员容易丢掉侧翼；先控制能连接几条街的路口。",
    "E1 D3",
    35,
    "F1 D4",
  ),
  street(
    5,
    "侧巷截击",
    "D1-E1 C2-D2 E1-E2 A4-B4 G3-G4 F2-F3 A2-B2 F3-F4 D1-D2 E2-F2 A2-A3 F5-G5 B2-C2 F4-F5 A3-B3 A3-A4 G2-G3 F2-G2 G4-G5 B3-B4 B4-C4 F2-F1",
    "B3 F3 G2",
    "C2 F4",
    "留意内外两种绕行方向。封住一侧后，从另一侧缩小包围，不要跟着兜圈。",
    "B4 F2",
    40,
    "C4 F1",
  ),
  street(
    6,
    "内外合围",
    "F4-F5 C4-C5 E1-F1 E5-F5 A4-B4 C3-C4 A1-B1 D5-E5 C5-D5 B4-C4 A2-A3 A3-B3 F1-F2 F2-F3 B1-C1 A1-A2 B3-C3 C1-D1 D1-E1 F3-F4 A3-A4 C1-C2 C4-D4",
    "D1 B4 E5",
    "A4 F2",
    "出口都守住还不算抓获。观察剩下的安全街道，推进时给同伴留好位置。",
    "C1 C4",
    35,
    "C2 D4",
  ),
  street(
    7,
    "一线之隔",
    "D1-E1 E2-E3 B2-B3 D3-D4 A2-B2 C3-D3 D1-D2 B3-C3 B2-C2 A1-A2 E3-E4 D5-E5 C2-D2 B1-B2 E1-E2 D4-D5 E4-E5 A1-B1 B1-C1 B3-B4",
    "B2 C3 E3",
    "A2 D4",
    "先看清出口前的岔路，再从另一侧逼近；追着脚印跑，会被突围队员带进回环。",
    "B1 B3",
    40,
    "C1 B4",
  ),
  street(
    8,
    "连巷追踪",
    "D2-E2 A3-A4 E5-F5 C4-C5 B3-B4 D1-E1 F1-F2 C3-C4 A4-B4 F3-F4 C5-D5 D1-D2 A2-B2 C3-D3 D2-D3 F2-F3 D5-E5 B2-B3 B3-C3 E1-F1 F4-F5 A2-A3 E2-F2 B4-B5 D2-C2",
    "A4 D3 E5",
    "A3 F4",
    "两段看着相邻的路可能要绕远。先比较沿街距离，再决定由谁截住前方。",
    "B4 D2",
    35,
    "B5 C2",
  ),
  street(
    9,
    "折返陷阱",
    "D2-E2 D4-D5 A3-B3 E2-E3 D2-D3 A2-B2 A2-A3 C5-D5 A3-A4 A4-A5 C2-C3 D3-D4 A5-B5 B3-C3 C3-D3 B1-B2 B1-C1 C1-C2 B5-C5 D3-E3 E3-E4 C3-C4",
    "E2 B3 D3",
    "A2 B1",
    "突围队员会在堵口后改选出口。分开指挥，别让全队挤在同一条路上。",
    "E3 C3",
    35,
    "E4 C4",
  ),
  street(
    10,
    "远街近路",
    "E2-F2 A4-B4 F3-G3 E3-E4 A1-B1 E4-F4 A2-A3 F2-F3 G3-G4 F1-F2 D3-E3 C1-D1 F4-F5 A5-B5 F4-G4 D5-E5 A1-A2 E5-F5 B3-C3 C3-D3 B1-C1 A4-A5 B3-B4 C5-D5 E1-E2 A3-B3 B5-C5 D1-E1 E1-F1 F2-G2 B3-B2",
    "E2 C3 F1",
    "E4 F4",
    "直奔最近的突围队员容易丢掉侧翼；先控制能连接几条街的路口。",
    "F2 B3",
    30,
    "G2 B2",
  ),
  street(
    11,
    "里弄穿行",
    "A1-A2 E3-F3 A2-A3 D2-E2 E1-E2 C2-C3 E2-E3 E4-E5 B1-B2 B2-C2 C4-C5 B2-B3 C1-C2 C3-C4 A3-B3 C2-D2 C1-D1 F3-F4 C5-D5 E4-F4 A1-B1 D5-E5 D1-E1 E2-F2 A3-A4",
    "D2 A2 C4",
    "F4 C2",
    "留意内外两种绕行方向。封住一侧后，从另一侧缩小包围，不要跟着兜圈。",
    "E2 A3",
    40,
    "F2 A4",
  ),
  street(
    12,
    "分岔追逐",
    "D3-E3 C4-C5 D1-D2 E2-E3 G1-G2 G2-G3 F1-G1 A4-B4 F3-G3 D3-D4 B3-C3 E3-F3 C2-C3 C2-D2 B3-B4 C5-D5 D1-E1 D4-D5 C3-C4 A3-B3 E1-F1 E1-E2 A3-A4 E3-E4 B3-B2",
    "E2 A3 D4",
    "G2 D2",
    "出口都守住还不算抓获。观察剩下的安全街道，推进时给同伴留好位置。",
    "E3 B3",
    30,
    "E4 B2",
  ),
  street(
    13,
    "桥头岔口",
    "D1-E1 F4-G4 F1-F2 F2-F3 B3-C3 B5-C5 B4-B5 A3-B3 A2-B2 G1-G2 A2-A3 G2-G3 G3-G4 E1-E2 C2-D2 B2-C2 E2-F2 C1-D1 D1-D2 F3-F4 C4-C5 C3-C4 C1-C2 F1-G1 B3-B4 C5-D5 D2-D3 F4-E4",
    "B5 C2 F3 A3",
    "B3 F2 B4",
    "先看清出口前的岔路，再从另一侧逼近；追着脚印跑，会被突围队员带进回环。",
    "C5 D2 F4",
    40,
    "D5 D3 E4",
  ),
  street(
    14,
    "楼间捷径",
    "C1-C2 D2-D3 F5-G5 B3-C3 G1-G2 G3-G4 D5-E5 G4-G5 D4-E4 D2-E2 E4-E5 C4-C5 C2-C3 C3-C4 D3-D4 E2-F2 E1-F1 B4-C4 F2-G2 F1-G1 D1-E1 E5-F5 C1-D1 G2-G3 C5-D5 B3-B4 B4-A4 C5-B5 G3-F3",
    "B3 C4 G4 F2",
    "C1 D4 D1",
    "两段看着相邻的路可能要绕远。先比较沿街距离，再决定由谁截住前方。",
    "B4 C5 G3",
    55,
    "A4 B5 F3",
  ),
  street(
    15,
    "反向包抄",
    "F1-F2 A2-A3 A4-B4 A2-B2 C4-D4 B2-C2 B4-B5 E2-E3 B5-C5 B4-C4 E3-E4 C1-C2 A3-A4 G2-G3 D4-E4 F3-G3 E1-E2 E3-F3 C1-D1 F2-F3 G1-G2 F1-G1 D1-E1 C4-C5 B4-B3 D1-D2 G3-G4",
    "B5 E1 G2 F3",
    "F1 E4 A2",
    "突围队员会在堵口后改选出口。分开指挥，别让全队挤在同一条路上。",
    "B4 D1 G3",
    40,
    "B3 D2 G4",
  ),
  street(
    16,
    "街心调度",
    "A5-B5 C5-D5 C1-D1 A2-B2 E3-F3 F5-G5 D1-E1 B2-B3 G4-G5 A4-A5 F3-G3 E1-F1 G3-G4 A3-B3 F2-F3 B5-C5 D5-E5 A3-A4 E2-E3 B1-B2 D1-D2 B1-C1 D2-E2 A2-A3 F1-F2 E5-F5 B2-C2 D2-D3 E5-E4",
    "A2 D1 D5 A5",
    "G3 C5 F2",
    "直奔最近的突围队员容易丢掉侧翼；先控制能连接几条街的路口。",
    "B2 D2 E5",
    35,
    "C2 D3 E4",
  ),
  street(
    17,
    "多岔街区",
    "F3-G3 D4-D5 F2-G2 B3-C3 B4-B5 C2-D2 D3-D4 D1-D2 G2-G3 B3-B4 A4-B4 D3-E3 A2-A3 E1-E2 C2-C3 D5-E5 C3-D3 F3-F4 A1-B1 B1-B2 E2-F2 A1-A2 A3-A4 D1-E1 F4-F5 A4-A5 E3-F3 A5-B5 B2-C2 E5-F5 C2-C1 F5-G5 B5-C5",
    "B2 E5 A5 E3",
    "E2 D4 F2",
    "留意内外两种绕行方向。封住一侧后，从另一侧缩小包围，不要跟着兜圈。",
    "C2 F5 B5",
    45,
    "C1 G5 C5",
  ),
  street(
    18,
    "封口之后",
    "F1-G1 C4-C5 G1-G2 B2-C2 F2-F3 C2-C3 B3-B4 A2-A3 D3-E3 B5-C5 C3-D3 B4-B5 A3-B3 F2-G2 B2-B3 E3-E4 E4-F4 F3-F4 D4-E4 A2-B2 F1-F2 C4-D4 F2-E2 A2-A1 C2-D2 B3-C3",
    "G2 A3 D3 B2",
    "E3 C5 D4",
    "出口封好仍会留下内圈回路。看准突围队员走向，把一名守卫向内换防，再从另一侧合围。",
    "F2 A2 C2",
    25,
    "E2 A1 D2",
    [{ cop: 1, label: "B3", after: 0, at: 6 }],
  ),
  street(
    19,
    "边街穿插",
    "D3-E3 C2-C3 F1-G1 C4-C5 D5-E5 E2-E3 D3-D4 G1-G2 C2-D2 F2-G2 D4-D5 F2-F3 C5-D5 E3-F3 D1-D2 C3-C4 E1-E2 D4-E4 E4-E5 D1-E1 C4-D4 E1-F1 C4-B4 F3-G3 E4-F4",
    "C3 E3 E5 F1",
    "E1 G1 C2",
    "先看清出口前的岔路，再从另一侧逼近；追着脚印跑，会被突围队员带进回环。",
    "C4 F3 E4",
    35,
    "B4 G3 F4",
  ),
  street(
    20,
    "窄巷拦截",
    "D3-D4 B2-B3 F2-F3 F5-G5 D2-D3 A3-A4 G4-G5 F4-F5 A2-A3 A2-B2 D2-E2 B3-B4 D4-E4 C2-D2 E2-F2 B3-C3 F3-F4 C2-C3 F3-G3 A4-B4 E4-F4 G3-G4 A3-B3 B2-B1 B4-C4 F3-E3",
    "B3 A4 F4 D3",
    "A3 E4 D2",
    "两段看着相邻的路可能要绕远。先比较沿街距离，再决定由谁截住前方。",
    "B2 B4 F3",
    45,
    "B1 C4 E3",
  ),
  street(
    21,
    "落单的背包",
    "E2-F2 B3-C3 B2-C2 E3-E4 D2-D3 A2-A3 F4-G4 D2-E2 G3-G4 F3-G3 C3-D3 C4-D4 C2-D2 E4-F4 D3-D4 A2-B2 D4-E4 F2-F3 C3-C4 D3-E3 A3-B3 C2-C1 C4-C5 E4-E5",
    "D2 C3 F4 B3",
    "G3 A3 F3",
    "突围队员会在堵口后改选出口。分开指挥，别让全队挤在同一条路上。",
    "C2 C4 E4",
    30,
    "C1 C5 E5",
  ),
  street(
    22,
    "捕后换防",
    "C4-D4 F1-F2 E3-F3 E2-F2 C3-C4 E3-E4 A2-A3 D2-E2 E1-F1 D3-E3 B3-C3 B2-B3 D4-E4 A3-B3 D2-D3 E1-E2 A2-B2 F2-F3 D2-C2 A3-A4 F2-G2 C3-D3",
    "D3 A2 F1 F3",
    "E4 E1 D4",
    "先收掉落单目标，再把空闲守卫调向内圈。外围站位不变，突围队员会一直绕环。",
    "D2 A3 F2",
    30,
    "C2 A4 G2",
    [{ cop: 0, label: "C3", after: 1, at: 4 }],
  ),
  street(
    23,
    "穿街躲藏",
    "C3-C4 A3-B3 E4-F4 B4-C4 C5-D5 E3-E4 B2-C2 E2-E3 D1-D2 B3-C3 C1-D1 E5-F5 A2-A3 C4-C5 D5-E5 F4-F5 C1-C2 D2-E2 E3-F3 A2-B2 F3-F4 B3-B4 F4-G4 C3-D3 B4-B5",
    "F3 C4 B3 F5",
    "B2 D1 E5",
    "留意内外两种绕行方向。封住一侧后，从另一侧缩小包围，不要跟着兜圈。",
    "F4 C3 B4",
    55,
    "G4 D3 B5",
  ),
  street(
    24,
    "迂回接力",
    "D3-D4 E2-E3 A2-B2 E3-F3 C3-C4 D4-D5 F3-F4 E4-F4 C2-D2 B2-C2 C2-C3 D2-E2 C5-D5 A3-B3 B4-B5 B4-C4 D4-E4 B3-C3 C3-D3 B5-C5 A2-A3 A2-A1 E2-F2 B4-A4",
    "A3 D2 B5 C5",
    "C2 F4 D5",
    "出口都守住还不算抓获。观察剩下的安全街道，推进时给同伴留好位置。",
    "A2 E2 B4",
    40,
    "A1 F2 A4",
  ),
  street(
    25,
    "连环岔路",
    "E3-E4 B1-C1 B2-B3 E4-F4 A4-B4 E1-F1 C4-D4 A3-B3 C2-D2 D1-E1 D1-D2 F1-G1 G1-G2 G2-G3 B1-B2 C1-C2 B3-C3 B4-C4 E1-E2 C3-C4 E2-E3 F4-G4 A3-A4 D4-E4 B2-C2 C2-C3 G3-G4 B2-A2 E4-E5 A4-A5",
    "B3 E3 A3 G3",
    "G1 E1 G4 C3",
    "先看清出口前的岔路，再从另一侧逼近；追着脚印跑，会被突围队员带进回环。",
    "B2 E4 A4",
    35,
    "A2 E5 A5",
  ),
  street(
    26,
    "交错街坊",
    "C2-D2 F2-G2 E3-F3 D4-E4 F3-G3 D2-D3 B4-C4 A1-A2 C4-D4 A3-A4 C2-C3 E2-F2 D4-D5 D1-D2 A1-B1 A2-A3 B1-C1 D3-D4 E3-E4 E2-E3 A4-B4 D5-E5 C1-D1 C3-C4 E4-E5 G2-G3 E5-F5 C4-C5 G2-G1",
    "E4 D4 G3 A2",
    "F3 C1 A3 D3",
    "两段看着相邻的路可能要绕远。先比较沿街距离，再决定由谁截住前方。",
    "E5 C4 G2",
    50,
    "F5 C5 G1",
  ),
  street(
    27,
    "近路争夺",
    "F2-F3 D4-E4 C4-D4 E1-E2 C1-C2 E4-F4 G3-G4 B2-B3 E2-E3 E3-E4 E3-F3 G2-G3 F2-G2 D1-D2 C2-D2 B2-C2 B3-C3 D1-E1 E2-F2 C3-C4 F4-G4 C1-D1 F2-F1 C1-B1 D4-D3 F3-G3",
    "F3 D1 C4 E2",
    "G4 C3 B3 E1",
    "先收掉落单目标，再把空闲守卫调向内圈。外围站位不变，突围队员会一直绕环。",
    "F2 C1 D4",
    35,
    "F1 B1 D3",
    [{ cop: 2, label: "E3", after: 1, at: 4 }],
  ),
  street(
    28,
    "封锁缺口",
    "D4-E4 C4-D4 B2-B3 C1-C2 A2-B2 A3-B3 D3-D4 E4-E5 B1-B2 F4-G4 F5-G5 C2-D2 E5-F5 D5-E5 B3-B4 C3-C4 G4-G5 C5-D5 D2-D3 B4-B5 B5-C5 C3-D3 A2-A3 B1-C1 E4-F4 D3-E3 A3-A4 G4-G3 C2-C3",
    "D4 B3 G5 F4",
    "D5 C5 C1 C4",
    "出口封好仍会留下内圈回路。看准突围队员走向，把一名守卫向内换防，再从另一侧合围。",
    "D3 A3 G4",
    30,
    "E3 A4 G3",
    [{ cop: 2, label: "E4", after: 0, at: 12 }],
  ),
  street(
    29,
    "侧翼换位",
    "D4-E4 D5-E5 A4-B4 A2-B2 D1-E1 E4-E5 D3-D4 B2-C2 A2-A3 G3-G4 E5-F5 B5-C5 A3-A4 E1-F1 C5-D5 F1-F2 C3-D3 D1-D2 D2-E2 G4-G5 E2-E3 B4-C4 C3-C4 C2-D2 F5-G5 G2-G3 B4-B5 E1-E2 F2-G2 E3-E4 G2-G1 B4-B3 D1-C1",
    "F2 A4 D2 A3",
    "F5 A2 B2 E3",
    "留意内外两种绕行方向。封住一侧后，从另一侧缩小包围，不要跟着兜圈。",
    "G2 B4 D1",
    45,
    "G1 B3 C1",
  ),
  street(
    30,
    "街尾伏击",
    "F3-F4 A2-A3 B2-B3 B3-C3 A3-B3 B3-B4 C3-D3 E4-E5 E2-F2 E3-E4 F4-F5 A1-B1 D2-D3 A3-A4 D3-E3 B1-B2 D2-E2 E5-F5 A5-B5 A4-A5 A4-B4 B4-B5 F2-F3 A1-A2 B4-C4 F5-G5 B2-C2",
    "B5 E5 B1 B3",
    "C3 A2 A3 E3",
    "出口封好仍会留下内圈回路。看准突围队员走向，把一名守卫向内换防，再从另一侧合围。",
    "B4 F5 B2",
    30,
    "C4 G5 C2",
  ),
  street(
    31,
    "多线交锋",
    "F4-F5 C2-D2 A3-A4 F5-G5 A3-B3 B4-B5 C3-C4 F3-F4 B4-C4 F1-F2 C2-C3 D4-E4 C5-D5 E4-F4 D4-D5 B5-C5 G4-G5 F1-G1 F3-G3 D2-E2 G2-G3 A4-B4 G1-G2 G3-G4 B3-B4 E2-F2 C4-C5 C3-D3 B5-A5 F3-E3 A3-A2",
    "C4 B4 F4 A4 D4",
    "D5 E2 F1 F2",
    "先看清出口前的岔路，再从另一侧逼近；追着脚印跑，会被突围队员带进回环。",
    "C3 B5 F3 A3",
    55,
    "D3 A5 E3 A2",
  ),
  street(
    32,
    "长短两路",
    "D3-D4 F1-F2 C1-C2 C4-C5 C4-D4 C5-D5 G4-G5 F2-F3 D5-E5 F4-G4 F4-F5 C1-D1 B5-C5 C3-D3 E5-F5 B2-B3 B2-C2 D1-E1 B4-B5 B3-B4 E2-F2 C2-D2 F3-F4 B3-C3 E1-F1 F5-G5 D2-E2 E2-E3 F1-G1 G4-G3 D4-E4",
    "F2 E1 F4 D3 B5",
    "D1 F3 E5 D5",
    "两段看着相邻的路可能要绕远。先比较沿街距离，再决定由谁截住前方。",
    "E2 F1 G4 D4",
    35,
    "E3 G1 G3 E4",
  ),
  street(
    33,
    "四面脚步",
    "C4-D4 D3-E3 D4-E4 B4-C4 B3-B4 F4-G4 C1-D1 E4-F4 F3-F4 E3-F3 D2-D3 D1-D2 C3-D3 C1-C2 G3-G4 F3-G3 B3-C3 C2-D2 C3-C4 G4-G5 D1-E1 E4-E5 B4-A4",
    "G3 D2 D4 C4 C3",
    "D3 F3 E3 C2",
    "突围队员会在堵口后改选出口。分开指挥，别让全队挤在同一条路上。",
    "G4 D1 E4 B4",
    30,
    "G5 E1 E5 A4",
  ),
  street(
    34,
    "纵深追击",
    "C2-D2 B5-C5 C2-C3 A4-B4 B3-C3 A5-B5 A3-A4 A3-B3 C1-C2 D2-D3 F1-F2 F4-F5 D3-D4 F3-F4 F4-G4 F2-F3 F3-G3 E5-F5 B4-C4 D1-E1 C1-D1 A4-A5 D5-E5 E1-F1 G3-G4 B3-B4 C4-D4 C5-D5 G4-G5 C1-B1 B3-B2 F1-G1 D4-D5",
    "G3 D1 B4 E1 C2",
    "A5 D3 C4 F5",
    "先收掉落单目标，再把空闲守卫调向内圈。外围站位不变，突围队员会一直绕环。",
    "G4 C1 B3 F1",
    65,
    "G5 B1 B2 G1",
    [{ cop: 1, label: "D4", after: 1, at: 4 }],
  ),
  street(
    35,
    "街网缺口",
    "C1-D1 E2-E3 D1-D2 A1-B1 B1-C1 E2-F2 G4-G5 D1-E1 A2-B2 B3-B4 D2-D3 B4-C4 A1-A2 A4-A5 C4-D4 A4-B4 B4-B5 F3-F4 F4-G4 D3-D4 E1-E2 E3-F3 F5-G5 E1-F1 F2-G2 F1-G1 G1-G2 B2-B3 F4-F5 A5-B5 B3-A3 B5-C5 F5-E5 G2-G3",
    "B4 A5 G5 G1 F4",
    "E1 D1 D2 G4",
    "留意内外两种绕行方向。封住一侧后，从另一侧缩小包围，不要跟着兜圈。",
    "B3 B5 F5 G2",
    60,
    "A3 C5 E5 G3",
  ),
  street(
    36,
    "接应路线",
    "B1-B2 F1-G1 C4-C5 A4-B4 C3-C4 C4-D4 C1-D1 B1-C1 F1-F2 F2-G2 A2-B2 E2-F2 B3-C3 B3-B4 B2-B3 A5-B5 D1-D2 D2-E2 A1-B1 D4-D5 B5-C5 G1-G2 A4-A5 A1-A2 C5-D5 A2-A3 G2-G3 D4-E4 C3-C2",
    "A1 G1 D5 C4 B4",
    "D2 A4 D1 A5",
    "出口都守住还不算抓获。观察剩下的安全街道，推进时给同伴留好位置。",
    "A2 G2 D4 C3",
    40,
    "A3 G3 E4 C2",
  ),
  street(
    37,
    "并行追逃",
    "A2-B2 D1-D2 E3-F3 B1-C1 B1-B2 D2-D3 A2-A3 D4-E4 C4-C5 F5-G5 E4-E5 F4-F5 C1-C2 E5-F5 C2-D2 A3-A4 B4-B5 F4-G4 E3-E4 A4-B4 F2-F3 D1-E1 E1-E2 C3-D3 E2-F2 F1-F2 C4-D4 G4-G5 B2-C2 E1-F1 B5-C5 C3-C4 G4-G3 F2-G2 B2-B3 B5-A5",
    "F4 F1 B1 B4 G5",
    "A4 E4 E5 E3 C3",
    "先看清出口前的岔路，再从另一侧逼近；追着脚印跑，会被突围队员带进回环。",
    "G4 F2 B2 B5",
    65,
    "G3 G2 B3 A5",
  ),
  street(
    38,
    "回环交织",
    "F3-F4 C5-D5 B1-B2 G1-G2 F1-G1 A2-A3 B3-B4 D1-D2 F3-G3 E2-E3 A2-B2 D3-E3 D2-E2 D5-E5 C4-C5 E3-E4 E2-F2 A4-B4 B3-C3 B1-C1 E4-E5 C3-D3 A3-A4 E4-F4 G2-G3 A3-B3 F1-F2 B4-C4 F2-F3 C1-D1 B4-B5 C3-C2 F1-E1 E4-D4",
    "A4 D3 F2 E3 D5",
    "A2 D2 G3 B1 C5",
    "两段看着相邻的路可能要绕远。先比较沿街距离，再决定由谁截住前方。",
    "B4 C3 F1 E4",
    40,
    "B5 C2 E1 D4",
  ),
  street(
    39,
    "远端调度",
    "E1-E2 F2-F3 E2-E3 C4-C5 D1-E1 D3-D4 A4-B4 F1-F2 F3-F4 D2-E2 C3-D3 A3-A4 F4-G4 C3-C4 C5-D5 D2-D3 C1-D1 F1-G1 B3-C3 G1-G2 B2-B3 B4-C4 E3-F3 B4-B5 G2-G3 B1-B2 B1-C1 A3-B3 D4-D5 G3-G4 B5-C5 B5-A5 F4-F5 B1-A1 C3-C2",
    "C5 F3 B2 B3 D2",
    "E1 F2 A3 G2 G1",
    "突围队员会在堵口后改选出口。分开指挥，别让全队挤在同一条路上。",
    "B5 F4 B1 C3",
    60,
    "A5 F5 A1 C2",
  ),
  street(
    40,
    "步步压缩",
    "E4-F4 F3-F4 B4-B5 E3-F3 C1-C2 B2-B3 D1-E1 C5-D5 C1-D1 F2-F3 C2-C3 F2-G2 B3-B4 C3-D3 D4-E4 D3-E3 G2-G3 B2-C2 E1-F1 B5-C5 E4-E5 E3-E4 D4-D5 F3-G3 F1-F2 D5-E5 F2-E2 E5-F5 F4-G4 B3-A3",
    "F1 D5 E4 B2 G3",
    "D4 C5 C3 E3 D3",
    "直奔最近的突围队员容易丢掉侧翼；先控制能连接几条街的路口。",
    "F2 E5 F4 B3",
    40,
    "E2 F5 G4 A3",
  ),
  street(
    41,
    "六环迷局",
    "C2-D2 E4-F4 A4-B4 B3-C3 E1-E2 F4-G4 D1-E1 E2-E3 A3-A4 E2-F2 C4-C5 B5-C5 D5-E5 C5-D5 A3-B3 D2-E2 E3-E4 C3-C4 C2-C3 C1-D1 E5-F5 F5-G5 A5-B5 F1-F2 G4-G5 E1-F1 A4-A5 C1-C2 B3-B4 F4-F5 B3-B2 F4-F3 F2-G2 D2-D3",
    "B4 G4 E2 C2 F5",
    "C5 E5 C4 A5 C1",
    "留意内外两种绕行方向。封住一侧后，从另一侧缩小包围，不要跟着兜圈。",
    "B3 F4 F2 D2",
    40,
    "B2 F3 G2 D3",
  ),
  street(
    42,
    "围捕接力",
    "C3-D3 D1-D2 F1-G1 C4-D4 B1-B2 E4-E5 D2-D3 G1-G2 C1-D1 D5-E5 G2-G3 B1-C1 D4-D5 E4-F4 A1-B1 E1-F1 F4-G4 D1-E1 A2-B2 C5-D5 D3-D4 D3-E3 C4-C5 A1-A2 C3-C4 G3-G4 E3-E4 A2-A3 E5-F5 F4-F3 C4-B4",
    "B2 D5 E4 D4 D3",
    "C1 E3 D1 G1 F1",
    "出口都守住还不算抓获。观察剩下的安全街道，推进时给同伴留好位置。",
    "A2 E5 F4 C4",
    60,
    "A3 F5 F3 B4",
  ),
  street(
    43,
    "密巷逃亡",
    "C2-C3 C1-D1 A3-A4 E4-F4 B5-C5 A2-B2 E3-F3 F2-G2 F2-F3 A5-B5 C4-D4 B2-C2 B1-B2 F3-G3 C3-D3 A2-A3 D3-E3 F3-F4 A4-A5 D1-D2 C5-D5 B1-C1 D3-D4 E4-E5 G2-G3 D5-E5 C3-C4 C2-D2 E3-E4 F2-F1 B2-B3 E3-E2 C4-B4",
    "F3 A2 D3 D4 E4",
    "A4 G3 A3 A5 D5 D2",
    "先看清出口前的岔路，再从另一侧逼近；追着脚印跑，会被突围队员带进回环。",
    "F2 B2 E3 C4",
    55,
    "F1 B3 E2 B4",
  ),
  street(
    44,
    "各守一方",
    "F3-F4 E3-E4 B2-C2 E4-E5 D5-E5 F4-F5 D1-D2 E5-F5 C3-D3 A2-B2 B4-C4 C4-D4 C3-C4 E1-E2 A4-B4 A3-A4 D4-D5 D1-E1 A2-A3 C2-D2 E2-F2 E1-F1 D2-D3 E2-E3 F1-F2 E3-F3 D3-D4 C4-C5 D1-C1 F3-G3 F1-G1",
    "D4 D2 F4 F2 B2",
    "C2 E5 F5 A4 E2 A3",
    "两段看着相邻的路可能要绕远。先比较沿街距离，再决定由谁截住前方。",
    "C4 D1 F3 F1",
    50,
    "C5 C1 G3 G1",
  ),
  street(
    45,
    "分区合击",
    "D2-E2 A3-A4 E4-F4 B3-B4 A3-B3 D3-E3 D1-D2 E2-F2 E3-E4 C1-D1 C2-C3 A1-B1 F3-F4 C3-D3 C3-C4 F2-F3 A1-A2 D4-E4 B1-C1 B3-C3 B4-C4 A2-A3 A4-B4 C4-D4 C1-C2 D4-D5 C2-B2 B4-B5 F4-F5 E2-E3",
    "C4 C1 B3 F3 A4",
    "A1 A2 D2 E2 D3 A3",
    "出口封好仍会留下内圈回路。看准突围队员走向，把一名守卫向内换防，再从另一侧合围。",
    "D4 C2 B4 F4",
    25,
    "D5 B2 B5 F5",
    [{ cop: 1, label: "C3", after: 0, at: 12 }],
  ),
  street(
    46,
    "街区迷阵",
    "C5-D5 D1-E1 A3-B3 E3-F3 F1-F2 G1-G2 E5-F5 E1-F1 D5-E5 C3-D3 B2-C2 A1-A2 F4-F5 E1-E2 E2-E3 C1-D1 B5-C5 B2-B3 D3-E3 A4-A5 A5-B5 A3-A4 F3-F4 B1-C1 C4-C5 F2-G2 A1-B1 C2-C3 C3-C4 A2-B2 B3-C3 F1-G1 B3-B4 G2-G3 F5-G5 C2-D2 A2-A3",
    "C3 F2 F4 B2 E5",
    "C4 C5 B1 E1 A2 A1",
    "出口封好仍会留下内圈回路。看准突围队员走向，把一名守卫向内换防，再从另一侧合围。",
    "B3 G2 F5 C2",
    35,
    "B4 G3 G5 D2",
    [{ cop: 3, label: "C3", after: 0, at: 12 }],
  ),
  street(
    47,
    "最后的缺口",
    "C2-D2 F2-G2 E5-F5 E1-F1 G3-G4 E3-E4 F3-G3 C1-D1 C5-D5 G1-G2 C1-C2 C4-D4 D3-E3 A4-B4 F4-G4 D2-D3 F1-G1 C3-C4 D1-E1 E4-F4 C2-C3 C4-C5 F4-F5 B3-B4 B3-C3 A3-A4 F2-F3 A3-B3 D3-D4 D5-E5 D1-D2 F5-G5 A4-A5 D2-E2 C1-B1",
    "F4 A3 D1 C2 F1",
    "F2 E4 G1 E1 G2 F3",
    "留意内外两种绕行方向。封住一侧后，从另一侧缩小包围，不要跟着兜圈。",
    "F5 A4 D2 C1",
    45,
    "G5 A5 E2 B1",
  ),
  street(
    48,
    "全城，合围！",
    "E2-F2 C2-C3 A3-A4 F4-F5 D1-D2 E3-F3 D1-E1 F3-F4 A2-A3 E1-E2 E2-E3 E4-F4 F3-G3 B2-C2 D4-D5 C3-D3 A4-B4 B4-B5 B5-C5 A2-B2 F2-G2 B3-C3 D2-D3 C5-D5 E5-F5 G2-G3 E3-E4 D5-E5 B2-B3 D4-E4 C2-C1 G2-G1 B4-C4 F4-G4",
    "B2 F2 B5 F5 G3",
    "A2 E5 D5 B3 E2 D1",
    "出口都守住还不算抓获。观察剩下的安全街道，推进时给同伴留好位置。",
    "C2 G2 B4 F4",
    50,
    "C1 G1 C4 G4",
  ),
];

// Seeded street networks: a connected spanning tree, then independent cross streets.
// The 100 layouts in each mode have distinct edge sets, rather than cosmetic rotations.
export const MODES = [
  { id: "challenge", name: "街区挑战", description: "固定同时起步 · 100 个有解局面，挑战合围与突围技巧" },
  { id: "classic", name: "自由追逐", description: "无出口 · 追逐队须限时合围全部成员，突围队坚持到计时结束获胜" },
  { id: "escape", name: "出口竞速", description: "开放出口 · 突围任意一人或坚持到计时结束获胜，追逐队须全部合围" },
];
const LAYOUT_VARIANTS = {"classic:4":1,"classic:7":1,"classic:13":1,"classic:14":11,"classic:15":11,"classic:16":4,"classic:18":7,"classic:19":2,"classic:35":1,"escape:5":2,"escape:7":2,"escape:12":4,"escape:13":2,"escape:14":2,"escape:15":1,"escape:16":6,"escape:17":11,"escape:18":13,"escape:19":13,"escape:20":4,"escape:36":1,"escape:38":1,"escape:39":1};
function generatedLevel(id, mode, variant = LAYOUT_VARIANTS[`${mode}:${id}`] || 0) {
  let seed = id * 104729 + variant * 65537 + (mode === "classic" ? 1907 : mode === "escape" ? 3793 : 9011);
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const tier = Math.floor((id - 1) / 20);
  const cols = 4 + tier, rows = 3 + Math.floor(tier / 2);
  const nodes = Array.from({length: cols * rows}, (_, i) => ({x:80 + i % cols * 840 / (cols - 1), y:80 + Math.floor(i / cols) * 440 / (rows - 1)}));
  const candidates = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const a = y * cols + x;
    if (x + 1 < cols) candidates.push([a, a + 1]);
    if (y + 1 < rows) candidates.push([a, a + cols]);
  }
  for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
  const parent = nodes.map((_,i)=>i), root = i => parent[i] === i ? i : (parent[i] = root(parent[i]));
  const edges = [], spare = [];
  for (const [a,b] of candidates) { if(root(a)!==root(b)){ parent[root(a)] = root(b); edges.push([a,b]); } else spare.push([a,b]); }
  edges.push(...spare.slice(0, 1 + tier * 2));
  const copCount = 3 + Math.floor(tier / 2), robberCount = 1 + Math.floor(tier / 2);
  let cops = Array.from({length:copCount}, (_,i)=>i);
  let robbers = Array.from({length:robberCount}, (_,i)=>nodes.length-1-i);
  const exits = mode === "classic" ? [] : [cols-1, nodes.length-cols, ...(tier > 2 ? [Math.floor(rows/2)*cols] : [])];
  const adjacency=nodes.map(()=>[]);for(const[a,b]of edges){adjacency[a].push(b);adjacency[b].push(a);}
  const openAround = blocked => {
    const start=nodes.findIndex((_,i)=>!blocked.includes(i)),visited=new Set([start]),queue=[start];
    for(const node of queue)for(const next of adjacency[node])if(!blocked.includes(next)&&!visited.has(next)){visited.add(next);queue.push(next);}
    return visited.size===nodes.length-blocked.length;
  };
  if (mode === "classic") {
    robbers=[];
    for(const node of nodes.map((_,i)=>i).reverse()) {
      if(!cops.includes(node)&&!robbers.some(other=>adjacency[node].includes(other))&&openAround([...robbers,node]))robbers.push(node);
      if(robbers.length===robberCount)break;
    }
    if(robbers.length!==robberCount)throw new Error(`无法配置可绕行的突围队出生点 ${id}`);
  }
  if (mode === "escape") {
    const distances = nodes.map((_,i)=>nodes.map((__,j)=>i===j?0:Infinity));
    for(const [a,b] of edges) distances[a][b]=distances[b][a]=Math.hypot(nodes[a].x-nodes[b].x,nodes[a].y-nodes[b].y);
    for(let k=0;k<nodes.length;k++)for(let i=0;i<nodes.length;i++)for(let j=0;j<nodes.length;j++)distances[i][j]=Math.min(distances[i][j],distances[i][k]+distances[k][j]);
    const free = nodes.map((_,i)=>i).filter(i=>!exits.includes(i));
    cops = [];
    for(const exit of exits) cops.push(free.filter(i=>!cops.includes(i)).sort((a,b)=>distances[a][exit]-distances[b][exit])[0]);
    while(cops.length<copCount) cops.push(free.filter(i=>!cops.includes(i)).sort((a,b)=>Math.min(...cops.map(c=>distances[b][c]))-Math.min(...cops.map(c=>distances[a][c])))[0]);
    const margin = node => Math.min(...exits.map(exit=>distances[node][exit]/(108+tier*3)+1.2-2-Math.min(...cops.map(c=>distances[c][exit]/(102+tier*4)))));
    robbers=[];
    for(const node of free.filter(i=>!cops.includes(i)).sort((a,b)=>margin(b)-margin(a))) {
      if(!robbers.some(other=>adjacency[node].includes(other))&&openAround([...robbers,node]))robbers.push(node);
      if(robbers.length===robberCount)break;
    }
    if(robbers.length!==robberCount)throw new Error(`无法配置可绕行出口地图 ${id}`);
  }
  return {id, mode, name:`${mode === "classic" ? "环路追逐" : mode === "escape" ? "多口突围" : "深巷挑战"} ${id}`,
    chapter:Math.min(7,Math.floor((id-1)/13)), nodes,edges,cops,robbers,exits,
    policeSpeed:102 + tier * 4, robberSpeed:108 + tier * 3,
    timeLimit:120, par:Math.max(35,85-tier*10),
    hint:`${edges.length-nodes.length+1} 条环路，${nodes.length} 个路口。${mode === "classic" ? "利用岔路换向，合围方要分头截击。" : "出口牵制与内圈包抄需要同时兼顾。"}`,
    guarantee:"未证明任一方必胜", solution:[], redeploy:[]};
}
const CHALLENGE_EXTENSIONS = [{"base":29,"nodes":[{"x":920,"y":168}],"edges":[[11,30]]},{"base":32,"nodes":[],"edges":[[8,2]],"robbers":[1,14,25,24,5,0]},{"base":34,"nodes":[{"x":920,"y":344}],"edges":[[21,29]],"robbers":[22,13,18,27,23,19]},{"base":35,"nodes":[{"x":680,"y":520},{"x":200,"y":520},{"x":320,"y":256},{"x":920,"y":168}],"edges":[[29,31],[26,32],[14,33],[12,34]],"robbers":[4,3,9,24,5,7]},{"base":36,"nodes":[{"x":920,"y":168},{"x":440,"y":256}],"edges":[[12,26],[15,27],[20,27]],"robbers":[9,17,3,22,2,4]},{"base":39,"nodes":[{"x":560,"y":344},{"x":200,"y":520}],"edges":[[24,31],[27,32]],"robbers":[4,11,13,12,6,19]},{"base":42,"nodes":[{"x":560,"y":520}],"edges":[[25,27]],"robbers":[2,14,3,6,5,9]},{"base":47,"nodes":[{"x":680,"y":520}],"edges":[[29,31]]},{"base":35,"nodes":[{"x":200,"y":520},{"x":680,"y":520},{"x":320,"y":256}],"edges":[[26,31],[29,32],[14,33]],"robbers":[4,3,9,24,5,17]},{"base":30,"nodes":[{"x":680,"y":520}],"edges":[[22,24]],"robbers":[10,2,8,12,6,7]},{"base":36,"nodes":[{"x":440,"y":256}],"edges":[[15,26]],"robbers":[9,17,3,22,1,2]},{"base":35,"nodes":[{"x":920,"y":168},{"x":200,"y":520},{"x":320,"y":256}],"edges":[[12,31],[26,32],[14,33]],"robbers":[4,3,9,24,16,1]},{"base":36,"nodes":[{"x":440,"y":256}],"edges":[[20,26]],"robbers":[9,17,3,22,1,2]},{"base":36,"nodes":[{"x":440,"y":256}],"edges":[[20,26],[15,26]],"robbers":[9,17,3,22,1,23]},{"base":39,"nodes":[{"x":200,"y":520}],"edges":[[27,31]],"robbers":[4,11,13,12,6,5]},{"base":36,"nodes":[{"x":920,"y":168},{"x":440,"y":256}],"edges":[[12,26],[20,27]],"robbers":[9,17,3,22,24,2]},{"base":35,"nodes":[{"x":680,"y":520}],"edges":[[29,31]],"robbers":[4,3,9,24,7,17]},{"base":36,"nodes":[{"x":440,"y":256},{"x":920,"y":168}],"edges":[[15,26],[12,27]],"robbers":[9,17,3,22,10,24]},{"base":35,"nodes":[{"x":200,"y":520},{"x":920,"y":168},{"x":920,"y":256},{"x":920,"y":344},{"x":920,"y":432},{"x":920,"y":520},{"x":800,"y":520},{"x":680,"y":520}],"edges":[[26,31],[12,32],[32,33],[33,34],[34,35],[35,36],[36,37],[37,38],[38,29]],"robbers":[4,3,9,24,2,7]},{"base":39,"nodes":[{"x":560,"y":344}],"edges":[[24,31]],"robbers":[4,11,13,12,6,10]},{"base":35,"nodes":[{"x":920,"y":168},{"x":200,"y":520}],"edges":[[12,31],[26,32]],"robbers":[4,3,9,24,0,5]},{"base":36,"nodes":[{"x":920,"y":168}],"edges":[[12,26]],"robbers":[9,17,3,22,10,4]},{"base":32,"nodes":[{"x":920,"y":344}],"edges":[[21,28],[8,2]],"robbers":[1,14,25,24,6,10]},{"base":35,"nodes":[{"x":920,"y":168},{"x":200,"y":520},{"x":320,"y":520},{"x":440,"y":520},{"x":560,"y":520},{"x":680,"y":520}],"edges":[[12,31],[26,32],[32,33],[33,34],[34,35],[35,36],[36,29]],"robbers":[4,3,9,24,16,1]},{"base":35,"nodes":[{"x":920,"y":168},{"x":680,"y":520}],"edges":[[12,31],[29,32]],"robbers":[4,3,9,24,16,2]},{"base":35,"nodes":[{"x":320,"y":256},{"x":200,"y":520},{"x":320,"y":520},{"x":440,"y":520},{"x":560,"y":520},{"x":680,"y":520}],"edges":[[14,31],[26,32],[32,33],[33,34],[34,35],[35,36],[36,29]],"robbers":[4,3,9,24,1,17]},{"base":32,"nodes":[{"x":920,"y":344}],"edges":[[21,28]],"robbers":[1,14,25,24,16,11]},{"base":35,"nodes":[{"x":680,"y":520},{"x":320,"y":256}],"edges":[[29,31],[14,32]],"robbers":[4,3,9,24,22,21]},{"base":35,"nodes":[{"x":680,"y":520},{"x":200,"y":520},{"x":920,"y":168}],"edges":[[29,31],[26,32],[12,33]],"robbers":[4,3,9,24,2,19]},{"base":35,"nodes":[{"x":200,"y":520},{"x":320,"y":256},{"x":920,"y":168},{"x":920,"y":256},{"x":920,"y":344},{"x":920,"y":432},{"x":920,"y":520},{"x":800,"y":520},{"x":680,"y":520}],"edges":[[26,31],[14,32],[12,33],[33,34],[34,35],[35,36],[36,37],[37,38],[38,39],[39,29]],"robbers":[4,3,9,24,19,17]},{"base":35,"nodes":[{"x":200,"y":520},{"x":680,"y":520}],"edges":[[26,31],[29,32]],"robbers":[4,3,9,24,21,1]},{"base":35,"nodes":[{"x":920,"y":168},{"x":320,"y":256},{"x":200,"y":520},{"x":320,"y":520},{"x":440,"y":520},{"x":560,"y":520},{"x":680,"y":520}],"edges":[[12,31],[14,32],[26,33],[33,34],[34,35],[35,36],[36,37],[37,29]],"robbers":[4,3,9,24,16,15]}];
export const LEVELS = [...AUTHORED_LEVELS, ...CHALLENGE_EXTENSIONS.map((spec,index)=>{
  const base=AUTHORED_LEVELS[spec.base-1],id=index+49;
  return {...base,id,name:`深巷合围 ${id}`,chapter:Math.min(7,Math.floor((id-1)/13)),
    robbers:spec.robbers || base.robbers,
    nodes:[...base.nodes.map(node=>({...node,x:80+(node.x-80)/140*120,y:80+(node.y-80)/110*88})),...spec.nodes],edges:[...base.edges,...spec.edges],
    briefing:"分头抢占出口，再深入新增岔路，及时补上同伴留下的缺口。",par:Math.max(25,base.par-5)};
}), ...FINAL_CHALLENGES].map(level=>({...level,chapter:Math.min(7,Math.floor((level.id-1)/13)),mode:"challenge",timeLimit:180,guarantee:"已验证追逐队解法"}));
const MODE_LEVELS = {challenge:LEVELS, classic:Array.from({length:100},(_,i)=>generatedLevel(i+1,"classic")), escape:Array.from({length:100},(_,i)=>generatedLevel(i+1,"escape"))};
export function getLevels(mode = "challenge") { return MODE_LEVELS[mode] || LEVELS; }
