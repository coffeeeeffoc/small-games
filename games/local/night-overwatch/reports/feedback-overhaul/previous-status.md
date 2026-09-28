# 当前状态 · 2026-09-29 飞行作战改造

按已确认的 [交互效果图](design/flight-concepts.png) 实现黄昏山谷、机舱炮口、飞行控制、常驻全屏与圆角暂停面板。沿用 Cocos Creator 3.8.8，无新增运行依赖。实际截图见 `reports/flight-overhaul/`；效果图不作为游戏截图或验收证据。

## 预览与代码

- 手机 H5 / Web Mobile：[localhost:4318](http://localhost:4318)
- Web Desktop：[localhost:4319](http://localhost:4319)
- 当前独立工作区的游戏大厅：[127.0.0.1:5174/#/games/night-overwatch](http://127.0.0.1:5174/#/games/night-overwatch)
- 工作区：`C:/Users/15211/.codex/worktrees/night-overwatch-flight/small-games`，分支 `codex/night-overwatch-flight`。

双目标导出及大厅内嵌包的源码哈希均为 `88d689954c6554f34286aed4e90f341dcc15ac1ce645ba28cc694e6fc3ecab8b`。未提交、推送或公网发布；原 F: 工作区保留，QA 的五个浏览器测试由 QA 独占维护。

## 已实现

- 战斗右上角可直接全屏，暂停使用深色圆角卡片、状态摘要、突出继续按钮及四个次级控制。
- 镜头安装于实际运动机体，盘旋产生连续透视与前后景变化；观察旋转与飞机盘旋方向独立，高度和半径渐进变化。
- 炮弹从固定机体炮口出发，发射时冻结轨迹，按三维距离、武器速度与重力计算飞行；移动目标需要提前量，山坡可提前拦截炮弹。
- 24 个敌人及四组共 8 名友军分布于山坡、河道、道路、林地与村落。到达撤离区且威胁清零才成功；救援车或任一据点整组被毁会失败。
- 北向小地图支持真实鼠标/触控区域导航，并同步准星；手动巡视关闭自动跟随。飞行面板显示高度、斜距及弹着时间。
- 轻车等目标文字使用固定目标锚点，鼠标悬浮不再改变标签偏移。
- 本地 Blender 原创机舱已实际加载，2132 三角面，源 .blend、GLB、生成脚本及验证记录齐全。房屋/松树另有导出，但场景仍使用 World 的程序几何。未调用 Hyper3D，见 [素材台账](ASSETS.md)。

## 实测证据

| 检查 | 当前结果 |
| --- | --- |
| `node --test tests/*.test.ts`、类型检查 | 27/27，通过；含弹道、坡面拦截、据点失败、投影与地形拾取 |
| Web Mobile / Web Desktop | 实际 Creator 双目标构建及源码哈希核对，通过 |
| `flight-browser.mjs` | 1366×768、844×390；全屏、真实飞行投影、8 项飞行控制、小地图、长弹道、暂停冻结、标签及双指取消，通过 |
| `flight-browser.mjs --mission` | 桌面与触控均已真实操作完成：24 击毁、零友伤、8 名友军全活、128.02 秒 |
| `presentation.mjs`、`polish.mjs` | 1366×768、844×390、667×375、568×320；全屏、帮助、友伤提示、弹着、双指与旋屏，通过 |
| `h5.mjs` | 实际大厅 iframe、低高度、竖屏帮助、宿主全屏、全屏拒绝回退及模拟安全区，通过 |
| `smoke.mjs` | 双目标实际操作及画布尺寸，通过 |
| `lifecycle.mjs` | 合成 blur/focus 响应、飞机/炮弹冻结、输入恢复、真实全屏及连续 10 次失败重试，通过；真实后台事件未在本机自动化环境观察到 |
| `flight-browser.mjs --omission --desktop-only` | 车队已撤离、23 击毁、仅 1 个炮台存活、8 名友军全活、零友伤；185 秒超时失败，遗漏目标无法通关 |
| 根配置 / 差异检查 | 完整原工作区 `pnpm check:games`：39 游戏、0 配置问题；当前变更 `git diff --check` 通过 |

只读 `__night.snapshot()` 与 `__night.flightTime(point, weapon)` 用于观测和预测，浏览器回放通过真实鼠标、键盘、触控按钮完成，不修改模拟状态。手机回放使用放大及 30 次小地图巡视完成精瞄。历史失败的测试脚手架记录保存在 `reports/flight-overhaul/historical/`，最终结果按模式分别保存。

汇总见 [verification.json](verification.json)，具名证据及字节哈希见 [artifact-manifest.json](../reports/flight-overhaul/artifact-manifest.json)。独立 QA 四份报告：`interaction-results.json`、`mission-desktop-results.json`、`mission-touch-results.json`、`omission-desktop-results.json`，均位于 `reports/flight-overhaul/`。

## 性能与边界

本机 Chromium 四尺寸采样约 58–60fps，首次资源传输 3,752,338 bytes、加载约 2.4s；场景约 25 万三角面、79–108 draw calls。这是本机自动化采样，不能推断实体手机 GPU 性能。Web Mobile 目录 3,800,431 bytes，Desktop 3,800,766 bytes。

无运行异常或资源加载失败。Cocos 对不可取消的 touchcancel 调用 preventDefault 仍有控制台提示，实际取消和不粘连测试通过。小屏密集标签及机舱占屏仍需人工体验评估；可通过小地图与放大巡视。

尚未验证实体 Android/iPhone、Safari、真实安全区/系统手势、真实后台或来电、声音听感及新玩家学习成本。未进行公众试玩或发布质量打分。`POLISH.md` 中 2026-09-28 的评分和旧哈希仅为历史记录，不能套用于这次三维改造。
