# 追踪弹与倍率校验

运行产物：Creator 3.8.8 / Web Mobile，源码 hash `c6d19020bb69f6e74d20e921da306f7add7cd02e015e078788367a20fa9e2f89`。Node 24.21.0 / pnpm 12.6.0 / Windows Chrome。

- 游戏规则与输入测试：71 项通过，包括制导实时改变目标点、移动敌人命中、友军不受追踪弹伤害、暂停冻结、目标失效、保护区、SDK 完成/取消/失败、防重复领取、库存与倍率存档校验。
- 原生项目边界测试：7 项通过。同步审核 HUD/Platform 的新源码指纹，仍要求精确匹配后添加宿主全屏保护；没有放宽指纹校验。
- 类型检查通过。
- 开发者模式公共源检查：66 款、0 问题；模式规则测试 5 项通过。
- 生产 Web 浏览器：1366×768 鼠标、844×390 与 568×320 模拟触屏，逐档解锁 10/20/40/80/160×、真实视场角小于 1°、双指缩放和取消、模拟广告冻结/关闭领取、移动目标锁定和真实轨迹、命中/结算/重试/返回首页/刷新存档均通过，无 pageerror。
- 现有主页/地图/设置/帮助/全屏/普通武器反馈浏览器回归通过，覆盖 1366×768、1920×1080、844×390、568×320，无 pageerror。

效果图：[设计基准](rewarded-homing-concept.png)。实际截图和结构化结果位于 `reports/rewarded-homing/`，包含 `844-tracking-lock.png`、`568-mock-homing.png`、`844-160x.png`、`568-settlement.png`、`verification.json`。小屏采用同一行紧凑入口，避免倍率按钮挡住战场中央；锁定框为四角描边，暂停图标仍是两根分离实心竖条。概念图未用于游戏场景贴图。

SDK 接口：启动前设置 `globalThis.SmallGamesRewardAds.offer(opportunity)`，或在 Platform 上设置 `rewardProvider`；机会 ID 为 `night-overwatch:homing` / `night-overwatch:zoom`，奖励为 `{homing: 1}` / `{zoomLimit: 下一档}`。Promise 返回 `{status: 'completed' | 'dismissed' | 'unavailable' | 'failed'}`，只有 completed 发奖。Web 没有 provider 时显示可立即关闭的模拟广告；原生没 provider 时返回 unavailable。

尚未完成：真实手机、Safari、原生宿主和真实广告 SDK 验收。浏览器触屏模拟不作为真机验收。既有竖屏方向提示行为不属于本次修改范围。

发布使用同步后的远端 dev 与最终已提交候选的准确 SHA 运行 `scripts/validate-candidate.mjs`，日志保存在本次工作树的 `reports`；推送后单独核对远端 SHA 与对应 CI/Pages 状态。
