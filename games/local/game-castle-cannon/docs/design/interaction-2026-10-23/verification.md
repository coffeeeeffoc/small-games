# 炮战交互优化与验证

沿用 `artillery-duel-2026-10-09` 的场景、石木 HUD 和手机横屏布局。本次是现有控件与规则的局部修复，没有新增主要页面或更换美术。

## 行为调整

- 移除炮台受击损坏和检修流程。炮手、建筑仍受伤，城毁仍撤向地堡；开火后只需等待普通炮 2.6 秒、地堡炮 3.3 秒冷却。冷却不因趴下、换位、治疗或再次受击而重置或停顿，按钮显示剩余秒数和进度条。
- 左右拖动与双方视角中的炮口方向一致，上拖抬高仰角；地堡本地预测使用同一射界限制。额外瞄准触点不抢占当前手势，禁用控件不穿透为拖动瞄准，触屏按钮禁止浏览器手势干扰。
- 修复 568×320 等小屏中透明 DOM 按钮文字换行溢出、拦截相邻按钮的问题。文本裁切在按钮边界内，点击范围与 Canvas 控件一致，完整无障碍标签保留。
- 保留真实路线换炮。点击城墙炮后立即高亮目标，显示剩余行走时间，相机跟随移动；重复点击同一炮位不重置路线。切炮、撤退和治疗会取消旧蓄力并收起望远镜。
- 重复回地堡不重启正在进行的治疗或重复扣医疗；自动撤离途中再请求治疗，会保留路线并在到达后治疗。
- 联网初始化失败、事件流不可用、旧版本或匹配停滞时静默进入本地练习。本地再战继续本地模式。已建立的真人对局保留原有重连与离开结算规则。
- 对战规则版本改为 `duel-v2`。前后端使用同一常量，旧规则服务会被版本校验拒绝并回退本地，避免重新进入旧检修规则。

## 自动检查

Linux，Node 24.21.0，pnpm 12.6.0。运行范围仅本游戏及构建所需的工作区依赖。

- `pnpm --filter @coffeeeeffoc/game-castle-cannon test`：19 个测试文件、82 项测试通过；最后的连接计时器清理改动另跑 12 项会话测试通过。
- `pnpm --filter @coffeeeeffoc/game-castle-cannon lint`：通过。
- `pnpm --filter @coffeeeeffoc/game-castle-cannon build`：类型检查、前端生产构建和对战服务构建通过。仍有原有资源分包大小提示。
- 120 关可达性验证保留混合攻城策略，并统一加入爆破弹瞄准炮手策略，每关必须至少一种合法策略获胜。第 98 关在新节奏下使用后者获胜，未修改关卡血量、补给、弹道或敌人参数。

## 浏览器验证

使用系统 Chromium、Playwright 与 CDP 触屏输入。云环境为软件 WebGL，交互回归使用游戏现有省电画质；截图是桌面手机尺寸模拟，不是真机性能证明。

对战浏览器 6 组检查通过：844×390 横屏、390×844 竖屏旋转、iframe、真实双 HTTP/SSE 客户端、服务不可用的本地回退、受伤治疗与城毁/全屏退出。没有页面脚本错误。详见 [对战验证 JSON](actual/verification.json)。

战役浏览器 4 组检查通过：竖屏 Canvas 降级入口实际触屏瞄准并通关、下一关/存档恢复、竖屏 3D 入口、568×320 小屏 iframe、末关入口以及暂停/返回。小屏遮挡修复后重新构建并重跑全部战役检查，详见 [战役验证 JSON](campaign/verification.json) 和 [触屏胜利](campaign/portrait-canvas-victory.png)。

关键画面：[冷却与开火](actual/landscape-shot.png)、[炮位目标与倒计时](actual/landscape-moving.png)、[竖屏转移](actual/portrait-moving.png)、[服务不可用时继续本地开火](actual/offline-local-play.png)。

验证命令：

```sh
DUEL_LOW_POWER=1 DUEL_EVIDENCE_DIR=docs/design/interaction-2026-10-23/actual pnpm --filter @coffeeeeffoc/game-castle-cannon smoke
CAMPAIGN_EVIDENCE_DIR=docs/design/interaction-2026-10-23/campaign pnpm --filter @coffeeeeffoc/game-castle-cannon smoke:campaign
```

浏览器执行结果与截图分别保存在 `actual/` 和 `campaign/`。规则检查不替代真机、原生小游戏平台或公网服务验收。截至上述本地验证结束，尚未执行远端推送或生产部署；后续以实际提交和 CI／部署记录为准。
