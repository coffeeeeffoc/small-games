# Night Overwatch 飞行作战改造

**Goal:** 按用户确认的三面效果图实现机载三维作战、炮弹提前量、多处威胁及全屏/暂停/稳定文字。

**Architecture:** 沿用 Cocos Creator 3.8.8 和纯 TypeScript 模拟。World、HUD 和 Effects 使用共同的飞机位置、地形高度和真实弹道。无新增依赖。

## 设计基准

用户确认 games/local/night-overwatch/docs/design/flight-concepts.png，并要求严格对照。默认黄昏、远丘天际线、连绵低山田地/村落/林地、左上机身炮口、左侧飞行控制、右上全屏/暂停、底部三武器和开火。暂停采用深石墨卡片、圆暂停图标、状态摘要、突出继续按钮、次级控制。

飞机默认盘旋，可反向、升降、调整轨道距离；传感器可旋转。发射点固定机体，按斜距/速度/重力计算轨迹和时间，地形可截住炮弹，目标移动需提前量。24个敌人及4组友军分散；护送且清完全部威胁才成功。目标文字固定锚点，不随悬浮换边。

## 角色分工

1. 核心规则：Data.ts、Simulation.ts、Flight.ts、核心测试。
2. 地图镜头：World.ts、CameraMath.ts及测试。
3. 界面：HUD.ts、Actions.ts。
4. 主集成：Overwatch.ts、Effects.ts、构建与截图对照。
5. 独立验收：flight-browser.mjs及4个旧浏览器测试。
6. 三维资产：本地Blender5.2.1制作并保存源模型/导出运行网格，AircraftModel.ts实际接入。当前会话未提供Hyper3D工具。

## 验证

核心/相机可运行测试、Cocos类型检查、实际Web Mobile与Desktop构建；源哈希核对。真实键鼠/触控、全屏API进出、旋转/高度/距离对瞄准和弹着的影响、暂停恢复、双指取消、标签稳定、完整任务与遗漏威胁检查；1366×768及844×390、窄横屏。根check:games与git diff --check。

## 工作区恢复

00:13:57 main遭外部reset HEAD与checkout main，已暂停全部角色并迁移幸存修改至本聊天managed worktree，分支codex/night-overwatch-flight。五个浏览器测试保持QA独占；原工作区不清理。效果图从生成工具原文件恢复，主集成定向恢复。不会自动提交、推送或部署。

## 完成证据

最终源/双构建/大厅包哈希为 `88d689954c6554f34286aed4e90f341dcc15ac1ce645ba28cc694e6fc3ecab8b`。27项核心/相机/资产检查、类型检查、双目标构建、四视口交互、全屏与嵌入大厅验收通过。独立QA桌面和触控完整回放均128.02秒成功、24击毁、8友军全活、零友伤；漏1炮台时车队已到达仍185秒超时失败。连续10次失败重试通过。真实tab后台在本机自动化环境未观察到，合成blur/focus与真实全屏结果分别记录。详细当前结果见 `games/local/night-overwatch/docs/STATUS.md` 及 `docs/verification.json`。
