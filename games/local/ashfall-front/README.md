# 灰烬防线 / ASHFALL FRONT

Creator 3.8.8 原生节点横版射击战役：保留原3个关卡ID，新增20关，共23关。每关5–7处中继阵地，持续交战、争夺接通、推进出口；五种局内改装耗尽后免费继续。工业场景和角色由原美术离线烘焙，运行不调用旧Canvas/WebView。

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

手机使用左右、跳跃、冲刺和射击按钮，支持多点同时操作。按住开火自动瞄准，拖动自由瞄准，松手/取消清除输入。A/D或方向键移动，空格/W跳跃，Shift冲刺，J自动连射、I斜上、K斜下，Esc暂停。Creator landscape适配负责竖持整页旋转及输入映射；没有浏览器全屏控件。844×390、568×320和390×844是验收尺寸。

TapTap 采用 H5 游戏上架方式：官方上传工具接收 `dist/` 目录，手工上传使用 `package:taptap` 生成的 ZIP，入口为唯一顶层目录下的 `dist/index.html`，后台横屏参数为 `screenOrientation: 2`。包体、操作与提交流程见 [TapTap H5 上架说明](docs/deployment/taptap-h5.md)；后台上传、审核和手机 TapTap WebView 验收尚未执行。

正常通关解锁后续战区，刷新保留进度。每次行动重新选择改装；仅从首关完成全部战区计入最佳时间。`?dev=1` 使用仓库公共开发面板，跳关、补血均标记试玩，不写入正常奖励。只读快照不改变游戏状态。

暂停补给恢复40%生命、失败续战恢复50%，各每关一次。仅公共`SmallGamesRewardAds`严格completed发奖；辅助行动可解锁关卡，不计最佳。隐藏仅暂停，pagehide/重开/回主页使旧请求失效。TapTap应用已确认998795，developer492506；2026-10-24平台查询未开通广告，无正式广告位，默认关闭，无SDK仍可免费游玩。

`window.Ashfall.snapshot()`全模式只读，含ready/creator/screen/run/controls；controls坐标为CSS像素，供真实Creator触控测试。`window.Ashfall.dev(action,value)`仅公共dev开启存在，修改均隔离为试玩。`scripts/prepare.mjs`同步纯规则与meta，`scripts/build.mjs`调用真实Creator，`ASHFALL_FRONT_PREBUILT_DIR`须包含源码匹配dist和cc.d.ts；指纹包含共享奖励/开发模式/工具链与离线烘焙源。首次导入生成meta若改变输入须重建，不标记旧制品有效。

## 结构与验证

- `src/core.mjs`：与 DOM 无关的固定步长规则、伤害、碰撞、升级和结算。
- `src/levels.mjs`：稳定关卡 ID、地形、波次、奖励、解锁与内容校验。
- `src/render.mjs`：仅离线美术源，由`scripts/bake-art.mjs`输出27张PNG，发行运行不导入。
- `assets/scripts/Ashfall.ts`、`FrontView.ts`：Creator页面、Sprite/Graphics/Label、多点输入、AudioSource与生命周期。
- `src/host.mjs`、`progress.mjs`：Game Host 兼容存储端口、存档校验及内存降级。
- `src/rewards.mjs`：奖励资格、当前局/关身份、严格完成及幂等。
- `tests/`：规则、存档与生产构建真实多点触控流程。

产品方案、实施前效果图见 [docs/design](docs/design/design.md)。实际浏览器截图与结果见 [docs/qa](docs/qa/verification.md)。本次交付 H5 独立入口及 Shell iframe；桌面 Chromium 的手机模拟不代表物理设备或原生小游戏平台验收。

本轮方案及已审四页概念图见[战役方案](docs/design/cocos-campaign.md)。上架资料入口：[publishing/STATUS.md](publishing/STATUS.md)。六尺寸真实Creator触控及SDK夹具结果、当前媒体与正式广告阻塞均见上述记录。推送不表示CI、平台审核或真机验收通过。
