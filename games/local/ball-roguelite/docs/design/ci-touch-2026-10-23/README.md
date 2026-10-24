# Chromium 140 触控回归修复

基线：`aa154c5d6bd7c4398ef31e69ff18b02c481250f2`。原失败见 [CI quality](https://github.com/coffeeeeffoc/small-games/actions/runs/39901760659/job/120246473508)，`tests/browser.mjs:524` 的自然通关断言为 `aim !== won`。

## 根因证据

在 Linux 云端使用仓库锁定的 Node 24.21.0、pnpm 12.6.0、Playwright 1.55.1 和 Chromium 140.0.7339.186，原生产构建与未修改测试复现相同失败，页面错误为 0。

只添加观测的临时副本记录了 40 轮相同的 `shots=1, turn=1, phase=aim`。120 个 DOM touch 事件都到达 `GameCanvas`，坐标在场地内，但 Cocos 全局触控回调没有收到事件。单独生命周期探针确认：

| 时点 | navigator.maxTouchPoints | ontouchstart | Cocos 触控画布 |
| --- | --- | --- | --- |
| 新建手机上下文 | 1 | 有 | GameCanvas |
| 一次取消手势后分离 CDP 会话 | 0 | 有 | GameCanvas |
| 页面重载后 | 0 | 无 | 未注册 |
| 重载后再次发送完整手势 | 0 | 无 | shots 仍为 0、phase 仍为 aim |

原 `shot()` 每次创建并分离 CDP 会话。Chromium 140 分离会话时撤销页面触摸模拟；Cocos 3.8.8 在初始化时检测 `ontouchstart`，所以重载后不再注册触控输入。其余 DOM 语义按钮仍能操作，掩盖了画布输入失效。`settle()` 又把未变化的 aim 当作结束，最终才在 40 轮后失败。

原始观测摘要见 [diagnosis.json](diagnosis.json)。这与 [Chromium 140 的 InspectorEmulationAgent::disable](https://chromium.googlesource.com/chromium/src/+/140.0.7339.186/third_party/blink/renderer/core/inspector/inspector_emulation_agent.cc) 无条件关闭 touch emulation 的实现一致。

## 最小修改

- 每个 Page 复用一个 CDP 输入会话，随 context/browser 关闭清理，跨 reload 保留。
- 每个手势先确认 `aiming=true` 且尚未发射；结束后确认释放瞄准，正常手势恰好增加一次 shots，取消手势不增加。
- 重载后明确检查手机触控能力，保留 40 轮、27 秒 settle、取消及最终 won 断言。
- 生产游戏、玩法难度、关卡、引擎和 CI 门禁均未修改。

## 后续救援场景的短时窗口

第一笔修复 `cae153824b9aadc2f64b9006c729a3d32352acde` 的 [CI quality](https://github.com/coffeeeeffoc/small-games/actions/runs/39924321390/job/120319135558) 已通过自然通关，随后在救援场景的 `#recall` 点击遇到目标移除。该提交的 [Pages](https://github.com/coffeeeeffoc/small-games/actions/runs/39924321381) 已部署成功，但 CI 尚未整体通过。

相同生产构建的独立浏览器观测确认：原竖直发射仅有约 0.725 秒 flight，近处砖反弹后所有球立即归位；最低砖随回合下降到失败线，结果页移除旧按钮。Playwright 的定位点击包含滚动、稳定性及命中检查，CI 日志在重试时已经失去目标。此时延长点击超时也不能恢复已结束的回合。

救援测试改为左浅角真实发射（`-150, -12`），保持全部砖、血量和规则不变；独立无召回观测的自然 flight 为约 14 秒。发射前读取按钮几何，发射确认后直接发送真实触屏点击，并新增 `visuals.recalls` 恰好增加 1 及 `flight < PHYSICS.maxFlight` 的断言，避免自然结算或超时召回冒充手动召回。原失败结果、救援不增加分数/回合和奖励持久化断言全部保留。额外针对性验证故意在发射后等待 2 秒，再触屏召回；召回计数从 0 到 1，约 2.329 秒 flight 后正常失败，完整救援与持久化断言通过。该延迟仅存在于临时验证副本，未加入正式套件。数据见 `diagnosis.json` 的 `rescueRecallRace`。

## 验证边界

生产浏览器完整结果保存在本目录的 `browser-report.json`。准确候选验证使用 `pnpm validate:candidate --base aa154c5d6bd7c4398ef31e69ff18b02c481250f2 --head <candidate SHA>`，以命令最终输出的 `CANDIDATE_VALIDATED` 为通过依据。后续救援修复以 `cae153824b9aadc2f64b9006c729a3d32352acde` 为 base 再验证准确 head。

真实依赖闭包包含 Shell 及天下岔路的 emitted export；天下岔路复用上述基线成功 CI 的 artifact `12479336133`，通过现有 `verifyPrebuilt` 校验 Creator 3.8.8、web-mobile、源码摘要、index.html 和 cc.d.ts。其他 Creator 的发布构建继续由远端既有工作流检查。

上架资料核对 15 个文件的 SHA-256 及 core/render 指纹全部匹配，八类基础资料沿用现有内容。本次仅修测试，已有媒体对应的游戏代码未变。验证环境是桌面 Chromium 手机触屏模拟；未执行手机真机、原生平台或真实广告 SDK 验收。
