# Ink Is Everything · 一滴墨，决定一切

纸墨风格的俯视动作冒险，当前正式内容只有第一章、六个房间。**墨汁就是生命**：受伤、射击、溅墨、绘桥和交易共用 `player.ink`；没有独立玩家 HP、金币或花墨治疗按钮。墨汁归零失败，主动消费必须至少留下 1 点。

## 运行与检查

在仓库根目录运行：

```sh
node games/local/ink-is-everything/server.mjs
node --test games/local/ink-is-everything/engine.test.mjs games/local/ink-is-everything/tests/*.test.mjs
node games/local/ink-is-everything/build.mjs
```

开发地址默认 `http://127.0.0.1:4412/`，支持 `--port`、`--host` 与 `/ink-is-everything/` 子路径。也可使用 `pnpm --filter @coffeeeeffoc/ink-is-everything dev`，将最后的 `dev` 改为 `test` 或 `build` 即运行对应任务。构建产物位于本游戏 `dist/`，无远程字体、图片或运行时依赖。

## 怎么玩

| 动作            | 触屏 / 场景操作                  | 键鼠补充         |
| --------------- | -------------------------------- | ---------------- |
| 移动            | 左下摇杆，或点地面走近           | WASD / 方向键    |
| 墨弹            | 按住墨弹自动瞄准，向外拖动改瞄准 | 按住场景中的敌人 |
| 干笔            | 按住免费近战按钮                 | F / 鼠标右键     |
| 溅墨            | 点击溅墨，攻击身边敌人           | Q                |
| 闪避            | 点击闪避，可与移动、攻击同时操作 | 空格             |
| 门、泉水、商人  | 走近后点场景物体或互动按钮       | E                |
| 绘桥            | 走近笔尖锚点，拖到对岸圆点       | 同样拖动         |
| 查看成长 / 暂停 | 暂停页中的装备 / 右上待选提醒    | Esc 暂停         |

初始 90/100 墨汁。墨弹消耗 6、伤害 8；溅墨消耗 14、范围伤害 14；免费干笔伤害 5。所有有效命中按**实际造成伤害的 25%**吸回墨汁，每次击杀再直接恢复 6。敌人墨滴、宝库与泉水也能补墨。

技能将消耗的 50% 留成墨滴：通常落在施法位置约 80–110 像素外，0.5 秒后可拾取，12 秒后干涸。玩家需真正移动并接近约 26 像素，不能站着连射自动收回。装备可改变返还比例与拾取范围；返还比例最高 80%，空放技能不能无限产墨。干笔与闪避免费，低墨时仍可通过反击恢复。

击杀获得经验，第一次升级需 12 经验，以后每级门槛增加 8；升级增加 8 墨汁上限、恢复 8，并提供装备选择。清场后装备留在地上的金色刻印中，不会自动吸附；走近后点刻印或「拾取装备」主动收进待选队列。升级与拾取都不打断战斗，右上金色提醒显示待选次数；玩家自行打开选择，允许关闭后稍后再选，仅打开选择页时暂停。六类装备均最多三阶，可加强伤害、吸取、容量、溅墨、闪避或回收。驿站商人用墨汁为装备升阶；墨囊每阶售价 24，上限增加 16 并立即恢复 16，购买净消耗 8 墨汁。

庭院北侧花 8 墨汁绘桥，可进书库获取 24 墨汁与装备。主线经守印长廊、洗笔驿站、断笔兵营，集齐两枚钥印后挑战墨之门。已清房间、奖励和桥不会重复刷新。

## 模块与 API

| 层         | 职责                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `content/` | `rules.mjs`、`skills.mjs`、`enemies.mjs`、`equipment.mjs` 定义公共内容；`chapters/` 只编排章节，`room-helpers.mjs` 提供声明助手 |
| `core/`    | 15 个独立模块处理状态、碰撞、战斗、敌人、资源、掉落、成长、交互与存档；不导入内容目录或访问 DOM                                 |
| `ui/`      | 12 个模块负责真实键鼠/多指输入、HUD、导航、装备选择、对话框、音频与本地存储                                                     |
| `render/`  | 10 个模块只读状态与章节几何，绘制角色、场景、墨滴、装备和反馈                                                                   |
| 根入口     | `engine.mjs` 解析章节并转接核心；`game.mjs` 启动 UI；`art.mjs`、`levels.mjs` 保留兼容导出                                       |

主页、选关、游玩及菜单统一横屏。手机关闭自动旋转、全屏被拒绝时，完整游戏容器旋转兜底，并映射场景、摇杆及瞄准坐标。Web 首页和暂停页提供全屏；原生小游戏宿主隐藏该入口。游玩只保留顶部墨汁生命条、等级/钥印、房间名和必要操作；帮助、成长与设置收在暂停页。近战和远程无需切换模式：按干笔免费近战吸墨，按墨弹耗墨远攻；墨汁不足时墨弹仍保持远程用途。

使用公开 API，不直接修改状态来完成游戏动作：

```js
import {
  createGame,
  command,
  step,
  getPlayerStats,
  getRewardChoices,
  getLevelDefinition,
  serializeGame,
  restoreGame,
} from './engine.mjs';

const game = createGame('chapter-1');
command(game, { type: 'start' });
step(game, { moveX: 1, moveY: 0, aimX: 650, aimY: 300, shoot: true }, 1 / 60);
command(game, { type: 'nova' });
const choices = getRewardChoices(game);
if (choices.length) command(game, { type: 'chooseReward', itemId: choices[0].id });
const stats = getPlayerStats(game); // 已计算装备与等级的实际数值
const saved = serializeGame(game);
const resumed = restoreGame(saved, getLevelDefinition(game));
```

其他合法命令为 `draw`（`bridgeId`）、`interact`（可选 `objectId`，也可为附近地面装备 ID）、`buy`（`itemId`）和 `restart`。命令返回 `{ok, message}`；待选奖励不阻断模拟或其他命令；界面只在玩家主动打开菜单时暂停。`getSnapshot` 返回状态副本，浏览器的 `window.__inkGame.snapshot()` 与 `worldToScreen()` 仅供只读验收。

## 新增章节：新增文件并注册

1. 在 `content/chapters/` 新建模块，以第一章为结构参考。公共敌人、技能、装备继续从公共目录提供，不粘贴进章节。
2. 在 `content/chapters/index.mjs` 导入新模块，加入 `definitions` 数组。注册器补齐公共规则，UI 自动列出章节。
3. 运行规则、架构、浏览器和构建检查。无需修改核心、界面或构建复制清单。

章节至少声明 `id/title/shortTitle/description/start/spawn/initial/requiredSeals/rooms`。`initial` 只有 `ink/maxInk`。房间可声明不同 `width/height/boundary`、目标 `objective/clearedObjective/clearMessage`、障碍、门、桥、物体、首波 `enemySpawns`、后续 `waves`，以及 `isFinal`。门通过 `target/spawn/requiresClear/requiresSeals/bridgeId` 表达通行条件。

清场奖励示例（第一章使用同一协议）：

```js
{
  objective: '清散守卫，取回钥印。',
  clearedObjective: '拾取中央金色刻印，再前往东门。',
  clearMessage: '装备与钥印已落地。',
  rewardPosition: { x: 480, y: 300 },
  clearReward: {
    ink: 8,
    seals: 1,
    gear: { pool: ['fine-nib', 'splash-sigil', 'swift-boots'], title: '守印战利品' },
  },
}
```

房间对象的 `reward` 使用相同奖励结构。新敌人可以复用公共 `behavior`：`melee/ranged/charger/boss`；新增行为才需要扩展核心与对应预警绘制。章节可覆盖公共规则、装备池和成长参数；`skills` 中的技能名称与数值会自动进入对应规则，`chapter.rules` 可作最终显式覆盖。独立测试章节可先 `resolveChapter(rawChapter)`，然后 `createGame(definition)`；未注册章节恢复时必须传入可信定义 `restoreGame(saved, definition)`。

`build.mjs` 自动递归复制 `core/ui/render/content` 的运行时文件，排除 tests、docs、dist 与测试脚本。因此新增章文件和嵌套运行模块不需要改构建列表。

## 存档与验收

存档使用本地 `localStorage` v3 键。定时、暂停和离开页面保存；恢复保留墨汁、装备、经验、待选奖励、敌人及尚未消失的技能墨滴。规则与几何从可信章节重建；v2 独立生命值存档不迁入本版。记录不上传、不跨设备同步，禁用存储仍可游玩。

启动服务后可运行：

```sh
node games/local/ink-is-everything/docs/playtest.mjs
node games/local/ink-is-everything/docs/playtest.mjs --pressure-only
node games/local/ink-is-everything/docs/touch-input.playtest.mjs
node games/local/ink-is-everything/docs/mobile-redesign.playtest.mjs
node games/local/ink-is-everything/docs/playtest-trade.mjs
node games/local/ink-is-everything/docs/playtest-balance.mjs
node games/local/ink-is-everything/docs/chapter-extension.playtest.mjs
```

`GAME_URL` 指定站点，`PLAYWRIGHT_MODULE`、`CHROMIUM_PATH` 可指定浏览器工具位置。规则测试覆盖单一墨池、吸取、回收守恒、装备升阶、奖励、存档及自定义章；架构测试检查模块边界与循环依赖。浏览器用真实鼠标、键盘和原生触摸事件通关，另验证低正墨恢复、多指取消、商店与续档。平衡脚本记录 30 秒站桩表现，仅是观察数据，不将站桩存活作为通过标准。

`chapter-extension.playtest.mjs` 只在测试 HTTP 响应中注册额外章节定义，验证自动章节选择、1200×720 房间、73/125 初始墨汁、3 枚钥印目标、移动与刷新恢复，不修改生产章节或游戏状态。正式内容仍只有第一章。当前证据记录在各 `docs/*report.json`；自动回归不等于真人趣味性、留存或时长验证，本次移动端改造效果图、浏览器截图及检查记录位于 `docs/design/mobile-2026-10-06/`；尚未做实体手机与 Safari 真机验收。
