# 本轮验证

环境：Node 24.21.0、Chromium 触屏模拟；320×568、390×844、430×932、844×390、1280×900。不是实体手机验收。

已通过：

- `pnpm --filter @coffeeeeffoc/surprise-kept build` 与 `test`：37 项规则/内容/存档检查；新增未目击因果记录仅跟随当前物品最后目击、后续见到搬运会清除旧因果，撤销保留旧记录。
- `pnpm --filter @coffeeeeffoc/surprise-kept test:browser`：生产构建真实触屏解完八关、拖动/取消、一次屏风、撤销、回放、保存恢复、暂停、失败解释/提示、导入第九关、各尺寸布局。[完整流程记录](actual/full-browser-report.json)。
- `node games/local/surprise-kept/tests/publishing.browser.mjs`：真实触屏取消拖动与五步解第三关；小蓝错过第 2/4 步因离席，小橙错过第 4 步因屏风；无剧透同关分享及取消；挑战全过程不改原存档，返回自己的原关卡/礼物位置；320 宽选关；三次真实正常结算才出现模拟广告，广告位于原生 dialog 顶层内可见，关闭后结算/存档不受影响。

[开场](actual/room-start.png)、[当前安排](actual/arranged.png)、[记忆因果](actual/memory-cause.png)、[暂停](actual/pause.png)、[结算分享](actual/result.png)、[模拟广告](actual/simulated-ad.png)、[返回原安排](actual/return-own.png)。逐张对照局部方案核对文字层级、滚动、安全区和按钮；因果解释位于按需打开的既有目击详情。

本轮仅内置关卡 H5/Shell 邀请；自导入章节不生成无效邀请，无实时对战、付费提示或真实广告。真实渠道需后续接入验收。
