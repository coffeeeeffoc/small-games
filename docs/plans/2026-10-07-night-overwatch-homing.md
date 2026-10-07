# Night Overwatch 追踪弹实施计划

**Goal:** 实现广告领取追踪弹、实时追踪锁定和广告升级至 160×，验证后推送 dev。

**Architecture:** 复用 Simulation 的固定步、事件和重炮显示；在 Shot 上添加制导状态。Platform 处理奖励请求与存档，HUD 使用已有模态和按钮，World 统一限制倍率。

**Tech Stack:** Creator 3.8.8、TypeScript、Node 内置测试、Playwright。

1. 完成游戏内产品说明与手机效果图。
2. 在 core/Data.ts、Simulation.ts、CameraMath.ts 中添加制导与倍率数据，增加 tests/homing.test.ts。
3. 在 Platform.ts、Overwatch.ts、HUD.ts、World.ts、Effects.ts 中连接奖励、持久库存、锁定标记与倍率，复用输入清理及暂停能力。
4. 运行现有规则、类型和新增奖励/布局测试；Creator 生产构建后执行 tests/rewarded-homing-browser.mjs，保存截图与验证记录。
5. 同步远端 dev，提交本次路径，使用准确 base/head 执行 validate-candidate 并正常推送，核对远端与工作流。
