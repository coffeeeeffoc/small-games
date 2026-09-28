# 最终包两点定向复核

构建：6f7b439a65ab8d164354c784a090e8203a2d6107241c3590474babb2b0e3bebb。URL：http://localhost:4318；加载前后build-info完全匹配。568×320、DPR2、Chrome触控模拟；只读snapshot/screenPoint辅助坐标，实际触控瞄准、切枪及开火，无状态/血量/时间修改。现场战斗8.72秒，浏览器已关闭。

## 定向结论

**两项此前报告的现象，在本次相同类型场景中均未再复现，可关闭这两项已复现场景的缺陷。** 这是局部回归结论，不替代最终包完整六项验收，不混入1c455或主代理正在生成的round6证据。

1. **顶部提示条与标签/反馈避让：本次场景通过。** 首波提示、连续落空触发“炮弹有延迟·瞄准移动方向前方”、移动轻车进入上部提示区域均实际观察。04图轻车标签在提示条下方、未命中在右下侧；05图目标菱形/准星与提示文字分开，反馈回到底部，未见此前文字叠在一起。05图轻车文字标签未显示，应保留此事实，不能据此推定所有位置的标签可读性。证据：[01](01-final-banner-default.png)、[04](04-feedback-after-hold.png)、[05](05-moving-label-banner.png)。
2. **击毁确认被后续落空覆盖：本次场景通过。** 真实爆破三发命中首炮台，第3次冲击为destroyed，游戏时间3.8秒；随后切速射，继续向已毁炮台位置开火。击毁后0.7167秒，原始impact中已有两次miss（damage0），界面仍显示“◆ 威胁已清除”；击毁后1.65秒，在继续落空时显示“未命中”。说明后续落空不再立即抹去击毁确认。证据：[02](02-kill-confirmation.png)、[03](03-kill-held-after-misses.png)、[04](04-feedback-after-hold.png)及checks.json。精确1.1秒切换边界没有逐帧测量，不声称已验证到毫秒。

## 范围

本次只检验以上两项，不重打长关、不等待失败、不测友伤优先、不测844/Shell/全屏/后台/真机，不重新给六项总分。上一版本的完整数据不作为本最终构建的验收数据。未读取实现、POLISH或主代理当前raw结果。

## 实际证据

5张本次真实PNG、[原始录屏](videos/targeted-review.webm)、[checks.json](checks.json)、[journal.json](journal.json)、[build-info.json](build-info.json)、archive-verification.json。截图路径明确指向本哈希目录；每张写入立即exists验证，最终再次验证文件非零。没有修改实现、提交或推送。
