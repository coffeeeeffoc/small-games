# 灰烬防线 / ASHFALL FRONT

Creator 3.8.8 原生节点横版射击战役：保留原3个关卡ID，新增20关，共23关。每关5–7处中继阵地，持续交战、争夺接通、推进出口；击杀经验三选一成长，免费选择可持续继续。工业场景和角色由原美术离线烘焙，运行不调用旧Canvas/WebView。

## 运行

仓库根目录使用 Node 24.21.0、pnpm 12.6.0：

```sh
pnpm --filter @coffeeeeffoc/ashfall-front dev
pnpm --filter @coffeeeeffoc/ashfall-front build
pnpm --filter @coffeeeeffoc/ashfall-front test
pnpm --filter @coffeeeeffoc/ashfall-front test:browser
pnpm --filter @coffeeeeffoc/ashfall-front typecheck
pnpm --filter @coffeeeeffoc/ashfall-front package:taptap # Windows PowerShell/.NET
```

开发入口为 `http://localhost:4467`；构建产物在 `dist/`。浏览器检查可通过 `PLAYWRIGHT_EXECUTABLE_PATH` 指定 Chromium。

左下摇杆控制左右移动与上下攀梯；右下射击摇杆拖动控制360度射击方向，跳跃和冲刺位于右手操作区。未指定瞄准方向时沿角色朝向水平射击。A/D或左右方向键移动，W/S或上下方向键攀梯，空格跳跃，Shift冲刺，I斜上、J水平、K斜下射击；鼠标可自由瞄准。快速松手保留已接受的一发及方向，取消单指只释放该触点，暂停/失焦清除全部输入。Creator landscape适配负责竖持整页旋转及输入映射；没有浏览器全屏控件。844×390、568×320和390×844是验收尺寸。

TapTap 采用 H5 游戏上架方式：官方上传工具接收 `dist/` 目录，手工上传使用 `package:taptap` 生成的 ZIP，入口为唯一顶层目录下的 `dist/index.html`，后台横屏参数为 `screenOrientation: 2`。包体、操作与提交流程见 [TapTap H5 上架说明](docs/deployment/taptap-h5.md)；后台上传、审核和手机 TapTap WebView 验收尚未执行。

正常通关解锁后续战区，刷新保留进度。每次行动重新选择改装；仅从首关完成全部战区计入最佳时间。`?dev=1` 使用仓库公共开发面板，跳关、补血均标记试玩，不写入正常奖励。只读快照不改变游戏状态。

暂停页突出继续战斗，帮助/设置独立返回，重开/离开需确认；失败页重试本关或返回主页。重试保留当前战区与已获得改装，不计无重试的最佳时间。普通守军随路段进入视野激活，各阵地仍按序接通，Boss保留前置条件；增援从前方进入，远离当前阵地不再积压后方增援。

每处中继路段包含地下通道、攀梯平台和装甲炮台。非Boss敌人在首次开火前保留至少1点生命，并显示迎击护盾；开火后可正常击杀。完成全部中继、击败本关拆解者并清场后，右侧出口开放，到达出口才结算与解锁。地图箱子和击杀掉落可获得散弹枪、三连发、喷火枪、机关枪、小型炮及加特林，弹药耗尽后恢复无限弹步枪。

击杀积累经验，升级时暂停战斗，提供两个免费增益和一个需完整观看广告的超载强化。主动补给回复40生命并装备机关枪160发；失败续战恢复50%生命，二者各限每次战区行动一次。仅公共`SmallGamesRewardAds`严格completed发奖；辅助行动可解锁关卡，不计最佳。隐藏仅暂停，pagehide/重开/回主页使旧请求失效。2026-10-27用户确认TapTap应用1000862，Developer492506，替代旧998795映射；MCP当次确认广告生效，但方向读取失败，未返回广告位。根配置保留用户手填1054323，归属待核实，当前批次未选择本游戏；无SDK仍可免费游玩。详见[广告核对记录](../../../docs/operations/taptap-rewarded-ads.md#五款应用核对与-mcp-阻塞2026-10-27)。

`window.Ashfall.snapshot()`全模式只读，含ready/creator/screen/run/controls；controls坐标为CSS像素，供真实Creator触控测试。`window.Ashfall.dev(action,value)`仅公共dev开启存在，修改均隔离为试玩。`scripts/prepare.mjs`同步纯规则与meta，`scripts/build.mjs`调用真实Creator，`ASHFALL_FRONT_PREBUILT_DIR`须包含源码匹配dist和cc.d.ts；指纹包含共享奖励/开发模式/工具链与离线烘焙源。首次导入生成meta若改变输入须重建，不标记旧制品有效。

源码指纹统一 SVG 等文本输入的 LF/CRLF 换行，保证 Windows Creator 制品可在 Linux Pages 校验；文本实际内容与二进制字节仍参与校验。修改指纹实现后须用 Creator 重新生成制品，不能只修改制品记录。

## 结构与验证

- `src/core.mjs`：与 DOM 无关的固定步长规则、伤害、碰撞、升级和结算。
- `src/weapons.mjs`：七种枪械配置，包括射速、散布、连发、火焰穿透、炮弹爆炸、预热和弹药。
- `src/levels.mjs`：稳定关卡 ID、地形、波次、奖励、解锁与内容校验。
- `src/render.mjs`：仅离线美术源，由`scripts/bake-art.mjs`输出27张PNG，发行运行不导入。
- `assets/scripts/Ashfall.ts`、`FrontView.ts`：Creator页面、Sprite/Graphics/Label、多点输入、AudioSource与生命周期。
- `src/host.mjs`、`progress.mjs`：Game Host 兼容存储端口、存档校验及内存降级。
- `src/rewards.mjs`：奖励资格、当前局/关身份、严格完成及幂等。
- `tests/`：规则、存档与生产构建真实多点触控流程。

产品方案、实施前效果图见 [docs/design](docs/design/design.md)。实际浏览器截图与结果见 [docs/qa](docs/qa/verification.md)。本次交付 H5 独立入口及 Shell iframe；桌面 Chromium 的手机模拟不代表物理设备或原生小游戏平台验收。

本轮方案及已审四页概念图见[战役方案](docs/design/cocos-campaign.md)。上架资料入口：[publishing/STATUS.md](publishing/STATUS.md)。六尺寸真实Creator触控及SDK夹具结果、当前媒体与正式广告阻塞均见上述记录。推送不表示CI、平台审核或真机验收通过。

2026-10-25 控件与遭遇修正：[设计与效果图](docs/design/controls-2026-10-25.md)、[当时验证与画面](docs/qa/controls-2026-10-25/verification.md)。

2026-10-26 双拇指分区与主题图标：[操作布局](docs/design/two-thumb-controls.svg)、[当时验证与画面](docs/qa/two-thumb-controls/verification.md)。

2026-10-27 战斗、地下路径与双摇杆改版：[设计](docs/design/combat-expansion-2026-10-27.md)、[验证](docs/qa/combat-expansion/verification.md)。
